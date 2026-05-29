'use strict'

/**
 * 迁移：客服工单表新增订单多态关联字段
 *
 * 变更说明：
 * - 新增 order_type ENUM('trade','redemption','consumption') 字段
 * - 新增 order_id VARCHAR(64) 字段（统一字符串存储，兼容 BIGINT 和 UUID 主键）
 * - 新增复合索引 idx_issues_order_polymorphic (order_type, order_id)
 * - 删除旧字段 trade_order_id 及其索引 idx_csi_trade_order_id
 *
 * 前置条件验证：customer_service_issues 表当前 0 条数据，无数据迁移风险
 *
 * @version 1.0.0
 * @date 2026-05-27
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      // 1. 新增 order_type 字段（多态订单类型标识）
      await queryInterface.addColumn(
        'customer_service_issues',
        'order_type',
        {
          type: Sequelize.ENUM('trade', 'redemption', 'consumption'),
          allowNull: true,
          defaultValue: null,
          comment: '关联订单类型（多态标识）：trade=交易订单, redemption=兑换订单, consumption=消费核销'
        },
        { transaction }
      )

      // 2. 新增 order_id 字段（多态订单ID，统一字符串存储）
      await queryInterface.addColumn(
        'customer_service_issues',
        'order_id',
        {
          type: Sequelize.STRING(64),
          allowNull: true,
          defaultValue: null,
          comment: '关联订单ID（多态值，统一字符串存储兼容 BIGINT 和 UUID）'
        },
        { transaction }
      )

      // 3. 新增复合索引（支持按订单查询关联工单）
      await queryInterface.addIndex('customer_service_issues', ['order_type', 'order_id'], {
        name: 'idx_issues_order_polymorphic',
        transaction
      })

      // 4. 删除旧索引 idx_csi_trade_order_id
      await queryInterface.removeIndex('customer_service_issues', 'idx_csi_trade_order_id', {
        transaction
      })

      // 5. 删除旧字段 trade_order_id（表为空，无需数据迁移）
      await queryInterface.removeColumn('customer_service_issues', 'trade_order_id', {
        transaction
      })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      // 恢复 trade_order_id 字段
      await queryInterface.addColumn(
        'customer_service_issues',
        'trade_order_id',
        {
          type: Sequelize.BIGINT,
          allowNull: true,
          defaultValue: null,
          comment: '关联的交易订单 ID（纠纷类型时必填）'
        },
        { transaction }
      )

      // 恢复旧索引
      await queryInterface.addIndex('customer_service_issues', ['trade_order_id'], {
        name: 'idx_csi_trade_order_id',
        transaction
      })

      // 删除新增的复合索引
      await queryInterface.removeIndex('customer_service_issues', 'idx_issues_order_polymorphic', {
        transaction
      })

      // 删除新增字段
      await queryInterface.removeColumn('customer_service_issues', 'order_id', { transaction })
      await queryInterface.removeColumn('customer_service_issues', 'order_type', { transaction })

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
