/**
 * 移除所有errorHandler引用脚本
 * 创建时间：2025年12月18日
 */

'use strict'

const fs = require('fs').promises
const path = require('path')
const { exec } = require('child_process')
const util = require('util')
const execAsync = util.promisify(exec)

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

async function removeErrorHandlerReferences() {
  log('\n=== 移除errorHandler引用 ===', 'blue')

  // 查找所有引用errorHandler的文件
  const { stdout } = await execAsync('grep -r "require.*errorHandler" routes/ --include="*.js" -l')

  const files = stdout.trim().split('\n').filter(Boolean)

  log(`找到 ${files.length} 个文件引用了errorHandler`, 'yellow')

  for (const file of files) {
    log(`\n处理文件: ${file}`, 'blue')

    let content = await fs.readFile(file, 'utf8')
    const originalContent = content

    // 移除asyncHandler的require语句
    content = content.replace(
      /const\s+\{\s*asyncHandler\s*\}\s*=\s*require\(['"](\.\.\/)+middleware\/errorHandler['"]\)\s*/g,
      ''
    )

    // 移除asyncHandler的使用（保留内部函数）
    // 例如: router.post('/', asyncHandler(async (req, res) => {...}))
    // 变为: router.post('/', async (req, res) => {...})
    content = content.replace(/asyncHandler\(\s*async\s+\(/g, 'async (')

    // 移除多余的括号
    // 需要小心处理，找到匹配的右括号
    const lines = content.split('\n')
    const newLines = []

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i]

      // 如果这行移除了asyncHandler，可能需要移除多余的右括号
      if (originalContent.split('\n')[i].includes('asyncHandler')) {
        // 检查是否有多余的 )) 需要变成 )
        line = line.replace(/\)\s*\)\s*$/, ' )')
      }

      newLines.push(line)
    }

    content = newLines.join('\n')

    if (content !== originalContent) {
      await fs.writeFile(file, content, 'utf8')
      log(`✅ 已更新: ${file}`, 'green')
    } else {
      log(`⚠️ 无需更新: ${file}`, 'yellow')
    }
  }

  log(`\n✅ 所有errorHandler引用已移除`, 'green')
}

async function main() {
  try {
    await removeErrorHandlerReferences()

    log('\n⚠️ 注意事项：', 'yellow')
    log('1. 请手动检查修改的路由文件是否正确', 'yellow')
    log('2. asyncHandler已被移除，确保路由中的错误处理正确', 'yellow')
    log('3. 建议重启服务：npm run pm:restart', 'yellow')
  } catch (error) {
    log(`\n❌ 出错: ${error.message}`, 'red')
    console.error(error)
    process.exit(1)
  }
}

main()
