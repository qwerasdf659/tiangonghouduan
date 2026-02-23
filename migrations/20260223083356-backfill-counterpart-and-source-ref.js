'use strict'

/**
 * 历史数据治理迁移：回填 counterpart_account_id + source_ref_id
 *
 * Phase 5.2：为历史 asset_transactions 回填 counterpart_account_id
 * Phase 4：为历史 lottery 物品回填 source_ref_id
 *
 * 系统账户 ID（从 accounts 表查询确认）：
 * - 1: SYSTEM_PLATFORM_FEE
 * - 2: SYSTEM_MINT
 * - 3: SYSTEM_BURN
 * - 4: SYSTEM_ESCROW
 * - 12: SYSTEM_RESERVE
 * - 15: SYSTEM_CAMPAIGN_POOL
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ========== Phase 5.2：回填 counterpart_account_id ==========

      // 规则：资产发放/奖励类 → SYSTEM_MINT (account_id=2)
      const mintBusinessTypes = [
        'lottery_reward',
        'lottery_reward_material',
        'consumption_reward',
        'consumption_budget_allocation',
        'merchant_points_reward',
        'material_convert_credit',
        'lottery_budget_rollback',
        'cs_compensation'
      ]

      // 规则：资产消耗/销毁类 → SYSTEM_BURN (account_id=3)
      const burnBusinessTypes = [
        'lottery_consume',
        'exchange_debit',
        'material_convert_debit',
        'premium_unlock',
        'lottery_budget_deduct'
      ]

      // 规则：管理员调账 → SYSTEM_RESERVE (account_id=12)
      const reserveBusinessTypes = ['admin_adjustment']

      // 规则：平台手续费入账 → 对手方按记录中的 buyer_user_id 解析，简化为 SYSTEM_PLATFORM_FEE 自身（仅标记）
      const platformFeeTypes = [
        'order_settle_platform_fee_credit',
        'material_convert_fee'
      ]

      // 批量更新 MINT 对手方
      if (mintBusinessTypes.length > 0) {
        const [, mintMeta] = await queryInterface.sequelize.query(
          `UPDATE asset_transactions 
           SET counterpart_account_id = 2 
           WHERE counterpart_account_id IS NULL 
             AND business_type IN (:types)`,
          {
            replacements: { types: mintBusinessTypes },
            transaction
          }
        )
        console.log(`✅ MINT 对手方回填: ${mintMeta?.affectedRows || 0} 条`)
      }

      // 批量更新 BURN 对手方
      if (burnBusinessTypes.length > 0) {
        const [, burnMeta] = await queryInterface.sequelize.query(
          `UPDATE asset_transactions 
           SET counterpart_account_id = 3 
           WHERE counterpart_account_id IS NULL 
             AND business_type IN (:types)`,
          {
            replacements: { types: burnBusinessTypes },
            transaction
          }
        )
        console.log(`✅ BURN 对手方回填: ${burnMeta?.affectedRows || 0} 条`)
      }

      // 批量更新 RESERVE 对手方
      if (reserveBusinessTypes.length > 0) {
        const [, reserveMeta] = await queryInterface.sequelize.query(
          `UPDATE asset_transactions 
           SET counterpart_account_id = 12 
           WHERE counterpart_account_id IS NULL 
             AND business_type IN (:types)`,
          {
            replacements: { types: reserveBusinessTypes },
            transaction
          }
        )
        console.log(`✅ RESERVE 对手方回填: ${reserveMeta?.affectedRows || 0} 条`)
      }

      // 交易结算：卖家入账 → 对手方为买家账户（通过 trade_orders 关联）
      await queryInterface.sequelize.query(
        `UPDATE asset_transactions at
         JOIN (
           SELECT 
             CONCAT(t.idempotency_key, ':credit_seller') as idem_key,
             a.account_id as buyer_account_id
           FROM trade_orders t
           JOIN accounts a ON a.user_id = t.buyer_user_id AND a.account_type = 'user'
         ) lookup ON at.idempotency_key = lookup.idem_key
         SET at.counterpart_account_id = lookup.buyer_account_id
         WHERE at.counterpart_account_id IS NULL
           AND at.business_type = 'order_settle_seller_credit'`,
        { transaction }
      )

      // 交易结算：买家入账标的资产 → 对手方为卖家账户
      await queryInterface.sequelize.query(
        `UPDATE asset_transactions at
         JOIN (
           SELECT 
             CONCAT(t.idempotency_key, ':credit_buyer_offer') as idem_key,
             a.account_id as seller_account_id
           FROM trade_orders t
           JOIN accounts a ON a.user_id = t.seller_user_id AND a.account_type = 'user'
         ) lookup ON at.idempotency_key = lookup.idem_key
         SET at.counterpart_account_id = lookup.seller_account_id
         WHERE at.counterpart_account_id IS NULL
           AND at.business_type = 'listing_transfer_buyer_offer_credit'`,
        { transaction }
      )

      // cs_compensation 对手方修正为 SYSTEM_RESERVE
      // (已在上面的 mintBusinessTypes 中处理，但 cs_compensation 应该用 SYSTEM_RESERVE)
      await queryInterface.sequelize.query(
        `UPDATE asset_transactions 
         SET counterpart_account_id = 12 
         WHERE business_type = 'cs_compensation' 
           AND counterpart_account_id = 2`,
        { transaction }
      )

      // 测试数据：正金额 → MINT，负金额 → BURN
      await queryInterface.sequelize.query(
        `UPDATE asset_transactions 
         SET counterpart_account_id = CASE 
           WHEN delta_amount > 0 THEN 2 
           ELSE 3 
         END
         WHERE counterpart_account_id IS NULL 
           AND business_type LIKE 'test_%'`,
        { transaction }
      )

      // ========== Phase 4：回填历史 lottery source_ref_id ==========

      // 尝试通过 lottery_draws 表关联回填
      const [drawsExist] = await queryInterface.sequelize.query(
        "SELECT COUNT(*) as cnt FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lottery_draws'",
        { transaction }
      )

      if (drawsExist[0]?.cnt > 0) {
        await queryInterface.sequelize.query(
          `UPDATE items i
           JOIN accounts a ON a.account_id = i.owner_account_id AND a.account_type = 'user'
           JOIN lottery_draws ld ON ld.user_id = a.user_id 
             AND ld.created_at BETWEEN DATE_SUB(i.created_at, INTERVAL 5 SECOND) AND DATE_ADD(i.created_at, INTERVAL 5 SECOND)
           SET i.source_ref_id = CAST(ld.lottery_draw_id AS CHAR)
           WHERE i.source = 'lottery' 
             AND (i.source_ref_id IS NULL OR i.source_ref_id = '')
             AND ld.lottery_draw_id IS NOT NULL`,
          { transaction }
        )
        console.log('✅ lottery source_ref_id 时间窗口关联回填完成')
      }

      // 无法关联的标记为 legacy
      await queryInterface.sequelize.query(
        `UPDATE items 
         SET source_ref_id = 'legacy_unlinked'
         WHERE source = 'lottery' 
           AND (source_ref_id IS NULL OR source_ref_id = '')`,
        { transaction }
      )
      console.log('✅ 未关联的 lottery 物品已标记为 legacy_unlinked')

      await transaction.commit()
      console.log('✅ 历史数据治理迁移完成')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.sequelize.query(
        `UPDATE asset_transactions SET counterpart_account_id = NULL WHERE counterpart_account_id IS NOT NULL`,
        { transaction }
      )
      await queryInterface.sequelize.query(
        `UPDATE items SET source_ref_id = NULL WHERE source_ref_id = 'legacy_unlinked'`,
        { transaction }
      )
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
