/**
 * 时区处理统一工具包 (Timezone Toolkit)
 *
 * 功能：整合所有时区相关的检查、修复、验证功能
 *
 * 合并来源脚本：
 * - auto-fix-timezone.js (自动修复时区)
 * - verify-timezone-consistency.js (验证时区一致性)
 * - fix-timezone-inconsistency.js (修复时区不一致)
 * - fix-routes-middleware-timezone.js (修复routes和middleware)
 * - batch-fix-models-timezone.js (批量修复models)
 * - batch-fix-services-timezone.sh (批量修复services)
 *
 * 使用方式：
 * node scripts/toolkit/timezone-toolkit.js --check           # 检查时区一致性
 * node scripts/toolkit/timezone-toolkit.js --fix            # 自动修复所有时区问题
 * node scripts/toolkit/timezone-toolkit.js --fix --target=models  # 只修复models
 * node scripts/toolkit/timezone-toolkit.js --fix --target=routes  # 只修复routes
 * node scripts/toolkit/timezone-toolkit.js --fix --dry-run  # 预览修复但不执行
 *
 * 创建时间：2025年10月12日 北京时间
 */

'use strict'

const fs = require('fs')
const path = require('path')
const { sequelize, config } = require('../../config/database')
const BeijingTimeHelper = require('../../utils/timeHelper')

// 颜色输出
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
}

// ==================== 修复规则配置 ====================

const FIX_RULES = [
  {
    name: '模型defaultValue时间',
    pattern: /defaultValue:\s*DataTypes\.NOW/g,
    replacement: 'defaultValue: () => BeijingTimeHelper.createDatabaseTime()',
    files: ['models/**/*.js'],
    requiresImport: true
  },
  {
    name: '时间过期检查',
    pattern: /new Date\(\)\s*>\s*(\w+(?:\.\w+)?)/g,
    replacement: 'BeijingTimeHelper.isExpired($1)',
    files: ['models/**/*.js', 'services/**/*.js', 'routes/**/*.js'],
    requiresImport: true
  },
  {
    name: '剩余时间计算',
    pattern: /(\w+(?:\.\w+)?)\s*-\s*new Date\(\)/g,
    replacement: 'BeijingTimeHelper.timeDiff(new Date(), $1)',
    files: ['models/**/*.js', 'services/**/*.js'],
    requiresImport: true
  },
  {
    name: '未来时间设置',
    pattern: /new Date\(Date\.now\(\)\s*\+\s*([^)]+)\)/g,
    replacement: 'BeijingTimeHelper.futureTime($1)',
    files: ['models/**/*.js', 'services/**/*.js', 'routes/**/*.js'],
    requiresImport: true
  },
  {
    name: 'ID生成时间戳',
    pattern: /`([^`]*)\$\{Date\.now\(\)\}([^`]*)`/g,
    replacement: '`$1${BeijingTimeHelper.generateIdTimestamp()}$2`',
    files: ['models/**/*.js', 'services/**/*.js', 'routes/**/*.js'],
    requiresImport: true
  },
  {
    name: 'ID生成(36进制)',
    pattern: /Date\.now\(\)\.toString\(36\)/g,
    replacement: 'BeijingTimeHelper.generateIdTimestamp()',
    files: ['services/**/*.js'],
    requiresImport: true
  },
  {
    name: '一般时间戳',
    pattern: /Date\.now\(\)/g,
    replacement: 'BeijingTimeHelper.timestamp()',
    files: ['services/**/*.js', 'middleware/**/*.js'],
    requiresImport: true
  },
  {
    name: '赋值时间',
    pattern: /:\s*new Date\(\)([,\s}])/g,
    replacement: ': BeijingTimeHelper.createDatabaseTime()$1',
    files: ['services/**/*.js', 'routes/**/*.js'],
    requiresImport: true
  }
]

// ==================== 检查功能 ====================

/**
 * 验证数据库时区配置
 */
async function verifyDatabaseTimezone() {
  console.log(`\n${colors.blue}━━━ 1. 验证数据库时区配置 ━━━${colors.reset}`)

  try {
    // 验证配置文件设置
    console.log(`📋 配置文件时区: ${config.timezone}`)
    if (config.timezone !== '+08:00') {
      console.log(`${colors.red}❌ 数据库配置时区不是北京时间${colors.reset}`)
      return false
    }
    console.log(`${colors.green}✅ 数据库配置时区正确：+08:00${colors.reset}`)

    // 查询数据库实际时区
    const [result] = await sequelize.query(
      'SELECT @@global.time_zone AS global_tz, @@session.time_zone AS session_tz, NOW() AS db_now'
    )
    const dbTimezone = result[0]

    console.log('📊 数据库时区信息:')
    console.log(`   全局时区: ${dbTimezone.global_tz}`)
    console.log(`   会话时区: ${dbTimezone.session_tz}`)
    console.log(`   数据库当前时间: ${dbTimezone.db_now}`)

    return true
  } catch (error) {
    console.log(`${colors.red}❌ 数据库时区验证失败: ${error.message}${colors.reset}`)
    return false
  }
}

/**
 * 验证应用层时间创建
 */
function verifyApplicationTimeCreation() {
  console.log(`\n${colors.blue}━━━ 2. 验证应用层时间创建 ━━━${colors.reset}`)

  try {
    // 测试 BeijingTimeHelper 各种方法
    const testCases = [
      { method: 'now', result: BeijingTimeHelper.now() },
      { method: 'createDatabaseTime', result: BeijingTimeHelper.createDatabaseTime() },
      { method: 'createBeijingTime', result: BeijingTimeHelper.createBeijingTime() },
      { method: 'timestamp', result: BeijingTimeHelper.timestamp() },
      { method: 'nowLocale', result: BeijingTimeHelper.nowLocale() }
    ]

    console.log('📋 BeijingTimeHelper 方法测试:')
    let allPassed = true
    testCases.forEach(testCase => {
      console.log(`   ${testCase.method}(): ${testCase.result}`)
      if (testCase.result === null || testCase.result === undefined) {
        console.log(`   ${colors.red}❌ ${testCase.method} 返回空值${colors.reset}`)
        allPassed = false
      }
    })

    // 验证时区信息
    const nowISO = BeijingTimeHelper.now()
    if (nowISO.includes('+08:00')) {
      console.log(`${colors.green}✅ now() 方法正确返回北京时区标识 (+08:00)${colors.reset}`)
    } else {
      console.log(`${colors.yellow}⚠️ now() 方法未包含北京时区标识${colors.reset}`)
    }

    return allPassed
  } catch (error) {
    console.log(`${colors.red}❌ 应用层时间创建验证失败: ${error.message}${colors.reset}`)
    return false
  }
}

/**
 * 扫描代码中的时区问题
 */
function scanTimezoneIssues(targetDirs = null) {
  console.log(`\n${colors.blue}━━━ 3. 扫描代码时区问题 ━━━${colors.reset}`)

  const directories = targetDirs || ['models', 'services', 'routes', 'middleware']
  const issues = []

  directories.forEach(dir => {
    const dirPath = path.join(process.cwd(), dir)
    if (!fs.existsSync(dirPath)) {
      console.log(`${colors.yellow}⚠️ 目录不存在: ${dir}${colors.reset}`)
      return
    }

    console.log(`\n扫描目录: ${dir}/`)
    const dirIssues = scanDirectory(dirPath, dir)
    issues.push(...dirIssues)
  })

  if (issues.length > 0) {
    console.log(`\n${colors.yellow}⚠️ 发现 ${issues.length} 个时区问题${colors.reset}`)
    issues.slice(0, 10).forEach((issue, index) => {
      console.log(`${index + 1}. ${issue.file}:${issue.line} - ${issue.pattern}`)
    })
    if (issues.length > 10) {
      console.log(`... 还有 ${issues.length - 10} 个问题`)
    }
  } else {
    console.log(`${colors.green}✅ 未发现时区问题${colors.reset}`)
  }

  return issues
}

function scanDirectory(dir, relativePath) {
  const issues = []
  const files = fs.readdirSync(dir)

  files.forEach(file => {
    const fullPath = path.join(dir, file)
    const stat = fs.statSync(fullPath)

    if (stat.isDirectory()) {
      const subIssues = scanDirectory(fullPath, path.join(relativePath, file))
      issues.push(...subIssues)
    } else if (file.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8')
      const lines = content.split('\n')

      // 检查常见问题模式
      const problemPatterns = [
        { pattern: /new Date\(\)/g, name: 'new Date()' },
        { pattern: /Date\.now\(\)/g, name: 'Date.now()' },
        { pattern: /DataTypes\.NOW/g, name: 'DataTypes.NOW' }
      ]

      problemPatterns.forEach(({ pattern, name }) => {
        let match
        while ((match = pattern.exec(content)) !== null) {
          const lineNumber = content.substring(0, match.index).split('\n').length
          // 跳过已经使用 BeijingTimeHelper 的代码
          if (!lines[lineNumber - 1].includes('BeijingTimeHelper')) {
            issues.push({
              file: path.join(relativePath, file),
              line: lineNumber,
              pattern: name
            })
          }
        }
      })
    }
  })

  return issues
}

// ==================== 修复功能 ====================

/**
 * 检查文件是否需要导入BeijingTimeHelper
 */
function needsImport(content) {
  return (
    !content.includes('BeijingTimeHelper') && !content.includes("require('../utils/timeHelper')")
  )
}

/**
 * 添加导入语句
 */
function addImport(content, filePath) {
  const lines = content.split('\n')
  let insertIndex = 0
  let foundFirstRequire = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // 跳过注释和空行
    if (!line || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
      continue
    }

    // 跳过'use strict'
    if (line.includes('use strict')) {
      insertIndex = i + 1
      continue
    }

    // 找到第一个require语句
    if (line.includes('require(')) {
      foundFirstRequire = true
      continue
    }

    // 如果已经找到require语句，并且遇到非require语句，就在这里插入
    if (foundFirstRequire && !line.includes('require(')) {
      insertIndex = i
      break
    }
  }

  // 计算相对路径
  const fileDir = path.dirname(filePath)
  const rootDir = process.cwd()
  const relativePath = path.relative(fileDir, path.join(rootDir, 'utils/timeHelper'))
  const importPath = relativePath.startsWith('.') ? relativePath : './' + relativePath

  // 插入导入语句
  const importStatement = `const BeijingTimeHelper = require('${importPath}')`
  lines.splice(insertIndex, 0, importStatement, '')

  return lines.join('\n')
}

/**
 * 修复单个文件
 */
function fixFile(filePath, dryRun = false) {
  let content = fs.readFileSync(filePath, 'utf8')
  let modified = false
  const appliedRules = []

  // 应用所有修复规则
  FIX_RULES.forEach(rule => {
    const originalContent = content
    content = content.replace(rule.pattern, rule.replacement)

    if (content !== originalContent) {
      modified = true
      appliedRules.push(rule.name)
    }
  })

  // 如果有修改，检查是否需要添加导入
  if (modified) {
    if (needsImport(content)) {
      content = addImport(content, filePath)
      appliedRules.push('添加导入语句')
    }

    // 如果不是dry-run，写回文件
    if (!dryRun) {
      fs.writeFileSync(filePath, content, 'utf8')
    }
  }

  return { modified, appliedRules }
}

/**
 * 递归修复目录
 */
function fixDirectory(dir, dryRun = false) {
  const results = {
    totalFiles: 0,
    modifiedFiles: 0,
    files: []
  }

  if (!fs.existsSync(dir)) {
    return results
  }

  const files = fs.readdirSync(dir)

  files.forEach(file => {
    const fullPath = path.join(dir, file)
    const stat = fs.statSync(fullPath)

    if (stat.isDirectory()) {
      const subResults = fixDirectory(fullPath, dryRun)
      results.totalFiles += subResults.totalFiles
      results.modifiedFiles += subResults.modifiedFiles
      results.files = results.files.concat(subResults.files)
    } else if (file.endsWith('.js')) {
      results.totalFiles++
      const { modified, appliedRules } = fixFile(fullPath, dryRun)

      if (modified) {
        results.modifiedFiles++
        results.files.push({
          path: path.relative(process.cwd(), fullPath),
          rules: appliedRules
        })
      }
    }
  })

  return results
}

/**
 * 执行修复操作
 */
async function performFix(options = {}) {
  const { target = 'all', dryRun = false } = options

  console.log(`\n${colors.blue}🔧 开始修复时区处理问题...${colors.reset}`)
  if (dryRun) {
    console.log(`${colors.yellow}（预览模式：不会实际修改文件）${colors.reset}\n`)
  }

  // 确定要修复的目录
  let directories = []
  if (target === 'all') {
    directories = ['models', 'services', 'routes', 'middleware']
  } else {
    directories = [target]
  }

  const allResults = {
    totalFiles: 0,
    modifiedFiles: 0,
    files: []
  }

  directories.forEach(dir => {
    console.log(`${colors.yellow}修复目录: ${dir}/${colors.reset}`)
    const dirPath = path.join(process.cwd(), dir)

    if (!fs.existsSync(dirPath)) {
      console.log(`${colors.red}❌ 目录不存在: ${dir}${colors.reset}\n`)
      return
    }

    const results = fixDirectory(dirPath, dryRun)

    allResults.totalFiles += results.totalFiles
    allResults.modifiedFiles += results.modifiedFiles
    allResults.files = allResults.files.concat(results.files)

    console.log(`  扫描: ${results.totalFiles}个文件`)
    console.log(`  ${dryRun ? '将修改' : '已修改'}: ${results.modifiedFiles}个文件\n`)
  })

  // 生成修复报告
  console.log(`${'='.repeat(80)}`)
  console.log(`${colors.blue}修复${dryRun ? '预览' : '完成'}报告${colors.reset}`)
  console.log(`时间：${BeijingTimeHelper.now()}`)
  console.log(`${'='.repeat(80)}\n`)

  console.log(`${colors.green}✅ 总计扫描: ${allResults.totalFiles}个文件${colors.reset}`)
  console.log(
    `${colors.green}✅ ${dryRun ? '将' : '成功'}修复: ${allResults.modifiedFiles}个文件${colors.reset}\n`
  )

  if (allResults.modifiedFiles > 0) {
    console.log(`${colors.yellow}📋 修改详情:${colors.reset}\n`)

    allResults.files.forEach((file, index) => {
      console.log(`${index + 1}. ${colors.blue}${file.path}${colors.reset}`)
      file.rules.forEach(rule => {
        console.log(`   - ${rule}`)
      })
      console.log()
    })
  }

  // 保存修复报告
  if (!dryRun) {
    const reportPath = path.join(process.cwd(), 'reports/timezone-fix-report.json')
    const reportDir = path.dirname(reportPath)

    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true })
    }

    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          timestamp: BeijingTimeHelper.now(),
          options: { target, dryRun },
          summary: {
            totalFiles: allResults.totalFiles,
            modifiedFiles: allResults.modifiedFiles
          },
          modifiedFiles: allResults.files
        },
        null,
        2
      )
    )

    console.log(`${colors.green}✅ 修复报告已生成: ${reportPath}${colors.reset}\n`)
  }

  return allResults
}

// ==================== 主函数 ====================

async function main() {
  // 解析命令行参数
  const args = process.argv.slice(2)
  const options = {
    check: args.includes('--check'),
    fix: args.includes('--fix'),
    dryRun: args.includes('--dry-run'),
    target: 'all'
  }

  // 解析target参数
  const targetArg = args.find(arg => arg.startsWith('--target='))
  if (targetArg) {
    options.target = targetArg.split('=')[1]
  }

  // 显示帮助信息
  if (args.includes('--help') || args.length === 0) {
    console.log(`
${colors.blue}时区处理统一工具包 (Timezone Toolkit)${colors.reset}

使用方式：
  node scripts/toolkit/timezone-toolkit.js [选项]

选项：
  --check              检查时区一致性（不修改文件）
  --fix                自动修复所有时区问题
  --fix --target=DIR   只修复指定目录 (models/services/routes/middleware)
  --dry-run            预览修复但不实际修改文件
  --help               显示此帮助信息

示例：
  node scripts/toolkit/timezone-toolkit.js --check
  node scripts/toolkit/timezone-toolkit.js --fix
  node scripts/toolkit/timezone-toolkit.js --fix --target=models
  node scripts/toolkit/timezone-toolkit.js --fix --dry-run

合并来源：
  - auto-fix-timezone.js
  - verify-timezone-consistency.js
  - fix-timezone-inconsistency.js
  - fix-routes-middleware-timezone.js
  - batch-fix-models-timezone.js
  - batch-fix-services-timezone.sh
    `)
    process.exit(0)
  }

  console.log(`${colors.blue}${'='.repeat(80)}${colors.reset}`)
  console.log(`${colors.blue}时区处理统一工具包 - Timezone Toolkit${colors.reset}`)
  console.log(`${colors.blue}${'='.repeat(80)}${colors.reset}`)

  try {
    if (options.check) {
      // 执行检查
      console.log(`\n${colors.yellow}执行时区一致性检查...${colors.reset}`)

      const dbCheck = await verifyDatabaseTimezone()
      const appCheck = verifyApplicationTimeCreation()
      const codeIssues = scanTimezoneIssues(options.target !== 'all' ? [options.target] : null)

      console.log(`\n${colors.blue}${'='.repeat(80)}${colors.reset}`)
      console.log(`${colors.blue}检查结果汇总${colors.reset}`)
      console.log(`${colors.blue}${'='.repeat(80)}${colors.reset}\n`)

      console.log(
        `数据库时区配置: ${dbCheck ? colors.green + '✅ 正常' : colors.red + '❌ 异常'}${colors.reset}`
      )
      console.log(
        `应用层时间创建: ${appCheck ? colors.green + '✅ 正常' : colors.red + '❌ 异常'}${colors.reset}`
      )
      console.log(
        `代码时区问题: ${codeIssues.length === 0 ? colors.green + '✅ 无问题' : colors.yellow + `⚠️ ${codeIssues.length}个问题`}${colors.reset}`
      )

      if (!dbCheck || !appCheck || codeIssues.length > 0) {
        console.log(`\n${colors.yellow}💡 建议运行修复命令:${colors.reset}`)
        console.log('   node scripts/toolkit/timezone-toolkit.js --fix')
      }
    } else if (options.fix) {
      // 执行修复
      const results = await performFix(options)

      if (!options.dryRun && results.modifiedFiles > 0) {
        console.log(`${colors.blue}💡 下一步：${colors.reset}`)
        console.log(`1. 运行 ${colors.yellow}npm run lint${colors.reset} 检查代码质量`)
        console.log(`2. 运行 ${colors.yellow}npm test${colors.reset} 执行测试`)
        console.log('3. 检查修改的文件，确保逻辑正确\n')
      }
    }

    await sequelize.close()
    process.exit(0)
  } catch (error) {
    console.error(`${colors.red}❌ 错误:${colors.reset}`, error.message)
    console.error(error.stack)
    await sequelize.close()
    process.exit(1)
  }
}

// 执行主函数
if (require.main === module) {
  main()
}

module.exports = {
  verifyDatabaseTimezone,
  verifyApplicationTimeCreation,
  scanTimezoneIssues,
  performFix
}
