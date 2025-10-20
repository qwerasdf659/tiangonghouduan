/**
 * 创建完整的SQL和JSON备份
 * 包含所有表结构、索引、外键、数据
 */

const { Sequelize } = require('sequelize')
const fs = require('fs')
const path = require('path')
require('dotenv').config()

const sequelize = new Sequelize(
  process.env.DB_NAME || process.env.DB_DATABASE,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    dialect: 'mysql',
    logging: false,
    timezone: process.env.DB_TIMEZONE || '+08:00'
  }
)

async function createCompleteBackup () {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const sqlFile = path.join(__dirname, '../../backups', `COMPLETE_BACKUP_${timestamp}.sql`)
  const jsonFile = path.join(__dirname, '../../backups', `COMPLETE_DATA_${timestamp}.json`)

  console.log('🚀 开始创建完整备份...')
  console.log(`📅 时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
  console.log(`📁 SQL文件: ${path.basename(sqlFile)}`)
  console.log(`📁 JSON文件: ${path.basename(jsonFile)}`)
  console.log('')

  let sqlContent = ''
  const jsonData = {
    timestamp: new Date().toISOString(),
    database: process.env.DB_NAME,
    mysqlVersion: '',
    charset: '',
    collation: '',
    tables: {},
    statistics: {}
  }

  try {
    // 1. 获取数据库信息
    console.log('📊 收集数据库信息...')
    const [versionResult] = await sequelize.query('SELECT VERSION() as version')
    const [charsetResult] = await sequelize.query('SELECT @@character_set_database as charset, @@collation_database as collation')

    jsonData.mysqlVersion = versionResult[0].version
    jsonData.charset = charsetResult[0].charset
    jsonData.collation = charsetResult[0].collation

    // SQL文件头部
    sqlContent += '-- ========================================\n'
    sqlContent += '-- 完整数据库备份\n'
    sqlContent += `-- 数据库: ${process.env.DB_NAME}\n`
    sqlContent += `-- 备份时间: ${new Date().toISOString()}\n`
    sqlContent += `-- 北京时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n`
    sqlContent += `-- MySQL版本: ${jsonData.mysqlVersion}\n`
    sqlContent += `-- 字符集: ${jsonData.charset} / ${jsonData.collation}\n`
    sqlContent += '-- ========================================\n\n'
    sqlContent += 'SET FOREIGN_KEY_CHECKS = 0;\n'
    sqlContent += 'SET SQL_MODE = \'NO_AUTO_VALUE_ON_ZERO\';\n'
    sqlContent += 'SET time_zone = \'+00:00\';\n\n'

    // 2. 获取所有表
    console.log('📋 获取表列表...')
    const [tables] = await sequelize.query('SHOW TABLES')
    const tableNames = tables.map(t => Object.values(t)[0])

    console.log(`   找到 ${tableNames.length} 个表\n`)

    // 3. 导出每个表
    for (const tableName of tableNames) {
      console.log(`📦 处理表: ${tableName}`)

      // 获取表结构
      const [createTableResult] = await sequelize.query(`SHOW CREATE TABLE \`${tableName}\``)
      const createTableSQL = createTableResult[0]['Create Table']

      sqlContent += '-- ========================================\n'
      sqlContent += `-- 表: ${tableName}\n`
      sqlContent += '-- ========================================\n\n'
      sqlContent += `DROP TABLE IF EXISTS \`${tableName}\`;\n`
      sqlContent += createTableSQL + ';\n\n'

      // 获取表数据
      const [rows] = await sequelize.query(`SELECT * FROM \`${tableName}\``)
      jsonData.tables[tableName] = rows
      jsonData.statistics[tableName] = rows.length

      console.log('   ✓ 结构已导出')
      console.log(`   ✓ 数据: ${rows.length} 条记录`)

      if (rows.length > 0) {
        // 生成INSERT语句
        const columns = Object.keys(rows[0])
        const columnList = columns.map(c => `\`${c}\``).join(', ')

        sqlContent += `-- 数据: ${tableName} (${rows.length} 条记录)\n`
        sqlContent += `INSERT INTO \`${tableName}\` (${columnList}) VALUES\n`

        const valuesList = rows.map((row, index) => {
          const values = columns.map(col => {
            const value = row[col]
            if (value === null) return 'NULL'
            if (typeof value === 'string') {
              // 转义特殊字符
              return `'${value.replace(/'/g, '\'\'').replace(/\\/g, '\\\\')}'`
            }
            if (value instanceof Date) {
              return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`
            }
            if (Buffer.isBuffer(value)) {
              return `0x${value.toString('hex')}`
            }
            return value
          })
          const isLast = index === rows.length - 1
          return `(${values.join(', ')})${isLast ? ';' : ','}`
        })

        sqlContent += valuesList.join('\n')
        sqlContent += '\n\n'
      }

      console.log('')
    }

    sqlContent += 'SET FOREIGN_KEY_CHECKS = 1;\n'
    sqlContent += '\n-- 备份完成\n'

    // 4. 写入文件
    console.log('💾 写入备份文件...')
    fs.writeFileSync(sqlFile, sqlContent)
    fs.writeFileSync(jsonFile, JSON.stringify(jsonData, null, 2))

    // 5. 验证备份文件
    const sqlStat = fs.statSync(sqlFile)
    const jsonStat = fs.statSync(jsonFile)

    console.log('\n✅ 备份创建成功！\n')
    console.log('📊 备份统计:')
    console.log(`   SQL文件大小: ${(sqlStat.size / 1024).toFixed(2)} KB`)
    console.log(`   JSON文件大小: ${(jsonStat.size / 1024).toFixed(2)} KB`)
    console.log(`   表数量: ${tableNames.length}`)
    console.log(`   总记录数: ${Object.values(jsonData.statistics).reduce((sum, count) => sum + count, 0)}`)
    console.log('')
    console.log('📁 文件位置:')
    console.log(`   ${sqlFile}`)
    console.log(`   ${jsonFile}`)

    // 保存备份路径供后续使用
    fs.writeFileSync('/tmp/backup_sql_path.txt', sqlFile)
    fs.writeFileSync('/tmp/backup_json_path.txt', jsonFile)

    return { sqlFile, jsonFile, statistics: jsonData.statistics }
  } catch (error) {
    console.error('❌ 备份失败:', error.message)
    console.error(error.stack)
    throw error
  } finally {
    await sequelize.close()
  }
}

createCompleteBackup()
