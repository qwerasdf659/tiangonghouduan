'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    /**
     * 🔧 修复抽奖功能：添加连续未中奖次数字段
     * 用于实现抽奖保底机制
     */
    await queryInterface.addColumn('users', 'consecutive_fail_count', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      allowNull: false,
      comment: '连续未中奖次数（用于保底机制）'
    })
  },

  async down (queryInterface, _Sequelize) {
    /**
     * 回滚操作：删除consecutive_fail_count字段
     */
    await queryInterface.removeColumn('users', 'consecutive_fail_count')
  }
}
