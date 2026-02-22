'use strict'

/**
 * DROP 已合并的内容管理表（最终清理）
 *
 * 前置条件：
 * - Phase 2 数据迁移已完成（4 条 campaign + 51 条 interaction_log）
 * - Phase 3 新路由/服务已上线并验证
 * - Phase 4 旧路由/服务已解绑
 *
 * DROP 的表（5 张）：
 * 1. popup_show_logs（36 条已迁移到 ad_interaction_logs）
 * 2. carousel_show_logs（11+4 条已迁移到 ad_interaction_logs）
 * 3. popup_banners（2 条已迁移到 ad_campaigns + ad_creatives）
 * 4. carousel_items（1 条已迁移到 ad_campaigns + ad_creatives）
 * 5. system_announcements（1 条已迁移到 ad_campaigns + ad_creatives）
 *
 * 决策依据：docs/内容投放系统-重复功能合并方案.md 第十五节 Phase 7
 * D7 定论：项目未上线，直接删除，无需 410 过渡期
 *
 * @version 5.0.0
 * @date 2026-02-22
 */
module.exports = {
  async up(queryInterface) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 按外键依赖顺序 DROP（子表先删）
      const tablesToDrop = [
        'popup_show_logs',
        'carousel_show_logs',
        'popup_banners',
        'carousel_items',
        'system_announcements'
      ]

      for (const table of tablesToDrop) {
        const [rows] = await queryInterface.sequelize.query(
          `SHOW TABLES LIKE '${table}'`,
          { transaction }
        )
        if (rows.length > 0) {
          await queryInterface.dropTable(table, { transaction })
          console.log(`✅ DROP TABLE ${table}`)
        } else {
          console.log(`⏭️ 表 ${table} 不存在，跳过`)
        }
      }

      await transaction.commit()
      console.log('✅ 已合并的内容管理表全部清理完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ DROP 失败:', error.message)
      throw error
    }
  },

  async down() {
    console.warn('⚠️ 此迁移不支持回滚（已删除的表需要通过 baseline 迁移重建）')
  }
}
