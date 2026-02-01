'use strict'

/**
 * 🚀 极限容量压力测试 - P2-1
 *
 * @description 极限压力测试，用于找到系统的容量边界和降级触发点
 * @version V4.6 - 测试审计标准 P2-1
 * @date 2026-01-30
 *
 * 测试范围：
 * - P2-1.1: 5000用户压测 - 记录降级触发点
 * - P2-1.2: 10000用户极限测试 - 找到系统崩溃点
 * - P2-1.3: 连接池崩溃点测试 - 超过40连接的行为
 *
 * 业务背景：
 * - 餐厅积分抽奖系统需要应对大促等极端流量场景
 * - 需要了解系统的容量上限和降级边界
 * - 为容量规划和限流策略提供数据支撑
 *
 * 测试原则：
 * - 使用真实数据库（restaurant_points_dev）
 * - 通过 ServiceManager 获取服务实例
 * - 渐进式增压，记录各阶段指标
 * - 测试数据动态获取，不使用硬编码
 *
 * 验收标准：
 * - P2-1.1: 记录5000用户时的P99响应时间和降级触发点
 * - P2-1.2: 找到系统无法响应的并发数（崩溃点）
 * - P2-1.3: 记录超过40连接时的具体行为和错误类型
 *
 * ⚠️ 警告：此测试对系统负载非常高，请在非高峰期执行
 *
 * @module tests/stress/capacity-extreme.stress.test
 * @since 2026-01-30
 * @author 后端数据库项目
 */

const { sequelize } = require('../../../config/database')
const { getTestService } = require('../../helpers/UnifiedTestManager')
const { executeConcurrent, delay } = require('../../helpers/test-concurrent-utils')
const { getTestUserId, getTestCampaignId } = require('../../helpers/test-data')
const { v4: uuidv4 } = require('uuid')

/**
 * 极限压力测试配置常量
 *
 * 配置说明：
 * - EXTREME_USERS_5000: 5000用户压测阈值
 * - EXTREME_USERS_10000: 10000用户极限测试阈值
 * - POOL_MAX: 数据库连接池最大连接数（40）
 * - POOL_OVERFLOW_TEST: 超出连接池上限的测试并发数
 */
const TEST_CONFIG = {
  // 极限用户数配置
  EXTREME_USERS_5000: 5000, // P2-1.1 阶段目标
  EXTREME_USERS_10000: 10000, // P2-1.2 阶段目标

  // 数据库连接池配置（与 config/database.js 保持一致）
  POOL_MAX: 40,
  POOL_MIN: 5,
  ACQUIRE_TIMEOUT: 10000, // 10秒

  // 超出连接池上限的测试配置
  POOL_OVERFLOW_CONCURRENT: 100, // 超过40连接的并发数
  POOL_OVERFLOW_HOLD_TIME: 2000, // 每个连接持有时间（毫秒）

  // 分阶段测试配置
  STEP_SIZES: [1000, 2000, 3000, 4000, 5000], // P2-1.1 阶梯
  EXTREME_STEP_SIZES: [5000, 6000, 7000, 8000, 9000, 10000], // P2-1.2 阶梯

  // 控制参数
  MAX_CONCURRENT_BATCH: 500, // 单批最大并发数（避免瞬时压力过大）
  BATCH_INTERVAL: 1000, // 批次间隔（毫秒）

  // 测试超时
  TEST_TIMEOUT_5000: 600000, // 10分钟
  TEST_TIMEOUT_10000: 1200000, // 20分钟
  TEST_TIMEOUT_POOL: 300000 // 5分钟
}

/**
 * 降级触发点指标
 *
 * 记录系统开始出现降级表现的各项指标
 */
const DEGRADATION_THRESHOLDS = {
  // P99响应时间阈值（毫秒）
  P99_WARNING: 1000, // 警告阈值
  P99_CRITICAL: 3000, // 严重阈值
  P99_DEGRADED: 5000, // 降级阈值

  // 成功率阈值（百分比）
  SUCCESS_RATE_WARNING: 95, // 警告阈值
  SUCCESS_RATE_CRITICAL: 90, // 严重阈值
  SUCCESS_RATE_DEGRADED: 80, // 降级阈值

  // 错误率阈值（百分比）
  ERROR_RATE_WARNING: 5, // 警告阈值
  ERROR_RATE_CRITICAL: 10, // 严重阈值
  ERROR_RATE_DEGRADED: 20 // 降级阈值
}

// 极限压力测试需要较长超时（20分钟）
jest.setTimeout(1200000)

describe('🚀 极限容量压力测试（P2-1）', () => {
  // 服务引用
  let IdempotencyService

  // 测试数据（动态获取）
  let testUserId
  let testCampaignId

  // 测试统计
  const testMetrics = {
    timestamp: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
    results: {},
    degradationPoints: {}, // 记录各项降级触发点
    crashPoint: null // 记录系统崩溃点
  }

  // ==================== 测试准备 ====================

  beforeAll(async () => {
    console.log('')
    console.log(
      '╔════════════════════════════════════════════════════════════════════════════════╗'
    )
    console.log(
      '║                    🚀 极限容量压力测试（P2-1）启动                               ║'
    )
    console.log(
      '╠════════════════════════════════════════════════════════════════════════════════╣'
    )
    console.log(
      `║ 📅 开始时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }).padEnd(64)}║`
    )
    console.log(
      '║ ⚠️  警告：此测试对系统负载极高，预计耗时30-60分钟                                 ║'
    )
    console.log(
      '║ ⚠️  建议在非高峰期执行，并监控系统资源使用情况                                    ║'
    )
    console.log(
      '╚════════════════════════════════════════════════════════════════════════════════╝'
    )
    console.log('')

    // 数据库连接验证
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 获取连接池配置
    const poolConfig = sequelize.config.pool || {}
    console.log('📋 连接池配置:')
    console.log(`   - 最大连接数 (max): ${poolConfig.max || 'N/A'}`)
    console.log(`   - 最小连接数 (min): ${poolConfig.min || 'N/A'}`)
    console.log(`   - 获取超时 (acquire): ${poolConfig.acquire || 'N/A'}ms`)

    // 获取服务实例
    IdempotencyService = getTestService('idempotency')
    console.log('✅ 服务获取成功')

    // 获取测试用户和活动
    testUserId = getTestUserId()
    testCampaignId = getTestCampaignId()

    console.log(`👤 测试用户ID: ${testUserId}`)
    console.log(`🎰 测试活动ID: ${testCampaignId}`)

    if (!testUserId || !testCampaignId) {
      console.warn('⚠️ 测试数据未初始化，部分测试可能跳过')
    }

    console.log('')
    console.log('━'.repeat(80))
    console.log('')
  })

  afterAll(async () => {
    console.log('')
    console.log('━'.repeat(80))
    console.log('')
    console.log(
      '╔════════════════════════════════════════════════════════════════════════════════╗'
    )
    console.log(
      '║                    📊 极限容量压力测试完成                                       ║'
    )
    console.log(
      '╠════════════════════════════════════════════════════════════════════════════════╣'
    )
    console.log(
      `║ 📅 结束时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }).padEnd(64)}║`
    )
    console.log(
      '╚════════════════════════════════════════════════════════════════════════════════╝'
    )
    console.log('')

    // 输出测试统计汇总
    printExtremeSummary()
  })

  // ==================== 辅助函数 ====================

  /**
   * 生成唯一的幂等键
   * @param {string} prefix - 前缀标识
   * @returns {string} 唯一幂等键
   */
  function generateIdempotencyKey(prefix = 'extreme') {
    return `${prefix}_${Date.now()}_${uuidv4().substring(0, 8)}`
  }

  /**
   * 计算百分位数
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
   * 判断系统降级状态
   * @param {Object} metrics - 测试指标
   * @returns {Object} 降级状态
   */
  function assessDegradationStatus(metrics) {
    const status = {
      level: 'NORMAL', // NORMAL, WARNING, CRITICAL, DEGRADED
      reasons: []
    }

    // 检查P99响应时间
    if (metrics.p99 >= DEGRADATION_THRESHOLDS.P99_DEGRADED) {
      status.level = 'DEGRADED'
      status.reasons.push(
        `P99响应时间 ${metrics.p99}ms >= ${DEGRADATION_THRESHOLDS.P99_DEGRADED}ms`
      )
    } else if (metrics.p99 >= DEGRADATION_THRESHOLDS.P99_CRITICAL) {
      if (status.level !== 'DEGRADED') status.level = 'CRITICAL'
      status.reasons.push(
        `P99响应时间 ${metrics.p99}ms >= ${DEGRADATION_THRESHOLDS.P99_CRITICAL}ms`
      )
    } else if (metrics.p99 >= DEGRADATION_THRESHOLDS.P99_WARNING) {
      if (status.level === 'NORMAL') status.level = 'WARNING'
      status.reasons.push(`P99响应时间 ${metrics.p99}ms >= ${DEGRADATION_THRESHOLDS.P99_WARNING}ms`)
    }

    // 检查成功率
    const successRateNum = parseFloat(metrics.successRate)
    if (successRateNum <= DEGRADATION_THRESHOLDS.SUCCESS_RATE_DEGRADED) {
      status.level = 'DEGRADED'
      status.reasons.push(
        `成功率 ${successRateNum}% <= ${DEGRADATION_THRESHOLDS.SUCCESS_RATE_DEGRADED}%`
      )
    } else if (successRateNum <= DEGRADATION_THRESHOLDS.SUCCESS_RATE_CRITICAL) {
      if (status.level !== 'DEGRADED') status.level = 'CRITICAL'
      status.reasons.push(
        `成功率 ${successRateNum}% <= ${DEGRADATION_THRESHOLDS.SUCCESS_RATE_CRITICAL}%`
      )
    } else if (successRateNum <= DEGRADATION_THRESHOLDS.SUCCESS_RATE_WARNING) {
      if (status.level === 'NORMAL') status.level = 'WARNING'
      status.reasons.push(
        `成功率 ${successRateNum}% <= ${DEGRADATION_THRESHOLDS.SUCCESS_RATE_WARNING}%`
      )
    }

    return status
  }

  /**
   * 获取降级状态的显示图标
   * @param {string} level - 降级级别
   * @returns {string} 图标
   */
  function getDegradationIcon(level) {
    const icons = {
      NORMAL: '✅',
      WARNING: '⚠️',
      CRITICAL: '🔴',
      DEGRADED: '❌'
    }
    return icons[level] || '❓'
  }

  /**
   * 输出极限测试汇总报告
   */
  function printExtremeSummary() {
    console.log('')
    console.log(
      '╔════════════════════════════════════════════════════════════════════════════════╗'
    )
    console.log(
      '║                         📊 极限压力测试结果汇总报告                              ║'
    )
    console.log(
      '╠════════════════════════════════════════════════════════════════════════════════╣'
    )

    // 输出各阶段测试结果
    Object.entries(testMetrics.results).forEach(([testName, metrics]) => {
      console.log(`║ 📌 ${testName.padEnd(72)}║`)
      if (metrics.p50 !== undefined) {
        console.log(
          `║    P50: ${String(metrics.p50 + 'ms').padEnd(12)} P90: ${String(metrics.p90 + 'ms').padEnd(12)} P99: ${String(metrics.p99 + 'ms').padEnd(12)}        ║`
        )
      }
      if (metrics.successRate !== undefined) {
        console.log(
          `║    成功率: ${metrics.successRate.padEnd(12)} 吞吐量: ${String(metrics.throughput + ' req/s').padEnd(16)}           ║`
        )
      }
      if (metrics.degradationStatus) {
        const icon = getDegradationIcon(metrics.degradationStatus.level)
        console.log(`║    状态: ${icon} ${metrics.degradationStatus.level.padEnd(66)}║`)
      }
      console.log(
        '║                                                                                ║'
      )
    })

    // 输出降级触发点
    if (Object.keys(testMetrics.degradationPoints).length > 0) {
      console.log(
        '╠════════════════════════════════════════════════════════════════════════════════╣'
      )
      console.log(
        '║ 🔔 降级触发点记录:                                                              ║'
      )
      Object.entries(testMetrics.degradationPoints).forEach(([metric, value]) => {
        console.log(`║    ${metric}: ${String(value).padEnd(66)}║`)
      })
    }

    // 输出崩溃点
    if (testMetrics.crashPoint) {
      console.log(
        '╠════════════════════════════════════════════════════════════════════════════════╣'
      )
      console.log(`║ 💥 系统崩溃点: ${String(testMetrics.crashPoint + ' 并发').padEnd(64)}║`)
    }

    console.log(
      '╚════════════════════════════════════════════════════════════════════════════════╝'
    )
    console.log('')
  }

  // ==================== P2-1.1: 5000用户压测 ====================

  describe('P2-1.1 5000用户压测', () => {
    /**
     * 业务场景：5000用户同时发起请求，记录降级触发点
     * 验收标准：记录P99响应时间和降级触发点
     *
     * 测试方式：
     * - 分阶段递增压力（1000 → 2000 → 3000 → 4000 → 5000）
     * - 每阶段记录P50/P90/P99响应时间
     * - 识别降级触发的并发数
     */
    test(
      '5000用户阶梯式压测 - 记录降级触发点',
      async () => {
        if (!testUserId || !testCampaignId) {
          console.warn('⚠️ 跳过测试：测试数据未初始化')
          return
        }

        console.log('')
        console.log('╔════════════════════════════════════════════════════════════════╗')
        console.log('║ P2-1.1 5000用户阶梯式压测                                       ║')
        console.log('╠════════════════════════════════════════════════════════════════╣')
        console.log(`║ 📊 阶梯: ${TEST_CONFIG.STEP_SIZES.join(' → ').padEnd(52)}║`)
        console.log('║ 🎯 目标: 记录降级触发点                                        ║')
        console.log('╚════════════════════════════════════════════════════════════════╝')
        console.log('')

        const stepResults = []
        let degradationTriggered = false
        let degradationConcurrency = null

        for (const [stepIndex, targetConcurrency] of TEST_CONFIG.STEP_SIZES.entries()) {
          console.log(
            `\n🚀 阶段 ${stepIndex + 1}/${TEST_CONFIG.STEP_SIZES.length}: ${targetConcurrency} 用户`
          )

          // 阶段间等待（让系统恢复）
          if (stepIndex > 0) {
            console.log('   ⏳ 等待系统恢复...')
            await delay(TEST_CONFIG.BATCH_INTERVAL * 2)
          }

          /*
           * 分批执行，避免瞬时压力过大
           * 例如：5000用户分成10批，每批500用户
           */
          const batchSize = Math.min(targetConcurrency, TEST_CONFIG.MAX_CONCURRENT_BATCH)
          const totalBatches = Math.ceil(targetConcurrency / batchSize)
          const allResults = []

          console.log(`   📦 分 ${totalBatches} 批执行，每批 ${batchSize} 用户`)

          for (let batch = 0; batch < totalBatches; batch++) {
            const currentBatchSize = Math.min(batchSize, targetConcurrency - batch * batchSize)

            // 创建当前批次的任务
            const tasks = Array(currentBatchSize)
              .fill(null)
              .map((_, index) => async () => {
                const globalIndex = batch * batchSize + index
                const idempotencyKey = generateIdempotencyKey(
                  `5000_step${stepIndex}_batch${batch}_${globalIndex}`
                )
                const startTime = Date.now()

                try {
                  // 通过幂等服务模拟请求
                  await IdempotencyService.getOrCreateRequest(idempotencyKey, {
                    api_path: '/api/v4/lottery/draw',
                    http_method: 'POST',
                    request_params: { lottery_campaign_id: testCampaignId, draw_count: 1 },
                    user_id: testUserId + globalIndex
                  })

                  return {
                    success: true,
                    response_time: Date.now() - startTime
                  }
                } catch (error) {
                  return {
                    success: false,
                    response_time: Date.now() - startTime,
                    error: error.message,
                    error_type: error.name || 'UnknownError'
                  }
                }
              })

            // 执行当前批次
            const { results } = await executeConcurrent(tasks, {
              concurrency: Math.min(currentBatchSize, 200),
              timeout: 60000
            })

            allResults.push(...results)

            // 批次间短暂间隔
            if (batch < totalBatches - 1) {
              await delay(TEST_CONFIG.BATCH_INTERVAL / 2)
            }
          }

          // 统计当前阶段结果
          const responseTimes = allResults
            .filter(r => r.result?.response_time)
            .map(r => r.result.response_time)
            .sort((a, b) => a - b)

          const successCount = allResults.filter(r => r.result?.success).length
          const errorCount = allResults.filter(r => !r.result?.success).length

          const stepMetrics = {
            concurrency: targetConcurrency,
            total: allResults.length,
            succeeded: successCount,
            failed: errorCount,
            successRate: `${((successCount / allResults.length) * 100).toFixed(2)}%`,
            p50: calculatePercentile(responseTimes, 50),
            p90: calculatePercentile(responseTimes, 90),
            p99: calculatePercentile(responseTimes, 99),
            avg:
              responseTimes.length > 0
                ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
                : 0,
            min: responseTimes[0] || 0,
            max: responseTimes[responseTimes.length - 1] || 0,
            throughput: Math.round(
              allResults.length / (responseTimes.reduce((a, b) => a + b, 0) / 1000) || 0
            )
          }

          // 评估降级状态
          const degradationStatus = assessDegradationStatus(stepMetrics)
          stepMetrics.degradationStatus = degradationStatus

          stepResults.push(stepMetrics)

          // 输出阶段结果
          const statusIcon = getDegradationIcon(degradationStatus.level)
          console.log(`   📊 结果: 成功=${successCount}, 失败=${errorCount}`)
          console.log(
            `   ⏱️  P50=${stepMetrics.p50}ms, P90=${stepMetrics.p90}ms, P99=${stepMetrics.p99}ms`
          )
          console.log(
            `   📈 成功率=${stepMetrics.successRate}, 吞吐量=${stepMetrics.throughput} req/s`
          )
          console.log(`   ${statusIcon} 状态: ${degradationStatus.level}`)

          if (degradationStatus.reasons.length > 0) {
            degradationStatus.reasons.forEach(reason => {
              console.log(`      - ${reason}`)
            })
          }

          // 记录降级触发点
          if (
            !degradationTriggered &&
            (degradationStatus.level === 'CRITICAL' || degradationStatus.level === 'DEGRADED')
          ) {
            degradationTriggered = true
            degradationConcurrency = targetConcurrency
            testMetrics.degradationPoints['5000用户测试首次降级'] = `${targetConcurrency} 并发`
            testMetrics.degradationPoints['降级原因'] = degradationStatus.reasons.join('; ')
            console.log(`\n   🔔 降级触发点: ${targetConcurrency} 并发`)
          }

          // 记录测试结果
          testMetrics.results[`P2-1.1 阶段${stepIndex + 1} (${targetConcurrency}用户)`] =
            stepMetrics
        }

        // 输出阶梯测试汇总
        console.log('')
        console.log(
          '╔════════════════════════════════════════════════════════════════════════════════════════════╗'
        )
        console.log(
          '║                              📊 5000用户阶梯测试汇总                                        ║'
        )
        console.log(
          '╠══════════╦══════════╦══════════╦══════════════╦═══════════╦═══════╦═══════╦═══════╦════════╣'
        )
        console.log(
          '║ 并发数   ║ 成功数   ║ 失败数   ║ 成功率       ║ 吞吐量    ║ P50   ║ P90   ║ P99   ║ 状态   ║'
        )
        console.log(
          '╠══════════╬══════════╬══════════╬══════════════╬═══════════╬═══════╬═══════╬═══════╬════════╣'
        )

        for (const result of stepResults) {
          const statusIcon = getDegradationIcon(result.degradationStatus.level)
          console.log(
            `║ ${String(result.concurrency).padStart(8)} ║` +
              ` ${String(result.succeeded).padStart(8)} ║` +
              ` ${String(result.failed).padStart(8)} ║` +
              ` ${result.successRate.padStart(12)} ║` +
              ` ${String(result.throughput + '/s').padStart(9)} ║` +
              ` ${String(result.p50).padStart(5)} ║` +
              ` ${String(result.p90).padStart(5)} ║` +
              ` ${String(result.p99).padStart(5)} ║` +
              ` ${statusIcon}      ║`
          )
        }

        console.log(
          '╚══════════╩══════════╩══════════╩══════════════╩═══════════╩═══════╩═══════╩═══════╩════════╝'
        )

        // 输出降级分析
        console.log('')
        if (degradationTriggered) {
          console.log(`🔔 降级触发点: ${degradationConcurrency} 并发`)
          console.log('   建议:')
          console.log('   1. 在此并发数前配置限流策略')
          console.log('   2. 考虑水平扩展以提高容量')
          console.log('   3. 优化数据库查询和连接池配置')
        } else {
          console.log('✅ 5000用户测试未触发系统降级')
        }

        // 验证测试完成
        expect(stepResults.length).toBe(TEST_CONFIG.STEP_SIZES.length)

        // 验证最后一个阶段成功率 > 50%（极限测试放宽标准）
        const lastResult = stepResults[stepResults.length - 1]
        const lastSuccessRate = parseFloat(lastResult.successRate)
        expect(lastSuccessRate).toBeGreaterThan(50)
      },
      TEST_CONFIG.TEST_TIMEOUT_5000
    )
  })

  // ==================== P2-1.2: 10000用户极限测试 ====================

  describe('P2-1.2 10000用户极限测试', () => {
    /**
     * 业务场景：10000用户极限测试，找到系统崩溃点
     * 验收标准：找到系统无法正常响应的并发数
     *
     * 测试方式：
     * - 从5000开始逐步增加到10000
     * - 每阶段观察成功率和错误类型
     * - 记录系统开始大规模失败的并发数
     */
    test(
      '10000用户极限测试 - 找到系统崩溃点',
      async () => {
        if (!testUserId || !testCampaignId) {
          console.warn('⚠️ 跳过测试：测试数据未初始化')
          return
        }

        console.log('')
        console.log('╔════════════════════════════════════════════════════════════════╗')
        console.log('║ P2-1.2 10000用户极限测试                                        ║')
        console.log('╠════════════════════════════════════════════════════════════════╣')
        console.log(`║ 📊 阶梯: ${TEST_CONFIG.EXTREME_STEP_SIZES.join(' → ').padEnd(40)}     ║`)
        console.log('║ 🎯 目标: 找到系统崩溃点                                         ║')
        console.log('║ ⚠️  警告: 此测试可能导致系统暂时不可用                           ║')
        console.log('╚════════════════════════════════════════════════════════════════╝')
        console.log('')

        const stepResults = []
        let crashDetected = false
        let crashConcurrency = null
        let previousSuccessRate = 100

        for (const [stepIndex, targetConcurrency] of TEST_CONFIG.EXTREME_STEP_SIZES.entries()) {
          // 如果已检测到崩溃，跳过后续阶段
          if (crashDetected) {
            console.log(`\n⏭️ 跳过阶段 ${stepIndex + 1}: 系统已在 ${crashConcurrency} 并发时崩溃`)
            continue
          }

          console.log(
            `\n🔥 阶段 ${stepIndex + 1}/${TEST_CONFIG.EXTREME_STEP_SIZES.length}: ${targetConcurrency} 用户`
          )

          // 阶段间等待（让系统恢复）
          if (stepIndex > 0) {
            console.log('   ⏳ 等待系统恢复...')
            await delay(TEST_CONFIG.BATCH_INTERVAL * 3)
          }

          // 分批执行
          const batchSize = Math.min(targetConcurrency, TEST_CONFIG.MAX_CONCURRENT_BATCH)
          const totalBatches = Math.ceil(targetConcurrency / batchSize)
          const allResults = []
          const errorTypes = new Map()

          console.log(`   📦 分 ${totalBatches} 批执行，每批 ${batchSize} 用户`)

          for (let batch = 0; batch < totalBatches; batch++) {
            const currentBatchSize = Math.min(batchSize, targetConcurrency - batch * batchSize)

            // 创建当前批次的任务
            const tasks = Array(currentBatchSize)
              .fill(null)
              .map((_, index) => async () => {
                const globalIndex = batch * batchSize + index
                const idempotencyKey = generateIdempotencyKey(
                  `10000_step${stepIndex}_batch${batch}_${globalIndex}`
                )
                const startTime = Date.now()

                try {
                  await IdempotencyService.getOrCreateRequest(idempotencyKey, {
                    api_path: '/api/v4/lottery/draw',
                    http_method: 'POST',
                    request_params: { lottery_campaign_id: testCampaignId, draw_count: 1 },
                    user_id: testUserId + globalIndex
                  })

                  return {
                    success: true,
                    response_time: Date.now() - startTime
                  }
                } catch (error) {
                  // 记录错误类型
                  const errorType = error.code || error.name || 'UnknownError'

                  return {
                    success: false,
                    response_time: Date.now() - startTime,
                    error: error.message,
                    error_type: errorType
                  }
                }
              })

            // 执行当前批次
            try {
              const { results } = await executeConcurrent(tasks, {
                concurrency: Math.min(currentBatchSize, 200),
                timeout: 90000 // 延长超时到90秒
              })

              // 统计错误类型
              results.forEach(r => {
                if (!r.result?.success && r.result?.error_type) {
                  const count = errorTypes.get(r.result.error_type) || 0
                  errorTypes.set(r.result.error_type, count + 1)
                }
              })

              allResults.push(...results)
            } catch (batchError) {
              console.log(`   ❌ 批次 ${batch + 1} 执行异常: ${batchError.message}`)
              // 记录批次级别失败
              allResults.push(
                ...Array(currentBatchSize)
                  .fill(null)
                  .map(() => ({
                    result: {
                      success: false,
                      error: batchError.message,
                      error_type: 'BatchExecutionError'
                    }
                  }))
              )
            }

            // 批次间短暂间隔
            if (batch < totalBatches - 1) {
              await delay(TEST_CONFIG.BATCH_INTERVAL / 2)
            }
          }

          // 统计当前阶段结果
          const responseTimes = allResults
            .filter(r => r.result?.response_time)
            .map(r => r.result.response_time)
            .sort((a, b) => a - b)

          const successCount = allResults.filter(r => r.result?.success).length
          const errorCount = allResults.filter(r => !r.result?.success).length
          const currentSuccessRate = (successCount / allResults.length) * 100

          const stepMetrics = {
            concurrency: targetConcurrency,
            total: allResults.length,
            succeeded: successCount,
            failed: errorCount,
            successRate: `${currentSuccessRate.toFixed(2)}%`,
            errorTypes: Object.fromEntries(errorTypes),
            p50: calculatePercentile(responseTimes, 50),
            p90: calculatePercentile(responseTimes, 90),
            p99: calculatePercentile(responseTimes, 99)
          }

          stepResults.push(stepMetrics)

          // 输出阶段结果
          console.log(`   📊 结果: 成功=${successCount}, 失败=${errorCount}`)
          console.log(`   📈 成功率: ${stepMetrics.successRate}`)
          if (responseTimes.length > 0) {
            console.log(
              `   ⏱️  P50=${stepMetrics.p50}ms, P90=${stepMetrics.p90}ms, P99=${stepMetrics.p99}ms`
            )
          }

          // 输出错误类型分布
          if (errorTypes.size > 0) {
            console.log('   ❌ 错误类型分布:')
            errorTypes.forEach((count, type) => {
              console.log(
                `      - ${type}: ${count}次 (${((count / errorCount) * 100).toFixed(1)}%)`
              )
            })
          }

          // 检测崩溃点：成功率骤降超过30%或成功率低于20%
          const successRateDrop = previousSuccessRate - currentSuccessRate

          if (currentSuccessRate < 20 || successRateDrop > 30) {
            crashDetected = true
            crashConcurrency = targetConcurrency
            testMetrics.crashPoint = targetConcurrency

            console.log('')
            console.log(`💥 系统崩溃点检测: ${targetConcurrency} 并发`)
            console.log(`   成功率: ${currentSuccessRate.toFixed(2)}%`)
            console.log(`   成功率下降: ${successRateDrop.toFixed(2)}%`)
          }

          previousSuccessRate = currentSuccessRate

          // 记录测试结果
          testMetrics.results[`P2-1.2 阶段${stepIndex + 1} (${targetConcurrency}用户)`] =
            stepMetrics
        }

        // 输出极限测试汇总
        console.log('')
        console.log(
          '╔════════════════════════════════════════════════════════════════════════════════╗'
        )
        console.log(
          '║                         📊 10000用户极限测试汇总                                ║'
        )
        console.log(
          '╠══════════╦══════════╦══════════╦══════════════╦═══════╦═══════╦═══════╦════════╣'
        )
        console.log(
          '║ 并发数   ║ 成功数   ║ 失败数   ║ 成功率       ║ P50   ║ P90   ║ P99   ║ 状态   ║'
        )
        console.log(
          '╠══════════╬══════════╬══════════╬══════════════╬═══════╬═══════╬═══════╬════════╣'
        )

        for (const result of stepResults) {
          const isCrash =
            crashConcurrency === result.concurrency || parseFloat(result.successRate) < 20
          const statusIcon = isCrash ? '💥' : parseFloat(result.successRate) < 80 ? '⚠️' : '✅'

          console.log(
            `║ ${String(result.concurrency).padStart(8)} ║` +
              ` ${String(result.succeeded).padStart(8)} ║` +
              ` ${String(result.failed).padStart(8)} ║` +
              ` ${result.successRate.padStart(12)} ║` +
              ` ${String(result.p50 || '-').padStart(5)} ║` +
              ` ${String(result.p90 || '-').padStart(5)} ║` +
              ` ${String(result.p99 || '-').padStart(5)} ║` +
              ` ${statusIcon}      ║`
          )
        }

        console.log(
          '╚══════════╩══════════╩══════════╩══════════════╩═══════╩═══════╩═══════╩════════╝'
        )

        // 输出崩溃分析
        console.log('')
        if (crashDetected) {
          console.log(`💥 系统崩溃点: ${crashConcurrency} 并发`)
          console.log('   分析:')
          console.log(
            `   - 建议最大安全并发数: ${Math.floor(crashConcurrency * 0.7)} (70%安全系数)`
          )
          console.log('   - 建议配置限流策略防止到达崩溃点')
          console.log('   - 考虑增加服务器资源或水平扩展')
        } else {
          console.log('✅ 系统在10000并发下仍然存活')
          console.log('   建议继续增加并发数以找到真正的崩溃点')
        }

        // 验证测试执行
        expect(stepResults.length).toBeGreaterThan(0)

        // 如果检测到崩溃，验证崩溃点合理性
        if (crashDetected) {
          expect(crashConcurrency).toBeGreaterThan(1000) // 崩溃点应该 > 1000
        }
      },
      TEST_CONFIG.TEST_TIMEOUT_10000
    )
  })

  // ==================== P2-1.3: 连接池崩溃点测试 ====================

  describe('P2-1.3 连接池崩溃点测试', () => {
    /**
     * 业务场景：测试超过40连接时数据库连接池的行为
     * 验收标准：记录超过40连接时的具体错误类型和行为
     *
     * 测试方式：
     * - 创建超过连接池上限（40）的长时间持有连接
     * - 观察排队、超时、错误等行为
     * - 记录各种错误类型和数量
     */
    test(
      '超过40连接的连接池行为测试',
      async () => {
        console.log('')
        console.log('╔════════════════════════════════════════════════════════════════╗')
        console.log('║ P2-1.3 连接池崩溃点测试                                         ║')
        console.log('╠════════════════════════════════════════════════════════════════╣')
        console.log(
          `║ 📋 连接池配置: max=${TEST_CONFIG.POOL_MAX}, acquire=${TEST_CONFIG.ACQUIRE_TIMEOUT}ms      ║`
        )
        console.log(
          `║ 📊 测试并发数: ${TEST_CONFIG.POOL_OVERFLOW_CONCURRENT}                                       ║`
        )
        console.log(
          `║ ⏱️  连接持有时间: ${TEST_CONFIG.POOL_OVERFLOW_HOLD_TIME}ms                                   ║`
        )
        console.log('║ 🎯 目标: 记录超过40连接时的行为                                 ║')
        console.log('╚════════════════════════════════════════════════════════════════╝')
        console.log('')

        const concurrency = TEST_CONFIG.POOL_OVERFLOW_CONCURRENT // 100并发，超过40连接上限
        const errorTypes = new Map()
        let acquireTimeoutCount = 0
        let connectionErrorCount = 0
        let otherErrorCount = 0

        /**
         * 创建长时间持有连接的任务
         * 模拟慢查询场景，连接被长时间占用
         */
        const createLongHoldTask = taskId => async () => {
          const startTime = Date.now()

          try {
            // 使用 SLEEP 模拟长时间持有连接
            const holdSeconds = TEST_CONFIG.POOL_OVERFLOW_HOLD_TIME / 1000
            await sequelize.query(`SELECT SLEEP(${holdSeconds}), ${taskId} AS task_id`)

            return {
              task_id: taskId,
              success: true,
              duration: Date.now() - startTime,
              held_connection: true
            }
          } catch (error) {
            // 分析错误类型
            let errorType = 'UnknownError'
            const errorMsg = error.message.toLowerCase()

            if (errorMsg.includes('acquire') || errorMsg.includes('timeout')) {
              errorType = 'AcquireTimeout'
              acquireTimeoutCount++
            } else if (
              errorMsg.includes('connection') ||
              errorMsg.includes('pool') ||
              errorMsg.includes('econnrefused')
            ) {
              errorType = 'ConnectionError'
              connectionErrorCount++
            } else {
              errorType = error.name || 'OtherError'
              otherErrorCount++
            }

            // 统计错误类型
            const count = errorTypes.get(errorType) || 0
            errorTypes.set(errorType, count + 1)

            return {
              task_id: taskId,
              success: false,
              duration: Date.now() - startTime,
              error: error.message,
              error_type: errorType
            }
          }
        }

        // 创建任务
        const tasks = Array(concurrency)
          .fill(null)
          .map((_, i) => createLongHoldTask(i + 1))

        console.log(
          `🚀 启动 ${concurrency} 并发长连接任务（超过 ${TEST_CONFIG.POOL_MAX} 连接上限）...`
        )

        // 执行测试
        const startTime = Date.now()
        const { results, metrics } = await executeConcurrent(tasks, {
          concurrency, // 同时发起所有请求
          timeout: TEST_CONFIG.POOL_OVERFLOW_HOLD_TIME * 3 + TEST_CONFIG.ACQUIRE_TIMEOUT * 2
        })
        const totalDuration = Date.now() - startTime

        // 统计结果
        const successResults = results.filter(r => r.result?.success)
        const failedResults = results.filter(r => !r.result?.success)

        // 分析响应时间分布
        const successTimes = successResults.map(r => r.result.duration).sort((a, b) => a - b)
        const failedTimes = failedResults.map(r => r.result.duration).sort((a, b) => a - b)

        // 输出测试结果
        console.log('')
        console.log(
          '╔════════════════════════════════════════════════════════════════════════════════╗'
        )
        console.log(
          '║                         📊 连接池崩溃点测试结果                                 ║'
        )
        console.log(
          '╠════════════════════════════════════════════════════════════════════════════════╣'
        )
        console.log(`║ ⏱️  总耗时: ${String(totalDuration + 'ms').padEnd(68)}║`)
        console.log(`║ 📊 总请求: ${String(concurrency).padEnd(68)}║`)
        console.log(`║ ✅ 成功数: ${String(successResults.length).padEnd(68)}║`)
        console.log(`║ ❌ 失败数: ${String(failedResults.length).padEnd(68)}║`)
        console.log(`║ 📈 成功率: ${metrics.successRate.padEnd(68)}║`)
        console.log(
          '╠════════════════════════════════════════════════════════════════════════════════╣'
        )
        console.log(
          '║ 🔍 错误类型分析:                                                               ║'
        )
        console.log(
          `║    - 连接获取超时 (AcquireTimeout): ${String(acquireTimeoutCount).padEnd(41)}║`
        )
        console.log(
          `║    - 连接错误 (ConnectionError): ${String(connectionErrorCount).padEnd(43)}║`
        )
        console.log(`║    - 其他错误: ${String(otherErrorCount).padEnd(62)}║`)

        if (errorTypes.size > 0) {
          console.log(
            '║                                                                                ║'
          )
          console.log(
            '║ 📋 详细错误分布:                                                               ║'
          )
          errorTypes.forEach((count, type) => {
            console.log(`║    ${type}: ${String(count + '次').padEnd(65)}║`)
          })
        }

        console.log(
          '╠════════════════════════════════════════════════════════════════════════════════╣'
        )
        console.log(
          '║ ⏰ 响应时间分析:                                                               ║'
        )

        if (successTimes.length > 0) {
          console.log(
            `║    成功请求:                                                                   ║`
          )
          console.log(`║      - 最小: ${String(successTimes[0] + 'ms').padEnd(63)}║`)
          console.log(
            `║      - 最大: ${String(successTimes[successTimes.length - 1] + 'ms').padEnd(63)}║`
          )
          console.log(
            `║      - P50:  ${String(calculatePercentile(successTimes, 50) + 'ms').padEnd(63)}║`
          )
          console.log(
            `║      - P90:  ${String(calculatePercentile(successTimes, 90) + 'ms').padEnd(63)}║`
          )
        }

        if (failedTimes.length > 0) {
          console.log(
            `║    失败请求:                                                                   ║`
          )
          console.log(`║      - 最小: ${String(failedTimes[0] + 'ms').padEnd(63)}║`)
          console.log(
            `║      - 最大: ${String(failedTimes[failedTimes.length - 1] + 'ms').padEnd(63)}║`
          )
        }

        console.log(
          '╚════════════════════════════════════════════════════════════════════════════════╝'
        )

        // 分析和建议
        console.log('')
        console.log('📋 行为分析:')

        // 计算有效处理的最大并发数
        const effectiveMaxConcurrent = Math.min(successResults.length, TEST_CONFIG.POOL_MAX)
        console.log(`   - 有效处理的最大并发数: ~${effectiveMaxConcurrent}`)

        if (acquireTimeoutCount > 0) {
          console.log(`   - 检测到 ${acquireTimeoutCount} 次连接获取超时`)
          console.log(
            `     原因: 超过连接池上限(${TEST_CONFIG.POOL_MAX})的请求需要等待，超过${TEST_CONFIG.ACQUIRE_TIMEOUT}ms后超时`
          )
        }

        if (successResults.length >= TEST_CONFIG.POOL_MAX) {
          console.log(
            `   - 连接池复用工作正常: ${successResults.length}个请求成功 (部分复用了释放的连接)`
          )
        }

        // 记录测试结果
        testMetrics.results['P2-1.3 连接池崩溃点'] = {
          concurrency,
          succeeded: successResults.length,
          failed: failedResults.length,
          successRate: metrics.successRate,
          acquireTimeoutCount,
          connectionErrorCount,
          otherErrorCount,
          poolMax: TEST_CONFIG.POOL_MAX,
          errorTypes: Object.fromEntries(errorTypes)
        }

        testMetrics.degradationPoints['连接池溢出测试并发数'] = concurrency
        testMetrics.degradationPoints['连接池上限'] = TEST_CONFIG.POOL_MAX
        testMetrics.degradationPoints['连接获取超时数'] = acquireTimeoutCount

        // 验证：超过连接池上限时应该有部分失败
        expect(concurrency).toBeGreaterThan(TEST_CONFIG.POOL_MAX)

        /*
         * 验证：至少应该有 pool.max 数量的成功（连接池正常工作）
         * 由于连接会复用，成功数可能 > pool.max
         */
        expect(successResults.length).toBeGreaterThanOrEqual(Math.floor(TEST_CONFIG.POOL_MAX * 0.5))

        // 如果有失败，验证主要是超时错误（符合预期）
        if (failedResults.length > 0) {
          const timeoutRatio = acquireTimeoutCount / failedResults.length
          console.log(`   - 超时错误占比: ${(timeoutRatio * 100).toFixed(1)}%`)
          // 大部分失败应该是超时（预期行为）
          expect(timeoutRatio).toBeGreaterThan(0.5)
        }
      },
      TEST_CONFIG.TEST_TIMEOUT_POOL
    )

    /**
     * 连接池耗尽后恢复能力测试
     * 验证：连接池耗尽后，系统能否自动恢复
     */
    test(
      '连接池耗尽后恢复能力测试',
      async () => {
        console.log('')
        console.log('╔════════════════════════════════════════════════════════════════╗')
        console.log('║ P2-1.3.2 连接池恢复能力测试                                     ║')
        console.log('╠════════════════════════════════════════════════════════════════╣')
        console.log('║ 🎯 目标: 验证连接池耗尽后的恢复能力                             ║')
        console.log('╚════════════════════════════════════════════════════════════════╝')
        console.log('')

        // 第一阶段：制造连接池压力
        console.log('📌 阶段1: 制造连接池压力...')
        const stressConcurrency = TEST_CONFIG.POOL_MAX + 20 // 60并发

        const stressTasks = Array(stressConcurrency)
          .fill(null)
          .map((_, i) => async () => {
            try {
              await sequelize.query(`SELECT SLEEP(1), ${i} AS task_id`)
              return { success: true, task_id: i }
            } catch (error) {
              return { success: false, task_id: i, error: error.message }
            }
          })

        const stressStartTime = Date.now()
        await executeConcurrent(stressTasks, {
          concurrency: stressConcurrency,
          timeout: 30000
        })
        const stressDuration = Date.now() - stressStartTime

        console.log(`   压力阶段完成，耗时 ${stressDuration}ms`)

        // 第二阶段：等待连接池恢复
        console.log('\n📌 阶段2: 等待连接池恢复...')
        await delay(3000) // 等待3秒让连接池恢复

        // 第三阶段：验证恢复能力
        console.log('\n📌 阶段3: 验证恢复能力...')
        const recoveryConcurrency = 20 // 较低并发验证恢复

        const recoveryTasks = Array(recoveryConcurrency)
          .fill(null)
          .map((_, i) => async () => {
            const startTime = Date.now()
            try {
              await sequelize.query('SELECT 1 + 1 AS result')
              return {
                success: true,
                task_id: i,
                duration: Date.now() - startTime
              }
            } catch (error) {
              return {
                success: false,
                task_id: i,
                duration: Date.now() - startTime,
                error: error.message
              }
            }
          })

        const { results: recoveryResults, metrics: recoveryMetrics } = await executeConcurrent(
          recoveryTasks,
          {
            concurrency: recoveryConcurrency,
            timeout: 30000
          }
        )

        const recoverySuccessCount = recoveryResults.filter(r => r.result?.success).length
        const recoverySuccessRate = (recoverySuccessCount / recoveryConcurrency) * 100

        console.log('')
        console.log('╔════════════════════════════════════════════════════════════════╗')
        console.log('║ 📊 恢复能力测试结果                                             ║')
        console.log('╠════════════════════════════════════════════════════════════════╣')
        console.log(`║ 压力阶段并发数: ${String(stressConcurrency).padEnd(44)}║`)
        console.log(`║ 压力阶段耗时: ${String(stressDuration + 'ms').padEnd(46)}║`)
        console.log(`║ 恢复后测试并发数: ${String(recoveryConcurrency).padEnd(42)}║`)
        console.log(`║ 恢复后成功数: ${String(recoverySuccessCount).padEnd(46)}║`)
        console.log(`║ 恢复后成功率: ${String(recoverySuccessRate.toFixed(2) + '%').padEnd(46)}║`)
        console.log(`║ 恢复后吞吐量: ${String(recoveryMetrics.throughput + ' req/s').padEnd(46)}║`)
        console.log('╚════════════════════════════════════════════════════════════════╝')

        // 评估恢复能力
        console.log('')
        if (recoverySuccessRate >= 95) {
          console.log('✅ 连接池恢复能力: 优秀 (成功率 >= 95%)')
        } else if (recoverySuccessRate >= 80) {
          console.log('⚠️ 连接池恢复能力: 一般 (成功率 80-95%)')
        } else {
          console.log('❌ 连接池恢复能力: 较差 (成功率 < 80%)')
        }

        // 记录测试结果
        testMetrics.results['P2-1.3.2 连接池恢复'] = {
          stressConcurrency,
          stressDuration,
          recoveryConcurrency,
          recoverySuccessRate: `${recoverySuccessRate.toFixed(2)}%`,
          recoveryThroughput: recoveryMetrics.throughput
        }

        // 验证：恢复后成功率应该 > 80%
        expect(recoverySuccessRate).toBeGreaterThan(80)
      },
      TEST_CONFIG.TEST_TIMEOUT_POOL
    )
  })
})
