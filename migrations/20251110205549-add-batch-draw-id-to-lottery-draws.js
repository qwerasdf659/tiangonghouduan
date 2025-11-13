/**
 * 数据库迁移：添加batch_draw_id字段到lottery_draws表
 *
 * 业务背景：
 * 为了支持连抽功能的历史查询和业务分析，需要将同一批次的多次抽奖关联起来
 *
 * 具体变更：
 * 1. 在lottery_draws表中添加batch_draw_id字段（VARCHAR(50)）
 * 2. 为batch_draw_id字段创建索引，提高查询性能
 * 3. 允许NULL值（单次抽奖没有批次ID）
 *
 * 业务影响：
 * - 正向影响：可以查询"我的10连抽历史"，提升用户体验
 * - 风险控制：字段允许NULL，不影响现有数据和单次抽奖
 * - 性能优化：添加索引，提高批次查询性能
 *
 * 技术实施：
 * - 使用ALTER TABLE添加列
 * - 创建非唯一索引（一个批次对应多条记录）
 * - 支持完整的up/down回滚
 *
 * 创建时间：2025年10月30日
 * 数据库版本：V4.0
 * 风险等级：低（仅添加字段，不修改现有数据）
 * 预计执行时间：<1秒（表数据量小）
 */

'use strict'

module.exports = {
  /**
   * 正向迁移：添加batch_draw_id字段
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize库
   * @returns {Promise<void>}
   */
  async up (queryInterface, Sequelize) {
    const { DataTypes } = Sequelize

    // 步骤1：添加batch_draw_id字段到lottery_draws表
    await queryInterface.addColumn('lottery_draws', 'batch_draw_id', {
      type: DataTypes.STRING(50), // 格式：batch_<timestamp>_<user_id>
      allowNull: true, // 允许NULL，单次抽奖没有批次ID
      comment: '批次抽奖ID（连抽时使用，用于关联同一批次的多次抽奖）',
      after: 'draw_id' // 添加到draw_id字段后面
    })

    console.log('✅ 已添加batch_draw_id字段到lottery_draws表')

    // 步骤2：为batch_draw_id字段创建索引，提高查询性能
    await queryInterface.addIndex('lottery_draws', ['batch_draw_id'], {
      name: 'idx_lottery_draws_batch_draw_id', // 索引名称
      using: 'BTREE' // B树索引 (修复：使用using而不是type)
    })

    console.log('✅ 已创建batch_draw_id索引')

    // 步骤3：为user_id + batch_draw_id创建组合索引（优化用户批次查询）
    await queryInterface.addIndex('lottery_draws', ['user_id', 'batch_draw_id'], {
      name: 'idx_lottery_draws_user_batch', // 组合索引名称
      using: 'BTREE' // B树索引 (修复：使用using而不是type)
    })

    console.log('✅ 已创建user_id + batch_draw_id组合索引')

    console.log('🎉 迁移完成：batch_draw_id字段已成功添加')
  },

  /**
   * 回滚迁移：删除batch_draw_id字段
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize库
   * @returns {Promise<void>}
   */
  async down (queryInterface, Sequelize) {
    // 步骤1：删除组合索引
    await queryInterface.removeIndex('lottery_draws', 'idx_lottery_draws_user_batch')
    console.log('✅ 已删除user_id + batch_draw_id组合索引')

    // 步骤2：删除batch_draw_id索引
    await queryInterface.removeIndex('lottery_draws', 'idx_lottery_draws_batch_draw_id')
    console.log('✅ 已删除batch_draw_id索引')

    // 步骤3：删除batch_draw_id字段
    await queryInterface.removeColumn('lottery_draws', 'batch_draw_id')
    console.log('✅ 已删除batch_draw_id字段')

    console.log('🔄 回滚完成：batch_draw_id字段已移除')
  }
}
