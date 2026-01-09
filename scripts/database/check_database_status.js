/**
 * 数据库状态检查脚本
 * 创建时间：2025年12月19日 北京时间
 */

'use strict'

const { sequelize } = require('../../models')

async function checkDatabaseStatus() {
  try {
    console.log('🔍 正在连接数据库...')
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 获取数据库版本
    const [versionResult] = await sequelize.query('SELECT VERSION() as version')
    const dbVersion = versionResult[0].version
    console.log(`📊 MySQL版本: ${dbVersion}`)

    // 获取所有表
    const [tables] = await sequelize.query(`
      SELECT 
        TABLE_NAME, 
        TABLE_ROWS, 
        ROUND(DATA_LENGTH/1024/1024, 2) as DATA_MB,
        ROUND(INDEX_LENGTH/1024/1024, 2) as INDEX_MB,
        ENGINE, 
        TABLE_COLLATION
      FROM information_schema.TABLES 
      WHERE TABLE_SCHEMA = '${process.env.DB_NAME}'
      ORDER BY TABLE_NAME
    `)

    console.log(`📊 数据库: ${process.env.DB_NAME}`)
    console.log(`📊 总表数: ${tables.length}\n`)

    console.log('表详情:')
    console.log('━'.repeat(80))

    let totalRows = 0
    let totalDataMB = 0
    let totalIndexMB = 0

    tables.forEach((t, index) => {
      const rows = parseInt(t.TABLE_ROWS) || 0
      const dataMB = parseFloat(t.DATA_MB) || 0
      const indexMB = parseFloat(t.INDEX_MB) || 0

      totalRows += rows
      totalDataMB += dataMB
      totalIndexMB += indexMB

      console.log(
        `${(index + 1).toString().padStart(3)}. ${t.TABLE_NAME.padEnd(40)} ${rows.toString().padStart(8)}行  ${dataMB.toFixed(2).padStart(8)}MB`
      )
    })

    console.log('━'.repeat(80))
    console.log(
      `📊 总计: ${totalRows}行, 数据${totalDataMB.toFixed(2)}MB, 索引${totalIndexMB.toFixed(2)}MB\n`
    )

    // 输出JSON格式供脚本使用
    console.log('\n===JSON_START===')
    console.log(
      JSON.stringify(
        {
          database: process.env.DB_NAME,
          version: dbVersion,
          total_tables: tables.length,
          total_rows: totalRows,
          tables: tables.map(t => ({
            name: t.TABLE_NAME,
            rows: parseInt(t.TABLE_ROWS) || 0,
            engine: t.ENGINE,
            collation: t.TABLE_COLLATION
          }))
        },
        null,
        2
      )
    )
    console.log('===JSON_END===')

    await sequelize.close()
    process.exit(0)
  } catch (error) {
    console.error('❌ 错误:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

checkDatabaseStatus()
