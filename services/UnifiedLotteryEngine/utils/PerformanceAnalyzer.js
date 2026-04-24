/**
 * 性能分析器 - 从 PerformanceMonitor 拆分的分析和统计功能
 * @version 1.0.0
 */

const BeijingTimeHelper = require('../../../utils/timeHelper')

/**
 * 性能分析器 - 提供性能报告分析和统计功能
 */
class PerformanceAnalyzer {
  /**
   * 创建性能分析器实例
   * @param {Object} monitor - 性能监控器实例
   */
  constructor(monitor) {
    this.monitor = monitor
    this.logger = require('../../../utils/logger').logger
  }

  /**
   * 分析性能报告
   * @param {Object} report - 性能报告
   * @returns {Object} 性能分析结果
   */
  analyzePerformance(report) {
    const bottlenecks = []
    const recommendations = []
    let overallRating = 'excellent'

    const threshold =
      this.monitor.thresholds[report.operation] || this.monitor.thresholds.decisionTime
    if (report.duration > threshold) {
      bottlenecks.push({
        type: 'TOTAL_DURATION',
        actual: report.duration,
        threshold,
        severity: report.duration > threshold * 2 ? 'high' : 'medium'
      })
      overallRating = 'poor'
    }

    report.checkpoints.forEach(checkpoint => {
      if (checkpoint.data && checkpoint.data.duration) {
        const cpThreshold = this.monitor.thresholds[checkpoint.data.type] || 100
        if (checkpoint.data.duration > cpThreshold) {
          bottlenecks.push({
            type: 'CHECKPOINT',
            name: checkpoint.name,
            actual: checkpoint.data.duration,
            threshold: cpThreshold,
            severity: checkpoint.data.duration > cpThreshold * 2 ? 'high' : 'medium'
          })
        }
      }
    })

    if (bottlenecks.length > 0) {
      recommendations.push('考虑优化慢执行的操作步骤')
      recommendations.push('检查是否存在不必要的同步操作')
      overallRating = bottlenecks.some(b => b.severity === 'high') ? 'poor' : 'fair'
    }

    if (report.memoryUsage.delta.rss.includes('-') === false) {
      const memoryIncrease = parseFloat(report.memoryUsage.delta.rss)
      if (memoryIncrease > 10) {
        recommendations.push('注意内存使用增长，检查是否存在内存泄漏')
        if (overallRating === 'excellent') overallRating = 'good'
      }
    }

    return {
      bottlenecks,
      recommendations,
      overallRating,
      performanceScore: this.calculatePerformanceScore(report, bottlenecks)
    }
  }

  /**
   * 根据瓶颈计算性能评分
   * @param {Object} report - 性能报告
   * @param {Array} bottlenecks - 瓶颈列表
   * @returns {number} 0-100 的性能评分
   */
  calculatePerformanceScore(report, bottlenecks) {
    let score = 100
    bottlenecks.forEach(bottleneck => {
      if (bottleneck.severity === 'high') score -= 30
      else if (bottleneck.severity === 'medium') score -= 15
      else score -= 5
    })
    return Math.max(0, score)
  }

  /**
   * 获取综合性能统计数据
   * @returns {Object} 包含操作统计、内存趋势等信息
   */
  getStatistics() {
    return {
      totalOperations: this.monitor.globalStats.totalOperations,
      averageDuration:
        this.monitor.globalStats.totalOperations > 0
          ? this.monitor.globalStats.totalTime / this.monitor.globalStats.totalOperations
          : 0,
      operationTypes: Object.keys(this.monitor.getStats()),
      memoryTrends: this.calculateMemoryTrends(),
      global: {
        totalOperations: this.monitor.globalStats.totalOperations,
        averageTime:
          this.monitor.globalStats.totalOperations > 0
            ? this.monitor.globalStats.totalTime / this.monitor.globalStats.totalOperations
            : 0,
        totalTime: this.monitor.globalStats.totalTime,
        recentAlerts: this.monitor.globalStats.alerts.slice(-10)
      },
      operations: this.monitor.getStats(),
      thresholds: this.monitor.thresholds,
      activeMonitors: this.monitor.metrics.size
    }
  }

  /**
   * 计算内存使用趋势
   * @returns {Object} 内存趋势信息
   */
  calculateMemoryTrends() {
    return { trend: 'stable', recent: [], prediction: 'normal' }
  }

  /**
   * 计算时间间隔（纳秒转毫秒）
   * @param {bigint} startTime - 起始时间
   * @param {bigint} endTime - 结束时间
   * @returns {number} 持续时间（毫秒）
   */
  calculateDuration(startTime, endTime) {
    return Number(endTime - startTime) / 1000000
  }

  /**
   * 获取实时性能指标
   * @returns {Object} 当前系统性能指标
   */
  getRealTimeMetrics() {
    const now = BeijingTimeHelper.timestamp()
    const metrics = {
      timestamp: BeijingTimeHelper.now(),
      activeMonitors: this.monitor.metrics.size,
      systemMemory: this.monitor.formatMemoryUsage(process.memoryUsage()),
      systemLoad: process.platform === 'linux' ? require('os').loadavg() : [0, 0, 0],
      memoryUsage: this.monitor.formatMemoryUsage(process.memoryUsage()),
      uptime: process.uptime(),
      recentActivity: []
    }

    for (const [id, monitor] of this.monitor.metrics.entries()) {
      const age = now - Number(monitor.startTime) / 1000000
      if (age < 60000) {
        metrics.recentActivity.push({
          id,
          operation: monitor.operation,
          age: Math.round(age),
          checkpoints: monitor.checkpoints.length
        })
      }
    }
    return metrics
  }

  /**
   * 清理过期的性能指标数据
   * @param {number} maxAge - 最大保留时间（毫秒），默认 300000
   * @returns {number} 清理的指标数量
   */
  cleanupExpiredMetrics(maxAge = 300000) {
    const now = BeijingTimeHelper.timestamp()
    let cleanedCount = 0
    for (const [key, value] of this.monitor.metrics.entries()) {
      if (key.includes('monitor_')) continue
      if (key.endsWith('_stats') && value.lastUpdate) {
        const age = now - new Date(value.lastUpdate).getTime()
        if (age > maxAge) {
          this.monitor.metrics.delete(key)
          cleanedCount++
        }
      }
    }
    this.logger.debug(`清理过期指标: ${cleanedCount}个`)
    return cleanedCount
  }

  /**
   * 分析多份报告的内存变化趋势
   * @param {Array} reports - 性能报告数组
   * @returns {Object} 内存趋势分析结果
   */
  analyzeMemoryTrend(reports) {
    if (!reports || reports.length < 2) {
      return {
        trend: 'insufficient_data',
        recommendations: ['需要更多数据点进行分析'],
        severity: 'low'
      }
    }

    const memoryDeltas = reports.map(report => {
      const deltaStr = report.memoryUsage.delta.rss
      return parseFloat(deltaStr.replace('MB', ''))
    })

    const avgDelta = memoryDeltas.reduce((sum, d) => sum + d, 0) / memoryDeltas.length
    const maxDelta = Math.max(...memoryDeltas)
    const minDelta = Math.min(...memoryDeltas)

    let trend = 'stable'
    let recommendations = ['内存使用趋势正常']
    let severity = 'low'

    if (avgDelta > 5) {
      trend = 'increasing'
      recommendations = ['内存使用呈上升趋势，建议检查是否存在内存泄漏']
      severity = 'medium'
    } else if (avgDelta < -1) {
      trend = 'decreasing'
      recommendations = ['内存使用有所优化']
    }

    if (maxDelta > 20) {
      trend = 'volatile'
      recommendations = ['内存使用波动较大，建议优化内存管理策略']
      severity = 'high'
    }

    return {
      trend,
      recommendations,
      severity,
      statistics: {
        average: avgDelta.toFixed(2) + 'MB',
        maximum: maxDelta.toFixed(2) + 'MB',
        minimum: minDelta.toFixed(2) + 'MB',
        volatility: (maxDelta - minDelta).toFixed(2) + 'MB'
      }
    }
  }
}

module.exports = PerformanceAnalyzer
