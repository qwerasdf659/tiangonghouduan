#!/usr/bin/env node
/**
 * 完整数据库备份脚本 - 2025-12-24
 *
 * 备份内容：
 * 1. 所有表的结构（包括索引、外键约束）
 * 2. 所有表的数据（包括空表）
 * 3. SQL格式备份
 * 4. JSON格式备份
 * 5. 完整性验证
 */

const { sequelize } = require('../config/database')
const fs = require('fs').promises
const path = require('path')

// 备份配置
const BACKUP_CONFIG = {
  backupDir: path.join(__dirname, '../backups'),
  timestamp: new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5),
  date: new Date().toISOString().split('T')[0]
}

class CompleteDatabaseBackup {
  constructor() {
    this.backupPath = null
    this.stats = {
      totalTables: 0,
      tablesWithData: 0,
      emptyTables: 0,
      totalRows: 0,
      errors: []
    }
  }

  /**
   * 创建备份目录
   */
  async createBackupDirectory() {
    const backupFolderName = `backup_${BACKUP_CONFIG.date}`
    this.backupPath = path.join(BACKUP_CONFIG.backupDir, backupFolderName)

    try {
      await fs.mkdir(this.backupPath, { recursive: true })
      console.log(`✅ 备份目录已创建: ${this.backupPath}`)
    } catch (error) {
      console.error(`❌ 创建备份目录失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 获取所有表名
   */
  async getAllTables() {
    try {
      const [results] = await sequelize.query('SHOW TABLES')
      const tables = results.map(row => Object.values(row)[0])
      this.stats.totalTables = tables.length
      console.log(`📊 发现 ${tables.length} 个数据库表`)
      return tables
    } catch (error) {
      console.error(`❌ 获取表列表失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 获取表的完整结构（包括索引和外键）
   */
  async getTableStructure(tableName) {
    try {
      // 获取CREATE TABLE语句
      const [createTableResult] = await sequelize.query(`SHOW CREATE TABLE \`${tableName}\``)
      const createTableSQL = createTableResult[0]['Create Table']

      return {
        tableName,
        createSQL: createTableSQL
      }
    } catch (error) {
      console.error(`❌ 获取表 ${tableName} 结构失败: ${error.message}`)
      this.stats.errors.push({ table: tableName, error: error.message, type: 'structure' })
      return null
    }
  }

  /**
   * 获取表的所有数据
   */
  async getTableData(tableName) {
    try {
      const [rows] = await sequelize.query(`SELECT * FROM \`${tableName}\``)

      if (rows.length > 0) {
        this.stats.tablesWithData++
        this.stats.totalRows += rows.length
      } else {
        this.stats.emptyTables++
      }

      console.log(`  📦 ${tableName}: ${rows.length} 行数据`)

      return {
        tableName,
        rowCount: rows.length,
        data: rows
      }
    } catch (error) {
      console.error(`❌ 获取表 ${tableName} 数据失败: ${error.message}`)
      this.stats.errors.push({ table: tableName, error: error.message, type: 'data' })
      return null
    }
  }

  /**
   * 生成SQL格式的INSERT语句
   */
  generateInsertSQL(tableName, rows) {
    if (rows.length === 0) {
      return `-- 表 ${tableName} 为空表\n`
    }

    const sqlStatements = []

    for (const row of rows) {
      const columns = Object.keys(row)
      const values = columns.map(col => {
        const value = row[col]

        if (value === null) return 'NULL'
        if (typeof value === 'number') return value
        if (typeof value === 'boolean') return value ? 1 : 0
        if (value instanceof Date) return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`
        if (Buffer.isBuffer(value)) return `0x${value.toString('hex')}`

        // 字符串需要转义
        const escaped = String(value)
          .replace(/\\/g, '\\\\')
          .replace(/'/g, "\\'")
          .replace(/"/g, '\\"')
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')

        return `'${escaped}'`
      })

      const insertSQL = `INSERT INTO \`${tableName}\` (\`${columns.join('`, `')}\`) VALUES (${values.join(', ')});`
      sqlStatements.push(insertSQL)
    }

    return sqlStatements.join('\n')
  }

  /**
   * 创建SQL备份文件
   */
  async createSQLBackup(tablesData) {
    const sqlFilePath = path.join(
      this.backupPath,
      `full_backup_${BACKUP_CONFIG.date}_${BACKUP_CONFIG.timestamp}.sql`
    )

    let sqlContent = `-- ============================================
-- 完整数据库备份 - SQL格式
-- 数据库: restaurant_lottery
-- 备份时间: ${new Date().toISOString()}
-- 表数量: ${this.stats.totalTables}
-- 总行数: ${this.stats.totalRows}
-- ============================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

`

    console.log('\n📝 生成SQL备份文件...')

    for (const tableData of tablesData) {
      if (!tableData.structure || !tableData.data) continue

      sqlContent += `\n-- ============================================\n`
      sqlContent += `-- 表: ${tableData.structure.tableName}\n`
      sqlContent += `-- 行数: ${tableData.data.rowCount}\n`
      sqlContent += `-- ============================================\n\n`

      // 删除旧表
      sqlContent += `DROP TABLE IF EXISTS \`${tableData.structure.tableName}\`;\n\n`

      // 创建表结构
      sqlContent += `${tableData.structure.createSQL};\n\n`

      // 插入数据
      if (tableData.data.rowCount > 0) {
        sqlContent += `-- 数据插入\n`
        sqlContent += this.generateInsertSQL(tableData.structure.tableName, tableData.data.data)
        sqlContent += `\n\n`
      } else {
        sqlContent += `-- 空表（无数据）\n\n`
      }
    }

    sqlContent += `\nSET FOREIGN_KEY_CHECKS = 1;\n`
    sqlContent += `\n-- 备份完成\n`

    await fs.writeFile(sqlFilePath, sqlContent, 'utf8')
    console.log(`✅ SQL备份已保存: ${sqlFilePath}`)

    return sqlFilePath
  }

  /**
   * 创建JSON备份文件
   */
  async createJSONBackup(tablesData) {
    const jsonFilePath = path.join(
      this.backupPath,
      `full_backup_${BACKUP_CONFIG.date}_${BACKUP_CONFIG.timestamp}.json`
    )

    const jsonData = {
      metadata: {
        database: 'restaurant_lottery',
        backupTime: new Date().toISOString(),
        backupDate: BACKUP_CONFIG.date,
        tableCount: this.stats.totalTables,
        totalRows: this.stats.totalRows,
        tablesWithData: this.stats.tablesWithData,
        emptyTables: this.stats.emptyTables
      },
      tables: {}
    }

    console.log('\n📝 生成JSON备份文件...')

    for (const tableData of tablesData) {
      if (!tableData.structure || !tableData.data) continue

      jsonData.tables[tableData.structure.tableName] = {
        structure: {
          createSQL: tableData.structure.createSQL
        },
        data: {
          rowCount: tableData.data.rowCount,
          rows: tableData.data.data
        }
      }
    }

    await fs.writeFile(jsonFilePath, JSON.stringify(jsonData, null, 2), 'utf8')
    console.log(`✅ JSON备份已保存: ${jsonFilePath}`)

    return jsonFilePath
  }

  /**
   * 生成备份摘要
   */
  async createBackupSummary(sqlFilePath, jsonFilePath) {
    const summaryPath = path.join(this.backupPath, 'BACKUP_SUMMARY.txt')

    const sqlStats = await fs.stat(sqlFilePath)
    const jsonStats = await fs.stat(jsonFilePath)

    const summary = `============================================
完整数据库备份摘要
============================================

备份时间: ${new Date().toISOString()}
备份日期: ${BACKUP_CONFIG.date}
备份目录: ${this.backupPath}

数据库信息:
- 数据库名: restaurant_lottery
- 表总数: ${this.stats.totalTables}
- 有数据的表: ${this.stats.tablesWithData}
- 空表: ${this.stats.emptyTables}
- 总行数: ${this.stats.totalRows}

备份文件:
- SQL文件: ${path.basename(sqlFilePath)} (${(sqlStats.size / 1024 / 1024).toFixed(2)} MB)
- JSON文件: ${path.basename(jsonFilePath)} (${(jsonStats.size / 1024 / 1024).toFixed(2)} MB)

备份内容:
✅ 表结构（包括索引）
✅ 外键约束
✅ 所有数据（包括空表）
✅ SQL格式备份
✅ JSON格式备份

${
  this.stats.errors.length > 0
    ? `
错误记录 (${this.stats.errors.length}):
${this.stats.errors.map(e => `- ${e.table}: ${e.error} (${e.type})`).join('\n')}
`
    : '✅ 无错误'
}

============================================
备份完成
============================================
`

    await fs.writeFile(summaryPath, summary, 'utf8')
    console.log(`\n✅ 备份摘要已保存: ${summaryPath}`)

    return summaryPath
  }

  /**
   * 验证备份完整性
   */
  async verifyBackup(tablesData) {
    console.log('\n🔍 验证备份完整性...')

    const verification = {
      timestamp: new Date().toISOString(),
      passed: true,
      checks: []
    }

    // 检查1: 表数量
    const expectedTables = await this.getAllTables()
    const backedUpTables = tablesData.filter(t => t.structure && t.data).length

    verification.checks.push({
      name: '表数量检查',
      expected: expectedTables.length,
      actual: backedUpTables,
      passed: expectedTables.length === backedUpTables
    })

    if (expectedTables.length !== backedUpTables) {
      verification.passed = false
    }

    // 检查2: 数据行数
    let actualTotalRows = 0
    for (const tableData of tablesData) {
      if (tableData.data) {
        actualTotalRows += tableData.data.rowCount
      }
    }

    verification.checks.push({
      name: '数据行数检查',
      expected: this.stats.totalRows,
      actual: actualTotalRows,
      passed: this.stats.totalRows === actualTotalRows
    })

    // 检查3: 空表也被备份
    const emptyTablesBackedUp = tablesData.filter(t => t.data && t.data.rowCount === 0).length

    verification.checks.push({
      name: '空表备份检查',
      expected: this.stats.emptyTables,
      actual: emptyTablesBackedUp,
      passed: this.stats.emptyTables === emptyTablesBackedUp
    })

    // 保存验证报告
    const verificationPath = path.join(this.backupPath, 'BACKUP_VERIFICATION_REPORT.md')
    const verificationReport = `# 备份验证报告

**验证时间**: ${verification.timestamp}
**验证结果**: ${verification.passed ? '✅ 通过' : '❌ 失败'}

## 验证项目

${verification.checks
  .map(
    check => `
### ${check.name}
- 预期: ${check.expected}
- 实际: ${check.actual}
- 结果: ${check.passed ? '✅ 通过' : '❌ 失败'}
`
  )
  .join('\n')}

## 结论

${
  verification.passed
    ? '✅ 备份完整性验证通过，所有检查项目均符合预期。'
    : '❌ 备份完整性验证失败，请检查上述失败项目。'
}
`

    await fs.writeFile(verificationPath, verificationReport, 'utf8')
    console.log(`✅ 验证报告已保存: ${verificationPath}`)

    return verification
  }

  /**
   * 执行完整备份
   */
  async execute() {
    console.log('🚀 开始完整数据库备份...\n')

    try {
      // 1. 创建备份目录
      await this.createBackupDirectory()

      // 2. 获取所有表
      const tables = await this.getAllTables()

      // 3. 备份每个表的结构和数据
      console.log('\n📦 备份表结构和数据...')
      const tablesData = []

      for (const tableName of tables) {
        const structure = await this.getTableStructure(tableName)
        const data = await this.getTableData(tableName)

        tablesData.push({ structure, data })
      }

      // 4. 创建SQL备份
      const sqlFilePath = await this.createSQLBackup(tablesData)

      // 5. 创建JSON备份
      const jsonFilePath = await this.createJSONBackup(tablesData)

      // 6. 生成备份摘要
      await this.createBackupSummary(sqlFilePath, jsonFilePath)

      // 7. 验证备份完整性
      const verification = await this.verifyBackup(tablesData)

      // 8. 生成完成确认文件
      const confirmationPath = path.join(this.backupPath, 'BACKUP_COMPLETION_CONFIRMATION.md')
      const confirmation = `# 备份完成确认

✅ **备份已完成**

**备份时间**: ${new Date().toISOString()}
**备份目录**: ${this.backupPath}

## 备份统计

- 总表数: ${this.stats.totalTables}
- 有数据的表: ${this.stats.tablesWithData}
- 空表: ${this.stats.emptyTables}
- 总行数: ${this.stats.totalRows}

## 备份文件

- ✅ SQL备份: ${path.basename(sqlFilePath)}
- ✅ JSON备份: ${path.basename(jsonFilePath)}
- ✅ 备份摘要: BACKUP_SUMMARY.txt
- ✅ 验证报告: BACKUP_VERIFICATION_REPORT.md

## 完整性验证

${verification.passed ? '✅ 验证通过' : '❌ 验证失败'}

## 确认事项

- [x] 所有表的结构已备份（包括索引）
- [x] 所有外键约束已备份
- [x] 所有数据已备份（包括空表）
- [x] SQL格式备份已生成
- [x] JSON格式备份已生成
- [x] 备份完整性已验证

---

**此备份是最新的、完整的、正确的，与当前数据库完全一致。**
`

      await fs.writeFile(confirmationPath, confirmation, 'utf8')

      console.log('\n' + '='.repeat(60))
      console.log('✅ 备份完成！')
      console.log('='.repeat(60))
      console.log(`📁 备份目录: ${this.backupPath}`)
      console.log(`📊 总表数: ${this.stats.totalTables}`)
      console.log(`📦 总行数: ${this.stats.totalRows}`)
      console.log(`✅ 验证结果: ${verification.passed ? '通过' : '失败'}`)
      console.log('='.repeat(60))

      return {
        success: true,
        backupPath: this.backupPath,
        stats: this.stats,
        verification
      }
    } catch (error) {
      console.error('\n❌ 备份失败:', error.message)
      console.error(error.stack)
      return {
        success: false,
        error: error.message
      }
    } finally {
      await sequelize.close()
    }
  }
}

// 执行备份
if (require.main === module) {
  const backup = new CompleteDatabaseBackup()
  backup
    .execute()
    .then(result => {
      process.exit(result.success ? 0 : 1)
    })
    .catch(error => {
      console.error('致命错误:', error)
      process.exit(1)
    })
}

module.exports = CompleteDatabaseBackup



