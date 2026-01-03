/**
 * 数据库管理统一工具包 (Database Toolkit)
 *
 * 功能：整合所有数据库相关的检查、修复、维护功能
 *
 * 合并来源脚本：
 * - check-data-integrity.js (数据完整性检查)
 * - check-database-integrity.js (数据库完整性检查)
 * - database_check.js (数据库检查)
 * - data-consistency-check.js (数据一致性检查)
 * - fix-foreign-key-rules.js (外键规则修复)
 * - check-foreign-keys.js (外键检查)
 * - check-foreign-key-rules.js (外键规则检查)
 * - fix-lottery-draws-foreign-key.js (抽奖表外键修复)
 * - fix-user-inventory-foreign-key.js (用户库存外键修复)
 *
 * 使用方式：
 * node scripts/toolkit/database-toolkit.js --action=check             # 检查数据完整性
 * node scripts/toolkit/database-toolkit.js --action=check-foreign-keys # 检查外键
 * node scripts/toolkit/database-toolkit.js --action=fix-foreign-keys   # 修复外键规则
 * node scripts/toolkit/database-toolkit.js --action=full-check        # 全面检查
 * node scripts/toolkit/database-toolkit.js --action=orphan-check      # 检查孤儿数据
 * node scripts/toolkit/database-toolkit.js --action=stats             # 显示数据库统计
 * node scripts/toolkit/database-toolkit.js --dry-run                  # 预览修复但不执行
 *
 * 创建时间：2025年10月12日 北京时间
 */

'use strict'

const { sequelize } = require('../../models')
const BeijingTimeHelper = require('../../utils/timeHelper')

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

// ==================== 外键规则配置 ====================

/**
 * 定义需要修复的外键规则
 * 基于业务分析报告中的推荐配置
 */
function getForeignKeyFixes() {
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
      table: 'exchange_records',
      column: 'user_id',
      referenced_table: 'users',
      referenced_column: 'user_id',
      current: { delete: 'CASCADE', update: 'CASCADE' },
      recommended: { delete: 'RESTRICT', update: 'CASCADE' },
      reason: '有兑换记录的用户不能删除（业务保护）'
    },
    {
      table: 'lottery_draws',
      column: 'campaign_id',
      referenced_table: 'lottery_campaigns',
      referenced_column: 'campaign_id',
      current: { delete: 'CASCADE', update: 'CASCADE' },
      recommended: { delete: 'RESTRICT', update: 'CASCADE' },
      reason: '有抽奖记录的活动不能删除（业务保护）'
    }
  ]
}

// ==================== 数据检查功能 ====================

/**
 * 检查数据库完整性
 */
async function checkDatabaseIntegrity() {
  log('\n🔍 ━━━ 数据库完整性检查 ━━━', 'cyan')
  log(`检查时间: ${BeijingTimeHelper.nowLocale()}\n`, 'blue')

  try {
    // 1. 获取所有外键关系
    const [foreignKeys] = await sequelize.query(`
      SELECT 
        TABLE_NAME,
        COLUMN_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME,
        CONSTRAINT_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY TABLE_NAME, CONSTRAINT_NAME
    `)

    log(`📊 数据库外键关系：${foreignKeys.length}个\n`, 'blue')

    // 2. 检查孤儿记录
    log('🔍 检查孤儿记录...\n', 'cyan')

    const orphanReport = []
    let totalOrphans = 0

    for (const fk of foreignKeys) {
      try {
        // 查询孤儿记录
        const [orphans] = await sequelize.query(`
          SELECT COUNT(*) as count
          FROM \`${fk.TABLE_NAME}\`
          WHERE \`${fk.COLUMN_NAME}\` NOT IN (
            SELECT \`${fk.REFERENCED_COLUMN_NAME}\`
            FROM \`${fk.REFERENCED_TABLE_NAME}\`
          )
          AND \`${fk.COLUMN_NAME}\` IS NOT NULL
        `)

        const orphanCount = orphans[0].count

        if (orphanCount > 0) {
          log(
            `❌ ${fk.TABLE_NAME}.${fk.COLUMN_NAME} → ${fk.REFERENCED_TABLE_NAME}: ${orphanCount}条孤儿记录`,
            'red'
          )

          // 获取示例孤儿ID
          const [samples] = await sequelize.query(`
            SELECT \`${fk.COLUMN_NAME}\`, COUNT(*) as count
            FROM \`${fk.TABLE_NAME}\`
            WHERE \`${fk.COLUMN_NAME}\` NOT IN (
              SELECT \`${fk.REFERENCED_COLUMN_NAME}\`
              FROM \`${fk.REFERENCED_TABLE_NAME}\`
            )
            AND \`${fk.COLUMN_NAME}\` IS NOT NULL
            GROUP BY \`${fk.COLUMN_NAME}\`
            LIMIT 5
          `)

          totalOrphans += orphanCount

          orphanReport.push({
            table: fk.TABLE_NAME,
            column: fk.COLUMN_NAME,
            references: `${fk.REFERENCED_TABLE_NAME}(${fk.REFERENCED_COLUMN_NAME})`,
            count: orphanCount,
            samples: samples.map(s => s[fk.COLUMN_NAME])
          })
        } else {
          log(
            `✅ ${fk.TABLE_NAME}.${fk.COLUMN_NAME} → ${fk.REFERENCED_TABLE_NAME}: 数据一致`,
            'green'
          )
        }
      } catch (error) {
        log(`⚠️ ${fk.TABLE_NAME}.${fk.COLUMN_NAME}: 检查失败 - ${error.message}`, 'yellow')
      }
    }

    // 3. 汇总报告
    log('\n' + '='.repeat(80), 'cyan')
    log('检查结果汇总', 'cyan')
    log('='.repeat(80), 'cyan')

    if (totalOrphans > 0) {
      log(`\n❌ 发现 ${totalOrphans} 条孤儿记录需要处理\n`, 'red')
      log('详细信息：', 'yellow')
      orphanReport.forEach((item, index) => {
        log(`${index + 1}. ${item.table}.${item.column} → ${item.references}`, 'yellow')
        log(`   孤儿数量: ${item.count}`, 'yellow')
        log(`   示例ID: ${item.samples.join(', ')}`, 'yellow')
      })
    } else {
      log('\n✅ 数据完整性检查通过，未发现孤儿记录', 'green')
    }

    return { orphanReport, totalOrphans, foreignKeys }
  } catch (error) {
    log(`\n❌ 数据完整性检查失败: ${error.message}`, 'red')
    throw error
  }
}

/**
 * 检查外键约束规则
 */
async function checkForeignKeyRules() {
  log('\n🔍 ━━━ 外键约束规则检查 ━━━', 'cyan')

  try {
    const [constraints] = await sequelize.query(`
      SELECT 
        rc.CONSTRAINT_NAME,
        kcu.TABLE_NAME,
        kcu.COLUMN_NAME,
        kcu.REFERENCED_TABLE_NAME,
        kcu.REFERENCED_COLUMN_NAME,
        rc.DELETE_RULE,
        rc.UPDATE_RULE
      FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
        ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        AND rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
      WHERE rc.CONSTRAINT_SCHEMA = DATABASE()
      ORDER BY kcu.TABLE_NAME, kcu.CONSTRAINT_NAME
    `)

    log(`\n📊 外键约束：${constraints.length}个\n`, 'blue')

    const fixes = getForeignKeyFixes()
    const recommendations = []

    constraints.forEach(constraint => {
      const fix = fixes.find(
        f =>
          f.table === constraint.TABLE_NAME &&
          f.column === constraint.COLUMN_NAME &&
          f.referenced_table === constraint.REFERENCED_TABLE_NAME
      )

      if (fix) {
        const needsFix =
          constraint.DELETE_RULE !== fix.recommended.delete ||
          constraint.UPDATE_RULE !== fix.recommended.update

        if (needsFix) {
          log(`⚠️ ${constraint.TABLE_NAME}.${constraint.COLUMN_NAME}:`, 'yellow')
          log(
            `   当前规则: ON DELETE ${constraint.DELETE_RULE}, ON UPDATE ${constraint.UPDATE_RULE}`,
            'yellow'
          )
          log(
            `   推荐规则: ON DELETE ${fix.recommended.delete}, ON UPDATE ${fix.recommended.update}`,
            'green'
          )
          log(`   原因: ${fix.reason}\n`, 'cyan')

          recommendations.push({
            constraint: constraint.CONSTRAINT_NAME,
            table: constraint.TABLE_NAME,
            column: constraint.COLUMN_NAME,
            current: {
              delete: constraint.DELETE_RULE,
              update: constraint.UPDATE_RULE
            },
            recommended: fix.recommended,
            reason: fix.reason
          })
        } else {
          log(`✅ ${constraint.TABLE_NAME}.${constraint.COLUMN_NAME}: 规则符合推荐`, 'green')
        }
      } else {
        log(
          `ℹ️ ${constraint.TABLE_NAME}.${constraint.COLUMN_NAME}: ${constraint.DELETE_RULE}/${constraint.UPDATE_RULE}`,
          'reset'
        )
      }
    })

    // 汇总
    log('\n' + '='.repeat(80), 'cyan')
    if (recommendations.length > 0) {
      log(`\n⚠️ 发现 ${recommendations.length} 个外键规则需要优化`, 'yellow')
      log('\n💡 运行修复命令:', 'cyan')
      log('   node scripts/toolkit/database-toolkit.js --action=fix-foreign-keys', 'green')
    } else {
      log('\n✅ 所有外键规则符合业务需求', 'green')
    }

    return { constraints, recommendations }
  } catch (error) {
    log(`\n❌ 外键规则检查失败: ${error.message}`, 'red')
    throw error
  }
}

/**
 * 获取数据库统计信息
 */
async function getDatabaseStats() {
  log('\n📊 ━━━ 数据库统计信息 ━━━', 'cyan')

  try {
    // 获取所有表及其行数
    const [tables] = await sequelize.query(`
      SELECT 
        TABLE_NAME,
        TABLE_ROWS,
        ROUND(DATA_LENGTH / 1024 / 1024, 2) AS data_size_mb,
        ROUND(INDEX_LENGTH / 1024 / 1024, 2) AS index_size_mb,
        ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) AS total_size_mb
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC
    `)

    log('\n表名                         行数        数据(MB)   索引(MB)   总计(MB)', 'blue')
    log('─'.repeat(80), 'blue')

    let totalRows = 0
    let totalDataSize = 0
    let totalIndexSize = 0

    tables.forEach(table => {
      const rows = String(table.TABLE_ROWS).padEnd(10)
      const dataSize = String(table.data_size_mb).padEnd(10)
      const indexSize = String(table.index_size_mb).padEnd(10)
      const totalSize = String(table.total_size_mb).padEnd(10)

      log(`${table.TABLE_NAME.padEnd(28)} ${rows} ${dataSize} ${indexSize} ${totalSize}`, 'reset')

      totalRows += table.TABLE_ROWS
      totalDataSize += parseFloat(table.data_size_mb) || 0
      totalIndexSize += parseFloat(table.index_size_mb) || 0
    })

    log('─'.repeat(80), 'blue')
    log(
      `总计 (${tables.length}个表)`.padEnd(28) +
        ` ${String(totalRows).padEnd(10)} ${String(totalDataSize.toFixed(2)).padEnd(10)} ${String(totalIndexSize.toFixed(2)).padEnd(10)} ${String((totalDataSize + totalIndexSize).toFixed(2)).padEnd(10)}`,
      'cyan'
    )

    return { tables, totalRows, totalDataSize, totalIndexSize }
  } catch (error) {
    log(`\n❌ 获取数据库统计失败: ${error.message}`, 'red')
    throw error
  }
}

// ==================== 修复功能 ====================

/**
 * 修复外键规则
 */
async function fixForeignKeyRules(options = {}) {
  const { dryRun = false } = options

  log('\n🔧 ━━━ 修复外键约束规则 ━━━', 'cyan')
  if (dryRun) {
    log('（预览模式：不会实际修改数据库）\n', 'yellow')
  }

  try {
    // 先检查需要修复的规则
    const { recommendations } = await checkForeignKeyRules()

    if (recommendations.length === 0) {
      log('\n✅ 无需修复，所有外键规则已符合要求', 'green')
      return { fixed: 0, recommendations: [] }
    }

    log(`\n准备修复 ${recommendations.length} 个外键规则...\n`, 'yellow')

    if (dryRun) {
      log('将执行以下修复操作:', 'cyan')
      recommendations.forEach((rec, index) => {
        log(`\n${index + 1}. ${rec.table}.${rec.column}:`, 'yellow')
        log(`   删除外键: DROP FOREIGN KEY ${rec.constraint}`, 'reset')
        log(
          `   重建外键: ADD CONSTRAINT ... ON DELETE ${rec.recommended.delete} ON UPDATE ${rec.recommended.update}`,
          'reset'
        )
      })
      log('\n提示：去掉 --dry-run 参数执行实际修复', 'cyan')
      return { fixed: 0, recommendations }
    }

    // 执行实际修复
    let fixedCount = 0

    for (const rec of recommendations) {
      log(`\n修复 ${rec.table}.${rec.column}...`, 'cyan')

      try {
        await sequelize.transaction(async t => {
          // 1. 删除旧外键
          await sequelize.query(
            `ALTER TABLE \`${rec.table}\` DROP FOREIGN KEY \`${rec.constraint}\``,
            { transaction: t }
          )
          log('  ✓ 删除旧外键', 'green')

          // 2. 创建新外键
          const newConstraintName = `fk_${rec.table}_${rec.column}`
          const deleteRule = rec.recommended.delete
          const updateRule = rec.recommended.update

          await sequelize.query(
            `ALTER TABLE \`${rec.table}\` 
             ADD CONSTRAINT \`${newConstraintName}\` 
             FOREIGN KEY (\`${rec.column}\`) 
             REFERENCES \`${rec.referenced_table}\`(\`${rec.referenced_column}\`)
             ON DELETE ${deleteRule}
             ON UPDATE ${updateRule}`,
            { transaction: t }
          )
          log(`  ✓ 创建新外键 (ON DELETE ${deleteRule}, ON UPDATE ${updateRule})`, 'green')
        })

        fixedCount++
        log(`✅ ${rec.table}.${rec.column} 修复成功`, 'green')
      } catch (error) {
        log(`❌ ${rec.table}.${rec.column} 修复失败: ${error.message}`, 'red')
      }
    }

    log(`\n${'='.repeat(80)}`, 'cyan')
    log(
      `修复完成: ${fixedCount}/${recommendations.length} 个外键规则已更新`,
      fixedCount === recommendations.length ? 'green' : 'yellow'
    )

    return { fixed: fixedCount, recommendations }
  } catch (error) {
    log(`\n❌ 修复外键规则失败: ${error.message}`, 'red')
    throw error
  }
}

/**
 * 全面检查
 */
async function performFullCheck() {
  log('\n' + '='.repeat(80), 'cyan')
  log('数据库全面检查', 'cyan')
  log('='.repeat(80) + '\n', 'cyan')

  const results = {}

  try {
    // 1. 数据库统计
    results.stats = await getDatabaseStats()

    // 2. 数据完整性检查
    results.integrity = await checkDatabaseIntegrity()

    // 3. 外键规则检查
    results.foreignKeys = await checkForeignKeyRules()

    // 4. 生成综合报告
    log('\n' + '='.repeat(80), 'cyan')
    log('综合检查结果', 'cyan')
    log('='.repeat(80), 'cyan')

    log(`\n📊 数据库表: ${results.stats.tables.length}个`, 'blue')
    log(`📊 总行数: ${results.stats.totalRows}`, 'blue')
    log(
      `📊 总大小: ${(results.stats.totalDataSize + results.stats.totalIndexSize).toFixed(2)} MB`,
      'blue'
    )

    if (results.integrity.totalOrphans > 0) {
      log(`\n❌ 数据完整性: 发现${results.integrity.totalOrphans}条孤儿记录`, 'red')
    } else {
      log('\n✅ 数据完整性: 通过', 'green')
    }

    if (results.foreignKeys.recommendations.length > 0) {
      log(`⚠️ 外键规则: ${results.foreignKeys.recommendations.length}个需要优化`, 'yellow')
    } else {
      log('✅ 外键规则: 符合要求', 'green')
    }

    // 保存报告
    const fs = require('fs')
    const path = require('path')
    const reportPath = path.join(process.cwd(), 'reports/database-check-report.json')
    const reportDir = path.dirname(reportPath)

    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true })
    }

    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          timestamp: BeijingTimeHelper.now(),
          results
        },
        null,
        2
      )
    )

    log(`\n📄 详细报告已生成: ${reportPath}`, 'green')

    return results
  } catch (error) {
    log(`\n❌ 全面检查失败: ${error.message}`, 'red')
    throw error
  }
}

// ==================== 主函数 ====================

async function main() {
  // 解析命令行参数
  const args = process.argv.slice(2)
  const options = {
    action: 'full-check',
    dryRun: args.includes('--dry-run')
  }

  // 解析action参数
  const actionArg = args.find(arg => arg.startsWith('--action='))
  if (actionArg) {
    options.action = actionArg.split('=')[1]
  }

  // 显示帮助信息
  if (args.includes('--help') || (args.length === 0 && !options.action)) {
    console.log(`
${colors.blue}数据库管理统一工具包 (Database Toolkit)${colors.reset}

使用方式：
  node scripts/toolkit/database-toolkit.js [选项]

选项：
  --action=check             检查数据完整性（孤儿数据）
  --action=check-foreign-keys 检查外键规则
  --action=fix-foreign-keys  修复外键规则
  --action=full-check        全面检查（默认）
  --action=orphan-check      只检查孤儿数据
  --action=stats             显示数据库统计
  --dry-run                  预览修复但不实际执行
  --help                     显示此帮助信息

示例：
  node scripts/toolkit/database-toolkit.js --action=check
  node scripts/toolkit/database-toolkit.js --action=fix-foreign-keys
  node scripts/toolkit/database-toolkit.js --action=fix-foreign-keys --dry-run
  node scripts/toolkit/database-toolkit.js --action=full-check

合并来源：
  - check-data-integrity.js
  - check-database-integrity.js
  - database_check.js
  - data-consistency-check.js
  - fix-foreign-key-rules.js
  - check-foreign-keys.js
  - fix-lottery-draws-foreign-key.js
  - fix-user-inventory-foreign-key.js
    `)
    process.exit(0)
  }

  console.log(`${colors.blue}${'='.repeat(80)}${colors.reset}`)
  console.log(`${colors.blue}数据库管理统一工具包 - Database Toolkit${colors.reset}`)
  console.log(`${colors.blue}${'='.repeat(80)}${colors.reset}`)

  try {
    switch (options.action) {
      case 'check':
      case 'orphan-check':
        await checkDatabaseIntegrity()
        break

      case 'check-foreign-keys':
        await checkForeignKeyRules()
        break

      case 'fix-foreign-keys':
        await fixForeignKeyRules(options)
        break

      case 'stats':
        await getDatabaseStats()
        break

      case 'full-check':
      default:
        await performFullCheck()
        break
    }

    await sequelize.close()
    log('\n✅ 操作完成', 'green')
    process.exit(0)
  } catch (error) {
    console.error(`${colors.red}❌ 错误:${colors.reset}`, error.message)
    console.error(error.stack)
    await sequelize.close()
    process.exit(1)
  }
}

// 执行主函数
if (require.main === module) {
  main()
}

module.exports = {
  checkDatabaseIntegrity,
  checkForeignKeyRules,
  getDatabaseStats,
  fixForeignKeyRules,
  performFullCheck
}
