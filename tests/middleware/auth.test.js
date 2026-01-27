/**
 * auth 中间件测试套件 - V4.0 统一架构版本
 * 🛡️ 测试UUID角色系统的认证中间件功能
 * 创建时间：2025年01月21日
 * 更新时间：2025年01月28日
 * 🔴 P0-1修复（2026-01-08）：移除硬编码 user_id=31，从 global.testData 动态获取
 */

const { authenticateToken, generateTokens, requireRoleLevel } = require('../../middleware/auth.js')
const jwt = require('jsonwebtoken')

describe('auth 中间件测试 - UUID角色系统', () => {
  let validUser, adminUser, validToken, _adminToken

  beforeAll(async () => {
    // 🔴 P0-1修复：从 global.testData 获取动态测试用户ID
    const testUserId = global.testData?.testUser?.user_id
    if (!testUserId) {
      console.warn('⚠️ [auth.test.js] global.testData.testUser.user_id 未初始化，测试可能失败')
    }

    /*
     * 真实的测试用户数据（基于UUID角色系统）
     * 🔴 P0-1修复：使用动态 user_id
     */
    validUser = {
      user_id: testUserId, // 🔴 P0-1修复：动态获取，不再硬编码
      mobile: '13612227930',
      status: 'active'
    }

    adminUser = {
      user_id: testUserId, // 🔴 P0-1修复：动态获取，不再硬编码
      mobile: '13612227930',
      status: 'active',
      role_level: 100 // 管理员权限级别
    }

    // 生成真实的JWT token
    const userTokens = await generateTokens(validUser)
    const adminTokens = await generateTokens(adminUser)

    validToken = userTokens.access_token
    _adminToken = adminTokens.access_token
  })

  describe('🔐 JWT Token验证测试', () => {
    test('✅ 有效token应该通过验证', async () => {
      const req = {
        headers: {
          authorization: `Bearer ${validToken}`
        }
      }
      const res = {
        status: function (code) {
          this.statusCode = code
          return this
        },
        json: function (data) {
          this.jsonData = data
          return this
        }
      }
      let nextCalled = false
      const next = () => {
        nextCalled = true
      }

      await authenticateToken(req, res, next)

      expect(nextCalled).toBe(true)
      expect(req.user).toBeDefined()
      expect(req.user.user_id).toBe(validUser.user_id)
    })

    test('❌ 无效token应该被拒绝', async () => {
      const req = {
        headers: {
          authorization: 'Bearer invalid_token'
        }
      }
      const res = {
        statusCode: null,
        jsonData: null,
        status: function (code) {
          this.statusCode = code
          return this
        },
        json: function (data) {
          this.jsonData = data
          return this
        }
      }
      let nextCalled = false
      const next = () => {
        nextCalled = true
      }

      await authenticateToken(req, res, next)

      expect(nextCalled).toBe(false)
      expect(res.statusCode).toBe(401)
      expect(res.jsonData.message).toContain('无效')
    })

    test('❌ 缺少Authorization header应该被拒绝', async () => {
      const req = {
        headers: {}
      }
      const res = {
        statusCode: null,
        jsonData: null,
        status: function (code) {
          this.statusCode = code
          return this
        },
        json: function (data) {
          this.jsonData = data
          return this
        }
      }
      let nextCalled = false
      const next = () => {
        nextCalled = true
      }

      await authenticateToken(req, res, next)

      expect(nextCalled).toBe(false)
      expect(res.statusCode).toBe(401)
    })
  })

  describe('🔑 管理员权限验证测试', () => {
    test('✅ 管理员token应该通过管理员验证（role_level >= 100）', async () => {
      const req = {
        user: adminUser
      }
      const res = {
        statusCode: null,
        jsonData: null,
        status: function (code) {
          this.statusCode = code
          return this
        },
        json: function (data) {
          this.jsonData = data
          return this
        }
      }
      let nextCalled = false
      const next = () => {
        nextCalled = true
      }

      // 使用 requireRoleLevel(100) 替代废弃的 requireAdmin
      const middleware = requireRoleLevel(100)
      await middleware(req, res, next)

      expect(nextCalled).toBe(true)
    })

    test('❌ 普通用户应该被拒绝管理员权限（role_level < 100）', async () => {
      // 模拟一个普通用户（role_level < 100）
      const normalUser = {
        user_id: 999, // 模拟的普通用户ID
        mobile: '13800000000',
        status: 'active',
        role_level: 0 // 普通用户级别
      }

      const req = {
        user: normalUser
      }
      const res = {
        statusCode: null,
        jsonData: null,
        status: function (code) {
          this.statusCode = code
          return this
        },
        json: function (data) {
          this.jsonData = data
          return this
        }
      }
      let nextCalled = false
      const next = () => {
        nextCalled = true
      }

      // 使用 requireRoleLevel(100) 替代废弃的 requireAdmin
      const middleware = requireRoleLevel(100)
      await middleware(req, res, next)

      expect(nextCalled).toBe(false)
      expect(res.statusCode).toBe(403)
    })

    test('✅ 运营人员（role_level=30）应该通过 requireRoleLevel(30) 验证', async () => {
      const opsUser = {
        user_id: 998,
        mobile: '13800000001',
        status: 'active',
        role_level: 30 // 运营权限级别
      }

      const req = {
        user: opsUser
      }
      const res = {
        statusCode: null,
        jsonData: null,
        status: function (code) {
          this.statusCode = code
          return this
        },
        json: function (data) {
          this.jsonData = data
          return this
        }
      }
      let nextCalled = false
      const next = () => {
        nextCalled = true
      }

      const middleware = requireRoleLevel(30)
      await middleware(req, res, next)

      expect(nextCalled).toBe(true)
    })

    test('❌ 运营人员（role_level=30）应该被拒绝管理员权限（requireRoleLevel(100)）', async () => {
      const opsUser = {
        user_id: 998,
        mobile: '13800000001',
        status: 'active',
        role_level: 30 // 运营权限级别
      }

      const req = {
        user: opsUser
      }
      const res = {
        statusCode: null,
        jsonData: null,
        status: function (code) {
          this.statusCode = code
          return this
        },
        json: function (data) {
          this.jsonData = data
          return this
        }
      }
      let nextCalled = false
      const next = () => {
        nextCalled = true
      }

      const middleware = requireRoleLevel(100)
      await middleware(req, res, next)

      expect(nextCalled).toBe(false)
      expect(res.statusCode).toBe(403)
    })
  })

  describe('🕐 Token时效性测试', () => {
    test('✅ 未过期token应该有效', () => {
      const decoded = jwt.decode(validToken)
      const now = Math.floor(Date.now() / 1000)

      expect(decoded.exp).toBeGreaterThan(now)
      expect(decoded.user_id).toBe(validUser.user_id)
    })

    test('🔍 Token载荷应该包含正确信息', () => {
      const decoded = jwt.decode(validToken)

      expect(decoded.user_id).toBe(validUser.user_id)
      expect(decoded.mobile).toBe(validUser.mobile)
      expect(decoded.role_level).toBeDefined() // 应该包含角色级别
      expect(decoded.type).toBe(undefined) // access token没有type字段
    })
  })
})
