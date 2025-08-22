'use strict'

/**
 * 🔥 连抽系统数据库迁移 - 阶段一核心功能
 * 创建时间：2025年08月21日
 * 目标：为现有lottery_draws表添加连抽批次支持
 * 设计原则：最小改动，基于现有架构扩展
 */

module.exports = {
  async up (queryInterface, Sequelize) {
    console.log('🔥 开始连抽系统数据库迁移...')

    try {
      // 1. 添加批次ID字段 - 连抽的核心标识
      await queryInterface.addColumn('lottery_draws', 'batch_id', {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: '连抽批次ID，单次抽奖为NULL'
      })
      console.log('✅ 添加batch_id字段完成')

      // 2. 添加批次大小字段 - 记录连抽总数
      await queryInterface.addColumn('lottery_draws', 'batch_size', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: '连抽总数量，单次抽奖为1'
      })
      console.log('✅ 添加batch_size字段完成')

      // 3. 添加批次序号字段 - 记录在连抽中的位置
      await queryInterface.addColumn('lottery_draws', 'batch_index', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '连抽中的序号，从0开始'
      })
      console.log('✅ 添加batch_index字段完成')

      // 4. 添加折扣率字段 - 记录连抽优惠
      await queryInterface.addColumn('lottery_draws', 'discount_applied', {
        type: Sequelize.DECIMAL(5, 3),
        allowNull: false,
        defaultValue: 1.000,
        comment: '连抽折扣率，1.000为无折扣'
      })
      console.log('✅ 添加discount_applied字段完成')

      // 5. 检查是否存在批次ID索引，避免重复创建
      const indexes = await queryInterface.showIndex('lottery_draws')
      const batchIndexExists = indexes.some(index =>
        index.name === 'idx_lottery_draws_batch_id'
      )

      if (!batchIndexExists) {
        // 6. 添加批次ID索引优化查询性能
        await queryInterface.addIndex('lottery_draws', ['batch_id'], {
          name: 'idx_lottery_draws_batch_id',
          comment: '连抽批次查询索引'
        })
        console.log('✅ 添加batch_id索引完成')
      } else {
        console.log('⚠️ batch_id索引已存在，跳过创建')
      }

      // 7. 添加复合索引优化连抽历史查询
      const compositeIndexExists = indexes.some(index =>
        index.name === 'idx_lottery_draws_user_batch'
      )

      if (!compositeIndexExists) {
        await queryInterface.addIndex('lottery_draws', ['user_id', 'batch_id'], {
          name: 'idx_lottery_draws_user_batch',
          comment: '用户连抽历史查询索引'
        })
        console.log('✅ 添加用户连抽复合索引完成')
      } else {
        console.log('⚠️ 用户连抽复合索引已存在，跳过创建')
      }

      console.log('🎯 连抽系统数据库迁移完成！')
    } catch (error) {
      console.error('❌ 连抽系统迁移失败:', error.message)
      throw error
    }
  },

  async down (queryInterface, _Sequelize) {
    console.log('🔄 开始回滚连抽系统迁移...')

    try {
      // 移除索引
      await queryInterface.removeIndex('lottery_draws', 'idx_lottery_draws_batch_id')
      await queryInterface.removeIndex('lottery_draws', 'idx_lottery_draws_user_batch')

      // 移除字段
      await queryInterface.removeColumn('lottery_draws', 'batch_id')
      await queryInterface.removeColumn('lottery_draws', 'batch_size')
      await queryInterface.removeColumn('lottery_draws', 'batch_index')
      await queryInterface.removeColumn('lottery_draws', 'discount_applied')

      console.log('🔄 连抽系统迁移回滚完成')
    } catch (error) {
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
