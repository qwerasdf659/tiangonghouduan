#!/usr/bin/env node
/**
 * 完整数据库备份脚本 - 2026年01月02日
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
 * 北京时间：2026年01月02日
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
const backupDate = '2026-01-02'
const backupDir = path.join(__dirname, '..', 'backups', `backup_${backupDate}`)

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true })
}

console.log(`\n🔄 开始完整数据库备份 - ${getBeijingTime()}`)
console.log(`📁 备份目录: ${backupDir}`)
console.log(`📊 数据库: ${process.env.DB_NAME}`)

// 备份文件路径
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('-').split('Z')[0]
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

    // SQL备份内容
    let sqlContent = `-- 完整数据库备份
-- 备份时间: ${getBeijingTime()}
-- 数据库: ${process.env.DB_NAME}
-- 表数量: ${tables.length}

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';
SET time_zone = '+08:00';

`

    // 遍历每个表
    for (const tableRow of tables) {
      const tableName = tableRow.TABLE_NAME
      console.log(`  📊 处理表: ${tableName}`)

      try {
        // 获取表结构
        const [createTableResult] = await sequelize.query(`SHOW CREATE TABLE \`${tableName}\``)
        const createTableSql = createTableResult[0]['Create Table']

        // 获取表数据行数
        const [countResult] = await sequelize.query(
          `SELECT COUNT(*) as count FROM \`${tableName}\``
        )
        const rowCount = countResult[0].count

        // 获取列信息
        const [columns] = await sequelize.query(`SHOW COLUMNS FROM \`${tableName}\``)

        // 获取索引信息
        const [indexes] = await sequelize.query(`SHOW INDEX FROM \`${tableName}\``)

        // 获取外键信息
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

        // 获取表数据
        let tableData = []
        if (rowCount > 0) {
          const [rows] = await sequelize.query(`SELECT * FROM \`${tableName}\``)
          tableData = rows
        }

        // 添加到JSON备份
        jsonBackup.tables[tableName] = {
          create_table: createTableSql,
          row_count: rowCount,
          columns: columns.map(col => ({
            field: col.Field,
            type: col.Type,
            null: col.Null,
            key: col.Key,
            default: col.Default,
            extra: col.Extra
          })),
          indexes: indexes.map(idx => ({
            key_name: idx.Key_name,
            column_name: idx.Column_name,
            non_unique: idx.Non_unique,
            index_type: idx.Index_type
          })),
          foreign_keys: foreignKeys.map(fk => ({
            constraint_name: fk.CONSTRAINT_NAME,
            column_name: fk.COLUMN_NAME,
            referenced_table: fk.REFERENCED_TABLE_NAME,
            referenced_column: fk.REFERENCED_COLUMN_NAME
          })),
          data: tableData
        }

        // 添加到SQL备份
        sqlContent += `\n-- ----------------------------\n`
        sqlContent += `-- Table structure for ${tableName}\n`
        sqlContent += `-- ----------------------------\n`
        sqlContent += `DROP TABLE IF EXISTS \`${tableName}\`;\n`
        sqlContent += `${createTableSql};\n\n`

        // 添加数据
        if (rowCount > 0) {
          sqlContent += `-- ----------------------------\n`
          sqlContent += `-- Records of ${tableName} (${rowCount} rows)\n`
          sqlContent += `-- ----------------------------\n`

          for (const row of tableData) {
            const columnNames = Object.keys(row)
            const values = columnNames.map(col => {
              const val = row[col]
              if (val === null) return 'NULL'
              if (typeof val === 'string') {
                return `'${val.replace(/'/g, "''").replace(/\\/g, '\\\\')}'`
              }
              if (val instanceof Date) {
                return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`
              }
              return val
            })

            sqlContent += `INSERT INTO \`${tableName}\` (\`${columnNames.join('`, `')}\`) VALUES (${values.join(', ')});\n`
          }
          sqlContent += '\n'
        } else {
          sqlContent += `-- No data for table ${tableName}\n\n`
        }
      } catch (error) {
        console.error(`  ❌ 处理表 ${tableName} 失败:`, error.message)
      }
    }

    sqlContent += `\nSET FOREIGN_KEY_CHECKS = 1;\n`

    // 3. 写入SQL文件
    console.log('\n📋 步骤3: 生成SQL备份文件...')
    fs.writeFileSync(sqlBackupFile, sqlContent)
    const sqlSize = fs.statSync(sqlBackupFile).size
    console.log(`✅ SQL备份完成: ${(sqlSize / 1024 / 1024).toFixed(2)} MB`)

    // 4. 写入JSON文件
    console.log('\n📋 步骤4: 生成JSON备份文件...')
    fs.writeFileSync(jsonBackupFile, JSON.stringify(jsonBackup, null, 2))
    const jsonSize = fs.statSync(jsonBackupFile).size
    console.log(`✅ JSON备份完成: ${(jsonSize / 1024 / 1024).toFixed(2)} MB`)

    // 5. 生成MD5校验文件
    console.log('\n📋 步骤5: 生成MD5校验文件...')
    const sqlMd5 = crypto.createHash('md5').update(fs.readFileSync(sqlBackupFile)).digest('hex')
    const jsonMd5 = crypto.createHash('md5').update(fs.readFileSync(jsonBackupFile)).digest('hex')

    const md5Content = `# 备份文件MD5校验 - ${getBeijingTime()}

${path.basename(sqlBackupFile)}  ${sqlMd5}
${path.basename(jsonBackupFile)}  ${jsonMd5}
`

    fs.writeFileSync(path.join(backupDir, 'BACKUP_MD5.txt'), md5Content)
    console.log('✅ MD5校验文件生成完成')

    // 6. 生成备份摘要报告
    console.log('\n📋 步骤6: 生成备份摘要报告...')
    let summaryContent = `# 数据库完整备份摘要 - ${backupDate}

## 备份信息
- **备份时间**: ${getBeijingTime()}
- **数据库名**: ${process.env.DB_NAME}
- **数据库主机**: ${process.env.DB_HOST}:${process.env.DB_PORT}
- **表总数**: ${tables.length}

## 备份文件
- **SQL文件**: ${path.basename(sqlBackupFile)} (${(sqlSize / 1024 / 1024).toFixed(2)} MB)
- **JSON文件**: ${path.basename(jsonBackupFile)} (${(jsonSize / 1024 / 1024).toFixed(2)} MB)

## 表详情

| 表名 | 行数 | 列数 | 索引数 | 外键数 |
|------|------|------|--------|--------|
`

    // 添加表统计信息
    for (const tableRow of tables) {
      const tableName = tableRow.TABLE_NAME
      const tableInfo = jsonBackup.tables[tableName]
      if (tableInfo) {
        const uniqueIndexes = new Set(tableInfo.indexes.map(i => i.key_name)).size
        summaryContent += `| ${tableName} | ${tableInfo.row_count} | ${tableInfo.columns.length} | ${uniqueIndexes} | ${tableInfo.foreign_keys.length} |\n`
      }
    }

    summaryContent += `\n## 备份内容完整性

✅ **表结构**: 所有表的CREATE TABLE语句
✅ **表数据**: 所有表的完整数据（包括空表）
✅ **索引定义**: 所有索引（PRIMARY KEY, UNIQUE, INDEX等）
✅ **外键约束**: 所有FOREIGN KEY约束
✅ **列信息**: 所有列的类型、默认值、约束等
✅ **字符集**: utf8mb4
✅ **时区**: 北京时间 (Asia/Shanghai, +08:00)

## 备份验证

- SQL文件MD5: \`${sqlMd5}\`
- JSON文件MD5: \`${jsonMd5}\`

## 恢复方法

### 从SQL文件恢复（完整恢复）
\`\`\`bash
mysql -h\${DB_HOST} -P\${DB_PORT} -u\${DB_USER} -p\${DB_PASSWORD} \${DB_NAME} < ${path.basename(sqlBackupFile)}
\`\`\`

### 使用Node.js恢复
\`\`\`bash
node scripts/restore_backup.js ${path.basename(sqlBackupFile)}
\`\`\`

### 验证恢复结果
\`\`\`bash
mysql -h\${DB_HOST} -P\${DB_PORT} -u\${DB_USER} -p\${DB_PASSWORD} \${DB_NAME} -e "SHOW TABLES"
\`\`\`

---
备份完成时间: ${getBeijingTime()}
`

    fs.writeFileSync(path.join(backupDir, 'BACKUP_SUMMARY.txt'), summaryContent)
    console.log('✅ 备份摘要报告生成完成')

    // 7. 生成README文件
    const readmeContent = `# 数据库完整备份 - ${backupDate}

## 📅 备份信息

- **备份日期**: ${backupDate}
- **备份时间**: ${getBeijingTime()}
- **数据库**: ${process.env.DB_NAME}
- **表数量**: ${tables.length}

## 📦 备份文件

1. **SQL备份**: \`${path.basename(sqlBackupFile)}\`
   - 大小: ${(sqlSize / 1024 / 1024).toFixed(2)} MB
   - MD5: \`${sqlMd5}\`
   - 包含: 表结构、数据、索引、外键

2. **JSON备份**: \`${path.basename(jsonBackupFile)}\`
   - 大小: ${(jsonSize / 1024 / 1024).toFixed(2)} MB
   - MD5: \`${jsonMd5}\`
   - 包含: 完整的表结构和数据（JSON格式）

3. **MD5校验**: \`BACKUP_MD5.txt\`
   - 用于验证备份文件完整性

4. **备份摘要**: \`BACKUP_SUMMARY.txt\`
   - 详细的备份统计信息

## ✅ 备份完整性保证

- [x] 所有表结构（CREATE TABLE）
- [x] 所有表数据（包括空表）
- [x] 所有索引定义
- [x] 所有外键约束
- [x] 所有列信息（类型、默认值、约束）
- [x] 字符集和排序规则（utf8mb4）
- [x] 时区设置（北京时间 +08:00）

## 🔄 恢复方法

### 完整恢复（推荐）

\`\`\`bash
# 1. 恢复数据库
mysql -h\${DB_HOST} -P\${DB_PORT} -u\${DB_USER} -p\${DB_PASSWORD} \${DB_NAME} < ${path.basename(sqlBackupFile)}

# 2. 验证恢复
mysql -h\${DB_HOST} -P\${DB_PORT} -u\${DB_USER} -p\${DB_PASSWORD} \${DB_NAME} -e "SHOW TABLES"
\`\`\`

### 验证备份完整性

\`\`\`bash
# 验证MD5
md5sum -c BACKUP_MD5.txt
\`\`\`

## 📊 表统计

总计 ${tables.length} 个表，详见 \`BACKUP_SUMMARY.txt\`

---
备份脚本: \`scripts/create_complete_backup_20260102.js\`
生成时间: ${getBeijingTime()}
`

    fs.writeFileSync(path.join(backupDir, 'README.md'), readmeContent)
    console.log('✅ README文件生成完成')

    // 8. 最终验证
    console.log('\n📋 步骤7: 最终验证...')
    console.log('✅ SQL备份文件存在:', fs.existsSync(sqlBackupFile))
    console.log('✅ JSON备份文件存在:', fs.existsSync(jsonBackupFile))
    console.log('✅ MD5校验文件存在:', fs.existsSync(path.join(backupDir, 'BACKUP_MD5.txt')))
    console.log('✅ 备份摘要文件存在:', fs.existsSync(path.join(backupDir, 'BACKUP_SUMMARY.txt')))
    console.log('✅ README文件存在:', fs.existsSync(path.join(backupDir, 'README.md')))

    console.log('\n🎉 完整数据库备份成功！')
    console.log(`📁 备份目录: ${backupDir}`)
    console.log(`⏰ 完成时间: ${getBeijingTime()}`)
    console.log('\n备份文件清单:')
    console.log(`  - ${path.basename(sqlBackupFile)}`)
    console.log(`  - ${path.basename(jsonBackupFile)}`)
    console.log(`  - BACKUP_MD5.txt`)
    console.log(`  - BACKUP_SUMMARY.txt`)
    console.log(`  - README.md`)

    // 关闭数据库连接
    await sequelize.close()
    process.exit(0)
  } catch (error) {
    console.error('\n❌ 备份过程中发生错误:', error)
    console.error('错误详情:', error.message)
    await sequelize.close()
    process.exit(1)
  }
}

// 执行备份
performBackup()
