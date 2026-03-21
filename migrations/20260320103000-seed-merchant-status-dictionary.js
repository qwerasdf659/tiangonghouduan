'use strict'

/**
 * 商家账号状态字典（merchant_status）
 * 供 MerchantService.attachDisplayNames → status_display / status_color
 */

module.exports = {
  async up(queryInterface) {
    const now = new Date()
    const rows = [
      {
        dict_type: 'merchant_status',
        dict_code: 'active',
        dict_name: '正常',
        dict_color: 'bg-success',
        sort_order: 1,
        is_enabled: 1,
        version: 1,
        remark: '商家账号正常',
        created_at: now,
        updated_at: now
      },
      {
        dict_type: 'merchant_status',
        dict_code: 'inactive',
        dict_name: '停用',
        dict_color: 'bg-secondary',
        sort_order: 2,
        is_enabled: 1,
        version: 1,
        remark: '商家账号停用',
        created_at: now,
        updated_at: now
      },
      {
        dict_type: 'merchant_status',
        dict_code: 'suspended',
        dict_name: '暂停',
        dict_color: 'bg-danger',
        sort_order: 3,
        is_enabled: 1,
        version: 1,
        remark: '商家账号暂停',
        created_at: now,
        updated_at: now
      }
    ]

    const transaction = await queryInterface.sequelize.transaction()
    try {
      for (const row of rows) {
        const [found] = await queryInterface.sequelize.query(
          'SELECT system_dictionary_id FROM system_dictionaries WHERE dict_type = :dt AND dict_code = :dc LIMIT 1',
          { replacements: { dt: row.dict_type, dc: row.dict_code }, transaction }
        )
        if (!found.length) {
          await queryInterface.bulkInsert('system_dictionaries', [row], { transaction })
        }
      }
      await transaction.commit()
    } catch (e) {
      await transaction.rollback()
      throw e
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "DELETE FROM system_dictionaries WHERE dict_type = 'merchant_status'"
    )
  }
}
