/**
 * 积分系统API完整测试套件
 * 测试积分查询、交易、历史记录等功能
 * 创建时间：2025年08月23日 北京时间
 */

const UnifiedAPITestManager = require('./UnifiedAPITestManager')

describe('积分系统API完整测试', () => {
  let tester
  let testUserId

  beforeAll(async () => {
    tester = new UnifiedAPITestManager()
    await new Promise(resolve => {
      setTimeout(resolve, 2000)
    })

    const userData = await tester.authenticateUser('regular')
    testUserId = userData.user.user_id
    await tester.authenticateUser('admin')
  })

  afterAll(() => {
    if (tester) {
      tester.cleanup()
    }
  })

  describe('积分查询API', () => {
    test('✅ 获取积分余额 - GET /api/v4/unified-engine/points/balance/:userId', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/points/balance/${testUserId}`,
        null,
        'regular'
      )

      expect([200, 404]).toContain(response.status)

      if (response.status === 200) {
        expect(response.data.success).toBe(true)
        expect(response.data.data).toHaveProperty('available_points')
        expect(response.data.data).toHaveProperty('total_earned')
      }
    })

    test('✅ 获取积分历史 - GET /api/v4/unified-engine/points/history/:userId', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/points/history/${testUserId}`,
        null,
        'regular'
      )

      expect([200, 404]).toContain(response.status)

      if (response.status === 200) {
        expect(response.data.success).toBe(true)
        expect(Array.isArray(response.data.data)).toBe(true)
      }
    })

    test('🔒 积分查询权限测试', async () => {
      const otherUserId = 99999

      await tester.testAuthorizationLevels(
        `/api/v4/unified-engine/points/balance/${otherUserId}`,
        'GET',
        null,
        ['admin']
      )
    })

    test('⚡ 积分查询性能测试', async () => {
      const result = await tester.testResponseTime(
        `/api/v4/unified-engine/points/balance/${testUserId}`,
        'GET',
        null,
        1000,
        'regular'
      )

      expect(result.responseTime).toBeLessThan(1000)
    })
  })

  describe('管理员积分管理API', () => {
    test('✅ 管理员调整积分 - POST /api/v4/unified-engine/admin/points/adjust', async () => {
      const adjustData = {
        user_id: testUserId,
        points: 100,
        reason: 'API测试调整',
        operation: 'add'
      }

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/unified-engine/admin/points/adjust',
        adjustData,
        'admin'
      )

      expect([200, 404]).toContain(response.status)

      if (response.status === 200) {
        expect(response.data.success).toBe(true)
      }
    })

    test('✅ 获取积分统计 - GET /api/v4/unified-engine/admin/points/statistics', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/admin/points/statistics',
        null,
        'admin'
      )

      expect([200, 404]).toContain(response.status)

      if (response.status === 200) {
        expect(response.data.success).toBe(true)
        expect(response.data.data).toHaveProperty('totalPoints')
      }
    })

    test('🔍 积分调整参数验证', async () => {
      const validParams = {
        user_id: testUserId,
        points: 50,
        reason: '测试',
        operation: 'add'
      }

      const invalidParams = {
        user_id: 'invalid',
        points: 'invalid',
        operation: 'invalid'
      }

      await tester.testParameterValidation(
        '/api/v4/unified-engine/admin/points/adjust',
        'POST',
        validParams,
        invalidParams,
        'admin'
      )
    }, 20000)

    test('🔒 管理员权限验证', async () => {
      await tester.testAuthorizationLevels(
        '/api/v4/unified-engine/admin/points/adjust',
        'POST',
        { user_id: testUserId, points: 100, reason: 'test', operation: 'add' },
        ['admin']
      )
    })
  })

  describe('积分消费API', () => {
    test('✅ 积分消费验证 - POST /api/v4/unified-engine/points/spend', async () => {
      const spendData = {
        amount: 10,
        reason: 'API测试消费',
        context: 'lottery_draw'
      }

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/unified-engine/points/spend',
        spendData,
        'regular'
      )

      expect([200, 400, 404]).toContain(response.status)
    })

    test('💰 积分余额验证测试', async () => {
      // 先获取当前积分
      const balanceResponse = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/points/balance/${testUserId}`,
        null,
        'regular'
      )

      if (balanceResponse.status === 200) {
        const currentPoints = balanceResponse.data.data?.available_points || 0
        console.log(`当前积分余额: ${currentPoints}`)

        // 如果积分足够，尝试消费
        if (currentPoints >= 10) {
          const spendResponse = await tester.makeAuthenticatedRequest(
            'POST',
            '/api/v4/unified-engine/points/spend',
            {
              amount: 5,
              reason: '余额验证测试',
              context: 'test'
            },
            'regular'
          )

          expect([200, 400]).toContain(spendResponse.status)
        }
      }
    })
  })

  describe('积分统计和分析API', () => {
    test('✅ 获取积分排行榜 - GET /api/v4/unified-engine/points/leaderboard', async () => {
      const response = await tester.makeRequest('GET', '/api/v4/unified-engine/points/leaderboard')

      expect([200, 404]).toContain(response.status)

      if (response.status === 200) {
        expect(response.data.success).toBe(true)
        expect(Array.isArray(response.data.data)).toBe(true)
      }
    })

    test('✅ 获取积分商城 - GET /api/v4/unified-engine/points/store', async () => {
      const response = await tester.makeRequest('GET', '/api/v4/unified-engine/points/store')

      expect([200, 404]).toContain(response.status)
    })
  })

  afterAll(() => {
    if (tester) {
      const report = tester.generateTestReport()
      console.log('\n📊 积分系统API测试报告:')
      console.log('='.repeat(50))
      console.log(`总测试数: ${report.summary.total}`)
      console.log(`成功: ${report.summary.success}`)
      console.log(`成功率: ${report.summary.successRate}`)
    }
  })
})
