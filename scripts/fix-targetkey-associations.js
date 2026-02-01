/**
 * 修复模型关联中的 targetKey 引用
 */

const fs = require('fs');
const path = require('path');

const modelsDir = path.join(__dirname, '../models');

// 需要更新的 targetKey 映射
const targetKeyFixes = [
  { old: "targetKey: 'draw_id'", new: "targetKey: 'lottery_draw_id'" },
  { old: "targetKey: 'preset_id'", new: "targetKey: 'lottery_preset_id'" },
  { old: "targetKey: 'lottery_campaign_id'", new: "targetKey: 'lottery_campaign_id'" },
  { old: "targetKey: 'prize_id'", new: "targetKey: 'lottery_prize_id'" }
];

// 还需要更新一些字段定义中的 foreignKey（在 LotteryDrawDecision 中）
const fieldFixes = [
  { 
    file: 'LotteryDrawDecision.js', 
    old: "foreignKey: 'preset_id'", 
    new: "foreignKey: 'lottery_preset_id'" 
  }
];

let totalUpdates = 0;

function updateModelFile(filePath, fileName) {
  let content = fs.readFileSync(filePath, 'utf8');
  let updated = false;
  
  // 更新 targetKey
  targetKeyFixes.forEach(fix => {
    if (content.includes(fix.old)) {
      content = content.split(fix.old).join(fix.new);
      console.log(`  ✅ ${fileName}: ${fix.old} → ${fix.new}`);
      updated = true;
      totalUpdates++;
    }
  });
  
  // 更新特定文件的 foreignKey
  fieldFixes.forEach(fix => {
    if (fileName === fix.file && content.includes(fix.old)) {
      content = content.split(fix.old).join(fix.new);
      console.log(`  ✅ ${fileName}: ${fix.old} → ${fix.new}`);
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
  .filter(f => f.endsWith('.js') && f !== 'index.js');

console.log('🔧 修复模型关联中的 targetKey 和 foreignKey 引用...\n');

let updatedCount = 0;
modelFiles.forEach(fileName => {
  const filePath = path.join(modelsDir, fileName);
  if (updateModelFile(filePath, fileName)) {
    updatedCount++;
  }
});

console.log(`\n✅ 完成：更新了 ${updatedCount} 个模型文件中的 ${totalUpdates} 个引用`);
