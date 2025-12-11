/**
 * 测试 UserRoleService.updateUserRole 的审计日志记录功能
 */

const { sequelize } = require('../models')
const fs = require('fs')

async function testRoleChangeAudit () {
  try {
    console.log('🧪 开始测试 UserRoleService.updateUserRole 的审计日志记录功能\n')

    // 测试1：检查 UserRoleService 是否正确调用 AuditLogService
    console.log('✅ 测试1：检查 UserRoleService.updateUserRole 代码')
    const serviceCode = fs.readFileSync('./services/UserRoleService.js', 'utf8')

    const hasAuditLogImport = serviceCode.includes("require('./AuditLogService')")
    const hasAuditLogCall = serviceCode.includes('AuditLogService.logOperation')
    const hasRoleChangeType = serviceCode.includes('role_change')

    console.log(`   - 导入 AuditLogService: ${hasAuditLogImport ? '✅' : '❌'}`)
    console.log(`   - 调用 AuditLogService.logOperation: ${hasAuditLogCall ? '✅' : '❌'}`)
    console.log(`   - 使用 'role_change' 操作类型: ${hasRoleChangeType ? '✅' : '❌'}`)

    // 测试2：检查 AuditLogService 是否支持 role_change
    console.log('\n✅ 测试2：检查 AuditLogService 支持的操作类型')
    const auditServiceCode = fs.readFileSync('./services/AuditLogService.js', 'utf8')
    const supportsRoleChange = auditServiceCode.includes("'role_change'")
    console.log(`   - 支持 'role_change' 操作类型: ${supportsRoleChange ? '✅' : '❌'}`)

    // 测试3：检查数据库枚举值
    console.log('\n✅ 测试3：检查数据库 operation_type 枚举值')
    const [results] = await sequelize.query(`
      SELECT COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'admin_operation_logs'
        AND COLUMN_NAME = 'operation_type'
    `)

    const hasRoleChangeInDB = results[0].COLUMN_TYPE.includes('role_change')
    console.log(`   - 数据库包含 'role_change': ${hasRoleChangeInDB ? '✅' : '❌'}`)

    // 测试4：检查 AdminOperationLog 模型
    console.log('\n✅ 测试4：检查 AdminOperationLog 模型定义')
    const modelCode = fs.readFileSync('./models/AdminOperationLog.js', 'utf8')
    const modelHasRoleChange = modelCode.includes("'role_change'")
    console.log(`   - 模型定义包含 'role_change': ${modelHasRoleChange ? '✅' : '❌'}`)

    // 汇总测试结果
    console.log('\n📊 测试结果汇总：')
    const allTestsPassed =
      hasAuditLogImport &&
      hasAuditLogCall &&
      hasRoleChangeType &&
      supportsRoleChange &&
      hasRoleChangeInDB &&
      modelHasRoleChange

    if (allTestsPassed) {
      console.log('✅ 所有测试通过！UserRoleService.updateUserRole 的审计日志记录功能已正确实现。')
    } else {
      console.log('❌ 部分测试失败，请检查上述详细信息。')
    }

    await sequelize.close()
    process.exit(allTestsPassed ? 0 : 1)
  } catch (error) {
    console.error('❌ 测试失败:', error.message)
    console.error(error.stack)
    await sequelize.close()
    process.exit(1)
  }
}

testRoleChangeAudit()
