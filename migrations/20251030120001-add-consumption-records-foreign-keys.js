/**
 * 餐厅积分抽奖系统 V4.0 - 数据库迁移
 *
 * 迁移名称：为consumption_records表添加外键约束
 * 迁移类型：alter-table（修改表结构）
 * 版本号：v4.1.1
 * 创建时间：2025-10-30
 *
 * 变更说明：
 * 1. 添加user_id外键约束（CASCADE/CASCADE）
 * 2. 添加merchant_id外键约束（SET NULL/CASCADE）
 * 3. 添加reviewed_by外键约束（SET NULL/CASCADE）
 *
 * 依赖关系：
 * - 依赖consumption_records表已存在
 * - 依赖users表（外键关联）
 * - 依赖20251030000000-refactor-consumption-records-table.js迁移已执行
 *
 * 影响范围：
 * - 为consumption_records表添加数据库层面的外键约束
 * - 确保数据完整性和引用完整性
 */

'use strict'

module.exports = {
  /**
   * 执行迁移（up方向）
   * @param {import('sequelize').QueryInterface} queryInterface - Sequelize查询接口
   * @param {import('sequelize')} Sequelize - Sequelize实例
   * @returns {Promise<void>}
   */
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始为consumption_records表添加外键约束...')

      /*
       * ========================================
       * 第1步：检查现有外键约束
       * ========================================
       */
      console.log('步骤1：检查现有外键约束')

      const [existingConstraints] = await queryInterface.sequelize.query(
        `SELECT CONSTRAINT_NAME 
         FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
         WHERE TABLE_SCHEMA = DATABASE() 
           AND TABLE_NAME = 'consumption_records' 
           AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
        { transaction }
      )

      const existingFKs = existingConstraints.map(c => c.CONSTRAINT_NAME)
      console.log(`  已存在的外键约束: ${existingFKs.length}个`, existingFKs)

      /*
       * ========================================
       * 第2步：删除可能存在的旧外键约束
       * ========================================
       */
      console.log('步骤2：删除旧外键约束（如果存在）')

      const removeConstraintSafely = async (constraintName) => {
        if (existingFKs.includes(constraintName)) {
          try {
            await queryInterface.removeConstraint('consumption_records', constraintName, { transaction })
            console.log(`  已删除旧外键约束: ${constraintName}`)
          } catch (error) {
            console.log(`  删除外键约束失败: ${constraintName}, ${error.message}`)
          }
        } else {
          console.log(`  外键约束不存在，跳过: ${constraintName}`)
        }
      }

      await removeConstraintSafely('consumption_records_ibfk_1')
      await removeConstraintSafely('consumption_records_ibfk_2')
      await removeConstraintSafely('consumption_records_ibfk_3')

      /*
       * ========================================
       * 第3步：确保merchant_id字段允许NULL（SET NULL策略需要）
       * ========================================
       */
      console.log('步骤3：确保merchant_id和reviewed_by字段允许NULL')

      await queryInterface.changeColumn('consumption_records', 'merchant_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '商家ID（录入人，可为空）'
      }, { transaction })

      await queryInterface.changeColumn('consumption_records', 'reviewed_by', {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '审核员ID（谁审核的？可为空）'
      }, { transaction })

      /*
       * ========================================
       * 第4步：添加user_id外键约束
       * ========================================
       */
      console.log('步骤4：添加user_id外键约束')

      await queryInterface.addConstraint('consumption_records', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_consumption_records_user_id',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
        transaction
      })
      console.log('  ✅ 添加成功: fk_consumption_records_user_id')

      /*
       * ========================================
       * 第5步：添加merchant_id外键约束
       * ========================================
       */
      console.log('步骤5：添加merchant_id外键约束')

      await queryInterface.addConstraint('consumption_records', {
        fields: ['merchant_id'],
        type: 'foreign key',
        name: 'fk_consumption_records_merchant_id',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction
      })
      console.log('  ✅ 添加成功: fk_consumption_records_merchant_id')

      /*
       * ========================================
       * 第6步：添加reviewed_by外键约束
       * ========================================
       */
      console.log('步骤6：添加reviewed_by外键约束')

      await queryInterface.addConstraint('consumption_records', {
        fields: ['reviewed_by'],
        type: 'foreign key',
        name: 'fk_consumption_records_reviewed_by',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
        transaction
      })
      console.log('  ✅ 添加成功: fk_consumption_records_reviewed_by')

      /*
       * ========================================
       * 第7步：提交事务
       * ========================================
       */
      await transaction.commit()
      console.log('✅ consumption_records表外键约束添加完成')
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移（down方向）
   * @param {import('sequelize').QueryInterface} queryInterface - Sequelize查询接口
   * @param {import('sequelize')} Sequelize - Sequelize实例
   * @returns {Promise<void>}
   */
  async down (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始删除consumption_records表外键约束...')

      // 删除外键约束
      await queryInterface.removeConstraint('consumption_records', 'fk_consumption_records_user_id', { transaction })
      await queryInterface.removeConstraint('consumption_records', 'fk_consumption_records_merchant_id', { transaction })
      await queryInterface.removeConstraint('consumption_records', 'fk_consumption_records_reviewed_by', { transaction })

      await transaction.commit()
      console.log('✅ consumption_records表外键约束删除完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
