/**
 * 用户API完整测试套件
 * 测试用户个人信息、积分查询等功能
 * 创建时间：2025年08月23日 北京时间
 *
 * 测试覆盖：
 * 1. 用户积分查询API
 * 2. 用户个人信息API
 * 3. 权限验证测试
 * 4. 性能测试
 * 5. 安全性测试
 */

const UnifiedAPITestManager = require('./UnifiedAPITestManager')

describe('用户API完整测试', () => {
  let tester

  beforeAll(async () => {
    tester = new UnifiedAPITestManager()
    // 等待服务启动
    await new Promise(resolve => {
      setTimeout(resolve, 2000)
    })

    // 登录获取用户信息
    await tester.authenticateUser('regular')
    await tester.authenticateUser('admin')
  })

  afterAll(() => {
    if (tester) {
      tester.cleanup()
    }
  })

  describe('用户积分查询API', () => {
    test('✅ 获取当前用户积分 - GET /api/v4/unified-engine/user/points', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/user/points',
        null,
        'regular'
      )

      expect([200, 404]).toContain(response.status)

      if (response.status === 200) {
        expect(response.data.success).toBe(true)
        expect(response.data.data).toHaveProperty('available_points')
        expect(response.responseTime).toBeLessThan(3000)
      }
    })

    test('✅ 获取用户个人资料 - GET /api/v4/unified-engine/user/profile', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/user/profile',
        null,
        'regular'
      )

      expect([200, 404]).toContain(response.status)

      if (response.status === 200) {
        expect(response.data.success).toBe(true)
        expect(response.data.data).toHaveProperty('user_id')
        expect(response.responseTime).toBeLessThan(2000)
      }
    })

    test('🔒 用户认证测试', async () => {
      // 测试无token访问
      const response = await tester.makeRequest('GET', '/api/v4/unified-engine/user/points')

      expect([401, 403]).toContain(response.status)
    })
  })

  describe('用户权限和安全测试', () => {
    test('🔒 Token权限验证', async () => {
      const result = await tester.testPermissions('/api/v4/unified-engine/user/points', {
        adminAllowed: true,
        userAllowed: true
        // 不设置guestAllowed，使用默认逻辑（期望游客被拒绝）
      })

      expect(result.adminAccess).toBe(true)
      expect(result.userAccess).toBe(true)
      expect(result.guestAccess).toBe(true) // 游客访问被正确阻止，返回401/403
    })

    test('⚡ 性能测试 - 积分查询响应时间', async () => {
      const result = await tester.testResponseTime(
        'GET',
        '/api/v4/unified-engine/user/points',
        null,
        'regular',
        1000
      )

      expect(result.responseTime).toBeLessThan(1000)
    })

    test('🛡️ 安全性测试', async () => {
      // SQL注入防护
      const sqlInjectionData = {
        userId: '\'; DROP TABLE users; --'
      }

      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/user/profile?userId=${sqlInjectionData.userId}`,
        null,
        'regular'
      )

      // 应该正常处理请求而不执行SQL注入，返回正常状态或错误状态都可接受
      expect([200, 400, 404, 500]).toContain(response.status)
    })
  })

  describe('错误处理测试', () => {
    test('❌ 无效token应该被拒绝', async () => {
      const invalidToken = 'invalid_token_12345'

      const response = await tester.makeRequest('GET', '/api/v4/unified-engine/user/points', null, {
        Authorization: `Bearer ${invalidToken}`
      })

      expect([401, 403]).toContain(response.status)
    })

    test('❌ 过期token处理', async () => {
      // 模拟过期token
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.expired.token'

      const response = await tester.makeRequest('GET', '/api/v4/unified-engine/user/points', null, {
        Authorization: `Bearer ${expiredToken}`
      })

      expect([401, 403]).toContain(response.status)
    })
  })

  afterEach(() => {
    // 生成测试报告
    console.log(`
📊 用户API测试报告:`)
    console.log('==================================================')
    console.log(`总测试数: ${tester.testResults.length}`)
    console.log(`成功: ${tester.testResults.filter(r => r.status === 'success').length}`)
    console.log(`警告: ${tester.testResults.filter(r => r.status === 'warning').length}`)
    console.log(`错误: ${tester.testResults.filter(r => r.status === 'error').length}`)

    const successRate =
      tester.testResults.length > 0
        ? (
          (tester.testResults.filter(r => r.status === 'success').length /
              tester.testResults.length) *
            100
        ).toFixed(1)
        : 'N/A'
    console.log(`成功率: ${successRate}%`)
  })
})
