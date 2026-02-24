#!/usr/bin/env node

/**
 * 观察期表数据产生情况检查脚本
 *
 * 业务背景（功能重复检查报告 2026-01-09）：
 * - 部分空表设定 90 天观察期（截止日期：2026-04-09）
 * - 定期检查这些表是否产生数据
 * - 到期未达标则进入废弃流程
 *
 * 观察期表及阈值：
 * - content_review_records: ≥ 10 条审批记录
 * - exchange_records: ≥ 5 笔兑换订单
 * - trade_orders: ≥ 10 笔 交易市场 交易订单
 * - consumption_records: ≥ 5 条消费记录
 *
 * 使用方式：
 * - 手动执行：node scripts/monitoring/check-observation-tables.js
 * - 定时任务：每周一 09:00 执行（cron: 0 9 * * 1）
 *
 * 创建时间：2026-01-09
 */

'use strict'

require('dotenv').config()
const { sequelize } = require('../../config/database')
const BeijingTimeHelper = require('../../utils/timeHelper')

/**
 * 观察期表配置
 */
const OBSERVATION_TABLES = [
  {
    name: 'content_review_records',
    minCount: 10,
    deadline: '2026-04-09',
    description: '统一审批流表（消费审核+商家审核）'
  },
  {
    name: 'exchange_records',
    minCount: 5,
    deadline: '2026-04-09',
    description: 'B2C 材料兑换订单表'
  },
  {
    name: 'trade_orders',
    minCount: 10,
    deadline: '2026-04-09',
    description: '交易市场交易订单表'
  },
  {
    name: 'consumption_records',
    minCount: 5,
    deadline: '2026-04-09',
    description: '消费记录业务主表'
  }
]

/**
 * 计算剩余天数
 */
function calculateDaysRemaining(deadline) {
  const now = new Date()
  const deadlineDate = new Date(deadline)
  const diffMs = deadlineDate - now
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  return diffDays
}

/**
 * 获取状态标识
 */
function getStatus(count, minCount, daysRemaining) {
  if (count >= minCount) return 'PASS'
  if (daysRemaining <= 0) return 'EXPIRED'
  if (daysRemaining <= 30) return 'WARNING'
  return 'OBSERVING'
}

/**
 * 获取状态emoji
 */
function getStatusEmoji(status) {
  const emojiMap = {
    PASS: '✅',
    OBSERVING: '👀',
    WARNING: '⚠️',
    EXPIRED: '❌'
  }
  return emojiMap[status] || '❓'
}

/**
 * 主函数
 */
async function main() {
  try {
    console.log('🔍 观察期表数据产生情况检查')
    console.log('='.repeat(80))
    console.log(`检查时间: ${BeijingTimeHelper.now()}`)
    console.log(`观察期截止: 2026-04-09（90天）`)
    console.log('='.repeat(80))

    await sequelize.authenticate()

    const results = []

    for (const table of OBSERVATION_TABLES) {
      // 检查表是否存在
      const [tableExists] = await sequelize.query(`SHOW TABLES LIKE '${table.name}'`)

      if (tableExists.length === 0) {
        results.push({
          table: table.name,
          description: table.description,
          count: 0,
          required: table.minCount,
          latest: null,
          daysRemaining: calculateDaysRemaining(table.deadline),
          status: 'TABLE_NOT_FOUND'
        })
        continue
      }

      // 查询表数据
      const [rows] = await sequelize.query(`
        SELECT COUNT(*) AS count, MAX(created_at) AS latest 
        FROM ${table.name}
      `)

      const count = rows[0].count
      const latest = rows[0].latest
      const daysRemaining = calculateDaysRemaining(table.deadline)
      const status = getStatus(count, table.minCount, daysRemaining)

      results.push({
        table: table.name,
        description: table.description,
        count: count,
        required: table.minCount,
        latest: latest ? BeijingTimeHelper.formatForAPI(latest) : null,
        daysRemaining: daysRemaining,
        status: status
      })
    }

    // 输出结果表格
    console.log('\n📊 检查结果:')
    console.log('='.repeat(80))

    results.forEach(result => {
      const emoji = getStatusEmoji(result.status)
      const progress =
        result.count >= result.required ? '达标' : `${result.count}/${result.required}`

      console.log(`\n${emoji} ${result.table}`)
      console.log(`   描述: ${result.description}`)
      console.log(`   数据量: ${progress}`)
      console.log(`   最新数据: ${result.latest || '无'}`)
      console.log(`   剩余天数: ${result.daysRemaining} 天`)
      console.log(`   状态: ${result.status}`)
    })

    // 统计和告警
    console.log('\n' + '='.repeat(80))
    console.log('📈 统计摘要:')

    const passCount = results.filter(r => r.status === 'PASS').length
    const warningCount = results.filter(r => r.status === 'WARNING').length
    const expiredCount = results.filter(r => r.status === 'EXPIRED').length
    const observingCount = results.filter(r => r.status === 'OBSERVING').length

    console.log(`   ✅ 已达标: ${passCount} 个`)
    console.log(`   👀 观察中: ${observingCount} 个`)
    console.log(`   ⚠️ 即将到期: ${warningCount} 个`)
    console.log(`   ❌ 已过期: ${expiredCount} 个`)

    // 发出告警
    if (warningCount > 0 || expiredCount > 0) {
      console.log('\n🚨 需要关注的表:')
      results
        .filter(r => r.status === 'WARNING' || r.status === 'EXPIRED')
        .forEach(r => {
          console.log(`   ${getStatusEmoji(r.status)} ${r.table}: ${r.status}`)
          if (r.status === 'EXPIRED') {
            console.log(`      ⚠️ 已过期，建议进入废弃流程`)
          } else {
            console.log(`      ⚠️ ${r.daysRemaining} 天后到期，请尽快上线功能`)
          }
        })
    }

    console.log('\n' + '='.repeat(80))
    console.log('✅ 检查完成')

    await sequelize.close()
    process.exit(0)
  } catch (error) {
    console.error('❌ 检查失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// 执行主函数
main()
