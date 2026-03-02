'use strict'

/**
 * 迁移：exchange_items 表新增 is_limited 字段
 *
 * 业务背景：
 * - 「限量商品」是独立于「幸运商品」的运营概念
 * - is_limited 由管理员手动控制，触发小程序旋转彩虹边框效果
 * - 与 is_new/is_hot/is_lucky/has_warranty/free_shipping 同类布尔标记
 *
 * 决策记录：方案 C（语义精准，管理员手动控制）
 * - NOT NULL + DEFAULT 0：存量 89 条记录默认非限量，无需数据回填
 * - 位置：free_shipping 之后，与同类布尔字段排列一致
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('exchange_items')
    if (tableInfo.is_limited) {
      console.log('⏭️  is_limited 字段已存在，跳过迁移')
      return
    }

    await queryInterface.addColumn('exchange_items', 'is_limited', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: '是否限量商品（管理员手动控制，触发小程序旋转彩虹边框）',
      after: 'free_shipping'
    })

    console.log('✅ exchange_items.is_limited 字段添加成功')
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('exchange_items', 'is_limited')
    console.log('✅ exchange_items.is_limited 字段已回滚删除')
  }
}
