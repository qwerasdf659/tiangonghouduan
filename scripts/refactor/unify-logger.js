#!/usr/bin/env node
/**
 * 统一日志系统重构脚本
 * 将所有 services/UnifiedLotteryEngine/utils/Logger 引用替换为 utils/logger
 *
 * 执行方式：node scripts/refactor/unify-logger.js
 */

const fs = require('fs')
const path = require('path')
const { glob } = require('glob')

// 需要排除的目录和文件
const EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/backups/**',
  '**/docs/**',
  '**/scripts/refactor/**' // 排除本脚本自己
]

// 需要处理的文件模式
const FILE_PATTERNS = [
  'services/**/*.js',
  'routes/**/*.js',
  'middleware/**/*.js',
  'jobs/**/*.js',
  'app.js'
]

/**
 * 计算相对路径
 * @param {string} fromFile - 源文件路径
 * @param {string} targetFile - 目标文件路径（utils/logger.js）
 * @returns {string} 相对路径
 */
function calculateRelativePath(fromFile, targetFile) {
  const fromDir = path.dirname(fromFile)
  let relativePath = path.relative(fromDir, targetFile)

  // 确保使用 ./ 开头
  if (!relativePath.startsWith('.')) {
    relativePath = './' + relativePath
  }

  // 移除 .js 扩展名
  relativePath = relativePath.replace(/\.js$/, '')

  return relativePath
}

/**
 * 替换文件中的 Logger 引用
 * @param {string} filePath - 文件路径
 * @returns {Object} 替换结果
 */
function replaceLoggerInFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8')

    // 检查是否包含旧的 Logger 引用
    const oldPattern =
      /require\(['"]\.\.\/services\/UnifiedLotteryEngine\/utils\/Logger['"]\)|require\(['"].*\/services\/UnifiedLotteryEngine\/utils\/Logger['"]\)/g

    if (!oldPattern.test(content)) {
      return { changed: false, reason: 'no_old_logger_reference' }
    }

    // 计算新的相对路径
    const projectRoot = path.resolve(__dirname, '../..')
    const absoluteFilePath = path.resolve(projectRoot, filePath)
    const targetPath = path.resolve(projectRoot, 'utils/logger.js')
    const newRequirePath = calculateRelativePath(absoluteFilePath, targetPath)

    // 执行替换
    let newContent = content

    // 替换所有可能的旧引用模式
    newContent = newContent.replace(
      /require\(['"]\.\.\/services\/UnifiedLotteryEngine\/utils\/Logger['"]\)/g,
      `require('${newRequirePath}')`
    )

    newContent = newContent.replace(
      /require\(['"]\.\.\/\.\.\/services\/UnifiedLotteryEngine\/utils\/Logger['"]\)/g,
      `require('${newRequirePath}')`
    )

    newContent = newContent.replace(
      /require\(['"]\.\.\/\.\.\/\.\.\/services\/UnifiedLotteryEngine\/utils\/Logger['"]\)/g,
      `require('${newRequirePath}')`
    )

    newContent = newContent.replace(
      /require\(['"]\.\.\/\.\.\/\.\.\/\.\.\/services\/UnifiedLotteryEngine\/utils\/Logger['"]\)/g,
      `require('${newRequirePath}')`
    )

    // 写回文件
    fs.writeFileSync(filePath, newContent, 'utf8')

    return {
      changed: true,
      newPath: newRequirePath,
      reason: 'replaced_successfully'
    }
  } catch (error) {
    return {
      changed: false,
      error: error.message,
      reason: 'error_occurred'
    }
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🔄 开始统一日志系统重构...\n')

  const projectRoot = path.resolve(__dirname, '../..')
  const results = {
    total: 0,
    changed: 0,
    unchanged: 0,
    errors: 0,
    files: []
  }

  // 查找所有需要处理的文件
  for (const pattern of FILE_PATTERNS) {
    const files = await glob(pattern, {
      cwd: projectRoot,
      ignore: EXCLUDE_PATTERNS,
      absolute: false
    })

    for (const file of files) {
      results.total++
      const result = replaceLoggerInFile(file)

      if (result.changed) {
        results.changed++
        console.log(`✅ ${file}`)
        console.log(`   → ${result.newPath}\n`)
      } else if (result.error) {
        results.errors++
        console.log(`❌ ${file}`)
        console.log(`   错误: ${result.error}\n`)
      } else {
        results.unchanged++
      }

      results.files.push({
        file,
        ...result
      })
    }
  }

  // 输出统计结果
  console.log('\n' + '='.repeat(60))
  console.log('📊 重构统计结果:')
  console.log('='.repeat(60))
  console.log(`总文件数: ${results.total}`)
  console.log(`✅ 已替换: ${results.changed}`)
  console.log(`⏭️  无需替换: ${results.unchanged}`)
  console.log(`❌ 错误: ${results.errors}`)
  console.log('='.repeat(60))

  if (results.errors > 0) {
    console.log('\n⚠️  存在错误，请检查上述错误信息')
    process.exit(1)
  } else {
    console.log('\n✅ 日志系统统一完成！')
    process.exit(0)
  }
}

// 执行主函数
main().catch(error => {
  console.error('❌ 脚本执行失败:', error)
  process.exit(1)
})
