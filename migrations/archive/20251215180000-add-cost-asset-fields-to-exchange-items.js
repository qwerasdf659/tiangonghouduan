/**
 * 迁移文件：为exchange_items表添加cost_asset_code和cost_amount字段
 *
 * 业务背景：
 * - 兑换市场从虚拟奖品价值支付（virtual_value_price）迁移到材料资产扣减
 * - 需要新增cost_asset_code和cost_amount字段来支持材料资产支付
 * - 保留旧字段virtual_value_price用于回滚观测，但业务逻辑不再读取
 *
 * 变更内容：
 * - 添加cost_asset_code字段：材料资产代码（如red_shard、red_crystal等）
 * - 添加cost_amount字段：单件成本（BIGINT，避免浮点精度问题）
 * - 旧字段virtual_value_price保留不删除，用于数据对比和回滚
 *
 * 影响范围：
 * - exchange_items表结构
 * - 兑换市场商品管理接口
 * - 兑换市场下单接口
 * - ExchangeService相关方法
 *
 * 创建时间：2025-12-15
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：添加cost_asset_code和cost_amount字段
   *
   * 业务规则：
   * - cost_asset_code：兑换商品消耗的材料资产代码（如red_shard、red_crystal）
   * - cost_amount：单件商品的材料成本，使用BIGINT存储避免浮点数精度问题
   * - 旧字段virtual_value_price保留，用于回滚观测
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize对象
   * @returns {Promise<void>}
   */
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 添加cost_asset_code字段（材料资产代码）
      await queryInterface.addColumn(
        'exchange_items',
        'cost_asset_code',
        {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment:
            '成本资产代码（Cost Asset Code - 兑换商品消耗的材料资产类型）：red_shard-碎红水晶、red_crystal-完整红水晶等；业务规则：新商品必填，历史商品可为null；支持多种材料资产扩展；用途：兑换支付资产类型、库存扣减依据、成本核算基础'
        },
        { transaction }
      )

      // 2. 添加cost_amount字段（单件成本，BIGINT避免浮点精度问题）
      await queryInterface.addColumn(
        'exchange_items',
        'cost_amount',
        {
          type: Sequelize.BIGINT,
          allowNull: true,
          comment:
            '成本数量（Cost Amount - 兑换单件商品需要的材料数量）：单位根据cost_asset_code确定（如10个碎红水晶）；业务规则：新商品必填，历史商品可为null；使用BIGINT避免浮点精度问题；数据范围：1-1000000；用途：兑换扣减材料数量、成本核算、商品定价参考'
        },
        { transaction }
      )

      await transaction.commit()
      console.log('✅ 成功为exchange_items表添加cost_asset_code和cost_amount字段')
      console.log('   - cost_asset_code: VARCHAR(50)，材料资产代码（如red_shard）')
      console.log('   - cost_amount: BIGINT，单件成本数量（单位：材料个数）')
      console.log('   - 旧字段virtual_value_price保留，用于回滚观测')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：删除cost_asset_code和cost_amount字段
   *
   * 注意：
   * - 回滚前会检查是否有使用新字段的记录
   * - 如果存在数据，拒绝回滚，需要先处理数据或迁移回virtual_value_price
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize对象
   * @returns {Promise<void>}
   */
  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 检查是否有使用新字段的记录
      const [results] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM exchange_items WHERE cost_asset_code IS NOT NULL OR cost_amount IS NOT NULL',
        { transaction }
      )

      const count = results[0].count

      if (count > 0) {
        throw new Error(
          `无法回滚：数据库中存在${count}条使用cost_asset_code或cost_amount的记录。` +
            '请先将数据迁移回virtual_value_price字段，或手动清理数据，然后再执行回滚。'
        )
      }

      // 删除cost_amount字段
      await queryInterface.removeColumn('exchange_items', 'cost_amount', {
        transaction
      })

      // 删除cost_asset_code字段
      await queryInterface.removeColumn('exchange_items', 'cost_asset_code', {
        transaction
      })

      await transaction.commit()
      console.log('✅ 成功从exchange_items表删除cost_asset_code和cost_amount字段')
      console.log('   - 系统已回滚到使用virtual_value_price定价的模式')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
