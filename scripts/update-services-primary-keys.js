/**
 * 更新服务层代码中的主键和外键引用
 * 主要更新：
 * 1. 模型属性访问（如 campaign.lottery_campaign_id → campaign.lottery_campaign_id）
 * 2. 数据库查询条件（如 where: { lottery_campaign_id: xxx }）
 * 3. 对象属性（如 { lottery_campaign_id: xxx }）
 */

const fs = require('fs');
const path = require('path');

const servicesDir = path.join(__dirname, '../services');

// 主键映射（根据技术债务修复文档中的57张表）
const primaryKeyMappings = {
  // 抽奖相关
  lottery_campaign_id: 'lottery_campaign_id',
  prize_id: 'lottery_prize_id',
  draw_id: 'lottery_draw_id',
  preset_id: 'lottery_preset_id',
  tier_rule_id: 'lottery_tier_rule_id',
  decision_id: 'lottery_draw_decision_id',
  user_quota_id: 'lottery_campaign_user_quota_id',
  quota_grant_id: 'lottery_campaign_quota_grant_id',
  pricing_config_id: 'lottery_campaign_pricing_config_id',
  inventory_debt_id: 'preset_inventory_debt_id',
  budget_debt_id: 'preset_budget_debt_id',
  debt_limit_id: 'preset_debt_limit_id',
  setting_id: 'lottery_management_setting_id',
  draw_quota_rule_id: 'lottery_draw_quota_rule_id',
  daily_quota_id: 'lottery_user_daily_draw_quota_id',
  hourly_metrics_id: 'lottery_hourly_metrics_id',
  daily_metrics_id: 'lottery_daily_metrics_id',
  strategy_config_id: 'lottery_strategy_config_id',
  tier_matrix_id: 'lottery_tier_matrix_config_id',
  experience_state_id: 'lottery_user_experience_state_id',
  global_state_id: 'lottery_user_global_state_id',
  
  // 客服相关
  session_id: 'customer_service_session_id',
  
  // 产品相关
  product_id: 'product_id', // 保持不变
  
  // 物品相关
  item_template_id: 'item_template_id', // 保持不变
  item_id: 'item_id', // items 表主键（原 item_instance_id 已迁移）
  
  // 用户相关
  user_id: 'user_id', // 语义外键，保持不变
  
  // 账户相关
  account_id: 'account_id', // 保持不变
  balance_id: 'account_asset_balance_id',
  
  // 交易记录
  record_id: 'consumption_record_id',
  transaction_id: 'asset_transaction_id',
  
  // 其他
  feedback_id: 'feedback_id', // 保持不变
  announcement_id: 'system_announcement_id',
  exchange_item_id: 'exchange_item_id', // 保持不变
  exchange_record_id: 'exchange_record_id', // 保持不变
  listing_id: 'market_listing_id',
  order_id: 'trade_order_id', // trade_orders表
  redemption_order_id: 'redemption_order_id', // 保持不变
  alert_id: 'lottery_alert_id',
  batch_id: 'batch_operation_log_id',
  config_id: 'system_config_id',
  flag_id: 'feature_flag_id',
  dict_id: 'system_dictionary_id',
  history_id: 'system_dictionary_history_id',
  reminder_rule_id: 'reminder_rule_id', // 保持不变
  reminder_history_id: 'reminder_history_id', // 保持不变
  template_id: 'report_template_id',
  track_id: 'user_behavior_track_id',
  notification_id: 'admin_notification_id',
  request_id: 'api_idempotency_request_id'
};

// 只替换需要更改的映射（过滤掉保持不变的）
const changedMappings = Object.entries(primaryKeyMappings)
  .filter(([old, newKey]) => old !== newKey && !old.endsWith('_id') !== !newKey.endsWith('_id') || old !== newKey)
  .reduce((acc, [old, newKey]) => {
    if (old !== newKey) acc[old] = newKey;
    return acc;
  }, {});

console.log('📋 需要更新的字段映射:');
Object.entries(changedMappings).forEach(([old, newKey]) => {
  console.log(`  ${old} → ${newKey}`);
});

let totalUpdates = 0;
let updatedFiles = 0;

function getAllFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllFiles(filePath, fileList);
    } else if (file.endsWith('.js')) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

function updateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;
  let fileUpdates = 0;
  
  // 只更新特定的主键映射
  const specificMappings = {
    'lottery_campaign_id': 'lottery_campaign_id',
    'prize_id': 'lottery_prize_id',
    'draw_id': 'lottery_draw_id',
    'preset_id': 'lottery_preset_id'
  };
  
  Object.entries(specificMappings).forEach(([oldKey, newKey]) => {
    // 模式1: 属性访问 .lottery_campaign_id
    const dotPattern = new RegExp(`\\.${oldKey}\\b`, 'g');
    const dotMatches = content.match(dotPattern);
    if (dotMatches) {
      content = content.replace(dotPattern, `.${newKey}`);
      fileUpdates += dotMatches.length;
    }
    
    // 模式2: 对象属性 { lottery_campaign_id: ... } 或 lottery_campaign_id:
    const objKeyPattern = new RegExp(`([{,\\s])${oldKey}(\\s*:)`, 'g');
    const objMatches = content.match(objKeyPattern);
    if (objMatches) {
      content = content.replace(objKeyPattern, `$1${newKey}$2`);
      fileUpdates += objMatches.length;
    }
    
    // 模式3: 字符串中的字段名 'lottery_campaign_id' 或 "lottery_campaign_id"
    const strPattern = new RegExp(`(['"])${oldKey}\\1`, 'g');
    const strMatches = content.match(strPattern);
    if (strMatches) {
      content = content.replace(strPattern, `$1${newKey}$1`);
      fileUpdates += strMatches.length;
    }
  });
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✅ ${path.relative(servicesDir, filePath)}: ${fileUpdates} 处更新`);
    totalUpdates += fileUpdates;
    updatedFiles++;
    return true;
  }
  return false;
}

console.log('\n🔧 开始更新服务层代码...\n');

const allFiles = getAllFiles(servicesDir);
allFiles.forEach(updateFile);

console.log(`\n📊 完成：更新了 ${updatedFiles} 个文件中的 ${totalUpdates} 处引用`);
