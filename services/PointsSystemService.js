/**
 * 🔥 积分系统服务 v3 - 完整数据库实现版
 * 创建时间：2025年08月19日 UTC
 * 更新时间：2025年08月20日 - 修复字段名匹配问题
 * 特点：完全分离式积分管理 + 真实数据库操作 + 事务安全
 * 功能：积分获取、消费、交易记录、等级升级、规则管理
 */

'use strict'

const { UserPointsAccount, PointsTransaction } = require('../models')
const { sequelize } = require('../models')
const EventBusService = require('./EventBusService')

/**
 * 积分系统服务类
 * 负责所有积分相关的业务逻辑和数据库操作
 */
class PointsSystemService {
  /**
   * 🔥 获取用户积分账户信息
   * @param {number} userId - 用户ID
   * @returns {Object} 积分账户信息
   */
  static async getUserPointsAccount (userId) {
    try {
      console.log(`💰 获取用户积分账户: 用户ID=${userId}`)

      // 查找或创建用户积分账户
      let account = await UserPointsAccount.findOne({
        where: { user_id: userId }
      })

      if (!account) {
        // 自动创建新用户积分账户 - 使用正确的V3字段名
        account = await UserPointsAccount.create({
          user_id: userId,
          available_points: 0.0,
          total_earned: 0.0,
          total_consumed: 0.0,
          account_level: 'bronze',
          is_active: true,
          behavior_score: 50.0,
          activity_level: 'medium',
          preference_tags: null,
          recommendation_enabled: true
        })

        console.log(`✅ 新建积分账户: 用户ID=${userId}`)

        // 发送新账户创建事件
        await EventBusService.emit('points:account_created', {
          user_id: userId,
          initial_points: 0,
          level: 'bronze',
          created_time: new Date().toISOString()
        })
      }

      return {
        success: true,
        data: {
          account_id: account.account_id,
          user_id: account.user_id,
          available_points: parseFloat(account.available_points || 0),
          total_earned: parseFloat(account.total_earned || 0),
          total_consumed: parseFloat(account.total_consumed || 0),
          account_level: account.account_level,
          behavior_score: parseFloat(account.behavior_score || 50),
          activity_level: account.activity_level,
          is_active: account.is_active,
          last_earn_time: account.last_earn_time,
          last_consume_time: account.last_consume_time,
          recommendation_enabled: account.recommendation_enabled,
          created_at: account.created_at,
          updated_at: account.updated_at
        }
      }
    } catch (error) {
      console.error('获取用户积分账户失败:', error)
      return {
        success: false,
        error: 'GET_ACCOUNT_FAILED',
        message: '获取积分账户失败: ' + error.message
      }
    }
  }

  /**
   * 🔥 积分获取（收入）
   * @param {number} userId - 用户ID
   * @param {number} points - 积分数量
   * @param {Object} options - 选项
   * @returns {Object} 操作结果
   */
  static async earnPoints (userId, points, options = {}) {
    const transaction = await sequelize.transaction()

    try {
      console.log(`💎 用户获得积分: 用户ID=${userId}, 积分=${points}, 来源=${options.source}`)

      // 验证参数
      if (!userId || points <= 0) {
        throw new Error('无效的用户ID或积分数量')
      }

      // 获取用户积分账户（带锁）
      let account = await UserPointsAccount.findOne({
        where: { user_id: userId },
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      // 如果账户不存在，创建新账户
      if (!account) {
        account = await UserPointsAccount.create(
          {
            user_id: userId,
            available_points: 0.0,
            total_earned: 0.0,
            total_consumed: 0.0,
            account_level: 'bronze',
            is_active: true,
            behavior_score: 50.0,
            activity_level: 'medium',
            preference_tags: null,
            recommendation_enabled: true
          },
          { transaction }
        )
      }

      // 检查账户状态
      if (!account.is_active) {
        throw new Error('用户积分账户已停用')
      }

      // 计算新的积分余额
      const newAvailablePoints = parseFloat(account.available_points) + points
      const newTotalEarned = parseFloat(account.total_earned) + points

      // 更新积分账户
      await account.update(
        {
          available_points: newAvailablePoints,
          total_earned: newTotalEarned,
          last_earn_time: new Date()
        },
        { transaction }
      )

      // 创建积分交易记录
      const transactionRecord = await PointsTransaction.create(
        {
          user_id: userId,
          account_id: account.account_id,
          transaction_type: 'earn',
          points_amount: points,
          points_balance_before: parseFloat(account.available_points),
          points_balance_after: newAvailablePoints,
          business_type: options.business_type || 'system_reward',
          source_type: options.source_type || 'system',
          business_id: options.business_id || null,
          trigger_event: options.trigger_event || null,
          user_activity_level: account.activity_level,
          transaction_title: options.title || '积分获得',
          transaction_description: options.description || `获得${points}积分`,
          operator_id: options.operator_id || null,
          transaction_time: new Date(),
          status: 'completed'
        },
        { transaction }
      )

      // 检查是否需要升级等级
      const newLevel = this.calculateLevel(newTotalEarned)
      if (newLevel !== account.account_level) {
        await account.update({ account_level: newLevel }, { transaction })
        console.log(`🎉 用户等级升级: 用户ID=${userId}, 新等级=${newLevel}`)
      }

      // 提交事务
      await transaction.commit()

      console.log(`✅ 积分获得成功: 用户ID=${userId}, 获得=${points}, 余额=${newAvailablePoints}`)

      // 发送积分获得事件
      await EventBusService.emit('points:earned', {
        user_id: userId,
        points_earned: points,
        new_balance: newAvailablePoints,
        source: options.source,
        transaction_id: transactionRecord.transaction_id,
        level_changed: newLevel !== account.account_level,
        new_level: newLevel,
        timestamp: new Date().toISOString()
      })

      return {
        success: true,
        data: {
          transaction_id: transactionRecord.transaction_id,
          points_earned: points,
          new_balance: newAvailablePoints,
          total_earned: newTotalEarned,
          level: newLevel,
          level_changed: newLevel !== account.account_level
        },
        message: '积分获得成功'
      }
    } catch (error) {
      await transaction.rollback()
      console.error('积分获得失败:', error)
      return {
        success: false,
        error: 'EARN_POINTS_FAILED',
        message: error.message || '积分获得失败'
      }
    }
  }

  /**
   * 🔥 积分消费（支出）
   * @param {number} userId - 用户ID
   * @param {number} points - 积分数量
   * @param {Object} options - 选项
   * @returns {Object} 操作结果
   */
  static async consumePoints (userId, points, options = {}) {
    const transaction = await sequelize.transaction()

    try {
      console.log(`💸 用户消费积分: 用户ID=${userId}, 积分=${points}, 目的=${options.source}`)

      // 验证参数
      if (!userId || points <= 0) {
        throw new Error('无效的用户ID或积分数量')
      }

      // 获取用户积分账户（带锁）
      const account = await UserPointsAccount.findOne({
        where: { user_id: userId },
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!account) {
        throw new Error('用户积分账户不存在')
      }

      // 检查账户状态
      if (!account.is_active) {
        throw new Error('用户积分账户已停用')
      }

      // 检查积分余额
      const currentBalance = parseFloat(account.available_points)
      if (currentBalance < points) {
        throw new Error(`积分余额不足，当前余额：${currentBalance}，需要：${points}`)
      }

      // 计算新的积分余额
      const newAvailablePoints = currentBalance - points
      const newTotalConsumed = parseFloat(account.total_consumed) + points

      // 更新积分账户
      await account.update(
        {
          available_points: newAvailablePoints,
          total_consumed: newTotalConsumed,
          last_consume_time: new Date()
        },
        { transaction }
      )

      // 创建积分交易记录
      const transactionRecord = await PointsTransaction.create(
        {
          user_id: userId,
          account_id: account.account_id,
          transaction_type: 'consume',
          points_amount: -points, // 负数表示消费
          points_balance_before: currentBalance,
          points_balance_after: newAvailablePoints,
          business_type: options.business_type || 'lottery_consume',
          source_type: options.source_type || 'user',
          business_id: options.business_id || null,
          trigger_event: options.trigger_event || null,
          user_activity_level: account.activity_level,
          transaction_title: options.title || '积分消费',
          transaction_description: options.description || `消费${points}积分`,
          operator_id: options.operator_id || null,
          transaction_time: new Date(),
          status: 'completed'
        },
        { transaction }
      )

      // 提交事务
      await transaction.commit()

      console.log(`✅ 积分消费成功: 用户ID=${userId}, 消费=${points}, 余额=${newAvailablePoints}`)

      // 发送积分消费事件
      await EventBusService.emit('points:consumed', {
        user_id: userId,
        points_consumed: points,
        new_balance: newAvailablePoints,
        source: options.source,
        transaction_id: transactionRecord.transaction_id,
        timestamp: new Date().toISOString()
      })

      return {
        success: true,
        data: {
          transaction_id: transactionRecord.transaction_id,
          points_consumed: points,
          new_balance: newAvailablePoints,
          total_consumed: newTotalConsumed
        },
        message: '积分消费成功'
      }
    } catch (error) {
      await transaction.rollback()
      console.error('积分消费失败:', error)
      return {
        success: false,
        error: 'CONSUME_POINTS_FAILED',
        message: error.message || '积分消费失败'
      }
    }
  }

  /**
   * 🔥 获取用户积分交易记录
   * @param {number} userId - 用户ID
   * @param {Object} options - 查询选项
   * @returns {Object} 交易记录列表
   */
  static async getUserTransactions (userId, options = {}) {
    try {
      const { page = 1, limit = 20, type = null, start_date = null, end_date = null } = options

      console.log(`📋 获取用户积分交易记录: 用户ID=${userId}, 页面=${page}, 限制=${limit}`)

      // 构建查询条件
      const whereCondition = { user_id: userId }

      if (type) {
        whereCondition.transaction_type = type
      }

      if (start_date || end_date) {
        whereCondition.transaction_time = {}
        if (start_date) {
          whereCondition.transaction_time[sequelize.Op.gte] = new Date(start_date)
        }
        if (end_date) {
          whereCondition.transaction_time[sequelize.Op.lte] = new Date(end_date)
        }
      }

      const offset = (page - 1) * limit

      // 查询交易记录
      const result = await PointsTransaction.findAndCountAll({
        where: whereCondition,
        order: [['transaction_time', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset),
        include: [
          {
            model: UserPointsAccount,
            as: 'account',
            attributes: ['account_level', 'activity_level']
          }
        ]
      })

      // 格式化数据
      const transactions = result.rows.map(transaction => ({
        transaction_id: transaction.transaction_id,
        transaction_type: transaction.transaction_type,
        points_amount: parseFloat(transaction.points_amount),
        points_balance_before: parseFloat(transaction.points_balance_before),
        points_balance_after: parseFloat(transaction.points_balance_after),
        business_type: transaction.business_type,
        source_type: transaction.source_type,
        transaction_title: transaction.transaction_title,
        transaction_description: transaction.transaction_description,
        transaction_time: transaction.transaction_time,
        status: transaction.status,
        account_level: transaction.account?.account_level,
        activity_level: transaction.account?.activity_level
      }))

      const totalPages = Math.ceil(result.count / limit)

      return {
        success: true,
        data: {
          transactions,
          pagination: {
            current_page: parseInt(page),
            total_pages: totalPages,
            total_count: result.count,
            limit: parseInt(limit),
            has_next: page < totalPages,
            has_prev: page > 1
          }
        },
        message: '获取交易记录成功'
      }
    } catch (error) {
      console.error('获取用户积分交易记录失败:', error)
      return {
        success: false,
        error: 'GET_TRANSACTIONS_FAILED',
        message: '获取交易记录失败: ' + error.message
      }
    }
  }

  /**
   * 🔥 计算用户等级
   * @param {number} totalEarned - 累计获得积分
   * @returns {string} 用户等级
   */
  static calculateLevel (totalEarned) {
    if (totalEarned >= 20000) return 'diamond'
    if (totalEarned >= 5000) return 'gold'
    if (totalEarned >= 1000) return 'silver'
    return 'bronze'
  }

  /**
   * 🔥 验证积分操作权限
   * @param {number} userId - 用户ID
   * @param {string} operation - 操作类型
   * @param {number} amount - 积分数量
   * @returns {Object} 验证结果
   */
  static async validatePointsOperation (userId, operation, amount) {
    try {
      const account = await UserPointsAccount.findOne({
        where: { user_id: userId }
      })

      if (!account) {
        return {
          success: false,
          error: 'ACCOUNT_NOT_FOUND',
          message: '积分账户不存在'
        }
      }

      if (!account.is_active) {
        return {
          success: false,
          error: 'ACCOUNT_INACTIVE',
          message: '积分账户已停用'
        }
      }

      if (operation === 'consume' && parseFloat(account.available_points) < amount) {
        return {
          success: false,
          error: 'INSUFFICIENT_BALANCE',
          message: '积分余额不足'
        }
      }

      return {
        success: true,
        data: {
          user_id: userId,
          available_points: parseFloat(account.available_points),
          account_level: account.account_level,
          is_active: account.is_active
        }
      }
    } catch (error) {
      console.error('验证积分操作权限失败:', error)
      return {
        success: false,
        error: 'VALIDATION_FAILED',
        message: '权限验证失败: ' + error.message
      }
    }
  }

  /**
   * 🔥 获取积分统计信息（管理员用）
   * @param {Object} options - 统计选项
   * @returns {Object} 统计数据
   */
  static async getPointsStatistics (options = {}) {
    try {
      const { start_date = null, end_date = null, time_range = '7d' } = options

      // 计算时间范围
      let startDate, endDate
      if (start_date && end_date) {
        startDate = new Date(start_date)
        endDate = new Date(end_date)
      } else {
        endDate = new Date()
        const days = parseInt(time_range.replace('d', '')) || 7
        startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000)
      }

      // 并行执行多个统计查询
      const [totalStats, earnStats, consumeStats, userStats] = await Promise.all([
        // 总体统计
        PointsTransaction.findAll({
          attributes: [
            [
              sequelize.fn(
                'SUM',
                sequelize.literal(
                  'CASE WHEN transaction_type = "earn" THEN points_amount ELSE 0 END'
                )
              ),
              'total_earned'
            ],
            [
              sequelize.fn(
                'SUM',
                sequelize.literal(
                  'CASE WHEN transaction_type = "consume" THEN ABS(points_amount) ELSE 0 END'
                )
              ),
              'total_consumed'
            ],
            [sequelize.fn('COUNT', sequelize.col('transaction_id')), 'total_transactions']
          ],
          where: {
            transaction_time: {
              [sequelize.Op.between]: [startDate, endDate]
            }
          },
          raw: true
        }),

        // 积分获得统计
        PointsTransaction.findAll({
          attributes: [
            [sequelize.fn('DATE', sequelize.col('transaction_time')), 'date'],
            [sequelize.fn('SUM', sequelize.col('points_amount')), 'daily_earned']
          ],
          where: {
            transaction_type: 'earn',
            transaction_time: {
              [sequelize.Op.between]: [startDate, endDate]
            }
          },
          group: [sequelize.fn('DATE', sequelize.col('transaction_time'))],
          order: [[sequelize.fn('DATE', sequelize.col('transaction_time')), 'ASC']],
          raw: true
        }),

        // 积分消费统计
        PointsTransaction.findAll({
          attributes: [
            [sequelize.fn('DATE', sequelize.col('transaction_time')), 'date'],
            [sequelize.fn('SUM', sequelize.literal('ABS(points_amount)')), 'daily_consumed']
          ],
          where: {
            transaction_type: 'consume',
            transaction_time: {
              [sequelize.Op.between]: [startDate, endDate]
            }
          },
          group: [sequelize.fn('DATE', sequelize.col('transaction_time'))],
          order: [[sequelize.fn('DATE', sequelize.col('transaction_time')), 'ASC']],
          raw: true
        }),

        // 用户统计
        UserPointsAccount.findAll({
          attributes: [
            [sequelize.fn('COUNT', sequelize.col('account_id')), 'total_accounts'],
            [sequelize.fn('SUM', sequelize.col('available_points')), 'total_balance'],
            [sequelize.fn('AVG', sequelize.col('available_points')), 'avg_balance']
          ],
          where: {
            is_active: true
          },
          raw: true
        })
      ])

      return {
        success: true,
        data: {
          summary: {
            total_earned: parseFloat(totalStats[0]?.total_earned || 0),
            total_consumed: parseFloat(totalStats[0]?.total_consumed || 0),
            total_transactions: parseInt(totalStats[0]?.total_transactions || 0),
            total_accounts: parseInt(userStats[0]?.total_accounts || 0),
            total_balance: parseFloat(userStats[0]?.total_balance || 0),
            avg_balance: parseFloat(userStats[0]?.avg_balance || 0),
            time_range: `${startDate.toISOString().split('T')[0]} 到 ${endDate.toISOString().split('T')[0]}`
          },
          daily_trends: {
            earned: earnStats,
            consumed: consumeStats
          }
        },
        message: '获取积分统计成功'
      }
    } catch (error) {
      console.error('获取积分统计失败:', error)
      return {
        success: false,
        error: 'GET_STATISTICS_FAILED',
        message: '获取统计数据失败: ' + error.message
      }
    }
  }
}

module.exports = PointsSystemService
