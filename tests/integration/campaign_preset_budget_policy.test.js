/**
 * Console 活动预设预算扣减策略配置管理（preset_budget_policy）集成测试
 *
 * 业务目标：
 * - 管理员可以通过 Console 管理端 API 更新 lottery_campaigns.preset_budget_policy
 * - 读取活动预算配置接口会返回最新的 preset_budget_policy
 *
 * 测试约束（与项目规范一致）：
 * - 使用真实数据库 restaurant_points_dev（由 jest.setup.js 从 .env 读取 DB_NAME）
 * - 不使用 mock 数据
 * - 测试环境万能验证码：123456（仅开发/测试环境启用）
 *
 * API 契约：
 * - GET  /api/v4/console/campaign-budget/campaigns/:lottery_campaign_id
 * - PUT  /api/v4/console/campaign-budget/campaigns/:lottery_campaign_id
 */

'use strict'

const request = require('supertest')
const app = require('../../app')
const { loginAsAdmin } = require('../helpers/auth-helper')
const { TEST_DATA } = require('../helpers/test-data')
const { TestAssertions } = require('../helpers/test-setup')

describe('🛠️ Console 活动预设预算策略配置管理（preset_budget_policy）', () => {
  let admin_token = null
  let lottery_campaign_id = null
  let original_policy = null

  beforeAll(async () => {
    lottery_campaign_id = TEST_DATA.lottery.testCampaign.lottery_campaign_id

    if (!lottery_campaign_id) {
      console.warn('⚠️ 未获取到测试活动 lottery_campaign_id，跳过 preset_budget_policy 集成测试')
      return
    }

    admin_token = await loginAsAdmin(app)
  })

  afterAll(async () => {
    // ✅ 恢复原始配置，避免污染共享 dev 数据库（restaurant_points_dev）
    if (!admin_token || !lottery_campaign_id || !original_policy) {
      return
    }

    try {
      await request(app)
        .put(`/api/v4/console/campaign-budget/campaigns/${lottery_campaign_id}`)
        .set('Authorization', `Bearer ${admin_token}`)
        .send({ preset_budget_policy: original_policy })
    } catch (error) {
      // 非致命：恢复失败不应阻断测试结束
      console.warn('⚠️ 恢复 preset_budget_policy 失败（可忽略）:', error.message)
    }
  })

  test('管理员可以更新并读取 preset_budget_policy（字段真源：lottery_campaigns.preset_budget_policy）', async () => {
    if (!admin_token || !lottery_campaign_id) {
      // 允许在缺少测试活动时跳过（与项目其他测试一致）
      expect(true).toBe(true)
      return
    }

    // 1) 读取当前配置（作为回滚基线）
    const get_before = await request(app)
      .get(`/api/v4/console/campaign-budget/campaigns/${lottery_campaign_id}`)
      .set('Authorization', `Bearer ${admin_token}`)
      .expect(200)

    TestAssertions.validateApiResponse(get_before.body, true)

    const current_policy = get_before.body.data?.campaign?.preset_budget_policy
    expect(current_policy).toBeDefined()
    expect(['follow_campaign', 'pool_first', 'user_first']).toContain(current_policy)
    original_policy = current_policy

    // 2) 更新为另一个合法策略（避免“写入同值”导致 updated_fields 为空）
    const target_policy = current_policy === 'pool_first' ? 'user_first' : 'pool_first'

    const update_res = await request(app)
      .put(`/api/v4/console/campaign-budget/campaigns/${lottery_campaign_id}`)
      .set('Authorization', `Bearer ${admin_token}`)
      .send({ preset_budget_policy: target_policy })
      .expect(200)

    TestAssertions.validateApiResponse(update_res.body, true)

    // ✅ 业务标准：返回 updated_fields + current_config
    expect(update_res.body.data).toHaveProperty('updated_fields')
    expect(Array.isArray(update_res.body.data.updated_fields)).toBe(true)
    expect(update_res.body.data.updated_fields).toContain('preset_budget_policy')

    expect(update_res.body.data).toHaveProperty('current_config')
    expect(update_res.body.data.current_config).toHaveProperty('preset_budget_policy')
    expect(update_res.body.data.current_config.preset_budget_policy).toBe(target_policy)

    // 3) 再次读取，验证数据库落库已生效
    const get_after = await request(app)
      .get(`/api/v4/console/campaign-budget/campaigns/${lottery_campaign_id}`)
      .set('Authorization', `Bearer ${admin_token}`)
      .expect(200)

    TestAssertions.validateApiResponse(get_after.body, true)
    expect(get_after.body.data?.campaign?.preset_budget_policy).toBe(target_policy)

    /*
     * preset_debt_enabled 已迁移到 lottery_strategy_config.preset.debt_enabled
     * 通过 GET /api/v4/console/lottery-campaigns/:id/strategy-config 查看
     */
  })
})
