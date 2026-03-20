'use strict'

/**
 * 种子数据: 二级子分类
 *
 * 为已启用的一级分类创建二级子分类，完善两级分类体系。
 * 文档 8.5.4 设计要求，当前所有分类均为 level=1 无子分类。
 *
 * 创建时间: 20260320100000
 * 创建原因: 差距分析文档要求完善两级分类数据
 */

module.exports = {
  async up(queryInterface) {
    const now = new Date()

    const parentMap = await queryInterface.sequelize.query(
      `SELECT category_def_id, category_code FROM category_defs WHERE level = 1`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    )

    const parentIdByCode = {}
    for (const row of parentMap) {
      parentIdByCode[row.category_code] = row.category_def_id
    }

    const subcategories = []

    if (parentIdByCode.home_life) {
      subcategories.push(
        { category_code: 'home_goods', display_name: '家居用品', description: '家庭日常使用的生活用品', parent_category_def_id: parentIdByCode.home_life, level: 2, sort_order: 10, is_enabled: true, created_at: now, updated_at: now },
        { category_code: 'kitchen', display_name: '厨房用品', description: '厨房烹饪相关用品', parent_category_def_id: parentIdByCode.home_life, level: 2, sort_order: 20, is_enabled: true, created_at: now, updated_at: now }
      )
    }

    if (parentIdByCode.lifestyle) {
      subcategories.push(
        { category_code: 'personal_care', display_name: '个人护理', description: '个人清洁与护理用品', parent_category_def_id: parentIdByCode.lifestyle, level: 2, sort_order: 10, is_enabled: true, created_at: now, updated_at: now },
        { category_code: 'outdoor', display_name: '户外运动', description: '户外运动与休闲装备', parent_category_def_id: parentIdByCode.lifestyle, level: 2, sort_order: 20, is_enabled: true, created_at: now, updated_at: now }
      )
    }

    if (parentIdByCode.food) {
      subcategories.push(
        { category_code: 'food_voucher', display_name: '餐饮代金券', description: '可在餐厅使用的代金券', parent_category_def_id: parentIdByCode.food, level: 2, sort_order: 10, is_enabled: true, created_at: now, updated_at: now },
        { category_code: 'drink_voucher', display_name: '饮品券', description: '饮品类兑换券', parent_category_def_id: parentIdByCode.food, level: 2, sort_order: 20, is_enabled: true, created_at: now, updated_at: now },
        { category_code: 'snack', display_name: '休闲零食', description: '休闲食品与零食', parent_category_def_id: parentIdByCode.food, level: 2, sort_order: 30, is_enabled: true, created_at: now, updated_at: now }
      )
    }

    if (parentIdByCode.collectible) {
      subcategories.push(
        { category_code: 'badge', display_name: '徽章', description: '收藏徽章与纪念品', parent_category_def_id: parentIdByCode.collectible, level: 2, sort_order: 10, is_enabled: true, created_at: now, updated_at: now },
        { category_code: 'figurine', display_name: '手办', description: '收藏手办与模型', parent_category_def_id: parentIdByCode.collectible, level: 2, sort_order: 20, is_enabled: true, created_at: now, updated_at: now },
        { category_code: 'card', display_name: '卡牌', description: '收藏卡牌', parent_category_def_id: parentIdByCode.collectible, level: 2, sort_order: 30, is_enabled: true, created_at: now, updated_at: now }
      )
    }

    if (parentIdByCode.voucher) {
      subcategories.push(
        { category_code: 'discount_voucher', display_name: '折扣券', description: '商品折扣优惠券', parent_category_def_id: parentIdByCode.voucher, level: 2, sort_order: 10, is_enabled: true, created_at: now, updated_at: now },
        { category_code: 'cashback_voucher', display_name: '返现券', description: '消费返现优惠券', parent_category_def_id: parentIdByCode.voucher, level: 2, sort_order: 20, is_enabled: true, created_at: now, updated_at: now }
      )
    }

    if (parentIdByCode.electronics) {
      subcategories.push(
        { category_code: 'phone', display_name: '手机', description: '手机及配件', parent_category_def_id: parentIdByCode.electronics, level: 2, sort_order: 10, is_enabled: true, created_at: now, updated_at: now },
        { category_code: 'headphone', display_name: '耳机', description: '耳机及音响设备', parent_category_def_id: parentIdByCode.electronics, level: 2, sort_order: 20, is_enabled: true, created_at: now, updated_at: now },
        { category_code: 'wearable', display_name: '穿戴设备', description: '智能手表及穿戴设备', parent_category_def_id: parentIdByCode.electronics, level: 2, sort_order: 30, is_enabled: true, created_at: now, updated_at: now }
      )
    }

    if (parentIdByCode.other) {
      subcategories.push(
        { category_code: 'merch', display_name: '周边商品', description: '品牌周边与文创商品', parent_category_def_id: parentIdByCode.other, level: 2, sort_order: 10, is_enabled: true, created_at: now, updated_at: now }
      )
    }

    if (subcategories.length > 0) {
      await queryInterface.bulkInsert('category_defs', subcategories)
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('category_defs', {
      level: 2
    })
  }
}
