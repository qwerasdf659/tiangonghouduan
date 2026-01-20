'use strict'

/**
 * 清理活动JSON中的旧定价配置
 *
 * 背景：
 * - 定价配置已迁移到 lottery_campaign_pricing_config 表
 * - prize_distribution_config.draw_pricing 字段为旧兼容配置，不再使用
 * - 2026-01-20 技术债务清理：移除旧JSON配置避免混淆
 *
 * 清理内容：
 * - 从 lottery_campaigns.prize_distribution_config 中移除 draw_pricing 字段
 *
 * 前置条件（已验证）：
 * - 所有活动已在 lottery_campaign_pricing_config 表有对应配置
 * - PricingStage.js 已更新为仅从新表读取（配置缺失直接报错）
 *
 * @migration 20260120193900-cleanup-legacy-draw-pricing-json
 * @date 2026-01-20 北京时间
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('📋 开始清理活动JSON中的旧定价配置...')

      // 1. 检查需要清理的活动
      const [campaigns] = await queryInterface.sequelize.query(`
        SELECT campaign_id, campaign_name,
               JSON_EXTRACT(prize_distribution_config, '$.draw_pricing') as legacy_config
        FROM lottery_campaigns
        WHERE JSON_EXTRACT(prize_distribution_config, '$.draw_pricing') IS NOT NULL
      `, { transaction })

      if (campaigns.length === 0) {
        console.log('✅ 无旧定价配置需要清理')
        await transaction.commit()
        return
      }

      console.log(`🔍 发现 ${campaigns.length} 个活动需要清理:`)
      campaigns.forEach(c => {
        console.log(`   - campaign_id=${c.campaign_id}: ${c.campaign_name}`)
      })

      // 2. 验证所有活动在新表有配置
      const [newConfigs] = await queryInterface.sequelize.query(`
        SELECT DISTINCT campaign_id FROM lottery_campaign_pricing_config
        WHERE status = 'active'
      `, { transaction })

      const newConfigCampaignIds = new Set(newConfigs.map(c => c.campaign_id))
      const missingConfigs = campaigns.filter(c => !newConfigCampaignIds.has(c.campaign_id))

      if (missingConfigs.length > 0) {
        console.error('❌ 以下活动在新表中缺少配置，中止清理:')
        missingConfigs.forEach(c => {
          console.error(`   - campaign_id=${c.campaign_id}: ${c.campaign_name}`)
        })
        throw new Error(`${missingConfigs.length} 个活动在 lottery_campaign_pricing_config 表中缺少配置`)
      }

      // 3. 执行清理
      const [result] = await queryInterface.sequelize.query(`
        UPDATE lottery_campaigns 
        SET prize_distribution_config = JSON_REMOVE(prize_distribution_config, '$.draw_pricing'),
            updated_at = NOW()
        WHERE JSON_EXTRACT(prize_distribution_config, '$.draw_pricing') IS NOT NULL
      `, { transaction })

      console.log(`✅ 已清理 ${result.affectedRows || campaigns.length} 个活动的旧定价配置`)

      // 4. 验证清理结果
      const [remaining] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) as count FROM lottery_campaigns
        WHERE JSON_EXTRACT(prize_distribution_config, '$.draw_pricing') IS NOT NULL
      `, { transaction })

      if (remaining[0].count > 0) {
        throw new Error(`清理未完成，仍有 ${remaining[0].count} 个活动包含旧配置`)
      }

      console.log('✅ 旧定价配置清理完成')

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    // 注意：down迁移无法恢复已删除的JSON数据
    // 如需恢复，请从备份中还原
    console.warn('⚠️ 此迁移的 down 操作无法恢复已清理的JSON数据')
    console.warn('⚠️ 如需恢复，请使用数据库备份')
    console.log('📌 旧定价配置数据现已存储在 lottery_campaign_pricing_config 表中')
  }
}


