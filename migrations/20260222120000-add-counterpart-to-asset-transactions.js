'use strict'

/**
 * 资产流水表双录升级 — 增加 counterpart_account_id 字段
 *
 * 设计目的：
 * - 从单式记账升级为双录记账（每次变动记录对手方）
 * - 支持全局守恒验证：SUM(delta_amount) GROUP BY asset_code == 0
 * - 管理员调账必须指明"从哪来"，不能凭空创造
 *
 * @version 1.0.0
 * @date 2026-02-22
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 检查字段是否已存在
      const [columns] = await queryInterface.sequelize.query(
        'SHOW COLUMNS FROM asset_transactions LIKE \'counterpart_account_id\'',
        { transaction }
      )

      if (columns.length > 0) {
        console.log('  ⏭️ counterpart_account_id 字段已存在，跳过')
        await transaction.commit()
        return
      }

      // 1. 增加 counterpart_account_id 字段（允许 NULL，兼容历史单式记录）
      await queryInterface.addColumn(
        'asset_transactions',
        'counterpart_account_id',
        {
          type: Sequelize.BIGINT,
          allowNull: true,
          comment: '对手方账户ID（双录记账：发放→SYSTEM_MINT，消耗→SYSTEM_BURN，交易→对方用户）',
          after: 'account_id'
        },
        { transaction }
      )

      // 2. 增加 is_invalid 标记字段（用于标记 BIGINT 溢出等无效记录）
      const [invalidCol] = await queryInterface.sequelize.query(
        'SHOW COLUMNS FROM asset_transactions LIKE \'is_invalid\'',
        { transaction }
      )

      if (invalidCol.length === 0) {
        await queryInterface.addColumn(
          'asset_transactions',
          'is_invalid',
          {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: '是否无效记录（标记 BIGINT 溢出等异常数据，对账时 WHERE 排除）',
            after: 'meta'
          },
          { transaction }
        )
      }

      // 3. 添加 counterpart 索引
      const [existingIdx] = await queryInterface.sequelize.query(
        'SHOW INDEX FROM asset_transactions WHERE Key_name = \'idx_counterpart_account\'',
        { transaction }
      )

      if (existingIdx.length === 0) {
        await queryInterface.addIndex(
          'asset_transactions',
          ['counterpart_account_id'],
          { name: 'idx_counterpart_account', transaction }
        )
      }

      await transaction.commit()
      console.log('✅ 迁移完成：asset_transactions 增加 counterpart_account_id 和 is_invalid 字段')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败：', error.message)
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      await queryInterface.removeColumn('asset_transactions', 'is_invalid', { transaction })
      await queryInterface.removeColumn('asset_transactions', 'counterpart_account_id', { transaction })
      await transaction.commit()
      console.log('✅ 回滚完成：移除 counterpart_account_id 和 is_invalid 字段')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
