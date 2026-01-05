const logger = require('../utils/logger').logger

/**
 * 聊天频率限制服务（Chat Rate Limit Service）
 *
 * 业务场景：
 * - 防止恶意用户短时间内发送大量消息（刷屏攻击）
 * - 防止并发创建会话导致重复会话
 * - 提供统一的频率限制管理
 *
 * 核心功能：
 * 1. 消息发送频率限制（用户/管理员）
 * 2. 创建会话频率限制
 * 3. 自动清理过期记录（防止内存泄漏）
 *
 * 设计原则：
 * - 简单实用：无需Redis等外部依赖，维护成本极低
 * - 性能优秀：内存操作，检查耗时<1ms
 * - 适合小型项目：服务重启后限制清零，但对小数据量项目完全够用
 *
 * 技术实现：
 * - 使用Map存储用户时间戳数组
 * - 滑动窗口算法
 * - 定期清理机制（每10分钟）
 *
 * 创建时间：2025年12月11日
 * 最后更新：2025年12月11日
 */

const businessConfig = require('../config/business.config')

/**
 * 聊天频率限制服务类
 *
 * @class ChatRateLimitService
 */
class ChatRateLimitService {
  /**
   * 消息时间戳存储（用户消息）
   * Map<user_id: number, timestamps: Array<number>>
   * @private
   */
  static userMessageTimestamps = new Map()

  /**
   * 消息时间戳存储（管理员消息）
   * Map<admin_id: number, timestamps: Array<number>>
   * @private
   */
  static adminMessageTimestamps = new Map()

  /**
   * 创建会话时间戳存储
   * Map<user_id: number, timestamps: Array<number>>
   * @private
   */
  static createSessionTimestamps = new Map()

  /**
   * 清理间隔时间（毫秒）
   * @private
   */
  static CLEANUP_INTERVAL = 10 * 60 * 1000 // 10分钟

  /**
   * 清理过期数据的时间阈值（毫秒）
   * @private
   */
  static CLEANUP_THRESHOLD = 10 * 60 * 1000 // 10分钟

  /**
   * 初始化定期清理机制
   *
   * 业务场景：
   * - 防止内存泄漏
   * - 定期清理10分钟前的时间戳记录
   *
   * @static
   * @returns {void} 无返回值，启动三个 setInterval 定期清理内存中的时间戳记录
   */
  static initCleanup () {
    // 清理用户消息时间戳
    setInterval(() => {
      const now = Date.now()

      ChatRateLimitService.userMessageTimestamps.forEach((timestamps, userId) => {
        const recentTimestamps = timestamps.filter(
          ts => now - ts < ChatRateLimitService.CLEANUP_THRESHOLD
        )

        if (recentTimestamps.length === 0) {
          ChatRateLimitService.userMessageTimestamps.delete(userId)
        } else {
          ChatRateLimitService.userMessageTimestamps.set(userId, recentTimestamps)
        }
      })

      logger.info(
        `✅ 消息频率限制器：已清理过期记录，当前监控用户数: ${ChatRateLimitService.userMessageTimestamps.size}`
      )
    }, ChatRateLimitService.CLEANUP_INTERVAL)

    // 清理管理员消息时间戳
    setInterval(() => {
      const now = Date.now()

      ChatRateLimitService.adminMessageTimestamps.forEach((timestamps, adminId) => {
        const recentTimestamps = timestamps.filter(
          ts => now - ts < ChatRateLimitService.CLEANUP_THRESHOLD
        )

        if (recentTimestamps.length === 0) {
          ChatRateLimitService.adminMessageTimestamps.delete(adminId)
        } else {
          ChatRateLimitService.adminMessageTimestamps.set(adminId, recentTimestamps)
        }
      })

      logger.info(
        `✅ 管理员消息频率限制器：已清理过期记录，当前监控管理员数: ${ChatRateLimitService.adminMessageTimestamps.size}`
      )
    }, ChatRateLimitService.CLEANUP_INTERVAL)

    // 清理创建会话时间戳
    setInterval(() => {
      const now = Date.now()

      ChatRateLimitService.createSessionTimestamps.forEach((timestamps, userId) => {
        const recentTimestamps = timestamps.filter(
          ts => now - ts < ChatRateLimitService.CLEANUP_THRESHOLD
        )

        if (recentTimestamps.length === 0) {
          ChatRateLimitService.createSessionTimestamps.delete(userId)
        } else {
          ChatRateLimitService.createSessionTimestamps.set(userId, recentTimestamps)
        }
      })

      logger.info(
        `✅ 创建会话频率限制器：已清理过期记录，当前监控用户数: ${ChatRateLimitService.createSessionTimestamps.size}`
      )
    }, ChatRateLimitService.CLEANUP_INTERVAL)

    logger.info('✅ ChatRateLimitService：定期清理机制已启动')
  }

  /**
   * 检查消息发送频率
   *
   * 业务场景：
   * - 用户发送聊天消息前检查频率
   * - 管理员发送聊天消息前检查频率
   * - 超过限制返回429错误
   *
   * 限制规则（从配置文件business.config.js读取）：
   * - 普通用户：1分钟内最多20条消息
   * - 管理员：1分钟内最多30条消息
   * - 超过限制返回{allowed: false}
   *
   * 算法逻辑：
   * 1. 根据用户角色等级读取对应的频率限制配置
   * 2. 获取该用户的历史时间戳数组
   * 3. 过滤出最近1分钟内的时间戳（滑动窗口算法）
   * 4. 检查是否超过配置的限制
   * 5. 如果未超限，记录本次发送时间并返回{allowed: true}
   * 6. 如果超限，返回{allowed: false, limit, current}
   *
   * @param {number} userId - 用户ID
   * @param {number} [role_level=0] - 用户角色等级（0=普通用户，>=100=管理员）
   * @returns {Object} 检查结果
   * @returns {boolean} return.allowed - 是否允许发送
   * @returns {number} return.limit - 频率限制
   * @returns {number} return.current - 当前已发送数量
   * @returns {string} return.userType - 用户类型（user/admin）
   *
   * @static
   * @example
   * const result = ChatRateLimitService.checkMessageRateLimit(123, 0)
   * if (!result.allowed) {
   *   return res.apiError('发送消息过于频繁', 'RATE_LIMIT_EXCEEDED', result, 429)
   * }
   */
  static checkMessageRateLimit (userId, role_level = 0) {
    const now = Date.now()

    // 根据角色等级读取频率限制配置
    const isAdmin = role_level >= 100
    const rateLimitConfig = isAdmin
      ? businessConfig.chat.rate_limit.admin
      : businessConfig.chat.rate_limit.user

    const MAX_MESSAGES_PER_MINUTE = rateLimitConfig.max_messages_per_minute
    const timeWindow = rateLimitConfig.time_window_seconds * 1000

    // 选择对应的时间戳存储
    const timestampMap = isAdmin
      ? ChatRateLimitService.adminMessageTimestamps
      : ChatRateLimitService.userMessageTimestamps

    // 获取该用户的历史时间戳数组（如果没有记录，初始化为空数组）
    const timestamps = timestampMap.get(userId) || []

    // 过滤出时间窗口内的时间戳（滑动窗口）
    const recentTimestamps = timestamps.filter(ts => now - ts < timeWindow)

    // 检查是否超过频率限制
    if (recentTimestamps.length >= MAX_MESSAGES_PER_MINUTE) {
      // 超过限制，返回详细信息
      return {
        allowed: false,
        limit: MAX_MESSAGES_PER_MINUTE,
        current: recentTimestamps.length,
        userType: isAdmin ? 'admin' : 'user'
      }
    }

    // 未超限，记录本次发送时间
    recentTimestamps.push(now)
    timestampMap.set(userId, recentTimestamps)

    // 返回允许发送
    return {
      allowed: true,
      limit: MAX_MESSAGES_PER_MINUTE,
      current: recentTimestamps.length,
      userType: isAdmin ? 'admin' : 'user'
    }
  }

  /**
   * 检查创建会话的频率
   *
   * 业务场景：
   * - 用户创建聊天会话前检查频率
   * - 防止并发创建导致重复会话
   * - 超过限制返回429错误
   *
   * 限制规则（从配置文件business.config.js读取）：
   * - 所有用户：每10秒内最多创建3次会话
   * - 超过限制返回{allowed: false}
   *
   * 算法逻辑：
   * 1. 从业务配置文件读取限制参数
   * 2. 获取该用户的历史时间戳数组
   * 3. 过滤出时间窗口内的时间戳（滑动窗口算法）
   * 4. 检查是否超过限制
   * 5. 如果未超限，记录本次创建时间并返回{allowed: true}
   * 6. 如果超限，返回{allowed: false, remainingTime}
   *
   * @param {number} userId - 用户ID
   * @returns {Object} 检查结果
   * @returns {boolean} return.allowed - 是否允许创建
   * @returns {number} return.limit - 频率限制
   * @returns {number} return.current - 当前已创建数量
   * @returns {number} return.remainingTime - 剩余等待时间（秒），仅在超限时返回
   *
   * @static
   * @example
   * const result = ChatRateLimitService.checkCreateSessionRateLimit(123)
   * if (!result.allowed) {
   *   return res.apiError(`创建会话过于频繁，请${result.remainingTime}秒后再试`, 'RATE_LIMIT_EXCEEDED', result, 429)
   * }
   */
  static checkCreateSessionRateLimit (userId) {
    const now = Date.now()

    // 从配置文件读取限制参数
    const TIME_WINDOW = businessConfig.chat.create_session_limit.time_window_seconds * 1000 // 转换为毫秒
    const MAX_CREATES = businessConfig.chat.create_session_limit.max_creates_per_window

    const timestamps = ChatRateLimitService.createSessionTimestamps.get(userId) || []
    const recentTimestamps = timestamps.filter(ts => now - ts < TIME_WINDOW)

    if (recentTimestamps.length >= MAX_CREATES) {
      const oldestTimestamp = Math.min(...recentTimestamps)
      const remainingTime = Math.ceil((oldestTimestamp + TIME_WINDOW - now) / 1000)

      return {
        allowed: false,
        limit: MAX_CREATES,
        current: recentTimestamps.length,
        remainingTime: Math.max(remainingTime, 1)
      }
    }

    recentTimestamps.push(now)
    ChatRateLimitService.createSessionTimestamps.set(userId, recentTimestamps)

    return {
      allowed: true,
      limit: MAX_CREATES,
      current: recentTimestamps.length,
      remainingTime: 0
    }
  }

  /**
   * WebSocket推送重试函数（带自动重试机制）
   *
   * 功能说明：
   * - WebSocket推送失败时自动重试，最多重试3次
   * - 使用指数退避算法：第1次重试延迟1秒，第2次2秒，第3次3秒
   * - 提升消息实时到达率，减少客服端需要刷新页面的情况
   *
   * @param {Object} ChatWebSocketService - WebSocket服务实例
   * @param {number|null} sessionAdminId - 会话分配的客服ID（null表示未分配）
   * @param {Object} messageData - 消息数据对象
   * @param {number} [maxRetries=3] - 最大重试次数
   * @returns {Promise<boolean>} 推送是否最终成功
   *
   * 重试策略：
   * - 第1次推送失败：等待1秒后重试
   * - 第2次推送失败：等待2秒后重试
   * - 第3次推送失败：等待3秒后重试
   * - 第4次推送失败：记录错误日志，放弃推送
   *
   * 业务说明：
   * - 即使推送最终失败，消息已保存到数据库，不影响业务连续性
   * - 客服可通过轮询API或刷新页面获取新消息（降级策略）
   *
   * @static
   */
  static async pushMessageWithRetry (
    ChatWebSocketService,
    sessionAdminId,
    messageData,
    maxRetries = 3
  ) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 根据会话状态选择推送策略
        let pushed
        if (sessionAdminId) {
          // 会话已分配客服，精准推送给该客服
          pushed = ChatWebSocketService.pushMessageToAdmin(sessionAdminId, messageData)
        } else {
          // 会话未分配，广播给所有在线客服
          const count = ChatWebSocketService.broadcastToAllAdmins(messageData)
          pushed = count > 0 // 如果有客服在线，认为推送成功
        }

        if (pushed) {
          // 推送成功
          if (attempt > 1) {
            logger.info(`✅ WebSocket推送成功 (第${attempt}次尝试)`)
          }
          return true
        } else {
          // 推送失败（客服不在线）
          throw new Error(`客服不在线或推送失败 (尝试${attempt}/${maxRetries})`)
        }
      } catch (wsError) {
        logger.error(`⚠️ WebSocket推送失败 (第${attempt}/${maxRetries}次):`, wsError.message)

        if (attempt < maxRetries) {
          // 还有重试机会，等待后重试（指数退避：1秒、2秒、3秒）
          const delaySeconds = attempt
          logger.info(`⏰ ${delaySeconds}秒后进行第${attempt + 1}次重试...`)
          await new Promise(resolve => {
            setTimeout(() => {
              resolve()
            }, delaySeconds * 1000)
          })
        } else {
          // 最终失败，记录错误日志
          logger.error('❌ WebSocket推送最终失败，消息已保存到数据库，客服可通过轮询获取')
          return false
        }
      }
    }

    return false
  }

  /**
   * 获取当前限流状态统计
   *
   * 业务场景：
   * - 监控系统运行状态
   * - 管理后台展示限流数据
   *
   * @returns {Object} 限流状态统计
   * @returns {number} return.userMessageCount - 正在监控的用户数（消息）
   * @returns {number} return.adminMessageCount - 正在监控的管理员数（消息）
   * @returns {number} return.createSessionCount - 正在监控的用户数（创建会话）
   * @returns {number} return.totalMonitoring - 总监控数
   *
   * @static
   */
  static getStats () {
    return {
      userMessageCount: ChatRateLimitService.userMessageTimestamps.size,
      adminMessageCount: ChatRateLimitService.adminMessageTimestamps.size,
      createSessionCount: ChatRateLimitService.createSessionTimestamps.size,
      totalMonitoring:
        ChatRateLimitService.userMessageTimestamps.size +
        ChatRateLimitService.adminMessageTimestamps.size +
        ChatRateLimitService.createSessionTimestamps.size
    }
  }

  /**
   * 重置用户的频率限制记录
   *
   * 业务场景：
   * - 管理员手动解除用户限制
   * - 测试环境清理数据
   *
   * @param {number} userId - 用户ID
   * @param {string} [type='all'] - 重置类型（message/session/all）
   *
   * @static
   * @returns {void} 无返回值，按 type 清理内存中的限流时间戳记录
   */
  static resetUserLimit (userId, type = 'all') {
    if (type === 'message' || type === 'all') {
      ChatRateLimitService.userMessageTimestamps.delete(userId)
      ChatRateLimitService.adminMessageTimestamps.delete(userId)
      logger.info(`✅ 已重置用户${userId}的消息频率限制`)
    }

    if (type === 'session' || type === 'all') {
      ChatRateLimitService.createSessionTimestamps.delete(userId)
      logger.info(`✅ 已重置用户${userId}的创建会话频率限制`)
    }
  }
}

// 服务加载时自动初始化清理机制
ChatRateLimitService.initCleanup()

module.exports = ChatRateLimitService
