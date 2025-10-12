/**
 * 批量修复模型文件的时区处理
 * 专门处理DataTypes.NOW的替换
 *
 * 创建时间：2025年10月11日
 */

'use strict'

const fs = require('fs')
const path = require('path')

// 需要修复的模型文件列表
const MODEL_FILES = [
  'models/ImageResources.js',
  'models/LotteryDraw.js',
  'models/LotteryPreset.js',
  'models/LotteryPrize.js',
  'models/PointsTransaction.js',
  'models/SystemAnnouncement.js',
  'models/TradeRecord.js',
  'models/UserInventory.js',
  'models/UserRole.js',
  'models/UserSession.js'
]

function fixModelFile (filePath) {
  console.log(`修复: ${filePath}`)

  let content = fs.readFileSync(filePath, 'utf8')
  let modified = false

  // 确保已导入BeijingTimeHelper
  if (!content.includes('BeijingTimeHelper')) {
    // 查找合适的插入位置（在require语句之后）
    const lines = content.split('\n')
    let insertIndex = 0

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('require(') && lines[i].includes('DataTypes')) {
        insertIndex = i + 1
        break
      }
    }

    lines.splice(insertIndex, 0, 'const BeijingTimeHelper = require(\'../utils/timeHelper\')')
    content = lines.join('\n')
    modified = true
    console.log('  ✓ 添加BeijingTimeHelper导入')
  }

  // 替换DataTypes.NOW
  const originalContent = content
  content = content.replace(
    /defaultValue:\s*DataTypes\.NOW/g,
    'defaultValue: () => BeijingTimeHelper.createDatabaseTime()'
  )

  if (content !== originalContent) {
    modified = true
    const count = (originalContent.match(/defaultValue:\s*DataTypes\.NOW/g) || []).length
    console.log(`  ✓ 替换了${count}个DataTypes.NOW`)
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8')
    console.log(`  ✅ ${filePath} 修复完成\n`)
    return true
  } else {
    console.log('  ⏭️ 无需修改\n')
    return false
  }
}

// 主函数
function main () {
  console.log('🔧 开始批量修复模型文件的时区处理...\n')

  let fixedCount = 0

  MODEL_FILES.forEach(file => {
    const fullPath = path.join(process.cwd(), file)
    if (fs.existsSync(fullPath)) {
      if (fixModelFile(fullPath)) {
        fixedCount++
      }
    } else {
      console.log(`⚠️  文件不存在: ${file}\n`)
    }
  })

  console.log(`\n${'='.repeat(60)}`)
  console.log(`✅ 批量修复完成！共修复${fixedCount}个文件`)
  console.log(`${'='.repeat(60)}\n`)
}

// 执行
try {
  main()
} catch (error) {
  console.error('❌ 错误:', error.message)
  console.error(error.stack)
  process.exit(1)
}
