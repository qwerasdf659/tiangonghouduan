/**
 * 兑换扣款一致性对账脚本
 *
 * 治理决策（2026-01-05 拍板）：
 * - 所有兑换记录必须有对应的扣款流水
 * - 验证：exchange_records.material_cost = |asset_transaction.delta_amount|
 * - 发现差异立即：告警 + 阻断发布 + 自动冻结入口
 *
 * 使用方式：
 * - 手动执行：node scripts/reconciliation/check_exchange_consistency.js
 * - 定时执行：每小时第5分钟（建议配合 cron 或 node-schedule）
 *
 * @since 2026-01-05
 * @see docs/事务边界治理现状核查报告.md
 */

'use strict'

require('dotenv').config()
const { Sequelize } = require('sequelize')

// 新账本分界线（2026-01-02 20:24:20）
const CUTOFF_DATE = '2026-01-02 20:24:20'

// 直接连接数据库（避免循环依赖问题）
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  dialect: 'mysql',
  logging: false,
  timezone: '+08:00'
})

/**
 * 发送告警通知（示例实现）
 */
async function send_alert(alert_type, data) {
  console.error(`\n🚨 [${alert_type}] 告警触发:`)
  console.error(JSON.stringify(data, null, 2))

  // 记录告警日志
  const fs = require('fs')
  const path = require('path')
  const log_dir = path.join(__dirname, '../../logs/reconciliation')
  if (!fs.existsSync(log_dir)) {
    fs.mkdirSync(log_dir, { recursive: true })
  }
  const log_file = path.join(log_dir, `alert_${new Date().toISOString().split('T')[0]}.log`)
  const log_entry = {
    timestamp: new Date().toISOString(),
    alert_type,
    data
  }
  fs.appendFileSync(log_file, JSON.stringify(log_entry) + '\n')
}

/**
 * 冻结入口（示例实现）
 */
async function freeze_entry_on_inconsistency(entry_type, inconsistent_data) {
  console.log(`\n🔒 冻结入口: ${entry_type}`)

  // 记录冻结日志
  const fs = require('fs')
  const path = require('path')
  const log_dir = path.join(__dirname, '../../logs/reconciliation')
  if (!fs.existsSync(log_dir)) {
    fs.mkdirSync(log_dir, { recursive: true })
  }
  const log_file = path.join(log_dir, `freeze_${new Date().toISOString().split('T')[0]}.log`)
  const log_entry = {
    timestamp: new Date().toISOString(),
    entry_type,
    action: 'freeze',
    inconsistent_count: inconsistent_data.length
  }
  fs.appendFileSync(log_file, JSON.stringify(log_entry) + '\n')
}

/**
 * 检查兑换扣款一致性
 *
 * 验证规则（P0治理 - 2026-01-09）：
 * 1. 每条兑换记录必须有对应的扣款流水（通过 debit_transaction_id 关联）
 * 2. 扣款流水的 |delta_amount| = exchange_records.pay_amount
 * 3. 只检查分界线后的数据
 * 4. 排除测试数据（is_test_data = 1 或 idempotency_key 包含 test_）
 *
 * 对账方式升级：
 * - 主要方式：通过 debit_transaction_id 外键直接关联（新数据）
 * - 兼容方式：通过 idempotency_key 格式匹配（历史数据）
 *   幂等键格式：exchange_debit_{idempotency_key}
 *
 * @returns {Promise<Object>} 检查结果
 */
async function check_exchange_consistency() {
  console.log('='.repeat(60))
  console.log('兑换扣款一致性对账脚本（P0治理 - 2026-01-09）')
  console.log(`分界线: ${CUTOFF_DATE}`)
  console.log(`执行时间: ${new Date().toISOString()}`)
  console.log('='.repeat(60))

  try {
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 1. 检查缺失扣款流水的兑换记录
    // 优先使用 debit_transaction_id 直接关联（P0治理新增）
    // 兼容通过 idempotency_key 匹配（格式：exchange_debit_{idempotency_key}）
    const [missing_debits] = await sequelize.query(
      `
      SELECT
        er.record_id,
        er.user_id,
        er.pay_amount,
        er.pay_asset_code,
        er.idempotency_key as exchange_idempotency_key,
        er.debit_transaction_id,
        er.created_at
      FROM exchange_records er
      LEFT JOIN asset_transactions atx1
        ON atx1.transaction_id = er.debit_transaction_id
      LEFT JOIN asset_transactions atx2
        ON atx2.idempotency_key = CONCAT('exchange_debit_', er.idempotency_key)
        AND atx2.business_type = 'exchange_debit'
      WHERE er.created_at >= ?
        AND atx1.transaction_id IS NULL
        AND atx2.transaction_id IS NULL
      LIMIT 50
    `,
      { replacements: [CUTOFF_DATE] }
    )

    // 2. 检查扣款金额不一致的记录
    // 优先使用 debit_transaction_id，兼容 idempotency_key
    const [amount_mismatch] = await sequelize.query(
      `
      SELECT
        er.record_id,
        er.user_id,
        er.pay_amount as expected_cost,
        -COALESCE(atx1.delta_amount, atx2.delta_amount) as actual_cost,
        (er.pay_amount + COALESCE(atx1.delta_amount, atx2.delta_amount)) as diff
      FROM exchange_records er
      LEFT JOIN asset_transactions atx1
        ON atx1.transaction_id = er.debit_transaction_id
      LEFT JOIN asset_transactions atx2
        ON atx2.idempotency_key = CONCAT('exchange_debit_', er.idempotency_key)
        AND atx2.business_type = 'exchange_debit'
      WHERE er.created_at >= ?
        AND (atx1.transaction_id IS NOT NULL OR atx2.transaction_id IS NOT NULL)
        AND er.pay_amount != -COALESCE(atx1.delta_amount, atx2.delta_amount)
      LIMIT 50
    `,
      { replacements: [CUTOFF_DATE] }
    )

    // 3. 检查孤立的扣款流水（有流水但无对应兑换记录）
    // 排除测试数据：is_test_data = 1 或 idempotency_key 包含 test_
    const [orphan_debits] = await sequelize.query(
      `
      SELECT
        atx.transaction_id,
        atx.idempotency_key,
        atx.delta_amount,
        atx.asset_code,
        atx.created_at
      FROM asset_transactions atx
      LEFT JOIN exchange_records er1
        ON er1.debit_transaction_id = atx.transaction_id
      LEFT JOIN exchange_records er2
        ON atx.idempotency_key = CONCAT('exchange_debit_', er2.idempotency_key)
      WHERE atx.business_type = 'exchange_debit'
        AND atx.created_at >= ?
        AND er1.record_id IS NULL
        AND er2.record_id IS NULL
        AND COALESCE(atx.is_test_data, 0) = 0
        AND atx.idempotency_key NOT LIKE '%test_%'
      LIMIT 20
    `,
      { replacements: [CUTOFF_DATE] }
    )

    // 4. 汇总统计
    const [stats] = await sequelize.query(
      `
      SELECT
        COUNT(*) as total_exchanges,
        SUM(pay_amount) as total_pay_amount,
        COUNT(DISTINCT user_id) as unique_users,
        SUM(CASE WHEN debit_transaction_id IS NOT NULL THEN 1 ELSE 0 END) as records_with_debit_txn_id
      FROM exchange_records
      WHERE created_at >= ?
    `,
      { replacements: [CUTOFF_DATE] }
    )

    // 统计时也排除测试数据
    const [tx_stats] = await sequelize.query(
      `
      SELECT
        COUNT(*) as total_debit_txns,
        SUM(-delta_amount) as total_debited
      FROM asset_transactions
      WHERE business_type = 'exchange_debit'
        AND created_at >= ?
        AND COALESCE(is_test_data, 0) = 0
        AND idempotency_key NOT LIKE '%test_%'
    `,
      { replacements: [CUTOFF_DATE] }
    )

    console.log('\n📊 对账统计:')
    console.log(`   - 分界线后兑换记录数: ${stats[0].total_exchanges}`)
    console.log(`   - 分界线后支付资产总量: ${stats[0].total_pay_amount || 0}`)
    console.log(`   - 分界线后扣款流水数: ${tx_stats[0].total_debit_txns}`)
    console.log(`   - 分界线后实际扣款总量: ${tx_stats[0].total_debited || 0}`)
    console.log(`   - 已绑定debit_transaction_id记录数: ${stats[0].records_with_debit_txn_id}`)

    // P0治理指标：debit_transaction_id 覆盖率
    const coverage_rate =
      stats[0].total_exchanges > 0
        ? ((stats[0].records_with_debit_txn_id / stats[0].total_exchanges) * 100).toFixed(2)
        : 'N/A'
    console.log(`   - debit_transaction_id 覆盖率: ${coverage_rate}%`)

    // 5. 处理结果
    const has_errors =
      missing_debits.length > 0 || amount_mismatch.length > 0 || orphan_debits.length > 0

    if (has_errors) {
      console.log('\n❌ 发现数据不一致:')

      if (missing_debits.length > 0) {
        console.log(`\n   缺失扣款流水的兑换记录 (${missing_debits.length}条):`)
        missing_debits.slice(0, 10).forEach(r => {
          console.log(
            `   - record_id: ${r.record_id}, user_id: ${r.user_id}, pay_amount: ${r.pay_amount}`
          )
        })
        if (missing_debits.length > 10) {
          console.log(`   ... 还有 ${missing_debits.length - 10} 条`)
        }
      }

      if (amount_mismatch.length > 0) {
        console.log(`\n   扣款金额不一致 (${amount_mismatch.length}条):`)
        amount_mismatch.slice(0, 10).forEach(r => {
          console.log(
            `   - record_id: ${r.record_id}, 期望: ${r.expected_cost}, 实际: ${r.actual_cost}, 差异: ${r.diff}`
          )
        })
      }

      if (orphan_debits.length > 0) {
        console.log(`\n   孤立的扣款流水 (${orphan_debits.length}条):`)
        orphan_debits.slice(0, 10).forEach(r => {
          console.log(`   - transaction_id: ${r.transaction_id}, delta_amount: ${r.delta_amount}`)
        })
      }

      // 告警 + 阻断发布 + 冻结入口
      await send_alert('EXCHANGE_CONSISTENCY_ERROR', {
        severity: 'CRITICAL',
        missing_debits_count: missing_debits.length,
        amount_mismatch_count: amount_mismatch.length,
        orphan_debits_count: orphan_debits.length,
        sample_missing: missing_debits.slice(0, 5),
        message: `兑换扣款数据不一致（${missing_debits.length + amount_mismatch.length}条）`
      })

      await freeze_entry_on_inconsistency('exchange', missing_debits)

      console.log('\n' + '='.repeat(60))
      console.log('❌ 对账失败 - 请人工介入修复')
      console.log('='.repeat(60))

      return {
        status: 'FAILED',
        missing_debits,
        amount_mismatch,
        orphan_debits,
        stats: { ...stats[0], ...tx_stats[0] }
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ 对账通过 - 兑换扣款数据一致')
    console.log('='.repeat(60))

    return {
      status: 'PASSED',
      message: '兑换扣款数据一致',
      stats: { ...stats[0], ...tx_stats[0] }
    }
  } catch (error) {
    console.error('\n❌ 对账脚本执行失败:', error.message)
    console.error(error.stack)

    await send_alert('EXCHANGE_RECONCILIATION_SCRIPT_ERROR', {
      severity: 'WARNING',
      error: error.message,
      message: '兑换扣款对账脚本执行失败'
    })

    return {
      status: 'ERROR',
      error: error.message
    }
  } finally {
    await sequelize.close()
  }
}

// 主入口
if (require.main === module) {
  check_exchange_consistency()
    .then(result => {
      if (result.status === 'FAILED') {
        process.exit(1)
      }
    })
    .catch(error => {
      console.error('Fatal error:', error)
      process.exit(1)
    })
}

module.exports = { check_exchange_consistency }
