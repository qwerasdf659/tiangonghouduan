/**
 * 数据库表结构检查脚本 v3.0
 * 用于检查模型定义与数据库表结构的一致性
 */

const mysql = require('mysql2/promise')
require('dotenv').config()

const dbConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
}

console.log('🔍 数据库表结构检查开始...')
console.log(`📊 连接数据库: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`)

async function checkDatabaseStructure () {
  let connection
  try {
    // 连接数据库
    connection = await mysql.createConnection(dbConfig)
    console.log('✅ 数据库连接成功')

    // 获取所有表名
    const [tables] = await connection.execute('SHOW TABLES')
    const tableNames = tables.map(row => Object.values(row)[0])

    console.log(`\n📋 数据库中的表 (${tableNames.length}个):`)
    tableNames.forEach(table => console.log(`  - ${table}`))

    // 检查每个表的结构
    const tablesStructure = {}

    for (const tableName of tableNames) {
      console.log(`\n🔍 检查表: ${tableName}`)

      // 获取表结构
      const [columns] = await connection.execute(`DESCRIBE \`${tableName}\``)
      tablesStructure[tableName] = columns

      console.log(`  列数: ${columns.length}`)
      columns.forEach(col => {
        console.log(
          `    ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'} ${col.Key ? `KEY: ${col.Key}` : ''}`
        )
      })

      // 检查索引
      const [indexes] = await connection.execute(`SHOW INDEX FROM \`${tableName}\``)
      if (indexes.length > 0) {
        console.log(
          `  索引: ${indexes
            .map(idx => idx.Key_name)
            .filter((v, i, a) => a.indexOf(v) === i)
            .join(', ')}`
        )
      }
    }

    // 检查V3模型相关的表
    const v3Tables = [
      'user_points_accounts',
      'points_transactions',
      'lottery_campaigns',
      'lottery_prizes',
      'lottery_draws',
      'business_events'
    ]

    console.log('\n🎯 V3架构核心表检查:')
    const missingTables = []
    const existingTables = []

    v3Tables.forEach(tableName => {
      if (tableNames.includes(tableName)) {
        console.log(`  ✅ ${tableName} - 存在`)
        existingTables.push(tableName)
      } else {
        console.log(`  ❌ ${tableName} - 缺失`)
        missingTables.push(tableName)
      }
    })

    // 详细检查存在的V3表结构
    for (const tableName of existingTables) {
      console.log(`\n📊 ${tableName} 详细结构:`)
      const structure = tablesStructure[tableName]
      structure.forEach(col => {
        const nullable = col.Null === 'YES' ? 'NULL' : 'NOT NULL'
        const defaultValue = col.Default !== null ? `DEFAULT '${col.Default}'` : ''
        const extra = col.Extra ? col.Extra : ''
        console.log(
          `    ${col.Field.padEnd(20)} ${col.Type.padEnd(15)} ${nullable.padEnd(8)} ${col.Key.padEnd(3)} ${defaultValue} ${extra}`
        )
      })
    }

    return {
      allTables: tableNames,
      tablesStructure,
      missingTables,
      existingTables,
      v3TablesStatus: {
        total: v3Tables.length,
        existing: existingTables.length,
        missing: missingTables.length
      }
    }
  } catch (error) {
    console.error('❌ 数据库检查失败:', error.message)
    throw error
  } finally {
    if (connection) {
      await connection.end()
      console.log('\n🔐 数据库连接已关闭')
    }
  }
}

// 检查模型定义文件
function checkModelDefinitions () {
  console.log('\n🔧 检查模型定义文件...')

  const models = [
    'UserPointsAccount',
    'PointsTransaction',
    'LotteryCampaign',
    'LotteryPrize',
    'LotteryDraw',
    'BusinessEvent'
  ]

  const fs = require('fs')
  const path = require('path')
  const modelsDir = path.join(__dirname, '../models')

  const modelFiles = {}

  models.forEach(modelName => {
    const filePath = path.join(modelsDir, `${modelName}.js`)
    if (fs.existsSync(filePath)) {
      console.log(`  ✅ ${modelName}.js - 存在`)
      modelFiles[modelName] = filePath
    } else {
      console.log(`  ❌ ${modelName}.js - 缺失`)
    }
  })

  return modelFiles
}

async function main () {
  try {
    console.log('🚀 开始数据库结构与模型定义一致性检查\n')

    // 检查数据库结构
    const dbResult = await checkDatabaseStructure()

    // 检查模型定义
    const modelFiles = checkModelDefinitions()

    // 生成报告
    console.log('\n📋 检查报告摘要:')
    console.log(`🗃️  数据库表总数: ${dbResult.allTables.length}`)
    console.log(
      `🎯 V3架构表状态: ${dbResult.v3TablesStatus.existing}/${dbResult.v3TablesStatus.total} 存在`
    )

    if (dbResult.missingTables.length > 0) {
      console.log(`❌ 缺失的V3表: ${dbResult.missingTables.join(', ')}`)
    }

    console.log(`📁 模型文件数量: ${Object.keys(modelFiles).length}/6`)

    // 返回结果供后续分析使用
    return {
      database: dbResult,
      models: modelFiles
    }
  } catch (error) {
    console.error('💥 检查过程中发生错误:', error)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

module.exports = { checkDatabaseStructure, checkModelDefinitions }
