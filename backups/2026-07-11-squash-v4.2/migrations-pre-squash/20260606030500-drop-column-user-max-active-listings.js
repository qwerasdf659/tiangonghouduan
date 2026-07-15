'use strict'

/**
 * 合规整改 阶段五（补充）：删除 users 表的 C2C 残留列 max_active_listings
 *
 * 文件路径：migrations/20260606030500-drop-column-user-max-active-listings.js
 * 创建时间：2026-06-06（合规整改执行清单 §10.15 阶段五 收尾）
 *
 * 业务背景：
 * - users.max_active_listings 是 C2C「用户个性化最大同时上架数」覆盖值（2026-02-18 运营精细化）。
 * - C2C 用户间交易（挂单/上架）已于 2026-06-05 阶段五整体下线，该列已无任何代码读写，
 *   仅残留在模型定义、DataSanitizer 屏蔽列表与字段一致性 fixture 中，属 C2C 死字段。
 *
 * 本迁移做一件事（基于真实库 restaurant_points_dev 实测：可空 int，仅 2 行非 NULL 残留值）：
 * - 删除 users.max_active_listings 列。
 *
 * down 回滚：可逆（重新加列，但历史 2 行的 C2C 残留值不恢复，与去交易化同属不可逆业务数据）。
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.removeColumn('users', 'max_active_listings')
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'max_active_listings', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: null,
      comment: '用户个性化最大上架数量限制（NULL=使用全局默认值）'
    })
  }
}
