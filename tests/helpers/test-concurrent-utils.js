'use strict'

/**
 * 🔄 并发测试工具函数
 *
 * @description 提供并发测试所需的工具函数，用于模拟多用户/多设备并发场景
 * @version V4.6 - TDD策略支持
 * @date 2026-01-28
 *
 * 核心功能：
 * 1. 并发请求执行器 - 支持控制并发数、超时、重试
 * 2. 竞态条件检测器 - 检测并发冲突和数据不一致
 * 3. 并发结果分析器 - 统计成功率、响应时间分布
 * 4. 压力测试工具 - 阶梯式增压测试
 *
 * 使用场景：
 * - 多用户同时抽奖（并发抽奖测试）
 * - 积分扣减竞态条件测试
 * - 幂等性验证测试
 * - 系统负载测试
 *
 * @file tests/helpers/test-concurrent-utils.js
 */

const { v4: uuidv4 } = require('uuid')

/**
 * 并发执行配置默认值
 */
const DEFAULT_CONCURRENT_CONFIG = {
  concurrency: 10, // 默认并发数
  timeout: 30000, // 默认超时时间（毫秒）
  retries: 0, // 默认重试次数
  retryDelay: 1000, // 重试延迟（毫秒）
  rampUpTime: 0, // 阶梯增压时间（毫秒）
  collectDetailedMetrics: true // 是否收集详细指标
}

/**
 * 并发执行器 - 执行多个异步任务并控制并发数
 *
 * @param {Array<Function>} tasks - 异步任务数组，每个任务是返回Promise的函数
 * @param {Object} options - 配置选项
 * @param {number} options.concurrency - 最大并发数
 * @param {number} options.timeout - 单个任务超时时间（毫秒）
 * @param {number} options.retries - 失败重试次数
 * @param {number} options.retryDelay - 重试延迟（毫秒）
 * @param {Function} options.onProgress - 进度回调函数
 * @returns {Promise<Object>} 执行结果统计
 *
 * @example
 * const tasks = Array(100).fill().map((_, i) => async () => {
 *   const response = await request(app).post('/api/v4/lottery/draw')
 *   return response
 * })
 *
 * const result = await executeConcurrent(tasks, {
 *   concurrency: 10,
 *   timeout: 5000
 * })
 *
 * console.log(`成功: ${result.succeeded}, 失败: ${result.failed}`)
 */
async function executeConcurrent(tasks, options = {}) {
  const config = { ...DEFAULT_CONCURRENT_CONFIG, ...options }
  const { concurrency, timeout, retries, retryDelay, onProgress, collectDetailedMetrics } = config

  const startTime = Date.now()
  const results = []
  const metrics = {
    total: tasks.length,
    succeeded: 0,
    failed: 0,
    timedOut: 0,
    retried: 0,
    responseTimes: [],
    errors: []
  }

  // 创建任务执行器（带超时和重试）
  const executeTask = async (task, index) => {
    const taskStartTime = Date.now()
    let lastError = null
    let attempts = 0

    while (attempts <= retries) {
      try {
        // 创建超时Promise
        const timeoutPromise = new Promise((_resolve, reject) => {
          setTimeout(() => reject(new Error(`Task ${index} timed out after ${timeout}ms`)), timeout)
        })

        // 执行任务（带超时）
        const result = await Promise.race([task(), timeoutPromise])
        const responseTime = Date.now() - taskStartTime

        if (collectDetailedMetrics) {
          metrics.responseTimes.push(responseTime)
        }
        metrics.succeeded++

        return {
          index,
          success: true,
          result,
          responseTime,
          attempts: attempts + 1
        }
      } catch (error) {
        lastError = error
        attempts++

        if (error.message.includes('timed out')) {
          metrics.timedOut++
        }

        if (attempts <= retries) {
          metrics.retried++
          await new Promise(resolve => setTimeout(resolve, retryDelay))
        }
      }
    }

    // 所有重试都失败
    metrics.failed++
    if (collectDetailedMetrics) {
      metrics.errors.push({
        index,
        error: lastError.message,
        attempts
      })
    }

    return {
      index,
      success: false,
      error: lastError.message,
      responseTime: Date.now() - taskStartTime,
      attempts
    }
  }

  // 控制并发执行
  const executing = new Set()
  let completedCount = 0

  for (const [index, task] of tasks.entries()) {
    const promise = executeTask(task, index).then(result => {
      results[index] = result
      executing.delete(promise)
      completedCount++

      // 进度回调
      if (onProgress) {
        onProgress({
          completed: completedCount,
          total: tasks.length,
          percentage: ((completedCount / tasks.length) * 100).toFixed(1),
          succeeded: metrics.succeeded,
          failed: metrics.failed
        })
      }
    })

    executing.add(promise)

    // 控制并发数
    if (executing.size >= concurrency) {
      await Promise.race(executing)
    }
  }

  // 等待所有任务完成
  await Promise.all(executing)

  // 计算统计指标
  const totalTime = Date.now() - startTime

  if (collectDetailedMetrics && metrics.responseTimes.length > 0) {
    const sortedTimes = [...metrics.responseTimes].sort((a, b) => a - b)
    metrics.statistics = {
      min: sortedTimes[0],
      max: sortedTimes[sortedTimes.length - 1],
      avg: Math.round(sortedTimes.reduce((a, b) => a + b, 0) / sortedTimes.length),
      median: sortedTimes[Math.floor(sortedTimes.length / 2)],
      p90: sortedTimes[Math.floor(sortedTimes.length * 0.9)],
      p95: sortedTimes[Math.floor(sortedTimes.length * 0.95)],
      p99: sortedTimes[Math.floor(sortedTimes.length * 0.99)]
    }
  }

  return {
    results,
    metrics: {
      ...metrics,
      totalTime,
      throughput: Math.round((metrics.total / totalTime) * 1000), // 请求/秒
      successRate: ((metrics.succeeded / metrics.total) * 100).toFixed(2) + '%'
    }
  }
}

/**
 * 竞态条件检测器 - 检测并发操作是否产生数据不一致
 *
 * @param {Object} options - 配置选项
 * @param {Function} options.beforeAction - 操作前获取状态的函数
 * @param {Function} options.action - 要执行的并发操作
 * @param {Function} options.afterAction - 操作后获取状态的函数
 * @param {Function} options.validator - 验证状态一致性的函数
 * @param {number} options.concurrency - 并发数
 * @returns {Promise<Object>} 检测结果
 *
 * @example
 * const result = await detectRaceCondition({
 *   beforeAction: async () => await getPointsBalance(userId),
 *   action: async () => await deductPoints(userId, 100),
 *   afterAction: async () => await getPointsBalance(userId),
 *   validator: (before, results, after) => {
 *     const expectedBalance = before - (results.filter(r => r.success).length * 100)
 *     return Math.abs(after - expectedBalance) < 1
 *   },
 *   concurrency: 10
 * })
 */
async function detectRaceCondition(options) {
  const { beforeAction, action, afterAction, validator, concurrency = 10 } = options

  // 1. 获取操作前状态
  const beforeState = await beforeAction()

  // 2. 并发执行操作
  const tasks = Array(concurrency)
    .fill()
    .map(() => action)

  const { results, metrics } = await executeConcurrent(tasks, { concurrency })

  // 3. 获取操作后状态
  const afterState = await afterAction()

  // 4. 验证一致性
  const isConsistent = validator(beforeState, results, afterState)

  return {
    beforeState,
    afterState,
    concurrency,
    succeeded: metrics.succeeded,
    failed: metrics.failed,
    isConsistent,
    message: isConsistent ? '数据一致性验证通过' : '检测到竞态条件导致的数据不一致'
  }
}

/**
 * 幂等性验证器 - 验证重复请求是否返回相同结果
 *
 * @param {Function} requestFn - 请求函数，接收幂等键作为参数
 * @param {Object} options - 配置选项
 * @param {number} options.repeatCount - 重复请求次数
 * @param {boolean} options.useSameIdempotencyKey - 是否使用相同的幂等键
 * @param {Function} options.resultComparator - 结果比较函数
 * @returns {Promise<Object>} 验证结果
 *
 * @example
 * const result = await verifyIdempotency(
 *   async (idempotencyKey) => {
 *     return await request(app)
 *       .post('/api/v4/lottery/draw')
 *       .set('Idempotency-Key', idempotencyKey)
 *       .send({ draw_count: 1 })
 *   },
 *   {
 *     repeatCount: 5,
 *     useSameIdempotencyKey: true,
 *     resultComparator: (r1, r2) => r1.body.data.draw_id === r2.body.data.draw_id
 *   }
 * )
 */
async function verifyIdempotency(requestFn, options = {}) {
  const { repeatCount = 3, useSameIdempotencyKey = true, resultComparator } = options

  const idempotencyKey = useSameIdempotencyKey ? `idem_test_${uuidv4()}` : null
  const results = []

  for (let i = 0; i < repeatCount; i++) {
    const key = useSameIdempotencyKey ? idempotencyKey : `idem_test_${uuidv4()}`
    const result = await requestFn(key)
    results.push({ key, result, index: i })
  }

  // 验证所有结果是否一致
  let isIdempotent = true
  const comparisonResults = []

  if (useSameIdempotencyKey && results.length > 1) {
    const firstResult = results[0].result

    for (let i = 1; i < results.length; i++) {
      const currentResult = results[i].result
      const isEqual = resultComparator
        ? resultComparator(firstResult, currentResult)
        : JSON.stringify(firstResult.body) === JSON.stringify(currentResult.body)

      comparisonResults.push({
        index: i,
        isEqual,
        firstStatus: firstResult.status,
        currentStatus: currentResult.status
      })

      if (!isEqual) {
        isIdempotent = false
      }
    }
  }

  return {
    idempotencyKey,
    repeatCount,
    useSameIdempotencyKey,
    results: results.map(r => ({
      key: r.key,
      status: r.result.status,
      success: r.result.body?.success
    })),
    comparisonResults,
    isIdempotent,
    message: isIdempotent ? '幂等性验证通过' : '幂等性验证失败：重复请求返回了不同结果'
  }
}

/**
 * 压力测试执行器 - 阶梯式增压测试
 *
 * @param {Function} requestFn - 请求函数
 * @param {Object} options - 配置选项
 * @param {Array<number>} options.steps - 并发阶梯数组
 * @param {number} options.duration - 每个阶梯持续时间（毫秒）
 * @param {number} options.rampUpTime - 阶梯间过渡时间（毫秒）
 * @returns {Promise<Object>} 压力测试结果
 *
 * @example
 * const result = await runStressTest(
 *   async () => await request(app).get('/api/v4/lottery/config'),
 *   {
 *     steps: [10, 20, 50, 100],
 *     duration: 5000,
 *     rampUpTime: 1000
 *   }
 * )
 */
async function runStressTest(requestFn, options = {}) {
  const { steps = [10, 20, 50], duration = 5000, rampUpTime = 1000 } = options

  const stepResults = []

  for (const [index, concurrency] of steps.entries()) {
    console.log(`   阶段 ${index + 1}/${steps.length}: 并发数 ${concurrency}`)

    // 阶梯过渡
    if (index > 0 && rampUpTime > 0) {
      await new Promise(resolve => setTimeout(resolve, rampUpTime))
    }

    // 计算该阶段需要执行的请求数
    const requestCount = Math.ceil((duration / 1000) * concurrency)
    const tasks = Array(requestCount)
      .fill()
      .map(() => requestFn)

    const stepStartTime = Date.now()
    const { metrics } = await executeConcurrent(tasks, {
      concurrency,
      timeout: 10000
    })

    stepResults.push({
      step: index + 1,
      concurrency,
      requestCount,
      duration: Date.now() - stepStartTime,
      ...metrics
    })
  }

  return {
    totalSteps: steps.length,
    stepResults,
    summary: {
      maxConcurrency: Math.max(...steps),
      totalRequests: stepResults.reduce((sum, s) => sum + s.total, 0),
      totalSucceeded: stepResults.reduce((sum, s) => sum + s.succeeded, 0),
      totalFailed: stepResults.reduce((sum, s) => sum + s.failed, 0),
      avgThroughput: Math.round(
        stepResults.reduce((sum, s) => sum + s.throughput, 0) / stepResults.length
      )
    }
  }
}

/**
 * 生成并发测试用的唯一标识
 *
 * @param {string} prefix - 前缀
 * @returns {string} 唯一标识
 */
function generateConcurrentTestId(prefix = 'conc') {
  return `${prefix}_${Date.now()}_${uuidv4().substring(0, 8)}`
}

/**
 * 延迟执行工具
 *
 * @param {number} ms - 延迟毫秒数
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 随机延迟执行工具（模拟真实用户行为）
 *
 * @param {number} minMs - 最小延迟毫秒数
 * @param {number} maxMs - 最大延迟毫秒数
 * @returns {Promise<void>}
 */
function randomDelay(minMs, maxMs) {
  const delayMs = minMs + Math.random() * (maxMs - minMs)
  return delay(delayMs)
}

/**
 * 并发结果分析器 - 分析并发测试结果
 *
 * @param {Array} results - 并发执行结果数组
 * @param {Object} options - 分析选项
 * @returns {Object} 分析结果
 */
function analyzeConcurrentResults(results, options = {}) {
  const { groupBy, filterSuccess = true } = options

  const analysis = {
    total: results.length,
    succeeded: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    successRate: 0,
    uniqueResults: new Set(),
    duplicates: 0
  }

  analysis.successRate = ((analysis.succeeded / analysis.total) * 100).toFixed(2) + '%'

  // 检测重复结果（用于幂等性分析）
  if (filterSuccess) {
    const successResults = results.filter(r => r.success)
    successResults.forEach(r => {
      if (r.result?.body?.data?.draw_id) {
        analysis.uniqueResults.add(r.result.body.data.draw_id)
      }
    })
    analysis.duplicates = analysis.succeeded - analysis.uniqueResults.size
  }

  // 按指定字段分组统计
  if (groupBy) {
    analysis.groups = {}
    results.forEach(r => {
      const key = r.result?.body?.data?.[groupBy] || 'unknown'
      analysis.groups[key] = (analysis.groups[key] || 0) + 1
    })
  }

  return analysis
}

module.exports = {
  // 并发执行器
  executeConcurrent,
  // 竞态条件检测器
  detectRaceCondition,
  // 幂等性验证器
  verifyIdempotency,
  // 压力测试执行器
  runStressTest,
  // 结果分析器
  analyzeConcurrentResults,
  // 工具函数
  generateConcurrentTestId,
  delay,
  randomDelay,
  // 默认配置
  DEFAULT_CONCURRENT_CONFIG
}
