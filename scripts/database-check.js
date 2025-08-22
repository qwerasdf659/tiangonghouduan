/**
 * 餐厅积分抽奖系统 v3.0 - 数据库连接和表结构检查脚本
 * 作用：验证数据库连接、检查表结构、验证索引状态
 */

'use strict'

// 加载环境变量
require('dotenv').config()

const { sequelize } = require('../models')

/**
 * 检查数据库连接
 */
async function checkDatabaseConnection () {
  try {
    console.log('🔗 正在检查数据库连接...')
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功!')

    // 获取数据库版本信息
    const [results] = await sequelize.query('SELECT VERSION() as version')
    console.log(`📊 MySQL版本: ${results[0].version}`)

    return true
  } catch (error) {
    console.error('❌ 数据库连接失败:', error.message)
    return false
  }
}

/**
 * 检查数据库表结构
 */
async function checkTableStructure () {
  try {
    console.log('\n📋 正在检查数据库表结构...')

    // 获取所有表
    const [tables] = await sequelize.query('SHOW TABLES')
    console.log(`📊 数据库表总数: ${tables.length}`)

    const tableNames = tables.map(table => Object.values(table)[0])

    // 按业务模块分类
    const businessTables = {
      core: [],
      points: [],
      lottery: [],
      analytics: [],
      system: []
    }

    tableNames.forEach(tableName => {
      if (tableName.includes('points') || tableName.includes('transaction')) {
        businessTables.points.push(tableName)
      } else if (
        tableName.includes('lottery') ||
        tableName.includes('campaign') ||
        tableName.includes('prize') ||
        tableName.includes('draw')
      ) {
        businessTables.lottery.push(tableName)
      } else if (tableName.includes('analytics')) {
        businessTables.analytics.push(tableName)
      } else if (
        tableName.includes('user') ||
        tableName.includes('chat') ||
        tableName.includes('business_event')
      ) {
        businessTables.core.push(tableName)
      } else {
        businessTables.system.push(tableName)
      }
    })

    console.log('\n📊 按业务模块分类:')
    console.log(`🔥 核心业务表 (${businessTables.core.length}个):`, businessTables.core)
    console.log(`💰 积分系统表 (${businessTables.points.length}个):`, businessTables.points)
    console.log(`🎲 抽奖系统表 (${businessTables.lottery.length}个):`, businessTables.lottery)
    console.log(`📊 分析系统表 (${businessTables.analytics.length}个):`, businessTables.analytics)
    console.log(`⚙️ 系统管理表 (${businessTables.system.length}个):`, businessTables.system)

    return businessTables
  } catch (error) {
    console.error('❌ 表结构检查失败:', error.message)
    return null
  }
}

/**
 * 检查索引状态
 */
async function checkIndexes () {
  try {
    console.log('\n🔍 正在检查数据库索引...')

    // 获取所有索引信息
    const [indexes] = await sequelize.query(`
      SELECT 
        TABLE_NAME,
        INDEX_NAME,
        COLUMN_NAME,
        NON_UNIQUE,
        INDEX_TYPE
      FROM information_schema.STATISTICS 
      WHERE TABLE_SCHEMA = '${process.env.DB_NAME}'
      ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
    `)

    // 按表分组统计索引
    const indexByTable = {}
    indexes.forEach(index => {
      if (!indexByTable[index.TABLE_NAME]) {
        indexByTable[index.TABLE_NAME] = []
      }
      indexByTable[index.TABLE_NAME].push(index)
    })

    console.log('\n📊 索引统计:')
    let totalIndexes = 0
    Object.keys(indexByTable).forEach(tableName => {
      const tableIndexes = indexByTable[tableName]
      const uniqueIndexNames = [...new Set(tableIndexes.map(idx => idx.INDEX_NAME))]
      totalIndexes += uniqueIndexNames.length
      console.log(`📋 ${tableName}: ${uniqueIndexNames.length}个索引`)
    })

    console.log(`🔢 总索引数: ${totalIndexes}`)

    return indexByTable
  } catch (error) {
    console.error('❌ 索引检查失败:', error.message)
    return null
  }
}

/**
 * 检查关键字段的数据完整性
 */
async function checkDataIntegrity () {
  try {
    console.log('\n🔍 正在检查数据完整性...')

    // 检查用户表
    const [userCount] = await sequelize.query('SELECT COUNT(*) as count FROM users')
    console.log(`👥 用户总数: ${userCount[0].count}`)

    // 检查积分账户表
    try {
      const [pointsAccountCount] = await sequelize.query(
        'SELECT COUNT(*) as count FROM user_points_accounts'
      )
      console.log(`💰 积分账户总数: ${pointsAccountCount[0].count}`)
    } catch (error) {
      console.log('⚠️  积分账户表不存在或无法访问')
    }

    // 检查抽奖活动表
    try {
      const [campaignCount] = await sequelize.query(
        'SELECT COUNT(*) as count FROM lottery_campaigns'
      )
      console.log(`🎲 抽奖活动总数: ${campaignCount[0].count}`)
    } catch (error) {
      console.log('⚠️  抽奖活动表不存在或无法访问')
    }

    // 检查分析表
    try {
      const [behaviorCount] = await sequelize.query(
        'SELECT COUNT(*) as count FROM analytics_behaviors'
      )
      console.log(`📊 行为记录总数: ${behaviorCount[0].count}`)
    } catch (error) {
      console.log('⚠️  行为分析表不存在或无法访问')
    }

    return true
  } catch (error) {
    console.error('❌ 数据完整性检查失败:', error.message)
    return false
  }
}

/**
 * 主函数
 */
async function main () {
  console.log('🚀 餐厅积分抽奖系统 v3.0 - 数据库诊断工具')
  console.log('='.repeat(60))

  // 1. 检查数据库连接
  const connectionOk = await checkDatabaseConnection()
  if (!connectionOk) {
    process.exit(1)
  }

  // 2. 检查表结构
  const tableStructure = await checkTableStructure()
  if (!tableStructure) {
    process.exit(1)
  }

  // 3. 检查索引
  const _indexes = await checkIndexes()

  // 4. 检查数据完整性
  const dataIntegrityOk = await checkDataIntegrity()

  console.log('\n' + '='.repeat(60))

  if (connectionOk && tableStructure && dataIntegrityOk) {
    console.log('✅ 数据库检查完成 - 一切正常!')
  } else {
    console.log('⚠️  数据库检查完成 - 发现一些问题，请查看上方详情')
  }

  await sequelize.close()
}

// 运行检查
if (require.main === module) {
  main().catch(error => {
    console.error('💥 脚本执行失败:', error)
    process.exit(1)
  })
}

module.exports = {
  checkDatabaseConnection,
  checkTableStructure,
  checkIndexes,
  checkDataIntegrity
}
