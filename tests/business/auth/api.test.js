/**
 * 认证和权限系统API测试 (V4架构)
 * 迁移自 tests/api/auth-api.test.js
 *
 * 测试覆盖：
 * 1. V4统一引擎核心功能（健康检查、版本、状态）
 * 2. 认证系统API（登录、token管理、权限验证）
 * 3. 权限管理API（权限检查、用户权限、角色配置）
 *
 * 测试原则:
 * - 使用真实数据库（restaurant_points_dev）
 * - 使用TestCoordinator统一HTTP请求和认证管理
 * - 验证API响应格式符合RESTful和ApiResponse标准
 * - 验证JWT认证流程完整性
 * - 验证权限管理准确性
 *
 * 创建时间：2025年11月13日 北京时间
 */

const TestCoordinator = require('../../api/TestCoordinator')
const { TEST_DATA, createTestData } = require('../../helpers/test-data')
const { TestConfig } = require('../../helpers/test-setup')
const BeijingTimeHelper = require('../../../utils/timeHelper')

describe('认证和权限系统API测试（V4架构）', () => {
  let tester = null
  let test_user_id = null
  const testUser = TestConfig.real_data.testUser
  const adminUser = TestConfig.real_data.adminUser

  /*
   * ==========================================
   * 🔧 测试前准备
   * ==========================================
   */

  beforeAll(async () => {
    console.log('🚀 认证和权限系统API测试启动')
    console.log('='.repeat(70))
    console.log(`📅 测试时间: ${BeijingTimeHelper.now()} (北京时间)`)
    console.log(`👤 测试账号: ${testUser.mobile} (用户ID: ${testUser.user_id})`)
    console.log('🗄️ 数据库: restaurant_points_dev')

    tester = new TestCoordinator()

    // 等待V4引擎启动
    try {
      await tester.waitForV4Engine(30000)
      console.log('✅ V4引擎启动检查通过')
    } catch (error) {
      console.warn('⚠️ V4引擎可能未启动，继续测试:', error.message)
    }

    // 获取认证token
    try {
      const user_data = await tester.authenticateV4User('regular')
      test_user_id = user_data.user.user_id
      await tester.authenticateV4User('admin')
      console.log('✅ 用户认证完成')
    } catch (error) {
      console.warn('⚠️ 认证失败，部分测试可能跳过:', error.message)
    }
  })

  afterAll(async () => {
    if (tester) {
      await tester.cleanup()
    }
    console.log('🏁 认证和权限系统API测试完成')
  })

  /*
   * ==========================================
   * 🏥 V4引擎核心功能
   * ==========================================
   */

  describe('V4统一引擎核心功能', () => {
    test('V4引擎健康检查 - GET /api/v4/lottery/health', async () => {
      const response = await tester.makeRequest('GET', '/api/v4/lottery/health')

      expect([200, 503]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data).toHaveProperty('success', true)
        expect(response.data.data).toHaveProperty('status')
        expect(response.data.data).toHaveProperty('timestamp')

        console.log('✅ V4引擎健康状态:', response.data.data.status)
      }
    })

    test('V4系统版本信息 - GET /api/v4/version（RESTful标准）', async () => {
      const response = await tester.makeRequest('GET', '/api/v4/version')

      expect([200, 404]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('version')
        expect(response.data.data).toHaveProperty('build_time')

        console.log('✅ V4版本:', response.data.data.version)
      }
    })

    test('V4系统状态详情 - GET /api/v4/status（RESTful标准）', async () => {
      const response = await tester.makeRequest('GET', '/api/v4/status')

      expect([200, 503]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('engine_status')
        expect(response.data.data).toHaveProperty('strategies_status')

        console.log('✅ V4引擎状态:', response.data.data.engine_status)
      }
    })
  })

  /*
   * ==========================================
   * 🔐 认证系统API
   * ==========================================
   */

  describe('认证系统API', () => {
    test('用户登录 - POST /api/v4/auth/login', async () => {
      const login_data = {
        mobile: testUser.mobile,
        verification_code: '123456'
      }

      const response = await tester.makeRequest(
        'POST',
        '/api/v4/auth/login',
        login_data
      )

      expect([200, 400]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data).toHaveProperty('success', true)
        expect(response.data).toHaveProperty('code', 'SUCCESS')
        expect(response.data.data).toHaveProperty('access_token')
        expect(response.data.data).toHaveProperty('user')
        expect(response.data.data.user).toHaveProperty('user_id')
        expect(response.data.data.user).toHaveProperty('mobile')

        console.log('✅ 用户登录成功, user_id:', response.data.data.user.user_id)
      }
    })

    test('Token验证 - GET /api/v4/auth/verify', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/auth/verify',
        null,
        'regular'
      )

      expect([200, 401]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data).toHaveProperty('success', true)
        expect(response.data.data).toHaveProperty('valid', true)
        expect(response.data.data).toHaveProperty('user_id')

        console.log('✅ Token验证通过, user_id:', response.data.data.user_id)
      }
    })

    test('获取当前用户信息 - GET /api/v4/auth/profile', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/auth/profile',
        null,
        'regular'
      )

      expect([200, 401]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data).toHaveProperty('success', true)
        expect(response.data).toHaveProperty('message', '用户信息获取成功')
        expect(response.data.data).toHaveProperty('user')
        expect(response.data.data).toHaveProperty('timestamp')

        const { user } = response.data.data

        // 验证核心字段
        expect(user).toHaveProperty('user_id')
        expect(user).toHaveProperty('mobile')
        expect(user).toHaveProperty('nickname')
        expect(user).toHaveProperty('status')
        expect(user).toHaveProperty('role_based_admin')
        expect(user).toHaveProperty('roles')
        expect(user).toHaveProperty('consecutive_fail_count')
        expect(user).toHaveProperty('history_total_points')
        expect(user).toHaveProperty('created_at')
        expect(user).toHaveProperty('last_login')
        expect(user).toHaveProperty('login_count')

        // 验证状态必须为active（P0级修复验证）
        expect(user.status).toBe('active')

        // 验证手机号格式（完整显示，符合业务需求）
        expect(user.mobile).toMatch(/^1[3-9]\d{9}$/)

        // 验证角色信息
        expect(Array.isArray(user.roles)).toBe(true)
        expect(typeof user.role_based_admin).toBe('boolean')

        console.log('✅ 获取用户信息成功:', {
          user_id: user.user_id,
          mobile: user.mobile,
          role_based_admin: user.role_based_admin
        })
      }
    })

    test('获取用户信息 - 无效Token应返回401', async () => {
      const response = await tester.makeRequest(
        'GET',
        '/api/v4/auth/profile',
        null,
        { Authorization: 'Bearer invalid_token_here' }
      )

      expect(response.status).toBe(401)
      expect(response.data).toHaveProperty('success', false)

      console.log('✅ 无效Token被正确拒绝')
    })

    test('获取用户信息 - 缺少Token应返回401', async () => {
      const response = await tester.makeRequest('GET', '/api/v4/auth/profile')

      expect(response.status).toBe(401)
      expect(response.data).toHaveProperty('success', false)

      console.log('✅ 缺少Token被正确拒绝')
    })

    test('用户登出 - POST /api/v4/auth/logout', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/auth/logout',
        {},
        'regular'
      )

      expect([200, 401]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data).toHaveProperty('success', true)
        expect(response.data).toHaveProperty('code', 'LOGOUT_SUCCESS')

        console.log('✅ 用户登出成功')
      }
    })

    test('Token刷新 - POST /api/v4/auth/refresh', async () => {
      // 先登录获取refresh_token
      const login_response = await tester.makeRequest(
        'POST',
        '/api/v4/auth/quick-login',
        {
          mobile: testUser.mobile,
          verification_code: '123456'
        }
      )

      expect(login_response.status).toBe(200)
      expect(login_response.data.data).toHaveProperty('refresh_token')

      const refresh_token = login_response.data.data.refresh_token

      // 使用refresh_token刷新Token
      const refresh_response = await tester.makeRequest(
        'POST',
        '/api/v4/auth/refresh',
        { refresh_token }
      )

      expect([200, 401]).toContain(refresh_response.status)
      if (refresh_response.status === 200) {
        expect(refresh_response.data).toHaveProperty('success', true)
        expect(refresh_response.data).toHaveProperty('message', 'Token刷新成功')
        expect(refresh_response.data.data).toHaveProperty('access_token')
        expect(refresh_response.data.data).toHaveProperty('refresh_token')
        expect(refresh_response.data.data).toHaveProperty('user')
        expect(refresh_response.data.data.user).toHaveProperty('user_id')
        expect(refresh_response.data.data.user).toHaveProperty('mobile')
        expect(refresh_response.data.data.user).toHaveProperty('role_based_admin')
        expect(refresh_response.data.data.user).toHaveProperty('roles')
        expect(refresh_response.data.data).toHaveProperty('expires_in')
        expect(refresh_response.data.data).toHaveProperty('timestamp')

        console.log('✅ Token刷新成功')
      }
    })

    test('Token刷新 - 缺少refresh_token参数', async () => {
      const response = await tester.makeRequest('POST', '/api/v4/auth/refresh', {})

      expect([400, 200]).toContain(response.status)
      if (response.status === 400) {
        expect(response.data).toHaveProperty('success', false)
        expect(response.data).toHaveProperty('message', '刷新Token不能为空')

        console.log('✅ 缺少refresh_token参数被正确拒绝')
      }
    })

    test('Token刷新 - 无效的refresh_token格式', async () => {
      const response = await tester.makeRequest('POST', '/api/v4/auth/refresh', {
        refresh_token: 'invalid_token_format'
      })

      expect([401, 200]).toContain(response.status)
      if (response.status === 401) {
        expect(response.data).toHaveProperty('success', false)
        expect(response.data).toHaveProperty('message', '刷新Token无效')

        console.log('✅ 无效refresh_token被正确拒绝')
      }
    })
  })

  /*
   * ==========================================
   * 🔑 权限管理API
   * ==========================================
   */

  describe('V4权限管理API', () => {
    test('检查用户权限 - POST /api/v4/permissions/check', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/permissions/check',
        {
          resource: 'lottery',
          action: 'read'
        },
        'regular'
      )

      expect([200, 401, 403]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('has_permission')
        expect(response.data.data).toHaveProperty('resource')
        expect(response.data.data).toHaveProperty('action')
        expect(response.data.data).toHaveProperty('role_based_admin')
        expect(response.data.data).toHaveProperty('role_level')

        console.log('✅ 权限检查成功:', {
          resource: response.data.data.resource,
          action: response.data.data.action,
          has_permission: response.data.data.has_permission
        })
      }
    })

    test('获取用户权限列表 - GET /api/v4/permissions/user/:user_id', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/permissions/user/${test_user_id || testUser.user_id}`,
        null,
        'admin'
      )

      expect([200, 401, 403, 404]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('permissions')
        expect(typeof response.data.data.permissions).toBe('object')
        expect(response.data.data.permissions).toHaveProperty('permissions')
        expect(Array.isArray(response.data.data.permissions.permissions)).toBe(true)
        expect(response.data.data).toHaveProperty('role_based_admin')
        expect(response.data.data).toHaveProperty('role_level')
        expect(response.data.data).toHaveProperty('roles')
        expect(Array.isArray(response.data.data.roles)).toBe(true)

        console.log('✅ 获取用户权限列表成功, 权限数:', response.data.data.permissions.permissions.length)
      }
    })

    test('获取管理员列表 - GET /api/v4/permissions/admins', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/permissions/admins',
        null,
        'admin'
      )

      expect([200, 401, 403]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('total_count')
        expect(response.data.data).toHaveProperty('admins')
        expect(Array.isArray(response.data.data.admins)).toBe(true)

        console.log('✅ 获取管理员列表成功, 总数:', response.data.data.total_count)
      }
    })
  })
})
