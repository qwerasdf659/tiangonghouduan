/**
 * 积分服务 - V4.3 统一积分系统
 *
 * 功能：
 * 1. 统一积分账户管理
 * 2. 积分交易记录
 * 3. 积分余额查询
 * 4. 积分历史统计
 *
 * 设计原则：
 * - 只使用新积分系统 (UserPointsAccount + PointsTransaction)
 * - 同步更新 history_total_points 用于臻选空间解锁
 * - 完整的交易记录和审计
 *
 * 创建时间：2025-09-28
 */

const { UserPointsAccount, PointsTransaction, User } = require('../models')
const { Sequelize } = require('sequelize')

class PointsService {
  /**
   * 获取用户积分账户
   * @param {number} userId - 用户ID
   * @returns {Object} 积分账户信息
   */
  static async getUserPointsAccount (userId) {
    let account = await UserPointsAccount.findOne({
      where: { user_id: userId, is_active: true }
    })

    // 如果账户不存在，自动创建
    if (!account) {
      account = await this.createPointsAccount(userId)
    }

    return account
  }

  /**
   * 创建积分账户
   * @param {number} userId - 用户ID
   * @returns {Object} 新创建的积分账户
   */
  static async createPointsAccount (userId) {
    // 获取用户的历史积分作为初始值
    const user = await User.findByPk(userId)
    if (!user) {
      throw new Error('用户不存在')
    }

    const initialPoints = user.history_total_points || 0

    const account = await UserPointsAccount.create({
      user_id: userId,
      available_points: initialPoints,
      total_earned: initialPoints,
      total_consumed: 0,
      is_active: true
    })

    // 如果有初始积分，创建迁移记录
    if (initialPoints > 0) {
      await PointsTransaction.create({
        user_id: userId,
        account_id: account.account_id,
        transaction_type: 'earn',
        points_amount: initialPoints,
        points_balance_before: 0,
        points_balance_after: initialPoints,
        business_type: 'system_migration',
        source_type: 'system',
        transaction_title: '积分系统迁移',
        transaction_description: '从旧积分系统迁移历史积分',
        transaction_time: new Date(),
        status: 'completed'
      })
    }

    return account
  }

  /**
   * 增加积分
   * @param {number} userId - 用户ID
   * @param {number} points - 积分数量
   * @param {Object} options - 交易选项
   * @returns {Object} 交易结果
   */
  static async addPoints (userId, points, options = {}) {
    if (points <= 0) {
      throw new Error('积分数量必须大于0')
    }

    const account = await this.getUserPointsAccount(userId)
    const oldBalance = parseFloat(account.available_points)
    const newBalance = oldBalance + points
    const newTotalEarned = account.total_earned + points

    // 更新积分账户
    await account.update({
      available_points: newBalance,
      total_earned: newTotalEarned,
      last_earn_time: new Date()
    })

    // 同步更新用户表的history_total_points
    await User.update(
      { history_total_points: newTotalEarned },
      { where: { user_id: userId } }
    )

    // 创建交易记录
    const transaction = await PointsTransaction.create({
      user_id: userId,
      account_id: account.account_id,
      transaction_type: 'earn',
      points_amount: points,
      points_balance_before: oldBalance,
      points_balance_after: newBalance,
      business_type: options.business_type || 'manual',
      source_type: options.source_type || 'system',
      transaction_title: options.title || '积分获得',
      transaction_description: options.description || '',
      operator_id: options.operator_id || null,
      transaction_time: new Date(),
      status: 'completed'
    })

    return {
      success: true,
      transaction_id: transaction.transaction_id,
      old_balance: oldBalance,
      new_balance: newBalance,
      points_added: points,
      total_earned: newTotalEarned
    }
  }

  /**
   * 消费积分
   * @param {number} userId - 用户ID
   * @param {number} points - 积分数量
   * @param {Object} options - 交易选项
   * @returns {Object} 交易结果
   */
  static async consumePoints (userId, points, options = {}) {
    if (points <= 0) {
      throw new Error('积分数量必须大于0')
    }

    const account = await this.getUserPointsAccount(userId)
    const oldBalance = parseFloat(account.available_points)

    if (oldBalance < points) {
      throw new Error('积分余额不足')
    }

    const newBalance = oldBalance - points
    const newTotalConsumed = account.total_consumed + points

    // 更新积分账户
    await account.update({
      available_points: newBalance,
      total_consumed: newTotalConsumed,
      last_consume_time: new Date()
    })

    // 创建交易记录
    const transaction = await PointsTransaction.create({
      user_id: userId,
      account_id: account.account_id,
      transaction_type: 'consume',
      points_amount: points,
      points_balance_before: oldBalance,
      points_balance_after: newBalance,
      business_type: options.business_type || 'manual',
      source_type: options.source_type || 'system',
      transaction_title: options.title || '积分消费',
      transaction_description: options.description || '',
      operator_id: options.operator_id || null,
      transaction_time: new Date(),
      status: 'completed'
    })

    return {
      success: true,
      transaction_id: transaction.transaction_id,
      old_balance: oldBalance,
      new_balance: newBalance,
      points_consumed: points,
      total_consumed: newTotalConsumed
    }
  }

  /**
   * 获取积分余额
   * @param {number} userId - 用户ID
   * @returns {Object} 积分余额信息
   */
  static async getPointsBalance (userId) {
    const account = await this.getUserPointsAccount(userId)

    return {
      user_id: userId,
      available_points: parseFloat(account.available_points),
      total_earned: parseFloat(account.total_earned),
      total_consumed: parseFloat(account.total_consumed),
      account_status: account.is_active ? 'active' : 'inactive',
      last_earn_time: account.last_earn_time,
      last_consume_time: account.last_consume_time,
      created_at: account.created_at
    }
  }

  /**
   * 获取积分交易历史
   * @param {number} userId - 用户ID
   * @param {Object} options - 查询选项
   * @returns {Object} 交易历史
   */
  static async getPointsHistory (userId, options = {}) {
    const {
      page = 1,
      limit = 20,
      transaction_type = null,
      start_date = null,
      end_date = null
    } = options

    const whereClause = { user_id: userId }

    if (transaction_type) {
      whereClause.transaction_type = transaction_type
    }

    if (start_date && end_date) {
      whereClause.transaction_time = {
        [Sequelize.Op.between]: [start_date, end_date]
      }
    }

    const offset = (page - 1) * limit

    const { count, rows: transactions } = await PointsTransaction.findAndCountAll({
      where: whereClause,
      order: [['transaction_time', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    })

    return {
      transactions: transactions.map(t => ({
        transaction_id: t.transaction_id,
        transaction_type: t.transaction_type,
        points_amount: parseFloat(t.points_amount),
        points_balance_before: parseFloat(t.points_balance_before),
        points_balance_after: parseFloat(t.points_balance_after),
        business_type: t.business_type,
        source_type: t.source_type,
        transaction_title: t.transaction_title,
        transaction_description: t.transaction_description,
        transaction_time: t.transaction_time,
        status: t.status
      })),
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(count / limit)
      }
    }
  }

  /**
   * 积分统计
   * @param {number} userId - 用户ID
   * @returns {Object} 积分统计信息
   */
  static async getPointsStatistics (userId) {
    const account = await this.getUserPointsAccount(userId)

    // 获取最近30天的交易统计
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const recentEarned = await PointsTransaction.sum('points_amount', {
      where: {
        user_id: userId,
        transaction_type: 'earn',
        transaction_time: {
          [Sequelize.Op.gte]: thirtyDaysAgo
        }
      }
    }) || 0

    const recentConsumed = await PointsTransaction.sum('points_amount', {
      where: {
        user_id: userId,
        transaction_type: 'consume',
        transaction_time: {
          [Sequelize.Op.gte]: thirtyDaysAgo
        }
      }
    }) || 0

    return {
      current_balance: parseFloat(account.available_points),
      total_earned: parseFloat(account.total_earned),
      total_consumed: parseFloat(account.total_consumed),
      recent_30_days: {
        earned: parseFloat(recentEarned),
        consumed: parseFloat(recentConsumed),
        net_change: parseFloat(recentEarned) - parseFloat(recentConsumed)
      },
      account_age_days: Math.floor((new Date() - account.created_at) / (1000 * 60 * 60 * 24))
    }
  }

  /**
   * 检查用户是否有足够积分
   * @param {number} userId - 用户ID
   * @param {number} requiredPoints - 需要的积分数量
   * @returns {boolean} 是否有足够积分
   */
  static async hasEnoughPoints (userId, requiredPoints) {
    const account = await this.getUserPointsAccount(userId)
    return parseFloat(account.available_points) >= requiredPoints
  }

  /**
   * 批量积分操作（事务安全）
   * @param {Array} operations - 操作列表
   * @returns {Object} 批量操作结果
   */
  static async batchPointsOperation (operations) {
    const { sequelize } = require('../models')
    const transaction = await sequelize.transaction()

    try {
      const results = []

      for (const operation of operations) {
        const { type, userId, points, options } = operation

        let result
        if (type === 'add') {
          result = await this.addPoints(userId, points, { ...options, transaction })
        } else if (type === 'consume') {
          result = await this.consumePoints(userId, points, { ...options, transaction })
        } else {
          throw new Error(`未知的操作类型: ${type}`)
        }

        results.push({
          operation,
          result,
          success: true
        })
      }

      await transaction.commit()

      return {
        success: true,
        results,
        total_operations: operations.length,
        successful_operations: results.length
      }
    } catch (error) {
      await transaction.rollback()
      throw new Error(`批量积分操作失败: ${error.message}`)
    }
  }
}

module.exports = PointsService
