#!/usr/bin/env node
/**
 * 批量更新模型文件的主键定义
 */

const fs = require('fs')
const path = require('path')

// 需要更新的模型文件和主键映射
const MODEL_UPDATES = [
  {
    file: 'models/ExchangeRecords.js',
    changes: [
      { from: /id:\s*{[^}]*primaryKey:\s*true[^}]*}/, to: 'exchange_id' },
      { from: 'exchange_id:', to: 'exchange_code:', field: 'businessId' }
    ]
  },
  {
    file: 'models/TradeRecord.js',
    changes: [
      { from: /id:\s*{[^}]*primaryKey:\s*true[^}]*}/, to: 'trade_id' },
      { from: 'trade_id:', to: 'trade_code:', field: 'businessId' }
    ]
  },
  {
    file: 'models/UserInventory.js',
    changes: [{ from: /id:\s*{[^}]*primaryKey:\s*true[^}]*}/, to: 'inventory_id' }]
  },
  {
    file: 'models/CustomerSession.js',
    changes: [{ from: /id:\s*{[^}]*primaryKey:\s*true[^}]*}/, to: 'session_id' }]
  },
  {
    file: 'models/ChatMessage.js',
    changes: [{ from: /id:\s*{[^}]*primaryKey:\s*true[^}]*}/, to: 'message_id' }]
  },
  {
    file: 'models/UserSession.js',
    changes: [{ from: /id:\s*{[^}]*primaryKey:\s*true[^}]*}/, to: 'user_session_id' }]
  },
  {
    file: 'models/Role.js',
    changes: [{ from: /id:\s*{[^}]*primaryKey:\s*true[^}]*}/, to: 'role_id' }]
  },
  {
    file: 'models/UserRole.js',
    changes: [{ from: /id:\s*{[^}]*primaryKey:\s*true[^}]*}/, to: 'user_role_id' }]
  },
  {
    file: 'models/SystemAnnouncement.js',
    changes: [{ from: /id:\s*{[^}]*primaryKey:\s*true[^}]*}/, to: 'announcement_id' }]
  },
  {
    file: 'models/Feedback.js',
    changes: [{ from: /id:\s*{[^}]*primaryKey:\s*true[^}]*}/, to: 'feedback_id' }]
  },
  {
    file: 'models/ImageResources.js',
    changes: [{ from: /resource_id:\s*{[^}]*primaryKey:\s*true[^}]*}/, to: 'image_id' }]
  }
]

console.log('🔧 批量更新模型文件主键定义\n')
console.log(`共需更新 ${MODEL_UPDATES.length} 个模型文件\n`)

let successCount = 0
let skipCount = 0
let errorCount = 0

MODEL_UPDATES.forEach((update, index) => {
  const { file, changes } = update
  const filePath = path.join(__dirname, '..', '..', file)

  console.log(`[${index + 1}/${MODEL_UPDATES.length}] ${file}`)

  try {
    if (!fs.existsSync(filePath)) {
      console.log('   ⏭️  跳过（文件不存在）')
      skipCount++
      return
    }

    let content = fs.readFileSync(filePath, 'utf8')
    let modified = false

    changes.forEach(change => {
      if (change.field === 'businessId') {
        // 业务ID字段改名（特殊处理）
        if (content.includes(change.from)) {
          content = content.replace(new RegExp(change.from, 'g'), change.to)
          modified = true
          console.log(`   ✏️  ${change.from} → ${change.to}`)
        }
      } else {
        // 主键字段改名
        const newPKName = change.to
        const pkDefinition = `    ${newPKName}: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: '主键ID'
    },`

        if (content.match(change.from)) {
          content = content.replace(change.from, pkDefinition)
          modified = true
          console.log(`   ✏️  主键 → ${newPKName}`)
        }
      }
    })

    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8')
      console.log('   ✅ 已更新')
      successCount++
    } else {
      console.log('   ⏭️  无需修改')
      skipCount++
    }
  } catch (error) {
    console.error(`   ❌ 失败: ${error.message}`)
    errorCount++
  }
})

console.log('\n' + '='.repeat(60))
console.log('📊 更新结果统计')
console.log('='.repeat(60))
console.log(`成功: ${successCount}`)
console.log(`跳过: ${skipCount}`)
console.log(`失败: ${errorCount}`)
console.log(`总计: ${MODEL_UPDATES.length}`)

if (errorCount === 0) {
  console.log('\n✅ 所有模型文件更新完成')
  console.log('\n📌 下一步：')
  console.log('   1. 修改业务代码中的主键引用')
  console.log('   2. 运行ESLint和Prettier检查')
  console.log('   3. 运行测试验证')
} else {
  console.warn('\n⚠️  部分文件更新失败')
}
