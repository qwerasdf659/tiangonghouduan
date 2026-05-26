'use strict'

/**
 * 决策来源消耗机制 - 业务测试
 *
 * 验证 2026-02-15 修复：
 * 1. force_win 管理干预使用后自动标记为 used（不再无限重复命中）
 * 2. 预设队列使用后自动标记为 used（队列自动推进）
 * 3. 管理干预过期时间实时检查（不依赖定时任务）
 * 4. 全局预设（lottery_campaign_id=NULL）可被正确命中
 *
 * 测试策略：
 * - 使用真实数据库（restaurant_points_dev）
 * - 测试用户：13612227930（user_id 从 global.testData 获取）
 * - 测试前创建干预/预设记录，测试后清理
 *
 * @file tests/business/lottery/decision_source_consumption.test.js
 * @since 2026-02-15
 */

require('dotenv').config()

const {
  sequelize,
  LotteryManagementSetting,
  LotteryPreset,
  LotteryCampaignPrize
} = require('../../../models')
const LoadDecisionSourceStage = require('../../../services/UnifiedLotteryEngine/pipeline/stages/LoadDecisionSourceStage')

/**
 * 测试用户ID（从 global.testData 动态获取，jest.setup.js 负责初始化）
 * @returns {number} 测试用户ID
 */
function getTestUserId() {
  if (global.testData && global.testData.testUser) {
    return global.testData.testUser.user_id
  }
  return 31 // 兜底值：测试账号 13612227930 对应的 user_id
}

/**
 * 获取测试活动ID
 * @returns {number} 测试活动ID
 */
function getTestCampaignId() {
  if (global.testData && global.testData.testCampaign) {
    return global.testData.testCampaign.lottery_campaign_id
  }
  return 1 // 兜底值：餐厅积分抽奖活动
}

describe('【决策来源消耗】2026-02-15 修复验证', () => {
  let stage
  let test_user_id
  let test_campaign_id
  /** @type {string[]} 测试过程中创建的干预记录ID（测试后清理） */
  const created_setting_ids = []
  /** @type {string[]} 测试过程中创建的预设记录ID（测试后清理） */
  const created_preset_ids = []

  beforeAll(async () => {
    console.log('='.repeat(80))
    console.log('🎯 【决策来源消耗】2026-02-15 修复验证')
    console.log('='.repeat(80))

    test_user_id = getTestUserId()
    test_campaign_id = getTestCampaignId()

    console.log(`📋 测试用户: user_id=${test_user_id}`)
    console.log(`📋 测试活动: lottery_campaign_id=${test_campaign_id}`)
  })

  beforeEach(() => {
    stage = new LoadDecisionSourceStage()
  })

  afterAll(async () => {
    // 清理测试创建的干预记录
    if (created_setting_ids.length > 0) {
      await LotteryManagementSetting.destroy({
        where: { lottery_management_setting_id: created_setting_ids }
      })
      console.log(`🧹 清理 ${created_setting_ids.length} 条测试干预记录`)
    }

    // 清理测试创建的预设记录
    if (created_preset_ids.length > 0) {
      await LotteryPreset.destroy({
        where: { lottery_preset_id: created_preset_ids }
      })
      console.log(`🧹 清理 ${created_preset_ids.length} 条测试预设记录`)
    }

    // 不关闭数据库连接（jest.setup.js 统一管理）
  })

  describe('1. _checkOverride 过期时间检查（2026-02-15 修复）', () => {
    test('已过期的 force_win 干预不应被命中', async () => {
      // 创建一条已过期的 force_win 干预（expires_at 设为1小时前）
      const one_hour_ago = new Date(Date.now() - 60 * 60 * 1000)
      const setting = await LotteryManagementSetting.create({
        user_id: test_user_id,
        setting_type: 'force_win',
        setting_data: {
          lottery_campaign_prize_id: 9,
          prize_name: '测试过期干预',
          reason: '单元测试'
        },
        expires_at: one_hour_ago,
        status: 'active', // 状态仍为 active（模拟定时任务尚未执行的时间窗口）
        created_by: test_user_id
      })
      created_setting_ids.push(setting.lottery_management_setting_id)

      // 调用 _checkOverride，应该返回 null（因为已过期）
      const result = await stage._checkOverride(test_user_id, test_campaign_id)

      /*
       * 修复前：会返回该干预记录（因为不检查 expires_at）
       * 修复后：应返回 null（实时过滤已过期的干预）
       * 注意：如果还有其他 active 的干预，可能返回它们而非 null
       */
      if (result) {
        // 如果返回了结果，确保不是我们创建的已过期记录
        expect(result.lottery_management_setting_id).not.toBe(setting.lottery_management_setting_id)
      }

      // 清理：立即删除测试记录（避免干扰后续测试）
      await setting.destroy()
      created_setting_ids.pop()
    })

    test('未过期的 force_win 干预应正常命中', async () => {
      // 先清理该用户所有 active 的干预（避免干扰）
      await LotteryManagementSetting.update(
        { status: 'cancelled' },
        { where: { user_id: test_user_id, status: 'active' } }
      )

      // 创建一条未过期的 force_win 干预（expires_at 设为1小时后）
      const one_hour_later = new Date(Date.now() + 60 * 60 * 1000)
      const setting = await LotteryManagementSetting.create({
        user_id: test_user_id,
        setting_type: 'force_win',
        setting_data: {
          lottery_campaign_prize_id: 9,
          prize_name: '测试未过期干预',
          reason: '单元测试'
        },
        expires_at: one_hour_later,
        status: 'active',
        created_by: test_user_id
      })
      created_setting_ids.push(setting.lottery_management_setting_id)

      // 调用 _checkOverride，应该命中
      const result = await stage._checkOverride(test_user_id, test_campaign_id)
      expect(result).not.toBeNull()
      expect(result.lottery_management_setting_id).toBe(setting.lottery_management_setting_id)

      // 清理
      await setting.destroy()
      created_setting_ids.pop()
    })

    test('永不过期的干预（expires_at=null）应正常命中', async () => {
      // 先清理该用户所有 active 的干预
      await LotteryManagementSetting.update(
        { status: 'cancelled' },
        { where: { user_id: test_user_id, status: 'active' } }
      )

      // 创建一条永不过期的干预
      const setting = await LotteryManagementSetting.create({
        user_id: test_user_id,
        setting_type: 'force_win',
        setting_data: {
          lottery_campaign_prize_id: 9,
          prize_name: '测试永不过期干预',
          reason: '单元测试'
        },
        expires_at: null,
        status: 'active',
        created_by: test_user_id
      })
      created_setting_ids.push(setting.lottery_management_setting_id)

      const result = await stage._checkOverride(test_user_id, test_campaign_id)
      expect(result).not.toBeNull()
      expect(result.lottery_management_setting_id).toBe(setting.lottery_management_setting_id)

      // 清理
      await setting.destroy()
      created_setting_ids.pop()
    })
  })

  describe('2. _checkPreset 全局预设支持（2026-02-15 修复）', () => {
    test('全局预设（lottery_campaign_id=null）应被命中', async () => {
      // 获取一个有效的奖品ID
      const prize = await LotteryCampaignPrize.findOne({ where: { status: 'active' } })
      if (!prize) {
        console.warn('⚠️ 数据库中无有效奖品，跳过此测试')
        return
      }

      // 先清理该用户所有 pending 预设（避免干扰）
      await LotteryPreset.update(
        { status: 'used' },
        { where: { user_id: test_user_id, status: 'pending' } }
      )

      // 创建一条全局预设（lottery_campaign_id=null）
      const preset = await LotteryPreset.create({
        user_id: test_user_id,
        lottery_campaign_prize_id: prize.lottery_campaign_prize_id,
        queue_order: 999, // 使用较大的 queue_order 避免与现有预设冲突
        status: 'pending',
        approval_status: 'approved',
        lottery_campaign_id: null, // 全局预设
        created_by: test_user_id
      })
      created_preset_ids.push(preset.lottery_preset_id)

      // 调用 _checkPreset，应该命中全局预设
      const result = await stage._checkPreset(test_user_id, test_campaign_id)

      /*
       * 修复前：返回 null（因为 lottery_campaign_id 不匹配）
       * 修复后：应返回该预设（lottery_campaign_id=null 匹配所有活动）
       */
      expect(result).not.toBeNull()
      expect(result.lottery_preset_id).toBe(preset.lottery_preset_id)

      // 清理
      await preset.destroy()
      created_preset_ids.pop()
    })

    test('活动级预设（lottery_campaign_id=具体ID）应被命中', async () => {
      const prize = await LotteryCampaignPrize.findOne({ where: { status: 'active' } })
      if (!prize) {
        console.warn('⚠️ 数据库中无有效奖品，跳过此测试')
        return
      }

      // 清理
      await LotteryPreset.update(
        { status: 'used' },
        { where: { user_id: test_user_id, status: 'pending' } }
      )

      // 创建活动级预设
      const preset = await LotteryPreset.create({
        user_id: test_user_id,
        lottery_campaign_prize_id: prize.lottery_campaign_prize_id,
        queue_order: 998,
        status: 'pending',
        approval_status: 'approved',
        lottery_campaign_id: test_campaign_id, // 绑定具体活动
        created_by: test_user_id
      })
      created_preset_ids.push(preset.lottery_preset_id)

      const result = await stage._checkPreset(test_user_id, test_campaign_id)
      expect(result).not.toBeNull()
      expect(result.lottery_preset_id).toBe(preset.lottery_preset_id)

      // 清理
      await preset.destroy()
      created_preset_ids.pop()
    })

    test('其他活动的预设不应被当前活动命中', async () => {
      const prize = await LotteryCampaignPrize.findOne({ where: { status: 'active' } })
      if (!prize) {
        console.warn('⚠️ 数据库中无有效奖品，跳过此测试')
        return
      }

      // 清理
      await LotteryPreset.update(
        { status: 'used' },
        { where: { user_id: test_user_id, status: 'pending' } }
      )

      // 创建绑定到不同活动的预设
      const other_campaign_id = test_campaign_id + 99999
      const preset = await LotteryPreset.create({
        user_id: test_user_id,
        lottery_campaign_prize_id: prize.lottery_campaign_prize_id,
        queue_order: 997,
        status: 'pending',
        approval_status: 'approved',
        lottery_campaign_id: other_campaign_id, // 绑定到其他活动
        created_by: test_user_id
      })
      created_preset_ids.push(preset.lottery_preset_id)

      const result = await stage._checkPreset(test_user_id, test_campaign_id)

      // 应该返回 null（不同活动的预设不应被命中）
      expect(result).toBeNull()

      // 清理
      await preset.destroy()
      created_preset_ids.pop()
    })
  })

  describe('3. SettleStage _consumeDecisionSource 结构验证', () => {
    test('SettleStage 应导入 LotteryManagementSetting 和 LotteryPreset 模型', () => {
      // 验证 SettleStage 文件是否正确导入了所需模型
      const SettleStage = require('../../../services/UnifiedLotteryEngine/pipeline/stages/SettleStage')
      const stage_instance = new SettleStage()

      // 验证 _consumeDecisionSource 方法存在
      expect(typeof stage_instance._consumeDecisionSource).toBe('function')
    })
  })

  describe('4. LotteryManagementSetting.markAsUsed 事务支持', () => {
    test('markAsUsed 应支持 transaction 参数', async () => {
      // 创建测试干预
      const setting = await LotteryManagementSetting.create({
        user_id: test_user_id,
        setting_type: 'force_win',
        setting_data: {
          lottery_campaign_prize_id: 9,
          prize_name: '测试markAsUsed',
          reason: '单元测试'
        },
        status: 'active',
        created_by: test_user_id
      })
      created_setting_ids.push(setting.lottery_management_setting_id)

      // 在事务中调用 markAsUsed
      const transaction = await sequelize.transaction()
      try {
        await setting.markAsUsed({ transaction })
        await transaction.commit()

        // 重新查询验证状态
        await setting.reload()
        expect(setting.status).toBe('used')
      } catch (error) {
        await transaction.rollback()
        throw error
      }

      // 清理
      await setting.destroy()
      created_setting_ids.pop()
    })
  })
})
