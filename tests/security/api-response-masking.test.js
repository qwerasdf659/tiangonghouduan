/**
 * 🔐 API响应脱敏测试
 *
 * P0-3 任务：创建 API 响应脱敏测试
 *
 * 审计标准：
 * - 审计标准 B-1：手机号脱敏
 * - 《个人信息保护法》第51条
 * - 《网络安全法》第42条
 *
 * 测试范围（用户端API，需要脱敏）：
 * - GET /api/v4/auth/profile （用户Profile）
 * - GET /api/v4/user/me （用户中心）
 *
 * 📌 注意：管理端（console）API 不需要脱敏测试
 * （参考规则："web端后台管理系统就不要考虑数据敏感性了"）
 *
 * 验收标准：
 * - npm test -- tests/security/api-response-masking.test.js 全部通过
 * - 所有用户端API的mobile字段必须是 136****7930 格式
 *
 * @module tests/security/api-response-masking
 * @since 2026-01-28
 */

'use strict'

const request = require('supertest')

// 🔧 测试辅助模块
const { getTestUserToken } = require('../helpers/auth-helper')
const { TEST_DATA } = require('../helpers/test-data')
const { TestAssertions } = require('../helpers/test-setup')

// 手机号脱敏格式正则：3位数字 + 4个星号 + 4位数字
const MASKED_MOBILE_REGEX = /^\d{3}\*{4}\d{4}$/

/**
 * 🔐 用户端API响应脱敏测试（P0-3）
 *
 * 业务场景：微信小程序端用户查看个人信息
 * 安全要求：手机号必须脱敏展示，防止敏感信息泄露
 */
describe('🔐 API响应脱敏测试（P0-3）', () => {
  let app
  let authToken

  /**
   * 测试初始化：
   * 1. 加载 Express 应用
   * 2. 获取测试用户认证 Token
   */
  beforeAll(async () => {
    // 加载应用
    app = require('../../app')

    // 等待应用初始化完成
    await new Promise(resolve => setTimeout(resolve, 1000))

    // 获取测试用户Token
    authToken = await getTestUserToken(app)
    console.log('✅ 测试Token获取成功')
  })

  describe('GET /api/v4/auth/profile - 用户Profile脱敏', () => {
    /**
     * P0-3-1 验证 profile 接口手机号脱敏
     *
     * 业务场景：用户在小程序"我的"页面查看个人资料
     * 预期行为：手机号显示为 136****7930 格式
     *
     * 📌 API响应结构：{ data: { user: { mobile, ... }, timestamp } }
     */
    test('P0-3-1 profile接口手机号已脱敏', async () => {
      const response = await request(app)
        .get('/api/v4/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      // 验证API响应格式符合业务标准
      TestAssertions.validateApiResponse(response.body, true)

      // 📌 profile接口的用户数据在 data.user 中
      expect(response.body.data).toHaveProperty('user')
      expect(response.body.data.user).toHaveProperty('mobile')

      // 🔐 核心断言：手机号必须是脱敏格式
      const mobile = response.body.data.user.mobile
      expect(mobile).toMatch(MASKED_MOBILE_REGEX)

      // 验证不是原始手机号
      expect(mobile).not.toBe(TEST_DATA.users.testUser.mobile)

      console.log(`✅ profile接口mobile字段已脱敏: ${mobile}`)
    })

    /**
     * P0-3-2 验证脱敏格式正确性
     *
     * 详细验证脱敏后的手机号格式
     * 📌 API响应结构：{ data: { user: { mobile, ... }, timestamp } }
     */
    test('P0-3-2 脱敏格式验证：前3后4，中间****', async () => {
      const response = await request(app)
        .get('/api/v4/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      // 📌 profile接口的用户数据在 data.user 中
      const mobile = response.body.data.user.mobile

      // 验证长度为11位（3 + 4 + 4）
      expect(mobile.length).toBe(11)

      // 验证前3位是数字
      expect(mobile.substring(0, 3)).toMatch(/^\d{3}$/)

      // 验证中间4位是星号
      expect(mobile.substring(3, 7)).toBe('****')

      // 验证后4位是数字
      expect(mobile.substring(7)).toMatch(/^\d{4}$/)
    })

    /**
     * P0-3-3 验证其他敏感信息不泄露
     *
     * 确保API响应不包含其他敏感字段
     * 📌 API响应结构：{ data: { user: { ... }, timestamp } }
     */
    test('P0-3-3 不暴露其他敏感信息', async () => {
      const response = await request(app)
        .get('/api/v4/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      // 📌 profile接口的用户数据在 data.user 中
      const user = response.body.data.user

      // 不应包含密码相关字段
      expect(user).not.toHaveProperty('password')
      expect(user).not.toHaveProperty('password_hash')

      // 不应包含内部技术字段
      expect(user).not.toHaveProperty('salt')
      expect(user).not.toHaveProperty('session_token')
    })
  })

  describe('GET /api/v4/user/me - 用户中心脱敏', () => {
    /**
     * P0-3-4 验证 user/me 接口手机号脱敏
     *
     * 业务场景：用户在小程序用户中心查看基本信息
     * 预期行为：手机号显示为 136****7930 格式
     */
    test('P0-3-4 user/me接口手机号已脱敏', async () => {
      const response = await request(app)
        .get('/api/v4/user/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      // 验证API响应格式符合业务标准
      TestAssertions.validateApiResponse(response.body, true)

      // 验证响应包含 mobile 字段
      expect(response.body.data).toHaveProperty('mobile')

      // 🔐 核心断言：手机号必须是脱敏格式
      const mobile = response.body.data.mobile
      expect(mobile).toMatch(MASKED_MOBILE_REGEX)

      // 验证不是原始手机号
      expect(mobile).not.toBe(TEST_DATA.users.testUser.mobile)

      console.log(`✅ user/me接口mobile字段已脱敏: ${mobile}`)
    })

    /**
     * P0-3-5 两个接口脱敏格式一致性
     *
     * 确保同一用户在不同接口返回的脱敏手机号格式一致
     * 📌 profile接口：data.user.mobile | user/me接口：data.mobile
     */
    test('P0-3-5 多个接口脱敏格式一致', async () => {
      // 调用 auth/profile 接口
      const profileResponse = await request(app)
        .get('/api/v4/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      // 调用 user/me 接口
      const meResponse = await request(app)
        .get('/api/v4/user/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      /*
       * 📌 注意两个接口的响应结构不同
       * profile: data.user.mobile | user/me: data.mobile
       */
      const profileMobile = profileResponse.body.data.user.mobile
      const meMobile = meResponse.body.data.mobile

      // 两个接口返回的脱敏手机号应该一致
      expect(profileMobile).toBe(meMobile)

      console.log(`✅ 脱敏格式一致性验证通过: ${profileMobile}`)
    })
  })

  describe('未认证请求测试', () => {
    /**
     * P0-3-6 未认证请求被正确拒绝
     *
     * 确保没有Token的请求无法访问用户数据
     * 📌 业务错误码：MISSING_TOKEN（缺少Token） vs UNAUTHORIZED（Token无效）
     */
    test('P0-3-6 未认证请求返回401', async () => {
      const response = await request(app).get('/api/v4/auth/profile').expect(401)

      expect(response.body.success).toBe(false)
      // 📌 缺少Token时返回 MISSING_TOKEN（语义更准确）
      expect(response.body.code).toBe('MISSING_TOKEN')
    })

    /**
     * P0-3-7 无效Token请求被正确拒绝
     */
    test('P0-3-7 无效Token请求返回401', async () => {
      const response = await request(app)
        .get('/api/v4/auth/profile')
        .set('Authorization', 'Bearer invalid_token_12345')
        .expect(401)

      expect(response.body.success).toBe(false)
    })
  })

  describe('边界场景测试', () => {
    /**
     * P0-3-8 脱敏不影响其他字段
     *
     * 确保脱敏处理只影响 mobile 字段，其他字段正常返回
     */
    test('P0-3-8 脱敏不影响其他字段', async () => {
      const response = await request(app)
        .get('/api/v4/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)

      const data = response.body.data

      // 验证其他必需字段存在（字段在user对象内）
      expect(data).toHaveProperty('user')
      expect(data.user).toHaveProperty('user_id')
      expect(data.user).toHaveProperty('nickname')

      // 验证其他字段类型正确
      expect(typeof data.user.user_id).toBe('number')
    })
  })
})
