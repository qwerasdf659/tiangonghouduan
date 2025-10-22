'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, _Sequelize) {
    // 1. 删除 trade_records 表中的 risk_level 字段
    console.log('🗑️ 删除 trade_records.risk_level 字段...')
    await queryInterface.removeColumn('trade_records', 'risk_level')

    /*
     * 2. 删除任何关于 user_agent 的索引或约束（如果存在）
     * user_agent 主要在应用层使用，数据库中可能没有对应字段
     */

    // 3. 记录 behavior_analysis 的清理（这是动态生成的字段，无需删除数据库字段）
    console.log('✅ behavior_analysis 是动态生成字段，已在应用层清理')

    console.log('✅ 字段删除完成')
  },

  async down (queryInterface, Sequelize) {
    // 1. 恢复 trade_records 表中的 risk_level 字段
    console.log('🔄 恢复 trade_records.risk_level 字段...')
    await queryInterface.addColumn('trade_records', 'risk_level', {
      type: Sequelize.ENUM('low', 'medium', 'high', 'critical'),
      allowNull: false,
      defaultValue: 'low',
      comment: '风险等级'
    })

    console.log('✅ 字段恢复完成')
  }
}
