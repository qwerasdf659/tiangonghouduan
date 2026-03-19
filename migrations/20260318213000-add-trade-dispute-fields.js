'use strict'

/**
 * 交易纠纷与售后模块 - 数据库迁移
 *
 * 变更内容：
 * 1. customer_service_issues 增加纠纷专用字段（trade_order_id、dispute_type、dispute_evidence、dispute_deadline）
 * 2. trade_orders.status 枚举增加 'disputed' 状态
 * 3. approval_chain_templates 支持 trade_dispute 类型
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      // 1. customer_service_issues 增加纠纷专用字段
      const issueDesc = await queryInterface.describeTable('customer_service_issues')

      if (!issueDesc.trade_order_id) {
        await queryInterface.addColumn('customer_service_issues', 'trade_order_id', {
          type: Sequelize.BIGINT,
          allowNull: true,
          defaultValue: null,
          comment: '关联的交易订单 ID（纠纷类型时必填）'
        }, { transaction })
      }

      if (!issueDesc.dispute_type) {
        await queryInterface.addColumn('customer_service_issues', 'dispute_type', {
          type: Sequelize.ENUM('item_not_received', 'item_mismatch', 'quality_issue', 'fraud', 'other'),
          allowNull: true,
          defaultValue: null,
          comment: '纠纷类型：未收到物品/物品不符/质量问题/欺诈/其他'
        }, { transaction })
      }

      if (!issueDesc.dispute_evidence) {
        await queryInterface.addColumn('customer_service_issues', 'dispute_evidence', {
          type: Sequelize.JSON,
          allowNull: true,
          defaultValue: null,
          comment: '纠纷证据（截图URL数组、文字描述等）'
        }, { transaction })
      }

      if (!issueDesc.dispute_deadline) {
        await queryInterface.addColumn('customer_service_issues', 'dispute_deadline', {
          type: Sequelize.DATE,
          allowNull: true,
          defaultValue: null,
          comment: '纠纷处理截止时间（超时自动升级）'
        }, { transaction })
      }

      if (!issueDesc.approval_chain_instance_id) {
        await queryInterface.addColumn('customer_service_issues', 'approval_chain_instance_id', {
          type: Sequelize.BIGINT,
          allowNull: true,
          defaultValue: null,
          comment: '关联的审批链实例 ID（仲裁流程）'
        }, { transaction })
      }

      // 2. trade_orders.status 枚举增加 'disputed'
      await queryInterface.sequelize.query(
        "ALTER TABLE trade_orders MODIFY COLUMN status ENUM('created','frozen','completed','cancelled','failed','disputed') NOT NULL DEFAULT 'created'",
        { transaction }
      )

      // 3. 添加索引
      const issueIndexes = await queryInterface.showIndex('customer_service_issues', { transaction })
      const hasTradeOrderIdx = issueIndexes.some(idx => idx.name === 'idx_csi_trade_order_id')
      if (!hasTradeOrderIdx) {
        await queryInterface.addIndex('customer_service_issues', ['trade_order_id'], {
          name: 'idx_csi_trade_order_id',
          transaction
        })
      }

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.removeIndex('customer_service_issues', 'idx_csi_trade_order_id', { transaction }).catch(() => {})
      await queryInterface.removeColumn('customer_service_issues', 'approval_chain_instance_id', { transaction }).catch(() => {})
      await queryInterface.removeColumn('customer_service_issues', 'dispute_deadline', { transaction }).catch(() => {})
      await queryInterface.removeColumn('customer_service_issues', 'dispute_evidence', { transaction }).catch(() => {})
      await queryInterface.removeColumn('customer_service_issues', 'dispute_type', { transaction }).catch(() => {})
      await queryInterface.removeColumn('customer_service_issues', 'trade_order_id', { transaction }).catch(() => {})

      await queryInterface.sequelize.query(
        "ALTER TABLE trade_orders MODIFY COLUMN status ENUM('created','frozen','completed','cancelled','failed') NOT NULL DEFAULT 'created'",
        { transaction }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
