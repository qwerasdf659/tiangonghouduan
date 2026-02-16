'use strict'

/**
 * 数据库迁移：插入 system_configs 初始配置数据
 *
 * 业务背景：
 * - 需求4（商品筛选配置）：前端需要从后端获取筛选范围配置，避免硬编码
 * - 需求13（反馈表单配置）：前端需要从后端获取反馈表单的类别、限制等配置
 * - 路由层（routes/v4/system/config.js）已有默认值兜底，但运营应通过数据库维护配置
 * - 数据库中只有 campaign_placement 配置，缺少 product_filter 和 feedback_config
 *
 * 变更内容：
 * - system_configs 表插入 config_key = 'product_filter' 配置记录
 * - system_configs 表插入 config_key = 'feedback_config' 配置记录
 *
 * 回滚方案：
 * - down() 删除这两条配置记录
 *
 * @date 2026-02-16
 */
module.exports = {
  async up(queryInterface, _Sequelize) {
    console.log('📦 [迁移] 开始：插入 system_configs 初始配置数据...')

    // 检查是否已存在（防御性编程）
    const [existing] = await queryInterface.sequelize.query(
      "SELECT config_key FROM system_configs WHERE config_key IN ('product_filter', 'feedback_config')"
    )

    const existingKeys = existing.map(r => r.config_key)

    // 1. 插入商品筛选配置（需求4）
    if (!existingKeys.includes('product_filter')) {
      const productFilterConfig = {
        cost_ranges: [
          { label: '全部', min: null, max: null },
          { label: '100以内', min: 0, max: 100 },
          { label: '100-500', min: 100, max: 500 },
          { label: '500-1000', min: 500, max: 1000 },
          { label: '1000以上', min: 1000, max: null }
        ],
        categories: [],
        sort_options: [
          { label: '默认排序', value: 'sort_order' },
          { label: '价格从低到高', value: 'cost_amount_asc' },
          { label: '价格从高到低', value: 'cost_amount_desc' },
          { label: '最新上架', value: 'created_at_desc' },
          { label: '销量最高', value: 'sold_count_desc' }
        ],
        stock_statuses: [
          { label: '全部', value: 'all' },
          { label: '有货', value: 'in_stock' },
          { label: '即将售罄', value: 'low_stock' }
        ]
      }

      await queryInterface.bulkInsert('system_configs', [
        {
          config_key: 'product_filter',
          config_value: JSON.stringify(productFilterConfig),
          description: '兑换商品筛选配置（需求4）：前端筛选区间/分类/排序/库存状态选项',
          is_active: 1,
          created_at: new Date(),
          updated_at: new Date()
        }
      ])
      console.log('  ✅ product_filter 配置已插入')
    } else {
      console.log('  ⚠️ product_filter 配置已存在，跳过插入')
    }

    // 2. 插入反馈表单配置（需求13）
    if (!existingKeys.includes('feedback_config')) {
      const feedbackConfig = {
        categories: [
          { value: 'technical', label: '技术问题' },
          { value: 'feature', label: '功能建议' },
          { value: 'bug', label: 'Bug反馈' },
          { value: 'complaint', label: '投诉' },
          { value: 'suggestion', label: '建议' },
          { value: 'other', label: '其他' }
        ],
        priorities: [
          { value: 'low', label: '低' },
          { value: 'medium', label: '中' },
          { value: 'high', label: '高' }
        ],
        content_rules: {
          min_length: 10,
          max_length: 500
        },
        attachment_rules: {
          max_images: 5,
          max_file_size: 5242880,
          allowed_types: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
        }
      }

      await queryInterface.bulkInsert('system_configs', [
        {
          config_key: 'feedback_config',
          config_value: JSON.stringify(feedbackConfig),
          description: '反馈表单配置（需求13）：反馈类别/优先级/内容限制/附件限制',
          is_active: 1,
          created_at: new Date(),
          updated_at: new Date()
        }
      ])
      console.log('  ✅ feedback_config 配置已插入')
    } else {
      console.log('  ⚠️ feedback_config 配置已存在，跳过插入')
    }

    console.log('📦 [迁移] 完成：system_configs 初始配置数据插入完毕')
  },

  async down(queryInterface, _Sequelize) {
    console.log('📦 [回滚] 开始：删除 system_configs 初始配置数据...')

    await queryInterface.bulkDelete('system_configs', {
      config_key: ['product_filter', 'feedback_config']
    })

    console.log('📦 [回滚] 完成：已删除 product_filter 和 feedback_config 配置')
  }
}



























