#!/usr/bin/env node
/**
 * 🔧 模型主键/外键重命名脚本
 * 用于阶段2：批量修改模型文件中的主键和外键名称
 * 
 * 执行方式：node scripts/update-model-primary-keys.js
 * 
 * 修改范围：
 * - 57张表的主键名称
 * - 21个技术外键名称
 * - 相关的associations定义
 */

const fs = require('fs')
const path = require('path')

// 主键重命名映射表
const PRIMARY_KEY_MAPPINGS = {
  // 第1批：核心业务表
  'LotteryCampaign.js': { oldPK: 'lottery_campaign_id', newPK: 'lottery_campaign_id' },
  'LotteryPrize.js': { oldPK: 'prize_id', newPK: 'lottery_prize_id' },
  'LotteryDraw.js': { oldPK: 'draw_id', newPK: 'lottery_draw_id' },
  'LotteryPreset.js': { oldPK: 'preset_id', newPK: 'lottery_preset_id' },
  'MarketListing.js': { oldPK: 'listing_id', newPK: 'market_listing_id' },
  'ExchangeItem.js': { oldPK: 'item_id', newPK: 'exchange_item_id' },
  'ImageResources.js': { oldPK: 'image_id', newPK: 'image_resource_id' },
  'CustomerServiceSession.js': { oldPK: 'session_id', newPK: 'customer_service_session_id' },
  'ConsumptionRecord.js': { oldPK: 'record_id', newPK: 'consumption_record_id' },
  'SystemDictionary.js': { oldPK: 'dict_id', newPK: 'system_dictionary_id' },

  // 第2批：日志类模型
  'AdminOperationLog.js': { oldPK: 'log_id', newPK: 'admin_operation_log_id' },
  'BatchOperationLog.js': { oldPK: 'batch_log_id', newPK: 'batch_operation_log_id' },
  'MerchantOperationLog.js': { oldPK: 'merchant_log_id', newPK: 'merchant_operation_log_id' },
  'WebSocketStartupLog.js': { oldPK: 'log_id', newPK: 'websocket_startup_log_id' },
  'ExchangeRecord.js': { oldPK: 'record_id', newPK: 'exchange_record_id' },
  'UserRoleChangeRecord.js': { oldPK: 'record_id', newPK: 'user_role_change_record_id' },
  'UserStatusChangeRecord.js': { oldPK: 'record_id', newPK: 'user_status_change_record_id' },
  'LotteryClearSettingRecord.js': { oldPK: 'record_id', newPK: 'lottery_clear_setting_record_id' },
  'ContentReviewRecord.js': { oldPK: 'audit_id', newPK: 'content_review_record_id' },
  'AdminNotification.js': { oldPK: 'notification_id', newPK: 'admin_notification_id' },

  // 第3批：配置类模型
  'LotteryDrawQuotaRule.js': { oldPK: 'rule_id', newPK: 'lottery_draw_quota_rule_id' },
  'MaterialConversionRule.js': { oldPK: 'rule_id', newPK: 'material_conversion_rule_id' },
  'LotteryTierRule.js': { oldPK: 'tier_rule_id', newPK: 'lottery_tier_rule_id' },
  'LotteryStrategyConfig.js': { oldPK: 'strategy_config_id', newPK: 'lottery_strategy_config_id' },
  'LotteryTierMatrixConfig.js': { oldPK: 'matrix_config_id', newPK: 'lottery_tier_matrix_config_id' },
  'LotteryCampaignPricingConfig.js': { oldPK: 'config_id', newPK: 'lottery_campaign_pricing_config_id' },
  'LotteryManagementSetting.js': { oldPK: 'setting_id', newPK: 'lottery_management_setting_id' },
  'SystemSettings.js': { oldPK: 'setting_id', newPK: 'system_setting_id' },
  'SystemConfig.js': { oldPK: 'config_id', newPK: 'system_config_id' },
  'FeatureFlag.js': { oldPK: 'flag_id', newPK: 'feature_flag_id' },

  // 第4批：统计/状态类模型
  'LotteryHourlyMetrics.js': { oldPK: 'metric_id', newPK: 'lottery_hourly_metric_id' },
  'LotteryDailyMetrics.js': { oldPK: 'daily_metric_id', newPK: 'lottery_daily_metric_id' },
  'LotteryUserExperienceState.js': { oldPK: 'state_id', newPK: 'lottery_user_experience_state_id' },
  'LotteryUserGlobalState.js': { oldPK: 'global_state_id', newPK: 'lottery_user_global_state_id' },
  'LotteryUserDailyDrawQuota.js': { oldPK: 'quota_id', newPK: 'lottery_user_daily_draw_quota_id' },
  'LotteryCampaignUserQuota.js': { oldPK: 'quota_id', newPK: 'lottery_campaign_user_quota_id' },
  'LotteryCampaignQuotaGrant.js': { oldPK: 'grant_id', newPK: 'lottery_campaign_quota_grant_id' },

  // 第5批：其他业务模型
  'AccountAssetBalance.js': { oldPK: 'balance_id', newPK: 'account_asset_balance_id' },
  'AssetTransaction.js': { oldPK: 'transaction_id', newPK: 'asset_transaction_id' },
  'AuthenticationSession.js': { oldPK: 'user_session_id', newPK: 'authentication_session_id' },
  'ChatMessage.js': { oldPK: 'message_id', newPK: 'chat_message_id' },
  'ItemInstanceEvent.js': { oldPK: 'event_id', newPK: 'item_instance_event_id' },
  'LotteryAlert.js': { oldPK: 'alert_id', newPK: 'lottery_alert_id' },
  'LotteryDrawDecision.js': { oldPK: 'decision_id', newPK: 'lottery_draw_decision_id' },
  'PopupBanner.js': { oldPK: 'banner_id', newPK: 'popup_banner_id' },
  'PresetBudgetDebt.js': { oldPK: 'debt_id', newPK: 'preset_budget_debt_id' },
  'PresetInventoryDebt.js': { oldPK: 'debt_id', newPK: 'preset_inventory_debt_id' },
  'PresetDebtLimit.js': { oldPK: 'limit_id', newPK: 'preset_debt_limit_id' },
  'RedemptionOrder.js': { oldPK: 'order_id', newPK: 'redemption_order_id' },
  'RiskAlert.js': { oldPK: 'alert_id', newPK: 'risk_alert_id' },
  'SystemAnnouncement.js': { oldPK: 'announcement_id', newPK: 'system_announcement_id' },
  'SystemDictionaryHistory.js': { oldPK: 'history_id', newPK: 'system_dictionary_history_id' },
  'TradeOrder.js': { oldPK: 'order_id', newPK: 'trade_order_id' },
  'UserHierarchy.js': { oldPK: 'hierarchy_id', newPK: 'user_hierarchy_id' },
  'UserPremiumStatus.js': { oldPK: 'id', newPK: 'user_premium_status_id' },
  'UserRiskProfile.js': { oldPK: 'risk_profile_id', newPK: 'user_risk_profile_id' },
  'ApiIdempotencyRequest.js': { oldPK: 'request_id', newPK: 'api_idempotency_request_id' },
}

// 技术外键重命名映射表 (oldFK => newFK)
const FOREIGN_KEY_MAPPINGS = {
  // lottery_campaigns 的外键（被引用者）
  'lottery_campaign_id': 'lottery_campaign_id',
  // lottery_prizes 的外键
  'prize_id': 'lottery_prize_id',
  // lottery_draws 的外键
  'draw_id': 'lottery_draw_id',
  // lottery_presets 的外键
  'preset_id': 'lottery_preset_id',
  // market_listings 的外键
  'listing_id': 'market_listing_id',
  // exchange_items 的外键
  'item_id': 'exchange_item_id',
  // image_resources 的外键
  'image_id': 'image_resource_id',
  // customer_service_sessions 的外键
  'session_id': 'customer_service_session_id',
  // consumption_records 的外键（特殊：related_record_id → consumption_record_id）
  'related_record_id': 'consumption_record_id',
  // system_dictionaries 的外键
  'dict_id': 'system_dictionary_id',
}

// 需要修改外键的模型文件及其外键字段
const MODELS_WITH_FK_CHANGES = {
  'LotteryPrize.js': ['lottery_campaign_id', 'image_id'],
  'LotteryDraw.js': ['lottery_campaign_id', 'prize_id'],
  'LotteryPreset.js': ['prize_id'],
  'LotteryAlert.js': ['lottery_campaign_id'],
  'LotteryCampaignPricingConfig.js': ['lottery_campaign_id'],
  'LotteryCampaignUserQuota.js': ['lottery_campaign_id'],
  'LotteryDailyMetrics.js': ['lottery_campaign_id'],
  'LotteryHourlyMetrics.js': ['lottery_campaign_id'],
  'LotteryTierRule.js': ['lottery_campaign_id'],
  'LotteryUserExperienceState.js': ['lottery_campaign_id'],
  'LotteryDrawDecision.js': ['draw_id'],
  'TradeOrder.js': ['listing_id'],
  'ExchangeRecord.js': ['item_id'],
  'ChatMessage.js': ['session_id'],
  'PresetBudgetDebt.js': ['preset_id'],
  'PresetInventoryDebt.js': ['preset_id', 'prize_id'],
  'MerchantOperationLog.js': ['related_record_id'],
  'SystemDictionaryHistory.js': ['dict_id'],
}

const modelsDir = path.join(__dirname, '..', 'models')

/**
 * 更新模型文件中的主键名称
 */
function updatePrimaryKey(filePath, oldPK, newPK) {
  let content = fs.readFileSync(filePath, 'utf8')
  const fileName = path.basename(filePath)
  let changes = []

  // 1. 替换主键字段定义 (e.g., lottery_campaign_id: { ... primaryKey: true)
  // 匹配格式：oldPK: { 或 'oldPK': { 并且后面有 primaryKey: true
  const pkDefRegex = new RegExp(`(\\s+)(${oldPK}|'${oldPK}'):\\s*\\{`, 'g')
  if (pkDefRegex.test(content)) {
    content = content.replace(pkDefRegex, `$1${newPK}: {`)
    changes.push(`主键定义 ${oldPK} → ${newPK}`)
  }

  // 2. 替换 this.oldPK 引用
  const thisRefRegex = new RegExp(`this\\.${oldPK}([^a-zA-Z_]|$)`, 'g')
  if (thisRefRegex.test(content)) {
    content = content.replace(thisRefRegex, `this.${newPK}$1`)
    changes.push(`this.${oldPK} → this.${newPK}`)
  }

  // 3. 替换返回对象中的 oldPK: 字段
  const returnObjRegex = new RegExp(`([\\s,{])(${oldPK}):\\s*(this|self)\\.${oldPK}`, 'g')
  if (returnObjRegex.test(content)) {
    content = content.replace(returnObjRegex, `$1${newPK}: $3.${newPK}`)
    changes.push(`返回对象 ${oldPK} → ${newPK}`)
  }

  // 4. 替换 toSummary 等方法中的字段返回
  const summaryFieldRegex = new RegExp(`(${oldPK}):\\s*(this|self)\\.`, 'g')
  if (summaryFieldRegex.test(content)) {
    content = content.replace(summaryFieldRegex, `${newPK}: $2.`)
    changes.push(`摘要字段 ${oldPK} → ${newPK}`)
  }

  // 5. 替换注释中的 oldPK 引用
  const commentPKRef = new RegExp(`\\.${oldPK}(?=[\\s,\\)\\]\\}])`, 'g')
  if (commentPKRef.test(content)) {
    content = content.replace(commentPKRef, `.${newPK}`)
    changes.push(`注释引用 .${oldPK} → .${newPK}`)
  }

  if (changes.length > 0) {
    fs.writeFileSync(filePath, content, 'utf8')
    console.log(`  ✅ ${fileName}: ${changes.join(', ')}`)
    return true
  } else {
    console.log(`  ⚠️ ${fileName}: 未找到需要修改的主键定义`)
    return false
  }
}

/**
 * 更新模型文件中的外键名称（在 foreignKey 和 references 中）
 */
function updateForeignKeys(filePath, fkFields) {
  let content = fs.readFileSync(filePath, 'utf8')
  const fileName = path.basename(filePath)
  let changes = []

  for (const oldFK of fkFields) {
    const newFK = FOREIGN_KEY_MAPPINGS[oldFK]
    if (!newFK) {
      console.log(`  ⚠️ ${fileName}: 外键 ${oldFK} 无映射`)
      continue
    }

    // 1. 替换 foreignKey: 'oldFK' 或 foreignKey: "oldFK"
    const fkStringRegex = new RegExp(`foreignKey:\\s*['"]${oldFK}['"]`, 'g')
    if (fkStringRegex.test(content)) {
      content = content.replace(fkStringRegex, `foreignKey: '${newFK}'`)
      changes.push(`foreignKey: '${oldFK}' → '${newFK}'`)
    }

    // 2. 替换字段定义 oldFK: { ... references 或 comment
    const fieldDefRegex = new RegExp(`(\\s+)(${oldFK}):\\s*\\{([^}]*references|[^}]*comment)`, 'g')
    if (fieldDefRegex.test(content)) {
      content = content.replace(fieldDefRegex, `$1${newFK}: {$3`)
      changes.push(`字段定义 ${oldFK} → ${newFK}`)
    }

    // 3. 替换 key: 'oldFK' 在 references 中
    const refKeyRegex = new RegExp(`key:\\s*['"]${oldFK}['"]`, 'g')
    if (refKeyRegex.test(content)) {
      content = content.replace(refKeyRegex, `key: '${newFK}'`)
      changes.push(`references.key: '${oldFK}' → '${newFK}'`)
    }
  }

  if (changes.length > 0) {
    fs.writeFileSync(filePath, content, 'utf8')
    console.log(`  ✅ ${fileName} FK: ${changes.join(', ')}`)
    return true
  }
  return false
}

/**
 * 主函数
 */
function main() {
  console.log('🔧 开始更新模型文件的主键和外键名称...\n')
  
  let pkUpdated = 0
  let fkUpdated = 0
  let notFound = []

  // 1. 更新主键
  console.log('📌 阶段2.1: 更新主键名称')
  for (const [fileName, mapping] of Object.entries(PRIMARY_KEY_MAPPINGS)) {
    const filePath = path.join(modelsDir, fileName)
    
    if (!fs.existsSync(filePath)) {
      console.log(`  ❌ ${fileName}: 文件不存在`)
      notFound.push(fileName)
      continue
    }

    if (updatePrimaryKey(filePath, mapping.oldPK, mapping.newPK)) {
      pkUpdated++
    }
  }

  // 2. 更新外键
  console.log('\n📌 阶段2.2: 更新外键名称')
  for (const [fileName, fkFields] of Object.entries(MODELS_WITH_FK_CHANGES)) {
    const filePath = path.join(modelsDir, fileName)
    
    if (!fs.existsSync(filePath)) {
      console.log(`  ❌ ${fileName}: 文件不存在`)
      continue
    }

    if (updateForeignKeys(filePath, fkFields)) {
      fkUpdated++
    }
  }

  // 3. 汇总
  console.log('\n📊 更新汇总:')
  console.log(`  ✅ 主键更新: ${pkUpdated}/${Object.keys(PRIMARY_KEY_MAPPINGS).length} 个模型`)
  console.log(`  ✅ 外键更新: ${fkUpdated}/${Object.keys(MODELS_WITH_FK_CHANGES).length} 个模型`)
  
  if (notFound.length > 0) {
    console.log(`  ⚠️ 未找到文件: ${notFound.join(', ')}`)
  }

  console.log('\n💡 提示: 请手动检查以下关键模型:')
  console.log('  - LotteryCampaign.js: 检查 associate 方法中的 foreignKey')
  console.log('  - LotteryPrize.js: 检查 associate 方法中的 foreignKey')
  console.log('  - LotteryDraw.js: 检查 associate 方法中的 foreignKey')
}

main()

