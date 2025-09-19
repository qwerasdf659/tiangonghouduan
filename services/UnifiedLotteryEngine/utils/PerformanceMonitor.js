/**
 * 统一决策引擎性能监控器
 * @description 监控引擎各个组件的性能指标，提供实时监控和分析
 * @version 4.0.0
 * @date 2025-09-10 16:49:01 北京时间
 */

const Logger = require('./Logger')

class PerformanceMonitor {
  constructor () {
    this.logger = new Logger('PerformanceMonitor')
    this.metrics = new Map()
    this.thresholds = {
      decisionTime: 500, // 决策时间阈值：500ms
      probabilityCalc: 50, // 概率计算阈值：50ms
      contextBuild: 100, // 上下文构建阈值：100ms
      poolSelection: 30, // 池选择阈值：30ms
      guaranteeCheck: 20, // 保底检查阈值：20ms
      resultGeneration: 10 // 结果生成阈值：10ms
    }
    this.alertCallbacks = new Map()
  }

  /**
   * 开始性能监控
   * @param {string} operationName - 操作名称
   * @param {Object} context - 上下文信息
   * @returns {Object} 监控句柄
   */
  startMonitoring (operationName, context = {}) {
    const monitorId = this.generateMonitorId()
    const startTime = process.hrtime.bigint()
    const startMemory = process.memoryUsage()

    const monitor = {
      id: monitorId,
      operation: operationName,
      startTime,
      startMemory,
      context,
      checkpoints: []
    }

    this.metrics.set(monitorId, monitor)

    this.logger.debug(`🚀 开始监控: ${operationName}`, {
      monitorId,
      memory: this.formatMemoryUsage(startMemory)
    })

    return {
      id: monitorId,
      checkpoint: (name, data = {}) => this.addCheckpoint(monitorId, name, data),
      finish: (result = {}) => this.finishMonitoring(monitorId, result)
    }
  }

  /**
   * 添加检查点
   * @param {string} monitorId - 监控ID
   * @param {string} checkpointName - 检查点名称
   * @param {Object} data - 检查点数据
   */
  addCheckpoint (monitorId, checkpointName, data = {}) {
    const monitor = this.metrics.get(monitorId)
    if (!monitor) {
      this.logger.warn('监控句柄不存在', { monitorId })
      return
    }

    const checkpoint = {
      name: checkpointName,
      time: process.hrtime.bigint(),
      memory: process.memoryUsage(),
      data
    }

    monitor.checkpoints.push(checkpoint)

    // 计算从开始到当前检查点的耗时
    const durationMs = Number(checkpoint.time - monitor.startTime) / 1000000

    this.logger.debug(`📍 检查点: ${checkpointName}`, {
      monitorId,
      duration: `${durationMs.toFixed(2)}ms`,
      memory: this.formatMemoryUsage(checkpoint.memory)
    })

    // 检查是否超过阈值
    this.checkThreshold(monitor.operation, checkpointName, durationMs)
  }

  /**
   * 完成监控
   * @param {string} monitorId - 监控ID
   * @param {Object} result - 操作结果
   * @returns {Object} 性能报告
   */
  finishMonitoring (monitorId, result = {}) {
    const monitor = this.metrics.get(monitorId)
    if (!monitor) {
      this.logger.warn('监控句柄不存在', { monitorId })
      return null
    }

    const endTime = process.hrtime.bigint()
    const endMemory = process.memoryUsage()
    const totalDuration = Number(endTime - monitor.startTime) / 1000000

    // 生成性能报告
    const report = {
      monitorId,
      operation: monitor.operation,
      totalDuration,
      memoryUsage: {
        start: monitor.startMemory,
        end: endMemory,
        peak: this.calculatePeakMemory(monitor),
        delta: this.calculateMemoryDelta(monitor.startMemory, endMemory)
      },
      checkpoints: monitor.checkpoints.map(cp => ({
        name: cp.name,
        duration: Number(cp.time - monitor.startTime) / 1000000,
        memory: this.formatMemoryUsage(cp.memory),
        data: cp.data
      })),
      result,
      timestamp: new Date().toISOString()
    }

    // 记录性能数据
    this.recordPerformanceData(report)

    // 清理监控数据
    this.metrics.delete(monitorId)

    this.logger.info(`✅ 监控完成: ${monitor.operation}`, {
      duration: `${totalDuration.toFixed(2)}ms`,
      checkpoints: monitor.checkpoints.length
    })

    // 检查总体性能阈值
    this.checkThreshold(monitor.operation, 'total', totalDuration)

    return report
  }

  /**
   * 检查性能阈值
   * @param {string} operation - 操作名称
   * @param {string} phase - 阶段名称
   * @param {number} duration - 持续时间（毫秒）
   */
  checkThreshold (operation, phase, duration) {
    const threshold = this.thresholds[operation] || this.thresholds.decisionTime

    if (duration > threshold) {
      const alert = {
        type: 'PERFORMANCE_ALERT',
        operation,
        phase,
        duration,
        threshold,
        exceedPercentage: (((duration - threshold) / threshold) * 100).toFixed(1),
        timestamp: new Date().toISOString()
      }

      this.logger.warn('⚠️ 性能告警', alert)

      // 触发告警回调
      const callback = this.alertCallbacks.get(operation)
      if (callback) {
        try {
          callback(alert)
        } catch (error) {
          this.logger.error('告警回调执行失败', { error: error.message })
        }
      }
    }
  }

  /**
   * 记录性能数据到数据库（可选）
   * @param {Object} report - 性能报告
   */
  async recordPerformanceData (report) {
    try {
      // 这里可以集成SystemMetrics模型记录到数据库
      // const { SystemMetrics } = require('../../../models')
      // await SystemMetrics.recordPerformanceMetric(
      //   report.operation,
      //   report.totalDuration,
      //   report
      // )

      // 暂时只记录到内存中用于分析
      this.storeInMemoryStats(report)
    } catch (error) {
      this.logger.error('记录性能数据失败', { error: error.message })
    }
  }

  /**
   * 存储内存统计信息
   * @param {Object} report - 性能报告
   */
  storeInMemoryStats (report) {
    const key = `${report.operation}_stats`
    const existing = this.metrics.get(key) || {
      count: 0,
      totalTime: 0,
      maxTime: 0,
      minTime: Infinity
    }

    existing.count++
    existing.totalTime += report.totalDuration
    existing.maxTime = Math.max(existing.maxTime, report.totalDuration)
    existing.minTime = Math.min(existing.minTime, report.totalDuration)
    existing.avgTime = existing.totalTime / existing.count
    existing.lastUpdate = new Date().toISOString()

    this.metrics.set(key, existing)
  }

  /**
   * 获取性能统计
   * @param {string} operation - 操作名称
   * @returns {Object} 统计信息
   */
  getStats (operation = null) {
    if (operation) {
      return this.metrics.get(`${operation}_stats`) || null
    }

    const allStats = {}
    for (const [key, value] of this.metrics.entries()) {
      if (key.endsWith('_stats')) {
        const opName = key.replace('_stats', '')
        allStats[opName] = value
      }
    }

    return allStats
  }

  /**
   * 注册告警回调
   * @param {string} operation - 操作名称
   * @param {Function} callback - 回调函数
   */
  onAlert (operation, callback) {
    this.alertCallbacks.set(operation, callback)
  }

  /**
   * 生成监控ID
   * @returns {string} 唯一监控ID
   */
  generateMonitorId () {
    return `monitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * 格式化内存使用量
   * @param {Object} memoryUsage - 内存使用对象
   * @returns {string} 格式化的内存使用量
   */
  formatMemoryUsage (memoryUsage) {
    return {
      rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)}MB`,
      heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`,
      heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)}MB`
    }
  }

  /**
   * 计算峰值内存
   * @param {Object} monitor - 监控对象
   * @returns {Object} 峰值内存使用量
   */
  calculatePeakMemory (monitor) {
    let peakRss = monitor.startMemory.rss
    let peakHeapUsed = monitor.startMemory.heapUsed

    monitor.checkpoints.forEach(cp => {
      peakRss = Math.max(peakRss, cp.memory.rss)
      peakHeapUsed = Math.max(peakHeapUsed, cp.memory.heapUsed)
    })

    return this.formatMemoryUsage({ rss: peakRss, heapUsed: peakHeapUsed, heapTotal: 0 })
  }

  /**
   * 计算内存增量
   * @param {Object} startMemory - 开始时内存
   * @param {Object} endMemory - 结束时内存
   * @returns {Object} 内存增量
   */
  calculateMemoryDelta (startMemory, endMemory) {
    return {
      rss: `${((endMemory.rss - startMemory.rss) / 1024 / 1024).toFixed(2)}MB`,
      heapUsed: `${((endMemory.heapUsed - startMemory.heapUsed) / 1024 / 1024).toFixed(2)}MB`
    }
  }
}

module.exports = PerformanceMonitor
