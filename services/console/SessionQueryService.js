'use strict'

/**
 * 会话查询服务 - Console 域
 *
 * @description 提供管理后台会话相关的只读查询功能
 *
 * 收口来源：routes/v4/console/config/sessions.js 的读操作
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
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')
const IpLocationHelper = require('../../utils/IpLocationHelper')
const { AuthenticationSession, User } = require('../../models')

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
    if (options.login_platform) {
      whereCondition.login_platform = options.login_platform
    }
    if (options.device_id) {
      whereCondition.device_id = options.device_id
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

    // 格式化返回数据（含设备维度 + 登录地 + 当前会话标记）
    const currentToken = options.current_session_token || null
    const formattedSessions = await Promise.all(
      sessions.map(async session => {
        const userInfo = userMap.get(session.user_id)
        return {
          authentication_session_id: session.authentication_session_id,
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
          login_location: await IpLocationHelper.resolve(session.login_ip), // 决策E：登录地（纯展示）
          login_platform: session.login_platform || 'unknown',
          device_id: session.device_id || null, // 设备级多会话：设备标识（NULL=legacy）
          is_active: session.is_active,
          is_expired: session.isExpired(),
          is_valid: session.isValid(),
          // 决策F：当前会话由后端判定（前端不再解析JWT）
          is_current: currentToken ? session.session_token === currentToken : false,
          last_activity: BeijingTimeHelper.formatToISO(session.last_activity),
          expires_at: BeijingTimeHelper.formatToISO(session.expires_at),
          created_at: BeijingTimeHelper.formatToISO(session.created_at)
        }
      })
    )

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
   * @param {number} session_id - 会话ID（authentication_session_id）
   * @returns {Promise<Object|null>} 会话详情
   */
  static async getSessionById(session_id) {
    const sessionId = parseInt(session_id, 10)
    if (isNaN(sessionId) || sessionId <= 0) {
      return null
    }

    const session = await AuthenticationSession.findOne({
      where: { authentication_session_id: sessionId }
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
      authentication_session_id: session.authentication_session_id,
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
      login_location: await IpLocationHelper.resolve(session.login_ip), // 决策E：登录地（纯展示）
      login_platform: session.login_platform || 'unknown',
      device_id: session.device_id || null, // 设备级多会话：设备标识（NULL=legacy）
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
   * 🙋 获取"当前登录用户自己"的在线设备列表（用户端 GET /auth/sessions）
   *
   * 设备级多会话：列出该用户所有活跃且未过期的会话，含设备标识、登录地、是否当前设备。
   * 仅返回自己的会话（user_id 由认证中间件提供，不接受外部传入越权查询）。
   *
   * @param {Object} params - 参数
   * @param {number} params.user_id - 当前登录用户ID
   * @param {string} [params.user_type] - 用户类型（user/admin），不传则查全部类型
   * @param {string} [params.current_session_token] - 当前会话令牌（用于标记 is_current）
   * @returns {Promise<Object>} { list: [...] }
   */
  static async getUserDevices(params = {}) {
    const { user_id, user_type, current_session_token } = params

    const userIdNum = parseInt(user_id, 10)
    if (isNaN(userIdNum) || userIdNum <= 0) {
      return { list: [] }
    }

    const whereCondition = {
      user_id: userIdNum,
      is_active: true,
      expires_at: { [Op.gt]: BeijingTimeHelper.createBeijingTime() }
    }
    if (user_type && ['user', 'admin'].includes(user_type)) {
      whereCondition.user_type = user_type
    }

    const sessions = await AuthenticationSession.findAll({
      where: whereCondition,
      order: [['last_activity', 'DESC']]
    })

    const list = await Promise.all(
      sessions.map(async session => ({
        authentication_session_id: session.authentication_session_id,
        device_id: session.device_id || null,
        login_platform: session.login_platform || 'unknown',
        login_ip: session.login_ip,
        login_location: await IpLocationHelper.resolve(session.login_ip), // 决策E：登录地
        last_activity: BeijingTimeHelper.formatToISO(session.last_activity),
        expires_at: BeijingTimeHelper.formatToISO(session.expires_at),
        // 决策F：当前设备由后端判定
        is_current: current_session_token ? session.session_token === current_session_token : false
      }))
    )

    return { list }
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

    // 获取活跃会话统计（按用户类型分组）
    const activeStats = await AuthenticationSession.getActiveSessionStats()

    // 设备维度统计（设备级多会话，决策B/方案 8.2 统计增加 device 维度）
    const deviceStats = await AuthenticationSession.getActiveDeviceStats()

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
      // 设备维度统计（设备级多会话）：真实设备数 / 存量legacy会话数 / 多设备用户数
      by_device: {
        total_devices: deviceStats.total_devices,
        legacy_sessions: deviceStats.legacy_sessions,
        multi_device_users: deviceStats.multi_device_users
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
          login_ips: new Set(),
          login_platforms: new Set(),
          device_ids: new Set()
        })
      }
      const userData = userSessionMap.get(userId)
      userData.active_sessions++
      if (session.login_ip) {
        userData.login_ips.add(session.login_ip)
      }
      if (session.login_platform) {
        userData.login_platforms.add(session.login_platform)
      }
      // 设备级多会话：聚合该用户的真实设备（device_id 非空）
      if (session.device_id) {
        userData.device_ids.add(session.device_id)
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
      // 设备级多会话：该用户真实设备数（device_id 去重，不含 legacy NULL）
      device_count: user.device_ids.size,
      last_activity: BeijingTimeHelper.formatToISO(user.last_activity),
      login_ips: Array.from(user.login_ips),
      login_platforms: Array.from(user.login_platforms)
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
