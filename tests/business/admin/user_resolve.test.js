/**
 * 🔍 手机号解析用户 API 测试
 *
 * 路由：GET /api/v4/console/user-management/users/resolve?mobile=xxx
 *
 * 业务场景：
 * - 管理后台所有页面的「手机号搜索用户」统一入口
 * - 运营输入手机号 → 解析出 user_id → 前端用 user_id 调后续业务 API
 *
 * 测试覆盖：
 * - 正常解析：使用真实测试用户手机号（13612227930）
 * - 参数校验：缺少手机号、格式错误
 * - 业务异常：手机号不存在
 * - 权限校验：未登录、非管理员
 * - 响应格式：ApiResponse 标准格式验证
 *
 * @since 2026-02-06（手机号主导搜索改造）
 */

const request = require('supertest')
const app = require('../../../app')
const { getTestUserToken } = require('../../helpers/auth-helper')
const { TEST_DATA } = require('../../helpers/test-data')

/** API 路径常量 */
const RESOLVE_URL = '/api/v4/console/user-management/users/resolve'

describe('GET /api/v4/console/user-management/users/resolve - 手机号解析用户', () => {
  /** 管理员认证 Token */
  let adminToken

  beforeAll(async () => {
    // 使用真实管理员账号登录获取 Token
    adminToken = await getTestUserToken(app, TEST_DATA.users.adminUser.mobile, '123456')
  })

  // =====================================================================
  // 1. 正常解析场景
  // =====================================================================
  describe('正常解析场景', () => {
    /**
     * 使用真实测试用户手机号（13612227930）进行解析
     * 预期：返回脱敏手机号、昵称、状态等用户基本信息
     */
    test('应该成功解析已存在的手机号', async () => {
      const response = await request(app)
        .get(RESOLVE_URL)
        .query({ mobile: TEST_DATA.users.testUser.mobile })
        .set('Authorization', `Bearer ${adminToken}`)

      // 1. HTTP 状态码
      expect(response.status).toBe(200)

      // 2. ApiResponse 标准格式
      expect(response.body.success).toBe(true)
      expect(response.body.code).toBe('SUCCESS')
      expect(response.body.message).toBe('用户解析成功')

      // 3. 业务数据完整性
      const { data } = response.body
      expect(data).toHaveProperty('user_id')
      expect(data).toHaveProperty('mobile')
      expect(data).toHaveProperty('nickname')
      expect(data).toHaveProperty('status')
      expect(data).toHaveProperty('avatar_url')
      expect(data).toHaveProperty('user_level')

      // 4. user_id 必须是正整数（数据库自增主键）
      expect(typeof data.user_id).toBe('number')
      expect(data.user_id).toBeGreaterThan(0)

      // 5. 手机号脱敏验证：格式 136****7930
      expect(data.mobile).toMatch(/^1\d{2}\*{4}\d{4}$/)
      // 确认脱敏后的手机号与原始手机号首尾一致
      const originalMobile = TEST_DATA.users.testUser.mobile
      expect(data.mobile.substring(0, 3)).toBe(originalMobile.substring(0, 3))
      expect(data.mobile.substring(7)).toBe(originalMobile.substring(7))

      // 6. 昵称不为空（空时用「用户+后4位」兜底）
      expect(typeof data.nickname).toBe('string')
      expect(data.nickname.length).toBeGreaterThan(0)

      // 7. 状态为有效枚举值
      expect(['active', 'inactive', 'banned']).toContain(data.status)
    })

    /**
     * 验证响应中不包含敏感字段
     * 管理后台脱敏策略：不暴露完整手机号、密码等
     */
    test('响应不应包含敏感字段', async () => {
      const response = await request(app)
        .get(RESOLVE_URL)
        .query({ mobile: TEST_DATA.users.testUser.mobile })
        .set('Authorization', `Bearer ${adminToken}`)

      const { data } = response.body

      // 不应返回完整手机号
      expect(data.mobile).not.toBe(TEST_DATA.users.testUser.mobile)
      // 不应返回密码相关字段
      expect(data).not.toHaveProperty('password')
      expect(data).not.toHaveProperty('password_hash')
      // 不应返回 token 字段
      expect(data).not.toHaveProperty('token')
      expect(data).not.toHaveProperty('access_token')
    })

    /**
     * 验证 ApiResponse 标准格式字段完整性
     * 包含：success, code, message, data, timestamp, version, request_id
     */
    test('响应应符合 ApiResponse 标准格式', async () => {
      const response = await request(app)
        .get(RESOLVE_URL)
        .query({ mobile: TEST_DATA.users.testUser.mobile })
        .set('Authorization', `Bearer ${adminToken}`)

      // ApiResponse 标准字段
      expect(response.body).toHaveProperty('success')
      expect(response.body).toHaveProperty('code')
      expect(response.body).toHaveProperty('message')
      expect(response.body).toHaveProperty('data')
      expect(response.body).toHaveProperty('timestamp')
      expect(response.body).toHaveProperty('version')
      expect(response.body).toHaveProperty('request_id')

      // request_id 格式：req_ 前缀的 UUID
      expect(response.body.request_id).toMatch(/^req_/)
    })
  })

  // =====================================================================
  // 2. 参数校验场景
  // =====================================================================
  describe('参数校验场景', () => {
    /**
     * 未提供 mobile 参数
     * 预期：400 MISSING_PARAM
     */
    test('缺少 mobile 参数应返回 400', async () => {
      const response = await request(app)
        .get(RESOLVE_URL)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.code).toBe('MISSING_PARAM')
      expect(response.body.message).toBe('请提供手机号参数')
    })

    /**
     * mobile 参数为空字符串
     * 预期：400 MISSING_PARAM
     */
    test('mobile 为空字符串应返回 400', async () => {
      const response = await request(app)
        .get(RESOLVE_URL)
        .query({ mobile: '' })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
    })

    /**
     * 手机号格式错误：非数字
     * 预期：400 INVALID_MOBILE
     */
    test('非数字手机号应返回 400', async () => {
      const response = await request(app)
        .get(RESOLVE_URL)
        .query({ mobile: 'abcdefghijk' })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.code).toBe('INVALID_MOBILE')
      expect(response.body.message).toContain('手机号格式错误')
    })

    /**
     * 手机号格式错误：不足11位
     * 预期：400 INVALID_MOBILE
     */
    test('不足11位手机号应返回 400', async () => {
      const response = await request(app)
        .get(RESOLVE_URL)
        .query({ mobile: '1361222' })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.code).toBe('INVALID_MOBILE')
    })

    /**
     * 手机号格式错误：超过11位
     * 预期：400 INVALID_MOBILE
     */
    test('超过11位手机号应返回 400', async () => {
      const response = await request(app)
        .get(RESOLVE_URL)
        .query({ mobile: '136122279300' })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.code).toBe('INVALID_MOBILE')
    })

    /**
     * 手机号格式错误：不以1开头
     * 预期：400 INVALID_MOBILE
     */
    test('不以1开头的手机号应返回 400', async () => {
      const response = await request(app)
        .get(RESOLVE_URL)
        .query({ mobile: '09912345678' })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.code).toBe('INVALID_MOBILE')
    })
  })

  // =====================================================================
  // 3. 业务异常场景
  // =====================================================================
  describe('业务异常场景', () => {
    /**
     * 手机号格式正确但数据库中不存在
     * 预期：404 USER_NOT_FOUND
     */
    test('不存在的手机号应返回 404', async () => {
      const response = await request(app)
        .get(RESOLVE_URL)
        .query({ mobile: '19999999999' })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(response.status).toBe(404)
      expect(response.body.success).toBe(false)
      expect(response.body.code).toBe('USER_NOT_FOUND')
      expect(response.body.message).toBe('未找到该手机号对应的用户')
    })
  })

  // =====================================================================
  // 4. 权限校验场景
  // =====================================================================
  describe('权限校验场景', () => {
    /**
     * 未携带 Authorization Header
     * 预期：401
     */
    test('未登录应返回 401', async () => {
      const response = await request(app)
        .get(RESOLVE_URL)
        .query({ mobile: TEST_DATA.users.testUser.mobile })

      expect(response.status).toBe(401)
      expect(response.body.success).toBe(false)
    })

    /**
     * 携带无效 Token
     * 预期：401
     */
    test('无效 Token 应返回 401', async () => {
      const response = await request(app)
        .get(RESOLVE_URL)
        .query({ mobile: TEST_DATA.users.testUser.mobile })
        .set('Authorization', 'Bearer invalid-token-12345')

      expect(response.status).toBe(401)
      expect(response.body.success).toBe(false)
    })
  })
})











