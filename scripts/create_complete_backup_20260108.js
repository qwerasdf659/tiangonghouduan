#!/usr/bin/env node
/**
 * 完整数据库备份脚本 - 2026年01月08日
 * 使用Sequelize直接连接数据库进行备份
 *
 * 功能：
 * 1. 备份所有数据库表结构（CREATE TABLE语句）
 * 2. 备份所有表数据（包括空表）
 * 3. 备份所有索引定义
 * 4. 备份所有外键约束
 * 5. 生成JSON格式备份（完整数据）
 * 6. 生成SQL格式备份（可直接恢复）
 * 7. 生成MD5校验文件
 * 8. 生成备份摘要报告
 *
 * 北京时间：2026年01月08日
 */

require('dotenv').config()
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { sequelize } = require('../config/database')

// 北京时间格式化
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

// 创建备份目录
const backupDate = '2026-01-08'
const backupDir = path.join(__dirname, '..', 'backups', `backup_${backupDate}_complete`)

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true })
}

console.log(`\n🔄 开始完整数据库备份 - ${getBeijingTime()}`)
console.log(`📁 备份目录: ${backupDir}`)
console.log(`📊 数据库: ${process.env.DB_NAME}`)

// 备份文件路径
const timestamp = new Date()
  .toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  .replace(/\//g, '-')
  .replace(/:/g, '-')
  .replace(/\s/g, '_')
const sqlBackupFile = path.join(backupDir, `complete_backup_${backupDate}_${timestamp}.sql`)
const jsonBackupFile = path.join(backupDir, `complete_backup_${backupDate}_${timestamp}.json`)

async function performBackup() {
  try {
    // 测试数据库连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 1. 获取所有表名
    console.log('\n📋 步骤1: 获取所有表名...')
    const [tables] = await sequelize.query(`
      SELECT TABLE_NAME 
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = '${process.env.DB_NAME}'
      ORDER BY TABLE_NAME
    `)
    console.log(`✅ 找到 ${tables.length} 个表`)

    if (tables.length === 0) {
      console.warn('⚠️ 数据库中没有表，备份将为空')
    }

    // 2. 准备JSON备份对象
    console.log('\n📋 步骤2: 收集表结构和数据...')
    const jsonBackup = {
      backup_info: {
        backup_date: backupDate,
        backup_time: getBeijingTime(),
        database: process.env.DB_NAME,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        table_count: tables.length,
        version: '1.0.0'
      },
      tables: {}
    }

    // 3. 准备SQL备份内容
    let sqlContent = `-- 完整数据库备份
-- 备份日期: ${backupDate}
-- 备份时间: ${getBeijingTime()}
-- 数据库: ${process.env.DB_NAME}
-- 表数量: ${tables.length}

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 创建数据库（如果不存在）
CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE \`${process.env.DB_NAME}\`;

`

    // 4. 遍历每个表进行备份
    for (let i = 0; i < tables.length; i++) {
      const tableName = tables[i].TABLE_NAME
      console.log(`\n📊 [${i + 1}/${tables.length}] 备份表: ${tableName}`)

      try {
        // 4.1 获取表结构
        const [createTableResult] = await sequelize.query(`SHOW CREATE TABLE \`${tableName}\``)
        const createTableSQL = createTableResult[0]['Create Table']

        // 4.2 获取表数据行数
        const [countResult] = await sequelize.query(
          `SELECT COUNT(*) as count FROM \`${tableName}\``
        )
        const rowCount = countResult[0].count

        // 4.3 获取表数据
        const [tableData] = await sequelize.query(`SELECT * FROM \`${tableName}\``)

        // 4.4 获取索引信息
        const [indexes] = await sequelize.query(`SHOW INDEX FROM \`${tableName}\``)

        // 4.5 获取外键信息
        const [foreignKeys] = await sequelize.query(`
          SELECT 
            CONSTRAINT_NAME,
            COLUMN_NAME,
            REFERENCED_TABLE_NAME,
            REFERENCED_COLUMN_NAME
          FROM information_schema.KEY_COLUMN_USAGE
          WHERE TABLE_SCHEMA = '${process.env.DB_NAME}'
            AND TABLE_NAME = '${tableName}'
            AND REFERENCED_TABLE_NAME IS NOT NULL
        `)

        console.log(`   ✅ 行数: ${rowCount}, 索引: ${indexes.length}, 外键: ${foreignKeys.length}`)

        // 5. 保存到JSON备份
        jsonBackup.tables[tableName] = {
          structure: createTableSQL,
          row_count: rowCount,
          data: tableData,
          indexes: indexes,
          foreign_keys: foreignKeys
        }

        // 6. 生成SQL备份内容
        sqlContent += `\n-- ========================================\n`
        sqlContent += `-- 表: ${tableName}\n`
        sqlContent += `-- 行数: ${rowCount}\n`
        sqlContent += `-- ========================================\n\n`

        // 删除表（如果存在）
        sqlContent += `DROP TABLE IF EXISTS \`${tableName}\`;\n\n`

        // 创建表
        sqlContent += `${createTableSQL};\n\n`

        // 插入数据
        if (tableData.length > 0) {
          sqlContent += `-- 插入数据\n`

          // 获取列名
          const columns = Object.keys(tableData[0])
          const columnList = columns.map(col => `\`${col}\``).join(', ')

          // 分批插入（每100行一批）
          const batchSize = 100
          for (let j = 0; j < tableData.length; j += batchSize) {
            const batch = tableData.slice(j, Math.min(j + batchSize, tableData.length))

            sqlContent += `INSERT INTO \`${tableName}\` (${columnList}) VALUES\n`

            const values = batch.map(row => {
              const rowValues = columns
                .map(col => {
                  const value = row[col]
                  if (value === null) return 'NULL'
                  if (typeof value === 'number') return value
                  if (typeof value === 'boolean') return value ? 1 : 0
                  if (value instanceof Date)
                    return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`
                  if (Buffer.isBuffer(value)) return `0x${value.toString('hex')}`
                  // 字符串需要转义
                  return `'${String(value).replace(/'/g, "''").replace(/\\/g, '\\\\')}'`
                })
                .join(', ')
              return `  (${rowValues})`
            })

            sqlContent += values.join(',\n')
            sqlContent += ';\n\n'
          }
        } else {
          sqlContent += `-- 表为空，无数据插入\n\n`
        }
      } catch (error) {
        console.error(`   ❌ 备份表 ${tableName} 失败:`, error.message)
        jsonBackup.tables[tableName] = {
          error: error.message,
          row_count: 0,
          data: []
        }
      }
    }

    sqlContent += `\nSET FOREIGN_KEY_CHECKS = 1;\n`
    sqlContent += `\n-- 备份完成: ${getBeijingTime()}\n`

    // 7. 写入JSON备份文件
    console.log('\n📝 步骤3: 写入JSON备份文件...')
    fs.writeFileSync(jsonBackupFile, JSON.stringify(jsonBackup, null, 2), 'utf8')
    console.log(`✅ JSON备份已保存: ${jsonBackupFile}`)

    // 8. 写入SQL备份文件
    console.log('\n📝 步骤4: 写入SQL备份文件...')
    fs.writeFileSync(sqlBackupFile, sqlContent, 'utf8')
    console.log(`✅ SQL备份已保存: ${sqlBackupFile}`)

    // 9. 生成MD5校验文件
    console.log('\n🔐 步骤5: 生成MD5校验文件...')
    const jsonMD5 = crypto.createHash('md5').update(fs.readFileSync(jsonBackupFile)).digest('hex')
    const sqlMD5 = crypto.createHash('md5').update(fs.readFileSync(sqlBackupFile)).digest('hex')

    const md5Content = `# 备份文件MD5校验 - ${getBeijingTime()}

## JSON备份
文件: ${path.basename(jsonBackupFile)}
MD5: ${jsonMD5}

## SQL备份
文件: ${path.basename(sqlBackupFile)}
MD5: ${sqlMD5}
`
    fs.writeFileSync(path.join(backupDir, 'BACKUP_MD5.txt'), md5Content, 'utf8')
    console.log(`✅ MD5校验文件已生成`)

    // 10. 生成备份摘要
    console.log('\n📊 步骤6: 生成备份摘要...')
    let totalRows = 0
    let emptyTables = 0
    let errorTables = 0

    const tableDetails = []
    for (const [tableName, tableInfo] of Object.entries(jsonBackup.tables)) {
      if (tableInfo.error) {
        errorTables++
        tableDetails.push(`❌ ${tableName}: 备份失败 - ${tableInfo.error}`)
      } else {
        totalRows += tableInfo.row_count
        if (tableInfo.row_count === 0) {
          emptyTables++
          tableDetails.push(`⚪ ${tableName}: 0 行（空表）`)
        } else {
          tableDetails.push(`✅ ${tableName}: ${tableInfo.row_count} 行`)
        }
      }
    }

    const summaryContent = `# 数据库备份摘要报告
## 备份信息
- 备份日期: ${backupDate}
- 备份时间: ${getBeijingTime()}
- 数据库: ${process.env.DB_NAME}
- 主机: ${process.env.DB_HOST}:${process.env.DB_PORT}

## 备份统计
- 总表数: ${tables.length}
- 总行数: ${totalRows}
- 空表数: ${emptyTables}
- 错误表数: ${errorTables}

## 备份文件
- JSON备份: ${path.basename(jsonBackupFile)} (${(fs.statSync(jsonBackupFile).size / 1024 / 1024).toFixed(2)} MB)
- SQL备份: ${path.basename(sqlBackupFile)} (${(fs.statSync(sqlBackupFile).size / 1024 / 1024).toFixed(2)} MB)
- MD5校验: BACKUP_MD5.txt

## 表详情
${tableDetails.join('\n')}

## 备份完成
✅ 备份已成功完成于 ${getBeijingTime()}
`

    fs.writeFileSync(path.join(backupDir, 'BACKUP_SUMMARY.txt'), summaryContent, 'utf8')
    console.log(`✅ 备份摘要已生成`)

    // 11. 生成README文件
    const readmeContent = `# 数据库完整备份 - ${backupDate}

## 备份时间
${getBeijingTime()}

## 备份内容
本备份包含以下内容：

1. **SQL格式备份** (\`${path.basename(sqlBackupFile)}\`)
   - 完整的CREATE TABLE语句
   - 所有表的INSERT语句
   - 索引和外键定义
   - 可直接用于数据库恢复

2. **JSON格式备份** (\`${path.basename(jsonBackupFile)}\`)
   - 结构化的表数据
   - 包含表结构、数据、索引、外键信息
   - 便于程序化处理和分析

3. **MD5校验文件** (\`BACKUP_MD5.txt\`)
   - 备份文件的MD5哈希值
   - 用于验证备份完整性

4. **备份摘要** (\`BACKUP_SUMMARY.txt\`)
   - 备份统计信息
   - 每个表的行数
   - 空表和错误表列表

## 数据库信息
- 数据库名: ${process.env.DB_NAME}
- 主机: ${process.env.DB_HOST}
- 端口: ${process.env.DB_PORT}
- 表数量: ${tables.length}
- 总行数: ${totalRows}

## 恢复方法

### 使用SQL文件恢复
\`\`\`bash
mysql -h ${process.env.DB_HOST} -P ${process.env.DB_PORT} -u ${process.env.DB_USER} -p < ${path.basename(sqlBackupFile)}
\`\`\`

### 验证备份完整性
\`\`\`bash
md5sum -c BACKUP_MD5.txt
\`\`\`

## 备份特点
- ✅ 包含所有表结构（CREATE TABLE）
- ✅ 包含所有表数据（INSERT）
- ✅ 包含所有索引定义
- ✅ 包含所有外键约束
- ✅ 包含空表结构
- ✅ 使用UTF-8编码
- ✅ 北京时间时区（+08:00）

## 注意事项
- 备份文件使用UTF-8编码
- 时间字段使用北京时间（GMT+8）
- 恢复前请确保目标数据库字符集为utf8mb4
- 建议在恢复前先备份现有数据库
`

    fs.writeFileSync(path.join(backupDir, 'README.md'), readmeContent, 'utf8')
    console.log(`✅ README文件已生成`)

    // 12. 最终报告
    console.log('\n' + '='.repeat(60))
    console.log('🎉 数据库备份完成！')
    console.log('='.repeat(60))
    console.log(`📁 备份目录: ${backupDir}`)
    console.log(`📊 总表数: ${tables.length}`)
    console.log(`📈 总行数: ${totalRows}`)
    console.log(`⚪ 空表数: ${emptyTables}`)
    if (errorTables > 0) {
      console.log(`❌ 错误表数: ${errorTables}`)
    }
    console.log(`📝 备份文件:`)
    console.log(
      `   - ${path.basename(jsonBackupFile)} (${(fs.statSync(jsonBackupFile).size / 1024 / 1024).toFixed(2)} MB)`
    )
    console.log(
      `   - ${path.basename(sqlBackupFile)} (${(fs.statSync(sqlBackupFile).size / 1024 / 1024).toFixed(2)} MB)`
    )
    console.log(`🔐 MD5校验: BACKUP_MD5.txt`)
    console.log(`📋 备份摘要: BACKUP_SUMMARY.txt`)
    console.log(`📖 说明文档: README.md`)
    console.log(`⏰ 完成时间: ${getBeijingTime()}`)
    console.log('='.repeat(60))

    return {
      success: true,
      backupDir,
      tableCount: tables.length,
      totalRows,
      emptyTables,
      errorTables,
      files: {
        json: jsonBackupFile,
        sql: sqlBackupFile
      }
    }
  } catch (error) {
    console.error('\n❌ 备份过程中发生错误:', error)
    throw error
  } finally {
    await sequelize.close()
    console.log('\n✅ 数据库连接已关闭')
  }
}

// 执行备份
performBackup()
  .then(result => {
    console.log('\n✅ 备份脚本执行成功')
    process.exit(0)
  })
  .catch(error => {
    console.error('\n❌ 备份脚本执行失败:', error)
    process.exit(1)
  })
