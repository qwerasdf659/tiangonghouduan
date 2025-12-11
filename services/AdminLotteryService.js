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
 * 业务流程：
 *
 * 1. **强制中奖流程**
 *    - 验证user_id和prize_id → 调用UserService和PrizePoolService → 调用ManagementStrategy.forceWin → 记录审计日志 → 返回结果
 *
 * 2. **强制不中奖流程**
 *    - 验证user_id → 调用UserService → 调用ManagementStrategy.forceLose → 记录审计日志 → 返回结果
 *
 * 3. **概率调整流程**
 *    - 验证user_id（可选prize_id） → 调用UserService（可选PrizePoolService） → 创建LotteryManagementSetting → 记录审计日志 → 返回结果
 *
 * 4. **用户队列设置流程**
 *    - 验证user_id → 调用UserService → 调用ManagementStrategy.setUserQueue → 记录审计日志 → 返回结果
 *
 * 5. **管理状态查询流程**
 *    - 验证user_id → 调用UserService → 调用ManagementStrategy.getUserManagementStatus → 返回状态信息
 *
 * 6. **设置清除流程**
 *    - 验证user_id → 调用UserService → 调用ManagementStrategy.clearUserSettings → 记录审计日志 → 返回结果
 *
 * 设计原则：
 * - **编排层职责**：本服务负责用户/奖品验证、事务管理、审计日志记录
 * - **委托给策略**：具体的管理逻辑委托给ManagementStrategy处理
 * - **事务管理**：所有写操作在事务中执行，确保数据一致性
 * - **审计日志**：所有管理操作都记录到AdminOperationLog
 *
 * 依赖服务：
 * - UserService：用户验证
 * - PrizePoolService：奖品验证
 * - ManagementStrategy：抽奖管理策略（通过sharedComponents获取）
 * - AuditLogService：审计日志记录
 *
 * 关键方法列表：
 * - forceWinForUser(adminId, userId, prizeId, reason, expiresAt) - 强制用户中奖
 * - forceLoseForUser(adminId, userId, count, reason, expiresAt) - 强制用户不中奖
 * - adjustUserProbability(adminId, userId, adjustmentData, expiresAt) - 调整用户中奖概率
 * - setUserQueue(adminId, userId, queueConfig, reason, expiresAt) - 设置用户专属队列
 * - getUserManagementStatus(userId) - 获取用户管理状态
 * - clearUserSettings(adminId, userId, settingType) - 清除用户设置
 *
 * 数据模型关联：
 * - User：用户表（验证用户存在）
 * - LotteryPrize：奖品表（验证奖品存在）
 * - LotteryManagementSetting：抽奖管理设置表（存储管理配置）
 * - AdminOperationLog：管理员操作日志表（审计记录）
 *
 * 使用示例：
 * ```javascript
 * const serviceManager = require('./services');
 * const AdminLotteryService = serviceManager.getService('adminLottery');
 *
 * // 示例1：强制用户中奖
 * const result = await AdminLotteryService.forceWinForUser(
 *   adminId,
 *   userId,
 *   prizeId,
 *   '补偿用户',
 *   expiresAt
 * );
 *
 * // 示例2：调整用户概率
 * const result = await AdminLotteryService.adjustUserProbability(
 *   adminId,
 *   userId,
 *   { multiplier: 2.0, adjustment_type: 'global_multiplier' },
 *   expiresAt
 * );
 * ```
 *
 * 创建时间：2025年12月09日
 * 使用模型：Claude Sonnet 4.5
 */

const Logger = require('./UnifiedLotteryEngine/utils/Logger')
const BeijingTimeHelper = require('../utils/timeHelper')
const models = require('../models')
const AuditLogService = require('./AuditLogService')

const logger = new Logger('AdminLotteryService')

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
  static initialize (serviceManager) {
    // 🎯 直接从_services Map获取，避免触发初始化检查
    this._dependencies.user = serviceManager._services.get('user')
    this._dependencies.prizePool = serviceManager._services.get('prizePool')
    logger.info('AdminLotteryService依赖注入完成')
  }

  /**
   * 强制用户中奖
   *
   * @description
   * 管理员强制指定用户在下次抽奖中获得指定奖品。
   * 该方法负责验证用户和奖品的存在性，然后调用ManagementStrategy完成实际操作。
   *
   * 业务场景：
   * - 用户补偿：因系统故障需要补偿用户
   * - 测试验证：测试抽奖系统的强制中奖功能
   * - 特殊活动：运营活动需要指定用户中奖
   *
   * @param {number} adminId - 管理员ID
   * @param {number} userId - 目标用户ID
   * @param {number} prizeId - 奖品ID
   * @param {string} [reason='管理员强制中奖'] - 操作原因
   * @param {Date|null} [expiresAt=null] - 过期时间（null表示永不过期）
   * @returns {Promise<Object>} 操作结果
   * @returns {boolean} result.success - 操作是否成功
   * @returns {string} result.setting_id - 设置记录ID
   * @returns {number} result.user_id - 目标用户ID
   * @returns {number} result.prize_id - 奖品ID
   * @returns {string} result.user_mobile - 用户手机号
   * @returns {string} result.prize_name - 奖品名称
   * @returns {string} result.status - 状态标识（'force_win_set'）
   * @returns {string} result.reason - 操作原因
   * @returns {Date} result.expires_at - 过期时间
   * @returns {number} result.admin_id - 管理员ID
   * @returns {string} result.timestamp - 操作时间戳
   *
   * @throws {Error} 当用户不存在时抛出错误（code: 'USER_NOT_FOUND'）
   * @throws {Error} 当奖品不存在时抛出错误
   * @throws {Error} 当管理策略执行失败时抛出错误
   *
   * @example
   * const result = await AdminLotteryService.forceWinForUser(
   *   10001,
   *   20001,
   *   30001,
   *   '系统补偿',
   *   new Date(Date.now() + 3600000) // 1小时后过期
   * );
   */
  static async forceWinForUser (
    adminId,
    userId,
    prizeId,
    reason = '管理员强制中奖',
    expiresAt = null
  ) {
    const transaction = await models.sequelize.transaction()

    try {
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
      const { sharedComponents } = require('../routes/v4/unified-engine/admin/shared/middleware')
      const managementStrategy = sharedComponents.managementStrategy

      // 🎯 调用管理策略设置强制中奖
      const result = await managementStrategy.forceWin(adminId, userId, prizeId, reason, expiresAt)

      if (!result.success) {
        throw new Error(result.error || '强制中奖设置失败')
      }

      // 📝 记录审计日志
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
          ip_address: null, // 路由层会填充
          user_agent: null // 路由层会填充
        },
        { transaction }
      )

      await transaction.commit()

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
    } catch (error) {
      await transaction.rollback()

      logger.error('管理员强制中奖操作失败', {
        admin_id: adminId,
        user_id: userId,
        prize_id: prizeId,
        error: error.message,
        stack: error.stack
      })

      throw error
    }
  }

  /**
   * 强制用户不中奖
   *
   * @description
   * 管理员强制指定用户在接下来N次抽奖中不中奖。
   * 该方法负责验证用户的存在性，然后调用ManagementStrategy完成实际操作。
   *
   * 业务场景：
   * - 防刷保护：检测到用户异常行为，临时限制中奖
   * - 测试验证：测试抽奖系统的强制不中奖功能
   * - 特殊活动：运营活动需要控制用户中奖节奏
   *
   * @param {number} adminId - 管理员ID
   * @param {number} userId - 目标用户ID
   * @param {number} [count=1] - 不中奖次数（1-100）
   * @param {string} [reason='管理员强制不中奖'] - 操作原因
   * @param {Date|null} [expiresAt=null] - 过期时间（null表示永不过期）
   * @returns {Promise<Object>} 操作结果
   * @returns {boolean} result.success - 操作是否成功
   * @returns {string} result.setting_id - 设置记录ID
   * @returns {number} result.user_id - 目标用户ID
   * @returns {string} result.user_mobile - 用户手机号
   * @returns {string} result.status - 状态标识（'force_lose_set'）
   * @returns {number} result.count - 总次数
   * @returns {number} result.remaining - 剩余次数
   * @returns {string} result.reason - 操作原因
   * @returns {Date} result.expires_at - 过期时间
   * @returns {number} result.admin_id - 管理员ID
   * @returns {string} result.timestamp - 操作时间戳
   *
   * @throws {Error} 当用户不存在时抛出错误（code: 'USER_NOT_FOUND'）
   * @throws {Error} 当count超出范围时抛出错误
   * @throws {Error} 当管理策略执行失败时抛出错误
   *
   * @example
   * const result = await AdminLotteryService.forceLoseForUser(
   *   10001,
   *   20001,
   *   5,
   *   '防刷保护'
   * );
   */
  static async forceLoseForUser (
    adminId,
    userId,
    count = 1,
    reason = '管理员强制不中奖',
    expiresAt = null
  ) {
    const transaction = await models.sequelize.transaction()

    try {
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
      const { sharedComponents } = require('../routes/v4/unified-engine/admin/shared/middleware')
      const managementStrategy = sharedComponents.managementStrategy

      // 🎯 调用管理策略设置强制不中奖
      const result = await managementStrategy.forceLose(adminId, userId, count, reason, expiresAt)

      if (!result.success) {
        throw new Error(result.error || '强制不中奖设置失败')
      }

      // 📝 记录审计日志
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
          ip_address: null,
          user_agent: null
        },
        { transaction }
      )

      await transaction.commit()

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
    } catch (error) {
      await transaction.rollback()

      logger.error('管理员强制不中奖操作失败', {
        admin_id: adminId,
        user_id: userId,
        count,
        error: error.message,
        stack: error.stack
      })

      throw error
    }
  }

  /**
   * 调整用户中奖概率
   *
   * @description
   * 管理员调整指定用户的中奖概率。
   * 支持两种模式：
   * 1. 全局概率倍数调整（adjustmentData.multiplier）
   * 2. 特定奖品概率调整（adjustmentData.prize_id + adjustmentData.custom_probability）
   *
   * 业务场景：
   * - 用户挽留：提升流失用户的中奖概率
   * - 活跃激励：提升活跃用户的中奖概率
   * - 精准运营：为特定用户设置特定奖品的中奖概率
   *
   * @param {number} adminId - 管理员ID
   * @param {number} userId - 目标用户ID
   * @param {Object} adjustmentData - 概率调整数据
   * @param {number} [adjustmentData.multiplier] - 全局概率倍数（0.1-10，用于全局调整模式）
   * @param {number} [adjustmentData.prize_id] - 奖品ID（用于特定奖品调整模式）
   * @param {number} [adjustmentData.custom_probability] - 自定义概率（0.01-1.0，用于特定奖品调整模式）
   * @param {string} adjustmentData.adjustment_type - 调整类型（'global_multiplier' 或 'specific_prize'）
   * @param {string} [adjustmentData.reason='管理员概率调整'] - 操作原因
   * @param {Date|null} expiresAt - 过期时间（null表示永不过期）
   * @returns {Promise<Object>} 操作结果
   * @returns {boolean} result.success - 操作是否成功
   * @returns {string} result.setting_id - 设置记录ID
   * @returns {number} result.user_id - 目标用户ID
   * @returns {string} result.user_mobile - 用户手机号
   * @returns {string} result.status - 状态标识（'probability_adjusted'）
   * @returns {string} result.adjustment_type - 调整类型
   * @returns {number} [result.multiplier] - 概率倍数（全局调整模式）
   * @returns {number} [result.prize_id] - 奖品ID（特定奖品调整模式）
   * @returns {string} [result.prize_name] - 奖品名称（特定奖品调整模式）
   * @returns {number} [result.custom_probability] - 自定义概率（特定奖品调整模式）
   * @returns {string} result.reason - 操作原因
   * @returns {Date} result.expires_at - 过期时间
   * @returns {number} result.admin_id - 管理员ID
   * @returns {string} result.timestamp - 操作时间戳
   *
   * @throws {Error} 当用户不存在时抛出错误（code: 'USER_NOT_FOUND'）
   * @throws {Error} 当奖品不存在时抛出错误（特定奖品调整模式）
   * @throws {Error} 当概率参数非法时抛出错误
   *
   * @example
   * // 全局倍数调整
   * const result1 = await AdminLotteryService.adjustUserProbability(
   *   10001,
   *   20001,
   *   { multiplier: 2.0, adjustment_type: 'global_multiplier', reason: '用户挽留' },
   *   expiresAt
   * );
   *
   * // 特定奖品调整
   * const result2 = await AdminLotteryService.adjustUserProbability(
   *   10001,
   *   20001,
   *   {
   *     prize_id: 30001,
   *     custom_probability: 0.5,
   *     adjustment_type: 'specific_prize',
   *     reason: '精准运营'
   *   },
   *   expiresAt
   * );
   */
  static async adjustUserProbability (adminId, userId, adjustmentData, expiresAt = null) {
    const transaction = await models.sequelize.transaction()

    try {
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

      // 📝 记录审计日志
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
          ip_address: null,
          user_agent: null
        },
        { transaction }
      )

      await transaction.commit()

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
    } catch (error) {
      await transaction.rollback()

      logger.error('管理员调整用户概率操作失败', {
        admin_id: adminId,
        user_id: userId,
        error: error.message,
        stack: error.stack
      })

      throw error
    }
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
   * @param {number} adminId - 管理员ID
   * @param {number} userId - 目标用户ID
   * @param {Object} queueConfig - 队列配置
   * @param {string} queueConfig.queue_type - 队列类型（'priority', 'guaranteed', 'custom', 'blocked'）
   * @param {number} queueConfig.priority_level - 优先级（1-10）
   * @param {Array<number>} queueConfig.prize_queue - 奖品ID队列
   * @param {string} [reason='管理员设置特定队列'] - 操作原因
   * @param {Date|null} expiresAt - 过期时间（null表示永不过期）
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
   *   'VIP用户专属队列'
   * );
   */
  static async setUserQueue (
    adminId,
    userId,
    queueConfig,
    reason = '管理员设置特定队列',
    expiresAt = null
  ) {
    const transaction = await models.sequelize.transaction()

    try {
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
      const { sharedComponents } = require('../routes/v4/unified-engine/admin/shared/middleware')
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

      // 📝 记录审计日志
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
          ip_address: null,
          user_agent: null
        },
        { transaction }
      )

      await transaction.commit()

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
    } catch (error) {
      await transaction.rollback()

      logger.error('管理员设置用户队列操作失败', {
        admin_id: adminId,
        user_id: userId,
        error: error.message,
        stack: error.stack
      })

      throw error
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
  static async getUserManagementStatus (userId) {
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
      const { sharedComponents } = require('../routes/v4/unified-engine/admin/shared/middleware')
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
   * @param {number} adminId - 管理员ID
   * @param {number} userId - 目标用户ID
   * @param {string|null} [settingType=null] - 设置类型（null表示清除所有类型）
   * @param {string} [reason='管理员清除设置'] - 操作原因
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
   * const result = await AdminLotteryService.clearUserSettings(10001, 20001, null);
   *
   * // 清除特定类型设置
   * const result = await AdminLotteryService.clearUserSettings(10001, 20001, 'force_win');
   */
  static async clearUserSettings (adminId, userId, settingType = null, reason = '管理员清除设置') {
    const transaction = await models.sequelize.transaction()

    try {
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
      const { sharedComponents } = require('../routes/v4/unified-engine/admin/shared/middleware')
      const managementStrategy = sharedComponents.managementStrategy

      // 🎯 调用管理策略清除用户设置
      const result = await managementStrategy.clearUserSettings(adminId, userId, settingType)

      if (!result.success) {
        throw new Error(result.error || '清除用户设置失败')
      }

      // 📝 记录审计日志
      await AuditLogService.logAdminOperation(
        {
          admin_id: adminId,
          operation_type: 'lottery_clear_settings',
          operation_target: 'lottery_management_setting',
          target_id: null, // 清除操作没有单一目标ID
          operation_details: {
            user_id: userId,
            user_mobile: user.mobile,
            setting_type: settingType || 'all',
            cleared_count: result.cleared_count,
            reason
          },
          ip_address: null,
          user_agent: null
        },
        { transaction }
      )

      await transaction.commit()

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
    } catch (error) {
      await transaction.rollback()

      logger.error('管理员清除用户设置操作失败', {
        admin_id: adminId,
        user_id: userId,
        error: error.message,
        stack: error.stack
      })

      throw error
    }
  }

  /**
   * 重置所有奖品的每日中奖次数
   *
   * @description
   * 每日定时任务，重置所有奖品的 daily_win_count 为 0。
   * 该方法从 LotteryPrize 模型迁移而来，负责定时任务的批量数据更新。
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
   *
   * 创建时间：2025年12月11日（从LotteryPrize.resetDailyWinCount迁移）
   * 迁移原因：符合"Model层纯净度"架构原则（任务2.1）
   */
  static async resetDailyWinCounts () {
    try {
      logger.info('[批处理任务] 开始重置每日中奖次数...')

      const { LotteryPrize } = models

      // 批量更新所有奖品的daily_win_count为0
      const [updatedCount] = await LotteryPrize.update(
        { daily_win_count: 0 },
        { where: {} }
      )

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
   * 该方法从 LotteryCampaign 模型迁移而来，负责定时任务的批量状态管理。
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
   * console.log(`启动了${result.started}个活动，结束了${result.ended}个活动`)
   *
   * 创建时间：2025年12月11日（从LotteryCampaign.batchUpdateStatus迁移）
   * 迁移原因：符合"Model层纯净度"架构原则（任务2.1）
   */
  static async syncCampaignStatus () {
    try {
      logger.info('[批处理任务] 开始同步活动状态...')

      const { LotteryCampaign } = models
      const { Op } = models.sequelize.Sequelize
      const now = BeijingTimeHelper.createBeijingTime()

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

      logger.info('[批处理任务] 活动状态同步完成', {
        started_count: startResult[0],
        ended_count: endResult[0],
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
   * 该方法从 LotteryCampaign 模型迁移而来，负责活动列表查询业务逻辑。
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
   *
   * 创建时间：2025年12月11日（从LotteryCampaign.getActiveCampaigns迁移）
   * 迁移原因：符合"Model层纯净度"架构原则（任务2.1）
   */
  static async getActiveCampaigns (options = {}) {
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
}

module.exports = AdminLotteryService
