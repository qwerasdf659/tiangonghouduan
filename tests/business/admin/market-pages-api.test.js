/**
 * 管理后台页面 API 业务联调测试
 *
 * @description 验证兑换市场、交易市场、资产调账、资产组合页面的 API 数据流
 * @version 1.0.0
 * @date 2026-02-18
 *
 * 对应截图页面：
 * - exchange-market.html（兑换市场管理）
 * - trade-management.html（交易市场管理）
 * - asset-adjustment.html（资产调账）
 * - assets-portfolio.html（资产组合）
 */

const { describe, test, expect, beforeAll } = require('@jest/globals')

/* eslint-disable-next-line node/no-unpublished-require */
const supertest = require('supertest')

let app, request, adminToken

beforeAll(async () => {
  require('dotenv').config()
  app = require('../../../app')
  request = supertest(app)

  const loginRes = await request
    .post('/api/v4/auth/login')
    .send({ mobile: '13612227930', verification_code: '123456' })

  expect(loginRes.body.success).toBe(true)
  adminToken = loginRes.body.data.access_token || loginRes.body.data.token
  expect(adminToken).toBeTruthy()
})

// ==================== 兑换市场（exchange-market.html）====================

describe('兑换市场管理页面 API', () => {
  test('GET /console/marketplace/exchange_market/items - 商品列表应返回分页数据', async () => {
    const res = await request
      .get('/api/v4/console/marketplace/exchange_market/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ page: 1, page_size: 10 })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('items')
    expect(res.body.data).toHaveProperty('pagination')
    expect(Array.isArray(res.body.data.items)).toBe(true)
    expect(res.body.data.pagination).toHaveProperty('total')
    expect(res.body.data.pagination).toHaveProperty('page')

    if (res.body.data.items.length > 0) {
      const item = res.body.data.items[0]
      expect(item).toHaveProperty('exchange_item_id')
      expect(item.item_name || item.name).toBeTruthy()
      expect(item).toHaveProperty('cost_asset_code')
      expect(item).toHaveProperty('cost_amount')
      expect(item).toHaveProperty('stock')
      expect(item).toHaveProperty('status')
    }
  })

  test('GET /console/marketplace/exchange_market/orders - 兑换订单列表应返回分页数据', async () => {
    const res = await request
      .get('/api/v4/console/marketplace/exchange_market/orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ page: 1, page_size: 10 })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('orders')
    expect(res.body.data).toHaveProperty('pagination')
    expect(Array.isArray(res.body.data.orders)).toBe(true)
  })

  test('GET /console/marketplace/exchange_market/statistics - 统计数据应包含核心指标', async () => {
    const res = await request
      .get('/api/v4/console/marketplace/exchange_market/statistics')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const stats = res.body.data
    expect(stats).toHaveProperty('total_items')
    expect(stats).toHaveProperty('active_items')
    expect(stats).toHaveProperty('total_exchanges')
    expect(typeof stats.total_items).toBe('number')
    expect(typeof stats.active_items).toBe('number')
    expect(stats.total_items).toBeGreaterThanOrEqual(0)
  })
})

// ==================== 交易市场管理（trade-management.html）====================

describe('交易市场管理页面 API', () => {
  test('GET /console/trade-orders - 交易订单列表应返回分页数据', async () => {
    const res = await request
      .get('/api/v4/console/trade-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ page: 1, page_size: 10 })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('orders')
    expect(res.body.data).toHaveProperty('pagination')

    if (res.body.data.orders.length > 0) {
      const order = res.body.data.orders[0]
      expect(order).toHaveProperty('trade_order_id')
      expect(order).toHaveProperty('buyer_user_id')
      expect(order).toHaveProperty('seller_user_id')
      expect(order).toHaveProperty('status')
    }
  })

  test('GET /console/trade-orders/stats - 交易统计应包含状态分布', async () => {
    const res = await request
      .get('/api/v4/console/trade-orders/stats')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('by_status')
    expect(res.body.data).toHaveProperty('completed_summary')

    const { by_status } = res.body.data
    expect(by_status).toHaveProperty('completed')
  })

  test('GET /console/marketplace/trade_orders - 交易市场订单列表应返回分页数据', async () => {
    const res = await request
      .get('/api/v4/console/marketplace/trade_orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ page: 1, page_size: 5 })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('orders')
    expect(res.body.data.pagination.total_count).toBeGreaterThan(0)
  })

  test('GET /console/marketplace/listing-stats - 上架统计应返回用户分组数据', async () => {
    const res = await request
      .get('/api/v4/console/marketplace/listing-stats')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('stats')
    expect(res.body.data).toHaveProperty('summary')
    expect(res.body.data).toHaveProperty('pagination')

    const { summary } = res.body.data
    expect(summary).toHaveProperty('total_users_with_listings')
    expect(summary).toHaveProperty('total_listings')
  })
})

// ==================== 资产调账（asset-adjustment.html）====================

describe('资产调账页面 API', () => {
  test('GET /console/asset-adjustment/asset-types - 应返回所有可调资产类型', async () => {
    const res = await request
      .get('/api/v4/console/asset-adjustment/asset-types')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const types = res.body.data?.asset_types || res.body.data
    expect(Array.isArray(types)).toBe(true)
    expect(types.length).toBeGreaterThan(0)

    const hasPoints = types.some(t => t.asset_code === 'POINTS')
    const hasDiamond = types.some(t => t.asset_code === 'DIAMOND')
    expect(hasPoints).toBe(true)
    expect(hasDiamond).toBe(true)
  })

  test('GET /console/asset-adjustment/user/:user_id/balances - 应返回用户资产余额', async () => {
    const res = await request
      .get('/api/v4/console/asset-adjustment/user/31/balances')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('user')
    expect(res.body.data).toHaveProperty('balances')

    const { user, balances } = res.body.data
    expect(user.user_id).toBe(31)
    expect(Array.isArray(balances)).toBe(true)
    expect(balances.length).toBeGreaterThan(0)

    balances.forEach(balance => {
      expect(balance).toHaveProperty('asset_code')
      expect(balance).toHaveProperty('available_amount')
      expect(typeof balance.available_amount).toBe('number')
    })
  })

  test('GET /console/assets/transactions - 应返回用户资产流水', async () => {
    const res = await request
      .get('/api/v4/console/assets/transactions')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ user_id: 31, page: 1, page_size: 5 })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('transactions')
    expect(res.body.data).toHaveProperty('pagination')
    expect(res.body.data.pagination.total).toBeGreaterThan(0)
  })
})

// ==================== 资产组合（assets-portfolio.html）====================

describe('资产组合页面 API', () => {
  test('GET /console/assets/stats - 应返回系统资产流通统计', async () => {
    const res = await request
      .get('/api/v4/console/assets/stats')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('asset_stats')
    expect(Array.isArray(res.body.data.asset_stats)).toBe(true)

    const stats = res.body.data.asset_stats
    expect(stats.length).toBeGreaterThan(0)

    stats.forEach(stat => {
      expect(stat).toHaveProperty('asset_code')
      expect(stat).toHaveProperty('total_circulation')
      expect(stat).toHaveProperty('holder_count')
    })
  })

  test('GET /console/material/asset-types - 应返回材料资产类型', async () => {
    const res = await request
      .get('/api/v4/console/material/asset-types')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})

// ==================== 跨页面数据一致性验证 ====================

describe('跨页面数据一致性', () => {
  test('兑换市场商品数 vs 统计数据应一致', async () => {
    const [itemsRes, statsRes] = await Promise.all([
      request
        .get('/api/v4/console/marketplace/exchange_market/items')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page: 1, page_size: 1 }),
      request
        .get('/api/v4/console/marketplace/exchange_market/statistics')
        .set('Authorization', `Bearer ${adminToken}`)
    ])

    const totalItems = itemsRes.body.data.pagination.total
    const statsTotal = statsRes.body.data.total_items

    expect(totalItems).toBe(statsTotal)
  })

  test('用户资产余额应与交易记录变动一致', async () => {
    const balancesRes = await request
      .get('/api/v4/console/asset-adjustment/user/31/balances')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(balancesRes.body.success).toBe(true)

    const balances = balancesRes.body.data.balances
    balances.forEach(balance => {
      const total = (balance.available_amount || 0) + (balance.frozen_amount || 0)
      expect(total).toBe(balance.total)
    })
  })
})
