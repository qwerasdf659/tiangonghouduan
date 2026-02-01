/**
 * V4.7.0 管理后台抽奖干预核心服务（CoreService）
 *
 * 业务场景：管理员对用户抽奖的核心干预操作
 *
 * 核心功能：
 * 1. forceWinForUser - 强制用户中奖
 * 2. forceLoseForUser - 强制用户不中奖
 * 3. adjustUserProbability - 调整用户中奖概率
 * 4. setUserQueue - 设置用户专属抽奖队列
 * 5. clearUserSettings - 清除用户所有管理设置
 * 6. getUserManagementStatus - 获取用户管理状态
 * 7. cancelIntervention - 取消干预规则
 *
 * 设计原则：
 * - **编排层职责**：本服务负责用户/奖品验证、审计日志记录
 * - **委托给策略**：具体的管理逻辑委托给ManagementStrategy处理
 * - **审计日志**：所有管理操作都记录到AdminOperationLog
 *
 * 事务边界治理（2026-01-05 决策）：
 * - 所有写操作 **强制要求** 外部事务传入（options.transaction）
 * - 未提供事务时直接报错（使用 assertAndGetTransaction）
 *
 * 拆分日期：2026-01-31
 * 原文件：services/AdminLotteryService.js (1781行)
 */

const BeijingTimeHelper = require('../../utils/timeHelper')
const models = require('../../models')
const AuditLogService = require('../AuditLogService')
const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const logger = require('../../utils/logger').logger

/**
 * 管理后台抽奖干预核心服务类
 *
 * @class AdminLotteryCoreService
 */
class AdminLotteryCoreService {
  /**
   * 静态依赖属性（通过initialize方法注入）
   * @private
   * @static
   */
  static _dependencies = {
    user: null,
    prizePool: null
  }

  /**
   * 初始化Service依赖（在ServiceManager初始化时调用）
   *
   * @param {Object} serviceManager - ServiceManager实例
   * @returns {void}
   */
  static initialize(serviceManager) {
    this._dependencies.user = serviceManager._services.get('user')
    this._dependencies.prizePool = serviceManager._services.get('prize_pool')
    logger.info('AdminLotteryCoreService依赖注入完成')
  }

  /**
   * 强制用户中奖
   *
   * @param {number} adminId - 管理员ID
   * @param {number} userId - 目标用户ID
   * @param {number} prizeId - 奖品ID
   * @param {string} [reason='管理员强制中奖'] - 操作原因
   * @param {Date|null} [expiresAt=null] - 过期时间
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<Object>} 操作结果
   */
  static async forceWinForUser(
    adminId,
    userId,
    prizeId,
    reason = '管理员强制中奖',
    expiresAt = null,
    options = {}
  ) {
    const transaction = assertAndGetTransaction(options, 'AdminLotteryCoreService.forceWinForUser')

    logger.info('管理员强制中奖操作开始', {
      admin_id: adminId,
      user_id: userId,
      lottery_prize_id: prizeId,
      reason
    })

    const UserService = this._dependencies.user
    const PrizePoolService = this._dependencies.prizePool

    // 验证用户存在
    const user = await UserService.getUserById(userId)
    if (!user) {
      throw new Error('用户不存在')
    }

    // 验证奖品存在
    const prize = await PrizePoolService.getPrizeById(prizeId)
    if (!prize) {
      throw new Error('奖品不存在')
    }

    // 获取ManagementStrategy
    const { sharedComponents } = require('../../routes/v4/console/shared/middleware')
    const managementStrategy = sharedComponents.managementStrategy

    // 调用管理策略设置强制中奖
    const result = await managementStrategy.forceWin(adminId, userId, prizeId, reason, expiresAt)

    if (!result.success) {
      throw new Error(result.error || '强制中奖设置失败')
    }

    // 记录审计日志
    await AuditLogService.logAdminOperation(
      {
        admin_id: adminId,
        operation_type: 'lottery_force_win',
        operation_target: 'lottery_management_setting',
        target_id: result.setting_id,
        operation_details: {
          user_id: userId,
          user_mobile: user.mobile,
          lottery_prize_id: prizeId,
          prize_name: prize.prize_name,
          reason,
          expires_at: expiresAt
        },
        idempotency_key: `lottery_force_win_${result.setting_id}`,
        ip_address: null,
        user_agent: null,
        is_critical_operation: true
      },
      { transaction }
    )

    logger.info('管理员强制中奖操作成功', {
      setting_id: result.setting_id,
      admin_id: adminId,
      user_id: userId,
      lottery_prize_id: prizeId
    })

    return {
      success: true,
      setting_id: result.setting_id,
      user_id: userId,
      lottery_prize_id: prizeId,
      user_mobile: user.mobile,
      prize_name: prize.prize_name,
      status: 'force_win_set',
      reason,
      expires_at: expiresAt,
      admin_id: adminId,
      timestamp: result.timestamp
    }
  }

  /**
   * 强制用户不中奖
   *
   * @param {number} adminId - 管理员ID
   * @param {number} userId - 目标用户ID
   * @param {number} [count=1] - 不中奖次数（1-100）
   * @param {string} [reason='管理员强制不中奖'] - 操作原因
   * @param {Date|null} [expiresAt=null] - 过期时间
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<Object>} 操作结果
   */
  static async forceLoseForUser(
    adminId,
    userId,
    count = 1,
    reason = '管理员强制不中奖',
    expiresAt = null,
    options = {}
  ) {
    const transaction = assertAndGetTransaction(options, 'AdminLotteryCoreService.forceLoseForUser')

    logger.info('管理员强制不中奖操作开始', {
      admin_id: adminId,
      user_id: userId,
      count,
      reason
    })

    const UserService = this._dependencies.user

    // 验证用户存在
    const user = await UserService.getUserById(userId)
    if (!user) {
      throw new Error('用户不存在')
    }

    // 获取ManagementStrategy
    const { sharedComponents } = require('../../routes/v4/console/shared/middleware')
    const managementStrategy = sharedComponents.managementStrategy

    // 调用管理策略设置强制不中奖
    const result = await managementStrategy.forceLose(adminId, userId, count, reason, expiresAt)

    if (!result.success) {
      throw new Error(result.error || '强制不中奖设置失败')
    }

    // 记录审计日志
    await AuditLogService.logAdminOperation(
      {
        admin_id: adminId,
        operation_type: 'lottery_force_lose',
        operation_target: 'lottery_management_setting',
        target_id: result.setting_id,
        operation_details: {
          user_id: userId,
          user_mobile: user.mobile,
          count,
          remaining: result.remaining,
          reason,
          expires_at: expiresAt
        },
        idempotency_key: `lottery_force_lose_${result.setting_id}`,
        ip_address: null,
        user_agent: null,
        is_critical_operation: true
      },
      { transaction }
    )

    logger.info('管理员强制不中奖操作成功', {
      setting_id: result.setting_id,
      admin_id: adminId,
      user_id: userId,
      count
    })

    return {
      success: true,
      setting_id: result.setting_id,
      user_id: userId,
      user_mobile: user.mobile,
      status: 'force_lose_set',
      count,
      remaining: result.remaining,
      reason,
      expires_at: expiresAt,
      admin_id: adminId,
      timestamp: result.timestamp
    }
  }

  /**
   * 调整用户中奖概率
   *
   * @param {number} adminId - 管理员ID
   * @param {number} userId - 目标用户ID
   * @param {Object} adjustmentData - 概率调整数据
   * @param {Date|null} expiresAt - 过期时间
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<Object>} 操作结果
   */
  static async adjustUserProbability(
    adminId,
    userId,
    adjustmentData,
    expiresAt = null,
    options = {}
  ) {
    const transaction = assertAndGetTransaction(
      options,
      'AdminLotteryCoreService.adjustUserProbability'
    )

    logger.info('管理员调整用户概率操作开始', {
      admin_id: adminId,
      user_id: userId,
      adjustment_type: adjustmentData.adjustment_type
    })

    const UserService = this._dependencies.user

    // 验证用户存在
    const user = await UserService.getUserById(userId)
    if (!user) {
      throw new Error('用户不存在')
    }

    // 如果是特定奖品调整，验证奖品存在
    let prize = null
    if (adjustmentData.adjustment_type === 'specific_prize' && adjustmentData.lottery_prize_id) {
      const PrizePoolService = this._dependencies.prizePool
      prize = await PrizePoolService.getPrizeById(adjustmentData.lottery_prize_id)
      if (!prize) {
        throw new Error('奖品不存在')
      }
    }

    // 准备设置数据
    const settingData = {
      adjustment_type: adjustmentData.adjustment_type,
      reason: adjustmentData.reason || '管理员概率调整'
    }

    if (adjustmentData.adjustment_type === 'specific_prize') {
      settingData.lottery_prize_id = adjustmentData.lottery_prize_id
      settingData.prize_name = prize.prize_name
      settingData.custom_probability = adjustmentData.custom_probability
      settingData.auto_adjust_others = true
    } else {
      settingData.multiplier = adjustmentData.multiplier
    }

    // 创建数据库记录
    const setting = await models.LotteryManagementSetting.create(
      {
        user_id: userId,
        setting_type: 'probability_adjust',
        setting_data: settingData,
        expires_at: expiresAt,
        status: 'active',
        created_by: adminId
      },
      { transaction }
    )

    // 记录审计日志
    await AuditLogService.logAdminOperation(
      {
        admin_id: adminId,
        operation_type: 'lottery_probability_adjust',
        operation_target: 'lottery_management_setting',
        target_id: setting.setting_id,
        operation_details: {
          user_id: userId,
          user_mobile: user.mobile,
          adjustment_type: adjustmentData.adjustment_type,
          setting_data: settingData,
          expires_at: expiresAt
        },
        idempotency_key: `lottery_probability_adjust_${setting.setting_id}`,
        ip_address: null,
        user_agent: null,
        is_critical_operation: true
      },
      { transaction }
    )

    logger.info('管理员调整用户概率操作成功', {
      setting_id: setting.setting_id,
      admin_id: adminId,
      user_id: userId,
      adjustment_type: adjustmentData.adjustment_type
    })

    const result = {
      success: true,
      setting_id: setting.setting_id,
      user_id: userId,
      user_mobile: user.mobile,
      status: 'probability_adjusted',
      adjustment_type: adjustmentData.adjustment_type,
      reason: settingData.reason,
      expires_at: expiresAt,
      admin_id: adminId,
      timestamp: BeijingTimeHelper.now()
    }

    if (adjustmentData.adjustment_type === 'specific_prize') {
      result.lottery_prize_id = settingData.lottery_prize_id
      result.prize_name = settingData.prize_name
      result.custom_probability = settingData.custom_probability
    } else {
      result.multiplier = settingData.multiplier
    }

    return result
  }

  /**
   * 设置用户专属抽奖队列
   *
   * @param {number} adminId - 管理员ID
   * @param {number} userId - 目标用户ID
   * @param {Object} queueConfig - 队列配置
   * @param {string} [reason='管理员设置特定队列'] - 操作原因
   * @param {Date|null} expiresAt - 过期时间
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<Object>} 操作结果
   */
  static async setUserQueue(
    adminId,
    userId,
    queueConfig,
    reason = '管理员设置特定队列',
    expiresAt = null,
    options = {}
  ) {
    const transaction = assertAndGetTransaction(options, 'AdminLotteryCoreService.setUserQueue')

    logger.info('管理员设置用户队列操作开始', {
      admin_id: adminId,
      user_id: userId,
      queue_type: queueConfig.queue_type
    })

    const UserService = this._dependencies.user

    // 验证用户存在
    const user = await UserService.getUserById(userId)
    if (!user) {
      throw new Error('用户不存在')
    }

    // 获取ManagementStrategy
    const { sharedComponents } = require('../../routes/v4/console/shared/middleware')
    const managementStrategy = sharedComponents.managementStrategy

    // 调用管理策略设置用户队列
    const result = await managementStrategy.setUserQueue(
      adminId,
      userId,
      queueConfig,
      reason,
      expiresAt
    )

    if (!result.success) {
      throw new Error(result.error || '用户队列设置失败')
    }

    // 记录审计日志
    await AuditLogService.logAdminOperation(
      {
        admin_id: adminId,
        operation_type: 'lottery_user_queue',
        operation_target: 'lottery_management_setting',
        target_id: result.setting_id,
        operation_details: {
          user_id: userId,
          user_mobile: user.mobile,
          queue_config: result.queue_config,
          reason,
          expires_at: expiresAt
        },
        idempotency_key: `lottery_user_queue_${result.setting_id}`,
        ip_address: null,
        user_agent: null,
        is_critical_operation: true
      },
      { transaction }
    )

    logger.info('管理员设置用户队列操作成功', {
      setting_id: result.setting_id,
      admin_id: adminId,
      user_id: userId,
      queue_type: queueConfig.queue_type
    })

    return {
      success: true,
      setting_id: result.setting_id,
      user_id: userId,
      user_mobile: user.mobile,
      status: 'user_queue_set',
      queue_type: result.queue_config.queue_type,
      priority_level: result.queue_config.priority_level,
      reason,
      expires_at: expiresAt,
      admin_id: adminId,
      timestamp: result.timestamp
    }
  }

  /**
   * 获取用户抽奖管理状态
   *
   * @param {number} userId - 目标用户ID
   * @returns {Promise<Object>} 用户管理状态
   */
  static async getUserManagementStatus(userId) {
    try {
      logger.info('查询用户管理状态', { user_id: userId })

      const UserService = this._dependencies.user

      // 验证用户存在
      const user = await UserService.getUserById(userId)
      if (!user) {
        throw new Error('用户不存在')
      }

      // 获取ManagementStrategy
      const { sharedComponents } = require('../../routes/v4/console/shared/middleware')
      const managementStrategy = sharedComponents.managementStrategy

      // 获取用户管理状态
      const managementStatus = await managementStrategy.getUserManagementStatus(userId)

      logger.info('查询用户管理状态成功', {
        user_id: userId,
        has_force_win: !!managementStatus.force_win,
        has_force_lose: !!managementStatus.force_lose,
        has_probability_adjust: !!managementStatus.probability_adjust,
        has_user_queue: !!managementStatus.user_queue
      })

      return {
        user_id: userId,
        user_mobile: user.mobile,
        user_nickname: user.nickname,
        management_status: managementStatus,
        timestamp: BeijingTimeHelper.apiTimestamp()
      }
    } catch (error) {
      logger.error('查询用户管理状态失败', {
        user_id: userId,
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 清除用户的所有管理设置
   *
   * @param {number} adminId - 管理员ID
   * @param {number} userId - 目标用户ID
   * @param {string|null} [settingType=null] - 设置类型
   * @param {string} [reason='管理员清除设置'] - 操作原因
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<Object>} 操作结果
   */
  static async clearUserSettings(
    adminId,
    userId,
    settingType = null,
    reason = '管理员清除设置',
    options = {}
  ) {
    const transaction = assertAndGetTransaction(
      options,
      'AdminLotteryCoreService.clearUserSettings'
    )

    logger.info('管理员清除用户设置操作开始', {
      admin_id: adminId,
      user_id: userId,
      setting_type: settingType
    })

    const UserService = this._dependencies.user

    // 验证用户存在
    const user = await UserService.getUserById(userId)
    if (!user) {
      throw new Error('用户不存在')
    }

    // 获取ManagementStrategy
    const { sharedComponents } = require('../../routes/v4/console/shared/middleware')
    const managementStrategy = sharedComponents.managementStrategy

    // 调用管理策略清除用户设置
    const result = await managementStrategy.clearUserSettings(adminId, userId, settingType)

    if (!result.success) {
      throw new Error(result.error || '清除用户设置失败')
    }

    // 创建清除设置记录
    const { LotteryClearSettingRecord } = models
    const idempotencyKey = LotteryClearSettingRecord.generateIdempotencyKey(
      userId,
      settingType || 'all',
      adminId
    )

    const clearRecord = await LotteryClearSettingRecord.create(
      {
        user_id: userId,
        admin_id: adminId,
        setting_type: settingType || 'all',
        cleared_count: result.cleared_count,
        reason,
        idempotency_key: idempotencyKey,
        metadata: {
          user_mobile: user.mobile,
          cleared_at: BeijingTimeHelper.now()
        }
      },
      { transaction }
    )

    // 记录审计日志
    await AuditLogService.logAdminOperation(
      {
        admin_id: adminId,
        operation_type: 'lottery_clear_settings',
        operation_target: 'lottery_clear_setting_record',
        target_id: clearRecord.lottery_clear_setting_record_id,
        operation_details: {
          user_id: userId,
          user_mobile: user.mobile,
          setting_type: settingType || 'all',
          cleared_count: result.cleared_count,
          reason
        },
        idempotency_key: `audit_${idempotencyKey}`,
        ip_address: null,
        user_agent: null,
        is_critical_operation: true
      },
      { transaction }
    )

    logger.info('管理员清除用户设置操作成功', {
      admin_id: adminId,
      user_id: userId,
      cleared_count: result.cleared_count
    })

    return {
      success: true,
      user_id: userId,
      user_mobile: user.mobile,
      status: 'settings_cleared',
      cleared_count: result.cleared_count,
      reason,
      admin_id: adminId,
      timestamp: result.timestamp
    }
  }

  /**
   * 取消干预规则
   *
   * @param {string} settingId - 设置ID
   * @param {Object} options - 选项
   * @param {string} options.reason - 取消原因
   * @param {number} options.operated_by - 操作者ID
   * @param {Object} options.transaction - Sequelize事务对象
   * @returns {Promise<Object>} 更新后的干预规则
   */
  static async cancelIntervention(settingId, options = {}) {
    const { reason = '管理员手动取消', operated_by } = options
    const transaction = assertAndGetTransaction(
      options,
      'AdminLotteryCoreService.cancelIntervention'
    )

    const setting = await models.LotteryManagementSetting.findByPk(settingId, { transaction })

    if (!setting) {
      const error = new Error('干预规则不存在')
      error.code = 'INTERVENTION_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    if (setting.status === 'cancelled') {
      const error = new Error('该干预规则已被取消')
      error.code = 'ALREADY_CANCELLED'
      error.statusCode = 400
      throw error
    }

    if (setting.status === 'used') {
      const error = new Error('该干预规则已被使用，无法取消')
      error.code = 'ALREADY_USED'
      error.statusCode = 400
      throw error
    }

    // 更新状态为 cancelled
    await setting.update({ status: 'cancelled' }, { transaction })

    // 记录审计日志
    await AuditLogService.log(
      {
        business_type: 'lottery_management',
        action_type: 'cancel_intervention',
        target_id: settingId,
        target_type: 'lottery_management_setting',
        operator_id: operated_by,
        after_data: {
          setting_id: settingId,
          setting_type: setting.setting_type,
          reason
        }
      },
      { transaction }
    )

    logger.info('干预规则取消成功', {
      setting_id: settingId,
      setting_type: setting.setting_type,
      reason,
      operated_by
    })

    return {
      setting_id: settingId,
      status: 'cancelled',
      cancel_reason: reason
    }
  }
}

module.exports = AdminLotteryCoreService
