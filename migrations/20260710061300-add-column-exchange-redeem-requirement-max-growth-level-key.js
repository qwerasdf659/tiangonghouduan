'use strict'

/**
 * 添加列: exchange_redeem_requirement.max_growth_level_key（兑换等级区间门槛上限，拍板⑪）
 *
 * 创建时间: 2026-07-10（北京时间）
 * 背景（以物易物与会员成长等级功能启用方案 §2.5）:
 * - 现有 min_growth_level_key 只支持「某等级及以上」；本列补齐「及以下 / 仅某等级」：
 *   · min 单配 = 及以上（高价值实物门槛，拍板③划线）
 *   · max 单配 = 及以下（新人专享等场景）
 *   · min=max  = 仅某等级（如 v9 专属纪念品）
 *   · 双 NULL  = 不限等级
 * - 校验按 user_growth_levels.sort_order 区间比较，超上限报 REDEEM_GROWTH_LEVEL_EXCEEDED。
 * - 存量 0 条配置，无兼容负担。
 *
 * 回滚: 删除该列。
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('exchange_redeem_requirement', 'max_growth_level_key', {
      type: Sequelize.STRING(32),
      allowNull: true,
      comment: '最高成长等级门槛（关联 user_growth_levels.level_key，NULL=不限；与 min 组合成区间）'
    })
    console.log('✅ exchange_redeem_requirement.max_growth_level_key 添加完成')
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('exchange_redeem_requirement', 'max_growth_level_key')
    console.log('⏪ exchange_redeem_requirement.max_growth_level_key 已删除')
  }
}
