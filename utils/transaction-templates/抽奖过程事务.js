/**
 * 抽奖过程事务模板
 * 确保抽奖记录创建和库存更新的原子性
 */

const { sequelize } = require('../../config/database')

class LotteryTransaction {
  /**
   * 执行安全的抽奖事务
   * @param {number} userId 用户ID
   * @param {number} campaignId 活动ID
   * @param {boolean} is_winner 是否中奖（业务标准字段）
   * @param {number|null} prizeId 奖品ID
   */
  static async executeLottery (userId, campaignId, is_winner, prizeId = null) {
    const transaction = await sequelize.transaction()

    try {
      // 1. 检查用户是否符合抽奖条件
      const [user] = await sequelize.query('SELECT id, points FROM users WHERE id = :userId', {
        replacements: { userId },
        transaction,
        type: sequelize.QueryTypes.SELECT
      })

      if (!user) {
        throw new Error('用户不存在')
      }

      // 2. 检查活动状态
      const [campaign] = await sequelize.query(
        `
        SELECT id, status, max_participants 
        FROM lottery_campaigns 
        WHERE id = :campaignId AND status = 'active'
      `,
        {
          replacements: { campaignId },
          transaction,
          type: sequelize.QueryTypes.SELECT
        }
      )

      if (!campaign) {
        throw new Error('活动不存在或已结束')
      }

      // 3. 如果中奖，检查奖品库存
      if (is_winner && prizeId) {
        const [prize] = await sequelize.query(
          `
          SELECT id, stock 
          FROM prizes 
          WHERE id = :prizeId AND stock > 0 FOR UPDATE
        `,
          {
            replacements: { prizeId },
            transaction,
            type: sequelize.QueryTypes.SELECT
          }
        )

        if (!prize) {
          throw new Error('奖品库存不足')
        }

        // 扣减库存
        await sequelize.query(
          `
          UPDATE prizes 
          SET stock = stock - 1 
          WHERE id = :prizeId
        `,
          {
            replacements: { prizeId },
            transaction
          }
        )
      }

      // 4. 创建抽奖记录 - 使用业务标准字段名
      const [lotteryRecord] = await sequelize.query(
        `
        INSERT INTO lottery_records (user_id, campaign_id, prize_id, is_winner, created_at)
        VALUES (:userId, :campaignId, :prizeId, :is_winner, NOW())
      `,
        {
          replacements: {
            userId,
            campaignId,
            prizeId: prizeId || null,
            is_winner: is_winner ? 1 : 0
          },
          transaction
        }
      )

      // 提交事务
      await transaction.commit()

      return {
        success: true,
        lotteryRecordId: lotteryRecord.insertId,
        is_winner, // ✅ 业务标准：统一使用is_winner
        prizeId
      }
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      throw new Error(`抽奖事务失败: ${error.message}`)
    }
  }
}

module.exports = LotteryTransaction
