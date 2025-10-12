/**
 * 清理项目中残留的 new Date() 和 Date.now() 使用
 *
 * 创建时间：2025年10月11日
 */

'use strict'

const fs = require('fs')
const path = require('path')

// 需要检查的目录
const CHECK_DIRS = ['models', 'services', 'routes', 'middleware']

// 排除的文件（允许使用原生方法）
const EXCLUDE_FILES = [
  'utils/timeHelper.js',
  'utils/BeijingTimeHelper.js'
]

/**
 * 扫描文件中的问题
 */
function scanFile (filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n')
  const issues = []

  lines.forEach((line, index) => {
    const lineNumber = index + 1

    // 跳过已经使用BeijingTimeHelper的行
    if (line.includes('BeijingTimeHelper')) return

    // 检测 new Date()
    if (/new Date\(\)/.test(line) && !line.includes('//')) {
      // 分析使用场景
      let suggestion = ''
      if (line.includes('.toISOString()')) {
        suggestion = '如果是WebSocket消息时间戳，可以保留；如果是业务数据，请使用 BeijingTimeHelper.createDatabaseTime().toISOString()'
      } else if (line.includes('defaultValue')) {
        suggestion = '使用 BeijingTimeHelper.createDatabaseTime()'
      } else if (line.includes('created_at') || line.includes('updated_at')) {
        suggestion = '使用 BeijingTimeHelper.createDatabaseTime()'
      } else {
        suggestion = '使用 BeijingTimeHelper.createDatabaseTime()'
      }

      issues.push({
        line: lineNumber,
        type: 'new Date()',
        code: line.trim(),
        suggestion
      })
    }

    // 检测 Date.now()
    if (/Date\.now\(\)/.test(line) && !line.includes('//')) {
      let suggestion = ''
      if (line.includes('.toString(36)')) {
        suggestion = '使用 BeijingTimeHelper.generateIdTimestamp()'
      } else if (line.includes('startTime') || line.includes('endTime')) {
        suggestion = '使用 BeijingTimeHelper.timestamp()'
      } else {
        suggestion = '使用 BeijingTimeHelper.timestamp()'
      }

      issues.push({
        line: lineNumber,
        type: 'Date.now()',
        code: line.trim(),
        suggestion
      })
    }
  })

  return issues
}

/**
 * 递归扫描目录
 */
function scanDirectory (dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      scanDirectory(fullPath, results)
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      const relativePath = path.relative(process.cwd(), fullPath)

      // 跳过排除的文件
      if (EXCLUDE_FILES.some(excluded => relativePath.includes(excluded))) {
        continue
      }

      const issues = scanFile(fullPath)
      if (issues.length > 0) {
        results.push({
          file: relativePath,
          issues
        })
      }
    }
  }

  return results
}

/**
 * 主函数
 */
function main () {
  console.log('🔍 扫描项目中残留的时间处理问题...\n')

  const allResults = []

  CHECK_DIRS.forEach(dir => {
    const dirPath = path.join(process.cwd(), dir)
    if (fs.existsSync(dirPath)) {
      const results = scanDirectory(dirPath)
      allResults.push(...results)
    }
  })

  // 生成报告
  console.log('='.repeat(80))
  console.log('📊 残留问题统计报告')
  console.log('='.repeat(80))
  console.log()

  if (allResults.length === 0) {
    console.log('✅ 太棒了！没有发现残留的时间处理问题')
    console.log('✅ 所有代码已统一使用 BeijingTimeHelper')
    return
  }

  let totalIssues = 0

  allResults.forEach(result => {
    console.log(`\n📁 ${result.file}`)
    console.log('-'.repeat(80))

    result.issues.forEach(issue => {
      totalIssues++
      console.log(`\n  第${issue.line}行: ${issue.type}`)
      console.log(`  代码: ${issue.code}`)
      console.log(`  建议: ${issue.suggestion}`)
    })
  })

  console.log('\n' + '='.repeat(80))
  console.log(`📊 总计: ${allResults.length}个文件，${totalIssues}处问题`)
  console.log('='.repeat(80))

  // 分类统计
  const byType = {}
  allResults.forEach(result => {
    result.issues.forEach(issue => {
      byType[issue.type] = (byType[issue.type] || 0) + 1
    })
  })

  console.log('\n📈 问题类型分布:')
  Object.entries(byType).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}处`)
  })

  console.log('\n💡 下一步建议:')
  console.log('1. 手动修复上述问题')
  console.log('2. 在 .eslintrc.js 中添加自定义规则防止新问题')
  console.log('3. 配置 pre-commit hook 自动检查')
  console.log()
}

// 执行
try {
  main()
} catch (error) {
  console.error('❌ 错误:', error.message)
  process.exit(1)
}
