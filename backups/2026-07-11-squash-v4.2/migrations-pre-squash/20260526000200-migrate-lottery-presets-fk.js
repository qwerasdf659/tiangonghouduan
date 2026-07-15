'use strict'

/**
 * lottery_presets 表迁移：lottery_prize_id → lottery_campaign_prize_id
 *
 * 业务背景：
 * - 集中奖品目录方案升级后，预设需要引用 lottery_campaign_prizes 而非 lottery_prizes
 * - 现有 2 条预设引用已删除的旧奖品（lottery_prize_id=1 已 soft-delete），属于孤儿数据
 * - 硬删除孤儿预设，添加新 FK 字段
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🚀 开始迁移 lottery_presets FK...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 删除引用已删除奖品的孤儿预设（硬删除）
      const [deleted] = await queryInterface.sequelize.query(
        `DELETE FROM lottery_presets WHERE lottery_prize_id IN (
          SELECT lottery_prize_id FROM lottery_prizes WHERE deleted_at IS NOT NULL
        )`,
        { transaction }
      )
      console.log(`  ✅ 清理孤儿预设: ${deleted.affectedRows || 0} 条`)

      // 2. 删除旧 FK 约束（如果存在）
      try {
        await queryInterface.removeConstraint('lottery_presets', 'fk_lottery_presets_prize_id', { transaction })
      } catch (e) {
        console.log('  ⚠️ 旧 FK 约束不存在或已删除，跳过')
      }

      // 3. 添加新字段 lottery_campaign_prize_id
      await queryInterface.addColumn('lottery_presets', 'lottery_campaign_prize_id', {
        type: Sequelize.BIGINT,
        allowNull: true,
        comment: '活动奖品关联ID（FK→lottery_campaign_prizes.lottery_campaign_prize_id）',
        after: 'lottery_prize_id'
      }, { transaction })

      // 4. 迁移剩余数据（如果有的话）
      const [remaining] = await queryInterface.sequelize.query(
        `SELECT lp.lottery_preset_id, lp.lottery_prize_id, ld.lottery_campaign_prize_id
         FROM lottery_presets lp
         LEFT JOIN lottery_draws ld ON ld.lottery_prize_id = lp.lottery_prize_id
         WHERE lp.lottery_prize_id IS NOT NULL AND ld.lottery_campaign_prize_id IS NOT NULL
         GROUP BY lp.lottery_preset_id`,
        { transaction }
      )
      for (const row of remaining) {
        await queryInterface.sequelize.query(
          'UPDATE lottery_presets SET lottery_campaign_prize_id = ? WHERE lottery_preset_id = ?',
          { replacements: [row.lottery_campaign_prize_id, row.lottery_preset_id], transaction }
        )
      }
      console.log(`  ✅ 迁移剩余预设: ${remaining.length} 条`)

      // 5. 添加新 FK 约束
      await queryInterface.addConstraint('lottery_presets', {
        fields: ['lottery_campaign_prize_id'],
        type: 'foreign key',
        name: 'fk_lottery_presets_campaign_prize',
        references: { table: 'lottery_campaign_prizes', field: 'lottery_campaign_prize_id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction
      })

      // 6. 删除旧字段
      await queryInterface.removeColumn('lottery_presets', 'lottery_prize_id', { transaction })

      console.log('  ✅ 旧字段 lottery_prize_id 已删除')

      await transaction.commit()
      console.log('\n✅ lottery_presets FK 迁移完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.removeConstraint('lottery_presets', 'fk_lottery_presets_campaign_prize', { transaction })
      await queryInterface.addColumn('lottery_presets', 'lottery_prize_id', {
        type: Sequelize.INTEGER,
        allowNull: false,
        after: 'lottery_preset_id'
      }, { transaction })
      await queryInterface.removeColumn('lottery_presets', 'lottery_campaign_prize_id', { transaction })
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
