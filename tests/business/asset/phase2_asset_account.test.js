/**
 * Phase 2 资产账户测试（P1）- 测试审计标准文档 3.1-3.5
 *
 * 测试目标：
 * - 3.1 资产扣费流程：测试 POINTS/red_shard 资产扣费
 * - 3.2 资产增加流程：测试中奖后资产发放
 * - 3.3 余额校验：测试余额不足拦截逻辑
 * - 3.4 事务一致性：测试扣费与抽奖原子性（失败回滚）
 * - 3.5 资产交易记录：测试 asset_transactions 流水完整性
 *
 * 创建时间：2026-01-28
 * 更新时间：2026-01-31（V4.7.0 BalanceService 拆分）
 * 版本：1.1.0
 *
 * 技术规范：
 * - 通过 global.getTestService() 获取服务（J2-RepoWide 统一）
 * - 使用 snake_case service key（E2-Strict 强制）
 * - 使用 TransactionManager 进行事务管理
 * - 测试数据通过 global.testData 获取（P0-1 动态加载）
 * - 所有资产余额操作通过 BalanceService 进行（V4.7.0 拆分）
 */

'use strict'

const { AssetTransaction, Account } = require('../../../models')
const { Op } = require('sequelize')
const TransactionManager = require('../../../utils/TransactionManager')

/*
 * 🔴 服务引用（通过 ServiceManager 延迟获取）
 * V4.7.0 BalanceService 拆分：使用 BalanceService（2026-01-31）
 */
let BalanceService

/**
 * 测试用户上下文
 * @typedef {Object} TestUserContext
 * @property {number} user_id - 用户ID
 * @property {string} mobile - 手机号
 * @property {number} account_id - 账户ID
 */

describe('Phase 2 资产账户测试（P1）', () => {
  /**
   * 测试用户上下文
   * @type {TestUserContext}
   */
  let testUserContext

  /**
   * 测试前缀，用于生成唯一的幂等键
   * @type {string}
   */
  const TEST_PREFIX = 'test_phase2_asset'

  beforeAll(async () => {
    /*
     * 🔴 通过 ServiceManager 获取服务实例（snake_case key）
     * V4.7.0 BalanceService 拆分：使用 asset_balance key（2026-01-31）
     */
    BalanceService = global.getTestService('asset_balance')

    // 使用 global.testData 中的测试用户（动态加载）
    const testUserId = global.testData?.testUser?.user_id
    if (!testUserId) {
      throw new Error('测试用户未初始化，请检查 jest.setup.js 配置')
    }

    // 查找用户的账户
    const account = await Account.findOne({
      where: { user_id: testUserId, account_type: 'user' }
    })

    if (!account) {
      throw new Error(`用户 ${testUserId} 没有账户，请先创建账户`)
    }

    testUserContext = {
      user_id: testUserId,
      mobile: global.testData.testUser.mobile,
      account_id: account.account_id
    }

    console.log('✅ [Phase 2] 测试用户上下文初始化:', testUserContext)
  })

  afterAll(async () => {
    // 清理测试数据（只清理本次测试产生的数据）
    await AssetTransaction.destroy({
      where: {
        idempotency_key: { [Op.like]: `${TEST_PREFIX}_%` }
      }
    })
    console.log('✅ [Phase 2] 清理测试数据完成')
  })

  /**
   * ============================================================
   * 3.1 资产扣费流程测试
   * 测试目标：验证 POINTS 和 red_shard 资产扣费功能
   * ============================================================
   */
  describe('3.1 资产扣费流程', () => {
    // 每个测试前初始化余额
    beforeEach(async () => {
      // 清理之前的测试交易记录
      await AssetTransaction.destroy({
        where: {
          idempotency_key: { [Op.like]: `${TEST_PREFIX}_deduct_%` }
        }
      })

      // 为测试用户添加初始余额
      await TransactionManager.execute(async transaction => {
        // 添加 POINTS 余额
        await BalanceService.changeBalance(
          {
            user_id: testUserContext.user_id,
            asset_code: 'POINTS',
            delta_amount: 1000, // 添加 1000 积分
            idempotency_key: `${TEST_PREFIX}_init_points_${Date.now()}`,
            business_type: 'admin_adjustment',
            meta: { reason: 'Phase 2 测试初始化 - POINTS' }
          },
          { transaction }
        )

        // 添加 red_shard 余额
        await BalanceService.changeBalance(
          {
            user_id: testUserContext.user_id,
            asset_code: 'red_shard',
            delta_amount: 100, // 添加 100 个红碎片
            idempotency_key: `${TEST_PREFIX}_init_redshard_${Date.now()}`,
            business_type: 'admin_adjustment',
            meta: { reason: 'Phase 2 测试初始化 - red_shard' }
          },
          { transaction }
        )
      })
    })

    test('3.1.1 POINTS 扣费应正确扣减可用余额', async () => {
      const idempotencyKey = `${TEST_PREFIX}_deduct_points_${Date.now()}`
      const deductAmount = 100 // 扣除 100 积分

      // 记录扣费前余额
      const beforeBalance = await BalanceService.getBalance(
        { user_id: testUserContext.user_id, asset_code: 'POINTS' },
        {}
      )

      // 执行扣费操作
      const result = await TransactionManager.execute(async transaction => {
        return await BalanceService.changeBalance(
          {
            user_id: testUserContext.user_id,
            asset_code: 'POINTS',
            delta_amount: -deductAmount, // 负数表示扣减
            idempotency_key: idempotencyKey,
            business_type: 'lottery_consume', // 抽奖消费业务类型
            meta: { reason: '3.1.1 测试 - POINTS 扣费' }
          },
          { transaction }
        )
      })

      /*
       * 验证返回结果
       * BalanceService.changeBalance 返回结构：{ balance, transaction_record, is_duplicate }
       */
      expect(result).toBeDefined()
      expect(result.transaction_record).toBeDefined()
      expect(result.transaction_record.transaction_id).toBeDefined()
      expect(Number(result.transaction_record.delta_amount)).toBe(-deductAmount)
      expect(result.is_duplicate).toBe(false)

      // 验证余额变化
      const afterBalance = await BalanceService.getBalance(
        { user_id: testUserContext.user_id, asset_code: 'POINTS' },
        {}
      )
      expect(afterBalance.available_amount).toBe(beforeBalance.available_amount - deductAmount)

      console.log('✅ 3.1.1 POINTS 扣费测试通过')
      console.log(`   - 扣费前余额: ${beforeBalance.available_amount}`)
      console.log(`   - 扣费金额: ${deductAmount}`)
      console.log(`   - 扣费后余额: ${afterBalance.available_amount}`)
    })

    test('3.1.2 red_shard 扣费应正确扣减可用余额', async () => {
      const idempotencyKey = `${TEST_PREFIX}_deduct_redshard_${Date.now()}`
      const deductAmount = 10 // 扣除 10 个红碎片

      // 记录扣费前余额
      const beforeBalance = await BalanceService.getBalance(
        { user_id: testUserContext.user_id, asset_code: 'red_shard' },
        {}
      )

      // 执行扣费操作
      const result = await TransactionManager.execute(async transaction => {
        return await BalanceService.changeBalance(
          {
            user_id: testUserContext.user_id,
            asset_code: 'red_shard',
            delta_amount: -deductAmount,
            idempotency_key: idempotencyKey,
            business_type: 'exchange_debit', // 兑换扣减业务类型
            meta: { reason: '3.1.2 测试 - red_shard 扣费' }
          },
          { transaction }
        )
      })

      /*
       * 验证返回结果
       * BalanceService.changeBalance 返回结构：{ balance, transaction_record, is_duplicate }
       */
      expect(result).toBeDefined()
      expect(result.transaction_record).toBeDefined()
      expect(result.transaction_record.transaction_id).toBeDefined()
      expect(Number(result.transaction_record.delta_amount)).toBe(-deductAmount)

      // 验证余额变化
      const afterBalance = await BalanceService.getBalance(
        { user_id: testUserContext.user_id, asset_code: 'red_shard' },
        {}
      )
      expect(afterBalance.available_amount).toBe(beforeBalance.available_amount - deductAmount)

      console.log('✅ 3.1.2 red_shard 扣费测试通过')
      console.log(`   - 扣费前余额: ${beforeBalance.available_amount}`)
      console.log(`   - 扣费金额: ${deductAmount}`)
      console.log(`   - 扣费后余额: ${afterBalance.available_amount}`)
    })

    test('3.1.3 扣费操作幂等性验证（相同参数）', async () => {
      const idempotencyKey = `${TEST_PREFIX}_deduct_idempotent_${Date.now()}`
      const deductAmount = 50

      // 记录初始余额
      const initialBalance = await BalanceService.getBalance(
        { user_id: testUserContext.user_id, asset_code: 'POINTS' },
        {}
      )

      // 第一次扣费
      const result1 = await TransactionManager.execute(async transaction => {
        return await BalanceService.changeBalance(
          {
            user_id: testUserContext.user_id,
            asset_code: 'POINTS',
            delta_amount: -deductAmount,
            idempotency_key: idempotencyKey,
            business_type: 'lottery_consume',
            meta: { reason: '3.1.3 测试 - 幂等性第一次' }
          },
          { transaction }
        )
      })

      expect(result1.is_duplicate).toBe(false)

      // 第二次扣费（相同参数）
      const result2 = await TransactionManager.execute(async transaction => {
        return await BalanceService.changeBalance(
          {
            user_id: testUserContext.user_id,
            asset_code: 'POINTS',
            delta_amount: -deductAmount,
            idempotency_key: idempotencyKey,
            business_type: 'lottery_consume',
            meta: { reason: '3.1.3 测试 - 幂等性第二次' }
          },
          { transaction }
        )
      })

      // 验证幂等返回
      expect(result2.is_duplicate).toBe(true)
      expect(Number(result2.transaction_record.transaction_id)).toBe(
        Number(result1.transaction_record.transaction_id)
      )

      // 验证余额只扣减一次
      const finalBalance = await BalanceService.getBalance(
        { user_id: testUserContext.user_id, asset_code: 'POINTS' },
        {}
      )
      expect(finalBalance.available_amount).toBe(initialBalance.available_amount - deductAmount)

      console.log('✅ 3.1.3 扣费幂等性测试通过')
    })
  })

  /**
   * ============================================================
   * 3.2 资产增加流程测试
   * 测试目标：验证中奖后资产发放功能
   * ============================================================
   */
  describe('3.2 资产增加流程', () => {
    beforeEach(async () => {
      // 清理之前的测试交易记录
      await AssetTransaction.destroy({
        where: {
          idempotency_key: { [Op.like]: `${TEST_PREFIX}_increase_%` }
        }
      })
    })

    test('3.2.1 POINTS 奖励发放应正确增加余额', async () => {
      const idempotencyKey = `${TEST_PREFIX}_increase_points_${Date.now()}`
      const rewardAmount = 500 // 奖励 500 积分

      // 记录发放前余额
      const beforeBalance = await BalanceService.getBalance(
        { user_id: testUserContext.user_id, asset_code: 'POINTS' },
        {}
      )

      // 执行奖励发放
      const result = await TransactionManager.execute(async transaction => {
        return await BalanceService.changeBalance(
          {
            user_id: testUserContext.user_id,
            asset_code: 'POINTS',
            delta_amount: rewardAmount, // 正数表示增加
            idempotency_key: idempotencyKey,
            business_type: 'lottery_reward', // 抽奖奖励业务类型
            meta: {
              reason: '3.2.1 测试 - POINTS 奖励发放',
              prize_name: '积分奖励',
              lottery_session_id: `test_session_${Date.now()}`
            }
          },
          { transaction }
        )
      })

      /*
       * 验证返回结果
       * BalanceService.changeBalance 返回结构：{ balance, transaction_record, is_duplicate }
       */
      expect(result).toBeDefined()
      expect(result.transaction_record).toBeDefined()
      expect(result.transaction_record.transaction_id).toBeDefined()
      expect(Number(result.transaction_record.delta_amount)).toBe(rewardAmount)
      expect(result.is_duplicate).toBe(false)

      // 验证余额变化
      const afterBalance = await BalanceService.getBalance(
        { user_id: testUserContext.user_id, asset_code: 'POINTS' },
        {}
      )
      expect(afterBalance.available_amount).toBe(beforeBalance.available_amount + rewardAmount)

      console.log('✅ 3.2.1 POINTS 奖励发放测试通过')
      console.log(`   - 发放前余额: ${beforeBalance.available_amount}`)
      console.log(`   - 奖励金额: ${rewardAmount}`)
      console.log(`   - 发放后余额: ${afterBalance.available_amount}`)
    })

    test('3.2.2 DIAMOND 奖励发放应正确增加余额', async () => {
      const idempotencyKey = `${TEST_PREFIX}_increase_diamond_${Date.now()}`
      const rewardAmount = 100 // 奖励 100 钻石

      // 记录发放前余额
      const beforeBalance = await BalanceService.getBalance(
        { user_id: testUserContext.user_id, asset_code: 'DIAMOND' },
        {}
      )

      // 执行奖励发放
      const result = await TransactionManager.execute(async transaction => {
        return await BalanceService.changeBalance(
          {
            user_id: testUserContext.user_id,
            asset_code: 'DIAMOND',
            delta_amount: rewardAmount,
            idempotency_key: idempotencyKey,
            business_type: 'lottery_reward',
            meta: {
              reason: '3.2.2 测试 - DIAMOND 奖励发放',
              prize_name: '钻石奖励'
            }
          },
          { transaction }
        )
      })

      /*
       * 验证返回结果
       * BalanceService.changeBalance 返回结构：{ balance, transaction_record, is_duplicate }
       */
      expect(result).toBeDefined()
      expect(result.transaction_record).toBeDefined()
      expect(Number(result.transaction_record.delta_amount)).toBe(rewardAmount)

      // 验证余额变化
      const afterBalance = await BalanceService.getBalance(
        { user_id: testUserContext.user_id, asset_code: 'DIAMOND' },
        {}
      )
      expect(afterBalance.available_amount).toBe(beforeBalance.available_amount + rewardAmount)

      console.log('✅ 3.2.2 DIAMOND 奖励发放测试通过')
    })

    test('3.2.3 red_shard 奖励发放应正确增加余额', async () => {
      const idempotencyKey = `${TEST_PREFIX}_increase_redshard_${Date.now()}`
      const rewardAmount = 20 // 奖励 20 个红碎片

      // 记录发放前余额
      const beforeBalance = await BalanceService.getBalance(
        { user_id: testUserContext.user_id, asset_code: 'red_shard' },
        {}
      )

      // 执行奖励发放
      await TransactionManager.execute(async transaction => {
        return await BalanceService.changeBalance(
          {
            user_id: testUserContext.user_id,
            asset_code: 'red_shard',
            delta_amount: rewardAmount,
            idempotency_key: idempotencyKey,
            business_type: 'lottery_reward',
            meta: { reason: '3.2.3 测试 - red_shard 奖励发放' }
          },
          { transaction }
        )
      })

      // 验证余额变化
      const afterBalance = await BalanceService.getBalance(
        { user_id: testUserContext.user_id, asset_code: 'red_shard' },
        {}
      )
      expect(afterBalance.available_amount).toBe(beforeBalance.available_amount + rewardAmount)

      console.log('✅ 3.2.3 red_shard 奖励发放测试通过')
    })
  })

  /**
   * ============================================================
   * 3.3 余额校验测试
   * 测试目标：验证余额不足时的拦截逻辑
   * ============================================================
   */
  describe('3.3 余额校验', () => {
    test('3.3.1 余额不足时应抛出错误并拒绝扣费', async () => {
      const idempotencyKey = `${TEST_PREFIX}_insufficient_${Date.now()}`

      // 获取当前余额
      const currentBalance = await BalanceService.getBalance(
        { user_id: testUserContext.user_id, asset_code: 'POINTS' },
        {}
      )

      // 尝试扣除超过可用余额的金额
      const excessiveAmount = currentBalance.available_amount + 10000

      // 验证扣费被拒绝并抛出错误
      await expect(
        TransactionManager.execute(async transaction => {
          return await BalanceService.changeBalance(
            {
              user_id: testUserContext.user_id,
              asset_code: 'POINTS',
              delta_amount: -excessiveAmount,
              idempotency_key: idempotencyKey,
              business_type: 'lottery_consume',
              meta: { reason: '3.3.1 测试 - 余额不足拦截' }
            },
            { transaction }
          )
        })
      ).rejects.toThrow(/余额不足|insufficient/i)

      // 验证余额未变化
      const afterBalance = await BalanceService.getBalance(
        { user_id: testUserContext.user_id, asset_code: 'POINTS' },
        {}
      )
      expect(afterBalance.available_amount).toBe(currentBalance.available_amount)

      console.log('✅ 3.3.1 余额不足拦截测试通过')
      console.log(`   - 当前余额: ${currentBalance.available_amount}`)
      console.log(`   - 尝试扣除: ${excessiveAmount}`)
      console.log(`   - 扣费被正确拒绝`)
    })

    test('3.3.2 精确边界值测试：恰好余额可以扣除', async () => {
      const idempotencyKey = `${TEST_PREFIX}_boundary_exact_${Date.now()}`

      // 先添加已知金额的余额
      const knownAmount = 123
      await TransactionManager.execute(async transaction => {
        await BalanceService.changeBalance(
          {
            user_id: testUserContext.user_id,
            asset_code: 'POINTS',
            delta_amount: knownAmount,
            idempotency_key: `${TEST_PREFIX}_boundary_init_${Date.now()}`,
            business_type: 'admin_adjustment',
            meta: { reason: '3.3.2 边界测试初始化' }
          },
          { transaction }
        )
      })

      // 获取当前余额
      const currentBalance = await BalanceService.getBalance(
        { user_id: testUserContext.user_id, asset_code: 'POINTS' },
        {}
      )

      // 扣除恰好等于可用余额的金额
      const exactAmount = currentBalance.available_amount

      const result = await TransactionManager.execute(async transaction => {
        return await BalanceService.changeBalance(
          {
            user_id: testUserContext.user_id,
            asset_code: 'POINTS',
            delta_amount: -exactAmount,
            idempotency_key: idempotencyKey,
            business_type: 'lottery_consume',
            meta: { reason: '3.3.2 测试 - 边界值扣费' }
          },
          { transaction }
        )
      })

      expect(result).toBeDefined()
      expect(result.transaction_record).toBeDefined()
      expect(Number(result.transaction_record.delta_amount)).toBe(-exactAmount)

      // 验证余额为0
      const afterBalance = await BalanceService.getBalance(
        { user_id: testUserContext.user_id, asset_code: 'POINTS' },
        {}
      )
      expect(afterBalance.available_amount).toBe(0)

      console.log('✅ 3.3.2 边界值扣费测试通过')
    })

    test('3.3.3 零余额扣费应被拒绝', async () => {
      // 创建一个新的资产类型用于测试零余额场景
      const testAssetCode = 'test_zero_balance_asset'
      const idempotencyKey = `${TEST_PREFIX}_zero_balance_${Date.now()}`

      // 获取该资产的余额（应该为0或不存在）
      const currentBalance = await BalanceService.getBalance(
        { user_id: testUserContext.user_id, asset_code: testAssetCode },
        {}
      )

      // 如果余额不为0，先扣除到0
      if (currentBalance.available_amount > 0) {
        await TransactionManager.execute(async transaction => {
          await BalanceService.changeBalance(
            {
              user_id: testUserContext.user_id,
              asset_code: testAssetCode,
              delta_amount: -currentBalance.available_amount,
              idempotency_key: `${TEST_PREFIX}_zero_init_${Date.now()}`,
              business_type: 'admin_adjustment',
              meta: { reason: '3.3.3 测试初始化' }
            },
            { transaction }
          )
        })
      }

      // 尝试从零余额扣费
      await expect(
        TransactionManager.execute(async transaction => {
          return await BalanceService.changeBalance(
            {
              user_id: testUserContext.user_id,
              asset_code: testAssetCode,
              delta_amount: -1,
              idempotency_key: idempotencyKey,
              business_type: 'lottery_consume',
              meta: { reason: '3.3.3 测试 - 零余额扣费' }
            },
            { transaction }
          )
        })
      ).rejects.toThrow(/余额不足|insufficient/i)

      console.log('✅ 3.3.3 零余额扣费拦截测试通过')
    })
  })

  /**
   * ============================================================
   * 3.4 事务一致性测试
   * 测试目标：验证扣费与抽奖操作的原子性（失败回滚）
   * ============================================================
   */
  describe('3.4 事务一致性', () => {
    test('3.4.1 事务内多步操作失败应完全回滚', async () => {
      const idempotencyKeyDeduct = `${TEST_PREFIX}_atomic_deduct_${Date.now()}`
      // idempotencyKeyReward 在模拟失败场景中不需要使用

      // 添加初始余额用于测试
      await TransactionManager.execute(async transaction => {
        await BalanceService.changeBalance(
          {
            user_id: testUserContext.user_id,
            asset_code: 'POINTS',
            delta_amount: 500,
            idempotency_key: `${TEST_PREFIX}_atomic_init_${Date.now()}`,
            business_type: 'admin_adjustment',
            meta: { reason: '3.4.1 事务一致性测试初始化' }
          },
          { transaction }
        )
      })

      // 记录事务开始前的余额
      const beforeBalance = await BalanceService.getBalance(
        { user_id: testUserContext.user_id, asset_code: 'POINTS' },
        {}
      )

      // 模拟事务：扣费成功 -> 奖励发放失败 -> 整体回滚
      try {
        await TransactionManager.execute(async transaction => {
          // 步骤1：扣费（成功）
          await BalanceService.changeBalance(
            {
              user_id: testUserContext.user_id,
              asset_code: 'POINTS',
              delta_amount: -100,
              idempotency_key: idempotencyKeyDeduct,
              business_type: 'lottery_consume',
              meta: { reason: '3.4.1 测试 - 事务内扣费' }
            },
            { transaction }
          )

          // 步骤2：模拟奖励发放失败（抛出异常）
          throw new Error('模拟奖励发放失败，触发回滚')
        })
      } catch (error) {
        expect(error.message).toContain('模拟奖励发放失败')
      }

      // 验证余额回滚到事务前状态
      const afterBalance = await BalanceService.getBalance(
        { user_id: testUserContext.user_id, asset_code: 'POINTS' },
        {}
      )
      expect(afterBalance.available_amount).toBe(beforeBalance.available_amount)

      // 验证扣费交易记录也被回滚（不存在）
      const deductTx = await AssetTransaction.findOne({
        where: { idempotency_key: idempotencyKeyDeduct }
      })
      expect(deductTx).toBeNull()

      console.log('✅ 3.4.1 事务回滚测试通过')
      console.log(`   - 事务前余额: ${beforeBalance.available_amount}`)
      console.log(`   - 事务后余额: ${afterBalance.available_amount}`)
      console.log('   - 事务完全回滚成功')
    })

    test('3.4.2 事务内扣费和奖励同时成功应完整提交', async () => {
      const idempotencyKeyDeduct = `${TEST_PREFIX}_atomic_success_deduct_${Date.now()}`
      const idempotencyKeyReward = `${TEST_PREFIX}_atomic_success_reward_${Date.now()}`

      // 添加初始余额用于测试
      await TransactionManager.execute(async transaction => {
        await BalanceService.changeBalance(
          {
            user_id: testUserContext.user_id,
            asset_code: 'POINTS',
            delta_amount: 1000,
            idempotency_key: `${TEST_PREFIX}_atomic_success_init_${Date.now()}`,
            business_type: 'admin_adjustment',
            meta: { reason: '3.4.2 事务一致性测试初始化' }
          },
          { transaction }
        )
      })

      // 记录事务开始前的余额
      const beforePointsBalance = await BalanceService.getBalance(
        { user_id: testUserContext.user_id, asset_code: 'POINTS' },
        {}
      )
      const beforeDiamondBalance = await BalanceService.getBalance(
        { user_id: testUserContext.user_id, asset_code: 'DIAMOND' },
        {}
      )

      // 执行事务：扣费 + 奖励发放（同时成功）
      await TransactionManager.execute(async transaction => {
        // 步骤1：扣费
        await BalanceService.changeBalance(
          {
            user_id: testUserContext.user_id,
            asset_code: 'POINTS',
            delta_amount: -200,
            idempotency_key: idempotencyKeyDeduct,
            business_type: 'lottery_consume',
            lottery_session_id: 'test_lottery_session_001',
            meta: { reason: '3.4.2 测试 - 事务内扣费' }
          },
          { transaction }
        )

        // 步骤2：奖励发放
        await BalanceService.changeBalance(
          {
            user_id: testUserContext.user_id,
            asset_code: 'DIAMOND',
            delta_amount: 50,
            idempotency_key: idempotencyKeyReward,
            business_type: 'lottery_reward',
            lottery_session_id: 'test_lottery_session_001',
            meta: { reason: '3.4.2 测试 - 事务内奖励' }
          },
          { transaction }
        )
      })

      // 验证扣费生效
      const afterPointsBalance = await BalanceService.getBalance(
        { user_id: testUserContext.user_id, asset_code: 'POINTS' },
        {}
      )
      expect(afterPointsBalance.available_amount).toBe(beforePointsBalance.available_amount - 200)

      // 验证奖励生效
      const afterDiamondBalance = await BalanceService.getBalance(
        { user_id: testUserContext.user_id, asset_code: 'DIAMOND' },
        {}
      )
      expect(afterDiamondBalance.available_amount).toBe(beforeDiamondBalance.available_amount + 50)

      // 验证两条交易记录都存在
      const deductTx = await AssetTransaction.findOne({
        where: { idempotency_key: idempotencyKeyDeduct }
      })
      const rewardTx = await AssetTransaction.findOne({
        where: { idempotency_key: idempotencyKeyReward }
      })

      expect(deductTx).not.toBeNull()
      expect(rewardTx).not.toBeNull()

      console.log('✅ 3.4.2 事务完整提交测试通过')
    })

    test('3.4.3 跨表事务必须显式传递 transaction 参数', async () => {
      // 验证 BalanceService 在没有 transaction 时拒绝写操作
      const idempotencyKey = `${TEST_PREFIX}_no_tx_${Date.now()}`

      // 尝试不传递 transaction 调用 changeBalance（应抛出错误）
      await expect(
        BalanceService.changeBalance(
          {
            user_id: testUserContext.user_id,
            asset_code: 'POINTS',
            delta_amount: 10,
            idempotency_key: idempotencyKey,
            business_type: 'admin_adjustment',
            meta: {}
          },
          {} // 没有传递 transaction
        )
      ).rejects.toThrow(/TRANSACTION_REQUIRED|transaction|事务/i)

      console.log('✅ 3.4.3 事务边界检查测试通过')
    })
  })

  /**
   * ============================================================
   * 3.5 资产交易记录测试
   * 测试目标：验证 asset_transactions 流水完整性
   * ============================================================
   */
  describe('3.5 资产交易记录', () => {
    test('3.5.1 扣费应生成完整的交易记录', async () => {
      const idempotencyKey = `${TEST_PREFIX}_txlog_deduct_${Date.now()}`
      const deductAmount = 150

      // 添加余额用于扣费
      await TransactionManager.execute(async transaction => {
        await BalanceService.changeBalance(
          {
            user_id: testUserContext.user_id,
            asset_code: 'POINTS',
            delta_amount: 500,
            idempotency_key: `${TEST_PREFIX}_txlog_init_${Date.now()}`,
            business_type: 'admin_adjustment',
            meta: {}
          },
          { transaction }
        )
      })

      // 记录扣费前余额
      const beforeBalance = await BalanceService.getBalance(
        { user_id: testUserContext.user_id, asset_code: 'POINTS' },
        {}
      )

      // 执行扣费
      await TransactionManager.execute(async transaction => {
        await BalanceService.changeBalance(
          {
            user_id: testUserContext.user_id,
            asset_code: 'POINTS',
            delta_amount: -deductAmount,
            idempotency_key: idempotencyKey,
            business_type: 'lottery_consume',
            lottery_session_id: 'test_session_3.5.1',
            meta: {
              campaign_id: 1,
              store_id: 1,
              reason: '3.5.1 交易记录完整性测试'
            }
          },
          { transaction }
        )
      })

      // 验证交易记录完整性
      const txRecord = await AssetTransaction.findOne({
        where: { idempotency_key: idempotencyKey }
      })

      expect(txRecord).not.toBeNull()

      // 验证必需字段
      expect(txRecord.account_id).toBeDefined()
      expect(txRecord.asset_code).toBe('POINTS')
      expect(Number(txRecord.delta_amount)).toBe(-deductAmount)
      expect(txRecord.business_type).toBe('lottery_consume')
      expect(txRecord.idempotency_key).toBe(idempotencyKey)
      expect(txRecord.lottery_session_id).toBe('test_session_3.5.1')

      // 验证余额快照字段
      expect(Number(txRecord.balance_before)).toBe(beforeBalance.available_amount)
      expect(Number(txRecord.balance_after)).toBe(beforeBalance.available_amount - deductAmount)

      // 验证元数据
      const meta = typeof txRecord.meta === 'string' ? JSON.parse(txRecord.meta) : txRecord.meta
      expect(meta.reason).toBe('3.5.1 交易记录完整性测试')

      console.log('✅ 3.5.1 扣费交易记录完整性测试通过')
      console.log(`   - transaction_id: ${txRecord.transaction_id}`)
      console.log(`   - balance_before: ${txRecord.balance_before}`)
      console.log(`   - balance_after: ${txRecord.balance_after}`)
      console.log(`   - business_type: ${txRecord.business_type}`)
    })

    test('3.5.2 奖励发放应生成完整的交易记录', async () => {
      const idempotencyKey = `${TEST_PREFIX}_txlog_reward_${Date.now()}`
      const rewardAmount = 300

      // 记录发放前余额
      const beforeBalance = await BalanceService.getBalance(
        { user_id: testUserContext.user_id, asset_code: 'DIAMOND' },
        {}
      )

      // 执行奖励发放
      await TransactionManager.execute(async transaction => {
        await BalanceService.changeBalance(
          {
            user_id: testUserContext.user_id,
            asset_code: 'DIAMOND',
            delta_amount: rewardAmount,
            idempotency_key: idempotencyKey,
            business_type: 'lottery_reward',
            lottery_session_id: 'test_session_3.5.2',
            meta: {
              prize_id: 999,
              prize_name: '测试钻石奖励',
              reason: '3.5.2 奖励交易记录测试'
            }
          },
          { transaction }
        )
      })

      // 验证交易记录完整性
      const txRecord = await AssetTransaction.findOne({
        where: { idempotency_key: idempotencyKey }
      })

      expect(txRecord).not.toBeNull()

      // 验证必需字段
      expect(txRecord.asset_code).toBe('DIAMOND')
      expect(Number(txRecord.delta_amount)).toBe(rewardAmount)
      expect(txRecord.business_type).toBe('lottery_reward')
      expect(txRecord.lottery_session_id).toBe('test_session_3.5.2')

      // 验证余额快照
      expect(Number(txRecord.balance_before)).toBe(beforeBalance.available_amount)
      expect(Number(txRecord.balance_after)).toBe(beforeBalance.available_amount + rewardAmount)

      console.log('✅ 3.5.2 奖励交易记录完整性测试通过')
    })

    test('3.5.3 交易记录应支持通过 lottery_session_id 关联查询', async () => {
      const lotterySessionId = `test_lottery_session_${Date.now()}`
      const idempotencyKeyDeduct = `${TEST_PREFIX}_session_deduct_${Date.now()}`
      const idempotencyKeyReward = `${TEST_PREFIX}_session_reward_${Date.now()}`

      // 添加余额用于扣费
      await TransactionManager.execute(async transaction => {
        await BalanceService.changeBalance(
          {
            user_id: testUserContext.user_id,
            asset_code: 'POINTS',
            delta_amount: 1000,
            idempotency_key: `${TEST_PREFIX}_session_init_${Date.now()}`,
            business_type: 'admin_adjustment',
            meta: {}
          },
          { transaction }
        )
      })

      // 执行同一 lottery_session_id 的扣费和奖励
      await TransactionManager.execute(async transaction => {
        // 扣费
        await BalanceService.changeBalance(
          {
            user_id: testUserContext.user_id,
            asset_code: 'POINTS',
            delta_amount: -100,
            idempotency_key: idempotencyKeyDeduct,
            business_type: 'lottery_consume',
            lottery_session_id: lotterySessionId,
            meta: { step: 'deduct' }
          },
          { transaction }
        )

        // 奖励
        await BalanceService.changeBalance(
          {
            user_id: testUserContext.user_id,
            asset_code: 'DIAMOND',
            delta_amount: 50,
            idempotency_key: idempotencyKeyReward,
            business_type: 'lottery_reward',
            lottery_session_id: lotterySessionId,
            meta: { step: 'reward' }
          },
          { transaction }
        )
      })

      // 通过 lottery_session_id 查询关联的交易记录
      const relatedTransactions = await AssetTransaction.findAll({
        where: { lottery_session_id: lotterySessionId },
        order: [['created_at', 'ASC']]
      })

      // 验证能查到两条关联记录
      expect(relatedTransactions.length).toBe(2)

      // 验证扣费记录
      const deductTx = relatedTransactions.find(tx => tx.business_type === 'lottery_consume')
      expect(deductTx).toBeDefined()
      expect(deductTx.asset_code).toBe('POINTS')
      expect(Number(deductTx.delta_amount)).toBe(-100)

      // 验证奖励记录
      const rewardTx = relatedTransactions.find(tx => tx.business_type === 'lottery_reward')
      expect(rewardTx).toBeDefined()
      expect(rewardTx.asset_code).toBe('DIAMOND')
      expect(Number(rewardTx.delta_amount)).toBe(50)

      console.log('✅ 3.5.3 lottery_session_id 关联查询测试通过')
      console.log(`   - lottery_session_id: ${lotterySessionId}`)
      console.log(`   - 关联交易记录数: ${relatedTransactions.length}`)
    })

    test('3.5.4 交易记录应按时间顺序正确排列', async () => {
      const baseIdempotencyKey = `${TEST_PREFIX}_order_${Date.now()}`

      // 添加初始余额
      await TransactionManager.execute(async transaction => {
        await BalanceService.changeBalance(
          {
            user_id: testUserContext.user_id,
            asset_code: 'POINTS',
            delta_amount: 5000,
            idempotency_key: `${TEST_PREFIX}_order_init_${Date.now()}`,
            business_type: 'admin_adjustment',
            meta: {}
          },
          { transaction }
        )
      })

      // 按顺序执行多次操作
      const operations = [
        { amount: -100, order: 1 },
        { amount: -200, order: 2 },
        { amount: 500, order: 3 },
        { amount: -50, order: 4 }
      ]

      for (const op of operations) {
        await TransactionManager.execute(async transaction => {
          await BalanceService.changeBalance(
            {
              user_id: testUserContext.user_id,
              asset_code: 'POINTS',
              delta_amount: op.amount,
              idempotency_key: `${baseIdempotencyKey}_${op.order}`,
              business_type: op.amount > 0 ? 'lottery_reward' : 'lottery_consume',
              meta: { order: op.order }
            },
            { transaction }
          )
        })

        // 添加小延迟确保时间顺序
        await new Promise(resolve => setTimeout(resolve, 50))
      }

      // 查询交易记录并验证顺序
      const transactions = await AssetTransaction.findAll({
        where: {
          idempotency_key: { [Op.like]: `${baseIdempotencyKey}_%` }
        },
        order: [['created_at', 'ASC']]
      })

      expect(transactions.length).toBe(4)

      // 验证时间顺序
      for (let i = 1; i < transactions.length; i++) {
        const prevTime = new Date(transactions[i - 1].created_at).getTime()
        const currTime = new Date(transactions[i].created_at).getTime()
        expect(currTime).toBeGreaterThanOrEqual(prevTime)
      }

      // 验证余额快照链式连接
      for (let i = 1; i < transactions.length; i++) {
        expect(Number(transactions[i].balance_before)).toBe(
          Number(transactions[i - 1].balance_after)
        )
      }

      console.log('✅ 3.5.4 交易记录时间顺序测试通过')
    })
  })
})
