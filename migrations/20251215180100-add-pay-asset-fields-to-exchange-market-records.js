/**
 * 迁移文件：为exchange_market_records表添加pay_asset_code和pay_amount字段
 *
 * 业务背景：
 * - 兑换市场从虚拟奖品价值支付（virtual_value_paid）迁移到材料资产扣减
 * - 需要新增pay_asset_code和pay_amount字段来记录实际支付的材料资产信息
 * - 保留旧字段virtual_value_paid用于回滚观测，但业务逻辑不再读取
 *
 * 变更内容：
 * - 添加pay_asset_code字段：实际支付的资产代码（如red_shard、red_crystal等）
 * - 添加pay_amount字段：实际支付的金额（cost_amount * quantity，BIGINT）
 * - 旧字段virtual_value_paid保留不删除，用于数据对比和回滚
 *
 * 影响范围：
 * - exchange_market_records表结构
 * - 兑换市场下单接口
 * - 兑换市场订单查询接口
 * - ExchangeMarketService相关方法
 *
 * 创建时间：2025-12-15
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：添加pay_asset_code和pay_amount字段
   *
   * 业务规则：
   * - pay_asset_code：实际扣减的材料资产代码（与exchange_items.cost_asset_code对应）
   * - pay_amount：实际扣减的材料数量（cost_amount * quantity，总扣减额）
   * - 旧字段virtual_value_paid保留，用于回滚观测
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize对象
   * @returns {Promise<void>}
   */
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 添加pay_asset_code字段（实际支付的资产代码）
      await queryInterface.addColumn(
        'exchange_market_records',
        'pay_asset_code',
        {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: '支付资产代码（Pay Asset Code - 兑换订单实际扣减的材料资产类型）：red_shard-碎红水晶、red_crystal-完整红水晶等；业务规则：新订单必填，历史订单可为null；与exchange_items.cost_asset_code对应；用途：订单支付对账、材料消耗统计、成本核算依据'
        },
        { transaction }
      )

      // 2. 添加pay_amount字段（实际支付的金额，总扣减额）
      await queryInterface.addColumn(
        'exchange_market_records',
        'pay_amount',
        {
          type: Sequelize.BIGINT,
          allowNull: true,
          comment: '支付数量（Pay Amount - 兑换订单实际扣减的材料总数量）：计算公式：cost_amount * quantity；单位根据pay_asset_code确定；业务规则：新订单必填，历史订单可为null；使用BIGINT避免浮点精度问题；用途：订单支付对账、材料消耗统计、成本核算'
        },
        { transaction }
      )

      await transaction.commit()
      console.log('✅ 成功为exchange_market_records表添加pay_asset_code和pay_amount字段')
      console.log('   - pay_asset_code: VARCHAR(50)，实际支付的资产代码（如red_shard）')
      console.log('   - pay_amount: BIGINT，实际支付的总数量（cost_amount * quantity）')
      console.log('   - 旧字段virtual_value_paid保留，用于回滚观测')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：删除pay_asset_code和pay_amount字段
   *
   * 注意：
   * - 回滚前会检查是否有使用新字段的记录
   * - 如果存在数据，拒绝回滚，需要先处理数据或迁移回virtual_value_paid
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
        'SELECT COUNT(*) as count FROM exchange_market_records WHERE pay_asset_code IS NOT NULL OR pay_amount IS NOT NULL',
        { transaction }
      )

      const count = results[0].count

      if (count > 0) {
        throw new Error(
          `无法回滚：数据库中存在${count}条使用pay_asset_code或pay_amount的记录。` +
          '请先将数据迁移回virtual_value_paid字段，或手动清理数据，然后再执行回滚。'
        )
      }

      // 删除pay_amount字段
      await queryInterface.removeColumn('exchange_market_records', 'pay_amount', {
        transaction
      })

      // 删除pay_asset_code字段
      await queryInterface.removeColumn('exchange_market_records', 'pay_asset_code', {
        transaction
      })

      await transaction.commit()
      console.log('✅ 成功从exchange_market_records表删除pay_asset_code和pay_amount字段')
      console.log('   - 系统已回滚到使用virtual_value_paid支付的模式')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
