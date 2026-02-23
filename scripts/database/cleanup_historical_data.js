/**
 * 历史数据清理脚本
 *
 * 根据事务边界治理报告决策（2026-01-05）：
 * - 删除 2026-01-02 20:24:20 之前的所有历史数据
 * - 只保留新账本启用后的数据
 *
 * ⚠️ 重要修复（2026-01-30）：
 * - 删除 trade_orders 前，先解冻买家冻结的资产
 * - 防止出现"孤儿冻结"问题
 *
 * 涉及表（按外键依赖顺序删除）：
 * 1. item_ledger（原 item_instance_events）
 * 2. items
 * 3. exchange_records
 * 4. content_review_records
 * 5. consumption_records
 * 6. lottery_draws
 *
 * 使用方式：
 * 1. 先运行 DRY_RUN=true node scripts/database/cleanup_historical_data.js 查看影响
 * 2. 确认后运行 node scripts/database/cleanup_historical_data.js 执行清理
 *
 * @since 2026-01-05
 * @updated 2026-01-30 修复买家资产孤儿冻结问题
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
  { table: 'item_ledger', time_column: 'created_at' },
  { table: 'item_holds', time_column: 'created_at' },
  { table: 'redemption_orders', time_column: 'created_at' },
  { table: 'market_listings', time_column: 'created_at' },
  { table: 'trade_orders', time_column: 'created_at' },
  { table: 'items', time_column: 'created_at' },
  { table: 'exchange_records', time_column: 'created_at' },
  { table: 'content_review_records', time_column: 'created_at' },
  { table: 'consumption_records', time_column: 'created_at' },
  { table: 'lottery_draws', time_column: 'created_at' }
]

/**
 * 获取表中分界线前的记录数
 */
async function getCountBeforeCutoff(table, time_column) {
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
async function getCountAfterCutoff(table, time_column) {
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
async function deleteBeforeCutoff(table, time_column) {
  const result = await sequelize.query(`DELETE FROM ${table} WHERE ${time_column} < :cutoff_date`, {
    replacements: { cutoff_date: CUTOFF_DATE },
    type: sequelize.QueryTypes.DELETE
  })
  return result
}

/**
 * ⚠️ 关键修复：解冻即将删除的买家订单冻结资产
 *
 * 问题根因：删除 trade_orders 时，买家冻结的资产没有解冻，
 * 导致"孤儿冻结"——冻结金额存在但对应订单已删除
 *
 * @returns {Object} { unfrozen_count, total_amount, details }
 */
async function unfreezeOrdersBeforeDelete() {
  console.log('\n  🔓 解冻即将删除的订单关联资产...')

  // 1. 查找所有即将删除的冻结状态订单
  const [frozenOrders] = await sequelize.query(
    `SELECT 
      order_id, buyer_user_id, asset_code, gross_amount, status
     FROM trade_orders 
     WHERE created_at < :cutoff_date 
       AND status = 'frozen'`,
    {
      replacements: { cutoff_date: CUTOFF_DATE },
      type: sequelize.QueryTypes.SELECT
    }
  )

  if (!frozenOrders || frozenOrders.length === 0) {
    console.log('    ⏭️  无需解冻（没有冻结状态的历史订单）')
    return { unfrozen_count: 0, total_amount: 0, details: [] }
  }

  console.log(`    📊 发现 ${frozenOrders.length} 个冻结状态的历史订单`)

  // 2. 按用户和资产分组统计
  const userAssetMap = new Map()
  for (const order of frozenOrders) {
    const key = `${order.buyer_user_id}_${order.asset_code}`
    if (!userAssetMap.has(key)) {
      userAssetMap.set(key, {
        user_id: order.buyer_user_id,
        asset_code: order.asset_code,
        total_amount: 0,
        order_count: 0,
        order_ids: []
      })
    }
    const record = userAssetMap.get(key)
    record.total_amount += Number(order.gross_amount) || 0
    record.order_count++
    record.order_ids.push(order.order_id)
  }

  if (DRY_RUN) {
    console.log('    ⚠️  [预览模式] 以下资产将被解冻:')
    for (const [, record] of userAssetMap) {
      console.log(`       用户${record.user_id} ${record.asset_code}: ${record.total_amount} (${record.order_count}个订单)`)
    }
    return {
      unfrozen_count: frozenOrders.length,
      total_amount: Array.from(userAssetMap.values()).reduce((sum, r) => sum + r.total_amount, 0),
      details: Array.from(userAssetMap.values())
    }
  }

  // 3. 加载资产服务进行解冻
  // V4.7.0 AssetService 拆分：使用 BalanceService（2026-01-31）
  const BalanceService = require('../../services/asset/BalanceService')
  const TransactionManager = require('../../utils/TransactionManager')

  let unfrozen_count = 0
  let failed_count = 0
  const details = []

  for (const [, record] of userAssetMap) {
    try {
      // 解冻资产（使用 TransactionManager 包装事务）
      await TransactionManager.execute(async transaction => {
        await BalanceService.unfreeze(
          {
            user_id: record.user_id,
            asset_code: record.asset_code,
            amount: record.total_amount,
            business_type: 'historical_data_cleanup_unfreeze',
            idempotency_key: `cleanup_unfreeze_${record.user_id}_${record.asset_code}_${Date.now()}`,
            meta: { reason: `历史数据清理脚本：删除${record.order_count}个冻结订单前解冻` }
          },
          { transaction }
        )
      })

      console.log(`    ✅ 解冻成功: 用户${record.user_id} ${record.asset_code} ${record.total_amount}`)
      unfrozen_count += record.order_count
      details.push({ ...record, status: 'success' })
    } catch (error) {
      console.error(`    ❌ 解冻失败: 用户${record.user_id} ${record.asset_code}: ${error.message}`)
      failed_count++
      details.push({ ...record, status: 'failed', error: error.message })
    }
  }

  const total_amount = details.filter(d => d.status === 'success').reduce((sum, d) => sum + d.total_amount, 0)

  console.log(`    📊 解冻结果: 成功 ${unfrozen_count} 个订单, 失败 ${failed_count}, 总金额 ${total_amount}`)

  return { unfrozen_count, total_amount, details }
}

/**
 * 主执行函数
 */
async function main() {
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

    // ⚠️ 关键步骤：解冻即将删除的订单资产
    const unfreezeResult = await unfreezeOrdersBeforeDelete()

    // 预览模式提示
    if (DRY_RUN) {
      console.log('')
      console.log('⚠️  当前为预览模式，未执行实际删除')
      console.log('    如需执行删除，请运行:')
      console.log('    node scripts/database/cleanup_historical_data.js')
      console.log('')
      process.exit(0)
    }

    // 确认执行
    if (totalBefore === 0) {
      console.log('✅ 无需清理，分界线前没有历史数据')
      process.exit(0)
    }

    console.log('\n🔥 开始执行删除操作...\n')

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
      total_deleted: totalBefore,
      assets_unfrozen: unfreezeResult
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
