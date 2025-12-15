/**
 * 迁移文件：为user_inventory表添加selling_asset_code和selling_amount字段
 *
 * 业务背景：
 * - 交易市场从积分定价（selling_points）迁移到DIAMOND资产定价
 * - 需要新增selling_asset_code和selling_amount字段来支持DIAMOND结算
 * - 保留旧字段selling_points用于回滚观测，但业务逻辑不再读取
 *
 * 变更内容：
 * - 添加selling_asset_code字段：资产代码（如DIAMOND），只允许'DIAMOND'值
 * - 添加selling_amount字段：售价金额（BIGINT，避免浮点精度问题）
 * - 旧字段selling_points保留不删除，用于数据对比和回滚
 *
 * 影响范围：
 * - user_inventory表结构
 * - 市场上架、购买、列表查询接口
 * - InventoryService相关方法
 *
 * 创建时间：2025-12-15
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：添加selling_asset_code和selling_amount字段
   *
   * 业务规则：
   * - selling_asset_code：交易市场唯一结算币种，只允许'DIAMOND'
   * - selling_amount：使用BIGINT存储，避免浮点数精度问题
   * - 旧字段selling_points保留，用于回滚观测
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize对象
   * @returns {Promise<void>}
   */
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 添加selling_asset_code字段（资产代码，只允许DIAMOND）
      await queryInterface.addColumn(
        'user_inventory',
        'selling_asset_code',
        {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: '出售资产代码（Selling Asset Code - 市场售价的资产类型）：DIAMOND-钻石资产（交易市场唯一结算币种）；业务规则：上架时必填且只允许DIAMOND，撤回后清空为null；用途：市场价格资产类型、交易结算依据、多资产扩展预留'
        },
        { transaction }
      )

      // 2. 添加selling_amount字段（售价金额，BIGINT避免浮点精度问题）
      await queryInterface.addColumn(
        'user_inventory',
        'selling_amount',
        {
          type: Sequelize.BIGINT,
          allowNull: true,
          comment: '出售金额（Selling Amount - 市场售价金额，单位：DIAMOND）：卖家自定义价格，使用BIGINT避免浮点精度问题；业务规则：上架时必填，撤回后清空为null；数据范围：1-1000000 DIAMOND；用途：市场价格排序、交易金额计算、成本收益分析'
        },
        { transaction }
      )

      await transaction.commit()
      console.log('✅ 成功为user_inventory表添加selling_asset_code和selling_amount字段')
      console.log('   - selling_asset_code: VARCHAR(50)，资产代码（只允许DIAMOND）')
      console.log('   - selling_amount: BIGINT，售价金额（单位DIAMOND）')
      console.log('   - 旧字段selling_points保留，用于回滚观测')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：删除selling_asset_code和selling_amount字段
   *
   * 注意：
   * - 回滚前会检查是否有使用新字段的记录
   * - 如果存在数据，拒绝回滚，需要先处理数据或迁移回selling_points
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize对象
   * @returns {Promise<void>}
   */
  async down (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 检查是否有使用新字段的记录
      const [results] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM user_inventory WHERE selling_asset_code IS NOT NULL OR selling_amount IS NOT NULL',
        { transaction }
      )

      const count = results[0].count

      if (count > 0) {
        throw new Error(
          `无法回滚：数据库中存在${count}条使用selling_asset_code或selling_amount的记录。` +
          '请先将数据迁移回selling_points字段，或手动清理数据，然后再执行回滚。'
        )
      }

      // 删除selling_amount字段
      await queryInterface.removeColumn('user_inventory', 'selling_amount', {
        transaction
      })

      // 删除selling_asset_code字段
      await queryInterface.removeColumn('user_inventory', 'selling_asset_code', {
        transaction
      })

      await transaction.commit()
      console.log('✅ 成功从user_inventory表删除selling_asset_code和selling_amount字段')
      console.log('   - 系统已回滚到使用selling_points定价的模式')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
