/**
 * 项目启动前自动验证脚本
 * 在PM2/Nodemon启动前执行所有检查
 *
 * 检查项：
 * 1. 路由文件完整性
 * 2. 环境变量
 * 3. 必需文件
 * 4. 数据库连接
 * 5. 幂等服务 Canonical Operation 映射（决策4-B 严格模式）
 *
 * @author Restaurant Points System
 * @date 2025-11-23
 * @updated 2026-01-13 - 添加 Canonical Operation 验证
 */

const RouteValidator = require('./route_validator')
const path = require('path')
const fs = require('fs')

/**
 * 项目启动前综合检查
 * @returns {Promise<boolean>} 是否通过所有检查
 */
async function preStartCheck() {
  console.log('🚀 项目启动前检查...\n')

  const checks = []
  const startTime = Date.now()

  // 1. 路由文件完整性检查
  console.log('1️⃣  路由文件完整性检查')
  console.log('-'.repeat(60))
  const validator = new RouteValidator()
  const routeResult = validator.validateAppRoutes(path.resolve(__dirname, '../../app.js'))
  checks.push({
    name: '路由文件完整性',
    passed: routeResult.valid,
    errors: routeResult.errors,
    warnings: routeResult.warnings
  })

  // 2. 环境变量检查
  console.log('\n2️⃣  环境变量检查')
  console.log('-'.repeat(60))
  const envResult = checkEnvironmentVariables()
  checks.push({
    name: '环境变量',
    passed: envResult.valid,
    errors: envResult.errors
  })

  // 3. 必需文件检查
  console.log('\n3️⃣  必需文件检查')
  console.log('-'.repeat(60))
  const fileResult = checkRequiredFiles()
  checks.push({
    name: '必需文件',
    passed: fileResult.valid,
    errors: fileResult.errors
  })

  // 4. 数据库连接检查（可选，避免拖慢启动）
  if (process.env.CHECK_DATABASE !== 'false') {
    console.log('\n4️⃣  数据库连接检查')
    console.log('-'.repeat(60))
    const dbResult = await checkDatabaseConnection()
    checks.push({
      name: '数据库连接',
      passed: dbResult.valid,
      errors: dbResult.errors
    })
  }

  // 5. Canonical Operation 映射检查（决策4-B 严格模式）
  if (process.env.CHECK_CANONICAL !== 'false') {
    console.log('\n5️⃣  幂等服务 Canonical Operation 检查')
    console.log('-'.repeat(60))
    const canonicalResult = await checkCanonicalOperations()
    checks.push({
      name: 'Canonical Operation 映射',
      passed: canonicalResult.valid,
      errors: canonicalResult.errors,
      warnings: canonicalResult.warnings
    })
  }

  // 生成总报告
  const totalTime = Date.now() - startTime
  console.log('\n' + '='.repeat(60))
  console.log('📊 启动前检查总报告')
  console.log('='.repeat(60))

  let allPassed = true
  let warningCount = 0

  checks.forEach((check, index) => {
    const icon = check.passed ? '✅' : '❌'
    console.log(`${icon} ${index + 1}. ${check.name}: ${check.passed ? '通过' : '失败'}`)

    if (!check.passed) {
      allPassed = false
      if (check.errors && check.errors.length > 0) {
        check.errors.forEach(error => {
          console.log(`     ❌ ${error.message || error}`)
        })
      }
    }

    if (check.warnings && check.warnings.length > 0) {
      warningCount += check.warnings.length
      check.warnings.forEach(warning => {
        console.log(`     ⚠️  ${warning.message || warning}`)
      })
    }
  })

  console.log('='.repeat(60))
  console.log(`检查耗时: ${totalTime}ms`)
  console.log(`警告数: ${warningCount}`)
  console.log('='.repeat(60))

  if (allPassed) {
    console.log('\n✅ 所有检查通过，可以启动项目\n')
    return true
  } else {
    console.error('\n❌ 检查未通过，请修复以上问题后再启动\n')
    return false
  }
}

/**
 * 检查必需的环境变量
 * @returns {Object} 检查结果
 */
function checkEnvironmentVariables() {
  const required = [
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'JWT_SECRET',
    'PORT',
    'NODE_ENV'
  ]

  const missing = []
  const warnings = []

  required.forEach(key => {
    if (!process.env[key]) {
      missing.push({ message: `缺少环境变量: ${key}` })
    }
  })

  // 检查环境配置合理性
  if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET === 'development_secret') {
    warnings.push({ message: '生产环境使用了开发环境的JWT_SECRET' })
  }

  if (missing.length > 0) {
    console.log(`  ❌ 缺少 ${missing.length} 个必需环境变量`)
    return { valid: false, errors: missing }
  }

  console.log(`  ✅ 环境变量完整 (${required.length}个)`)
  if (warnings.length > 0) {
    console.log(`  ⚠️  ${warnings.length} 个警告`)
  }
  return { valid: true, errors: [], warnings }
}

/**
 * 检查必需文件
 * @returns {Object} 检查结果
 */
function checkRequiredFiles() {
  const requiredFiles = ['app.js', 'package.json', '.env', 'models/index.js', 'config/database.js']

  const missing = []

  requiredFiles.forEach(file => {
    const filePath = path.resolve(__dirname, '../..', file)
    if (!fs.existsSync(filePath)) {
      missing.push({ message: `缺少必需文件: ${file}` })
    }
  })

  if (missing.length > 0) {
    console.log(`  ❌ 缺少 ${missing.length} 个必需文件`)
    return { valid: false, errors: missing }
  }

  console.log(`  ✅ 必需文件完整 (${requiredFiles.length}个)`)
  return { valid: true, errors: [] }
}

/**
 * 检查数据库连接
 * @returns {Promise<Object>} 检查结果
 */
async function checkDatabaseConnection() {
  try {
    // 动态加载 models（此时环境变量已在入口加载）
    const { sequelize } = require('../../models')

    // 设置超时时间
    const timeout = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('数据库连接超时(5秒)')), 5000)
    })

    await Promise.race([sequelize.authenticate(), timeout])

    console.log('  ✅ 数据库连接正常')
    return { valid: true, errors: [] }
  } catch (error) {
    console.log(`  ❌ 数据库连接失败: ${error.message}`)
    return {
      valid: false,
      errors: [{ message: `数据库连接失败: ${error.message}` }]
    }
  }
}

/**
 * 检查 Canonical Operation 映射完整性
 * 【决策4-B】严格模式：启动时验证，运行时双保险
 * @returns {Promise<Object>} 检查结果
 */
async function checkCanonicalOperations() {
  try {
    const { verifyCanonicalOperations } = require('./verify_idempotency_canonical')
    const result = await verifyCanonicalOperations()

    if (result.valid) {
      console.log('  ✅ Canonical Operation 映射验证通过')
      if (result.stats) {
        console.log(`     已定义 ${result.stats.mapped_operations} 个映射`)
      }
    } else {
      console.log('  ❌ Canonical Operation 映射验证失败')
    }

    if (result.warnings && result.warnings.length > 0) {
      result.warnings.forEach(warning => {
        console.log(`  ⚠️  ${warning}`)
      })
    }

    return result
  } catch (error) {
    console.log(`  ❌ Canonical Operation 检查异常: ${error.message}`)
    return {
      valid: false,
      errors: [{ message: `Canonical Operation 检查异常: ${error.message}` }],
      warnings: []
    }
  }
}

// 命令行执行
if (require.main === module) {
  // 加载环境变量
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') })

  preStartCheck()
    .then(passed => {
      process.exit(passed ? 0 : 1)
    })
    .catch(error => {
      console.error('❌ 启动前检查异常:', error)
      process.exit(1)
    })
}

module.exports = preStartCheck
