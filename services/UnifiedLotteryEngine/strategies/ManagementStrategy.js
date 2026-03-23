/**
 * 管理策略（ManagementStrategy）- V4.1 完整持久化版本
 *
 * 业务场景：管理员使用的抽奖控制功能，提供强制中奖、强制不中奖、概率调整、用户专属队列等功能
 *
 * 核心功能：
 * - 强制中奖：管理员为指定用户强制指定中奖奖品（支持持久化存储）
 * - 强制不中奖：管理员强制用户N次不中奖（支持剩余次数递减）
 * - 概率调整：管理员临时调整用户中奖概率倍数
 * - 用户专属队列：管理员为用户预设抽奖结果队列
 * - 缓存管理：内存缓存（5分钟TTL）+ 数据库持久化双层架构
 * - 过期清理：自动清理过期设置（数据库+缓存同步）
 *
 * 🛡️ 权限系统：
 * - 基于UUID角色系统进行权限验证
 * - 使用getUserRoles()获取用户角色信息
 * - 验证用户状态（必须为active状态）
 * - 支持特定权限检查（resource + action）
 *
 * 业务流程：
 * 1. 管理员发起操作请求（forceWin/forceLose/adjustProbability等）
 * 2. 验证管理员权限（validateAdminPermission）
 * 3. 验证目标用户状态（User.findByPk + status检查）
 * 4. 创建设置记录（LotteryManagementSetting.create + 数据库持久化）
 * 5. 更新缓存（内存缓存 + 5分钟TTL）
 * 6. 返回操作结果
 *
 * 最后更新：2025年11月08日（V4.1完整持久化版本）
 */

const BeijingTimeHelper = require('../../../utils/timeHelper')
const { User, LotteryManagementSetting, LotteryPrize } = require('../../../models')
const { getUserRoles } = require('../../../middleware/auth')
const { Op } = require('sequelize')

/**
 * 管理策略类
 * 职责：提供管理员抽奖控制功能，包括强制中奖、强制不中奖、概率调整、用户专属队列等操作
 * 设计模式：策略模式 - 管理员专用的抽奖策略
 * 架构模式：双层架构（内存缓存 + 数据库持久化）
 */
class ManagementStrategy {
  /**
   * 构造函数 - 初始化管理策略实例
   *
   * 业务场景：创建管理策略实例，初始化日志器和缓存系统
   *
   * ⚠️ 2026-01-30 定时任务统一管理改进：
   * - 原有的 startCacheCleanup() 中的 setInterval 已被移除
   * - 缓存清理现在由 ScheduledTasks.scheduleLotteryEngineCacheCleanup() 统一管理
   * - 详见 scripts/maintenance/scheduled_tasks.js (Task 27)
   *
   * @example
   * const strategy = new ManagementStrategy()
   * // 创建实例后，可以使用forceWin、forceLose、adjustProbability等方法
   */
  constructor() {
    this.logger = require('../../../utils/logger').logger

    // 🔄 内存缓存系统（5分钟TTL）
    this.cache = new Map()
    this.cacheTTL = 5 * 60 * 1000 // 5分钟

    /*
     * 2026-01-30: setInterval 已移除
     * 缓存清理现在由 ScheduledTasks (Task 27) 统一调度
     * 如需手动清理，请调用 cleanupMemoryCache() 方法
     */
  }

  /**
   * 管理员强制中奖 - V4.1完整持久化版本
   *
   * 业务场景：管理员为指定用户强制指定中奖奖品，用于测试、补偿或特殊活动
   *
   * 业务流程：
   * 1. 验证管理员权限（validateAdminPermission）
   * 2. 验证目标用户存在且状态为active
   * 3. 创建数据库记录（LotteryManagementSetting）
   * 4. 更新内存缓存
   * 5. 记录操作日志
   * 6. 返回操作结果
   *
   * 🛡️ 权限要求：
   * - 管理员必须通过UUID角色系统验证
   * - 管理员状态必须为active
   * - 目标用户必须存在且状态为active
   *
   * @param {number} adminId - 管理员用户ID（执行操作的管理员）
   * @param {number} targetUserId - 目标用户ID（要强制中奖的用户）
   * @param {number} prizeId - 奖品ID（要强制中奖的奖品）
   * @param {string} [reason='管理员操作'] - 操作原因（可选，默认为'管理员操作'）
   * @param {Date|null} [expiresAt=null] - 过期时间（可选，默认为null表示永不过期）
   * @param {Object} [options={}] - 可选配置
   * @param {Object} [options.transaction] - Sequelize事务对象（由外部事务边界传入）
   * @returns {Promise<Object>} 操作结果对象
   * @returns {boolean} return.success - 操作是否成功
   * @returns {string} return.setting_id - 设置记录ID（lottery_management_setting_id）
   * @returns {string} return.result - 操作结果标识（'force_win'）
   * @returns {number} return.lottery_prize_id - 奖品ID
   * @returns {number} return.user_id - 目标用户ID
   * @returns {number} return.admin_id - 管理员ID
   * @returns {string} return.reason - 操作原因
   * @returns {string} return.timestamp - 操作时间戳（北京时间GMT+8格式）
   *
   * @throws {Error} 当管理员权限验证失败时抛出错误
   * @throws {Error} 当目标用户不存在或已停用时抛出错误
   *
   * @example
   * const strategy = new ManagementStrategy()
   * const result = await strategy.forceWin(10001, 20001, 30001, '测试补偿', null, { transaction })
   * // 返回：{ success: true, setting_id: 'setting_...', result: 'force_win', lottery_prize_id: 30001, user_id: 20001, admin_id: 10001, reason: '测试补偿', timestamp: '2025-11-08 12:00:00' }
   */
  async forceWin(
    adminId,
    targetUserId,
    prizeId,
    reason = '管理员操作',
    expiresAt = null,
    options = {}
  ) {
    try {
      // 🛡️ 验证管理员权限
      const adminValidation = await this.validateAdminPermission(adminId)
      if (!adminValidation.valid) {
        this.logError('管理员权限验证失败', {
          adminId,
          reason: adminValidation.reason
        })
        throw new Error(`管理员权限验证失败: ${adminValidation.reason}`)
      }

      // 验证目标用户
      const targetUser = await User.findByPk(targetUserId)
      if (!targetUser || targetUser.status !== 'active') {
        throw new Error('目标用户不存在或已停用')
      }

      // 🎁 查询奖品信息（获取prize_name用于记录显示）
      const prize = await LotteryPrize.findByPk(prizeId)
      const prizeName = prize ? prize.prize_name : null

      // 💾 创建数据库记录（传入事务，确保与外部事务一致）
      const createOptions = {}
      if (options.transaction) createOptions.transaction = options.transaction

      const setting = await LotteryManagementSetting.create(
        {
          user_id: targetUserId,
          setting_type: 'force_win',
          lottery_campaign_id: options.lottery_campaign_id || null,
          setting_data: {
            lottery_prize_id: prizeId,
            prize_name: prizeName,
            reason
          },
          expires_at: expiresAt,
          status: 'active',
          created_by: adminId
        },
        createOptions
      )

      // 🔄 更新内存缓存
      const cacheKey = `user_${targetUserId}_force_win`
      this.cache.set(cacheKey, {
        data: setting,
        timestamp: Date.now()
      })

      this.logger.info('管理员强制中奖（持久化）', {
        lottery_management_setting_id: setting.lottery_management_setting_id,
        adminId,
        targetUserId,
        prizeId,
        reason,
        expires_at: expiresAt,
        timestamp: BeijingTimeHelper.now()
      })

      return {
        success: true,
        setting_id: setting.lottery_management_setting_id,
        result: 'force_win',
        lottery_prize_id: prizeId,
        user_id: targetUserId,
        admin_id: adminId,
        reason,
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      this.logError('管理员强制中奖失败', { adminId, targetUserId, prizeId, error: error.message })
      throw error
    }
  }

  /**
   * 管理员强制不中奖 - V4.1完整持久化版本
   *
   * 业务场景：管理员强制用户N次不中奖，用于测试、防刷或特殊活动
   *
   * 业务流程：
   * 1. 验证管理员权限（validateAdminPermission）
   * 2. 创建数据库记录（LotteryManagementSetting），记录总次数和剩余次数
   * 3. 更新内存缓存
   * 4. 记录操作日志
   * 5. 返回操作结果
   *
   * 🛡️ 权限要求：
   * - 管理员必须通过UUID角色系统验证
   * - 管理员状态必须为active
   *
   * 注意：每次抽奖时会递减剩余次数，剩余次数为0时自动标记为used状态
   *
   * @param {number} adminId - 管理员用户ID（执行操作的管理员）
   * @param {number} targetUserId - 目标用户ID（要强制不中奖的用户）
   * @param {number} [count=1] - 不中奖次数（可选，默认为1次）
   * @param {string} [reason='管理员操作'] - 操作原因（可选，默认为'管理员操作'）
   * @param {Date|null} [expiresAt=null] - 过期时间（可选，默认为null表示永不过期）
   * @param {Object} [options={}] - 可选配置
   * @param {Object} [options.transaction] - Sequelize事务对象（由外部事务边界传入）
   * @returns {Promise<Object>} 操作结果对象
   * @returns {boolean} return.success - 操作是否成功
   * @returns {string} return.setting_id - 设置记录ID（lottery_management_setting_id）
   * @returns {string} return.result - 操作结果标识（'force_lose'）
   * @returns {number} return.user_id - 目标用户ID
   * @returns {number} return.admin_id - 管理员ID
   * @returns {number} return.count - 总次数
   * @returns {number} return.remaining - 剩余次数
   * @returns {string} return.reason - 操作原因
   * @returns {string} return.timestamp - 操作时间戳（北京时间GMT+8格式）
   *
   * @throws {Error} 当管理员权限验证失败时抛出错误
   *
   * @example
   * const strategy = new ManagementStrategy()
   * const result = await strategy.forceLose(10001, 20001, 5, '防刷保护', null, { transaction })
   * // 返回：{ success: true, setting_id: 'setting_...', result: 'force_lose', user_id: 20001, admin_id: 10001, count: 5, remaining: 5, reason: '防刷保护', timestamp: '2025-11-08 12:00:00' }
   */
  async forceLose(
    adminId,
    targetUserId,
    count = 1,
    reason = '管理员操作',
    expiresAt = null,
    options = {}
  ) {
    try {
      // 🛡️ 验证管理员权限
      const adminValidation = await this.validateAdminPermission(adminId)
      if (!adminValidation.valid) {
        throw new Error(`管理员权限验证失败: ${adminValidation.reason}`)
      }

      // 💾 创建数据库记录（传入事务，确保与外部事务一致）
      const createOptions = {}
      if (options.transaction) createOptions.transaction = options.transaction

      const setting = await LotteryManagementSetting.create(
        {
          user_id: targetUserId,
          setting_type: 'force_lose',
          lottery_campaign_id: options.lottery_campaign_id || null,
          setting_data: {
            count,
            remaining: count,
            reason
          },
          expires_at: expiresAt,
          status: 'active',
          created_by: adminId
        },
        createOptions
      )

      // 🔄 更新内存缓存
      const cacheKey = `user_${targetUserId}_force_lose`
      this.cache.set(cacheKey, {
        data: setting,
        timestamp: Date.now()
      })

      this.logger.info('管理员强制不中奖（持久化）', {
        lottery_management_setting_id: setting.lottery_management_setting_id,
        adminId,
        targetUserId,
        count,
        remaining: count,
        reason,
        expires_at: expiresAt,
        timestamp: BeijingTimeHelper.now()
      })

      return {
        success: true,
        setting_id: setting.lottery_management_setting_id,
        result: 'force_lose',
        user_id: targetUserId,
        admin_id: adminId,
        count,
        remaining: count,
        reason,
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      this.logError('管理员强制不中奖失败', { adminId, targetUserId, count, error: error.message })
      throw error
    }
  }

  /**
   * 调整用户中奖概率 - V4.1新增方法
   *
   * 业务场景：管理员临时调整用户的中奖概率倍数，用于用户挽留、活跃度激励
   *
   * 业务流程：
   * 1. 验证管理员权限（validateAdminPermission）
   * 2. 验证概率倍数合法性（0.1-10倍）
   * 3. 创建数据库记录（LotteryManagementSetting）
   * 4. 更新内存缓存
   * 5. 记录操作日志
   * 6. 返回操作结果
   *
   * 🛡️ 权限要求：
   * - 管理员必须通过UUID角色系统验证
   * - 管理员状态必须为active
   *
   * 注意：概率倍数范围为0.1-10倍，超出范围会抛出错误
   *
   * @param {number} adminId - 管理员用户ID（执行操作的管理员）
   * @param {number} targetUserId - 目标用户ID（要调整概率的用户）
   * @param {number} multiplier - 概率倍数（0.1-10倍，1.0表示正常概率）
   * @param {string} [reason='管理员操作'] - 操作原因（可选，默认为'管理员操作'）
   * @param {Date|null} [expiresAt=null] - 过期时间（可选，默认为null表示永不过期）
   * @param {Object} [options={}] - 可选配置
   * @param {Object} [options.transaction] - Sequelize事务对象（由外部事务边界传入）
   * @returns {Promise<Object>} 操作结果对象
   * @returns {boolean} return.success - 操作是否成功
   * @returns {string} return.setting_id - 设置记录ID（lottery_management_setting_id）
   * @returns {string} return.result - 操作结果标识（'probability_adjust'）
   * @returns {number} return.user_id - 目标用户ID
   * @returns {number} return.admin_id - 管理员ID
   * @returns {number} return.multiplier - 概率倍数
   * @returns {string} return.reason - 操作原因
   * @returns {string} return.timestamp - 操作时间戳（北京时间GMT+8格式）
   *
   * @throws {Error} 当管理员权限验证失败时抛出错误
   * @throws {Error} 当概率倍数超出范围时抛出错误
   *
   * @example
   * const strategy = new ManagementStrategy()
   * // 提升用户中奖概率2倍
   * const result = await strategy.adjustProbability(10001, 20001, 2.0, '用户挽留', null, { transaction })
   * // 返回：{ success: true, setting_id: 'setting_...', result: 'probability_adjust', user_id: 20001, admin_id: 10001, multiplier: 2.0, reason: '用户挽留', timestamp: '2025-11-08 12:00:00' }
   */
  async adjustProbability(
    adminId,
    targetUserId,
    multiplier,
    reason = '管理员操作',
    expiresAt = null,
    options = {}
  ) {
    try {
      // 🛡️ 验证管理员权限
      const adminValidation = await this.validateAdminPermission(adminId)
      if (!adminValidation.valid) {
        throw new Error(`管理员权限验证失败: ${adminValidation.reason}`)
      }

      // 验证概率倍数合法性（0.1-10倍）
      if (multiplier < 0.1 || multiplier > 10) {
        throw new Error('概率倍数必须在0.1-10倍之间')
      }

      // 💾 创建数据库记录（传入事务，确保与外部事务一致）
      const createOptions = {}
      if (options.transaction) createOptions.transaction = options.transaction

      const setting = await LotteryManagementSetting.create(
        {
          user_id: targetUserId,
          setting_type: 'probability_adjust',
          setting_data: {
            multiplier,
            reason
          },
          expires_at: expiresAt,
          status: 'active',
          created_by: adminId
        },
        createOptions
      )

      // 🔄 更新内存缓存
      const cacheKey = `user_${targetUserId}_probability_adjust`
      this.cache.set(cacheKey, {
        data: setting,
        timestamp: Date.now()
      })

      this.logger.info('调整用户中奖概率（持久化）', {
        lottery_management_setting_id: setting.lottery_management_setting_id,
        adminId,
        targetUserId,
        multiplier,
        reason,
        expires_at: expiresAt,
        timestamp: BeijingTimeHelper.now()
      })

      return {
        success: true,
        setting_id: setting.lottery_management_setting_id,
        result: 'probability_adjust',
        user_id: targetUserId,
        admin_id: adminId,
        multiplier,
        reason,
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      this.logError('调整用户中奖概率失败', {
        adminId,
        targetUserId,
        multiplier,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 设置用户专属抽奖队列 - V4.1新增方法
   *
   * 业务场景：管理员为用户预设抽奖结果队列，用于精准运营、VIP体验优化
   *
   * 业务流程：
   * 1. 验证管理员权限（validateAdminPermission）
   * 2. 验证队列配置合法性
   * 3. 创建数据库记录（LotteryManagementSetting）
   * 4. 更新内存缓存
   * 5. 记录操作日志
   * 6. 返回操作结果
   *
   * 🛡️ 权限要求：
   * - 管理员必须通过UUID角色系统验证
   * - 管理员状态必须为active
   *
   * @param {number} adminId - 管理员用户ID（执行操作的管理员）
   * @param {number} targetUserId - 目标用户ID（要设置队列的用户）
   * @param {Object} queueConfig - 队列配置对象
   * @param {string} queueConfig.queue_type - 队列类型（如：'vip_experience', 'precise_operation'）
   * @param {number} queueConfig.priority_level - 优先级别（1-10，数字越大优先级越高）
   * @param {Array<number>} queueConfig.prize_queue - 奖品ID队列（用户抽奖时按顺序返回）
   * @param {string} [reason='管理员操作'] - 操作原因（可选，默认为'管理员操作'）
   * @param {Date|null} [expiresAt=null] - 过期时间（可选，默认为null表示永不过期）
   * @param {Object} [options={}] - 可选配置
   * @param {Object} [options.transaction] - Sequelize事务对象（由外部事务边界传入）
   * @returns {Promise<Object>} 操作结果对象
   * @returns {boolean} return.success - 操作是否成功
   * @returns {string} return.setting_id - 设置记录ID（lottery_management_setting_id）
   * @returns {string} return.result - 操作结果标识（'user_queue'）
   * @returns {number} return.user_id - 目标用户ID
   * @returns {number} return.admin_id - 管理员ID
   * @returns {Object} return.queue_config - 队列配置
   * @returns {string} return.reason - 操作原因
   * @returns {string} return.timestamp - 操作时间戳（北京时间GMT+8格式）
   *
   * @throws {Error} 当管理员权限验证失败时抛出错误
   * @throws {Error} 当队列配置不合法时抛出错误
   *
   * @example
   * const strategy = new ManagementStrategy()
   * const result = await strategy.setUserQueue(10001, 20001, {
   *   queue_type: 'vip_experience',
   *   priority_level: 8,
   *   prize_queue: [101, 102, 103]
   * }, 'VIP用户体验优化', null, { transaction })
   * // 返回：{ success: true, setting_id: 'setting_...', result: 'user_queue', user_id: 20001, admin_id: 10001, queue_config: {...}, reason: 'VIP用户体验优化', timestamp: '2025-11-08 12:00:00' }
   */
  async setUserQueue(
    adminId,
    targetUserId,
    queueConfig,
    reason = '管理员操作',
    expiresAt = null,
    options = {}
  ) {
    try {
      // 🛡️ 验证管理员权限
      const adminValidation = await this.validateAdminPermission(adminId)
      if (!adminValidation.valid) {
        throw new Error(`管理员权限验证失败: ${adminValidation.reason}`)
      }

      // 验证队列配置合法性
      if (
        !queueConfig.queue_type ||
        !queueConfig.priority_level ||
        !Array.isArray(queueConfig.prize_queue)
      ) {
        throw new Error('队列配置不完整：必须包含queue_type、priority_level、prize_queue')
      }

      if (queueConfig.priority_level < 1 || queueConfig.priority_level > 10) {
        throw new Error('优先级别必须在1-10之间')
      }

      if (queueConfig.prize_queue.length === 0) {
        throw new Error('奖品队列不能为空')
      }

      // 💾 创建数据库记录（传入事务，确保与外部事务一致）
      const createOptions = {}
      if (options.transaction) createOptions.transaction = options.transaction

      const setting = await LotteryManagementSetting.create(
        {
          user_id: targetUserId,
          setting_type: 'user_queue',
          setting_data: {
            queue_type: queueConfig.queue_type,
            priority_level: queueConfig.priority_level,
            prize_queue: queueConfig.prize_queue,
            current_index: 0,
            reason
          },
          expires_at: expiresAt,
          status: 'active',
          created_by: adminId
        },
        createOptions
      )

      // 🔄 更新内存缓存
      const cacheKey = `user_${targetUserId}_user_queue`
      this.cache.set(cacheKey, {
        data: setting,
        timestamp: Date.now()
      })

      this.logger.info('设置用户专属抽奖队列（持久化）', {
        lottery_management_setting_id: setting.lottery_management_setting_id,
        adminId,
        targetUserId,
        queue_config: queueConfig,
        reason,
        expires_at: expiresAt,
        timestamp: BeijingTimeHelper.now()
      })

      return {
        success: true,
        setting_id: setting.lottery_management_setting_id,
        result: 'user_queue',
        user_id: targetUserId,
        admin_id: adminId,
        queue_config: queueConfig,
        reason,
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      this.logError('设置用户专属抽奖队列失败', {
        adminId,
        targetUserId,
        queueConfig,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 获取用户管理设置状态 - V4.1新增方法
   *
   * 业务场景：查询用户当前生效的所有管理设置，用于状态查询和调试
   *
   * 业务流程：
   * 1. 查询内存缓存（优先）
   * 2. 如果缓存未命中，查询数据库（active状态 + 未过期）
   * 3. 更新内存缓存
   * 4. 返回设置列表
   *
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>} 用户管理设置状态对象
   * @returns {Object|null} return.force_win - 强制中奖设置（如果存在）
   * @returns {Object|null} return.force_lose - 强制不中奖设置（如果存在）
   * @returns {Object|null} return.probability_adjust - 概率调整设置（如果存在）
   * @returns {Object|null} return.user_queue - 用户专属队列设置（如果存在）
   *
   * @example
   * const strategy = new ManagementStrategy()
   * const status = await strategy.getUserManagementStatus(20001)
   * // 返回：{ force_win: {...}, force_lose: null, probability_adjust: {...}, user_queue: null }
   */
  async getUserManagementStatus(userId) {
    try {
      const status = {
        force_win: null,
        force_lose: null,
        probability_adjust: null,
        user_queue: null
      }

      const settingTypes = ['force_win', 'force_lose', 'probability_adjust', 'user_queue']

      for (const settingType of settingTypes) {
        const cacheKey = `user_${userId}_${settingType}`
        const cached = this.cache.get(cacheKey)

        // 🔄 检查缓存有效性
        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
          status[settingType] = cached.data
          continue
        }

        // 💾 查询数据库
        // eslint-disable-next-line no-await-in-loop -- 配置项需要逐个查询和缓存
        const setting = await LotteryManagementSetting.findOne({
          where: {
            user_id: userId,
            setting_type: settingType,
            status: 'active'
          },
          order: [['created_at', 'DESC']]
        })

        if (setting && setting.isActive()) {
          status[settingType] = setting
          // 更新缓存
          this.cache.set(cacheKey, {
            data: setting,
            timestamp: Date.now()
          })
        }
      }

      return status
    } catch (error) {
      this.logError('获取用户管理设置状态失败', { userId, error: error.message })
      throw error
    }
  }

  /**
   * 清除用户管理设置 - V4.1新增方法
   *
   * 业务场景：管理员手动清除用户的管理设置，用于取消操作或纠正错误
   *
   * 业务流程：
   * 1. 验证管理员权限（validateAdminPermission）
   * 2. 查询用户生效的设置记录
   * 3. 批量更新状态为cancelled
   * 4. 清除内存缓存
   * 5. 记录操作日志
   * 6. 返回操作结果
   *
   * 🛡️ 权限要求：
   * - 管理员必须通过UUID角色系统验证
   * - 管理员状态必须为active
   *
   * @param {number} adminId - 管理员用户ID（执行操作的管理员）
   * @param {number} targetUserId - 目标用户ID（要清除设置的用户）
   * @param {string|null} [settingType=null] - 设置类型（可选，默认为null表示清除所有类型）
   * @returns {Promise<Object>} 操作结果对象
   * @returns {boolean} return.success - 操作是否成功
   * @returns {number} return.cleared_count - 清除的设置数量
   * @returns {string} return.timestamp - 操作时间戳（北京时间GMT+8格式）
   *
   * @throws {Error} 当管理员权限验证失败时抛出错误
   *
   * @example
   * const strategy = new ManagementStrategy()
   * // 清除用户所有管理设置
   * const result1 = await strategy.clearUserSettings(10001, 20001)
   * // 返回：{ success: true, cleared_count: 3, timestamp: '2025-11-08 12:00:00' }
   *
   * // 仅清除用户的强制中奖设置
   * const result2 = await strategy.clearUserSettings(10001, 20001, 'force_win')
   * // 返回：{ success: true, cleared_count: 1, timestamp: '2025-11-08 12:00:00' }
   */
  async clearUserSettings(adminId, targetUserId, settingType = null) {
    try {
      // 🛡️ 验证管理员权限
      const adminValidation = await this.validateAdminPermission(adminId)
      if (!adminValidation.valid) {
        throw new Error(`管理员权限验证失败: ${adminValidation.reason}`)
      }

      // 💾 构建查询条件
      const whereCondition = {
        user_id: targetUserId,
        status: 'active'
      }

      if (settingType) {
        whereCondition.setting_type = settingType
      }

      // 批量更新状态为cancelled
      const [updatedCount] = await LotteryManagementSetting.update(
        { status: 'cancelled' },
        { where: whereCondition }
      )

      // 🔄 清除内存缓存
      const settingTypes = settingType
        ? [settingType]
        : ['force_win', 'force_lose', 'probability_adjust', 'user_queue']
      settingTypes.forEach(type => {
        const cacheKey = `user_${targetUserId}_${type}`
        this.cache.delete(cacheKey)
      })

      this.logger.info('清除用户管理设置', {
        adminId,
        targetUserId,
        settingType: settingType || '所有类型',
        cleared_count: updatedCount,
        timestamp: BeijingTimeHelper.now()
      })

      return {
        success: true,
        cleared_count: updatedCount,
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      this.logError('清除用户管理设置失败', {
        adminId,
        targetUserId,
        settingType,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 清理过期设置 - V4.1新增方法（定时任务调用）
   *
   * 业务场景：定时清理数据库中的过期设置，释放存储空间和提升查询性能
   *
   * 业务流程：
   * 1. 查询所有过期的active状态设置（expires_at < 当前时间）
   * 2. 批量更新状态为expired
   * 3. 清除相关的内存缓存
   * 4. 记录清理日志
   * 5. 返回清理结果
   *
   * 注意：此方法通常由定时任务（scheduledTasks）自动调用，每小时执行一次
   *
   * @returns {Promise<Object>} 清理结果对象
   * @returns {number} return.cleaned_count - 清理的设置数量
   * @returns {string} return.timestamp - 清理时间戳（北京时间GMT+8格式）
   *
   * @example
   * const strategy = new ManagementStrategy()
   * const result = await strategy.cleanupExpiredSettings()
   * // 返回：{ cleaned_count: 15, timestamp: '2025-11-08 12:00:00' }
   */
  async cleanupExpiredSettings() {
    try {
      // 💾 查询并更新过期设置
      const [updatedCount] = await LotteryManagementSetting.update(
        { status: 'expired' },
        {
          where: {
            status: 'active',
            expires_at: {
              [Op.lt]: new Date()
            }
          }
        }
      )

      // 🔄 清除所有缓存（简单粗暴，确保一致性）
      this.cache.clear()

      this.logger.info('清理过期设置', {
        cleaned_count: updatedCount,
        timestamp: BeijingTimeHelper.now()
      })

      return {
        cleaned_count: updatedCount,
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      this.logError('清理过期设置失败', { error: error.message })
      throw error
    }
  }

  /**
   * 清理内存缓存 - 供 ScheduledTasks 调用
   *
   * 业务场景：清理过期的内存缓存条目，由 ScheduledTasks (Task 27) 定时调度
   *
   * 清理逻辑：
   * - 遍历所有缓存条目
   * - 删除超过 TTL (5分钟) 的条目
   * - 返回清理的条目数量
   *
   * @returns {number} 清理的缓存条目数量
   *
   * @example
   * const strategy = new ManagementStrategy()
   * const cleanedCount = strategy.cleanupMemoryCache()
   * // 返回：5（清理了5个过期缓存条目）
   */
  cleanupMemoryCache() {
    const now = Date.now()
    let cleanedCount = 0

    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheTTL) {
        this.cache.delete(key)
        cleanedCount++
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug('ManagementStrategy 缓存清理完成', {
        cleaned_count: cleanedCount,
        remaining_count: this.cache.size,
        timestamp: BeijingTimeHelper.now()
      })
    }

    return cleanedCount
  }

  /**
   * 验证管理员信息 - 使用UUID角色系统
   *
   * 业务场景：验证管理员信息对象是否有效，检查管理员身份和状态
   *
   * 验证流程：
   * 1. 检查adminInfo对象和user_id字段是否存在
   * 2. 获取用户角色信息（getUserRoles）
   * 3. 验证是否为管理员（role_level >= 100）
   * 4. 验证用户状态（必须为active）
   *
   * @param {Object} adminInfo - 管理员信息对象
   * @param {number} adminInfo.user_id - 管理员用户ID
   * @returns {Promise<Object>} 验证结果对象
   * @returns {boolean} return.valid - 验证是否通过
   * @returns {string} return.reason - 验证失败原因（当valid为false时）
   *   - 'ADMIN_INFO_MISSING': adminInfo或user_id缺失
   *   - 'NOT_ADMIN': 用户不是管理员
   *   - 'ADMIN_INACTIVE': 管理员状态不是active
   *   - 'VALIDATION_ERROR': 验证过程发生错误
   * @returns {Object} return.admin - 管理员用户对象（当valid为true时）
   * @returns {Array} return.roles - 用户角色数组（当valid为true时）
   * @returns {number} return.role_level - 角色级别（当valid为true时）
   *
   * @example
   * const strategy = new ManagementStrategy()
   * const result = await strategy.validateAdminInfo({ user_id: 10001 })
   * if (result.valid) {
   *   logger.info('管理员验证通过', result.admin)
   * } else {
   *   logger.info('管理员验证失败', result.reason)
   * }
   */
  async validateAdminInfo(adminInfo) {
    try {
      if (!adminInfo || !adminInfo.user_id) {
        return { valid: false, reason: 'ADMIN_INFO_MISSING' }
      }

      // 🛡️ 获取用户角色信息
      const userRoles = await getUserRoles(adminInfo.user_id)

      // 管理员判断：role_level >= 100
      if (userRoles.role_level < 100) {
        return { valid: false, reason: 'NOT_ADMIN' }
      }

      // 验证用户状态
      const admin = await User.findByPk(adminInfo.user_id)
      if (!admin || admin.status !== 'active') {
        return { valid: false, reason: 'ADMIN_INACTIVE' }
      }

      return {
        valid: true,
        admin,
        roles: userRoles.roles,
        role_level: userRoles.role_level
      }
    } catch (error) {
      this.logError('验证管理员信息失败', { adminInfo, error: error.message })
      return { valid: false, reason: 'VALIDATION_ERROR' }
    }
  }

  /**
   * 验证管理员权限 - 使用UUID角色系统
   *
   * 业务场景：验证管理员是否有权限执行操作，支持基础权限和特定权限检查
   *
   * 验证流程：
   * 1. 获取用户角色信息（getUserRoles）
   * 2. 验证是否为管理员（isAdmin）
   * 3. 验证用户状态（必须为active）
   * 4. 如果指定了requiredPermission，进行特定权限检查
   *
   * @param {number} adminId - 管理员用户ID
   * @param {Object|null} [requiredPermission=null] - 特定权限要求（可选，默认为null）
   * @param {string} requiredPermission.resource - 资源名称（如'lottery'）
   * @param {string} requiredPermission.action - 操作名称（如'manage'）
   * @returns {Promise<Object>} 验证结果对象
   * @returns {boolean} return.valid - 验证是否通过
   * @returns {string} return.reason - 验证失败原因（当valid为false时）
   *   - 'NOT_ADMIN': 用户不是管理员
   *   - 'ADMIN_INACTIVE': 管理员状态不是active
   *   - 'PERMISSION_DENIED': 缺少特定权限
   *   - 'VALIDATION_ERROR': 验证过程发生错误
   * @returns {Object} return.admin - 管理员用户对象（当valid为true时）
   * @returns {Array} return.roles - 用户角色数组（当valid为true时）
   * @returns {number} return.adminLevel - 管理员级别（角色中的最高级别，当valid为true时）
   *
   * @example
   * // 基础权限验证
   * const result1 = await strategy.validateAdminPermission(10001)
   * // 返回：{ valid: true, admin: {...}, roles: [...], adminLevel: 1 }
   *
   * // 特定权限验证
   * const result2 = await strategy.validateAdminPermission(10001, { resource: 'lottery', action: 'manage' })
   * // 返回：{ valid: true, admin: {...}, roles: [...], adminLevel: 1 } 或 { valid: false, reason: 'PERMISSION_DENIED' }
   */
  async validateAdminPermission(adminId, requiredPermission = null) {
    try {
      // 🛡️ 获取用户角色信息
      const userRoles = await getUserRoles(adminId)

      // 管理员判断：role_level >= 100
      if (userRoles.role_level < 100) {
        return { valid: false, reason: 'NOT_ADMIN' }
      }

      // 验证用户状态
      const admin = await User.findByPk(adminId)
      if (!admin || admin.status !== 'active') {
        return { valid: false, reason: 'ADMIN_INACTIVE' }
      }

      // 如果需要特定权限，进行权限检查
      if (requiredPermission) {
        const hasPermission = await admin.hasPermission(
          requiredPermission.resource,
          requiredPermission.action
        )
        if (!hasPermission) {
          return { valid: false, reason: 'PERMISSION_DENIED' }
        }
      }

      return {
        valid: true,
        admin,
        roles: userRoles.roles,
        adminLevel: Math.max(...userRoles.roles.map(r => r.level))
      }
    } catch (error) {
      this.logError('验证管理员权限失败', { adminId, error: error.message })
      return { valid: false, reason: 'VALIDATION_ERROR' }
    }
  }

  /**
   * 检查管理员权限 - 使用UUID角色系统（简化版）
   *
   * 业务场景：快速检查用户是否为管理员，不返回详细信息，只返回布尔值
   *
   * 验证流程：
   * 1. 获取用户角色信息（getUserRoles）
   * 2. 验证是否为管理员（role_level >= 100）
   * 3. 验证用户状态（必须为active）
   *
   * 注意：此方法不进行特定权限检查，只检查基础管理员身份
   *
   * @param {number} adminId - 管理员用户ID
   * @returns {Promise<boolean>} 是否为管理员
   * @returns {boolean} true - 用户是管理员（role_level >= 100）且状态为active
   * @returns {boolean} false - 用户不是管理员、状态不是active或验证过程发生错误
   *
   * @example
   * const strategy = new ManagementStrategy()
   * const hasAdminAccess = await strategy.checkAdminPermission(10001)
   * if (hasAdminAccess) {
   *   logger.info('用户是管理员')
   * } else {
   *   logger.info('用户不是管理员')
   * }
   */
  async checkAdminPermission(adminId) {
    try {
      // 🛡️ 使用UUID角色系统进行权限验证
      const userRoles = await getUserRoles(adminId)

      // 管理员判断：role_level >= 100
      if (userRoles.role_level < 100) {
        return false
      }

      // 验证用户状态
      const admin = await User.findByPk(adminId)
      if (!admin || admin.status !== 'active') {
        return false
      }

      return true
    } catch (error) {
      this.logError('检查管理员权限失败', { adminId, error: error.message })
      return false
    }
  }

  /**
   * 获取管理员操作日志
   *
   * 业务场景：查询管理员的操作日志，用于审计和追溯管理员操作
   *
   * 业务流程：
   * 1. 验证管理员权限（checkAdminPermission）
   * 2. 查询操作日志（当前为占位实现，返回空数组）
   * 3. 返回日志列表和分页信息
   *
   * 注意：当前为占位实现，实际日志查询逻辑需要根据业务需求实现
   *
   * @param {number} adminId - 管理员用户ID（执行查询的管理员）
   * @param {Object} [filters={}] - 查询过滤器（可选，默认为空对象）
   * @param {number} [filters.page=1] - 页码（可选，默认为1）
   * @param {number} [filters.limit=20] - 每页数量（可选，默认为20）
   * @returns {Promise<Object>} 日志查询结果对象
   * @returns {Array} return.logs - 日志数组（当前为占位实现，返回空数组）
   * @returns {number} return.total - 日志总数（当前为占位实现，返回0）
   * @returns {number} return.page - 当前页码
   * @returns {number} return.limit - 每页数量
   *
   * @example
   * const strategy = new ManagementStrategy()
   * const result = await strategy.getOperationLogs(10001, { page: 1, limit: 20 })
   * // 返回：{ logs: [], total: 0, page: 1, limit: 20 }
   */
  async getOperationLogs(adminId, filters = {}) {
    try {
      // 验证管理员权限
      const hasAdminAccess = await this.checkAdminPermission(adminId)
      if (!hasAdminAccess) {
        throw new Error('管理员权限验证失败')
      }

      // 占位实现：实际日志查询逻辑需要根据业务需求实现
      return {
        logs: [],
        total: 0,
        page: filters.page || 1,
        limit: filters.limit || 20
      }
    } catch (error) {
      this.logError('获取管理员操作日志失败', { adminId, error: error.message })
      throw error
    }
  }

  /**
   * 批量操作：批量强制中奖
   *
   * 业务场景：管理员为多个用户批量设置强制中奖，用于批量补偿或批量测试
   *
   * 业务流程：
   * 1. 验证管理员权限（validateAdminPermission）一次
   * 2. 遍历用户列表，为每个用户调用forceWin方法
   * 3. 记录成功和失败的操作
   * 4. 返回批量操作结果
   *
   * 🛡️ 权限要求：
   * - 管理员必须通过UUID角色系统验证
   * - 管理员状态必须为active
   *
   * @param {number} adminId - 管理员用户ID（执行操作的管理员）
   * @param {Array<Object>} operations - 操作列表
   * @param {number} operations[].user_id - 目标用户ID
   * @param {number} operations[].lottery_prize_id - 奖品ID
   * @param {string} [operations[].reason='批量操作'] - 操作原因（可选）
   * @returns {Promise<Object>} 批量操作结果对象
   * @returns {Array} return.success - 成功的操作列表
   * @returns {Array} return.failed - 失败的操作列表
   * @returns {number} return.total - 总操作数量
   * @returns {number} return.success_count - 成功数量
   * @returns {number} return.failed_count - 失败数量
   *
   * @throws {Error} 当管理员权限验证失败时抛出错误
   *
   * @example
   * const strategy = new ManagementStrategy()
   * const result = await strategy.batchForceWin(10001, [
   *   { user_id: 20001, lottery_prize_id: 30001, reason: '补偿1' },
   *   { user_id: 20002, lottery_prize_id: 30002, reason: '补偿2' }
   * ])
   * // 返回：{ success: [{...}, {...}], failed: [], total: 2, success_count: 2, failed_count: 0 }
   */
  async batchForceWin(adminId, operations) {
    try {
      // 🛡️ 验证管理员权限（只验证一次）
      const adminValidation = await this.validateAdminPermission(adminId)
      if (!adminValidation.valid) {
        throw new Error(`管理员权限验证失败: ${adminValidation.reason}`)
      }

      const results = {
        success: [],
        failed: [],
        total: operations.length,
        success_count: 0,
        failed_count: 0
      }

      // 批量执行强制中奖操作
      for (const operation of operations) {
        try {
          // eslint-disable-next-line no-await-in-loop -- 批量强制中奖需要逐个执行，确保错误隔离
          const result = await this.forceWin(
            adminId,
            operation.user_id,
            operation.lottery_prize_id,
            operation.reason || '批量操作'
          )
          results.success.push(result)
          results.success_count++
        } catch (error) {
          results.failed.push({
            user_id: operation.user_id,
            lottery_prize_id: operation.lottery_prize_id,
            error: error.message
          })
          results.failed_count++
        }
      }

      this.logger.info('批量强制中奖完成', {
        adminId,
        total: results.total,
        success_count: results.success_count,
        failed_count: results.failed_count,
        timestamp: BeijingTimeHelper.now()
      })

      return results
    } catch (error) {
      this.logError('批量强制中奖失败', { adminId, error: error.message })
      throw error
    }
  }

  /**
   * 批量操作：批量强制不中奖
   *
   * 业务场景：管理员为多个用户批量设置强制不中奖，用于批量防刷或批量测试
   *
   * 业务流程：
   * 1. 验证管理员权限（validateAdminPermission）一次
   * 2. 遍历用户列表，为每个用户调用forceLose方法
   * 3. 记录成功和失败的操作
   * 4. 返回批量操作结果
   *
   * 🛡️ 权限要求：
   * - 管理员必须通过UUID角色系统验证
   * - 管理员状态必须为active
   *
   * @param {number} adminId - 管理员用户ID（执行操作的管理员）
   * @param {Array<Object>} operations - 操作列表
   * @param {number} operations[].user_id - 目标用户ID
   * @param {number} [operations[].count=1] - 不中奖次数（可选）
   * @param {string} [operations[].reason='批量操作'] - 操作原因（可选）
   * @returns {Promise<Object>} 批量操作结果对象
   * @returns {Array} return.success - 成功的操作列表
   * @returns {Array} return.failed - 失败的操作列表
   * @returns {number} return.total - 总操作数量
   * @returns {number} return.success_count - 成功数量
   * @returns {number} return.failed_count - 失败数量
   *
   * @throws {Error} 当管理员权限验证失败时抛出错误
   *
   * @example
   * const strategy = new ManagementStrategy()
   * const result = await strategy.batchForceLose(10001, [
   *   { user_id: 20001, count: 5, reason: '防刷1' },
   *   { user_id: 20002, count: 3, reason: '防刷2' }
   * ])
   * // 返回：{ success: [{...}, {...}], failed: [], total: 2, success_count: 2, failed_count: 0 }
   */
  async batchForceLose(adminId, operations) {
    try {
      // 🛡️ 验证管理员权限（只验证一次）
      const adminValidation = await this.validateAdminPermission(adminId)
      if (!adminValidation.valid) {
        throw new Error(`管理员权限验证失败: ${adminValidation.reason}`)
      }

      const results = {
        success: [],
        failed: [],
        total: operations.length,
        success_count: 0,
        failed_count: 0
      }

      // 批量执行强制不中奖操作
      for (const operation of operations) {
        try {
          // eslint-disable-next-line no-await-in-loop -- 批量强制不中奖需要逐个执行，确保错误隔离
          const result = await this.forceLose(
            adminId,
            operation.user_id,
            operation.count || 1,
            operation.reason || '批量操作'
          )
          results.success.push(result)
          results.success_count++
        } catch (error) {
          results.failed.push({
            user_id: operation.user_id,
            error: error.message
          })
          results.failed_count++
        }
      }

      this.logger.info('批量强制不中奖完成', {
        adminId,
        total: results.total,
        success_count: results.success_count,
        failed_count: results.failed_count,
        timestamp: BeijingTimeHelper.now()
      })

      return results
    } catch (error) {
      this.logError('批量强制不中奖失败', { adminId, error: error.message })
      throw error
    }
  }

  /**
   * 获取管理策略状态 - V4.1新增方法
   *
   * 业务场景：获取管理策略的当前运行状态，用于系统监控和状态展示
   *
   * 返回内容：
   * - 策略名称和版本
   * - 缓存状态（大小、TTL配置）
   * - 活跃设置统计（各类型数量）
   * - 运行时间信息
   *
   * @returns {Promise<Object>} 管理策略状态对象
   * @returns {string} return.strategy_name - 策略名称
   * @returns {string} return.version - 策略版本
   * @returns {string} return.status - 策略状态（active/inactive）
   * @returns {Object} return.cache_info - 缓存信息
   * @returns {number} return.cache_info.size - 缓存条目数
   * @returns {number} return.cache_info.ttl_ms - 缓存TTL（毫秒）
   * @returns {Object} return.active_settings - 活跃设置统计
   * @returns {number} return.active_settings.force_win - 强制中奖设置数
   * @returns {number} return.active_settings.force_lose - 强制不中奖设置数
   * @returns {number} return.active_settings.probability_adjust - 概率调整设置数
   * @returns {number} return.active_settings.user_queue - 用户队列设置数
   * @returns {number} return.active_settings.total - 总活跃设置数
   * @returns {string} return.timestamp - 状态获取时间戳（北京时间GMT+8格式）
   *
   * @example
   * const strategy = new ManagementStrategy()
   * const status = await strategy.getStatus()
   * // 返回：{
   * //   strategy_name: 'ManagementStrategy',
   * //   version: '4.1',
   * //   status: 'active',
   * //   cache_info: { size: 15, ttl_ms: 300000 },
   * //   active_settings: { force_win: 3, force_lose: 5, probability_adjust: 2, user_queue: 1, total: 11 },
   * //   timestamp: '2025-11-08 12:00:00'
   * // }
   */
  async getStatus() {
    try {
      // 统计各类型活跃设置数量
      const settingTypes = ['force_win', 'force_lose', 'probability_adjust', 'user_queue']
      const activeSettings = {
        force_win: 0,
        force_lose: 0,
        probability_adjust: 0,
        user_queue: 0,
        total: 0
      }

      // 从数据库统计各类型活跃设置
      for (const settingType of settingTypes) {
        try {
          // eslint-disable-next-line no-await-in-loop -- 统计各类型需要逐个查询
          const count = await LotteryManagementSetting.count({
            where: {
              setting_type: settingType,
              status: 'active',
              [Op.or]: [{ expires_at: null }, { expires_at: { [Op.gt]: new Date() } }]
            }
          })
          activeSettings[settingType] = count
          activeSettings.total += count
        } catch (countError) {
          this.logger.warn(`统计${settingType}设置数量失败`, { error: countError.message })
        }
      }

      const status = {
        strategy_name: 'ManagementStrategy',
        version: '4.1',
        status: 'active',
        cache_info: {
          size: this.cache.size,
          ttl_ms: this.cacheTTL
        },
        active_settings: activeSettings,
        timestamp: BeijingTimeHelper.now()
      }

      this.logger.debug('获取管理策略状态成功', {
        cache_size: status.cache_info.size,
        active_settings_total: status.active_settings.total
      })

      return status
    } catch (error) {
      this.logError('获取管理策略状态失败', { error: error.message })
      // 返回基础状态信息（即使部分统计失败）
      return {
        strategy_name: 'ManagementStrategy',
        version: '4.1',
        status: 'error',
        cache_info: {
          size: this.cache ? this.cache.size : 0,
          ttl_ms: this.cacheTTL || 300000
        },
        active_settings: {
          force_win: 0,
          force_lose: 0,
          probability_adjust: 0,
          user_queue: 0,
          total: 0
        },
        error: error.message,
        timestamp: BeijingTimeHelper.now()
      }
    }
  }

  /**
   * 日志错误记录
   * @private
   *
   * @param {string} message - 日志消息（中文描述）
   * @param {Object} data - 附加数据（用于排障定位）
   * @returns {void} 无返回值
   */
  logError(message, data) {
    this.logger.error(message, { ...data, timestamp: BeijingTimeHelper.now() })
  }
}

module.exports = ManagementStrategy
