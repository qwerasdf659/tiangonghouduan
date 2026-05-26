'use strict'

/**
 * lottery_draws 表添加 lottery_campaign_prize_id 字段
 *
 * 业务背景：
 * - 集中奖品目录方案升级后，抽奖记录需要关联到新的 lottery_campaign_prizes 表
 * - 保留旧 lottery_prize_id 字段（历史记录），新增 lottery_campaign_prize_id 字段
 * - 迁移现有记录：通过 lottery_prize_id → lottery_prizes.sort_order 映射到 lottery_campaign_prizes
 *
 * 迁移策略：
 * - 新增字段 lottery_campaign_prize_id（BIGINT, nullable）
 * - 通过 lottery_prizes 的 (lottery_campaign_id, sort_order) 映射到 lottery_campaign_prizes
 * - 添加外键约束指向 lottery_campaign_prizes
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🚀 开始为 lottery_draws 添加 lottery_campaign_prize_id 字段...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 添加新字段
      await queryInterface.addColumn('lottery_draws', 'lottery_campaign_prize_id', {
        type: Sequelize.BIGINT,
        allowNull: true,
        comment: '活动奖品关联ID（FK→lottery_campaign_prizes.lottery_campaign_prize_id）',
        after: 'lottery_prize_id'
      }, { transaction })

      console.log('  ✅ 字段添加完成')

      // 2. 迁移现有数据：通过 lottery_prize_id 映射到 lottery_campaign_prize_id
      // 映射逻辑：旧 lottery_prizes 的 sort_order 与新 lottery_campaign_prizes 的 sort_order 一致
      const [mapping] = await queryInterface.sequelize.query(
        `SELECT lp.lottery_prize_id, lcp.lottery_campaign_prize_id
         FROM lottery_prizes lp
         JOIN lottery_campaign_prizes lcp 
           ON lp.lottery_campaign_id = lcp.lottery_campaign_id
         JOIN prize_definitions pd 
           ON lcp.prize_definition_id = pd.prize_definition_id
           AND pd.material_asset_code = lp.material_asset_code
           AND (pd.material_amount = lp.material_amount OR (pd.material_amount IS NULL AND lp.material_amount IS NULL))
         WHERE lp.deleted_at IS NULL`,
        { transaction }
      )

      console.log(`  📦 找到 ${mapping.length} 条映射关系`)

      // 批量更新
      for (const row of mapping) {
        await queryInterface.sequelize.query(
          `UPDATE lottery_draws SET lottery_campaign_prize_id = ? WHERE lottery_prize_id = ?`,
          { replacements: [row.lottery_campaign_prize_id, row.lottery_prize_id], transaction }
        )
      }

      // 验证更新结果
      const [updated] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as cnt FROM lottery_draws WHERE lottery_campaign_prize_id IS NOT NULL',
        { transaction }
      )
      console.log(`  ✅ 已更新 ${updated[0].cnt} 条抽奖记录`)

      // 3. 添加索引
      await queryInterface.addIndex('lottery_draws', ['lottery_campaign_prize_id'], {
        name: 'idx_lottery_draws_campaign_prize',
        transaction
      })

      // 4. 添加外键约束
      await queryInterface.addConstraint('lottery_draws', {
        fields: ['lottery_campaign_prize_id'],
        type: 'foreign key',
        name: 'fk_lottery_draws_campaign_prize',
        references: { table: 'lottery_campaign_prizes', field: 'lottery_campaign_prize_id' },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction
      })

      console.log('  ✅ 索引和外键约束添加完成')

      await transaction.commit()
      console.log('\n✅ lottery_draws 迁移完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.removeConstraint('lottery_draws', 'fk_lottery_draws_campaign_prize', { transaction })
      await queryInterface.removeIndex('lottery_draws', 'idx_lottery_draws_campaign_prize', { transaction })
      await queryInterface.removeColumn('lottery_draws', 'lottery_campaign_prize_id', { transaction })
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
