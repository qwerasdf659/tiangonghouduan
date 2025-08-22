/**
 * 🔍 数据库结构分析脚本
 * 检查模型定义与实际数据库表结构的差异
 * 运行环境：Linux + Node.js + MySQL
 */

'use strict'

require('dotenv').config()
const { Sequelize } = require('sequelize')

// 创建数据库连接
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  dialect: 'mysql',
  logging: false
})

/**
 * 🔍 获取表的实际结构
 */
async function getTableStructure (tableName) {
  try {
    const [tableInfo] = await sequelize.query(`
      SELECT 
        COLUMN_NAME as field,
        COLUMN_TYPE as type,
        IS_NULLABLE as nullable,
        COLUMN_DEFAULT as defaultValue,
        COLUMN_KEY as \`key\`,
        EXTRA as extra,
        COLUMN_COMMENT as comment
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = '${process.env.DB_NAME}' 
      AND TABLE_NAME = '${tableName}'
      ORDER BY ORDINAL_POSITION
    `)

    const [indexInfo] = await sequelize.query(`
      SELECT 
        INDEX_NAME as indexName,
        COLUMN_NAME as columnName,
        NON_UNIQUE as nonUnique,
        INDEX_TYPE as indexType
      FROM INFORMATION_SCHEMA.STATISTICS 
      WHERE TABLE_SCHEMA = '${process.env.DB_NAME}' 
      AND TABLE_NAME = '${tableName}'
      ORDER BY INDEX_NAME, SEQ_IN_INDEX
    `)

    return { columns: tableInfo, indexes: indexInfo }
  } catch (error) {
    console.error(`❌ 获取表 ${tableName} 结构失败:`, error.message)
    return null
  }
}

/**
 * 🎯 分析关键表的结构
 */
async function analyzeKeyTables () {
  console.log('🔍 开始分析数据库表结构...\n')

  const keyTables = [
    'user_points_accounts',
    'points_transactions',
    'lottery_campaigns',
    'lottery_draws',
    'lottery_prizes',
    'business_events',
    'analytics_behaviors',
    'analytics_user_profiles',
    'analytics_recommendations',
    'analytics_realtime_stats'
  ]

  const analysisResults = {}

  for (const tableName of keyTables) {
    console.log(`📊 分析表: ${tableName}`)

    const structure = await getTableStructure(tableName)
    if (structure) {
      analysisResults[tableName] = structure

      console.log(`   列数: ${structure.columns.length}`)
      console.log(`   索引数: ${structure.indexes.length}`)

      // 检查NULL约束问题
      const nullableFields = structure.columns.filter(
        col =>
          col.nullable === 'YES' &&
          !['preference_tags', 'last_behavior_time', 'freeze_reason'].includes(col.field)
      )

      if (nullableFields.length > 0) {
        console.log(`   ⚠️  可空字段: ${nullableFields.map(f => f.field).join(', ')}`)
      }

      console.log('')
    } else {
      console.log('   ❌ 表不存在或查询失败\n')
    }
  }

  return analysisResults
}

/**
 * 🔧 检查模型定义与数据库的差异
 */
async function checkModelConsistency () {
  console.log('🔧 检查模型定义与数据库的一致性...\n')

  // 导入关键模型
  const modelsPath = require('path').resolve(__dirname, '../models')
  const _User = require(`${modelsPath}/User.js`)(sequelize)
  const _UserPointsAccount = require(`${modelsPath}/UserPointsAccount.js`)(sequelize)

  try {
    // 检查用户积分账户表
    const upaStructure = await getTableStructure('user_points_accounts')
    if (upaStructure) {
      console.log('📋 UserPointsAccount 模型一致性检查:')

      // 检查关键字段的NULL约束
      const criticalFields = [
        { field: 'account_level', shouldBeNull: false },
        { field: 'is_active', shouldBeNull: false },
        { field: 'behavior_score', shouldBeNull: false },
        { field: 'activity_level', shouldBeNull: false },
        { field: 'recommendation_enabled', shouldBeNull: false }
      ]

      const inconsistencies = []

      for (const fieldDef of criticalFields) {
        const dbField = upaStructure.columns.find(col => col.field === fieldDef.field)
        if (dbField) {
          const isNullable = dbField.nullable === 'YES'
          if (isNullable !== fieldDef.shouldBeNull) {
            inconsistencies.push({
              field: fieldDef.field,
              expected: fieldDef.shouldBeNull ? 'NULL' : 'NOT NULL',
              actual: isNullable ? 'NULL' : 'NOT NULL'
            })
          }
        }
      }

      if (inconsistencies.length > 0) {
        console.log('   ❌ 发现不一致:')
        inconsistencies.forEach(inc => {
          console.log(`      ${inc.field}: 期望${inc.expected}, 实际${inc.actual}`)
        })
      } else {
        console.log('   ✅ NULL约束一致')
      }
    }

    // 检查索引重复
    console.log('\n🔍 检查索引重复情况:')
    const allTables = Object.keys(await analyzeKeyTables())

    for (const tableName of allTables) {
      const structure = await getTableStructure(tableName)
      if (structure && structure.indexes) {
        const indexCounts = {}
        structure.indexes.forEach(idx => {
          const key = `${idx.columnName}`
          indexCounts[key] = (indexCounts[key] || 0) + 1
        })

        const duplicates = Object.entries(indexCounts).filter(([_, count]) => count > 1)
        if (duplicates.length > 0) {
          console.log(
            `   ⚠️  ${tableName} 重复索引: ${duplicates.map(([col, count]) => `${col}(${count})`).join(', ')}`
          )
        }
      }
    }
  } catch (error) {
    console.error('❌ 模型一致性检查失败:', error.message)
  }
}

/**
 * 🚀 主执行函数
 */
async function main () {
  try {
    console.log('🔥 数据库结构分析开始...\n')

    // 测试数据库连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 分析表结构
    const results = await analyzeKeyTables()

    // 检查模型一致性
    await checkModelConsistency()

    // 生成分析报告
    console.log('\n📊 分析摘要:')
    console.log(`   检查表数: ${Object.keys(results).length}`)
    console.log(`   分析时间: ${new Date().toISOString()}`)

    console.log('\n✅ 数据库结构分析完成')
  } catch (error) {
    console.error('❌ 分析过程失败:', error.message)
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

// 运行分析
if (require.main === module) {
  main()
}

module.exports = { analyzeKeyTables, checkModelConsistency }
