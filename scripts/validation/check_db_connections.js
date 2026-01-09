#!/usr/bin/env node
/**
 * 数据库连接状态检查脚本
 * 餐厅积分抽奖系统 V4.0
 * 创建时间：2025年12月30日 北京时间
 *
 * 功能说明：
 * - 检查应用侧连接池状态（pool.size/using/available/waiting）
 * - 检查数据库侧连接状态（Threads_connected/running/Max_used_connections）
 * - 分析连接命令分布（Sleep/Query/Execute 等）
 * - 提供连接池健康评估和优化建议
 *
 * 使用方式：
 * - 本地检查：node scripts/validation/check-db-connections.js
 * - npm 脚本：npm run monitor:db
 * - 定时监控：cron 或 PM2 定时任务
 */

'use strict'

require('dotenv').config()
const mysql = require('mysql2/promise')

/**
 * 检查应用侧连接池状态
 * @returns {Promise<Object>} 连接池状态对象
 */
async function checkApplicationPool() {
  try {
    // 🔴 直接从 config/database.js 导入避免循环依赖
    const { sequelize } = require('../../config/database')
    const pool = sequelize.connectionManager.pool

    if (!pool) {
      return {
        available: false,
        error: '连接池未初始化'
      }
    }

    // 🔴 从 pool._factory 和 pool 自身属性读取配置
    const factory = pool._factory || {}
    const currentSize = pool._count || 0
    const inUse = pool._inUseObjects?.length || 0
    const available = pool._availableObjects?.length || 0
    const waiting = pool._pendingAcquires?.length || 0

    return {
      available: true,
      size: currentSize,
      using: inUse,
      idle: available,
      waiting: waiting,
      max: factory.max || 0,
      min: factory.min || 0,
      usage_rate: factory.max > 0 ? ((inUse / factory.max) * 100).toFixed(1) + '%' : '0%'
    }
  } catch (error) {
    return {
      available: false,
      error: error.message
    }
  }
}

/**
 * 检查数据库侧连接状态
 * @returns {Promise<Object>} 数据库连接状态对象
 */
async function checkDatabaseConnections() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectTimeout: 10000
  })

  try {
    // 1. 查询数据库基础信息
    const [dbInfo] = await conn.query(`
      SELECT 
        @@version AS version,
        @@hostname AS hostname,
        @@port AS port,
        @@global.max_connections AS max_connections
    `)

    // 2. 查询连接状态变量
    const [status] = await conn.query(`
      SELECT VARIABLE_NAME, VARIABLE_VALUE 
      FROM performance_schema.global_status 
      WHERE VARIABLE_NAME IN (
        'Threads_connected',
        'Threads_running',
        'Max_used_connections',
        'Connections',
        'Aborted_connects',
        'Connection_errors_max_connections'
      )
    `)

    const statusMap = Object.fromEntries(status.map(row => [row.VARIABLE_NAME, row.VARIABLE_VALUE]))

    // 3. 查询连接命令分布
    const [commands] = await conn.query(`
      SELECT \`COMMAND\`, COUNT(*) AS count 
      FROM information_schema.processlist 
      GROUP BY \`COMMAND\` 
      ORDER BY count DESC
    `)

    // 4. 查询活跃连接详情（前 10 个）
    const [activeConnections] = await conn.execute(
      `SELECT ID, USER, HOST, DB, \`COMMAND\`, TIME, STATE, LEFT(INFO, 120) AS INFO 
       FROM information_schema.processlist 
       WHERE \`COMMAND\` <> ? 
       ORDER BY TIME DESC 
       LIMIT 10`,
      ['Sleep']
    )

    return {
      info: dbInfo[0],
      status: statusMap,
      commands: commands,
      activeConnections: activeConnections,
      timestamp: new Date().toISOString()
    }
  } finally {
    await conn.end()
  }
}

/**
 * 生成健康评估报告
 * @param {Object} appPool - 应用侧连接池状态
 * @param {Object} dbStatus - 数据库侧连接状态
 * @returns {Object} 健康评估结果
 */
function generateHealthAssessment(appPool, dbStatus) {
  const issues = []
  const recommendations = []

  // 1. 检查应用侧连接池
  if (appPool.available) {
    if (appPool.waiting > 5) {
      issues.push({
        severity: 'critical',
        component: 'application_pool',
        message: `连接等待队列过长: ${appPool.waiting} 个请求在等待`,
        impact: '用户请求响应缓慢，可能导致超时'
      })
      recommendations.push('立即排查慢查询或增加连接池 max 参数')
    }

    if (parseFloat(appPool.usage_rate) > 80) {
      issues.push({
        severity: 'warning',
        component: 'application_pool',
        message: `连接池使用率过高: ${appPool.usage_rate}`,
        impact: '接近连接池上限，高并发时可能不足'
      })
      recommendations.push('评估是否需要增加 pool.max 或优化查询效率')
    }
  }

  // 2. 检查数据库侧连接
  const threadsConnected = Number(dbStatus.status.Threads_connected || 0)
  const maxConnections = Number(dbStatus.info.max_connections || 0)
  const maxUsed = Number(dbStatus.status.Max_used_connections || 0)

  if (maxConnections > 0 && threadsConnected / maxConnections > 0.8) {
    issues.push({
      severity: 'critical',
      component: 'database',
      message: `数据库连接数接近上限: ${threadsConnected}/${maxConnections}`,
      impact: '可能拒绝新连接，导致服务不可用'
    })
    recommendations.push('立即排查所有应用的连接池配置，降低总连接数')
  }

  const abortedConnects = Number(dbStatus.status.Aborted_connects || 0)
  const totalConnections = Number(dbStatus.status.Connections || 0)
  if (totalConnections > 0 && abortedConnects / totalConnections > 0.01) {
    issues.push({
      severity: 'warning',
      component: 'database',
      message: `异常断开连接比例较高: ${abortedConnects}/${totalConnections} (${((abortedConnects / totalConnections) * 100).toFixed(2)}%)`,
      impact: '可能存在网络不稳定或配置问题'
    })
    recommendations.push('检查网络稳定性和 wait_timeout 配置')
  }

  // 3. 检查活跃连接
  const longRunningQueries = dbStatus.activeConnections.filter(conn => conn.TIME > 10)
  if (longRunningQueries.length > 0) {
    issues.push({
      severity: 'warning',
      component: 'queries',
      message: `发现 ${longRunningQueries.length} 个长时间执行的查询（>10秒）`,
      impact: '长时间占用连接，可能导致连接池耗尽'
    })
    recommendations.push('优化慢查询，添加索引或重构查询逻辑')
  }

  // 计算健康评分
  const criticalCount = issues.filter(i => i.severity === 'critical').length
  const warningCount = issues.filter(i => i.severity === 'warning').length

  let healthScore = 100
  healthScore -= criticalCount * 30
  healthScore -= warningCount * 10
  healthScore = Math.max(0, healthScore)

  let healthStatus = 'healthy'
  if (healthScore < 60) {
    healthStatus = 'unhealthy'
  } else if (healthScore < 80) {
    healthStatus = 'degraded'
  }

  return {
    status: healthStatus,
    score: healthScore,
    issues: issues,
    recommendations: recommendations
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🔍 数据库连接状态检查开始...\n')

  try {
    // 1. 检查应用侧连接池
    console.log('📊 应用侧连接池状态:')
    const appPool = await checkApplicationPool()

    if (appPool.available) {
      console.log(`  总连接: ${appPool.size}/${appPool.max} (配置: ${appPool.min}-${appPool.max})`)
      console.log(`  使用中: ${appPool.using}`)
      console.log(`  空闲:   ${appPool.idle}`)
      console.log(`  等待:   ${appPool.waiting}`)
      console.log(`  使用率: ${appPool.usage_rate}\n`)
    } else {
      console.log(`  ❌ ${appPool.error}\n`)
    }

    // 2. 检查数据库侧连接
    console.log('📊 数据库侧连接状态:')
    const dbStatus = await checkDatabaseConnections()

    console.log(`  数据库版本: ${dbStatus.info.version}`)
    console.log(`  主机名: ${dbStatus.info.hostname}`)
    console.log(`  最大连接数: ${dbStatus.info.max_connections}`)
    console.log(`  当前连接: ${dbStatus.status.Threads_connected}`)
    console.log(`  执行中查询: ${dbStatus.status.Threads_running}`)
    console.log(`  历史峰值: ${dbStatus.status.Max_used_connections}`)
    console.log(`  累计连接: ${dbStatus.status.Connections}`)
    console.log(`  异常断开: ${dbStatus.status.Aborted_connects}\n`)

    // 3. 连接命令分布
    console.log('📊 连接命令分布:')
    dbStatus.commands.forEach(cmd => {
      console.log(`  ${cmd.COMMAND}: ${cmd.count} 个`)
    })
    console.log('')

    // 4. 活跃连接详情
    if (dbStatus.activeConnections.length > 0) {
      console.log('📊 活跃连接详情（非 Sleep）:')
      dbStatus.activeConnections.forEach((conn, index) => {
        console.log(
          `  ${index + 1}. ID=${conn.ID} USER=${conn.USER} TIME=${conn.TIME}s STATE=${conn.STATE}`
        )
        if (conn.INFO) {
          console.log(`     SQL: ${conn.INFO.substring(0, 100)}...`)
        }
      })
      console.log('')
    } else {
      console.log('✅ 无长时间执行的查询\n')
    }

    // 5. 健康评估
    console.log('🏥 健康评估:')
    const assessment = generateHealthAssessment(appPool, dbStatus)

    console.log(`  状态: ${assessment.status}`)
    console.log(`  评分: ${assessment.score}/100`)

    if (assessment.issues.length > 0) {
      console.log(`\n⚠️ 发现 ${assessment.issues.length} 个问题:`)
      assessment.issues.forEach((issue, index) => {
        const icon = issue.severity === 'critical' ? '🔴' : '🟡'
        console.log(`  ${icon} ${index + 1}. [${issue.severity.toUpperCase()}] ${issue.message}`)
        console.log(`     影响: ${issue.impact}`)
      })
    } else {
      console.log('  ✅ 未发现问题')
    }

    if (assessment.recommendations.length > 0) {
      console.log(`\n💡 优化建议:`)
      assessment.recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec}`)
      })
    }

    console.log('\n✅ 检查完成')

    // 如果有严重问题，返回非零退出码
    if (assessment.issues.some(i => i.severity === 'critical')) {
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ 检查失败:', error.message)
    process.exit(1)
  }
}

// 命令行执行
if (require.main === module) {
  main()
}

module.exports = {
  checkApplicationPool,
  checkDatabaseConnections,
  generateHealthAssessment
}
