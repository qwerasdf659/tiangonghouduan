/**
 * auth 中间件测试套件
 * 🔧 V4版本 - 使用真实数据替代mock，测试实际业务逻辑
 * 更新时间：2025年09月23日 22:43:20 UTC
 */

const { authenticateToken, generateTokens, requireAdmin } = require('../../middleware/auth.js')
const jwt = require('jsonwebtoken')

describe('auth 中间件测试 - 真实业务逻辑', () => {
  let validUser, adminUser, validToken, _adminToken

  beforeAll(() => {
    // 真实的测试用户数据
    validUser = {
      user_id: 13612227930,
      mobile: '13612227930',
      is_admin: false
    }

    adminUser = {
      user_id: 13612227930,
      mobile: '13612227930',
      is_admin: true
    }

    // 生成真实的JWT token
    validToken = generateTokens(validUser).accessToken
    _adminToken = generateTokens(adminUser).accessToken // 备用管理员token
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
    test('✅ 管理员token应该通过管理员验证', async () => {
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

      await requireAdmin(req, res, next)

      expect(nextCalled).toBe(true)
    })

    test('❌ 普通用户应该被拒绝管理员权限', async () => {
      const req = {
        user: validUser
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

      await requireAdmin(req, res, next)

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
      expect(decoded.is_admin).toBe(validUser.is_admin)
      expect(decoded.type).toBe('access')
    })
  })
})
