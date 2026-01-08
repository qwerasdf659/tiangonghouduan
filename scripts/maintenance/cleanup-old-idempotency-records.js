#!/usr/bin/env node
/**
 * 幂等记录旧路径清理脚本
 *
 * 功能：清理 api_idempotency_requests 表中已过期的旧路径记录
 *
 * 清理策略：
 * 1. 只清理已过期（expires_at < NOW()）的记录
 * 2. 只清理旧路径（/api/v4/exchange_market/exchange, /api/v4/assets/convert）
 * 3. 保留审计需要的 completed 状态记录（可选）
 *
 * 执行：
 *   node scripts/maintenance/cleanup-old-idempotency-records.js [--dry-run] [--keep-completed]
 *
 * 参数：
 *   --dry-run        只统计不删除
 *   --keep-completed 保留 completed 状态的记录（用于审计追溯）
 *
 * @since 2026-01-09
 */

const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') })

const { sequelize } = require('../../config/database')

/* 旧路径列表（需要清理的历史路径） */
const OLD_PATHS = ['/api/v4/exchange_market/exchange', '/api/v4/assets/convert']

async function cleanupOldIdempotencyRecords() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const keepCompleted = args.includes('--keep-completed')

  console.log('=== 幂等记录旧路径清理 ===\n')
  console.log('模式:', dryRun ? '预览（dry-run）' : '实际删除')
  console.log('保留completed:', keepCompleted ? '是' : '否')
  console.log('目标路径:', OLD_PATHS.join(', '))
  console.log('')

  try {
    /* 1. 统计现有记录 */
    console.log('--- 统计现有记录 ---')

    for (const oldPath of OLD_PATHS) {
      const [stats] = await sequelize.query(
        `
        SELECT 
          status,
          COUNT(*) as count,
          SUM(CASE WHEN expires_at < NOW() THEN 1 ELSE 0 END) as expired_count
        FROM api_idempotency_requests
        WHERE api_path = :oldPath
        GROUP BY status
      `,
        {
          replacements: { oldPath },
          type: sequelize.QueryTypes.SELECT
        }
      )

      if (!stats || stats.length === 0) {
        console.log(`  ${oldPath}: 无记录`)
        continue
      }

      const [result] = await sequelize.query(
        `
        SELECT 
          status,
          COUNT(*) as count,
          SUM(CASE WHEN expires_at < NOW() THEN 1 ELSE 0 END) as expired_count
        FROM api_idempotency_requests
        WHERE api_path = :oldPath
        GROUP BY status
      `,
        {
          replacements: { oldPath },
          type: sequelize.QueryTypes.RAW
        }
      )

      console.log(`  ${oldPath}:`)
      if (Array.isArray(result) && result.length > 0) {
        result.forEach(row => {
          console.log(`    [${row.status}] 总计: ${row.count}, 已过期: ${row.expired_count}`)
        })
      } else {
        console.log('    无记录')
      }
    }

    /* 2. 执行清理 */
    if (!dryRun) {
      console.log('\n--- 执行清理 ---')

      for (const oldPath of OLD_PATHS) {
        let whereClause = 'api_path = :oldPath AND expires_at < NOW()'

        if (keepCompleted) {
          whereClause += " AND status != 'completed'"
        }

        const [result] = await sequelize.query(
          `
          DELETE FROM api_idempotency_requests
          WHERE ${whereClause}
        `,
          {
            replacements: { oldPath }
          }
        )

        const affectedRows = result.affectedRows || 0
        console.log(`  ${oldPath}: 删除 ${affectedRows} 条记录`)
      }

      console.log('\n✅ 清理完成')
    } else {
      console.log('\n📋 预览模式，未执行删除')
      console.log('💡 移除 --dry-run 参数执行实际删除')
    }

    /* 3. 统计清理后状态 */
    console.log('\n--- 清理后统计 ---')
    const [remaining] = await sequelize.query(
      `
      SELECT api_path, status, COUNT(*) as count
      FROM api_idempotency_requests
      WHERE api_path IN (:oldPaths)
      GROUP BY api_path, status
    `,
      {
        replacements: { oldPaths: OLD_PATHS }
      }
    )

    if (remaining.length === 0) {
      console.log('  旧路径记录已全部清理')
    } else {
      remaining.forEach(row => {
        console.log(`  ${row.api_path} [${row.status}]: ${row.count} 条`)
      })
    }

    await sequelize.close()
    console.log('\n=== 完成 ===')
    process.exit(0)
  } catch (error) {
    console.error('❌ 清理失败:', error.message)
    await sequelize.close()
    process.exit(1)
  }
}

cleanupOldIdempotencyRecords()
