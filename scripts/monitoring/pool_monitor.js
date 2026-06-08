/**
 * 数据库连接池监控模块
 * 天工商户营销平台 - 运维工具
 * 创建时间：2025年11月24日 北京时间
 *
 * 功能说明：
 * - 实时监控Sequelize连接池状态
 * - 检测连接池使用率告警
 * - 记录连接池使用历史
 * - 无外部依赖，轻量级实现
 *
 * 使用方式：
 * 1. 作为模块导入：const PoolMonitor = require('./pool-monitor')
 * 2. 直接运行：node pool-monitor.js
 * 3. PM2集成：pm2 start pool-monitor.js --name pool-monitor
 */

'use strict'

const { sequelize } = require('../../models')

/**
 * 数据库连接池监控器
 */
class DatabasePoolMonitor {
  /**
   * 构造函数
   * @param {Object} options - 监控配置选项
   * @param {number} options.checkInterval - 检查间隔（毫秒），默认60秒
   * @param {number} options.activeRatioThreshold - 活跃连接比例告警阈值，默认0.8（80%）
   * @param {number} options.waitingCountThreshold - 等待连接数告警阈值，默认5
   * @param {boolean} options.enableHistory - 是否启用历史记录，默认false
   * @param {number} options.historyMaxSize - 历史记录最大条数，默认100
   */
  constructor(options = {}) {
    this.sequelize = sequelize
    this.config = {
      checkInterval: options.checkInterval || 60000, // 默认60秒
      activeRatioThreshold: options.activeRatioThreshold || 0.8, // 80%
      waitingCountThreshold: options.waitingCountThreshold || 5,
      enableHistory: options.enableHistory || false,
      historyMaxSize: options.historyMaxSize || 100
    }

    // 监控定时器
    this.timer = null

    // 统计数据
    this.stats = {
      totalChecks: 0, // 总检查次数
      alerts: 0, // 告警次数
      lastCheckTime: null, // 最后检查时间
      lastAlertTime: null // 最后告警时间
    }

    // 历史记录
    this.history = []
  }

  /**
   * 获取连接池当前状态
   * @returns {Object} 连接池状态对象
   */
  getPoolStatus() {
    const pool = this.sequelize.connectionManager.pool

    if (!pool) {
      return {
        error: '连接池未初始化',
        available: false
      }
    }

    return {
      size: pool.size || 0, // 当前连接数
      available: pool.available || 0, // 可用连接数
      using: pool.using || 0, // 使用中连接数
      waiting: pool.waiting || 0, // 等待中连接数
      max: pool.max || 0, // 最大连接数
      min: pool.min || 0, // 最小连接数
      timestamp: new Date().toISOString(),
      available: true
    }
  }

  /**
   * 计算连接池使用指标
   * @param {Object} status - 连接池状态
   * @returns {Object} 使用指标
   */
  calculateMetrics(status) {
    if (!status.available) {
      return {
        activeRatio: 0,
        idleRatio: 0,
        utilizationRate: 0
      }
    }

    const activeRatio = status.max > 0 ? status.using / status.max : 0
    const idleRatio = status.max > 0 ? status.available / status.max : 0
    const utilizationRate = status.size > 0 ? status.using / status.size : 0

    return {
      activeRatio: Number(activeRatio.toFixed(4)), // 活跃连接比例
      idleRatio: Number(idleRatio.toFixed(4)), // 空闲连接比例
      utilizationRate: Number(utilizationRate.toFixed(4)) // 连接池利用率
    }
  }

  /**
   * 检查是否需要告警
   * @param {Object} status - 连接池状态
   * @param {Object} metrics - 使用指标
   * @returns {Array} 告警信息数组
   */
  checkAlerts(status, metrics) {
    const alerts = []

    // 1. 检查活跃连接比例
    if (metrics.activeRatio > this.config.activeRatioThreshold) {
      alerts.push({
        type: 'HIGH_ACTIVE_RATIO',
        level: 'WARNING',
        message: `连接池使用率过高: ${(metrics.activeRatio * 100).toFixed(1)}% (阈值: ${this.config.activeRatioThreshold * 100}%)`,
        value: metrics.activeRatio,
        threshold: this.config.activeRatioThreshold,
        recommendation: '考虑增加连接池最大连接数或优化数据库查询'
      })
    }

    // 2. 检查等待连接数
    if (status.waiting > this.config.waitingCountThreshold) {
      alerts.push({
        type: 'HIGH_WAITING_COUNT',
        level: 'CRITICAL',
        message: `连接等待队列过长: ${status.waiting}个 (阈值: ${this.config.waitingCountThreshold})`,
        value: status.waiting,
        threshold: this.config.waitingCountThreshold,
        recommendation: '立即增加连接池最大连接数或检查长时间占用连接的查询'
      })
    }

    // 3. 检查连接池是否接近耗尽
    if (status.available === 0 && status.using === status.max) {
      alerts.push({
        type: 'POOL_EXHAUSTED',
        level: 'CRITICAL',
        message: `连接池已耗尽: 所有${status.max}个连接都在使用中`,
        value: status.max,
        threshold: status.max,
        recommendation: '紧急增加连接池最大连接数或重启应用释放连接'
      })
    }

    return alerts
  }

  /**
   * 执行单次检查
   * @returns {Object} 检查结果
   */
  async performCheck() {
    this.stats.totalChecks++
    this.stats.lastCheckTime = new Date().toISOString()

    // 获取连接池状态
    const status = this.getPoolStatus()

    if (!status.available) {
      console.error('❌ 连接池状态检查失败:', status.error)
      return {
        success: false,
        error: status.error
      }
    }

    // 计算指标
    const metrics = this.calculateMetrics(status)

    // 检查告警
    const alerts = this.checkAlerts(status, metrics)

    // 输出日志
    this.logStatus(status, metrics, alerts)

    // 处理告警
    if (alerts.length > 0) {
      this.stats.alerts++
      this.stats.lastAlertTime = new Date().toISOString()
      this.handleAlerts(alerts)
    }

    // 记录历史
    if (this.config.enableHistory) {
      this.recordHistory({ status, metrics, alerts })
    }

    return {
      success: true,
      status,
      metrics,
      alerts
    }
  }

  /**
   * 输出状态日志
   * @param {Object} status - 连接池状态
   * @param {Object} metrics - 使用指标
   * @param {Array} alerts - 告警信息
   */
  logStatus(status, metrics, alerts) {
    const timestamp = new Date().toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })

    console.log(`\n📊 [${timestamp}] 连接池状态监控`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🔹 连接池状态:')
    console.log(`   总连接: ${status.size}/${status.max} (配置: ${status.min}-${status.max})`)
    console.log(`   使用中: ${status.using} (${(metrics.activeRatio * 100).toFixed(1)}%)`)
    console.log(`   空闲:   ${status.available} (${(metrics.idleRatio * 100).toFixed(1)}%)`)
    console.log(`   等待:   ${status.waiting}`)
    console.log(`   利用率: ${(metrics.utilizationRate * 100).toFixed(1)}%`)

    if (alerts.length > 0) {
      console.log('\n⚠️ 告警信息:')
      alerts.forEach((alert, index) => {
        const icon = alert.level === 'CRITICAL' ? '🔴' : '🟡'
        console.log(`   ${icon} [${alert.level}] ${alert.message}`)
        console.log(`      💡 建议: ${alert.recommendation}`)
      })
    } else {
      console.log('\n✅ 连接池状态正常，无告警')
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  }

  /**
   * 处理告警
   * @param {Array} alerts - 告警信息数组
   */
  handleAlerts(alerts) {
    /*
     * 这里可以集成告警通知（钉钉、企业微信、邮件等）
     * 当前仅记录日志
     */

    alerts.forEach(alert => {
      const logLevel = alert.level === 'CRITICAL' ? 'error' : 'warn'
      console[logLevel](`[ALERT] ${alert.type}: ${alert.message}`)
    })

    /**
     * 告警通知扩展点
     *
     * 当前实现：通过console输出告警
     * 扩展方式：如需发送钉钉/企业微信通知，设置ALERT_WEBHOOK_URL环境变量并实现sendWebhookAlert方法
     */
  }

  /**
   * 记录历史数据
   * @param {Object} data - 监控数据
   */
  recordHistory(data) {
    this.history.push({
      ...data,
      timestamp: new Date().toISOString()
    })

    // 限制历史记录大小
    if (this.history.length > this.config.historyMaxSize) {
      this.history.shift()
    }
  }

  /**
   * 获取历史数据
   * @param {number} limit - 获取最近N条记录
   * @returns {Array} 历史记录数组
   */
  getHistory(limit = 10) {
    return this.history.slice(-limit)
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      alertRate:
        this.stats.totalChecks > 0
          ? ((this.stats.alerts / this.stats.totalChecks) * 100).toFixed(2) + '%'
          : '0%'
    }
  }

  /**
   * 启动监控
   * @param {number} interval - 检查间隔（毫秒），可选
   */
  start(interval) {
    if (this.timer) {
      console.warn('⚠️ 监控已在运行中')
      return
    }

    const checkInterval = interval || this.config.checkInterval

    console.log('🚀 数据库连接池监控已启动')
    console.log(`   检查间隔: ${checkInterval / 1000}秒`)
    console.log(`   活跃连接告警阈值: ${this.config.activeRatioThreshold * 100}%`)
    console.log(`   等待连接告警阈值: ${this.config.waitingCountThreshold}个`)
    console.log(`   历史记录: ${this.config.enableHistory ? '启用' : '禁用'}`)

    // 立即执行一次检查
    this.performCheck()

    // 启动定时检查
    this.timer = setInterval(() => {
      this.performCheck()
    }, checkInterval)
  }

  /**
   * 停止监控
   */
  stop() {
    if (!this.timer) {
      console.warn('⚠️ 监控未运行')
      return
    }

    clearInterval(this.timer)
    this.timer = null

    console.log('🛑 数据库连接池监控已停止')
    console.log('📊 监控统计:')
    console.log(`   总检查次数: ${this.stats.totalChecks}`)
    console.log(`   告警次数: ${this.stats.alerts}`)
    console.log(`   告警率: ${this.getStats().alertRate}`)
  }
}

/**
 * 命令行使用
 */
if (require.main === module) {
  // 解析命令行参数
  const args = process.argv.slice(2)
  const options = {
    checkInterval: 60000, // 默认60秒
    activeRatioThreshold: 0.8,
    waitingCountThreshold: 5,
    enableHistory: false
  }

  // 解析参数
  args.forEach(arg => {
    if (arg.startsWith('--interval=')) {
      options.checkInterval = parseInt(arg.split('=')[1]) * 1000
    } else if (arg.startsWith('--active-threshold=')) {
      options.activeRatioThreshold = parseFloat(arg.split('=')[1])
    } else if (arg.startsWith('--waiting-threshold=')) {
      options.waitingCountThreshold = parseInt(arg.split('=')[1])
    } else if (arg === '--history') {
      options.enableHistory = true
    } else if (arg === '--once') {
      // 单次检查模式
      const monitor = new DatabasePoolMonitor(options)
      monitor
        .performCheck()
        .then(() => {
          process.exit(0)
        })
        .catch(error => {
          console.error('检查失败:', error)
          process.exit(1)
        })
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
数据库连接池监控工具

用法：node pool-monitor.js [选项]

选项：
  --interval=<秒>            检查间隔（秒），默认60秒
  --active-threshold=<比例>  活跃连接告警阈值（0-1），默认0.8
  --waiting-threshold=<数量> 等待连接告警阈值，默认5
  --history                  启用历史记录
  --once                     仅执行一次检查后退出
  --help, -h                 显示此帮助信息

示例：
  node pool-monitor.js --interval=30 --active-threshold=0.85
  node pool-monitor.js --once
  pm2 start pool-monitor.js --name pool-monitor
      `)
      process.exit(0)
    }
  })

  // 创建并启动监控
  const monitor = new DatabasePoolMonitor(options)
  monitor.start()

  // 优雅退出处理
  process.on('SIGINT', () => {
    console.log('\n\n收到退出信号，停止监控...')
    monitor.stop()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    monitor.stop()
    process.exit(0)
  })
}

module.exports = DatabasePoolMonitor
