'use strict'

/**
 * 初始化数据: 5 个页面头部 Banner 广告位（top_banner 槽位种子）
 *
 * 创建时间: 2026-06-21（北京时间）
 * 创建原因（微信小程序顶部 Banner 运营可配化 - 拍板1：5 个 Tab 页全做）:
 * - 为 lottery/profile/diy/camera/exchange 五个页面各建一行 top_banner 槽位，
 *   运营即可在管理端为各页面配置/替换头部 Banner，前端零发版换图。
 * - position 命名以后端既有口径为准（profile 而非前端文档的 user），前端适配后端。
 *
 * 定价（拍板：首屏黄金位，对标/高于弹窗。单位：星石 star_stone）:
 * - lottery 日价 200（对标现状最贵的 lottery_popup），其余 4 个 150；
 * - 最低竞价 80（高于弹窗 50，体现黄金位门槛），最低预算 500，同人每日展示上限 5；
 * - is_carousel=0（默认单张），slide_interval_ms=3000（3 秒，运营可在 2-8 秒调）；
 * - slot_category=display（展示广告，非 feed），cpm=0。
 * - top_banner 支持 operational（运营自配免费）+ commercial（竞价售卖）双模式，故定价填真实值。
 *
 * 幂等: 先查已存在的 slot_key，仅插入缺失的，重复执行安全。
 *
 * 回滚: 删除本次创建的 5 个 {position}_top_banner 槽位（仅当其下无投放计划时，
 *       由 DB 外键 RESTRICT 兜底；正常上线前无投放，可安全回滚）。
 */

const TOP_BANNER_SLOTS = [
  { position: 'lottery', slot_name: '回馈页头部Banner', daily_price_star_stone: 200 },
  { position: 'profile', slot_name: '个人中心头部Banner', daily_price_star_stone: 150 },
  { position: 'diy', slot_name: 'DIY页头部Banner', daily_price_star_stone: 150 },
  { position: 'camera', slot_name: '拍照页头部Banner', daily_price_star_stone: 150 },
  { position: 'exchange', slot_name: '商城页头部Banner', daily_price_star_stone: 150 }
]

module.exports = {
  async up(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize
    const transaction = await sequelize.transaction()
    try {
      const slotKeys = TOP_BANNER_SLOTS.map(s => `${s.position}_top_banner`)
      const [existing] = await sequelize.query(
        'SELECT slot_key FROM ad_slots WHERE slot_key IN (:slotKeys)',
        { replacements: { slotKeys }, transaction }
      )
      const existingKeys = new Set(existing.map(r => r.slot_key))
      const now = new Date()

      const rows = TOP_BANNER_SLOTS.filter(
        s => !existingKeys.has(`${s.position}_top_banner`)
      ).map(s => ({
        slot_key: `${s.position}_top_banner`,
        slot_name: s.slot_name,
        slot_type: 'top_banner',
        position: s.position,
        max_display_count: 5,
        daily_price_star_stone: s.daily_price_star_stone,
        min_bid_star_stone: 80,
        min_budget_star_stone: 500,
        min_daily_price_star_stone: 0,
        floor_price_override: null,
        zone_id: null,
        slot_category: 'display',
        cpm_price_star_stone: 0,
        is_active: 1,
        is_carousel: 0,
        slide_interval_ms: 3000,
        description: `${s.slot_name}（运营可配，支持单张/轮播、可选跳转）`,
        created_at: now,
        updated_at: now
      }))

      if (rows.length > 0) {
        await queryInterface.bulkInsert('ad_slots', rows, { transaction })
      }

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const sequelize = queryInterface.sequelize
    const slotKeys = TOP_BANNER_SLOTS.map(s => `${s.position}_top_banner`)
    await queryInterface.bulkDelete(
      'ad_slots',
      { slot_key: { [Sequelize.Op.in]: slotKeys } },
      {}
    )
  }
}
