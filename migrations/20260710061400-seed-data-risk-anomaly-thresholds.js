'use strict'

/**
 * 种子数据: 风控异常检测阈值迁入 system_settings（拍板⑱，2026-07-10）
 *
 * 背景（以物易物与会员成长等级功能启用方案 §8-⑱ / 拍板⑭-(a)）:
 * - 原 AnomalyService 阈值硬编码且按大众餐饮定（大额 500 元 / 新用户大额 100 元），
 *   中高端业态（桌均约 2,000 元）下全是噪音，告警疲劳 = 没有风控；
 * - 重校准为 5,000 / 3,000 元并迁入配置中心（system_settings + 白名单校验），
 *   管理后台系统设置页零新增 UI 接管，改阈值即改即生效不发版。
 *
 * 写入两个配置项（category='risk'，与白名单 config/system-settings-whitelist.js 对应）:
 * - anomaly_large_amount_threshold      = 5000（单笔大额消费阈值，元）
 * - anomaly_new_user_large_threshold    = 3000（注册7天内新用户大额阈值，元）
 *
 * 回滚: 删除这两行配置（AnomalyService 读取时回退默认值，行为不中断）。
 */

/** 风控阈值种子数据（拍板⑭-(a) 中高端业态口径） */
const RISK_SETTINGS = [
  {
    category: 'risk',
    setting_key: 'anomaly_large_amount_threshold',
    setting_value: '5000',
    value_type: 'number',
    description: '消费异常检测-大额消费阈值（元）：单笔消费超过此值标记 large_amount 并计入风险评分'
  },
  {
    category: 'risk',
    setting_key: 'anomaly_new_user_large_threshold',
    setting_value: '3000',
    value_type: 'number',
    description: '消费异常检测-新用户大额阈值（元）：注册7天内单笔消费超过此值标记 new_user_large'
  }
]

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize
    for (const setting of RISK_SETTINGS) {
      // eslint-disable-next-line no-await-in-loop
      await sequelize.query(
        `INSERT INTO system_settings (category, setting_key, setting_value, value_type, description, is_visible, is_readonly, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, 0, NOW(), NOW())
         ON DUPLICATE KEY UPDATE setting_value=VALUES(setting_value), value_type=VALUES(value_type), description=VALUES(description), updated_at=NOW()`,
        {
          replacements: [
            setting.category,
            setting.setting_key,
            setting.setting_value,
            setting.value_type,
            setting.description
          ]
        }
      )
    }
    console.log('✅ 风控异常检测阈值已写入 system_settings（risk 分类，2 项）')
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DELETE FROM system_settings WHERE category='risk' AND setting_key IN ('anomaly_large_amount_threshold','anomaly_new_user_large_threshold')"
    )
    console.log('⏪ 风控异常检测阈值配置已删除（AnomalyService 回退默认值）')
  }
}
