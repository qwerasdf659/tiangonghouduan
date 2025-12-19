/**
 * 迁移：为材料资产支付字段添加 NOT NULL 约束
 *
 * 业务背景：
 * - 兑换市场已完全迁移到材料资产支付模式
 * - cost_asset_code 和 cost_amount 字段必须有值
 * - pay_asset_code 和 pay_amount 字段必须有值
 * - 添加数据库层面的 NOT NULL 约束，确保数据完整性
 *
 * 影响范围：
 * - exchange_items 表：cost_asset_code, cost_amount
 * - exchange_market_records 表：pay_asset_code, pay_amount
 *
 * 前置条件：
 * - 20251218230000-migrate-virtual-price-to-material-cost.js 已执行
 * - 20251219000000-final-cleanup-virtual-points-fields.js 已执行
 * - 所有现有数据的材料资产字段已填充
 *
 * @version 4.0.0
 * @date 2025-12-19
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：添加 NOT NULL 约束
   */
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔧 开始添加 NOT NULL 约束...')

      // ========================================
      // 1. 验证数据完整性（确保没有 NULL 值）
      // ========================================
      console.log('✅ 步骤1: 验证 exchange_items 数据完整性')
      const [itemsNullCheck] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as null_count 
         FROM exchange_items 
         WHERE cost_asset_code IS NULL OR cost_amount IS NULL`,
        { transaction }
      )

      if (itemsNullCheck[0].null_count > 0) {
        throw new Error(
          `❌ exchange_items 表存在 ${itemsNullCheck[0].null_count} 条 NULL 数据，无法添加 NOT NULL 约束`
        )
      }
      console.log('   ✅ exchange_items: 所有记录的材料资产字段均有值')

      console.log('✅ 步骤2: 验证 exchange_market_records 数据完整性')
      const [recordsNullCheck] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as null_count 
         FROM exchange_market_records 
         WHERE pay_asset_code IS NULL OR pay_amount IS NULL`,
        { transaction }
      )

      if (recordsNullCheck[0].null_count > 0) {
        throw new Error(
          `❌ exchange_market_records 表存在 ${recordsNullCheck[0].null_count} 条 NULL 数据，无法添加 NOT NULL 约束`
        )
      }
      console.log('   ✅ exchange_market_records: 所有记录的材料资产字段均有值')

      // ========================================
      // 2. 修改 exchange_items 表字段约束
      // ========================================
      console.log('✅ 步骤3: 修改 exchange_items.cost_asset_code 为 NOT NULL')
      await queryInterface.changeColumn(
        'exchange_items',
        'cost_asset_code',
        {
          type: Sequelize.STRING(50),
          allowNull: false,
          comment: '兑换成本资产代码（材料资产支付）'
        },
        { transaction }
      )

      console.log('✅ 步骤4: 修改 exchange_items.cost_amount 为 NOT NULL')
      await queryInterface.changeColumn(
        'exchange_items',
        'cost_amount',
        {
          type: Sequelize.BIGINT,
          allowNull: false,
          comment: '兑换成本数量（材料资产支付）'
        },
        { transaction }
      )

      // ========================================
      // 3. 修改 exchange_market_records 表字段约束
      // ========================================
      console.log('✅ 步骤5: 修改 exchange_market_records.pay_asset_code 为 NOT NULL')
      await queryInterface.changeColumn(
        'exchange_market_records',
        'pay_asset_code',
        {
          type: Sequelize.STRING(50),
          allowNull: false,
          comment: '实际支付资产代码（材料资产支付）'
        },
        { transaction }
      )

      console.log('✅ 步骤6: 修改 exchange_market_records.pay_amount 为 NOT NULL')
      await queryInterface.changeColumn(
        'exchange_market_records',
        'pay_amount',
        {
          type: Sequelize.BIGINT,
          allowNull: false,
          comment: '实际支付数量（材料资产支付）'
        },
        { transaction }
      )

      // ========================================
      // 4. 验证约束添加成功
      // ========================================
      console.log('✅ 步骤7: 验证约束添加成功')
      const [itemsSchema] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME, IS_NULLABLE 
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
           AND TABLE_NAME = 'exchange_items' 
           AND COLUMN_NAME IN ('cost_asset_code', 'cost_amount')`,
        { transaction }
      )

      const [recordsSchema] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME, IS_NULLABLE 
         FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() 
           AND TABLE_NAME = 'exchange_market_records' 
           AND COLUMN_NAME IN ('pay_asset_code', 'pay_amount')`,
        { transaction }
      )

      const allNotNull = [...itemsSchema, ...recordsSchema].every(col => col.IS_NULLABLE === 'NO')
      if (!allNotNull) {
        throw new Error('❌ 约束添加失败：部分字段仍然允许 NULL')
      }

      await transaction.commit()

      console.log('✅ NOT NULL 约束添加成功')
      console.log('📊 影响范围:')
      console.log('   - exchange_items: cost_asset_code, cost_amount')
      console.log('   - exchange_market_records: pay_asset_code, pay_amount')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：移除 NOT NULL 约束
   */
  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始回滚 NOT NULL 约束...')

      // 回滚 exchange_items 表
      await queryInterface.changeColumn(
        'exchange_items',
        'cost_asset_code',
        {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: '兑换成本资产代码（材料资产支付）'
        },
        { transaction }
      )

      await queryInterface.changeColumn(
        'exchange_items',
        'cost_amount',
        {
          type: Sequelize.BIGINT,
          allowNull: true,
          comment: '兑换成本数量（材料资产支付）'
        },
        { transaction }
      )

      // 回滚 exchange_market_records 表
      await queryInterface.changeColumn(
        'exchange_market_records',
        'pay_asset_code',
        {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: '实际支付资产代码（材料资产支付）'
        },
        { transaction }
      )

      await queryInterface.changeColumn(
        'exchange_market_records',
        'pay_amount',
        {
          type: Sequelize.BIGINT,
          allowNull: true,
          comment: '实际支付数量（材料资产支付）'
        },
        { transaction }
      )

      await transaction.commit()
      console.log('✅ NOT NULL 约束已回滚')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
