/**
 * 数据库性能监控脚本
 *
 * 业务场景：
 * - 实施《数据库性能问题排查和优化方案.md》中的方案0（持续监控方案）
 * - 监控数据库连接数、慢查询、登录性能等关键指标
 * - 提供数据支撑，在发现实际性能问题时再优化
 *
 * 监控项：
 * 1. 数据库连接数监控（每5分钟）
 * 2. 慢查询频率统计（持续监控）
 * 3. 登录性能监控（通过日志分析）
 *
 * 创建时间：2025-11-09（基于文档建议）
 * 更新时间：2025-11-09
 *
 * 参考文档：docs/数据库性能问题排查和优化方案.md
 *
 * ⚠️ 重要说明：
 * - 这是预防性监控，不是紧急优化
 * - 只在发现实际性能问题时才触发优化
 * - 当前系统运行稳定，无需立即优化
 */

const { sequelize } = require('../../config/database')
const logger = require('../../utils/logger')

/**
 * 数据库性能监控类
 *
 * 功能：
 * 1. 监控数据库连接数
 * 2. 统计慢查询频率
 * 3. 检测性能异常并告警
 */
class DatabasePerformanceMonitor {
  /**
   * 创建数据库性能监控实例
   *
   * 初始化监控配置和慢查询统计数据
   */
  constructor () {
    // 监控配置（基于文档建议的阈值）
    this.config = {
      // 数据库连接数告警阈值（连接池max=40，告警阈值设为80%）
      connection_warning_threshold: 32, // 40 * 0.8 = 32
      connection_critical_threshold: 35, // 40 * 0.875 = 35

      // 慢查询告警阈值（基于文档建议）
      slow_query_warning_threshold: 5, // 每小时5次
      slow_query_critical_threshold: 10, // 每小时10次

      // 监控间隔（毫秒）
      monitor_interval: 5 * 60 * 1000 // 5分钟
    }

    // 慢查询统计（内存统计，重启后清零）
    this.slowQueryStats = {
      count: 0, // 总次数
      lastResetTime: Date.now() // 上次重置时间
    }
  }

  /**
   * 监控数据库连接数
   *
   * 业务场景：
   * - 检测连接池是否接近上限
   * - 发现连接泄漏问题
   * - 评估连接池配置是否合理
   *
   * 告警规则（基于文档建议）：
   * - 连接数>32（80%）：黄色告警
   * - 连接数>35（87.5%）：红色告警
   *
   * 优化触发条件（基于文档3.4节）：
   * - 连接数>35持续1小时 → 执行方案1（调整连接池配置）
   *
   * @returns {Promise<Object>} 监控结果
   * @returns {number} return.current_connections - 当前连接数
   * @returns {number} return.max_connections - 最大连接数（40）
   * @returns {number} return.usage_percentage - 连接数使用率（百分比）
   * @returns {string} return.status - 状态（normal/warning/critical）
   * @returns {string} return.message - 状态说明
   */
  async checkConnectionCount () {
    try {
      // 检查sequelize对象是否已初始化
      if (!sequelize || !sequelize.query) {
        logger.warn('[性能监控] Sequelize对象未初始化，跳过连接数检查')
        return {
          status: 'skipped',
          message: 'Sequelize未初始化',
          timestamp: new Date().toISOString()
        }
      }

      // 查询MySQL连接数
      const [results] = await sequelize.query('SHOW STATUS LIKE "Threads_connected"')
      const currentConnections = parseInt(results[0].Value)

      // 连接池最大连接数（从配置读取）
      const maxConnections = 40 // config/database.js中的pool.max配置

      // 计算使用率
      const usagePercentage = ((currentConnections / maxConnections) * 100).toFixed(1)

      // 判断状态
      let status = 'normal'
      let message = '数据库连接数正常'

      if (currentConnections >= this.config.connection_critical_threshold) {
        status = 'critical'
        message = `🚨 数据库连接数过高（${currentConnections}/${maxConnections}，使用率${usagePercentage}%）`
        logger.error('[性能监控] 数据库连接数过高', {
          current: currentConnections,
          max: maxConnections,
          usage_percentage: usagePercentage,
          threshold: this.config.connection_critical_threshold
        })
      } else if (currentConnections >= this.config.connection_warning_threshold) {
        status = 'warning'
        message = `⚠️ 数据库连接数偏高（${currentConnections}/${maxConnections}，使用率${usagePercentage}%）`
        logger.warn('[性能监控] 数据库连接数偏高', {
          current: currentConnections,
          max: maxConnections,
          usage_percentage: usagePercentage,
          threshold: this.config.connection_warning_threshold
        })
      } else {
        logger.info('[性能监控] 数据库连接数正常', {
          current: currentConnections,
          max: maxConnections,
          usage_percentage: usagePercentage
        })
      }

      return {
        current_connections: currentConnections,
        max_connections: maxConnections,
        usage_percentage: parseFloat(usagePercentage),
        status,
        message,
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      logger.error('[性能监控] 数据库连接数检查失败', { error: error.message })
      return {
        status: 'error',
        message: `连接数检查失败: ${error.message}`,
        timestamp: new Date().toISOString()
      }
    }
  }

  /**
   * 记录慢查询（由慢查询监控调用）
   *
   * 业务场景：
   * - 统计慢查询频率
   * - 判断是否需要优化
   *
   * 优化触发条件（基于文档3.4节）：
   * - 慢查询频率>10次/小时持续1天 → 执行方案1或2
   *
   * ⚠️ 注意：
   * - 这个方法由config/database.js中的slowQueryLogger调用
   * - 当前未集成，需要在config/database.js中添加调用
   *
   * @param {string} _sql - 慢查询SQL语句（保留参数用于未来扩展）
   * @param {number} _timing - 查询时间（毫秒）（保留参数用于未来扩展）
   * @returns {void} 无返回值
   */
  recordSlowQuery (_sql, _timing) {
    this.slowQueryStats.count++

    // 每小时重置计数器
    const now = Date.now()
    const hoursSinceReset = (now - this.slowQueryStats.lastResetTime) / (1000 * 60 * 60)

    if (hoursSinceReset >= 1) {
      const hourlyRate = this.slowQueryStats.count / hoursSinceReset

      // 判断告警级别
      if (hourlyRate >= this.config.slow_query_critical_threshold) {
        logger.error('[性能监控] 慢查询频率过高', {
          count: this.slowQueryStats.count,
          hours: hoursSinceReset.toFixed(1),
          hourly_rate: hourlyRate.toFixed(1),
          threshold: this.config.slow_query_critical_threshold,
          suggestion: '建议执行优化方案1或2（参考文档第4、5节）'
        })
      } else if (hourlyRate >= this.config.slow_query_warning_threshold) {
        logger.warn('[性能监控] 慢查询频率偏高', {
          count: this.slowQueryStats.count,
          hours: hoursSinceReset.toFixed(1),
          hourly_rate: hourlyRate.toFixed(1),
          threshold: this.config.slow_query_warning_threshold,
          suggestion: '持续观察，如持续1天则需优化'
        })
      }

      // 重置计数器
      this.slowQueryStats.count = 1 // 保留当前这次
      this.slowQueryStats.lastResetTime = now
    }
  }

  /**
   * 获取慢查询统计信息
   *
   * @returns {Object} 慢查询统计
   * @returns {number} return.count - 慢查询总次数
   * @returns {number} return.hours_elapsed - 统计时长（小时）
   * @returns {number} return.hourly_rate - 每小时慢查询次数
   */
  getSlowQueryStats () {
    const now = Date.now()
    const hoursElapsed = (now - this.slowQueryStats.lastResetTime) / (1000 * 60 * 60)
    const hourlyRate = this.slowQueryStats.count / hoursElapsed

    return {
      count: this.slowQueryStats.count,
      hours_elapsed: hoursElapsed.toFixed(1),
      hourly_rate: hourlyRate.toFixed(1),
      last_reset_time: new Date(this.slowQueryStats.lastResetTime).toISOString()
    }
  }

  /**
   * 执行完整的性能监控检查
   *
   * 业务场景：
   * - 定时任务调用（每5分钟）
   * - 手动触发性能检查
   * - 生成综合性能报告
   *
   * @returns {Promise<Object>} 综合监控结果
   */
  async performFullCheck () {
    logger.info('[性能监控] 开始执行数据库性能监控...')

    const results = {
      timestamp: new Date().toISOString(),
      checks: {}
    }

    // 1. 数据库连接数监控
    results.checks.connection_count = await this.checkConnectionCount()

    // 2. 慢查询统计
    results.checks.slow_query_stats = this.getSlowQueryStats()

    // 3. 综合评估
    const hasWarning = Object.values(results.checks).some(
      check => check.status === 'warning' || check.status === 'critical'
    )

    results.overall_status = hasWarning ? 'warning' : 'normal'
    results.overall_message = hasWarning ? '发现性能异常，请关注监控数据' : '数据库性能正常'

    logger.info('[性能监控] 数据库性能监控完成', {
      overall_status: results.overall_status,
      connection_status: results.checks.connection_count.status,
      slow_query_count: results.checks.slow_query_stats.count
    })

    return results
  }

  /**
   * 生成性能监控报告（文本格式）
   *
   * 业务场景：
   * - 展示性能监控数据
   * - 提供优化建议
   *
   * @param {Object} monitorResults - performFullCheck()的返回结果
   * @returns {string} 格式化的监控报告
   */
  generateReport (monitorResults) {
    const lines = []
    lines.push('='.repeat(60))
    lines.push('📊 数据库性能监控报告')
    lines.push(`🕐 监控时间: ${monitorResults.timestamp}`)
    lines.push(`📈 综合状态: ${monitorResults.overall_status}`)
    lines.push('='.repeat(60))
    lines.push('')

    // 数据库连接数
    const connCheck = monitorResults.checks.connection_count
    lines.push('🔗 数据库连接数监控:')
    lines.push(`   当前连接数: ${connCheck.current_connections}/${connCheck.max_connections}`)
    lines.push(`   使用率: ${connCheck.usage_percentage}%`)
    lines.push(`   状态: ${connCheck.status}`)
    lines.push(`   说明: ${connCheck.message}`)
    lines.push('')

    // 慢查询统计
    const slowQuery = monitorResults.checks.slow_query_stats
    lines.push('🐌 慢查询统计:')
    lines.push(`   总次数: ${slowQuery.count}次`)
    lines.push(`   统计时长: ${slowQuery.hours_elapsed}小时`)
    lines.push(`   每小时频率: ${slowQuery.hourly_rate}次/小时`)
    lines.push('')

    // 优化建议（基于文档）
    lines.push('💡 优化建议:')
    if (monitorResults.overall_status === 'normal') {
      lines.push('   ✅ 当前性能正常，继续保持监控')
      lines.push('   ✅ 无需执行优化方案')
    } else {
      lines.push('   ⚠️ 发现性能异常，建议：')

      if (connCheck.status === 'critical' || connCheck.status === 'warning') {
        lines.push('   1. 检查是否有连接泄漏（未正确关闭连接）')
        lines.push('   2. 如持续1小时，考虑执行方案1（调整连接池配置）')
        lines.push('   3. 参考文档：docs/数据库性能问题排查和优化方案.md 第4节')
      }

      const slowQueryRate = parseFloat(slowQuery.hourly_rate)
      if (slowQueryRate >= 10) {
        lines.push('   1. 分析慢查询日志，找出具体的慢查询SQL')
        lines.push('   2. 检查是否缺少索引或查询逻辑可优化')
        lines.push('   3. 如持续1天，考虑执行方案1或2')
        lines.push('   4. 参考文档：docs/数据库性能问题排查和优化方案.md 第4-5节')
      }
    }
    lines.push('')

    // 监控触发条件说明（基于文档3.4节）
    lines.push('🎯 优化触发条件（仅在满足时执行优化）:')
    lines.push('   1. 连接数>35持续1小时 → 方案1（调整连接池）')
    lines.push('   2. 慢查询>10次/小时持续1天 → 方案1或2')
    lines.push('   3. 登录响应>3秒持续1周 → 方案2（代码优化）')
    lines.push('   4. 用户数>10万 → 重新评估架构')
    lines.push('')
    lines.push('📚 完整方案参考：docs/数据库性能问题排查和优化方案.md')
    lines.push('='.repeat(60))

    return lines.join('\n')
  }
}

// 创建全局监控实例
const monitor = new DatabasePerformanceMonitor()

/**
 * 定时监控任务（每5分钟执行一次）
 *
 * 业务场景：
 * - 自动执行性能监控
 * - 定期输出监控报告
 *
 * ⚠️ 注意：
 * - 需要在应用启动时调用startScheduledMonitoring()
 * - 或在scheduled-tasks.js中集成
 *
 * @returns {void} 无返回值
 */
function startScheduledMonitoring () {
  logger.info('[性能监控] 启动数据库性能定时监控（间隔5分钟）')

  setInterval(async () => {
    try {
      const results = await monitor.performFullCheck()

      // 只在发现异常时输出完整报告
      if (results.overall_status !== 'normal') {
        const report = monitor.generateReport(results)
        console.log(report)
      }
    } catch (error) {
      logger.error('[性能监控] 定时监控执行失败', { error: error.message })
    }
  }, monitor.config.monitor_interval)

  logger.info('✅ 数据库性能定时监控已启动')
}

/**
 * 手动执行性能监控并输出报告
 *
 * 业务场景：
 * - 开发调试
 * - 手动检查性能
 * - 生成性能报告
 *
 * @returns {Promise<string>} 格式化的监控报告
 *
 * @example
 * const { manualCheck } = require('./scripts/maintenance/database-performance-monitor')
 * const report = await manualCheck()
 * console.log(report)
 */
async function manualCheck () {
  const results = await monitor.performFullCheck()
  const report = monitor.generateReport(results)
  console.log(report)
  return report
}

module.exports = {
  DatabasePerformanceMonitor,
  monitor, // 导出全局监控实例
  startScheduledMonitoring,
  manualCheck
}
