#!/usr/bin/env node

/**
 * 数据库迁移验证工具
 *
 * 用途：服务启动前验证所有迁移文件的规范性
 * 执行：自动在 npm start 前执行，或手动执行 npm run migration:verify
 *
 * 验证内容：
 * 1. 文件名格式是否符合规范
 * 2. Action类型是否合法
 * 3. VERSION.js一致性
 * 4. 时间戳合理性
 *
 * 创建时间：2025年10月12日
 */

const fs = require('fs')
const path = require('path')

// ==================== 配置 ====================

const MIGRATIONS_DIR = path.join(__dirname, '../../migrations')
const VERSION_FILE = path.join(MIGRATIONS_DIR, 'VERSION.js')

// 验证规则
const VALIDATION_RULES = {
  /*
   * 文件名格式：{YYYYMMDD}{HHMMSS}-{action}-{target}.js
   * 注意：baseline类型允许包含版本号（如: baseline-v1.0.0-clean-start）
   */
  fileName: {
    pattern: /^\d{14}-[a-z]+-[a-z][a-z0-9.-]*\.js$/,
    message: '文件名必须符合格式: {YYYYMMDD}{HHMMSS}-{action}-{target}.js'
  },

  // 允许的Action类型
  allowedActions: [
    'create-table', 'alter-table', 'drop-table', 'rename-table',
    'add-column', 'alter-column', 'drop-column', 'rename-column',
    'create-index', 'alter-index', 'drop-index',
    'add-constraint', 'drop-constraint',
    'migrate-data', 'seed-data',
    'baseline' // 仅用于V1.0.0基准迁移
  ],

  // 禁止的Action类型（容易导致混乱）
  forbiddenActions: [
    'fix', // 说明设计有问题
    'temp', // 不应该提交临时迁移
    'test', // 不应该提交测试迁移
    'update', // 太模糊
    'change', // 太模糊
    'modify' // 太模糊
  ],

  // 时间戳合理范围
  timestampRange: {
    minYear: 2025,
    maxYear: 2030
  }
}

// ==================== 验证函数 ====================

function validateFileName (fileName) {
  const errors = []

  // 1. 验证基本格式
  if (!VALIDATION_RULES.fileName.pattern.test(fileName)) {
    errors.push(VALIDATION_RULES.fileName.message)
    return errors // 格式错误直接返回，不再检查其他项
  }

  return errors
}

function validateAction (fileName) {
  const errors = []

  // 提取action部分
  const parts = fileName.replace('.js', '').split('-')
  const _timestamp = parts[0]

  // 找到action部分（可能是multi-word，如create-table）
  let _actionEndIndex = 1
  let action = parts[1]

  // 尝试组合multi-word action
  for (let i = 2; i < parts.length - 1; i++) {
    const candidate = parts.slice(1, i + 1).join('-')
    if (VALIDATION_RULES.allowedActions.includes(candidate)) {
      action = candidate
      _actionEndIndex = i
      break
    }
  }

  // 验证是否是禁止的action
  if (VALIDATION_RULES.forbiddenActions.includes(action)) {
    errors.push(`禁止使用的action: ${action}`)
    errors.push(`  原因: ${getActionForbiddenReason(action)}`)
    errors.push(`  建议: ${getActionSuggestion(action)}`)
  }

  // 验证是否是允许的action
  if (!VALIDATION_RULES.allowedActions.includes(action)) {
    errors.push(`未知的action: ${action}`)
    errors.push(`  允许的action: ${VALIDATION_RULES.allowedActions.join(', ')}`)
  }

  return errors
}

function validateTimestamp (fileName) {
  const errors = []

  // 提取时间戳
  const timestamp = fileName.substring(0, 14)

  if (!/^\d{14}$/.test(timestamp)) {
    return errors // 已经在fileName验证中处理
  }

  const year = parseInt(timestamp.substring(0, 4))
  const month = parseInt(timestamp.substring(4, 6))
  const day = parseInt(timestamp.substring(6, 8))
  const hour = parseInt(timestamp.substring(8, 10))
  const minute = parseInt(timestamp.substring(10, 12))
  const second = parseInt(timestamp.substring(12, 14))

  // 验证年份范围
  if (year < VALIDATION_RULES.timestampRange.minYear ||
      year > VALIDATION_RULES.timestampRange.maxYear) {
    errors.push(`时间戳年份异常: ${year} (合理范围: ${VALIDATION_RULES.timestampRange.minYear}-${VALIDATION_RULES.timestampRange.maxYear})`)
  }

  // 验证月份
  if (month < 1 || month > 12) {
    errors.push(`时间戳月份异常: ${month} (合理范围: 1-12)`)
  }

  // 验证日期
  if (day < 1 || day > 31) {
    errors.push(`时间戳日期异常: ${day} (合理范围: 1-31)`)
  }

  // 验证小时
  if (hour < 0 || hour > 23) {
    errors.push(`时间戳小时异常: ${hour} (合理范围: 0-23)`)
  }

  // 验证分钟
  if (minute < 0 || minute > 59) {
    errors.push(`时间戳分钟异常: ${minute} (合理范围: 0-59)`)
  }

  // 验证秒
  if (second < 0 || second > 59) {
    errors.push(`时间戳秒数异常: ${second} (合理范围: 0-59)`)
  }

  return errors
}

function validateFile (fileName) {
  const fileErrors = []

  // 1. 验证文件名格式
  const nameErrors = validateFileName(fileName)
  if (nameErrors.length > 0) {
    return nameErrors // 格式错误就不继续验证了
  }

  // 2. 验证action类型
  const actionErrors = validateAction(fileName)
  fileErrors.push(...actionErrors)

  // 3. 验证时间戳
  const timestampErrors = validateTimestamp(fileName)
  fileErrors.push(...timestampErrors)

  return fileErrors
}

function validateVersionFile (migrationFiles) {
  const errors = []
  const warnings = []

  if (!fs.existsSync(VERSION_FILE)) {
    warnings.push('VERSION.js 文件不存在（建议创建）')
    return { errors, warnings }
  }

  try {
    // 动态加载VERSION.js（避免缓存）
    delete require.cache[require.resolve(VERSION_FILE)]
    const VERSION = require(VERSION_FILE)

    // 验证lastMigration是否存在
    if (VERSION.lastMigration) {
      if (!migrationFiles.includes(VERSION.lastMigration)) {
        errors.push(`VERSION.js中的lastMigration文件不存在: ${VERSION.lastMigration}`)
      } else {
        // 检查lastMigration是否真的是最后一个
        const sortedFiles = migrationFiles.sort()
        const actualLast = sortedFiles[sortedFiles.length - 1]
        if (VERSION.lastMigration !== actualLast) {
          warnings.push('VERSION.js中的lastMigration可能未更新:')
          warnings.push(`  记录: ${VERSION.lastMigration}`)
          warnings.push(`  实际: ${actualLast}`)
        }
      }
    }

    // 验证文件数量（可选）
    if (VERSION.history) {
      const expectedCount = Object.keys(VERSION.history).reduce((sum, ver) => {
        return sum + (VERSION.history[ver].migrations || 0)
      }, 0)

      if (migrationFiles.length !== expectedCount) {
        warnings.push('迁移文件数量与VERSION.js记录不一致:')
        warnings.push(`  实际文件: ${migrationFiles.length}个`)
        warnings.push(`  记录数量: ${expectedCount}个`)
      }
    }

    // 执行VERSION.js自身的validate方法（如果有）
    if (typeof VERSION.validate === 'function') {
      try {
        VERSION.validate()
      } catch (error) {
        errors.push(`VERSION.js自验证失败: ${error.message}`)
      }
    }
  } catch (error) {
    errors.push(`VERSION.js加载失败: ${error.message}`)
  }

  return { errors, warnings }
}

function getActionForbiddenReason (action) {
  const reasons = {
    fix: '说明之前的设计有问题，应该在设计阶段就避免',
    temp: '临时迁移不应该提交到版本控制',
    test: '测试迁移不应该提交到版本控制',
    update: '太模糊，请使用 alter-table/add-column/drop-column 等明确的action',
    change: '太模糊，请使用 alter-table/add-column/drop-column 等明确的action',
    modify: '太模糊，请使用 alter-table/add-column/drop-column 等明确的action'
  }
  return reasons[action] || '不符合规范'
}

function getActionSuggestion (action) {
  const suggestions = {
    fix: '重新设计迁移，使用正确的action类型',
    temp: '请删除此文件，不要提交临时迁移',
    test: '请删除此文件，不要提交测试迁移',
    update: '使用 alter-table, add-column 或 drop-column',
    change: '使用 alter-table, add-column 或 drop-column',
    modify: '使用 alter-table, add-column 或 drop-column'
  }
  return suggestions[action] || '使用 npm run migration:create 重新创建'
}

// ==================== 主验证函数 ====================

function validateMigrations () {
  console.log('\n' + '='.repeat(60))
  console.log('🔍 数据库迁移文件验证工具')
  console.log('='.repeat(60))
  console.log('')

  const allErrors = []
  const allWarnings = []

  try {
    // 1. 检查migrations目录
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      allErrors.push('migrations 目录不存在')
      printResults({ valid: false, errors: allErrors, warnings: [] })
      return { valid: false, errors: allErrors, warnings: [] }
    }

    // 2. 获取所有迁移文件
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.js') && f !== 'VERSION.js')
      .sort()

    if (files.length === 0) {
      allWarnings.push('没有找到任何迁移文件')
      printResults({ valid: true, errors: [], warnings: allWarnings })
      return { valid: true, errors: [], warnings: allWarnings }
    }

    console.log(`📁 找到 ${files.length} 个迁移文件\n`)

    // 3. 验证每个文件
    files.forEach((fileName, index) => {
      const fileErrors = validateFile(fileName)

      if (fileErrors.length > 0) {
        allErrors.push(`\n[文件 ${index + 1}/${files.length}] ${fileName}:`)
        fileErrors.forEach(err => {
          allErrors.push(`  ❌ ${err}`)
        })
      } else {
        console.log(`✅ [${index + 1}/${files.length}] ${fileName}`)
      }
    })

    console.log('')

    // 4. 验证VERSION.js
    const versionResult = validateVersionFile(files)
    allErrors.push(...versionResult.errors)
    allWarnings.push(...versionResult.warnings)

    if (fs.existsSync(VERSION_FILE)) {
      const VERSION = require(VERSION_FILE)
      console.log('📌 VERSION.js 信息:')
      console.log(`   当前版本: ${VERSION.current}`)
      console.log(`   最后更新: ${VERSION.lastUpdated}`)
      console.log(`   表数量: ${VERSION.tableCount}`)
      console.log(`   最后迁移: ${VERSION.lastMigration || '无'}`)
      console.log('')
    }

    // 5. 生成验证报告
    const result = {
      valid: allErrors.length === 0,
      errors: allErrors,
      warnings: allWarnings,
      fileCount: files.length
    }

    printResults(result)
    return result
  } catch (error) {
    allErrors.push(`验证过程出错: ${error.message}`)
    const result = { valid: false, errors: allErrors, warnings: allWarnings }
    printResults(result)
    return result
  }
}

function printResults (result) {
  console.log('='.repeat(60))

  if (result.errors && result.errors.length > 0) {
    console.log('❌ 验证失败')
    console.log('='.repeat(60))
    console.log('\n发现以下错误:\n')
    result.errors.forEach(err => {
      console.log(err)
    })
    console.log('\n' + '='.repeat(60))
    console.log('🚫 迁移文件存在问题，服务拒绝启动！')
    console.log('='.repeat(60))
    console.log('\n💡 解决方法:\n')
    console.log('   1. 使用工具创建迁移: npm run migration:create')
    console.log('   2. 修复上述错误中的问题')
    console.log('   3. 或删除不符合规范的迁移文件')
    console.log('   4. 重新验证: npm run migration:verify\n')
  } else {
    console.log('✅ 验证通过')
    console.log('='.repeat(60))

    if (result.fileCount !== undefined) {
      console.log(`\n✨ 所有 ${result.fileCount} 个迁移文件符合规范\n`)
    }

    if (result.warnings && result.warnings.length > 0) {
      console.log('⚠️  发现以下警告:\n')
      result.warnings.forEach(warn => {
        console.log(`   • ${warn}`)
      })
      console.log('')
    }
  }
}

// ==================== 执行 ====================

function main () {
  const result = validateMigrations()

  if (!result.valid) {
    process.exit(1)
  }

  process.exit(0)
}

// 如果直接执行
if (require.main === module) {
  main()
}

module.exports = { validateMigrations, VALIDATION_RULES }
