/**
 * 首页 BFF 聚合接口 API 契约测试
 *
 * 测试范围：
 * - GET /api/v4/home/bootstrap（公开只读聚合 - 契约格式 + 三段数据结构 + 匿名可访问）
 *
 * 业务背景（限流议题A·治理项2）：冷启动首屏一次性聚合 活动列表 + 位置配置 + 版本闸门，
 * 把"多个并行请求"变"单请求"，从源头削并发峰值，降低 429。
 *
 * 真实数据：连真实库 restaurant_points_dev，匿名 + 真实账号 13612227910/123456 两种场景都验证，
 * 不使用 mock/硬编码。
 *
 * @date 2026-06-12
 */

const request = require('supertest')
const { sequelize } = require('../../models')

let app
let accessToken

jest.setTimeout(30000)

describe('API契约测试 - 首页 BFF 聚合（/api/v4/home/bootstrap）', () => {
  beforeAll(async () => {
    app = require('../../app')
    await sequelize.authenticate()

    const loginResponse = await request(app)
      .post('/api/v4/auth/login')
      .send({ mobile: '13612227910', verification_code: '123456' })

    if (loginResponse.body.success) {
      accessToken = loginResponse.body.data.access_token
    }
  })

  afterAll(async () => {
    await sequelize.close()
  })

  function validateApiContract(body, expectSuccess = true) {
    expect(body).toHaveProperty('success')
    expect(body).toHaveProperty('code')
    expect(body).toHaveProperty('message')
    expect(body).toHaveProperty('data')
    expect(body).toHaveProperty('timestamp')
    expect(body).toHaveProperty('version')
    expect(body).toHaveProperty('request_id')

    expect(typeof body.success).toBe('boolean')
    expect(typeof body.code).toBe('string')
    expect(typeof body.message).toBe('string')

    if (expectSuccess) {
      expect(body.success).toBe(true)
    }
  }

  describe('GET /api/v4/home/bootstrap - 公开聚合（契约）', () => {
    test('匿名（未登录）也应返回 200 + 标准契约 + 三段聚合结构', async () => {
      const response = await request(app).get('/api/v4/home/bootstrap')

      expect(response.status).toBe(200)
      validateApiContract(response.body)
      expect(response.body.code).toBe('HOME_BOOTSTRAP_SUCCESS')

      const { data } = response.body
      // 三段聚合：活动列表 + 位置配置 + 版本闸门 + 服务端时间
      expect(Array.isArray(data.campaigns)).toBe(true)
      expect(data).toHaveProperty('placement')
      expect(Array.isArray(data.placement.placements)).toBe(true)
      expect(data.placement).toHaveProperty('version')
      expect(data).toHaveProperty('app_version')
      expect(data.app_version).toHaveProperty('min_version')
      expect(typeof data.app_version.force_update).toBe('boolean')
      expect(data).toHaveProperty('server_time')
    })

    test('登录态也应返回 200 + 同样的聚合结构', async () => {
      if (!accessToken) return

      const response = await request(app)
        .get('/api/v4/home/bootstrap')
        .set('Authorization', `Bearer ${accessToken}`)

      expect(response.status).toBe(200)
      validateApiContract(response.body)
      expect(response.body.code).toBe('HOME_BOOTSTRAP_SUCCESS')
      expect(Array.isArray(response.body.data.campaigns)).toBe(true)
    })

    test('campaigns 字段结构应与 GET /lottery/campaigns/active 一致（前端契约统一）', async () => {
      const bootstrap = await request(app).get('/api/v4/home/bootstrap')
      const standalone = await request(app).get('/api/v4/lottery/campaigns/active')

      // 两接口活动数量应一致（同源 lottery_query.getActiveCampaigns）
      expect(bootstrap.body.data.campaigns.length).toBe(standalone.body.data.length)

      // 若有活动，校验字段结构一致（取首个对比 key 集合）
      if (bootstrap.body.data.campaigns.length > 0) {
        const bKeys = Object.keys(bootstrap.body.data.campaigns[0]).sort()
        const sKeys = Object.keys(standalone.body.data[0]).sort()
        expect(bKeys).toEqual(sKeys)
      }
    })
  })
})
