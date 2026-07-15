/**
 * system_settings 描述补全 — 补充缺失的中文业务描述
 *
 * 业务背景：
 * - 22 条 system_settings 记录缺少 description 字段
 * - 运营人员在管理后台无法理解配置项含义
 * - 本迁移为所有缺失描述的配置项补充准确的中文业务说明
 *
 * @module migrations/20260422100100-fill-system-settings-descriptions
 */

'use strict'

const DESCRIPTIONS = {
  // 广告定价
  ad_consecutive_discount_tiers: '广告连续投放折扣阶梯（JSON 格式，按连续天数给予不同折扣比例）',
  ad_dau_coefficient_tiers: '广告 DAU 系数阶梯（JSON 格式，按日活用户数调整广告单价系数）',
  ad_dau_pricing_enabled: '是否启用基于 DAU 的动态广告定价（true/false）',
  ad_discount_enabled: '是否启用广告折扣功能（true/false）',
  ad_dynamic_floor_price_config: '广告动态底价配置（JSON 格式，防止广告价格低于成本线）',
  ad_price_adjustment_trigger: '广告价格调整触发条件（JSON 格式，定义何时自动调价）',

  // 广告系统
  popup_queue_max_count: '弹窗广告队列最大数量（单次会话中最多展示的弹窗广告数）',

  // 背包
  backpack_use_instructions: '背包物品使用说明配置（JSON 格式，按物品类型定义使用引导文案）',
  item_type_action_rules: '物品类型操作规则（JSON 格式，定义各类物品可执行的操作：使用/转赠/上架等）',

  // 批量操作
  batch_operation_global: '批量操作全局配置（JSON 格式，包含并发数、超时时间等全局参数）',
  batch_rate_limit_budget: '批量预算调整频率限制（每分钟最大操作次数，防止误操作）',
  batch_rate_limit_campaign_status: '批量活动状态变更频率限制（每分钟最大操作次数）',
  batch_rate_limit_preset: '批量预设操作频率限制（每分钟最大操作次数）',
  batch_rate_limit_quota_grant: '批量配额发放频率限制（每分钟最大操作次数）',
  batch_rate_limit_redemption: '批量核销操作频率限制（每分钟最大操作次数）',

  // 客服
  cs_reply_templates: '客服快捷回复模板（JSON 数组，预设常用回复内容供客服选择）',

  // 功能
  app_theme: '应用主题配置（JSON 格式，包含主色调、Logo、品牌色等视觉配置）',
  campaign_placement: '活动展示位配置（JSON 格式，定义首页/详情页等位置的活动展示规则）',

  // 通用
  data_cleanup_policies: '数据清理策略（JSON 格式，定义各类过期数据的自动清理规则和保留天数）',
  feedback_config: '用户反馈功能配置（JSON 格式，包含反馈类型、字数限制、图片上传等参数）',
  product_filter: '商品筛选配置（JSON 格式，定义商品列表页的筛选维度和选项）',

  // 交易市场
  trade_order_timeout_minutes: '交易订单超时时间（分钟），超时未支付的订单自动取消'
}

module.exports = {
  up: async (queryInterface, _Sequelize) => {
    console.log('🔧 [迁移] 补充 system_settings 描述 — 开始执行...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      let updated = 0
      for (const [key, desc] of Object.entries(DESCRIPTIONS)) {
        const [result] = await queryInterface.sequelize.query(
          `UPDATE system_settings SET description = ? WHERE setting_key = ? AND (description IS NULL OR description = '')`,
          { replacements: [desc, key], transaction }
        )
        if (result.affectedRows > 0) updated++
      }

      await transaction.commit()
      console.log(`✅ [迁移] 补充描述完成: ${updated}/${Object.keys(DESCRIPTIONS).length} 条`)
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [迁移] 补充描述失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface, _Sequelize) => {
    console.log('🔧 [回滚] 清除补充的描述...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      const keys = Object.keys(DESCRIPTIONS)
      await queryInterface.sequelize.query(
        `UPDATE system_settings SET description = NULL WHERE setting_key IN (${keys.map(() => '?').join(',')})`,
        { replacements: keys, transaction }
      )

      await transaction.commit()
      console.log('✅ [回滚] 描述已清除')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [回滚] 失败:', error.message)
      throw error
    }
  }
}
