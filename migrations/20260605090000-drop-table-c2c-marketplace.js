'use strict'

/**
 * 合规整改 阶段五：删除 C2C 二级市场表 + 收窄售后申诉订单类型枚举
 *
 * 文件路径：migrations/20260605090000-drop-table-c2c-marketplace.js
 * 创建时间：2026-06-05（合规整改执行清单 §10.15 阶段五 Step 13）
 *
 * 业务背景：
 * - 系统已关闭 C2C 用户间交易，改为用户↔官方 B2C 单向（道具商城走 exchange 域，官方竞价走 exchange/bid）
 * - 阶段五在 exchange/exchange-bid 验收通过后，删除纯 C2C 专属表与死代码（决策 2/9'）
 *
 * 本迁移做两件事（均基于真实库 restaurant_points_dev 实测，执行当天先跑阶段零盘点）：
 * ① 按外键依赖顺序 DROP 5 张纯 C2C 表：
 *    trade_orders → auction_bids → market_listings → auction_listings → market_price_snapshots
 *    （trade_orders.market_listing_id → market_listings；auction_bids.auction_listing_id → auction_listings）
 *    保留：bid_products / bid_records（B2O 官方竞价引擎在用）、exchange_items / exchange_records（B2C 共享）
 * ② 收窄 trade_disputes.order_type 枚举：('trade','redemption','consumption','auction') → ('redemption','consumption')
 *    —— C2C 的 trade/auction 售后已无对象，保留兑换/消费售后（符合"修改正确而非禁用"）
 *
 * down 回滚：
 * - ① C2C 表删除属合规不可逆（B2C 单向不再保留二级市场），down 不重建表结构（仅文档说明）
 * - ② 枚举收窄可逆：down 恢复为四值枚举
 */

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize

    // 关闭外键检查，按依赖顺序安全删除（MySQL 8.0）
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0')

    try {
      // ① 收窄 trade_disputes.order_type 枚举（先收窄，避免删表后残留无效枚举值语义）
      //    实测当前无 trade/auction 行（C2C 未上线），收窄不丢数据
      await sequelize.query(
        `ALTER TABLE trade_disputes
         MODIFY COLUMN order_type ENUM('redemption','consumption') NOT NULL
         COMMENT '订单类型：redemption-兑换订单 / consumption-消费核销（C2C trade/auction 已随 C2C 下线移除）'`
      )

      // ② 按外键依赖顺序 DROP 纯 C2C 表
      const dropOrder = [
        'trade_orders', // FK → market_listings，须先删
        'auction_bids', // FK → auction_listings，须先删
        'market_listings',
        'auction_listings',
        'market_price_snapshots'
      ]
      for (const table of dropOrder) {
        await queryInterface.dropTable(table)
      }
    } finally {
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1')
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize

    /*
     * 仅回滚可逆部分：恢复 trade_disputes.order_type 四值枚举
     * C2C 表（trade_orders/auction_bids/market_listings/auction_listings/market_price_snapshots）
     * 属合规不可逆删除，如确需恢复请走专门的 create-table 迁移重建结构
     */
    await sequelize.query(
      `ALTER TABLE trade_disputes
       MODIFY COLUMN order_type ENUM('trade','redemption','consumption','auction') NOT NULL
       COMMENT '订单类型（多态）'`
    )
  }
}
