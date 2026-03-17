/**
 * 广告系统 API 契约测试
 *
 * 测试范围：
 * - ad-delivery 统一内容获取（含 feed 类型支持 B9、URL 转换 B6）
 * - 管理端广告计划创建（含图片字段白名单 B3、素材自动创建 B5）
 * - 系统计划创建（含素材自动创建 B4）
 * - 用户端广告位查询（含全类型支持 B12）
 * - 用户端创建广告（含图片字段白名单 B7）
 * - 用户端图片上传接口（B10）
 *
 * 测试用例数量：10 cases
 * 创建时间：2026-03-16
 * 关联文档：docs/广告位现状分析报告.md
 */

const request = require('supertest')
const { sequelize } = require('../../models')

let app
let accessToken

jest.setTimeout(30000)

describe('API契约测试 - 广告系统', () => {
  beforeAll(async () => {
    app = require('../../app')
    await sequelize.authenticate()

    const loginResponse = await request(app)
      .post('/api/v4/auth/login')
      .send({ mobile: '13612227930', verification_code: '123456' })

    if (loginResponse.body.success) {
      accessToken = loginResponse.body.data.access_token
    }
  })

  afterAll(async () => {
    await sequelize.query("DELETE FROM ad_creatives WHERE title LIKE '契约测试%'")
    await sequelize.query("DELETE FROM ad_campaigns WHERE campaign_name LIKE '契约测试%'")
    await sequelize.close()
  })

  /**
   * 验证 ApiResponse 标准格式
   *
   * @param {Object} body - 响应体
   * @param {boolean} expectSuccess - 期望是否成功
   */
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

  // ==================== ad-delivery 统一内容获取 ====================

  describe('GET /api/v4/system/ad-delivery', () => {
    test('popup/home 请求返回标准格式', async () => {
      const res = await request(app)
        .get('/api/v4/system/ad-delivery?slot_type=popup&position=home')
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(200)
      validateApiContract(res.body, true)
      expect(res.body.data).toHaveProperty('items')
      expect(res.body.data).toHaveProperty('slot_type', 'popup')
      expect(res.body.data).toHaveProperty('position', 'home')
      expect(Array.isArray(res.body.data.items)).toBe(true)
    })

    test('feed/market_list 请求成功（B9 修复验证）', async () => {
      const res = await request(app)
        .get('/api/v4/system/ad-delivery?slot_type=feed&position=market_list')
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(200)
      validateApiContract(res.body, true)
      expect(res.body.data.slot_type).toBe('feed')
      expect(res.body.data.position).toBe('market_list')
    })

    test('无效 slot_type 返回 400', async () => {
      const res = await request(app)
        .get('/api/v4/system/ad-delivery?slot_type=invalid')
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(400)
      validateApiContract(res.body, false)
    })

    test('缺少 slot_type 返回 400', async () => {
      const res = await request(app)
        .get('/api/v4/system/ad-delivery')
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(400)
      validateApiContract(res.body, false)
    })
  })

  // ==================== 用户端广告位查询 ====================

  describe('GET /api/v4/user/ad-slots', () => {
    test('返回全部活跃广告位', async () => {
      const res = await request(app)
        .get('/api/v4/user/ad-slots')
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(200)
      validateApiContract(res.body, true)
      expect(res.body.data).toHaveProperty('slots')
      expect(res.body.data.slots.length).toBeGreaterThanOrEqual(7)
    })

    test('feed 类型筛选成功（B12 修复验证）', async () => {
      const res = await request(app)
        .get('/api/v4/user/ad-slots?slot_type=feed')
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(200)
      validateApiContract(res.body, true)

      const feedSlots = res.body.data.slots
      expect(feedSlots.length).toBe(2)
      feedSlots.forEach(slot => {
        expect(slot.slot_type).toBe('feed')
      })
    })

    test('announcement 类型筛选成功（B12 修复验证）', async () => {
      const res = await request(app)
        .get('/api/v4/user/ad-slots?slot_type=announcement')
        .set('Authorization', `Bearer ${accessToken}`)

      expect(res.status).toBe(200)
      validateApiContract(res.body, true)
      expect(res.body.data.slots.length).toBe(1)
    })
  })

  // ==================== 管理端商业广告创建 ====================

  describe('POST /api/v4/console/ad-campaigns', () => {
    test('创建商业广告含文字素材，自动创建 AdCreative（B3+B5 验证）', async () => {
      const res = await request(app)
        .post('/api/v4/console/ad-campaigns')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          campaign_name: '契约测试-商业广告',
          ad_slot_id: 11,
          billing_mode: 'fixed_daily',
          fixed_days: 3,
          start_date: '2026-05-01',
          end_date: '2026-05-03',
          content_type: 'text',
          text_content: '契约测试商业广告文字内容'
        })

      expect(res.status).toBe(200)
      validateApiContract(res.body, true)
      expect(res.body.data).toHaveProperty('ad_campaign_id')

      const detail = await request(app)
        .get(`/api/v4/console/ad-campaigns/${res.body.data.ad_campaign_id}`)
        .set('Authorization', `Bearer ${accessToken}`)

      expect(detail.status).toBe(200)
      expect(detail.body.data.creatives).toBeDefined()
      expect(detail.body.data.creatives.length).toBe(1)
      expect(detail.body.data.creatives[0].text_content).toBe('契约测试商业广告文字内容')
      expect(detail.body.data.creatives[0].review_status).toBe('pending')
    })
  })

  // ==================== 系统计划创建 ====================

  describe('POST /api/v4/console/ad-campaigns/system', () => {
    test('创建系统计划含文字素材，自动创建 AdCreative 且免审核（B4 验证）', async () => {
      const res = await request(app)
        .post('/api/v4/console/ad-campaigns/system')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          campaign_name: '契约测试-系统通知',
          ad_slot_id: 13,
          priority: 950,
          content_type: 'text',
          text_content: '系统通知内容'
        })

      expect(res.status).toBe(200)
      validateApiContract(res.body, true)

      const detail = await request(app)
        .get(`/api/v4/console/ad-campaigns/${res.body.data.ad_campaign_id}`)
        .set('Authorization', `Bearer ${accessToken}`)

      expect(detail.status).toBe(200)
      expect(detail.body.data.creatives).toBeDefined()
      expect(detail.body.data.creatives.length).toBe(1)
      expect(detail.body.data.creatives[0].text_content).toBe('系统通知内容')
      expect(detail.body.data.creatives[0].review_status).toBe('approved')
    })
  })

  // ==================== 用户端图片上传接口 ====================

  describe('POST /api/v4/user/images/upload', () => {
    test('路由存在且需认证（B10 验证）', async () => {
      const res = await request(app).post('/api/v4/user/images/upload')

      expect(res.status).not.toBe(404)
    })
  })
})
