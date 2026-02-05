#!/usr/bin/env node
/**
 * 前端中文映射检查脚本
 *
 * @file admin/scripts/check-frontend-mappings.js
 * @description 检查前端代码中是否存在中文映射表，违反"直接使用后端数据"原则
 * @version 1.0.0
 * @date 2026-02-05
 *
 * 规范说明：
 * - 前端不应维护中文映射表（如 status → '状态名'）
 * - 应直接使用后端返回的字段（如 status_name）
 * - 如需中文显示，应由后端在 API 返回数据时提供
 *
 * 使用方法：
 *   node scripts/check-frontend-mappings.js
 *   npm run lint:mappings
 */

import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, extname } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 检查配置
const CONFIG = {
  // 扫描的目录
  scanDirs: ['src'],
  // 扫描的文件扩展名
  extensions: ['.js'],
  // 忽略的目录
  ignoreDirs: ['node_modules', 'dist', '.git'],
  // 忽略的文件
  ignoreFiles: ['eslint.config.js', 'vite.config.js'],

  // 检测模式
  patterns: [
    {
      name: 'getXxxText/getXxxName/getXxxLabel 函数中的中文映射',
      regex: /get\w+(Text|Name|Label)\s*\([^)]*\)\s*\{[\s\S]*?const\s+\w*[Mm]ap\s*=\s*\{[\s\S]*?[\u4e00-\u9fa5]+[\s\S]*?\}/g,
      severity: 'error',
      suggestion: '应由后端返回中文名称字段（如 xxx_name），前端直接使用'
    },
    {
      name: '包含中文值的 Map/映射对象',
      regex: /const\s+(\w*[Mm]ap|\w*Names?|\w*Labels?|\w*Texts?)\s*=\s*\{[^}]*['"][\u4e00-\u9fa5]+[^}]*\}/g,
      severity: 'warning',
      suggestion: '考虑让后端返回中文字段，或使用字典接口获取映射'
    },
    {
      name: '硬编码的中文状态/类型映射',
      regex: /(status|type|state|phase|mode|level):\s*['"][\u4e00-\u9fa5]+['"]/gi,
      severity: 'info',
      suggestion: '检查是否可由后端提供中文字段'
    }
  ],

  // 白名单（允许的映射场景）
  whitelist: [
    // UI 文案（非后端数据映射）
    /placeholder|title|label|button|tooltip|hint|description|message|confirm|cancel|ok|loading/i,
    // 错误提示
    /error|warning|success|info/i,
    // 日期时间格式化（前端处理合理）
    /day_of_week|weekday|month|date/i
  ]
}

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
}

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`
}

// 递归获取所有 JS 文件
function getAllJsFiles(dir, files = []) {
  const items = readdirSync(dir)

  for (const item of items) {
    const fullPath = join(dir, item)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      if (!CONFIG.ignoreDirs.includes(item)) {
        getAllJsFiles(fullPath, files)
      }
    } else if (stat.isFile()) {
      if (
        CONFIG.extensions.includes(extname(item)) &&
        !CONFIG.ignoreFiles.includes(item)
      ) {
        files.push(fullPath)
      }
    }
  }

  return files
}

// 检查单个文件
function checkFile(filePath, rootDir) {
  const content = readFileSync(filePath, 'utf-8')
  const relativePath = relative(rootDir, filePath)
  const issues = []

  for (const pattern of CONFIG.patterns) {
    const matches = content.matchAll(pattern.regex)

    for (const match of matches) {
      // 检查白名单
      const isWhitelisted = CONFIG.whitelist.some(wl => wl.test(match[0]))
      if (isWhitelisted) continue

      // 计算行号
      const beforeMatch = content.substring(0, match.index)
      const lineNumber = (beforeMatch.match(/\n/g) || []).length + 1

      // 提取匹配的代码片段（最多100字符）
      const snippet = match[0].substring(0, 100).replace(/\n/g, ' ').trim()

      issues.push({
        file: relativePath,
        line: lineNumber,
        pattern: pattern.name,
        severity: pattern.severity,
        suggestion: pattern.suggestion,
        snippet: snippet.length < match[0].length ? snippet + '...' : snippet
      })
    }
  }

  return issues
}

// 主函数
function main() {
  const rootDir = join(__dirname, '..')
  console.log(colorize('\n📋 前端中文映射检查工具', 'cyan'))
  console.log(colorize('=' .repeat(60), 'gray'))
  console.log(colorize('规范：前端不应维护中文映射表，应直接使用后端返回的数据\n', 'gray'))

  let allIssues = []
  let filesChecked = 0

  for (const scanDir of CONFIG.scanDirs) {
    const fullScanDir = join(rootDir, scanDir)
    try {
      const files = getAllJsFiles(fullScanDir)
      filesChecked += files.length

      for (const file of files) {
        const issues = checkFile(file, rootDir)
        allIssues = allIssues.concat(issues)
      }
    } catch (error) {
      console.error(colorize(`扫描目录 ${scanDir} 失败: ${error.message}`, 'red'))
    }
  }

  // 按严重程度分组
  const errors = allIssues.filter(i => i.severity === 'error')
  const warnings = allIssues.filter(i => i.severity === 'warning')
  const infos = allIssues.filter(i => i.severity === 'info')

  // 输出结果
  console.log(colorize(`✓ 检查完成：扫描了 ${filesChecked} 个文件\n`, 'green'))

  if (allIssues.length === 0) {
    console.log(colorize('🎉 未发现中文映射问题！', 'green'))
    process.exit(0)
  }

  // 输出错误
  if (errors.length > 0) {
    console.log(colorize(`\n❌ 错误 (${errors.length})：`, 'red'))
    for (const issue of errors) {
      console.log(colorize(`  ${issue.file}:${issue.line}`, 'red'))
      console.log(colorize(`    问题: ${issue.pattern}`, 'gray'))
      console.log(colorize(`    代码: ${issue.snippet}`, 'gray'))
      console.log(colorize(`    建议: ${issue.suggestion}`, 'yellow'))
    }
  }

  // 输出警告
  if (warnings.length > 0) {
    console.log(colorize(`\n⚠️  警告 (${warnings.length})：`, 'yellow'))
    for (const issue of warnings) {
      console.log(colorize(`  ${issue.file}:${issue.line}`, 'yellow'))
      console.log(colorize(`    问题: ${issue.pattern}`, 'gray'))
      console.log(colorize(`    建议: ${issue.suggestion}`, 'gray'))
    }
  }

  // 输出信息
  if (infos.length > 0) {
    console.log(colorize(`\nℹ️  提示 (${infos.length})：`, 'cyan'))
    console.log(colorize('  (可能是合理的前端处理，请人工确认)', 'gray'))
    for (const issue of infos.slice(0, 10)) {
      console.log(colorize(`  ${issue.file}:${issue.line} - ${issue.pattern}`, 'gray'))
    }
    if (infos.length > 10) {
      console.log(colorize(`  ... 还有 ${infos.length - 10} 个提示`, 'gray'))
    }
  }

  // 统计摘要
  console.log(colorize('\n📊 检查摘要：', 'cyan'))
  console.log(`  错误: ${colorize(errors.length.toString(), errors.length > 0 ? 'red' : 'green')}`)
  console.log(`  警告: ${colorize(warnings.length.toString(), warnings.length > 0 ? 'yellow' : 'green')}`)
  console.log(`  提示: ${colorize(infos.length.toString(), 'gray')}`)

  // 如果有错误，返回非零退出码
  if (errors.length > 0) {
    console.log(colorize('\n❌ 检查失败：存在前端中文映射问题', 'red'))
    console.log(colorize('   请参考建议修改，让后端提供中文字段\n', 'gray'))
    process.exit(1)
  } else {
    console.log(colorize('\n✅ 检查通过（仅有警告/提示）\n', 'green'))
    process.exit(0)
  }
}

main()

