/**
 * 完整数据库备份脚本
 *
 * 功能：
 * - 备份所有表的结构（包含索引和外键约束）
 * - 备份所有表的数据（包括空表）
 * - 生成SQL和JSON两种格式
 * - 生成MD5校验和
 * - 生成备份摘要报告
 *
 * 使用方式：
 * node scripts/database/complete_backup.js [--output-dir=备份目录]
 */

'use strict'

require('dotenv').config()
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { sequelize } = require('../../models')

// 北京时间辅助函数
function getBeijingTime() {
  return new Date().toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

function getBeijingDateStr() {
  const now = new Date()
  const beijing = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
  const year = beijing.getFullYear()
  const month = String(beijing.getMonth() + 1).padStart(2, '0')
  const day = String(beijing.getDate()).padStart(2, '0')
  const hour = String(beijing.getHours()).padStart(2, '0')
  const minute = String(beijing.getMinutes()).padStart(2, '0')
  const second = String(beijing.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day}_${hour}-${minute}-${second}`
}

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

// MD5计算
function calculateMD5(filePath) {
  const content = fs.readFileSync(filePath)
  return crypto.createHash('md5').update(content).digest('hex')
}

// 转义SQL字符串
function escapeSQLValue(value) {
  if (value === null || value === undefined) {
    return 'NULL'
  }
  if (typeof value === 'number') {
    return value.toString()
  }
  if (typeof value === 'boolean') {
    return value ? '1' : '0'
  }
  if (value instanceof Date) {
    return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`
  }
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''").replace(/\\/g, '\\\\')}'`
  }
  // 转义字符串
  return `'${String(value).replace(/'/g, "''").replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`
}

async function performCompleteBackup(outputDir) {
  const startTime = Date.now()
  const beijingTime = getBeijingTime()
  const dateStr = getBeijingDateStr()

  log('\n' + '='.repeat(80), 'cyan')
  log('完整数据库备份工具 - Complete Database Backup', 'cyan')
  log('='.repeat(80), 'cyan')
  log(`\n备份时间（北京时间）: ${beijingTime}`, 'blue')

  const dbName = process.env.DB_NAME || 'restaurant_points_dev'
  const dbHost = process.env.DB_HOST
  const dbPort = process.env.DB_PORT

  log(`数据库: ${dbName}@${dbHost}:${dbPort}\n`, 'blue')

  try {
    // 验证数据库连接
    await sequelize.authenticate()
    log('✅ 数据库连接成功\n', 'green')

    // 获取所有表
    const [tables] = await sequelize.query('SHOW TABLES')
    const tableNames = tables.map(t => Object.values(t)[0])

    log(`📊 发现 ${tableNames.length} 个表\n`, 'blue')

    // 备份数据结构
    const backupData = {
      metadata: {
        backup_date: beijingTime,
        backup_timestamp: new Date().toISOString(),
        database: dbName,
        host: `${dbHost}:${dbPort}`,
        total_tables: tableNames.length,
        version: 'complete_backup_v2.0'
      },
      tables: {},
      indexes: {},
      foreign_keys: {},
      statistics: {
        total_rows: 0,
        empty_tables: [],
        non_empty_tables: [],
        error_tables: []
      }
    }

    // SQL备份内容
    let sqlContent = `-- 完整数据库备份
-- 备份时间（北京时间）: ${beijingTime}
-- 数据库: ${dbName}
-- 主机: ${dbHost}:${dbPort}
-- 表数量: ${tableNames.length}
-- 备份版本: complete_backup_v2.0

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';

`

    // 获取所有外键约束
    const [foreignKeys] = await sequelize.query(`
      SELECT 
        TABLE_NAME,
        CONSTRAINT_NAME,
        COLUMN_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY TABLE_NAME, CONSTRAINT_NAME
    `)

    // 获取外键规则
    const [fkRules] = await sequelize.query(`
      SELECT 
        rc.CONSTRAINT_NAME,
        rc.DELETE_RULE,
        rc.UPDATE_RULE,
        kcu.TABLE_NAME
      FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
        ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        AND rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
      WHERE rc.CONSTRAINT_SCHEMA = DATABASE()
    `)

    // 创建外键规则映射
    const fkRuleMap = {}
    fkRules.forEach(rule => {
      fkRuleMap[rule.CONSTRAINT_NAME] = {
        delete_rule: rule.DELETE_RULE,
        update_rule: rule.UPDATE_RULE
      }
    })

    // 组织外键数据
    foreignKeys.forEach(fk => {
      if (!backupData.foreign_keys[fk.TABLE_NAME]) {
        backupData.foreign_keys[fk.TABLE_NAME] = []
      }
      const rules = fkRuleMap[fk.CONSTRAINT_NAME] || {
        delete_rule: 'RESTRICT',
        update_rule: 'CASCADE'
      }
      backupData.foreign_keys[fk.TABLE_NAME].push({
        constraint_name: fk.CONSTRAINT_NAME,
        column: fk.COLUMN_NAME,
        references_table: fk.REFERENCED_TABLE_NAME,
        references_column: fk.REFERENCED_COLUMN_NAME,
        on_delete: rules.delete_rule,
        on_update: rules.update_rule
      })
    })

    // 备份每个表
    for (const tableName of tableNames) {
      log(`备份表: ${tableName}...`, 'cyan')

      try {
        // 1. 获取表结构（CREATE TABLE语句）
        const [createTable] = await sequelize.query(`SHOW CREATE TABLE \`${tableName}\``)
        const createStatement = createTable[0]['Create Table']

        // 2. 获取表数据
        const [rows] = await sequelize.query(`SELECT * FROM \`${tableName}\``)
        const rowCount = rows.length

        // 3. 获取索引信息
        const [indexes] = await sequelize.query(`SHOW INDEX FROM \`${tableName}\``)

        // 4. 获取列信息
        const [columns] = await sequelize.query(`SHOW FULL COLUMNS FROM \`${tableName}\``)

        // 存储到JSON
        backupData.tables[tableName] = {
          row_count: rowCount,
          create_statement: createStatement,
          columns: columns.map(col => ({
            name: col.Field,
            type: col.Type,
            null: col.Null,
            key: col.Key,
            default: col.Default,
            extra: col.Extra,
            comment: col.Comment
          })),
          data: rows
        }

        // 存储索引
        backupData.indexes[tableName] = indexes.map(idx => ({
          key_name: idx.Key_name,
          column_name: idx.Column_name,
          non_unique: idx.Non_unique,
          seq_in_index: idx.Seq_in_index,
          index_type: idx.Index_type
        }))

        // 生成SQL
        sqlContent += `-- --------------------------------------------------------\n`
        sqlContent += `-- 表结构: ${tableName}\n`
        sqlContent += `-- 行数: ${rowCount}\n`
        sqlContent += `-- --------------------------------------------------------\n\n`
        sqlContent += `DROP TABLE IF EXISTS \`${tableName}\`;\n`
        sqlContent += `${createStatement};\n\n`

        // 生成INSERT语句
        if (rowCount > 0) {
          const columnNames = columns.map(col => `\`${col.Field}\``).join(', ')

          sqlContent += `-- 数据: ${tableName}\n`
          sqlContent += `LOCK TABLES \`${tableName}\` WRITE;\n`

          // 分批插入，每批100条
          const batchSize = 100
          for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize)
            const values = batch
              .map(row => {
                const vals = columns.map(col => escapeSQLValue(row[col.Field]))
                return `(${vals.join(', ')})`
              })
              .join(',\n')

            sqlContent += `INSERT INTO \`${tableName}\` (${columnNames}) VALUES\n${values};\n`
          }

          sqlContent += `UNLOCK TABLES;\n\n`
        }

        // 更新统计
        backupData.statistics.total_rows += rowCount
        if (rowCount === 0) {
          backupData.statistics.empty_tables.push(tableName)
        } else {
          backupData.statistics.non_empty_tables.push({ name: tableName, rows: rowCount })
        }

        log(`  ✅ ${tableName}: ${rowCount} 行, ${columns.length} 列`, 'green')
      } catch (error) {
        log(`  ❌ ${tableName}: 备份失败 - ${error.message}`, 'red')
        backupData.statistics.error_tables.push({ name: tableName, error: error.message })
      }
    }

    // 添加外键约束恢复SQL
    sqlContent += `-- --------------------------------------------------------\n`
    sqlContent += `-- 外键约束恢复\n`
    sqlContent += `-- --------------------------------------------------------\n\n`
    sqlContent += `SET FOREIGN_KEY_CHECKS = 1;\n\n`
    sqlContent += `-- 备份完成于 ${beijingTime}\n`

    // 保存备份文件
    const jsonFileName = `complete_backup_2026-01-13_${dateStr}.json`
    const sqlFileName = `complete_backup_2026-01-13_${dateStr}.sql`

    const jsonPath = path.join(outputDir, jsonFileName)
    const sqlPath = path.join(outputDir, sqlFileName)

    fs.writeFileSync(jsonPath, JSON.stringify(backupData, null, 2), 'utf8')
    fs.writeFileSync(sqlPath, sqlContent, 'utf8')

    // 计算MD5
    const jsonMD5 = calculateMD5(jsonPath)
    const sqlMD5 = calculateMD5(sqlPath)

    // 保存MD5校验文件
    const md5Content = `# MD5 校验和
# 生成时间（北京时间）: ${beijingTime}

${jsonFileName}: ${jsonMD5}
${sqlFileName}: ${sqlMD5}
`
    fs.writeFileSync(path.join(outputDir, 'BACKUP_MD5.txt'), md5Content)

    // 生成备份摘要
    const jsonSize = (fs.statSync(jsonPath).size / 1024 / 1024).toFixed(2)
    const sqlSize = (fs.statSync(sqlPath).size / 1024 / 1024).toFixed(2)

    const summaryContent = `# 数据库备份摘要报告
## 备份信息
- 备份日期（北京时间）: 2026-01-13
- 备份时间: ${beijingTime}
- 数据库: ${dbName}
- 主机: ${dbHost}:${dbPort}

## 备份统计
- 总表数: ${tableNames.length}
- 总行数: ${backupData.statistics.total_rows}
- 空表数: ${backupData.statistics.empty_tables.length}
- 错误表数: ${backupData.statistics.error_tables.length}

## 备份文件
- JSON备份: ${jsonFileName} (${jsonSize} MB)
- SQL备份: ${sqlFileName} (${sqlSize} MB)
- MD5校验: BACKUP_MD5.txt

## 表详情
${tableNames
  .map(t => {
    const tableData = backupData.tables[t]
    const rowCount = tableData ? tableData.row_count : 0
    return `✅ ${t}: ${rowCount} 行`
  })
  .join('\n')}

## 外键约束统计
- 总外键数: ${foreignKeys.length}
- 涉及表数: ${Object.keys(backupData.foreign_keys).length}

## 备份完成
✅ 备份已成功完成于 ${beijingTime}
`
    fs.writeFileSync(path.join(outputDir, 'BACKUP_SUMMARY.txt'), summaryContent)

    // 生成README
    const readmeContent = `# 数据库备份 - 2026年01月13日（北京时间）

## 备份内容
- 完整的表结构（CREATE TABLE语句）
- 所有表的数据（包括空表）
- 索引信息
- 外键约束及规则

## 文件清单
| 文件 | 说明 | 大小 |
|------|------|------|
| ${jsonFileName} | JSON格式完整备份 | ${jsonSize} MB |
| ${sqlFileName} | SQL格式完整备份 | ${sqlSize} MB |
| BACKUP_MD5.txt | MD5校验和 | - |
| BACKUP_SUMMARY.txt | 备份摘要 | - |
| README.md | 说明文档 | - |

## 恢复方法

### SQL恢复
\`\`\`bash
mysql -u用户名 -p密码 数据库名 < ${sqlFileName}
\`\`\`

### JSON恢复
使用项目提供的恢复脚本或手动解析JSON文件恢复

## 验证备份
\`\`\`bash
# 验证MD5
md5sum ${jsonFileName}
md5sum ${sqlFileName}
# 对比 BACKUP_MD5.txt 中的值
\`\`\`

## 备份统计
- 表数量: ${tableNames.length}
- 总行数: ${backupData.statistics.total_rows}
- 备份时间: ${beijingTime}

---
生成时间: ${beijingTime}（北京时间）
`
    fs.writeFileSync(path.join(outputDir, 'README.md'), readmeContent)

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    // 打印完成报告
    log('\n' + '='.repeat(80), 'cyan')
    log('备份完成报告', 'cyan')
    log('='.repeat(80), 'cyan')

    log(`\n📊 备份统计:`, 'blue')
    log(`   表数量: ${tableNames.length}`, 'green')
    log(`   总行数: ${backupData.statistics.total_rows}`, 'green')
    log(`   空表: ${backupData.statistics.empty_tables.length}个`, 'yellow')
    log(
      `   错误: ${backupData.statistics.error_tables.length}个`,
      backupData.statistics.error_tables.length > 0 ? 'red' : 'green'
    )
    log(`   外键约束: ${foreignKeys.length}个`, 'green')

    log(`\n📁 备份文件:`, 'blue')
    log(`   ${jsonPath} (${jsonSize} MB)`, 'green')
    log(`   ${sqlPath} (${sqlSize} MB)`, 'green')

    log(`\n⏱️ 耗时: ${duration}秒`, 'blue')
    log(`\n✅ 数据库备份成功完成！\n`, 'green')

    return {
      success: true,
      tables: tableNames.length,
      totalRows: backupData.statistics.total_rows,
      files: {
        json: jsonPath,
        sql: sqlPath
      }
    }
  } catch (error) {
    log(`\n❌ 备份失败: ${error.message}`, 'red')
    console.error(error.stack)
    return { success: false, error: error.message }
  } finally {
    await sequelize.close()
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2)

  // 解析输出目录
  let outputDir = path.join(process.cwd(), 'backups/backup_2026-01-13_complete')
  const outputArg = args.find(arg => arg.startsWith('--output-dir='))
  if (outputArg) {
    outputDir = outputArg.split('=')[1]
  }

  // 确保目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const result = await performCompleteBackup(outputDir)

  process.exit(result.success ? 0 : 1)
}

if (require.main === module) {
  main()
}

module.exports = { performCompleteBackup }
