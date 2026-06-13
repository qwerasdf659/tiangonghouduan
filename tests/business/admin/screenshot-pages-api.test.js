/**
 * 截图页面相关API联动测试
 *
 * @description 验证截图中涉及的管理后台页面API数据联动是否正常
 * 涵盖：资产统计、虚拟交易、材料转换规则、资产类型、抽奖干预
 */

const request = require('supertest')
const app = require('../../../app')
const { loginAs } = require('../../helpers/auth-helper')

const API_BASE = '/api/v4'

describe('截图页面API联动测试', () => {
  let token

  beforeAll(async () => {
    // 🔐 2026-06-14：这些 /console/* 接口需管理员权限，统一用角色契约登录 admin（13612227910）
    token = await loginAs(app, 'admin')
    expect(token).toBeTruthy()
  })

  // ========== 资产管理中心 - 资产统计（截图2） ==========

  describe('资产管理中心 - 资产统计', () => {
    test('GET /console/assets/stats 应返回资产统计概览', async () => {
      const res = await request(app)
        .get(`${API_BASE}/console/assets/stats`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('asset_stats')
      expect(res.body.data).toHaveProperty('summary')
      expect(Array.isArray(res.body.data.asset_stats)).toBe(true)

      const { summary } = res.body.data
      expect(summary).toHaveProperty('total_asset_types')
      expect(summary).toHaveProperty('total_holders')
      expect(summary).toHaveProperty('total_circulation')
      expect(summary).toHaveProperty('total_frozen')
      expect(summary.total_asset_types).toBeGreaterThan(0)
      expect(summary.total_circulation).toBeGreaterThan(0)
    })

    test('每个资产统计项应包含完整字段', async () => {
      const res = await request(app)
        .get(`${API_BASE}/console/assets/stats`)
        .set('Authorization', `Bearer ${token}`)

      const stats = res.body.data.asset_stats
      expect(stats.length).toBeGreaterThan(0)

      for (const stat of stats) {
        expect(stat).toHaveProperty('asset_code')
        expect(stat).toHaveProperty('holder_count')
        expect(stat).toHaveProperty('total_circulation')
        expect(stat).toHaveProperty('total_frozen')
        expect(stat).toHaveProperty('total_issued')
      }
    })
  })

  // ========== 资产管理中心 - 虚拟交易（截图1） ==========

  describe('资产管理中心 - 虚拟交易', () => {
    test('GET /console/assets/transactions 应返回交易流水', async () => {
      const res = await request(app)
        .get(`${API_BASE}/console/assets/transactions`)
        .query({ user_id: 31, page: 1, page_size: 10 })
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('transactions')
      expect(res.body.data).toHaveProperty('pagination')
      expect(Array.isArray(res.body.data.transactions)).toBe(true)
    })

    test('交易记录应包含完整业务字段', async () => {
      const res = await request(app)
        .get(`${API_BASE}/console/assets/transactions`)
        .query({ user_id: 31, page: 1, page_size: 5 })
        .set('Authorization', `Bearer ${token}`)

      if (res.body.data.transactions.length > 0) {
        const tx = res.body.data.transactions[0]
        expect(tx).toHaveProperty('asset_transaction_id')
        expect(tx).toHaveProperty('asset_code')
        expect(tx).toHaveProperty('business_type')
        expect(tx).toHaveProperty('delta_amount')
        expect(tx).toHaveProperty('balance_before')
        expect(tx).toHaveProperty('balance_after')
        expect(tx).toHaveProperty('created_at')
        expect(tx).toHaveProperty('business_type_display')
      }
    })

    test('支持按资产类型筛选', async () => {
      const res = await request(app)
        .get(`${API_BASE}/console/assets/transactions`)
        .query({ user_id: 31, asset_code: 'star_stone', page: 1, page_size: 5 })
        .set('Authorization', `Bearer ${token}`)

      expect(res.body.success).toBe(true)
      if (res.body.data.transactions.length > 0) {
        res.body.data.transactions.forEach(tx => {
          expect(tx.asset_code).toBe('star_stone')
        })
      }
    })
  })

  // ========== 材料转换规则管理 - 转换规则（截图3） ==========

  describe('材料转换规则管理 - 转换规则', () => {
    test('GET /console/material/conversion-rules 应返回规则列表', async () => {
      const res = await request(app)
        .get(`${API_BASE}/console/assets/conversion-rules`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('rules')
      expect(Array.isArray(res.body.data.rules)).toBe(true)
    })

    test('转换规则应包含完整业务字段', async () => {
      const res = await request(app)
        .get(`${API_BASE}/console/assets/conversion-rules`)
        .set('Authorization', `Bearer ${token}`)

      if (res.body.data.rules.length > 0) {
        const rule = res.body.data.rules[0]
        expect(rule).toHaveProperty('conversion_rule_id')
        expect(rule).toHaveProperty('from_asset_code')
        expect(rule).toHaveProperty('to_asset_code')
        expect(rule).toHaveProperty('rate_numerator')
        expect(rule).toHaveProperty('rate_denominator')
        expect(rule).toHaveProperty('status')
      }
    })
  })

  // ========== 材料转换规则管理 - 资产类型（截图4） ==========

  describe('材料转换规则管理 - 资产类型', () => {
    test('GET /console/material/asset-types 应返回资产类型列表', async () => {
      const res = await request(app)
        .get(`${API_BASE}/console/material/asset-types`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('asset_types')
      expect(Array.isArray(res.body.data.asset_types)).toBe(true)
      expect(res.body.data.asset_types.length).toBeGreaterThan(0)
    })

    test('资产类型应包含完整展示字段', async () => {
      const res = await request(app)
        .get(`${API_BASE}/console/material/asset-types`)
        .set('Authorization', `Bearer ${token}`)

      for (const type of res.body.data.asset_types) {
        expect(type).toHaveProperty('asset_code')
        expect(type).toHaveProperty('display_name')
        expect(type).toHaveProperty('group_code')
        expect(type).toHaveProperty('form')
        expect(type).toHaveProperty('tier')
        expect(type).toHaveProperty('is_enabled')
      }
    })

    test('应包含所有颜色组的材料类型', async () => {
      const res = await request(app)
        .get(`${API_BASE}/console/material/asset-types`)
        .set('Authorization', `Bearer ${token}`)

      const types = res.body.data.asset_types
      const groupCodes = [...new Set(types.map(t => t.group_code))]
      const materialGroups = groupCodes.filter(g => !['points', 'currency'].includes(g))

      expect(materialGroups.length).toBeGreaterThanOrEqual(5)
    })
  })

  // ========== 抽奖成长等级公示分级概率（截图5：per-user 暗箱干预已合规下线，B 线替代） ==========

  describe('抽奖成长等级公示分级概率', () => {
    test('GET /console/lottery-management/growth-levels 应返回成长等级阶梯', async () => {
      const res = await request(app)
        .get(`${API_BASE}/console/lottery-management/growth-levels`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('levels')
      expect(Array.isArray(res.body.data.levels)).toBe(true)
      expect(res.body.data.levels.length).toBeGreaterThan(0)
    })

    test('成长等级记录应包含等级码、名称与门槛字段', async () => {
      const res = await request(app)
        .get(`${API_BASE}/console/lottery-management/growth-levels`)
        .set('Authorization', `Bearer ${token}`)

      const { levels } = res.body.data
      for (const level of levels) {
        expect(level).toHaveProperty('user_growth_level_id')
        expect(level).toHaveProperty('level_key')
        expect(level).toHaveProperty('level_name')
        expect(level).toHaveProperty('min_history_points')
        expect(level).toHaveProperty('sort_order')
        expect(level).toHaveProperty('status')
      }
    })

    test('GET /console/lottery-management/level-probability/:lottery_campaign_id 应返回各等级中奖率倍数', async () => {
      const campaignRes = await request(app)
        .get(`${API_BASE}/console/lottery-campaigns`)
        .query({ page: 1, page_size: 1, status: 'active' })
        .set('Authorization', `Bearer ${token}`)

      const campaignList =
        campaignRes.body?.data?.campaigns || campaignRes.body?.data?.list || []
      if (campaignList.length === 0) {
        return
      }
      const lottery_campaign_id = campaignList[0].lottery_campaign_id

      const res = await request(app)
        .get(`${API_BASE}/console/lottery-management/level-probability/${lottery_campaign_id}`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('lottery_campaign_id', lottery_campaign_id)
      expect(res.body.data).toHaveProperty('items')
      expect(Array.isArray(res.body.data.items)).toBe(true)
      for (const item of res.body.data.items) {
        expect(item).toHaveProperty('level_key')
        expect(item).toHaveProperty('multiplier')
        expect(typeof item.multiplier).toBe('number')
      }
    })

    test('非法活动ID应返回 400 INVALID_CAMPAIGN_ID', async () => {
      const res = await request(app)
        .get(`${API_BASE}/console/lottery-management/level-probability/0`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.code).toBe('INVALID_CAMPAIGN_ID')
    })
  })

  // ========== 物品模板管理 ==========

  describe('物品模板管理', () => {
    test('GET /console/item-templates 应返回模板列表', async () => {
      const res = await request(app)
        .get(`${API_BASE}/console/item-templates`)
        .query({ page: 1, page_size: 10 })
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('list')
      expect(res.body.data).toHaveProperty('pagination')
    })

    test('GET /console/item-templates/stats 应返回模板统计', async () => {
      const res = await request(app)
        .get(`${API_BASE}/console/item-templates/stats`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('total')
      expect(res.body.data).toHaveProperty('enabled_count')
      expect(res.body.data).toHaveProperty('item_type_count')
      expect(res.body.data).toHaveProperty('type_distribution')
      expect(res.body.data).toHaveProperty('rarity_distribution')
      expect(res.body.data.total).toBeGreaterThan(0)
    })
  })

  // ========== 物品管理 ==========

  describe('物品管理', () => {
    test('GET /console/items 应返回物品列表', async () => {
      const res = await request(app)
        .get(`${API_BASE}/console/items`)
        .query({ page: 1, page_size: 10 })
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('list')
    })
  })

  // ========== 用户余额与资产组合 ==========

  describe('用户余额与资产组合', () => {
    test('GET /console/asset-adjustment/user/31/balances 应返回用户余额', async () => {
      const res = await request(app)
        .get(`${API_BASE}/console/asset-adjustment/user/31/balances`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('user')
      expect(res.body.data).toHaveProperty('balances')
      expect(res.body.data.user.user_id).toBe(31)
    })

    test('GET /console/assets/portfolio 应返回当前用户资产组合', async () => {
      const res = await request(app)
        .get(`${API_BASE}/console/assets/portfolio`)
        .set('Authorization', `Bearer ${token}`)

      expect([200, 400]).toContain(res.status)

      if (res.status === 200) {
        expect(res.body.success).toBe(true)
        expect(res.body.data).toHaveProperty('user_id')
        expect(res.body.data).toHaveProperty('points')
        expect(res.body.data).toHaveProperty('fungible_assets')
      }
    })
  })

  // ========== 资产调整类型列表 ==========

  describe('资产调整类型', () => {
    test('GET /console/asset-adjustment/asset-types 应返回完整类型列表', async () => {
      const res = await request(app)
        .get(`${API_BASE}/console/asset-adjustment/asset-types`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('asset_types')
      expect(res.body.data.asset_types.length).toBeGreaterThan(0)

      const codes = res.body.data.asset_types.map(t => t.asset_code)
      expect(codes).toContain('points')
      expect(codes).toContain('star_stone')
    })
  })
})
