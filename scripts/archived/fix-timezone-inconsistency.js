/**
 * 时区处理统一性检查和修复脚本
 * 目的：检查并报告代码中不统一的时间处理方式
 *
 * 问题模式：
 * 1. 模型中使用 DataTypes.NOW
 * 2. 直接使用 new Date()
 * 3. 使用 Date.now()
 * 4. 使用 sequelize.fn('NOW')
 *
 * 统一标准：
 * - 所有时间创建使用 BeijingTimeHelper
 * - 数据库配置已设置 timezone: '+08:00'
 * - 全链路使用北京时间
 *
 * 创建时间：2025年10月11日
 */

'use strict'

const fs = require('fs')
const path = require('path')
const BeijingTimeHelper = require('../utils/timeHelper')

// 颜色输出
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
}

// 需要检查的文件模式
const PROBLEMATIC_PATTERNS = [
  {
    pattern: /defaultValue:\s*DataTypes\.NOW/g,
    description: '模型中使用 DataTypes.NOW',
    suggestion: '使用 defaultValue: () => BeijingTimeHelper.createDatabaseTime()',
    severity: 'HIGH'
  },
  {
    pattern: /new Date\(\)(?!\.to)/g, // 排除 new Date().toXXX()
    description: '直接使用 new Date()',
    suggestion: '使用 BeijingTimeHelper.createDatabaseTime() 或其他相应方法',
    severity: 'MEDIUM'
  },
  {
    pattern: /Date\.now\(\)/g,
    description: '使用 Date.now()',
    suggestion: '使用 BeijingTimeHelper.timestamp() 或 generateIdTimestamp()',
    severity: 'MEDIUM'
  },
  {
    pattern: /sequelize\.fn\(['"]NOW['"]\)/g,
    description: '使用 sequelize.fn("NOW")',
    suggestion: '使用 BeijingTimeHelper.createDatabaseTime()',
    severity: 'HIGH'
  }
]

// 需要检查的目录
const DIRECTORIES_TO_CHECK = ['models', 'services', 'routes', 'middleware']

/**
 * 扫描文件中的时间处理问题
 */
function scanFile (filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const issues = []
  const lines = content.split('\n')

  PROBLEMATIC_PATTERNS.forEach(({ pattern, description, suggestion, severity }) => {
    const matches = content.match(pattern)
    if (matches) {
      // 找出具体行号
      lines.forEach((line, index) => {
        if (pattern.test(line)) {
          issues.push({
            file: path.relative(process.cwd(), filePath),
            line: index + 1,
            code: line.trim(),
            description,
            suggestion,
            severity
          })
        }
      })
    }
  })

  return issues
}

/**
 * 递归扫描目录
 */
function scanDirectory (dir) {
  let allIssues = []

  if (!fs.existsSync(dir)) {
    return allIssues
  }

  const files = fs.readdirSync(dir)

  files.forEach(file => {
    const fullPath = path.join(dir, file)
    const stat = fs.statSync(fullPath)

    if (stat.isDirectory()) {
      allIssues = allIssues.concat(scanDirectory(fullPath))
    } else if (file.endsWith('.js')) {
      const fileIssues = scanFile(fullPath)
      allIssues = allIssues.concat(fileIssues)
    }
  })

  return allIssues
}

/**
 * 生成诊断报告
 */
function generateReport (allIssues) {
  console.log(`\n${'='.repeat(80)}`)
  console.log(`${colors.blue}时区处理统一性诊断报告${colors.reset}`)
  console.log(`生成时间：${BeijingTimeHelper.now()}`)
  console.log(`${'='.repeat(80)}\n`)

  if (allIssues.length === 0) {
    console.log(`${colors.green}✅ 太好了！未发现时间处理不一致问题${colors.reset}\n`)
    return
  }

  // 按文件分组
  const issuesByFile = {}
  allIssues.forEach(issue => {
    if (!issuesByFile[issue.file]) {
      issuesByFile[issue.file] = []
    }
    issuesByFile[issue.file].push(issue)
  })

  // 统计
  const stats = {
    HIGH: allIssues.filter(i => i.severity === 'HIGH').length,
    MEDIUM: allIssues.filter(i => i.severity === 'MEDIUM').length,
    total: allIssues.length
  }

  console.log(`${colors.yellow}📊 问题统计${colors.reset}`)
  console.log(`  总问题数: ${stats.total}`)
  console.log(`  ${colors.red}高严重性: ${stats.HIGH}${colors.reset}`)
  console.log(`  ${colors.yellow}中严重性: ${stats.MEDIUM}${colors.reset}`)
  console.log()

  // 详细问题列表
  console.log(`${colors.yellow}📋 详细问题清单${colors.reset}\n`)

  Object.keys(issuesByFile).sort().forEach(file => {
    const issues = issuesByFile[file]
    console.log(`${colors.blue}文件: ${file}${colors.reset}`)
    console.log(`  问题数: ${issues.length}\n`)

    issues.forEach((issue, index) => {
      const severityColor = issue.severity === 'HIGH' ? colors.red : colors.yellow
      console.log(`  ${index + 1}. ${severityColor}[${issue.severity}]${colors.reset} 行 ${issue.line}`)
      console.log(`     问题: ${issue.description}`)
      console.log(`     代码: ${colors.yellow}${issue.code}${colors.reset}`)
      console.log(`     建议: ${colors.green}${issue.suggestion}${colors.reset}`)
      console.log()
    })
  })

  // 修复建议
  console.log(`${'='.repeat(80)}`)
  console.log(`${colors.blue}🔧 修复建议${colors.reset}\n`)
  console.log(`1. ${colors.green}模型文件（models/*.js）${colors.reset}`)
  console.log('   - 将 defaultValue: DataTypes.NOW')
  console.log('   - 改为 defaultValue: () => BeijingTimeHelper.createDatabaseTime()')
  console.log()
  console.log(`2. ${colors.green}服务文件（services/*.js）${colors.reset}`)
  console.log('   - 将 new Date() 改为 BeijingTimeHelper.createDatabaseTime()')
  console.log('   - 将 Date.now() 改为 BeijingTimeHelper.timestamp() 或 generateIdTimestamp()')
  console.log()
  console.log(`3. ${colors.green}时间比较和计算${colors.reset}`)
  console.log('   - 使用 BeijingTimeHelper.isExpired() 检查过期')
  console.log('   - 使用 BeijingTimeHelper.timeDiff() 计算时间差')
  console.log('   - 使用 BeijingTimeHelper.futureTime() 设置未来时间')
  console.log()
  console.log(`${'='.repeat(80)}\n`)
}

/**
 * 主函数
 */
async function main () {
  console.log(`${colors.blue}🔍 开始扫描时间处理不一致问题...${colors.reset}\n`)

  let allIssues = []

  DIRECTORIES_TO_CHECK.forEach(dir => {
    console.log(`扫描目录: ${dir}/`)
    const issues = scanDirectory(dir)
    allIssues = allIssues.concat(issues)
  })

  generateReport(allIssues)

  // 生成JSON报告
  const reportPath = path.join(__dirname, '../reports/timezone-check-report.json')
  const reportDir = path.dirname(reportPath)

  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true })
  }

  fs.writeFileSync(
    reportPath,
    JSON.stringify({
      timestamp: BeijingTimeHelper.now(),
      stats: {
        total: allIssues.length,
        high: allIssues.filter(i => i.severity === 'HIGH').length,
        medium: allIssues.filter(i => i.severity === 'MEDIUM').length
      },
      issues: allIssues
    }, null, 2)
  )

  console.log(`${colors.green}✅ JSON报告已生成: ${reportPath}${colors.reset}\n`)

  // 返回退出码
  process.exit(allIssues.length > 0 ? 1 : 0)
}

// 执行
main().catch(error => {
  console.error(`${colors.red}❌ 错误:${colors.reset}`, error.message)
  process.exit(1)
})
