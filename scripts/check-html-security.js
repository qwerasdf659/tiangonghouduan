#!/usr/bin/env node
/**
 * HTML安全检查工具
 * 检查public目录下的HTML文件是否符合CSP安全规范
 *
 * 检查项目：
 * 1. 内联事件处理器（onclick, onchange等）
 * 2. javascript:伪协议
 * 3. 内联样式（style属性，可选）
 *
 * 使用方法：
 * node scripts/check-html-security.js
 *
 * 创建时间：2025-11-23
 */

const fs = require('fs')
const path = require('path')
const { glob } = require('glob')

// ANSI颜色代码
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
}

/**
 * 检查内联事件处理器
 * @param {string} filePath - 文件路径
 * @param {string} content - 文件内容
 * @returns {Array} 问题列表
 */
function checkInlineEvents (filePath, content) {
  const issues = []

  // 匹配 on* 属性（onclick, onchange, onsubmit等）
  const inlineEventPattern = /\s(on\w+)=["'][^"']*["']/gi
  let match

  while ((match = inlineEventPattern.exec(content)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length
    const lineContent = content.split('\n')[lineNumber - 1].trim()

    issues.push({
      file: filePath,
      line: lineNumber,
      type: 'INLINE_EVENT',
      event: match[1],
      message: `发现内联事件处理器: ${match[1]}`,
      suggestion: '使用addEventListener替代',
      code: lineContent.substring(0, 80) + (lineContent.length > 80 ? '...' : '')
    })
  }

  return issues
}

/**
 * 检查javascript:伪协议
 * @param {string} filePath - 文件路径
 * @param {string} content - 文件内容
 * @returns {Array} 问题列表
 */
function checkJavaScriptProtocol (filePath, content) {
  const issues = []

  // 匹配 javascript: 伪协议
  const jsProtocolPattern = /href=["']javascript:[^"']*["']/gi
  let match

  while ((match = jsProtocolPattern.exec(content)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length
    const lineContent = content.split('\n')[lineNumber - 1].trim()

    issues.push({
      file: filePath,
      line: lineNumber,
      type: 'JS_PROTOCOL',
      message: '发现javascript:伪协议',
      suggestion: '使用事件监听器或data-*属性替代',
      code: lineContent.substring(0, 80) + (lineContent.length > 80 ? '...' : '')
    })
  }

  return issues
}

/**
 * 检查内联脚本（可选，严格模式）
 * @param {string} filePath - 文件路径
 * @param {string} content - 文件内容
 * @returns {Array} 问题列表
 */
function checkInlineScripts (filePath, content) {
  const issues = []

  // 匹配 <script>标签但不包含src属性（内联脚本）
  const inlineScriptPattern = /<script(?![^>]*src=)[^>]*>[\s\S]*?<\/script>/gi
  let match

  while ((match = inlineScriptPattern.exec(content)) !== null) {
    const lineNumber = content.substring(0, match.index).split('\n').length

    // 忽略空的script标签和只包含注释的script标签
    const scriptContent = match[0].replace(/<\/?script[^>]*>/gi, '').trim()
    if (scriptContent.length > 0 && !scriptContent.startsWith('//') && !scriptContent.startsWith('/*')) {
      issues.push({
        file: filePath,
        line: lineNumber,
        type: 'INLINE_SCRIPT',
        message: '发现内联脚本标签',
        suggestion: '建议将脚本移至外部.js文件',
        code: `<script>...</script> (${scriptContent.length}字符)`
      })
    }
  }

  return issues
}

/**
 * 打印检查结果
 * @param {Array} issues - 问题列表
 */
function printResults (issues) {
  if (issues.length === 0) {
    console.log(`${colors.green}✅ 所有HTML文件通过安全检查${colors.reset}`)
    return
  }

  console.log(`${colors.red}\n🚨 发现 ${issues.length} 个安全问题：${colors.reset}\n`)

  // 按文件分组
  const issuesByFile = {}
  issues.forEach(issue => {
    if (!issuesByFile[issue.file]) {
      issuesByFile[issue.file] = []
    }
    issuesByFile[issue.file].push(issue)
  })

  // 打印每个文件的问题
  Object.entries(issuesByFile).forEach(([file, fileIssues]) => {
    console.log(`${colors.yellow}${file}:${colors.reset}`)

    fileIssues.forEach(issue => {
      console.log(`  ${colors.red}✗${colors.reset} 行${issue.line}: ${issue.message}`)
      console.log(`    ${colors.blue}建议:${colors.reset} ${issue.suggestion}`)
      console.log(`    ${colors.reset}代码: ${issue.code}${colors.reset}`)
      console.log()
    })
  })

  // 统计信息
  const typeCount = {}
  issues.forEach(issue => {
    typeCount[issue.type] = (typeCount[issue.type] || 0) + 1
  })

  console.log(`${colors.yellow}问题统计:${colors.reset}`)
  Object.entries(typeCount).forEach(([type, count]) => {
    const typeName = {
      INLINE_EVENT: '内联事件处理器',
      JS_PROTOCOL: 'JavaScript伪协议',
      INLINE_SCRIPT: '内联脚本'
    }[type] || type
    console.log(`  - ${typeName}: ${count}个`)
  })
  console.log()
}

/**
 * 主函数
 */
async function main () {
  console.log(`${colors.blue}🔍 开始HTML安全检查...${colors.reset}\n`)

  try {
    // 查找所有HTML文件
    const htmlFiles = await glob('public/**/*.html', {
      cwd: process.cwd(),
      ignore: ['**/node_modules/**', '**/dist/**']
    })

    if (htmlFiles.length === 0) {
      console.log(`${colors.yellow}⚠️  未找到HTML文件${colors.reset}`)
      process.exit(0)
    }

    console.log(`找到 ${htmlFiles.length} 个HTML文件\n`)

    let allIssues = []

    // 检查每个文件
    htmlFiles.forEach(filePath => {
      const fullPath = path.join(process.cwd(), filePath)
      const content = fs.readFileSync(fullPath, 'utf8')

      const issues = [
        ...checkInlineEvents(filePath, content),
        ...checkJavaScriptProtocol(filePath, content)
        /*
         * 可选：严格模式下检查内联脚本
         * ...checkInlineScripts(filePath, content)
         */
      ]

      allIssues = allIssues.concat(issues)
    })

    // 打印结果
    printResults(allIssues)

    // 退出码
    if (allIssues.length > 0) {
      console.log(`${colors.red}❌ 安全检查失败，请修复后再提交${colors.reset}\n`)
      process.exit(1)
    } else {
      console.log(`${colors.green}✅ 检查通过${colors.reset}\n`)
      process.exit(0)
    }
  } catch (error) {
    console.error(`${colors.red}❌ 检查过程出错: ${error.message}${colors.reset}`)
    process.exit(1)
  }
}

// 执行主函数
main()
