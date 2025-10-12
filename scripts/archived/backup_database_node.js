#!/usr/bin/env node
const BeijingTimeHelper = require('../utils/timeHelper')
/**
 * 数据库备份脚本 - Node.js版本
 * 使用Sequelize导出数据
 */

require('dotenv').config()
const { Sequelize } = require('sequelize')
const fs = require('fs').promises
const path = require('path')

// 创建数据库连接
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: 'mysql',
  timezone: process.env.DB_TIMEZONE || '+08:00',
  logging: false
})

// 需要备份的表
const TABLES = [
  'exchange_records',
  'trade_records',
  'user_inventory',
  'customer_sessions',
  'chat_messages',
  'user_sessions',
  'roles',
  'user_roles',
  'system_announcements',
  'feedbacks',
  'image_resources'
]

/**
 * 获取表结构
 */
async function getTableStructure (tableName) {
  const [columns] = await sequelize.query(`
    SHOW CREATE TABLE ${tableName}
  `)
  return columns[0]['Create Table']
}

/**
 * 获取表数据
 */
async function getTableData (tableName) {
  const [rows] = await sequelize.query(`SELECT * FROM ${tableName}`)
  return rows
}

/**
 * 生成INSERT语句
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
      return `'${String(value).replace(/'/g, '\\\'')}'`
    })

    statements.push(
      `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values.join(', ')});`
    )
  }

  return statements.join('\n')
}

/**
 * 主函数
 */
async function main () {
  console.log('🔍 开始数据库备份（Node.js版本）\n')

  try {
    // 测试数据库连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 创建备份目录
    const backupDir = path.join(__dirname, '..', 'backups')
    await fs.mkdir(backupDir, { recursive: true })

    // 生成备份文件名
    const timestamp = BeijingTimeHelper.now().replace(/[:.]/g, '-').replace('T', '_').slice(0, -5)
    const backupFile = path.join(backupDir, `backup_primary_key_migration_${timestamp}.sql`)

    console.log(`📁 备份文件: ${backupFile}\n`)

    // 开始备份
    let sqlContent = `-- 数据库备份
-- 数据库: ${process.env.DB_NAME}
-- 时间: ${BeijingTimeHelper.now()}
-- 备份原因: 主键命名统一改造前备份

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

`

    let totalRows = 0

    for (const tableName of TABLES) {
      console.log(`📋 备份表: ${tableName}`)

      try {
        // 获取表结构
        const createTable = await getTableStructure(tableName)
        sqlContent += `-- ----------------------------
-- Table structure for ${tableName}
-- ----------------------------
DROP TABLE IF EXISTS \`${tableName}\`;
${createTable};

`

        // 获取表数据
        const rows = await getTableData(tableName)
        console.log(`   记录数: ${rows.length}`)
        totalRows += rows.length

        if (rows.length > 0) {
          const insertStatements = generateInsertStatements(tableName, rows)
          sqlContent += `-- ----------------------------
-- Records of ${tableName}
-- ----------------------------
${insertStatements}

`
        }
      } catch (error) {
        console.error(`   ❌ 备份失败: ${error.message}`)
      }
    }

    sqlContent += `
SET FOREIGN_KEY_CHECKS = 1;

-- 备份完成
-- 总记录数: ${totalRows}
`

    // 写入文件
    await fs.writeFile(backupFile, sqlContent, 'utf8')

    console.log('\n✅ 备份完成')
    console.log(`📊 总记录数: ${totalRows}`)
    console.log(`📁 备份文件: ${backupFile}`)
    console.log(`📦 文件大小: ${(sqlContent.length / 1024).toFixed(2)} KB`)
  } catch (error) {
    console.error('\n❌ 备份失败:', error.message)
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

// 执行备份
main().catch(error => {
  console.error('❌ 脚本执行失败:', error)
  process.exit(1)
})
