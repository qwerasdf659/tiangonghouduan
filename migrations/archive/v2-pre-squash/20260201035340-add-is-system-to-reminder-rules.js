const { DataTypes } = require('sequelize')

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // 添加 is_system 字段到 reminder_rules 表
    await queryInterface.addColumn('reminder_rules', 'is_system', {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '是否系统内置规则（系统规则不可删除）',
      after: 'is_enabled'
    })
    
    console.log('✅ 已添加 is_system 字段到 reminder_rules 表')
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('reminder_rules', 'is_system')
    console.log('✅ 已移除 reminder_rules.is_system 字段')
  }
}
