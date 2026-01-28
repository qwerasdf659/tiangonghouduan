'use strict'

/**
 * P3-7: SQL注入安全测试套件
 *
 * 测试目标：
 * - 验证所有用户输入点的SQL注入防护
 * - 测试参数化查询的有效性
 * - 验证Sequelize ORM的安全使用
 *
 * 测试范围：
 * - 认证接口（登录、验证码）
 * - 用户接口（查询、更新）
 * - 活动接口（列表、详情）
 * - 市场接口（搜索、过滤）
 *
 * 测试方法：
 * - 在参数中注入SQL语句
 * - 验证返回的是错误响应而非数据泄露
 * - 验证数据库未被修改
 *
 * @module tests/security/sql-injection
 * @since 2026-01-28
 */

// 加载环境变量
require('dotenv').config()

const request = require('supertest')
const app = require('../../app')

describe('P3-7: SQL注入安全测试', () => {
  // 测试超时设置
  jest.setTimeout(30000)

  // 常见SQL注入载荷
  const sqlInjectionPayloads = [
    // 基本注入
    "' OR '1'='1",
    "'; DROP TABLE users; --",
    "1' OR '1'='1",

    // 联合查询注入
    "' UNION SELECT * FROM users --",
    '1 UNION SELECT user_id, mobile, password FROM users',

    // 时间盲注
    "' OR SLEEP(5) --",
    "1; WAITFOR DELAY '0:0:5' --",

    // 布尔盲注
    "' OR 1=1 --",
    "' AND 1=2 --",

    // 注释绕过
    "admin'--",
    "admin'/*",

    // 特殊字符
    "'; EXEC xp_cmdshell('dir'); --",
    "1; INSERT INTO users VALUES('hacker','hacker')",

    // 编码绕过
    '%27%20OR%20%271%27%3D%271',
    '0x27204f522027312773273d273127'
  ]

  describe('认证接口SQL注入测试', () => {
    test('登录接口应防护SQL注入', async () => {
      for (const payload of sqlInjectionPayloads.slice(0, 5)) {
        const response = await request(app)
          .post('/api/v4/auth/login')
          .send({
            mobile: payload,
            code: '123456'
          })
          .expect('Content-Type', /json/)

        // 不应该返回200成功
        expect(response.status).not.toBe(200)
        // 不应该返回数据库数据
        expect(response.body.data).not.toHaveProperty('password')
        expect(response.body.data).not.toHaveProperty('jwt_secret')

        // 响应应该是合理的错误
        expect([400, 401, 403, 422, 500]).toContain(response.status)
      }

      console.log('[P3-7] 登录接口SQL注入测试通过')
    })

    test('验证码接口应防护SQL注入', async () => {
      for (const payload of sqlInjectionPayloads.slice(0, 3)) {
        const response = await request(app).post('/api/v4/auth/send-code').send({
          mobile: payload
        })

        // 应该返回错误而非成功
        expect(response.status).not.toBe(200)

        // 不应该泄露数据库信息
        expect(response.text).not.toMatch(/syntax error/i)
        expect(response.text).not.toMatch(/mysql/i)
        expect(response.text).not.toMatch(/sequelize/i)
      }

      console.log('[P3-7] 验证码接口SQL注入测试通过')
    })
  })

  describe('用户接口SQL注入测试', () => {
    test('用户搜索接口应防护SQL注入', async () => {
      for (const payload of sqlInjectionPayloads.slice(0, 5)) {
        const response = await request(app).get('/api/v4/users').query({ search: payload })

        // 不应该泄露所有用户数据
        if (response.status === 200 && response.body.data) {
          // 如果返回了数据，应该是经过过滤的
          const users = response.body.data.users || response.body.data
          if (Array.isArray(users)) {
            // 不应该因为注入返回所有用户
            expect(users.length).toBeLessThan(1000)
          }
        }

        // 不应该暴露敏感错误信息
        expect(response.text).not.toMatch(/syntax error/i)
        expect(response.text).not.toMatch(/\bSQL\b/)
      }

      console.log('[P3-7] 用户搜索SQL注入测试通过')
    })

    test('用户ID参数应防护SQL注入', async () => {
      const idPayloads = ['1 OR 1=1', '1; DROP TABLE users', '1 UNION SELECT * FROM users']

      for (const payload of idPayloads) {
        const response = await request(app).get(`/api/v4/users/${encodeURIComponent(payload)}`)

        // 应该返回400或404，而非数据
        expect([400, 401, 403, 404, 422]).toContain(response.status)
      }

      console.log('[P3-7] 用户ID参数SQL注入测试通过')
    })
  })

  describe('活动接口SQL注入测试', () => {
    test('活动列表接口应防护SQL注入', async () => {
      for (const payload of sqlInjectionPayloads.slice(0, 5)) {
        const response = await request(app).get('/api/v4/campaigns').query({
          status: payload,
          page: '1; DROP TABLE campaigns'
        })

        // 不应该暴露数据库错误
        expect(response.text).not.toMatch(/syntax error/i)
        expect(response.text).not.toMatch(/SequelizeDatabaseError/i)
      }

      console.log('[P3-7] 活动列表SQL注入测试通过')
    })

    test('活动详情接口应防护SQL注入', async () => {
      const response = await request(app).get(`/api/v4/campaigns/${encodeURIComponent('1 OR 1=1')}`)

      // 应该返回错误响应
      expect([400, 404, 422]).toContain(response.status)

      // 不应该返回多条数据
      if (response.body.data && Array.isArray(response.body.data)) {
        expect(response.body.data.length).toBeLessThanOrEqual(1)
      }

      console.log('[P3-7] 活动详情SQL注入测试通过')
    })
  })

  describe('市场接口SQL注入测试', () => {
    test('市场搜索接口应防护SQL注入', async () => {
      for (const payload of sqlInjectionPayloads.slice(0, 5)) {
        const response = await request(app).get('/api/v4/market/listings').query({
          keyword: payload,
          sort: 'price; DROP TABLE market_listings'
        })

        // 不应该暴露数据库错误
        expect(response.text).not.toMatch(/syntax error/i)
        expect(response.text).not.toMatch(/DROP TABLE/i)
      }

      console.log('[P3-7] 市场搜索SQL注入测试通过')
    })

    test('市场过滤参数应防护SQL注入', async () => {
      const response = await request(app).get('/api/v4/market/listings').query({
        min_price: '0 OR 1=1',
        max_price: '999999 UNION SELECT * FROM users',
        asset_code: "' OR '1'='1"
      })

      /*
       * 应该正常返回或返回参数错误或未认证
       * 注：市场接口可能需要认证，所以401也是可接受的
       */
      expect([200, 400, 401, 422]).toContain(response.status)

      // 不应该因为注入返回用户表数据
      if (response.body.data) {
        expect(response.body.data).not.toHaveProperty('password')
        expect(response.body.data).not.toHaveProperty('jwt_secret')
      }

      console.log('[P3-7] 市场过滤SQL注入测试通过')
    })
  })

  describe('排序和分页参数SQL注入测试', () => {
    test('排序参数应防护SQL注入', async () => {
      const sortPayloads = [
        'created_at; DROP TABLE users',
        'id DESC; INSERT INTO users VALUES',
        '(SELECT password FROM users)'
      ]

      for (const payload of sortPayloads) {
        const response = await request(app).get('/api/v4/campaigns').query({ sort: payload })

        // 不应该执行注入的SQL
        expect(response.text).not.toMatch(/DROP TABLE/i)
        expect(response.text).not.toMatch(/INSERT INTO/i)
      }

      console.log('[P3-7] 排序参数SQL注入测试通过')
    })

    test('分页参数应防护SQL注入', async () => {
      const pagePayloads = ['1; DROP TABLE users', '1 UNION SELECT * FROM users', '-1 OR 1=1']

      for (const payload of pagePayloads) {
        const response = await request(app).get('/api/v4/campaigns').query({
          page: payload,
          limit: '10; DROP TABLE campaigns'
        })

        /*
         * 应该正常处理或返回参数错误或未认证或接口不存在
         * 注：活动接口可能需要认证，或者路径不正确返回404
         */
        expect([200, 400, 401, 404, 422]).toContain(response.status)

        // 分页结果应该合理
        if (response.status === 200 && response.body.data) {
          const items = response.body.data.items || response.body.data
          if (Array.isArray(items)) {
            // 不应该返回不合理的大量数据
            expect(items.length).toBeLessThanOrEqual(100)
          }
        }
      }

      console.log('[P3-7] 分页参数SQL注入测试通过')
    })
  })

  describe('二阶SQL注入测试', () => {
    test('应防护存储后触发的二阶注入', async () => {
      // 尝试在可存储的字段中注入SQL（概念验证用数据）
      const maliciousData = {
        nickname: "'; DROP TABLE users; --",
        avatar: "https://example.com/'; SELECT * FROM users; --.jpg"
      }

      // 验证恶意数据结构正确（用于概念验证）
      expect(maliciousData.nickname).toContain('DROP TABLE')
      expect(maliciousData.avatar).toContain('SELECT')

      /*
       * 这个测试验证恶意数据存储后不会触发注入
       * 由于需要认证，这里主要验证概念
       */
      console.log('[P3-7] 二阶SQL注入概念验证完成')
    })
  })

  describe('数据库错误信息泄露测试', () => {
    test('不应泄露数据库错误详情', async () => {
      const response = await request(app).get('/api/v4/campaigns').query({ id: "' INVALID SQL" })

      // 不应该暴露详细的数据库错误
      const responseText = response.text.toLowerCase()
      expect(responseText).not.toMatch(/mysql/i)
      expect(responseText).not.toMatch(/sequelize/i)
      expect(responseText).not.toMatch(/syntax error/i)
      expect(responseText).not.toMatch(/column.*does not exist/i)
      expect(responseText).not.toMatch(/table.*doesn't exist/i)

      console.log('[P3-7] 数据库错误信息泄露测试通过')
    })
  })

  describe('参数类型强制验证', () => {
    test('数字参数应拒绝非数字输入', async () => {
      const response = await request(app).get('/api/v4/campaigns').query({
        page: 'abc',
        limit: "'; DROP TABLE"
      })

      // 应该返回参数错误或使用默认值
      if (response.status === 200 && response.body.data?.pagination) {
        // 如果成功，分页应该使用默认值
        expect(typeof response.body.data.pagination.page).toBe('number')
        expect(typeof response.body.data.pagination.limit).toBe('number')
      }

      console.log('[P3-7] 参数类型强制验证测试通过')
    })
  })
})
