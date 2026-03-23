'use strict'

/**
 * 迁移：effect_theme 字段改为可空，支持继承全局氛围主题
 *
 * 业务背景：
 * - lottery_campaigns.effect_theme 原默认值为 'default'，前端无法区分
 *   "运营主动选了 default" 和 "运营没配置，应该继承全局 app_theme"
 * - 改为 NULL 表示"未配置，继承全局 app_theme"，非空表示"活动级覆盖"
 *
 * 变更内容：
 * 1. effect_theme 列：NOT NULL DEFAULT 'default' → NULL DEFAULT NULL
 * 2. 现有 effect_theme = 'default' 的记录 → 更新为 NULL（继承全局）
 * 3. 现有 effect_theme 为非法值（不在6套枚举中）的记录 → 更新为 NULL
 *
 * @date 2026-03-07
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 第1步：修改列定义 — 允许 NULL，去掉默认值
    await queryInterface.changeColumn('lottery_campaigns', 'effect_theme', {
      type: Sequelize.STRING(30),
      allowNull: true,
      defaultValue: null,
      comment:
        '活动级特效主题: null=继承全局app_theme | default/gold_luxury/purple_mystery/spring_festival/christmas/summer'
    })

    // 第2步：将 'default' 值更新为 NULL（语义：未配置，继承全局）
    await queryInterface.sequelize.query(
      "UPDATE `lottery_campaigns` SET `effect_theme` = NULL WHERE `effect_theme` = 'default'"
    )

    // 第3步：将非法枚举值更新为 NULL（如 seeder 中的 'crystal' 等无效值）
    await queryInterface.sequelize.query(
      "UPDATE `lottery_campaigns` SET `effect_theme` = NULL WHERE `effect_theme` NOT IN ('default', 'gold_luxury', 'purple_mystery', 'spring_festival', 'christmas', 'summer')"
    )
  },

  async down(queryInterface, Sequelize) {
    // 回滚：NULL 恢复为 'default'
    await queryInterface.sequelize.query(
      "UPDATE `lottery_campaigns` SET `effect_theme` = 'default' WHERE `effect_theme` IS NULL"
    )

    // 恢复列定义
    await queryInterface.changeColumn('lottery_campaigns', 'effect_theme', {
      type: Sequelize.STRING(30),
      allowNull: false,
      defaultValue: 'default',
      comment:
        '特效主题（6套）: default/gold_luxury/purple_mystery/spring_festival/christmas/summer'
    })
  }
}
