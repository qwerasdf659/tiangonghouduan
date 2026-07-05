'use strict'

/**
 * 种子数据：微信小程序分端维护模式配置（水晶奖品倍率活动设计方案 §21.3 / §21.4-1）
 *
 * 在 system_settings 表 basic 分类下插入 3 条配置（对齐现有 maintenance_* 三项结构）：
 * - maintenance_mode_wechat_mp     ：小程序维护开关（boolean，默认 false）
 * - maintenance_message_wechat_mp  ：小程序维护公告（string）
 * - maintenance_end_time_wechat_mp ：小程序维护预计结束时间（string，留空=未确定）
 *
 * 分端隔离语义（§21.2）：
 * - 与全局 basic/maintenance_mode 并存正交：全局=全站维护；本开关只作用 wechat_mp 端
 * - 管理端永不自锁：/api/v4/console、/admin、/api/v4/auth 始终白名单放行
 * - 中间件读取路径：middleware/maintenanceMode.js PLATFORM_MAINTENANCE_KEYS
 *
 * 事务化 up/down，可回滚（down 删除这 3 条配置）。
 */

/** 待插入的 3 条小程序维护配置（category=basic） */
const WECHAT_MP_MAINTENANCE_SETTINGS = [
  {
    category: 'basic',
    setting_key: 'maintenance_mode_wechat_mp',
    setting_value: 'false',
    value_type: 'boolean',
    description: '微信小程序维护模式开关（开启后仅微信小程序端 API 返回 503，其他端不受影响）',
    is_visible: 1,
    is_readonly: 0
  },
  {
    category: 'basic',
    setting_key: 'maintenance_message_wechat_mp',
    setting_value: '小程序正在升级维护中，预计30分钟后恢复，敬请谅解。',
    value_type: 'string',
    description: '微信小程序维护公告内容',
    is_visible: 1,
    is_readonly: 0
  },
  {
    category: 'basic',
    setting_key: 'maintenance_end_time_wechat_mp',
    setting_value: '',
    value_type: 'string',
    description: '微信小程序维护预计结束时间（留空表示未确定）',
    is_visible: 1,
    is_readonly: 0
  }
]

module.exports = {
  async up(queryInterface) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()

    try {
      for (const setting of WECHAT_MP_MAINTENANCE_SETTINGS) {
        // 幂等插入：已存在同 category+setting_key 则跳过（避免重复执行报错）
        const [existing] = await sequelize.query(
          'SELECT system_setting_id FROM system_settings WHERE category = :category AND setting_key = :setting_key',
          {
            replacements: { category: setting.category, setting_key: setting.setting_key },
            transaction
          }
        )
        if (existing.length > 0) continue

        await sequelize.query(
          `INSERT INTO system_settings
            (category, setting_key, setting_value, value_type, description, is_visible, is_readonly, created_at, updated_at)
           VALUES
            (:category, :setting_key, :setting_value, :value_type, :description, :is_visible, :is_readonly, NOW(), NOW())`,
          { replacements: setting, transaction }
        )
      }

      // 验证数据完整性：3 条配置必须全部就位
      const [rows] = await sequelize.query(
        'SELECT setting_key FROM system_settings WHERE category = \'basic\' AND setting_key LIKE \'maintenance%wechat_mp\'',
        { transaction }
      )
      if (rows.length !== 3) {
        throw new Error(`小程序维护配置插入不完整：期望 3 条，实际 ${rows.length} 条`)
      }

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface) {
    const sequelize = queryInterface.sequelize
    await sequelize.query(
      'DELETE FROM system_settings WHERE category = \'basic\' AND setting_key IN (\'maintenance_mode_wechat_mp\', \'maintenance_message_wechat_mp\', \'maintenance_end_time_wechat_mp\')'
    )
  }
}
