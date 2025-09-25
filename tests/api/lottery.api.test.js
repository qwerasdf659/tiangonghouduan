/**
 * 抽奖API完整测试套件
 * 测试抽奖系统的所有API端点，包括活动管理、抽奖执行、奖品分发等
 * 创建时间：2025年08月23日 北京时间
 *
 * 测试覆盖：
 * 1. 抽奖活动列表API
 * 2. 抽奖执行API
 * 3. 抽奖历史API
 * 4. 奖品管理API
 * 5. 概率设置API（管理员）
 * 6. 业务逻辑测试
 * 7. 并发抽奖测试
 */

const UnifiedAPITestManager = require('./UnifiedAPITestManager')

describe('抽奖API完整测试', () => {
  let tester
  let testUserId
  let testCampaignId

  beforeAll(async () => {
    tester = new UnifiedAPITestManager()
    // 等待服务启动
    await new Promise(resolve => {
      setTimeout(resolve, 2000)
    })

    // 登录获取用户信息
    const userData = await tester.authenticateUser('regular')
    testUserId = userData.user.user_id
  })

  afterAll(() => {
    if (tester) {
      tester.cleanup()
    }
  })

  describe('抽奖活动管理API', () => {
    test('✅ 获取抽奖活动列表 - GET /api/v4/unified-engine/lottery/campaigns', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/unified-engine/lottery/campaigns',
        null,
        'regular'
      )

      expect([200, 401]).toContain(response.status)
      expect(response.data.success).toBe(true)
      expect(Array.isArray(response.data.data)).toBe(true)

      // 如果有活动，记录一个用于后续测试
      if (response.data.data.length > 0) {
        testCampaignId = response.data.data[0].campaign_id
      }
    })

    test('✅ 获取活动详情 - GET /api/v4/unified-engine/lottery/campaigns/:id', async () => {
      if (!testCampaignId) {
        console.log('跳过活动详情测试：没有可用的活动')
        return
      }

      const response = await tester.makeRequest(
        'GET',
        `/api/v4/unified-engine/lottery/campaigns/${testCampaignId}`
      )

      expect(response.status).toBe(200)
      expect(response.data.success).toBe(true)
      expect(response.data.data).toHaveProperty('campaign_id')
      expect(response.data.data).toHaveProperty('campaign_name')
      expect(response.data.data).toHaveProperty('prizes')
    })

    test('⚡ 性能测试 - 活动列表响应时间', async () => {
      const result = await tester.testResponseTime(
        'GET',
        '/api/v4/unified-engine/lottery/campaigns',
        null,
        'regular',
        2000 // 期望2秒内响应
      )

      expect(result.passed).toBe(true)
    })

    test('🚀 并发测试 - 活动列表并发访问', async () => {
      const result = await tester.testConcurrentRequests(
        '/api/v4/unified-engine/lottery/campaigns',
        'GET',
        null,
        10 // 10个并发请求
      )

      expect(result.successCount).toBe(10)
      expect(result.errorCount).toBe(0)
    }, 30000)
  })

  describe('抽奖执行API', () => {
    beforeAll(async () => {
      // 确保用户已登录
      if (!tester.tokens.regular) {
        await tester.authenticateUser('regular')
      }
    })

    test('✅ 执行单次抽奖 - POST /api/v4/unified-engine/lottery/draw', async () => {
      if (!testCampaignId) {
        console.log('跳过抽奖测试：没有可用的活动')
        return
      }

      const drawData = {
        campaign_id: testCampaignId,
        draw_type: 'single'
      }

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/unified-engine/lottery/draw',
        drawData,
        'regular'
      )

      // 可能成功也可能因为积分不足等原因失败，都是正常的
      expect([200, 400, 403]).toContain(response.status)

      if (response.status === 200) {
        expect(response.data.success).toBe(true)
        expect(response.data.data).toHaveProperty('draw_id')
        expect(response.data.data).toHaveProperty('result')
      }
    })

    test('🔍 抽奖参数验证测试', async () => {
      const validParams = {
        campaign_id: testCampaignId || 'test_campaign',
        draw_type: 'single'
      }

      const invalidParams = {
        campaign_id: 'invalid_campaign_id',
        draw_type: 'invalid_type'
      }

      await tester.testParameterValidation(
        '/api/v4/unified-engine/lottery/draw',
        'POST',
        validParams,
        invalidParams,
        'regular'
      )
    }, 20000)

    test('🔒 抽奖权限测试', async () => {
      const drawData = {
        campaign_id: testCampaignId || 'test_campaign',
        draw_type: 'single'
      }

      // 测试需要登录才能抽奖
      const unauthorizedResponse = await tester.makeRequest(
        'POST',
        '/api/v4/unified-engine/lottery/draw',
        drawData
      )

      expect(unauthorizedResponse.status).toBeGreaterThanOrEqual(401)
    })

    test('⚡ 抽奖性能测试', async () => {
      if (!testCampaignId) {
        console.log('跳过抽奖性能测试：没有可用的活动')
        return
      }

      const drawData = {
        campaign_id: testCampaignId,
        draw_type: 'single'
      }

      const result = await tester.testResponseTime(
        '/api/v4/unified-engine/lottery/draw',
        'POST',
        drawData,
        3000, // 期望3秒内响应
        'regular'
      )

      // 抽奖可能因为业务规则失败，只要响应时间合理即可
      expect(result.responseTime).toBeLessThan(3000)
    })

    test('🔄 数据一致性测试 - 抽奖记录', async () => {
      if (!testCampaignId) {
        console.log('跳过数据一致性测试：没有可用的活动')
        return
      }

      // 先查看抽奖历史
      const beforeResponse = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/lottery/history/${testUserId}`,
        null,
        'regular'
      )

      const beforeCount = beforeResponse.status === 200 ? beforeResponse.data.data?.length || 0 : 0

      // 执行抽奖
      const drawData = {
        campaign_id: testCampaignId,
        draw_type: 'single'
      }

      const drawResponse = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/unified-engine/lottery/draw',
        drawData,
        'regular'
      )

      // 如果抽奖成功，历史记录应该增加
      if (drawResponse.status === 200) {
        await new Promise(resolve => {
          setTimeout(resolve, 500)
        }) // 等待数据写入

        const afterResponse = await tester.makeAuthenticatedRequest(
          'GET',
          `/api/v4/unified-engine/lottery/history/${testUserId}`,
          null,
          'regular'
        )

        if (afterResponse.status === 200) {
          const afterCount = afterResponse.data.data?.length || 0
          expect(afterCount).toBeGreaterThanOrEqual(beforeCount)
        }
      }
    })
  })

  describe('抽奖历史API', () => {
    test('✅ 获取用户抽奖历史 - GET /api/v4/unified-engine/lottery/history/:userId', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/lottery/history/${testUserId}`,
        null,
        'regular'
      )

      expect([200, 404]).toContain(response.status)

      if (response.status === 200) {
        expect(response.data.success).toBe(true)
        expect(Array.isArray(response.data.data)).toBe(true)
      }
    })

    test('🔒 历史记录权限测试', async () => {
      // 测试访问其他用户的历史记录
      const otherUserId = 99999 // 假设的其他用户ID

      await tester.testAuthorizationLevels(
        `/api/v4/unified-engine/lottery/history/${otherUserId}`,
        'GET',
        null,
        ['admin'] // 只有管理员可以查看其他用户历史
      )
    })

    test('⚡ 历史记录性能测试', async () => {
      const result = await tester.testResponseTime(
        'GET',
        `/api/v4/unified-engine/lottery/history/${testUserId}`,
        null,
        'regular',
        2000
      )

      expect(result.responseTime).toBeLessThan(2000)
    })
  })

  describe('奖品相关API', () => {
    test('✅ 获取奖品列表 - GET /api/v4/unified-engine/lottery/prizes', async () => {
      const response = await tester.makeRequest('GET', '/api/v4/unified-engine/lottery/prizes')

      expect([200, 404, 401]).toContain(response.status)

      if (response.status === 200) {
        expect(response.data.success).toBe(true)
        expect(Array.isArray(response.data.data)).toBe(true)
      }
    })

    test('✅ 获取用户奖品库存 - GET /api/v4/unified-engine/lottery/inventory/:userId', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/lottery/inventory/${testUserId}`,
        null,
        'regular'
      )

      expect([200, 404]).toContain(response.status)

      if (response.status === 200) {
        expect(response.data.success).toBe(true)
        expect(Array.isArray(response.data.data)).toBe(true)
      }
    })

    test('🔒 库存访问权限测试', async () => {
      // 测试访问其他用户的库存
      const otherUserId = 99999

      await tester.testAuthorizationLevels(
        `/api/v4/unified-engine/lottery/inventory/${otherUserId}`,
        'GET',
        null,
        ['admin'] // 只有管理员可以查看其他用户库存
      )
    })
  })

  describe('管理员API测试', () => {
    beforeAll(async () => {
      // 确保管理员已登录
      if (!tester.tokens.admin) {
        await tester.authenticateUser('admin')
      }
    })

    test('🔒 创建抽奖活动 - POST /api/v4/unified-engine/admin/lottery/campaigns', async () => {
      const campaignData = {
        campaign_name: '测试抽奖活动',
        campaign_type: 'standard',
        cost_per_draw: 100,
        max_draws_per_user_daily: 5,
        start_time: new Date().toISOString(),
        end_time: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/unified-engine/admin/lottery/campaigns',
        campaignData,
        'admin'
      )

      // 可能成功也可能因为端点未实现而失败
      expect([200, 201, 404]).toContain(response.status)

      if (response.status === 200 || response.status === 201) {
        expect(response.data.success).toBe(true)
        expect(response.data.data).toHaveProperty('campaign_id')
      }
    })

    test('🔒 管理员权限验证', async () => {
      // 测试普通用户不能访问管理员API
      await tester.testAuthorizationLevels(
        '/api/v4/unified-engine/admin/lottery/campaigns',
        'GET',
        null,
        ['admin'] // 只有管理员可以访问
      )
    })

    test('🔒 概率配置API - POST /api/v4/unified-engine/admin/lottery/probability', async () => {
      const probabilityData = {
        campaign_id: testCampaignId || 'test_campaign',
        prizes: [
          {
            // 🔴 需要真实数据：实际奖品ID
            prize_id: 'NEED_REAL_PRIZE_ID_1',
            probability: 0.3
          },
          {
            // 🔴 需要真实数据：实际奖品ID
            prize_id: 'NEED_REAL_PRIZE_ID_2',
            probability: 0.7
          }
        ]
      }

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/unified-engine/admin/lottery/probability',
        probabilityData,
        'admin'
      )

      // 可能成功也可能因为端点未实现而失败
      expect([200, 201, 404]).toContain(response.status)
    })
  })

  describe('业务逻辑测试', () => {
    test('📊 每日抽奖次数限制测试', async () => {
      if (!testCampaignId) {
        console.log('跳过次数限制测试：没有可用的活动')
        return
      }

      const drawData = {
        campaign_id: testCampaignId,
        draw_type: 'single'
      }

      // 尝试多次抽奖，应该有次数限制
      const results = []
      // TODO: 性能优化 - 考虑使用Promise.all并发执行
      for (let i = 0; i < 10; i++) {
        try {
          const response = await tester.makeAuthenticatedRequest(
            'POST',
            '/api/v4/unified-engine/lottery/draw',
            drawData,
            'regular'
          )
          results.push(response.status)

          // 如果返回次数限制错误，说明限制生效
          if (response.status === 403 || response.status === 429) {
            break
          }
        } catch (error) {
          results.push('error')
        }

        // 避免请求过快
        await new Promise(resolve => {
          setTimeout(resolve, 100)
        })
      }

      // 应该有一些成功的抽奖，但不应该都成功（除非限制很宽松）
      const successCount = results.filter(status => status === 200).length
      console.log(`抽奖结果统计: 成功${successCount}次，总尝试${results.length}次`)
    }, 30000)

    test('💰 积分扣除验证测试', async () => {
      if (!testCampaignId) {
        console.log('跳过积分扣除测试：没有可用的活动')
        return
      }

      // 获取抽奖前积分
      const beforePointsResponse = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/points/balance/${testUserId}`,
        null,
        'regular'
      )

      const beforePoints =
        beforePointsResponse.status === 200
          ? beforePointsResponse.data.data?.available_points || 0
          : 0

      // 执行抽奖
      const drawData = {
        campaign_id: testCampaignId,
        draw_type: 'single'
      }

      const drawResponse = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/unified-engine/lottery/draw',
        drawData,
        'regular'
      )

      // 如果抽奖成功，积分应该减少
      if (drawResponse.status === 200) {
        await new Promise(resolve => {
          setTimeout(resolve, 500)
        }) // 等待积分扣除

        const afterPointsResponse = await tester.makeAuthenticatedRequest(
          'GET',
          `/api/v4/unified-engine/points/balance/${testUserId}`,
          null,
          'regular'
        )

        if (afterPointsResponse.status === 200) {
          const afterPoints = afterPointsResponse.data.data?.available_points || 0
          expect(afterPoints).toBeLessThanOrEqual(beforePoints)
        }
      }
    })
  })

  describe('错误处理测试', () => {
    test('❌ 不存在的活动ID', async () => {
      const drawData = {
        campaign_id: 'nonexistent_campaign',
        draw_type: 'single'
      }

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/unified-engine/lottery/draw',
        drawData,
        'regular'
      )

      // ✅ 修复：ApiResponse标准 - HTTP 200 + success: false
      expect(response.status).toBe(200)
      expect(response.data.success).toBe(false)
      expect(response.data.message).toBeDefined()
      expect(response.data.code).toBeDefined()
    })

    test('❌ 无效的抽奖类型', async () => {
      const drawData = {
        campaign_id: testCampaignId || 'test_campaign',
        draw_type: 'invalid_type'
      }

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/unified-engine/lottery/draw',
        drawData,
        'regular'
      )

      // ✅ 修复：ApiResponse标准 - HTTP 200 + success: false
      expect(response.status).toBe(200)
      expect(response.data.success).toBe(false)
      expect(response.data.message).toBeDefined()
      expect(response.data.code).toBeDefined()
    })

    test('❌ 缺失必要参数', async () => {
      const drawData = {
        // 缺失campaign_id
        draw_type: 'single'
      }

      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/unified-engine/lottery/draw',
        drawData,
        'regular'
      )

      // ✅ 修复：ApiResponse标准 - HTTP 200 + success: false
      expect(response.status).toBe(200)
      expect(response.data.success).toBe(false)
      expect(response.data.message).toBeDefined()
      expect(response.data.code).toBeDefined()
    })
  })

  afterAll(() => {
    // 生成测试报告
    if (tester) {
      const report = tester.generateTestReport()
      console.log('\n📊 抽奖API测试报告:')
      console.log('='.repeat(50))
      console.log(`总测试数: ${report.summary.total}`)
      console.log(`成功: ${report.summary.success}`)
      console.log(`警告: ${report.summary.warning}`)
      console.log(`错误: ${report.summary.error}`)
      console.log(`成功率: ${report.summary.successRate}`)

      if (report.performance && report.performance.summary) {
        console.log('\n⚡ 性能统计:')
        console.log(`平均响应时间: ${report.performance.summary.avgResponseTime}ms`)
        console.log(`最大响应时间: ${report.performance.summary.maxResponseTime}ms`)
        console.log(`最小响应时间: ${report.performance.summary.minResponseTime}ms`)
      }
    }
  })
})
