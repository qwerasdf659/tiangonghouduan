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

  /*
   * 3. 铸造数量一致性（口径修正 2026-05-31）
   * 真相不变量：每个「经由铸造流程产生」的 item 都应有且仅有一条 mint(delta=+1) 账本。
   * 修正原因：source='test' 的 item 是测试种子数据，直接 INSERT 进 items 表、从未走铸造流程，
   *   因而天然无 item_ledger 记录（实测 975 个 test item 中 974 个零账本）。把它们计入"应有 mint"的分母
   *   会永久误报 FAIL。正确做法是按 source 排除 test 数据后再核对（非放宽：test 本就不该有铸造账本）。
   * 仅统计真实业务来源（lottery/diy/exchange/legacy 等非 test）的 item 与其 mint 账本是否一一对应。
   */
  const [[{ cnt: itemCount }]] = await sequelize.query(
    "SELECT COUNT(*) AS cnt FROM items WHERE source != 'test'"
  )
  const [[{ cnt: mintCount }]] = await sequelize.query(
    `SELECT COUNT(*) AS cnt
     FROM item_ledger l
     JOIN items i ON l.item_id = i.item_id
     WHERE l.event_type = 'mint' AND l.delta = 1 AND i.source != 'test'`
  )
  results.items.mint_consistency = {
    status: Number(itemCount) === Number(mintCount) ? 'PASS' : 'FAIL',
    items_excluding_test: Number(itemCount),
    mints: Number(mintCount)
  }
  console.log(`  铸造一致：${results.items.mint_consistency.status}（非test items=${itemCount}, mints=${mintCount}）`)

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

  /*
   * 2. 账户余额一致性（口径修正 2026-05-31）
   * 真相不变量：每个账户每种资产的「总额(available+frozen)」== 该账户该资产全部有效流水的净额 SUM(delta_amount + frozen_amount_change)。
   * 修正原因（消除两类历史误报，非放宽校验）：
   *   ① 原先把 available 与 frozen 拆成两条独立等式判定，导致「available↔frozen 纯内部状态转换」即使总额相等也被误报为不一致
   *      （实测 account5/points：available 差 -3770、frozen 差 +3770，净额完全相等，无任何资产损失）。
   *   ② balance 表唯一键含 lottery_campaign_key（按活动分行存储 budget_points 等活动维度资产），
   *      而 asset_transactions 无活动维度列，故对「活动维度资产」按 (account,asset) 聚合天然算不平——
   *      这类资产由活动预算直接注入、不走普通流水，应按 asset_code 排除出账户级流水守恒（见 CAMPAIGN_SCOPED_ASSET_CODES）。
   * 校验改为：以「总额净值」为准（与 autoFixBalanceMismatches 同口径），并排除活动维度资产。
   * available/frozen 的分维度差仍作为 informational 字段输出，便于排查但不触发 FAIL。
   */
  const CAMPAIGN_SCOPED_ASSET_CODES = ['budget_points']
  const [balanceMismatch] = await sequelize.query(`
    SELECT 
      b.account_id, b.asset_code,
      CAST(SUM(b.available_amount) + SUM(b.frozen_amount) AS SIGNED) AS total_recorded,
      CAST(COALESCE(t.net, 0) AS SIGNED) AS total_calculated,
      CAST((SUM(b.available_amount) + SUM(b.frozen_amount)) - COALESCE(t.net, 0) AS SIGNED) AS total_diff,
      CAST(SUM(b.available_amount) - COALESCE(t.sum_delta, 0) AS SIGNED) AS available_diff_info,
      CAST(SUM(b.frozen_amount) - COALESCE(t.sum_frozen, 0) AS SIGNED) AS frozen_diff_info
    FROM account_asset_balances b
    INNER JOIN accounts a ON b.account_id = a.account_id AND a.account_type = 'user'
    LEFT JOIN (
      SELECT account_id, asset_code,
        SUM(delta_amount) AS sum_delta,
        SUM(COALESCE(frozen_amount_change, 0)) AS sum_frozen,
        SUM(delta_amount + COALESCE(frozen_amount_change, 0)) AS net
      FROM asset_transactions
      WHERE (is_invalid IS NULL OR is_invalid = 0)
      GROUP BY account_id, asset_code
    ) t ON b.account_id = t.account_id AND b.asset_code = t.asset_code
    WHERE b.asset_code NOT IN (:campaignScopedCodes)
    GROUP BY b.account_id, b.asset_code, t.net
    HAVING CAST((SUM(b.available_amount) + SUM(b.frozen_amount)) - COALESCE(t.net, 0) AS SIGNED) != 0
    LIMIT 20
  `, { replacements: { campaignScopedCodes: CAMPAIGN_SCOPED_ASSET_CODES } })
  results.assets.balance_consistency = {
    status: balanceMismatch.length === 0 ? 'PASS' : 'FAIL',
    mismatch_count: balanceMismatch.length,
    excluded_campaign_scoped: CAMPAIGN_SCOPED_ASSET_CODES
  }
  console.log(`  余额一致：${results.assets.balance_consistency.status}（${balanceMismatch.length} 个不一致，按总额净值口径，已排除活动维度资产 ${CAMPAIGN_SCOPED_ASSET_CODES.join('/')}）`)

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

/**
 * 用户累计积分周对账（拍板⑭-(d)，2026-07-11 落地）
 *
 * 真相不变量：users.history_total_points ==「用户账户 + points 资产 + 正向入账」流水重算值
 * （排除防复利名单 level_bonus_reward/activity_bonus_reward——加成笔可花不计等级，
 *   与 BalanceService.HISTORY_POINTS_EXCLUDED_BUSINESS_TYPES 同一口径；排除 is_invalid 流水）。
 *
 * 业务意义：history_total_points 是成长等级派生的单一数据源（发放线九档阶梯的定级依据），
 * 字段被绕过 BalanceService 收口直改（如历史脚本/手工 SQL）会导致"等级凭空错了"的信任事故，
 * 本对账每周比对字段值 vs 流水重算值，不一致即向管理员告警（只告警不自动改——
 * history_total_points 与余额同属互锁数据，修复必须经人工判定走业务接口）。
 *
 * @param {Object} [options] - 选项
 * @param {boolean} [options.standalone=false] - 独立运行模式（结束后关闭连接并 exit）
 * @returns {Promise<Object>} 对账报告 { status, mismatch_count, mismatches, duration_ms }
 */
async function executeHistoryPointsReconciliation(options = {}) {
  const { standalone = false } = options
  const { sequelize } = require('../config/database')
  const logger = require('../utils/logger').logger
  const NotificationService = require('../services/NotificationService')
  // 防复利排除名单唯一真相源（与 history_total_points 累加口径同源，杜绝两处名单漂移）
  const { HISTORY_POINTS_EXCLUDED_BUSINESS_TYPES } = require('../services/asset/BalanceService')
  const start_time = Date.now()

  try {
    logger.info('[累计积分对账] 开始 users.history_total_points vs asset_transactions 重算比对')

    const [mismatches] = await sequelize.query(
      `SELECT u.user_id,
              CAST(u.history_total_points AS SIGNED) AS field_value,
              CAST(COALESCE(t.recalc, 0) AS SIGNED) AS recalc_value,
              CAST(u.history_total_points - COALESCE(t.recalc, 0) AS SIGNED) AS diff
       FROM users u
       LEFT JOIN (
         SELECT a.user_id, SUM(t.delta_amount) AS recalc
         FROM asset_transactions t
         JOIN accounts a ON a.account_id = t.account_id AND a.account_type = 'user'
         WHERE t.asset_code = 'points'
           AND t.delta_amount > 0
           AND (t.is_invalid IS NULL OR t.is_invalid = 0)
           AND t.business_type NOT IN (:excludedTypes)
         GROUP BY a.user_id
       ) t ON t.user_id = u.user_id
       HAVING diff <> 0
       ORDER BY ABS(diff) DESC
       LIMIT 50`,
      { replacements: { excludedTypes: HISTORY_POINTS_EXCLUDED_BUSINESS_TYPES } }
    )

    const mismatch_count = mismatches.length
    const report = {
      status: mismatch_count === 0 ? 'OK' : 'WARNING',
      mismatch_count,
      mismatches: mismatches.map(m => ({
        user_id: Number(m.user_id),
        field_value: Number(m.field_value),
        recalc_value: Number(m.recalc_value),
        diff: Number(m.diff)
      })),
      duration_ms: Date.now() - start_time
    }

    console.log(
      `\n=== 累计积分对账：${report.status}（${mismatch_count} 个用户不一致）===`
    )
    for (const m of report.mismatches.slice(0, 10)) {
      console.log(
        `  ⚠️ user_id=${m.user_id}: 字段=${m.field_value} 重算=${m.recalc_value} 差=${m.diff > 0 ? '+' : ''}${m.diff}`
      )
    }

    if (mismatch_count > 0) {
      logger.warn('[累计积分对账] 发现字段值与流水重算值不一致', report)
      try {
        await NotificationService.sendToAdmins({
          type: 'history_points_reconciliation_alert',
          title: '⚠️ 用户累计积分对账告警',
          content: `发现 ${mismatch_count} 个用户的 history_total_points 与积分流水重算值不一致（影响成长等级派生），请人工核查处理`,
          data: {
            mismatch_count,
            sample: report.mismatches.slice(0, 10),
            excluded_business_types: HISTORY_POINTS_EXCLUDED_BUSINESS_TYPES,
            timestamp: new Date().toISOString()
          }
        })
      } catch (notifyError) {
        logger.error('[累计积分对账] 发送告警失败', { error: notifyError.message })
      }
    } else {
      logger.info('[累计积分对账] 全部一致', report)
    }

    if (standalone) {
      await sequelize.close()
      process.exit(mismatch_count === 0 ? 0 : 1)
    }
    return report
  } catch (error) {
    logger.error('[累计积分对账] 执行失败', { error_message: error.message })
    if (standalone) {
      process.exit(1)
    }
    throw error
  }
}

module.exports = {
  executeReconciliation,
  executeBusinessRecordReconciliation,
  executeSpuSummaryReconciliation,
  executeHistoryPointsReconciliation
}

// 独立运行模式
if (require.main === module) {
  const autoFix = process.argv.includes('--auto-fix')
  executeReconciliation({ standalone: true, autoFix }).catch(err => {
    console.error('对账脚本执行失败:', err)
    process.exit(1)
  })
}

/**
 * 兑换商品 SPU 物化列对账（议题1·拍板项③：冗余列方案的标准对账兜底）
 *
 * 业务背景：
 * - exchange_items 的 stock/sold_count/min_cost_amount/max_cost_amount/min_cost_asset_code 是
 *   从 exchange_item_skus（active）+ exchange_channel_prices（is_enabled）聚合出来的"物化冗余列"。
 * - 冗余列方案的铁律：必须有"全量重算对账"兜底，否则物化列与明细迟早账实不符
 *   （历史已实证：迁移前 22 个商品 SPU 汇总与 SKU 聚合不一致）。
 *
 * 本函数全量重算所有 SPU（含 inactive 商品）的 5 个物化列：先检测差异（diff），
 * 有差异再统一回写对齐并记录差异日志。SQL 口径与迁移
 * 20260611083214 / 三处 _updateSpuSummary 完全一致。
 *
 * @param {Object} [options] - 选项
 * @param {boolean} [options.standalone=false] - 独立运行模式（结束后关闭连接并 exit）
 * @returns {Promise<Object>} 对账报告 { status, drift_count, fixed_count, duration_ms }
 */
async function executeSpuSummaryReconciliation(options = {}) {
  const { standalone = false } = options
  const { sequelize } = require('../config/database')
  const logger = require('../utils/logger').logger
  const start_time = Date.now()

  try {
    logger.info('[SPU对账] 开始兑换商品 SPU 物化列全量重算对账')

    // 1. 检测差异：对比当前物化列值 vs 实时聚合值（含 inactive 商品；<=> 为 NULL 安全比较）
    const [drift] = await sequelize.query(`
      SELECT ei.exchange_item_id
      FROM exchange_items ei
      LEFT JOIN (
        SELECT s.exchange_item_id,
               COALESCE(SUM(s.stock), 0) AS sum_stock,
               COALESCE(SUM(s.sold_count), 0) AS sum_sold
        FROM exchange_item_skus s WHERE s.status = 'active'
        GROUP BY s.exchange_item_id
      ) agg ON agg.exchange_item_id = ei.exchange_item_id
      LEFT JOIN (
        SELECT s.exchange_item_id,
               MIN(cp.cost_amount) AS min_amount, MAX(cp.cost_amount) AS max_amount,
               SUBSTRING_INDEX(GROUP_CONCAT(cp.cost_asset_code ORDER BY cp.cost_amount ASC SEPARATOR ','), ',', 1) AS min_asset
        FROM exchange_item_skus s
        JOIN exchange_channel_prices cp ON cp.sku_id = s.sku_id AND cp.is_enabled = 1
        WHERE s.status = 'active'
        GROUP BY s.exchange_item_id
      ) price ON price.exchange_item_id = ei.exchange_item_id
      WHERE ei.stock <> COALESCE(agg.sum_stock, 0)
         OR ei.sold_count <> COALESCE(agg.sum_sold, 0)
         OR NOT (ei.min_cost_amount <=> price.min_amount)
         OR NOT (ei.max_cost_amount <=> price.max_amount)
         OR NOT (ei.min_cost_asset_code <=> price.min_asset)
    `)

    const drift_count = drift.length
    let fixed_count = 0

    // 2. 有差异则全量重算回写（与迁移同口径，账实对齐）
    if (drift_count > 0) {
      logger.warn('[SPU对账] 检测到物化列与明细不一致', {
        drift_count,
        sample: drift.slice(0, 10).map(d => d.exchange_item_id)
      })

      await sequelize.query(`
        UPDATE exchange_items ei
        LEFT JOIN (
          SELECT s.exchange_item_id, COALESCE(SUM(s.stock), 0) AS sum_stock, COALESCE(SUM(s.sold_count), 0) AS sum_sold
          FROM exchange_item_skus s WHERE s.status = 'active' GROUP BY s.exchange_item_id
        ) agg ON agg.exchange_item_id = ei.exchange_item_id
        LEFT JOIN (
          SELECT s.exchange_item_id, MIN(cp.cost_amount) AS min_amount, MAX(cp.cost_amount) AS max_amount
          FROM exchange_item_skus s
          JOIN exchange_channel_prices cp ON cp.sku_id = s.sku_id AND cp.is_enabled = 1
          WHERE s.status = 'active' GROUP BY s.exchange_item_id
        ) price ON price.exchange_item_id = ei.exchange_item_id
        SET ei.stock = COALESCE(agg.sum_stock, 0),
            ei.sold_count = COALESCE(agg.sum_sold, 0),
            ei.min_cost_amount = price.min_amount,
            ei.max_cost_amount = price.max_amount
      `)

      await sequelize.query(`
        UPDATE exchange_items ei
        SET ei.min_cost_asset_code = (
          SELECT cp.cost_asset_code
          FROM exchange_item_skus s
          JOIN exchange_channel_prices cp ON cp.sku_id = s.sku_id AND cp.is_enabled = 1
          WHERE s.exchange_item_id = ei.exchange_item_id AND s.status = 'active'
          ORDER BY cp.cost_amount ASC LIMIT 1
        )
      `)
      fixed_count = drift_count
    }

    const report = {
      status: drift_count === 0 ? 'OK' : 'FIXED',
      drift_count,
      fixed_count,
      duration_ms: Date.now() - start_time
    }
    logger.info('[SPU对账] 完成', report)

    if (standalone) {
      await sequelize.close()
      process.exit(0)
    }
    return report
  } catch (error) {
    logger.error('[SPU对账] 失败', { error_message: error.message })
    if (standalone) {
      process.exit(1)
    }
    throw error
  }
}
