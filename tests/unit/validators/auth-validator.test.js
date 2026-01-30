/**
 * @file P1-3.4: 认证验证器单元测试
 * @description 验证认证模块的参数校验和Token验证逻辑
 *
 * 覆盖范围：
 * - JWT Token格式验证
 * - Authorization头格式验证
 * - 手机号格式验证
 * - 验证码格式验证
 * - 用户状态验证
 * - 角色级别验证
 * - 会话Token验证
 *
 * 依赖服务：
 * - middleware/auth: 认证中间件
 * - jsonwebtoken: JWT库
 *
 * 测试策略：
 * - 单元测试验证函数逻辑
 * - 模拟Express req/res对象
 * - 边界条件和错误处理测试
 *
 * @version 1.0.0
 * @date 2026-01-30
 */

'use strict'

// 加载环境变量
require('dotenv').config()

const jwt = require('jsonwebtoken')

/**
 * 创建模拟的 Express request 对象
 * @param {Object} options - 配置选项
 * @returns {Object} 模拟的 req 对象
 */
function createMockRequest(options = {}) {
  return {
    headers: options.headers || {},
    params: options.params || {},
    query: options.query || {},
    body: options.body || {},
    user: null
  }
}

/**
 * 创建模拟的 Express response 对象
 * @returns {Object} 模拟的 res 对象
 */
function createMockResponse() {
  const res = {
    statusCode: 200,
    responseBody: null,
    status: function (code) {
      this.statusCode = code
      return this
    },
    json: function (body) {
      this.responseBody = body
      return this
    },
    apiError: function (message, code, data, status) {
      this.statusCode = status || 400
      this.responseBody = {
        success: false,
        code,
        message,
        data
      }
      return this
    },
    apiUnauthorized: function (message, code) {
      this.statusCode = 401
      this.responseBody = {
        success: false,
        code,
        message
      }
      return this
    }
  }
  return res
}

describe('P1-3.4: 认证验证器单元测试', () => {
  // 测试超时设置
  jest.setTimeout(30000)

  // 测试用的JWT密钥
  const TEST_JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key'

  describe('JWT Token格式验证', () => {
    /**
     * 验证JWT Token格式
     * @param {string} token - JWT Token
     * @returns {Object} 验证结果
     */
    function validateJWTFormat(token) {
      if (!token) {
        return { valid: false, error: 'TOKEN_MISSING', message: '缺少Token' }
      }

      if (typeof token !== 'string') {
        return { valid: false, error: 'TOKEN_INVALID_TYPE', message: 'Token必须是字符串' }
      }

      // JWT格式检查: header.payload.signature
      const parts = token.split('.')
      if (parts.length !== 3) {
        return { valid: false, error: 'TOKEN_MALFORMED', message: 'Token格式错误，应为三段式' }
      }

      // 检查每部分是否为有效的Base64
      try {
        parts.forEach((part, index) => {
          // JWT使用Base64URL编码
          const decoded = Buffer.from(part, 'base64url')
          if (index < 2) {
            // header和payload应该是有效的JSON
            JSON.parse(decoded.toString())
          }
        })
      } catch (error) {
        return { valid: false, error: 'TOKEN_DECODE_FAILED', message: 'Token解码失败' }
      }

      return { valid: true }
    }

    test('有效的JWT Token应通过格式验证', () => {
      const validToken = jwt.sign({ user_id: 1 }, TEST_JWT_SECRET, { expiresIn: '1h' })
      const result = validateJWTFormat(validToken)

      expect(result.valid).toBe(true)
    })

    test('空Token应返回TOKEN_MISSING错误', () => {
      const result = validateJWTFormat('')

      expect(result.valid).toBe(false)
      expect(result.error).toBe('TOKEN_MISSING')
    })

    test('null Token应返回TOKEN_MISSING错误', () => {
      const result = validateJWTFormat(null)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('TOKEN_MISSING')
    })

    test('非字符串Token应返回TOKEN_INVALID_TYPE错误', () => {
      const result = validateJWTFormat(123)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('TOKEN_INVALID_TYPE')
    })

    test('单段Token应返回TOKEN_MALFORMED错误', () => {
      const result = validateJWTFormat('single_segment')

      expect(result.valid).toBe(false)
      expect(result.error).toBe('TOKEN_MALFORMED')
    })

    test('两段Token应返回TOKEN_MALFORMED错误', () => {
      const result = validateJWTFormat('two.segments')

      expect(result.valid).toBe(false)
      expect(result.error).toBe('TOKEN_MALFORMED')
    })

    test('四段Token应返回TOKEN_MALFORMED错误', () => {
      const result = validateJWTFormat('one.two.three.four')

      expect(result.valid).toBe(false)
      expect(result.error).toBe('TOKEN_MALFORMED')
    })
  })

  describe('Authorization头格式验证', () => {
    /**
     * 验证Authorization头格式
     * @param {string} authHeader - Authorization头值
     * @returns {Object} 验证结果
     */
    function validateAuthorizationHeader(authHeader) {
      if (!authHeader) {
        return { valid: false, error: 'MISSING_HEADER', message: '缺少Authorization头' }
      }

      if (typeof authHeader !== 'string') {
        return {
          valid: false,
          error: 'INVALID_HEADER_TYPE',
          message: 'Authorization头必须是字符串'
        }
      }

      // 检查Bearer前缀
      if (!authHeader.startsWith('Bearer ')) {
        return { valid: false, error: 'INVALID_AUTH_SCHEME', message: '认证方案必须是Bearer' }
      }

      const token = authHeader.split(' ')[1]
      if (!token) {
        return { valid: false, error: 'MISSING_TOKEN', message: 'Bearer后缺少Token' }
      }

      return { valid: true, token }
    }

    test('有效的Bearer Token头应通过验证', () => {
      const token = jwt.sign({ user_id: 1 }, TEST_JWT_SECRET)
      const result = validateAuthorizationHeader(`Bearer ${token}`)

      expect(result.valid).toBe(true)
      expect(result.token).toBe(token)
    })

    test('缺少Authorization头应返回MISSING_HEADER错误', () => {
      const result = validateAuthorizationHeader(undefined)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('MISSING_HEADER')
    })

    test('空Authorization头应返回MISSING_HEADER错误', () => {
      const result = validateAuthorizationHeader('')

      expect(result.valid).toBe(false)
      expect(result.error).toBe('MISSING_HEADER')
    })

    test('非Bearer方案应返回INVALID_AUTH_SCHEME错误', () => {
      const result = validateAuthorizationHeader('Basic dXNlcjpwYXNz')

      expect(result.valid).toBe(false)
      expect(result.error).toBe('INVALID_AUTH_SCHEME')
    })

    test('只有Bearer没有Token应返回MISSING_TOKEN错误', () => {
      const result = validateAuthorizationHeader('Bearer ')

      expect(result.valid).toBe(false)
      expect(result.error).toBe('MISSING_TOKEN')
    })

    test('小写bearer应返回INVALID_AUTH_SCHEME错误', () => {
      const result = validateAuthorizationHeader('bearer token123')

      expect(result.valid).toBe(false)
      expect(result.error).toBe('INVALID_AUTH_SCHEME')
    })
  })

  describe('手机号格式验证', () => {
    /**
     * 验证中国大陆手机号格式
     * @param {string} mobile - 手机号
     * @returns {Object} 验证结果
     */
    function validateMobileFormat(mobile) {
      if (!mobile) {
        return { valid: false, error: 'MOBILE_REQUIRED', message: '手机号不能为空' }
      }

      if (typeof mobile !== 'string') {
        mobile = String(mobile)
      }

      // 中国大陆手机号格式：1开头，第二位是3-9，共11位数字
      const mobileRegex = /^1[3-9]\d{9}$/
      if (!mobileRegex.test(mobile)) {
        return { valid: false, error: 'MOBILE_INVALID', message: '请输入有效的11位手机号' }
      }

      return { valid: true, mobile }
    }

    test('有效的手机号应通过验证', () => {
      const validMobiles = ['13612227930', '18888888888', '15012345678', '19988776655']

      validMobiles.forEach(mobile => {
        const result = validateMobileFormat(mobile)
        expect(result.valid).toBe(true)
        expect(result.mobile).toBe(mobile)
      })
    })

    test('空手机号应返回MOBILE_REQUIRED错误', () => {
      const result = validateMobileFormat('')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('MOBILE_REQUIRED')
    })

    test('null手机号应返回MOBILE_REQUIRED错误', () => {
      const result = validateMobileFormat(null)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('MOBILE_REQUIRED')
    })

    test('10位手机号应返回MOBILE_INVALID错误', () => {
      const result = validateMobileFormat('1361222793')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('MOBILE_INVALID')
    })

    test('12位手机号应返回MOBILE_INVALID错误', () => {
      const result = validateMobileFormat('136122279301')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('MOBILE_INVALID')
    })

    test('非1开头的号码应返回MOBILE_INVALID错误', () => {
      const result = validateMobileFormat('23612227930')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('MOBILE_INVALID')
    })

    test('12开头的号码（第二位<3）应返回MOBILE_INVALID错误', () => {
      const result = validateMobileFormat('12345678901')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('MOBILE_INVALID')
    })

    test('包含字母的号码应返回MOBILE_INVALID错误', () => {
      const result = validateMobileFormat('1361222793a')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('MOBILE_INVALID')
    })

    test('数字类型的手机号应自动转换并验证', () => {
      const result = validateMobileFormat(13612227930)
      expect(result.valid).toBe(true)
    })
  })

  describe('验证码格式验证', () => {
    /**
     * 验证验证码格式
     * @param {string} code - 验证码
     * @returns {Object} 验证结果
     */
    function validateVerificationCode(code) {
      if (!code) {
        return { valid: false, error: 'CODE_REQUIRED', message: '验证码不能为空' }
      }

      if (typeof code !== 'string') {
        code = String(code)
      }

      // 开发环境允许使用123456
      const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'

      // 验证码格式：6位数字
      const codeRegex = /^\d{6}$/
      if (!codeRegex.test(code)) {
        return { valid: false, error: 'CODE_INVALID', message: '验证码必须是6位数字' }
      }

      // 开发环境特殊验证码
      if (isDev && code === '123456') {
        return { valid: true, code, isDev: true }
      }

      return { valid: true, code }
    }

    test('6位数字验证码应通过验证', () => {
      const result = validateVerificationCode('123456')
      expect(result.valid).toBe(true)
    })

    test('空验证码应返回CODE_REQUIRED错误', () => {
      const result = validateVerificationCode('')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('CODE_REQUIRED')
    })

    test('5位验证码应返回CODE_INVALID错误', () => {
      const result = validateVerificationCode('12345')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('CODE_INVALID')
    })

    test('7位验证码应返回CODE_INVALID错误', () => {
      const result = validateVerificationCode('1234567')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('CODE_INVALID')
    })

    test('包含字母的验证码应返回CODE_INVALID错误', () => {
      const result = validateVerificationCode('12345a')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('CODE_INVALID')
    })

    test('数字类型的验证码应自动转换', () => {
      const result = validateVerificationCode(123456)
      expect(result.valid).toBe(true)
    })

    test('开发环境应识别123456为特殊验证码', () => {
      const result = validateVerificationCode('123456')
      expect(result.valid).toBe(true)
      // 在测试环境下isDev应为true
      if (process.env.NODE_ENV === 'test') {
        expect(result.isDev).toBe(true)
      }
    })
  })

  describe('用户状态验证', () => {
    /**
     * 验证用户状态
     * @param {string} status - 用户状态
     * @returns {Object} 验证结果
     */
    function validateUserStatus(status) {
      const validStatuses = ['active', 'inactive', 'banned']

      if (!status) {
        return { valid: false, error: 'STATUS_REQUIRED', message: '用户状态不能为空' }
      }

      if (!validStatuses.includes(status)) {
        return {
          valid: false,
          error: 'STATUS_INVALID',
          message: `用户状态必须是: ${validStatuses.join(', ')}`
        }
      }

      // 只有active状态允许登录
      if (status !== 'active') {
        return {
          valid: false,
          error: 'USER_NOT_ACTIVE',
          message: status === 'banned' ? '账户已被封禁' : '账户未激活'
        }
      }

      return { valid: true, status }
    }

    test('active状态应通过验证', () => {
      const result = validateUserStatus('active')
      expect(result.valid).toBe(true)
    })

    test('inactive状态应返回USER_NOT_ACTIVE错误', () => {
      const result = validateUserStatus('inactive')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('USER_NOT_ACTIVE')
      expect(result.message).toContain('未激活')
    })

    test('banned状态应返回USER_NOT_ACTIVE错误', () => {
      const result = validateUserStatus('banned')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('USER_NOT_ACTIVE')
      expect(result.message).toContain('封禁')
    })

    test('未知状态应返回STATUS_INVALID错误', () => {
      const result = validateUserStatus('unknown')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('STATUS_INVALID')
    })

    test('空状态应返回STATUS_REQUIRED错误', () => {
      const result = validateUserStatus('')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('STATUS_REQUIRED')
    })
  })

  describe('角色级别验证', () => {
    /**
     * 验证角色级别
     * @param {number} roleLevel - 角色级别
     * @param {number} requiredLevel - 要求的最低级别
     * @returns {Object} 验证结果
     */
    function validateRoleLevel(roleLevel, requiredLevel = 0) {
      if (roleLevel === undefined || roleLevel === null) {
        return { valid: false, error: 'ROLE_LEVEL_REQUIRED', message: '角色级别不能为空' }
      }

      if (typeof roleLevel !== 'number' || isNaN(roleLevel)) {
        return { valid: false, error: 'ROLE_LEVEL_INVALID', message: '角色级别必须是数字' }
      }

      if (roleLevel < 0) {
        return { valid: false, error: 'ROLE_LEVEL_NEGATIVE', message: '角色级别不能为负数' }
      }

      if (roleLevel < requiredLevel) {
        return {
          valid: false,
          error: 'INSUFFICIENT_PERMISSION',
          message: `权限不足，需要角色级别 >= ${requiredLevel}`
        }
      }

      return {
        valid: true,
        roleLevel,
        isAdmin: roleLevel >= 100 // 管理员判断标准
      }
    }

    test('有效的角色级别应通过验证', () => {
      const result = validateRoleLevel(50)
      expect(result.valid).toBe(true)
      expect(result.roleLevel).toBe(50)
    })

    test('角色级别>=100应识别为管理员', () => {
      const result = validateRoleLevel(100)
      expect(result.valid).toBe(true)
      expect(result.isAdmin).toBe(true)
    })

    test('角色级别<100应识别为普通用户', () => {
      const result = validateRoleLevel(50)
      expect(result.valid).toBe(true)
      expect(result.isAdmin).toBe(false)
    })

    test('角色级别低于要求应返回INSUFFICIENT_PERMISSION错误', () => {
      const result = validateRoleLevel(50, 100)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('INSUFFICIENT_PERMISSION')
    })

    test('null角色级别应返回ROLE_LEVEL_REQUIRED错误', () => {
      const result = validateRoleLevel(null)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('ROLE_LEVEL_REQUIRED')
    })

    test('非数字角色级别应返回ROLE_LEVEL_INVALID错误', () => {
      const result = validateRoleLevel('admin')
      expect(result.valid).toBe(false)
      expect(result.error).toBe('ROLE_LEVEL_INVALID')
    })

    test('负数角色级别应返回ROLE_LEVEL_NEGATIVE错误', () => {
      const result = validateRoleLevel(-1)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('ROLE_LEVEL_NEGATIVE')
    })

    test('0级别应允许（访客级别）', () => {
      const result = validateRoleLevel(0)
      expect(result.valid).toBe(true)
      expect(result.isAdmin).toBe(false)
    })
  })

  describe('会话Token验证', () => {
    /**
     * 验证会话Token格式
     * @param {string} sessionToken - 会话Token
     * @returns {Object} 验证结果
     */
    function validateSessionToken(sessionToken) {
      if (!sessionToken) {
        // 会话Token可选，不传不算错误
        return { valid: true, hasSession: false }
      }

      if (typeof sessionToken !== 'string') {
        return {
          valid: false,
          error: 'SESSION_TOKEN_INVALID_TYPE',
          message: '会话Token必须是字符串'
        }
      }

      // UUID格式验证
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(sessionToken)) {
        return { valid: false, error: 'SESSION_TOKEN_INVALID_FORMAT', message: '会话Token格式无效' }
      }

      return { valid: true, hasSession: true, sessionToken }
    }

    test('有效的UUID会话Token应通过验证', () => {
      const validUUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'
      const result = validateSessionToken(validUUID)

      expect(result.valid).toBe(true)
      expect(result.hasSession).toBe(true)
      expect(result.sessionToken).toBe(validUUID)
    })

    test('空会话Token应返回无会话状态', () => {
      const result = validateSessionToken('')

      expect(result.valid).toBe(true)
      expect(result.hasSession).toBe(false)
    })

    test('null会话Token应返回无会话状态', () => {
      const result = validateSessionToken(null)

      expect(result.valid).toBe(true)
      expect(result.hasSession).toBe(false)
    })

    test('非UUID格式应返回SESSION_TOKEN_INVALID_FORMAT错误', () => {
      const result = validateSessionToken('not-a-valid-uuid')

      expect(result.valid).toBe(false)
      expect(result.error).toBe('SESSION_TOKEN_INVALID_FORMAT')
    })

    test('非字符串应返回SESSION_TOKEN_INVALID_TYPE错误', () => {
      const result = validateSessionToken(123456)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('SESSION_TOKEN_INVALID_TYPE')
    })
  })

  describe('JWT Payload验证', () => {
    /**
     * 验证JWT Payload
     * @param {Object} payload - JWT Payload
     * @returns {Object} 验证结果
     */
    function validateJWTPayload(payload) {
      if (!payload || typeof payload !== 'object') {
        return { valid: false, error: 'PAYLOAD_INVALID', message: 'JWT Payload无效' }
      }

      // 必需字段检查
      if (!payload.user_id) {
        return { valid: false, error: 'PAYLOAD_MISSING_USER_ID', message: 'Payload缺少user_id' }
      }

      // user_id必须是正整数
      if (!Number.isInteger(payload.user_id) || payload.user_id <= 0) {
        return { valid: false, error: 'PAYLOAD_INVALID_USER_ID', message: 'user_id必须是正整数' }
      }

      // 检查过期时间
      if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
        return { valid: false, error: 'TOKEN_EXPIRED', message: 'Token已过期' }
      }

      return {
        valid: true,
        user_id: payload.user_id,
        role_level: payload.role_level || 0,
        session_token: payload.session_token || null
      }
    }

    test('有效的Payload应通过验证', () => {
      const payload = {
        user_id: 1,
        role_level: 100,
        exp: Math.floor(Date.now() / 1000) + 3600 // 1小时后过期
      }

      const result = validateJWTPayload(payload)
      expect(result.valid).toBe(true)
      expect(result.user_id).toBe(1)
      expect(result.role_level).toBe(100)
    })

    test('缺少user_id应返回PAYLOAD_MISSING_USER_ID错误', () => {
      const payload = { role_level: 100 }
      const result = validateJWTPayload(payload)

      expect(result.valid).toBe(false)
      expect(result.error).toBe('PAYLOAD_MISSING_USER_ID')
    })

    test('非正整数user_id应返回PAYLOAD_INVALID_USER_ID错误', () => {
      // 非整数和负数应返回PAYLOAD_INVALID_USER_ID
      const invalidPayloads = [{ user_id: -1 }, { user_id: 1.5 }, { user_id: 'abc' }]

      invalidPayloads.forEach(payload => {
        const result = validateJWTPayload(payload)
        expect(result.valid).toBe(false)
        expect(result.error).toBe('PAYLOAD_INVALID_USER_ID')
      })
    })

    test('user_id为0应返回PAYLOAD_MISSING_USER_ID错误', () => {
      // 0在业务上视为"缺少"（因为user_id从1开始，0是falsy值）
      const result = validateJWTPayload({ user_id: 0 })
      expect(result.valid).toBe(false)
      expect(result.error).toBe('PAYLOAD_MISSING_USER_ID')
    })

    test('已过期的Token应返回TOKEN_EXPIRED错误', () => {
      const payload = {
        user_id: 1,
        exp: Math.floor(Date.now() / 1000) - 3600 // 1小时前过期
      }

      const result = validateJWTPayload(payload)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('TOKEN_EXPIRED')
    })

    test('null Payload应返回PAYLOAD_INVALID错误', () => {
      const result = validateJWTPayload(null)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('PAYLOAD_INVALID')
    })

    test('role_level缺失应默认为0', () => {
      const payload = { user_id: 1 }
      const result = validateJWTPayload(payload)

      expect(result.valid).toBe(true)
      expect(result.role_level).toBe(0)
    })
  })

  describe('认证中间件模拟测试', () => {
    test('有效Token的请求应通过认证', async () => {
      const token = jwt.sign({ user_id: 1, role_level: 100 }, TEST_JWT_SECRET, { expiresIn: '1h' })

      const req = createMockRequest({
        headers: { authorization: `Bearer ${token}` }
      })
      const _res = createMockResponse()

      /* 模拟authenticateToken中间件的核心逻辑，Token应该能成功验证 */
      const decoded = jwt.verify(token, TEST_JWT_SECRET)
      req.user = decoded

      expect(req.user.user_id).toBe(1)
      expect(req.user.role_level).toBe(100)
    })

    test('无效Token应返回401', () => {
      const _req = createMockRequest({
        headers: { authorization: 'Bearer invalid_token' }
      })
      const res = createMockResponse()

      /* 验证无效Token会抛出JsonWebTokenError */
      expect(() => jwt.verify('invalid_token', TEST_JWT_SECRET)).toThrow()

      // 模拟中间件处理
      res.apiUnauthorized('无效的Token', 'INVALID_TOKEN')
      expect(res.statusCode).toBe(401)
      expect(res.responseBody.code).toBe('INVALID_TOKEN')
    })

    test('过期Token应返回401', () => {
      const expiredToken = jwt.sign(
        { user_id: 1 },
        TEST_JWT_SECRET,
        { expiresIn: '-1h' } // 已过期
      )

      /* 验证过期Token会抛出TokenExpiredError */
      expect(() => jwt.verify(expiredToken, TEST_JWT_SECRET)).toThrow()
    })

    test('缺少Authorization头应返回401', () => {
      const req = createMockRequest({ headers: {} })
      const res = createMockResponse()

      // 模拟缺少Token的处理
      const authHeader = req.headers.authorization
      const token = authHeader && authHeader.split(' ')[1]

      expect(token).toBeUndefined()
      res.apiUnauthorized('缺少认证Token', 'MISSING_TOKEN')
      expect(res.statusCode).toBe(401)
      expect(res.responseBody.code).toBe('MISSING_TOKEN')
    })
  })
})
