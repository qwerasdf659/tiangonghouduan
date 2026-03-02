'use strict'

/**
 * 奖品池软删除改造 — lottery_prizes 表新增 deleted_at 列
 *
 * 业务背景：
 * - 原有 deletePrize() 是硬删除，运营误删后无法恢复
 * - 改为 Sequelize paranoid 软删除模式（设置 deleted_at 时间戳）
 * - Sequelize 自动在所有 findAll/findOne 中过滤已删除记录
 * - 需要查已删除的：{ paranoid: false }
 * - 需要恢复的：instance.restore()
 *
 * 变更内容：
 * 1. lottery_prizes 新增 deleted_at DATETIME NULL 列
 *
 * @version 4.1.0
 * @date 2026-02-22
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 检查 deleted_at 列是否已存在（幂等保护）
      const [cols] = await queryInterface.sequelize.query(
        "SHOW COLUMNS FROM lottery_prizes LIKE 'deleted_at'",
        { transaction }
      )

      if (cols.length === 0) {
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
        console.log('  ✅ lottery_prizes.deleted_at 列已添加')
      } else {
        console.log('  ⏭️ lottery_prizes.deleted_at 列已存在，跳过')
      }

      await transaction.commit()
      console.log('✅ 迁移完成：lottery_prizes 软删除改造')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败：', error.message)
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      await queryInterface.removeColumn('lottery_prizes', 'deleted_at', { transaction })
      await transaction.commit()
      console.log('✅ 回滚完成：移除 lottery_prizes.deleted_at 列')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
