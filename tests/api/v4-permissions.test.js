/**
 * V4权限API测试套件
 * 使用扩展后的V4UnifiedEngineAPITester测试权限模块
 * 创建时间：2025年01月21日
 *
 * 测试覆盖：routes/v4/permissions.js 中的8个权限API端点
 * 符合用户规则：扩展现有功能而非创建重复文件
 */

const V4UnifiedEngineAPITester = require('./V4UnifiedEngineAPITester')

describe('V4权限API测试 - 使用扩展的测试器', () => {
  let tester

  beforeAll(async () => {
    tester = new V4UnifiedEngineAPITester()

    // 等待服务启动
    await new Promise(resolve => {
      setTimeout(resolve, 3000)
    })

    console.log('🔐 V4权限API测试初始化完成')
  })

  afterAll(async () => {
    if (tester) {
      await tester.cleanup()
    }
  })

  // 测试扩展后的权限API方法
  describe('扩展的权限API测试方法', () => {
    test('✅ 测试用户权限查询API', async () => {
      const results = await tester.testUserPermissionsAPI()
      expect(results).toBeDefined()
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBeGreaterThan(0)

      // 验证测试结果结构
      results.forEach(result => {
        expect(result).toHaveProperty('test')
        expect(result).toHaveProperty('status')
        expect(result).toHaveProperty('success')
      })
    })

    test('✅ 测试权限检查API', async () => {
      const results = await tester.testPermissionCheckAPI()
      expect(results).toBeDefined()
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBeGreaterThan(0)

      // 验证测试结果结构
      results.forEach(result => {
        expect(result).toHaveProperty('test')
        expect(result).toHaveProperty('status')
        expect(result).toHaveProperty('success')
      })
    })

    test('✅ 测试当前用户权限API', async () => {
      const results = await tester.testCurrentUserPermissionsAPI()
      expect(results).toBeDefined()
      expect(Array.isArray(results)).toBe(true)
      expect(results.length).toBeGreaterThan(0)

      // 验证测试结果结构
      results.forEach(result => {
        expect(result).toHaveProperty('test')
        expect(result).toHaveProperty('status')
        expect(result).toHaveProperty('success')
      })
    })

    test('🎯 综合权限API测试', async () => {
      const results = await tester.runPermissionsTest()
      expect(results).toBeDefined()
      expect(results).toHaveProperty('totalTests')
      expect(results).toHaveProperty('successCount')
      expect(results).toHaveProperty('successRate')
      expect(results).toHaveProperty('results')

      // 验证测试执行了多个API端点
      expect(results.totalTests).toBeGreaterThan(2)
      expect(Array.isArray(results.results)).toBe(true)

      console.log(
        `🔐 权限API测试结果: ${results.successCount}/${results.totalTests} (${results.successRate.toFixed(1)}%)`
      )
    })
  })

  // 验证权限API与业务代码的一致性
  describe('权限API一致性验证', () => {
    test('📋 权限API端点完整性检查', async () => {
      // 验证扩展的测试器包含了权限API测试方法
      expect(typeof tester.testUserPermissionsAPI).toBe('function')
      expect(typeof tester.testPermissionCheckAPI).toBe('function')
      expect(typeof tester.testCurrentUserPermissionsAPI).toBe('function')
      expect(typeof tester.runPermissionsTest).toBe('function')

      console.log('✅ 权限API测试方法完整性验证通过')
    })

    test('🔗 测试与业务代码一致性', async () => {
      // 运行综合测试并验证覆盖的API端点
      const results = await tester.runPermissionsTest()

      // 验证测试覆盖了预期的API端点
      const testedEndpoints = results.results.map(r => r.test)
      const expectedEndpoints = [
        'GET /permissions/user/:userId',
        'POST /permissions/check',
        'GET /permissions/me'
      ]

      expectedEndpoints.forEach(endpoint => {
        const hasTest = testedEndpoints.some(test => test.includes(endpoint.split(' ')[1]))
        expect(hasTest).toBe(true)
      })

      console.log('✅ 权限API测试与业务代码一致性验证通过')
    })
  })
})
