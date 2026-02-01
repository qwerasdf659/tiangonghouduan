/**
 * 修复路由层中的 where 条件字段名
 */

const fs = require('fs');
const path = require('path');

// 递归获取所有 JS 文件
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

// 字段映射
const fieldMappings = {
  'lottery_campaign_id': 'lottery_campaign_id',
  'prize_id': 'lottery_prize_id',
  'draw_id': 'lottery_draw_id',
  'preset_id': 'lottery_preset_id'
};

let totalUpdates = 0;

// 处理文件
function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;
  
  Object.entries(fieldMappings).forEach(([oldField, newField]) => {
    // 模式1: where: { lottery_campaign_id, ... } (ES6 简写)
    const es6Pattern = new RegExp(`(where:\\s*\\{[^}]*?)\\b${oldField}\\b(\\s*[,}])`, 'g');
    content = content.replace(es6Pattern, (match, before, after) => {
      if (before.includes(newField)) return match;
      return `${before}${newField}: ${oldField}${after}`;
    });
    
    // 模式2: { lottery_campaign_id: value } 在 where 后面
    const objPattern = new RegExp(`(where[^}]*?)\\b${oldField}\\b(\\s*:)`, 'g');
    content = content.replace(objPattern, (match, before, after) => {
      if (before.includes(newField)) return match;
      return `${before}${newField}${after}`;
    });
  });
  
  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    const fileName = path.relative(process.cwd(), filePath);
    console.log(`✅ ${fileName}`);
    totalUpdates++;
  }
}

// 处理 routes 目录
const routesDir = path.join(__dirname, '../routes');
const files = getAllFiles(routesDir);
console.log(`处理 ${files.length} 个路由文件...\n`);

files.forEach(filePath => {
  processFile(filePath);
});

console.log(`\n📊 总计更新 ${totalUpdates} 个文件`);
