'use strict'

/**
 * 在 exchange_page 配置的 tabs[] 中加入「道具商城」Tab（key=prop，星石娱乐轨）
 *
 * 创建时间: 2026-06-11 北京时间
 * 创建原因:
 * - 小程序已就绪「道具商城」顶层 Tab，前端 Tab 列表 100% 由后端 exchange_page 配置驱动。
 * - 实测 system_settings.exchange_page.tabs[] 当前仅含 { key:'exchange' }，缺道具商城 Tab，
 *   导致小程序顶部不显示道具商城（预期行为，非前端 bug）。
 * - Tab key 取 'prop'，与后端权威字段 item_templates.item_type='prop' 逐字一致：
 *   Tab key = 频道枚举 = 列表筛选参数 item_type=prop，三者同名零映射，长期维护成本最低。
 * - 历史默认配置里 key='market' 指已下线的 C2C「交易市场」，不复用，避免语义撞车。
 *
 * 幂等: up 读现有 JSON，仅当 tabs[] 不含 key='prop' 时追加；重复执行不产生重复项。
 * 回滚: down 从 tabs[] 移除 key='prop' 项。
 */

const SETTING_KEY = 'exchange_page'
const PROP_TAB = {
  key: 'prop',
  icon: 'gift',
  label: '道具商城',
  enabled: true,
  sort_order: 2
}

module.exports = {
  async up(queryInterface) {
    const rows = await queryInterface.sequelize.query(
      'SELECT setting_value FROM system_settings WHERE setting_key = :k LIMIT 1',
      { replacements: { k: SETTING_KEY }, type: queryInterface.sequelize.QueryTypes.SELECT }
    )

    if (!rows.length) {
      // 无配置行时不创建：路由层有默认值兜底，配置行应由运营初始化，避免迁移制造半成品配置
      return
    }

    const raw = rows[0].setting_value
    const config = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(config.tabs)) config.tabs = []

    if (config.tabs.some(t => t.key === 'prop')) {
      return
    }

    config.tabs.push({ ...PROP_TAB })

    await queryInterface.sequelize.query(
      'UPDATE system_settings SET setting_value = :v, updated_at = NOW() WHERE setting_key = :k',
      {
        replacements: { v: JSON.stringify(config), k: SETTING_KEY },
        type: queryInterface.sequelize.QueryTypes.UPDATE
      }
    )
  },

  async down(queryInterface) {
    const rows = await queryInterface.sequelize.query(
      'SELECT setting_value FROM system_settings WHERE setting_key = :k LIMIT 1',
      { replacements: { k: SETTING_KEY }, type: queryInterface.sequelize.QueryTypes.SELECT }
    )
    if (!rows.length) return

    const raw = rows[0].setting_value
    const config = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(config.tabs)) return

    config.tabs = config.tabs.filter(t => t.key !== 'prop')

    await queryInterface.sequelize.query(
      'UPDATE system_settings SET setting_value = :v, updated_at = NOW() WHERE setting_key = :k',
      {
        replacements: { v: JSON.stringify(config), k: SETTING_KEY },
        type: queryInterface.sequelize.QueryTypes.UPDATE
      }
    )
  }
}
