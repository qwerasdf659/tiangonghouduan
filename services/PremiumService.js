/**
 * 餐厅积分抽奖系统 V4.0 - 高级空间服务（PremiumService）
 *
 * 业务场景：管理用户高级空间解锁功能，包括积分扣除、状态更新、过期判断等
 *
 * 核心功能：
 * 1. 高级空间解锁（扣除积分 + 更新状态 + 记录交易）
 * 2. 解锁状态查询（判断是否过期、计算剩余时间）
 * 3. 解锁条件验证（历史积分门槛 + 当前余额验证）
 *
 * 设计原则：
 * - **事务安全保障**：所有写操作支持外部事务传入，确保原子性
 * - **业务规则集中**：解锁条件、费用计算等业务逻辑集中在Service层
 * - **数据一致性**：积分扣除与状态更新在同一事务中完成
 *
 * 创建时间：2025年12月09日
 * 使用模型：Claude Sonnet 4.5
 */

const BeijingTimeHelper = require('../utils/timeHelper')
const { User, UserPremiumStatus } = require('../models')
const AssetService = require('./AssetService')
const logger = require('../utils/logger')

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
   * @param {number} user_id - 用户ID
   * @param {Object} options - 选项参数
   * @param {Object} options.transaction - 外部事务对象（可选）
   * @returns {Object} 解锁结果
   * @throws {Error} 业务错误（用户不存在、条件不满足、余额不足等）
   */
  static async unlockPremium(user_id, options = {}) {
    const { transaction: externalTransaction } = options

    // 如果没有外部事务，创建内部事务
    const sequelize = require('../config/database')
    const transaction = externalTransaction || (await sequelize.transaction())
    const isInternalTransaction = !externalTransaction

    try {
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

      // 通过 AssetService 获取积分余额
      const pointsBalance = await AssetService.getBalance(
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
       * 步骤5: 扣除100积分（通过AssetService统一处理）
       * ========================================
       * ✅ 架构规范：所有积分操作必须通过AssetService，不得直接操作账户表
       * - AssetService.changeBalance()自动处理账户更新、交易记录创建、审计日志
       * - 支持幂等性控制（通过idempotency_key）
       * - 支持事务传递（transaction）
       */
      const unlockTime = BeijingTimeHelper.createBeijingTime()
      const idempotency_key = `premium_unlock_${user_id}_${BeijingTimeHelper.generateIdTimestamp()}`

      const consumeResult = await AssetService.changeBalance(
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

      // 提交内部事务
      if (isInternalTransaction) {
        await transaction.commit()
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
    } catch (error) {
      // 回滚内部事务
      if (isInternalTransaction && transaction) {
        await transaction.rollback()
      }

      // 如果是业务错误，直接抛出
      if (error.code) {
        throw error
      }

      // 其他错误包装后抛出
      logger.error('高级空间解锁失败', {
        user_id,
        error: error.message,
        stack: error.stack
      })

      const wrappedError = new Error('解锁失败，请稍后重试')
      wrappedError.code = 'UNLOCK_FAILED'
      wrappedError.statusCode = 500
      wrappedError.originalError = error
      throw wrappedError
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

      // 通过 AssetService 获取积分余额
      const pointsBalance = await AssetService.getBalance({ user_id, asset_code: 'POINTS' })

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
}

module.exports = PremiumService
