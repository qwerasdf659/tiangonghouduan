/**
 * 对比备份数据与当前数据库，检查数据丢失问题
 *
 * 创建时间：2025年10月13日
 */

const fs = require('fs')
const { sequelize } = require('../../models')

async function compareBackupWithCurrent () {
  console.log('========================================')
  console.log('🔍 数据库迁移后完整性检查')
  console.log('========================================\n')

  try {
    // 1. 读取备份文件
    console.log('📋 步骤1: 读取备份文件...')
    const backupPath = './backups/data_backup_2025-10-13T15-29-37.json'
    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'))

    console.log(`  备份时间: ${backup.timestamp}`)
    console.log(`  备份数据库: ${backup.database}`)
    console.log('')

    // 2. 获取所有业务表
    console.log('📋 步骤2: 检查所有业务表...\n')

    const issues = []
    const tableNames = Object.keys(backup.tables).sort()

    for (const tableName of tableNames) {
      const backupData = backup.tables[tableName]

      try {
        // 获取当前表数据行数
        const [currentCount] = await sequelize.query(
          `SELECT COUNT(*) as count FROM ${tableName}`
        )
        const currentRows = currentCount[0].count
        const backupRows = backupData.length

        const diff = currentRows - backupRows
        const diffPercent = backupRows > 0 ? (diff / backupRows * 100).toFixed(1) : '0.0'

        let status = '✅'
        let note = ''

        if (currentRows === 0 && backupRows === 0) {
          status = '⚪'
          note = '(空表)'
        } else if (currentRows === 0 && backupRows > 0) {
          status = '🔴'
          note = `(丢失${backupRows}条数据)`
          issues.push({
            table: tableName,
            type: 'DATA_LOSS',
            severity: 'CRITICAL',
            backup: backupRows,
            current: currentRows,
            diff
          })
        } else if (diff < 0) {
          status = '⚠️'
          note = `(减少${Math.abs(diff)}条，${diffPercent}%)`
          issues.push({
            table: tableName,
            type: 'DATA_DECREASE',
            severity: 'HIGH',
            backup: backupRows,
            current: currentRows,
            diff
          })
        } else if (diff > 0) {
          status = '📈'
          note = `(增长${diff}条，+${diffPercent}%)`
        }

        console.log(`${status} ${tableName.padEnd(30)} 备份:${String(backupRows).padStart(4)} → 当前:${String(currentRows).padStart(4)} ${note}`)
      } catch (error) {
        console.log(`❌ ${tableName.padEnd(30)} 检查失败: ${error.message}`)
        issues.push({
          table: tableName,
          type: 'CHECK_ERROR',
          severity: 'HIGH',
          error: error.message
        })
      }
    }

    console.log('')
    console.log('========================================')
    console.log('📊 检查结果汇总')
    console.log('========================================\n')

    if (issues.length === 0) {
      console.log('✅ 所有表数据完整，无丢失')
    } else {
      console.log(`🔴 发现 ${issues.length} 个问题:\n`)

      // 按严重程度分组
      const critical = issues.filter(i => i.severity === 'CRITICAL')
      const high = issues.filter(i => i.severity === 'HIGH')

      if (critical.length > 0) {
        console.log('🔴 严重问题 (数据完全丢失):')
        critical.forEach(issue => {
          console.log(`  - ${issue.table}: 丢失${issue.backup}条数据`)
        })
        console.log('')
      }

      if (high.length > 0) {
        console.log('⚠️ 高优先级问题 (数据减少):')
        high.forEach(issue => {
          if (issue.type === 'DATA_DECREASE') {
            console.log(`  - ${issue.table}: 减少${Math.abs(issue.diff)}条 (${issue.backup} → ${issue.current})`)
          } else if (issue.type === 'CHECK_ERROR') {
            console.log(`  - ${issue.table}: ${issue.error}`)
          }
        })
        console.log('')
      }
    }

    // 3. 检查表结构完整性
    console.log('========================================')
    console.log('📋 步骤3: 检查表结构完整性')
    console.log('========================================\n')

    const structureIssues = []

    // 重点检查已知的关联表
    const criticalTables = ['user_roles', 'roles', 'users']

    for (const tableName of criticalTables) {
      try {
        const [fields] = await sequelize.query(`DESCRIBE ${tableName}`)
        const currentFields = fields.map(f => f.Field)

        if (backup.tables[tableName] && backup.tables[tableName].length > 0) {
          const backupFields = Object.keys(backup.tables[tableName][0])

          // 检查缺失的字段
          const missingFields = backupFields.filter(f => !currentFields.includes(f))

          if (missingFields.length > 0) {
            console.log(`⚠️ ${tableName}: 缺少字段`)
            missingFields.forEach(field => {
              console.log(`    - ${field}`)
            })
            structureIssues.push({
              table: tableName,
              missingFields
            })
          } else {
            console.log(`✅ ${tableName}: 表结构完整`)
          }
        }
      } catch (error) {
        console.log(`❌ ${tableName}: 检查失败 - ${error.message}`)
      }
    }

    console.log('')

    // 4. 生成修复建议
    if (issues.length > 0 || structureIssues.length > 0) {
      console.log('========================================')
      console.log('🔧 修复建议')
      console.log('========================================\n')

      if (issues.some(i => i.type === 'DATA_LOSS')) {
        console.log('1. 恢复丢失的数据:')
        issues.filter(i => i.type === 'DATA_LOSS').forEach(issue => {
          console.log(`   node scripts/database/restore-table-data.js ${issue.table}`)
        })
        console.log('')
      }

      if (structureIssues.length > 0) {
        console.log('2. 修复表结构:')
        structureIssues.forEach(issue => {
          console.log(`   需要为 ${issue.table} 添加字段: ${issue.missingFields.join(', ')}`)
        })
        console.log('')
      }
    }

    // 5. 保存检查报告
    const report = {
      timestamp: new Date().toISOString(),
      backup_file: backupPath,
      backup_time: backup.timestamp,
      issues,
      structure_issues: structureIssues,
      total_tables_checked: tableNames.length,
      tables_with_issues: issues.length
    }

    fs.writeFileSync(
      './backups/migration-check-report.json',
      JSON.stringify(report, null, 2)
    )
    console.log('📄 详细报告已保存到: backups/migration-check-report.json\n')

    await sequelize.close()

    // 返回退出码
    if (issues.some(i => i.severity === 'CRITICAL')) {
      process.exit(1) // 严重问题
    } else if (issues.length > 0) {
      process.exit(2) // 一般问题
    } else {
      process.exit(0) // 无问题
    }
  } catch (error) {
    console.error('\n❌ 检查失败:', error.message)
    console.error(error.stack)
    await sequelize.close()
    process.exit(1)
  }
}

// 执行检查
compareBackupWithCurrent()
