'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    /**
     * unified_decision_records表综合增强
     * 整合原来的三个分散操作：
     * - 添加strategy_type字段 + 索引
     * - 添加JSON字段（user_context等）
     * - 添加updated_at字段
     */

    console.log('📊 开始unified_decision_records表综合增强...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 添加strategy_type字段
      await queryInterface.addColumn('unified_decision_records', 'strategy_type', {
        type: Sequelize.ENUM('basic', 'guarantee', 'management'),
        allowNull: false,
        defaultValue: 'basic',
        comment: 'V4抽奖策略类型: basic=基础策略, guarantee=保底策略, management=管理策略'
      }, { transaction })

      // 2. 添加JSON字段组
      await queryInterface.addColumn('unified_decision_records', 'user_context', {
        type: Sequelize.JSON,
        allowNull: true,
        comment: '用户上下文数据（JSON格式）'
      }, { transaction })

      await queryInterface.addColumn('unified_decision_records', 'probability_data', {
        type: Sequelize.JSON,
        allowNull: true,
        comment: '概率计算数据（JSON格式）'
      }, { transaction })

      await queryInterface.addColumn('unified_decision_records', 'decision_metadata', {
        type: Sequelize.JSON,
        allowNull: true,
        comment: '决策元数据（算法版本、参数等）'
      }, { transaction })

      await queryInterface.addColumn('unified_decision_records', 'random_seed', {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: '随机数种子（用于重现决策过程）'
      }, { transaction })

      // 3. 添加updated_at字段
      await queryInterface.addColumn('unified_decision_records', 'updated_at', {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.NOW,
        comment: '记录更新时间'
      }, { transaction })

      // 4. 添加索引以提高查询性能
      await queryInterface.addIndex('unified_decision_records', ['strategy_type'], {
        name: 'idx_unified_decision_records_strategy_type'
      }, { transaction })

      await transaction.commit()
      console.log('✅ unified_decision_records表综合增强完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ unified_decision_records表增强失败:', error.message)
      throw error
    }
  },

  async down (queryInterface, _Sequelize) {
    /**
     * 回滚操作：删除所有添加的字段和索引
     */

    console.log('🔄 回滚unified_decision_records表增强...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 删除索引
      await queryInterface.removeIndex(
        'unified_decision_records',
        'idx_unified_decision_records_strategy_type',
        { transaction }
      )

      // 删除所有添加的字段
      await queryInterface.removeColumn('unified_decision_records', 'strategy_type', { transaction })
      await queryInterface.removeColumn('unified_decision_records', 'user_context', { transaction })
      await queryInterface.removeColumn('unified_decision_records', 'probability_data', { transaction })
      await queryInterface.removeColumn('unified_decision_records', 'decision_metadata', { transaction })
      await queryInterface.removeColumn('unified_decision_records', 'random_seed', { transaction })
      await queryInterface.removeColumn('unified_decision_records', 'updated_at', { transaction })

      await transaction.commit()
      console.log('✅ unified_decision_records表增强回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
