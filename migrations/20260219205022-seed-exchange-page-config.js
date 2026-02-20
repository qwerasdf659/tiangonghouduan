'use strict'

/**
 * 数据库迁移：兑换页面配置初始化
 *
 * 业务背景：
 * - 兑换页面深度配置化（方案二）：将前端硬编码的 Tab/空间/筛选/卡片主题/运营参数
 *   改为后端 API 下发，运营无需前端发版即可调整
 * - 复用 system_configs 表（已有 campaign_placement/product_filter/feedback_config 先例）
 *
 * 变更内容：
 * 1. 补全 exchange_items 中 category 为 NULL 的 active 商品（数据质量修复）
 * 2. 插入 config_key = 'exchange_page' 配置记录
 * 3. 将旧 product_filter 配置标记为未启用（exchange_page.shop_filters 完全替代）
 *
 * @date 2026-02-19
 * @see docs/exchange-config-implementation.md
 */
module.exports = {
  async up(queryInterface, _Sequelize) {
    console.log('📦 [迁移] 开始：兑换页面配置初始化...')

    // ========== Step 1: 补全 exchange_items 缺失的 category 字段 ==========
    const [nullCategoryItems] = await queryInterface.sequelize.query(
      "SELECT exchange_item_id, item_name FROM exchange_items WHERE status = 'active' AND category IS NULL"
    )

    if (nullCategoryItems.length > 0) {
      console.log(`  🔧 发现 ${nullCategoryItems.length} 条 active 商品缺少分类，开始补全...`)

      const categories = ['创意礼品', '品质生活', '数码配件', '日用百货', '美食特产', '运动户外']

      for (let i = 0; i < nullCategoryItems.length; i++) {
        const item = nullCategoryItems[i]
        const category = categories[i % categories.length]
        await queryInterface.sequelize.query(
          'UPDATE exchange_items SET category = ? WHERE exchange_item_id = ?',
          { replacements: [category, item.exchange_item_id] }
        )
      }
      console.log(`  ✅ 已补全 ${nullCategoryItems.length} 条商品分类`)
    } else {
      console.log('  ✅ 所有 active 商品已有分类，跳过补全')
    }

    // ========== Step 2: 插入 exchange_page 配置 ==========
    const [existing] = await queryInterface.sequelize.query(
      "SELECT config_key FROM system_configs WHERE config_key = 'exchange_page'"
    )

    if (existing.length === 0) {
      /** 兑换页面完整配置 JSON — 数据来源见 docs/exchange-config-implementation.md 3.2 节 */
      const exchangePageConfig = {
        tabs: [
          { key: 'market', label: '商品兑换', icon: 'download', enabled: true, sort_order: 1 },
          { key: 'exchange', label: '交易市场', icon: 'success', enabled: true, sort_order: 2 }
        ],
        spaces: [
          {
            id: 'lucky', name: '🎁 幸运空间', subtitle: '瀑布流卡片',
            description: '发现随机好物', layout: 'waterfall', color: '#52c41a',
            bgGradient: 'linear-gradient(135deg, #52c41a 0%, #95de64 100%)',
            locked: false, enabled: true, sort_order: 1
          },
          {
            id: 'premium', name: '💎 臻选空间', subtitle: '混合精品展示',
            description: '解锁高级商品', layout: 'simple', color: '#667eea',
            bgGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            locked: true, enabled: true, sort_order: 2
          }
        ],
        shop_filters: {
          categories: [
            { value: 'all', label: '全部' },
            { value: '数码配件', label: '数码配件' },
            { value: '品质生活', label: '品质生活' },
            { value: '日用百货', label: '日用百货' },
            { value: '创意礼品', label: '创意礼品' },
            { value: '美食特产', label: '美食特产' },
            { value: '运动户外', label: '运动户外' }
          ],
          cost_ranges: [
            { label: '全部', min: null, max: null },
            { label: '50以内', min: 0, max: 50 },
            { label: '50-200', min: 50, max: 200 },
            { label: '200-500', min: 200, max: 500 },
            { label: '500以上', min: 500, max: null }
          ],
          basic_filters: [
            { value: 'all', label: '全部', showCount: true },
            { value: 'available', label: '可兑换', showCount: false },
            { value: 'low-price', label: '低价好物', showCount: false }
          ],
          stock_statuses: [
            { value: 'all', label: '全部' },
            { value: 'in_stock', label: '库存充足' },
            { value: 'low_stock', label: '即将售罄' }
          ],
          sort_options: [
            { value: 'sort_order', label: '默认排序' },
            { value: 'cost_amount_asc', label: '价格从低到高' },
            { value: 'cost_amount_desc', label: '价格从高到低' },
            { value: 'created_at_desc', label: '最新上架' },
            { value: 'sold_count_desc', label: '销量最高' }
          ]
        },
        market_filters: {
          type_filters: [
            { value: 'all', label: '全部', showCount: true },
            { value: 'item_instance', label: '物品', showCount: false },
            { value: 'fungible_asset', label: '资产', showCount: false }
          ],
          category_filters: [
            { value: 'all', label: '全部' },
            { value: 'item_instance', label: '物品实例' },
            { value: 'fungible_asset', label: '可叠加资产' }
          ],
          sort_options: [
            { value: 'default', label: '默认' },
            { value: 'created_at_desc', label: '最新上架' },
            { value: 'price_amount_asc', label: '价格升序' },
            { value: 'price_amount_desc', label: '价格降序' }
          ]
        },
        card_display: {
          theme: 'E',
          effects: {
            grain: true, holo: true, rotatingBorder: true,
            breathingGlow: true, ripple: true, fullbleed: true, listView: false
          },
          shop_cta_text: '立即兑换',
          market_cta_text: '立即购买',
          show_stock_bar: true,
          stock_display_mode: 'bar',
          show_sold_count: true,
          show_tags: true,
          price_display_mode: 'highlight',
          image_placeholder_style: 'gradient',
          press_effect: 'ripple',
          show_type_badge: true,
          price_color_mode: 'type_based',
          default_view_mode: 'grid'
        },
        ui: {
          low_stock_threshold: 10,
          grid_page_size: 4,
          waterfall_page_size: 20,
          default_api_page_size: 20,
          search_debounce_ms: 500
        }
      }

      await queryInterface.bulkInsert('system_configs', [
        {
          config_key: 'exchange_page',
          config_value: JSON.stringify(exchangePageConfig),
          description: '兑换页面配置 — Tab/空间/筛选/卡片主题/运营参数的统一下发配置',
          config_category: 'feature',
          is_active: 1,
          created_at: new Date(),
          updated_at: new Date()
        }
      ])
      console.log('  ✅ exchange_page 配置已插入')
    } else {
      console.log('  ⚠️ exchange_page 配置已存在，跳过插入')
    }

    // ========== Step 3: 禁用旧 product_filter 配置（已被 exchange_page.shop_filters 替代） ==========
    const [productFilter] = await queryInterface.sequelize.query(
      "SELECT system_config_id, is_active FROM system_configs WHERE config_key = 'product_filter'"
    )

    if (productFilter.length > 0 && productFilter[0].is_active === 1) {
      await queryInterface.sequelize.query(
        "UPDATE system_configs SET is_active = 0, updated_at = NOW() WHERE config_key = 'product_filter'"
      )
      console.log('  ✅ product_filter 配置已禁用（被 exchange_page.shop_filters 替代）')
    }

    console.log('📦 [迁移] 完成：兑换页面配置初始化')
  },

  async down(queryInterface, _Sequelize) {
    console.log('📦 [回滚] 开始：撤销兑换页面配置初始化...')

    await queryInterface.bulkDelete('system_configs', {
      config_key: 'exchange_page'
    })
    console.log('  ✅ 已删除 exchange_page 配置')

    // 恢复 product_filter 启用状态
    await queryInterface.sequelize.query(
      "UPDATE system_configs SET is_active = 1, updated_at = NOW() WHERE config_key = 'product_filter'"
    )
    console.log('  ✅ 已恢复 product_filter 启用状态')

    console.log('📦 [回滚] 完成')
  }
}
