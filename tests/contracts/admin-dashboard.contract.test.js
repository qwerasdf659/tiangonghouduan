/**
 * API契约自动化测试: Admin Dashboard
 *
 * 目的：验证后端API返回数据是否符合契约定义
 * 运行方式: npm run test:contract
 *
 * 创建时间：2025年11月24日
 */

const request = require('supertest')
const Ajv = require('ajv')
const ajvFormats = require('ajv-formats')
const contractSchema = require('../../docs/api-contracts/admin-dashboard.contract.json')

// 初始化JSON Schema验证器
const ajv = new Ajv({ allErrors: true, strict: false })
const addFormats = typeof ajvFormats === 'function' ? ajvFormats : ajvFormats?.default
/*
 * 🔧 兼容：当前项目依赖树里 Ajv 版本可能不是 ajv-formats 期望的版本
 * 本契约 schema 未使用 format 关键字，因此不阻塞测试执行
 */
try {
  if (typeof addFormats === 'function') addFormats(ajv)
} catch (error) {
  // eslint-disable-next-line no-console
  console.warn('[contract-test] ajv-formats 初始化失败，跳过 formats 插件：', error?.message)
}

describe('API契约测试: Admin Dashboard', () => {
  let authToken = null
  let app = null

  // 测试前初始化app和登录获取token
  beforeAll(async () => {
    // 延迟加载app，避免初始化定时器问题
    app = require('../../app')

    const response = await request(app).post('/api/v4/auth/login').send({
      mobile: '13612227930',
      verification_code: '123456'
    })

    expect(response.body.success).toBe(true)
    authToken = response.body.data.access_token
  }, 30000)

  describe('GET /api/v4/admin/system/dashboard - 数据结构契约验证', () => {
    test('应该返回符合契约定义的数据结构', async () => {
      const response = await request(app)
        .get('/api/v4/admin/system/dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      // 使用JSON Schema验证响应数据
      const validate = ajv.compile(contractSchema.responseSchema)
      const valid = validate(response.body)

      if (!valid) {
        console.error('❌ API契约验证失败:')
        console.error('验证错误:', JSON.stringify(validate.errors, null, 2))
        console.error('实际响应:', JSON.stringify(response.body, null, 2))
      }

      expect(valid).toBe(true)
    }, 10000)

    test('应该包含所有必需的overview字段', async () => {
      const response = await request(app)
        .get('/api/v4/admin/system/dashboard')
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.body.data.overview).toBeDefined()
      expect(response.body.data.overview.total_users).toBeGreaterThanOrEqual(0)
      expect(response.body.data.overview.active_users).toBeGreaterThanOrEqual(0)
      expect(response.body.data.overview.total_lotteries).toBeGreaterThanOrEqual(0)
      expect(response.body.data.overview.win_rate).toMatch(/^\d+\.\d{2}$/)
    }, 10000)

    test('应该包含所有必需的today字段', async () => {
      const response = await request(app)
        .get('/api/v4/admin/system/dashboard')
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.body.data.today).toBeDefined()
      expect(response.body.data.today.new_users).toBeGreaterThanOrEqual(0)
      expect(response.body.data.today.lottery_draws).toBeGreaterThanOrEqual(0)
      expect(response.body.data.today.wins).toBeGreaterThanOrEqual(0)
      expect(response.body.data.today.win_rate).toMatch(/^\d+\.\d{2}$/)
      expect(response.body.data.today.points_consumed).toBeGreaterThanOrEqual(0)
    }, 10000)

    test('应该包含所有必需的customer_service字段', async () => {
      const response = await request(app)
        .get('/api/v4/admin/system/dashboard')
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.body.data.customer_service).toBeDefined()
      expect(response.body.data.customer_service.today_sessions).toBeGreaterThanOrEqual(0)
      expect(response.body.data.customer_service.today_messages).toBeGreaterThanOrEqual(0)
    }, 10000)

    test('字段类型应该正确', async () => {
      const response = await request(app)
        .get('/api/v4/admin/system/dashboard')
        .set('Authorization', `Bearer ${authToken}`)

      const { data } = response.body

      // 验证数值字段类型
      expect(typeof data.overview.total_users).toBe('number')
      expect(typeof data.overview.active_users).toBe('number')
      expect(typeof data.today.new_users).toBe('number')
      expect(typeof data.today.lottery_draws).toBe('number')
      expect(typeof data.today.wins).toBe('number')
      expect(typeof data.today.points_consumed).toBe('number')
      expect(typeof data.customer_service.today_sessions).toBe('number')
      expect(typeof data.customer_service.today_messages).toBe('number')

      // 验证字符串字段类型
      expect(typeof data.overview.win_rate).toBe('string')
      expect(typeof data.today.win_rate).toBe('string')
    }, 10000)

    test('数值字段应该非负', async () => {
      const response = await request(app)
        .get('/api/v4/admin/system/dashboard')
        .set('Authorization', `Bearer ${authToken}`)

      const { data } = response.body

      // 验证所有数值字段都是非负数
      expect(data.overview.total_users).toBeGreaterThanOrEqual(0)
      expect(data.overview.active_users).toBeGreaterThanOrEqual(0)
      expect(data.overview.total_lotteries).toBeGreaterThanOrEqual(0)
      expect(data.today.new_users).toBeGreaterThanOrEqual(0)
      expect(data.today.lottery_draws).toBeGreaterThanOrEqual(0)
      expect(data.today.wins).toBeGreaterThanOrEqual(0)
      expect(data.today.points_consumed).toBeGreaterThanOrEqual(0)
      expect(data.customer_service.today_sessions).toBeGreaterThanOrEqual(0)
      expect(data.customer_service.today_messages).toBeGreaterThanOrEqual(0)
    }, 10000)
  })

  describe('API版本兼容性测试', () => {
    test('应该拒绝V2路径的请求', async () => {
      const response = await request(app)
        .get('/api/v2/admin/dashboard/stats')
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(404)
    }, 10000)

    test('V4路径应该正常工作', async () => {
      const response = await request(app)
        .get('/api/v4/admin/system/dashboard')
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
    }, 10000)
  })

  describe('业务逻辑验证', () => {
    test('今日中奖次数不应该超过今日抽奖次数', async () => {
      const response = await request(app)
        .get('/api/v4/admin/system/dashboard')
        .set('Authorization', `Bearer ${authToken}`)

      const { today } = response.body.data
      expect(today.wins).toBeLessThanOrEqual(today.lottery_draws)
    }, 10000)

    test('活跃用户数不应该超过总用户数', async () => {
      const response = await request(app)
        .get('/api/v4/admin/system/dashboard')
        .set('Authorization', `Bearer ${authToken}`)

      const { overview } = response.body.data
      expect(overview.active_users).toBeLessThanOrEqual(overview.total_users)
    }, 10000)

    test('中奖率应该在合理范围内（0-100）', async () => {
      const response = await request(app)
        .get('/api/v4/admin/system/dashboard')
        .set('Authorization', `Bearer ${authToken}`)

      const { overview, today } = response.body.data
      const overviewRate = parseFloat(overview.win_rate)
      const todayRate = parseFloat(today.win_rate)

      expect(overviewRate).toBeGreaterThanOrEqual(0)
      expect(overviewRate).toBeLessThanOrEqual(100)
      expect(todayRate).toBeGreaterThanOrEqual(0)
      expect(todayRate).toBeLessThanOrEqual(100)
    }, 10000)
  })
})
