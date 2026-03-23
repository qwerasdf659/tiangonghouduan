'use strict'

/**
 * 迁移：禁用 POINTS 资产类型
 *
 * 业务背景：POINTS 是旧版积分资产类型，V4 统一资产架构已不使用。
 * 保留数据但设置 is_enabled=0，使其不出现在用户背包和交易界面中。
 *
 * 同时清理测试残留的 exchange_items 数据（ID 196/209/215/220）
 */
module.exports = {
  async up(queryInterface) {
    // 1. 禁用 POINTS 资产类型
    await queryInterface.sequelize.query(
      `UPDATE material_asset_types SET is_enabled = 0 WHERE asset_code = 'POINTS' AND is_enabled = 1`
    )

    // 2. 清理测试残留的兑换商品数据（硬删除）
    // 先检查这些商品是否有关联的兑换订单
    const [orders] = await queryInterface.sequelize.query(
      `SELECT exchange_item_id, COUNT(*) as order_count
       FROM exchange_records
       WHERE exchange_item_id IN (196, 209, 215, 220)
       GROUP BY exchange_item_id`
    )

    // 有关联订单的商品只设为 inactive，无关联的直接删除
    const itemsWithOrders = new Set(orders.map(o => o.exchange_item_id))

    for (const itemId of [196, 209, 215, 220]) {
      if (itemsWithOrders.has(itemId) || itemsWithOrders.has(String(itemId))) {
        await queryInterface.sequelize.query(
          `UPDATE exchange_items SET status = 'inactive' WHERE exchange_item_id = ?`,
          { replacements: [itemId] }
        )
      } else {
        await queryInterface.sequelize.query(
          `DELETE FROM exchange_items WHERE exchange_item_id = ?`,
          { replacements: [itemId] }
        )
      }
    }
  },

  async down(queryInterface) {
    // 回滚：恢复 POINTS 为启用状态
    await queryInterface.sequelize.query(
      `UPDATE material_asset_types SET is_enabled = 1 WHERE asset_code = 'POINTS'`
    )

    // 测试数据删除不可回滚（硬删除无法恢复）
  }
}
