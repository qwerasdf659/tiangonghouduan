/**
 * 历史数据清理脚本
 *
 * 根据事务边界治理报告决策（2026-01-05）：
 * - 删除 2026-01-02 20:24:20 之前的所有历史数据
 * - 只保留新账本启用后的数据
 *
 * 涉及表（按外键依赖顺序删除）：
 * 1. item_instance_events
 * 2. item_instances
 * 3. exchange_records
 * 4. content_review_records
 * 5. consumption_records
 * 6. lottery_draws
 *
 * 使用方式：
 * 1. 先运行 DRY_RUN=true node scripts/database/cleanup-historical-data.js 查看影响
 * 2. 确认后运行 node scripts/database/cleanup-historical-data.js 执行清理
 *
 * @since 2026-01-05
 */

'use strict'

require('dotenv').config()
const { sequelize } = require('../../config/database')
const logger = require('../../utils/logger')

// 时间分界线（新账本启用时间）
const CUTOFF_DATE = '2026-01-02 20:24:20'

// 是否为预览模式（不实际删除）
const DRY_RUN = process.env.DRY_RUN === 'true'

/**
 * 需要清理的表（按外键依赖顺序）
 */
const TABLES_TO_CLEANUP = [
  { table: 'item_instance_events', time_column: 'created_at' },
  { table: 'redemption_orders', time_column: 'created_at' },  // 依赖 item_instances
  { table: 'market_listings', time_column: 'created_at' },  // 依赖 item_instances
  { table: 'trade_orders', time_column: 'created_at' },     // 依赖 item_instances
  { table: 'item_instances', time_column: 'created_at' },
  { table: 'exchange_records', time_column: 'created_at' },
  { table: 'content_review_records', time_column: 'created_at' },
  { table: 'consumption_records', time_column: 'created_at' },
  { table: 'lottery_draws', time_column: 'created_at' }
]

/**
 * 获取表中分界线前的记录数
 */
async function getCountBeforeCutoff (table, time_column) {
  const [results] = await sequelize.query(
    `SELECT COUNT(*) as count FROM ${table} WHERE ${time_column} < :cutoff_date`,
    {
      replacements: { cutoff_date: CUTOFF_DATE },
      type: sequelize.QueryTypes.SELECT
    }
  )
  return results.count
}

/**
 * 获取表中分界线后的记录数
 */
async function getCountAfterCutoff (table, time_column) {
  const [results] = await sequelize.query(
    `SELECT COUNT(*) as count FROM ${table} WHERE ${time_column} >= :cutoff_date`,
    {
      replacements: { cutoff_date: CUTOFF_DATE },
      type: sequelize.QueryTypes.SELECT
    }
  )
  return results.count
}

/**
 * 删除表中分界线前的记录
 */
async function deleteBeforeCutoff (table, time_column) {
  const result = await sequelize.query(
    `DELETE FROM ${table} WHERE ${time_column} < :cutoff_date`,
    {
      replacements: { cutoff_date: CUTOFF_DATE },
      type: sequelize.QueryTypes.DELETE
    }
  )
  return result
}

/**
 * 主执行函数
 */
async function main () {
  console.log('='.repeat(60))
  console.log('历史数据清理脚本')
  console.log('='.repeat(60))
  console.log(`时间分界线: ${CUTOFF_DATE}`)
  console.log(`执行模式: ${DRY_RUN ? '预览模式（DRY_RUN）' : '实际删除模式'}`)
  console.log('='.repeat(60))
  console.log('')

  try {
    // 测试数据库连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 统计各表数据
    console.log('📊 数据统计（分界线前/后）:\n')

    const stats = []
    for (const { table, time_column } of TABLES_TO_CLEANUP) {
      const before = await getCountBeforeCutoff(table, time_column)
      const after = await getCountAfterCutoff(table, time_column)
      stats.push({ table, before, after })
      console.log(`  ${table}:`)
      console.log(`    - 分界线前（待删除）: ${before} 条`)
      console.log(`    - 分界线后（保留）: ${after} 条`)
      console.log('')
    }

    // 计算总影响
    const totalBefore = stats.reduce((sum, s) => sum + Number(s.before), 0)
    const totalAfter = stats.reduce((sum, s) => sum + Number(s.after), 0)

    console.log('='.repeat(60))
    console.log(`总计待删除: ${totalBefore} 条`)
    console.log(`总计保留: ${totalAfter} 条`)
    console.log('='.repeat(60))
    console.log('')

    // 预览模式提示
    if (DRY_RUN) {
      console.log('⚠️  当前为预览模式，未执行实际删除')
      console.log('    如需执行删除，请运行:')
      console.log('    node scripts/database/cleanup-historical-data.js')
      console.log('')
      process.exit(0)
    }

    // 确认执行
    if (totalBefore === 0) {
      console.log('✅ 无需清理，分界线前没有历史数据')
      process.exit(0)
    }

    console.log('🔥 开始执行删除操作...\n')

    // 临时禁用外键检查
    console.log('  🔓 临时禁用外键约束检查...')
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0')

    // 按顺序删除
    for (const { table, time_column } of TABLES_TO_CLEANUP) {
      const before = stats.find(s => s.table === table).before
      if (before > 0) {
        console.log(`  删除 ${table} 中 ${before} 条记录...`)
        await deleteBeforeCutoff(table, time_column)
        console.log(`  ✅ ${table} 清理完成`)
      } else {
        console.log(`  ⏭️  ${table} 无需清理（0条）`)
      }
    }

    // 恢复外键检查
    console.log('\n  🔒 恢复外键约束检查...')
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1')

    console.log('')
    console.log('='.repeat(60))
    console.log('✅ 历史数据清理完成！')
    console.log('='.repeat(60))

    // 验证结果
    console.log('\n📊 验证清理结果:\n')
    for (const { table, time_column } of TABLES_TO_CLEANUP) {
      const remaining = await getCountBeforeCutoff(table, time_column)
      const status = Number(remaining) === 0 ? '✅' : '❌'
      console.log(`  ${status} ${table}: 分界线前剩余 ${remaining} 条`)
    }

    logger.info('✅ 历史数据清理完成', {
      cutoff_date: CUTOFF_DATE,
      tables_cleaned: TABLES_TO_CLEANUP.map(t => t.table),
      total_deleted: totalBefore
    })
  } catch (error) {
    console.error('❌ 清理失败:', error.message)
    logger.error('❌ 历史数据清理失败', { error: error.message })
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

// 执行
main()
