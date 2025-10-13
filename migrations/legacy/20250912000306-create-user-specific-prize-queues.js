'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (_queryInterface, _Sequelize) {
    // 表已存在，无需创建
    console.log('✅ user_specific_prize_queues表已存在，跳过创建')
  },

  async down (_queryInterface, _Sequelize) {
    // 不执行删除操作，保护现有数据
    console.log('⚠️ 保护现有数据，不执行删除操作')
  }
}
