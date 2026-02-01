/**
 * 抽奖扣款一致性对账脚本
 *
 * 治理决策（2026-01-05 拍板）：
 * - 按 lottery_session_id 聚合检查
 * - 验证：多条 lottery_draws 的 cost_points 总和 = 对应 asset_transaction 的 |delta_amount|
 * - 发现差异立即：告警 + 阻断发布 + 自动冻结入口
 *
 * 使用方式：
 * - 手动执行：node scripts/reconciliation/check_lottery_consistency.js
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
 * 发送告警通知
 * 通过 LotteryAlertService 创建告警（内部自动触发 WebSocket 推送）
 *
 * @param {string} alert_type - 告警类型
 * @param {Object} data - 告警数据
 */
async function send_alert(alert_type, data) {
  console.error(`\n🚨 [${alert_type}] 告警触发:`)
  console.error(JSON.stringify(data, null, 2))

  // 通过 LotteryAlertService 创建告警（内部自动推送到管理后台）
  try {
    const LotteryAlertService = require('../../services/LotteryAlertService')

    // 创建告警记录并推送
    const alert = await LotteryAlertService.createAlert({
      lottery_campaign_id: data.lottery_campaign_id || null,
      alert_type: 'system', // 对账脚本触发的是系统告警
      severity: 'danger',
      rule_code: `RECONCILIATION_${alert_type.toUpperCase()}`,
      message: `对账脚本检测到异常: ${alert_type} - ${data.message || JSON.stringify(data)}`
    })

    console.log(`✅ 告警已推送至管理后台 (alert_id: ${alert.alert_id})`)
  } catch (wsError) {
    console.warn('⚠️ WebSocket推送失败（非致命）:', wsError.message)
  }

  // 记录告警日志（文件备份）
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
 * 冻结入口
 * 通过 SystemConfigService 更新系统配置，禁用指定入口
 *
 * @param {string} entry_type - 入口类型
 * @param {Array} inconsistent_data - 不一致数据
 */
async function freeze_entry_on_inconsistency(entry_type, inconsistent_data) {
  console.log(`\n🔒 冻结入口: ${entry_type}`)

  // 通过 SystemConfigService 更新系统配置
  try {
    const SystemConfigService = require('../../services/SystemConfigService')

    // 根据入口类型确定配置键名
    const configKeyMap = {
      lottery: 'lottery_entrance_enabled',
      redeem: 'redeem_entrance_enabled',
      marketplace: 'marketplace_entrance_enabled'
    }
    const configKey = configKeyMap[entry_type] || `${entry_type}_enabled`

    await SystemConfigService.updateConfig(configKey, 'false', {
      operator_id: 0, // 系统自动操作
      reason: `对账脚本检测到 ${entry_type} 数据不一致，自动冻结入口`
    })

    console.log(`✅ 入口已冻结: ${configKey} = false`)
  } catch (configError) {
    console.error(`❌ 冻结入口失败: ${configError.message}`)
    // 配置更新失败时，尝试通过Redis标记
    try {
      const { getRedisClient } = require('../../utils/UnifiedRedisClient')
      const redisClient = await getRedisClient()
      await redisClient.set(`freeze:${entry_type}`, 'true', 'EX', 3600) // 1小时过期
      console.log(`✅ 已通过Redis标记冻结入口: freeze:${entry_type}`)
    } catch (redisError) {
      console.error(`❌ Redis标记失败: ${redisError.message}`)
    }
  }

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
 * 检查抽奖扣款一致性
 *
 * 验证规则：
 * 1. 每个 lottery_session_id 对应一条 asset_transaction
 * 2. SUM(lottery_draws.cost_points) = |asset_transaction.delta_amount|
 * 3. 只检查分界线后的数据
 *
 * @returns {Promise<Object>} 检查结果
 */
async function check_lottery_consistency() {
  console.log('='.repeat(60))
  console.log('抽奖扣款一致性对账脚本')
  console.log(`分界线: ${CUTOFF_DATE}`)
  console.log(`执行时间: ${new Date().toISOString()}`)
  console.log('='.repeat(60))

  try {
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 1. 检查是否有 lottery_session_id 为 NULL 的记录（分界线后）
    const [null_session_records] = await sequelize.query(
      `
      SELECT lottery_draw_id, user_id, cost_points, created_at
      FROM lottery_draws
      WHERE created_at >= ?
        AND (lottery_session_id IS NULL OR lottery_session_id = '')
      LIMIT 20
    `,
      { replacements: [CUTOFF_DATE] }
    )

    if (null_session_records.length > 0) {
      console.log(`\n⚠️ 发现 ${null_session_records.length} 条缺失 lottery_session_id 的记录:`)
      null_session_records.forEach(r => {
        console.log(
          `   - lottery_draw_id: ${r.lottery_draw_id}, user_id: ${r.user_id}, cost_points: ${r.cost_points}`
        )
      })

      await send_alert('LOTTERY_MISSING_SESSION_ID', {
        severity: 'WARNING',
        count: null_session_records.length,
        records: null_session_records.slice(0, 5),
        message: '抽奖记录缺失 lottery_session_id'
      })
    }

    // 2. 按 lottery_session_id 聚合检查金额一致性
    const [inconsistent] = await sequelize.query(
      `
      SELECT
        ld.lottery_session_id,
        COUNT(*) as draw_count,
        SUM(ld.cost_points) as total_cost_in_draws,
        atx.transaction_id,
        atx.delta_amount as transaction_delta,
        -atx.delta_amount as transaction_amount,
        (SUM(ld.cost_points) + atx.delta_amount) as diff
      FROM lottery_draws ld
      LEFT JOIN asset_transactions atx
        ON atx.lottery_session_id = ld.lottery_session_id
        AND atx.business_type = 'lottery_consume'
      WHERE ld.created_at >= ?
        AND ld.lottery_session_id IS NOT NULL
        AND ld.lottery_session_id != ''
      GROUP BY ld.lottery_session_id, atx.transaction_id, atx.delta_amount
      HAVING diff != 0 OR atx.transaction_id IS NULL
    `,
      { replacements: [CUTOFF_DATE] }
    )

    // 3. 检查孤立的流水（有流水但无对应 lottery_draws）
    // 排除测试数据：lottery_session_id 包含 test_ 的流水是测试产生的，不参与对账
    const [orphan_transactions] = await sequelize.query(
      `
      SELECT
        atx.transaction_id,
        atx.lottery_session_id,
        atx.delta_amount,
        atx.created_at
      FROM asset_transactions atx
      LEFT JOIN lottery_draws ld ON ld.lottery_session_id = atx.lottery_session_id
      WHERE atx.business_type = 'lottery_consume'
        AND atx.created_at >= ?
        AND ld.lottery_draw_id IS NULL
        AND atx.lottery_session_id NOT LIKE '%test_%'
        AND atx.idempotency_key NOT LIKE '%test_%'
      LIMIT 20
    `,
      { replacements: [CUTOFF_DATE] }
    )

    // 4. 汇总统计
    const [stats] = await sequelize.query(
      `
      SELECT
        COUNT(DISTINCT ld.lottery_session_id) as session_count,
        COUNT(*) as draw_count,
        SUM(ld.cost_points) as total_cost
      FROM lottery_draws ld
      WHERE ld.created_at >= ?
        AND ld.lottery_session_id IS NOT NULL
    `,
      { replacements: [CUTOFF_DATE] }
    )

    console.log('\n📊 对账统计:')
    console.log(`   - 分界线后抽奖会话数: ${stats[0].session_count}`)
    console.log(`   - 分界线后抽奖次数: ${stats[0].draw_count}`)
    console.log(`   - 分界线后总扣款: ${stats[0].total_cost}`)

    // 5. 处理结果
    const has_errors = inconsistent.length > 0 || orphan_transactions.length > 0

    if (has_errors) {
      console.log('\n❌ 发现数据不一致:')

      if (inconsistent.length > 0) {
        console.log(`\n   金额不一致的会话 (${inconsistent.length}条):`)
        inconsistent.forEach(r => {
          console.log(`   - session_id: ${r.lottery_session_id}`)
          console.log(
            `     draws合计: ${r.total_cost_in_draws}, 流水金额: ${r.transaction_amount || 'NULL'}, 差异: ${r.diff || 'N/A'}`
          )
        })
      }

      if (orphan_transactions.length > 0) {
        console.log(`\n   孤立的流水 (${orphan_transactions.length}条):`)
        orphan_transactions.forEach(r => {
          console.log(
            `   - transaction_id: ${r.transaction_id}, session_id: ${r.lottery_session_id}`
          )
        })
      }

      // 告警 + 阻断发布 + 冻结入口
      await send_alert('LOTTERY_CONSISTENCY_ERROR', {
        severity: 'CRITICAL',
        inconsistent_sessions: inconsistent,
        orphan_transactions: orphan_transactions,
        message: '抽奖扣款数据不一致，可能存在事务边界问题'
      })

      await freeze_entry_on_inconsistency('lottery', [...inconsistent, ...orphan_transactions])

      console.log('\n' + '='.repeat(60))
      console.log('❌ 对账失败 - 请人工介入修复')
      console.log('='.repeat(60))

      return {
        status: 'FAILED',
        inconsistent,
        orphan_transactions,
        stats: stats[0]
      }
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ 对账通过 - 抽奖扣款数据一致')
    console.log('='.repeat(60))

    return {
      status: 'PASSED',
      message: '抽奖扣款数据一致',
      stats: stats[0]
    }
  } catch (error) {
    console.error('\n❌ 对账脚本执行失败:', error.message)
    console.error(error.stack)

    await send_alert('LOTTERY_RECONCILIATION_SCRIPT_ERROR', {
      severity: 'WARNING',
      error: error.message,
      message: '抽奖对账脚本执行失败'
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
  check_lottery_consistency()
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

module.exports = { check_lottery_consistency }
