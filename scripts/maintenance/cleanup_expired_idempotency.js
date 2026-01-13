#!/usr/bin/env node
/**
 * 幂等记录过期自动清理脚本
 *
 * 功能：清理 api_idempotency_requests 表中过期的 completed/failed 记录
 *
 * 清理策略（决策3-B）：
 * 1. 清理 expires_at < NOW() 且状态为 completed/failed 的记录
 * 2. 自动将超时的 processing 状态转为 failed
 * 3. 建议每天凌晨3点定时执行
 *
 * 执行：
 *   node scripts/maintenance/cleanup_expired_idempotency.js [--dry-run]
 *   npm run cleanup:idempotency [-- --dry-run]
 *
 * 参数：
 *   --dry-run  只统计不删除，预览模式
 *
 * 定时任务配置建议（crontab）：
 *   0 3 * * * cd /home/devbox/project && node scripts/maintenance/cleanup_expired_idempotency.js >> logs/idempotency_cleanup.log 2>&1
 *
 * 监控告警：
 *   - 表记录超过 100,000 条时应告警
 *   - 清理失败时应告警
 *
 * @since 2026-01-13
 * @version 1.0.0
 */

'use strict'

const path = require('path')

// 加载环境变量
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') })

/**
 * 获取北京时间格式化字符串
 * @returns {string} 北京时间字符串
 */
function getBeijingTime() {
  return new Date().toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

/**
 * 主清理函数
 */
async function cleanupExpiredIdempotency() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')

  console.log('='.repeat(60))
  console.log('  幂等记录过期自动清理脚本')
  console.log('  执行时间:', getBeijingTime())
  console.log('  执行模式:', dryRun ? '预览（dry-run）' : '实际删除')
  console.log('='.repeat(60))
  console.log('')

  // 动态加载数据库配置（避免在模块顶层校验）
  const { sequelize } = require('../../config/database')

  try {
    // 测试数据库连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')
    console.log('')

    /* ===============================================================
     * 1. 统计清理前状态
     * =============================================================== */
    console.log('--- 清理前统计 ---')

    const [statsBeforeRaw] = await sequelize.query(`
      SELECT 
        status,
        COUNT(*) as count,
        SUM(CASE WHEN expires_at < NOW() THEN 1 ELSE 0 END) as expired_count
      FROM api_idempotency_requests
      GROUP BY status
    `)

    let totalRecords = 0
    let expiredRecords = 0

    if (statsBeforeRaw.length === 0) {
      console.log('  幂等记录表为空，无需清理')
    } else {
      statsBeforeRaw.forEach(row => {
        totalRecords += parseInt(row.count, 10)
        expiredRecords += parseInt(row.expired_count, 10)
        console.log(`  [${row.status}] 总计: ${row.count}, 已过期: ${row.expired_count}`)
      })
      console.log(`  合计: 总计 ${totalRecords} 条, 已过期 ${expiredRecords} 条`)
    }
    console.log('')

    /* ===============================================================
     * 2. 记录超限告警检查
     * =============================================================== */
    if (totalRecords > 100000) {
      console.log('⚠️  警告: 幂等记录表已超过 100,000 条，建议检查清理策略')
      console.log('')
    }

    /* ===============================================================
     * 3. 处理超时的 processing 状态（转为 failed）
     * =============================================================== */
    console.log('--- 处理超时 processing 状态 ---')

    const processingTimeoutSeconds = 60 // 与 IdempotencyService 一致

    if (dryRun) {
      const [timeoutCountRaw] = await sequelize.query(
        `
        SELECT COUNT(*) as count
        FROM api_idempotency_requests
        WHERE status = 'processing'
          AND created_at < DATE_SUB(NOW(), INTERVAL :timeout SECOND)
      `,
        {
          replacements: { timeout: processingTimeoutSeconds }
        }
      )
      const timeoutCount = timeoutCountRaw[0]?.count || 0
      console.log(`  超时 processing 记录: ${timeoutCount} 条（预览模式，未更新）`)
    } else {
      const [updateResult] = await sequelize.query(
        `
        UPDATE api_idempotency_requests
        SET status = 'failed',
            updated_at = NOW()
        WHERE status = 'processing'
          AND created_at < DATE_SUB(NOW(), INTERVAL :timeout SECOND)
      `,
        {
          replacements: { timeout: processingTimeoutSeconds }
        }
      )
      const affectedRows = updateResult.affectedRows || 0
      console.log(`  超时 processing 转 failed: ${affectedRows} 条`)
    }
    console.log('')

    /* ===============================================================
     * 4. 清理过期的 completed 和 failed 记录
     * =============================================================== */
    console.log('--- 清理过期记录 ---')

    if (dryRun) {
      const [expiredCountRaw] = await sequelize.query(`
        SELECT COUNT(*) as count
        FROM api_idempotency_requests
        WHERE expires_at < NOW()
          AND status IN ('completed', 'failed')
      `)
      const expiredCount = expiredCountRaw[0]?.count || 0
      console.log(`  待清理过期记录: ${expiredCount} 条（预览模式，未删除）`)
    } else {
      const [deleteResult] = await sequelize.query(`
        DELETE FROM api_idempotency_requests
        WHERE expires_at < NOW()
          AND status IN ('completed', 'failed')
      `)
      const deletedRows = deleteResult.affectedRows || 0
      console.log(`  已清理过期记录: ${deletedRows} 条`)
    }
    console.log('')

    /* ===============================================================
     * 5. 统计清理后状态
     * =============================================================== */
    console.log('--- 清理后统计 ---')

    const [statsAfterRaw] = await sequelize.query(`
      SELECT 
        status,
        COUNT(*) as count
      FROM api_idempotency_requests
      GROUP BY status
    `)

    let remainingTotal = 0
    if (statsAfterRaw.length === 0) {
      console.log('  幂等记录表已清空')
    } else {
      statsAfterRaw.forEach(row => {
        remainingTotal += parseInt(row.count, 10)
        console.log(`  [${row.status}] 剩余: ${row.count} 条`)
      })
      console.log(`  合计剩余: ${remainingTotal} 条`)
    }
    console.log('')

    /* ===============================================================
     * 6. 完成
     * =============================================================== */
    await sequelize.close()

    console.log('='.repeat(60))
    if (dryRun) {
      console.log('  📋 预览模式完成，未执行实际删除')
      console.log('  💡 移除 --dry-run 参数执行实际清理')
    } else {
      console.log('  ✅ 清理完成')
      console.log(`  📊 清理前: ${totalRecords} 条, 清理后: ${remainingTotal} 条`)
    }
    console.log('  执行时间:', getBeijingTime())
    console.log('='.repeat(60))

    process.exit(0)
  } catch (error) {
    console.error('❌ 清理失败:', error.message)
    console.error('   堆栈:', error.stack)
    try {
      await sequelize.close()
    } catch {
      // 忽略关闭错误
    }
    process.exit(1)
  }
}

// 执行主函数
cleanupExpiredIdempotency()
