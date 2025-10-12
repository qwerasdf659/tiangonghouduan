/**
 * 修复数据库外键级联规则脚本
 * 用途：将不符合业务需求的外键级联规则调整为推荐配置
 *
 * 创建时间：2025年10月10日
 *
 * ⚠️ 重要提示：
 * 1. 此脚本会修改数据库结构，执行前必须备份数据库
 * 2. 建议在低峰期执行
 * 3. 首次执行使用 --dry-run 参数查看执行计划
 * 4. 执行过程会临时禁用外键检查
 */

require('dotenv').config()
const { sequelize } = require('../models')

/**
 * 定义需要修复的外键规则
 * 基于业务分析报告中的推荐配置
 */
function getForeignKeyFixes () {
  return [
    {
      table: 'user_roles',
      column: 'role_id',
      referenced_table: 'roles',
      referenced_column: 'role_id',
      current: { delete: 'CASCADE', update: 'CASCADE' },
      recommended: { delete: 'RESTRICT', update: 'CASCADE' },
      reason: '有角色分配的角色不能删除（业务保护）'
    },
    {
      table: 'lottery_draws',
      column: 'prize_id',
      referenced_table: 'lottery_prizes',
      referenced_column: 'prize_id',
      current: { delete: 'CASCADE', update: 'CASCADE' },
      recommended: { delete: 'SET NULL', update: 'CASCADE' },
      reason: '奖品删除后保留抽奖记录，prize_id设为NULL（审计追踪）'
    },
    {
      table: 'exchange_records',
      column: 'product_id',
      referenced_table: 'products',
      referenced_column: 'product_id',
      current: { delete: 'CASCADE', update: 'CASCADE' },
      recommended: { delete: 'RESTRICT', update: 'CASCADE' },
      reason: '有兑换记录的商品不能删除（业务保护）'
    },
    {
      table: 'image_resources',
      column: 'user_id',
      referenced_table: 'users',
      referenced_column: 'user_id',
      current: { delete: 'CASCADE', update: 'CASCADE' },
      recommended: { delete: 'SET NULL', update: 'CASCADE' },
      reason: '用户删除后保留图片资源，user_id设为NULL（内容保留）'
    },
    {
      table: 'feedbacks',
      column: 'user_id',
      referenced_table: 'users',
      referenced_column: 'user_id',
      current: { delete: 'RESTRICT', update: 'CASCADE' },
      recommended: { delete: 'SET NULL', update: 'CASCADE' },
      reason: '用户删除后保留反馈记录，user_id设为NULL（内容保留）'
    },
    {
      table: 'customer_sessions',
      column: 'user_id',
      referenced_table: 'users',
      referenced_column: 'user_id',
      current: { delete: 'CASCADE', update: 'CASCADE' },
      recommended: { delete: 'SET NULL', update: 'CASCADE' },
      reason: '用户删除后保留客服会话，user_id设为NULL（审计追踪）'
    },
    {
      table: 'chat_messages',
      column: 'sender_id',
      referenced_table: 'users',
      referenced_column: 'user_id',
      current: { delete: 'CASCADE', update: 'CASCADE' },
      recommended: { delete: 'SET NULL', update: 'CASCADE' },
      reason: '用户删除后保留聊天记录，sender_id设为NULL（审计追踪）'
    }
  ]
}

/**
 * 获取指定外键的约束名称
 */
async function getForeignKeyConstraintName (table, column, referencedTable) {
  try {
    const [result] = await sequelize.query(`
      SELECT CONSTRAINT_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = '${table}'
        AND COLUMN_NAME = '${column}'
        AND REFERENCED_TABLE_NAME = '${referencedTable}'
      LIMIT 1
    `)

    return result.length > 0 ? result[0].CONSTRAINT_NAME : null
  } catch (error) {
    console.error(`❌ 获取外键约束名失败: ${table}.${column}`, error.message)
    return null
  }
}

/**
 * 验证列是否允许NULL（用于SET NULL规则）
 */
async function checkColumnNullability (table, column) {
  try {
    const [result] = await sequelize.query(`
      SELECT IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = '${table}'
        AND COLUMN_NAME = '${column}'
    `)

    return result.length > 0 ? result[0].IS_NULLABLE === 'YES' : false
  } catch (error) {
    console.error(`❌ 检查列是否允许NULL失败: ${table}.${column}`, error.message)
    return false
  }
}

/**
 * 修复单个外键规则
 */
async function fixForeignKeyRule (fix, dryRun = true) {
  const { table, column, referenced_table, referenced_column, recommended } = fix

  console.log(`\n🔧 处理: ${table}.${column} -> ${referenced_table}.${referenced_column}`)

  // 1. 获取约束名
  const constraintName = await getForeignKeyConstraintName(table, column, referenced_table)

  if (!constraintName) {
    console.log('   ❌ 未找到外键约束，跳过')
    return { success: false, reason: 'constraint_not_found' }
  }

  console.log(`   约束名: ${constraintName}`)

  // 2. 如果使用SET NULL，检查列是否允许NULL
  if (recommended.delete === 'SET NULL') {
    const isNullable = await checkColumnNullability(table, column)
    if (!isNullable) {
      console.log(`   ⚠️  列 ${column} 不允许NULL，需要先修改列定义`)

      if (!dryRun) {
        try {
          await sequelize.query(`
            ALTER TABLE ${table}
            MODIFY COLUMN ${column} INT NULL COMMENT '外键引用（允许NULL）'
          `)
          console.log(`   ✅ 已修改列 ${column} 允许NULL`)
        } catch (error) {
          console.log(`   ❌ 修改列定义失败: ${error.message}`)
          return { success: false, reason: 'modify_column_failed', error: error.message }
        }
      } else {
        console.log(`   🔍 [DRY RUN] 将修改列 ${column} 允许NULL`)
      }
    }
  }

  // 3. 构建新的外键约束SQL
  const deleteRule = recommended.delete
  const updateRule = recommended.update

  const dropSql = `ALTER TABLE ${table} DROP FOREIGN KEY ${constraintName}`
  const addSql = `
    ALTER TABLE ${table}
    ADD CONSTRAINT ${constraintName}
    FOREIGN KEY (${column}) REFERENCES ${referenced_table}(${referenced_column})
    ON DELETE ${deleteRule}
    ON UPDATE ${updateRule}
  `

  if (dryRun) {
    console.log('   🔍 [DRY RUN] 将执行以下SQL:')
    console.log(`      1. ${dropSql}`)
    console.log(`      2. ${addSql.trim().replace(/\n\s+/g, ' ')}`)
    return { success: true, dryRun: true }
  }

  // 4. 执行修复
  try {
    console.log('   🔧 删除旧外键约束...')
    await sequelize.query(dropSql)

    console.log('   🔧 创建新外键约束...')
    await sequelize.query(addSql)

    console.log(`   ✅ 修复成功: ON DELETE ${deleteRule}, ON UPDATE ${updateRule}`)

    return { success: true, constraintName, deleteRule, updateRule }
  } catch (error) {
    console.error(`   ❌ 修复失败: ${error.message}`)
    return { success: false, reason: 'sql_execution_failed', error: error.message }
  }
}

/**
 * 验证修复结果
 */
async function verifyFixes (fixes) {
  console.log('\n' + '='.repeat(80))
  console.log('🔍 验证修复结果')
  console.log('='.repeat(80))

  let allVerified = true

  for (const fix of fixes) {
    const [result] = await sequelize.query(`
      SELECT rc.DELETE_RULE, rc.UPDATE_RULE
      FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
        ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        AND rc.TABLE_NAME = kcu.TABLE_NAME
      WHERE rc.CONSTRAINT_SCHEMA = DATABASE()
        AND kcu.TABLE_NAME = '${fix.table}'
        AND kcu.COLUMN_NAME = '${fix.column}'
        AND kcu.REFERENCED_TABLE_NAME = '${fix.referenced_table}'
      LIMIT 1
    `)

    if (result.length > 0) {
      const actual = result[0]
      const expected = fix.recommended

      const deleteMatch = actual.DELETE_RULE === expected.delete
      const updateMatch = actual.UPDATE_RULE === expected.update

      if (deleteMatch && updateMatch) {
        console.log(`✅ ${fix.table}.${fix.column}: 规则正确`)
      } else {
        console.log(`❌ ${fix.table}.${fix.column}: 规则不匹配`)
        console.log(`   预期: DELETE ${expected.delete}, UPDATE ${expected.update}`)
        console.log(`   实际: DELETE ${actual.DELETE_RULE}, UPDATE ${actual.UPDATE_RULE}`)
        allVerified = false
      }
    } else {
      console.log(`❌ ${fix.table}.${fix.column}: 未找到外键约束`)
      allVerified = false
    }
  }

  return allVerified
}

/**
 * 主函数
 */
async function main () {
  // 检查命令行参数
  const dryRun = process.argv.includes('--dry-run') || process.argv.includes('-d')
  const force = process.argv.includes('--force') || process.argv.includes('-f')

  console.log('🔧 数据库外键级联规则修复脚本')
  console.log(`📅 执行时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
  console.log(`🔍 模式: ${dryRun ? 'DRY RUN（仅查看计划）' : 'EXECUTE（实际执行）'}`)
  console.log()

  if (!dryRun && !force) {
    console.log('⚠️  警告: 即将修改数据库结构！')
    console.log('⚠️  建议先使用 --dry-run 参数查看执行计划')
    console.log('⚠️  确认无误后使用 --force 参数执行')
    console.log()
    process.exit(1)
  }

  try {
    // 测试数据库连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 获取需要修复的外键
    const fixes = getForeignKeyFixes()

    console.log('='.repeat(80))
    console.log('📋 外键修复计划')
    console.log('='.repeat(80))
    console.log(`共需要修复 ${fixes.length} 个外键规则:\n`)

    fixes.forEach((fix, index) => {
      console.log(`${index + 1}. ${fix.table}.${fix.column} -> ${fix.referenced_table}`)
      console.log(`   当前: DELETE ${fix.current.delete}, UPDATE ${fix.current.update}`)
      console.log(`   推荐: DELETE ${fix.recommended.delete}, UPDATE ${fix.recommended.update}`)
      console.log(`   原因: ${fix.reason}`)
      console.log()
    })

    if (dryRun) {
      console.log('='.repeat(80))
      console.log('🔍 DRY RUN 模式 - 以下为执行计划预览')
      console.log('='.repeat(80))
    } else {
      console.log('='.repeat(80))
      console.log('🚀 开始执行修复')
      console.log('='.repeat(80))

      // 禁用外键检查（修复期间）
      console.log('\n⚙️  临时禁用外键检查...')
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 0')
    }

    // 执行修复
    const results = []
    for (const fix of fixes) {
      const result = await fixForeignKeyRule(fix, dryRun)
      results.push({ fix, result })
    }

    if (!dryRun) {
      // 恢复外键检查
      console.log('\n⚙️  恢复外键检查...')
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1')
    }

    // 统计结果
    console.log('\n' + '='.repeat(80))
    console.log('📊 执行结果统计')
    console.log('='.repeat(80))

    const successCount = results.filter(r => r.result.success).length
    const failCount = results.filter(r => !r.result.success).length

    console.log(`总数: ${results.length}`)
    console.log(`成功: ${successCount}`)
    console.log(`失败: ${failCount}`)

    if (failCount > 0) {
      console.log('\n失败详情:')
      results
        .filter(r => !r.result.success)
        .forEach(({ fix, result }) => {
          console.log(`  ❌ ${fix.table}.${fix.column}: ${result.reason}`)
          if (result.error) {
            console.log(`     错误: ${result.error}`)
          }
        })
    }

    // 如果是实际执行，进行验证
    if (!dryRun && successCount > 0) {
      const allVerified = await verifyFixes(fixes)

      if (allVerified) {
        console.log('\n✅ 所有外键规则修复成功并验证通过！')
      } else {
        console.log('\n⚠️  部分外键规则验证失败，请检查')
      }
    }

    if (dryRun) {
      console.log('\n💡 提示: 执行 node scripts/fix-foreign-key-rules.js --force 进行实际修复')
    }

    console.log('\n' + '='.repeat(80))
    console.log(dryRun ? '🔍 DRY RUN 完成' : '✅ 修复完成')
    console.log('='.repeat(80) + '\n')

    process.exit(0)
  } catch (error) {
    console.error('\n❌ 修复过程失败:', error.message)
    console.error('错误详情:', error)

    // 确保恢复外键检查
    try {
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1')
    } catch (e) {
      // 忽略
    }

    process.exit(1)
  }
}

// 运行主函数
main()
