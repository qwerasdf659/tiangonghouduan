/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 管理后台抽奖管理服务（AdminLotteryService）
 *
 * 业务场景：管理员对抽奖系统的管理操作，包括强制中奖、强制不中奖、概率调整、用户队列设置等
 *
 * 核心功能：
 * 1. 强制中奖管理（验证用户和奖品，调用ManagementStrategy.forceWin）
 * 2. 强制不中奖管理（验证用户，调用ManagementStrategy.forceLose）
 * 3. 概率调整管理（支持全局倍数调整和特定奖品概率调整）
 * 4. 用户队列管理（设置用户专属抽奖队列）
 * 5. 管理状态查询（获取用户当前所有管理设置）
 * 6. 设置清除管理（清除用户的所有或特定类型设置）
 *
 * 设计原则：
 * - **编排层职责**：本服务负责用户/奖品验证、审计日志记录
 * - **委托给策略**：具体的管理逻辑委托给ManagementStrategy处理
 * - **审计日志**：所有管理操作都记录到AdminOperationLog
 *
 * 事务边界治理（2026-01-05 决策）：
 * - 所有写操作 **强制要求** 外部事务传入（options.transaction）
 * - 未提供事务时直接报错（使用 assertAndGetTransaction）
 * - 服务层禁止自建事务，由入口层统一使用 TransactionManager.execute()
 *
 * 审计整合方案（2026-01-08）：
 * - 决策5：抽奖管理是关键操作，审计失败阻断业务
 * - 决策6：幂等键由业务主键派生（setting_id），禁止自动生成
 * - 决策7：审计日志在同一事务内
 * - 决策10：target_id 指向 LotteryManagementSetting.setting_id
 *
 * 依赖服务：
 * - UserService：用户验证
 * - PrizePoolService：奖品验证
 * - ManagementStrategy：抽奖管理策略（通过sharedComponents获取）
 * - AuditLogService：审计日志记录
 *
 * 创建时间：2025年12月09日
 * 最后更新：2026年01月08日（审计整合决策5/6/7/10实现）
 */

const BeijingTimeHelper = require('../utils/timeHelper')
const models = require('../models')
const AuditLogService = require('./AuditLogService')
const { assertAndGetTransaction } = require('../utils/transactionHelpers')
const { BusinessCacheHelper } = require('../utils/BusinessCacheHelper')

const logger = require('../utils/logger').logger

/**
 * 管理后台抽奖管理服务类
 *
 * @class AdminLotteryService
 */
class AdminLotteryService {
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
   * @description
   * 在ServiceManager初始化阶段显式注入依赖的Service引用，
   * 避免在每个方法内部重复调用require和getService。
   *
   * @param {Object} serviceManager - ServiceManager实例
   * @returns {void}
   *
   * @example
   * // 在ServiceManager.initialize()中调用
   * AdminLotteryService.initialize(serviceManager)
   */
  static initialize(serviceManager) {
    /*
     * 🎯 直接从_services Map获取，避免触发初始化检查
     * P1-9：使用 snake_case 服务键
     */
    this._dependencies.user = serviceManager._services.get('user')
    this._dependencies.prizePool = serviceManager._services.get('prize_pool')
    logger.info('AdminLotteryService依赖注入完成（P1-9 snake_case key）')
  }

  /**
   * 强制用户中奖
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * @param {number} adminId - 管理员ID
   * @param {number} userId - 目标用户ID
   * @param {number} prizeId - 奖品ID
   * @param {string} [reason='管理员强制中奖'] - 操作原因
   * @param {Date|null} [expiresAt=null] - 过期时间（null表示永不过期）
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
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'AdminLotteryService.forceWinForUser')

    logger.info('管理员强制中奖操作开始', {
      admin_id: adminId,
      user_id: userId,
      prize_id: prizeId,
      reason
    })

    // 🎯 使用初始化时注入的依赖
    const UserService = this._dependencies.user
    const PrizePoolService = this._dependencies.prizePool

    // 🔍 验证用户存在
    const user = await UserService.getUserById(userId)
    if (!user) {
      throw new Error('用户不存在')
    }

    // 🔍 验证奖品存在
    const prize = await PrizePoolService.getPrizeById(prizeId)
    if (!prize) {
      throw new Error('奖品不存在')
    }

    // 🎯 获取ManagementStrategy（通过sharedComponents）
    const { sharedComponents } = require('../routes/v4/console/shared/middleware')
    const managementStrategy = sharedComponents.managementStrategy

    // 🎯 调用管理策略设置强制中奖
    const result = await managementStrategy.forceWin(adminId, userId, prizeId, reason, expiresAt)

    if (!result.success) {
      throw new Error(result.error || '强制中奖设置失败')
    }

    /*
     * 【决策5/6/7/10】记录审计日志
     * - 决策5：关键操作，失败阻断业务
     * - 决策6：幂等键由 setting_id 派生（格式：lottery_force_win_{setting_id}）
     * - 决策7：同一事务内
     * - 决策10：target_id 指向 LotteryManagementSetting.setting_id
     */
    await AuditLogService.logAdminOperation(
      {
        admin_id: adminId,
        operation_type: 'lottery_force_win',
        operation_target: 'lottery_management_setting',
        target_id: result.setting_id,
        operation_details: {
          user_id: userId,
          user_mobile: user.mobile,
          prize_id: prizeId,
          prize_name: prize.prize_name,
          reason,
          expires_at: expiresAt
        },
        idempotency_key: `lottery_force_win_${result.setting_id}`, // 决策6：业务主键派生
        ip_address: null, // 路由层会填充
        user_agent: null, // 路由层会填充
        is_critical_operation: true // 决策5：关键操作
      },
      { transaction }
    )

    logger.info('管理员强制中奖操作成功', {
      setting_id: result.setting_id,
      admin_id: adminId,
      user_id: userId,
      prize_id: prizeId
    })

    return {
      success: true,
      setting_id: result.setting_id,
      user_id: userId,
      prize_id: prizeId,
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
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * @param {number} adminId - 管理员ID
   * @param {number} userId - 目标用户ID
   * @param {number} [count=1] - 不中奖次数（1-100）
   * @param {string} [reason='管理员强制不中奖'] - 操作原因
   * @param {Date|null} [expiresAt=null] - 过期时间（null表示永不过期）
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
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'AdminLotteryService.forceLoseForUser')

    logger.info('管理员强制不中奖操作开始', {
      admin_id: adminId,
      user_id: userId,
      count,
      reason
    })

    // 🎯 使用初始化时注入的依赖
    const UserService = this._dependencies.user

    // 🔍 验证用户存在
    const user = await UserService.getUserById(userId)
    if (!user) {
      throw new Error('用户不存在')
    }

    // 🎯 获取ManagementStrategy
    const { sharedComponents } = require('../routes/v4/console/shared/middleware')
    const managementStrategy = sharedComponents.managementStrategy

    // 🎯 调用管理策略设置强制不中奖
    const result = await managementStrategy.forceLose(adminId, userId, count, reason, expiresAt)

    if (!result.success) {
      throw new Error(result.error || '强制不中奖设置失败')
    }

    /*
     * 【决策5/6/7/10】记录审计日志
     * - 决策5：关键操作，失败阻断业务
     * - 决策6：幂等键由 setting_id 派生
     * - 决策7：同一事务内
     * - 决策10：target_id 指向 LotteryManagementSetting.setting_id
     */
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
        idempotency_key: `lottery_force_lose_${result.setting_id}`, // 决策6
        ip_address: null,
        user_agent: null,
        is_critical_operation: true // 决策5
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
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * @param {number} adminId - 管理员ID
   * @param {number} userId - 目标用户ID
   * @param {Object} adjustmentData - 概率调整数据
   * @param {Date|null} expiresAt - 过期时间（null表示永不过期）
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
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(
      options,
      'AdminLotteryService.adjustUserProbability'
    )

    logger.info('管理员调整用户概率操作开始', {
      admin_id: adminId,
      user_id: userId,
      adjustment_type: adjustmentData.adjustment_type
    })

    // 🎯 使用初始化时注入的依赖
    const UserService = this._dependencies.user

    // 🔍 验证用户存在
    const user = await UserService.getUserById(userId)
    if (!user) {
      throw new Error('用户不存在')
    }

    // 🔍 如果是特定奖品调整，验证奖品存在
    let prize = null
    if (adjustmentData.adjustment_type === 'specific_prize' && adjustmentData.prize_id) {
      const PrizePoolService = this._dependencies.prizePool
      prize = await PrizePoolService.getPrizeById(adjustmentData.prize_id)
      if (!prize) {
        throw new Error('奖品不存在')
      }
    }

    // 🎯 准备设置数据
    const settingData = {
      adjustment_type: adjustmentData.adjustment_type,
      reason: adjustmentData.reason || '管理员概率调整'
    }

    if (adjustmentData.adjustment_type === 'specific_prize') {
      settingData.prize_id = adjustmentData.prize_id
      settingData.prize_name = prize.prize_name
      settingData.custom_probability = adjustmentData.custom_probability
      settingData.auto_adjust_others = true
    } else {
      settingData.multiplier = adjustmentData.multiplier
    }

    // 💾 创建数据库记录（概率调整直接操作数据库，不通过ManagementStrategy）
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

    /*
     * 【决策5/6/7/10】记录审计日志
     * - 决策5：关键操作，失败阻断业务
     * - 决策6：幂等键由 setting_id 派生
     * - 决策7：同一事务内
     * - 决策10：target_id 指向 LotteryManagementSetting.setting_id
     */
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
        idempotency_key: `lottery_probability_adjust_${setting.setting_id}`, // 决策6
        ip_address: null,
        user_agent: null,
        is_critical_operation: true // 决策5
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

    // 添加具体调整信息
    if (adjustmentData.adjustment_type === 'specific_prize') {
      result.prize_id = settingData.prize_id
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
   * @description
   * 管理员为指定用户设置专属的抽奖队列，用户抽奖时按队列顺序返回奖品。
   *
   * 业务场景：
   * - VIP体验：为VIP用户预设高价值奖品队列
   * - 精准运营：为特定用户设计抽奖体验路径
   * - 活动定制：为活动参与用户设置专属奖品队列
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * @param {number} adminId - 管理员ID
   * @param {number} userId - 目标用户ID
   * @param {Object} queueConfig - 队列配置
   * @param {string} queueConfig.queue_type - 队列类型（'priority', 'guaranteed', 'custom', 'blocked'）
   * @param {number} queueConfig.priority_level - 优先级（1-10）
   * @param {Array<number>} queueConfig.prize_queue - 奖品ID队列
   * @param {string} [reason='管理员设置特定队列'] - 操作原因
   * @param {Date|null} expiresAt - 过期时间（null表示永不过期）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<Object>} 操作结果
   * @returns {boolean} result.success - 操作是否成功
   * @returns {string} result.setting_id - 设置记录ID
   * @returns {number} result.user_id - 目标用户ID
   * @returns {string} result.user_mobile - 用户手机号
   * @returns {string} result.status - 状态标识（'user_queue_set'）
   * @returns {string} result.queue_type - 队列类型
   * @returns {number} result.priority_level - 优先级
   * @returns {string} result.reason - 操作原因
   * @returns {Date} result.expires_at - 过期时间
   * @returns {number} result.admin_id - 管理员ID
   * @returns {string} result.timestamp - 操作时间戳
   *
   * @throws {Error} 当用户不存在时抛出错误（code: 'USER_NOT_FOUND'）
   * @throws {Error} 当队列配置非法时抛出错误
   * @throws {Error} 当管理策略执行失败时抛出错误
   *
   * @example
   * const result = await AdminLotteryService.setUserQueue(
   *   10001,
   *   20001,
   *   {
   *     queue_type: 'priority',
   *     priority_level: 8,
   *     prize_queue: [30001, 30002, 30003]
   *   },
   *   'VIP用户专属队列',
   *   null,
   *   { transaction }
   * );
   */
  static async setUserQueue(
    adminId,
    userId,
    queueConfig,
    reason = '管理员设置特定队列',
    expiresAt = null,
    options = {}
  ) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'AdminLotteryService.setUserQueue')

    logger.info('管理员设置用户队列操作开始', {
      admin_id: adminId,
      user_id: userId,
      queue_type: queueConfig.queue_type
    })

    // 🎯 使用初始化时注入的依赖
    const UserService = this._dependencies.user

    // 🔍 验证用户存在
    const user = await UserService.getUserById(userId)
    if (!user) {
      throw new Error('用户不存在')
    }

    // 🎯 获取ManagementStrategy
    const { sharedComponents } = require('../routes/v4/console/shared/middleware')
    const managementStrategy = sharedComponents.managementStrategy

    // 🎯 调用管理策略设置用户队列
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

    /*
     * 【决策5/6/7/10】记录审计日志
     * - 决策5：关键操作，失败阻断业务
     * - 决策6：幂等键由 setting_id 派生
     * - 决策7：同一事务内
     * - 决策10：target_id 指向 LotteryManagementSetting.setting_id
     */
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
        idempotency_key: `lottery_user_queue_${result.setting_id}`, // 决策6
        ip_address: null,
        user_agent: null,
        is_critical_operation: true // 决策5
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
   * @description
   * 查询指定用户当前所有生效的抽奖管理设置。
   * 返回force_win、force_lose、probability_adjust、user_queue等所有设置的详细信息。
   *
   * 业务场景：
   * - 管理员查看用户当前管理状态
   * - 调试和排查用户抽奖异常
   * - 确认管理设置是否生效
   *
   * @param {number} userId - 目标用户ID
   * @returns {Promise<Object>} 用户管理状态
   * @returns {number} result.user_id - 用户ID
   * @returns {string} result.user_mobile - 用户手机号
   * @returns {string} result.user_nickname - 用户昵称
   * @returns {Object} result.management_status - 管理设置状态对象
   * @returns {Object|null} result.management_status.force_win - 强制中奖设置（如果存在）
   * @returns {Object|null} result.management_status.force_lose - 强制不中奖设置（如果存在）
   * @returns {Object|null} result.management_status.probability_adjust - 概率调整设置（如果存在）
   * @returns {Object|null} result.management_status.user_queue - 用户队列设置（如果存在）
   * @returns {string} result.timestamp - 查询时间戳
   *
   * @throws {Error} 当用户不存在时抛出错误（code: 'USER_NOT_FOUND'）
   *
   * @example
   * const status = await AdminLotteryService.getUserManagementStatus(20001);
   * // status.management_status.force_win: { setting_id, prize_id, reason, expires_at, status }
   */
  static async getUserManagementStatus(userId) {
    try {
      logger.info('查询用户管理状态', {
        user_id: userId
      })

      // 🎯 使用初始化时注入的依赖
      const UserService = this._dependencies.user

      // 🔍 验证用户存在
      const user = await UserService.getUserById(userId)
      if (!user) {
        throw new Error('用户不存在')
      }

      // 🎯 获取ManagementStrategy
      const { sharedComponents } = require('../routes/v4/console/shared/middleware')
      const managementStrategy = sharedComponents.managementStrategy

      // 🎯 获取用户管理状态
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
   * @description
   * 清除指定用户的所有或特定类型的抽奖管理设置，恢复默认状态。
   *
   * 业务场景：
   * - 管理员重置用户状态
   * - 测试结束后清理设置
   * - 取消特定管理操作
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * @param {number} adminId - 管理员ID
   * @param {number} userId - 目标用户ID
   * @param {string|null} [settingType=null] - 设置类型（null表示清除所有类型）
   * @param {string} [reason='管理员清除设置'] - 操作原因
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<Object>} 操作结果
   * @returns {boolean} result.success - 操作是否成功
   * @returns {number} result.user_id - 目标用户ID
   * @returns {string} result.user_mobile - 用户手机号
   * @returns {string} result.status - 状态标识（'settings_cleared'）
   * @returns {number} result.cleared_count - 清除的设置数量
   * @returns {string} result.reason - 操作原因
   * @returns {number} result.admin_id - 管理员ID
   * @returns {string} result.timestamp - 操作时间戳
   *
   * @throws {Error} 当用户不存在时抛出错误（code: 'USER_NOT_FOUND'）
   * @throws {Error} 当管理策略执行失败时抛出错误
   *
   * @example
   * // 清除所有设置
   * const result = await AdminLotteryService.clearUserSettings(10001, 20001, null, '管理员清除设置', { transaction });
   *
   * // 清除特定类型设置
   * const result = await AdminLotteryService.clearUserSettings(10001, 20001, 'force_win', '管理员清除设置', { transaction });
   */
  static async clearUserSettings(
    adminId,
    userId,
    settingType = null,
    reason = '管理员清除设置',
    options = {}
  ) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'AdminLotteryService.clearUserSettings')

    logger.info('管理员清除用户设置操作开始', {
      admin_id: adminId,
      user_id: userId,
      setting_type: settingType
    })

    // 🎯 使用初始化时注入的依赖
    const UserService = this._dependencies.user

    // 🔍 验证用户存在
    const user = await UserService.getUserById(userId)
    if (!user) {
      throw new Error('用户不存在')
    }

    // 🎯 获取ManagementStrategy
    const { sharedComponents } = require('../routes/v4/console/shared/middleware')
    const managementStrategy = sharedComponents.managementStrategy

    // 🎯 调用管理策略清除用户设置
    const result = await managementStrategy.clearUserSettings(adminId, userId, settingType)

    if (!result.success) {
      throw new Error(result.error || '清除用户设置失败')
    }

    /*
     * 【决策5/6/7/9/10】创建业务记录并记录审计日志
     * - 决策5：关键操作，失败阻断业务
     * - 决策6：幂等键由业务主键派生，禁止兜底
     * - 决策7：同一事务内
     * - 决策9：无天然业务主键的操作新增业务记录表
     * - 决策10：target_id 永远指向业务记录主键（record_id）
     */

    // 【决策9】创建清除设置记录（为审计日志提供业务主键）
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

    // 【决策10】使用 record_id 作为 target_id
    await AuditLogService.logAdminOperation(
      {
        admin_id: adminId,
        operation_type: 'lottery_clear_settings',
        operation_target: 'lottery_clear_setting_record',
        target_id: clearRecord.record_id, // 决策10：指向业务记录主键
        operation_details: {
          user_id: userId,
          user_mobile: user.mobile,
          setting_type: settingType || 'all',
          cleared_count: result.cleared_count,
          reason
        },
        idempotency_key: `audit_${idempotencyKey}`, // 审计幂等键派生自业务幂等键
        ip_address: null,
        user_agent: null,
        is_critical_operation: true // 决策5
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
   * 重置所有奖品的每日中奖次数
   *
   * @description
   * 每日定时任务，重置所有奖品的 daily_win_count 为 0。
   *
   * 业务场景：
   * - 每日凌晨定时任务执行
   * - 重置所有奖品的今日中奖次数统计
   * - 确保每日中奖限制正常工作
   *
   * 架构设计：
   * - 批处理逻辑属于业务管理范畴，应放在 Service 层
   * - Model 层只保留字段定义、关联、基础校验
   *
   * @returns {Promise<void>} 无返回值
   *
   * @example
   * // 定时任务调用
   * await AdminLotteryService.resetDailyWinCounts()
   */
  static async resetDailyWinCounts() {
    try {
      logger.info('[批处理任务] 开始重置每日中奖次数...')

      const { LotteryPrize } = models

      // 批量更新所有奖品的daily_win_count为0
      const [updatedCount] = await LotteryPrize.update({ daily_win_count: 0 }, { where: {} })

      logger.info('[批处理任务] 每日中奖次数重置完成', {
        updated_count: updatedCount,
        timestamp: BeijingTimeHelper.now()
      })

      return {
        success: true,
        updated_count: updatedCount,
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      logger.error('[批处理任务] 每日中奖次数重置失败', {
        error: error.message,
        stack: error.stack
      })

      throw error
    }
  }

  /**
   * 同步抽奖活动状态
   *
   * @description
   * 定时任务，自动同步抽奖活动状态：
   * - 将到达开始时间的draft状态活动更新为active
   * - 将已过结束时间的active状态活动更新为ended
   *
   * 业务场景：
   * - 定时任务自动执行
   * - 自动开启符合时间条件的活动
   * - 自动结束过期的活动
   * - 确保活动状态与时间同步
   *
   * 架构设计：
   * - 批处理逻辑属于业务管理范畴，应放在 Service 层
   * - Model 层只保留字段定义、关联、基础校验
   *
   * @returns {Promise<Object>} 同步结果
   * @returns {number} result.started - 开始的活动数量
   * @returns {number} result.ended - 结束的活动数量
   * @returns {Date} result.timestamp - 执行时间
   *
   * @example
   * // 定时任务调用
   * const result = await AdminLotteryService.syncCampaignStatus()
   * logger.info(`启动了${result.started}个活动，结束了${result.ended}个活动`)
   */
  static async syncCampaignStatus() {
    try {
      logger.info('[批处理任务] 开始同步活动状态...')

      const { LotteryCampaign } = models
      const { Op } = models.sequelize.Sequelize
      const now = BeijingTimeHelper.createBeijingTime()

      // 决策8B：先查询受影响的活动ID，用于后续精准缓存失效
      const toStartCampaigns = await LotteryCampaign.findAll({
        where: {
          status: 'draft',
          start_time: { [Op.lte]: now },
          end_time: { [Op.gte]: now }
        },
        attributes: ['campaign_id'],
        raw: true
      })

      const toEndCampaigns = await LotteryCampaign.findAll({
        where: {
          status: 'active',
          end_time: { [Op.lt]: now }
        },
        attributes: ['campaign_id'],
        raw: true
      })

      // 1. 自动开始符合条件的活动（status=draft且已到开始时间但未到结束时间）
      const startResult = await LotteryCampaign.update(
        { status: 'active' },
        {
          where: {
            status: 'draft',
            start_time: { [Op.lte]: now },
            end_time: { [Op.gte]: now }
          }
        }
      )

      // 2. 自动结束过期的活动（status=active且已过结束时间）
      const endResult = await LotteryCampaign.update(
        { status: 'ended' },
        {
          where: {
            status: 'active',
            end_time: { [Op.lt]: now }
          }
        }
      )

      // 决策8B：精准失效受影响活动的缓存（Service层）
      const invalidatedCampaigns = []
      for (const campaign of toStartCampaigns) {
        try {
          // eslint-disable-next-line no-await-in-loop -- 缓存失效需要逐个处理异常
          await BusinessCacheHelper.invalidateLotteryCampaign(
            campaign.campaign_id,
            'status_sync_started'
          )
          invalidatedCampaigns.push({ campaign_id: campaign.campaign_id, action: 'started' })
        } catch (cacheError) {
          logger.warn('[缓存] 活动缓存失效失败（非致命）', {
            campaign_id: campaign.campaign_id,
            error: cacheError.message
          })
        }
      }
      for (const campaign of toEndCampaigns) {
        try {
          // eslint-disable-next-line no-await-in-loop -- 缓存失效需要逐个处理异常
          await BusinessCacheHelper.invalidateLotteryCampaign(
            campaign.campaign_id,
            'status_sync_ended'
          )
          invalidatedCampaigns.push({ campaign_id: campaign.campaign_id, action: 'ended' })
        } catch (cacheError) {
          logger.warn('[缓存] 活动缓存失效失败（非致命）', {
            campaign_id: campaign.campaign_id,
            error: cacheError.message
          })
        }
      }

      logger.info('[批处理任务] 活动状态同步完成', {
        started_count: startResult[0],
        ended_count: endResult[0],
        invalidated_campaigns: invalidatedCampaigns,
        timestamp: now
      })

      return {
        success: true,
        started: startResult[0],
        ended: endResult[0],
        timestamp: now
      }
    } catch (error) {
      logger.error('[批处理任务] 活动状态同步失败', {
        error: error.message,
        stack: error.stack
      })

      throw error
    }
  }

  /**
   * 获取活跃的抽奖活动列表
   *
   * @description
   * 查询当前活跃的抽奖活动列表（status=active且在有效时间范围内）。
   *
   * 业务场景：
   * - 定时任务获取活动列表
   * - 管理后台查看当前活动
   * - 统计分析当前活动数据
   *
   * 架构设计：
   * - 复杂查询逻辑属于业务管理范畴，应放在 Service 层
   * - Model 层只保留字段定义、关联、基础校验
   *
   * @param {Object} [options={}] - 查询选项
   * @param {number} [options.limit=10] - 返回数量限制
   * @param {boolean} [options.includePrizes=true] - 是否包含奖品信息
   * @returns {Promise<Array>} 活跃活动列表
   *
   * @example
   * // 获取活跃活动列表（包含奖品）
   * const campaigns = await AdminLotteryService.getActiveCampaigns()
   *
   * // 获取活跃活动列表（不包含奖品）
   * const campaigns = await AdminLotteryService.getActiveCampaigns({ includePrizes: false })
   */
  static async getActiveCampaigns(options = {}) {
    try {
      const { limit = 10, includePrizes = true } = options

      logger.info('[查询任务] 开始查询活跃活动列表', { limit, includePrizes })

      const { LotteryCampaign } = models
      const { Op } = models.sequelize.Sequelize
      const now = BeijingTimeHelper.createBeijingTime()

      // 构建查询条件：status=active且在有效时间范围内
      const whereClause = {
        status: 'active',
        start_time: { [Op.lte]: now },
        end_time: { [Op.gte]: now }
      }

      // 构建查询选项
      const queryOptions = {
        where: whereClause,
        order: [['start_time', 'ASC']],
        limit
      }

      // 如果需要包含奖品信息
      if (includePrizes) {
        queryOptions.include = ['prizes']
      }

      const campaigns = await LotteryCampaign.findAll(queryOptions)

      logger.info('[查询任务] 活跃活动列表查询完成', {
        count: campaigns.length,
        limit,
        includePrizes
      })

      return campaigns
    } catch (error) {
      logger.error('[查询任务] 活跃活动列表查询失败', {
        error: error.message,
        stack: error.stack
      })

      throw error
    }
  }

  // ==================== 活动预算管理（决策7：失效归Service层）====================

  /**
   * 更新活动预算配置
   *
   * @description 更新活动的预算模式和相关配置，更新后精准失效缓存（决策3/7）
   * @param {number} campaign_id - 活动ID
   * @param {Object} updateData - 更新数据
   * @param {string} [updateData.budget_mode] - 预算模式（user/pool/none）
   * @param {number} [updateData.pool_budget_total] - 活动池总预算
   * @param {Array} [updateData.allowed_campaign_ids] - 允许使用的预算来源活动ID列表
   * @param {Object} [options] - 选项
   * @param {number} [options.operated_by] - 操作者ID（管理员）
   * @param {Object} [options.transaction] - Sequelize事务对象（可选）
   * @returns {Promise<Object>} 更新结果 {campaign, updated_fields}
   *
   * 缓存策略（决策3/7）：
   * - 更新成功后精准失效活动配置缓存
   * - 缓存失效失败不阻塞主流程（记录WARN日志）
   */
  static async updateCampaignBudget(campaign_id, updateData, options = {}) {
    const { operated_by, transaction } = options
    const { LotteryCampaign } = models

    // 验证 budget_mode
    const validBudgetModes = ['user', 'pool', 'none']
    if (updateData.budget_mode && !validBudgetModes.includes(updateData.budget_mode)) {
      const error = new Error(`无效的预算模式：${updateData.budget_mode}`)
      error.code = 'INVALID_BUDGET_MODE'
      error.statusCode = 400
      throw error
    }

    // 获取活动
    const campaign = await LotteryCampaign.findByPk(parseInt(campaign_id), { transaction })
    if (!campaign) {
      const error = new Error('活动不存在')
      error.code = 'CAMPAIGN_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    // 构建更新数据
    const fieldsToUpdate = {}
    const { budget_mode, pool_budget_total, allowed_campaign_ids } = updateData

    if (budget_mode) {
      fieldsToUpdate.budget_mode = budget_mode

      // 如果切换到 pool 模式，需要设置初始预算
      if (budget_mode === 'pool') {
        if (pool_budget_total && pool_budget_total > 0) {
          fieldsToUpdate.pool_budget_total = pool_budget_total
          fieldsToUpdate.pool_budget_remaining = pool_budget_total // 初始剩余等于总预算
        } else if (!campaign.pool_budget_total) {
          const error = new Error('切换到活动池预算模式时，必须设置 pool_budget_total')
          error.code = 'MISSING_POOL_BUDGET'
          error.statusCode = 400
          throw error
        }
      }
    }

    if (pool_budget_total !== undefined && pool_budget_total >= 0) {
      fieldsToUpdate.pool_budget_total = pool_budget_total
      // 如果调整总预算，同步调整剩余预算（仅在增加时）
      const currentRemaining = Number(campaign.pool_budget_remaining) || 0
      const currentTotal = Number(campaign.pool_budget_total) || 0
      const usedBudget = currentTotal - currentRemaining
      fieldsToUpdate.pool_budget_remaining = Math.max(0, pool_budget_total - usedBudget)
    }

    if (allowed_campaign_ids !== undefined) {
      // 验证格式：必须是数组或 null
      if (allowed_campaign_ids !== null && !Array.isArray(allowed_campaign_ids)) {
        const error = new Error('allowed_campaign_ids 必须是数组或 null')
        error.code = 'INVALID_ALLOWED_CAMPAIGNS'
        error.statusCode = 400
        throw error
      }
      fieldsToUpdate.allowed_campaign_ids = allowed_campaign_ids
    }

    if (Object.keys(fieldsToUpdate).length === 0) {
      const error = new Error('未提供任何更新字段')
      error.code = 'NO_UPDATE_DATA'
      error.statusCode = 400
      throw error
    }

    // 执行更新
    await campaign.update(fieldsToUpdate, { transaction })

    // ========== 决策3/7：活动配置更新后精准失效缓存 ==========
    try {
      await BusinessCacheHelper.invalidateLotteryCampaign(
        parseInt(campaign_id),
        'campaign_budget_updated'
      )
      logger.info('[缓存] 活动配置缓存已失效', {
        campaign_id: parseInt(campaign_id),
        operated_by
      })
    } catch (cacheError) {
      // 缓存失效失败不阻塞主流程
      logger.warn('[缓存] 活动配置缓存失效失败（非致命）', {
        error: cacheError.message,
        campaign_id
      })
    }

    logger.info('活动预算配置更新成功', {
      campaign_id,
      updated_fields: Object.keys(fieldsToUpdate),
      operated_by
    })

    return {
      campaign: campaign.reload({ transaction }),
      updated_fields: Object.keys(fieldsToUpdate)
    }
  }

  /**
   * 补充活动池预算
   *
   * @description 为活动池补充预算，补充后精准失效缓存（决策3/7）
   * @param {number} campaign_id - 活动ID
   * @param {number} amount - 补充金额
   * @param {Object} [options] - 选项
   * @param {number} [options.operated_by] - 操作者ID（管理员）
   * @param {Object} [options.transaction] - Sequelize事务对象（可选）
   * @returns {Promise<Object>} 补充结果 {campaign, amount, new_remaining}
   *
   * 缓存策略（决策3/7）：
   * - 补充成功后精准失效活动配置缓存
   * - 缓存失效失败不阻塞主流程（记录WARN日志）
   */
  static async supplementCampaignBudget(campaign_id, amount, options = {}) {
    const { operated_by, transaction } = options
    const { LotteryCampaign } = models

    // 验证金额
    if (!amount || amount <= 0) {
      const error = new Error('补充金额必须大于0')
      error.code = 'INVALID_AMOUNT'
      error.statusCode = 400
      throw error
    }

    // 获取活动
    const campaign = await LotteryCampaign.findByPk(parseInt(campaign_id), { transaction })
    if (!campaign) {
      const error = new Error('活动不存在')
      error.code = 'CAMPAIGN_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    // 验证预算模式
    if (campaign.budget_mode !== 'pool') {
      const error = new Error('只有活动池预算模式才能补充预算')
      error.code = 'INVALID_BUDGET_MODE'
      error.statusCode = 400
      throw error
    }

    // 计算新的剩余预算和总预算
    const currentRemaining = Number(campaign.pool_budget_remaining) || 0
    const currentTotal = Number(campaign.pool_budget_total) || 0
    const newRemaining = currentRemaining + amount
    const newTotal = currentTotal + amount

    // 更新活动
    await campaign.update(
      {
        pool_budget_remaining: newRemaining,
        pool_budget_total: newTotal
      },
      { transaction }
    )

    // ========== 决策3/7：预算补充后精准失效缓存 ==========
    try {
      await BusinessCacheHelper.invalidateLotteryCampaign(
        parseInt(campaign_id),
        'campaign_budget_supplemented'
      )
      logger.info('[缓存] 活动配置缓存已失效', {
        campaign_id: parseInt(campaign_id),
        reason: 'budget_supplement',
        operated_by
      })
    } catch (cacheError) {
      // 缓存失效失败不阻塞主流程
      logger.warn('[缓存] 活动配置缓存失效失败（非致命）', {
        error: cacheError.message,
        campaign_id
      })
    }

    logger.info('活动池预算补充成功', {
      campaign_id,
      amount,
      new_remaining: newRemaining,
      new_total: newTotal,
      operated_by
    })

    return {
      campaign: await campaign.reload({ transaction }),
      amount,
      new_remaining: newRemaining,
      new_total: newTotal
    }
  }

  /**
   * 获取干预规则列表
   *
   * @description 分页查询lottery_management_settings表
   * 字段映射（数据库 → 业务）：
   * - status 字段存储状态：active/used/expired/cancelled
   * - setting_data JSON 字段存储：prize_id, reason, count, remaining 等具体设置
   * - user_id 关联 target_user（目标用户）
   * - created_by 关联 admin（操作管理员）
   *
   * @param {Object} query - 查询条件
   * @param {number} query.page - 页码，默认1
   * @param {number} query.page_size - 每页数量，默认20
   * @param {string} query.status - 状态筛选：active/used/expired/cancelled
   * @param {string} query.user_search - 用户搜索（用户ID或手机号）
   * @param {string} query.setting_type - 设置类型筛选
   * @returns {Promise<Object>} 干预规则列表和分页信息
   */
  static async getInterventionList(query = {}) {
    const { Op } = require('sequelize')
    const { page = 1, page_size = 20, status, user_search, setting_type } = query

    const where = {}

    // 状态筛选 - 使用 status 字段（枚举：active/used/expired/cancelled）
    if (status) {
      const now = new Date()
      switch (status) {
        case 'active':
          // 生效中：status='active' 且 未过期（expires_at为null或大于当前时间）
          where.status = 'active'
          where[Op.or] = [{ expires_at: null }, { expires_at: { [Op.gt]: now } }]
          break
        case 'used':
          // 已使用
          where.status = 'used'
          break
        case 'expired':
          // 已过期：status='active' 但 expires_at 已过期
          where.status = 'active'
          where.expires_at = { [Op.lte]: now, [Op.ne]: null }
          break
        case 'cancelled':
          // 已取消
          where.status = 'cancelled'
          break
        default:
          // 不筛选或直接使用传入的状态值
          if (['active', 'used', 'expired', 'cancelled'].includes(status)) {
            where.status = status
          }
      }
    }

    // 设置类型筛选
    if (setting_type) {
      where.setting_type = setting_type
    }

    // 用户搜索 - 关联 target_user（正确的关联别名）
    let userWhere
    if (user_search) {
      if (/^\d+$/.test(user_search)) {
        userWhere = {
          [Op.or]: [
            { user_id: parseInt(user_search) },
            { mobile: { [Op.like]: `%${user_search}%` } }
          ]
        }
      } else {
        userWhere = { mobile: { [Op.like]: `%${user_search}%` } }
      }
    }

    const offset = (parseInt(page) - 1) * parseInt(page_size)
    const limit = parseInt(page_size)

    const { count, rows } = await models.LotteryManagementSetting.findAndCountAll({
      where,
      include: [
        {
          model: models.User,
          as: 'target_user', // 正确的关联别名（模型定义的 as）
          attributes: ['user_id', 'nickname', 'mobile'],
          where: userWhere,
          required: !!userWhere
        },
        {
          model: models.User,
          as: 'admin', // 正确的关联别名（模型定义的 as）
          attributes: ['user_id', 'nickname'],
          required: false
        }
      ],
      order: [['created_at', 'DESC']],
      offset,
      limit
    })

    /*
     * 🎁 批量查询奖品名称（避免N+1查询）
     * 收集所有需要查询的 prize_id
     */
    const prizeIds = new Set()
    rows.forEach(item => {
      const settingData =
        typeof item.setting_data === 'string'
          ? JSON.parse(item.setting_data)
          : item.setting_data || {}
      if (settingData.prize_id && !settingData.prize_name) {
        prizeIds.add(settingData.prize_id)
      }
    })

    // 批量查询奖品信息
    const prizeMap = new Map()
    if (prizeIds.size > 0) {
      const prizes = await models.LotteryPrize.findAll({
        where: { prize_id: { [Op.in]: Array.from(prizeIds) } },
        attributes: ['prize_id', 'prize_name', 'prize_value']
      })
      prizes.forEach(prize => {
        prizeMap.set(prize.prize_id, {
          prize_id: prize.prize_id,
          prize_name: prize.prize_name,
          prize_value: prize.prize_value
        })
      })
    }

    return {
      items: rows.map(item => AdminLotteryService._formatInterventionItem(item, prizeMap)),
      pagination: {
        page: parseInt(page),
        page_size: parseInt(page_size),
        total: count,
        total_pages: Math.ceil(count / parseInt(page_size))
      }
    }
  }

  /**
   * 获取单个干预规则详情
   *
   * @param {string} settingId - 设置ID（字符串格式：setting_时间戳_随机码）
   * @returns {Promise<Object>} 干预规则详情
   * @throws {Error} 规则不存在
   */
  static async getInterventionById(settingId) {
    const setting = await models.LotteryManagementSetting.findByPk(settingId, {
      include: [
        {
          model: models.User,
          as: 'target_user', // 正确的关联别名
          attributes: ['user_id', 'nickname', 'mobile', 'status']
        },
        {
          model: models.User,
          as: 'admin', // 正确的关联别名
          attributes: ['user_id', 'nickname']
        }
      ]
    })

    if (!setting) {
      const error = new Error('干预规则不存在')
      error.code = 'INTERVENTION_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    return AdminLotteryService._formatInterventionDetail(setting)
  }

  /**
   * 取消干预规则
   *
   * @param {string} settingId - 设置ID（字符串格式）
   * @param {Object} options - 选项
   * @param {string} options.reason - 取消原因
   * @param {number} options.operated_by - 操作者ID
   * @param {Object} options.transaction - Sequelize事务对象
   * @returns {Promise<Object>} 更新后的干预规则
   * @throws {Error} 规则不存在或已不可取消
   *
   * 字段映射说明：
   * - status 字段：存储状态 active/used/expired/cancelled
   * - 取消操作：将 status 改为 'cancelled'
   */
  static async cancelIntervention(settingId, options = {}) {
    const { reason = '管理员手动取消', operated_by } = options
    const transaction = assertAndGetTransaction(options, 'AdminLotteryService.cancelIntervention')

    const setting = await models.LotteryManagementSetting.findByPk(settingId, { transaction })

    if (!setting) {
      const error = new Error('干预规则不存在')
      error.code = 'INTERVENTION_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    // 使用正确的字段名 status（而非 is_active）
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

    // 更新状态为 cancelled（使用模型现有字段）
    await setting.update(
      {
        status: 'cancelled'
      },
      { transaction }
    )

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

  /**
   * 格式化干预规则列表项
   *
   * @private
   * @param {Object} item - 数据库记录
   * @param {Map} prizeMap - 奖品ID到奖品信息的映射（可选，用于批量查询优化）
   * @returns {Object} 格式化后的项
   *
   * 字段映射说明：
   * - setting_data.prize_id: 强制中奖时的奖品ID
   * - setting_data.reason: 操作原因
   * - setting_data.count/remaining: 强制不中奖次数
   * - target_user: 目标用户信息（关联别名）
   * - admin: 操作管理员信息（关联别名）
   */
  static _formatInterventionItem(item, prizeMap = new Map()) {
    const now = new Date()
    const settingData = item.setting_data || {}

    // 计算实际状态（基于 status 字段和 expires_at）
    let displayStatus = item.status
    if (item.status === 'active' && item.expires_at && new Date(item.expires_at) <= now) {
      displayStatus = 'expired' // 业务层显示已过期
    }

    // 🎁 获取奖品信息（优先从 setting_data，其次从 prizeMap 查询）
    let prizeInfo = null
    if (settingData.prize_id) {
      // 如果 setting_data 中已有 prize_name，直接使用
      if (settingData.prize_name) {
        prizeInfo = {
          prize_id: settingData.prize_id,
          prize_name: settingData.prize_name,
          prize_value: settingData.prize_value || null
        }
      } else if (prizeMap.has(settingData.prize_id)) {
        // 否则从 prizeMap 查询
        prizeInfo = prizeMap.get(settingData.prize_id)
      } else {
        // 兜底：只有 prize_id
        prizeInfo = {
          prize_id: settingData.prize_id,
          prize_name: null,
          prize_value: null
        }
      }
    }

    return {
      setting_id: item.setting_id,
      user_id: item.user_id,
      // 使用正确的关联别名 target_user
      user_info: item.target_user
        ? {
            nickname: item.target_user.nickname,
            mobile: item.target_user.mobile
          }
        : null,
      setting_type: item.setting_type,
      // prize_id 存储在 setting_data JSON 中
      prize_id: settingData.prize_id || null,
      // 奖品信息（从 setting_data 或 prizeMap 获取）
      prize_info: prizeInfo,
      // reason 存储在 setting_data JSON 中
      reason: settingData.reason || null,
      // 状态字段
      status: displayStatus,
      expires_at: item.expires_at,
      created_at: item.created_at,
      // 操作管理员信息
      operator: item.admin
        ? {
            user_id: item.admin.user_id,
            nickname: item.admin.nickname
          }
        : null
    }
  }

  /**
   * 格式化干预规则详情
   *
   * @private
   * @param {Object} setting - 数据库记录
   * @returns {Object} 格式化后的详情
   *
   * 字段映射说明：
   * - setting_data JSON 中存储具体设置参数（prize_id, reason, count 等）
   * - target_user: 目标用户信息（关联别名）
   * - admin: 操作管理员信息（关联别名）
   */
  static _formatInterventionDetail(setting) {
    const now = new Date()
    const settingData = setting.setting_data || {}

    // 计算实际状态
    let displayStatus = setting.status
    if (setting.status === 'active' && setting.expires_at && new Date(setting.expires_at) <= now) {
      displayStatus = 'expired'
    }

    return {
      setting_id: setting.setting_id,
      // 目标用户信息（使用正确的关联别名 target_user）
      user: setting.target_user
        ? {
            user_id: setting.target_user.user_id,
            nickname: setting.target_user.nickname,
            mobile: setting.target_user.mobile,
            status: setting.target_user.status
          }
        : null,
      setting_type: setting.setting_type,
      // 设置详情（从 setting_data JSON 提取）
      setting_data: settingData,
      // 奖品信息（从 setting_data 获取）
      prize_id: settingData.prize_id || null,
      prize_name: settingData.prize_name || null,
      // reason 存储在 setting_data 中
      reason: settingData.reason || null,
      // 状态字段
      status: displayStatus,
      expires_at: setting.expires_at,
      // 操作管理员信息（使用正确的关联别名 admin）
      operator: setting.admin
        ? {
            user_id: setting.admin.user_id,
            nickname: setting.admin.nickname
          }
        : null,
      created_at: setting.created_at,
      updated_at: setting.updated_at
    }
  }
}

module.exports = AdminLotteryService
