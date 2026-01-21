'use strict'

/**
 * @file 添加lottery_draw_decisions表缺失的segment字段
 * @description 修复模型与数据库结构不一致问题
 *
 * 添加字段：
 * - segment_version: 分层规则版本（如v1/v2）
 * - matched_rule_id: 匹配的档位规则ID
 * - matched_reason: 匹配原因说明
 *
 * @version 1.0.0
 * @date 2026-01-21
 * @module migrations/add-missing-segment-fields-to-draw-decisions
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 添加 segment_version 字段
      await queryInterface.addColumn(
        'lottery_draw_decisions',
        'segment_version',
        {
          type: Sequelize.STRING(32),
          allowNull: true,
          comment: '分层规则版本（如v1/v2，对应config/segment_rules.js）'
        },
        { transaction }
      )

      // 2. 添加 matched_rule_id 字段
      await queryInterface.addColumn(
        'lottery_draw_decisions',
        'matched_rule_id',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '匹配的档位规则ID（lottery_tier_rules.tier_rule_id）'
        },
        { transaction }
      )

      // 3. 添加 matched_reason 字段
      await queryInterface.addColumn(
        'lottery_draw_decisions',
        'matched_reason',
        {
          type: Sequelize.STRING(255),
          allowNull: true,
          comment: '匹配原因说明（用于审计追溯）'
        },
        { transaction }
      )

      await transaction.commit()

      console.log('✅ 成功添加 segment_version, matched_rule_id, matched_reason 字段')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      await queryInterface.removeColumn('lottery_draw_decisions', 'matched_reason', {
        transaction
      })
      await queryInterface.removeColumn('lottery_draw_decisions', 'matched_rule_id', {
        transaction
      })
      await queryInterface.removeColumn('lottery_draw_decisions', 'segment_version', {
        transaction
      })

      await transaction.commit()

      console.log('✅ 成功移除 segment_version, matched_rule_id, matched_reason 字段')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
