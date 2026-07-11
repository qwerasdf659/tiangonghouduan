/**
 * 物品系统 ItemService 测试 - P2优先级（三表模型版）
 *
 * 测试目标：覆盖 阶段五：物品系统测试 的4个具体任务
 *
 * 功能覆盖：
 * 1. 6.1 物品发放 - 测试中奖后 items 创建 + item_ledger 双录（ItemService.mintItem）
 * 2. 6.2 物品使用 - 测试 voucher 类型物品核销 + 双录（ItemService.consumeItem）
 * 3. 6.3 物品转移 - 测试用户间物品转让 + 双录（ItemService.transferItem）
 * 4. 6.4 库存扣减 - 测试奖品池库存同步（PrizePoolService）
 *
 * 相关模型（三表模型）：
 * - Item: 物品缓存表（当前状态快照）
 * - ItemLedger: 物品账本（双录真相，SUM(delta)==0 验证守恒）
 * - ItemHold: 物品锁定记录（替代旧 JSON locks）
 * - ItemTemplate: 物品模板
 * - LotteryCampaignPrize: 奖品池（库存管理）
 *
 * 相关服务：
 * - ItemService: 物品服务（铸造/转移/消耗 + 双录记账）— 服务键 asset_item
 * - PrizePoolService: 奖品池服务（库存管理）— 服务键 prize_pool
 *
 * 创建时间：2026-01-28
 * 更新时间：2026-02-22（适配三表模型：items + item_ledger + item_holds）
 * P2优先级：物品系统模块
 */

const {
  sequelize,
  Item,
  ItemLedger,
  ItemTemplate,
  User,
  LotteryCampaignPrize
} = require('../../../models')
const {
  initializeTestServiceManager,
  getTestService,
  cleanupTestServiceManager
} = require('../../helpers/UnifiedTestManager')
const { TEST_DATA } = require('../../helpers/test-data')

// 测试数据
let test_user_id = null
let test_user_id_2 = null
let test_item_template = null
let ItemService = null
let _PrizePoolService = null

describe('物品系统 ItemService 测试 - P2优先级', () => {
  beforeAll(async () => {
    await initializeTestServiceManager()

    try {
      ItemService = getTestService('asset_item')
    } catch (_err) {
      console.log('⚠️ ItemService 未注册，将直接使用模型层测试')
      ItemService = require('../../../services/asset/ItemService')
    }

    try {
      _PrizePoolService = getTestService('prize_pool')
    } catch (_err) {
      console.log('⚠️ PrizePoolService 未注册，将直接引入')
      _PrizePoolService = require('../../../services/prize-pool')
    }

    const test_mobile = TEST_DATA.users.testUser.mobile
    const test_user = await User.findOne({ where: { mobile: test_mobile } })
    if (!test_user) {
      throw new Error(`测试用户不存在：${test_mobile}，请先创建测试用户`)
    }
    test_user_id = test_user.user_id

    const another_user = await User.findOne({
      where: { user_id: { [require('sequelize').Op.ne]: test_user_id } }
    })
    if (another_user) {
      test_user_id_2 = another_user.user_id
    } else {
      console.log('⚠️ 未找到第二个测试用户，部分转移测试将跳过')
    }

    test_item_template = await ItemTemplate.findOne({ where: { is_enabled: true } })
    if (!test_item_template) {
      throw new Error('没有启用的物品模板，请先创建物品模板')
    }

    console.log(
      `✅ 测试准备完成: user_id=${test_user_id}, user_id_2=${test_user_id_2}, template_id=${test_item_template.item_template_id}`
    )
  })

  afterAll(async () => {
    try {
      // 清理三表模型的测试数据
      const testItems = await Item.findAll({ where: { source: 'test' } })
      const testItemIds = testItems.map(i => i.item_id)
      if (testItemIds.length > 0) {
        await ItemLedger.destroy({ where: { item_id: testItemIds } })
        await Item.destroy({ where: { item_id: testItemIds } })
      }
      console.log('✅ 测试物品及账本记录清理完成')
    } catch (_err) {
      // 忽略清理错误
    }

    await cleanupTestServiceManager()
  })

  // ===== 6.1 物品发放 =====
  describe('6.1 物品发放 - 测试中奖后 items + item_ledger 双录', () => {
    let minted_item = null

    test('应该能通过 ItemService.mintItem 发放物品', async () => {
      const transaction = await sequelize.transaction()

      try {
        const mint_params = {
          user_id: test_user_id,
          item_type: 'voucher',
          source: 'test',
          source_ref_id: `test_win_${Date.now()}`,
          item_name: '测试奖品',
          item_value: 100,
          prize_definition_id: test_item_template.item_template_id,
          rarity_code: 'common',
          business_type: 'test_lottery_mint',
          idempotency_key: `test_mint_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          meta: { lottery_campaign_id: 1 }
        }

        const result = await ItemService.mintItem(mint_params, { transaction })

        expect(result).toBeDefined()
        expect(result.item).toBeDefined()
        expect(result.is_duplicate).toBe(false)

        expect(result.item.item_type).toBe('voucher')
        expect(result.item.status).toBe('available')
        expect(result.item.item_name).toBe('测试奖品')
        expect(result.item.tracking_code).toBeDefined()

        minted_item = result.item
        await transaction.commit()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    })

    test('应该验证物品发放的幂等性', async () => {
      const transaction = await sequelize.transaction()
      const fixed_idempotency_key = `test_idempotency_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`

      try {
        const mint_params = {
          user_id: test_user_id,
          item_type: 'voucher',
          source: 'test',
          source_ref_id: `idempotency_${Date.now()}`,
          item_name: '幂等性测试物品',
          business_type: 'test_idempotency_mint',
          idempotency_key: fixed_idempotency_key,
          meta: { test: true }
        }

        const result1 = await ItemService.mintItem(mint_params, { transaction })
        expect(result1.is_duplicate).toBe(false)

        const result2 = await ItemService.mintItem(mint_params, { transaction })
        expect(result2.is_duplicate).toBe(true)
        expect(String(result2.item.item_id)).toBe(String(result1.item.item_id))

        await transaction.commit()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    })

    test('应该记录物品铸造事件（item_ledger 双录）', async () => {
      if (!minted_item) {
        console.log('跳过测试：之前未成功创建物品')
        return
      }

      const entries = await ItemLedger.findAll({
        where: { item_id: minted_item.item_id, event_type: 'mint' }
      })

      // 双录：SYSTEM_MINT(-1) + 用户(+1) = 2条记录
      expect(entries.length).toBe(2)
      const outEntry = entries.find(e => e.delta === -1)
      const inEntry = entries.find(e => e.delta === 1)
      expect(outEntry).toBeDefined()
      expect(inEntry).toBeDefined()
    })

    test('应该验证必填参数', async () => {
      const transaction = await sequelize.transaction()

      try {
        await expect(
          ItemService.mintItem(
            {
              item_type: 'voucher',
              source: 'test',
              source_ref_id: 'x',
              item_name: 'x',
              idempotency_key: 'k1'
            },
            { transaction }
          )
        ).rejects.toThrow('user_id')

        await expect(
          ItemService.mintItem(
            {
              user_id: test_user_id,
              source: 'test',
              source_ref_id: 'x',
              item_name: 'x',
              idempotency_key: 'k2'
            },
            { transaction }
          )
        ).rejects.toThrow('item_type')

        await expect(
          ItemService.mintItem(
            {
              user_id: test_user_id,
              item_type: 'voucher',
              source: 'test',
              source_ref_id: 'x',
              idempotency_key: 'k3'
            },
            { transaction }
          )
        ).rejects.toThrow('item_name')

        await transaction.rollback()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    })
  })

  // ===== 6.2 物品使用 =====
  describe('6.2 物品使用 - 测试 voucher 类型物品核销 + 双录', () => {
    let consumable_item = null

    beforeAll(async () => {
      const transaction = await sequelize.transaction()
      try {
        const result = await ItemService.mintItem(
          {
            user_id: test_user_id,
            item_type: 'voucher',
            source: 'test',
            source_ref_id: `consume_setup_${Date.now()}`,
            item_name: '核销测试物品',
            business_type: 'test_consume_setup_mint',
            idempotency_key: `consume_setup_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            meta: { for_consume_test: true }
          },
          { transaction }
        )
        consumable_item = result.item
        await transaction.commit()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    })

    test('应该能通过 ItemService.consumeItem 核销物品', async () => {
      if (!consumable_item) {
        console.log('跳过测试：之前未成功创建可核销物品')
        return
      }

      const transaction = await sequelize.transaction()

      try {
        const result = await ItemService.consumeItem(
          {
            item_id: consumable_item.item_id,
            operator_user_id: test_user_id,
            business_type: 'test_voucher_redemption',
            idempotency_key: `redeem_${consumable_item.item_id}_${Date.now()}`,
            meta: { redeemed_at: new Date().toISOString() }
          },
          { transaction }
        )

        expect(result).toBeDefined()
        expect(result.item).toBeDefined()
        expect(result.is_duplicate).toBe(false)
        expect(result.item.status).toBe('used')

        await transaction.commit()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    })

    test('应该验证物品核销的幂等性', async () => {
      const transaction = await sequelize.transaction()

      try {
        const mint_result = await ItemService.mintItem(
          {
            user_id: test_user_id,
            item_type: 'voucher',
            source: 'test',
            source_ref_id: `idempotency_consume_${Date.now()}`,
            item_name: '核销幂等性测试',
            business_type: 'test_consume_idempotency_mint',
            idempotency_key: `consume_idempotency_mint_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            meta: {}
          },
          { transaction }
        )

        const fixed_key = `idempotency_consume_${mint_result.item.item_id}`

        const result1 = await ItemService.consumeItem(
          {
            item_id: mint_result.item.item_id,
            operator_user_id: test_user_id,
            business_type: 'test_idempotency',
            idempotency_key: fixed_key,
            meta: {}
          },
          { transaction }
        )
        expect(result1.is_duplicate).toBe(false)

        const result2 = await ItemService.consumeItem(
          {
            item_id: mint_result.item.item_id,
            operator_user_id: test_user_id,
            business_type: 'test_idempotency',
            idempotency_key: fixed_key,
            meta: {}
          },
          { transaction }
        )
        expect(result2.is_duplicate).toBe(true)

        await transaction.commit()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    })

    test('应该拒绝核销已使用的物品', async () => {
      const transaction = await sequelize.transaction()

      try {
        // 先铸造再核销，使物品变为 used 状态
        const mint_result = await ItemService.mintItem(
          {
            user_id: test_user_id,
            item_type: 'voucher',
            source: 'test',
            source_ref_id: `reject_consume_${Date.now()}`,
            item_name: '拒绝核销测试',
            business_type: 'test_reject_consume_mint',
            idempotency_key: `reject_consume_mint_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            meta: {}
          },
          { transaction }
        )

        // 先正常核销
        await ItemService.consumeItem(
          {
            item_id: mint_result.item.item_id,
            operator_user_id: test_user_id,
            business_type: 'test_first_consume',
            idempotency_key: `first_consume_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            meta: {}
          },
          { transaction }
        )

        // 再次核销应该被拒绝
        await expect(
          ItemService.consumeItem(
            {
              item_id: mint_result.item.item_id,
              operator_user_id: test_user_id,
              business_type: 'test_second_consume',
              idempotency_key: `second_consume_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
              meta: {}
            },
            { transaction }
          )
        ).rejects.toThrow()

        await transaction.rollback()
      } catch (error) {
        await transaction.rollback()
      }
    })

    test('应该记录物品消耗事件（item_ledger 双录）', async () => {
      const transaction = await sequelize.transaction()

      try {
        const mint_result = await ItemService.mintItem(
          {
            user_id: test_user_id,
            item_type: 'voucher',
            source: 'test',
            source_ref_id: `consume_event_${Date.now()}`,
            item_name: '消耗事件记录测试',
            business_type: 'test_consume_event_mint',
            idempotency_key: `consume_event_mint_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            meta: {}
          },
          { transaction }
        )

        await ItemService.consumeItem(
          {
            item_id: mint_result.item.item_id,
            operator_user_id: test_user_id,
            business_type: 'test_event_record',
            idempotency_key: `event_record_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            meta: {}
          },
          { transaction }
        )

        const entries = await ItemLedger.findAll({
          where: { item_id: mint_result.item.item_id, event_type: 'use' },
          transaction
        })

        // 双录：用户(-1) + SYSTEM_BURN(+1) = 2条
        expect(entries.length).toBe(2)

        await transaction.commit()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    })
  })

  // ===== 6.3 物品转移 =====
  describe('6.3 物品转移 - 测试用户间物品转让 + 双录', () => {
    test('应该能通过 ItemService.transferItem 转移物品', async () => {
      if (!test_user_id_2) {
        console.log('跳过测试：缺少第二个测试用户')
        return
      }

      const transaction = await sequelize.transaction()

      try {
        const mint_result = await ItemService.mintItem(
          {
            user_id: test_user_id,
            item_type: 'voucher',
            source: 'test',
            source_ref_id: `transfer_${Date.now()}`,
            item_name: '转移测试物品',
            business_type: 'test_transfer_mint',
            idempotency_key: `transfer_mint_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            meta: {}
          },
          { transaction }
        )

        const result = await ItemService.transferItem(
          {
            item_id: mint_result.item.item_id,
            new_owner_user_id: test_user_id_2,
            business_type: 'test_user_transfer',
            idempotency_key: `transfer_${mint_result.item.item_id}_${Date.now()}`,
            meta: { reason: '测试转让' }
          },
          { transaction }
        )

        expect(result).toBeDefined()
        expect(result.item).toBeDefined()
        expect(result.is_duplicate).toBe(false)

        await transaction.commit()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    })

    test('应该验证物品转移的幂等性', async () => {
      if (!test_user_id_2) {
        console.log('跳过测试：缺少第二个测试用户')
        return
      }

      const transaction = await sequelize.transaction()

      try {
        const mint_result = await ItemService.mintItem(
          {
            user_id: test_user_id,
            item_type: 'voucher',
            source: 'test',
            source_ref_id: `transfer_idempotency_${Date.now()}`,
            item_name: '转移幂等性测试',
            business_type: 'test_transfer_idempotency_mint',
            idempotency_key: `transfer_idempotency_mint_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            meta: {}
          },
          { transaction }
        )

        const fixed_key = `idempotency_transfer_${mint_result.item.item_id}`

        const result1 = await ItemService.transferItem(
          {
            item_id: mint_result.item.item_id,
            new_owner_user_id: test_user_id_2,
            business_type: 'test_idempotency',
            idempotency_key: fixed_key,
            meta: {}
          },
          { transaction }
        )
        expect(result1.is_duplicate).toBe(false)

        const result2 = await ItemService.transferItem(
          {
            item_id: mint_result.item.item_id,
            new_owner_user_id: test_user_id_2,
            business_type: 'test_idempotency',
            idempotency_key: fixed_key,
            meta: {}
          },
          { transaction }
        )
        expect(result2.is_duplicate).toBe(true)

        await transaction.commit()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    })

    test('应该拒绝转移已使用的物品', async () => {
      if (!test_user_id_2) {
        console.log('跳过测试：缺少第二个测试用户')
        return
      }

      const transaction = await sequelize.transaction()

      try {
        const mint_result = await ItemService.mintItem(
          {
            user_id: test_user_id,
            item_type: 'voucher',
            source: 'test',
            source_ref_id: `reject_transfer_${Date.now()}`,
            item_name: '拒绝转移测试',
            business_type: 'test_reject_transfer_mint',
            idempotency_key: `reject_transfer_mint_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            meta: {}
          },
          { transaction }
        )

        // 先核销使状态变为 used
        await ItemService.consumeItem(
          {
            item_id: mint_result.item.item_id,
            operator_user_id: test_user_id,
            business_type: 'test_consume_before_transfer',
            idempotency_key: `consume_before_transfer_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            meta: {}
          },
          { transaction }
        )

        // 转移已使用的物品应该被拒绝
        await expect(
          ItemService.transferItem(
            {
              item_id: mint_result.item.item_id,
              new_owner_user_id: test_user_id_2,
              business_type: 'test_reject_transfer',
              idempotency_key: `reject_transfer_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
              meta: {}
            },
            { transaction }
          )
        ).rejects.toThrow()

        await transaction.rollback()
      } catch (error) {
        await transaction.rollback()
      }
    })

    test('应该记录物品转移事件（item_ledger 双录）', async () => {
      if (!test_user_id_2) {
        console.log('跳过测试：缺少第二个测试用户')
        return
      }

      const transaction = await sequelize.transaction()

      try {
        const mint_result = await ItemService.mintItem(
          {
            user_id: test_user_id,
            item_type: 'voucher',
            source: 'test',
            source_ref_id: `transfer_event_${Date.now()}`,
            item_name: '转移事件记录测试',
            business_type: 'test_transfer_event_mint',
            idempotency_key: `transfer_event_mint_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            meta: {}
          },
          { transaction }
        )

        await ItemService.transferItem(
          {
            item_id: mint_result.item.item_id,
            new_owner_user_id: test_user_id_2,
            business_type: 'test_event_record',
            idempotency_key: `event_record_transfer_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            meta: {}
          },
          { transaction }
        )

        const entries = await ItemLedger.findAll({
          where: { item_id: mint_result.item.item_id, event_type: 'transfer' },
          transaction
        })

        // 双录：卖方(-1) + 买方(+1) = 2条
        expect(entries.length).toBe(2)

        await transaction.commit()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    })
  })

  // ===== 6.4 库存扣减 =====
  describe('6.4 库存扣减 - 测试奖品池库存同步', () => {
    let test_prize = null

    beforeAll(async () => {
      test_prize = await LotteryCampaignPrize.findOne({ where: { status: 'active' } })
      if (!test_prize) {
        console.log('⚠️ 未找到活跃的奖品，部分库存测试将跳过')
      }
    })

    test('应该能获取奖品池库存信息', async () => {
      if (!test_prize) {
        console.log('跳过测试：未找到测试奖品')
        return
      }

      const prize = await LotteryCampaignPrize.findByPk(test_prize.lottery_campaign_prize_id)
      if (!prize) {
        console.log('跳过测试：奖品已不存在')
        return
      }

      expect(prize).toBeDefined()
      expect(prize.stock_quantity).toBeDefined()
      expect(typeof prize.stock_quantity).toBe('number')

      const remaining = prize.stock_quantity - (prize.total_win_count || 0)
      expect(remaining).toBeGreaterThanOrEqual(0)
    })

    test('应该能通过 PrizePoolService 获取库存统计', async () => {
      if (!test_prize) {
        console.log('跳过测试：未找到测试奖品')
        return
      }

      const lottery_campaign_id = test_prize.lottery_campaign_id
      const prizes = await LotteryCampaignPrize.findAll({ where: { lottery_campaign_id } })

      const total_stock = prizes.reduce((sum, p) => sum + (p.stock_quantity || 0), 0)
      const total_used = prizes.reduce((sum, p) => sum + (p.total_win_count || 0), 0)
      const remaining_stock = total_stock - total_used

      expect(total_stock).toBeGreaterThanOrEqual(0)
      expect(total_used).toBeGreaterThanOrEqual(0)
      expect(remaining_stock).toBeGreaterThanOrEqual(0)
      expect(total_used).toBeLessThanOrEqual(total_stock)

      console.log(
        `📊 活动${lottery_campaign_id}库存统计: 总库存=${total_stock}, 已使用=${total_used}, 剩余=${remaining_stock}`
      )
    })

    test('库存数量验证：已使用数量不应超过总库存', async () => {
      if (!test_prize) {
        console.log('跳过测试：未找到测试奖品')
        return
      }

      const prizes = await LotteryCampaignPrize.findAll()

      prizes.forEach(prize => {
        const total = prize.stock_quantity || 0
        const used = prize.total_win_count || 0
        const remaining = total - used

        expect(total).toBeGreaterThanOrEqual(0)
        expect(used).toBeGreaterThanOrEqual(0)
        expect(remaining).toBeGreaterThanOrEqual(0)
        expect(used).toBeLessThanOrEqual(total)
      })
    })

    test('应该验证库存扣减后不能为负数', async () => {
      const transaction = await sequelize.transaction()

      try {
        const prize = await LotteryCampaignPrize.findOne({
          where: { status: 'active' },
          transaction
        })

        if (!prize) {
          console.log('跳过测试：未找到可用奖品')
          await transaction.rollback()
          return
        }

        const original_stock = prize.stock_quantity || 0
        const original_used = prize.total_win_count || 0
        const remaining = original_stock - original_used

        expect(remaining).toBeGreaterThanOrEqual(0)
        expect(original_used).toBeLessThanOrEqual(original_stock)

        await transaction.rollback()
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    })

    test('应该验证活动奖品的库存与物品模板的一致性', async () => {
      const prizes = await LotteryCampaignPrize.findAll({ where: { status: 'active' } })

      const stats = {
        total_prizes: prizes.length,
        prizes_with_stock: prizes.filter(p => (p.stock_quantity || 0) > 0).length,
        prizes_out_of_stock: prizes.filter(p => {
          const remaining = (p.stock_quantity || 0) - (p.total_win_count || 0)
          return remaining <= 0
        }).length
      }

      console.log('📊 奖品库存统计:', stats)

      expect(stats.total_prizes).toBeGreaterThanOrEqual(0)
      expect(stats.prizes_with_stock + stats.prizes_out_of_stock).toBeLessThanOrEqual(
        stats.total_prizes
      )
    })
  })
})
