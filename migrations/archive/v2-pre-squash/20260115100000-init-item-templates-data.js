'use strict'

/**
 * 初始化 item_templates 数据迁移
 *
 * 基于 MarketListingService-category参数兼容残留清理报告-2026-01-13.md 要求
 *
 * 业务背景：
 * - item_templates 表已创建但数据为空
 * - 需要基于现有 item_instances.item_type 生成模板数据
 * - 主要类型：voucher（优惠券）、product（实物商品）
 *
 * 变更内容：
 * 1. 插入 item_templates 初始数据
 * 2. 暂不回填 item_instances.item_template_id（因为物品已通过 meta.name 区分）
 *
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('📋 开始初始化 item_templates 数据...')

      // ========================================
      // 第一步：插入 item_templates 初始模板数据
      // ========================================

      // 基于业务需求定义的物品模板
      // 注意：template_code 必须唯一，采用 snake_case 命名
      const templates = [
        // ========== 优惠券类（voucher）==========
        {
          template_code: 'voucher_100_yuan',
          item_type: 'voucher',
          category_code: 'voucher',
          rarity_code: 'common',
          display_name: '100元优惠券',
          description: '可用于餐厅消费抵扣的100元优惠券',
          reference_price_points: 100.0,
          is_tradable: true,
          is_enabled: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          template_code: 'voucher_50_yuan',
          item_type: 'voucher',
          category_code: 'voucher',
          rarity_code: 'common',
          display_name: '50元优惠券',
          description: '可用于餐厅消费抵扣的50元优惠券',
          reference_price_points: 50.0,
          is_tradable: true,
          is_enabled: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          template_code: 'voucher_discount_10',
          item_type: 'voucher',
          category_code: 'voucher',
          rarity_code: 'uncommon',
          display_name: '9折优惠券',
          description: '餐厅消费可享受9折优惠',
          reference_price_points: 80.0,
          is_tradable: true,
          is_enabled: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          template_code: 'voucher_discount_20',
          item_type: 'voucher',
          category_code: 'voucher',
          rarity_code: 'rare',
          display_name: '8折优惠券',
          description: '餐厅消费可享受8折优惠',
          reference_price_points: 150.0,
          is_tradable: true,
          is_enabled: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        // ========== 实物商品类（product）==========
        {
          template_code: 'product_generic',
          item_type: 'product',
          category_code: 'other',
          rarity_code: 'common',
          display_name: '实物商品',
          description: '通用实物商品模板',
          reference_price_points: 200.0,
          is_tradable: true,
          is_enabled: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        // ========== 餐饮美食类（food_drink）==========
        {
          template_code: 'food_set_meal_single',
          item_type: 'voucher',
          category_code: 'food_drink',
          rarity_code: 'common',
          display_name: '单人套餐券',
          description: '单人精选套餐兑换券',
          reference_price_points: 88.0,
          is_tradable: true,
          is_enabled: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          template_code: 'food_set_meal_double',
          item_type: 'voucher',
          category_code: 'food_drink',
          rarity_code: 'uncommon',
          display_name: '双人套餐券',
          description: '双人精选套餐兑换券',
          reference_price_points: 158.0,
          is_tradable: true,
          is_enabled: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          template_code: 'food_set_meal_family',
          item_type: 'voucher',
          category_code: 'food_drink',
          rarity_code: 'rare',
          display_name: '家庭套餐券',
          description: '4人家庭套餐兑换券',
          reference_price_points: 298.0,
          is_tradable: true,
          is_enabled: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        // ========== 电子产品类（electronics）==========
        {
          template_code: 'electronics_wireless_earbuds',
          item_type: 'product',
          category_code: 'electronics',
          rarity_code: 'rare',
          display_name: '无线蓝牙耳机',
          description: '高品质无线蓝牙耳机',
          reference_price_points: 500.0,
          is_tradable: true,
          is_enabled: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          template_code: 'electronics_portable_charger',
          item_type: 'product',
          category_code: 'electronics',
          rarity_code: 'uncommon',
          display_name: '移动电源',
          description: '10000mAh 大容量移动电源',
          reference_price_points: 200.0,
          is_tradable: true,
          is_enabled: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          template_code: 'electronics_smartphone',
          item_type: 'product',
          category_code: 'electronics',
          rarity_code: 'legendary',
          display_name: '智能手机',
          description: '最新款智能手机大奖',
          reference_price_points: 5000.0,
          is_tradable: true,
          is_enabled: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        // ========== 礼品卡类（gift_card）==========
        {
          template_code: 'gift_card_100',
          item_type: 'voucher',
          category_code: 'gift_card',
          rarity_code: 'uncommon',
          display_name: '100元礼品卡',
          description: '通用100元购物礼品卡',
          reference_price_points: 100.0,
          is_tradable: true,
          is_enabled: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          template_code: 'gift_card_200',
          item_type: 'voucher',
          category_code: 'gift_card',
          rarity_code: 'rare',
          display_name: '200元礼品卡',
          description: '通用200元购物礼品卡',
          reference_price_points: 200.0,
          is_tradable: true,
          is_enabled: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          template_code: 'gift_card_500',
          item_type: 'voucher',
          category_code: 'gift_card',
          rarity_code: 'epic',
          display_name: '500元礼品卡',
          description: '通用500元购物礼品卡',
          reference_price_points: 500.0,
          is_tradable: true,
          is_enabled: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        // ========== 家居生活类（home_life）==========
        {
          template_code: 'home_kitchen_set',
          item_type: 'product',
          category_code: 'home_life',
          rarity_code: 'rare',
          display_name: '厨房用品套装',
          description: '精品厨房用品四件套',
          reference_price_points: 300.0,
          is_tradable: true,
          is_enabled: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          template_code: 'home_towel_set',
          item_type: 'product',
          category_code: 'home_life',
          rarity_code: 'common',
          display_name: '毛巾礼盒',
          description: '高品质纯棉毛巾礼盒',
          reference_price_points: 100.0,
          is_tradable: true,
          is_enabled: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      ]

      // 检查表是否有数据，避免重复插入
      const [[{ count }]] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) as count FROM item_templates',
        { transaction }
      )

      if (count > 0) {
        console.log(`ℹ️ item_templates 表已有 ${count} 条数据，跳过初始化`)
      } else {
        await queryInterface.bulkInsert('item_templates', templates, { transaction })
        console.log(`✅ 成功插入 ${templates.length} 条物品模板数据`)
      }

      // ========================================
      // 提交事务
      // ========================================
      await transaction.commit()
      console.log('✅ item_templates 数据初始化完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始回滚 item_templates 数据...')

      // 清空 item_templates 表数据（保留表结构）
      await queryInterface.bulkDelete('item_templates', {}, { transaction })

      await transaction.commit()
      console.log('✅ item_templates 数据回滚完成（表已清空）')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
