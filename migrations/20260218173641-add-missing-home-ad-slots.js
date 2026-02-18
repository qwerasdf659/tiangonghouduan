'use strict'

/**
 * 补充文档规定的首页广告位初始数据
 *
 * 广告系统升级方案 14.3.1 节规定 4 个初始广告位：
 *   home_popup / home_carousel / lottery_popup / profile_popup
 * 其中 lottery_popup 和 profile_popup 已存在，本迁移补充缺失的两个首页广告位。
 *
 * @see docs/广告系统升级方案.md 第 14.3.1 节
 */
module.exports = {
  async up(queryInterface) {
    // 检查是否已存在，避免重复插入
    const [existing] = await queryInterface.sequelize.query(
      "SELECT slot_key FROM ad_slots WHERE slot_key IN ('home_popup', 'home_carousel')"
    )
    const existingKeys = existing.map(r => r.slot_key)

    const slotsToInsert = []

    if (!existingKeys.includes('home_popup')) {
      slotsToInsert.push({
        slot_key: 'home_popup',
        slot_name: '首页弹窗位',
        slot_type: 'popup',
        position: 'home',
        max_display_count: 3,
        daily_price_diamond: 100,
        min_bid_diamond: 50,
        min_budget_diamond: 500,
        is_active: true,
        description: '首页弹窗广告位，用户打开首页时展示',
        created_at: new Date(),
        updated_at: new Date()
      })
    }

    if (!existingKeys.includes('home_carousel')) {
      slotsToInsert.push({
        slot_key: 'home_carousel',
        slot_name: '首页轮播位',
        slot_type: 'carousel',
        position: 'home',
        max_display_count: 3,
        daily_price_diamond: 60,
        min_bid_diamond: 50,
        min_budget_diamond: 500,
        is_active: true,
        description: '首页轮播图广告位，嵌入首页 swiper 组件',
        created_at: new Date(),
        updated_at: new Date()
      })
    }

    if (slotsToInsert.length > 0) {
      await queryInterface.bulkInsert('ad_slots', slotsToInsert)
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('ad_slots', {
      slot_key: ['home_popup', 'home_carousel']
    })
  }
}
