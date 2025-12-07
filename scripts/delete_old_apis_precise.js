#!/usr/bin/env node
/**
 * 精确删除旧版客服接口脚本
 * 使用行号范围精确删除，避免语法错误
 */

const fs = require('fs')
const path = require('path')

// 配置
const FILE_PATH = path.join(__dirname, '../routes/v4/system.js')
const BACKUP_SUFFIX = `.backup.${new Date().toISOString().replace(/[:.]/g, '-')}`

// 需要删除的行号范围（包含起始和结束行）
const DELETE_RANGES = [
  { start: 1603, end: 1881, name: 'POST /chat/admin-reply' }, // 279行
  { start: 2343, end: 2506, name: 'GET /admin/chat/sessions' }, // 164行
  { start: 2508, end: 2671, name: 'PUT /sessions/:id/assign' }, // 164行
  { start: 2673, end: 2834, name: 'PUT /sessions/:id/close' }, // 162行
  { start: 2836, end: 3071, name: 'GET /admin/chat/stats' } // 236行
]

console.log('🔥 ==========================================')
console.log('🔥 开始精确删除旧版客服接口')
console.log('🔥 ==========================================\n')

try {
  // 1. 读取文件
  console.log('📖 步骤1: 读取文件...')
  const content = fs.readFileSync(FILE_PATH, 'utf8')
  const lines = content.split('\n')
  console.log(`✅ 读取成功，总行数: ${lines.length}\n`)

  // 2. 创建备份
  console.log('📦 步骤2: 创建备份...')
  const backupPath = FILE_PATH + BACKUP_SUFFIX
  fs.writeFileSync(backupPath, content, 'utf8')
  console.log(`✅ 备份已创建: ${backupPath}\n`)

  // 3. 删除指定行
  console.log('🗑️ 步骤3: 删除旧版接口...\n')

  // 创建一个数组来标记要删除的行
  const toDelete = new Array(lines.length).fill(false)

  DELETE_RANGES.forEach(range => {
    console.log(`   删除: ${range.name}`)
    console.log(`   位置: 第${range.start}-${range.end}行 (${range.end - range.start + 1}行)`)

    for (let i = range.start - 1; i < range.end; i++) {
      toDelete[i] = true
    }
  })

  // 过滤出需要保留的行
  const newLines = lines.filter((line, index) => !toDelete[index])

  const deletedCount = lines.length - newLines.length
  console.log(`\n✅ 删除完成，共删除 ${deletedCount} 行\n`)

  // 4. 写入新文件
  console.log('💾 步骤4: 写入新文件...')
  const newContent = newLines.join('\n')
  fs.writeFileSync(FILE_PATH, newContent, 'utf8')
  console.log('✅ 文件已更新\n')

  // 5. 验证删除结果
  console.log('🔍 步骤5: 验证删除结果...')

  const keywords = [
    '/api/v4/system/chat/admin-reply',
    '/api/v4/system/admin/chat/sessions',
    '/api/v4/system/admin/chat/sessions/:sessionId/assign',
    '/api/v4/system/admin/chat/sessions/:sessionId/close',
    '/api/v4/system/admin/chat/stats'
  ]

  let foundOldApi = false
  keywords.forEach(keyword => {
    if (newContent.includes(keyword)) {
      console.log(`❌ 警告: 仍然发现旧版API引用: ${keyword}`)
      foundOldApi = true
    }
  })

  if (!foundOldApi) {
    console.log('✅ 验证通过：所有旧版接口已彻底删除\n')
  } else {
    console.log('⚠️ 警告：仍有旧版API引用残留\n')
  }

  // 6. 统计报告
  console.log('📊 ==========================================')
  console.log('📊 删除统计报告')
  console.log('📊 ==========================================\n')
  console.log(`原始文件行数: ${lines.length}`)
  console.log(`删除后行数: ${newLines.length}`)
  console.log(`总删除行数: ${deletedCount}\n`)

  console.log('删除明细:')
  DELETE_RANGES.forEach(range => {
    console.log(`  - ${range.name}: ${range.end - range.start + 1}行`)
  })

  console.log('\n🎉 ==========================================')
  console.log('🎉 旧版客服接口删除成功！')
  console.log('🎉 ==========================================\n')

  console.log('⚠️ 下一步操作:')
  console.log('   1. 检查语法: node -c routes/v4/system.js')
  console.log('   2. 重启服务: npm run pm:start:pm2')
  console.log('   3. 验证删除: bash scripts/verify_old_apis_deleted.sh')
  console.log('   4. 如有问题，恢复备份:')
  console.log(`      cp ${backupPath} ${FILE_PATH}\n`)

  process.exit(0)
} catch (error) {
  console.error('\n❌ 错误:', error.message)
  console.error(error.stack)
  process.exit(1)
}
