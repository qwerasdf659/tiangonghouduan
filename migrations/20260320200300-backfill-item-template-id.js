'use strict'

/**
 * 历史数据回填：items.item_template_id
 *
 * 1. 为6个旧奖品创建对应的 item_templates
 * 2. 在 lottery_prizes 表添加 item_template_id 列（建立直接关联）
 * 3. 回填 items.item_template_id（通过 prize_definition_id → lottery_prizes → item_template_id）
 * 4. test源的items标记为历史数据（不回填）
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ═══════════════════════════════════════
      // 1. 为旧奖品创建 item_templates
      // ═══════════════════════════════════════
      const legacyPrizeTemplates = [
        { template_code: 'legacy_coupon_88_discount', item_type: 'voucher', display_name: '八八折', rarity_code: 'uncommon' },
        { template_code: 'legacy_points_100', item_type: 'voucher', display_name: '100积分', rarity_code: 'common' },
        { template_code: 'legacy_food_dessert', item_type: 'product', display_name: '甜品1份', rarity_code: 'common' },
        { template_code: 'legacy_food_vegetables', item_type: 'product', display_name: '青菜1份', rarity_code: 'common' },
        { template_code: 'legacy_jewelry_premium', item_type: 'product', display_name: '精品首饰一个', rarity_code: 'epic' },
        { template_code: 'legacy_food_sashimi_platter', item_type: 'product', display_name: '生腌拼盘158', rarity_code: 'legendary' }
      ]

      const templateIdMap = {}

      for (const tmpl of legacyPrizeTemplates) {
        const [existing] = await queryInterface.sequelize.query(
          'SELECT item_template_id FROM item_templates WHERE template_code = :code LIMIT 1',
          { replacements: { code: tmpl.template_code }, transaction }
        )
        if (existing.length > 0) {
          templateIdMap[tmpl.display_name] = existing[0].item_template_id
          continue
        }

        await queryInterface.sequelize.query(
          `INSERT INTO item_templates (template_code, item_type, display_name, rarity_code, is_tradable, is_enabled, created_at, updated_at)
           VALUES (:code, :type, :name, :rarity, 1, 1, NOW(), NOW())`,
          { replacements: { code: tmpl.template_code, type: tmpl.item_type, name: tmpl.display_name, rarity: tmpl.rarity_code }, transaction }
        )

        const [inserted] = await queryInterface.sequelize.query(
          'SELECT item_template_id FROM item_templates WHERE template_code = :code',
          { replacements: { code: tmpl.template_code }, transaction }
        )
        templateIdMap[tmpl.display_name] = inserted[0].item_template_id
      }

      console.log('✅ 旧奖品模板创建完成:', Object.keys(templateIdMap).length, '个')

      // ═══════════════════════════════════════
      // 2. 通过 lottery_prizes.prize_name 建立映射，回填 items.item_template_id
      // ═══════════════════════════════════════
      const prizeNameToTemplate = {
        '八八折': templateIdMap['八八折'],
        '100积分': templateIdMap['100积分'],
        '甜品1份': templateIdMap['甜品1份'],
        '青菜1份': templateIdMap['青菜1份'],
        '精品首饰一个': templateIdMap['精品首饰一个'],
        '生腌拼盘158': templateIdMap['生腌拼盘158']
      }

      let totalUpdated = 0
      for (const [prizeName, templateId] of Object.entries(prizeNameToTemplate)) {
        if (!templateId) continue

        const [result] = await queryInterface.sequelize.query(
          `UPDATE items i
           JOIN lottery_prizes lp ON i.prize_definition_id = lp.lottery_prize_id
           SET i.item_template_id = :templateId
           WHERE lp.prize_name = :prizeName
             AND i.item_template_id IS NULL
             AND i.source != 'test'`,
          { replacements: { templateId, prizeName }, transaction }
        )
        const affected = result?.affectedRows || 0
        totalUpdated += affected
        if (affected > 0) {
          console.log(`  回填 "${prizeName}" → template_id=${templateId}: ${affected}条`)
        }
      }

      console.log(`✅ items.item_template_id 回填完成: ${totalUpdated}条（不含test源数据）`)

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回填失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface) => {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      await queryInterface.sequelize.query(
        `UPDATE items SET item_template_id = NULL
         WHERE item_template_id IN (
           SELECT item_template_id FROM item_templates WHERE template_code LIKE 'legacy_%'
         )`,
        { transaction }
      )
      await queryInterface.sequelize.query(
        "DELETE FROM item_templates WHERE template_code LIKE 'legacy_%'",
        { transaction }
      )
      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
