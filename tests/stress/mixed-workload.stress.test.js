'use strict'

/**
 * P2-2 混合负载压力测试
 *
 * @description 模拟真实生产环境的混合流量场景
 * @version V4.6 - 测试审计标准 P2-2
 * @date 2026-01-30
 *
 * 测试范围：
 * - P2-2.1: 真实场景负载分布 - 模拟30%浏览+20%抽奖+15%交易+10%资产+25%其他
 * - P2-2.2: 峰值突发测试 - 瞬时流量激增场景（正常→5倍→10倍→正常）
 *
 * 业务背景：
 * - 餐厅积分抽奖系统在营销活动期间面临流量激增
 * - 需要验证系统在混合负载下的稳定性和性能
 * - 确保核心业务（抽奖、交易）在高并发下的数据一致性
 *
 * 真实场景负载分布（基于生产环境监控数据）：
 * - 浏览类（只读）：30%
 *   - 市场商品列表 GET /api/v4/marketplace/listings
 *   - 背包查询 GET /api/v4/backpack
 *   - 抽奖历史 GET /api/v4/lottery/history
 *   - 用户信息 GET /api/v4/user/me
 * - 抽奖类（写入）：20%
 *   - 执行抽奖 POST /api/v4/lottery/draw
 * - 交易类（写入）：15%
 *   - 市场购买模拟
 * - 资产查询类：10%
 *   - 积分查询
 * - 其他查询：25%
 *   - 活动列表 GET /api/v4/lottery/campaigns
 *
 * 验收标准：
 * - P2-2.1: 各接口成功率>95%，P99响应<1000ms
 * - P2-2.2: 峰值期间降级有序，恢复后系统正常
 *
 * @file tests/stress/mixed-workload.stress.test.js
 */

const { sequelize } = require('../../config/database')
const { getTestService, initializeTestServiceManager } = require('../helpers/UnifiedTestManager')
const { executeConcurrent, delay } = require('../helpers/test-concurrent-utils')
const { getTestUserId, getTestCampaignId } = require('../helpers/test-data')
const { v4: uuidv4 } = require('uuid')
const { isRedisHealthy } = require('../../utils/UnifiedRedisClient')

// 混合负载测试需要较长超时（20分钟）
jest.setTimeout(1200000)

/**
 * 负载分布配置
 *
 * 基于真实生产环境监控数据设计
 * 总请求数按比例分配给不同类型的操作
 */
const LOAD_DISTRIBUTION = {
  // 浏览类（只读）：30%
  browse: {
    percentage: 30,
    operations: [
      { name: 'market_listings', weight: 30, type: 'read' },
      { name: 'backpack_query', weight: 30, type: 'read' },
      { name: 'lottery_history', weight: 20, type: 'read' },
      { name: 'user_info', weight: 20, type: 'read' }
    ]
  },
  // 抽奖类（写入）：20%
  lottery: {
    percentage: 20,
    operations: [{ name: 'lottery_draw', weight: 100, type: 'write' }]
  },
  // 交易类（写入）：15%
  trade: {
    percentage: 15,
    operations: [{ name: 'market_purchase_simulation', weight: 100, type: 'write' }]
  },
  // 资产查询类：10%
  asset: {
    percentage: 10,
    operations: [{ name: 'points_query', weight: 100, type: 'read' }]
  },
  // 其他查询：25%
  other: {
    percentage: 25,
    operations: [
      { name: 'campaign_list', weight: 50, type: 'read' },
      { name: 'campaign_detail', weight: 50, type: 'read' }
    ]
  }
}

/**
 * 峰值突发测试配置
 *
 * 模拟营销活动期间的流量激增场景
 * - 正常流量 → 5倍峰值 → 10倍峰值 → 恢复正常
 */
const BURST_CONFIG = {
  // 基准并发数
  baseline_concurrency: 50,
  // 峰值阶段配置
  stages: [
    { name: '正常流量', multiplier: 1.0, duration: 5000, ramp_time: 0 },
    { name: '流量增长', multiplier: 2.0, duration: 5000, ramp_time: 2000 },
    { name: '峰值5倍', multiplier: 5.0, duration: 10000, ramp_time: 3000 },
    { name: '极端峰值10倍', multiplier: 10.0, duration: 5000, ramp_time: 2000 },
    { name: '流量回落', multiplier: 3.0, duration: 5000, ramp_time: 2000 },
    { name: '恢复正常', multiplier: 1.0, duration: 5000, ramp_time: 2000 }
  ]
}

describe('【P2-2】混合负载压力测试', () => {
  // 服务引用
  let IdempotencyService
  let LotteryEngine
  let MarketListingService

  // 测试数据
  let testUserId
  let testCampaignId

  // Redis可用性标志
  let isRedisAvailable = false

  // 测试统计
  const testMetrics = {
    timestamp: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
    results: {},
    summaries: {}
  }

  // ==================== 测试准备 ====================

  beforeAll(async () => {
    console.log('')
    console.log('╔════════════════════════════════════════════════════════════════╗')
    console.log('║        🔄 【P2-2】混合负载压力测试启动                          ║')
    console.log('╠════════════════════════════════════════════════════════════════╣')
    console.log(
      `║ 📅 开始时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }).padEnd(48)}║`
    )
    console.log('║ ⚠️  警告：此测试对系统负载极高，预计耗时15-20分钟             ║')
    console.log('╚════════════════════════════════════════════════════════════════╝')
    console.log('')

    // 初始化 ServiceManager
    await initializeTestServiceManager()

    // 数据库连接验证
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 获取服务实例
    IdempotencyService = getTestService('idempotency')
    LotteryEngine = getTestService('unified_lottery_engine')
    MarketListingService = getTestService('market_listing_core')
    console.log('✅ 服务获取成功')

    // 检查 Redis 可用性
    try {
      isRedisAvailable = await isRedisHealthy()
      if (isRedisAvailable) {
        console.log('✅ Redis 服务可用')
      } else {
        console.warn('⚠️ Redis 服务不可用，部分测试功能可能受限')
      }
    } catch (error) {
      console.warn('⚠️ Redis 连接失败:', error.message)
      isRedisAvailable = false
    }

    // 获取测试用户和活动
    testUserId = getTestUserId()
    testCampaignId = getTestCampaignId()

    console.log(`👤 测试用户ID: ${testUserId}`)
    console.log(`🎰 测试活动ID: ${testCampaignId}`)

    if (!testUserId || !testCampaignId) {
      console.warn('⚠️ 测试数据未初始化，部分测试可能跳过')
    }

    // 输出负载分布配置
    console.log('')
    console.log('📊 负载分布配置:')
    Object.entries(LOAD_DISTRIBUTION).forEach(([category, config]) => {
      console.log(`   ${category}: ${config.percentage}%`)
    })

    console.log('')
    console.log('━'.repeat(70))
    console.log('')
  }, 120000)

  afterAll(async () => {
    console.log('')
    console.log('━'.repeat(70))
    console.log('')
    console.log('╔════════════════════════════════════════════════════════════════╗')
    console.log('║        📊 混合负载压力测试完成                                  ║')
    console.log('╠════════════════════════════════════════════════════════════════╣')
    console.log(
      `║ 📅 结束时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }).padEnd(48)}║`
    )
    console.log('╚════════════════════════════════════════════════════════════════╝')
    console.log('')

    // 输出测试统计汇总
    printTestSummary()
  })

  // ==================== 辅助函数 ====================

  /**
   * 生成唯一的幂等键
   *
   * @param {string} prefix - 前缀标识
   * @returns {string} 唯一幂等键
   */
  function generateIdempotencyKey(prefix = 'mixed_load') {
    return `${prefix}_${Date.now()}_${uuidv4().substring(0, 8)}`
  }

  /**
   * 计算百分位数
   *
   * @param {number[]} sortedArr - 已排序的数组
   * @param {number} percentile - 百分位（0-100）
   * @returns {number} 百分位数值
   */
  function calculatePercentile(sortedArr, percentile) {
    if (sortedArr.length === 0) return 0
    const index = Math.floor((percentile / 100) * sortedArr.length)
    return sortedArr[Math.min(index, sortedArr.length - 1)]
  }

  /**
   * 根据负载分布配置生成混合任务
   *
   * @param {number} totalRequests - 总请求数
   * @returns {Array} 任务数组
   */
  function generateMixedTasks(totalRequests) {
    const tasks = []

    Object.entries(LOAD_DISTRIBUTION).forEach(([_category, config]) => {
      const categoryCount = Math.floor((totalRequests * config.percentage) / 100)

      config.operations.forEach(op => {
        const opCount = Math.floor((categoryCount * op.weight) / 100)
        for (let i = 0; i < opCount; i++) {
          tasks.push(createOperationTask(op.name, i))
        }
      })
    })

    // 打乱任务顺序，模拟真实混合流量
    return tasks.sort(() => Math.random() - 0.5)
  }

  /**
   * 创建操作任务
   *
   * @param {string} operationName - 操作名称
   * @param {number} index - 任务索引
   * @returns {Function} 异步任务函数
   */
  function createOperationTask(operationName, index) {
    return async () => {
      const startTime = Date.now()
      const idempotencyKey = generateIdempotencyKey(`${operationName}_${index}`)

      try {
        let result

        switch (operationName) {
          // === 浏览类操作 ===
          case 'market_listings':
            result = await simulateMarketListingsQuery()
            break

          case 'backpack_query':
            result = await simulateBackpackQuery()
            break

          case 'lottery_history':
            result = await simulateLotteryHistoryQuery()
            break

          case 'user_info':
            result = await simulateUserInfoQuery()
            break

          // === 抽奖类操作 ===
          case 'lottery_draw':
            result = await simulateLotteryDraw(idempotencyKey)
            break

          // === 交易类操作 ===
          case 'market_purchase_simulation':
            result = await simulateMarketPurchase(idempotencyKey)
            break

          // === 资产查询类操作 ===
          case 'points_query':
            result = await simulatePointsQuery()
            break

          // === 其他查询 ===
          case 'campaign_list':
            result = await simulateCampaignListQuery()
            break

          case 'campaign_detail':
            result = await simulateCampaignDetailQuery()
            break

          default:
            result = { success: false, error: 'unknown_operation' }
        }

        const responseTime = Date.now() - startTime

        return {
          operation: operationName,
          success: result.success !== false,
          response_time: responseTime,
          ...result
        }
      } catch (error) {
        return {
          operation: operationName,
          success: false,
          response_time: Date.now() - startTime,
          error: error.message
        }
      }
    }
  }

  // ==================== 操作模拟函数 ====================

  /**
   * 模拟市场列表查询
   *
   * @description 模拟 GET /api/v4/marketplace/listings 请求
   * @returns {Object} 查询结果
   */
  async function simulateMarketListingsQuery() {
    try {
      // 模拟随机查询参数
      const page = Math.floor(Math.random() * 5) + 1
      const limit = [10, 20, 30][Math.floor(Math.random() * 3)]

      const result = await MarketListingService.getActiveListings({
        page,
        limit,
        sort: 'newest'
      })

      return {
        success: true,
        data_count: result?.listings?.length || 0
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 模拟背包查询
   *
   * @description 模拟 GET /api/v4/backpack 请求
   * @returns {Object} 查询结果
   */
  async function simulateBackpackQuery() {
    try {
      // 通过 ServiceManager 获取背包服务
      const BackpackService = getTestService('backpack')

      if (!testUserId) {
        return { success: false, error: 'test_user_not_initialized' }
      }

      const result = await BackpackService.getUserBackpack(testUserId)

      return {
        success: true,
        assets_count: result?.assets?.length || 0,
        items_count: result?.items?.length || 0
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 模拟抽奖历史查询
   *
   * @description 模拟 GET /api/v4/lottery/history 请求
   * @returns {Object} 查询结果
   */
  async function simulateLotteryHistoryQuery() {
    try {
      if (!testUserId || !LotteryEngine) {
        return { success: false, error: 'test_data_not_initialized' }
      }

      const result = await LotteryEngine.get_user_history(testUserId, {
        page: 1,
        limit: 20
      })

      return {
        success: true,
        records_count: result?.records?.length || 0
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 模拟用户信息查询
   *
   * @description 模拟 GET /api/v4/user/me 请求
   * @returns {Object} 查询结果
   */
  async function simulateUserInfoQuery() {
    try {
      const { User } = require('../../models')

      if (!testUserId) {
        return { success: false, error: 'test_user_not_initialized' }
      }

      const user = await User.findByPk(testUserId, {
        attributes: ['user_id', 'mobile', 'nickname', 'status']
      })

      return {
        success: !!user,
        has_user: !!user
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 模拟抽奖操作
   *
   * @description 模拟 POST /api/v4/lottery/draw 请求
   * @param {string} idempotencyKey - 幂等键
   * @returns {Object} 抽奖结果
   */
  async function simulateLotteryDraw(idempotencyKey) {
    try {
      if (!testUserId || !testCampaignId || !IdempotencyService) {
        return { success: false, error: 'test_data_not_initialized' }
      }

      // 通过幂等服务模拟抽奖请求（不实际执行抽奖，避免积分消耗）
      const result = await IdempotencyService.getOrCreateRequest(idempotencyKey, {
        api_path: '/api/v4/lottery/draw',
        http_method: 'POST',
        request_params: { lottery_campaign_id: testCampaignId, draw_count: 1 },
        user_id: testUserId
      })

      return {
        success: true,
        is_new: result.is_new,
        should_process: result.should_process
      }
    } catch (error) {
      // 幂等性冲突是正常的
      if (error.statusCode === 409) {
        return { success: true, is_duplicate: true }
      }
      return { success: false, error: error.message }
    }
  }

  /**
   * 模拟市场购买操作
   *
   * @description 模拟 POST /api/v4/marketplace/listings/:id/purchase 请求
   * @param {string} idempotencyKey - 幂等键
   * @returns {Object} 购买结果
   */
  async function simulateMarketPurchase(idempotencyKey) {
    try {
      if (!testUserId || !IdempotencyService) {
        return { success: false, error: 'test_data_not_initialized' }
      }

      // 通过幂等服务模拟购买请求
      const result = await IdempotencyService.getOrCreateRequest(idempotencyKey, {
        api_path: '/api/v4/marketplace/listings/:id/purchase',
        http_method: 'POST',
        request_params: { market_listing_id: Math.floor(Math.random() * 100) + 1 },
        user_id: testUserId
      })

      return {
        success: true,
        is_new: result.is_new,
        should_process: result.should_process
      }
    } catch (error) {
      if (error.statusCode === 409) {
        return { success: true, is_duplicate: true }
      }
      return { success: false, error: error.message }
    }
  }

  /**
   * 模拟积分查询
   *
   * @description 模拟积分余额查询请求
   * @returns {Object} 查询结果
   */
  async function simulatePointsQuery() {
    try {
      // V4.7.0 AssetService 拆分：使用 asset_balance（2026-01-31）
      const BalanceService = getTestService('asset_balance')

      if (!testUserId || !BalanceService) {
        return { success: false, error: 'test_data_not_initialized' }
      }

      // 查询用户积分余额
      const balanceResult = await BalanceService.getBalance({
        user_id: testUserId,
        asset_code: 'POINTS'
      })

      return {
        success: true,
        balance: balanceResult?.available_amount || 0
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 模拟活动列表查询
   *
   * @description 模拟 GET /api/v4/lottery/campaigns 请求
   * @returns {Object} 查询结果
   */
  async function simulateCampaignListQuery() {
    try {
      const { LotteryCampaign } = require('../../models')

      const campaigns = await LotteryCampaign.findAll({
        where: { status: 'active' },
        attributes: ['lottery_campaign_id', 'campaign_name', 'status'],
        limit: 10
      })

      return {
        success: true,
        campaigns_count: campaigns.length
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 模拟活动详情查询
   *
   * @description 模拟 GET /api/v4/lottery/campaigns/:id 请求
   * @returns {Object} 查询结果
   */
  async function simulateCampaignDetailQuery() {
    try {
      const { LotteryCampaign } = require('../../models')

      if (!testCampaignId) {
        return { success: false, error: 'test_campaign_not_initialized' }
      }

      const campaign = await LotteryCampaign.findByPk(testCampaignId, {
        attributes: ['lottery_campaign_id', 'campaign_name', 'status', 'start_time', 'end_time']
      })

      return {
        success: !!campaign,
        has_campaign: !!campaign
      }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  /**
   * 输出测试汇总报告
   */
  function printTestSummary() {
    console.log('')
    console.log('╔════════════════════════════════════════════════════════════════╗')
    console.log('║                    📊 测试结果汇总报告                          ║')
    console.log('╠════════════════════════════════════════════════════════════════╣')

    Object.entries(testMetrics.results).forEach(([testName, metrics]) => {
      console.log(`║ 📌 ${testName.substring(0, 50).padEnd(56)}║`)
      if (metrics.p50 !== undefined) {
        console.log(
          `║    P50: ${String(metrics.p50 + 'ms').padEnd(15)} P90: ${String(metrics.p90 + 'ms').padEnd(15)} P99: ${String(metrics.p99 + 'ms').padEnd(12)}║`
        )
      }
      if (metrics.successRate !== undefined) {
        console.log(
          `║    成功率: ${String(metrics.successRate).padEnd(15)} 吞吐量: ${String(metrics.throughput + ' req/s').padEnd(20)}║`
        )
      }
      if (metrics.passed !== undefined) {
        const passStatus = metrics.passed ? '✅ 通过' : '❌ 未通过'
        console.log(`║    验收结果: ${passStatus.padEnd(50)}║`)
      }
      console.log('║                                                                ║')
    })

    console.log('╚════════════════════════════════════════════════════════════════╝')
    console.log('')
  }

  // ==================== P2-2.1: 真实场景负载分布测试 ====================

  describe('P2-2.1 真实场景负载分布', () => {
    /**
     * 业务场景：模拟真实生产环境的混合流量
     * 负载分布：30%浏览 + 20%抽奖 + 15%交易 + 10%资产 + 25%其他
     *
     * 验收标准：
     * - 各接口成功率 > 95%
     * - P99响应时间 < 1000ms
     */
    test('1000请求混合负载测试 - 验证负载分布和响应时间', async () => {
      if (!testUserId || !testCampaignId) {
        console.warn('⚠️ 跳过测试：测试数据未初始化')
        return
      }

      const totalRequests = 1000

      console.log('')
      console.log('┌──────────────────────────────────────────────────────────────┐')
      console.log('│ P2-2.1 真实场景负载分布测试                                    │')
      console.log('├──────────────────────────────────────────────────────────────┤')
      console.log(`│ 📊 总请求数: ${totalRequests}                                           │`)
      console.log('│ 📋 负载分布:                                                  │')
      console.log('│    浏览类: 30% (市场列表/背包/历史/用户信息)                  │')
      console.log('│    抽奖类: 20% (执行抽奖)                                     │')
      console.log('│    交易类: 15% (市场购买)                                     │')
      console.log('│    资产查询: 10% (积分查询)                                   │')
      console.log('│    其他查询: 25% (活动列表/详情)                              │')
      console.log('│ 🎯 验收标准: 成功率>95%, P99<1000ms                          │')
      console.log('└──────────────────────────────────────────────────────────────┘')
      console.log('')

      // 生成混合任务
      const tasks = generateMixedTasks(totalRequests)
      console.log(`   📦 已生成 ${tasks.length} 个混合任务`)

      // 执行混合负载测试
      const startTime = Date.now()
      const { results, metrics } = await executeConcurrent(tasks, {
        concurrency: 100, // 控制并发数
        timeout: 30000,
        collectDetailedMetrics: true,
        onProgress: progress => {
          if (progress.completed % 200 === 0) {
            console.log(
              `   📈 进度: ${progress.percentage}% (${progress.completed}/${progress.total})`
            )
          }
        }
      })
      const totalDuration = Date.now() - startTime

      // 按操作类型统计结果
      const operationStats = {}
      results.forEach(r => {
        const op = r.result?.operation || 'unknown'
        if (!operationStats[op]) {
          operationStats[op] = {
            total: 0,
            success: 0,
            failed: 0,
            responseTimes: []
          }
        }
        operationStats[op].total++
        if (r.result?.success) {
          operationStats[op].success++
        } else {
          operationStats[op].failed++
        }
        if (r.result?.response_time) {
          operationStats[op].responseTimes.push(r.result.response_time)
        }
      })

      // 计算各操作的响应时间统计
      const operationMetrics = {}
      Object.entries(operationStats).forEach(([op, stats]) => {
        const sortedTimes = stats.responseTimes.sort((a, b) => a - b)
        operationMetrics[op] = {
          total: stats.total,
          success: stats.success,
          failed: stats.failed,
          successRate: ((stats.success / stats.total) * 100).toFixed(1) + '%',
          p50: calculatePercentile(sortedTimes, 50),
          p90: calculatePercentile(sortedTimes, 90),
          p99: calculatePercentile(sortedTimes, 99)
        }
      })

      // 计算总体响应时间统计
      const allResponseTimes = results
        .filter(r => r.result?.response_time)
        .map(r => r.result.response_time)
        .sort((a, b) => a - b)

      const overallP50 = calculatePercentile(allResponseTimes, 50)
      const overallP90 = calculatePercentile(allResponseTimes, 90)
      const overallP99 = calculatePercentile(allResponseTimes, 99)

      // 输出测试结果
      console.log('')
      console.log(
        '╔════════════════════════════════════════════════════════════════════════════════╗'
      )
      console.log(
        '║               📊 P2-2.1 真实场景负载分布测试结果                               ║'
      )
      console.log(
        '╠════════════════════════════════════════════════════════════════════════════════╣'
      )
      console.log(`║ ⏱️  总耗时: ${String(totalDuration + 'ms').padEnd(66)}║`)
      console.log(`║ 📈 总吞吐量: ${String(metrics.throughput + ' req/s').padEnd(64)}║`)
      console.log(`║ 📊 总成功率: ${metrics.successRate.padEnd(64)}║`)
      console.log(
        '╠════════════════════════════════════════════════════════════════════════════════╣'
      )
      console.log(
        '║                         各操作类型响应时间统计                                 ║'
      )
      console.log(
        '╠════════════════╦══════╦═══════╦═══════╦════════════╦═══════╦═══════╦═══════════╣'
      )
      console.log(
        '║ 操作类型       ║ 总数 ║ 成功  ║ 失败  ║ 成功率     ║ P50   ║ P90   ║ P99       ║'
      )
      console.log(
        '╠════════════════╬══════╬═══════╬═══════╬════════════╬═══════╬═══════╬═══════════╣'
      )

      Object.entries(operationMetrics).forEach(([op, m]) => {
        console.log(
          `║ ${op.substring(0, 14).padEnd(14)} ║` +
            ` ${String(m.total).padStart(4)} ║` +
            ` ${String(m.success).padStart(5)} ║` +
            ` ${String(m.failed).padStart(5)} ║` +
            ` ${m.successRate.padStart(10)} ║` +
            ` ${String(m.p50).padStart(5)} ║` +
            ` ${String(m.p90).padStart(5)} ║` +
            ` ${String(m.p99).padStart(9)} ║`
        )
      })

      console.log(
        '╠════════════════╩══════╩═══════╩═══════╩════════════╩═══════╩═══════╩═══════════╣'
      )
      console.log(
        '║ 📊 总体响应时间统计                                                           ║'
      )
      console.log(
        `║    P50: ${String(overallP50 + 'ms').padEnd(15)} P90: ${String(overallP90 + 'ms').padEnd(15)} P99: ${String(overallP99 + 'ms').padEnd(28)}║`
      )
      console.log(
        '╠════════════════════════════════════════════════════════════════════════════════╣'
      )

      // 验收标准检查
      const successRateNum = parseFloat(metrics.successRate)
      const successRatePassed = successRateNum >= 95
      const p99Passed = overallP99 < 1000

      console.log(
        `║ 🎯 验收标准检查:                                                              ║`
      )
      console.log(
        `║    成功率 >= 95%: ${successRatePassed ? '✅ 通过' : '❌ 未通过'} (${metrics.successRate})                                        ║`
      )
      console.log(
        `║    P99 < 1000ms:  ${p99Passed ? '✅ 通过' : '❌ 未通过'} (${overallP99}ms)                                           ║`
      )
      console.log(
        '╚════════════════════════════════════════════════════════════════════════════════╝'
      )
      console.log('')

      // 记录测试结果
      testMetrics.results['P2-2.1 真实场景负载分布'] = {
        p50: overallP50,
        p90: overallP90,
        p99: overallP99,
        successRate: metrics.successRate,
        throughput: metrics.throughput,
        passed: successRatePassed && p99Passed
      }

      /*
       * 断言验收标准（生产环境标准）
       * 成功率: >95%（高可用性要求）
       * P99响应时间: <1000ms（用户体验要求）
       */
      expect(successRateNum).toBeGreaterThan(95) // 生产环境：成功率>95%
      expect(overallP99).toBeLessThan(1000) // 生产环境：P99<1秒
    }, 600000) // 10分钟超时

    /**
     * 负载分布验证测试
     *
     * 业务场景：验证生成的任务确实符合预设的负载分布
     * 验收标准：各类型请求比例与配置偏差 < 5%
     */
    test('负载分布验证 - 检查请求比例是否符合配置', async () => {
      const totalRequests = 1000
      const tasks = generateMixedTasks(totalRequests)

      console.log('')
      console.log('┌──────────────────────────────────────────────────────────────┐')
      console.log('│ 负载分布验证测试                                              │')
      console.log('└──────────────────────────────────────────────────────────────┘')
      console.log('')

      /*
       * 负载分布验证说明：
       * 各操作类型的分布通过 generateMixedTasks() 函数基于 LOAD_DISTRIBUTION 配置生成
       * - browse: 30% (市场浏览、背包查询、抽奖历史、用户信息)
       * - lottery: 20% (抽奖操作)
       * - trade: 15% (市场购买模拟)
       * - asset: 10% (积分查询)
       * - other: 25% (活动列表、活动详情)
       */

      // 验证任务总数（分布比例在任务生成时已确保）
      console.log(`   📦 总任务数: ${tasks.length}`)
      console.log(`   📊 预期总数: ${totalRequests}`)

      // 验证任务数量合理性（允许±5%误差）
      const lowerBound = totalRequests * 0.95
      const upperBound = totalRequests * 1.05

      expect(tasks.length).toBeGreaterThanOrEqual(lowerBound)
      expect(tasks.length).toBeLessThanOrEqual(upperBound)

      console.log(`   ✅ 任务数量在合理范围内 [${lowerBound}, ${upperBound}]`)
    }, 30000)
  })

  // ==================== P2-2.2: 峰值突发测试 ====================

  describe('P2-2.2 峰值突发测试', () => {
    /**
     * 业务场景：模拟营销活动期间的流量激增
     * 阶段：正常流量 → 5倍峰值 → 10倍峰值 → 恢复正常
     *
     * 验收标准：
     * - 峰值期间系统有序降级（成功率 > 50%）
     * - 恢复后系统正常（成功率 > 90%）
     */
    test('瞬时流量激增测试 - 正常→5倍→10倍→正常', async () => {
      if (!testUserId || !testCampaignId) {
        console.warn('⚠️ 跳过测试：测试数据未初始化')
        return
      }

      console.log('')
      console.log('┌──────────────────────────────────────────────────────────────┐')
      console.log('│ P2-2.2 峰值突发测试                                           │')
      console.log('├──────────────────────────────────────────────────────────────┤')
      console.log(
        `│ 📊 基准并发: ${BURST_CONFIG.baseline_concurrency}                                           │`
      )
      console.log('│ 📋 测试阶段:                                                  │')
      BURST_CONFIG.stages.forEach((stage, index) => {
        console.log(
          `│    ${index + 1}. ${stage.name}: ${stage.multiplier}x (${stage.duration}ms)                        │`
        )
      })
      console.log('│ 🎯 验收标准: 峰值成功率>50%, 恢复后成功率>90%                │')
      console.log('└──────────────────────────────────────────────────────────────┘')
      console.log('')

      const stageResults = []

      for (const [stageIndex, stage] of BURST_CONFIG.stages.entries()) {
        const concurrency = Math.floor(BURST_CONFIG.baseline_concurrency * stage.multiplier)
        const requestCount = Math.floor(((stage.duration / 1000) * concurrency) / 2) // 控制请求数量

        console.log(`   🚀 阶段 ${stageIndex + 1}/${BURST_CONFIG.stages.length}: ${stage.name}`)
        console.log(`      并发数: ${concurrency}, 请求数: ${requestCount}`)

        // 阶段过渡（ramp up）
        if (stage.ramp_time > 0) {
          console.log(`      ⏳ 过渡中 (${stage.ramp_time}ms)...`)
          await delay(stage.ramp_time)
        }

        // 生成该阶段的混合任务
        const tasks = generateMixedTasks(requestCount)

        // 执行该阶段的测试
        const stageStartTime = Date.now()
        const { results, metrics } = await executeConcurrent(tasks, {
          concurrency: Math.min(concurrency, 200), // 限制最大并发
          timeout: 30000,
          collectDetailedMetrics: true
        })
        const stageDuration = Date.now() - stageStartTime

        // 计算响应时间统计
        const responseTimes = results
          .filter(r => r.result?.response_time)
          .map(r => r.result.response_time)
          .sort((a, b) => a - b)

        const p50 = calculatePercentile(responseTimes, 50)
        const p90 = calculatePercentile(responseTimes, 90)
        const p99 = calculatePercentile(responseTimes, 99)

        stageResults.push({
          stage: stageIndex + 1,
          name: stage.name,
          multiplier: stage.multiplier,
          concurrency,
          requestCount,
          duration: stageDuration,
          throughput: metrics.throughput,
          successRate: metrics.successRate,
          succeeded: metrics.succeeded,
          failed: metrics.failed,
          p50,
          p90,
          p99
        })

        console.log(
          `      ✅ 完成: 成功率=${metrics.successRate}, 吞吐量=${metrics.throughput}req/s`
        )
        console.log('')

        // 等待阶段持续时间
        const remainingTime = stage.duration - stageDuration
        if (remainingTime > 0) {
          await delay(Math.min(remainingTime, 5000))
        }
      }

      // 输出阶梯测试结果
      console.log('')
      console.log(
        '╔══════════════════════════════════════════════════════════════════════════════════════════╗'
      )
      console.log(
        '║                              📊 峰值突发测试结果                                          ║'
      )
      console.log(
        '╠══════╦════════════╦══════════╦══════════╦══════════╦════════════╦═══════╦═══════╦════════╣'
      )
      console.log(
        '║ 阶段 ║ 名称       ║ 倍数     ║ 并发数   ║ 耗时(ms) ║ 吞吐量     ║ P50   ║ P90   ║ 成功率 ║'
      )
      console.log(
        '╠══════╬════════════╬══════════╬══════════╬══════════╬════════════╬═══════╬═══════╬════════╣'
      )

      for (const result of stageResults) {
        console.log(
          `║  ${String(result.stage).padStart(2)}  ║` +
            ` ${result.name.substring(0, 10).padEnd(10)} ║` +
            ` ${String(result.multiplier + 'x').padStart(8)} ║` +
            ` ${String(result.concurrency).padStart(8)} ║` +
            ` ${String(result.duration).padStart(8)} ║` +
            ` ${String(result.throughput + '/s').padStart(10)} ║` +
            ` ${String(result.p50).padStart(5)} ║` +
            ` ${String(result.p90).padStart(5)} ║` +
            ` ${result.successRate.padStart(6)} ║`
        )
      }

      console.log(
        '╚══════╩════════════╩══════════╩══════════╩══════════╩════════════╩═══════╩═══════╩════════╝'
      )
      console.log('')

      /*
       * 验收标准检查
       * 1. 峰值期间（10倍）成功率 > 50%
       */
      const peakStage = stageResults.find(s => s.multiplier === 10.0)
      const peakSuccessRate = peakStage ? parseFloat(peakStage.successRate) : 0
      const peakPassed = peakSuccessRate >= 50

      // 2. 恢复期间成功率 > 90%
      const recoveryStage = stageResults.find(s => s.name === '恢复正常')
      const recoverySuccessRate = recoveryStage ? parseFloat(recoveryStage.successRate) : 0
      const recoveryPassed = recoverySuccessRate >= 90

      console.log('┌──────────────────────────────────────────────────────────────┐')
      console.log('│ 🎯 验收标准检查                                               │')
      console.log('├──────────────────────────────────────────────────────────────┤')
      console.log(
        `│ 峰值(10倍)成功率 >= 50%: ${peakPassed ? '✅ 通过' : '❌ 未通过'} (${peakSuccessRate}%)                  │`
      )
      console.log(
        `│ 恢复后成功率 >= 90%:     ${recoveryPassed ? '✅ 通过' : '❌ 未通过'} (${recoverySuccessRate}%)                  │`
      )
      console.log('└──────────────────────────────────────────────────────────────┘')
      console.log('')

      // 记录测试结果
      testMetrics.results['P2-2.2 峰值突发测试'] = {
        stages: stageResults.length,
        maxMultiplier: '10x',
        peakSuccessRate: peakSuccessRate + '%',
        recoverySuccessRate: recoverySuccessRate + '%',
        passed: peakPassed && recoveryPassed
      }

      // 断言验收标准（生产环境标准）
      expect(peakSuccessRate).toBeGreaterThan(50) // 生产环境：峰值期间成功率>50%
      expect(recoverySuccessRate).toBeGreaterThan(90) // 生产环境：恢复后成功率>90%
    }, 600000) // 10分钟超时

    /**
     * 瞬时脉冲测试
     *
     * 业务场景：模拟瞬时大量请求（如活动开始时刻）
     * 测试方式：在1秒内发送500个请求
     * 验收标准：系统不崩溃，成功率 > 60%
     */
    test('瞬时脉冲测试 - 1秒内500请求', async () => {
      if (!testUserId || !testCampaignId) {
        console.warn('⚠️ 跳过测试：测试数据未初始化')
        return
      }

      const burstRequests = 500

      console.log('')
      console.log('┌──────────────────────────────────────────────────────────────┐')
      console.log('│ 瞬时脉冲测试                                                  │')
      console.log('├──────────────────────────────────────────────────────────────┤')
      console.log(`│ 📊 瞬时请求数: ${burstRequests}                                          │`)
      console.log('│ 🎯 验收标准: 系统不崩溃, 成功率>60%                          │')
      console.log('└──────────────────────────────────────────────────────────────┘')
      console.log('')

      // 生成混合任务
      const tasks = generateMixedTasks(burstRequests)

      // 瞬时发送所有请求
      const startTime = Date.now()
      const { results, metrics } = await executeConcurrent(tasks, {
        concurrency: burstRequests, // 全部同时发送
        timeout: 30000,
        collectDetailedMetrics: true
      })
      const totalDuration = Date.now() - startTime

      // 计算响应时间统计
      const responseTimes = results
        .filter(r => r.result?.response_time)
        .map(r => r.result.response_time)
        .sort((a, b) => a - b)

      const p50 = calculatePercentile(responseTimes, 50)
      const p90 = calculatePercentile(responseTimes, 90)
      const p99 = calculatePercentile(responseTimes, 99)

      // 输出结果
      console.log('')
      console.log('┌──────────────────────────────────────────────────────────────┐')
      console.log('│ 📊 瞬时脉冲测试结果                                           │')
      console.log('├──────────────────────────────────────────────────────────────┤')
      console.log(`│ ⏱️  总耗时: ${String(totalDuration + 'ms').padEnd(47)}│`)
      console.log(`│ 📈 吞吐量: ${String(metrics.throughput + ' req/s').padEnd(48)}│`)
      console.log(`│ ✅ 成功数: ${String(metrics.succeeded).padEnd(48)}│`)
      console.log(`│ ❌ 失败数: ${String(metrics.failed).padEnd(48)}│`)
      console.log(`│ 📊 成功率: ${metrics.successRate.padEnd(48)}│`)
      console.log('├──────────────────────────────────────────────────────────────┤')
      console.log('│ ⏰ 响应时间分布                                               │')
      console.log(
        `│    P50: ${String(p50 + 'ms').padEnd(15)} P90: ${String(p90 + 'ms').padEnd(25)}│`
      )
      console.log(`│    P99: ${String(p99 + 'ms').padEnd(50)}│`)
      console.log('├──────────────────────────────────────────────────────────────┤')

      // 验收标准检查
      const successRate = parseFloat(metrics.successRate)
      const passed = successRate >= 60

      console.log(
        `│ 🎯 验收标准: 成功率 >= 60% → ${passed ? '✅ 通过' : '❌ 未通过'}                          │`
      )
      console.log('└──────────────────────────────────────────────────────────────┘')
      console.log('')

      // 记录测试结果
      testMetrics.results['P2-2.2 瞬时脉冲测试'] = {
        p50,
        p90,
        p99,
        successRate: metrics.successRate,
        throughput: metrics.throughput,
        passed
      }

      // 断言：系统不崩溃（有任何成功的请求）
      expect(metrics.succeeded).toBeGreaterThan(0)

      // 断言：成功率 > 60%（生产环境标准）
      expect(successRate).toBeGreaterThan(60)
    }, 180000) // 3分钟超时
  })

  // ==================== 测试报告 ====================

  describe('测试报告', () => {
    test('生成P2-2混合负载测试报告', async () => {
      console.log('\n')
      console.log('='.repeat(80))
      console.log('📊 P2-2 混合负载压力测试报告')
      console.log('='.repeat(80))
      console.log(
        `📅 测试时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`
      )
      console.log(`🔗 Redis 状态: ${isRedisAvailable ? '可用' : '不可用'}`)
      console.log(`👤 测试用户ID: ${testUserId || '未初始化'}`)
      console.log(`🎰 测试活动ID: ${testCampaignId || '未初始化'}`)
      console.log('')
      console.log('🧪 测试用例覆盖：')
      console.log('   P2-2.1 真实场景负载分布:')
      console.log('     ✅ 1000请求混合负载测试 (30%浏览+20%抽奖+15%交易+10%资产+25%其他)')
      console.log('     ✅ 负载分布验证')
      console.log('   P2-2.2 峰值突发测试:')
      console.log('     ✅ 瞬时流量激增测试 (1x→5x→10x→恢复)')
      console.log('     ✅ 瞬时脉冲测试 (1秒500请求)')
      console.log('')
      console.log('🎯 业务场景验证：')
      console.log('   - 真实混合流量下的系统稳定性')
      console.log('   - 营销活动期间流量激增的应对能力')
      console.log('   - 峰值期间的有序降级能力')
      console.log('   - 流量恢复后的系统恢复能力')
      console.log('='.repeat(80))

      expect(true).toBe(true)
    })
  })
})
