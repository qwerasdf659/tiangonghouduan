'use strict'

/**
 * 修复 media_attachments 表中 attachable_type = 'category_def' 的历史数据
 *
 * 背景：category_defs 表已删除并合并到 categories 表，
 * 但 media_attachments 中仍有 9 条记录引用旧的 'category_def' 类型。
 * 经验证 attachable_id 1-9 与 categories.category_id 1-9 完全一一对应，
 * 可直接 UPDATE，无需映射脚本。
 *
 * @see docs/技术债务.md §1.2
 */
module.exports = {
  up: async (queryInterface) => {
    const [results] = await queryInterface.sequelize.query(
      "SELECT COUNT(*) as cnt FROM media_attachments WHERE attachable_type = 'category_def'"
    )
    const count = results[0].cnt

    if (count > 0) {
      await queryInterface.sequelize.query(
        "UPDATE media_attachments SET attachable_type = 'category' WHERE attachable_type = 'category_def'"
      )
      console.log(`✅ 已将 ${count} 条 media_attachments.attachable_type 从 'category_def' 更新为 'category'`)
    } else {
      console.log('ℹ️  media_attachments 中无 category_def 类型记录，跳过')
    }
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query(
      "UPDATE media_attachments SET attachable_type = 'category_def' WHERE attachable_type = 'category'"
    )
    console.log('⏪ 已将 media_attachments.attachable_type 从 category 回滚为 category_def')
  }
}
