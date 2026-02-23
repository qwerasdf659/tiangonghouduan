'use strict'

/**
 * 回填缺失的 counterpart 反向流水记录
 *
 * 问题：BalanceService.changeBalance() 在主记录上设置了 counterpart_account_id，
 * 但对手方的反向记录（business_type 以 _counterpart 结尾）大量缺失（~21,790 条），
 * 导致全局资产守恒验证 SUM(delta_amount) GROUP BY asset_code ≠ 0。
 *
 * 修复策略：
 * 1. 查找所有有 counterpart_account_id 但没有对应 _counterpart 记录的主记录
 * 2. 批量创建反向记录（delta_amount 取反，account_id 和 counterpart_account_id 互换）
 * 3. 冻结/解冻操作（同一账户内操作）不需要 counterpart 记录，跳过
 *
 * 守恒规则：
 * - 跨账户操作（如抽奖消耗、充值、兑换）：需要 counterpart 记录
 * - 同账户操作（freeze/unfreeze/settle_from_frozen）：不需要 counterpart 记录
 */
module.exports = {
  async up(queryInterface) {
    const BATCH_SIZE = 500

    // 不需要 counterpart 的业务类型（同一账户内的 available ↔ frozen 转移）
    const SKIP_BUSINESS_TYPES = [
      'order_freeze_buyer',
      'order_unfreeze_buyer',
      'order_settle_buyer_debit',
      'market_listing_freeze',
      'market_listing_unfreeze',
      'listing_settle_seller_offer_debit'
    ]

    // 查找需要补建 counterpart 的主记录总数
    const [[{ total }]] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as total
      FROM asset_transactions at1
      WHERE at1.counterpart_account_id IS NOT NULL
        AND at1.business_type NOT LIKE '%_counterpart'
        AND at1.business_type NOT LIKE '%freeze%'
        AND at1.business_type NOT LIKE '%unfreeze%'
        AND at1.business_type NOT LIKE '%settle_buyer_debit%'
        AND at1.business_type NOT LIKE '%settle_seller_offer_debit%'
        AND NOT EXISTS (
          SELECT 1 FROM asset_transactions at2
          WHERE at2.idempotency_key = CONCAT(at1.idempotency_key, ':counterpart')
        )
    `)

    console.log(`📊 需要补建 counterpart 反向记录: ${total} 条`)

    if (total === 0) {
      console.log('✅ 无需补建，跳过')
      return
    }

    let processed = 0
    let batchNum = 0

    while (processed < total) {
      batchNum++
      const transaction = await queryInterface.sequelize.transaction()

      try {
        // 分批查找缺失 counterpart 的主记录
        const [records] = await queryInterface.sequelize.query(`
          SELECT 
            at1.asset_transaction_id,
            at1.account_id,
            at1.counterpart_account_id,
            at1.asset_code,
            at1.delta_amount,
            at1.business_type,
            at1.lottery_session_id,
            at1.idempotency_key
          FROM asset_transactions at1
          WHERE at1.counterpart_account_id IS NOT NULL
            AND at1.business_type NOT LIKE '%_counterpart'
            AND at1.business_type NOT LIKE '%freeze%'
            AND at1.business_type NOT LIKE '%unfreeze%'
            AND at1.business_type NOT LIKE '%settle_buyer_debit%'
            AND at1.business_type NOT LIKE '%settle_seller_offer_debit%'
            AND NOT EXISTS (
              SELECT 1 FROM asset_transactions at2
              WHERE at2.idempotency_key = CONCAT(at1.idempotency_key, ':counterpart')
            )
          LIMIT ${BATCH_SIZE}
        `, { transaction })

        if (records.length === 0) break

        // 批量构建 INSERT 语句
        const values = records.map(r => {
          const cpIdempotencyKey = `${r.idempotency_key}:counterpart`
          const reverseDelta = -Number(r.delta_amount)
          const meta = JSON.stringify({
            counterpart_of: r.idempotency_key,
            original_account_id: r.account_id,
            backfilled: true,
            backfill_date: new Date().toISOString()
          }).replace(/'/g, "\\'")

          return `(${r.counterpart_account_id}, ${r.account_id}, '${r.asset_code}', ${reverseDelta}, 0, 0, '${r.business_type}_counterpart', ${r.lottery_session_id ? `'${r.lottery_session_id}'` : 'NULL'}, '${cpIdempotencyKey}', '${meta}', NOW())`
        })

        await queryInterface.sequelize.query(`
          INSERT INTO asset_transactions 
            (account_id, counterpart_account_id, asset_code, delta_amount, balance_before, balance_after, business_type, lottery_session_id, idempotency_key, meta, created_at)
          VALUES ${values.join(',\n')}
          ON DUPLICATE KEY UPDATE asset_transaction_id = asset_transaction_id
        `, { transaction })

        await transaction.commit()
        processed += records.length
        console.log(`  批次 ${batchNum}: 补建 ${records.length} 条 counterpart 记录（累计 ${processed}/${total}）`)
      } catch (error) {
        await transaction.rollback()
        console.error(`  批次 ${batchNum} 失败:`, error.message)
        throw error
      }
    }

    console.log(`✅ counterpart 反向记录补建完成: 共 ${processed} 条`)
  },

  async down(queryInterface) {
    // 删除所有回填的 counterpart 记录（通过 meta.backfilled 标识）
    const [, meta] = await queryInterface.sequelize.query(`
      DELETE FROM asset_transactions 
      WHERE business_type LIKE '%_counterpart' 
        AND meta LIKE '%"backfilled":true%'
    `)
    console.log(`🔄 回滚: 删除 ${meta?.affectedRows || 0} 条回填的 counterpart 记录`)
  }
}
