#!/usr/bin/env node
/**
 * 测试方案C重建准备就绪情况
 *
 * 用途: 验证所有工具和文件是否准备就绪，可以执行完全重建
 * 使用: node scripts/database/test-rebuild-readiness.js
 *
 * 创建时间: 2025-10-13
 */

require('dotenv').config()
const fs = require('fs')
const path = require('path')
const { Sequelize } = require('sequelize')

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
}

function log (message, color = 'green') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function success (message) {
  log(`✅ ${message}`, 'green')
}

function error (message) {
  log(`❌ ${message}`, 'red')
}

function warn (message) {
  log(`⚠️  ${message}`, 'yellow')
}

function info (message) {
  log(`ℹ️  ${message}`, 'blue')
}

// 检查项
const checks = {
  passed: 0,
  failed: 0,
  warnings: 0
}

async function main () {
  console.log('')
  log('='.repeat(70), 'blue')
  log('  数据库重建方案C - 准备就绪检查', 'blue')
  log('='.repeat(70), 'blue')
  console.log('')

  // 1. 检查基准迁移文件
  info('1️⃣  检查基准迁移文件...')
  const baselinePath = path.join(__dirname, '../../migrations/20251013100000-baseline-v1.0.0-clean-start.js')
  if (fs.existsSync(baselinePath)) {
    success('基准迁移文件存在')
    const stats = fs.statSync(baselinePath)
    info(`   文件大小: ${(stats.size / 1024).toFixed(2)} KB`)
    checks.passed++
  } else {
    error('基准迁移文件不存在')
    checks.failed++
  }
  console.log('')

  // 2. 检查重建脚本
  info('2️⃣  检查重建脚本...')
  const rebuildScriptPath = path.join(__dirname, 'rebuild-remote-db.js')
  if (fs.existsSync(rebuildScriptPath)) {
    success('重建脚本存在')
    const isExecutable = (fs.statSync(rebuildScriptPath).mode & parseInt('111', 8)) !== 0
    if (isExecutable) {
      success('重建脚本有执行权限')
      checks.passed++
    } else {
      warn('重建脚本无执行权限，但可以通过node运行')
      checks.warnings++
    }
  } else {
    error('重建脚本不存在')
    checks.failed++
  }
  console.log('')

  // 3. 检查VERSION.js
  info('3️⃣  检查VERSION.js配置...')
  const versionPath = path.join(__dirname, '../../migrations/VERSION.js')
  if (fs.existsSync(versionPath)) {
    success('VERSION.js文件存在')
    try {
      const VERSION = require(versionPath)
      info(`   当前版本: ${VERSION.current}`)
      info(`   表数量: ${VERSION.tableCount}`)
      info(`   基准迁移: ${VERSION.baseline}`)

      // 验证VERSION.js
      try {
        VERSION.validate()
        success('VERSION.js验证通过')
        checks.passed++
      } catch (err) {
        error(`VERSION.js验证失败: ${err.message}`)
        checks.failed++
      }
    } catch (err) {
      error(`无法加载VERSION.js: ${err.message}`)
      checks.failed++
    }
  } else {
    error('VERSION.js文件不存在')
    checks.failed++
  }
  console.log('')

  // 4. 检查数据库连接
  info('4️⃣  检查数据库连接...')
  try {
    const sequelize = new Sequelize(
      process.env.DB_NAME,
      process.env.DB_USER,
      process.env.DB_PASSWORD,
      {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: 'mysql',
        logging: false
      }
    )

    await sequelize.authenticate()
    success('数据库连接成功')
    info(`   数据库: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`)
    checks.passed++

    // 检查SequelizeMeta状态
    try {
      const [[{ count }]] = await sequelize.query('SELECT COUNT(*) as count FROM SequelizeMeta')
      info(`   SequelizeMeta记录: ${count} 条`)

      if (count === 1) {
        success('✨ 已完成重建！SequelizeMeta只有1条记录')
      } else if (count > 1) {
        warn(`需要重建：SequelizeMeta有${count}条记录（预期1条）`)
        checks.warnings++
      }
    } catch (err) {
      error(`无法查询SequelizeMeta: ${err.message}`)
    }

    // 检查数据量
    try {
      const [tables] = await sequelize.query('SHOW TABLES')
      const tableNames = tables.map(t => Object.values(t)[0]).filter(t => t !== 'sequelizemeta')
      info(`   业务表数量: ${tableNames.length}`)

      let totalRows = 0
      for (const tableName of tableNames.slice(0, 5)) { // 只检查前5个表
        try {
          const [[{ rowCount }]] = await sequelize.query(`SELECT COUNT(*) as rowCount FROM \`${tableName}\``)
          totalRows += parseInt(rowCount)
        } catch (_err) {
          // 忽略错误
        }
      }
      info(`   数据量示例: 前5个表共 ${totalRows} 行`)
    } catch (err) {
      warn(`无法统计数据量: ${err.message}`)
    }

    await sequelize.close()
  } catch (err) {
    error(`数据库连接失败: ${err.message}`)
    checks.failed++
  }
  console.log('')

  // 5. 检查备份目录
  info('5️⃣  检查备份目录...')
  const backupDir = path.join(__dirname, '../../backups')
  if (fs.existsSync(backupDir)) {
    success('备份目录存在')
    const files = fs.readdirSync(backupDir)
    info(`   备份文件数量: ${files.length}`)
    checks.passed++
  } else {
    warn('备份目录不存在，重建时会自动创建')
    checks.warnings++
  }
  console.log('')

  // 6. 检查package.json命令
  info('6️⃣  检查package.json命令...')
  const packageJsonPath = path.join(__dirname, '../../package.json')
  if (fs.existsSync(packageJsonPath)) {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
    const commands = [
      'migration:create',
      'migration:verify',
      'migration:status',
      'migration:rebuild'
    ]

    let allCommandsExist = true
    for (const cmd of commands) {
      if (packageJson.scripts[cmd]) {
        success(`命令存在: npm run ${cmd}`)
      } else {
        error(`命令缺失: npm run ${cmd}`)
        allCommandsExist = false
      }
    }

    if (allCommandsExist) {
      checks.passed++
    } else {
      checks.failed++
    }
  } else {
    error('package.json文件不存在')
    checks.failed++
  }
  console.log('')

  // 7. 检查legacy目录
  info('7️⃣  检查legacy目录...')
  const legacyDir = path.join(__dirname, '../../migrations/legacy')
  if (fs.existsSync(legacyDir)) {
    const legacyFiles = fs.readdirSync(legacyDir).filter(f => f.endsWith('.js'))
    success(`legacy目录存在，已归档 ${legacyFiles.length} 个旧迁移文件`)
    checks.passed++
  } else {
    warn('legacy目录不存在')
    checks.warnings++
  }
  console.log('')

  // 生成总结报告
  log('='.repeat(70), 'blue')
  log('  检查结果总结', 'blue')
  log('='.repeat(70), 'blue')
  console.log('')

  const total = checks.passed + checks.failed + checks.warnings
  const passRate = total > 0 ? (checks.passed / total * 100).toFixed(1) : 0

  success(`通过: ${checks.passed} 项`)
  if (checks.warnings > 0) warn(`警告: ${checks.warnings} 项`)
  if (checks.failed > 0) error(`失败: ${checks.failed} 项`)
  info(`通过率: ${passRate}%`)
  console.log('')

  // 给出建议
  if (checks.failed === 0) {
    success('✨ 所有检查通过！可以执行完全重建')
    console.log('')
    info('📋 执行命令:')
    info('   npm run migration:rebuild')
    console.log('')
    info('📖 参考文档:')
    info('   docs/数据库重建方案C实施指南.md')
  } else {
    error('❌ 部分检查未通过，请先解决问题')
  }

  console.log('')
  log('='.repeat(70), 'blue')

  process.exit(checks.failed > 0 ? 1 : 0)
}

// 执行主流程
if (require.main === module) {
  main().catch(err => {
    console.error('检查过程出错:', err)
    process.exit(1)
  })
}

module.exports = { main }
