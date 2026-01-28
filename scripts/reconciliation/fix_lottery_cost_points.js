#!/usr/bin/env node
/**
 * 修复抽奖记录的 cost_points 字段
 *
 * 问题背景（2026-01-28 发现）：
 * - 连抽场景下，lottery_draws.cost_points 错误地记录了批次总成本，而非单次抽奖成本
 * - 例如：3连抽应该每条记录 cost_points=10，但实际记录的是 cost_points=30
 * - 导致对账脚本检测到 SUM(cost_points) != |delta_amount|
 *
 * 修复策略：
 * 1. 查找所有不一致的会话
 * 2. 计算正确的 per_draw_cost = |delta_amount| / draw_count
 * 3. 更新 lottery_draws.cost_points 为正确的单次成本
 *
 * 使用方式：
 * - 预览模式（不修改数据）：node scripts/reconciliation/fix_lottery_cost_points.js --dry-run
 * - 执行修复：node scripts/reconciliation/fix_lottery_cost_points.js --execute
 *
 * @since 2026-01-28
 * @author 对账系统自动生成
 */

'use strict'

require('dotenv').config()
const { Sequelize } = require('sequelize')

// 解析命令行参数
const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const isExecute = args.includes('--execute')

if (!isDryRun && !isExecute) {
  console.log('使用方式:')
  console.log('  预览模式：node scripts/reconciliation/fix_lottery_cost_points.js --dry-run')
  console.log('  执行修复：node scripts/reconciliation/fix_lottery_cost_points.js --execute')
  process.exit(1)
}

// 新账本分界线（2026-01-02 20:24:20）
const CUTOFF_DATE = '2026-01-02 20:24:20'

// 直接连接数据库
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  dialect: 'mysql',
  logging: false,
  timezone: '+08:00'
})

async function fixCostPoints() {
  console.log('='.repeat(60))
  console.log('修复抽奖记录 cost_points 字段')
  console.log(`模式: ${isDryRun ? '预览模式（不修改数据）' : '执行模式（将修改数据）'}`)
  console.log(`分界线: ${CUTOFF_DATE}`)
  console.log(`执行时间: ${new Date().toISOString()}`)
  console.log('='.repeat(60))

  try {
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 1. 查找所有不一致的会话
    const [inconsistent] = await sequelize.query(`
      SELECT
        ld.lottery_session_id,
        COUNT(*) as draw_count,
        SUM(ld.cost_points) as total_cost_in_draws,
        ABS(atx.delta_amount) as correct_total_cost,
        ABS(atx.delta_amount) / COUNT(*) as correct_per_draw_cost,
        MIN(ld.cost_points) as current_per_draw_cost
      FROM lottery_draws ld
      LEFT JOIN asset_transactions atx
        ON atx.lottery_session_id = ld.lottery_session_id
        AND atx.business_type = 'lottery_consume'
      WHERE ld.created_at >= ?
        AND ld.lottery_session_id IS NOT NULL
        AND ld.lottery_session_id != ''
        AND ld.lottery_session_id NOT LIKE '%test_%'
      GROUP BY ld.lottery_session_id, atx.delta_amount
      HAVING (SUM(ld.cost_points) + atx.delta_amount) != 0 
        AND atx.delta_amount IS NOT NULL
        AND COUNT(*) > 1
    `, { replacements: [CUTOFF_DATE] })

    if (inconsistent.length === 0) {
      console.log('✅ 没有需要修复的数据')
      return { fixed: 0, skipped: 0 }
    }

    console.log(`📊 发现 ${inconsistent.length} 个需要修复的会话:\n`)

    let totalFixed = 0
    let totalSkipped = 0

    for (const session of inconsistent) {
      const {
        lottery_session_id,
        draw_count,
        total_cost_in_draws,
        correct_total_cost,
        correct_per_draw_cost,
        current_per_draw_cost
      } = session

      console.log(`🔧 会话: ${lottery_session_id}`)
      console.log(`   抽奖次数: ${draw_count}`)
      console.log(`   当前 cost_points: ${current_per_draw_cost} (每条) × ${draw_count} = ${total_cost_in_draws}`)
      console.log(`   正确 cost_points: ${correct_per_draw_cost} (每条) × ${draw_count} = ${correct_total_cost}`)

      // 验证计算结果
      const calculatedTotal = correct_per_draw_cost * draw_count
      if (calculatedTotal !== correct_total_cost) {
        console.log(`   ⚠️ 计算验证失败，跳过此会话`)
        totalSkipped++
        continue
      }

      if (isDryRun) {
        console.log(`   📝 [预览] 将更新 cost_points: ${current_per_draw_cost} → ${correct_per_draw_cost}`)
      } else {
        // 执行更新
        const [result] = await sequelize.query(`
          UPDATE lottery_draws
          SET cost_points = ?
          WHERE lottery_session_id = ?
        `, { replacements: [correct_per_draw_cost, lottery_session_id] })

        console.log(`   ✅ 已修复 ${result.affectedRows || draw_count} 条记录`)
      }

      totalFixed++
      console.log('')
    }

    console.log('='.repeat(60))
    if (isDryRun) {
      console.log(`📝 预览完成: ${totalFixed} 个会话待修复, ${totalSkipped} 个跳过`)
    } else {
      console.log(`✅ 修复完成: ${totalFixed} 个会话已修复, ${totalSkipped} 个跳过`)
    }
    console.log('='.repeat(60))

    return { fixed: totalFixed, skipped: totalSkipped }
  } catch (error) {
    console.error('❌ 执行失败:', error.message)
    console.error(error.stack)
    throw error
  } finally {
    await sequelize.close()
  }
}

// 主入口
fixCostPoints()
  .then(result => {
    process.exit(0)
  })
  .catch(error => {
    process.exit(1)
  })

