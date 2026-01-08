'use strict'

/**
 * 迁移：添加市场监控阈值配置
 *
 * 业务背景：
 * - 市场挂牌监控定时任务(hourly-market-listing-monitor.js)使用硬编码阈值
 * - 需要将阈值配置迁移到DB的system_settings表，支持运营动态调整
 *
 * 新增配置项（category: marketplace）：
 * - monitor_price_low_threshold: 价格下限阈值（市场均价的百分比，默认0.1=10%）
 * - monitor_price_high_threshold: 价格上限阈值（市场均价的倍数，默认3.0=300%）
 * - monitor_long_listing_days: 超长挂牌天数阈值（默认7天）
 * - monitor_alert_enabled: 是否启用告警推送（默认true）
 * - fungible_expiry_days: 同质化资产自动下架天数（默认3天，已存在 listing_expiry_days）
 *
 * @since 2026-01-09
 * @see docs/待处理问题清单-2026-01-09.md D2决策
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      /**
       * 1. 检查现有配置，避免重复插入
       */
      const [existingSettings] = await queryInterface.sequelize.query(
        `SELECT setting_key FROM system_settings 
         WHERE category = 'marketplace' 
         AND setting_key IN ('monitor_price_low_threshold', 'monitor_price_high_threshold', 
                             'monitor_long_listing_days', 'monitor_alert_enabled')`,
        { transaction }
      )

      const existingKeys = existingSettings.map(row => row.setting_key)
      const now = new Date()

      /**
       * 2. 准备新增配置项
       */
      const newSettings = []

      if (!existingKeys.includes('monitor_price_low_threshold')) {
        newSettings.push({
          category: 'marketplace',
          setting_key: 'monitor_price_low_threshold',
          setting_value: '0.1',
          value_type: 'number',
          description: '价格异常监控：价格下限阈值（市场均价的百分比，0.1=10%）',
          is_visible: true,
          is_readonly: false,
          created_at: now,
          updated_at: now
        })
      }

      if (!existingKeys.includes('monitor_price_high_threshold')) {
        newSettings.push({
          category: 'marketplace',
          setting_key: 'monitor_price_high_threshold',
          setting_value: '3.0',
          value_type: 'number',
          description: '价格异常监控：价格上限阈值（市场均价的倍数，3.0=300%）',
          is_visible: true,
          is_readonly: false,
          created_at: now,
          updated_at: now
        })
      }

      if (!existingKeys.includes('monitor_long_listing_days')) {
        newSettings.push({
          category: 'marketplace',
          setting_key: 'monitor_long_listing_days',
          setting_value: '7',
          value_type: 'number',
          description: '超长挂牌监控：超过此天数仍未成交的挂牌会被标记告警',
          is_visible: true,
          is_readonly: false,
          created_at: now,
          updated_at: now
        })
      }

      if (!existingKeys.includes('monitor_alert_enabled')) {
        newSettings.push({
          category: 'marketplace',
          setting_key: 'monitor_alert_enabled',
          setting_value: 'true',
          value_type: 'boolean',
          description: '是否启用市场监控告警推送',
          is_visible: true,
          is_readonly: false,
          created_at: now,
          updated_at: now
        })
      }

      /**
       * 3. 批量插入新配置
       */
      if (newSettings.length > 0) {
        await queryInterface.bulkInsert('system_settings', newSettings, { transaction })
        console.log(`✅ 已添加 ${newSettings.length} 条市场监控配置`)
      } else {
        console.log('ℹ️ 市场监控配置已存在，无需添加')
      }

      await transaction.commit()
      console.log('✅ 迁移完成：市场监控阈值配置已添加到 system_settings')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      await queryInterface.sequelize.query(
        `DELETE FROM system_settings 
         WHERE category = 'marketplace' 
         AND setting_key IN ('monitor_price_low_threshold', 'monitor_price_high_threshold',
                             'monitor_long_listing_days', 'monitor_alert_enabled')`,
        { transaction }
      )

      await transaction.commit()
      console.log('✅ 回滚完成：市场监控阈值配置已删除')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
