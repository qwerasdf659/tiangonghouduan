'use strict'

/**
 * 会话查询服务 - Console 域
 *
 * @description 提供管理后台会话相关的只读查询功能
 *
 * 收口来源：routes/v4/console/sessions.js 的读操作
 * 遵循架构规范：读写分层策略 Phase 3
 *
 * 涵盖查询：
 * - 会话列表查询（分页、筛选）
 * - 会话详情查询
 * - 会话统计查询
 * - 在线用户列表查询
 *
 * @module services/console/SessionQueryService
 * @version 1.0.0
 * @date 2026-02-01
 */

const { Op } = require('sequelize')
const logger = require('../../utils/logger').logger
const BeijingTimeHelper = require('../../utils/timeHelper')
const BusinessCacheHelper = require('../../utils/BusinessCacheHelper')

/**
 * 缓存配置
 * @constant
 */
const CACHE_CONFIG = {
  /** 会话统计缓存 TTL (30秒) */
  SESSION_STATS: 30,
  /** 在线用户缓存 TTL (15秒) */
  ONLINE_USERS: 15
}

/**
 * 会话查询服务类
 * 提供管理后台会话相关的只读查询功能
 *
 * @class SessionQueryService
 */
class SessionQueryService {
  /**
   * 查询会话列表
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量（最大100）
   * @param {string} [options.user_type] - 筛选用户类型（user/admin）
   * @param {boolean} [options.is_active] - 筛选活跃状态
   * @param {number} [options.user_id] - 筛选特定用户
   * @param {string} [options.sort_by='last_activity'] - 排序字段
   * @param {string} [options.sort_order='desc'] - 排序方向
   * @returns {Promise<Object>} 会话列表和分页信息
   */
  static async getSessions(options = {}) {
    // 延迟加载模型，避免循环依赖
    const { AuthenticationSession, User } = require('../../models')

    const {
      page = 1,
      page_size = 20,
      user_type,
      is_active,
      user_id,
      sort_by = 'last_activity',
      sort_order = 'desc'
    } = options

    // 参数校验
    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const pageSizeNum = Math.min(100, Math.max(1, parseInt(page_size, 10) || 20))

    // 构建查询条件
    const whereCondition = {}
    if (user_type && ['user', 'admin'].includes(user_type)) {
      whereCondition.user_type = user_type
    }
    if (is_active !== undefined && is_active !== '') {
      whereCondition.is_active = is_active === 'true' || is_active === true
    }
    if (user_id) {
      const userIdNum = parseInt(user_id, 10)
      if (!isNaN(userIdNum) && userIdNum > 0) {
        whereCondition.user_id = userIdNum
      }
    }

    // 排序配置
    const allowedSortFields = ['last_activity', 'created_at', 'expires_at']
    const sortField = allowedSortFields.includes(sort_by) ? sort_by : 'last_activity'
    const sortDirection = sort_order === 'asc' ? 'ASC' : 'DESC'

    // 查询会话（不使用 include 避免模型 scope 问题）
    const { count, rows: sessions } = await AuthenticationSession.findAndCountAll({
      where: whereCondition,
      order: [[sortField, sortDirection]],
      limit: pageSizeNum,
      offset: (pageNum - 1) * pageSizeNum
    })

    // 批量查询关联的用户信息（避免 N+1 查询）
    const userIds = [...new Set(sessions.map(s => s.user_id).filter(Boolean))]
    const users =
      userIds.length > 0
        ? await User.findAll({
            where: { user_id: userIds },
            attributes: ['user_id', 'nickname', 'mobile', 'status']
          })
        : []
    const userMap = new Map(users.map(u => [u.user_id, u]))

    // 格式化返回数据
    const formattedSessions = sessions.map(session => {
      const userInfo = userMap.get(session.user_id)
      return {
        user_session_id: session.user_session_id,
        session_token: `${session.session_token.substring(0, 8)}...`, // 脱敏显示
        user_type: session.user_type,
        user_id: session.user_id,
        user_info: userInfo
          ? {
              nickname: userInfo.nickname,
              mobile: userInfo.mobile
                ? `${userInfo.mobile.substring(0, 3)}****${userInfo.mobile.substring(7)}`
                : null,
              status: userInfo.status
            }
          : null,
        login_ip: session.login_ip,
        is_active: session.is_active,
        is_expired: session.isExpired(),
        is_valid: session.isValid(),
        last_activity: BeijingTimeHelper.formatToISO(session.last_activity),
        expires_at: BeijingTimeHelper.formatToISO(session.expires_at),
        created_at: BeijingTimeHelper.formatToISO(session.created_at)
      }
    })

    logger.info('查询会话列表成功', { total: count, page: pageNum })

    return {
      sessions: formattedSessions,
      pagination: {
        page: pageNum,
        page_size: pageSizeNum,
        total: count,
        total_pages: Math.ceil(count / pageSizeNum)
      }
    }
  }

  /**
   * 获取会话详情
   *
   * @param {number} session_id - 会话ID（user_session_id）
   * @returns {Promise<Object|null>} 会话详情
   */
  static async getSessionById(session_id) {
    const { AuthenticationSession, User } = require('../../models')

    const sessionId = parseInt(session_id, 10)
    if (isNaN(sessionId) || sessionId <= 0) {
      return null
    }

    // 查询会话（不使用 include 避免模型 scope 问题）
    const session = await AuthenticationSession.findOne({
      where: { user_session_id: sessionId }
    })

    if (!session) {
      return null
    }

    // 单独查询用户信息
    const userInfo = await User.findOne({
      where: { user_id: session.user_id },
      attributes: ['user_id', 'nickname', 'mobile', 'status', 'created_at', 'last_login']
    })

    return {
      user_session_id: session.user_session_id,
      session_token: `${session.session_token.substring(0, 8)}...`, // 脱敏显示
      user_type: session.user_type,
      user_id: session.user_id,
      user_info: userInfo
        ? {
            user_id: userInfo.user_id,
            nickname: userInfo.nickname,
            mobile: userInfo.mobile
              ? `${userInfo.mobile.substring(0, 3)}****${userInfo.mobile.substring(7)}`
              : null,
            status: userInfo.status,
            created_at: BeijingTimeHelper.formatToISO(userInfo.created_at),
            last_login: BeijingTimeHelper.formatToISO(userInfo.last_login)
          }
        : null,
      login_ip: session.login_ip,
      is_active: session.is_active,
      is_expired: session.isExpired(),
      is_valid: session.isValid(),
      last_activity: BeijingTimeHelper.formatToISO(session.last_activity),
      expires_at: BeijingTimeHelper.formatToISO(session.expires_at),
      created_at: BeijingTimeHelper.formatToISO(session.created_at),
      updated_at: BeijingTimeHelper.formatToISO(session.updated_at)
    }
  }

  /**
   * 获取会话统计
   * 热点查询 - 启用短缓存
   *
   * @returns {Promise<Object>} 会话统计信息
   */
  static async getSessionStats() {
    const cacheKey = 'console:session_stats'

    // 尝试从缓存获取
    const cached = await BusinessCacheHelper.get(cacheKey)
    if (cached) {
      logger.debug('会话统计命中缓存', { cacheKey })
      return cached
    }

    const { AuthenticationSession } = require('../../models')

    // 获取活跃会话统计（按用户类型分组）
    const activeStats = await AuthenticationSession.getActiveSessionStats()

    // 计算总活跃会话数
    const totalActiveSessions = Object.values(activeStats).reduce(
      (sum, stat) => sum + stat.active_sessions,
      0
    )

    // 获取待清理的过期会话数
    const expiredPendingCleanup = await AuthenticationSession.count({
      where: {
        expires_at: {
          [Op.lt]: BeijingTimeHelper.createBeijingTime()
        }
      }
    })

    // 获取今日新建会话数
    const todayStart = BeijingTimeHelper.createBeijingTime()
    todayStart.setHours(0, 0, 0, 0)
    const todayNewSessions = await AuthenticationSession.count({
      where: {
        created_at: {
          [Op.gte]: todayStart
        }
      }
    })

    const result = {
      total_active_sessions: totalActiveSessions,
      by_user_type: {
        user: activeStats.user || { active_sessions: 0, unique_users: 0 },
        admin: activeStats.admin || { active_sessions: 0, unique_users: 0 }
      },
      expired_pending_cleanup: expiredPendingCleanup,
      today_new_sessions: todayNewSessions,
      timestamp: BeijingTimeHelper.apiTimestamp()
    }

    // 写入缓存
    await BusinessCacheHelper.set(cacheKey, result, CACHE_CONFIG.SESSION_STATS)
    logger.info('会话统计已缓存', { cacheKey, ttl: CACHE_CONFIG.SESSION_STATS })

    return result
  }

  /**
   * 获取在线用户列表
   * 热点查询 - 启用短缓存
   *
   * @returns {Promise<Object>} 在线用户列表
   */
  static async getOnlineUsers() {
    const cacheKey = 'console:online_users'

    // 尝试从缓存获取
    const cached = await BusinessCacheHelper.get(cacheKey)
    if (cached) {
      logger.debug('在线用户列表命中缓存', { cacheKey })
      return cached
    }

    const { AuthenticationSession, User } = require('../../models')
    const now = BeijingTimeHelper.createBeijingTime()

    // 查询所有活跃且未过期的会话
    const activeSessions = await AuthenticationSession.findAll({
      where: {
        is_active: true,
        expires_at: {
          [Op.gt]: now
        }
      },
      order: [['last_activity', 'DESC']]
    })

    // 批量查询关联用户信息
    const userIds = [...new Set(activeSessions.map(s => s.user_id).filter(Boolean))]
    const users =
      userIds.length > 0
        ? await User.findAll({
            where: { user_id: userIds },
            attributes: ['user_id', 'nickname', 'mobile', 'status']
          })
        : []
    const userMap = new Map(users.map(u => [u.user_id, u]))

    // 按用户聚合
    const userSessionMap = new Map()
    for (const session of activeSessions) {
      const userId = session.user_id
      const userType = session.user_type
      const userInfo = userMap.get(userId)
      if (!userSessionMap.has(userId)) {
        userSessionMap.set(userId, {
          user_id: userId,
          user_type: userType,
          nickname: userInfo?.nickname || null,
          mobile: userInfo?.mobile
            ? `${userInfo.mobile.substring(0, 3)}****${userInfo.mobile.substring(7)}`
            : null,
          status: userInfo?.status || null,
          active_sessions: 0,
          last_activity: session.last_activity,
          login_ips: new Set()
        })
      }
      const userData = userSessionMap.get(userId)
      userData.active_sessions++
      if (session.login_ip) {
        userData.login_ips.add(session.login_ip)
      }
      // 保留最近的活动时间
      if (session.last_activity > userData.last_activity) {
        userData.last_activity = session.last_activity
      }
    }

    // 格式化返回数据
    const onlineUsers = Array.from(userSessionMap.values()).map(user => ({
      user_id: user.user_id,
      user_type: user.user_type,
      nickname: user.nickname,
      mobile: user.mobile,
      status: user.status,
      active_sessions: user.active_sessions,
      last_activity: BeijingTimeHelper.formatToISO(user.last_activity),
      login_ips: Array.from(user.login_ips)
    }))

    const result = {
      online_users: onlineUsers,
      total_online: onlineUsers.length
    }

    // 写入缓存
    await BusinessCacheHelper.set(cacheKey, result, CACHE_CONFIG.ONLINE_USERS)
    logger.info('在线用户列表已缓存', { cacheKey, ttl: CACHE_CONFIG.ONLINE_USERS })

    return result
  }
}

module.exports = SessionQueryService
