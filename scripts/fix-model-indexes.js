/**
 * 修复模型文件中索引定义的字段名
 */

const fs = require('fs');
const path = require('path');

const modelsDir = path.join(__dirname, '../models');

// 需要在索引中更新的字段映射
const fieldMappings = {
  "'lottery_campaign_id'": "'lottery_campaign_id'",
  "'prize_id'": "'lottery_prize_id'",
  "'draw_id'": "'lottery_draw_id'",
  "'preset_id'": "'lottery_preset_id'"
};

// 需要处理的文件
const filesToProcess = [
  'LotteryAlert.js',
  'LotteryCampaignPricingConfig.js',
  'LotteryCampaignUserQuota.js',
  'LotteryCampaignQuotaGrant.js',
  'LotteryDailyMetrics.js',
  'LotteryHourlyMetrics.js',
  'LotteryTierRule.js',
  'LotteryUserExperienceState.js',
  'LotteryUserDailyDrawQuota.js'
];

let totalUpdates = 0;

filesToProcess.forEach(fileName => {
  const filePath = path.join(modelsDir, fileName);
  
  if (!fs.existsSync(filePath)) {
    console.log(`⏭️ ${fileName}: 文件不存在`);
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;
  
  // 更新索引中的字段名
  Object.entries(fieldMappings).forEach(([oldField, newField]) => {
    // 在 fields: [...] 中替换
    const indexPattern = new RegExp(`(fields:\\s*\\[[^\\]]*?)${oldField.replace(/'/g, "'")}`, 'g');
    content = content.replace(indexPattern, `$1${newField}`);
  });
  
  // 更新 where 条件中的字段名
  Object.entries(fieldMappings).forEach(([oldField, newField]) => {
    const cleanOld = oldField.replace(/'/g, '');
    const cleanNew = newField.replace(/'/g, '');
    
    // where: { lottery_campaign_id } → where: { lottery_campaign_id }
    const shortWherePattern = new RegExp(`(where:\\s*\\{\\s*)${cleanOld}(\\s*\\})`, 'g');
    content = content.replace(shortWherePattern, `$1${cleanNew}$2`);
  });
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    totalUpdates++;
    console.log(`✅ ${fileName}: 已更新索引字段名`);
  } else {
    console.log(`⏭️ ${fileName}: 无需更新`);
  }
});

console.log(`\n📊 总计更新 ${totalUpdates} 个文件`);
