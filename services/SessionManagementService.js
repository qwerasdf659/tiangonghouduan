/**
 * 会话管理服务（SessionManagementService）
 *
 * 业务场景：管理用户认证会话的生命周期
 *
 * 核心功能：
 * 1. deactivateSession - 失效单个会话
 * 2. deactivateUserSessions - 失效用户所有会话
 * 3. cleanupExpiredSessions - 清理过期会话
 *
 * 架构规范：
 * - 所有写操作通过此服务层统一处理
 * - 路由层不直接操作 AuthenticationSession 模型的写方法
 * - 遵循 "Service + options.transaction" 模式
 *
 * 事务边界治理（2026-01-05 决策）：
 * - 写操作强制要求外部事务传入（options.transaction）
 * - 读操作和清理操作可不传事务（批量操作自行管理）
 *
 * 拆分自：routes/v4/console/config/sessions.js（路由层直接操作模型）
 */

const BusinessError = require('../utils/BusinessError')
const { AuthenticationSession } = require('../models')
const logger = require('../utils/logger').logger
const BeijingTimeHelper = require('../utils/timeHelper')
const { Op } = require('sequelize')
// 注：会话管理写操作不强制要求外部事务（单条操作或批量操作自行管理）

/*
 * ============================================================================
 * Redis 会话注册表（设备级多会话热路径，docs/会话认证体系最终方案-设备级多会话.md 第六节）
 * ----------------------------------------------------------------------------
 * 复用 utils/UnifiedRedisClient（不自建连接池）。键设计：
 *   session:{user_id}:{device_id}  String(JSON) = {session_token,user_type,login_platform,login_ip,expires_at}
 *   user_sessions:{user_id}        Set          = 该用户所有 device_id（用于"我的设备列表"/批量撤销/软上限告警）
 * Redis 为热路径权威：middleware/auth.js 命中即放行；未命中降级查 MySQL 并回填。
 * 所有 Redis 操作失败均降级（不阻塞主流程，MySQL 仍是持久/审计真相源）。
 * ============================================================================
 */
const REDIS_SESSION_PREFIX = 'session:'
const REDIS_USER_SESSIONS_PREFIX = 'user_sessions:'
/** 单用户设备软上限（决策B）：超过仅告警，不踢人；"限设备数"为可选开关默认关 */
const SOFT_DEVICE_LIMIT = parseInt(process.env.SESSION_SOFT_DEVICE_LIMIT) || 10

/**
 * 会话管理服务类
 *
 * @class SessionManagementService
 * @description 封装认证会话的管理操作，统一写操作入口
 */
class SessionManagementService {
  /**
   * 🔑 构造 Redis 会话键
   * @param {number} user_id - 用户ID
   * @param {string} device_id - 设备标识
   * @returns {string} session:{user_id}:{device_id}
   */
  static _sessionKey(user_id, device_id) {
    return `${REDIS_SESSION_PREFIX}${user_id}:${device_id}`
  }

  /**
   * 🔑 构造 Redis 用户设备集合键
   * @param {number} user_id - 用户ID
   * @returns {string} user_sessions:{user_id}
   */
  static _userSessionsKey(user_id) {
    return `${REDIS_USER_SESSIONS_PREFIX}${user_id}`
  }

  /**
   * 🟢 登录成功后写入 Redis 会话注册表（设备级）
   *
   * 失败降级：Redis 写入失败仅告警，不影响登录（MySQL 已落库为持久真相源）。
   * 同时维护 user_sessions:{user_id} 集合并做软上限告警（决策B：不踢人，仅告警）。
   *
   * @param {Object} params - 会话参数
   * @param {number} params.user_id - 用户ID
   * @param {string} params.device_id - 设备标识（缺失时跳过Redis写入）
   * @param {string} params.session_token - 会话令牌
   * @param {string} params.user_type - 用户类型（user/admin）
   * @param {string} params.login_platform - 登录平台
   * @param {string|null} params.login_ip - 登录IP
   * @param {Date|string} params.expires_at - 过期时间
   * @param {number} params.ttl_seconds - Redis键TTL（秒，与会话有效期一致）
   * @returns {Promise<void>} 无返回值（失败降级）
   */
  static async registerSession(params) {
    const {
      user_id,
      device_id,
      session_token,
      user_type,
      login_platform,
      login_ip,
      expires_at,
      ttl_seconds
    } = params

    // device_id 缺失（legacy客户端）跳过Redis注册，仅依赖MySQL（middleware会降级查库）
    if (!device_id) {
      return
    }

    try {
      const { getRawClient } = require('../utils/UnifiedRedisClient')
      const client = getRawClient()
      const key = SessionManagementService._sessionKey(user_id, device_id)
      const value = JSON.stringify({
        session_token,
        user_type,
        login_platform,
        login_ip: login_ip || null,
        expires_at: expires_at instanceof Date ? expires_at.toISOString() : expires_at
      })
      const ttl = Math.max(60, parseInt(ttl_seconds) || 7 * 24 * 3600)

      await client.set(key, value, 'EX', ttl)
      const userSetKey = SessionManagementService._userSessionsKey(user_id)
      await client.sadd(userSetKey, device_id)
      // 设备集合TTL与最长会话对齐，避免集合永不过期
      await client.expire(userSetKey, ttl)

      // 软上限告警（决策B）：设备过多可能是盗号/工作室异常信号，仅告警不踢人
      const deviceCount = await client.scard(userSetKey)
      if (deviceCount > SOFT_DEVICE_LIMIT) {
        logger.warn(
          `⚠️ [Session] 用户设备数超软上限: user_id=${user_id}, devices=${deviceCount} > ${SOFT_DEVICE_LIMIT}（仅告警，未踢人）`
        )
      }
    } catch (error) {
      logger.warn(`⚠️ [Session] Redis会话注册失败（降级，不影响登录）: ${error.message}`)
    }
  }

  /**
   * 🟢🟢 设备级登录：创建会话（统一入口，供所有登录路由收口）
   *
   * 设备级多会话隔离（替换原"按 platform 互斥"）：
   *  - 同 (user_id, user_type, device_id) 再次登录 → 替换自己这台设备的旧会话（token 轮换），正常
   *  - 不同 device_id → 新会话并存，不互踢
   *  - device_id 缺失（legacy 客户端）→ 不替换任何旧会话（兜底放行，决策A），仅新建
   *
   * 写操作收口本方法：行级锁序列化并发 → 失效同设备旧会话 → 建新会话 → 写 Redis 注册表 → 推旧设备下线。
   * 事务由本方法内部管理（登录是独立写操作，非跨表业务事务）。
   *
   * @param {Object} params - 登录会话参数
   * @param {string} params.session_token - 新会话令牌（UUID）
   * @param {string} params.user_type - 用户类型（user/admin）
   * @param {number} params.user_id - 用户ID
   * @param {string|null} params.device_id - 设备标识（前端 X-Device-Id）
   * @param {string|null} params.login_ip - 登录IP
   * @param {string} params.login_platform - 登录平台（展示标签）
   * @param {number} params.expires_in_minutes - 会话有效期（分钟）
   * @returns {Promise<Object>} { replaced_count }
   */
  static async createDeviceSession(params) {
    const {
      session_token,
      user_type,
      user_id,
      device_id = null,
      login_ip = null,
      login_platform,
      expires_in_minutes = 10080
    } = params

    const { sequelize } = AuthenticationSession
    const transaction = await sequelize.transaction()
    let replacedCount = 0

    try {
      // 行级锁：序列化同一用户同一设备的并发登录（device_id 为空时锁该用户该类型活跃会话）
      if (device_id) {
        await sequelize.query(
          'SELECT authentication_session_id FROM authentication_sessions WHERE user_type = ? AND user_id = ? AND device_id = ? AND is_active = 1 FOR UPDATE',
          { replacements: [user_type, user_id, device_id], transaction }
        )
        // 失效同设备旧会话（token 轮换），不同设备并存不踢
        replacedCount = await AuthenticationSession.deactivateDeviceSessions(
          user_type,
          user_id,
          device_id,
          null,
          { transaction }
        )
      }

      await AuthenticationSession.createSession(
        {
          session_token,
          user_type,
          user_id,
          login_ip,
          login_platform,
          device_id,
          expires_in_minutes
        },
        { transaction }
      )

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }

    // 提交后写 Redis 注册表（热路径）
    const ttlSeconds = expires_in_minutes * 60
    const expiresAt = BeijingTimeHelper.futureTime(expires_in_minutes * 60 * 1000)
    await SessionManagementService.registerSession({
      user_id,
      device_id,
      session_token,
      user_type,
      login_platform,
      login_ip,
      expires_at: expiresAt,
      ttl_seconds: ttlSeconds
    })

    // 替换了同设备旧会话 → 推送该设备旧连接下线（精准到设备，不误伤其他设备）
    if (replacedCount > 0 && device_id) {
      SessionManagementService._pushDeviceOffline(
        { user_id, user_type, device_id },
        'session_replaced'
      )
      logger.info(
        `🔒 [Session] 同设备会话替换: user_id=${user_id}, type=${user_type}, device=${device_id}, replaced=${replacedCount}`
      )
    }

    return { replaced_count: replacedCount }
  }

  /**
   * 🔴 从 Redis 注册表移除会话（撤销/登出/替换时调用）
   *
   * @param {number} user_id - 用户ID
   * @param {string} device_id - 设备标识
   * @returns {Promise<void>} 无返回值（失败降级）
   */
  static async unregisterSession(user_id, device_id) {
    if (!device_id) {
      return
    }
    try {
      const { getRawClient } = require('../utils/UnifiedRedisClient')
      const client = getRawClient()
      await client.del(SessionManagementService._sessionKey(user_id, device_id))
      await client.srem(SessionManagementService._userSessionsKey(user_id), device_id)
    } catch (error) {
      logger.warn(`⚠️ [Session] Redis会话注销失败（降级）: ${error.message}`)
    }
  }

  /**
   * 🔌 通过 Socket.io 精准推送某设备下线（撤销/替换时调用）
   *
   * 复用 ChatWebSocketService.disconnectUser（cluster 跨进程 Redis Adapter 送达）。
   * 当前 disconnectUser 按 (user_id, user_type) 房间维度断开——对"踢某用户某设备"已足够：
   * 设备级隔离下同 user_type 的其他设备会收到 session_replaced，前端凭本地 device_id 自查是否是自己被踢。
   * 失败降级（不阻塞主流程）。
   *
   * @param {Object} session - 会话实例（含 user_id, user_type）
   * @param {string} reason - 下线原因
   * @returns {void} 无返回值
   */
  static _pushDeviceOffline(session, reason = 'session_revoked') {
    try {
      const ServiceManager = require('./index')
      const ChatWebSocketService = ServiceManager.getService('chat_web_socket')
      if (ChatWebSocketService && typeof ChatWebSocketService.disconnectUser === 'function') {
        ChatWebSocketService.disconnectUser(session.user_id, session.user_type, {
          reason,
          // 传入 device_id 时按设备精准下线（踢单设备）；为空则按 user_type 房间下线（批量场景）
          device_id: session.device_id || null
        })
      }
    } catch (error) {
      logger.debug(`🔌 [Session] Socket.io下线推送跳过: ${error.message}`)
    }
  }

  /**
   * 🧹 清空某用户在 Redis 中的所有设备会话键（批量撤销时调用）
   *
   * 读取 user_sessions:{user_id} 集合内全部 device_id，逐个 DEL session 键，最后删集合键。
   * 失败降级（不阻塞 MySQL 主流程）。
   *
   * @param {number} user_id - 用户ID
   * @returns {Promise<void>} 无返回值
   */
  static async _clearUserRedisSessions(user_id) {
    try {
      const { getRawClient } = require('../utils/UnifiedRedisClient')
      const client = getRawClient()
      const userSetKey = SessionManagementService._userSessionsKey(user_id)
      const deviceIds = await client.smembers(userSetKey)
      if (Array.isArray(deviceIds) && deviceIds.length > 0) {
        const keys = deviceIds.map(d => SessionManagementService._sessionKey(user_id, d))
        await client.del(...keys)
      }
      await client.del(userSetKey)
    } catch (error) {
      logger.warn(`⚠️ [Session] 批量清除Redis会话失败（降级）: ${error.message}`)
    }
  }

  /**
   * 失效单个会话
   *
   * 业务场景：
   * - 管理员强制登出某个用户的特定会话
   * - 安全事件响应：发现异常登录时强制失效会话
   *
   * @param {number} session_id - 会话ID（user_session_id）
   * @param {Object} options - 操作选项
   * @param {number} options.operator_user_id - 操作者用户ID（必填）
   * @param {string} [options.reason] - 失效原因（可选）
   * @param {Object} [options.transaction] - Sequelize事务对象（可选，单条操作可不传）
   * @returns {Promise<Object>} 操作结果 { session_id, user_id, deactivated_at }
   * @throws {Error} 会话不存在、会话已失效等
   *
   * @example
   * const result = await SessionManagementService.deactivateSession(123, {
   *   operator_user_id: 456,
   *   reason: '安全事件响应'
   * })
   */
  static async deactivateSession(session_id, options = {}) {
    const { operator_user_id, reason, transaction } = options

    if (!operator_user_id) {
      throw new BusinessError('operator_user_id 是必填参数', 'SERVICE_REQUIRED', 400)
    }

    if (!session_id || session_id <= 0) {
      throw new BusinessError('无效的会话ID', 'SERVICE_INVALID', 400)
    }

    logger.info('开始失效会话', { session_id, operator_user_id, reason })

    // 查找会话（支持事务）
    const queryOptions = transaction ? { transaction } : {}
    const session = await AuthenticationSession.findByPk(session_id, queryOptions)

    if (!session) {
      throw new BusinessError('会话不存在', 'SERVICE_NOT_FOUND', 404)
    }

    if (!session.is_active) {
      // 幂等：已失效的会话直接返回
      logger.info('会话已经失效，幂等返回', { session_id, operator_user_id })
      return {
        session_id,
        user_id: session.user_id,
        already_inactive: true,
        deactivated_at: BeijingTimeHelper.apiTimestamp()
      }
    }

    // 执行失效操作
    const deactivateReason = reason || `管理员手动登出 (operator: ${operator_user_id})`
    await session.deactivate(deactivateReason)

    // 同步清除 Redis 注册表（设备级），并按 (user_id, device_id) 精准推送下线
    await SessionManagementService.unregisterSession(session.user_id, session.device_id)
    SessionManagementService._pushDeviceOffline(session, 'session_deactivated')

    logger.info('会话失效成功', {
      session_id,
      user_id: session.user_id,
      operator_user_id,
      reason: deactivateReason
    })

    return {
      session_id,
      user_id: session.user_id,
      deactivated_at: BeijingTimeHelper.apiTimestamp()
    }
  }

  /**
   * 失效用户所有会话
   *
   * 业务场景：
   * - 管理员强制登出某个用户的所有设备
   * - 用户密码重置后强制所有设备重新登录
   * - 账号安全问题时批量失效会话
   *
   * @param {Object} params - 参数对象
   * @param {string} params.user_type - 用户类型（user/admin）
   * @param {number} params.user_id - 用户ID
   * @param {Object} options - 操作选项
   * @param {number} options.operator_user_id - 操作者用户ID（必填）
   * @param {string} [options.reason] - 失效原因（可选）
   * @param {number} [options.exclude_session_id] - 排除的会话ID（可选，用于保留当前会话）
   * @returns {Promise<Object>} 操作结果 { user_type, user_id, affected_count, reason }
   * @throws {Error} 参数无效、用户类型无效等
   *
   * @example
   * const result = await SessionManagementService.deactivateUserSessions(
   *   { user_type: 'user', user_id: 123 },
   *   { operator_user_id: 456, reason: '账号安全问题' }
   * )
   */
  static async deactivateUserSessions(params, options = {}) {
    const { user_type, user_id } = params
    const { operator_user_id, reason, exclude_session_id } = options

    if (!operator_user_id) {
      throw new BusinessError('operator_user_id 是必填参数', 'SERVICE_REQUIRED', 400)
    }

    // 参数校验
    if (!user_type || !['user', 'admin'].includes(user_type)) {
      throw new BusinessError('无效的用户类型', 'SERVICE_INVALID', 400)
    }

    if (!user_id || user_id <= 0) {
      throw new BusinessError('无效的用户ID', 'SERVICE_INVALID', 400)
    }

    // 防止管理员踢出自己（如果是管理员操作）
    if (user_type === 'admin' && user_id === operator_user_id && !exclude_session_id) {
      throw new BusinessError('不能踢出自己的所有会话', 'SERVICE_NOT_ALLOWED', 400)
    }

    logger.info('开始失效用户所有会话', {
      user_type,
      user_id,
      operator_user_id,
      reason,
      exclude_session_id
    })

    // 失效用户所有会话（调用模型静态方法）
    const deactivateReason = reason || `管理员强制登出 (operator: ${operator_user_id})`
    const affectedCount = await AuthenticationSession.deactivateUserSessions(
      user_type,
      user_id,
      exclude_session_id || null
    )

    // 同步清除该用户的 Redis 设备注册表 + Socket.io 推送下线
    await SessionManagementService._clearUserRedisSessions(user_id)
    SessionManagementService._pushDeviceOffline({ user_id, user_type }, 'user_sessions_deactivated')

    logger.info('用户会话批量失效成功', {
      user_type,
      user_id,
      affected_count: affectedCount,
      operator_user_id,
      reason: deactivateReason
    })

    return {
      user_type,
      user_id,
      affected_count: affectedCount,
      reason: deactivateReason
    }
  }

  /**
   * 清理过期会话
   *
   * 业务场景：
   * - 定时任务清理已过期的会话记录
   * - 管理员手动触发清理释放资源
   *
   * @param {Object} [options={}] - 操作选项
   * @param {number} [options.operator_user_id] - 操作者用户ID（可选，定时任务可不传）
   * @returns {Promise<Object>} 操作结果 { deleted_count, cleanup_at }
   *
   * @example
   * // 管理员手动清理
   * const result = await SessionManagementService.cleanupExpiredSessions({
   *   operator_user_id: 456
   * })
   *
   * // 定时任务清理
   * const result = await SessionManagementService.cleanupExpiredSessions()
   */
  static async cleanupExpiredSessions(options = {}) {
    const { operator_user_id } = options

    logger.info('开始清理过期会话', { operator_user_id: operator_user_id || 'system' })

    // 调用模型静态方法清理过期会话
    const deletedCount = await AuthenticationSession.cleanupExpiredSessions()

    logger.info('过期会话清理完成', {
      deleted_count: deletedCount,
      operator_user_id: operator_user_id || 'system',
      cleanup_at: BeijingTimeHelper.apiTimestamp()
    })

    return {
      deleted_count: deletedCount,
      cleanup_at: BeijingTimeHelper.apiTimestamp()
    }
  }

  /**
   * 🙋 用户踢掉自己的某台设备（设备级多会话 — 用户端 DELETE /auth/sessions/:id）
   *
   * 安全：只能操作"自己的"会话，越权（操作他人会话）抛 403。
   * 动作 = MySQL is_active=0 + 清 Redis 注册表 + Socket.io 推送该设备下线。
   *
   * @param {number} authentication_session_id - 会话主键ID
   * @param {Object} options - 选项
   * @param {number} options.operator_user_id - 操作者用户ID（即当前登录用户）
   * @returns {Promise<Object>} { deactivated: true, authentication_session_id }
   * @throws {BusinessError} 会话不存在(404)/越权(403)
   */
  static async deactivateOwnSession(authentication_session_id, options = {}) {
    const { operator_user_id } = options
    const sessionId = parseInt(authentication_session_id, 10)

    if (!operator_user_id) {
      throw new BusinessError('operator_user_id 是必填参数', 'SERVICE_REQUIRED', 400)
    }
    if (isNaN(sessionId) || sessionId <= 0) {
      throw new BusinessError('无效的会话ID', 'SERVICE_INVALID', 400)
    }

    const session = await AuthenticationSession.findByPk(sessionId)
    if (!session) {
      throw new BusinessError('会话不存在', 'SERVICE_NOT_FOUND', 404)
    }

    // 越权防护：只能踢自己的会话
    if (session.user_id !== operator_user_id) {
      throw new BusinessError('无权操作他人的会话', 'SERVICE_FORBIDDEN', 403)
    }

    if (session.is_active) {
      await session.deactivate('用户在设备管理中主动下线该设备')
    }

    // 同步清 Redis + 推送该设备下线
    await SessionManagementService.unregisterSession(session.user_id, session.device_id)
    SessionManagementService._pushDeviceOffline(session, 'session_revoked')

    logger.info(
      `🙋 [Session] 用户踢自己设备成功: user_id=${operator_user_id}, session_id=${sessionId}, device=${session.device_id || 'legacy'}`
    )

    return {
      deactivated: true,
      authentication_session_id: sessionId
    }
  }

  /**
   * 获取会话统计信息（读操作）
   *
   * @returns {Promise<Object>} 会话统计
   */
  static async getSessionStats() {
    // 获取活跃会话统计（按用户类型分组）
    const activeStats = await AuthenticationSession.getActiveSessionStats()

    // 设备维度统计（设备级多会话，与 SessionQueryService.getSessionStats 保持一致口径）
    const deviceStats = await AuthenticationSession.getActiveDeviceStats()

    // 计算总活跃会话数
    const totalActiveSessions = Object.values(activeStats).reduce(
      (sum, stat) => sum + (stat.active_sessions || 0),
      0
    )

    // 获取待清理的过期会话数
    const expiredPendingCleanup = await AuthenticationSession.count({
      where: {
        expires_at: { [Op.lt]: BeijingTimeHelper.createBeijingTime() }
      }
    })

    // 获取今日新建会话数
    const todayStart = BeijingTimeHelper.createBeijingTime()
    todayStart.setHours(0, 0, 0, 0)
    const todayNewSessions = await AuthenticationSession.count({
      where: {
        created_at: { [Op.gte]: todayStart }
      }
    })

    return {
      total_active_sessions: totalActiveSessions,
      by_user_type: {
        user: activeStats.user || { active_sessions: 0, unique_users: 0 },
        admin: activeStats.admin || { active_sessions: 0, unique_users: 0 }
      },
      by_device: {
        total_devices: deviceStats.total_devices,
        legacy_sessions: deviceStats.legacy_sessions,
        multi_device_users: deviceStats.multi_device_users
      },
      expired_pending_cleanup: expiredPendingCleanup,
      today_new_sessions: todayNewSessions,
      timestamp: BeijingTimeHelper.apiTimestamp()
    }
  }
}

module.exports = SessionManagementService
