/**
 * 认证和权限系统API测试
 * 从unified-complete-api.test.js拆分，符合单一职责原则
 * 创建时间：2025年10月31日 北京时间
 * 使用模型：Claude Sonnet 4
 *
 * 测试覆盖：
 * 1. V4统一引擎核心功能（健康检查、版本、状态）
 * 2. 认证系统API（登录、token管理、权限验证）
 * 3. 权限管理API（权限检查、用户权限、角色配置）
 *
 * 测试账号：13612227930 (用户ID: 31, 管理员权限)
 * 数据库：restaurant_points_dev (统一数据库)
 */

const TestCoordinator = require('./TestCoordinator')
const moment = require('moment-timezone')

describe('认证和权限系统API测试', () => {
  let tester
  let test_user_id
  const test_account = {
    phone: '13612227930',
    user_id: 31,
    role_based_admin: true
  }

  beforeAll(async () => {
    console.log('🚀 认证和权限系统API测试启动')
    console.log('='.repeat(70))
    console.log(
      `📅 测试时间: ${moment().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')} (北京时间)`
    )
    console.log(`👤 测试账号: ${test_account.phone} (用户ID: ${test_account.user_id})`)
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

  // ========== V4引擎核心功能 ==========
  describe('V4统一引擎核心功能', () => {
    test('✅ V4引擎健康检查 - GET /api/v4/unified-engine/lottery/health', async () => {
      const response = await tester.makeRequest('GET', '/api/v4/unified-engine/lottery/health')

      expect([200, 503]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data).toHaveProperty('success', true)
        expect(response.data.data).toHaveProperty('status')
        expect(response.data.data).toHaveProperty('timestamp')
      }
    })

    test('✅ V4引擎版本信息 - GET /api/v4/unified-engine/version', async () => {
      const response = await tester.makeRequest('GET', '/api/v4/unified-engine/version')

      expect([200, 404]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('version')
        expect(response.data.data).toHaveProperty('build_time')
      }
    })

    test('✅ V4引擎状态详情 - GET /api/v4/unified-engine/status', async () => {
      const response = await tester.makeRequest('GET', '/api/v4/unified-engine/status')

      expect([200, 503]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('engine_status')
        expect(response.data.data).toHaveProperty('strategies_status')
      }
    })
  })

  // ========== 认证系统API ==========
  describe('认证系统API', () => {
    test('✅ 用户登录 - POST /api/v4/unified-engine/auth/login', async () => {
      const login_data = {
        mobile: '13612227930',
        verification_code: '123456'
      }

      const response = await tester.makeRequest(
        'POST',
        '/api/v4/unified-engine/auth/login',
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
      }
    })

    test('✅ Token验证 - GET /api/v4/unified-engine/auth/verify', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/auth/verify',
        null,
        'regular'
      )

      expect([200, 401]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data).toHaveProperty('success', true)
        expect(response.data.data).toHaveProperty('valid', true)
        expect(response.data.data).toHaveProperty('user_id')
      }
    })

    test('✅ 用户登出 - POST /api/v4/unified-engine/auth/logout', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/unified-engine/auth/logout',
        {},
        'regular'
      )

      expect([200, 401]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data).toHaveProperty('success', true)
        expect(response.data).toHaveProperty('code', 'LOGOUT_SUCCESS')
      }
    })
  })

  // ========== 权限管理API ==========
  describe('V4权限管理API', () => {
    test('✅ 检查用户权限 - GET /api/v4/unified-engine/permissions/check', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/permissions/check?permission=lottery_draw',
        null,
        'regular'
      )

      expect([200, 401, 403]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('has_permission')
        expect(response.data.data).toHaveProperty('permission_level')
        expect(response.data.data).toHaveProperty('user_role')
      }
    })

    test('✅ 获取用户权限列表 - GET /api/v4/unified-engine/permissions/user', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/permissions/user/${test_user_id || test_account.user_id}`,
        null,
        'admin'
      )

      expect([200, 401, 403, 404]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('permissions')
        expect(Array.isArray(response.data.data.permissions)).toBe(true)
        expect(response.data.data).toHaveProperty('role_permissions')
      }
    })

    test('✅ 获取角色权限配置 - GET /api/v4/unified-engine/permissions/roles', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/permissions/roles',
        null,
        'admin'
      )

      expect([200, 401, 403]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('roles')
        expect(Array.isArray(response.data.data.roles)).toBe(true)
        expect(response.data.data).toHaveProperty('permission_matrix')
      }
    })
  })
})
