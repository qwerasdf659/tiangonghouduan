#!/usr/bin/env node
/**
 * 主题 CSS 类迁移脚本
 * @description 将 Tailwind 硬编码颜色类迁移为 themed-* CSS 变量类
 * @version 1.0.0
 * @date 2026-01-26
 */

const fs = require('fs');
const path = require('path');

// 迁移规则映射表
const MIGRATION_RULES = {
  // ========== 背景色迁移 ==========
  'bg-white': 'themed-card',
  'bg-gray-50': 'themed-bg-base',
  'bg-gray-100': 'themed-bg-subtle',
  'bg-gray-200': 'themed-bg-muted',
  'bg-blue-600': 'themed-bg-primary',
  'bg-blue-500': 'themed-bg-primary',
  'bg-blue-50': 'themed-bg-primary-light',
  'bg-blue-100': 'themed-bg-primary-light',
  'bg-indigo-600': 'themed-bg-primary',
  'bg-indigo-500': 'themed-bg-primary',
  'bg-indigo-50': 'themed-bg-primary-light',
  
  // ========== 文字色迁移 ==========
  'text-gray-900': 'themed-text',
  'text-gray-800': 'themed-text',
  'text-gray-700': 'themed-text-secondary',
  'text-gray-600': 'themed-text-muted',
  'text-gray-500': 'themed-text-muted',
  'text-blue-600': 'themed-text-primary',
  'text-blue-500': 'themed-text-primary',
  'text-blue-700': 'themed-text-primary',
  'text-blue-800': 'themed-text-primary',
  'text-indigo-600': 'themed-text-primary',
  'text-indigo-500': 'themed-text-primary',
  'text-indigo-700': 'themed-text-primary',
  'text-green-700': 'themed-text-success',
  'text-green-800': 'themed-text-success',
  
  // ========== 边框色迁移 ==========
  'border-gray-200': 'themed-border',
  'border-gray-300': 'themed-border',
  'border-gray-100': 'themed-border-light',
  'border-blue-500': 'themed-border-primary',
  'border-blue-600': 'themed-border-primary',
  'border-indigo-500': 'themed-border-primary',
  'border-indigo-600': 'themed-border-primary',
  
  // ========== hover 状态迁移 ==========
  'hover:bg-gray-50': 'themed-hover-bg',
  'hover:bg-gray-100': 'themed-hover-bg',
  'hover:bg-blue-700': 'themed-hover-primary',
  'hover:bg-blue-600': 'themed-hover-primary',
  'hover:bg-indigo-700': 'themed-hover-primary',
  
  // ========== 分割线颜色迁移 ==========
  'divide-gray-200': 'divide-[var(--color-border)]',
  'divide-gray-300': 'divide-[var(--color-border)]',
};

// 不需要迁移的类（状态色保持固定）
const SKIP_PATTERNS = [
  // 错误提示色
  /text-red-500/,
  /text-red-600/,
  /text-red-700/,
  /bg-red-50/,
  /bg-red-100/,
  /border-red-500/,
  // 成功提示色
  /text-green-500/,
  /text-green-600/,
  /bg-green-50/,
  /bg-green-100/,
  /border-green-500/,
  // 警告提示色
  /text-yellow-500/,
  /text-yellow-600/,
  /text-yellow-700/,
  /bg-yellow-50/,
  /bg-yellow-100/,
  /border-yellow-500/,
  // 禁用状态色（上下文相关，需要人工判断）
  /text-gray-400/,
  /bg-gray-300/,
];

// 需要处理的文件扩展名
const TARGET_EXTENSIONS = ['.html', '.htm'];

// 排除的目录
const EXCLUDE_DIRS = ['node_modules', 'dist', '.git', 'scripts'];

// 统计数据
const stats = {
  filesScanned: 0,
  filesModified: 0,
  replacements: {},
  skippedPatterns: {},
};

/**
 * 检查是否应该跳过该类
 */
function shouldSkip(className) {
  return SKIP_PATTERNS.some(pattern => pattern.test(className));
}

/**
 * 执行类名替换
 */
function migrateClassNames(content) {
  let result = content;
  let modified = false;
  
  // 遍历迁移规则
  for (const [oldClass, newClass] of Object.entries(MIGRATION_RULES)) {
    // 创建匹配整个类名的正则表达式
    // 需要确保匹配的是完整的类名，而不是部分匹配
    const regex = new RegExp(`(?<=[\\s"'])${escapeRegex(oldClass)}(?=[\\s"'])`, 'g');
    
    const matches = result.match(regex);
    if (matches) {
      result = result.replace(regex, newClass);
      stats.replacements[oldClass] = (stats.replacements[oldClass] || 0) + matches.length;
      modified = true;
    }
  }
  
  return { content: result, modified };
}

/**
 * 转义正则特殊字符
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 递归处理目录
 */
function processDirectory(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.includes(entry.name)) {
        processDirectory(fullPath);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (TARGET_EXTENSIONS.includes(ext)) {
        processFile(fullPath);
      }
    }
  }
}

/**
 * 处理单个文件
 */
function processFile(filePath) {
  stats.filesScanned++;
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const { content: migratedContent, modified } = migrateClassNames(content);
    
    if (modified) {
      fs.writeFileSync(filePath, migratedContent, 'utf8');
      stats.filesModified++;
      console.log(`✅ 已迁移: ${path.relative(process.cwd(), filePath)}`);
    }
  } catch (error) {
    console.error(`❌ 处理失败: ${filePath}`, error.message);
  }
}

/**
 * 打印统计报告
 */
function printReport() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 迁移统计报告');
  console.log('='.repeat(60));
  console.log(`📁 扫描文件数: ${stats.filesScanned}`);
  console.log(`📝 修改文件数: ${stats.filesModified}`);
  console.log('\n🔄 替换统计:');
  
  const sortedReplacements = Object.entries(stats.replacements)
    .sort((a, b) => b[1] - a[1]);
  
  let totalReplacements = 0;
  for (const [className, count] of sortedReplacements) {
    const newClass = MIGRATION_RULES[className];
    console.log(`   ${className} → ${newClass}: ${count} 次`);
    totalReplacements += count;
  }
  
  console.log(`\n📈 总替换次数: ${totalReplacements}`);
  console.log('='.repeat(60));
}

// 主程序
function main() {
  const adminDir = path.resolve(__dirname, '..');
  
  console.log('🚀 开始主题 CSS 类迁移...');
  console.log(`📂 目标目录: ${adminDir}`);
  console.log('');
  
  // 处理目录
  processDirectory(adminDir);
  
  // 打印报告
  printReport();
  
  console.log('\n✅ 迁移完成！');
  console.log('💡 提示: 请手动检查以下保持不变的状态色类:');
  console.log('   - text-red-*, bg-red-* (错误提示)');
  console.log('   - text-green-*, bg-green-* (成功提示)');
  console.log('   - text-yellow-*, bg-yellow-* (警告提示)');
  console.log('   - text-gray-400, bg-gray-300 (禁用状态)');
}

main();

