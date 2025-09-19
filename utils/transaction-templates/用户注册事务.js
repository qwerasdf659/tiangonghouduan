/**
 * 用户注册事务模板
 * 确保用户创建和初始化的原子性
 */

const { sequelize } = require('../../config/database')

class UserRegistrationTransaction {
  /**
   * 执行安全的用户注册事务
   * @param {object} userData 用户数据
   */
  static async executeRegistration (userData) {
    const transaction = await sequelize.transaction()

    try {
      const { phone, nickname } = userData

      // 1. 检查手机号是否已注册
      const [existingUser] = await sequelize.query('SELECT id FROM users WHERE phone = :phone', {
        replacements: { phone },
        transaction,
        type: sequelize.QueryTypes.SELECT
      })

      if (existingUser) {
        throw new Error('手机号已注册')
      }

      // 2. 创建用户记录
      const [user] = await sequelize.query(
        `
        INSERT INTO users (phone, nickname, points, status, created_at)
        VALUES (:phone, :nickname, :initialPoints, 'active', NOW())
      `,
        {
          replacements: {
            phone,
            nickname: nickname || `用户${phone.slice(-4)}`,
            initialPoints: 100 // 新用户初始积分
          },
          transaction
        }
      )

      const userId = user.insertId

      // 3. 创建初始积分记录（原第4步提前）
      await sequelize.query(
        `
        INSERT INTO points_records (user_id, type, amount, source, description, created_at)
        VALUES (:userId, 'earn', :initialPoints, 'registration', '新用户注册奖励', NOW())
      `,
        {
          replacements: {
            userId,
            initialPoints: 100
          },
          transaction
        }
      )

      // 提交事务
      await transaction.commit()

      return {
        success: true,
        userId,
        initialPoints: 100
      }
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      throw new Error(`用户注册事务失败: ${error.message}`)
    }
  }
}

module.exports = UserRegistrationTransaction
