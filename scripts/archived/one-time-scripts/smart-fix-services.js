/**
 * 智能修复services文件的时间处理
 * 基于上下文智能选择合适的替换方式
 *
 * 创建时间：2025年10月11日
 */

'use strict'

const fs = require('fs')
const path = require('path')

// 需要修复的服务文件
const SERVICE_FILES = [
  'services/NotificationService.js',
  'services/AuditManagementService.js',
  'services/ChatWebSocketService.js',
  'services/sealosStorage.js',
  'services/UnifiedLotteryEngine/UnifiedLotteryEngine.js',
  'services/UnifiedLotteryEngine/strategies/BasicGuaranteeStrategy.js',
  'services/UnifiedLotteryEngine/utils/CacheManager.js',
  'services/UnifiedLotteryEngine/utils/PerformanceMonitor.js'
]

/**
 * 智能修复文件
 */
function smartFixFile (filePath) {
  console.log(`\n修复: ${filePath}`)

  let content = fs.readFileSync(filePath, 'utf8')
  let modified = false
  const changes = []

  // 1. 确保已导入BeijingTimeHelper
  if (!content.includes('BeijingTimeHelper')) {
    const lines = content.split('\n')
    let insertIndex = 0

    // 找到最后一个require语句
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('require(') && !lines[i].includes('//')) {
        insertIndex = i + 1
      }
      // 如果找到module.exports或class定义，停止搜索
      if (lines[i].includes('module.exports') || lines[i].includes('class ')) {
        break
      }
    }

    // 计算相对路径
    const fileDir = path.dirname(filePath)
    const rootDir = process.cwd()
    const relativePath = path.relative(fileDir, path.join(rootDir, 'utils/timeHelper'))
    const importPath = relativePath.startsWith('.') ? relativePath : './' + relativePath

    lines.splice(insertIndex, 0, `const BeijingTimeHelper = require('${importPath}')`)
    content = lines.join('\n')
    modified = true
    changes.push('添加BeijingTimeHelper导入')
  }

  // 2. 替换ID生成中的Date.now()
  // 模式: `xxx_${Date.now()}_xxx`
  const idPattern = /`([^`]*)\$\{Date\.now\(\)\}([^`]*)`/g
  if (idPattern.test(content)) {
    content = content.replace(idPattern, '`$1${BeijingTimeHelper.generateIdTimestamp()}$2`')
    changes.push('替换ID生成中的Date.now()')
    modified = true
  }

  // 3. 替换Date.now().toString(36)
  const oldContent1 = content
  content = content.replace(/Date\.now\(\)\.toString\(36\)/g, 'BeijingTimeHelper.generateIdTimestamp()')
  if (content !== oldContent1) {
    changes.push('替换Date.now().toString(36)')
    modified = true
  }

  // 4. 替换赋值中的new Date()
  // 模式: : new Date()
  const oldContent2 = content
  content = content.replace(/:\s*new Date\(\)([,\s}])/g, ': BeijingTimeHelper.createDatabaseTime()$1')
  if (content !== oldContent2) {
    changes.push('替换赋值中的new Date()')
    modified = true
  }

  // 5. 替换时间戳获取（不在模板字符串中）
  // 这个需要更谨慎，只替换明确的时间戳场景
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 跳过已经修复的行
    if (line.includes('BeijingTimeHelper')) continue

    // 场景1: const xxx = Date.now()
    if (/const\s+\w+\s*=\s*Date\.now\(\)/.test(line) && !line.includes('`')) {
      lines[i] = line.replace(/Date\.now\(\)/g, 'BeijingTimeHelper.timestamp()')
      modified = true
      changes.push('替换时间戳获取')
    }

    // 场景2: 时间差计算中的Date.now()
    if (/Date\.now\(\)\s*[-+]/.test(line) || /[-+]\s*Date\.now\(\)/.test(line)) {
      lines[i] = line.replace(/Date\.now\(\)/g, 'BeijingTimeHelper.timestamp()')
      modified = true
      changes.push('替换时间差计算中的Date.now()')
    }

    // 场景3: startTime = Date.now()
    if (/\w+\s*=\s*Date\.now\(\)/.test(line) && !line.includes('`')) {
      lines[i] = line.replace(/Date\.now\(\)/g, 'BeijingTimeHelper.timestamp()')
      modified = true
      changes.push('替换startTime赋值')
    }
  }
  content = lines.join('\n')

  // 6. 标记需要手动检查的模式
  const manualChecks = []

  // 检查是否还有new Date() > xxx模式
  if (/new Date\(\)\s*[><]/.test(content)) {
    manualChecks.push('检测到时间比较，建议使用BeijingTimeHelper.isExpired()')
  }

  // 检查是否还有new Date(Date.now() + xxx)模式
  if (/new Date\(Date\.now\(\)/.test(content)) {
    manualChecks.push('检测到未来时间设置，建议使用BeijingTimeHelper.futureTime()')
  }

  // 保存修改
  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8')
    console.log('  修改内容:')
    changes.forEach(change => console.log(`    ✓ ${change}`))

    if (manualChecks.length > 0) {
      console.log('  ⚠️  需要手动检查:')
      manualChecks.forEach(check => console.log(`    ! ${check}`))
    }

    console.log('  ✅ 修复完成')
    return { modified: true, changes, manualChecks }
  } else {
    console.log('  ⏭️  无需修改')
    return { modified: false }
  }
}

/**
 * 主函数
 */
function main () {
  console.log('🔧 开始智能修复services文件的时间处理...')

  const results = {
    total: 0,
    modified: 0,
    changes: [],
    manualChecks: []
  }

  SERVICE_FILES.forEach(file => {
    const fullPath = path.join(process.cwd(), file)

    if (fs.existsSync(fullPath)) {
      results.total++
      const result = smartFixFile(fullPath)

      if (result.modified) {
        results.modified++
        results.changes.push(...result.changes)
        if (result.manualChecks) {
          results.manualChecks.push({
            file,
            checks: result.manualChecks
          })
        }
      }
    } else {
      console.log(`\n⚠️  文件不存在: ${file}`)
    }
  })

  console.log('\n' + '='.repeat(60))
  console.log('✅ 智能修复完成！')
  console.log(`   总文件数: ${results.total}`)
  console.log(`   修改文件数: ${results.modified}`)
  console.log('='.repeat(60))

  if (results.manualChecks.length > 0) {
    console.log('\n⚠️  需要手动检查的文件:')
    results.manualChecks.forEach(({ file, checks }) => {
      console.log(`\n${file}:`)
      checks.forEach(check => console.log(`  - ${check}`))
    })
  }

  console.log('\n💡 下一步:')
  console.log('1. 检查需要手动处理的文件')
  console.log('2. 运行 npm run lint 检查代码质量')
  console.log('3. 运行 npm test 执行测试\n')
}

// 执行
try {
  main()
} catch (error) {
  console.error('❌ 错误:', error.message)
  console.error(error.stack)
  process.exit(1)
}
