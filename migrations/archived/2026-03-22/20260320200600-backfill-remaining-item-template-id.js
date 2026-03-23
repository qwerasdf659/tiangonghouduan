'use strict'

/**
 * 彻底回填所有 items.item_template_id
 *
 * 为14个高频名称组创建模板并按名称匹配回填
 * 为零散的一次性items创建通用模板 legacy_misc_item
 * 最终目标：所有 non-test items 都有 item_template_id
 */

module.exports = {
  up: async (queryInterface) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ═══════════════════════════════════════
      // 1. 定义需要创建的模板
      // ═══════════════════════════════════════
      const templates = [
        { code: 'legacy_voucher_98_discount', type: 'voucher', name: '九八折券', rarity: 'common' },
        { code: 'legacy_voucher_test_1', type: 'voucher', name: '测试优惠券', rarity: 'common' },
        { code: 'legacy_voucher_test_2', type: 'voucher', name: '测试优惠券2', rarity: 'common' },
        { code: 'legacy_voucher_test_3', type: 'voucher', name: '测试优惠券3', rarity: 'common' },
        { code: 'legacy_voucher_1', type: 'voucher', name: '优惠券1', rarity: 'common' },
        { code: 'legacy_voucher_2', type: 'voucher', name: '优惠券2', rarity: 'common' },
        { code: 'legacy_voucher_test_product', type: 'voucher', name: '测试商品券', rarity: 'common' },
        { code: 'legacy_voucher_stress_test', type: 'voucher', name: '压测商品', rarity: 'common' },
        { code: 'legacy_voucher_trade_test', type: 'voucher', name: '交易测试物品', rarity: 'common' },
        { code: 'legacy_misc_item', type: 'voucher', name: '历史遗留物品', rarity: 'common' }
      ]

      const nameToTemplateId = {}

      for (const tmpl of templates) {
        const [existing] = await queryInterface.sequelize.query(
          'SELECT item_template_id FROM item_templates WHERE template_code = :code LIMIT 1',
          { replacements: { code: tmpl.code }, transaction }
        )
        if (existing.length > 0) {
          nameToTemplateId[tmpl.name] = existing[0].item_template_id
          continue
        }
        await queryInterface.sequelize.query(
          `INSERT INTO item_templates (template_code, item_type, display_name, rarity_code, is_tradable, is_enabled, created_at, updated_at)
           VALUES (:code, :type, :name, :rarity, 1, 1, NOW(), NOW())`,
          { replacements: { code: tmpl.code, type: tmpl.type, name: tmpl.name, rarity: tmpl.rarity }, transaction }
        )
        const [inserted] = await queryInterface.sequelize.query(
          'SELECT item_template_id FROM item_templates WHERE template_code = :code',
          { replacements: { code: tmpl.code }, transaction }
        )
        nameToTemplateId[tmpl.name] = inserted[0].item_template_id
      }

      console.log('✅ 模板创建/获取完成:', Object.keys(nameToTemplateId).length, '个')

      // ═══════════════════════════════════════
      // 2. 按名称精确匹配回填（覆盖14个高频组）
      // ═══════════════════════════════════════
      const nameMapping = {
        '九八折券': nameToTemplateId['九八折券'],
        '测试优惠券': nameToTemplateId['测试优惠券'],
        '测试优惠券2': nameToTemplateId['测试优惠券2'],
        '测试优惠券3': nameToTemplateId['测试优惠券3'],
        '优惠券1': nameToTemplateId['优惠券1'],
        '优惠券2': nameToTemplateId['优惠券2'],
        '测试商品券': nameToTemplateId['测试商品券'],
        '压测商品': nameToTemplateId['压测商品'],
        '交易测试物品': nameToTemplateId['交易测试物品']
      }

      // 已有模板的名称（上一次迁移已创建）也需要回填无 prize_definition_id 的同名items
      const [existingLegacy] = await queryInterface.sequelize.query(
        "SELECT item_template_id, display_name FROM item_templates WHERE template_code LIKE 'legacy_%'",
        { transaction }
      )
      for (const row of existingLegacy) {
        if (!nameMapping[row.display_name]) {
          nameMapping[row.display_name] = row.item_template_id
        }
      }

      let totalByName = 0
      for (const [itemName, templateId] of Object.entries(nameMapping)) {
        if (!templateId) continue
        const [result] = await queryInterface.sequelize.query(
          `UPDATE items SET item_template_id = :templateId
           WHERE item_name = :itemName AND item_template_id IS NULL AND source != 'test'`,
          { replacements: { templateId, itemName }, transaction }
        )
        const affected = result?.affectedRows || 0
        totalByName += affected
        if (affected > 0) {
          console.log(`  "${itemName}" → template_id=${templateId}: ${affected}条`)
        }
      }
      console.log(`✅ 按名称匹配回填: ${totalByName}条`)

      // ═══════════════════════════════════════
      // 3. 剩余零散items → legacy_misc_item 通用模板
      // ═══════════════════════════════════════
      const miscTemplateId = nameToTemplateId['历史遗留物品']
      if (miscTemplateId) {
        const [miscResult] = await queryInterface.sequelize.query(
          `UPDATE items SET item_template_id = :templateId
           WHERE item_template_id IS NULL AND source != 'test'`,
          { replacements: { templateId: miscTemplateId }, transaction }
        )
        const miscAffected = miscResult?.affectedRows || 0
        console.log(`✅ 零散items → legacy_misc_item: ${miscAffected}条`)
      }

      // ═══════════════════════════════════════
      // 4. 验证
      // ═══════════════════════════════════════
      const [remaining] = await queryInterface.sequelize.query(
        "SELECT COUNT(*) as c FROM items WHERE item_template_id IS NULL AND source != 'test'",
        { transaction }
      )
      console.log(`✅ 验证：剩余未回填的 non-test items: ${remaining[0].c}`)

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回填失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface) => {
    const codes = [
      'legacy_voucher_98_discount', 'legacy_voucher_test_1', 'legacy_voucher_test_2',
      'legacy_voucher_test_3', 'legacy_voucher_1', 'legacy_voucher_2',
      'legacy_voucher_test_product', 'legacy_voucher_stress_test',
      'legacy_voucher_trade_test', 'legacy_misc_item'
    ]
    const placeholders = codes.map(() => '?').join(',')
    await queryInterface.sequelize.query(
      `UPDATE items SET item_template_id = NULL WHERE item_template_id IN (SELECT item_template_id FROM item_templates WHERE template_code IN (${placeholders}))`,
      { replacements: codes }
    )
    await queryInterface.sequelize.query(
      `DELETE FROM item_templates WHERE template_code IN (${placeholders})`,
      { replacements: codes }
    )
  }
}
