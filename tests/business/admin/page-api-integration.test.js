/**
 * 管理后台页面 API 集成测试
 *
 * @file tests/business/admin/page-api-integration.test.js
 * @description 验证截图中各管理页面对应的后端 API 是否正常返回数据
 *
 * 覆盖页面：
 * 1. 物配管理（资产总览） - assets-portfolio
 * 2. 数据统计报表 - statistics
 * 3. 抽奖管理（活动/奖品/预算） - lottery-management
 */

const { describe, test, expect, beforeAll } = require('@jest/globals')
const request = require('supertest')

// 加载环境变量
require('dotenv').config()

const app = require('../../../app')

let adminToken = ''

beforeAll(async () => {
  // 使用测试账号登录获取 token
  const loginRes = await request(app)
    .post('/api/v4/auth/login')
    .send({ mobile: '13612227930', verification_code: '123456' })

  expect(loginRes.status).toBe(200)
  expect(loginRes.body.success).toBe(true)
  adminToken = loginRes.body.data?.access_token || loginRes.body.data?.token
  expect(adminToken).toBeTruthy()
})

describe('📊 数据统计报表页面 API', () => {
  test('GET /api/v4/system/statistics/charts - 统计图表数据应包含所有维度', async () => {
    const res = await request(app)
      .get('/api/v4/system/statistics/charts?days=7')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const data = res.body.data
    // 用户增长趋势
    expect(data.user_growth).toBeDefined()
    expect(Array.isArray(data.user_growth)).toBe(true)
    expect(data.user_growth.length).toBeGreaterThan(0)

    // 用户类型分布
    expect(data.user_types).toBeDefined()
    expect(data.user_types.total).toBeGreaterThan(0)

    // 抽奖趋势
    expect(data.lottery_trend).toBeDefined()
    expect(Array.isArray(data.lottery_trend)).toBe(true)

    // 消费趋势
    expect(data.consumption_trend).toBeDefined()

    // 积分流水
    expect(data.points_flow).toBeDefined()

    // 热门奖品
    expect(data.top_prizes).toBeDefined()

    // 活跃时段
    expect(data.active_hours).toBeDefined()
    expect(data.active_hours.length).toBe(24)
  })

  test('GET /api/v4/console/system/dashboard - 运营看板应返回实时数据', async () => {
    const res = await request(app)
      .get('/api/v4/console/system/dashboard')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const data = res.body.data
    expect(data.overview).toBeDefined()
    expect(data.overview.total_users).toBeGreaterThan(0)
    expect(data.overview.total_lotteries).toBeGreaterThan(0)
    expect(data.today).toBeDefined()
  })

  test('GET /api/v4/console/analytics/stats/today - 今日统计应有有效数据', async () => {
    const res = await request(app)
      .get('/api/v4/console/analytics/stats/today')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const data = res.body.data
    expect(data.user_stats).toBeDefined()
    expect(data.user_stats.total_users).toBeGreaterThan(0)
    expect(data.lottery_stats).toBeDefined()
    expect(data.points_stats).toBeDefined()
  })
})

describe('🎰 抽奖管理页面 API（活动/奖品/预算 Tab）', () => {
  test('GET /api/v4/console/lottery-campaigns - 活动列表应返回活动数据', async () => {
    const res = await request(app)
      .get('/api/v4/console/lottery-campaigns?page=1&page_size=10')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const campaigns = res.body.data.campaigns
    expect(Array.isArray(campaigns)).toBe(true)
    expect(campaigns.length).toBeGreaterThan(0)

    // 验证活动字段完整性
    const campaign = campaigns[0]
    expect(campaign.lottery_campaign_id).toBeDefined()
    expect(campaign.campaign_name).toBeDefined()
    expect(campaign.status).toBeDefined()
    expect(campaign.budget_mode).toBeDefined()
  })

  test('GET /api/v4/console/lottery/stats - 抽奖统计概览', async () => {
    const res = await request(app)
      .get('/api/v4/console/lottery/stats')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const data = res.body.data
    expect(data.total_draws).toBeGreaterThan(0)
    expect(data.total_wins).toBeGreaterThan(0)
    expect(data.win_rate).toBeDefined()
  })

  test('GET /api/v4/console/prize-pool/BASIC_LOTTERY - 奖品池应有奖品数据', async () => {
    const res = await request(app)
      .get('/api/v4/console/prize-pool/BASIC_LOTTERY')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const data = res.body.data
    expect(data.campaign).toBeDefined()
    expect(data.statistics).toBeDefined()
    expect(data.statistics.total_prizes).toBeGreaterThan(0)

    expect(data.prizes).toBeDefined()
    expect(Array.isArray(data.prizes)).toBe(true)
    expect(data.prizes.length).toBeGreaterThan(0)

    // 验证奖品字段完整性
    const prize = data.prizes[0]
    expect(prize.lottery_prize_id).toBeDefined()
    expect(prize.prize_name).toBeDefined()
    expect(prize.prize_type).toBeDefined()
    expect(prize.stock_quantity).toBeDefined()
    expect(prize.status).toBeDefined()
  })

  test('GET /api/v4/console/campaign-budget/campaigns/1 - 活动预算配置', async () => {
    const res = await request(app)
      .get('/api/v4/console/campaign-budget/campaigns/1')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const data = res.body.data
    expect(data.campaign).toBeDefined()
    expect(data.campaign.budget_mode).toBeDefined()
    expect(data.prize_config).toBeDefined()
  })

  test('GET /api/v4/console/lottery-realtime/stats - 实时监控统计', async () => {
    const res = await request(app)
      .get('/api/v4/console/lottery-realtime/stats?time_range=today')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const data = res.body.data
    expect(data.total_draws).toBeDefined()
    expect(data.unique_users).toBeDefined()
    expect(data.win_rate).toBeDefined()
  })
})

describe('💰 资产管理页面 API', () => {
  test('GET /api/v4/console/assets/stats - 资产统计概览', async () => {
    const res = await request(app)
      .get('/api/v4/console/assets/stats')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const data = res.body.data
    expect(data.asset_stats).toBeDefined()
    expect(Array.isArray(data.asset_stats)).toBe(true)
    expect(data.asset_stats.length).toBeGreaterThan(0)

    expect(data.summary).toBeDefined()
    expect(data.summary.total_asset_types).toBeGreaterThan(0)
  })

  test('GET /api/v4/console/assets/portfolio - 资产总览（当前管理员）', async () => {
    const res = await request(app)
      .get('/api/v4/console/assets/portfolio')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const data = res.body.data
    expect(data.points).toBeDefined()
    expect(data.fungible_assets).toBeDefined()
    expect(Array.isArray(data.fungible_assets)).toBe(true)
  })

  test('GET /api/v4/console/assets/transactions - 资产流水记录（需要user_id）', async () => {
    const res = await request(app)
      .get('/api/v4/console/assets/transactions?page=1&page_size=5&user_id=31')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  test('GET /api/v4/console/asset-adjustment/asset-types - 可调整资产类型列表', async () => {
    const res = await request(app)
      .get('/api/v4/console/asset-adjustment/asset-types')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const data = res.body.data
    expect(Array.isArray(data.asset_types || data)).toBe(true)
  })
})

describe('📈 抽奖统计趋势 API', () => {
  test('GET /api/v4/console/lottery-statistics/hourly - 小时级统计指标', async () => {
    const res = await request(app)
      .get('/api/v4/console/lottery-statistics/hourly')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const data = res.body.data
    expect(data.metrics).toBeDefined()
    expect(Array.isArray(data.metrics)).toBe(true)
  })

  test('GET /api/v4/console/analytics/lottery/trends - 抽奖趋势分析', async () => {
    const res = await request(app)
      .get('/api/v4/console/analytics/lottery/trends')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const data = res.body.data
    expect(data.lottery_activity).toBeDefined()
    expect(data.summary).toBeDefined()
  })
})
