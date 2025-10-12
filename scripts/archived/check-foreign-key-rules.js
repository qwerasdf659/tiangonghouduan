/**
 * 检查数据库外键约束的级联规则脚本
 * 用途：检查ON DELETE和ON UPDATE规则是否符合业务需求
 *
 * 创建时间：2025年10月10日
 */

require('dotenv').config()
const { sequelize } = require('../models')

/**
 * 获取所有外键的详细信息，包括级联规则
 */
async function getAllForeignKeyRules () {
  try {
    const [foreignKeys] = await sequelize.query(`
      SELECT 
        rc.TABLE_NAME as table_name,
        rc.CONSTRAINT_NAME as constraint_name,
        kcu.COLUMN_NAME as column_name,
        kcu.REFERENCED_TABLE_NAME as referenced_table,
        kcu.REFERENCED_COLUMN_NAME as referenced_column,
        rc.DELETE_RULE as delete_rule,
        rc.UPDATE_RULE as update_rule
      FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
        ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        AND rc.TABLE_NAME = kcu.TABLE_NAME
      WHERE rc.CONSTRAINT_SCHEMA = DATABASE()
        AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY rc.TABLE_NAME, kcu.ORDINAL_POSITION
    `)

    return foreignKeys
  } catch (error) {
    console.error('❌ 获取外键规则失败:', error.message)
    return []
  }
}

/**
 * 定义业务推荐的外键规则
 */
function getRecommendedRules () {
  return {
    // 用户相关表：用户删除时级联删除
    user_roles: {
      user_id: { delete: 'CASCADE', update: 'CASCADE' },
      role_id: { delete: 'RESTRICT', update: 'CASCADE' }
    },
    user_points_accounts: {
      user_id: { delete: 'CASCADE', update: 'CASCADE' }
    },
    points_transactions: {
      user_id: { delete: 'CASCADE', update: 'CASCADE' },
      account_id: { delete: 'CASCADE', update: 'CASCADE' }
    },
    lottery_draws: {
      user_id: { delete: 'CASCADE', update: 'CASCADE' },
      campaign_id: { delete: 'RESTRICT', update: 'CASCADE' },
      prize_id: { delete: 'SET NULL', update: 'CASCADE' }
    },
    user_inventory: {
      user_id: { delete: 'CASCADE', update: 'CASCADE' }
    },
    exchange_records: {
      user_id: { delete: 'CASCADE', update: 'CASCADE' },
      product_id: { delete: 'RESTRICT', update: 'CASCADE' }
    },
    image_resources: {
      user_id: { delete: 'SET NULL', update: 'CASCADE' }
    },
    feedbacks: {
      user_id: { delete: 'SET NULL', update: 'CASCADE' }
    },
    user_sessions: {
      user_id: { delete: 'CASCADE', update: 'CASCADE' }
    },
    customer_sessions: {
      user_id: { delete: 'SET NULL', update: 'CASCADE' },
      admin_id: { delete: 'SET NULL', update: 'CASCADE' }
    },
    chat_messages: {
      session_id: { delete: 'CASCADE', update: 'CASCADE' },
      sender_id: { delete: 'SET NULL', update: 'CASCADE' }
    }
  }
}

/**
 * 比较实际规则与推荐规则
 */
function compareRules (actual, recommended) {
  const differences = []

  for (const [table, columns] of Object.entries(recommended)) {
    for (const [column, rules] of Object.entries(columns)) {
      const actualFK = actual.find(fk =>
        fk.table_name === table &&
        fk.column_name === column
      )

      if (!actualFK) {
        differences.push({
          table,
          column,
          issue: 'MISSING',
          recommended_delete: rules.delete,
          recommended_update: rules.update
        })
      } else {
        const deleteMatch = actualFK.delete_rule === rules.delete
        const updateMatch = actualFK.update_rule === rules.update

        if (!deleteMatch || !updateMatch) {
          differences.push({
            table,
            column,
            issue: 'RULE_MISMATCH',
            actual_delete: actualFK.delete_rule,
            actual_update: actualFK.update_rule,
            recommended_delete: rules.delete,
            recommended_update: rules.update,
            delete_match: deleteMatch,
            update_match: updateMatch
          })
        }
      }
    }
  }

  return differences
}

/**
 * 主函数
 */
async function main () {
  console.log('🔍 开始检查数据库外键级联规则...')
  console.log(`📅 检查时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
  console.log()

  try {
    // 测试数据库连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 获取所有外键规则
    const allForeignKeys = await getAllForeignKeyRules()
    console.log(`📊 数据库中共有 ${allForeignKeys.length} 个外键约束\n`)

    // 获取推荐规则
    const recommendedRules = getRecommendedRules()

    // 按表分组显示
    console.log('='.repeat(80))
    console.log('📋 外键级联规则详情')
    console.log('='.repeat(80))

    const tables = [...new Set(allForeignKeys.map(fk => fk.table_name))]

    for (const table of tables) {
      const tableFKs = allForeignKeys.filter(fk => fk.table_name === table)

      console.log(`\n🗂️  表: ${table}`)
      console.log('─'.repeat(80))

      tableFKs.forEach(fk => {
        const recommended = recommendedRules[table]?.[fk.column_name]

        let deleteStatus = '✅'
        let updateStatus = '✅'

        if (recommended) {
          deleteStatus = fk.delete_rule === recommended.delete ? '✅' : '⚠️'
          updateStatus = fk.update_rule === recommended.update ? '✅' : '⚠️'
        } else {
          deleteStatus = '❓'
          updateStatus = '❓'
        }

        console.log(`   ${fk.column_name} -> ${fk.referenced_table}.${fk.referenced_column}`)
        console.log(`      ${deleteStatus} ON DELETE: ${fk.delete_rule}${recommended ? ` (推荐: ${recommended.delete})` : ''}`)
        console.log(`      ${updateStatus} ON UPDATE: ${fk.update_rule}${recommended ? ` (推荐: ${recommended.update})` : ''}`)
      })
    }

    // 比较实际规则与推荐规则
    const differences = compareRules(allForeignKeys, recommendedRules)

    console.log('\n' + '='.repeat(80))
    console.log('📊 规则对比结果')
    console.log('='.repeat(80))

    if (differences.length === 0) {
      console.log('\n✅ 所有外键规则都符合推荐配置！')
    } else {
      console.log(`\n⚠️  发现 ${differences.length} 个规则不匹配的情况：\n`)

      differences.forEach((diff, index) => {
        console.log(`${index + 1}. 表: ${diff.table}, 列: ${diff.column}`)

        if (diff.issue === 'MISSING') {
          console.log('   ❌ 外键约束缺失')
          console.log('   推荐配置:')
          console.log(`      ON DELETE: ${diff.recommended_delete}`)
          console.log(`      ON UPDATE: ${diff.recommended_update}`)
        } else {
          console.log('   实际配置:')
          console.log(`      ${diff.delete_match ? '✅' : '⚠️'} ON DELETE: ${diff.actual_delete} (推荐: ${diff.recommended_delete})`)
          console.log(`      ${diff.update_match ? '✅' : '⚠️'} ON UPDATE: ${diff.actual_update} (推荐: ${diff.recommended_update})`)
        }
        console.log()
      })
    }

    console.log('='.repeat(80))
    console.log('\n📝 说明:')
    console.log('   CASCADE  - 级联删除/更新（跟随父记录变化）')
    console.log('   RESTRICT - 限制删除/更新（有子记录时禁止操作）')
    console.log('   SET NULL - 设为NULL（父记录删除时子记录外键设为NULL）')
    console.log('   NO ACTION - 不执行操作（类似RESTRICT）')
    console.log('='.repeat(80) + '\n')

    process.exit(0)
  } catch (error) {
    console.error('\n❌ 检查外键规则失败:', error.message)
    console.error('错误详情:', error)
    process.exit(1)
  }
}

// 运行主函数
main()
