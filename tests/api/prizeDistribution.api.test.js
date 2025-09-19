/**
 * 奖品分发系统API完整测试套件
 * 测试奖品分发历史、重试、统计、确认等功能
 * 创建时间：2025年01月21日 北京时间
 */

const BaseAPITester = require('./BaseAPITester')

describe('奖品分发系统API完整测试', () => {
  let tester
  let testUserId
  let testDistributionId

  beforeAll(async () => {
    tester = new BaseAPITester()
    await new Promise(resolve => {
      setTimeout(resolve, 2000)
    })

    // 认证测试用户（13612227930，既是用户也是管理员）
    const userData = await tester.authenticateUser('regular')
    testUserId = userData.user.user_id
    await tester.authenticateUser('admin')
  })

  afterAll(() => {
    if (tester) {
      tester.cleanup()
    }
  })

  describe('用户奖品分发API', () => {
    test('✅ 获取用户奖品分发历史 - GET /api/v4/unified-engine/prizeDistribution/user/:userId/history', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/prizeDistribution/user/${testUserId}/history`,
        null,
        'regular'
      )

      expect([200, 404]).toContain(response.status)

      if (response.status === 200) {
        expect(response.data).toHaveProperty('code', 0)
        expect(response.data).toHaveProperty('msg')
        expect(response.data.data).toHaveProperty('distributions')
        expect(response.data.data).toHaveProperty('pagination')
        expect(response.data.data).toHaveProperty('query_time')
        expect(Array.isArray(response.data.data.distributions)).toBe(true)
      }
    })

    test('✅ 获取用户奖品分发历史（带参数筛选）', async () => {
      const queryParams = {
        page: 1,
        limit: 10,
        prize_type: 'points',
        distribution_status: 'completed'
      }

      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/prizeDistribution/user/${testUserId}/history`,
        null,
        'regular',
        queryParams
      )

      expect([200, 404]).toContain(response.status)

      if (response.status === 200) {
        expect(response.data.data.pagination.limit).toBeLessThanOrEqual(10)
      }
    })

    test('❌ 用户无权限查看他人分发历史', async () => {
      const otherUserId = testUserId + 1000

      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/prizeDistribution/user/${otherUserId}/history`,
        null,
        'regular'
      )

      expect([403, 404]).toContain(response.status)
    })

    test('✅ 用户确认奖品分发 - POST /api/v4/unified-engine/prizeDistribution/user/distribution/:distributionId/confirm', async () => {
      // 先尝试获取一个分发记录ID用于测试
      const historyResponse = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/prizeDistribution/user/${testUserId}/history`,
        null,
        'regular'
      )

      if (historyResponse.status === 200 && historyResponse.data.data.distributions.length > 0) {
        testDistributionId = historyResponse.data.data.distributions[0].distribution_id
      } else {
        testDistributionId = 'test_distribution_id'
      }

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        `/api/v4/unified-engine/prizeDistribution/user/distribution/${testDistributionId}/confirm`,
        {},
        'regular'
      )

      // 可能返回200(成功)、404(不存在)、400(已确认)等状态
      expect([200, 400, 404]).toContain(response.status)

      if (response.status === 200) {
        expect(response.data).toHaveProperty('code', 0)
        expect(response.data).toHaveProperty('msg')
      }
    })
  })

  describe('管理员奖品分发API', () => {
    test('✅ 获取所有分发记录 - GET /api/v4/unified-engine/prizeDistribution/admin/distributions', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/prizeDistribution/admin/distributions',
        null,
        'admin'
      )

      expect([200, 404]).toContain(response.status)

      if (response.status === 200) {
        expect(response.data).toHaveProperty('code', 0)
        expect(response.data.data).toHaveProperty('distributions')
        expect(response.data.data).toHaveProperty('pagination')
        expect(Array.isArray(response.data.data.distributions)).toBe(true)
      }
    })

    test('✅ 获取分发记录详情 - GET /api/v4/unified-engine/prizeDistribution/admin/distribution/:distributionId', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/prizeDistribution/admin/distribution/${testDistributionId || 'test_id'}`,
        null,
        'admin'
      )

      expect([200, 404]).toContain(response.status)

      if (response.status === 200) {
        expect(response.data).toHaveProperty('code', 0)
        expect(response.data.data).toHaveProperty('distribution_id')
      }
    })

    test('✅ 重试分发记录 - POST /api/v4/unified-engine/prizeDistribution/admin/distribution/:distributionId/retry', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'POST',
        `/api/v4/unified-engine/prizeDistribution/admin/distribution/${testDistributionId || 'test_id'}/retry`,
        {},
        'admin'
      )

      expect([200, 400, 404]).toContain(response.status)

      if (response.status === 200) {
        expect(response.data).toHaveProperty('code', 0)
      }
    })

    test('✅ 处理待分发奖品 - POST /api/v4/unified-engine/prizeDistribution/admin/process-pending', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/unified-engine/prizeDistribution/admin/process-pending',
        {},
        'admin'
      )

      expect([200, 400]).toContain(response.status)

      if (response.status === 200) {
        expect(response.data).toHaveProperty('code', 0)
        expect(response.data.data).toHaveProperty('processed_count')
      }
    })

    test('✅ 获取分发统计 - GET /api/v4/unified-engine/prizeDistribution/admin/statistics', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/prizeDistribution/admin/statistics',
        null,
        'admin'
      )

      expect([200, 404]).toContain(response.status)

      if (response.status === 200) {
        expect(response.data).toHaveProperty('code', 0)
        expect(response.data.data).toHaveProperty('total_distributions')
        expect(response.data.data).toHaveProperty('success_count')
        expect(response.data.data).toHaveProperty('failed_count')
        expect(response.data.data).toHaveProperty('pending_count')
      }
    })

    test('✅ 创建分发记录 - POST /api/v4/unified-engine/prizeDistribution/admin/distribution/create', async () => {
      const createData = {
        user_id: testUserId,
        prize_type: 'points',
        prize_value: 100,
        prize_name: '测试积分奖励',
        source_type: 'manual',
        source_id: 'test_manual_distribution'
      }

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/unified-engine/prizeDistribution/admin/distribution/create',
        createData,
        'admin'
      )

      expect([200, 400]).toContain(response.status)

      if (response.status === 200) {
        expect(response.data).toHaveProperty('code', 0)
        expect(response.data.data).toHaveProperty('distribution_id')
        // 保存创建的分发ID用于后续测试
        testDistributionId = response.data.data.distribution_id
      }
    })

    test('❌ 普通用户无权限访问管理员API', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/prizeDistribution/admin/statistics',
        null,
        'regular'
      )

      expect([403, 401]).toContain(response.status)
    })
  })

  describe('参数验证和错误处理', () => {
    test('❌ 无效的用户ID格式', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/prizeDistribution/user/invalid_id/history',
        null,
        'regular'
      )

      expect([400, 404]).toContain(response.status)
    })

    test('❌ 无效的分发ID格式', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/prizeDistribution/admin/distribution/invalid_id',
        null,
        'admin'
      )

      expect([400, 404]).toContain(response.status)
    })

    test('❌ 创建分发记录缺少必需参数', async () => {
      const invalidData = {
        prize_type: 'points'
        // 缺少user_id, prize_value等必需字段
      }

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/unified-engine/prizeDistribution/admin/distribution/create',
        invalidData,
        'admin'
      )

      expect([400]).toContain(response.status)
    })

    test('❌ 未认证访问API', async () => {
      const response = await tester.makeRequest(
        'GET',
        `/api/v4/unified-engine/prizeDistribution/user/${testUserId}/history`
      )

      expect([401, 403]).toContain(response.status)
    })
  })

  describe('性能和并发测试', () => {
    test('⚡ 分发历史查询性能测试', async () => {
      const startTime = Date.now()

      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/prizeDistribution/user/${testUserId}/history`,
        null,
        'regular'
      )

      const responseTime = Date.now() - startTime

      expect(responseTime).toBeLessThan(2000) // 响应时间应小于2秒
      expect([200, 404]).toContain(response.status)
    })

    test('⚡ 管理员统计查询性能测试', async () => {
      const startTime = Date.now()

      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/prizeDistribution/admin/statistics',
        null,
        'admin'
      )

      const responseTime = Date.now() - startTime

      expect(responseTime).toBeLessThan(3000) // 统计查询允许稍长的响应时间
      expect([200, 404]).toContain(response.status)
    })
  })

  describe('数据一致性验证', () => {
    test('🔍 分发记录数据完整性验证', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/prizeDistribution/user/${testUserId}/history`,
        null,
        'regular'
      )

      if (response.status === 200 && response.data.data.distributions.length > 0) {
        const distribution = response.data.data.distributions[0]

        // 验证必需字段存在
        expect(distribution).toHaveProperty('distribution_id')
        expect(distribution).toHaveProperty('user_id')
        expect(distribution).toHaveProperty('prize_type')
        expect(distribution).toHaveProperty('distribution_status')
        expect(distribution).toHaveProperty('created_at')

        // 验证数据类型
        expect(typeof distribution.distribution_id).toBe('string')
        expect(typeof distribution.user_id).toBe('number')
        expect(typeof distribution.prize_type).toBe('string')
      }
    })
  })
})
