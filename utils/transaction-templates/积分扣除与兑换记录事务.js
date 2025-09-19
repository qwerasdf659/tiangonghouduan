/**
 * 积分扣除与兑换记录事务模板
 * 确保积分扣除和兑换记录创建的原子性
 */

const { sequelize } = require('../../config/database')

class PointsExchangeTransaction {
  /**
   * 执行安全的积分兑换事务
   * @param {number} userId 用户ID
   * @param {number} pointsCost 积分消耗
   * @param {number} prizeId 奖品ID
   */
  static async executeExchange (userId, pointsCost, prizeId) {
    const transaction = await sequelize.transaction()

    try {
      // 1. 检查用户积分余额
      const [user] = await sequelize.query(
        'SELECT points FROM users WHERE id = :userId FOR UPDATE',
        {
          replacements: { userId },
          transaction,
          type: sequelize.QueryTypes.SELECT
        }
      )

      if (!user || user.points < pointsCost) {
        throw new Error('积分余额不足')
      }

      // 2. 扣除用户积分
      await sequelize.query('UPDATE users SET points = points - :pointsCost WHERE id = :userId', {
        replacements: { userId, pointsCost },
        transaction
      })

      // 3. 创建积分扣除记录 - 使用PointsTransaction替代points_records
      const [pointsRecord] = await sequelize.query(
        `
        INSERT INTO points_transactions (user_id, account_id, transaction_type, points_amount, 
                                       points_balance_before, points_balance_after, business_type, 
                                       description, metadata, created_at)
        SELECT :userId, account_id, 'consume', :pointsCostNegative, 
               current_points, current_points - :pointsCost, 'lottery_consume',
               :description, JSON_OBJECT('prize_id', :prizeId), NOW()
        FROM user_points_accounts WHERE user_id = :userId
      `,
        {
          replacements: {
            userId,
            pointsCost,
            pointsCostNegative: -Math.abs(pointsCost), // 消费为负数
            description: `兑换奖品: ${prizeId}`,
            prizeId
          },
          transaction
        }
      )

      // 4. 创建兑换记录
      const [exchangeRecord] = await sequelize.query(
        `
        INSERT INTO exchange_records (user_id, prize_id, points_cost, status, created_at)
        VALUES (:userId, :prizeId, :pointsCost, 'pending', NOW())
      `,
        {
          replacements: { userId, prizeId, pointsCost },
          transaction
        }
      )

      // 5. 更新奖品库存（如果需要）
      await sequelize.query(
        `
        UPDATE prizes 
        SET stock = stock - 1 
        WHERE id = :prizeId AND stock > 0
      `,
        {
          replacements: { prizeId },
          transaction
        }
      )

      // 提交事务
      await transaction.commit()

      return {
        success: true,
        exchangeId: exchangeRecord.insertId,
        pointsRecordId: pointsRecord.insertId
      }
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      throw new Error(`兑换事务失败: ${error.message}`)
    }
  }
}

module.exports = PointsExchangeTransaction
