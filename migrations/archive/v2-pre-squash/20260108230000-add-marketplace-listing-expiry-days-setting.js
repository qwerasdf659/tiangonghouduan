/**
 * 数据库迁移：添加市场挂牌过期天数配置
 *
 * 业务背景：
 * C2C材料交易功能需要自动过期机制，防止长期占用挂牌位
 * 文档规定：挂牌超过3天自动过期并解冻资产
 *
 * 具体变更：
 * 1. 向system_settings表插入listing_expiry_days配置项
 * 2. 默认值为3天（符合文档"全量拍板"决策）
 *
 * 业务影响：
 * - 正向影响：定时任务可读取此配置执行自动过期
 * - 风险控制：可通过后台调整过期天数，无需改代码
 *
 * 创建时间：2026年01月08日 北京时间
 * 数据库版本：V4.0
 * 风险等级：低（仅插入配置数据）
 * 预计执行时间：<1秒
 */

'use strict'

module.exports = {
  /**
   * 正向迁移：添加listing_expiry_days配置
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize库
   * @returns {Promise<void>}
   */
  async up(queryInterface, Sequelize) {
    // 检查是否已存在（幂等性）
    const [existing] = await queryInterface.sequelize.query(
      "SELECT setting_id FROM system_settings WHERE setting_key = 'listing_expiry_days'"
    )

    if (existing.length > 0) {
      console.log('⏭️ listing_expiry_days 配置已存在，跳过')
      return
    }

    // 插入市场挂牌过期天数配置
    await queryInterface.bulkInsert('system_settings', [
      {
        category: 'marketplace',
        setting_key: 'listing_expiry_days',
        setting_value: '3', // 文档决策：3天自动过期
        value_type: 'number',
        description: '市场挂牌过期天数（超过此天数自动过期并解冻资产，0表示永不过期）',
        is_visible: true,
        is_readonly: false,
        created_at: new Date(),
        updated_at: new Date()
      }
    ])

    console.log('✅ 已添加 listing_expiry_days 配置（默认3天）')
    console.log('🎉 迁移完成：市场过期配置添加成功')
  },

  /**
   * 回滚迁移：删除listing_expiry_days配置
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize库
   * @returns {Promise<void>}
   */
  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('system_settings', {
      setting_key: 'listing_expiry_days'
    })
    console.log('🔄 回滚完成：listing_expiry_days配置已删除')
  }
}
