/**
 * 修复模型文件中剩余的 lottery_campaign_id 字段定义
 */

const fs = require('fs');
const path = require('path');

const modelsDir = path.join(__dirname, '../models');

// 需要将 lottery_campaign_id 字段定义更新为 lottery_campaign_id 的模型
const modelsToFix = [
  'LotteryPreset.js',
  'PresetBudgetDebt.js',
  'PresetInventoryDebt.js',
  'LotteryCampaignQuotaGrant.js',
  'LotteryUserDailyDrawQuota.js'
];

// 不需要更新的模型（AccountAssetBalance 是 VARCHAR 类型的业务标识符）
const skipModels = ['AccountAssetBalance.js'];

let totalUpdates = 0;

modelsToFix.forEach(fileName => {
  const filePath = path.join(modelsDir, fileName);
  
  if (!fs.existsSync(filePath)) {
    console.log(`⏭️ 跳过 ${fileName}：文件不存在`);
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;
  let fileUpdates = 0;
  
  // 更新字段定义：lottery_campaign_id: { → lottery_campaign_id: {
  const fieldDefPattern = /^(\s*)lottery_campaign_id:\s*\{/gm;
  if (fieldDefPattern.test(content)) {
    content = content.replace(fieldDefPattern, '$1lottery_campaign_id: {');
    fileUpdates++;
    console.log(`  ✅ ${fileName}: 更新字段定义 lottery_campaign_id → lottery_campaign_id`);
  }
  
  // 更新 this.lottery_campaign_id 引用
  if (content.includes('this.lottery_campaign_id')) {
    content = content.replace(/this\.lottery_campaign_id/g, 'this.lottery_campaign_id');
    fileUpdates++;
    console.log(`  ✅ ${fileName}: 更新 this.lottery_campaign_id → this.lottery_campaign_id`);
  }
  
  // 更新索引定义中的 lottery_campaign_id
  const indexPattern = /fields:\s*\[([^\]]*)'lottery_campaign_id'([^\]]*)\]/g;
  if (indexPattern.test(content)) {
    content = content.replace(indexPattern, (match, before, after) => {
      return match.replace(/'lottery_campaign_id'/g, "'lottery_campaign_id'");
    });
    fileUpdates++;
    console.log(`  ✅ ${fileName}: 更新索引中的 lottery_campaign_id → lottery_campaign_id`);
  }
  
  // 更新 where 条件中的 lottery_campaign_id（作为变量名保持不变，但字段名需更新）
  // 例如：where: { lottery_campaign_id: campaignId } → where: { lottery_campaign_id: campaignId }
  const wherePattern = /where:\s*\{([^}]*)\blottery_campaign_id\b:\s*([^,}]+)/g;
  if (wherePattern.test(content)) {
    content = content.replace(wherePattern, (match, before, value) => {
      return match.replace(/\blottery_campaign_id\b:/, 'lottery_campaign_id:');
    });
    fileUpdates++;
    console.log(`  ✅ ${fileName}: 更新 where 条件中的 lottery_campaign_id → lottery_campaign_id`);
  }
  
  // 更新对象属性中的 lottery_campaign_id（创建对象时）
  // 例如：{ lottery_campaign_id: campaignId } → { lottery_campaign_id: campaignId }
  const objPattern = /\{\s*([^}]*)\blottery_campaign_id\b:\s*([^,}]+)/g;
  if (content !== originalContent || objPattern.test(originalContent)) {
    content = content.replace(/\{\s*([^}]*)\blottery_campaign_id\b:\s*([^,}]+)/g, (match, before, value) => {
      // 跳过注释
      if (before.includes('//') || before.includes('*')) return match;
      return match.replace(/\blottery_campaign_id\b:/, 'lottery_campaign_id:');
    });
  }
  
  // 更新 references 中的 key
  if (content.includes("key: 'lottery_campaign_id'")) {
    content = content.replace(/key:\s*'lottery_campaign_id'/g, "key: 'lottery_campaign_id'");
    fileUpdates++;
    console.log(`  ✅ ${fileName}: 更新 references.key → lottery_campaign_id`);
  }
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    totalUpdates++;
    console.log(`  💾 ${fileName}: 已保存更新`);
  } else {
    console.log(`  ⏭️ ${fileName}: 无需更新`);
  }
});

console.log(`\n📊 总计更新 ${totalUpdates} 个文件`);
