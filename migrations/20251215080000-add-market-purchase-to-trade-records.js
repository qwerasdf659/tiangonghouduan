/**
 * 迁移文件：在trade_records表的trade_type枚举中添加market_purchase
 *
 * 业务背景：
 * - 交易市场从积分结算迁移到DIAMOND资产结算
 * - 需要新的trade_type类型来记录市场购买交易
 * - market_purchase用于交易市场DIAMOND结算的交易记录
 *
 * 变更内容：
 * - 在trade_type枚举中添加'market_purchase'值
 *
 * 影响范围：
 * - trade_records表
 * - 相关查询和统计逻辑
 *
 * 创建时间：2025-12-15
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：添加market_purchase到trade_type枚举
   *
   * MySQL ALTER TABLE ADD ENUM 语法：
   * - 使用MODIFY COLUMN重新定义枚举类型，包含新值
   * - 必须列出所有现有值 + 新值，否则会丢失数据
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize对象
   * @returns {Promise<void>}
   */
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      /*
       * 修改trade_type枚举，添加market_purchase
       * 注意：必须包含所有现有值，否则会丢失数据
       */
      await queryInterface.sequelize.query(
        `
        ALTER TABLE trade_records
        MODIFY COLUMN trade_type ENUM(
          'point_transfer',
          'exchange_refund',
          'prize_claim',
          'admin_adjustment',
          'system_reward',
          'inventory_transfer',
          'market_purchase'
        ) NOT NULL
        COMMENT '交易类型：point_transfer-积分转账，exchange_refund-兑换退款，prize_claim-奖品领取，admin_adjustment-管理员调整，system_reward-系统奖励，inventory_transfer-物品转让，market_purchase-市场购买（交易市场DIAMOND结算）'
        `,
        { transaction }
      )

      await transaction.commit()
      console.log('✅ 成功在trade_records.trade_type枚举中添加market_purchase')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：从trade_type枚举中移除market_purchase
   *
   * 注意：
   * - 回滚前会检查是否有使用market_purchase的记录
   * - 如果存在记录，拒绝回滚，需要先处理数据
   *
   * @param {Object} queryInterface - Sequelize查询接口
   * @param {Object} Sequelize - Sequelize对象
   * @returns {Promise<void>}
   */
  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 检查是否有使用market_purchase的记录
      const [results] = await queryInterface.sequelize.query(
        "SELECT COUNT(*) as count FROM trade_records WHERE trade_type = 'market_purchase'",
        { transaction }
      )

      const count = results[0].count

      if (count > 0) {
        throw new Error(
          `无法回滚：数据库中存在${count}条trade_type=market_purchase的记录。` +
            '请先手动处理这些记录，然后再执行回滚。'
        )
      }

      // 移除market_purchase枚举值
      await queryInterface.sequelize.query(
        `
        ALTER TABLE trade_records
        MODIFY COLUMN trade_type ENUM(
          'point_transfer',
          'exchange_refund',
          'prize_claim',
          'admin_adjustment',
          'system_reward',
          'inventory_transfer'
        ) NOT NULL
        COMMENT '交易类型：point_transfer-积分转账，exchange_refund-兑换退款，prize_claim-奖品领取，admin_adjustment-管理员调整，system_reward-系统奖励，inventory_transfer-物品转让'
        `,
        { transaction }
      )

      await transaction.commit()
      console.log('✅ 成功从trade_records.trade_type枚举中移除market_purchase')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
