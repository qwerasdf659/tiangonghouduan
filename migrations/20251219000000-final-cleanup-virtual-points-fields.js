'use strict'

/**
 * 迁移：最终清理兑换市场表中的virtual/points旧字段（V4.5.0统一版）
 *
 * 业务背景：
 * - V4.5.0已统一为材料资产支付（cost_asset_code + cost_amount）
 * - 模型层已删除virtual/points字段定义
 * - 数据库层需要删除对应字段以完成暴力重构
 *
 * 影响范围：
 * - exchange_items表：删除price_type、virtual_value_price、points_price
 * - exchange_market_records表：删除payment_type、virtual_value_paid、points_paid
 *
 * 回滚策略：
 * - 提供完整的字段恢复SQL（保留字段定义但数据无法恢复）
 * - 回滚后需要重新填充cost_asset_code/cost_amount数据
 *
 * 创建时间：2025-12-19
 * 创建方式：手动创建（暴力重构统一版）
 */

module.exports = {
  /**
   * 执行迁移：删除exchange_items和exchange_market_records中的旧字段
   *
   * @param {import('sequelize').QueryInterface} queryInterface - Sequelize查询接口
   * @param {import('sequelize').Sequelize} Sequelize - Sequelize实例
   * @returns {Promise<void>} 迁移完成后resolve
   */
  async up(queryInterface, Sequelize) {
    console.log('🔄 [迁移] 开始删除兑换市场表中的virtual/points旧字段...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 删除 exchange_items 表的旧字段
      console.log('  ├─ 删除 exchange_items 表旧字段...')

      // 删除 price_type 字段（ENUM类型）
      await queryInterface.removeColumn('exchange_items', 'price_type', { transaction })
      console.log('    ✅ 已删除 price_type 字段')

      // 删除 virtual_value_price 字段
      await queryInterface.removeColumn('exchange_items', 'virtual_value_price', { transaction })
      console.log('    ✅ 已删除 virtual_value_price 字段')

      // 删除 points_price 字段
      await queryInterface.removeColumn('exchange_items', 'points_price', { transaction })
      console.log('    ✅ 已删除 points_price 字段')

      // 2. 删除 exchange_market_records 表的旧字段
      console.log('  ├─ 删除 exchange_market_records 表旧字段...')

      // 删除 payment_type 字段（ENUM类型）
      await queryInterface.removeColumn('exchange_market_records', 'payment_type', { transaction })
      console.log('    ✅ 已删除 payment_type 字段')

      // 删除 virtual_value_paid 字段
      await queryInterface.removeColumn('exchange_market_records', 'virtual_value_paid', {
        transaction
      })
      console.log('    ✅ 已删除 virtual_value_paid 字段')

      // 删除 points_paid 字段
      await queryInterface.removeColumn('exchange_market_records', 'points_paid', { transaction })
      console.log('    ✅ 已删除 points_paid 字段')

      // 3. 验证必填字段存在（确保cost_asset_code/cost_amount已迁移）
      console.log('  ├─ 验证必填字段存在...')
      const [itemsResult] = await queryInterface.sequelize.query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN cost_asset_code IS NULL THEN 1 ELSE 0 END) as missing_asset_code,
          SUM(CASE WHEN cost_amount IS NULL THEN 1 ELSE 0 END) as missing_amount
        FROM exchange_items`,
        { transaction }
      )

      if (itemsResult[0].missing_asset_code > 0 || itemsResult[0].missing_amount > 0) {
        throw new Error(
          `exchange_items表有${itemsResult[0].missing_asset_code}条记录缺少cost_asset_code，` +
            `${itemsResult[0].missing_amount}条记录缺少cost_amount。` +
            `请先执行数据迁移填充这些字段。`
        )
      }

      const [recordsResult] = await queryInterface.sequelize.query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN pay_asset_code IS NULL THEN 1 ELSE 0 END) as missing_asset_code,
          SUM(CASE WHEN pay_amount IS NULL THEN 1 ELSE 0 END) as missing_amount
        FROM exchange_market_records`,
        { transaction }
      )

      if (recordsResult[0].missing_asset_code > 0 || recordsResult[0].missing_amount > 0) {
        throw new Error(
          `exchange_market_records表有${recordsResult[0].missing_asset_code}条记录缺少pay_asset_code，` +
            `${recordsResult[0].missing_amount}条记录缺少pay_amount。` +
            `请先执行数据迁移填充这些字段。`
        )
      }

      console.log(
        `    ✅ 验证通过：exchange_items有${itemsResult[0].total}条记录，all have cost fields`
      )
      console.log(
        `    ✅ 验证通过：exchange_market_records有${recordsResult[0].total}条记录，all have pay fields`
      )

      await transaction.commit()
      console.log('✅ [迁移] 成功删除所有virtual/points旧字段')
      console.log('📝 [提示] V4.5.0材料资产支付统一版已生效')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [迁移] 删除旧字段失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：恢复旧字段（数据无法恢复，仅恢复字段结构）
   *
   * @param {import('sequelize').QueryInterface} queryInterface - Sequelize查询接口
   * @param {import('sequelize').Sequelize} Sequelize - Sequelize实例
   * @returns {Promise<void>} 回滚完成后resolve
   */
  async down(queryInterface, Sequelize) {
    console.log('⏪ [回滚] 开始恢复virtual/points旧字段...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 恢复 exchange_items 表的旧字段
      console.log('  ├─ 恢复 exchange_items 表旧字段...')

      await queryInterface.addColumn(
        'exchange_items',
        'price_type',
        {
          type: Sequelize.ENUM('virtual'),
          allowNull: true,
          defaultValue: 'virtual',
          comment: '支付方式（已废弃）'
        },
        { transaction }
      )

      await queryInterface.addColumn(
        'exchange_items',
        'virtual_value_price',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          defaultValue: 0,
          comment: '虚拟奖品价格（已废弃）'
        },
        { transaction }
      )

      await queryInterface.addColumn(
        'exchange_items',
        'points_price',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          defaultValue: 0,
          comment: '积分价格（已废弃）'
        },
        { transaction }
      )

      // 2. 恢复 exchange_market_records 表的旧字段
      console.log('  ├─ 恢复 exchange_market_records 表旧字段...')

      await queryInterface.addColumn(
        'exchange_market_records',
        'payment_type',
        {
          type: Sequelize.ENUM('virtual'),
          allowNull: true,
          defaultValue: 'virtual',
          comment: '支付方式（已废弃）'
        },
        { transaction }
      )

      await queryInterface.addColumn(
        'exchange_market_records',
        'virtual_value_paid',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          defaultValue: 0,
          comment: '消耗虚拟奖品价值（已废弃）'
        },
        { transaction }
      )

      await queryInterface.addColumn(
        'exchange_market_records',
        'points_paid',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          defaultValue: 0,
          comment: '消耗积分（已废弃）'
        },
        { transaction }
      )

      await transaction.commit()
      console.log('✅ [回滚] 成功恢复所有旧字段（数据已丢失，需手动填充）')
      console.log('⚠️  [警告] 旧字段已恢复但数据为空，需要从备份恢复或重新填充')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [回滚] 恢复旧字段失败:', error.message)
      throw error
    }
  }
}
