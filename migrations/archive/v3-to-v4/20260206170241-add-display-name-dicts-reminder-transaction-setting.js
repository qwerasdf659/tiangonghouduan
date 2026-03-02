'use strict'

/**
 * 数据库迁移：新增中文化字典数据（提醒规则类型 + 资产交易业务类型）
 *
 * 业务背景：
 * 前端中文化改造，将前端维护的中文映射函数迁移到后端字典驱动模式
 * 涉及页面：
 * - #5 reminder-rules / system-settings → 提醒规则类型（reminder_rule_type）
 * - #7 assets-portfolio → 资产交易业务类型（asset_business_type）
 *
 * 注意：
 * - #4 statistics 使用已有的 dimension_type 字典（无需新增）
 * - #8 presets 使用已有的 management_setting_type 字典（无需新增）
 *
 * @module migrations/20260206170241-add-display-name-dicts-reminder-transaction-setting
 */

module.exports = {
  async up(queryInterface) {
    const now = new Date()

    await queryInterface.bulkInsert('system_dictionaries', [
      // ==================== reminder_rule_type（提醒规则类型）====================
      // 基于 ReminderEngineService.RULE_PROCESSORS 中实际支持的规则类型
      { dict_type: 'reminder_rule_type', dict_code: 'pending_timeout', dict_name: '待处理超时', dict_color: 'bg-warning', sort_order: 1, is_enabled: 1, remark: '检测待处理项超时', version: 1, created_at: now, updated_at: now },
      { dict_type: 'reminder_rule_type', dict_code: 'budget_alert', dict_name: '预算告警', dict_color: 'bg-danger', sort_order: 2, is_enabled: 1, remark: '活动预算使用率告警', version: 1, created_at: now, updated_at: now },
      { dict_type: 'reminder_rule_type', dict_code: 'stock_low', dict_name: '库存不足', dict_color: 'bg-danger', sort_order: 3, is_enabled: 1, remark: '奖品库存低于阈值', version: 1, created_at: now, updated_at: now },
      { dict_type: 'reminder_rule_type', dict_code: 'scheduled', dict_name: '定时提醒', dict_color: 'bg-info', sort_order: 4, is_enabled: 1, remark: '定时触发的提醒规则', version: 1, created_at: now, updated_at: now },
      { dict_type: 'reminder_rule_type', dict_code: 'custom', dict_name: '自定义规则', dict_color: 'bg-secondary', sort_order: 5, is_enabled: 1, remark: '自定义检测规则', version: 1, created_at: now, updated_at: now },

      // ==================== asset_business_type（资产交易业务类型）====================
      // 基于 asset_transactions 表中实际使用的 business_type 值（排除 test_* 测试类型）
      { dict_type: 'asset_business_type', dict_code: 'admin_adjustment', dict_name: '管理员调整', dict_color: 'bg-warning', sort_order: 1, is_enabled: 1, remark: '管理员手动调整资产', version: 1, created_at: now, updated_at: now },
      { dict_type: 'asset_business_type', dict_code: 'lottery_reward', dict_name: '抽奖奖励', dict_color: 'bg-success', sort_order: 2, is_enabled: 1, remark: '抽奖中奖获得资产', version: 1, created_at: now, updated_at: now },
      { dict_type: 'asset_business_type', dict_code: 'lottery_consume', dict_name: '抽奖消耗', dict_color: 'bg-danger', sort_order: 3, is_enabled: 1, remark: '抽奖扣减积分', version: 1, created_at: now, updated_at: now },
      { dict_type: 'asset_business_type', dict_code: 'lottery_budget_deduct', dict_name: '预算扣减', dict_color: 'bg-danger', sort_order: 4, is_enabled: 1, remark: '抽奖预算池扣减', version: 1, created_at: now, updated_at: now },
      { dict_type: 'asset_business_type', dict_code: 'consumption_reward', dict_name: '消费奖励', dict_color: 'bg-success', sort_order: 5, is_enabled: 1, remark: '消费核销获得积分', version: 1, created_at: now, updated_at: now },
      { dict_type: 'asset_business_type', dict_code: 'consumption_budget_allocation', dict_name: '消费预算分配', dict_color: 'bg-info', sort_order: 6, is_enabled: 1, remark: '消费预算分配到门店', version: 1, created_at: now, updated_at: now },
      { dict_type: 'asset_business_type', dict_code: 'exchange_debit', dict_name: '兑换扣减', dict_color: 'bg-danger', sort_order: 7, is_enabled: 1, remark: '兑换商品扣减积分', version: 1, created_at: now, updated_at: now },
      { dict_type: 'asset_business_type', dict_code: 'market_listing_freeze', dict_name: '挂单冻结', dict_color: 'bg-warning', sort_order: 8, is_enabled: 1, remark: '市场挂单冻结资产', version: 1, created_at: now, updated_at: now },
      { dict_type: 'asset_business_type', dict_code: 'market_listing_withdraw_unfreeze', dict_name: '撤单解冻', dict_color: 'bg-info', sort_order: 9, is_enabled: 1, remark: '市场撤单解冻资产', version: 1, created_at: now, updated_at: now },
      { dict_type: 'asset_business_type', dict_code: 'market_listing_admin_withdraw_unfreeze', dict_name: '管理员撤单解冻', dict_color: 'bg-info', sort_order: 10, is_enabled: 1, remark: '管理员强制撤单解冻', version: 1, created_at: now, updated_at: now },
      { dict_type: 'asset_business_type', dict_code: 'order_freeze_buyer', dict_name: '买方冻结', dict_color: 'bg-warning', sort_order: 11, is_enabled: 1, remark: '交易买方资产冻结', version: 1, created_at: now, updated_at: now },
      { dict_type: 'asset_business_type', dict_code: 'order_unfreeze_buyer', dict_name: '买方解冻', dict_color: 'bg-info', sort_order: 12, is_enabled: 1, remark: '交易买方资产解冻', version: 1, created_at: now, updated_at: now },
      { dict_type: 'asset_business_type', dict_code: 'order_settle_buyer_debit', dict_name: '买方结算扣款', dict_color: 'bg-danger', sort_order: 13, is_enabled: 1, remark: '交易结算从买方扣款', version: 1, created_at: now, updated_at: now },
      { dict_type: 'asset_business_type', dict_code: 'order_settle_seller_credit', dict_name: '卖方结算到账', dict_color: 'bg-success', sort_order: 14, is_enabled: 1, remark: '交易结算到卖方账户', version: 1, created_at: now, updated_at: now },
      { dict_type: 'asset_business_type', dict_code: 'order_settle_platform_fee_credit', dict_name: '平台手续费', dict_color: 'bg-primary', sort_order: 15, is_enabled: 1, remark: '交易平台手续费收入', version: 1, created_at: now, updated_at: now },
      { dict_type: 'asset_business_type', dict_code: 'order_timeout_unfreeze', dict_name: '超时解冻', dict_color: 'bg-secondary', sort_order: 16, is_enabled: 1, remark: '交易超时自动解冻', version: 1, created_at: now, updated_at: now },
      { dict_type: 'asset_business_type', dict_code: 'listing_settle_seller_offer_debit', dict_name: '卖方挂单扣款', dict_color: 'bg-danger', sort_order: 17, is_enabled: 1, remark: '挂单结算从卖方扣款', version: 1, created_at: now, updated_at: now },
      { dict_type: 'asset_business_type', dict_code: 'listing_transfer_buyer_offer_credit', dict_name: '买方挂单到账', dict_color: 'bg-success', sort_order: 18, is_enabled: 1, remark: '挂单结算到买方账户', version: 1, created_at: now, updated_at: now },
      { dict_type: 'asset_business_type', dict_code: 'listing_withdrawn_unfreeze', dict_name: '挂单撤回解冻', dict_color: 'bg-info', sort_order: 19, is_enabled: 1, remark: '挂单撤回解冻资产', version: 1, created_at: now, updated_at: now },
      { dict_type: 'asset_business_type', dict_code: 'merchant_points_reward', dict_name: '商家积分奖励', dict_color: 'bg-success', sort_order: 20, is_enabled: 1, remark: '商家经营积分奖励', version: 1, created_at: now, updated_at: now },
      { dict_type: 'asset_business_type', dict_code: 'material_convert_credit', dict_name: '材料转换入账', dict_color: 'bg-success', sort_order: 21, is_enabled: 1, remark: '材料转换获得资产', version: 1, created_at: now, updated_at: now },
      { dict_type: 'asset_business_type', dict_code: 'material_convert_debit', dict_name: '材料转换扣减', dict_color: 'bg-danger', sort_order: 22, is_enabled: 1, remark: '材料转换消耗资产', version: 1, created_at: now, updated_at: now },
      { dict_type: 'asset_business_type', dict_code: 'opening_balance', dict_name: '期初余额', dict_color: 'bg-primary', sort_order: 23, is_enabled: 1, remark: '账户初始余额设置', version: 1, created_at: now, updated_at: now },
      { dict_type: 'asset_business_type', dict_code: 'orphan_frozen_cleanup', dict_name: '孤儿冻结清理', dict_color: 'bg-secondary', sort_order: 24, is_enabled: 1, remark: '清理无关联的冻结资产', version: 1, created_at: now, updated_at: now },
      { dict_type: 'asset_business_type', dict_code: 'admin_data_fix', dict_name: '数据修复', dict_color: 'bg-warning', sort_order: 25, is_enabled: 1, remark: '管理员数据修复操作', version: 1, created_at: now, updated_at: now }
    ])
  },

  async down(queryInterface) {
    // 回滚：删除本次新增的字典类型
    await queryInterface.bulkDelete('system_dictionaries', {
      dict_type: ['reminder_rule_type', 'asset_business_type']
    })
  }
}
