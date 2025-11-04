/**
 * 添加 premium_unlock 到 points_transactions.business_type 枚举
 *
 * 📋 功能说明：
 * - 为积分交易表添加高级空间解锁业务类型
 * - 用于记录用户支付100积分解锁高级空间的交易记录
 *
 * ⚠️ 关键说明：
 * - 修改ENUM字段需要重新定义所有枚举值
 * - MySQL不支持直接添加ENUM值，必须使用ALTER TABLE ... MODIFY COLUMN
 *
 * 创建时间：2025-11-02 12:45:00
 * 版本：v1.0.0
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🚀 开始添加 premium_unlock 到 business_type 枚举...')
    console.log('='.repeat(60))

    const transaction = await queryInterface.sequelize.transaction()

    try {
      /*
       * ========================================
       * 修改 business_type 枚举值（添加 premium_unlock）
       * ========================================
       */
      console.log('📋 修改 points_transactions.business_type 枚举值...')

      // ⚠️ 注意：必须重新定义所有枚举值，不能只添加一个
      await queryInterface.sequelize.query(
        `ALTER TABLE points_transactions 
         MODIFY COLUMN business_type ENUM(
           'task_complete',
           'lottery_consume',
           'admin_adjust',
           'refund',
           'expire',
           'behavior_reward',
           'recommendation_bonus',
           'activity_bonus',
           'consumption_reward',
           'premium_unlock'
         ) NOT NULL COMMENT '业务类型'`,
        { transaction }
      )

      console.log('✅ business_type 枚举值已更新（已添加 premium_unlock）')

      /*
       * ========================================
       * 提交事务
       * ========================================
       */
      await transaction.commit()

      console.log('\n' + '='.repeat(60))
      console.log('✅ premium_unlock 枚举值添加完成！')
      console.log('📊 表名: points_transactions')
      console.log('📈 字段名: business_type')
      console.log('🔧 新增枚举值: premium_unlock（高级空间解锁）')
      console.log('💡 用途: 记录用户支付100积分解锁高级空间的交易记录')
      console.log('='.repeat(60))
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      console.error('❌ 添加 premium_unlock 枚举值失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface, Sequelize) => {
    console.log('🔄 开始回滚 premium_unlock 枚举值...')
    console.log('='.repeat(60))

    const transaction = await queryInterface.sequelize.transaction()

    try {
      /*
       * ========================================
       * 检查是否有使用 premium_unlock 的记录
       * ========================================
       */
      console.log('🔍 检查是否有 premium_unlock 类型的交易记录...')

      const [results] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as count 
         FROM points_transactions 
         WHERE business_type = 'premium_unlock'`,
        { transaction, type: Sequelize.QueryTypes.SELECT }
      )

      if (results[0].count > 0) {
        console.warn(`⚠️ 警告：存在 ${results[0].count} 条 premium_unlock 类型的交易记录`)
        console.warn('⚠️ 回滚前需要先删除或转换这些记录')
        throw new Error('无法回滚：存在 premium_unlock 类型的交易记录')
      }

      /*
       * ========================================
       * 恢复原始枚举值（移除 premium_unlock）
       * ========================================
       */
      console.log('📋 恢复 points_transactions.business_type 原始枚举值...')

      await queryInterface.sequelize.query(
        `ALTER TABLE points_transactions 
         MODIFY COLUMN business_type ENUM(
           'task_complete',
           'lottery_consume',
           'admin_adjust',
           'refund',
           'expire',
           'behavior_reward',
           'recommendation_bonus',
           'activity_bonus',
           'consumption_reward'
         ) NOT NULL COMMENT '业务类型'`,
        { transaction }
      )

      console.log('✅ business_type 枚举值已恢复（已移除 premium_unlock）')

      /*
       * ========================================
       * 提交事务
       * ========================================
       */
      await transaction.commit()

      console.log('\n' + '='.repeat(60))
      console.log('✅ premium_unlock 枚举值回滚完成！')
      console.log('='.repeat(60))
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      console.error('❌ 回滚 premium_unlock 枚举值失败:', error.message)
      throw error
    }
  }
}
