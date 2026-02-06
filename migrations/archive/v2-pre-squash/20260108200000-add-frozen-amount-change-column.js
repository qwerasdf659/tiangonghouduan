'use strict'

/**
 * 添加冻结余额变动字段（frozen_amount_change）到 asset_transactions 表
 *
 * 业务背景：
 * - 当前冻结/解冻/结算操作的信息存储在 meta JSON 字段中（frozen_before, frozen_after）
 * - JSON 查询性能低，不利于对账和审计
 * - 需要结构化字段支持高效的冻结余额变动查询和对账
 *
 * 解决方案：
 * - 添加 frozen_amount_change 列（BIGINT，默认值 0）
 * - 正数表示冻结增加，负数表示冻结减少
 * - freeze 操作：frozen_amount_change > 0
 * - unfreeze 操作：frozen_amount_change < 0
 * - settleFromFrozen 操作：frozen_amount_change < 0（从冻结结算）
 * - 普通可用余额操作：frozen_amount_change = 0
 *
 * 创建索引：
 * - idx_frozen_change: (account_id, asset_code, frozen_amount_change)
 * - 用于快速查询某账户某资产的所有冻结变动记录
 *
 * 决策时间：2026-01-08
 * 风险等级：🟢 低风险（新增列 + 默认值，不影响现有数据）
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔧 开始执行：添加 frozen_amount_change 字段到 asset_transactions 表')

      // 1. 检查字段是否已存在
      console.log('📊 步骤1：检查字段是否已存在...')
      const [columns] = await queryInterface.sequelize.query(
        `SHOW COLUMNS FROM asset_transactions WHERE Field = 'frozen_amount_change'`,
        { transaction }
      )

      if (columns.length > 0) {
        console.log('   ⏭️ frozen_amount_change 字段已存在，跳过添加')
      } else {
        // 2. 添加 frozen_amount_change 字段
        console.log('📊 步骤2：添加 frozen_amount_change 字段...')
        await queryInterface.addColumn(
          'asset_transactions',
          'frozen_amount_change',
          {
            type: Sequelize.BIGINT,
            allowNull: false,
            defaultValue: 0,
            comment:
              '冻结余额变动（正数=增加冻结，负数=减少冻结，0=仅影响可用余额）：用于冻结/解冻/结算操作的结构化记录'
          },
          { transaction }
        )
        console.log('   ✅ frozen_amount_change 字段添加成功')
      }

      // 3. 检查索引是否已存在
      console.log('📊 步骤3：检查索引是否已存在...')
      const [indexes] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM asset_transactions WHERE Key_name = 'idx_frozen_change'`,
        { transaction }
      )

      if (indexes.length > 0) {
        console.log('   ⏭️ idx_frozen_change 索引已存在，跳过创建')
      } else {
        // 4. 创建索引
        console.log('📊 步骤4：创建 idx_frozen_change 索引...')
        await queryInterface.addIndex(
          'asset_transactions',
          ['account_id', 'asset_code', 'frozen_amount_change'],
          {
            name: 'idx_frozen_change',
            transaction,
            comment: '索引：账户ID + 资产代码 + 冻结变动（用于冻结余额对账查询）'
          }
        )
        console.log('   ✅ idx_frozen_change 索引创建成功')
      }

      // 5. 提交事务
      await transaction.commit()
      console.log('✅ 迁移完成：frozen_amount_change 字段和索引已就绪')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔧 开始回滚：移除 frozen_amount_change 字段')

      // 1. 删除索引
      console.log('📊 步骤1：删除 idx_frozen_change 索引...')
      const [indexes] = await queryInterface.sequelize.query(
        `SHOW INDEX FROM asset_transactions WHERE Key_name = 'idx_frozen_change'`,
        { transaction }
      )

      if (indexes.length > 0) {
        await queryInterface.removeIndex('asset_transactions', 'idx_frozen_change', { transaction })
        console.log('   ✅ idx_frozen_change 索引已删除')
      } else {
        console.log('   ⏭️ idx_frozen_change 索引不存在，跳过删除')
      }

      // 2. 删除字段
      console.log('📊 步骤2：删除 frozen_amount_change 字段...')
      const [columns] = await queryInterface.sequelize.query(
        `SHOW COLUMNS FROM asset_transactions WHERE Field = 'frozen_amount_change'`,
        { transaction }
      )

      if (columns.length > 0) {
        await queryInterface.removeColumn('asset_transactions', 'frozen_amount_change', {
          transaction
        })
        console.log('   ✅ frozen_amount_change 字段已删除')
      } else {
        console.log('   ⏭️ frozen_amount_change 字段不存在，跳过删除')
      }

      // 3. 提交事务
      await transaction.commit()
      console.log('✅ 回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
