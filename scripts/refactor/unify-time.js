#!/usr/bin/env node
/**
 * 统一时间处理系统重构脚本
 * 将所有 moment/moment-timezone 引用替换为 utils/timeHelper
 *
 * 执行方式：node scripts/refactor/unify-time.js
 */

const fs = require('fs')
const path = require('path')
const { glob } = require('glob')

// 需要排除的目录和文件
const EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/backups/**',
  '**/docs/**',
  '**/scripts/refactor/**'
]

// 需要处理的文件模式
const FILE_PATTERNS = [
  'services/**/*.js',
  'routes/**/*.js',
  'middleware/**/*.js',
  'tests/**/*.js',
  'jobs/**/*.js'
]

/**
 * 计算相对路径
 */
function calculateRelativePath(fromFile, targetFile) {
  const fromDir = path.dirname(fromFile)
  let relativePath = path.relative(fromDir, targetFile)

  if (!relativePath.startsWith('.')) {
    relativePath = './' + relativePath
  }

  relativePath = relativePath.replace(/\.js$/, '')

  return relativePath
}

/**
 * 替换文件中的 moment 引用
 */
function replaceMomentInFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8')

    // 检查是否包含 moment 引用
    const hasMoment = /require\(['"]moment['"]\)|require\(['"]moment-timezone['"]\)/g.test(content)

    if (!hasMoment) {
      return { changed: false, reason: 'no_moment_reference' }
    }

    // 计算新的相对路径
    const projectRoot = path.resolve(__dirname, '../..')
    const absoluteFilePath = path.resolve(projectRoot, filePath)
    const targetPath = path.resolve(projectRoot, 'utils/timeHelper.js')
    const newRequirePath = calculateRelativePath(absoluteFilePath, targetPath)

    let newContent = content

    // 替换 moment-timezone 引用
    newContent = newContent.replace(
      /const\s+moment\s*=\s*require\(['"]moment-timezone['"]\)/g,
      `const BeijingTimeHelper = require('${newRequirePath}')`
    )

    // 替换 moment 引用
    newContent = newContent.replace(
      /const\s+moment\s*=\s*require\(['"]moment['"]\)/g,
      `const BeijingTimeHelper = require('${newRequirePath}')`
    )

    // 添加注释提示需要手动调整代码
    if (newContent !== content) {
      const warningComment = `
// ⚠️ 重构提示：已将 moment 替换为 BeijingTimeHelper
// 需要手动调整以下内容：
// 1. moment() → BeijingTimeHelper.now()
// 2. moment().format('YYYY-MM-DD') → BeijingTimeHelper.formatDate(new Date())
// 3. moment().startOf('day') → BeijingTimeHelper.getTodayStart()
// 4. moment().endOf('day') → BeijingTimeHelper.getTodayEnd()
// 详见 utils/timeHelper.js 的 API 文档
`

      // 在文件开头添加注释（如果还没有）
      if (!newContent.includes('⚠️ 重构提示')) {
        const firstRequireIndex = newContent.indexOf('require(')
        if (firstRequireIndex > 0) {
          newContent =
            newContent.slice(0, firstRequireIndex) +
            warningComment +
            newContent.slice(firstRequireIndex)
        }
      }
    }

    // 写回文件
    fs.writeFileSync(filePath, newContent, 'utf8')

    return {
      changed: true,
      newPath: newRequirePath,
      reason: 'replaced_successfully',
      needsManualAdjustment: true
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
  console.log('🔄 开始统一时间处理系统重构...\n')

  const projectRoot = path.resolve(__dirname, '../..')
  const results = {
    total: 0,
    changed: 0,
    unchanged: 0,
    errors: 0,
    needsManualAdjustment: [],
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
      const result = replaceMomentInFile(file)

      if (result.changed) {
        results.changed++
        console.log(`✅ ${file}`)
        console.log(`   → ${result.newPath}`)

        if (result.needsManualAdjustment) {
          console.log(`   ⚠️  需要手动调整 moment API 调用`)
          results.needsManualAdjustment.push(file)
        }
        console.log('')
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

  if (results.needsManualAdjustment.length > 0) {
    console.log('\n⚠️  以下文件需要手动调整 moment API 调用:')
    results.needsManualAdjustment.forEach(file => {
      console.log(`   - ${file}`)
    })
    console.log('\n详见文件顶部的重构提示注释')
  }

  if (results.errors > 0) {
    console.log('\n⚠️  存在错误，请检查上述错误信息')
    process.exit(1)
  } else {
    console.log('\n✅ 时间处理系统统一完成！')
    console.log('⚠️  请手动检查和调整 moment API 调用')
    process.exit(0)
  }
}

// 执行主函数
main().catch(error => {
  console.error('❌ 脚本执行失败:', error)
  process.exit(1)
})
