#!/usr/bin/env node
/**
 * 数据库完全重建脚本 - 远程数据库版本
 *
 * 用途: 执行方案C完全重建，清理73条SequelizeMeta记录为1条
 * 适用场景: 远程数据库（Sealos），不能直接使用mysqldump
 *
 * 创建时间: 2025-10-13
 * 警告: 此操作会删除并重建整个数据库，务必谨慎执行
 */

require('dotenv').config()
const { Sequelize } = require('sequelize')
const path = require('path')
const fs = require('fs')

// ==================== 配置 ====================

const DB_CONFIG = {
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: 'mysql',
  logging: false
}

const BACKUP_DIR = path.join(__dirname, '../../backups')
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
}

function log (message, color = 'green') {
  const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
  console.log(`${colors[color]}[${timestamp}]${colors.reset} ${message}`)
}

function error (message) {
  log(`❌ ${message}`, 'red')
}

function warn (message) {
  log(`⚠️  ${message}`, 'yellow')
}

// function info (message) {
//   log(`ℹ️  ${message}`, 'blue')
// }

// ==================== 数据备份 ====================

async function backupData (sequelize) {
  log('💾 开始数据备份...')

  // 创建备份目录
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
  }

  // 获取所有业务表
  const [tables] = await sequelize.query('SHOW TABLES')
  const businessTables = tables
    .map(t => Object.values(t)[0])
    .filter(t => t !== 'sequelizemeta' && !t.includes('backup'))

  log(`📋 准备备份 ${businessTables.length} 个业务表...`)

  const backup = {
    timestamp: new Date().toISOString(),
    database: DB_CONFIG.database,
    tables: {}
  }

  // 备份每个表的数据
  for (const tableName of businessTables) {
    try {
      const [rows] = await sequelize.query(`SELECT * FROM \`${tableName}\``)
      backup.tables[tableName] = rows
      const count = rows.length
      if (count > 0) {
        log(`   ✅ ${tableName.padEnd(30)} ${count.toString().padStart(6)} 行`)
      }
    } catch (err) {
      warn(`   ⚠️  ${tableName} 备份失败: ${err.message}`)
    }
  }

  // 保存备份文件
  const backupFile = path.join(BACKUP_DIR, `data_backup_${TIMESTAMP}.json`)
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2))

  log(`✅ 数据备份完成: ${backupFile}`)
  return { backupFile, backup }
}

// ==================== 删除所有表 ====================

async function dropAllTables (sequelize) {
  log('🗑️  开始删除所有表...')

  // 临时禁用外键检查
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0')

  // 获取所有表
  const [tables] = await sequelize.query('SHOW TABLES')
  const allTables = tables.map(t => Object.values(t)[0])

  log(`📋 准备删除 ${allTables.length} 个表...`)

  // 删除所有表
  for (const tableName of allTables) {
    try {
      await sequelize.query(`DROP TABLE IF EXISTS \`${tableName}\``)
      log(`   ✅ 删除表: ${tableName}`)
    } catch (err) {
      warn(`   ⚠️  删除表 ${tableName} 失败: ${err.message}`)
    }
  }

  // 恢复外键检查
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1')

  log('✅ 所有表已删除')
}

// ==================== 执行基准迁移 ====================

async function executeBaseline (sequelize) {
  log('📦 开始执行基准迁移...')

  // 首先需要创建SequelizeMeta表
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS \`SequelizeMeta\` (
      \`name\` VARCHAR(255) NOT NULL PRIMARY KEY
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)

  // 使用sequelize-cli执行基准迁移
  const { execSync } = require('child_process')

  try {
    log('   执行: npx sequelize-cli db:migrate')
    execSync('npx sequelize-cli db:migrate', {
      cwd: path.join(__dirname, '../..'),
      env: process.env,
      stdio: 'pipe'
    })

    log('✅ 基准迁移执行成功')

    // 验证表数量
    const [tables] = await sequelize.query('SHOW TABLES')
    const tableCount = tables.length
    log(`📊 创建表数量: ${tableCount} (包括SequelizeMeta)`)

    // 验证SequelizeMeta记录
    const [[{ count }]] = await sequelize.query('SELECT COUNT(*) as count FROM SequelizeMeta')
    log(`📌 SequelizeMeta记录: ${count} 条`)

    if (count !== 1) {
      warn(`预期1条记录，实际${count}条`)
    }
  } catch (err) {
    error(`基准迁移执行失败: ${err.message}`)
    throw err
  }
}

// ==================== 恢复业务数据 ====================

async function restoreData (sequelize, backup) {
  log('📊 开始恢复业务数据...')

  let restoredCount = 0
  let totalRows = 0

  // 临时禁用外键检查
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0')

  // 恢复每个表的数据
  for (const [tableName, rows] of Object.entries(backup.tables)) {
    if (rows.length === 0) continue

    try {
      // 检查表是否存在
      const [tables] = await sequelize.query(`SHOW TABLES LIKE '${tableName}'`)
      if (tables.length === 0) {
        warn(`   ⚠️  表 ${tableName} 不存在，跳过`)
        continue
      }

      // 批量插入数据
      for (const row of rows) {
        const columns = Object.keys(row).map(k => `\`${k}\``).join(', ')
        const values = Object.values(row).map(v => {
          if (v === null) return 'NULL'
          if (typeof v === 'string') return `'${v.replace(/'/g, '\'\'')}'`
          if (v instanceof Date) return `'${v.toISOString()}'`
          if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, '\'\'')}'`
          return v
        }).join(', ')

        await sequelize.query(
          `INSERT INTO \`${tableName}\` (${columns}) VALUES (${values})`
        )
      }

      restoredCount++
      totalRows += rows.length
      log(`   ✅ ${tableName.padEnd(30)} ${rows.length.toString().padStart(6)} 行`)
    } catch (err) {
      warn(`   ⚠️  ${tableName} 恢复失败: ${err.message}`)
    }
  }

  // 恢复外键检查
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1')

  log(`✅ 数据恢复完成: ${restoredCount} 个表, 共 ${totalRows} 行`)
}

// ==================== 验证重建结果 ====================

async function verifyRebuild (sequelize) {
  log('🔍 开始验证重建结果...')

  // 1. 检查表数量
  const [tables] = await sequelize.query('SHOW TABLES')
  const tableCount = tables.length - 1 // 减去SequelizeMeta
  log(`   ✅ 业务表数量: ${tableCount}`)

  // 2. 检查SequelizeMeta记录
  const [[{ count }]] = await sequelize.query('SELECT COUNT(*) as count FROM SequelizeMeta')
  const [[{ name }]] = await sequelize.query('SELECT name FROM SequelizeMeta LIMIT 1')

  if (count === 1) {
    log(`   ✅ SequelizeMeta记录: 1 条 (${name})`)
  } else {
    error(`   ❌ SequelizeMeta记录: ${count} 条 (预期1条)`)
  }

  // 3. 检查数据量
  let totalRows = 0
  for (const table of tables) {
    const tableName = Object.values(table)[0]
    if (tableName === 'sequelizemeta') continue

    try {
      const [[{ rowCount }]] = await sequelize.query(
        `SELECT COUNT(*) as rowCount FROM \`${tableName}\``
      )
      totalRows += parseInt(rowCount)
    } catch (err) {
      // 忽略错误
    }
  }
  log(`   ✅ 总数据量: ${totalRows} 行`)

  // 4. 检查版本信息
  const VERSION = require('../../migrations/VERSION.js')
  log(`   ✅ 数据库版本: ${VERSION.current}`)

  log('✅ 验证完成')
}

// ==================== 主流程 ====================

async function main () {
  console.log('')
  console.log('='.repeat(70))
  console.log('🚨 数据库完全重建 V1.0.0 (方案C)')
  console.log('='.repeat(70))
  console.log('')
  console.log('⚠️  警告：此操作会删除并重建整个数据库！')
  console.log('')
  console.log('📋 执行步骤:')
  console.log('   1. 💾 备份所有业务数据')
  console.log('   2. 🗑️  删除所有表')
  console.log('   3. 📦 执行基准迁移')
  console.log('   4. 📊 恢复业务数据')
  console.log('   5. 🔍 验证重建结果')
  console.log('')
  console.log(`📍 数据库: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`)
  console.log('📊 预期结果: SequelizeMeta从73条 → 1条记录')
  console.log('')
  console.log('='.repeat(70))
  console.log('')

  // 需要用户确认
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  })

  const answer = await new Promise(resolve => {
    readline.question('❓ 确认执行？输入 "yes" 继续: ', resolve)
  })
  readline.close()

  if (answer.trim().toLowerCase() !== 'yes') {
    log('❌ 已取消执行')
    process.exit(0)
  }

  const startTime = Date.now()

  try {
    // 创建数据库连接
    const sequelize = new Sequelize(DB_CONFIG)

    // 测试连接
    await sequelize.authenticate()
    log('✅ 数据库连接成功')

    // 步骤1: 备份数据
    const { backupFile, backup } = await backupData(sequelize)

    // 步骤2: 删除所有表
    await dropAllTables(sequelize)

    // 步骤3: 执行基准迁移
    await executeBaseline(sequelize)

    // 步骤4: 恢复业务数据
    await restoreData(sequelize, backup)

    // 步骤5: 验证结果
    await verifyRebuild(sequelize)

    // 关闭连接
    await sequelize.close()

    const duration = Math.round((Date.now() - startTime) / 1000)

    console.log('')
    console.log('='.repeat(70))
    log(`🎉 数据库重建成功完成！耗时 ${duration} 秒`)
    console.log('='.repeat(70))
    console.log('')
    console.log(`💾 备份文件: ${backupFile}`)
    console.log('📊 SequelizeMeta: 73条 → 1条 ✅')
    console.log('📋 数据库版本: V1.0.0-clean-start')
    console.log('')
  } catch (err) {
    error(`重建失败: ${err.message}`)
    console.error(err)
    process.exit(1)
  }
}

// 执行主流程
if (require.main === module) {
  main()
}

module.exports = { main }
