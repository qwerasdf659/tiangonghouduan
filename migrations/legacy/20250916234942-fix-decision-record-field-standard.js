'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 1. 添加新的业务标准字段 is_winner
      await queryInterface.addColumn(
        'unified_decision_records',
        'is_winner',
        {
          type: Sequelize.BOOLEAN,
          allowNull: true, // 先允许NULL，数据转换后再改为NOT NULL
          comment: '是否中奖（业务标准字段）'
        },
        { transaction }
      )

      console.log('✅ 添加is_winner字段成功')

      // 2. 数据转换：decision_result -> is_winner
      // 处理现有数据的转换
      await queryInterface.sequelize.query(
        `
        UPDATE unified_decision_records 
        SET is_winner = CASE 
          WHEN decision_result = 'win' THEN 1
          WHEN decision_result = 'lose' THEN 0
          ELSE 0  -- 默认为未中奖（处理空值或无效值）
        END
      `,
        { transaction }
      )

      console.log('✅ 数据转换完成')

      // 3. 将is_winner字段设为NOT NULL
      await queryInterface.changeColumn(
        'unified_decision_records',
        'is_winner',
        {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: '是否中奖（业务标准字段）'
        },
        { transaction }
      )

      console.log('✅ is_winner字段约束更新完成')

      // 4. 删除旧的decision_result字段（如果需要保留可注释掉）
      await queryInterface.removeColumn('unified_decision_records', 'decision_result', {
        transaction
      })

      console.log('✅ 删除旧字段decision_result完成')

      // 5. 为新字段创建索引
      await queryInterface.addIndex(
        'unified_decision_records',
        {
          fields: ['is_winner'],
          name: 'idx_unified_decision_records_is_winner'
        },
        { transaction }
      )

      console.log('✅ 创建is_winner字段索引完成')

      await transaction.commit()
      console.log('🎉 DecisionRecord字段标准统一迁移完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 回滚操作：恢复decision_result字段
      // 1. 添加回decision_result字段
      await queryInterface.addColumn(
        'unified_decision_records',
        'decision_result',
        {
          type: Sequelize.ENUM('win', 'lose'),
          allowNull: true,
          comment: '决策结果：中奖或未中奖'
        },
        { transaction }
      )

      // 2. 数据转换：is_winner -> decision_result
      await queryInterface.sequelize.query(
        `
        UPDATE unified_decision_records 
        SET decision_result = CASE 
          WHEN is_winner = 1 THEN 'win'
          WHEN is_winner = 0 THEN 'lose'
          ELSE 'lose'
        END
      `,
        { transaction }
      )

      // 3. 设置decision_result为NOT NULL
      await queryInterface.changeColumn(
        'unified_decision_records',
        'decision_result',
        {
          type: Sequelize.ENUM('win', 'lose'),
          allowNull: false,
          comment: '决策结果：中奖或未中奖'
        },
        { transaction }
      )

      // 4. 删除is_winner字段和索引
      await queryInterface.removeIndex(
        'unified_decision_records',
        'idx_unified_decision_records_is_winner',
        { transaction }
      )
      await queryInterface.removeColumn('unified_decision_records', 'is_winner', { transaction })

      await transaction.commit()
      console.log('🔄 DecisionRecord字段标准回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
