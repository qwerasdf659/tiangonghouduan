/**
 * 检查数据库外键约束状态脚本
 * 用途：检查当前数据库中所有表的外键约束情况
 *
 * 创建时间：2025年10月10日
 */

require('dotenv').config()
const { sequelize } = require('../models')

/**
 * 检查指定表的外键约束
 */
async function checkTableForeignKeys (tableName) {
  try {
    const [foreignKeys] = await sequelize.query(`
      SELECT 
        TABLE_NAME,
        COLUMN_NAME,
        CONSTRAINT_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = '${tableName}'
        AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `)

    return foreignKeys
  } catch (error) {
    console.error(`❌ 检查表 ${tableName} 外键失败:`, error.message)
    return []
  }
}

/**
 * 获取所有需要检查外键的表
 */
function getTablesWithForeignKeyNeeds () {
  return [
    {
      table: 'user_roles',
      expected: [
        { column: 'user_id', references: 'users(user_id)' },
        { column: 'role_id', references: 'roles(role_id)' }
      ]
    },
    {
      table: 'user_points_accounts',
      expected: [
        { column: 'user_id', references: 'users(user_id)' }
      ]
    },
    {
      table: 'points_transactions',
      expected: [
        { column: 'user_id', references: 'users(user_id)' },
        { column: 'account_id', references: 'user_points_accounts(account_id)' }
      ]
    },
    {
      table: 'lottery_draws',
      expected: [
        { column: 'user_id', references: 'users(user_id)' },
        { column: 'campaign_id', references: 'lottery_campaigns(campaign_id)' },
        { column: 'prize_id', references: 'lottery_prizes(prize_id)' }
      ]
    },
    {
      table: 'user_inventory',
      expected: [
        { column: 'user_id', references: 'users(user_id)' }
      ]
    },
    {
      table: 'exchange_records',
      expected: [
        { column: 'user_id', references: 'users(user_id)' },
        { column: 'product_id', references: 'products(product_id)' }
      ]
    },
    {
      table: 'image_resources',
      expected: [
        { column: 'user_id', references: 'users(user_id)' }
      ]
    },
    {
      table: 'feedbacks',
      expected: [
        { column: 'user_id', references: 'users(user_id)' }
      ]
    },
    {
      table: 'user_sessions',
      expected: [
        { column: 'user_id', references: 'users(user_id)' }
      ]
    },
    {
      table: 'customer_sessions',
      expected: [
        { column: 'user_id', references: 'users(user_id)' },
        { column: 'admin_id', references: 'users(user_id)' }
      ]
    },
    {
      table: 'chat_messages',
      expected: [
        { column: 'session_id', references: 'customer_sessions(session_id)' },
        { column: 'sender_id', references: 'users(user_id)' }
      ]
    }
  ]
}

/**
 * 主函数
 */
async function main () {
  console.log('🔍 开始检查数据库外键约束状态...')
  console.log(`📅 检查时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
  console.log()

  try {
    // 测试数据库连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    const tablesConfig = getTablesWithForeignKeyNeeds()
    const results = []

    for (const config of tablesConfig) {
      console.log(`\n📋 检查表: ${config.table}`)
      console.log('─'.repeat(50))

      // 获取现有外键
      const existingForeignKeys = await checkTableForeignKeys(config.table)

      console.log(`   预期外键数: ${config.expected.length}`)
      console.log(`   实际外键数: ${existingForeignKeys.length}`)

      // 检查每个预期的外键是否存在
      const missingForeignKeys = []
      for (const expectedFK of config.expected) {
        const exists = existingForeignKeys.some(fk =>
          fk.COLUMN_NAME === expectedFK.column &&
          expectedFK.references.includes(fk.REFERENCED_TABLE_NAME)
        )

        if (!exists) {
          missingForeignKeys.push(expectedFK)
          console.log(`   ❌ 缺失: ${expectedFK.column} -> ${expectedFK.references}`)
        } else {
          console.log(`   ✅ 存在: ${expectedFK.column} -> ${expectedFK.references}`)
        }
      }

      results.push({
        table: config.table,
        expectedCount: config.expected.length,
        actualCount: existingForeignKeys.length,
        missingCount: missingForeignKeys.length,
        missingForeignKeys,
        status: missingForeignKeys.length === 0 ? '✅ 完整' : '❌ 缺失'
      })
    }

    // 生成总结报告
    console.log('\n' + '='.repeat(60))
    console.log('📊 外键约束检查总结报告')
    console.log('='.repeat(60))

    let totalExpected = 0
    let totalActual = 0
    let totalMissing = 0

    results.forEach(result => {
      totalExpected += result.expectedCount
      totalActual += result.actualCount
      totalMissing += result.missingCount

      console.log(`\n${result.status} ${result.table}`)
      console.log(`   预期: ${result.expectedCount} | 实际: ${result.actualCount} | 缺失: ${result.missingCount}`)

      if (result.missingForeignKeys.length > 0) {
        console.log('   缺失详情:')
        result.missingForeignKeys.forEach(fk => {
          console.log(`     - ${fk.column} -> ${fk.references}`)
        })
      }
    })

    console.log('\n' + '='.repeat(60))
    console.log('📈 统计数据:')
    console.log(`   预期外键总数: ${totalExpected}`)
    console.log(`   实际外键总数: ${totalActual}`)
    console.log(`   缺失外键总数: ${totalMissing}`)
    console.log(`   完整性: ${totalActual}/${totalExpected} (${((totalActual / totalExpected) * 100).toFixed(1)}%)`)

    if (totalMissing === 0) {
      console.log('\n✅ 所有外键约束都已正确配置')
    } else {
      console.log(`\n⚠️  发现 ${totalMissing} 个缺失的外键约束，需要添加`)
    }

    console.log('='.repeat(60) + '\n')

    process.exit(0)
  } catch (error) {
    console.error('\n❌ 检查外键约束失败:', error.message)
    console.error('错误详情:', error)
    process.exit(1)
  }
}

// 运行主函数
main()
