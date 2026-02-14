'use strict'

/**
 * 数据库迁移：删除 lottery_campaigns.cost_per_draw 废弃字段
 *
 * 业务背景：
 * - 抽奖定价已迁移至 lottery_campaign_pricing_config 表（版本化配置）
 * - 运行时定价由 LotteryPricingService.getDrawPricing() 统一计算
 * - cost_per_draw 字段不参与任何扣费逻辑，属于技术债务
 * - 数据不一致问题：cost_per_draw=100 但实际扣费 base_cost=10
 *
 * 变更内容：
 * - 删除 lottery_campaigns.cost_per_draw 列
 * - 删除 idx_cost_per_draw 索引
 *
 * 回滚方案：
 * - down() 重建列（DECIMAL(10,2) NOT NULL DEFAULT 0）和索引
 *
 * @see docs/技术债务-cost_per_draw字段清理方案.md
 * @date 2026-02-15
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('📦 [迁移] 开始：删除 cost_per_draw 废弃字段...')

    // 1. 删除索引（先删索引再删列，避免外键约束问题）
    try {
      await queryInterface.removeIndex('lottery_campaigns', 'idx_cost_per_draw')
      console.log('  ✅ 已删除索引 idx_cost_per_draw')
    } catch (error) {
      console.log('  ⚠️ 索引 idx_cost_per_draw 不存在，跳过:', error.message)
    }

    // 2. 删除列
    await queryInterface.removeColumn('lottery_campaigns', 'cost_per_draw')
    console.log('  ✅ 已删除列 cost_per_draw')

    console.log('📦 [迁移] 完成：cost_per_draw 字段已删除')
  },

  async down(queryInterface, Sequelize) {
    console.log('📦 [回滚] 开始：重建 cost_per_draw 字段...')

    // 回滚：重建列
    await queryInterface.addColumn('lottery_campaigns', 'cost_per_draw', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      comment: '【已废弃】每次抽奖消耗积分',
      after: 'campaign_type'
    })

    // 回滚：重建索引
    await queryInterface.addIndex('lottery_campaigns', ['cost_per_draw'], {
      name: 'idx_cost_per_draw'
    })

    console.log('📦 [回滚] 完成：cost_per_draw 字段已重建')
  }
}

