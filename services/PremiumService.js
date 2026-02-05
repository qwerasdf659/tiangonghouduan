/**
 * 餐厅积分抽奖系统 V4.0 - 高级空间服务（PremiumService）
 *
 * 业务场景：管理用户高级空间解锁功能，包括积分扣除、状态更新、过期判断等
 *
 * 核心功能：
 * 1. 高级空间解锁（扣除积分 + 更新状态 + 记录交易）
 * 2. 解锁状态查询（判断是否过期、计算剩余时间）
 * 3. 解锁条件验证（历史积分门槛 + 当前余额验证）
 * 4. 管理后台查询（用户高级空间状态列表、统计、即将过期用户） - 原 UserPremiumQueryService
 *
 * 设计原则：
 * - **事务安全保障**：所有写操作支持外部事务传入，确保原子性
 * - **业务规则集中**：解锁条件、费用计算等业务逻辑集中在Service层
 * - **数据一致性**：积分扣除与状态更新在同一事务中完成
 *
 * 事务边界治理（2026-01-05 决策）：
 * - 所有写操作 **强制要求** 外部事务传入（options.transaction）
 * - 未提供事务时直接报错（使用 assertAndGetTransaction）
 * - 服务层禁止自建事务，由入口层统一使用 TransactionManager.execute()
 *
 * 服务合并记录（2026-01-21）：
 * - 合并 UserPremiumQueryService 的所有查询方法到本服务
 * - 原因：减少服务数量，统一高级空间相关操作
 *
 * 创建时间：2025年12月09日
 * 最后更新：2026年01月21日（合并 UserPremiumQueryService）
 */

const { Op, fn, col } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')
const { User, UserPremiumStatus } = require('../models')
// V4.7.0 AssetService 拆分：使用子服务替代原 AssetService（2026-01-31）
const BalanceService = require('./asset/BalanceService')
const logger = require('../utils/logger')
const { assertAndGetTransaction } = require('../utils/transactionHelpers')

/**
 * 业务常量定义
 */
const UNLOCK_COST = 100 // 解锁费用：100积分（固定值）
const HISTORY_POINTS_THRESHOLD = 100000 // 历史累计积分门槛：10万（识别高级用户资格）
const VALIDITY_HOURS = 24 // 有效期：24小时（固定值）

/**
 * 高级空间服务类
 */
class PremiumService {
  /**
   * 解锁高级空间（核心业务方法）
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * @param {number} user_id - 用户ID
   * @param {Object} options - 选项参数
   * @param {Object} options.transaction - 外部事务对象（必填）
   * @returns {Object} 解锁结果
   * @throws {Error} 业务错误（用户不存在、条件不满足、余额不足等）
   */
  static async unlockPremium(user_id, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'PremiumService.unlockPremium')

    /*
     * ========================================
     * 步骤1: 检查当前解锁状态（防止重复解锁）
     * ========================================
     */
    let premiumStatus = await UserPremiumStatus.findOne({
      where: { user_id },
      transaction
    })

    const now = BeijingTimeHelper.createBeijingTime()
    const isFirstUnlock = !premiumStatus

    // 如果已解锁且在有效期内，拒绝重复解锁
    if (premiumStatus && premiumStatus.is_unlocked && premiumStatus.expires_at) {
      const expiresAt = new Date(premiumStatus.expires_at)
      const isValid = expiresAt > now

      if (isValid) {
        const remainingHours = Math.ceil((expiresAt - now) / (1000 * 60 * 60))
        const error = new Error('您的高级空间访问权限仍在有效期内，无需重复解锁')
        error.code = 'ALREADY_UNLOCKED'
        error.statusCode = 409
        error.data = {
          unlocked: true,
          is_valid: true,
          unlock_time: BeijingTimeHelper.formatForAPI(premiumStatus.unlock_time).iso,
          expires_at: BeijingTimeHelper.formatForAPI(premiumStatus.expires_at).iso,
          remaining_hours: remainingHours,
          total_unlock_count: premiumStatus.total_unlock_count || 0
        }
        throw error
      }
    }

    /*
     * ========================================
     * 步骤2: 查询用户信息和积分余额
     * ========================================
     */
    const user = await User.findByPk(user_id, {
      transaction,
      lock: transaction.LOCK.UPDATE
    })

    if (!user) {
      const error = new Error('用户不存在')
      error.code = 'USER_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    // 通过 BalanceService 获取积分余额
    const pointsBalance = await BalanceService.getBalance(
      { user_id, asset_code: 'POINTS' },
      { transaction }
    )

    /*
     * ========================================
     * 步骤3: 验证解锁条件1 - 历史累计积分门槛
     * ========================================
     */
    const historyPoints = user.history_total_points || 0
    const historyPointsSatisfied = historyPoints >= HISTORY_POINTS_THRESHOLD

    if (!historyPointsSatisfied) {
      const error = new Error('历史累计积分不足，无法解锁高级空间（需要10万历史积分门槛）')
      error.code = 'INSUFFICIENT_HISTORY_POINTS'
      error.statusCode = 403
      error.data = {
        unlocked: false,
        condition_1: {
          name: '历史累计积分门槛',
          required: HISTORY_POINTS_THRESHOLD,
          current: historyPoints,
          satisfied: false,
          shortage: HISTORY_POINTS_THRESHOLD - historyPoints
        }
      }
      throw error
    }

    /*
     * ========================================
     * 步骤4: 验证解锁条件2 - 当前积分余额充足
     * ========================================
     */
    const availablePoints = Number(pointsBalance.available_amount) || 0
    const balanceSufficient = availablePoints >= UNLOCK_COST

    if (!balanceSufficient) {
      const error = new Error('当前积分余额不足，无法支付100积分解锁费用')
      error.code = 'INSUFFICIENT_BALANCE'
      error.statusCode = 403
      error.data = {
        unlocked: false,
        condition_2: {
          name: '当前积分余额',
          required: UNLOCK_COST,
          current: availablePoints,
          satisfied: false,
          shortage: UNLOCK_COST - availablePoints
        }
      }
      throw error
    }

    /*
     * ========================================
     * 步骤5: 扣除100积分（通过 BalanceService 统一处理）
     * ========================================
     * ✅ 架构规范：所有积分操作必须通过 BalanceService，不得直接操作账户表
     * - BalanceService.changeBalance()自动处理账户更新、交易记录创建、审计日志
     * - 支持幂等性控制（通过idempotency_key）
     * - 支持事务传递（transaction）
     */
    const unlockTime = BeijingTimeHelper.createBeijingTime()
    const idempotency_key = `premium_unlock_${user_id}_${BeijingTimeHelper.generateIdTimestamp()}`

    // eslint-disable-next-line no-restricted-syntax -- 已传递 transaction
    const consumeResult = await BalanceService.changeBalance(
      {
        user_id,
        asset_code: 'POINTS',
        delta_amount: -UNLOCK_COST,
        business_type: 'premium_unlock',
        idempotency_key,
        meta: {
          source_type: 'user',
          title: '解锁高级空间',
          description: `支付${UNLOCK_COST}积分解锁高级空间功能，有效期${VALIDITY_HOURS}小时`,
          operator_id: user_id
        }
      },
      { transaction }
    )

    const newAvailablePoints = consumeResult.balance_after

    logger.info('高级空间解锁-积分扣除', {
      user_id,
      unlock_cost: UNLOCK_COST,
      remaining_points: newAvailablePoints,
      transaction_id: consumeResult.transaction_id,
      is_duplicate: consumeResult.is_duplicate || false
    })

    /*
     * ========================================
     * 步骤6: 创建/更新解锁记录
     * ========================================
     */
    const expiresAt = new Date(unlockTime)
    expiresAt.setHours(expiresAt.getHours() + VALIDITY_HOURS)

    if (isFirstUnlock) {
      premiumStatus = await UserPremiumStatus.create(
        {
          user_id,
          is_unlocked: true,
          unlock_time: unlockTime,
          unlock_method: 'points',
          total_unlock_count: 1,
          expires_at: expiresAt
        },
        { transaction }
      )
    } else {
      await premiumStatus.update(
        {
          is_unlocked: true,
          unlock_time: unlockTime,
          expires_at: expiresAt,
          total_unlock_count: (premiumStatus.total_unlock_count || 0) + 1
        },
        { transaction }
      )
    }

    logger.info('高级空间解锁成功', {
      user_id,
      is_first_unlock: isFirstUnlock,
      unlock_cost: UNLOCK_COST,
      remaining_points: newAvailablePoints
    })

    // 返回解锁结果
    return {
      unlocked: true,
      is_first_unlock: isFirstUnlock,
      unlock_cost: UNLOCK_COST,
      remaining_points: newAvailablePoints,
      unlock_time: unlockTime,
      expires_at: expiresAt,
      validity_hours: VALIDITY_HOURS,
      total_unlock_count: premiumStatus.total_unlock_count
    }
  }

  /**
   * 查询高级空间状态
   *
   * @param {number} user_id - 用户ID
   * @returns {Object} 状态查询结果
   */
  static async getPremiumStatus(user_id) {
    try {
      // 查询解锁状态
      const premiumStatus = await UserPremiumStatus.findOne({
        where: { user_id }
      })

      const now = BeijingTimeHelper.createBeijingTime()

      // 检查是否已解锁且在有效期内
      const isUnlocked = premiumStatus && premiumStatus.is_unlocked
      const isValid =
        isUnlocked && premiumStatus.expires_at && new Date(premiumStatus.expires_at) > now
      const isExpired = isUnlocked && !isValid

      // 查询用户信息
      const user = await User.findByPk(user_id)

      if (!user) {
        const error = new Error('用户不存在')
        error.code = 'USER_NOT_FOUND'
        error.statusCode = 404
        throw error
      }

      // 通过 BalanceService 获取积分余额
      const pointsBalance = await BalanceService.getBalance({ user_id, asset_code: 'POINTS' })

      const historyPoints = user.history_total_points || 0
      const availablePoints = Number(pointsBalance.available_amount) || 0

      // 如果未解锁或已过期，返回解锁条件进度
      if (!isValid) {
        return {
          unlocked: false,
          is_expired: isExpired,
          last_unlock_time: isUnlocked ? premiumStatus.unlock_time : null,
          conditions: {
            condition_1: {
              name: '历史累计积分',
              required: HISTORY_POINTS_THRESHOLD,
              current: historyPoints,
              satisfied: historyPoints >= HISTORY_POINTS_THRESHOLD
            },
            condition_2: {
              name: '当前积分余额',
              required: UNLOCK_COST,
              current: availablePoints,
              satisfied: availablePoints >= UNLOCK_COST
            }
          },
          can_unlock: historyPoints >= HISTORY_POINTS_THRESHOLD && availablePoints >= UNLOCK_COST
        }
      }

      // 已解锁且在有效期内
      const expiresAt = new Date(premiumStatus.expires_at)
      const remainingMs = expiresAt - now
      const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60))

      return {
        unlocked: true,
        is_valid: true,
        unlock_time: premiumStatus.unlock_time,
        unlock_method: premiumStatus.unlock_method,
        expires_at: premiumStatus.expires_at,
        remaining_hours: remainingHours,
        total_unlock_count: premiumStatus.total_unlock_count || 1
      }
    } catch (error) {
      logger.error('查询高级空间状态失败', {
        user_id,
        error: error.message
      })

      if (error.code) {
        throw error
      }

      const wrappedError = new Error('查询失败')
      wrappedError.code = 'QUERY_FAILED'
      wrappedError.statusCode = 500
      throw wrappedError
    }
  }

  /*
   * ==========================================
   * 以下方法合并自 UserPremiumQueryService（2026-01-21）
   * 管理后台专用的只读查询方法
   * ==========================================
   */

  /**
   * 查询用户高级空间状态列表（管理后台用）
   *
   * @param {Object} options - 查询参数
   * @param {number} [options.user_id] - 用户ID
   * @param {boolean} [options.is_unlocked] - 是否已解锁
   * @param {string} [options.unlock_method] - 解锁方式（points/exchange/vip/manual）
   * @param {boolean} [options.is_valid] - 是否在有效期内
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 用户高级空间状态列表和分页信息
   */
  static async getPremiumStatuses(options = {}) {
    const { user_id, is_unlocked, unlock_method, is_valid, page = 1, page_size = 20 } = options

    const where = {}
    if (user_id) where.user_id = user_id
    if (is_unlocked !== undefined) where.is_unlocked = is_unlocked
    if (unlock_method) where.unlock_method = unlock_method

    // 有效期过滤
    if (is_valid !== undefined) {
      const now = new Date()
      if (is_valid) {
        where.is_unlocked = true
        where.expires_at = { [Op.gt]: now }
      } else {
        where[Op.or] = [{ is_unlocked: false }, { expires_at: { [Op.lte]: now } }]
      }
    }

    const offset = (page - 1) * page_size

    const { count, rows } = await UserPremiumStatus.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile', 'history_total_points']
        }
      ],
      order: [['updated_at', 'DESC']],
      limit: page_size,
      offset
    })

    // 添加计算字段
    const statuses = rows.map(row => {
      const plain = row.get({ plain: true })
      const now = new Date()
      return {
        ...plain,
        is_valid: plain.is_unlocked && plain.expires_at && new Date(plain.expires_at) > now,
        remaining_hours: row.getRemainingHours ? row.getRemainingHours() : 0
      }
    })

    return {
      statuses,
      pagination: {
        total_count: count,
        page,
        page_size,
        total_pages: Math.ceil(count / page_size)
      }
    }
  }

  /**
   * 获取单个用户的高级空间状态（管理后台用，返回详细信息）
   *
   * @param {number} user_id - 用户ID
   * @returns {Promise<Object|null>} 用户高级空间状态或null
   */
  static async getUserPremiumStatusDetail(user_id) {
    const status = await UserPremiumStatus.findOne({
      where: { user_id },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile', 'history_total_points']
        }
      ]
    })

    if (!status) return null

    const plain = status.get({ plain: true })
    const now = new Date()

    return {
      ...plain,
      is_valid: plain.is_unlocked && plain.expires_at && new Date(plain.expires_at) > now,
      remaining_hours: status.getRemainingHours ? status.getRemainingHours() : 0,
      remaining_minutes: status.getRemainingMinutes ? status.getRemainingMinutes() : 0
    }
  }

  /**
   * 获取高级空间状态统计汇总（管理后台用）
   *
   * @returns {Promise<Object>} 统计汇总数据
   */
  static async getPremiumStats() {
    const now = new Date()

    // 总体统计
    const totalStats = await UserPremiumStatus.findOne({
      attributes: [
        [fn('COUNT', col('user_premium_status_id')), 'total_records'],
        [fn('SUM', col('total_unlock_count')), 'total_unlock_count']
      ],
      raw: true
    })

    // 当前已解锁用户数
    const activeCount = await UserPremiumStatus.count({
      where: {
        is_unlocked: true,
        expires_at: { [Op.gt]: now }
      }
    })

    // 已过期用户数
    const expiredCount = await UserPremiumStatus.count({
      where: {
        is_unlocked: true,
        expires_at: { [Op.lte]: now }
      }
    })

    // 按解锁方式统计
    const methodStats = await UserPremiumStatus.findAll({
      attributes: ['unlock_method', [fn('COUNT', col('user_premium_status_id')), 'count']],
      where: {
        is_unlocked: true,
        expires_at: { [Op.gt]: now }
      },
      group: ['unlock_method'],
      raw: true
    })

    return {
      summary: {
        total_records: parseInt(totalStats?.total_records) || 0,
        total_unlock_count: parseInt(totalStats?.total_unlock_count) || 0,
        active_users: activeCount,
        expired_users: expiredCount
      },
      by_unlock_method: methodStats.reduce((acc, item) => {
        acc[item.unlock_method] = parseInt(item.count) || 0
        return acc
      }, {})
    }
  }

  /**
   * 获取即将过期的用户列表（管理后台用）
   *
   * @param {number} hours - 在多少小时内即将过期（默认24小时）
   * @param {number} [page=1] - 页码
   * @param {number} [page_size=20] - 每页数量
   * @returns {Promise<Object>} 即将过期用户列表和分页信息
   */
  static async getExpiringUsers(hours = 24, page = 1, page_size = 20) {
    const now = new Date()
    const expiryThreshold = new Date(now.getTime() + hours * 60 * 60 * 1000)

    const offset = (page - 1) * page_size

    const { count, rows } = await UserPremiumStatus.findAndCountAll({
      where: {
        is_unlocked: true,
        expires_at: {
          [Op.gt]: now,
          [Op.lte]: expiryThreshold
        }
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile']
        }
      ],
      order: [['expires_at', 'ASC']],
      limit: page_size,
      offset
    })

    const statuses = rows.map(row => {
      const plain = row.get({ plain: true })
      return {
        ...plain,
        remaining_hours: row.getRemainingHours ? row.getRemainingHours() : 0,
        remaining_minutes: row.getRemainingMinutes ? row.getRemainingMinutes() : 0
      }
    })

    return {
      statuses,
      pagination: {
        total_count: count,
        page,
        page_size,
        total_pages: Math.ceil(count / page_size)
      }
    }
  }
}

module.exports = PremiumService
