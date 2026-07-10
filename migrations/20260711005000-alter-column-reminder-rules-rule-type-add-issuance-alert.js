'use strict'

/**
 * 修改列: reminder_rules.rule_type 枚举新增 'issuance_alert' + 字典 + 种子规则
 * （以物易物与会员成长等级功能启用方案 拍板⑭-(c)：加成发放量告警，2026-07-11）
 *
 * 背景:
 * - 成长等级发放线上线后，等级加成使伪造小票收益放大（v9 顶档 1 元刷 1.5 分 + 预算 0.12），
 *   需监控"日加成积分发放量 / 日预算注入量"超阈值自动告警，
 *   配合拍板⑬-(b)"九档倍数归一"应急回滚形成【发现 → 回滚】闭环。
 * - 复用现有 ReminderRule 提醒引擎（管理员告警正是其设计用途，零新增告警页面），
 *   新增规则类型 issuance_alert（处理器见 ReminderEngineService.RULE_PROCESSORS）。
 *
 * 变更内容:
 * 0. 🔴 修复既有结构缺陷：reminder_rule_id 物理列缺 AUTO_INCREMENT（模型声明 autoIncrement:true
 *    但库列 Extra 为空，模型与数据库不同步）——导致无显式主键的 INSERT 全部落到 id=0、
 *    第二条起被主键冲突吞掉，管理后台"新建提醒规则"功能一直受此缺陷影响；
 * 1. reminder_rules.rule_type ENUM 追加 'issuance_alert'（末尾追加，存量值不受影响）；
 * 2. system_dictionaries 补 reminder_rule_type/issuance_alert 字典项（前端中文展示）；
 * 3. 种子两条系统告警规则（⚠️ is_enabled=0 停用态投放：
 *    daily_threshold 为 AI 建议占位值，需运营按真实营收规模确认阈值后在
 *    reminder-rules 页修改并启用——阈值过低会告警疲劳、过高则失去风控意义）:
 *    - daily_level_bonus_issuance_alert: 日等级加成积分发放量告警（level_bonus_reward）
 *    - daily_budget_injection_alert: 日预算积分注入量告警（consumption_budget_allocation）
 *
 * 回滚: 删除两条种子规则与字典项，ENUM 还原（存量若已有 issuance_alert 行则回滚会失败，属预期保护）。
 */

/** rule_type 枚举全集（原 7 值 + 新增 issuance_alert，与 models/ReminderRule.js RULE_TYPES 同步） */
const RULE_TYPE_ENUM_NEW =
  "ENUM('pending_timeout','stock_low','budget_alert','activity_status','anomaly_detect','scheduled','custom','issuance_alert')"
const RULE_TYPE_ENUM_OLD =
  "ENUM('pending_timeout','stock_low','budget_alert','activity_status','anomaly_detect','scheduled','custom')"

/** 种子规则（is_enabled=0，阈值待运营确认后启用） */
const SEED_RULES = [
  {
    rule_code: 'daily_level_bonus_issuance_alert',
    rule_name: '日等级加成积分发放量告警',
    rule_description:
      '监控当日 level_bonus_reward（成长等级发放线加成积分）发放总量，超阈值告警——配合"九档倍数归一"应急回滚形成发现→回滚闭环（拍板⑭-(c)）。⚠️ daily_threshold 当前为建议占位值，运营须按真实营收规模确认后修改并启用',
    trigger_condition: JSON.stringify({
      business_type: 'level_bonus_reward',
      daily_threshold: 50000
    }),
    notification_template:
      '今日等级加成积分发放量已达 {issued_today}（阈值 {daily_threshold}），请核查是否存在刷分行为，必要时将九档 earn_multiplier 归一回滚'
  },
  {
    rule_code: 'daily_budget_injection_alert',
    rule_name: '日预算积分注入量告警',
    rule_description:
      '监控当日 consumption_budget_allocation（消费预算积分注入）总量，超阈值告警（拍板⑭-(c)）。⚠️ daily_threshold 当前为建议占位值，运营须按真实营收规模确认后修改并启用',
    trigger_condition: JSON.stringify({
      business_type: 'consumption_budget_allocation',
      daily_threshold: 20000
    }),
    notification_template:
      '今日预算积分注入量已达 {issued_today}（阈值 {daily_threshold}），请核查消费审核是否存在异常放量'
  }
]

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      /*
       * 0. 修复主键自增缺失（模型 autoIncrement:true 与库结构对齐）：
       * 现有最大 id=3，加 AUTO_INCREMENT 后从 4 起步，存量行不受影响。
       * 该列被 reminder_history.fk_reminder_history_rule 外键引用，MODIFY 需临时关闭
       * 外键检查——本次仅追加 AUTO_INCREMENT 属性，列类型 INT 不变，外键语义零影响。
       */
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction })
      await sequelize.query(
        "ALTER TABLE reminder_rules MODIFY COLUMN reminder_rule_id INT NOT NULL AUTO_INCREMENT COMMENT '提醒规则ID（主键，符合{table_name}_id规范）'",
        { transaction }
      )
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction })

      // 1. ENUM 追加新值（末尾追加，存量行不受影响）
      await sequelize.query(
        `ALTER TABLE reminder_rules MODIFY COLUMN rule_type ${RULE_TYPE_ENUM_NEW} NOT NULL COMMENT '规则类型'`,
        { transaction }
      )

      // 2. 字典项（前端 reminder-rules 页按字典表转中文展示）
      await sequelize.query(
        `INSERT INTO system_dictionaries (dict_type, dict_code, dict_name, dict_color, sort_order, is_enabled, remark, version, created_at, updated_at)
         VALUES ('reminder_rule_type', 'issuance_alert', '发放量告警', 'bg-danger', 6, 1, '日资产发放量超阈值告警（等级加成/预算注入，拍板⑭-(c)）', 1, NOW(), NOW())
         ON DUPLICATE KEY UPDATE dict_name=VALUES(dict_name), remark=VALUES(remark), updated_at=NOW()`,
        { transaction }
      )

      // 3. 种子规则（is_enabled=0 停用态，阈值需运营确认真实值后启用）
      for (const rule of SEED_RULES) {
        // eslint-disable-next-line no-await-in-loop
        await sequelize.query(
          `INSERT INTO reminder_rules
             (rule_code, rule_name, rule_description, rule_type, trigger_condition, target_entity,
              notification_channels, notification_template, notification_priority,
              check_interval_minutes, is_enabled, is_system, created_at, updated_at)
           VALUES
             (:rule_code, :rule_name, :rule_description, 'issuance_alert', :trigger_condition, 'asset_transaction',
              :notification_channels, :notification_template, 'high',
              60, 0, 1, NOW(), NOW())
           ON DUPLICATE KEY UPDATE rule_name=VALUES(rule_name), updated_at=NOW()`,
          {
            replacements: {
              rule_code: rule.rule_code,
              rule_name: rule.rule_name,
              rule_description: rule.rule_description,
              trigger_condition: rule.trigger_condition,
              notification_channels: JSON.stringify(['admin_broadcast', 'websocket']),
              notification_template: rule.notification_template
            },
            transaction
          }
        )
      }

      await transaction.commit()
      console.log('✅ issuance_alert 规则类型 + 字典 + 2 条种子告警规则已就绪（停用态，待运营确认阈值后启用）')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      await sequelize.query(
        "DELETE FROM reminder_rules WHERE rule_code IN ('daily_level_bonus_issuance_alert','daily_budget_injection_alert')",
        { transaction }
      )
      await sequelize.query(
        "DELETE FROM system_dictionaries WHERE dict_type='reminder_rule_type' AND dict_code='issuance_alert'",
        { transaction }
      )
      await sequelize.query(
        `ALTER TABLE reminder_rules MODIFY COLUMN rule_type ${RULE_TYPE_ENUM_OLD} NOT NULL COMMENT '规则类型'`,
        { transaction }
      )
      /*
       * AUTO_INCREMENT 修复不回滚：它修正的是"模型与库结构不同步"的既有缺陷，
       * 还原等于重新引入缺陷（回滚哲学：只还原本迁移引入的业务变更，不还原缺陷修复）。
       */
      await transaction.commit()
      console.log('⏪ issuance_alert 规则类型/字典/种子规则已回滚（AUTO_INCREMENT 修复保留）')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
