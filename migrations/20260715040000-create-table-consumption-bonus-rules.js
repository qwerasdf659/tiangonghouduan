'use strict'

/**
 * 创建表 consumption_bonus_rules —— 消费加成活动规则（多活动独立倍率）
 *
 * 业务背景（消费加成活动·方案C，2026-07-15 拍板）：
 * - 替代原全局单值 system_settings.points/activity_bonus_rate（无法按活动区分），
 *   支持多个消费加成活动并行，各自独立倍率/时间窗/生效范围（门店·商家）。
 * - 全平台活动（store_ids/merchant_ids 均 NULL）与单商家专属活动（任一非空）并存于本表。
 * - 命中判定：消费审核提交时按"门店/商家/时间窗"自动匹配（用户/商家零选择成本），
 *   商家专属活动优先于全平台活动；同组多命中按 priority 取最高。
 * - 命中的 bonus_rate 锁定到 consumption_records.activity_bonus_rate_locked，发放侧逻辑不变。
 *
 * 设计对齐 event_budget_collection_rules（已生产验证的同构模式）：配置实体、数字主键、
 * store_ids/merchant_ids JSON 弱引用（NULL=不限）、时间窗、优先级、status 开关。
 *
 * 回滚：dropTable（配置数据，无互锁依赖）。
 */

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      "CREATE TABLE IF NOT EXISTS `consumption_bonus_rules` (\n" +
        '  `consumption_bonus_rule_id` bigint NOT NULL AUTO_INCREMENT COMMENT \'消费加成活动规则主键\',\n' +
        '  `rule_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT \'规则名（对内运营识别，如"双11消费加成"）\',\n' +
        '  `display_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT \'对用户展示名（如"双11消费多送50%积分"）\',\n' +
        "  `bonus_rate` decimal(4,2) NOT NULL COMMENT '活动加成率（如 0.50=多送50%积分）；与等级倍率加法叠加，受总倍数3.0硬封顶',\n" +
        "  `store_ids` json DEFAULT NULL COMMENT '命中门店ID数组（消费记录 store_id 在列表内才命中）；NULL=不限门店',\n" +
        "  `merchant_ids` json DEFAULT NULL COMMENT '命中商家ID数组（消费记录 merchant_id 在列表内才命中）；NULL=不限商家。store_ids/merchant_ids 任一非空=商家专属活动（优先于全平台），均NULL=全平台活动',\n" +
        "  `start_at` datetime DEFAULT NULL COMMENT '生效开始（北京时间）；NULL=不限',\n" +
        "  `end_at` datetime DEFAULT NULL COMMENT '生效结束（北京时间）；NULL=不限',\n" +
        "  `priority` int NOT NULL DEFAULT '0' COMMENT '优先级（同组多规则命中取最高优先级一条，越大越优先）',\n" +
        "  `max_bonus_rate` decimal(4,2) NOT NULL DEFAULT '2.00' COMMENT '加成率硬上限（发放时二次夹紧，防运营配错；配合总倍数3.0封顶）',\n" +
        "  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'inactive' COMMENT '开关：active 生效 / inactive 停用',\n" +
        "  `remark` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '备注',\n" +
        "  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',\n" +
        "  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',\n" +
        '  PRIMARY KEY (`consumption_bonus_rule_id`),\n' +
        '  KEY `idx_cbr_status_window` (`status`,`start_at`,`end_at`)\n' +
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='消费加成活动规则（多活动独立倍率；全平台+商家专属并存，后端按门店/商家/时间自动命中，商家专属优先）'"
    )
    console.log('✅ 表 consumption_bonus_rules 已创建')
  },

  async down(queryInterface) {
    await queryInterface.dropTable('consumption_bonus_rules')
    console.log('⏪ 表 consumption_bonus_rules 已删除')
  }
}
