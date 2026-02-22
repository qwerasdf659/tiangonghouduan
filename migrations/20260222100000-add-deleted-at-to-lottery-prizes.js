'use strict'

/**
 * 奖品软删除支持 - 添加 deleted_at 列
 *
 * 业务背景：奖品删除策略从硬删除改为 Sequelize paranoid 软删除
 * - Model.destroy() 自动设置 deleted_at 时间戳
 * - 所有 findAll/findOne 自动过滤 deleted_at IS NULL
 * - 支持 restore() 恢复误删奖品
 * - 支持 { force: true } 强制物理删除
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      /* 检查列是否已存在 */
      const [columns] = await queryInterface.sequelize.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lottery_prizes' AND COLUMN_NAME = 'deleted_at'",
        { transaction }
      )

      if (columns.length === 0) {
        await queryInterface.addColumn(
          'lottery_prizes',
          'deleted_at',
          {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: null,
            comment: '软删除时间戳（Sequelize paranoid 模式）'
          },
          { transaction }
        )

        /* 索引：加速 paranoid 查询（WHERE deleted_at IS NULL） */
        await queryInterface.addIndex('lottery_prizes', ['deleted_at'], {
          name: 'idx_lp_deleted_at',
          where: { deleted_at: null },
          transaction
        })
      }

      await transaction.commit()
      console.log('✅ lottery_prizes 软删除列 deleted_at 添加成功')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.removeIndex('lottery_prizes', 'idx_lp_deleted_at', { transaction })
      await queryInterface.removeColumn('lottery_prizes', 'deleted_at', { transaction })
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
