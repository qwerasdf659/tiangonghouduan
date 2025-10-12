/**
 * 备份管理统一工具包 (Backup Toolkit)
 *
 * 功能：整合所有数据备份和恢复相关功能
 *
 * 合并来源脚本：
 * - backup_database_node.js (数据库完整备份)
 * - fix-points/backup-and-restore.js (积分数据备份和恢复)
 *
 * 使用方式：
 * node scripts/toolkit/backup-toolkit.js --action=full            # 完整数据库备份
 * node scripts/toolkit/backup-toolkit.js --action=points          # 积分数据备份
 * node scripts/toolkit/backup-toolkit.js --action=tables --tables=users,roles  # 指定表备份
 * node scripts/toolkit/backup-toolkit.js --action=restore --file=backup.json   # 恢复数据
 * node scripts/toolkit/backup-toolkit.js --action=list            # 列出所有备份
 * node scripts/toolkit/backup-toolkit.js --help                   # 显示帮助
 *
 * 创建时间：2025年10月12日 北京时间
 */

'use strict'

const fs = require('fs').promises
const fsSync = require('fs')
const path = require('path')
const readline = require('readline')
const { sequelize } = require('../../models')
const BeijingTimeHelper = require('../../utils/timeHelper')

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
}

function log (message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

// 备份目录配置
const BACKUP_DIR = path.join(__dirname, '..', '..', 'backups')

// 数据库表分类
const TABLE_GROUPS = {
  // 核心业务表
  core: [
    'users',
    'user_points_accounts',
    'points_transactions',
    'lottery_draws',
    'lottery_prizes',
    'lottery_campaigns'
  ],
  // 交易和库存表
  transaction: [
    'exchange_records',
    'trade_records',
    'user_inventory',
    'products'
  ],
  // 客服和反馈表
  support: [
    'customer_sessions',
    'chat_messages',
    'feedbacks'
  ],
  // 系统配置表
  system: [
    'roles',
    'user_roles',
    'user_sessions',
    'system_announcements',
    'audit_records',
    'audit_logs'
  ],
  // 资源表
  resource: [
    'image_resources'
  ]
}

// ==================== 备份功能 ====================

/**
 * 完整数据库备份
 */
async function backupFullDatabase () {
  log('\n💾 ━━━ 完整数据库备份 ━━━', 'cyan')
  log(`备份时间: ${BeijingTimeHelper.nowLocale()}\n`, 'blue')

  try {
    // 确保备份目录存在
    await fs.mkdir(BACKUP_DIR, { recursive: true })

    // 生成备份文件名
    const timestamp = BeijingTimeHelper.now().replace(/[:.]/g, '-').replace('T', '_').slice(0, -5)
    const backupFile = path.join(BACKUP_DIR, `full_backup_${timestamp}.sql`)

    log(`📁 备份文件: ${backupFile}\n`, 'blue')

    // 获取所有表
    const allTables = Object.values(TABLE_GROUPS).flat()

    // 开始备份
    let sqlContent = `-- 完整数据库备份
-- 数据库: ${process.env.DB_NAME}
-- 时间: ${BeijingTimeHelper.nowLocale()}
-- 备份工具: backup-toolkit.js

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

`

    let totalRows = 0
    let successCount = 0
    const failedTables = []

    for (const tableName of allTables) {
      process.stdout.write(`📋 备份表: ${tableName}...`)

      try {
        // 获取表结构
        const [createTableResult] = await sequelize.query(`SHOW CREATE TABLE ${tableName}`)
        const createTable = createTableResult[0]['Create Table']

        sqlContent += `-- ----------------------------
-- Table structure for ${tableName}
-- ----------------------------
DROP TABLE IF EXISTS \`${tableName}\`;
${createTable};

`

        // 获取表数据
        const [rows] = await sequelize.query(`SELECT * FROM ${tableName}`)
        const rowCount = rows.length
        totalRows += rowCount

        process.stdout.write(` ${rowCount}条记录\n`)

        if (rowCount > 0) {
          const insertStatements = generateInsertStatements(tableName, rows)
          sqlContent += `-- ----------------------------
-- Records of ${tableName}
-- ----------------------------
${insertStatements}

`
        }

        successCount++
      } catch (error) {
        process.stdout.write(` ❌ 失败: ${error.message}\n`)
        failedTables.push({ table: tableName, error: error.message })
      }
    }

    sqlContent += `
SET FOREIGN_KEY_CHECKS = 1;

-- 备份完成
-- 成功表数: ${successCount}/${allTables.length}
-- 总记录数: ${totalRows}
`

    // 写入文件
    await fs.writeFile(backupFile, sqlContent, 'utf8')

    log('\n✅ 完整数据库备份完成', 'green')
    log(`📊 成功备份: ${successCount}/${allTables.length} 个表`, 'green')
    log(`📊 总记录数: ${totalRows}`, 'green')
    log(`📁 备份文件: ${backupFile}`, 'blue')
    log(`📦 文件大小: ${(sqlContent.length / 1024 / 1024).toFixed(2)} MB`, 'blue')

    if (failedTables.length > 0) {
      log('\n⚠️  以下表备份失败:', 'yellow')
      failedTables.forEach(item => {
        log(`   - ${item.table}: ${item.error}`, 'yellow')
      })
    }

    return backupFile
  } catch (error) {
    log(`\n❌ 备份失败: ${error.message}`, 'red')
    throw error
  }
}

/**
 * 积分数据备份
 */
async function backupPointsData () {
  log('\n💾 ━━━ 积分数据备份 ━━━', 'cyan')
  log(`备份时间: ${BeijingTimeHelper.nowLocale()}\n`, 'blue')

  try {
    // 确保备份目录存在
    await fs.mkdir(BACKUP_DIR, { recursive: true })

    const timestamp = BeijingTimeHelper.now().replace(/[:.]/g, '-').replace('T', '_').slice(0, -5)
    const backupFile = path.join(BACKUP_DIR, `points_backup_${timestamp}.json`)

    // 备份积分账户表
    log('📋 备份积分账户表...')
    const [accounts] = await sequelize.query('SELECT * FROM user_points_accounts')
    log(`   ✅ 备份 ${accounts.length} 条账户记录`, 'green')

    // 备份积分交易表
    log('📋 备份积分交易表...')
    const [transactions] = await sequelize.query('SELECT * FROM points_transactions')
    log(`   ✅ 备份 ${transactions.length} 条交易记录`, 'green')

    const backupData = {
      timestamp: BeijingTimeHelper.now(),
      version: '1.0',
      backup_type: 'points_data',
      tables: {
        user_points_accounts: accounts,
        points_transactions: transactions
      },
      stats: {
        accounts_count: accounts.length,
        transactions_count: transactions.length
      }
    }

    await fs.writeFile(backupFile, JSON.stringify(backupData, null, 2))

    const fileSize = (await fs.stat(backupFile)).size

    log('\n✅ 积分数据备份完成', 'green')
    log(`   文件: ${backupFile}`, 'blue')
    log(`   账户: ${accounts.length}条`, 'blue')
    log(`   交易: ${transactions.length}条`, 'blue')
    log(`   大小: ${(fileSize / 1024).toFixed(2)} KB\n`, 'blue')

    return backupFile
  } catch (error) {
    log(`\n❌ 积分数据备份失败: ${error.message}`, 'red')
    throw error
  }
}

/**
 * 指定表备份
 * @param {string[]} tables - 要备份的表名数组
 */
async function backupSpecifiedTables (tables) {
  log('\n💾 ━━━ 指定表备份 ━━━', 'cyan')
  log(`备份时间: ${BeijingTimeHelper.nowLocale()}`, 'blue')
  log(`备份表: ${tables.join(', ')}\n`, 'blue')

  try {
    // 确保备份目录存在
    await fs.mkdir(BACKUP_DIR, { recursive: true })

    const timestamp = BeijingTimeHelper.now().replace(/[:.]/g, '-').replace('T', '_').slice(0, -5)
    const backupFile = path.join(BACKUP_DIR, `tables_backup_${timestamp}.json`)

    const backupData = {
      timestamp: BeijingTimeHelper.now(),
      version: '1.0',
      backup_type: 'specified_tables',
      tables: {}
    }

    let totalRows = 0

    for (const tableName of tables) {
      try {
        log(`📋 备份表: ${tableName}...`)
        const [rows] = await sequelize.query(`SELECT * FROM ${tableName}`)
        backupData.tables[tableName] = rows
        totalRows += rows.length
        log(`   ✅ ${rows.length} 条记录`, 'green')
      } catch (error) {
        log(`   ❌ 失败: ${error.message}`, 'red')
        backupData.tables[tableName] = { error: error.message }
      }
    }

    backupData.stats = {
      total_tables: tables.length,
      total_rows: totalRows
    }

    await fs.writeFile(backupFile, JSON.stringify(backupData, null, 2))

    log('\n✅ 指定表备份完成', 'green')
    log(`   文件: ${backupFile}`, 'blue')
    log(`   总记录数: ${totalRows}\n`, 'blue')

    return backupFile
  } catch (error) {
    log(`\n❌ 指定表备份失败: ${error.message}`, 'red')
    throw error
  }
}

// ==================== 恢复功能 ====================

/**
 * 恢复数据
 * @param {string} backupFile - 备份文件路径
 */
async function restoreData (backupFile) {
  log('\n🔄 ━━━ 数据恢复 ━━━', 'cyan')
  log(`恢复文件: ${backupFile}\n`, 'blue')

  // 检查文件是否存在
  if (!fsSync.existsSync(backupFile)) {
    throw new Error(`备份文件不存在: ${backupFile}`)
  }

  // 二次确认
  log('⚠️  警告：恢复数据将覆盖当前数据！', 'yellow')
  log('   这是一个危险操作，请确保您知道自己在做什么。\n', 'yellow')

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  const confirmed = await new Promise(resolve => {
    rl.question('确认恢复数据？输入 "YES" 继续: ', answer => {
      rl.close()
      resolve(answer === 'YES')
    })
  })

  if (!confirmed) {
    log('❌ 用户取消操作', 'red')
    process.exit(0)
  }

  try {
    // 读取备份文件
    const backupContent = await fs.readFile(backupFile, 'utf8')
    const backupData = JSON.parse(backupContent)

    log('\n📋 备份信息:', 'blue')
    log(`   时间: ${backupData.timestamp}`, 'blue')
    log(`   类型: ${backupData.backup_type || 'unknown'}`, 'blue')
    log(`   版本: ${backupData.version}\n`, 'blue')

    // 开始事务
    const transaction = await sequelize.transaction()

    try {
      let restoredRows = 0

      for (const [tableName, rows] of Object.entries(backupData.tables)) {
        if (rows.error) {
          log(`⚠️  跳过表 ${tableName}: ${rows.error}`, 'yellow')
          continue
        }

        log(`🔄 恢复表: ${tableName}...`)

        // 清空表
        await sequelize.query(`TRUNCATE TABLE ${tableName}`, { transaction })

        // 如果有数据，则恢复
        if (Array.isArray(rows) && rows.length > 0) {
          // 批量插入数据
          const columns = Object.keys(rows[0])
          const values = rows.map(row => {
            return '(' + columns.map(col => {
              const value = row[col]
              if (value === null) return 'NULL'
              if (typeof value === 'number') return value
              if (typeof value === 'boolean') return value ? 1 : 0
              if (value instanceof Date) return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`
              return `'${String(value).replace(/'/g, '\\\'')}'`
            }).join(', ') + ')'
          }).join(',\n')

          await sequelize.query(
            `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${values}`,
            { transaction }
          )

          restoredRows += rows.length
          log(`   ✅ 恢复 ${rows.length} 条记录`, 'green')
        } else {
          log('   ⚠️  表为空', 'yellow')
        }
      }

      // 提交事务
      await transaction.commit()

      log('\n✅ 数据恢复完成', 'green')
      log(`   总恢复记录数: ${restoredRows}\n`, 'green')
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      throw error
    }
  } catch (error) {
    log(`\n❌ 数据恢复失败: ${error.message}`, 'red')
    throw error
  }
}

// ==================== 工具函数 ====================

/**
 * 生成INSERT语句
 * @param {string} tableName - 表名
 * @param {Array} rows - 数据行
 * @returns {string} INSERT语句
 */
function generateInsertStatements (tableName, rows) {
  if (rows.length === 0) return ''

  const statements = []
  for (const row of rows) {
    const columns = Object.keys(row)
    const values = columns.map(col => {
      const value = row[col]
      if (value === null) return 'NULL'
      if (typeof value === 'number') return value
      if (typeof value === 'boolean') return value ? 1 : 0
      if (value instanceof Date) return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`
      // 字符串需要转义单引号
      return `'${String(value).replace(/'/g, '\\\'')}' `
    })

    statements.push(
      `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});`
    )
  }

  return statements.join('\n')
}

/**
 * 列出所有备份
 */
async function listBackups () {
  log('\n📋 ━━━ 备份文件列表 ━━━', 'cyan')

  try {
    // 确保备份目录存在
    await fs.mkdir(BACKUP_DIR, { recursive: true })

    const files = await fs.readdir(BACKUP_DIR)
    const backupFiles = files.filter(f => f.endsWith('.sql') || f.endsWith('.json'))

    if (backupFiles.length === 0) {
      log('\n⚠️  未找到备份文件', 'yellow')
      return
    }

    log(`\n找到 ${backupFiles.length} 个备份文件:\n`, 'blue')

    for (const file of backupFiles.sort().reverse()) {
      const filePath = path.join(BACKUP_DIR, file)
      const stats = await fs.stat(filePath)
      const size = (stats.size / 1024).toFixed(2)
      const mtime = stats.mtime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })

      log(`📁 ${file}`, 'blue')
      log(`   大小: ${size} KB`, 'cyan')
      log(`   时间: ${mtime}\n`, 'cyan')
    }
  } catch (error) {
    log(`❌ 列出备份文件失败: ${error.message}`, 'red')
  }
}

/**
 * 显示帮助信息
 */
function showHelp () {
  console.log(`
备份管理统一工具包 (Backup Toolkit)

用法:
  node scripts/toolkit/backup-toolkit.js [选项]

选项:
  --action=full              完整数据库备份（包含所有表）
  --action=points            积分数据备份（user_points_accounts, points_transactions）
  --action=tables            指定表备份
    --tables=table1,table2   要备份的表名（逗号分隔）
  --action=restore           恢复数据
    --file=backup.json       备份文件路径
  --action=list              列出所有备份文件
  --help                     显示此帮助信息

示例:
  # 完整数据库备份
  node scripts/toolkit/backup-toolkit.js --action=full

  # 积分数据备份
  node scripts/toolkit/backup-toolkit.js --action=points

  # 指定表备份
  node scripts/toolkit/backup-toolkit.js --action=tables --tables=users,roles

  # 恢复数据
  node scripts/toolkit/backup-toolkit.js --action=restore --file=backups/points_backup_2025-10-12.json

  # 列出所有备份
  node scripts/toolkit/backup-toolkit.js --action=list

表分组说明:
  core:        核心业务表（users, user_points_accounts, points_transactions等）
  transaction: 交易和库存表（exchange_records, trade_records等）
  support:     客服和反馈表（customer_sessions, chat_messages等）
  system:      系统配置表（roles, user_roles等）
  resource:    资源表（image_resources）

注意事项:
  1. 所有备份文件保存在 backups/ 目录
  2. 恢复操作需要二次确认（输入 "YES"）
  3. 恢复操作会覆盖当前数据，请谨慎使用
  4. 建议定期备份重要数据
  5. 备份文件建议定期转移到安全存储位置
`)
}

// ==================== 主函数 ====================

async function main () {
  const args = process.argv.slice(2)

  // 解析参数
  const options = {}
  args.forEach(arg => {
    if (arg === '--help') {
      options.help = true
    } else if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=')
      options[key] = value || true
    }
  })

  // 显示帮助
  if (options.help || !options.action) {
    showHelp()
    process.exit(0)
  }

  try {
    switch (options.action) {
    case 'full':
      await backupFullDatabase()
      break

    case 'points':
      await backupPointsData()
      break

    case 'tables':
      if (!options.tables) {
        log('❌ 请指定要备份的表名: --tables=table1,table2', 'red')
        process.exit(1)
      }
      const tables = options.tables.split(',').map(t => t.trim())
      await backupSpecifiedTables(tables)
      break

    case 'restore':
      if (!options.file) {
        log('❌ 请指定备份文件: --file=backup.json', 'red')
        process.exit(1)
      }
      await restoreData(options.file)
      break

    case 'list':
      await listBackups()
      break

    default:
      log(`❌ 未知操作: ${options.action}`, 'red')
      log('使用 --help 查看帮助信息', 'yellow')
      process.exit(1)
    }

    log('✅ 操作成功完成\n', 'green')
    process.exit(0)
  } catch (error) {
    log(`\n❌ 操作失败: ${error.message}`, 'red')
    console.error(error.stack)
    process.exit(1)
  } finally {
    // 确保关闭数据库连接
    try {
      await sequelize.close()
    } catch (e) {
      // 忽略关闭错误
    }
  }
}

// 执行主函数
if (require.main === module) {
  main()
}

module.exports = {
  backupFullDatabase,
  backupPointsData,
  backupSpecifiedTables,
  restoreData,
  listBackups
}
