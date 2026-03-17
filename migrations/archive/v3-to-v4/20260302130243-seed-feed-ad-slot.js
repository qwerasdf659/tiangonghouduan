'use strict'

/**
 * 创建 feed 类型信息流广告位种子数据
 *
 * 背景：ad_slots 表的 slot_type 字段已支持 feed 类型（模型 + 数据库 VARCHAR(20)），
 * 但数据库中未创建任何 feed 类型的广告位。本迁移补充信息流广告位种子数据。
 *
 * @see models/AdSlot.js VALID_SLOT_TYPES = ['popup', 'carousel', 'announcement', 'feed']
 */
module.exports = {
  async up(queryInterface) {
    const now = new Date()

    /* 检查 feed 广告位是否已存在（幂等） */
    const [existing] = await queryInterface.sequelize.query(
      "SELECT COUNT(*) as cnt FROM ad_slots WHERE slot_type = 'feed'",
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    )

    if (existing.cnt > 0) {
      console.log('[迁移] feed 广告位已存在，跳过种子数据插入')
      return
    }

    await queryInterface.bulkInsert('ad_slots', [
      {
        slot_key: 'market_list_feed',
        slot_name: '交易市场信息流广告位',
        slot_type: 'feed',
        position: 'market_list',
        description: '展示在交易市场列表中的信息流广告，每隔N条商品穿插一条广告',
        daily_price_diamond: 30,
        min_bid_diamond: 15,
        min_budget_diamond: 100,
        min_daily_price_diamond: 20,
        floor_price_override: null,
        zone_id: 1,
        slot_category: 'feed',
        cpm_price_diamond: 5,
        is_active: true,
        created_at: now,
        updated_at: now
      },
      {
        slot_key: 'exchange_list_feed',
        slot_name: '兑换商城信息流广告位',
        slot_type: 'feed',
        position: 'exchange_list',
        description: '展示在兑换商城列表中的信息流广告，每隔N条商品穿插一条广告',
        daily_price_diamond: 25,
        min_bid_diamond: 10,
        min_budget_diamond: 80,
        min_daily_price_diamond: 15,
        floor_price_override: null,
        zone_id: 1,
        slot_category: 'feed',
        cpm_price_diamond: 3,
        is_active: true,
        created_at: now,
        updated_at: now
      }
    ])

    console.log('[迁移] 已创建 2 个 feed 类型广告位: market_list_feed, exchange_list_feed')
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('ad_slots', {
      slot_key: ['market_list_feed', 'exchange_list_feed']
    })
    console.log('[回滚] 已删除 feed 类型广告位种子数据')
  }
}
