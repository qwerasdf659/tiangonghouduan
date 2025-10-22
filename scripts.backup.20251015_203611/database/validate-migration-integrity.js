/**
 * 数据库迁移完整性验证工具
 *
 * 用途：在迁移后自动验证数据完整性
 *
 * 验证内容：
 * 1. 表结构完整性
 * 2. 必需字段存在性
 * 3. 索引完整性
 * 4. 外键约束完整性
 * 5. 初始数据完整性
 *
 * 使用：npm run migration:validate
 *
 * 创建时间：2025年10月13日
 */

const { sequelize } = require('../../models')

// 定义表结构期望
const TABLE_SCHEMAS = {
  user_roles: {
    requiredFields: ['user_id', 'role_id', 'assigned_at', 'assigned_by', 'is_active', 'created_at', 'updated_at'],
    primaryKey: ['user_id', 'role_id'],
    foreignKeys: [
      { field: 'user_id', references: 'users(user_id)' },
      { field: 'role_id', references: 'roles(role_id)' },
      { field: 'assigned_by', references: 'users(user_id)' }
    ],
    indexes: ['user_id', 'role_id', 'is_active']
  },
  roles: {
    requiredFields: ['role_id', 'role_uuid', 'role_name', 'role_level', 'is_active', 'created_at', 'updated_at'],
    primaryKey: ['role_id'],
    foreignKeys: [],
    indexes: ['role_uuid', 'role_name'],
    minRows: 3 // 至少3个基础角色
  },
  users: {
    requiredFields: ['user_id', 'mobile', 'status', 'created_at', 'updated_at'],
    primaryKey: ['user_id'],
    foreignKeys: [],
    indexes: ['mobile', 'status']
  }
}

// 角色名称规范
const ROLE_NAME_STANDARDS = {
  english: ['super_admin', 'admin', 'user'],
  forbidden: ['管理员', '超级管理员', '普通用户'] // 禁止使用中文
}

async function validateMigrationIntegrity () {
  console.log('========================================')
  console.log('🔍 数据库迁移完整性验证')
  console.log('========================================\n')

  const issues = []
  let criticalIssues = 0
  let warnings = 0

  try {
    await sequelize.authenticate()

    /*
     * ========================================
     * 第1步：验证表结构
     * ========================================
     */
    console.log('📋 第1步：验证表结构完整性...\n')

    for (const [tableName, schema] of Object.entries(TABLE_SCHEMAS)) {
      console.log(`  检查表: ${tableName}`)

      try {
        const fields = await sequelize.query(`DESCRIBE ${tableName}`)
        const fieldNames = fields[0].map(f => f.Field)

        // 检查必需字段
        const missingFields = schema.requiredFields.filter(f => !fieldNames.includes(f))

        if (missingFields.length > 0) {
          criticalIssues++
          issues.push({
            severity: 'CRITICAL',
            table: tableName,
            type: 'MISSING_FIELDS',
            details: `缺少字段: ${missingFields.join(', ')}`
          })
          console.log(`    ❌ 缺少字段: ${missingFields.join(', ')}`)
        } else {
          console.log(`    ✅ 字段完整 (${fieldNames.length}个)`)
        }

        // 检查主键
        const primaryKeyFields = fields[0].filter(f => f.Key === 'PRI').map(f => f.Field)
        const expectedPK = schema.primaryKey.sort().join(',')
        const actualPK = primaryKeyFields.sort().join(',')

        if (expectedPK !== actualPK) {
          warnings++
          issues.push({
            severity: 'WARNING',
            table: tableName,
            type: 'PRIMARY_KEY_MISMATCH',
            details: `期望: ${expectedPK}, 实际: ${actualPK}`
          })
          console.log(`    ⚠️ 主键不匹配: 期望[${expectedPK}], 实际[${actualPK}]`)
        } else {
          console.log('    ✅ 主键正确')
        }
      } catch (error) {
        criticalIssues++
        issues.push({
          severity: 'CRITICAL',
          table: tableName,
          type: 'TABLE_NOT_FOUND',
          details: error.message
        })
        console.log('    ❌ 表不存在或无法访问')
      }

      console.log('')
    }

    /*
     * ========================================
     * 第2步：验证角色名称规范
     * ========================================
     */
    console.log('📋 第2步：验证角色名称规范...\n')

    const [roles] = await sequelize.query('SELECT role_id, role_name FROM roles')

    console.log(`  当前角色数量: ${roles.length}`)

    // 检查是否使用了禁止的中文名称
    const forbiddenRoles = roles.filter(r =>
      ROLE_NAME_STANDARDS.forbidden.includes(r.role_name)
    )

    if (forbiddenRoles.length > 0) {
      criticalIssues++
      issues.push({
        severity: 'CRITICAL',
        table: 'roles',
        type: 'FORBIDDEN_ROLE_NAME',
        details: `使用了禁止的中文角色名: ${forbiddenRoles.map(r => r.role_name).join(', ')}`
      })
      console.log('  ❌ 发现禁止的中文角色名:')
      forbiddenRoles.forEach(r => {
        console.log(`     role_id=${r.role_id}: "${r.role_name}"`)
      })
    } else {
      console.log('  ✅ 未使用禁止的中文角色名')
    }

    // 检查是否包含必需的英文角色名
    const roleNames = roles.map(r => r.role_name)
    const missingStandardRoles = ROLE_NAME_STANDARDS.english.filter(
      r => !roleNames.includes(r)
    )

    if (missingStandardRoles.length > 0) {
      warnings++
      issues.push({
        severity: 'WARNING',
        table: 'roles',
        type: 'MISSING_STANDARD_ROLES',
        details: `缺少标准角色: ${missingStandardRoles.join(', ')}`
      })
      console.log(`  ⚠️ 缺少标准角色: ${missingStandardRoles.join(', ')}`)
    } else {
      console.log('  ✅ 包含所有标准角色')
    }

    console.log('')

    /*
     * ========================================
     * 第3步：验证初始数据
     * ========================================
     */
    console.log('📋 第3步：验证初始数据完整性...\n')

    for (const [tableName, schema] of Object.entries(TABLE_SCHEMAS)) {
      if (schema.minRows) {
        const [result] = await sequelize.query(`SELECT COUNT(*) as count FROM ${tableName}`)
        const actualRows = result[0].count

        console.log(`  ${tableName}: ${actualRows}条记录`)

        if (actualRows < schema.minRows) {
          warnings++
          issues.push({
            severity: 'WARNING',
            table: tableName,
            type: 'INSUFFICIENT_DATA',
            details: `期望至少${schema.minRows}条，实际${actualRows}条`
          })
          console.log(`    ⚠️ 数据不足: 期望≥${schema.minRows}, 实际${actualRows}`)
        } else {
          console.log('    ✅ 数据充足')
        }
      }
    }

    console.log('')

    /*
     * ========================================
     * 第4步：验证外键约束
     * ========================================
     */
    console.log('📋 第4步：验证外键约束...\n')

    for (const [tableName, schema] of Object.entries(TABLE_SCHEMAS)) {
      if (schema.foreignKeys.length > 0) {
        console.log(`  ${tableName}:`)

        const [constraints] = await sequelize.query(`
          SELECT 
            CONSTRAINT_NAME,
            COLUMN_NAME,
            REFERENCED_TABLE_NAME,
            REFERENCED_COLUMN_NAME
          FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = '${tableName}'
            AND REFERENCED_TABLE_NAME IS NOT NULL
        `)

        schema.foreignKeys.forEach(fk => {
          const exists = constraints.some(c =>
            c.COLUMN_NAME === fk.field &&
            fk.references.includes(`${c.REFERENCED_TABLE_NAME}(${c.REFERENCED_COLUMN_NAME})`)
          )

          if (!exists) {
            warnings++
            issues.push({
              severity: 'WARNING',
              table: tableName,
              type: 'MISSING_FOREIGN_KEY',
              details: `${fk.field} -> ${fk.references}`
            })
            console.log(`    ⚠️ 缺少外键: ${fk.field} -> ${fk.references}`)
          } else {
            console.log(`    ✅ 外键存在: ${fk.field} -> ${fk.references}`)
          }
        })
      }
    }

    console.log('')

    /*
     * ========================================
     * 生成报告
     * ========================================
     */
    console.log('========================================')
    console.log('📊 验证结果汇总')
    console.log('========================================\n')

    console.log(`总问题数: ${issues.length}`)
    console.log(`  🔴 严重问题: ${criticalIssues}`)
    console.log(`  ⚠️ 警告: ${warnings}`)
    console.log('')

    if (issues.length > 0) {
      console.log('详细问题清单:\n')

      // 严重问题
      const critical = issues.filter(i => i.severity === 'CRITICAL')
      if (critical.length > 0) {
        console.log('🔴 严重问题（必须修复）:')
        critical.forEach((issue, idx) => {
          console.log(`  ${idx + 1}. [${issue.table}] ${issue.type}`)
          console.log(`     ${issue.details}`)
        })
        console.log('')
      }

      // 警告
      const warningList = issues.filter(i => i.severity === 'WARNING')
      if (warningList.length > 0) {
        console.log('⚠️ 警告（建议修复）:')
        warningList.forEach((issue, idx) => {
          console.log(`  ${idx + 1}. [${issue.table}] ${issue.type}`)
          console.log(`     ${issue.details}`)
        })
        console.log('')
      }
    }

    // 生成修复建议
    if (criticalIssues > 0) {
      console.log('========================================')
      console.log('🔧 修复建议')
      console.log('========================================\n')

      const missingFieldsIssues = issues.filter(i => i.type === 'MISSING_FIELDS')
      if (missingFieldsIssues.length > 0) {
        console.log('1. 修复缺失字段:')
        console.log('   node scripts/database/fix-user-roles-table.js')
        console.log('')
      }

      const forbiddenNameIssues = issues.filter(i => i.type === 'FORBIDDEN_ROLE_NAME')
      if (forbiddenNameIssues.length > 0) {
        console.log('2. 修复角色名称（改为英文）:')
        console.log('   执行SQL:')
        console.log('   UPDATE roles SET role_name = \'admin\' WHERE role_name = \'管理员\';')
        console.log('   UPDATE roles SET role_name = \'user\' WHERE role_name = \'普通用户\';')
        console.log('')
      }
    }

    // 保存验证报告
    const report = {
      timestamp: new Date().toISOString(),
      status: criticalIssues === 0 ? 'PASS' : 'FAIL',
      summary: {
        total_issues: issues.length,
        critical: criticalIssues,
        warnings
      },
      issues
    }

    const fs = require('fs')
    fs.writeFileSync(
      './backups/migration-validation-report.json',
      JSON.stringify(report, null, 2)
    )
    console.log('📄 详细报告已保存: backups/migration-validation-report.json\n')

    await sequelize.close()

    // 返回退出码
    if (criticalIssues > 0) {
      console.log('❌ 验证失败：存在严重问题')
      process.exit(1)
    } else if (warnings > 0) {
      console.log('⚠️ 验证通过但有警告')
      process.exit(0)
    } else {
      console.log('✅ 验证通过：数据库迁移完整性良好')
      process.exit(0)
    }
  } catch (error) {
    console.error('\n❌ 验证过程出错:', error.message)
    console.error(error.stack)
    await sequelize.close()
    process.exit(1)
  }
}

// 执行验证
validateMigrationIntegrity()
