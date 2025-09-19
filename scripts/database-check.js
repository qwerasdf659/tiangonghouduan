#!/usr/bin/env node

/**
 * 统一数据库检查脚本 - 使用统一数据库助手
 * 调用 UnifiedDatabaseHelper 的完整检查功能
 * 集成了简单检查和详细检查两种模式
 */

require('dotenv').config()
const { getDatabaseHelper } = require('../utils/UnifiedDatabaseHelper')

// 解析命令行参数
const args = process.argv.slice(2)
const isVerbose = args.includes('--verbose') || args.includes('-v')
const isSimple = args.includes('--simple') || args.includes('-s')

async function simpleCheck () {
  console.log('🔍 执行简单数据库检查...')

  const db = getDatabaseHelper()

  try {
    // 1. 测试连接
    console.log('📡 测试数据库连接...')
    await db.ensureConnection()
    console.log('✅ 数据库连接成功')

    // 2. 检查数据库名称
    const results = await db.query('SELECT DATABASE() as current_db')
    console.log(`📊 当前数据库: ${results[0].current_db}`)

    // 3. 检查表数量
    const tables = await db.query('SHOW TABLES')
    console.log(`📊 总表数: ${tables.length}`)

    // 4. 检查关键表的记录数
    console.log('\n📊 关键表记录数统计:')
    const keyTables = [
      'users',
      'lottery_campaigns',
      'lottery_draws',
      'lottery_prizes',
      'points_transactions'
    ]

    for (const table of keyTables) {
      try {
        const [count] = await db.query(`SELECT COUNT(*) as count FROM ${table}`)
        console.log(`  ${table}: ${count[0].count} 条记录`)
      } catch (error) {
        console.log(`  ${table}: 表不存在或查询失败`)
      }
    }

    console.log('\n✅ 简单数据库检查完成')
  } catch (error) {
    console.error('❌ 数据库检查失败:', error.message)
    process.exit(1)
  } finally {
    await db.disconnect()
  }
}

async function detailedCheck () {
  try {
    const db = getDatabaseHelper()

    // 使用扩展后的完整检查功能
    const checkResult = await db.performCompleteCheck({ verbose: isVerbose })

    if (!isVerbose) {
      // 简化输出模式
      console.log('\n📋 数据库检查摘要:')
      console.log(`   数据库: ${checkResult.database.name}`)
      console.log(`   连接状态: ${checkResult.connection.status}`)
      console.log(`   总表数: ${checkResult.summary.totalTables}`)
      console.log(`   总记录数: ${checkResult.summary.totalRecords}`)
      console.log(`   总索引数: ${checkResult.summary.totalIndexes}`)
    }

    await db.disconnect()
  } catch (error) {
    console.error('❌ 详细数据库检查失败:', error.message)
    process.exit(1)
  }
}

function showHelp () {
  console.log('数据库检查脚本使用说明:')
  console.log('')
  console.log('用法: node database-check.js [选项]')
  console.log('')
  console.log('选项:')
  console.log('  -s, --simple    执行简单检查（快速检查连接和基本表信息）')
  console.log('  -v, --verbose   详细模式（显示详细的检查信息）')
  console.log('  -h, --help      显示此帮助信息')
  console.log('')
  console.log('示例:')
  console.log('  node database-check.js            # 默认详细检查')
  console.log('  node database-check.js --simple   # 简单快速检查')
  console.log('  node database-check.js --verbose  # 详细模式检查')
}

async function main () {
  if (args.includes('--help') || args.includes('-h')) {
    showHelp()
    return
  }

  try {
    if (isSimple) {
      await simpleCheck()
    } else {
      await detailedCheck()
    }
  } catch (error) {
    console.error('数据库检查失败:', error.message)
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

module.exports = { main, simpleCheck, detailedCheck }
