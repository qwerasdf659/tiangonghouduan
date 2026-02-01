/**
 * 更新测试代码中的主键和外键引用
 */

const fs = require('fs');
const path = require('path');

const testsDir = path.join(__dirname, '../tests');

const primaryKeyMappings = {
  'lottery_campaign_id': 'lottery_campaign_id',
  'prize_id': 'lottery_prize_id',
  'draw_id': 'lottery_draw_id',
  'preset_id': 'lottery_preset_id'
};

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
  
  Object.entries(primaryKeyMappings).forEach(([oldKey, newKey]) => {
    // 模式1: 属性访问 .lottery_campaign_id
    const dotPattern = new RegExp(`\\.${oldKey}\\b`, 'g');
    const dotMatches = content.match(dotPattern);
    if (dotMatches) {
      content = content.replace(dotPattern, `.${newKey}`);
      fileUpdates += dotMatches.length;
    }
    
    // 模式2: 对象属性 { lottery_campaign_id: ... }
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
    console.log(`✅ ${path.relative(testsDir, filePath)}: ${fileUpdates} 处更新`);
    totalUpdates += fileUpdates;
    updatedFiles++;
    return true;
  }
  return false;
}

console.log('🔧 开始更新测试代码...\n');

const allFiles = getAllFiles(testsDir);
allFiles.forEach(updateFile);

console.log(`\n📊 完成：更新了 ${updatedFiles} 个文件中的 ${totalUpdates} 处引用`);
