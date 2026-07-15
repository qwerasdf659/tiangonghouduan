'use strict'

/**
 * 合规整改 阶段五（补充）：收窄客服工单订单类型枚举
 *
 * 文件路径：migrations/20260605100000-alter-table-cs-issue-order-type.js
 * 创建时间：2026-06-05（合规整改执行清单 §10.15 阶段五 Step 13 补充）
 *
 * 业务背景：
 * - C2C 交易订单（trade）已随 C2C 下线删除，customer_service_issues.order_type 中的 'trade' 已无对象
 * - 与 trade_disputes.order_type 收窄保持一致（符合"修改正确而非禁用"）
 *
 * 本迁移做一件事（基于真实库 restaurant_points_dev 实测，当前 trade 行数为 0）：
 * - customer_service_issues.order_type: ('trade','redemption','consumption') → ('redemption','consumption')
 *
 * down 回滚：可逆（恢复为三值枚举）
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE customer_service_issues
       MODIFY COLUMN order_type ENUM('redemption','consumption') NULL DEFAULT NULL
       COMMENT '关联订单类型：redemption=兑换订单, consumption=消费核销（trade 已随 C2C 下线移除）'`
    )
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TABLE customer_service_issues
       MODIFY COLUMN order_type ENUM('trade','redemption','consumption') NULL DEFAULT NULL
       COMMENT '关联订单类型：trade=交易订单, redemption=兑换订单, consumption=消费核销'`
    )
  }
}
