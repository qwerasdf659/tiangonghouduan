'use strict'

/**
 * 删除 trade_records 表中的 verification_status 字段
 *
 * 背景：
 * - verification_status 字段在实际业务中从未使用
 * - 该字段与 status 字段存在语义重叠
 * - 增加了系统复杂度但没有带来实际价值
 * - 数据检查确认所有记录都使用默认值 'none'
 *
 * 操作内容：
 * 1. 删除索引 trade_records_status_verification_status
 * 2. 删除字段 verification_status
 *
 * 创建时间: 2025-09-30 17:03:52
 * 关联文档: docs/status-field-optimization-analysis.md
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, _Sequelize) {
    console.log('🔄 开始删除 verification_status 字段...\n')

    try {
      // 1. 删除包含 verification_status 的复合索引
      console.log('📌 步骤1: 删除索引 trade_records_status_verification_status')
      try {
        await queryInterface.removeIndex(
          'trade_records',
          'trade_records_status_verification_status'
        )
        console.log('✅ 索引删除成功\n')
      } catch (error) {
        // 如果索引不存在，继续执行
        if (error.message.includes('check that column/key exists')) {
          console.log('ℹ️  索引不存在，跳过删除\n')
        } else {
          throw error
        }
      }

      // 2. 删除 verification_status 字段
      console.log('📌 步骤2: 删除字段 verification_status')
      await queryInterface.removeColumn('trade_records', 'verification_status')
      console.log('✅ 字段删除成功\n')

      console.log('🎉 verification_status 字段删除完成！')
      console.log('💡 提示: 请同步更新 TradeRecord 模型定义\n')
    } catch (error) {
      console.error('❌ 迁移执行失败:', error.message)
      throw error
    }
  },

  async down (queryInterface, Sequelize) {
    console.log('🔄 开始回滚 verification_status 字段删除...\n')

    try {
      // 1. 恢复 verification_status 字段
      console.log('📌 步骤1: 恢复字段 verification_status')
      await queryInterface.addColumn('trade_records', 'verification_status', {
        type: Sequelize.ENUM('none', 'required', 'verified', 'rejected'),
        allowNull: false,
        defaultValue: 'none',
        comment: '验证状态'
      })
      console.log('✅ 字段恢复成功\n')

      // 2. 恢复索引
      console.log('📌 步骤2: 恢复索引 trade_records_status_verification_status')
      await queryInterface.addIndex('trade_records', ['status', 'verification_status'], {
        name: 'trade_records_status_verification_status'
      })
      console.log('✅ 索引恢复成功\n')

      console.log('🎉 verification_status 字段回滚完成！')
    } catch (error) {
      console.error('❌ 回滚执行失败:', error.message)
      throw error
    }
  }
}
