/**
 * 时区处理统一性自动修复脚本
 * 目的：自动修复代码中不统一的时间处理方式
 *
 * 修复策略：
 * 1. 模型中的 DataTypes.NOW -> () => BeijingTimeHelper.createDatabaseTime()
 * 2. 时间比较中的 new Date() -> BeijingTimeHelper.createDatabaseTime()
 * 3. ID生成中的 Date.now() -> BeijingTimeHelper.generateIdTimestamp()
 * 4. 时间戳中的 Date.now() -> BeijingTimeHelper.timestamp()
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

// 修复规则
const FIX_RULES = [
  // 规则1: 模型中的DataTypes.NOW
  {
    name: '模型defaultValue时间',
    pattern: /defaultValue:\s*DataTypes\.NOW/g,
    replacement: 'defaultValue: () => BeijingTimeHelper.createDatabaseTime()',
    files: ['models/**/*.js'],
    requiresImport: true
  },

  // 规则2: 时间过期检查
  {
    name: '时间过期检查',
    pattern: /new Date\(\)\s*>\s*(\w+(?:\.\w+)?)/g,
    replacement: 'BeijingTimeHelper.isExpired($1)',
    files: ['models/**/*.js', 'services/**/*.js', 'routes/**/*.js'],
    requiresImport: true
  },

  // 规则3: 剩余时间计算
  {
    name: '剩余时间计算',
    pattern: /(\w+(?:\.\w+)?)\s*-\s*new Date\(\)/g,
    replacement: 'BeijingTimeHelper.timeDiff(new Date(), $1)',
    files: ['models/**/*.js', 'services/**/*.js'],
    requiresImport: true
  },

  // 规则4: 未来时间设置（常见模式）
  {
    name: '未来时间设置',
    pattern: /new Date\(Date\.now\(\)\s*\+\s*([^)]+)\)/g,
    replacement: 'BeijingTimeHelper.futureTime($1)',
    files: ['models/**/*.js', 'services/**/*.js', 'routes/**/*.js'],
    requiresImport: true
  },

  // 规则5: ID生成时的时间戳
  {
    name: 'ID生成时间戳',
    pattern: /`([^`]*)\$\{Date\.now\(\)\}([^`]*)`/g,
    replacement: '`$1${BeijingTimeHelper.generateIdTimestamp()}$2`',
    files: ['models/**/*.js', 'services/**/*.js', 'routes/**/*.js'],
    requiresImport: true
  },

  // 规则6: toString(36)模式的ID生成
  {
    name: 'ID生成(36进制)',
    pattern: /Date\.now\(\)\.toString\(36\)/g,
    replacement: 'BeijingTimeHelper.generateIdTimestamp()',
    files: ['services/**/*.js'],
    requiresImport: true
  },

  // 规则7: 一般时间戳获取
  {
    name: '一般时间戳',
    pattern: /Date\.now\(\)/g,
    replacement: 'BeijingTimeHelper.timestamp()',
    files: ['services/**/*.js', 'middleware/**/*.js'],
    requiresImport: true
  },

  // 规则8: 赋值时的new Date()
  {
    name: '赋值时间',
    pattern: /:\s*new Date\(\)([,\s}])/g,
    replacement: ': BeijingTimeHelper.createDatabaseTime()$1',
    files: ['services/**/*.js', 'routes/**/*.js'],
    requiresImport: true
  }
]

/**
 * 检查文件是否需要导入BeijingTimeHelper
 */
function needsImport (content) {
  return !content.includes('BeijingTimeHelper') &&
         !content.includes('require(\'../utils/timeHelper\')')
}

/**
 * 添加导入语句
 */
function addImport (content, filePath) {
  const lines = content.split('\n')

  // 查找合适的导入位置
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
function fixFile (filePath) {
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

    // 写回文件
    fs.writeFileSync(filePath, content, 'utf8')
  }

  return { modified, appliedRules }
}

/**
 * 递归扫描并修复目录
 */
function fixDirectory (dir) {
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
      const subResults = fixDirectory(fullPath)
      results.totalFiles += subResults.totalFiles
      results.modifiedFiles += subResults.modifiedFiles
      results.files = results.files.concat(subResults.files)
    } else if (file.endsWith('.js')) {
      results.totalFiles++
      const { modified, appliedRules } = fixFile(fullPath)

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
 * 主函数
 */
async function main () {
  console.log(`${colors.blue}🔧 开始自动修复时间处理不一致问题...${colors.reset}\n`)

  // 需要修复的目录
  const directories = ['models', 'services', 'routes', 'middleware']

  const allResults = {
    totalFiles: 0,
    modifiedFiles: 0,
    files: []
  }

  directories.forEach(dir => {
    console.log(`${colors.yellow}修复目录: ${dir}/${colors.reset}`)
    const results = fixDirectory(dir)

    allResults.totalFiles += results.totalFiles
    allResults.modifiedFiles += results.modifiedFiles
    allResults.files = allResults.files.concat(results.files)

    console.log(`  扫描: ${results.totalFiles}个文件`)
    console.log(`  修改: ${results.modifiedFiles}个文件\n`)
  })

  // 生成修复报告
  console.log(`${'='.repeat(80)}`)
  console.log(`${colors.blue}修复完成报告${colors.reset}`)
  console.log(`时间：${BeijingTimeHelper.now()}`)
  console.log(`${'='.repeat(80)}\n`)

  console.log(`${colors.green}✅ 总计扫描: ${allResults.totalFiles}个文件${colors.reset}`)
  console.log(`${colors.green}✅ 成功修复: ${allResults.modifiedFiles}个文件${colors.reset}\n`)

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
  const reportPath = path.join(__dirname, '../reports/timezone-fix-report.json')
  const reportDir = path.dirname(reportPath)

  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true })
  }

  fs.writeFileSync(
    reportPath,
    JSON.stringify({
      timestamp: BeijingTimeHelper.now(),
      summary: {
        totalFiles: allResults.totalFiles,
        modifiedFiles: allResults.modifiedFiles
      },
      modifiedFiles: allResults.files
    }, null, 2)
  )

  console.log(`${colors.green}✅ 修复报告已生成: ${reportPath}${colors.reset}\n`)
  console.log(`${colors.blue}💡 下一步：${colors.reset}`)
  console.log(`1. 运行 ${colors.yellow}npm run lint${colors.reset} 检查代码质量`)
  console.log(`2. 运行 ${colors.yellow}npm test${colors.reset} 执行测试`)
  console.log('3. 检查修改的文件，确保逻辑正确\n')
}

// 执行
main().catch(error => {
  console.error(`${colors.red}❌ 错误:${colors.reset}`, error.message)
  console.error(error.stack)
  process.exit(1)
})
