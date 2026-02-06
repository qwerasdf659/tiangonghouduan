/**
 * 商家积分审核语义升级迁移（2026-01-08）
 *
 * 业务变更说明：
 * 1. expires_at 改为可空（新语义不再使用超时机制）
 * 2. 添加商家审核预算配置到 system_settings
 *
 * 拍板决策：
 * - 审核通过直接发放积分奖励，不再冻结积分
 * - 不再使用超时机制，expires_at 设为 NULL
 * - 预算积分比例通过 system_settings 配置
 *
 * @see docs/用户上传凭证业务清理报告-2026-01-07.md
 */

'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ========== 1. 修改 expires_at 为可空 ==========
      console.log('📝 [迁移] 修改 merchant_points_reviews.expires_at 为可空...')

      await queryInterface.changeColumn(
        'merchant_points_reviews',
        'expires_at',
        {
          type: Sequelize.DATE,
          allowNull: true, // 允许 NULL（新语义不再使用超时机制）
          comment: '审核超时时间（已废弃，新语义设为 NULL）'
        },
        { transaction }
      )

      console.log('✅ expires_at 已改为可空')

      // ========== 2. 添加商家审核预算配置 ==========
      console.log('📝 [迁移] 添加商家审核预算配置到 system_settings...')

      const now = new Date()

      // 检查配置是否已存在（幂等性）
      const [existingConfigs] = await queryInterface.sequelize.query(
        `SELECT setting_key FROM system_settings 
         WHERE setting_key IN ('merchant_review_budget_ratio', 'merchant_review_campaign_id')`,
        { transaction }
      )

      const existingKeys = existingConfigs.map(c => c.setting_key)

      // 插入 merchant_review_budget_ratio（如不存在）
      if (!existingKeys.includes('merchant_review_budget_ratio')) {
        await queryInterface.bulkInsert(
          'system_settings',
          [
            {
              category: 'points',
              setting_key: 'merchant_review_budget_ratio',
              setting_value: '0.24',
              value_type: 'number',
              description: '商家审核预算积分比例（审核通过时发放的预算积分 = 奖励积分 × 该比例）',
              is_visible: true,
              is_readonly: false,
              created_at: now,
              updated_at: now
            }
          ],
          { transaction }
        )
        console.log('✅ 已添加配置: merchant_review_budget_ratio = 0.24')
      } else {
        console.log('⚠️ 配置已存在: merchant_review_budget_ratio')
      }

      // 插入 merchant_review_campaign_id（如不存在）
      if (!existingKeys.includes('merchant_review_campaign_id')) {
        await queryInterface.bulkInsert(
          'system_settings',
          [
            {
              category: 'points',
              setting_key: 'merchant_review_campaign_id',
              setting_value: 'MERCHANT_REVIEW_DEFAULT',
              value_type: 'string',
              description: '商家审核预算积分活动标识（用于区分不同来源的预算积分）',
              is_visible: true,
              is_readonly: false,
              created_at: now,
              updated_at: now
            }
          ],
          { transaction }
        )
        console.log('✅ 已添加配置: merchant_review_campaign_id = MERCHANT_REVIEW_DEFAULT')
      } else {
        console.log('⚠️ 配置已存在: merchant_review_campaign_id')
      }

      await transaction.commit()
      console.log('✅ [迁移] 商家积分审核语义升级完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [迁移] 失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ========== 1. 恢复 expires_at 为必填 ==========
      console.log('📝 [回滚] 恢复 merchant_points_reviews.expires_at 为必填...')

      // 先将 NULL 值设置为默认时间（当前时间 + 24小时）
      await queryInterface.sequelize.query(
        `UPDATE merchant_points_reviews 
         SET expires_at = DATE_ADD(created_at, INTERVAL 24 HOUR) 
         WHERE expires_at IS NULL`,
        { transaction }
      )

      await queryInterface.changeColumn(
        'merchant_points_reviews',
        'expires_at',
        {
          type: Sequelize.DATE,
          allowNull: false,
          comment: '审核超时时间（超时后需客服处理）'
        },
        { transaction }
      )

      console.log('✅ expires_at 已恢复为必填')

      // ========== 2. 删除商家审核预算配置 ==========
      console.log('📝 [回滚] 删除商家审核预算配置...')

      await queryInterface.bulkDelete(
        'system_settings',
        {
          setting_key: ['merchant_review_budget_ratio', 'merchant_review_campaign_id']
        },
        { transaction }
      )

      console.log('✅ 已删除商家审核预算配置')

      await transaction.commit()
      console.log('✅ [回滚] 完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [回滚] 失败:', error.message)
      throw error
    }
  }
}
