#!/usr/bin/env node
/**
 * 修复 Logger 使用方式
 * 从 new Logger('XXX') 改为直接使用 logger 单例
 */

const fs = require('fs')
const path = require('path')
const { glob } = require('glob')

const EXCLUDE_PATTERNS = ['**/node_modules/**', '**/backups/**', '**/scripts/refactor/**']

async function fixLoggerUsage() {
  console.log('🔄 开始修复 Logger 使用方式...\n')

  const projectRoot = path.resolve(__dirname, '../..')
  const files = await glob('**/*.js', {
    cwd: projectRoot,
    ignore: EXCLUDE_PATTERNS,
    absolute: false
  })

  let fixedCount = 0
  let errorCount = 0

  for (const file of files) {
    try {
      const filePath = path.join(projectRoot, file)
      let content = fs.readFileSync(filePath, 'utf8')

      // 检查是否包含 new Logger(
      if (!content.includes('new Logger(')) {
        continue
      }

      let modified = false

      // 替换 const logger = new Logger('XXX')
      const loggerPattern = /const\s+(logger|_logger|appLogger)\s*=\s*new\s+Logger\([^)]*\)/g
      if (loggerPattern.test(content)) {
        content = content.replace(loggerPattern, (match, varName) => {
          modified = true
          return `const ${varName} = require('../utils/logger').logger`
        })
      }

      // 如果已经有 require('../utils/logger')，需要调整
      if (modified) {
        // 检查是否已经有 logger 的 require
        const hasLoggerRequire = /require\(['"]\.[^'"]*utils\/logger['"]\)/.test(content)

        if (hasLoggerRequire) {
          // 如果已经有，确保使用 .logger
          content = content.replace(
            /const\s+Logger\s*=\s*require\(['"]\.[^'"]*utils\/logger['"]\)/g,
            ''
          )
        }

        fs.writeFileSync(filePath, content, 'utf8')
        console.log(`✅ ${file}`)
        fixedCount++
      }
    } catch (error) {
      console.error(`❌ ${file}: ${error.message}`)
      errorCount++
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log(`📊 修复统计:`)
  console.log(`✅ 已修复: ${fixedCount} 个文件`)
  console.log(`❌ 错误: ${errorCount} 个文件`)
  console.log('='.repeat(60))

  // 验证
  console.log('\n🔍 验证修复结果...')
  const remaining = await glob('**/*.js', {
    cwd: projectRoot,
    ignore: EXCLUDE_PATTERNS,
    absolute: false
  })

  let remainingCount = 0
  for (const file of remaining) {
    const content = fs.readFileSync(path.join(projectRoot, file), 'utf8')
    if (content.includes('new Logger(')) {
      remainingCount++
      if (remainingCount <= 5) {
        console.log(`   ⚠️  ${file}`)
      }
    }
  }

  if (remainingCount === 0) {
    console.log('✅ 所有 Logger 使用已修复')
  } else {
    console.log(`⚠️  仍有 ${remainingCount} 处需要手动检查`)
  }
}

fixLoggerUsage().catch(error => {
  console.error('❌ 脚本执行失败:', error)
  process.exit(1)
})
