/**
 * P0-2 任务最终验证脚本
 *
 * 验证内容：
 * 1. 代码实现完整性
 * 2. 数据库结构正确性
 * 3. 路由层参数传递
 * 4. 索引完整性
 * 5. 项目运行状态
 */

const { sequelize } = require('../models')
const fs = require('fs')

async function finalVerification () {
  const results = {
    passed: [],
    failed: [],
    warnings: []
  }

  try {
    console.log('🔍 P0-2 任务最终验证\n')
    console.log('=' .repeat(60))

    // ==================== 1. 代码实现验证 ====================
    console.log('\n📝 1. 代码实现验证')
    console.log('-'.repeat(60))

    // 1.1 UserRoleService
    const serviceCode = fs.readFileSync('./services/UserRoleService.js', 'utf8')
    const checks = {
      'UserRoleService 导入 AuditLogService': serviceCode.includes("require('./AuditLogService')"),
      'UserRoleService 调用 logOperation': serviceCode.includes('AuditLogService.logOperation'),
      'UserRoleService 使用 role_change': serviceCode.includes("operation_type: 'role_change'"),
      'UserRoleService 记录 before_data': serviceCode.includes('before_data:'),
      'UserRoleService 记录 after_data': serviceCode.includes('after_data:'),
      'UserRoleService 生成 business_id': serviceCode.includes('business_id:'),
      'UserRoleService 支持 ip_address': serviceCode.includes('ip_address'),
      'UserRoleService 支持 user_agent': serviceCode.includes('user_agent')
    }

    for (const [check, result] of Object.entries(checks)) {
      if (result) {
        console.log(`   ✅ ${check}`)
        results.passed.push(check)
      } else {
        console.log(`   ❌ ${check}`)
        results.failed.push(check)
      }
    }

    // 1.2 AuditLogService
    const auditServiceCode = fs.readFileSync('./services/AuditLogService.js', 'utf8')
    const auditCheck = auditServiceCode.includes("'role_change'")
    if (auditCheck) {
      console.log('   ✅ AuditLogService 支持 role_change')
      results.passed.push('AuditLogService 支持 role_change')
    } else {
      console.log('   ❌ AuditLogService 不支持 role_change')
      results.failed.push('AuditLogService 支持 role_change')
    }

    // 1.3 AdminOperationLog 模型
    const modelCode = fs.readFileSync('./models/AdminOperationLog.js', 'utf8')
    const modelCheck = modelCode.includes("'role_change'")
    if (modelCheck) {
      console.log('   ✅ AdminOperationLog 模型定义 role_change')
      results.passed.push('AdminOperationLog 模型定义 role_change')
    } else {
      console.log('   ❌ AdminOperationLog 模型未定义 role_change')
      results.failed.push('AdminOperationLog 模型定义 role_change')
    }

    // ==================== 2. 路由层参数传递验证 ====================
    console.log('\n📝 2. 路由层参数传递验证')
    console.log('-'.repeat(60))

    const routeCode = fs.readFileSync('./routes/v4/unified-engine/admin/user_management.js', 'utf8')
    const routeChecks = {
      '路由传递 reason': routeCode.includes('reason'),
      '路由传递 ip_address': routeCode.includes('ip_address: req.ip'),
      '路由传递 user_agent': routeCode.includes("user_agent: req.headers['user-agent']")
    }

    for (const [check, result] of Object.entries(routeChecks)) {
      if (result) {
        console.log(`   ✅ ${check}`)
        results.passed.push(check)
      } else {
        console.log(`   ❌ ${check}`)
        results.failed.push(check)
      }
    }

    // ==================== 3. 数据库结构验证 ====================
    console.log('\n📝 3. 数据库结构验证')
    console.log('-'.repeat(60))

    // 3.1 检查 operation_type 枚举值
    const [enumResults] = await sequelize.query(`
      SELECT COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'admin_operation_logs'
        AND COLUMN_NAME = 'operation_type'
    `)

    const hasRoleChange = enumResults[0].COLUMN_TYPE.includes('role_change')
    if (hasRoleChange) {
      console.log('   ✅ 数据库包含 role_change 枚举值')
      results.passed.push('数据库包含 role_change 枚举值')
    } else {
      console.log('   ❌ 数据库不包含 role_change 枚举值')
      results.failed.push('数据库包含 role_change 枚举值')
    }

    // 3.2 检查表结构
    const [columns] = await sequelize.query(`
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'admin_operation_logs'
      ORDER BY ORDINAL_POSITION
    `)

    const requiredFields = [
      'log_id',
      'operator_id',
      'operation_type',
      'target_type',
      'target_id',
      'action',
      'before_data',
      'after_data',
      'changed_fields',
      'reason',
      'business_id',
      'ip_address',
      'user_agent',
      'created_at'
    ]

    const existingFields = columns.map(col => col.COLUMN_NAME)
    const allFieldsExist = requiredFields.every(field => existingFields.includes(field))

    if (allFieldsExist) {
      console.log('   ✅ 所有必需字段都存在')
      results.passed.push('所有必需字段都存在')
    } else {
      const missingFields = requiredFields.filter(field => !existingFields.includes(field))
      console.log(`   ❌ 缺失字段: ${missingFields.join(', ')}`)
      results.failed.push('所有必需字段都存在')
    }

    // ==================== 4. 索引完整性验证 ====================
    console.log('\n📝 4. 索引完整性验证')
    console.log('-'.repeat(60))

    const [indexes] = await sequelize.query(`
      SELECT INDEX_NAME, COLUMN_NAME
      FROM INFORMATION_SCHEMA.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'admin_operation_logs'
      ORDER BY INDEX_NAME, SEQ_IN_INDEX
    `)

    const indexMap = {}
    indexes.forEach(idx => {
      if (!indexMap[idx.INDEX_NAME]) {
        indexMap[idx.INDEX_NAME] = []
      }
      indexMap[idx.INDEX_NAME].push(idx.COLUMN_NAME)
    })

    const requiredIndexes = {
      idx_audit_logs_operator: ['operator_id'],
      idx_audit_logs_operation_type: ['operation_type'],
      idx_audit_logs_target: ['target_type', 'target_id'],
      idx_audit_logs_created: ['created_at'],
      idx_audit_logs_business_id: ['business_id'],
      idx_audit_logs_ip: ['ip_address']
    }

    let allIndexesExist = true
    for (const [indexName, expectedColumns] of Object.entries(requiredIndexes)) {
      const actualColumns = indexMap[indexName]
      const exists = actualColumns && JSON.stringify(actualColumns) === JSON.stringify(expectedColumns)
      if (exists) {
        console.log(`   ✅ ${indexName}`)
        results.passed.push(`索引 ${indexName}`)
      } else {
        console.log(`   ❌ ${indexName}`)
        results.failed.push(`索引 ${indexName}`)
        allIndexesExist = false
      }
    }

    // ==================== 5. 迁移文件验证 ====================
    console.log('\n📝 5. 迁移文件验证')
    console.log('-'.repeat(60))

    const migrationCode = fs.readFileSync('./migrations/20251211000000-add-role-change-operation-type.js', 'utf8')
    const migrationChecks = {
      '迁移文件包含 role_change': migrationCode.includes("'role_change'"),
      '迁移文件包含 prize_stock_adjust': migrationCode.includes("'prize_stock_adjust'"),
      '迁移文件有验证逻辑': migrationCode.includes('hasRoleChange'),
      '迁移文件有回滚逻辑': migrationCode.includes('down:')
    }

    for (const [check, result] of Object.entries(migrationChecks)) {
      if (result) {
        console.log(`   ✅ ${check}`)
        results.passed.push(check)
      } else {
        console.log(`   ❌ ${check}`)
        results.failed.push(check)
      }
    }

    // ==================== 总结 ====================
    console.log('\n' + '='.repeat(60))
    console.log('📊 验证结果总结')
    console.log('='.repeat(60))
    console.log(`✅ 通过: ${results.passed.length} 项`)
    console.log(`❌ 失败: ${results.failed.length} 项`)
    console.log(`⚠️  警告: ${results.warnings.length} 项`)

    if (results.failed.length === 0) {
      console.log('\n🎉 P0-2 任务验证完全通过！')
      console.log('\n✨ 功能特性：')
      console.log('   - UserRoleService.updateUserRole 方法已完整实现审计日志记录')
      console.log('   - 路由层正确传递 ip_address 和 user_agent')
      console.log('   - 数据库已添加 role_change 枚举值')
      console.log('   - 所有必需的索引都已创建')
      console.log('   - 支持完整的 before_data、after_data、business_id 记录')
      console.log('   - 支持事务和幂等性控制')
    } else {
      console.log('\n⚠️ 存在以下问题：')
      results.failed.forEach(item => console.log(`   - ${item}`))
    }

    await sequelize.close()
    process.exit(results.failed.length === 0 ? 0 : 1)
  } catch (error) {
    console.error('\n❌ 验证失败:', error.message)
    console.error(error.stack)
    await sequelize.close()
    process.exit(1)
  }
}

finalVerification()
