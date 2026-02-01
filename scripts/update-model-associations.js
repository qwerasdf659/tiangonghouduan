/**
 * 更新模型关联中的 foreignKey 引用
 * 将旧的外键名称更新为新的标准化名称
 */

const fs = require('fs');
const path = require('path');

const modelsDir = path.join(__dirname, '../models');

// 需要在 associate 方法中更新的 foreignKey 映射
const foreignKeyMappings = [
  // LotteryCampaign 的关联（hasMany 部分）
  { oldFk: "foreignKey: 'lottery_campaign_id'", newFk: "foreignKey: 'lottery_campaign_id'" },
  
  // LotteryPrize 的关联
  { oldFk: "foreignKey: 'prize_id'", newFk: "foreignKey: 'lottery_prize_id'" },
  
  // LotteryDraw 的关联
  { oldFk: "foreignKey: 'draw_id'", newFk: "foreignKey: 'lottery_draw_id'" }
];

let totalUpdates = 0;

function updateModelFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let updated = false;
  
  foreignKeyMappings.forEach(mapping => {
    if (content.includes(mapping.oldFk)) {
      content = content.split(mapping.oldFk).join(mapping.newFk);
      console.log(`  ✅ ${path.basename(filePath)}: ${mapping.oldFk} → ${mapping.newFk}`);
      updated = true;
      totalUpdates++;
    }
  });
  
  if (updated) {
    fs.writeFileSync(filePath, content, 'utf8');
  }
  
  return updated;
}

// 获取所有模型文件
const modelFiles = fs.readdirSync(modelsDir)
  .filter(f => f.endsWith('.js') && f !== 'index.js')
  .map(f => path.join(modelsDir, f));

console.log('🔧 开始更新模型关联中的 foreignKey 引用...\n');

let updatedCount = 0;
modelFiles.forEach(filePath => {
  if (updateModelFile(filePath)) {
    updatedCount++;
  }
});

console.log(`\n✅ 完成：更新了 ${updatedCount} 个模型文件中的 ${totalUpdates} 个 foreignKey 引用`);
