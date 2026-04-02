'use strict'

/**
 * 迁移：广告系统表列名 diamond → star_stone
 *
 * 背景：
 *   虚拟资产命名重构的延续，将广告系统中 12 个包含 diamond 的列名
 *   统一改为 star_stone，保持全项目命名一致性。
 *
 * 影响范围：
 *   - ad_slots: 5 列
 *   - ad_campaigns: 4 列
 *   - ad_billing_records: 1 列
 *   - ad_bid_logs: 1 列
 *   - ad_report_daily_snapshots: 1 列
 *
 * 数据影响：
 *   - ad_slots: 7 条配置数据（安全，非互锁表）
 *   - 其余表均为空表
 */

const COLUMN_RENAMES = [
  // ad_slots
  { table: 'ad_slots', oldCol: 'daily_price_diamond', newCol: 'daily_price_star_stone', type: "int NOT NULL COMMENT '固定包天日价（星石）'" },
  { table: 'ad_slots', oldCol: 'min_daily_price_diamond', newCol: 'min_daily_price_star_stone', type: "int NOT NULL DEFAULT 0 COMMENT '最低日价下限（DAU 系数计算结果不得低于此值），0 表示不限制'" },
  { table: 'ad_slots', oldCol: 'min_bid_diamond', newCol: 'min_bid_star_stone', type: "int NOT NULL DEFAULT 50 COMMENT '竞价最低日出价（拍板决策4：高门槛50星石）'" },
  { table: 'ad_slots', oldCol: 'min_budget_diamond', newCol: 'min_budget_star_stone', type: "int NOT NULL DEFAULT 500 COMMENT '竞价最低总预算（拍板决策4：500星石）'" },
  { table: 'ad_slots', oldCol: 'cpm_price_diamond', newCol: 'cpm_price_star_stone', type: "int NOT NULL DEFAULT 0 COMMENT '每千次曝光价格（星石），仅 slot_category=feed 时使用'" },

  // ad_campaigns
  { table: 'ad_campaigns', oldCol: 'daily_bid_diamond', newCol: 'daily_bid_star_stone', type: "int DEFAULT NULL COMMENT '竞价日出价（仅 bidding 模式）'" },
  { table: 'ad_campaigns', oldCol: 'budget_total_diamond', newCol: 'budget_total_star_stone', type: "int DEFAULT NULL COMMENT '总预算星石（仅 bidding 模式）'" },
  { table: 'ad_campaigns', oldCol: 'budget_spent_diamond', newCol: 'budget_spent_star_stone', type: "int NOT NULL DEFAULT 0 COMMENT '已消耗星石'" },
  { table: 'ad_campaigns', oldCol: 'fixed_total_diamond', newCol: 'fixed_total_star_stone', type: "int DEFAULT NULL COMMENT '固定包天总价 = daily_price × days'" },

  // ad_billing_records
  { table: 'ad_billing_records', oldCol: 'amount_diamond', newCol: 'amount_star_stone', type: "int NOT NULL COMMENT '星石金额'" },

  // ad_bid_logs
  { table: 'ad_bid_logs', oldCol: 'bid_amount_diamond', newCol: 'bid_amount_star_stone', type: "int NOT NULL COMMENT '出价（星石）'" },

  // ad_report_daily_snapshots
  { table: 'ad_report_daily_snapshots', oldCol: 'spend_diamond', newCol: 'spend_star_stone', type: "int NOT NULL DEFAULT 0 COMMENT '消耗星石数'" }
]

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🚀 开始广告系统列名 diamond → star_stone 迁移...')

    for (const { table, oldCol, newCol, type } of COLUMN_RENAMES) {
      console.log(`  📦 ${table}: ${oldCol} → ${newCol}`)
      await queryInterface.sequelize.query(
        `ALTER TABLE \`${table}\` CHANGE COLUMN \`${oldCol}\` \`${newCol}\` ${type}`
      )
    }

    console.log('✅ 广告系统列名迁移完成')
  },

  down: async (queryInterface, Sequelize) => {
    console.log('🔄 回滚广告系统列名...')

    for (const { table, oldCol, newCol, type } of COLUMN_RENAMES) {
      // 回滚时用旧 comment
      const oldType = type.replace(/星石/g, '钻石')
      console.log(`  📦 ${table}: ${newCol} → ${oldCol}`)
      await queryInterface.sequelize.query(
        `ALTER TABLE \`${table}\` CHANGE COLUMN \`${newCol}\` \`${oldCol}\` ${oldType}`
      )
    }

    console.log('✅ 回滚完成')
  }
}
