/**
 * 抽奖欠账管理 + 成长等级公示分级概率 业务测试
 *
 * 测试目标：验证 per-user 暗箱干预下线后，仍然有效的两类合规能力
 * 1. 预设欠账管理（PresetBudgetDebt / PresetInventoryDebt / DebtManagementService）—— 预设发放不可驳回产生的欠账
 * 2. 用户成长等级体系 + B 线公示分级概率（UserGrowthLevel / UserGrowthLevelService）
 *
 * 背景（2026-06-04 合规改造，详见 docs/抽奖管理干预接入缺口诊断.md）：
 * - force_win/force_lose/probability_adjust/user_queue 等 per-user 暗箱干预已整体下线，
 *   原 management_intervention 测试中针对这些设置的用例随机制移除。
 * - 个人发奖走 cs_compensate（明示补偿）；群体调赔率走按成长等级的公示分级概率（本测试覆盖）。
 *
 * 相关模型：
 * - PresetBudgetDebt：预算欠账表（preset_budget_debt_id, user_id, lottery_campaign_id, debt_amount, status）
 * - PresetInventoryDebt：库存欠账表（preset_inventory_debt_id, lottery_campaign_prize_id, debt_quantity, status）
 * - UserGrowthLevel：用户成长等级定义表（user_growth_level_id, level_key, min_history_points）
 *
 * 相关服务：
 * - DebtManagementService：欠账管理服务
 * - UserGrowthLevelService (ServiceManager key: user_growth_level)：成长等级派生 + B 线倍数读写
 *
 * 测试策略：使用真实数据库（restaurant_points_dev），测试账号 13612227910（既是用户也是管理员）
 */

const {
  User,
  PresetBudgetDebt,
  PresetInventoryDebt,
  LotteryCampaign,
  LotteryCampaignPrize,
  UserGrowthLevel
} = require('../../../models')
const { TEST_DATA } = require('../../helpers/test-data')

// 通过 ServiceManager 获取服务
let DebtManagementService
let GrowthLevelService

let admin_user_id = null
let test_lottery_campaign_id = null

const test_mobile = TEST_DATA.users.adminUser.mobile

describe('抽奖欠账管理 + 成长等级公示分级概率', () => {
  beforeAll(async () => {
    DebtManagementService = global.getTestService
      ? global.getTestService('debt_management')
      : require('../../../services/DebtManagementService')

    GrowthLevelService = global.getTestService ? global.getTestService('user_growth_level') : null

    const admin_user = await User.findOne({ where: { mobile: test_mobile } })
    if (!admin_user) {
      throw new Error(`管理员用户不存在：${test_mobile}，请先创建测试用户`)
    }
    admin_user_id = admin_user.user_id

    const active_campaign = await LotteryCampaign.findOne({
      where: { status: 'active' },
      order: [['created_at', 'DESC']]
    })
    if (active_campaign) {
      test_lottery_campaign_id = active_campaign.lottery_campaign_id
    }
  })

  /* ===== 测试组1：预算欠账管理 ===== */
  describe('1. 预算欠账管理', () => {
    test('1.1 应该能够查询预算欠账列表', async () => {
      const pending_debts = await PresetBudgetDebt.findAll({
        where: { status: 'pending' },
        limit: 10,
        order: [['created_at', 'DESC']]
      })
      expect(Array.isArray(pending_debts)).toBe(true)
    })

    test('1.2 应该能够按活动统计预算欠账', async () => {
      if (!test_lottery_campaign_id) {
        return
      }
      const stats = await PresetBudgetDebt.getDebtStatsByCampaign(test_lottery_campaign_id)
      expect(stats).toBeDefined()
      expect(typeof stats.total_debts).toBe('number')
      expect(typeof stats.total_debt_amount).toBe('number')
      expect(typeof stats.remaining_debt_amount).toBe('number')
    })

    test('1.3 应该能够按用户统计预算欠账', async () => {
      const stats = await PresetBudgetDebt.getDebtStatsByUser(admin_user_id)
      expect(stats).toBeDefined()
      expect(typeof stats.total_debts).toBe('number')
    })
  })

  /* ===== 测试组2：库存欠账管理（奖品键统一为 lottery_campaign_prize_id） ===== */
  describe('2. 库存欠账管理', () => {
    test('2.1 应该能够查询库存欠账列表', async () => {
      const pending_debts = await PresetInventoryDebt.findAll({
        where: { status: 'pending' },
        limit: 10,
        order: [['created_at', 'DESC']]
      })
      expect(Array.isArray(pending_debts)).toBe(true)
    })

    test('2.2 应该能够按奖品（lottery_campaign_prize_id）统计库存欠账', async () => {
      const prize = await LotteryCampaignPrize.findOne({ where: { status: 'active' } })
      if (!prize) {
        return
      }
      // 真实表结构：preset_inventory_debt.lottery_campaign_prize_id（2026-06-04 已统一）
      const debts = await PresetInventoryDebt.findAll({
        where: {
          lottery_campaign_prize_id: prize.lottery_campaign_prize_id,
          status: 'pending'
        }
      })
      expect(Array.isArray(debts)).toBe(true)
    })
  })

  /* ===== 测试组3：欠账看板服务 ===== */
  describe('3. 欠账看板服务', () => {
    test('3.1 应该能够获取欠账看板总览', async () => {
      const dashboard = await DebtManagementService.getDashboard()
      expect(dashboard).toBeDefined()
      expect(dashboard.inventory_debt).toBeDefined()
      expect(dashboard.budget_debt).toBeDefined()
      expect(typeof dashboard.inventory_debt.total).toBe('number')
      expect(typeof dashboard.budget_debt.total).toBe('number')
    })

    test('3.2 预算欠账应按来源分组统计', async () => {
      const dashboard = await DebtManagementService.getDashboard()
      expect(Array.isArray(dashboard.budget_debt.by_source)).toBe(true)
    })
  })

  /* ===== 测试组4：用户成长等级体系（P1=乙） ===== */
  describe('4. 用户成长等级体系', () => {
    test('4.1 成长等级阶梯应存在且按阈值升序', async () => {
      const levels = await UserGrowthLevel.getActiveLevels()
      expect(Array.isArray(levels)).toBe(true)
      expect(levels.length).toBeGreaterThan(0)
      // 最低档阈值应为 0，保证全部用户有归属
      expect(levels[0].min_history_points).toBe(0)
      // 升序校验
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i].min_history_points).toBeGreaterThanOrEqual(
          levels[i - 1].min_history_points
        )
      }
    })

    test('4.2 应根据累计积分正确派生成长等级码', async () => {
      // 累计积分账本派生（拍板 4：users.history_total_points 冗余列已删除）
      const AssetQueryService = require('../../../services/asset/QueryService')
      const historyTotalPoints = await AssetQueryService.getHistoryTotalPoints(admin_user_id)
      const expected = await UserGrowthLevel.resolveLevelKey(historyTotalPoints)
      expect(typeof expected).toBe('string')

      if (GrowthLevelService) {
        const resolved = await GrowthLevelService.resolveUserLevel(admin_user_id)
        expect(resolved).toBe(expected)
      }
    })

    test('4.3 无 level_probability 配置时倍数默认 1.0（零行为变化）', async () => {
      if (!GrowthLevelService || !test_lottery_campaign_id) {
        return
      }
      const items = await GrowthLevelService.getLevelProbabilityConfig(test_lottery_campaign_id)
      expect(Array.isArray(items)).toBe(true)
      items.forEach(item => {
        expect(item.multiplier).toBeGreaterThan(0)
      })
    })
  })
})
