'use strict'

/**
 * 商家积分审核状态枚举简化迁移
 *
 * 业务背景（2026-01-08 拍板）：
 * - 采用"奖励发放模型"，简化状态机
 * - 移除 expired/cancelled 状态，仅保留 pending/approved/rejected
 * - 前提：表中无现有数据（已验证）
 *
 * 变更内容：
 * - 修改 merchant_points_reviews.status ENUM 为 ('pending', 'approved', 'rejected')
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      console.log('📝 [迁移] 简化 merchant_points_reviews.status 枚举...')

      // 1. 检查是否有使用旧状态的数据
      const [records] = await queryInterface.sequelize.query(
        `SELECT COUNT(*) as cnt FROM merchant_points_reviews 
         WHERE status IN ('expired', 'cancelled')`,
        { transaction }
      )

      if (records[0].cnt > 0) {
        throw new Error(`存在 ${records[0].cnt} 条使用旧状态的记录，无法简化枚举`)
      }

      // 2. 修改 ENUM（MySQL 需要重建列）
      await queryInterface.sequelize.query(
        `ALTER TABLE merchant_points_reviews 
         MODIFY COLUMN status ENUM('pending', 'approved', 'rejected') 
         NOT NULL DEFAULT 'pending' 
         COMMENT '审核状态：pending=审核中/approved=审核通过/rejected=审核拒绝'`,
        { transaction }
      )

      console.log('✅ status 枚举已简化为: pending/approved/rejected')

      await transaction.commit()
      console.log('✅ [迁移] 商家积分审核状态枚举简化完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [迁移] 失败:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()
    try {
      console.log('⏪ [回滚] 恢复 merchant_points_reviews.status 枚举...')

      await queryInterface.sequelize.query(
        `ALTER TABLE merchant_points_reviews 
         MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'expired', 'cancelled') 
         NOT NULL DEFAULT 'pending' 
         COMMENT '审核状态'`,
        { transaction }
      )

      await transaction.commit()
      console.log('⏪ [回滚] status 枚举已恢复')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [回滚] 失败:', error.message)
      throw error
    }
  }
}
