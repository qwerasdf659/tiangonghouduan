'use strict'

/**
 * admin_operation_logs.operation_type: ENUM → VARCHAR(50)
 *
 * 背景：operation_type 是 ENUM 类型（~35 个固定值），策略模拟功能需要新增
 * simulation_apply / config_rollback / strategy_config_update 等操作类型。
 * 每次新增 ENUM 值都需要写 migration，转为 VARCHAR(50) 后只需改代码常量。
 *
 * 值校验迁移到 Model validate 层和 Service 层的 AuditOperationTypes 常量。
 *
 * @see docs/策略效果模拟分析页面-设计方案.md Section 十八
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [cols] = await queryInterface.sequelize.query(
      "SHOW COLUMNS FROM admin_operation_logs LIKE 'operation_type'"
    )
    const currentType = cols[0]?.Type || ''

    if (currentType.startsWith('enum')) {
      await queryInterface.changeColumn('admin_operation_logs', 'operation_type', {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: '操作类型（VARCHAR 存储，值校验在应用层 - 详见 constants/AuditOperationTypes.js）'
      })
      console.log('  ✅ admin_operation_logs.operation_type: ENUM → VARCHAR(50) 转换完成')
    } else {
      console.log(`  ⏭️  admin_operation_logs.operation_type 已是 ${currentType}，跳过`)
    }
  },

  async down(queryInterface, Sequelize) {
    const { DB_ENUM_VALUES } = require('../constants/AuditOperationTypes')
    await queryInterface.changeColumn('admin_operation_logs', 'operation_type', {
      type: Sequelize.ENUM(...DB_ENUM_VALUES),
      allowNull: false,
      comment: '操作类型（ENUM存储）'
    })
    console.log('  ✅ admin_operation_logs.operation_type: VARCHAR(50) → ENUM 回滚完成')
  }
}
