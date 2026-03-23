#!/usr/bin/env node
/**
 * 统一对账脚本 — 同时覆盖物品守恒和资产守恒
 *
 * 物品对账：
 * 1. 物品守恒：SUM(delta) GROUP BY item_id 全部为 0
 * 2. 持有者一致：ledger 推导持有者 == items.owner_account_id
 * 3. 铸造数量一致：items 总数 == mint(delta=+1) 条数
 *
 * 资产对账：
 * 1. 全局守恒：SUM(delta_amount) GROUP BY asset_code（双录后应为 0）
 * 2. 账户余额一致：SUM(delta_amount) == available_amount + frozen_amount
 *
 * 使用方式：
 * - 手动执行：node scripts/reconcile-items.js
 * - 定时执行：配置 cron 每小时运行
 *
 * @version 1.0.0
 * @date 2026-02-22
 */

'use strict'

require('dotenv').config()

/**
 * 执行统一对账（可被定时任务调用，也可独立运行）
 *
 * @param {Object} [options] - 选项
 * @param {boolean} [options.standalone=false] - 是否独立运行模式（standalone 模式会关闭连接并 exit）
 * @returns {Promise<Object>} 对账结果
 */
async function executeReconciliation(options = {}) {
  const { sequelize } = require('../config/database')
  const logger = require('../utils/logger')

  console.log(`\n=== 统一对账 [${new Date().toISOString()}] ===\n`)

  const results = { items: {}, assets: {} }

  // ========== 物品对账 ==========
  console.log('📊 物品对账...')

  // 1. 物品守恒
  const [imbalanced] = await sequelize.query(`
    SELECT item_id, SUM(delta) AS balance
    FROM item_ledger
    GROUP BY item_id
    HAVING balance != 0
  `)
  results.items.conservation = {
    status: imbalanced.length === 0 ? 'PASS' : 'FAIL',
    imbalanced_count: imbalanced.length
  }
  console.log(`  物品守恒：${results.items.conservation.status}（${imbalanced.length} 个不平衡）`)

  // 2. 持有者一致性
  const [ownerMismatch] = await sequelize.query(`
    SELECT l.item_id, l.account_id AS ledger_owner, i.owner_account_id AS cache_owner
    FROM (
      SELECT item_id, account_id
      FROM item_ledger
      GROUP BY item_id, account_id
      HAVING SUM(delta) = 1
    ) l
    JOIN items i ON l.item_id = i.item_id
    WHERE l.account_id != i.owner_account_id
  `)
  results.items.owner_consistency = {
    status: ownerMismatch.length === 0 ? 'PASS' : 'FAIL',
    mismatch_count: ownerMismatch.length
  }
  console.log(`  持有者一致：${results.items.owner_consistency.status}（${ownerMismatch.length} 个不一致）`)

  // 3. 铸造数量
  const [[{ cnt: itemCount }]] = await sequelize.query('SELECT COUNT(*) AS cnt FROM items')
  const [[{ cnt: mintCount }]] = await sequelize.query(
    "SELECT COUNT(*) AS cnt FROM item_ledger WHERE event_type = 'mint' AND delta = 1"
  )
  results.items.mint_consistency = {
    status: Number(itemCount) === Number(mintCount) ? 'PASS' : 'FAIL',
    items: Number(itemCount),
    mints: Number(mintCount)
  }
  console.log(`  铸造一致：${results.items.mint_consistency.status}（items=${itemCount}, mints=${mintCount}）`)

  // ========== 资产对账 ==========
  console.log('\n📊 资产对账...')

  // 1. 全局守恒（仅检查 delta_amount）
  // delta_amount 追踪账户间资产流动，双录后全局 SUM 应为 0
  // frozen_amount_change 是账户内部状态转换（available↔frozen），不参与全局守恒
  const [globalCheck] = await sequelize.query(`
    SELECT asset_code,
      SUM(delta_amount) AS total_delta,
      COUNT(*) AS tx_count
    FROM asset_transactions
    WHERE (is_invalid IS NULL OR is_invalid = 0)
    GROUP BY asset_code
  `)
  results.assets.global = globalCheck.map(r => ({
    asset_code: r.asset_code,
    total_net: Number(r.total_delta),
    tx_count: Number(r.tx_count)
  }))
  console.log('  全局守恒（SUM(delta_amount) = 0）：')
  for (const r of results.assets.global) {
    const flag = r.total_net === 0 ? '✅' : '⚠️'
    console.log(`    ${flag} ${r.asset_code}: SUM=${r.total_net}（${r.tx_count} 条流水）`)
  }

  // 2. 账户余额一致性（分维度对比）
  // available_amount = SUM(delta_amount)
  // frozen_amount = SUM(frozen_amount_change)
  // 排除系统账户（system 账户的 balance 不参与流水推导）
  const [balanceMismatch] = await sequelize.query(`
    SELECT 
      b.account_id, b.asset_code,
      CAST(b.available_amount AS SIGNED) AS available_recorded,
      CAST(COALESCE(t.sum_delta, 0) AS SIGNED) AS available_calculated,
      CAST(b.frozen_amount AS SIGNED) AS frozen_recorded,
      CAST(COALESCE(t.sum_frozen, 0) AS SIGNED) AS frozen_calculated,
      CAST(b.available_amount - COALESCE(t.sum_delta, 0) AS SIGNED) AS available_diff,
      CAST(b.frozen_amount - COALESCE(t.sum_frozen, 0) AS SIGNED) AS frozen_diff
    FROM account_asset_balances b
    INNER JOIN accounts a ON b.account_id = a.account_id AND a.account_type = 'user'
    LEFT JOIN (
      SELECT account_id, asset_code,
        SUM(delta_amount) AS sum_delta,
        SUM(COALESCE(frozen_amount_change, 0)) AS sum_frozen
      FROM asset_transactions
      WHERE (is_invalid IS NULL OR is_invalid = 0)
      GROUP BY account_id, asset_code
    ) t ON b.account_id = t.account_id AND b.asset_code = t.asset_code
    WHERE CAST(b.available_amount - COALESCE(t.sum_delta, 0) AS SIGNED) != 0
       OR CAST(b.frozen_amount - COALESCE(t.sum_frozen, 0) AS SIGNED) != 0
    LIMIT 20
  `)
  results.assets.balance_consistency = {
    status: balanceMismatch.length === 0 ? 'PASS' : 'FAIL',
    mismatch_count: balanceMismatch.length
  }
  console.log(`  余额一致：${results.assets.balance_consistency.status}（${balanceMismatch.length} 个不一致）`)

  // 3. 全局守恒判定
  const globalPass = results.assets.global.every(r => r.total_net === 0)
  results.assets.global_conservation = {
    status: globalPass ? 'PASS' : 'FAIL'
  }

  // ========== 自动修复（可选） ==========
  if (options.autoFix && !globalPass) {
    console.log('\n🔧 自动修复全局守恒残差...')
    results.assets.auto_fix = await autoFixGlobalResiduals(sequelize, results.assets.global)
  }

  if (options.autoFix && results.assets.balance_consistency.status === 'FAIL') {
    console.log('\n🔧 自动修复账户余额不一致...')
    results.assets.balance_fix = await autoFixBalanceMismatches(sequelize)
  }

  // ========== 总结 ==========
  const allPass = results.items.conservation.status === 'PASS' &&
    results.items.owner_consistency.status === 'PASS' &&
    results.items.mint_consistency.status === 'PASS' &&
    results.assets.balance_consistency.status === 'PASS' &&
    globalPass

  console.log(`\n=== 对账结论：${allPass ? '✅ 全部通过' : '❌ 存在异常'} ===\n`)

  if (!allPass) {
    logger.error('对账发现异常', { results })
  } else {
    logger.info('对账全部通过', { results })
  }

  if (options.standalone) {
    await sequelize.close()
    process.exit(allPass ? 0 : 1)
  }

  return { allPass, results }
}

/**
 * 自动修复全局守恒残差
 *
 * 在 SYSTEM_RESERVE (account_id=12) 上创建 system_reconciliation 记录
 * 使 SUM(delta_amount + frozen_amount_change) = 0 per asset_code
 *
 * @param {Object} sequelize - Sequelize 实例
 * @param {Array} globalResults - 全局守恒检查结果
 * @returns {Promise<Object>} 修复结果
 */
async function autoFixGlobalResiduals(sequelize, globalResults) {
  const OrderNoGenerator = require('../utils/OrderNoGenerator')
  const residuals = globalResults.filter(r => r.total_net !== 0)
  if (residuals.length === 0) return { fixed: 0 }

  const transaction = await sequelize.transaction()
  let fixed = 0

  try {
    for (const r of residuals) {
      const key = `system_reconciliation:hourly:${r.asset_code}:${new Date().toISOString().slice(0, 13)}`

      const [[exists]] = await sequelize.query(
        'SELECT COUNT(*) as cnt FROM asset_transactions WHERE idempotency_key = :key',
        { replacements: { key }, transaction }
      )
      if (Number(exists.cnt) > 0) {
        console.log(`  ⏭️  ${r.asset_code}: 本小时已修复，跳过`)
        continue
      }

      const meta = JSON.stringify({
        type: 'hourly_conservation_adjustment',
        residual: r.total_net,
        tx_count: r.tx_count,
        timestamp: new Date().toISOString()
      })

      const txNo = OrderNoGenerator.generate('TX', Date.now() % 1000000)

      await sequelize.query(`
        INSERT INTO asset_transactions 
          (account_id, asset_code, delta_amount, 
           balance_before, balance_after, business_type, idempotency_key, transaction_no, meta, created_at)
        VALUES (12, :asset_code, :adjustment, 0, 0, 'system_reconciliation', :key, :txNo, :meta, NOW())
      `, {
        replacements: {
          asset_code: r.asset_code,
          adjustment: -r.total_net,
          key,
          txNo,
          meta
        },
        transaction
      })

      fixed++
      console.log(`  ✅ ${r.asset_code}: 残差 ${r.total_net > 0 ? '+' : ''}${r.total_net} → 调整 ${-r.total_net}`)
    }

    await transaction.commit()
    console.log(`  🔧 修复完成：${fixed}/${residuals.length} 个资产`)
    return { fixed, total: residuals.length }
  } catch (error) {
    await transaction.rollback()
    console.error('  ❌ 自动修复失败:', error.message)
    return { fixed: 0, error: error.message }
  }
}

/**
 * 自动修复账户余额不一致
 *
 * 创建 data_migration 调整记录（主记录 + SYSTEM_RESERVE 对手方）
 * 使 (available + frozen) = SUM(delta + frozen_change) per account
 *
 * @param {Object} sequelize - Sequelize 实例
 * @returns {Promise<Object>} 修复结果
 */
async function autoFixBalanceMismatches(sequelize) {
  const OrderNoGenerator = require('../utils/OrderNoGenerator')
  const [mismatches] = await sequelize.query(`
    SELECT 
      b.account_id, b.asset_code,
      CAST(b.available_amount + b.frozen_amount AS SIGNED) AS current_balance,
      CAST(COALESCE(t.net, 0) AS SIGNED) AS calculated,
      CAST((b.available_amount + b.frozen_amount) - COALESCE(t.net, 0) AS SIGNED) AS diff
    FROM account_asset_balances b
    LEFT JOIN (
      SELECT account_id, asset_code,
        SUM(delta_amount + COALESCE(frozen_amount_change, 0)) AS net
      FROM asset_transactions
      WHERE (is_invalid IS NULL OR is_invalid = 0)
      GROUP BY account_id, asset_code
    ) t ON b.account_id = t.account_id AND b.asset_code = t.asset_code
    WHERE CAST(b.available_amount + b.frozen_amount AS SIGNED) - CAST(COALESCE(t.net, 0) AS SIGNED) != 0
    LIMIT 50
  `)

  if (mismatches.length === 0) return { fixed: 0 }

  const transaction = await sequelize.transaction()
  let fixed = 0

  try {
    for (const m of mismatches) {
      const diff = Number(m.diff)
      const key = `data_migration:hourly:${m.account_id}:${m.asset_code}:${new Date().toISOString().slice(0, 13)}`

      const [[exists]] = await sequelize.query(
        'SELECT COUNT(*) as cnt FROM asset_transactions WHERE idempotency_key = :key',
        { replacements: { key }, transaction }
      )
      if (Number(exists.cnt) > 0) continue

      const txNo1 = OrderNoGenerator.generate('TX', Date.now() % 1000000)
      const txNo2 = OrderNoGenerator.generate('TX', (Date.now() + 1) % 1000000)

      await sequelize.query(`
        INSERT INTO asset_transactions 
          (account_id, counterpart_account_id, asset_code, delta_amount, 
           balance_before, balance_after, business_type, idempotency_key, transaction_no, meta, created_at)
        VALUES (:account_id, 12, :asset_code, :diff, :calculated, :current_balance, 
           'data_migration', :key, :txNo, :meta, NOW())
      `, {
        replacements: {
          account_id: m.account_id,
          asset_code: m.asset_code,
          diff,
          calculated: Number(m.calculated),
          current_balance: Number(m.current_balance),
          key,
          txNo: txNo1,
          meta: JSON.stringify({
            type: 'balance_reconciliation_hourly',
            balance: Number(m.current_balance),
            tx_net: Number(m.calculated),
            diff,
            timestamp: new Date().toISOString()
          })
        },
        transaction
      })

      await sequelize.query(`
        INSERT INTO asset_transactions 
          (account_id, counterpart_account_id, asset_code, delta_amount, 
           balance_before, balance_after, business_type, idempotency_key, transaction_no, meta, created_at)
        VALUES (12, :account_id, :asset_code, :neg_diff, 0, 0, 
           'data_migration_counterpart', :ckey, :txNo, :meta, NOW())
      `, {
        replacements: {
          account_id: m.account_id,
          asset_code: m.asset_code,
          neg_diff: -diff,
          ckey: `${key}:counterpart`,
          txNo: txNo2,
          meta: JSON.stringify({ counterpart_of: key })
        },
        transaction
      })

      fixed++
    }

    await transaction.commit()
    console.log(`  🔧 余额修复完成：${fixed}/${mismatches.length} 个账户`)
    return { fixed, total: mismatches.length }
  } catch (error) {
    await transaction.rollback()
    console.error('  ❌ 余额修复失败:', error.message)
    return { fixed: 0, error: error.message }
  }
}

/**
 * 业务记录关联对账（原 DailyAssetReconciliation.executeBusinessRecordReconciliation）
 *
 * 检查业务记录与 asset_transactions 的关联完整性：
 * 1. lottery_draws.asset_transaction_id 是否有效
 * 2. consumption_records.reward_transaction_id 是否有效（已审核通过的）
 * 3. exchange_records.debit_transaction_id 是否有效
 *
 * @param {Date} [cutoffDate] - 分界线时间（只检查该时间之后的记录）
 * @returns {Promise<Object>} 业务关联对账报告
 */
async function executeBusinessRecordReconciliation(cutoffDate = null) {
  const { LotteryDraw, ConsumptionRecord, ExchangeRecord, AssetTransaction, Op } = require('../models')
  const logger = require('../utils/logger').logger
  const NotificationService = require('../services/NotificationService')

  const start_time = Date.now()
  const effectiveCutoff = cutoffDate || new Date('2026-01-02T20:24:20.000Z')

  logger.info('开始业务记录关联对账', { cutoff_date: effectiveCutoff.toISOString() })

  try {
    const reconcileTable = async (Model, idField, txIdField, extraWhere = {}) => {
      const records = await (Model.unscoped ? Model.unscoped() : Model).findAll({
        where: { created_at: { [Op.gte]: effectiveCutoff }, ...extraWhere },
        attributes: [idField, 'user_id', txIdField, 'created_at']
      })

      const missing_transaction_ids = []
      const orphan_transaction_ids = []

      for (const record of records) {
        if (!record[txIdField]) {
          missing_transaction_ids.push({ [idField]: record[idField], user_id: record.user_id, created_at: record.created_at })
        } else {
          // eslint-disable-next-line no-await-in-loop
          const tx = await AssetTransaction.findByPk(record[txIdField])
          if (!tx) {
            orphan_transaction_ids.push({ [idField]: record[idField], [txIdField]: record[txIdField], user_id: record.user_id, created_at: record.created_at })
          }
        }
      }

      return { total_checked: records.length, missing_transaction_ids, orphan_transaction_ids }
    }

    const results = {
      timestamp: new Date().toISOString(),
      cutoff_date: effectiveCutoff.toISOString(),
      lottery_draws: await reconcileTable(LotteryDraw, 'lottery_draw_id', 'asset_transaction_id'),
      consumption_records: await reconcileTable(ConsumptionRecord, 'consumption_record_id', 'reward_transaction_id', { status: 'approved', is_deleted: 0 }),
      exchange_records: await reconcileTable(ExchangeRecord, 'exchange_record_id', 'debit_transaction_id')
    }

    results.duration_ms = Date.now() - start_time
    results.total_issues =
      results.lottery_draws.missing_transaction_ids.length +
      results.lottery_draws.orphan_transaction_ids.length +
      results.consumption_records.missing_transaction_ids.length +
      results.consumption_records.orphan_transaction_ids.length +
      results.exchange_records.missing_transaction_ids.length +
      results.exchange_records.orphan_transaction_ids.length
    results.status = results.total_issues === 0 ? 'OK' : 'WARNING'

    if (results.total_issues > 0) {
      try {
        await NotificationService.sendToAdmins({
          type: 'business_record_reconciliation_alert',
          title: '业务记录关联对账告警',
          content: `发现${results.total_issues}个业务记录关联问题，请及时检查处理`,
          data: { total_issues: results.total_issues, cutoff_date: results.cutoff_date, timestamp: results.timestamp }
        })
      } catch (notifyError) {
        logger.error('发送业务记录关联对账告警失败', { error: notifyError.message })
      }
    }

    logger.info('业务记录关联对账完成', { total_issues: results.total_issues, duration_ms: results.duration_ms })
    return results
  } catch (error) {
    logger.error('业务记录关联对账失败', { error_message: error.message })
    throw error
  }
}

module.exports = { executeReconciliation, executeBusinessRecordReconciliation }

// 独立运行模式
if (require.main === module) {
  const autoFix = process.argv.includes('--auto-fix')
  executeReconciliation({ standalone: true, autoFix }).catch(err => {
    console.error('对账脚本执行失败:', err)
    process.exit(1)
  })
}
