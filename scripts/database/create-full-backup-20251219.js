/**
 * 2025年12月19日完整数据库备份脚本
 *
 * 功能：
 * - 备份所有44个表（包括空表）
 * - 包含表结构、索引、外键约束、数据
 * - 生成SQL和JSON双格式备份
 * - 创建日期文件夹结构
 * - 生成MD5校验和
 * - 生成完整的备份报告
 *
 * 创建时间：2025年12月19日 北京时间
 */

'use strict'

const fs = require('fs').promises
const fsSync = require('fs')
const path = require('path')
const crypto = require('crypto')
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

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

/**
 * 计算文件MD5
 */
function calculateMD5(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5')
    const stream = fsSync.createReadStream(filePath)

    stream.on('data', data => hash.update(data))
    stream.on('end', () => resolve(hash.digest('hex')))
    stream.on('error', reject)
  })
}

/**
 * 生成INSERT语句
 */
function generateInsertStatements(tableName, rows) {
  if (rows.length === 0) return ''

  const statements = []
  for (const row of rows) {
    const columns = Object.keys(row)
    const values = columns.map(col => {
      const value = row[col]
      if (value === null) return 'NULL'
      if (typeof value === 'number') return value
      if (typeof value === 'boolean') return value ? 1 : 0
      if (value instanceof Date) {
        const dateStr = value.toISOString().slice(0, 19).replace('T', ' ')
        return `'${dateStr}'`
      }
      // 字符串需要转义
      const escaped = String(value)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
      return `'${escaped}'`
    })

    statements.push(
      `INSERT INTO \`${tableName}\` (\`${columns.join('`, `')}\`) VALUES (${values.join(', ')});`
    )
  }

  return statements.join('\n')
}

/**
 * 主备份函数
 */
async function createFullBackup() {
  const startTime = Date.now()

  log('\n╔═══════════════════════════════════════════════════════════════════╗', 'cyan')
  log('║         2025年12月19日 - 完整数据库备份                          ║', 'cyan')
  log('╚═══════════════════════════════════════════════════════════════════╝', 'cyan')

  const backupTime = BeijingTimeHelper.nowLocale()
  log(`\n🕐 备份时间: ${backupTime}`, 'blue')

  try {
    // 连接数据库
    log('\n🔌 正在连接数据库...', 'blue')
    await sequelize.authenticate()
    log('✅ 数据库连接成功', 'green')

    // 获取数据库信息
    const [versionResult] = await sequelize.query('SELECT VERSION() as version')
    const dbVersion = versionResult[0].version

    const [charsetResult] = await sequelize.query(
      'SELECT @@character_set_database as charset, @@collation_database as collation'
    )
    const dbCharset = charsetResult[0].charset
    const dbCollation = charsetResult[0].collation

    log(`\n📊 数据库信息:`, 'blue')
    log(`   名称: ${process.env.DB_NAME}`, 'cyan')
    log(`   主机: ${process.env.DB_HOST}:${process.env.DB_PORT}`, 'cyan')
    log(`   版本: ${dbVersion}`, 'cyan')
    log(`   字符集: ${dbCharset} / ${dbCollation}`, 'cyan')

    // 获取所有表
    const [tables] = await sequelize.query(`
      SELECT 
        TABLE_NAME, 
        TABLE_ROWS, 
        DATA_LENGTH,
        INDEX_LENGTH,
        ENGINE, 
        TABLE_COLLATION,
        CREATE_TIME,
        UPDATE_TIME,
        TABLE_COMMENT
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = '${process.env.DB_NAME}'
      ORDER BY TABLE_NAME
    `)

    log(`\n📊 发现 ${tables.length} 个表`, 'green')

    // 创建日期备份文件夹
    const backupDir = path.join(__dirname, '..', '..', 'backups', 'backup_2025-12-19')
    await fs.mkdir(backupDir, { recursive: true })
    log(`\n📁 备份目录: ${backupDir}`, 'blue')

    // 生成文件名
    const timestamp = BeijingTimeHelper.now().replace(/[:.]/g, '-').replace('T', '_').slice(0, -5)

    const sqlFile = path.join(backupDir, `full_backup_2025-12-19_${timestamp}.sql`)
    const jsonFile = path.join(backupDir, `full_backup_2025-12-19_${timestamp}.json`)
    const md5File = path.join(backupDir, 'BACKUP_MD5_2025-12-19.txt')
    const readmeFile = path.join(backupDir, 'README.md')

    // 开始备份 - SQL格式
    log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan')
    log('📝 开始生成SQL备份...', 'cyan')
    log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan')

    let sqlContent = `-- ==========================================
-- 完整数据库备份 - 2025年12月19日
-- ==========================================
-- 数据库: ${process.env.DB_NAME}
-- 主机: ${process.env.DB_HOST}:${process.env.DB_PORT}
-- MySQL版本: ${dbVersion}
-- 字符集: ${dbCharset} / ${dbCollation}
-- 备份时间: ${backupTime}
-- 备份工具: create-full-backup-20251219.js
-- 总表数: ${tables.length}
-- ==========================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';
SET time_zone = '+08:00';

`

    // JSON备份数据结构
    const jsonBackup = {
      metadata: {
        backup_date: '2025-12-19',
        database: process.env.DB_NAME,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        mysql_version: dbVersion,
        charset: dbCharset,
        collation: dbCollation,
        backup_time: BeijingTimeHelper.now(),
        backup_time_locale: backupTime,
        backup_tool: 'create-full-backup-20251219.js',
        total_tables: tables.length,
        timezone: '+08:00'
      },
      tables: {}
    }

    let totalRows = 0
    let successCount = 0
    const failedTables = []
    const tableStats = []

    // 备份每个表
    for (let i = 0; i < tables.length; i++) {
      const tableInfo = tables[i]
      const tableName = tableInfo.TABLE_NAME

      process.stdout.write(
        `\n[${(i + 1).toString().padStart(2)}/${tables.length}] 备份表: ${tableName.padEnd(40)}`
      )

      try {
        // 1. 获取表结构
        const [createTableResult] = await sequelize.query(`SHOW CREATE TABLE \`${tableName}\``)
        const createTable = createTableResult[0]['Create Table']

        // 2. 获取表的列信息
        const [columns] = await sequelize.query(`SHOW FULL COLUMNS FROM \`${tableName}\``)

        // 3. 获取表的索引信息
        const [indexes] = await sequelize.query(`SHOW INDEX FROM \`${tableName}\``)

        // 4. 获取外键约束信息
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

        // 5. 获取表数据
        const [rows] = await sequelize.query(`SELECT * FROM \`${tableName}\``)
        const rowCount = rows.length
        totalRows += rowCount

        process.stdout.write(` ${rowCount.toString().padStart(5)}行 ✅`)

        // SQL备份
        sqlContent += `
-- ==========================================
-- Table: ${tableName}
-- ==========================================
-- 记录数: ${rowCount}
-- 引擎: ${tableInfo.ENGINE}
-- 字符集: ${tableInfo.TABLE_COLLATION}
-- 创建时间: ${tableInfo.CREATE_TIME || 'N/A'}
-- 更新时间: ${tableInfo.UPDATE_TIME || 'N/A'}
-- 注释: ${tableInfo.TABLE_COMMENT || ''}
-- ==========================================

DROP TABLE IF EXISTS \`${tableName}\`;
${createTable};

`

        if (rowCount > 0) {
          const insertStatements = generateInsertStatements(tableName, rows)
          sqlContent += `-- Records of ${tableName}
${insertStatements}

`
        } else {
          sqlContent += `-- No records in ${tableName}

`
        }

        // JSON备份
        jsonBackup.tables[tableName] = {
          structure: {
            create_table: createTable,
            columns: columns,
            indexes: indexes,
            foreign_keys: foreignKeys,
            engine: tableInfo.ENGINE,
            collation: tableInfo.TABLE_COLLATION,
            create_time: tableInfo.CREATE_TIME,
            update_time: tableInfo.UPDATE_TIME,
            table_comment: tableInfo.TABLE_COMMENT
          },
          data: rows,
          stats: {
            row_count: rowCount,
            data_length: tableInfo.DATA_LENGTH,
            index_length: tableInfo.INDEX_LENGTH
          }
        }

        // 统计信息
        tableStats.push({
          name: tableName,
          rows: rowCount,
          data_mb: (tableInfo.DATA_LENGTH / 1024 / 1024).toFixed(2),
          index_mb: (tableInfo.INDEX_LENGTH / 1024 / 1024).toFixed(2),
          engine: tableInfo.ENGINE
        })

        successCount++
      } catch (error) {
        process.stdout.write(` ❌ 失败`)
        log(`\n      错误: ${error.message}`, 'red')

        failedTables.push({
          table: tableName,
          error: error.message,
          stack: error.stack
        })

        // 即使失败也记录到JSON
        jsonBackup.tables[tableName] = {
          error: error.message,
          success: false
        }
      }
    }

    sqlContent += `
SET FOREIGN_KEY_CHECKS = 1;

-- ==========================================
-- 备份完成统计 - 2025年12月19日
-- ==========================================
-- 成功表数: ${successCount}/${tables.length}
-- 总记录数: ${totalRows}
-- 备份完成时间: ${BeijingTimeHelper.nowLocale()}
-- ==========================================
`

    // 添加备份统计到JSON
    jsonBackup.summary = {
      total_tables: tables.length,
      success_tables: successCount,
      failed_tables: failedTables.length,
      total_rows: totalRows,
      failed_table_list: failedTables,
      backup_duration_ms: Date.now() - startTime,
      table_stats: tableStats
    }

    // 写入文件
    log('\n\n💾 正在写入备份文件...', 'blue')
    await fs.writeFile(sqlFile, sqlContent, 'utf8')
    log(`   ✅ SQL文件已保存`, 'green')

    await fs.writeFile(jsonFile, JSON.stringify(jsonBackup, null, 2), 'utf8')
    log(`   ✅ JSON文件已保存`, 'green')

    // 计算MD5
    log('\n🔐 正在计算MD5校验和...', 'blue')
    const sqlMD5 = await calculateMD5(sqlFile)
    const jsonMD5 = await calculateMD5(jsonFile)

    const md5Content = `2025年12月19日数据库备份 - MD5校验和
生成时间: ${BeijingTimeHelper.nowLocale()}

${path.basename(sqlFile)}
MD5: ${sqlMD5}

${path.basename(jsonFile)}
MD5: ${jsonMD5}
`

    await fs.writeFile(md5File, md5Content, 'utf8')
    log(`   ✅ MD5文件已保存`, 'green')

    // 获取文件大小
    const sqlSize = (await fs.stat(sqlFile)).size
    const jsonSize = (await fs.stat(jsonFile)).size

    // 生成README
    const readmeContent = `# 2025年12月19日数据库完整备份

## 备份信息

- **备份时间**: ${backupTime}
- **数据库**: ${process.env.DB_NAME}
- **MySQL版本**: ${dbVersion}
- **总表数**: ${tables.length}
- **成功备份**: ${successCount}个表
- **总记录数**: ${totalRows}行
- **耗时**: ${((Date.now() - startTime) / 1000).toFixed(2)}秒

## 备份文件

### SQL备份
- **文件**: \`${path.basename(sqlFile)}\`
- **大小**: ${(sqlSize / 1024 / 1024).toFixed(2)} MB
- **MD5**: \`${sqlMD5}\`
- **格式**: 标准SQL，包含表结构、索引、外键约束和数据

### JSON备份
- **文件**: \`${path.basename(jsonFile)}\`
- **大小**: ${(jsonSize / 1024 / 1024).toFixed(2)} MB
- **MD5**: \`${jsonMD5}\`
- **格式**: JSON，包含完整的元数据和结构化数据

## 表统计

| # | 表名 | 记录数 | 数据大小 | 索引大小 | 引擎 |
|---|------|--------|----------|----------|------|
${tableStats.map((t, i) => `| ${i + 1} | ${t.name} | ${t.rows} | ${t.data_mb}MB | ${t.index_mb}MB | ${t.engine} |`).join('\n')}

## 备份完整性

${failedTables.length === 0 ? '✅ **所有表备份成功，备份完整**' : `⚠️ **${failedTables.length}个表备份失败**\n\n${failedTables.map(f => `- ${f.table}: ${f.error}`).join('\n')}`}

## 使用说明

### 恢复SQL备份
\`\`\`bash
mysql -h${process.env.DB_HOST} -P${process.env.DB_PORT} -u${process.env.DB_USER} -p ${process.env.DB_NAME} < ${path.basename(sqlFile)}
\`\`\`

### 恢复JSON备份
\`\`\`bash
node scripts/database/backup-toolkit.js --action=restore --file=backups/backup_2025-12-19/${path.basename(jsonFile)}
\`\`\`

## 校验完整性

备份完成后请验证MD5：
\`\`\`bash
md5sum ${path.basename(sqlFile)}
md5sum ${path.basename(jsonFile)}
\`\`\`

## 备份特点

1. ✅ **完整性**: 包含所有44个表（包括空表）
2. ✅ **结构完整**: 包含表结构、索引、外键约束
3. ✅ **数据完整**: 包含所有${totalRows}行数据记录
4. ✅ **双格式**: SQL和JSON双格式，方便不同场景使用
5. ✅ **校验和**: MD5校验确保数据完整性
6. ✅ **版本兼容**: 记录MySQL版本和字符集信息

---

**生成工具**: create-full-backup-20251219.js  
**生成时间**: ${backupTime}  
**备份质量**: ${successCount === tables.length ? '✅ 完整备份' : '⚠️ 部分失败'}
`

    await fs.writeFile(readmeFile, readmeContent, 'utf8')
    log(`   ✅ README文件已保存`, 'green')

    // 输出最终报告
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    log('\n╔═══════════════════════════════════════════════════════════════════╗', 'green')
    log('║                    ✅ 备份完成                                    ║', 'green')
    log('╚═══════════════════════════════════════════════════════════════════╝', 'green')

    log(`\n📊 备份统计:`, 'blue')
    log(`   📁 备份目录: ${backupDir}`, 'cyan')
    log(`   📊 数据库: ${process.env.DB_NAME}`, 'cyan')
    log(`   📊 总表数: ${tables.length}`, 'cyan')
    log(`   ✅ 成功: ${successCount}个表`, 'green')
    log(`   📊 总记录数: ${totalRows}行`, 'cyan')
    log(`   ⏱️ 耗时: ${duration}秒`, 'cyan')

    log(`\n📁 生成的文件:`, 'blue')
    log(
      `   1️⃣ SQL备份: ${path.basename(sqlFile)} (${(sqlSize / 1024 / 1024).toFixed(2)} MB)`,
      'cyan'
    )
    log(
      `   2️⃣ JSON备份: ${path.basename(jsonFile)} (${(jsonSize / 1024 / 1024).toFixed(2)} MB)`,
      'cyan'
    )
    log(`   3️⃣ MD5校验: BACKUP_MD5_2025-12-19.txt`, 'cyan')
    log(`   4️⃣ 说明文档: README.md`, 'cyan')

    if (failedTables.length > 0) {
      log(`\n⚠️ 以下${failedTables.length}个表备份失败:`, 'yellow')
      failedTables.forEach(item => {
        log(`   ❌ ${item.table}: ${item.error}`, 'yellow')
      })
    }

    log(`\n✨ 备份已完整保存到: ${backupDir}`, 'green')
    log(`\n`, 'reset')

    await sequelize.close()
    process.exit(0)
  } catch (error) {
    log(`\n❌ 备份失败: ${error.message}`, 'red')
    console.error(error.stack)
    process.exit(1)
  }
}

// 执行备份
createFullBackup()
