'use strict'

/**
 * 修正 exchange_page 配置中 Tab key 反转问题
 *
 * 问题：迁移脚本 20260219205022 插入的 seed 数据使用了旧的反转 key
 * - 当前：key:"market" → label:"商品兑换"、key:"exchange" → label:"交易市场"
 * - 修正：key:"exchange" → label:"商品兑换"、key:"market" → label:"交易市场"
 *
 * @see docs/exchange-config-implementation.md B8
 */
module.exports = {
  async up (queryInterface, Sequelize) {
    const [rows] = await queryInterface.sequelize.query(
      "SELECT system_config_id, config_value FROM system_configs WHERE config_key = 'exchange_page'"
    )

    if (rows.length === 0) {
      console.log('[B8] exchange_page 配置不存在，跳过')
      return
    }

    const row = rows[0]
    const configValue = typeof row.config_value === 'string'
      ? JSON.parse(row.config_value)
      : row.config_value

    if (!configValue.tabs || !Array.isArray(configValue.tabs)) {
      console.log('[B8] tabs 不是数组，跳过')
      return
    }

    let modified = false
    for (const tab of configValue.tabs) {
      if (tab.key === 'market' && tab.label === '商品兑换') {
        tab.key = 'exchange'
        modified = true
      } else if (tab.key === 'exchange' && tab.label === '交易市场') {
        tab.key = 'market'
        modified = true
      }
    }

    if (!modified) {
      console.log('[B8] Tab key 已经正确，无需修正')
      return
    }

    await queryInterface.sequelize.query(
      'UPDATE system_configs SET config_value = ?, updated_at = NOW() WHERE config_key = ?',
      {
        replacements: [JSON.stringify(configValue), 'exchange_page'],
        type: Sequelize.QueryTypes.UPDATE
      }
    )

    console.log('[B8] Tab key 反转修正完成：exchange→商品兑换、market→交易市场')
  },

  async down (queryInterface, Sequelize) {
    const [rows] = await queryInterface.sequelize.query(
      "SELECT system_config_id, config_value FROM system_configs WHERE config_key = 'exchange_page'"
    )

    if (rows.length === 0) return

    const row = rows[0]
    const configValue = typeof row.config_value === 'string'
      ? JSON.parse(row.config_value)
      : row.config_value

    if (!configValue.tabs || !Array.isArray(configValue.tabs)) return

    for (const tab of configValue.tabs) {
      if (tab.key === 'exchange' && tab.label === '商品兑换') {
        tab.key = 'market'
      } else if (tab.key === 'market' && tab.label === '交易市场') {
        tab.key = 'exchange'
      }
    }

    await queryInterface.sequelize.query(
      'UPDATE system_configs SET config_value = ?, updated_at = NOW() WHERE config_key = ?',
      {
        replacements: [JSON.stringify(configValue), 'exchange_page'],
        type: Sequelize.QueryTypes.UPDATE
      }
    )

    console.log('[B8 回滚] Tab key 恢复为旧值')
  }
}
