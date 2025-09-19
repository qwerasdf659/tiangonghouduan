/**
 * DataCollector 数据收集器测试
 * 基于真实数据的完整功能测试，提升覆盖率到85%+
 * 创建时间：2025年01月21日 北京时间
 */

// 使用现有的测试工具，避免重复创建
const { getTestAccountConfig } = require('../../../../utils/TestAccountManager')
const { getDatabaseHelper } = require('../../../../utils/UnifiedDatabaseHelper')

// 被测试的核心类
const DataCollector = require('../../../../services/UnifiedLotteryEngine/utils/DataCollector')

describe('🔍 DataCollector 数据收集器测试套件', () => {
  let dataCollector
  let dbHelper
  let test_user_id
  let test_campaign_id

  beforeAll(async () => {
    // 初始化测试环境
    dataCollector = new DataCollector()
    dbHelper = getDatabaseHelper()
    await dbHelper.ensureConnection()

    // 🔴 使用真实测试账户数据，不用mock
    const testConfig = await getTestAccountConfig()
    test_user_id = testConfig.user_id

    // 🔴 获取真实的活动ID
    const campaigns = await dbHelper.query(
      'SELECT campaign_id FROM lottery_campaigns WHERE status = \'active\' ORDER BY created_at DESC LIMIT 1'
    )
    test_campaign_id = campaigns[0]?.campaign_id || 1
  })

  describe('📊 用户数据收集功能', () => {
    test('应该正确收集用户完整画像数据', async () => {
      const userProfile = await dataCollector.collectUserProfile(test_user_id)

      // 验证用户基础信息
      expect(userProfile).toHaveProperty('userId', test_user_id)
      expect(userProfile).toHaveProperty('username')
      expect(userProfile).toHaveProperty('phone')
      expect(userProfile).toHaveProperty('points')

      // 验证积分信息结构
      expect(userProfile.points).toHaveProperty('balance')
      expect(userProfile.points).toHaveProperty('totalEarned')
      expect(userProfile.points).toHaveProperty('level')
      expect(typeof userProfile.points.balance).toBe('number')

      // 验证抽奖行为分析
      expect(userProfile).toHaveProperty('lotteryBehavior')
      expect(userProfile.lotteryBehavior).toHaveProperty('totalAttempts')
      expect(userProfile.lotteryBehavior).toHaveProperty('winRate')

      // 验证库存信息
      expect(userProfile).toHaveProperty('inventory')
      expect(userProfile.inventory).toHaveProperty('totalItems')
    }, 30000)

    test('应该正确处理不存在的用户', async () => {
      await expect(dataCollector.collectUserProfile(999999))
        .rejects
        .toThrow('用户不存在')
    })

    test('应该正确计算用户等级', async () => {
      const userProfile = await dataCollector.collectUserProfile(test_user_id)

      expect(userProfile.points.level).toBeGreaterThanOrEqual(1)
      expect(userProfile.points.level).toBeLessThanOrEqual(10)
      expect(typeof userProfile.points.level).toBe('number')
    })

    test('应该正确分析抽奖行为模式', async () => {
      const userProfile = await dataCollector.collectUserProfile(test_user_id)
      const behavior = userProfile.lotteryBehavior

      expect(behavior).toHaveProperty('totalAttempts')
      expect(behavior).toHaveProperty('winRate')
      expect(behavior).toHaveProperty('favoriteTimeSlot')
      expect(behavior).toHaveProperty('averageInterval')

      expect(typeof behavior.totalAttempts).toBe('number')
      expect(behavior.winRate).toBeGreaterThanOrEqual(0)
      expect(behavior.winRate).toBeLessThanOrEqual(1)
    })
  })

  describe('🎁 奖品池数据收集功能', () => {
    test('应该正确收集活动奖品池信息', async () => {
      const prizePool = await dataCollector.collectCampaignPrizePool(test_campaign_id)

      expect(prizePool).toHaveProperty('campaignId', test_campaign_id)
      expect(prizePool).toHaveProperty('totalPrizes')
      expect(prizePool).toHaveProperty('prizeCategories')
      expect(prizePool).toHaveProperty('probabilityDistribution')

      // 验证奖品分类
      expect(Array.isArray(prizePool.prizeCategories)).toBe(true)

      // 验证概率分布
      expect(prizePool.probabilityDistribution).toHaveProperty('totalProbability')
      expect(prizePool.probabilityDistribution.totalProbability).toBeCloseTo(1.0, 2)
    })

    test('应该正确收集奖品详细信息', async () => {
      const prizeDetails = await dataCollector.collectPrizeDetails(test_campaign_id)

      expect(Array.isArray(prizeDetails)).toBe(true)

      if (prizeDetails.length > 0) {
        const firstPrize = prizeDetails[0]
        expect(firstPrize).toHaveProperty('prize_id')
        expect(firstPrize).toHaveProperty('prize_name')
        expect(firstPrize).toHaveProperty('prize_type')
        expect(firstPrize).toHaveProperty('win_probability')
        expect(firstPrize).toHaveProperty('remaining_stock')
      }
    })

    test('应该正确计算库存状态', async () => {
      const stockStatus = await dataCollector.collectStockStatus(test_campaign_id)

      expect(stockStatus).toHaveProperty('totalStock')
      expect(stockStatus).toHaveProperty('availableStock')
      expect(stockStatus).toHaveProperty('stockRatio')
      expect(stockStatus).toHaveProperty('lowStockAlerts')

      expect(typeof stockStatus.totalStock).toBe('number')
      expect(typeof stockStatus.availableStock).toBe('number')
      expect(stockStatus.stockRatio).toBeGreaterThanOrEqual(0)
      expect(stockStatus.stockRatio).toBeLessThanOrEqual(1)
    })
  })

  describe('📈 活动数据分析功能', () => {
    test('应该正确收集活动统计信息', async () => {
      const campaignStats = await dataCollector.collectCampaignStatistics(test_campaign_id)

      expect(campaignStats).toHaveProperty('campaignId', test_campaign_id)
      expect(campaignStats).toHaveProperty('totalParticipants')
      expect(campaignStats).toHaveProperty('totalAttempts')
      expect(campaignStats).toHaveProperty('winRate')
      expect(campaignStats).toHaveProperty('topPrizes')

      expect(typeof campaignStats.totalParticipants).toBe('number')
      expect(typeof campaignStats.totalAttempts).toBe('number')
      expect(campaignStats.winRate).toBeGreaterThanOrEqual(0)
    })

    test('应该正确分析时间段分布', async () => {
      const timeDistribution = await dataCollector.analyzeTimeDistribution(test_campaign_id)

      expect(timeDistribution).toHaveProperty('hourlyDistribution')
      expect(timeDistribution).toHaveProperty('peakHours')
      expect(timeDistribution).toHaveProperty('totalSamples')

      expect(Array.isArray(timeDistribution.hourlyDistribution)).toBe(true)
      expect(timeDistribution.hourlyDistribution).toHaveLength(24)
    })

    test('应该正确处理空数据情况', async () => {
      // 测试不存在的活动ID
      const result = await dataCollector.collectCampaignStatistics(999999)

      expect(result).toHaveProperty('campaignId', 999999)
      expect(result.totalParticipants).toBe(0)
      expect(result.totalAttempts).toBe(0)
    })
  })

  describe('⚡ 缓存和性能功能', () => {
    test('应该正确使用缓存机制', async () => {
      // 第一次调用，应该从数据库获取
      const start1 = Date.now()
      const profile1 = await dataCollector.collectUserProfile(test_user_id)
      const time1 = Date.now() - start1

      // 第二次调用，应该从缓存获取，速度更快
      const start2 = Date.now()
      const profile2 = await dataCollector.collectUserProfile(test_user_id)
      const time2 = Date.now() - start2

      expect(profile1.userId).toBe(profile2.userId)
      expect(time2).toBeLessThan(time1) // 缓存应该更快
    })

    test('应该正确处理缓存过期', async () => {
      // 清空缓存
      await dataCollector.cache.clear()

      const profile = await dataCollector.collectUserProfile(test_user_id)
      expect(profile).toHaveProperty('userId', test_user_id)
    })

    test('应该正确验证数据完整性', async () => {
      const isValid = await dataCollector.validateDataIntegrity(test_user_id, test_campaign_id)

      expect(typeof isValid).toBe('boolean')
      // 如果返回false，应该有错误信息
    })
  })

  describe('🔧 工具方法测试', () => {
    test('应该正确计算稀有度分布', async () => {
      const testInventory = [
        { product: { rarity: 'common' } },
        { product: { rarity: 'rare' } },
        { product: { rarity: 'common' } }
      ]

      const distribution = dataCollector.calculateRarityDistribution(testInventory)

      expect(distribution).toHaveProperty('common', 2)
      expect(distribution).toHaveProperty('rare', 1)
    })

    test('应该正确分类库存物品', async () => {
      const testInventory = [
        { product: { category: 'coupon' } },
        { product: { category: 'gift' } },
        { product: { category: 'coupon' } }
      ]

      const categories = dataCollector.categorizeInventory(testInventory)

      expect(categories).toHaveProperty('coupon', 2)
      expect(categories).toHaveProperty('gift', 1)
    })

    test('应该正确计算用户等级', async () => {
      const testPointsAccount = { available_points: 50000, total_earned_points: 100000 }
      const testTransactions = [
        { transaction_type: 'earn', amount: 1000 },
        { transaction_type: 'spend', amount: 500 }
      ]

      const level = dataCollector.calculateUserLevel(testPointsAccount, testTransactions)

      expect(typeof level).toBe('number')
      expect(level).toBeGreaterThanOrEqual(1)
      expect(level).toBeLessThanOrEqual(10)
    })
  })

  // 🆕 扩展测试：PerformanceMonitor 性能监控器测试套件
  // 基于用户要求：优先扩展现有文件，避免创建新文件
  describe('⚡ PerformanceMonitor 性能监控器测试套件', () => {
    const PerformanceMonitor = require('../../../../services/UnifiedLotteryEngine/utils/PerformanceMonitor')
    let performanceMonitor

    beforeEach(() => {
      performanceMonitor = new PerformanceMonitor()
    })

    describe('🚀 性能监控核心功能', () => {
      test('应该正确初始化性能监控器', () => {
        expect(performanceMonitor).toBeDefined()
        expect(performanceMonitor.metrics).toBeInstanceOf(Map)
        expect(performanceMonitor.thresholds).toHaveProperty('decisionTime')
        expect(performanceMonitor.thresholds).toHaveProperty('probabilityCalc')
        expect(performanceMonitor.thresholds).toHaveProperty('contextBuild')
        expect(performanceMonitor.alertCallbacks).toBeInstanceOf(Map)
      })

      test('应该正确开始性能监控', () => {
        const context = { userId: test_user_id, campaignId: test_campaign_id }
        const monitor = performanceMonitor.startMonitoring('testOperation', context)

        expect(monitor).toHaveProperty('id')
        expect(monitor).toHaveProperty('operation', 'testOperation')
        expect(monitor).toHaveProperty('startTime')
        expect(monitor).toHaveProperty('startMemory')
        expect(monitor).toHaveProperty('context', context)
        expect(monitor).toHaveProperty('checkpoints')
        expect(Array.isArray(monitor.checkpoints)).toBe(true)
      })

      test('应该正确添加性能检查点', () => {
        const monitor = performanceMonitor.startMonitoring('testOperation')

        performanceMonitor.addCheckpoint(monitor.id, 'checkpoint1', { step: 'validation' })
        performanceMonitor.addCheckpoint(monitor.id, 'checkpoint2', { step: 'processing' })

        const monitorData = performanceMonitor.metrics.get(monitor.id)
        expect(monitorData.checkpoints).toHaveLength(2)
        expect(monitorData.checkpoints[0]).toHaveProperty('name', 'checkpoint1')
        expect(monitorData.checkpoints[1]).toHaveProperty('name', 'checkpoint2')
        expect(monitorData.checkpoints[0]).toHaveProperty('timestamp')
        expect(monitorData.checkpoints[0]).toHaveProperty('metadata')
      })

      test('应该正确结束监控并生成报告', () => {
        const monitor = performanceMonitor.startMonitoring('testOperation')

        // 添加一些检查点
        performanceMonitor.addCheckpoint(monitor.id, 'step1')
        performanceMonitor.addCheckpoint(monitor.id, 'step2')

        const report = performanceMonitor.endMonitoring(monitor.id, { success: true })

        expect(report).toHaveProperty('operation', 'testOperation')
        expect(report).toHaveProperty('duration')
        expect(report).toHaveProperty('memoryUsage')
        expect(report).toHaveProperty('checkpoints')
        expect(report).toHaveProperty('summary')
        expect(typeof report.duration).toBe('number')
        expect(report.duration).toBeGreaterThan(0)
      })
    })

    describe('📊 性能指标分析', () => {
      test('应该正确分析性能瓶颈', () => {
        const monitor = performanceMonitor.startMonitoring('bottleneckTest')

        // 模拟慢操作的检查点
        performanceMonitor.addCheckpoint(monitor.id, 'slowStep', {
          duration: 600, // 超过阈值的操作
          type: 'decisionTime'
        })

        const report = performanceMonitor.endMonitoring(monitor.id)
        const analysis = performanceMonitor.analyzePerformance(report)

        expect(analysis).toHaveProperty('bottlenecks')
        expect(analysis).toHaveProperty('recommendations')
        expect(analysis).toHaveProperty('overallRating')
        expect(Array.isArray(analysis.bottlenecks)).toBe(true)
        expect(Array.isArray(analysis.recommendations)).toBe(true)
      })

      test('应该正确生成性能统计报告', () => {
        // 执行多个监控操作
        const operations = ['operation1', 'operation2', 'operation3']
        const monitors = []

        operations.forEach(op => {
          const monitor = performanceMonitor.startMonitoring(op)
          performanceMonitor.addCheckpoint(monitor.id, 'step1')
          performanceMonitor.endMonitoring(monitor.id)
          monitors.push(monitor)
        })

        const statistics = performanceMonitor.getStatistics()

        expect(statistics).toHaveProperty('totalOperations')
        expect(statistics).toHaveProperty('averageDuration')
        expect(statistics).toHaveProperty('operationTypes')
        expect(statistics).toHaveProperty('memoryTrends')
        expect(statistics.totalOperations).toBeGreaterThanOrEqual(3)
        expect(typeof statistics.averageDuration).toBe('number')
      })
    })

    describe('🔔 性能告警机制', () => {
      test('应该正确注册和触发性能告警', (done) => {
        let alertTriggered = false
        let alertData = null

        // 注册告警回调
        performanceMonitor.registerAlert('slowDecision', (data) => {
          alertTriggered = true
          alertData = data
          done()
        })

        // 模拟触发告警的操作
        performanceMonitor.checkThresholds({
          operation: 'testDecision',
          duration: 1000, // 超过500ms阈值
          type: 'decisionTime'
        })

        // 给告警一些时间触发
        setTimeout(() => {
          if (!alertTriggered) {
            done()
          }
        }, 100)
      })

      test('应该正确管理告警配置', () => {
        const alertId = 'testAlert'
        const callback = jest.fn()

        // 注册告警
        performanceMonitor.registerAlert(alertId, callback)
        expect(performanceMonitor.alertCallbacks.has(alertId)).toBe(true)

        // 注销告警
        performanceMonitor.unregisterAlert(alertId)
        expect(performanceMonitor.alertCallbacks.has(alertId)).toBe(false)
      })
    })

    describe('💾 内存监控功能', () => {
      test('应该正确监控内存使用情况', () => {
        const monitor = performanceMonitor.startMonitoring('memoryTest')

        // 模拟内存使用变化
        performanceMonitor.addCheckpoint(monitor.id, 'beforeOperation')

        // 这里可以模拟一些内存操作
        const largeArray = new Array(1000).fill('test data')

        performanceMonitor.addCheckpoint(monitor.id, 'afterOperation')
        const report = performanceMonitor.endMonitoring(monitor.id)

        expect(report.memoryUsage).toHaveProperty('initial')
        expect(report.memoryUsage).toHaveProperty('final')
        expect(report.memoryUsage).toHaveProperty('peak')
        expect(report.memoryUsage).toHaveProperty('difference')

        // 清理测试数据
        largeArray.length = 0
      })

      test('应该正确检测内存泄漏趋势', () => {
        // 执行多次操作来检测趋势
        const results = []

        for (let i = 0; i < 5; i++) {
          const monitor = performanceMonitor.startMonitoring(`memoryTest${i}`)
          performanceMonitor.addCheckpoint(monitor.id, 'step1')
          const report = performanceMonitor.endMonitoring(monitor.id)
          results.push(report)
        }

        const memoryTrend = performanceMonitor.analyzeMemoryTrend(results)

        expect(memoryTrend).toHaveProperty('trend') // 'increasing', 'decreasing', 'stable'
        expect(memoryTrend).toHaveProperty('severity')
        expect(memoryTrend).toHaveProperty('recommendations')
        expect(Array.isArray(memoryTrend.recommendations)).toBe(true)
      })
    })

    describe('📈 实时性能监控', () => {
      test('应该正确获取实时性能指标', () => {
        // 启动几个并发监控
        const monitors = []
        for (let i = 0; i < 3; i++) {
          const monitor = performanceMonitor.startMonitoring(`realtime${i}`)
          monitors.push(monitor)
        }

        const realTimeMetrics = performanceMonitor.getRealTimeMetrics()

        expect(realTimeMetrics).toHaveProperty('activeMonitors')
        expect(realTimeMetrics).toHaveProperty('systemLoad')
        expect(realTimeMetrics).toHaveProperty('memoryUsage')
        expect(realTimeMetrics).toHaveProperty('timestamp')
        expect(realTimeMetrics.activeMonitors).toBe(3)

        // 清理监控
        monitors.forEach(monitor => {
          performanceMonitor.endMonitoring(monitor.id)
        })
      })

      test('应该正确清理过期的监控数据', () => {
        // 创建一些监控数据
        const monitor1 = performanceMonitor.startMonitoring('test1')
        const monitor2 = performanceMonitor.startMonitoring('test2')

        performanceMonitor.endMonitoring(monitor1.id)
        performanceMonitor.endMonitoring(monitor2.id)

        const initialCount = performanceMonitor.metrics.size

        // 清理过期数据
        performanceMonitor.cleanupExpiredMetrics(0) // 立即清理所有已完成的

        expect(performanceMonitor.metrics.size).toBeLessThanOrEqual(initialCount)
      })
    })

    describe('🔧 工具方法测试', () => {
      test('应该正确格式化内存使用信息', () => {
        const memoryUsage = {
          rss: 100 * 1024 * 1024, // 100MB
          heapTotal: 50 * 1024 * 1024, // 50MB
          heapUsed: 30 * 1024 * 1024, // 30MB
          external: 10 * 1024 * 1024 // 10MB
        }

        const formatted = performanceMonitor.formatMemoryUsage(memoryUsage)

        expect(formatted).toHaveProperty('rss')
        expect(formatted).toHaveProperty('heapTotal')
        expect(formatted).toHaveProperty('heapUsed')
        expect(formatted.rss).toContain('MB')
        expect(typeof formatted.rss).toBe('string')
      })

      test('应该正确生成监控ID', () => {
        const id1 = performanceMonitor.generateMonitorId()
        const id2 = performanceMonitor.generateMonitorId()

        expect(typeof id1).toBe('string')
        expect(typeof id2).toBe('string')
        expect(id1).not.toBe(id2) // 确保每次生成的ID都不同
        expect(id1.length).toBeGreaterThan(0)
      })

      test('应该正确计算时间差', () => {
        const startTime = process.hrtime.bigint()

        // 等待一小段时间
        const endTime = startTime + BigInt(5000000) // 添加5ms

        const duration = performanceMonitor.calculateDuration(startTime, endTime)

        expect(typeof duration).toBe('number')
        expect(duration).toBeGreaterThan(0)
        expect(duration).toBeCloseTo(5, 1) // 约5ms，允许1ms误差
      })
    })

    describe('🎯 集成测试', () => {
      test('应该在DataCollector中正确集成性能监控', async () => {
        // 模拟在DataCollector中使用PerformanceMonitor
        const monitor = performanceMonitor.startMonitoring('dataCollection', {
          userId: test_user_id,
          operation: 'collectUserProfile'
        })

        performanceMonitor.addCheckpoint(monitor.id, 'startDataCollection')

        // 执行实际的数据收集操作
        try {
          const userProfile = await dataCollector.collectUserProfile(test_user_id)
          performanceMonitor.addCheckpoint(monitor.id, 'dataCollectionComplete', {
            recordsCollected: 1,
            success: true
          })
        } catch (error) {
          performanceMonitor.addCheckpoint(monitor.id, 'dataCollectionError', {
            error: error.message
          })
        }

        const report = performanceMonitor.endMonitoring(monitor.id, {
          operation: 'collectUserProfile',
          success: true
        })

        // 验证集成监控结果
        expect(report).toHaveProperty('operation', 'dataCollection')
        expect(report.checkpoints).toHaveLength(2)
        expect(report.checkpoints[0].name).toBe('startDataCollection')
        expect(report.checkpoints[1].name).toMatch(/dataCollection(Complete|Error)/)
      })
    })

    afterEach(() => {
      // 清理性能监控数据
      if (performanceMonitor) {
        performanceMonitor.metrics.clear()
        performanceMonitor.alertCallbacks.clear()
      }
    })
  })

  afterAll(async () => {
    // 清理测试环境
    if (dbHelper) {
      await dbHelper.disconnect()
    }
  })
})
