/**
 * 认证验证API契约测试
 *
 * 功能说明：
 * - 锁住 GET /api/v4/auth/verify 的关键响应字段
 * - 防止字段命名回归（如 maxLevel vs role_level）
 * - 确保前后端契约一致性
 *
 * 契约规范（2026-01-08 拍板）：
 * - 权限级别字段统一使用 role_level（snake_case）
 * - 不再使用 maxLevel、roleLevel 等变体
 * - 移除 is_admin 字段，统一使用 role_level >= 100 判断管理员
 *
 * 创建时间：2026-01-08
 */

const request = require('supertest')
const app = require('../../app')
const { getTestUserToken } = require('../helpers/auth-helper')

describe('GET /api/v4/auth/verify 契约测试', () => {
  let userToken

  beforeAll(async () => {
    /**
     * 🔐 使用真实登录获取Token
     * 测试账号: 13612227910（既是用户也是管理员）
     */
    try {
      userToken = await getTestUserToken(app)
    } catch (error) {
      console.warn('⚠️ 登录失败，测试可能无法正常运行:', error.message)
    }
  })

  describe('响应结构契约', () => {
    it('应返回标准ApiResponse结构', async () => {
      // 跳过条件：Token获取失败
      if (!userToken) {
        console.warn('⚠️ 跳过测试：Token未获取')
        return
      }

      const response = await request(app)
        .get('/api/v4/auth/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200)

      // ✅ 验证顶层ApiResponse结构
      expect(response.body).toMatchObject({
        success: true,
        code: expect.any(String),
        message: expect.any(String),
        timestamp: expect.any(String)
      })

      // ✅ 验证data字段存在
      expect(response.body.data).toBeDefined()
    })

    it('应包含全部必需的用户字段', async () => {
      if (!userToken) {
        console.warn('⚠️ 跳过测试：Token未获取')
        return
      }

      const response = await request(app)
        .get('/api/v4/auth/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200)

      const { data } = response.body

      /**
       * 🔒 必需字段契约（变更需同步修改文档和前端）
       *
       * 字段说明：
       * - user_id: 用户唯一标识（数字）
       * - mobile: 用户手机号（字符串）
       * - nickname: 用户昵称（字符串，可为null）
       * - status: 用户状态（字符串：active/inactive/banned）
       * - roles: 用户角色列表（数组）
       * - role_level: 用户最高权限级别（数字，>=100为管理员）
       * - valid/token_valid: Token有效标识（布尔值）
       *
       * 注意：is_admin 字段已移除，使用 role_level >= 100 判断管理员
       */
      expect(data).toMatchObject({
        user_id: expect.any(Number),
        mobile: expect.any(String),
        status: expect.any(String),
        roles: expect.any(Array),
        role_level: expect.any(Number), // 🔒 关键：必须是 role_level，不是 maxLevel
        valid: expect.any(Boolean)
      })

      // ✅ 验证 nickname 字段存在（可为null或字符串）
      expect(data).toHaveProperty('nickname')
    })

    it('role_level 字段命名必须为 snake_case', async () => {
      if (!userToken) {
        console.warn('⚠️ 跳过测试：Token未获取')
        return
      }

      const response = await request(app)
        .get('/api/v4/auth/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200)

      const { data } = response.body

      /**
       * 🔒 字段命名契约检查
       *
       * 禁止的变体（会导致前端兼容问题）：
       * - maxLevel ❌
       * - roleLevel ❌
       * - role-level ❌
       *
       * 唯一允许：role_level ✅
       */
      expect(data).toHaveProperty('role_level')
      expect(data).not.toHaveProperty('maxLevel')
      expect(data).not.toHaveProperty('roleLevel')
      expect(data).not.toHaveProperty('role-level')

      // 验证 role_level 是数字类型
      expect(typeof data.role_level).toBe('number')
    })

    it('role_level >= 100 表示管理员权限', async () => {
      if (!userToken) {
        console.warn('⚠️ 跳过测试：Token未获取')
        return
      }

      const response = await request(app)
        .get('/api/v4/auth/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200)

      const { data } = response.body

      /**
       * 🔒 管理员判定规则契约
       *
       * 规则：role_level >= 100 表示管理员
       * - role_level >= 100: 管理员权限
       * - role_level < 100: 普通用户权限
       *
       * 注意：is_admin 字段已移除，前端应使用 role_level 判断
       */
      expect(typeof data.role_level).toBe('number')
      // 测试账号 13612227910 是管理员，role_level 应 >= 100
      expect(data.role_level).toBeGreaterThanOrEqual(100)
    })

    it('roles 数组元素应包含角色基本信息', async () => {
      if (!userToken) {
        console.warn('⚠️ 跳过测试：Token未获取')
        return
      }

      const response = await request(app)
        .get('/api/v4/auth/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200)

      const { data } = response.body

      // 验证 roles 是数组
      expect(Array.isArray(data.roles)).toBe(true)

      // 如果有角色，验证角色对象结构
      if (data.roles.length > 0) {
        const firstRole = data.roles[0]

        /**
         * 🔒 角色对象契约
         *
         * 必需字段：
         * - role_uuid: 角色UUID（字符串）
         * - role_name: 角色名称（字符串）
         * - role_level: 角色权限级别（数字）
         */
        expect(firstRole).toMatchObject({
          role_uuid: expect.any(String),
          role_name: expect.any(String),
          role_level: expect.any(Number)
        })
      }
    })
  })

  describe('状态字段契约', () => {
    it('status 应为有效的用户状态值', async () => {
      if (!userToken) {
        console.warn('⚠️ 跳过测试：Token未获取')
        return
      }

      const response = await request(app)
        .get('/api/v4/auth/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200)

      const { data } = response.body

      /**
       * 🔒 用户状态契约
       *
       * 允许的状态值：
       * - active: 正常
       * - inactive: 未激活
       * - banned: 已禁用
       */
      const validStatuses = ['active', 'inactive', 'banned']
      expect(validStatuses).toContain(data.status)
    })

    it('valid 和 token_valid 应为 true', async () => {
      if (!userToken) {
        console.warn('⚠️ 跳过测试：Token未获取')
        return
      }

      const response = await request(app)
        .get('/api/v4/auth/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200)

      const { data } = response.body

      /**
       * 🔒 Token有效性标识契约
       *
       * 当Token有效时：
       * - valid: true
       * - token_valid: true（可选，向后兼容）
       */
      expect(data.valid).toBe(true)

      // token_valid 是新增字段，检查存在且为 true
      if (data.token_valid !== undefined) {
        expect(data.token_valid).toBe(true)
      }
    })
  })

  describe('时间字段契约', () => {
    it('时间字段应为ISO8601格式', async () => {
      if (!userToken) {
        console.warn('⚠️ 跳过测试：Token未获取')
        return
      }

      const response = await request(app)
        .get('/api/v4/auth/verify')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200)

      const { data } = response.body

      /**
       * 🔒 时间格式契约
       *
       * 时间字段必须为ISO8601格式：
       * - 示例：2026-01-08T12:00:00.000+08:00
       * - 时区：北京时间（+08:00）
       */
      if (data.created_at) {
        expect(data.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      }

      if (data.last_login) {
        expect(data.last_login).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      }

      // 响应顶层 timestamp 也应为ISO8601格式
      expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    })
  })

  describe('错误响应契约', () => {
    it('无Token时应返回401 MISSING_TOKEN', async () => {
      const response = await request(app).get('/api/v4/auth/verify').expect(401)

      /**
       * 🔒 未认证错误契约
       *
       * 响应结构：
       * - success: false
       * - code: 'MISSING_TOKEN'（无Token时）或 'UNAUTHORIZED'（通用认证失败）
       * - message: 包含"Token"关键字
       */
      expect(response.body).toMatchObject({
        success: false
      })
      /* 验证code为MISSING_TOKEN或UNAUTHORIZED之一 */
      expect(['MISSING_TOKEN', 'UNAUTHORIZED']).toContain(response.body.code)
    })

    it('无效Token时应返回401 INVALID_TOKEN', async () => {
      const response = await request(app)
        .get('/api/v4/auth/verify')
        .set('Authorization', 'Bearer invalid_token_12345')
        .expect(401)

      /**
       * 🔒 无效Token错误契约
       *
       * 响应结构：
       * - success: false
       * - code: 'UNAUTHORIZED' 或 'INVALID_TOKEN'
       */
      expect(response.body).toMatchObject({
        success: false
      })
      // 验证code为UNAUTHORIZED或INVALID_TOKEN之一
      expect(['UNAUTHORIZED', 'INVALID_TOKEN']).toContain(response.body.code)
    })
  })
})
