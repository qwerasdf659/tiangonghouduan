#!/usr/bin/env node
/**
 * 数据完整性检查脚本
 *
 * 功能：
 * 1. 检查所有外键关系的孤儿记录
 * 2. 检查外键约束是否存在
 * 3. 检查删除策略是否合理
 * 4. 生成详细报告
 *
 * 使用：node scripts/check-data-integrity.js
 *
 * 创建时间：2025年10月09日
 */

const { sequelize } = require('../models')

// ANSI 颜色代码
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
}

function log (message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

async function checkDataIntegrity () {
  try {
    log('\n🔍 ===== 数据完整性检查开始 =====\n', 'cyan')
    log(`检查时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n`, 'blue')

    // 1. 获取所有外键关系
    const [foreignKeys] = await sequelize.query(`
      SELECT 
        TABLE_NAME,
        COLUMN_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME
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
          log(`❌ ${fk.TABLE_NAME}.${fk.COLUMN_NAME} → ${fk.REFERENCED_TABLE_NAME}: ${orphanCount}条孤儿记录`, 'red')

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
          log(`✅ ${fk.TABLE_NAME}.${fk.COLUMN_NAME} → ${fk.REFERENCED_TABLE_NAME}: 数据一致`, 'green')
        }
      } catch (error) {
        log(`⚠️ ${fk.TABLE_NAME}.${fk.COLUMN_NAME}: 检查跳过 (${error.message})`, 'yellow')
      }
    }

    // 3. 检查外键约束完整性
    log('\n🔍 检查外键约束完整性...\n', 'cyan')

    const [allTables] = await sequelize.query(`
      SELECT DISTINCT TABLE_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND COLUMN_NAME LIKE '%_id'
        AND TABLE_NAME NOT LIKE '%_backup%'
      ORDER BY TABLE_NAME
    `)

    const missingConstraints = []

    for (const table of allTables) {
      const tableName = table.TABLE_NAME

      // 获取该表的所有 *_id 列
      const [idColumns] = await sequelize.query(`
        SELECT COLUMN_NAME
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = '${tableName}'
          AND COLUMN_NAME LIKE '%_id'
          AND COLUMN_NAME != 'user_role_id'
          AND COLUMN_NAME != 'session_id'
          AND COLUMN_NAME != 'prize_id'
          AND COLUMN_NAME != 'product_id'
          AND COLUMN_NAME != 'campaign_id'
          AND COLUMN_NAME != 'account_id'
      `)

      // 检查每个 ID 列是否有外键约束
      for (const col of idColumns) {
        const columnName = col.COLUMN_NAME

        const hasForeignKey = foreignKeys.some(
          fk => fk.TABLE_NAME === tableName && fk.COLUMN_NAME === columnName
        )

        if (!hasForeignKey) {
          log(`⚠️ ${tableName}.${columnName}: 可能缺少外键约束`, 'yellow')
          missingConstraints.push({ table: tableName, column: columnName })
        }
      }
    }

    // 4. 检查删除策略
    log('\n🔍 检查外键删除策略...\n', 'cyan')

    const [constraints] = await sequelize.query(`
      SELECT 
        rc.TABLE_NAME,
        kcu.COLUMN_NAME,
        kcu.REFERENCED_TABLE_NAME,
        rc.DELETE_RULE
      FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
        ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        AND rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
      WHERE rc.CONSTRAINT_SCHEMA = DATABASE()
      ORDER BY rc.DELETE_RULE, rc.TABLE_NAME
    `)

    const deleteRuleStats = {}
    constraints.forEach(c => {
      const rule = c.DELETE_RULE
      if (!deleteRuleStats[rule]) {
        deleteRuleStats[rule] = []
      }
      deleteRuleStats[rule].push(`${c.TABLE_NAME}.${c.COLUMN_NAME}`)
    })

    Object.entries(deleteRuleStats).forEach(([rule, tables]) => {
      const icon = rule === 'CASCADE' ? '✅' : rule === 'SET NULL' ? '⚠️' : '❌'
      const color = rule === 'CASCADE' ? 'green' : rule === 'SET NULL' ? 'yellow' : 'red'
      log(`${icon} ${rule}: ${tables.length}个外键`, color)
    })

    // 5. 生成报告
    log('\n📊 ===== 检查结果汇总 =====\n', 'cyan')

    // 孤儿记录报告
    if (orphanReport.length > 0) {
      log(`❌ 发现 ${totalOrphans} 条孤儿记录（${orphanReport.length}个外键）\n`, 'red')

      orphanReport.forEach((report, index) => {
        log(`${index + 1}. 表: ${report.table}`, 'yellow')
        log(`   外键: ${report.column} → ${report.references}`, 'yellow')
        log(`   孤儿数: ${report.count}条`, 'yellow')
        log(`   示例ID: ${report.samples.join(', ')}\n`, 'yellow')
      })

      log('💡 建议操作:', 'cyan')
      log('  1. 备份数据：CREATE TABLE xxx_backup AS SELECT * FROM xxx;', 'blue')
      log('  2. 清理孤儿：DELETE FROM xxx WHERE yyy_id NOT IN (...);', 'blue')
      log('  3. 添加约束：ALTER TABLE xxx ADD CONSTRAINT ...;\n', 'blue')
    } else {
      log('✅ 未发现孤儿记录！数据完全一致。\n', 'green')
    }

    // 缺失约束报告
    if (missingConstraints.length > 0) {
      log(`⚠️ 可能缺少外键约束：${missingConstraints.length}个\n`, 'yellow')
      missingConstraints.forEach((item, index) => {
        log(`${index + 1}. ${item.table}.${item.column}`, 'yellow')
      })
    }

    // 删除策略报告
    const noCascade = constraints.filter(c => c.DELETE_RULE !== 'CASCADE').length
    if (noCascade > 0) {
      log(`\n⚠️ ${noCascade} 个外键未使用 CASCADE 删除策略`, 'yellow')
      log('建议：根据业务逻辑评估是否需要调整\n', 'blue')
    }

    log('========================\n', 'cyan')

    // 退出码
    if (totalOrphans > 0) {
      log('❌ 检查失败：存在数据一致性问题\n', 'red')
      process.exit(1)
    } else {
      log('✅ 检查通过：数据完整性良好\n', 'green')
      process.exit(0)
    }
  } catch (error) {
    log(`\n❌ 检查失败: ${error.message}\n`, 'red')
    console.error(error.stack)
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

// 执行检查
checkDataIntegrity()
