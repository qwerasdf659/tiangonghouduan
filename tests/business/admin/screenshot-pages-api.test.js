/**
 * 截图页面相关API联动测试
 *
 * @description 验证截图中涉及的管理后台页面API数据联动是否正常
 * 涵盖：资产统计、虚拟交易、材料转换规则、资产类型、抽奖干预
 */

const request = require('supertest')
const app = require('../../../app')
const { getTestUserToken } = require('../../helpers/auth-helper')

const API_BASE = '/api/v4'

describe('截图页面API联动测试', () => {
  let token

  beforeAll(async () => {
    token = await getTestUserToken(app)
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
        expect(tx).toHaveProperty('tx_type')
        expect(tx).toHaveProperty('delta_amount')
        expect(tx).toHaveProperty('balance_before')
        expect(tx).toHaveProperty('balance_after')
        expect(tx).toHaveProperty('created_at')
        expect(tx).toHaveProperty('tx_type_display')
      }
    })

    test('支持按资产类型筛选', async () => {
      const res = await request(app)
        .get(`${API_BASE}/console/assets/transactions`)
        .query({ user_id: 31, asset_code: 'DIAMOND', page: 1, page_size: 5 })
        .set('Authorization', `Bearer ${token}`)

      expect(res.body.success).toBe(true)
      if (res.body.data.transactions.length > 0) {
        res.body.data.transactions.forEach(tx => {
          expect(tx.asset_code).toBe('DIAMOND')
        })
      }
    })
  })

  // ========== 材料转换规则管理 - 转换规则（截图3） ==========

  describe('材料转换规则管理 - 转换规则', () => {
    test('GET /console/material/conversion-rules 应返回规则列表', async () => {
      const res = await request(app)
        .get(`${API_BASE}/console/material/conversion-rules`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('rules')
      expect(res.body.data).toHaveProperty('pagination')
      expect(Array.isArray(res.body.data.rules)).toBe(true)
    })

    test('转换规则应包含完整业务字段', async () => {
      const res = await request(app)
        .get(`${API_BASE}/console/material/conversion-rules`)
        .set('Authorization', `Bearer ${token}`)

      if (res.body.data.rules.length > 0) {
        const rule = res.body.data.rules[0]
        expect(rule).toHaveProperty('material_conversion_rule_id')
        expect(rule).toHaveProperty('from_asset_code')
        expect(rule).toHaveProperty('to_asset_code')
        expect(rule).toHaveProperty('from_amount')
        expect(rule).toHaveProperty('to_amount')
        expect(rule).toHaveProperty('effective_at')
        expect(rule).toHaveProperty('is_enabled')
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

  // ========== 抽奖干预管理（截图5） ==========

  describe('抽奖干预管理', () => {
    test('GET /console/lottery-management/interventions 应返回干预列表', async () => {
      const res = await request(app)
        .get(`${API_BASE}/console/lottery-management/interventions`)
        .query({ page: 1, page_size: 10 })
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('interventions')
      expect(res.body.data).toHaveProperty('pagination')
      expect(Array.isArray(res.body.data.interventions)).toBe(true)
    })

    test('干预记录应包含用户信息和状态显示', async () => {
      const res = await request(app)
        .get(`${API_BASE}/console/lottery-management/interventions`)
        .query({ page: 1, page_size: 5 })
        .set('Authorization', `Bearer ${token}`)

      if (res.body.data.interventions.length > 0) {
        const item = res.body.data.interventions[0]
        expect(item).toHaveProperty('setting_id')
        expect(item).toHaveProperty('user_id')
        expect(item).toHaveProperty('user_info')
        expect(item.user_info).toHaveProperty('nickname')
        expect(item).toHaveProperty('status_display')
        expect(item).toHaveProperty('setting_type_display')
      }
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
      expect(res.body.data).toHaveProperty('total_count')
      expect(res.body.data).toHaveProperty('enabled_count')
      expect(res.body.data).toHaveProperty('item_type_count')
      expect(res.body.data).toHaveProperty('type_distribution')
      expect(res.body.data).toHaveProperty('rarity_distribution')
      expect(res.body.data.total_count).toBeGreaterThan(0)
    })
  })

  // ========== 物品实例管理 ==========

  describe('物品实例管理', () => {
    test('GET /console/item-instances 应返回实例列表', async () => {
      const res = await request(app)
        .get(`${API_BASE}/console/item-instances`)
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

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data).toHaveProperty('user_id')
      expect(res.body.data).toHaveProperty('points')
      expect(res.body.data).toHaveProperty('fungible_assets')
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
      expect(codes).toContain('POINTS')
      expect(codes).toContain('DIAMOND')
    })
  })
})
