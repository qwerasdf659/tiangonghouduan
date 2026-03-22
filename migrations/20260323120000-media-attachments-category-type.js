'use strict'

/**
 * 将 media_attachments 中已废弃的 attachable_type 值 category_def 统一为 category
 *
 * 业务背景：category_defs 表已迁移为 categories，多态关联类型名需与 Category 模型 scope 一致
 * 数据校验：attachable_id 1–9 与 categories.category_id 一一对应（见 docs/技术债务 §1.2）
 *
 * @see docs/技术债务.md §1.2 D6
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `UPDATE media_attachments SET attachable_type = 'category' WHERE attachable_type = 'category_def'`
    )
  },

  async down(queryInterface) {
    // 仅回滚历史上由 category_def 迁出的记录（attachable_id 与首批品类 ID 重合区间）
    await queryInterface.sequelize.query(
      `UPDATE media_attachments SET attachable_type = 'category_def'
       WHERE attachable_type = 'category' AND attachable_id BETWEEN 1 AND 9`
    )
  }
}
