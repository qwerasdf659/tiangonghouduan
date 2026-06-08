/**
 * 轻量级系统监控脚本
 * 天工商户营销平台 - 运维工具
 * 创建时间：2025年11月24日 北京时间
 *
 * 功能说明：
 * - 数据库连接监控
 * - Redis连接监控
 * - 内存使用监控
 * - 磁盘空间监控（可选）
 * - 慢查询统计（可选）
 * - 告警通知（钉钉/企业微信）
 *
 * 特点：
 * - 无外部依赖
 * - 轻量级实现
 * - 易于扩展
 * - 支持告警通知
 *
 * 使用方式：
 * 1. 直接运行：node lightweight-monitor.js
 * 2. PM2管理：pm2 start lightweight-monitor.js --name system-monitor
 * 3. 单次检查：node lightweight-monitor.js --once
 */

'use strict'

const { sequelize } = require('../../models')
const { exec } = require('child_process')
const { promisify } = require('util')
const execAsync = promisify(exec)

/**
 * 轻量级系统监控器
 */
class LightweightMonitor {
  /**
   * 构造函数
   * @param {Object} config - 监控配置
   */
  constructor(config = {}) {
    this.config = {
      checkInterval: config.checkInterval || 5 * 60 * 1000, // 默认5分钟
      alertWebhookUrl: config.alertWebhookUrl || process.env.ALERT_WEBHOOK_URL,
      memoryThreshold: config.memoryThreshold || 90, // 90%
      diskThreshold: config.diskThreshold || 90, // 90%
      enableDiskCheck: config.enableDiskCheck !== false, // 默认启用
      enableSlowQueryCheck: config.enableSlowQueryCheck || false // 默认禁用
    }

    this.timer = null
    this.stats = {
      totalChecks: 0,
      alerts: 0,
      lastCheckTime: null,
      lastAlertTime: null
    }
  }

  /**
   * 执行综合健康检查
   * @returns {Promise<Object>} 检查结果
   */
  async performCheck() {
    this.stats.totalChecks++
    this.stats.lastCheckTime = new Date().toISOString()

    const results = {
      timestamp: new Date().toISOString(),
      checks: {},
      alerts: [],
      overallStatus: 'HEALTHY'
    }

    try {
      // 1. 数据库检查
      results.checks.database = await this.checkDatabase()

      // 2. Redis检查
      results.checks.redis = await this.checkRedis()

      // 3. 内存检查
      results.checks.memory = await this.checkMemory()

      // 4. 磁盘检查（可选）
      if (this.config.enableDiskCheck) {
        results.checks.disk = await this.checkDisk()
      }

      // 5. 慢查询检查（可选）
      if (this.config.enableSlowQueryCheck) {
        results.checks.slowQuery = await this.checkSlowQueries()
      }

      // 收集告警
      Object.entries(results.checks).forEach(([checkName, result]) => {
        if (result.status === 'ERROR' || result.status === 'WARNING') {
          results.alerts.push({
            check: checkName,
            level: result.status === 'ERROR' ? 'CRITICAL' : 'WARNING',
            message: result.message,
            value: result.value,
            threshold: result.threshold
          })
        }
      })

      // 确定总体状态
      if (results.alerts.some(a => a.level === 'CRITICAL')) {
        results.overallStatus = 'UNHEALTHY'
      } else if (results.alerts.length > 0) {
        results.overallStatus = 'WARNING'
      }

      // 输出日志
      this.logResults(results)

      // 发送告警
      if (results.alerts.length > 0) {
        this.stats.alerts++
        this.stats.lastAlertTime = new Date().toISOString()
        await this.sendAlerts(results.alerts)
      }

      return results
    } catch (error) {
      console.error('❌ 健康检查执行失败:', error)
      results.overallStatus = 'ERROR'
      results.error = error.message
      return results
    }
  }

  /**
   * 检查数据库连接
   * @returns {Promise<Object>} 检查结果
   */
  async checkDatabase() {
    try {
      const startTime = Date.now()
      await sequelize.authenticate()
      const responseTime = Date.now() - startTime

      return {
        status: 'OK',
        message: '数据库连接正常',
        responseTime: responseTime + 'ms'
      }
    } catch (error) {
      return {
        status: 'ERROR',
        message: '数据库连接失败: ' + error.message,
        error: error.message
      }
    }
  }

  /**
   * 检查Redis连接
   * @returns {Promise<Object>} 检查结果
   */
  async checkRedis() {
    try {
      const result = await execAsync('redis-cli ping')
      const response = result.stdout.trim()

      if (response === 'PONG') {
        return {
          status: 'OK',
          message: 'Redis连接正常'
        }
      } else {
        return {
          status: 'WARNING',
          message: 'Redis响应异常: ' + response
        }
      }
    } catch (error) {
      return {
        status: 'ERROR',
        message: 'Redis连接失败',
        error: error.message
      }
    }
  }

  /**
   * 检查内存使用
   * @returns {Promise<Object>} 检查结果
   */
  async checkMemory() {
    const memUsage = process.memoryUsage()
    const heapUsed = memUsage.heapUsed
    const heapTotal = memUsage.heapTotal
    const memPercent = ((heapUsed / heapTotal) * 100).toFixed(1)

    const status = memPercent < this.config.memoryThreshold ? 'OK' : 'WARNING'

    return {
      status,
      message: status === 'OK' ? `内存使用正常: ${memPercent}%` : `内存使用过高: ${memPercent}%`,
      value: parseFloat(memPercent),
      threshold: this.config.memoryThreshold,
      details: {
        heapUsed: Math.round(heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(heapTotal / 1024 / 1024) + 'MB',
        rss: Math.round(memUsage.rss / 1024 / 1024) + 'MB'
      }
    }
  }

  /**
   * 检查磁盘空间
   * @returns {Promise<Object>} 检查结果
   */
  async checkDisk() {
    try {
      const result = await execAsync('df -h / | tail -1')
      const parts = result.stdout.trim().split(/\s+/)
      const usagePercent = parseInt(parts[4])

      const status = usagePercent < this.config.diskThreshold ? 'OK' : 'WARNING'

      return {
        status,
        message:
          status === 'OK' ? `磁盘使用正常: ${usagePercent}%` : `磁盘空间不足: ${usagePercent}%`,
        value: usagePercent,
        threshold: this.config.diskThreshold,
        details: {
          size: parts[1],
          used: parts[2],
          available: parts[3],
          usage: parts[4]
        }
      }
    } catch (error) {
      return {
        status: 'ERROR',
        message: '磁盘检查失败',
        error: error.message
      }
    }
  }

  /**
   * 检查慢查询统计
   * @returns {Promise<Object>} 检查结果
   */
  async checkSlowQueries() {
    try {
      // 从性能监控模块获取慢查询统计
      const { monitor } = require('../maintenance/database-performance-monitor')
      const slowQueries = monitor.getSlowQueryStats()

      const slowQueryCount = slowQueries.count || 0
      const threshold = 10 // 10个慢查询为告警阈值

      const status = slowQueryCount < threshold ? 'OK' : 'WARNING'

      return {
        status,
        message:
          status === 'OK'
            ? `慢查询数量正常: ${slowQueryCount}个`
            : `慢查询过多: ${slowQueryCount}个`,
        value: slowQueryCount,
        threshold,
        details: {
          count: slowQueryCount,
          avgTime: slowQueries.avgTime || 'N/A'
        }
      }
    } catch (error) {
      return {
        status: 'ERROR',
        message: '慢查询检查失败',
        error: error.message
      }
    }
  }

  /**
   * 输出检查结果日志
   * @param {Object} results - 检查结果
   */
  logResults(results) {
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

    const statusIcon = {
      HEALTHY: '✅',
      WARNING: '⚠️',
      UNHEALTHY: '❌',
      ERROR: '🔴'
    }

    console.log(`\n${statusIcon[results.overallStatus]} [${timestamp}] 系统健康检查`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`📊 总体状态: ${results.overallStatus}`)
    console.log('')

    // 输出各项检查结果
    Object.entries(results.checks).forEach(([name, result]) => {
      const icon = result.status === 'OK' ? '✅' : result.status === 'WARNING' ? '⚠️' : '❌'
      console.log(`${icon} ${name.toUpperCase()}: ${result.message}`)

      if (result.details) {
        Object.entries(result.details).forEach(([key, value]) => {
          console.log(`   ${key}: ${value}`)
        })
      }
    })

    // 输出告警信息
    if (results.alerts.length > 0) {
      console.log('\n⚠️ 告警信息:')
      results.alerts.forEach((alert, index) => {
        const icon = alert.level === 'CRITICAL' ? '🔴' : '🟡'
        console.log(`   ${icon} [${alert.level}] ${alert.check}: ${alert.message}`)
      })
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  }

  /**
   * 发送告警通知
   * @param {Array} alerts - 告警信息数组
   */
  async sendAlerts(alerts) {
    if (!this.config.alertWebhookUrl) {
      console.log('ℹ️ 未配置告警Webhook，跳过通知发送')
      return
    }

    try {
      const axios = require('axios')
      const timestamp = new Date().toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour12: false
      })

      // 构建告警消息
      const alertMessages = alerts
        .map(alert => `[${alert.level}] ${alert.check}: ${alert.message}`)
        .join('\n')

      const message = {
        msgtype: 'text',
        text: {
          content: `【系统告警】天工商户营销平台\n\n${alertMessages}\n\n时间: ${timestamp}`
        }
      }

      // 发送Webhook请求
      await axios.post(this.config.alertWebhookUrl, message, {
        timeout: 5000
      })

      console.log('📧 告警通知已发送')
    } catch (error) {
      console.error('❌ 告警通知发送失败:', error.message)
    }
  }

  /**
   * 启动监控
   */
  start() {
    if (this.timer) {
      console.warn('⚠️ 监控已在运行中')
      return
    }

    const interval = this.config.checkInterval
    console.log(`🚀 轻量级系统监控已启动`)
    console.log(`   检查间隔: ${interval / 1000}秒`)
    console.log(`   内存告警阈值: ${this.config.memoryThreshold}%`)
    console.log(`   磁盘告警阈值: ${this.config.diskThreshold}%`)
    console.log(`   告警Webhook: ${this.config.alertWebhookUrl ? '已配置' : '未配置'}`)

    // 立即执行一次检查
    this.performCheck()

    // 启动定时检查
    this.timer = setInterval(() => {
      this.performCheck()
    }, interval)
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

    console.log('🛑 轻量级系统监控已停止')
    console.log(`📊 监控统计:`)
    console.log(`   总检查次数: ${this.stats.totalChecks}`)
    console.log(`   告警次数: ${this.stats.alerts}`)
  }
}

/**
 * 命令行使用
 */
if (require.main === module) {
  const args = process.argv.slice(2)

  // 默认配置
  const config = {
    checkInterval: 5 * 60 * 1000, // 5分钟
    memoryThreshold: 90,
    diskThreshold: 90,
    enableDiskCheck: true,
    enableSlowQueryCheck: false
  }

  // 解析参数
  let onceMode = false

  args.forEach(arg => {
    if (arg.startsWith('--interval=')) {
      config.checkInterval = parseInt(arg.split('=')[1]) * 1000
    } else if (arg.startsWith('--memory-threshold=')) {
      config.memoryThreshold = parseInt(arg.split('=')[1])
    } else if (arg.startsWith('--disk-threshold=')) {
      config.diskThreshold = parseInt(arg.split('=')[1])
    } else if (arg === '--no-disk') {
      config.enableDiskCheck = false
    } else if (arg === '--slow-query') {
      config.enableSlowQueryCheck = true
    } else if (arg === '--once') {
      onceMode = true
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
轻量级系统监控工具

用法：node lightweight-monitor.js [选项]

选项：
  --interval=<秒>             检查间隔（秒），默认300秒（5分钟）
  --memory-threshold=<百分比> 内存告警阈值，默认90%
  --disk-threshold=<百分比>   磁盘告警阈值，默认90%
  --no-disk                   禁用磁盘检查
  --slow-query                启用慢查询检查
  --once                      仅执行一次检查后退出
  --help, -h                  显示此帮助信息

环境变量：
  ALERT_WEBHOOK_URL          告警Webhook地址（钉钉/企业微信）

示例：
  node lightweight-monitor.js --interval=60
  node lightweight-monitor.js --once
  pm2 start lightweight-monitor.js --name system-monitor
  
  # 配置告警Webhook
  export ALERT_WEBHOOK_URL=https://oapi.dingtalk.com/robot/send?access_token=xxx
  node lightweight-monitor.js
      `)
      process.exit(0)
    }
  })

  // 单次检查模式
  if (onceMode) {
    const monitor = new LightweightMonitor(config)
    monitor
      .performCheck()
      .then(() => {
        process.exit(0)
      })
      .catch(error => {
        console.error('检查失败:', error)
        process.exit(1)
      })
  } else {
    // 持续监控模式
    const monitor = new LightweightMonitor(config)
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
}

module.exports = LightweightMonitor
