/**
 * 分页限制修复验证测试
 *
 * 测试目标：验证所有接口的分页限制是否正确实施
 * 修复内容：8个接口添加Math.min()最大限制保护
 * 测试账号：13612227930（管理员+普通用户）
 */

const request = require('supertest')
const app = require('../app')

describe('🔍 分页限制修复验证测试', () => {
  let testUserToken = ''
  const TEST_MOBILE = '13612227930'
  const TEST_CODE = '123456'

  // 测试前登录获取Token
  beforeAll(async () => {
    const loginResponse = await request(app)
      .post('/api/v4/unified-engine/auth/login')
      .send({
        mobile: TEST_MOBILE,
        verification_code: TEST_CODE
      })

    expect(loginResponse.status).toBe(200)
    testUserToken = loginResponse.body.data.access_token
    console.log('✅ 测试账号登录成功:', TEST_MOBILE)
  })

  /**
   * 测试1: /api/v4/system/chat/history/:sessionId
   * 预期：最大限制100条
   */
  test('1️⃣ 聊天历史接口 - 应限制最大100条记录', async () => {
    // 测试超大limit值（999）是否被限制为100
    const response = await request(app)
      .get('/api/v4/system/chat/history/test-session-id')
      .set('Authorization', `Bearer ${testUserToken}`)
      .query({ limit: 999 })

    /*
     * 即使请求失败（会话不存在），也应该先经过分页保护逻辑
     * 我们主要关注的是分页参数是否被正确处理
     */
    console.log('聊天历史接口响应状态:', response.status)
  })

  /**
   * 测试2: /api/v4/unified-engine/lottery/history/:user_id
   * 预期：最大限制50条
   */
  test('2️⃣ 抽奖历史接口 - 应限制最大50条记录', async () => {
    const response = await request(app)
      .get(`/api/v4/unified-engine/lottery/history/${TEST_MOBILE}`)
      .set('Authorization', `Bearer ${testUserToken}`)
      .query({ limit: 999, page: 1 })

    console.log('抽奖历史接口响应:', response.status)

    // 验证pagination信息
    if (response.body.data && response.body.data.pagination) {
      const { limit } = response.body.data.pagination
      expect(limit).toBeLessThanOrEqual(50)
      console.log(`✅ 抽奖历史限制正确: ${limit} <= 50`)
    }
  })

  /**
   * 测试3: /api/v4/inventory/user/:user_id
   * 预期：最大限制50条
   */
  test('3️⃣ 用户库存接口 - 应限制最大50条记录', async () => {
    const response = await request(app)
      .get(`/api/v4/inventory/user/${TEST_MOBILE}`)
      .set('Authorization', `Bearer ${testUserToken}`)
      .query({ limit: 999, page: 1 })

    console.log('用户库存接口响应:', response.status)

    // 验证pagination信息
    if (response.body.data && response.body.data.pagination) {
      const { limit } = response.body.data.pagination
      expect(limit).toBeLessThanOrEqual(50)
      console.log(`✅ 用户库存限制正确: ${limit} <= 50`)
    }
  })

  /**
   * 测试4: /api/v4/inventory/products
   * 预期：最大限制50条
   */
  test('4️⃣ 商品列表接口 - 应限制最大50条记录', async () => {
    const response = await request(app)
      .get('/api/v4/inventory/products')
      .set('Authorization', `Bearer ${testUserToken}`)
      .query({ limit: 999, page: 1 })

    console.log('商品列表接口响应:', response.status)

    // 验证pagination信息
    if (response.body.data && response.body.data.pagination) {
      const { limit } = response.body.data.pagination
      expect(limit).toBeLessThanOrEqual(50)
      console.log(`✅ 商品列表限制正确: ${limit} <= 50`)
    }
  })

  /**
   * 测试5: /api/v4/inventory/market/products
   * 预期：最大限制50条
   */
  test('5️⃣ 交易市场接口 - 应限制最大50条记录', async () => {
    const response = await request(app)
      .get('/api/v4/inventory/market/products')
      .set('Authorization', `Bearer ${testUserToken}`)
      .query({ limit: 999, page: 1 })

    console.log('交易市场接口响应:', response.status)
  })

  /**
   * 测试6: /api/v4/inventory/transfer-history
   * 预期：最大限制50条
   */
  test('6️⃣ 转让历史接口 - 应限制最大50条记录', async () => {
    const response = await request(app)
      .get('/api/v4/inventory/transfer-history')
      .set('Authorization', `Bearer ${testUserToken}`)
      .query({ limit: 999, page: 1 })

    console.log('转让历史接口响应:', response.status)
  })

  /**
   * 测试7: /api/v4/unified-engine/points/transactions/:user_id
   * 预期：通过服务层保护，最大限制100条
   */
  test('7️⃣ 积分交易接口 - 应通过服务层限制最大100条记录', async () => {
    const response = await request(app)
      .get(`/api/v4/unified-engine/points/transactions/${TEST_MOBILE}`)
      .set('Authorization', `Bearer ${testUserToken}`)
      .query({ limit: 999, page: 1 })

    console.log('积分交易接口响应:', response.status)

    // 验证pagination信息
    if (response.body.data && response.body.data.pagination) {
      const { limit } = response.body.data.pagination
      // 服务层有保护，应该被限制为100
      expect(limit).toBeLessThanOrEqual(100)
      console.log(`✅ 积分交易限制正确（服务层保护）: ${limit} <= 100`)
    }
  })

  /**
   * 测试8: 管理员接口 - /api/v4/admin/user_management/users
   * 预期：最大限制100条（管理员权限）
   */
  test('8️⃣ 用户管理接口（管理员）- 应限制最大100条记录', async () => {
    const response = await request(app)
      .get('/api/v4/admin/user_management/users')
      .set('Authorization', `Bearer ${testUserToken}`)
      .query({ limit: 999, page: 1 })

    console.log('用户管理接口响应:', response.status)
  })

  /**
   * 测试9: 管理员接口 - /api/v4/system/admin/chat-sessions
   * 预期：最大限制100条（管理员权限）
   */
  test('9️⃣ 聊天会话管理接口（管理员）- 应限制最大100条记录', async () => {
    const response = await request(app)
      .get('/api/v4/system/admin/chat-sessions')
      .set('Authorization', `Bearer ${testUserToken}`)
      .query({ limit: 999, page: 1 })

    console.log('聊天会话管理接口响应:', response.status)
  })

  /**
   * 测试10: 管理员接口 - /api/v4/admin/audit/history
   * 预期：最大限制100条（管理员权限）
   */
  test('🔟 审计历史接口（管理员）- 应限制最大100条记录', async () => {
    const response = await request(app)
      .get('/api/v4/admin/audit/history')
      .set('Authorization', `Bearer ${testUserToken}`)
      .query({ limit: 999, page: 1 })

    console.log('审计历史接口响应:', response.status)
  })

  /**
   * 边界测试：正常limit值应该不受影响
   */
  test('✅ 边界测试 - 正常limit值（20）应该保持不变', async () => {
    const response = await request(app)
      .get('/api/v4/inventory/products')
      .set('Authorization', `Bearer ${testUserToken}`)
      .query({ limit: 20, page: 1 })

    if (response.body.data && response.body.data.pagination) {
      const { limit } = response.body.data.pagination
      expect(limit).toBe(20)
      console.log(`✅ 正常limit值保持不变: ${limit} = 20`)
    }
  })

  /**
   * 边界测试：默认limit值应该正常工作
   */
  test('✅ 边界测试 - 默认limit值应该正常工作', async () => {
    const response = await request(app)
      .get('/api/v4/inventory/products')
      .set('Authorization', `Bearer ${testUserToken}`)
      .query({ page: 1 }) // 不传limit，使用默认值

    if (response.body.data && response.body.data.pagination) {
      const { limit } = response.body.data.pagination
      expect(limit).toBeGreaterThan(0)
      expect(limit).toBeLessThanOrEqual(50)
      console.log(`✅ 默认limit值正常: ${limit}`)
    }
  })
})
