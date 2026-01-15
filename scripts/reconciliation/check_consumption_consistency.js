/**
 * 消费奖励一致性对账脚本
 *
 * 治理决策（2026-01-05 拍板）：
 * - 所有 approved 状态的消费记录必须有对应的奖励流水
 * - 幂等键格式：consumption_reward:approve:{record_id}
 * - 发现差异立即：告警 + 阻断发布 + 自动冻结入口
 *
 * 使用方式：
 * - 手动执行：node scripts/reconciliation/check_consumption_consistency.js
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
 * 检查消费奖励一致性
 *
 * 验证规则：
 * 1. 所有 status='approved' 的消费记录必须有对应的奖励流水
 * 2. 奖励流水的 idempotency_key 格式：consumption_reward:approve:{record_id}
 * 3. 只检查分界线后的数据
 *
 * @returns {Promise<Object>} 检查结果
 */
async function check_consumption_consistency() {
  console.log('='.repeat(60))
  console.log('消费奖励一致性对账脚本')
  console.log(`分界线: ${CUTOFF_DATE}`)
  console.log(`执行时间: ${new Date().toISOString()}`)
  console.log('='.repeat(60))

  try {
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 1. 检查 approved 状态但缺失奖励流水的记录
    // 幂等键格式：consumption_reward:approve:{record_id}
    const [missing_rewards] = await sequelize.query(
      `
      SELECT
        cr.record_id,
        cr.user_id,
        cr.consumption_amount,
        cr.points_to_award,
        cr.status,
        cr.idempotency_key as consumption_idempotency_key,
        cr.created_at,
        cr.updated_at
      FROM consumption_records cr
      LEFT JOIN asset_transactions atx
        ON atx.idempotency_key = CONCAT('consumption_reward:approve:', cr.record_id)
        AND atx.business_type = 'consumption_reward'
      WHERE cr.status = 'approved'
        AND cr.created_at >= ?
        AND atx.transaction_id IS NULL
      LIMIT 50
    `,
      { replacements: [CUTOFF_DATE] }
    )

    // 2. 检查奖励金额不一致的记录
    const [amount_mismatch] = await sequelize.query(
      `
      SELECT
        cr.record_id,
        cr.user_id,
        cr.points_to_award as expected_points,
        atx.delta_amount as actual_points,
        (cr.points_to_award - atx.delta_amount) as diff
      FROM consumption_records cr
      INNER JOIN asset_transactions atx
        ON atx.idempotency_key = CONCAT('consumption_reward:approve:', cr.record_id)
        AND atx.business_type = 'consumption_reward'
      WHERE cr.status = 'approved'
        AND cr.created_at >= ?
        AND cr.points_to_award != atx.delta_amount
      LIMIT 50
    `,
      { replacements: [CUTOFF_DATE] }
    )

    // 3. 检查孤立的奖励流水（有流水但无对应消费记录）
    // 排除测试数据：idempotency_key 包含 test_ 的流水是测试产生的，不参与对账
    const [orphan_rewards] = await sequelize.query(
      `
      SELECT
        atx.transaction_id,
        atx.idempotency_key,
        atx.delta_amount,
        atx.created_at
      FROM asset_transactions atx
      LEFT JOIN consumption_records cr
        ON atx.idempotency_key = CONCAT('consumption_reward:approve:', cr.record_id)
      WHERE atx.business_type = 'consumption_reward'
        AND atx.created_at >= ?
        AND cr.record_id IS NULL
        AND atx.idempotency_key NOT LIKE '%test_%'
      LIMIT 20
    `,
      { replacements: [CUTOFF_DATE] }
    )

    // 4. 汇总统计
    const [stats] = await sequelize.query(
      `
      SELECT
        COUNT(*) as total_consumption,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_count,
        SUM(CASE WHEN status = 'approved' THEN points_to_award ELSE 0 END) as total_points_awarded
      FROM consumption_records
      WHERE created_at >= ?
    `,
      { replacements: [CUTOFF_DATE] }
    )

    console.log('\n📊 对账统计:')
    console.log(`   - 分界线后消费记录总数: ${stats[0].total_consumption}`)
    console.log(`   - approved: ${stats[0].approved_count}`)
    console.log(`   - pending: ${stats[0].pending_count}`)
    console.log(`   - rejected: ${stats[0].rejected_count}`)
    console.log(`   - 应发放积分总额: ${stats[0].total_points_awarded}`)

    // 5. 处理结果
    const has_errors =
      missing_rewards.length > 0 || amount_mismatch.length > 0 || orphan_rewards.length > 0

    if (has_errors) {
      console.log('\n❌ 发现数据不一致:')

      if (missing_rewards.length > 0) {
        console.log(`\n   缺失奖励流水的 approved 记录 (${missing_rewards.length}条):`)
        missing_rewards.slice(0, 10).forEach(r => {
          console.log(
            `   - record_id: ${r.record_id}, user_id: ${r.user_id}, points_to_award: ${r.points_to_award}`
          )
        })
        if (missing_rewards.length > 10) {
          console.log(`   ... 还有 ${missing_rewards.length - 10} 条`)
        }
      }

      if (amount_mismatch.length > 0) {
        console.log(`\n   奖励金额不一致 (${amount_mismatch.length}条):`)
        amount_mismatch.slice(0, 10).forEach(r => {
          console.log(
            `   - record_id: ${r.record_id}, 期望: ${r.expected_points}, 实际: ${r.actual_points}, 差异: ${r.diff}`
          )
        })
      }

      if (orphan_rewards.length > 0) {
        console.log(`\n   孤立的奖励流水 (${orphan_rewards.length}条):`)
        orphan_rewards.slice(0, 10).forEach(r => {
          console.log(`   - transaction_id: ${r.transaction_id}, delta_amount: ${r.delta_amount}`)
        })
      }

      // 告警 + 阻断发布 + 冻结入口
      await send_alert('CONSUMPTION_REWARD_MISSING', {
        severity: 'CRITICAL',
        missing_rewards_count: missing_rewards.length,
        amount_mismatch_count: amount_mismatch.length,
        orphan_rewards_count: orphan_rewards.length,
        sample_missing: missing_rewards.slice(0, 5),
        idempotency_key_format: 'consumption_reward:approve:{record_id}',
        message: `审核通过的消费记录缺少奖励流水（${missing_rewards.length}条）`
      })

      await freeze_entry_on_inconsistency('consumption_audit', missing_rewards)

      console.log('\n' + '='.repeat(60))
      console.log('❌ 对账失败 - 请人工介入修复')
      console.log('='.repeat(60))

      return {
        status: 'FAILED',
        missing_rewards,
        amount_mismatch,
        orphan_rewards,
        stats: stats[0]
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ 对账通过 - 消费奖励数据一致')
    console.log('='.repeat(60))

    return {
      status: 'PASSED',
      message: '消费奖励数据一致',
      stats: stats[0]
    }
  } catch (error) {
    console.error('\n❌ 对账脚本执行失败:', error.message)
    console.error(error.stack)

    await send_alert('CONSUMPTION_RECONCILIATION_SCRIPT_ERROR', {
      severity: 'WARNING',
      error: error.message,
      message: '消费奖励对账脚本执行失败'
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
  check_consumption_consistency()
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

module.exports = { check_consumption_consistency }
