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

const BeijingTimeHelper = require('../utils/timeHelper')
const { UserPointsAccount, PointsTransaction, User } = require('../models')
const { Sequelize } = require('sequelize')

class PointsService {
  /**
   * 获取用户积分账户
   * @param {number} user_id - 用户ID
   * @returns {Object} 积分账户信息
   */
  static async getUserPointsAccount (user_id) {
    let account = await UserPointsAccount.findOne({
      where: { user_id, is_active: true }
    })

    // 如果账户不存在，自动创建
    if (!account) {
      account = await this.createPointsAccount(user_id)
    }

    return account
  }

  /**
   * 创建积分账户
   * @param {number} user_id - 用户ID
   * @returns {Object} 新创建的积分账户
   */
  static async createPointsAccount (user_id) {
    // 获取用户的历史积分作为初始值
    const user = await User.findByPk(user_id)
    if (!user) {
      throw new Error('用户不存在')
    }

    const initialPoints = user.history_total_points || 0

    const account = await UserPointsAccount.create({
      user_id,
      available_points: initialPoints,
      total_earned: initialPoints,
      total_consumed: 0,
      is_active: true
    })

    // 如果有初始积分，创建迁移记录
    if (initialPoints > 0) {
      await PointsTransaction.create({
        user_id,
        account_id: account.account_id,
        transaction_type: 'earn',
        points_amount: initialPoints,
        points_balance_before: 0,
        points_balance_after: initialPoints,
        business_type: 'system_migration',
        source_type: 'system',
        transaction_title: '积分系统迁移',
        transaction_description: '从旧积分系统迁移历史积分',
        transaction_time: BeijingTimeHelper.createBeijingTime(),
        status: 'completed'
      })
    }

    return account
  }

  /**
   * 增加积分
   * @param {number} user_id - 用户ID
   * @param {number} points - 积分数量
   * @param {Object} options - 交易选项
   * @param {Object} options.transaction - 外部事务对象（可选）
   * @param {string} options.business_id - 业务唯一ID（可选，用于幂等性控制）
   * @param {string} options.business_type - 业务类型
   * @param {string} options.source_type - 来源类型
   * @param {string} options.title - 交易标题
   * @param {string} options.description - 交易描述
   * @param {number} options.operator_id - 操作员ID
   * @returns {Object} 交易结果
   */
  static async addPoints (user_id, points, options = {}) {
    if (points <= 0) {
      throw new Error('积分数量必须大于0')
    }

    // 🔥 支持外部传入的事务
    const transaction = options.transaction || null

    // ✅ 幂等性检查（解决问题7）- 如果提供了business_id
    if (options.business_id) {
      const existingTransaction = await PointsTransaction.findOne({
        where: {
          user_id,
          business_type: options.business_type,
          business_id: options.business_id,
          status: 'completed'
        }
      })

      if (existingTransaction) {
        console.log(`⚠️ 幂等性检查: business_id=${options.business_id}已处理，返回原结果`)
        return {
          success: true,
          transaction_id: existingTransaction.transaction_id,
          old_balance: existingTransaction.points_balance_before,
          new_balance: existingTransaction.points_balance_after,
          points_added: points,
          total_earned: existingTransaction.points_balance_after,
          is_duplicate: true // ✅ 标记为重复请求
        }
      }
    }

    const account = await this.getUserPointsAccount(user_id)
    const oldBalance = parseFloat(account.available_points)
    const newBalance = oldBalance + points
    const newTotalEarned = account.total_earned + points

    // 更新积分账户（支持事务）
    await account.update(
      {
        available_points: newBalance,
        total_earned: newTotalEarned,
        last_earn_time: BeijingTimeHelper.createBeijingTime()
      },
      { transaction }
    )

    // 同步更新用户表的history_total_points（支持事务）
    await User.update({ history_total_points: newTotalEarned }, { where: { user_id }, transaction })

    // 创建交易记录（支持事务）
    const pointsTransaction = await PointsTransaction.create(
      {
        user_id,
        account_id: account.account_id,
        transaction_type: 'earn',
        points_amount: points,
        points_balance_before: oldBalance,
        points_balance_after: newBalance,
        business_type: options.business_type || 'manual',
        source_type: options.source_type || 'system',
        business_id: options.business_id || null, // ✅ 保存业务ID
        transaction_title: options.title || '积分获得',
        transaction_description: options.description || '',
        operator_id: options.operator_id || null,
        transaction_time: BeijingTimeHelper.createBeijingTime(),
        status: 'completed'
      },
      { transaction }
    )

    return {
      success: true,
      transaction_id: pointsTransaction.transaction_id,
      old_balance: oldBalance,
      new_balance: newBalance,
      points_added: points,
      total_earned: newTotalEarned,
      is_duplicate: false
    }
  }

  /**
   * 消费积分
   * @param {number} user_id - 用户ID
   * @param {number} points - 积分数量
   * @param {Object} options - 交易选项
   * @param {Object} options.transaction - 外部事务对象（可选）
   * @param {string} options.business_id - 业务唯一ID（强烈建议，用于幂等性控制）
   * @param {string} options.business_type - 业务类型
   * @param {string} options.source_type - 来源类型
   * @param {string} options.title - 交易标题
   * @param {string} options.description - 交易描述
   * @param {number} options.operator_id - 操作员ID
   * @returns {Object} 交易结果
   */
  static async consumePoints (user_id, points, options = {}) {
    if (points <= 0) {
      throw new Error('积分数量必须大于0')
    }

    // 🔥 支持外部传入的事务
    const transaction = options.transaction || null

    // ✅ 幂等性检查（解决问题7）- 如果提供了business_id
    if (options.business_id) {
      const existingTransaction = await PointsTransaction.findOne({
        where: {
          user_id,
          business_type: options.business_type,
          business_id: options.business_id,
          status: 'completed'
        }
      })

      if (existingTransaction) {
        console.log(`⚠️ 幂等性检查: business_id=${options.business_id}已处理，跳过重复消费`)
        return {
          success: true,
          transaction_id: existingTransaction.transaction_id,
          old_balance: existingTransaction.points_balance_before,
          new_balance: existingTransaction.points_balance_after,
          points_consumed: points,
          total_consumed: existingTransaction.points_balance_after,
          is_duplicate: true // ✅ 标记为重复请求
        }
      }
    }

    const account = await this.getUserPointsAccount(user_id)
    const oldBalance = parseFloat(account.available_points)

    if (oldBalance < points) {
      throw new Error('积分余额不足')
    }

    const newBalance = oldBalance - points
    const newTotalConsumed = account.total_consumed + points

    // 更新积分账户（支持事务）
    await account.update(
      {
        available_points: newBalance,
        total_consumed: newTotalConsumed,
        last_consume_time: BeijingTimeHelper.createBeijingTime()
      },
      { transaction }
    )

    // 创建交易记录（支持事务）
    const pointsTransaction = await PointsTransaction.create(
      {
        user_id,
        account_id: account.account_id,
        transaction_type: 'consume',
        points_amount: points,
        points_balance_before: oldBalance,
        points_balance_after: newBalance,
        business_type: options.business_type || 'manual',
        source_type: options.source_type || 'system',
        business_id: options.business_id || null, // ✅ 保存业务ID
        transaction_title: options.title || '积分消费',
        transaction_description: options.description || '',
        operator_id: options.operator_id || null,
        transaction_time: BeijingTimeHelper.createBeijingTime(),
        status: 'completed'
      },
      { transaction }
    )

    return {
      success: true,
      transaction_id: pointsTransaction.transaction_id,
      old_balance: oldBalance,
      new_balance: newBalance,
      points_consumed: points,
      total_consumed: newTotalConsumed,
      is_duplicate: false
    }
  }

  /**
   * 获取积分余额
   * @param {number} user_id - 用户ID
   * @returns {Object} 积分余额信息
   */
  static async getPointsBalance (user_id) {
    const account = await this.getUserPointsAccount(user_id)

    return {
      user_id,
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
   * @param {number} user_id - 用户ID
   * @param {Object} options - 查询选项
   * @returns {Object} 交易历史
   */
  static async getPointsHistory (user_id, options = {}) {
    const {
      page = 1,
      limit = 20,
      transaction_type = null,
      start_date = null,
      end_date = null
    } = options

    const whereClause = { user_id }

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
   * @param {number} user_id - 用户ID
   * @returns {Object} 积分统计信息
   */
  static async getPointsStatistics (user_id) {
    const account = await this.getUserPointsAccount(user_id)

    // 获取最近30天的交易统计
    const thirtyDaysAgo = BeijingTimeHelper.createBeijingTime()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const recentEarned =
      (await PointsTransaction.sum('points_amount', {
        where: {
          user_id,
          transaction_type: 'earn',
          transaction_time: {
            [Sequelize.Op.gte]: thirtyDaysAgo
          }
        }
      })) || 0

    const recentConsumed =
      (await PointsTransaction.sum('points_amount', {
        where: {
          user_id,
          transaction_type: 'consume',
          transaction_time: {
            [Sequelize.Op.gte]: thirtyDaysAgo
          }
        }
      })) || 0

    return {
      current_balance: parseFloat(account.available_points),
      total_earned: parseFloat(account.total_earned),
      total_consumed: parseFloat(account.total_consumed),
      recent_30_days: {
        earned: parseFloat(recentEarned),
        consumed: parseFloat(recentConsumed),
        net_change: parseFloat(recentEarned) - parseFloat(recentConsumed)
      },
      account_age_days: Math.floor(BeijingTimeHelper.timeDiff(account.created_at) / (1000 * 60 * 60 * 24))
    }
  }

  /**
   * 检查用户是否有足够积分
   * @param {number} user_id - 用户ID
   * @param {number} requiredPoints - 需要的积分数量
   * @returns {boolean} 是否有足够积分
   */
  static async hasEnoughPoints (user_id, requiredPoints) {
    const account = await this.getUserPointsAccount(user_id)
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
        const { type, user_id, points, options } = operation

        let result
        if (type === 'add') {
          result = await this.addPoints(user_id, points, { ...options, transaction })
        } else if (type === 'consume') {
          result = await this.consumePoints(user_id, points, { ...options, transaction })
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

  /**
   * 兑换商品 - 新增前端需求功能
   * @param {number} user_id - 用户ID
   * @param {number} productId - 商品ID
   * @param {number} quantity - 兑换数量
   * @returns {Object} 兑换结果
   */
  static async exchangeProduct (user_id, productId, quantity = 1) {
    const { Product, ExchangeRecords } = require('../models') // ✅ UserInventory在审核通过后才需要
    const { sequelize, Sequelize } = require('../models')
    const transaction = await sequelize.transaction()

    try {
      // 1. ✅ 获取商品信息并加悲观锁（解决问题5：防止并发超卖）
      const product = await Product.findByPk(productId, {
        lock: transaction.LOCK.UPDATE, // ✅ 悲观锁：锁定该行直到事务结束
        transaction
      })

      if (!product) {
        throw new Error('商品不存在')
      }

      if (!product.isAvailable()) {
        throw new Error('商品暂不可兑换')
      }

      // 2. 验证库存（在锁内验证）
      if (product.stock < quantity) {
        throw new Error('商品库存不足')
      }

      // 3. 计算所需积分
      const totalPoints = product.exchange_points * quantity

      // 4. 消费积分
      await this.consumePoints(user_id, totalPoints, {
        business_type: 'exchange',
        source_type: 'product_exchange',
        title: `兑换商品：${product.name}`,
        description: `兑换${quantity}个${product.name}`,
        transaction
      })

      // 5. ✅ 原子性减少商品库存（防止并发问题）
      const [affectedRows] = await Product.update(
        {
          stock: sequelize.literal(`stock - ${quantity}`) // ✅ 原子操作：数据库层面计算
        },
        {
          where: {
            product_id: productId,
            stock: { [Sequelize.Op.gte]: quantity } // ✅ 二次验证：确保库存足够
          },
          transaction
        }
      )

      // 6. ✅ 检查更新结果（如果受影响行数为0，说明库存不足或并发冲突）
      if (affectedRows === 0) {
        throw new Error('商品库存不足（并发冲突或库存已售罄）')
      }

      // 7. 生成兑换码
      const exchangeCode = this.generateExchangeCode()

      // 8. 创建兑换记录（✅ 严格人工审核模式：所有兑换都需要审核）
      // exchange_id 现在是INT AUTO_INCREMENT主键，不再手动赋值
      const exchangeRecord = await ExchangeRecords.create(
        {
          user_id,
          product_id: productId,
          product_snapshot: {
            name: product.name,
            description: product.description,
            category: product.category,
            exchange_points: product.exchange_points,
            space: product.space,
            requires_audit: true // ✅ 所有商品都需要审核
          },
          quantity,
          total_points: totalPoints,
          exchange_code: exchangeCode,
          status: 'pending', // 等待审核
          space: product.space,
          delivery_method: product.category === '优惠券' ? 'virtual' : 'physical',
          exchange_time: BeijingTimeHelper.createBeijingTime(),
          // ✅ 审核相关字段：所有兑换都需要人工审核
          requires_audit: true,
          audit_status: 'pending'
        },
        { transaction }
      )

      // 8.1 提交审核（不调用needsAudit，强制审核）
      console.log(`[兑换] 订单${exchangeRecord.exchange_id}已提交审核，等待管理员处理`)
      await transaction.commit()

      // 8.2 发送通知
      try {
        const NotificationService = require('../services/NotificationService')

        // 通知用户：申请已提交
        await NotificationService.notifyExchangePending(user_id, {
          exchange_id: exchangeRecord.exchange_id,
          product_name: product.name,
          quantity,
          total_points: totalPoints
        })

        // 通知管理员：有新订单待审核
        await NotificationService.notifyNewExchangeAudit({
          exchange_id: exchangeRecord.exchange_id,
          user_id,
          product_name: product.name,
          quantity,
          total_points: totalPoints,
          product_category: product.category
        })
      } catch (notifyError) {
        // 通知失败不影响兑换流程
        console.error('[兑换] 发送通知失败:', notifyError.message)
      }

      // 8.3 返回：需要审核，不立即发放库存
      return {
        success: true,
        needs_audit: true, // ✅ 标记需要审核
        exchange_id: exchangeRecord.exchange_id,
        exchange_code: exchangeCode,
        product_name: product.name,
        quantity,
        total_points: totalPoints,
        audit_status: 'pending',
        message: '兑换申请已提交，积分已扣除，请等待管理员审核',
        exchange_time: exchangeRecord.exchange_time
      }
    } catch (error) {
      await transaction.rollback()
      throw new Error(`商品兑换失败: ${error.message}`)
    }
  }

  /**
   * 获取用户兑换记录
   * @param {number} user_id - 用户ID
   * @param {Object} options - 查询选项
   * @returns {Object} 兑换记录列表
   */
  static async getExchangeRecords (user_id, options = {}) {
    const { ExchangeRecords, Product } = require('../models')
    const { page = 1, limit = 20, status = null, space = null } = options

    const whereClause = { user_id }
    if (status) whereClause.status = status
    if (space) whereClause.space = space

    const offset = (page - 1) * limit

    const { count, rows } = await ExchangeRecords.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['product_id', 'name', 'category', 'image']
        }
      ],
      order: [['exchange_time', 'DESC']],
      limit: parseInt(limit),
      offset
    })

    return {
      records: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(count / limit)
      }
    }
  }

  /**
   * 获取用户积分信息（API响应格式）
   * @param {number} user_id - 用户ID
   * @returns {Object} 积分信息
   */
  static async getUserPoints (user_id) {
    const account = await this.getUserPointsAccount(user_id)
    return {
      available_points: parseFloat(account.available_points),
      total_earned: parseFloat(account.total_earned),
      total_consumed: parseFloat(account.total_consumed)
    }
  }

  /**
   * 获取用户积分交易记录
   * @param {number} user_id - 用户ID
   * @param {Object} options - 查询选项
   * @returns {Object} 交易记录列表
   */
  static async getUserTransactions (user_id, options = {}) {
    const { page = 1, limit = 20, type = null } = options
    const offset = (page - 1) * limit

    const whereClause = { user_id }
    if (type) {
      whereClause.transaction_type = type
    }

    const { count, rows } = await PointsTransaction.findAndCountAll({
      where: whereClause,
      order: [['transaction_time', 'DESC']],
      limit: parseInt(limit),
      offset
    })

    return {
      data: rows,
      total: count
    }
  }

  /**
   * 生成兑换码
   * @returns {string} 兑换码
   */
  static generateExchangeCode () {
    const timestamp = BeijingTimeHelper.timestamp().toString(36)
    const random = Math.random().toString(36).substr(2, 8)
    return `EXC${timestamp}${random}`.toUpperCase()
  }

  /**
   * 生成核销码
   * @returns {string} 核销码
   */
  static generateVerificationCode () {
    return Math.random().toString(36).substr(2, 8).toUpperCase()
  }
}

module.exports = PointsService
