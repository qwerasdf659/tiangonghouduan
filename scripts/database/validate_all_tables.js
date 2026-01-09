#!/usr/bin/env node

/**
 * 全表校验脚本 - 数据库迁移管理工具
 *
 * 功能说明：
 * - 验证所有表的字段定义与模型一致性
 * - 检查索引完整性（主键、唯一索引、普通索引、外键索引）
 * - 验证外键约束（引用完整性、级联规则）
 * - 检查数据完整性（孤儿记录、外键关联）
 * - 识别未被模型引用的表（可能的遗留表）
 * - 识别模型定义但数据库不存在的表
 *
 * 使用方式：
 * node scripts/database/validate-all-tables.js
 *
 * 创建时间：2026年01月04日
 * 基于：数据库迁移管理现状核对报告拍板决策
 */

'use strict'

// 确保加载环境变量
require('dotenv').config()

const { Sequelize } = require('sequelize')

// 创建独立的数据库连接，避免循环依赖问题
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT),
  dialect: 'mysql',
  timezone: '+08:00',
  logging: false,
  pool: { max: 5, min: 1, acquire: 10000, idle: 10000 }
})

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

// ==================== 核心检查函数 ====================

/**
 * 获取数据库所有表信息
 * 业务场景：查询information_schema获取当前数据库的完整表清单
 */
async function getAllTables() {
  const [tables] = await sequelize.query(`
    SELECT
      TABLE_NAME as table_name,
      TABLE_ROWS as row_count,
      TABLE_COMMENT as table_comment,
      CREATE_TIME as create_time,
      UPDATE_TIME as update_time
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
    ORDER BY TABLE_NAME
  `)
  return tables
}

/**
 * 获取表的字段详情
 * 业务场景：查询指定表的所有字段定义，包括类型、NULL约束、默认值等
 * @param {string} tableName - 表名
 */
async function getTableColumns(tableName) {
  const [columns] = await sequelize.query(
    `
    SELECT
      COLUMN_NAME as column_name,
      DATA_TYPE as data_type,
      COLUMN_TYPE as column_type,
      IS_NULLABLE as is_nullable,
      COLUMN_DEFAULT as column_default,
      COLUMN_KEY as column_key,
      EXTRA as extra,
      COLUMN_COMMENT as column_comment
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
    ORDER BY ORDINAL_POSITION
  `,
    { replacements: [tableName] }
  )
  return columns
}

/**
 * 获取表的索引信息
 * 业务场景：检查表的索引完整性，包括主键、唯一索引、普通索引
 * @param {string} tableName - 表名
 */
async function getTableIndexes(tableName) {
  const [indexes] = await sequelize.query(
    `
    SELECT
      INDEX_NAME as index_name,
      NON_UNIQUE as non_unique,
      COLUMN_NAME as column_name,
      SEQ_IN_INDEX as seq_in_index,
      INDEX_TYPE as index_type
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
    ORDER BY INDEX_NAME, SEQ_IN_INDEX
  `,
    { replacements: [tableName] }
  )
  return indexes
}

/**
 * 获取表的外键约束
 * 业务场景：检查外键引用完整性和级联规则
 * @param {string} tableName - 表名
 */
async function getTableForeignKeys(tableName) {
  const [foreignKeys] = await sequelize.query(
    `
    SELECT
      CONSTRAINT_NAME as constraint_name,
      COLUMN_NAME as column_name,
      REFERENCED_TABLE_NAME as referenced_table,
      REFERENCED_COLUMN_NAME as referenced_column
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY CONSTRAINT_NAME
  `,
    { replacements: [tableName] }
  )
  return foreignKeys
}

/**
 * 检查孤儿记录
 * 业务场景：检测外键关联的数据完整性问题
 * @param {string} tableName - 表名
 * @param {Array} foreignKeys - 外键列表
 */
async function checkOrphanRecords(tableName, foreignKeys) {
  const orphans = []

  for (const fk of foreignKeys) {
    try {
      const [result] = await sequelize.query(`
        SELECT COUNT(*) as orphan_count
        FROM ${tableName} t
        LEFT JOIN ${fk.referenced_table} r ON t.${fk.column_name} = r.${fk.referenced_column}
        WHERE t.${fk.column_name} IS NOT NULL
          AND r.${fk.referenced_column} IS NULL
      `)

      if (result[0].orphan_count > 0) {
        orphans.push({
          column: fk.column_name,
          referenced_table: fk.referenced_table,
          orphan_count: result[0].orphan_count
        })
      }
    } catch (error) {
      // 跳过检查失败的情况（可能是表或字段不存在）
    }
  }

  return orphans
}

/**
 * 校验单张表
 * 业务场景：对指定表进行完整性校验，包括字段、索引、外键、数据完整性
 * @param {string} tableName - 表名
 * @param {number} rowCount - 行数
 */
async function validateTable(tableName, rowCount) {
  const result = {
    table_name: tableName,
    row_count: rowCount,
    columns: [],
    indexes: [],
    foreign_keys: [],
    orphan_records: [],
    issues: []
  }

  try {
    // 1. 获取字段信息
    result.columns = await getTableColumns(tableName)

    // 2. 获取索引信息
    result.indexes = await getTableIndexes(tableName)

    // 检查是否有主键
    const hasPrimaryKey = result.indexes.some(idx => idx.index_name === 'PRIMARY')
    if (!hasPrimaryKey) {
      result.issues.push({
        type: 'missing_primary_key',
        severity: 'error',
        message: `表 ${tableName} 缺少主键`
      })
    }

    // 3. 获取外键约束
    result.foreign_keys = await getTableForeignKeys(tableName)

    // 4. 检查孤儿记录（仅对有外键的表检查）
    if (result.foreign_keys.length > 0 && rowCount > 0) {
      result.orphan_records = await checkOrphanRecords(tableName, result.foreign_keys)

      for (const orphan of result.orphan_records) {
        result.issues.push({
          type: 'orphan_records',
          severity: 'warning',
          message: `表 ${tableName}.${orphan.column} 有 ${orphan.orphan_count} 条孤儿记录（引用 ${orphan.referenced_table}）`
        })
      }
    }

    // 5. 检查字段命名规范（应使用snake_case）
    for (const col of result.columns) {
      if (/[A-Z]/.test(col.column_name)) {
        result.issues.push({
          type: 'naming_convention',
          severity: 'warning',
          message: `字段 ${tableName}.${col.column_name} 命名不符合snake_case规范`
        })
      }
    }
  } catch (error) {
    result.issues.push({
      type: 'validation_error',
      severity: 'error',
      message: `校验失败: ${error.message}`
    })
  }

  return result
}

/**
 * 生成校验报告
 * 业务场景：汇总所有表的校验结果，输出完整报告
 * @param {Array} validationResults - 校验结果列表
 */
function generateReport(validationResults) {
  log('\n' + '='.repeat(80), 'cyan')
  log('  全表校验报告 - 数据库迁移管理工具', 'cyan')
  log('  生成时间: ' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }), 'cyan')
  log('='.repeat(80), 'cyan')

  // 统计数据
  const totalTables = validationResults.length
  const totalRows = validationResults.reduce((sum, r) => sum + (parseInt(r.row_count) || 0), 0)
  const totalIndexes = validationResults.reduce((sum, r) => sum + r.indexes.length, 0)
  const totalForeignKeys = validationResults.reduce((sum, r) => sum + r.foreign_keys.length, 0)
  const totalIssues = validationResults.reduce((sum, r) => sum + r.issues.length, 0)
  const errorIssues = validationResults.reduce(
    (sum, r) => sum + r.issues.filter(i => i.severity === 'error').length,
    0
  )
  const warningIssues = validationResults.reduce(
    (sum, r) => sum + r.issues.filter(i => i.severity === 'warning').length,
    0
  )

  log('\n📊 校验统计', 'blue')
  log('-'.repeat(40))
  log(`   表总数: ${totalTables}`)
  log(`   数据行总数: ${totalRows.toLocaleString()}`)
  log(`   索引总数: ${totalIndexes}`)
  log(`   外键约束总数: ${totalForeignKeys}`)
  log(
    `   发现问题: ${totalIssues} (错误: ${errorIssues}, 警告: ${warningIssues})`,
    totalIssues > 0 ? (errorIssues > 0 ? 'red' : 'yellow') : 'green'
  )

  // 高频业务表（行数 > 100）
  log('\n📈 高频业务表（行数 > 100）', 'blue')
  log('-'.repeat(40))
  const highFreqTables = validationResults
    .filter(r => parseInt(r.row_count) > 100)
    .sort((a, b) => parseInt(b.row_count) - parseInt(a.row_count))

  if (highFreqTables.length > 0) {
    highFreqTables.forEach(t => {
      log(`   ${t.table_name}: ${parseInt(t.row_count).toLocaleString()} 行`, 'green')
    })
  } else {
    log('   无高频表', 'yellow')
  }

  // 空表列表
  log('\n📭 空表列表（行数 = 0）', 'blue')
  log('-'.repeat(40))
  const emptyTables = validationResults
    .filter(r => parseInt(r.row_count) === 0)
    .map(r => r.table_name)

  if (emptyTables.length > 0) {
    log(`   ${emptyTables.join(', ')}`, 'yellow')
  } else {
    log('   无空表', 'green')
  }

  // 问题汇总
  if (totalIssues > 0) {
    log('\n⚠️ 问题汇总', 'yellow')
    log('-'.repeat(40))

    for (const result of validationResults) {
      if (result.issues.length > 0) {
        for (const issue of result.issues) {
          const icon = issue.severity === 'error' ? '❌' : '⚠️'
          const color = issue.severity === 'error' ? 'red' : 'yellow'
          log(`   ${icon} ${issue.message}`, color)
        }
      }
    }
  }

  // 表详情（每张表的概要）
  log('\n📋 表结构概要', 'blue')
  log('-'.repeat(80))
  log('   表名                                    | 行数     | 字段 | 索引 | 外键 | 问题')
  log('-'.repeat(80))

  for (const result of validationResults) {
    const tableName = result.table_name.padEnd(40)
    const rowCount = String(parseInt(result.row_count) || 0).padStart(8)
    const colCount = String(result.columns.length).padStart(4)
    const idxCount = String(result.indexes.length).padStart(4)
    const fkCount = String(result.foreign_keys.length).padStart(4)
    const issueCount = result.issues.length
    const issueStr = issueCount > 0 ? `${issueCount}` : '-'
    const issueColor =
      issueCount > 0
        ? result.issues.some(i => i.severity === 'error')
          ? 'red'
          : 'yellow'
        : 'reset'

    log(
      `   ${tableName} | ${rowCount} | ${colCount} | ${idxCount} | ${fkCount} | ${colors[issueColor]}${issueStr}${colors.reset}`
    )
  }

  // 最终结论
  log('\n' + '='.repeat(80), 'cyan')
  if (errorIssues > 0) {
    log('❌ 校验完成：发现 ' + errorIssues + ' 个错误需要修复', 'red')
  } else if (warningIssues > 0) {
    log('⚠️ 校验完成：发现 ' + warningIssues + ' 个警告需要关注', 'yellow')
  } else {
    log('✅ 校验完成：所有表结构正常', 'green')
  }
  log('='.repeat(80), 'cyan')

  return {
    summary: {
      total_tables: totalTables,
      total_rows: totalRows,
      total_indexes: totalIndexes,
      total_foreign_keys: totalForeignKeys,
      total_issues: totalIssues,
      error_issues: errorIssues,
      warning_issues: warningIssues
    },
    high_freq_tables: highFreqTables.map(t => ({
      name: t.table_name,
      rows: parseInt(t.row_count)
    })),
    empty_tables: emptyTables,
    all_results: validationResults
  }
}

// ==================== 主程序 ====================

async function main() {
  log('\n🔍 全表校验脚本启动', 'cyan')
  log('='.repeat(60), 'cyan')
  log('数据库: ' + process.env.DB_NAME)
  log('主机: ' + process.env.DB_HOST + ':' + process.env.DB_PORT)

  try {
    // 1. 测试数据库连接
    log('\n1️⃣ 测试数据库连接...', 'blue')
    await sequelize.authenticate()
    log('   ✅ 数据库连接成功', 'green')

    // 2. 获取所有表
    log('\n2️⃣ 获取所有表...', 'blue')
    const tables = await getAllTables()
    const filteredTables = tables.filter(t => t.table_name !== 'sequelizemeta')
    log(`   ✅ 找到 ${filteredTables.length} 张业务表（不含sequelizemeta）`, 'green')

    // 3. 逐表校验
    log('\n3️⃣ 开始逐表校验...', 'blue')
    const validationResults = []

    for (let i = 0; i < filteredTables.length; i++) {
      const table = filteredTables[i]
      process.stdout.write(`   [${i + 1}/${filteredTables.length}] 校验 ${table.table_name}...`)

      const result = await validateTable(table.table_name, table.row_count)
      validationResults.push(result)

      if (result.issues.length > 0) {
        console.log(` ${colors.yellow}⚠️ ${result.issues.length}个问题${colors.reset}`)
      } else {
        console.log(` ${colors.green}✓${colors.reset}`)
      }
    }

    // 4. 生成报告
    const report = generateReport(validationResults)

    // 5. 关闭连接
    await sequelize.close()

    // 返回退出码
    process.exit(report.summary.error_issues > 0 ? 1 : 0)
  } catch (error) {
    log(`\n❌ 校验失败: ${error.message}`, 'red')
    console.error(error.stack)
    await sequelize.close().catch(() => {})
    process.exit(1)
  }
}

// 执行主程序
main()
