#!/usr/bin/env node
/**
 * 检查需求文档中功能的实现状态
 * 对标：admin/docs/后端需求文档_运营后台优化.md
 */

require('dotenv').config()
const { sequelize } = require('../config/database')
const fs = require('fs')
const path = require('path')

// 定义需求文档中的功能点
const REQUIREMENTS = {
  P0: [
    {
      id: 'P0-1',
      name: '待办健康度评分',
      api: 'GET /api/admin/pending/health-score',
      checkFiles: ['routes/v4/console/pending.js', 'services/pending/'],
      checkPatterns: ['health.*score', 'healthScore']
    },
    {
      id: 'P0-2',
      name: '业务健康度评分',
      api: 'GET /api/admin/dashboard/business-health',
      checkFiles: ['routes/v4/console/dashboard.js', 'services/dashboard/'],
      checkPatterns: ['business.*health', 'businessHealth']
    },
    {
      id: 'P0-3',
      name: '消费审核批量操作',
      api: 'POST /api/admin/consumption/batch-review',
      checkFiles: ['routes/v4/console/consumption.js', 'services/consumption/'],
      checkPatterns: ['batch.*review', 'batchReview']
    }
  ],
  P1: [
    {
      id: 'P1-1',
      name: '用户360°视图',
      api: 'GET /api/admin/users/:id/360view',
      checkFiles: ['routes/v4/console/user_management.js', 'services/'],
      checkPatterns: ['360view', '全景视图']
    },
    {
      id: 'P1-2',
      name: '预算预测API',
      api: 'GET /api/admin/lottery/budget-forecast',
      checkFiles: ['routes/v4/console/lottery', 'services/lottery/'],
      checkPatterns: ['budget.*forecast', '预算预测']
    },
    {
      id: 'P1-3',
      name: '时间对比功能',
      api: 'GET /api/admin/dashboard/time-comparison',
      checkFiles: ['routes/v4/console/dashboard.js'],
      checkPatterns: ['time.*comparison', '时间对比']
    },
    {
      id: 'P1-4',
      name: '告警列表接口',
      api: 'GET /api/admin/alerts',
      checkFiles: ['routes/v4/console/risk-alerts.js', 'services/'],
      checkPatterns: ['/alerts', 'LotteryAlertService']
    },
    {
      id: 'P1-5',
      name: '仪表盘缓存数据',
      api: 'GET /api/admin/dashboard/data',
      checkFiles: ['routes/v4/console/dashboard.js'],
      checkPatterns: ['/data', 'dashboard']
    },
    {
      id: 'P1-6',
      name: '中奖率趋势',
      api: 'GET /api/admin/lottery/win-rate-trend',
      checkFiles: ['routes/v4/console/lottery'],
      checkPatterns: ['win.*rate.*trend', '中奖率趋势']
    },
    {
      id: 'P1-7',
      name: '客服响应时长指标',
      api: 'GET /api/admin/customer-service/response-stats',
      checkFiles: ['routes/v4/console/customer-service/'],
      checkPatterns: ['response.*stats', '响应时长']
    },
    {
      id: 'P1-8',
      name: 'API性能监控',
      api: 'GET /api/admin/system/api-performance',
      checkFiles: ['routes/v4/console/system', 'services/'],
      checkPatterns: ['api.*performance', 'API性能']
    },
    {
      id: 'P1-9',
      name: '系统垫付看板',
      api: 'GET /api/admin/lottery/system-advance',
      checkFiles: ['routes/v4/console/lottery'],
      checkPatterns: ['system.*advance', '垫付']
    },
    {
      id: 'P1-10',
      name: '系统健康状态',
      api: 'GET /api/admin/system/health-status',
      checkFiles: ['routes/v4/console/system', 'services/'],
      checkPatterns: ['health.*status', '健康状态']
    },
    {
      id: 'P1-11',
      name: '决策辅助信息',
      api: 'GET /api/admin/consumption/:id/assist-info',
      checkFiles: ['routes/v4/console/consumption.js'],
      checkPatterns: ['assist.*info', '辅助信息']
    },
    {
      id: 'P1-12',
      name: '历史审核率',
      api: 'GET /api/admin/users/:id/approval-rate',
      checkFiles: ['routes/v4/console/user_management.js'],
      checkPatterns: ['approval.*rate', '审核率']
    }
  ],
  P2: [
    {
      id: 'P2-1',
      name: '资产流动概览',
      api: 'GET /api/admin/assets/flow-overview',
      checkFiles: ['routes/v4/console/assets/', 'services/'],
      checkPatterns: ['flow.*overview', '资产流动']
    },
    {
      id: 'P2-2',
      name: '数据导出接口',
      api: 'POST /api/admin/export',
      checkFiles: ['routes/v4/console/'],
      checkPatterns: ['/export', 'DataExportService']
    },
    {
      id: 'P2-3',
      name: '审计日志查询',
      api: 'GET /api/admin/audit-logs',
      checkFiles: ['routes/v4/console/audit-logs.js', 'services/AuditLogService.js'],
      checkPatterns: ['audit.*logs', 'AuditLogService']
    },
    {
      id: 'P2-4',
      name: '物品锁定率监控',
      api: 'GET /api/admin/items/lock-rate',
      checkFiles: ['routes/v4/console/'],
      checkPatterns: ['lock.*rate', '锁定率']
    },
    {
      id: 'P2-5',
      name: '策略效果对比',
      api: 'GET /api/admin/lottery/strategy-comparison',
      checkFiles: ['routes/v4/console/lottery'],
      checkPatterns: ['strategy.*comparison', '策略对比']
    },
    {
      id: 'P2-6',
      name: '用户分层分布',
      api: 'GET /api/admin/lottery/user-tier-distribution',
      checkFiles: ['routes/v4/console/lottery'],
      checkPatterns: ['tier.*distribution', '用户分层']
    },
    {
      id: 'P2-7',
      name: '告警疲劳预防',
      api: 'POST /api/admin/alerts/silence',
      checkFiles: ['routes/v4/console/risk-alerts.js', 'services/LotteryAlertService.js'],
      checkPatterns: ['silence', '告警静默']
    }
  ],
  P3: [
    {
      id: 'P3-1',
      name: '转化漏斗',
      api: 'GET /api/admin/analytics/conversion-funnel',
      checkFiles: ['routes/v4/console/analytics.js'],
      checkPatterns: ['conversion.*funnel', '转化漏斗']
    },
    {
      id: 'P3-2',
      name: '商户贡献度排行',
      api: 'GET /api/admin/merchants/contribution',
      checkFiles: ['routes/v4/console/'],
      checkPatterns: ['contribution', '商户贡献']
    },
    {
      id: 'P3-3',
      name: 'PDF报表生成',
      api: 'POST /api/admin/reports/generate-pdf',
      checkFiles: ['routes/v4/console/'],
      checkPatterns: ['generate.*pdf', 'PDF报表']
    }
  ]
}

// 检查文件中是否存在模式
function checkPattern(filePath, patterns) {
  try {
    if (!fs.existsSync(filePath)) return false
    const stat = fs.statSync(filePath)
    
    if (stat.isDirectory()) {
      const files = fs.readdirSync(filePath)
      for (const file of files) {
        if (checkPattern(path.join(filePath, file), patterns)) {
          return true
        }
      }
      return false
    }
    
    if (!filePath.endsWith('.js')) return false
    
    const content = fs.readFileSync(filePath, 'utf8')
    for (const pattern of patterns) {
      const regex = new RegExp(pattern, 'i')
      if (regex.test(content)) return true
    }
    return false
  } catch {
    return false
  }
}

// 检查单个功能点
function checkRequirement(req) {
  const projectRoot = path.join(__dirname, '..')
  
  for (const file of req.checkFiles) {
    const fullPath = path.join(projectRoot, file)
    if (checkPattern(fullPath, req.checkPatterns)) {
      return { implemented: true, location: file }
    }
  }
  
  return { implemented: false, location: null }
}

async function main() {
  console.log('📋 运营后台优化 - 后端需求实现状态检查')
  console.log('=' .repeat(70))
  console.log('基准文档: admin/docs/后端需求文档_运营后台优化.md')
  console.log('检查时间:', new Date().toLocaleString('zh-CN'))
  console.log('')

  const results = {
    implemented: 0,
    notImplemented: 0,
    details: {}
  }

  for (const [priority, reqs] of Object.entries(REQUIREMENTS)) {
    console.log(`\n📊 ${priority} 优先级功能检查:`)
    console.log('-'.repeat(70))
    
    results.details[priority] = {
      total: reqs.length,
      implemented: 0,
      items: []
    }
    
    for (const req of reqs) {
      const check = checkRequirement(req)
      const status = check.implemented ? '✅' : '❌'
      const location = check.location ? ` (${check.location})` : ''
      
      console.log(`${status} ${req.id}: ${req.name}`)
      console.log(`   API: ${req.api}${location}`)
      
      if (check.implemented) {
        results.implemented++
        results.details[priority].implemented++
      } else {
        results.notImplemented++
      }
      
      results.details[priority].items.push({
        ...req,
        implemented: check.implemented,
        location: check.location
      })
    }
  }

  // 汇总报告
  console.log('\n')
  console.log('=' .repeat(70))
  console.log('📈 实现状态汇总报告')
  console.log('=' .repeat(70))
  
  const total = results.implemented + results.notImplemented
  const rate = ((results.implemented / total) * 100).toFixed(1)
  
  console.log(`\n总功能点: ${total}`)
  console.log(`已实现: ${results.implemented} (${rate}%)`)
  console.log(`未实现: ${results.notImplemented} (${(100 - parseFloat(rate)).toFixed(1)}%)`)
  
  console.log('\n按优先级分布:')
  for (const [priority, data] of Object.entries(results.details)) {
    const pRate = ((data.implemented / data.total) * 100).toFixed(0)
    console.log(`  ${priority}: ${data.implemented}/${data.total} (${pRate}%)`)
  }

  // 未实现功能清单
  console.log('\n⚠️ 未实现功能清单:')
  for (const [priority, data] of Object.entries(results.details)) {
    const notImpl = data.items.filter(item => !item.implemented)
    if (notImpl.length > 0) {
      console.log(`\n${priority}:`)
      notImpl.forEach(item => {
        console.log(`  - ${item.id}: ${item.name}`)
        console.log(`    API: ${item.api}`)
      })
    }
  }

  // 数据库字段差异检查
  console.log('\n')
  console.log('=' .repeat(70))
  console.log('🗄️ 数据库字段差异分析')
  console.log('=' .repeat(70))
  
  try {
    await sequelize.authenticate()
    
    // 检查需求文档中用到但可能不存在的字段
    const fieldChecks = [
      { table: 'lottery_draws', field: 'is_winner', note: '需求文档中用于中奖判断' },
      { table: 'asset_transactions', field: 'amount', note: '需求文档中用于金额计算' },
      { table: 'asset_transactions', field: 'change_type', note: '需求文档中用于变动类型筛选' },
      { table: 'customer_service_sessions', field: 'first_response_at', note: '需求文档中用于响应时长计算' },
      { table: 'lottery_draws', field: 'advance_amount', note: '需求文档中用于垫付统计' }
    ]
    
    for (const check of fieldChecks) {
      const [columns] = await sequelize.query(`
        SELECT COLUMN_NAME FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = '${check.table}' 
        AND COLUMN_NAME = '${check.field}'
      `)
      const exists = columns.length > 0
      const status = exists ? '✅' : '❌'
      console.log(`${status} ${check.table}.${check.field}: ${exists ? '存在' : '不存在'} (${check.note})`)
    }
    
    // 检查实际可用的替代字段
    console.log('\n📝 实际可用的替代字段:')
    
    // lottery_draws 中奖判断
    const [rewardTiers] = await sequelize.query(`SELECT DISTINCT reward_tier FROM lottery_draws LIMIT 10`)
    console.log(`  lottery_draws.reward_tier: 可用于判断中奖 (值: ${rewardTiers.map(r => r.reward_tier).join(', ')})`)
    
    // asset_transactions 金额字段
    const [txCols] = await sequelize.query(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'asset_transactions' 
      AND COLUMN_NAME LIKE '%amount%'
    `)
    console.log(`  asset_transactions 金额字段: ${txCols.map(c => c.COLUMN_NAME).join(', ')}`)
    
    // asset_transactions 类型字段
    const [bizTypes] = await sequelize.query(`SELECT DISTINCT business_type FROM asset_transactions LIMIT 15`)
    console.log(`  asset_transactions.business_type: 可用于变动类型 (共${bizTypes.length}种类型)`)
    
  } catch (error) {
    console.error('❌ 数据库检查失败:', error.message)
  } finally {
    await sequelize.close()
  }

  console.log('\n✅ 检查完成')
}

main().catch(console.error)

