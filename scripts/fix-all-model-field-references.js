/**
 * 修复所有模型文件中的字段引用
 * 包括 where 条件、attributes 等
 */

const fs = require('fs');
const path = require('path');

const modelsDir = path.join(__dirname, '../models');

// 字段映射
const fieldMappings = {
  'lottery_campaign_id': 'lottery_campaign_id',
  'prize_id': 'lottery_prize_id',
  'draw_id': 'lottery_draw_id',
  'preset_id': 'lottery_preset_id'
};

// 排除的模型（业务标识符类型，不是技术外键）
const excludeFiles = ['AccountAssetBalance.js'];

// 排除的上下文（参数名、变量名、函数名等）
const excludeContexts = [
  /function\s+\w*lottery_campaign_id/,
  /const\s+lottery_campaign_id\s*=/,
  /let\s+lottery_campaign_id\s*=/,
  /var\s+lottery_campaign_id\s*=/,
  /@param.*lottery_campaign_id/,
  /lottery_campaign_id\s*=>/,  // 箭头函数参数
];

let totalUpdates = 0;

function processFile(filePath, fileName) {
  if (excludeFiles.includes(fileName)) {
    console.log(`⏭️ 跳过 ${fileName}：在排除列表中`);
    return;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;
  
  // 更新 where 条件中的字段名
  // 例如：where: { lottery_campaign_id: xxx } → where: { lottery_campaign_id: xxx }
  Object.entries(fieldMappings).forEach(([oldField, newField]) => {
    // where 条件中的字段
    const wherePattern = new RegExp(`(where:\\s*\\{[^}]*?)\\b${oldField}\\b(\\s*:)`, 'g');
    content = content.replace(wherePattern, `$1${newField}$2`);
    
    // 直接对象属性（创建时）
    const objPattern = new RegExp(`(\\{\\s*[^}]*?)(?<!['\"])\\b${oldField}\\b(?!['\"]):\\s*([^,}]+)`, 'g');
    content = content.replace(objPattern, (match, before, value) => {
      // 检查是否在注释中
      if (before.includes('//') || before.includes('* ')) return match;
      // 检查是否是字段定义（后面跟着 type:）
      if (value.trim().startsWith('{')) return match;
      return match.replace(new RegExp(`\\b${oldField}\\b:`), `${newField}:`);
    });
    
    // attributes 数组中的字段
    const attrPattern = new RegExp(`(attributes:\\s*\\[[^\\]]*?)'${oldField}'`, 'g');
    content = content.replace(attrPattern, `$1'${newField}'`);
  });

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    totalUpdates++;
    console.log(`✅ ${fileName}: 已更新字段引用`);
  }
}

// 处理所有模型文件
const files = fs.readdirSync(modelsDir).filter(f => f.endsWith('.js'));
console.log(`处理 ${files.length} 个模型文件...\n`);

files.forEach(fileName => {
  const filePath = path.join(modelsDir, fileName);
  processFile(filePath, fileName);
});

console.log(`\n📊 总计更新 ${totalUpdates} 个文件`);
