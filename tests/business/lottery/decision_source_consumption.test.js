'use strict'

/**
 * 决策来源消耗机制 - 业务测试（preset 预设）
 *
 * 验证决策来源消耗与命中逻辑（2026-06-04 合规改造后）：
 * 1. 全局预设（lottery_campaign_id=NULL）可被任意活动命中
 * 2. 活动级预设（lottery_campaign_id=具体ID）按活动命中
 * 3. 其他活动的预设不应被当前活动命中
 * 4. SettleStage._consumeDecisionSource 仅消耗预设（per-user 暗箱干预 override 已下线）
 *
 * 测试策略：
 * - 使用真实数据库（restaurant_points_dev）
 * - 测试用户：13612227930（user_id 从 global.testData 获取，兜底 31）
 * - 测试前创建预设记录，测试后清理
 *
 * @file tests/business/lottery/decision_source_consumption.test.js
 */

require('dotenv').config()

const { LotteryPreset, LotteryCampaignPrize } = require('../../../models')
const LoadDecisionSourceStage = require('../../../services/UnifiedLotteryEngine/pipeline/stages/LoadDecisionSourceStage')
const SettleStage = require('../../../services/UnifiedLotteryEngine/pipeline/stages/SettleStage')

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

describe('【决策来源消耗】预设命中与消耗', () => {
  let stage
  let test_user_id
  let test_campaign_id
  /** @type {string[]} 测试过程中创建的预设记录ID（测试后清理） */
  const created_preset_ids = []

  beforeAll(async () => {
    test_user_id = getTestUserId()
    test_campaign_id = getTestCampaignId()
  })

  beforeEach(() => {
    stage = new LoadDecisionSourceStage()
  })

  afterAll(async () => {
    if (created_preset_ids.length > 0) {
      await LotteryPreset.destroy({
        where: { lottery_preset_id: created_preset_ids }
      })
    }
  })

  describe('1. _checkPreset 命中逻辑', () => {
    test('全局预设（lottery_campaign_id=null）应被命中', async () => {
      const prize = await LotteryCampaignPrize.findOne({ where: { status: 'active' } })
      if (!prize) {
        return
      }

      await LotteryPreset.update(
        { status: 'used' },
        { where: { user_id: test_user_id, status: 'pending' } }
      )

      const preset = await LotteryPreset.create({
        user_id: test_user_id,
        lottery_campaign_prize_id: prize.lottery_campaign_prize_id,
        queue_order: 999,
        status: 'pending',
        approval_status: 'approved',
        lottery_campaign_id: null,
        created_by: test_user_id
      })
      created_preset_ids.push(preset.lottery_preset_id)

      const result = await stage._checkPreset(test_user_id, test_campaign_id)

      expect(result).not.toBeNull()
      expect(result.lottery_preset_id).toBe(preset.lottery_preset_id)

      await preset.destroy()
      created_preset_ids.pop()
    })

    test('活动级预设（lottery_campaign_id=具体ID）应被命中', async () => {
      const prize = await LotteryCampaignPrize.findOne({ where: { status: 'active' } })
      if (!prize) {
        return
      }

      await LotteryPreset.update(
        { status: 'used' },
        { where: { user_id: test_user_id, status: 'pending' } }
      )

      const preset = await LotteryPreset.create({
        user_id: test_user_id,
        lottery_campaign_prize_id: prize.lottery_campaign_prize_id,
        queue_order: 998,
        status: 'pending',
        approval_status: 'approved',
        lottery_campaign_id: test_campaign_id,
        created_by: test_user_id
      })
      created_preset_ids.push(preset.lottery_preset_id)

      const result = await stage._checkPreset(test_user_id, test_campaign_id)

      expect(result).not.toBeNull()
      expect(result.lottery_preset_id).toBe(preset.lottery_preset_id)

      await preset.destroy()
      created_preset_ids.pop()
    })

    test('其他活动的预设不应被当前活动命中', async () => {
      const prize = await LotteryCampaignPrize.findOne({ where: { status: 'active' } })
      if (!prize) {
        return
      }

      await LotteryPreset.update(
        { status: 'used' },
        { where: { user_id: test_user_id, status: 'pending' } }
      )

      const other_campaign_id = test_campaign_id + 99999
      const preset = await LotteryPreset.create({
        user_id: test_user_id,
        lottery_campaign_prize_id: prize.lottery_campaign_prize_id,
        queue_order: 997,
        status: 'pending',
        approval_status: 'approved',
        lottery_campaign_id: other_campaign_id,
        created_by: test_user_id
      })
      created_preset_ids.push(preset.lottery_preset_id)

      const result = await stage._checkPreset(test_user_id, test_campaign_id)

      expect(result).toBeNull()

      await preset.destroy()
      created_preset_ids.pop()
    })
  })

  describe('2. SettleStage._consumeDecisionSource 结构验证', () => {
    test('_consumeDecisionSource 方法存在（仅消耗预设，override 已下线）', () => {
      const stage_instance = new SettleStage()
      expect(typeof stage_instance._consumeDecisionSource).toBe('function')
    })

    test('LoadDecisionSourceStage 决策来源不再包含 override', () => {
      expect(LoadDecisionSourceStage.DECISION_SOURCES).toBeDefined()
      const sources = Object.values(LoadDecisionSourceStage.DECISION_SOURCES)
      expect(sources).toContain('preset')
      expect(sources).toContain('normal')
      expect(sources).not.toContain('override')
    })
  })
})
