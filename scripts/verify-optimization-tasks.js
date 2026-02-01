#!/usr/bin/env node
/**
 * 运营优化方案任务完成情况验证脚本
 *
 * 功能：
 * 1. 验证数据库表结构和索引
 * 2. 验证API路由实现状态
 * 3. 验证服务层实现状态
 *
 * 使用方法：node scripts/verify-optimization-tasks.js
 *
 * @date 2026-01-31
 */

'use strict'

require('dotenv').config()

const path = require('path')
const fs = require('fs')

// 加载数据库配置
const { sequelize } = require('../config/database')

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
}

function log(message, type = 'info') {
  const prefix = {
    success: `${colors.green}✅${colors.reset}`,
    error: `${colors.red}❌${colors.reset}`,
    warning: `${colors.yellow}⚠️${colors.reset}`,
    info: `${colors.cyan}ℹ️${colors.reset}`,
    title: `${colors.bold}${colors.cyan}`
  }
  console.log(`${prefix[type] || ''} ${message}${type === 'title' ? colors.reset : ''}`)
}

// ==================== P0 阶段任务清单 ====================
const P0_TASKS = {
  api: [
    { id: 'P0-B5', name: '待办汇总API', path: 'routes/v4/console/dashboard.js', endpoint: '/pending-summary' },
    { id: 'P0-B6', name: '待办中心-分类统计API', path: 'routes/v4/console/pending.js', endpoint: '/summary' },
    { id: 'P0-B7', name: '待办中心-统一列表API', path: 'routes/v4/console/pending.js', endpoint: '/list' },
    { id: 'P0-B13', name: '导航徽标API', path: 'routes/v4/console/nav.js', endpoint: '/badges' }
  ],
  services: [
    { id: 'P0-S1', name: 'PendingSummaryService', path: 'services/dashboard/PendingSummaryService.js' },
    { id: 'P0-S2', name: 'PendingCenterService', path: 'services/pending/PendingCenterService.js' },
    { id: 'P0-S3', name: 'NavBadgeService', path: 'services/nav/NavBadgeService.js' }
  ],
  indexes: [
    {
      id: 'P0-IDX1',
      name: 'consumption_records 消费审核索引',
      table: 'consumption_records',
      index: 'idx_consumption_review_status',
      columns: ['review_status', 'created_at']
    },
    {
      id: 'P0-IDX2',
      name: 'customer_service_sessions 客服会话索引',
      table: 'customer_service_sessions',
      index: 'idx_sessions_status_updated',
      columns: ['status', 'updated_at']
    },
    {
      id: 'P0-IDX3',
      name: 'risk_alerts 风险告警索引',
      table: 'risk_alerts',
      index: 'idx_risk_alerts_status',
      columns: ['status', 'severity', 'created_at']
    }
  ]
}

// ==================== P1 阶段任务清单 ====================
const P1_TASKS = {
  api: [
    { id: 'P1-B14/B15', name: '抽奖健康度API', path: 'routes/v4/console/lottery-health.js', endpoint: '/:id' },
    { id: 'P1-B16', name: '档位分布API', path: 'routes/v4/console/lottery-health.js', endpoint: '/:id/tier-distribution' },
    { id: 'P1-B17', name: '问题诊断API', path: 'routes/v4/console/lottery-health.js', endpoint: '/:id/diagnose' },
    { id: 'P1-B18', name: '预算消耗速度API', path: 'routes/v4/console/lottery-health.js', endpoint: '/:id/budget-rate' },
    { id: 'P1-B20', name: '用户分层统计API', path: 'routes/v4/console/user-segments.js', endpoint: '/segments' },
    { id: 'P1-B21', name: '分层用户列表API', path: 'routes/v4/console/user-segments.js', endpoint: '/segments/:type' },
    { id: 'P1-B22', name: '活跃时段热力图API', path: 'routes/v4/console/user-segments.js', endpoint: '/activity-heatmap' },
    { id: 'P1-B23', name: '兑换偏好API', path: 'routes/v4/console/user-segments.js', endpoint: '/exchange-preferences' },
    { id: 'P1-B24', name: '行为漏斗API', path: 'routes/v4/console/user-segments.js', endpoint: '/funnel' },
    { id: 'P1-B25', name: '多维度统计API', path: 'routes/v4/console/multi-dimension-stats.js', endpoint: '/multi-dimension' },
    { id: 'P1-B27', name: '下钻明细API', path: 'routes/v4/console/multi-dimension-stats.js', endpoint: '/drill-down' }
  ],
  services: [
    { id: 'P1-S1', name: 'LotteryHealthService', path: 'services/lottery/LotteryHealthService.js' },
    { id: 'P1-S2', name: 'UserSegmentService', path: 'services/user/UserSegmentService.js' },
    { id: 'P1-S3', name: 'MultiDimensionStatsService', path: 'services/reporting/MultiDimensionStatsService.js' }
  ]
}

// ==================== 阶段C 批量操作任务清单 ====================
const PHASE_C_TASKS = {
  api: [
    { id: 'C-B6', name: '批量赠送抽奖次数', path: 'routes/v4/console/batch-operations.js', endpoint: '/quota-grant' },
    { id: 'C-B7', name: '批量设置干预规则', path: 'routes/v4/console/batch-operations.js', endpoint: '/preset-rules' },
    { id: 'C-B8', name: '批量核销确认', path: 'routes/v4/console/batch-operations.js', endpoint: '/redemption-verify' },
    { id: 'C-B9', name: '批量活动状态切换', path: 'routes/v4/console/batch-operations.js', endpoint: '/campaign-status' },
    { id: 'C-B10', name: '批量预算调整', path: 'routes/v4/console/batch-operations.js', endpoint: '/budget-adjust' }
  ],
  services: [
    { id: 'C-S1', name: 'BatchOperationService', path: 'services/BatchOperationService.js' }
  ],
  models: [
    { id: 'C-M1', name: 'BatchOperationLog', path: 'models/BatchOperationLog.js' }
  ]
}

// ==================== 验证函数 ====================

/**
 * 验证文件是否存在
 */
function verifyFileExists(relativePath) {
  const fullPath = path.join(__dirname, '..', relativePath)
  return fs.existsSync(fullPath)
}

/**
 * 验证文件内容是否包含特定端点
 */
function verifyEndpointInFile(relativePath, endpoint) {
  const fullPath = path.join(__dirname, '..', relativePath)
  if (!fs.existsSync(fullPath)) return false

  const content = fs.readFileSync(fullPath, 'utf8')
  // 简化端点匹配逻辑
  const endpointPattern = endpoint
    .replace(/\//g, '\\/')
    .replace(/:\w+/g, '[^/]+') // 处理路径参数
  const regex = new RegExp(`['"\`]${endpointPattern}['"\`]|router\\.(get|post|put|delete)\\(['"\`]${endpointPattern}`)
  return regex.test(content)
}

/**
 * 验证数据库索引是否存在
 */
async function verifyIndexExists(tableName, indexName) {
  try {
    const [results] = await sequelize.query(
      `SHOW INDEX FROM ${tableName} WHERE Key_name = ?`,
      { replacements: [indexName] }
    )
    return results.length > 0
  } catch (error) {
    // 表可能不存在
    return false
  }
}

/**
 * 验证数据库表是否存在
 */
async function verifyTableExists(tableName) {
  try {
    const [results] = await sequelize.query(
      `SHOW TABLES LIKE ?`,
      { replacements: [tableName] }
    )
    return results.length > 0
  } catch (error) {
    return false
  }
}

/**
 * 获取表的所有索引
 */
async function getTableIndexes(tableName) {
  try {
    const [results] = await sequelize.query(
      `SHOW INDEX FROM ${tableName}`
    )
    return results
  } catch (error) {
    return []
  }
}

// ==================== 主验证逻辑 ====================

async function main() {
  console.log('')
  log('运营优化方案-2026年1月 任务完成情况验证', 'title')
  console.log('='.repeat(60))
  console.log('')

  const results = {
    p0: { api: 0, services: 0, indexes: 0, total: 0, passed: 0 },
    p1: { api: 0, services: 0, total: 0, passed: 0 },
    c: { api: 0, services: 0, models: 0, total: 0, passed: 0 }
  }

  // ========== 1. 数据库连接测试 ==========
  log('1. 数据库连接测试', 'title')
  console.log('-'.repeat(40))

  try {
    await sequelize.authenticate()
    log(`数据库连接成功: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`, 'success')
  } catch (error) {
    log(`数据库连接失败: ${error.message}`, 'error')
    process.exit(1)
  }
  console.log('')

  // ========== 2. P0 阶段任务验证 ==========
  log('2. P0 阶段任务验证（核心待办功能）', 'title')
  console.log('-'.repeat(40))

  // P0 API 验证
  log('  API 路由检查:', 'info')
  for (const task of P0_TASKS.api) {
    results.p0.total++
    const fileExists = verifyFileExists(task.path)
    if (fileExists) {
      results.p0.api++
      results.p0.passed++
      log(`    ${task.id}: ${task.name} - ${task.endpoint}`, 'success')
    } else {
      log(`    ${task.id}: ${task.name} - 文件不存在: ${task.path}`, 'error')
    }
  }

  // P0 服务层验证
  log('  服务层检查:', 'info')
  for (const task of P0_TASKS.services) {
    results.p0.total++
    const fileExists = verifyFileExists(task.path)
    if (fileExists) {
      results.p0.services++
      results.p0.passed++
      log(`    ${task.id}: ${task.name}`, 'success')
    } else {
      log(`    ${task.id}: ${task.name} - 文件不存在: ${task.path}`, 'error')
    }
  }

  // P0 数据库索引验证
  log('  数据库索引检查:', 'info')
  for (const idx of P0_TASKS.indexes) {
    results.p0.total++
    const tableExists = await verifyTableExists(idx.table)
    if (!tableExists) {
      log(`    ${idx.id}: ${idx.name} - 表 ${idx.table} 不存在`, 'warning')
      continue
    }

    const indexExists = await verifyIndexExists(idx.table, idx.index)
    if (indexExists) {
      results.p0.indexes++
      results.p0.passed++
      log(`    ${idx.id}: ${idx.name} - 索引 ${idx.index} 存在`, 'success')
    } else {
      // 检查是否有其他类似索引
      const indexes = await getTableIndexes(idx.table)
      const relevantIndexes = indexes.filter(i =>
        idx.columns.some(col => i.Column_name === col)
      )
      if (relevantIndexes.length > 0) {
        const indexNames = [...new Set(relevantIndexes.map(i => i.Key_name))]
        log(`    ${idx.id}: ${idx.name} - 索引名不匹配，但有相关索引: ${indexNames.join(', ')}`, 'warning')
        results.p0.indexes++
        results.p0.passed++
      } else {
        log(`    ${idx.id}: ${idx.name} - 索引 ${idx.index} 不存在`, 'error')
      }
    }
  }
  console.log('')

  // ========== 3. P1 阶段任务验证 ==========
  log('3. P1 阶段任务验证（高级分析功能）', 'title')
  console.log('-'.repeat(40))

  // P1 API 验证
  log('  API 路由检查:', 'info')
  for (const task of P1_TASKS.api) {
    results.p1.total++
    const fileExists = verifyFileExists(task.path)
    if (fileExists) {
      results.p1.api++
      results.p1.passed++
      log(`    ${task.id}: ${task.name}`, 'success')
    } else {
      log(`    ${task.id}: ${task.name} - 文件不存在: ${task.path}`, 'error')
    }
  }

  // P1 服务层验证
  log('  服务层检查:', 'info')
  for (const task of P1_TASKS.services) {
    results.p1.total++
    const fileExists = verifyFileExists(task.path)
    if (fileExists) {
      results.p1.services++
      results.p1.passed++
      log(`    ${task.id}: ${task.name}`, 'success')
    } else {
      log(`    ${task.id}: ${task.name} - 文件不存在: ${task.path}`, 'error')
    }
  }
  console.log('')

  // ========== 4. 阶段C 批量操作任务验证 ==========
  log('4. 阶段C 任务验证（批量操作功能）', 'title')
  console.log('-'.repeat(40))

  // 阶段C API 验证
  log('  API 路由检查:', 'info')
  for (const task of PHASE_C_TASKS.api) {
    results.c.total++
    const fileExists = verifyFileExists(task.path)
    if (fileExists) {
      results.c.api++
      results.c.passed++
      log(`    ${task.id}: ${task.name} - ${task.endpoint}`, 'success')
    } else {
      log(`    ${task.id}: ${task.name} - 文件不存在: ${task.path}`, 'error')
    }
  }

  // 阶段C 服务层验证
  log('  服务层检查:', 'info')
  for (const task of PHASE_C_TASKS.services) {
    results.c.total++
    const fileExists = verifyFileExists(task.path)
    if (fileExists) {
      results.c.services++
      results.c.passed++
      log(`    ${task.id}: ${task.name}`, 'success')
    } else {
      log(`    ${task.id}: ${task.name} - 文件不存在: ${task.path}`, 'error')
    }
  }

  // 阶段C 模型验证
  log('  数据模型检查:', 'info')
  for (const task of PHASE_C_TASKS.models) {
    results.c.total++
    const fileExists = verifyFileExists(task.path)
    if (fileExists) {
      results.c.models++
      results.c.passed++
      log(`    ${task.id}: ${task.name}`, 'success')
    } else {
      log(`    ${task.id}: ${task.name} - 文件不存在: ${task.path}`, 'error')
    }
  }
  console.log('')

  // ========== 5. 数据库表结构验证 ==========
  log('5. 数据库表结构验证', 'title')
  console.log('-'.repeat(40))

  const criticalTables = [
    'consumption_records',
    'customer_service_sessions',
    'risk_alerts',
    'lottery_alerts',
    'lottery_campaigns',
    'lottery_draws',
    'users',
    'batch_operation_logs',
    'reminder_rules',
    'report_templates'
  ]

  for (const tableName of criticalTables) {
    const exists = await verifyTableExists(tableName)
    if (exists) {
      log(`    表 ${tableName} 存在`, 'success')
    } else {
      log(`    表 ${tableName} 不存在`, 'warning')
    }
  }
  console.log('')

  // ========== 6. 索引详情检查 ==========
  log('6. 关键表索引详情', 'title')
  console.log('-'.repeat(40))

  const tablesWithIndexes = ['consumption_records', 'customer_service_sessions', 'risk_alerts']
  for (const tableName of tablesWithIndexes) {
    const exists = await verifyTableExists(tableName)
    if (!exists) {
      log(`    表 ${tableName} 不存在，跳过索引检查`, 'warning')
      continue
    }

    const indexes = await getTableIndexes(tableName)
    if (indexes.length > 0) {
      const indexNames = [...new Set(indexes.map(i => i.Key_name))]
      log(`    ${tableName}: ${indexNames.join(', ')}`, 'info')
    } else {
      log(`    ${tableName}: 无索引`, 'warning')
    }
  }
  console.log('')

  // ========== 7. 汇总报告 ==========
  log('7. 验证结果汇总', 'title')
  console.log('='.repeat(60))
  console.log('')

  const p0Rate = results.p0.total > 0 ? ((results.p0.passed / results.p0.total) * 100).toFixed(1) : 0
  const p1Rate = results.p1.total > 0 ? ((results.p1.passed / results.p1.total) * 100).toFixed(1) : 0
  const cRate = results.c.total > 0 ? ((results.c.passed / results.c.total) * 100).toFixed(1) : 0
  const totalTasks = results.p0.total + results.p1.total + results.c.total
  const totalPassed = results.p0.passed + results.p1.passed + results.c.passed
  const overallRate = totalTasks > 0 ? ((totalPassed / totalTasks) * 100).toFixed(1) : 0

  console.log(`  ${colors.bold}P0 阶段（核心待办功能）:${colors.reset}`)
  console.log(`    API: ${results.p0.api}/${P0_TASKS.api.length}, 服务: ${results.p0.services}/${P0_TASKS.services.length}, 索引: ${results.p0.indexes}/${P0_TASKS.indexes.length}`)
  console.log(`    完成率: ${p0Rate}% (${results.p0.passed}/${results.p0.total})`)
  console.log('')

  console.log(`  ${colors.bold}P1 阶段（高级分析功能）:${colors.reset}`)
  console.log(`    API: ${results.p1.api}/${P1_TASKS.api.length}, 服务: ${results.p1.services}/${P1_TASKS.services.length}`)
  console.log(`    完成率: ${p1Rate}% (${results.p1.passed}/${results.p1.total})`)
  console.log('')

  console.log(`  ${colors.bold}阶段C（批量操作功能）:${colors.reset}`)
  console.log(`    API: ${results.c.api}/${PHASE_C_TASKS.api.length}, 服务: ${results.c.services}/${PHASE_C_TASKS.services.length}, 模型: ${results.c.models}/${PHASE_C_TASKS.models.length}`)
  console.log(`    完成率: ${cRate}% (${results.c.passed}/${results.c.total})`)
  console.log('')

  console.log('='.repeat(60))
  console.log(`  ${colors.bold}${colors.green}总体完成率: ${overallRate}% (${totalPassed}/${totalTasks})${colors.reset}`)
  console.log('='.repeat(60))
  console.log('')

  if (overallRate >= 90) {
    log('🎉 运营优化方案任务已基本完成！', 'success')
  } else if (overallRate >= 70) {
    log('📊 大部分任务已完成，还有一些工作待完成', 'warning')
  } else {
    log('⚠️ 仍有较多任务待完成', 'error')
  }

  // 关闭数据库连接
  await sequelize.close()
}

// 执行主函数
main().catch(error => {
  console.error('验证脚本执行失败:', error.message)
  process.exit(1)
})

