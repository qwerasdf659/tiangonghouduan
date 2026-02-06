'use strict'

/**
 * 商家员工域权限体系升级 - 扩展 merchant_operation_logs 枚举类型
 *
 * 迁移脚本：扩展 operation_type 和 action 枚举以支持员工管理操作
 *
 * 变更说明：
 * - operation_type 新增：staff_add, staff_transfer, staff_disable, staff_enable
 * - action 新增：update
 * - store_id 改为可空（员工禁用时可能涉及多门店）
 *
 * 创建时间：2026-01-12
 * 依据文档：docs/商家员工域权限体系升级方案.md
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('📝 [Migration] 开始扩展 merchant_operation_logs 枚举类型...')

      // MySQL 不支持直接修改 ENUM，需要使用 ALTER TABLE MODIFY COLUMN
      // 1. 扩展 operation_type 枚举
      await queryInterface.sequelize.query(
        `ALTER TABLE merchant_operation_logs 
         MODIFY COLUMN operation_type ENUM(
           'scan_user',
           'submit_consumption',
           'view_consumption_list',
           'view_consumption_detail',
           'staff_login',
           'staff_logout',
           'staff_add',
           'staff_transfer',
           'staff_disable',
           'staff_enable'
         ) NOT NULL COMMENT '操作类型（商家域专用枚举）'`,
        { transaction }
      )
      console.log('✅ [Migration] operation_type 枚举扩展成功')

      // 2. 扩展 action 枚举
      await queryInterface.sequelize.query(
        `ALTER TABLE merchant_operation_logs 
         MODIFY COLUMN action ENUM(
           'create',
           'read',
           'scan',
           'update'
         ) NOT NULL DEFAULT 'create' COMMENT '操作动作'`,
        { transaction }
      )
      console.log('✅ [Migration] action 枚举扩展成功')

      // 3. 修改 store_id 为可空（员工禁用涉及多门店时传 NULL）
      await queryInterface.changeColumn(
        'merchant_operation_logs',
        'store_id',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'stores',
            key: 'store_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
          comment: '门店ID（操作发生的门店，员工禁用等跨门店操作可为空）'
        },
        { transaction }
      )
      console.log('✅ [Migration] store_id 改为可空成功')

      await transaction.commit()
      console.log(
        '🎉 [Migration] 迁移 20260112180000-extend-merchant-operation-logs-enums 成功提交'
      )
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [Migration] 迁移失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('📝 [Migration] 开始回滚 merchant_operation_logs 枚举扩展...')

      // 1. 恢复 store_id 为必填
      await queryInterface.changeColumn(
        'merchant_operation_logs',
        'store_id',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'stores',
            key: 'store_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
          comment: '门店ID（操作发生的门店）'
        },
        { transaction }
      )

      // 2. 恢复 action 枚举
      await queryInterface.sequelize.query(
        `ALTER TABLE merchant_operation_logs 
         MODIFY COLUMN action ENUM('create', 'read', 'scan') 
         NOT NULL DEFAULT 'create' COMMENT '操作动作'`,
        { transaction }
      )

      // 3. 恢复 operation_type 枚举
      await queryInterface.sequelize.query(
        `ALTER TABLE merchant_operation_logs 
         MODIFY COLUMN operation_type ENUM(
           'scan_user',
           'submit_consumption',
           'view_consumption_list',
           'view_consumption_detail',
           'staff_login',
           'staff_logout'
         ) NOT NULL COMMENT '操作类型（商家域专用枚举）'`,
        { transaction }
      )

      await transaction.commit()
      console.log('🎉 [Migration] 回滚成功')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [Migration] 回滚失败:', error.message)
      throw error
    }
  }
}
