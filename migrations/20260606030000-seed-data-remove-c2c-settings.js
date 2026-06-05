'use strict'

/**
 * 合规整改 阶段五（补充）：清除 C2C 交易市场 / 拍卖的残留运营配置
 *
 * 文件路径：migrations/20260606030000-seed-data-remove-c2c-settings.js
 * 创建时间：2026-06-06（合规整改执行清单 §10.15 阶段五 收尾）
 *
 * 业务背景：
 * - C2C 用户间交易（market_listings/trade_orders/auction_*）与对应路由、服务、中间件
 *   已于 2026-06-05 阶段五整体删除，改为用户↔官方 B2C 单向道具商城（exchange 域）。
 * - 但 system_settings 中 category='marketplace'(21条) 与 category='auction'(1条) 的
 *   运营配置行被遗留下来（如 allowed_listing_assets、fee_rate_xxx、daily_max_xxx、auction_min_duration_hours），
 *   这些键已无任何代码读取（C2C 撮合、对倒风控、手续费均随 C2C 删除），属脏数据。
 *
 * 本迁移做一件事（基于真实库 restaurant_points_dev 实测，22 行均为 C2C 残留）：
 * - 删除 system_settings 中 category IN ('marketplace','auction') 的全部配置行。
 *
 * down 回滚：可逆（按本迁移记录的快照重新插入 22 行原始配置）。
 *
 * 注：迁移条件用 category 而非写死主键，避免依赖历史自增 ID。
 */

// C2C 残留配置快照（用于 down 回滚，值取自 2026-06-06 真实库实测）
const C2C_SETTINGS_SNAPSHOT = [
  ['auction', 'auction_min_duration_hours', '2', 'number', 'C2C拍卖最低时长（小时），决策2：可配置，默认2小时'],
  ['marketplace', 'allowed_listing_assets', '["star_stone","red_core_shard"]', 'json', '交易市场挂牌允许的定价币种白名单（JSON数组格式，与结算白名单分离）'],
  ['marketplace', 'allowed_settlement_assets', '["star_stone","red_core_shard"]', 'json', '交易市场允许的结算币种白名单（JSON数组格式）'],
  ['marketplace', 'daily_max_amount_red_core_shard', '50000', 'number', 'red_shard日成交额上限（每用户每日最多50,000 red_shard）'],
  ['marketplace', 'daily_max_amount_star_stone', '100000', 'number', 'star_stone日成交额上限（每用户每日最多100,000 star_stone）'],
  ['marketplace', 'daily_max_listings_red_core_shard', '20', 'number', 'red_shard每日挂牌上限（每用户每日最多20笔）'],
  ['marketplace', 'daily_max_listings_star_stone', '20', 'number', 'star_stone每日挂牌上限（每用户每日最多20笔）'],
  ['marketplace', 'daily_max_trades_red_core_shard', '10', 'number', 'red_shard每日成交上限（每用户每日最多10笔）'],
  ['marketplace', 'daily_max_trades_star_stone', '10', 'number', 'star_stone每日成交上限（每用户每日最多10笔）'],
  ['marketplace', 'fee_min_red_core_shard', '1', 'number', 'red_shard最低手续费'],
  ['marketplace', 'fee_min_star_stone', '1', 'number', 'star_stone最低手续费'],
  ['marketplace', 'fee_rate_red_core_shard', '0.05', 'number', 'red_shard交易手续费率'],
  ['marketplace', 'fee_rate_star_stone', '0.05', 'number', 'star_stone交易手续费率'],
  ['marketplace', 'listing_expiry_days', '3', 'number', '挂牌有效期（天）'],
  ['marketplace', 'max_active_listings', '10', 'number', '用户最多同时上架商品数'],
  ['marketplace', 'max_price_red_core_shard', '1000000', 'number', 'red_shard单笔挂牌最高价'],
  ['marketplace', 'min_price_red_core_shard', '1', 'number', 'red_shard单笔挂牌最低价'],
  ['marketplace', 'monitor_alert_enabled', 'true', 'boolean', '市场监控告警开关'],
  ['marketplace', 'monitor_long_listing_days', '7', 'number', '长期挂牌监控阈值（天）'],
  ['marketplace', 'monitor_price_high_threshold', '1000000', 'number', '高价挂牌监控阈值'],
  ['marketplace', 'monitor_price_low_threshold', '1', 'number', '低价挂牌监控阈值'],
  ['marketplace', 'trade_order_timeout_minutes', '30', 'number', '交易订单超时时间（分钟）']
]

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `DELETE FROM system_settings WHERE category IN ('marketplace', 'auction')`
    )
  },

  async down(queryInterface, Sequelize) {
    const now = new Date()
    const rows = C2C_SETTINGS_SNAPSHOT.map(([category, setting_key, setting_value, value_type, description]) => ({
      category,
      setting_key,
      setting_value,
      value_type,
      description,
      is_visible: 1,
      is_readonly: 0,
      created_at: now,
      updated_at: now
    }))
    await queryInterface.bulkInsert('system_settings', rows)
  }
}
