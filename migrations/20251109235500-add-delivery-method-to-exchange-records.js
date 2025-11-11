/**
 * 迁移说明：为exchange_records表添加delivery_method字段
 *
 * 业务背景：
 * - 商品兑换需要区分配送方式：virtual（虚拟发放）或physical（实物配送）
 * - 该字段在代码中已使用，但数据库表中缺失
 * - 根据商品类别自动判断：优惠券=virtual，其他=physical
 *
 * 修改内容：
 * - 添加delivery_method字段（ENUM类型）
 * - 默认值：physical（实物配送）
 * - 支持回滚
 *
 * 创建时间：2025-11-09
 * 迁移类型：alter-table（修改表结构）
 * 影响范围：exchange_records表
 */

'use strict'

module.exports = {
  /**
   * 应用迁移：添加delivery_method字段
   */
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('📝 [迁移] 开始添加delivery_method字段到exchange_records表')

      // 1. 检查字段是否已存在
      const tableInfo = await queryInterface.describeTable('exchange_records')

      if (tableInfo.delivery_method) {
        console.log('⚠️ [迁移] delivery_method字段已存在，跳过创建')
        await transaction.commit()
        return
      }

      // 2. 添加delivery_method字段
      await queryInterface.addColumn(
        'exchange_records',
        'delivery_method',
        {
          type: Sequelize.ENUM('virtual', 'physical'),
          allowNull: false,
          defaultValue: 'physical',
          comment: '配送方式（virtual-虚拟发放【优惠券等】，physical-实物配送【实体商品】，根据商品类别自动判断）',
          after: 'space' // 添加到space字段之后
        },
        { transaction }
      )

      console.log('✅ [迁移] delivery_method字段添加成功')

      // 3. 根据product_snapshot中的category字段更新现有记录
      console.log('📝 [迁移] 开始更新现有记录的delivery_method值')

      await queryInterface.sequelize.query(
        `
        UPDATE exchange_records
        SET delivery_method = CASE
          WHEN JSON_EXTRACT(product_snapshot, '$.category') = '优惠券' THEN 'virtual'
          ELSE 'physical'
        END
        WHERE delivery_method IS NULL OR delivery_method = 'physical'
        `,
        { transaction }
      )

      console.log('✅ [迁移] 现有记录的delivery_method值更新完成')

      await transaction.commit()
      console.log('✅ [迁移] delivery_method字段迁移完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [迁移] 添加delivery_method字段失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：删除delivery_method字段
   */
  async down (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('📝 [回滚] 开始删除delivery_method字段')

      // 1. 检查字段是否存在
      const tableInfo = await queryInterface.describeTable('exchange_records')

      if (!tableInfo.delivery_method) {
        console.log('⚠️ [回滚] delivery_method字段不存在，跳过删除')
        await transaction.commit()
        return
      }

      // 2. 删除字段
      await queryInterface.removeColumn(
        'exchange_records',
        'delivery_method',
        { transaction }
      )

      console.log('✅ [回滚] delivery_method字段删除成功')

      await transaction.commit()
      console.log('✅ [回滚] delivery_method字段回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [回滚] 删除delivery_method字段失败:', error.message)
      throw error
    }
  }
}
