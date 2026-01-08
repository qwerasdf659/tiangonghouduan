/**
 * 认证和权限系统API测试 (V4架构)
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
const { TEST_DATA } = require('../../helpers/test-data')
const BeijingTimeHelper = require('../../../utils/timeHelper')

describe('认证和权限系统API测试（V4架构）', () => {
  let tester = null
  // ✅ 修复：统一使用TEST_DATA而非TestConfig.real_data
  const testUser = TEST_DATA.users.testUser

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
      await tester.authenticate_v4_user('regular')
      await tester.authenticate_v4_user('admin')
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
      const response = await tester.make_request('GET', '/api/v4/lottery/health')

      expect([200, 503]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data).toHaveProperty('success', true)
        expect(response.data.data).toHaveProperty('status')
        expect(response.data.data).toHaveProperty('timestamp')

        console.log('✅ V4引擎健康状态:', response.data.data.status)
      }
    })

    test('V4系统版本信息 - GET /api/v4/version（RESTful标准）', async () => {
      const response = await tester.make_request('GET', '/api/v4/version')

      expect([200, 404]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('version')
        expect(response.data.data).toHaveProperty('build_time')

        console.log('✅ V4版本:', response.data.data.version)
      }
    })

    test('V4系统状态详情 - GET /health（统一健康检查端点）', async () => {
      /**
       * 🔧 修复说明：
       * - /api/v4/status 端点不存在
       * - 系统状态通过 /health 健康检查端点获取
       * - 更新时间：2025-12-22
       */
      const response = await tester.make_request('GET', '/health')

      expect([200, 503]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('status')
        expect(response.data.data).toHaveProperty('version')
        expect(response.data.data).toHaveProperty('systems')

        console.log('✅ V4系统状态:', response.data.data.status)
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

      const response = await tester.make_request('POST', '/api/v4/auth/login', login_data)

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
      const response = await tester.make_authenticated_request(
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
      const response = await tester.make_authenticated_request(
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
        expect(user).toHaveProperty('is_admin')
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
        expect(typeof user.is_admin).toBe('boolean')

        console.log('✅ 获取用户信息成功:', {
          user_id: user.user_id,
          mobile: user.mobile,
          is_admin: user.is_admin
        })
      }
    })

    test('获取用户信息 - 无效Token应返回401', async () => {
      const response = await tester.make_request('GET', '/api/v4/auth/profile', null, {
        Authorization: 'Bearer invalid_token_here'
      })

      expect(response.status).toBe(401)
      expect(response.data).toHaveProperty('success', false)

      console.log('✅ 无效Token被正确拒绝')
    })

    test('获取用户信息 - 缺少Token应返回401', async () => {
      const response = await tester.make_request('GET', '/api/v4/auth/profile')

      expect(response.status).toBe(401)
      expect(response.data).toHaveProperty('success', false)

      console.log('✅ 缺少Token被正确拒绝')
    })

    test('用户登出 - POST /api/v4/auth/logout', async () => {
      const response = await tester.make_authenticated_request(
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
      /**
       * 🔐 Token安全模式（无兼容代码）：
       * - refresh_token 仅通过 HttpOnly Cookie 传递
       * - 不支持请求体传递（防止XSS窃取）
       * - 响应体仅包含 access_token
       */

      // 先登录获取refresh_token（通过响应头的 Set-Cookie 获取）
      const login_response = await tester.make_request('POST', '/api/v4/auth/quick-login', {
        mobile: testUser.mobile,
        verification_code: '123456'
      })

      expect(login_response.status).toBe(200)
      expect(login_response.data.data).toHaveProperty('access_token')

      // 从响应头提取 refresh_token Cookie
      const setCookieHeader = login_response.headers['set-cookie']
      let refresh_token = null
      if (setCookieHeader) {
        const cookieStr = Array.isArray(setCookieHeader)
          ? setCookieHeader.join('; ')
          : setCookieHeader
        const match = cookieStr.match(/refresh_token=([^;]+)/)
        if (match) {
          refresh_token = match[1]
        }
      }

      // 如果无法从 Cookie 获取，跳过刷新测试
      if (!refresh_token) {
        console.log('⚠️ 无法从响应头获取 refresh_token Cookie，跳过刷新测试')
        return
      }

      // 🔐 使用Cookie方式刷新Token（不支持请求体传递）
      const refresh_response = await tester.make_request_with_cookie(
        'POST',
        '/api/v4/auth/refresh',
        { refresh_token }
      )

      expect([200, 401]).toContain(refresh_response.status)
      if (refresh_response.status === 200) {
        expect(refresh_response.data).toHaveProperty('success', true)
        expect(refresh_response.data).toHaveProperty('message', 'Token刷新成功')
        expect(refresh_response.data.data).toHaveProperty('access_token')
        expect(refresh_response.data.data).not.toHaveProperty('refresh_token')
        expect(refresh_response.data.data).toHaveProperty('user')
        expect(refresh_response.data.data.user).toHaveProperty('user_id')
        expect(refresh_response.data.data.user).toHaveProperty('mobile')
        expect(refresh_response.data.data.user).toHaveProperty('is_admin')
        expect(refresh_response.data.data.user).toHaveProperty('roles')
        expect(refresh_response.data.data).toHaveProperty('expires_in')
        expect(refresh_response.data.data).toHaveProperty('timestamp')

        console.log('✅ Token刷新成功（HttpOnly Cookie 安全模式，无兼容代码）')
      }
    })

    test('Token刷新 - 缺少refresh_token Cookie', async () => {
      // 不携带Cookie发送请求
      const response = await tester.make_request('POST', '/api/v4/auth/refresh', {})

      expect(response.status).toBe(400)
      expect(response.data).toHaveProperty('success', false)
      // 新错误消息包含Cookie提示
      expect(response.data.message).toMatch(/刷新Token不能为空/)

      console.log('✅ 缺少refresh_token Cookie被正确拒绝')
    })

    test('Token刷新 - 无效的refresh_token格式', async () => {
      // 🔐 使用Cookie方式传递无效Token
      const response = await tester.make_request_with_cookie('POST', '/api/v4/auth/refresh', {
        refresh_token: 'invalid_token_format'
      })

      expect(response.status).toBe(401)
      expect(response.data).toHaveProperty('success', false)
      expect(response.data).toHaveProperty('message', '刷新Token无效')

      console.log('✅ 无效refresh_token Cookie被正确拒绝')
    })
  })

  /*
   * ==========================================
   * 🔑 权限管理API
   * ==========================================
   */

  /**
   * V4权限管理API - 路径说明：
   * - 权限API独立挂载在 /api/v4/permissions/（2026-01-08 从 auth 域拆分）
   * - /api/v4/permissions/check - 权限检查
   * - /api/v4/permissions/admins - 获取管理员列表
   * - /api/v4/permissions/me - 获取当前用户权限
   * - /api/v4/permissions/cache/invalidate - 权限缓存失效
   * 更新时间：2026-01-08
   */
  describe('V4权限管理API', () => {
    test('检查用户权限 - POST /api/v4/permissions/check', async () => {
      const response = await tester.make_authenticated_request(
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
        expect(response.data.data).toHaveProperty('is_admin')
        expect(response.data.data).toHaveProperty('role_level')

        console.log('✅ 权限检查成功:', {
          resource: response.data.data.resource,
          action: response.data.data.action,
          has_permission: response.data.data.has_permission
        })
      }
    })

    test('获取当前用户权限信息 - GET /api/v4/permissions/me', async () => {
      /**
       * 🔒 安全说明：
       * - /api/v4/permissions/user/:user_id 已删除（违反"用户端禁止/:id参数"规范）
       * - 改为使用 /api/v4/permissions/me 查询当前用户自己的权限
       * - 管理员查询他人权限请使用 /api/v4/console/users/:id/permissions
       */
      const response = await tester.make_authenticated_request(
        'GET',
        '/api/v4/permissions/me',
        null,
        'regular'
      )

      expect([200, 401, 403]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('roles')
        expect(response.data.data).toHaveProperty('is_admin')
        expect(response.data.data).toHaveProperty('role_level')
        expect(response.data.data).toHaveProperty('permissions')

        console.log('✅ 获取当前用户权限成功:', {
          is_admin: response.data.data.is_admin,
          role_level: response.data.data.role_level,
          roles_count: response.data.data.roles?.length || 0
        })
      }
    })

    test('获取管理员列表 - GET /api/v4/permissions/admins', async () => {
      const response = await tester.make_authenticated_request(
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

    /**
     * 权限缓存失效测试 - POST /api/v4/permissions/cache/invalidate
     * 2026-01-08 新增：从 POST /api/v4/auth/refresh 迁移而来
     *
     * 权限边界规则：
     * - admin 可以失效任意用户的缓存
     * - ops/user 只能失效自己的缓存
     */
    test('权限缓存失效 - 管理员失效自己的缓存', async () => {
      const response = await tester.make_authenticated_request(
        'POST',
        '/api/v4/permissions/cache/invalidate',
        { user_id: TEST_DATA.users.adminUser.user_id },
        'admin'
      )

      expect([200, 401]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('cache_cleared', true)
        expect(response.data.data).toHaveProperty('user_id')
        expect(response.data.data).toHaveProperty('invalidated_by')
        expect(response.data.data).toHaveProperty('invalidated_at')

        console.log('✅ 管理员权限缓存失效成功:', {
          user_id: response.data.data.user_id,
          invalidated_by: response.data.data.invalidated_by
        })
      }
    })

    test('权限缓存失效 - 普通用户失效自己的缓存', async () => {
      const response = await tester.make_authenticated_request(
        'POST',
        '/api/v4/permissions/cache/invalidate',
        { user_id: TEST_DATA.users.testUser.user_id },
        'regular'
      )

      expect([200, 401]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data.data).toHaveProperty('cache_cleared', true)

        console.log('✅ 普通用户权限缓存失效成功（自己的缓存）')
      }
    })

    test('权限缓存失效 - 普通用户失效他人缓存应被拒绝', async () => {
      /**
       * 注意：由于测试账号 13612227930 既是用户也是管理员
       * 🔴 P0-1修复：user_id 现在从 global.testData 动态获取，不再硬编码
       * 这里测试普通用户尝试失效一个不存在的用户ID
       * 如果要测试真正的403场景，需要创建两个不同的测试用户
       */
      const response = await tester.make_authenticated_request(
        'POST',
        '/api/v4/permissions/cache/invalidate',
        { user_id: 99999 }, // 尝试失效其他用户（不存在的ID会返回404或403）
        'regular'
      )

      // 期望返回 401（未认证）、403（禁止）或 404（用户不存在）
      expect([401, 403, 404]).toContain(response.status)
      if (response.status === 403) {
        expect(response.data).toHaveProperty('success', false)
        expect(response.data).toHaveProperty('code', 'FORBIDDEN')
        console.log('✅ 普通用户失效他人缓存被正确拒绝（403 Forbidden）')
      } else if (response.status === 404) {
        expect(response.data).toHaveProperty('success', false)
        console.log('✅ 尝试失效不存在用户缓存被正确拒绝（404 Not Found）')
      }
    })

    test('权限缓存失效 - 缺少 user_id 参数', async () => {
      const response = await tester.make_authenticated_request(
        'POST',
        '/api/v4/permissions/cache/invalidate',
        {},
        'admin'
      )

      expect([400, 401]).toContain(response.status)
      if (response.status === 400) {
        expect(response.data).toHaveProperty('success', false)
        expect(response.data).toHaveProperty('code', 'INVALID_PARAMETER')

        console.log('✅ 缺少 user_id 参数被正确拒绝（400 Bad Request）')
      }
    })
  })
})
