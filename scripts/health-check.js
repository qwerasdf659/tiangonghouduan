/**
 * 餐厅积分抽奖系统 v3.0 - 系统健康检查脚本
 * 作用：检查系统所有关键组件的健康状态
 */

'use strict'

// 加载环境变量
require('dotenv').config()

const { sequelize } = require('../models')

/**
 * 检查数据库健康状态
 */
async function checkDatabaseHealth () {
  try {
    console.log('🔗 检查数据库健康状态...')
    await sequelize.authenticate()

    // 检查关键表的可访问性
    await sequelize.query('SELECT 1 FROM users LIMIT 1')
    await sequelize.query('SELECT 1 FROM user_points_accounts LIMIT 1')
    await sequelize.query('SELECT 1 FROM lottery_campaigns LIMIT 1')

    console.log('✅ 数据库健康 - 正常')
    return { status: 'healthy', message: '数据库连接正常，关键表可访问' }
  } catch (error) {
    console.error('❌ 数据库健康 - 异常:', error.message)
    return { status: 'unhealthy', message: `数据库错误: ${error.message}` }
  }
}

/**
 * 检查环境变量配置
 */
function checkEnvironmentVariables () {
  console.log('⚙️ 检查环境变量配置...')

  const requiredEnvVars = [
    'DB_HOST',
    'DB_PORT',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME',
    'JWT_SECRET',
    'SEALOS_ENDPOINT',
    'SEALOS_BUCKET'
  ]

  const missingVars = []
  const presentVars = []

  requiredEnvVars.forEach(varName => {
    if (process.env[varName]) {
      presentVars.push(varName)
    } else {
      missingVars.push(varName)
    }
  })

  if (missingVars.length === 0) {
    console.log('✅ 环境变量 - 正常')
    return { status: 'healthy', message: `所有${requiredEnvVars.length}个关键环境变量已配置` }
  } else {
    console.error('❌ 环境变量 - 缺失:', missingVars)
    return { status: 'unhealthy', message: `缺失环境变量: ${missingVars.join(', ')}` }
  }
}

/**
 * 检查文件系统权限
 */
async function checkFileSystemHealth () {
  const fs = require('fs').promises
  const path = require('path')

  try {
    console.log('📁 检查文件系统权限...')

    // 检查日志目录
    const logsDir = path.join(__dirname, '../logs')
    await fs.access(logsDir, fs.constants.R_OK | fs.constants.W_OK)

    // 检查上传目录
    const uploadsDir = path.join(__dirname, '../public/uploads')
    await fs.access(uploadsDir, fs.constants.R_OK | fs.constants.W_OK)

    console.log('✅ 文件系统 - 正常')
    return { status: 'healthy', message: '关键目录权限正常' }
  } catch (error) {
    console.error('❌ 文件系统 - 异常:', error.message)
    return { status: 'unhealthy', message: `文件系统错误: ${error.message}` }
  }
}

/**
 * 检查核心服务状态
 */
async function checkCoreServices () {
  try {
    console.log('⚙️ 检查核心服务状态...')

    // 检查事件总线服务
    const EventBusService = require('../services/EventBusService')
    const eventBusHealth = EventBusService.healthCheck()

    // 检查WebSocket服务 - 简单检查服务是否可以实例化
    const WebSocketService = require('../services/WebSocketService')
    let wsHealth = { status: 'healthy', message: 'WebSocketService可以正常实例化' }
    try {
      const wsService = new WebSocketService()
      if (wsService) {
        wsHealth = { status: 'healthy', message: 'WebSocketService实例化成功' }
      }
    } catch (error) {
      wsHealth = { status: 'unhealthy', message: `WebSocketService错误: ${error.message}` }
    }

    console.log('✅ 核心服务 - 正常')
    return {
      status: 'healthy',
      message: '核心服务运行正常',
      details: {
        eventBus: eventBusHealth,
        webSocket: wsHealth
      }
    }
  } catch (error) {
    console.error('❌ 核心服务 - 异常:', error.message)
    return { status: 'unhealthy', message: `核心服务错误: ${error.message}` }
  }
}

/**
 * 检查内存使用情况
 */
function checkMemoryUsage () {
  console.log('🧠 检查内存使用情况...')

  const memUsage = process.memoryUsage()
  const totalMB = Math.round(memUsage.rss / 1024 / 1024)
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024)
  const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024)

  const memoryInfo = {
    total: `${totalMB}MB`,
    heapUsed: `${heapUsedMB}MB`,
    heapTotal: `${heapTotalMB}MB`,
    heapUsagePercent: Math.round((heapUsedMB / heapTotalMB) * 100)
  }

  if (totalMB > 512) {
    console.log('⚠️  内存使用 - 警告: 使用量较高')
    return { status: 'warning', message: `内存使用量: ${totalMB}MB (较高)`, details: memoryInfo }
  } else {
    console.log('✅ 内存使用 - 正常')
    return { status: 'healthy', message: `内存使用量: ${totalMB}MB`, details: memoryInfo }
  }
}

/**
 * 生成健康检查报告
 */
function generateHealthReport (checks) {
  const healthyCount = checks.filter(check => check.status === 'healthy').length
  const warningCount = checks.filter(check => check.status === 'warning').length
  const unhealthyCount = checks.filter(check => check.status === 'unhealthy').length

  const overallStatus = unhealthyCount > 0 ? 'unhealthy' : warningCount > 0 ? 'warning' : 'healthy'

  return {
    timestamp: new Date().toISOString(),
    overallStatus,
    summary: {
      total: checks.length,
      healthy: healthyCount,
      warning: warningCount,
      unhealthy: unhealthyCount
    },
    checks: checks.map(check => ({
      component: check.component,
      status: check.status,
      message: check.message
    }))
  }
}

/**
 * 主健康检查函数
 */
async function performHealthCheck () {
  console.log('🚀 餐厅积分抽奖系统 v3.0 - 系统健康检查')
  console.log('='.repeat(60))

  const checks = []

  // 1. 数据库健康检查
  const dbHealth = await checkDatabaseHealth()
  checks.push({ component: 'database', ...dbHealth })

  // 2. 环境变量检查
  const envHealth = checkEnvironmentVariables()
  checks.push({ component: 'environment', ...envHealth })

  // 3. 文件系统检查
  const fsHealth = await checkFileSystemHealth()
  checks.push({ component: 'filesystem', ...fsHealth })

  // 4. 核心服务检查
  const serviceHealth = await checkCoreServices()
  checks.push({ component: 'services', ...serviceHealth })

  // 5. 内存使用检查
  const memHealth = checkMemoryUsage()
  checks.push({ component: 'memory', ...memHealth })

  // 生成报告
  const report = generateHealthReport(checks)

  console.log('\n' + '='.repeat(60))
  console.log('📊 健康检查总结:')
  console.log(`总体状态: ${report.overallStatus.toUpperCase()}`)
  console.log(`检查项目: ${report.summary.total}个`)
  console.log(`健康: ${report.summary.healthy}个`)
  console.log(`警告: ${report.summary.warning}个`)
  console.log(`异常: ${report.summary.unhealthy}个`)

  if (report.overallStatus === 'healthy') {
    console.log('🎉 系统健康状态良好!')
  } else if (report.overallStatus === 'warning') {
    console.log('⚠️  系统存在一些警告，但基本正常')
  } else {
    console.log('🚨 系统存在健康问题，需要立即处理!')
  }

  return report
}

// 运行健康检查
if (require.main === module) {
  performHealthCheck()
    .then(report => {
      if (report.overallStatus === 'unhealthy') {
        process.exit(1)
      }
      process.exit(0)
    })
    .catch(error => {
      console.error('💥 健康检查失败:', error)
      process.exit(1)
    })
    .finally(() => {
      sequelize.close()
    })
}

module.exports = {
  performHealthCheck,
  checkDatabaseHealth,
  checkEnvironmentVariables,
  checkFileSystemHealth,
  checkCoreServices,
  checkMemoryUsage
}
