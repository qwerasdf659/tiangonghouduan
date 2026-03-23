'use strict'

/**
 * 迁移：为 admin_operation_logs 添加审核链相关操作类型
 *
 * 新增操作类型：
 *   - approval_chain_config: 审核链模板配置变更
 *   - approval_chain_audit: 审核链步骤审核操作
 *
 * 注意：admin_operation_logs.operation_type 为 VARCHAR(50)，无需 ALTER ENUM，
 *       但此迁移确保 AuditOperationTypes 常量与数据库一致性校验通过。
 */
module.exports = {
  async up(queryInterface) {
    // admin_operation_logs.operation_type 为 VARCHAR(50)，不需要修改列类型
    // 此迁移仅作为记录，确保迁移历史追踪到新增操作类型
    const [columns] = await queryInterface.sequelize.query(
      "SHOW COLUMNS FROM admin_operation_logs WHERE Field = 'operation_type'"
    )

    if (columns.length > 0 && columns[0].Type.includes('varchar')) {
      console.log('✅ admin_operation_logs.operation_type 为 VARCHAR 类型，无需修改列定义')
      console.log('✅ 新增操作类型: approval_chain_config, approval_chain_audit')
      return
    }

    // 如果是 ENUM 类型，需要添加新值
    if (columns.length > 0 && columns[0].Type.includes('enum')) {
      await queryInterface.sequelize.query(`
        ALTER TABLE admin_operation_logs
        MODIFY COLUMN operation_type VARCHAR(50) NOT NULL
        COMMENT '操作类型（已从 ENUM 迁移为 VARCHAR）'
      `)
      console.log('✅ 已将 operation_type 从 ENUM 迁移为 VARCHAR(50)')
    }
  },

  async down() {
    // VARCHAR 类型无需回滚
    console.log('⬇️ down: 操作类型常量变更无需数据库回滚')
  }
}
