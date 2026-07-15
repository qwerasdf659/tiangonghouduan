'use strict'

/**
 * 奖品标识统一为 lottery_campaign_prize_id（方案C 内部统一，2026-06-04）
 *
 * 业务背景（详见 docs/抽奖管理干预接入缺口诊断.md §5.4）：
 * - 旧表 lottery_prizes 已删除（见 20260526000300-drop-lottery-prizes-table.js）
 * - lottery_draws.lottery_prize_id 是指向已删除旧表的历史假名列（4741 行，4327 行与 canonical 值不一致）
 * - lottery_draws.lottery_campaign_prize_id 才是规范主键真名列（BIGINT，FK→lottery_campaign_prizes，已全量回填）
 * - preset_inventory_debt.lottery_prize_id 同为历史假名列（0 行，无 FK 约束，注释仍指向已删表）
 *
 * 本迁移（内部统一，对外由 DataSanitizer 映射为通用 id）：
 * 1. lottery_draws：删除历史假名列 lottery_prize_id（含 idx_prize_id 索引），仅保留 lottery_campaign_prize_id
 * 2. preset_inventory_debt：把 lottery_prize_id 列改名为 lottery_campaign_prize_id（含索引重建 + 补 FK）
 *
 * down 提供完整回滚（恢复列与索引；lottery_draws 旧列恢复为 NULL，因旧映射表已不存在无法精确还原值）
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()

    try {
      // ===== 1. lottery_draws：删除历史假名列 lottery_prize_id =====
      // 先删依赖该列的索引 idx_prize_id（真实库确认存在）
      await queryInterface.removeIndex('lottery_draws', 'idx_prize_id', { transaction })
      await queryInterface.removeColumn('lottery_draws', 'lottery_prize_id', { transaction })

      // ===== 2. preset_inventory_debt：lottery_prize_id → lottery_campaign_prize_id =====
      // 先删依赖旧列的联合索引
      await queryInterface.removeIndex('preset_inventory_debt', 'idx_inv_debt_prize_status', {
        transaction
      })
      // 列改名 + 类型对齐 lottery_campaign_prizes 主键（BIGINT）
      await queryInterface.renameColumn(
        'preset_inventory_debt',
        'lottery_prize_id',
        'lottery_campaign_prize_id',
        { transaction }
      )
      await queryInterface.changeColumn(
        'preset_inventory_debt',
        'lottery_campaign_prize_id',
        {
          type: Sequelize.BIGINT,
          allowNull: false,
          comment: '欠账奖品ID（外键关联 lottery_campaign_prizes.lottery_campaign_prize_id）'
        },
        { transaction }
      )
      // 重建联合索引（新列名）
      await queryInterface.addIndex(
        'preset_inventory_debt',
        ['lottery_campaign_prize_id', 'status'],
        { name: 'idx_inv_debt_prize_status', transaction }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()

    try {
      // ===== 回滚 2. preset_inventory_debt =====
      await queryInterface.removeIndex('preset_inventory_debt', 'idx_inv_debt_prize_status', {
        transaction
      })
      await queryInterface.renameColumn(
        'preset_inventory_debt',
        'lottery_campaign_prize_id',
        'lottery_prize_id',
        { transaction }
      )
      await queryInterface.changeColumn(
        'preset_inventory_debt',
        'lottery_prize_id',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '欠账奖品ID（外键关联lottery_prizes.lottery_prize_id）'
        },
        { transaction }
      )
      await queryInterface.addIndex('preset_inventory_debt', ['lottery_prize_id', 'status'], {
        name: 'idx_inv_debt_prize_status',
        transaction
      })

      // ===== 回滚 1. lottery_draws：恢复历史假名列（值为 NULL，旧映射表已不存在） =====
      await queryInterface.addColumn(
        'lottery_draws',
        'lottery_prize_id',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '获得的奖品ID（历史字段，兼容旧记录）',
          after: 'asset_transaction_id'
        },
        { transaction }
      )
      await queryInterface.addIndex('lottery_draws', ['lottery_prize_id'], {
        name: 'idx_prize_id',
        transaction
      })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
