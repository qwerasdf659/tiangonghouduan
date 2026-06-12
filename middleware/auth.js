const logger = require('../utils/logger').logger

/**
 * 统一认证中间件 - V4.0 统一架构版本
 * 🛡️ 权限认证：完全使用UUID角色系统，移除is_admin字段依赖
 * 🚀 性能优化：集成内存+Redis双层缓存，智能降级
 */

const jwt = require('jsonwebtoken')
const { User, Role, StoreStaff } = require('../models')
const BeijingTimeHelper = require('../utils/timeHelper')

// 尝试导入Redis客户端，如果失败则使用纯内存缓存
let redisClient = null
try {
  const { getRawClient } = require('../utils/UnifiedRedisClient')
  redisClient = getRawClient()
  logger.info('🚀 [Auth] Redis缓存已启用')
} catch (error) {
  logger.warn('⚠️ [Auth] Redis不可用，使用纯内存缓存:', error.message)
}

// 内存缓存管理
const memoryCache = new Map()
/*
 * 内存层 TTL（R5 cluster 跨进程一致性收敛，2026-05-30，方案②）
 * cluster 多进程下 invalidateUserPermissions 只能清「当前 worker」的内存层，清不掉其他 worker 的。
 * 将内存层 TTL 从 5 分钟收紧到 30 秒：角色/权限变更后，其他 worker 最长 30 秒内自动过期回源 Redis(已失效)→DB 拿到新权限。
 * - 账号封禁/强制登出不受此影响（走 authentication_sessions 表，每次请求新鲜查库立即生效）
 * - 与抽奖配置缓存 R4/D9 的「30 秒收敛」同一口径，全项目统一；保留内存层以在 Redis 故障时兜底
 * - 可用 AUTH_PERMISSION_MEMORY_TTL_MS 环境变量覆盖（单一真相源 .env）
 */
const MEMORY_TTL = parseInt(process.env.AUTH_PERMISSION_MEMORY_TTL_MS) || 30 * 1000 // 30秒
const REDIS_TTL = 30 * 60 // 30分钟（秒）
const REDIS_PREFIX = 'auth:permissions:'

// 性能统计
const cacheStats = {
  memoryHits: 0,
  redisHits: 0,
  databaseQueries: 0,
  totalQueries: 0,
  lastReportTime: Date.now() // 上次报告时间
}

/**
 * 📊 定期输出缓存统计信息（每100次查询或每5分钟）
 * 功能：监控缓存命中率、数据库查询频率，便于性能优化决策
 * @returns {void}
 */
function reportCacheStats() {
  const now = Date.now()
  const timeSinceLastReport = now - cacheStats.lastReportTime

  // 每100次查询或每5分钟输出一次
  if (cacheStats.totalQueries % 100 === 0 || timeSinceLastReport > 300000) {
    if (cacheStats.totalQueries > 0) {
      const memoryHitRate = ((cacheStats.memoryHits / cacheStats.totalQueries) * 100).toFixed(1)
      const redisHitRate = ((cacheStats.redisHits / cacheStats.totalQueries) * 100).toFixed(1)
      const totalHitRate = (
        ((cacheStats.memoryHits + cacheStats.redisHits) / cacheStats.totalQueries) *
        100
      ).toFixed(1)
      const dbQueryRate = ((cacheStats.databaseQueries / cacheStats.totalQueries) * 100).toFixed(1)

      logger.info('\n📊 [Auth缓存统计] 性能报告:')
      logger.info(`   总查询次数: ${cacheStats.totalQueries}`)
      logger.info(`   内存缓存命中: ${cacheStats.memoryHits}次 (${memoryHitRate}%)`)
      logger.info(`   Redis缓存命中: ${cacheStats.redisHits}次 (${redisHitRate}%)`)
      logger.info(`   数据库查询: ${cacheStats.databaseQueries}次 (${dbQueryRate}%)`)
      logger.info(`   综合缓存命中率: ${totalHitRate}%`)
      logger.info(`   内存缓存大小: ${memoryCache.size}项`)

      // 性能告警
      if (parseFloat(totalHitRate) < 80) {
        logger.warn('   ⚠️ 缓存命中率偏低（<80%），建议检查缓存配置')
      }
      if (parseFloat(dbQueryRate) > 20) {
        logger.warn('   ⚠️ 数据库查询率偏高（>20%），建议增加缓存时间')
      }

      cacheStats.lastReportTime = now
    }
  }
}

/**
 * 🚀 从缓存获取用户权限
 * @param {number} user_id - 用户ID
 * @returns {Promise<Object|null>} 用户权限对象或null
 */
async function getUserPermissionsFromCache(user_id) {
  cacheStats.totalQueries++
  reportCacheStats() // 📊 定期输出统计信息

  // 1. 检查内存缓存
  const memoryKey = `permissions_${user_id}`
  const memoryItem = memoryCache.get(memoryKey)

  if (memoryItem && BeijingTimeHelper.timestamp() - memoryItem.timestamp < MEMORY_TTL) {
    cacheStats.memoryHits++
    return memoryItem.data
  }

  // 2. 检查Redis缓存
  if (redisClient) {
    try {
      const redisKey = `${REDIS_PREFIX}${user_id}`
      const cached = await redisClient.get(redisKey)

      if (cached) {
        cacheStats.redisHits++
        const data = JSON.parse(cached)

        // 更新内存缓存
        memoryCache.set(memoryKey, {
          data,
          timestamp: BeijingTimeHelper.timestamp()
        })

        return data
      }
    } catch (error) {
      logger.warn('⚠️ [Auth] Redis读取失败:', error.message)
    }
  }

  return null
}

/**
 * 🚀 设置用户权限缓存
 * @param {number} user_id - 用户ID
 * @param {Object} data - 权限数据对象
 * @returns {Promise<void>} 无返回值
 */
async function setUserPermissionsCache(user_id, data) {
  // 设置内存缓存
  const memoryKey = `permissions_${user_id}`
  memoryCache.set(memoryKey, {
    data,
    timestamp: BeijingTimeHelper.timestamp()
  })

  // 设置Redis缓存
  if (redisClient) {
    try {
      const redisKey = `${REDIS_PREFIX}${user_id}`
      await redisClient.setex(redisKey, REDIS_TTL, JSON.stringify(data))
    } catch (error) {
      logger.warn('⚠️ [Auth] Redis写入失败:', error.message)
    }
  }
}

/**
 * 🗑️ 清除用户权限缓存（决策7A：统一失效入口）
 *
 * @description 同时清除权限缓存和业务缓存，确保缓存一致性
 *
 * @param {number} user_id - 用户ID
 * @param {string} reason - 清除原因
 * @param {number|null} operator_id - 操作人ID（用于审计，可选）
 * @param {string|null} mobile - 用户手机号（可选，用于同时失效手机号维度缓存）
 * @returns {Promise<void>} 无返回值
 */
async function invalidateUserPermissions(
  user_id,
  reason = 'unknown',
  operator_id = null,
  mobile = null
) {
  // 清除内存缓存
  const memoryKey = `permissions_${user_id}`
  memoryCache.delete(memoryKey)

  // 清除Redis缓存
  if (redisClient) {
    try {
      const redisKey = `${REDIS_PREFIX}${user_id}`
      await redisClient.del(redisKey)
    } catch (error) {
      logger.warn('⚠️ [Auth] Redis删除失败:', error.message)
    }
  }

  // 决策7A：同时清除业务缓存（用户信息缓存）
  try {
    const { BusinessCacheHelper } = require('../utils/BusinessCacheHelper')
    await BusinessCacheHelper.invalidateUser({ user_id, mobile }, reason)
  } catch (cacheError) {
    logger.warn('⚠️ [Auth] 业务缓存失效失败（非致命）:', cacheError.message)
  }

  logger.info(`🔄 [Auth] 清除用户权限缓存: ${user_id} (原因: ${reason})`)

  /*
   * 🔒 审计日志（不阻塞主流程）
   * 说明：AdminOperationLog.operation_type 是 ENUM，这里复用 system_config 类型，避免引入新枚举值导致迁移成本上升
   */
  if (operator_id) {
    try {
      const AuditLogService = require('../services/AuditLogService')
      await AuditLogService.logOperation({
        operator_id,
        operation_type: 'system_config',
        target_type: 'User',
        target_id: user_id,
        action: 'invalidate_permissions_cache',
        before_data: null,
        after_data: null,
        reason,
        idempotency_key: `permissions_cache_invalidate_${user_id}_${BeijingTimeHelper.timestamp()}`
      })
    } catch (auditError) {
      logger.warn('⚠️ [Auth] 权限缓存失效审计日志记录失败（非致命）:', auditError.message)
    }
  }
}

/**
 * 🛡️ 获取用户角色信息（基于UUID角色系统，支持缓存）
 * @param {number} user_id - 用户ID
 * @param {boolean} forceRefresh - 强制刷新缓存
 * @returns {Promise<Object>} 用户角色信息
 */
async function getUserRoles(user_id, forceRefresh = false) {
  try {
    // 如果不强制刷新，先尝试从缓存获取
    if (!forceRefresh) {
      const cached = await getUserPermissionsFromCache(user_id)
      if (cached) {
        return cached
      }
    }

    cacheStats.databaseQueries++

    // ⏱️ 记录查询开始时间（用于慢查询监控）
    const queryStartTime = Date.now()

    const user = await User.findOne({
      where: { user_id, status: 'active' },
      include: [
        {
          model: Role,
          as: 'roles',
          through: {
            where: { is_active: true }
          },
          attributes: ['role_id', 'role_uuid', 'role_name', 'role_level', 'permissions']
        }
      ]
    })

    // ⚠️ 慢查询告警（超过1秒记录警告）
    const queryDuration = Date.now() - queryStartTime
    if (queryDuration > 1000) {
      logger.warn(`⚠️ [Auth] 慢查询告警: getUserRoles(user_id=${user_id}) 耗时${queryDuration}ms`)
      logger.warn('   建议：检查数据库索引或优化查询语句')
    }

    if (!user || !user.roles) {
      const emptyResult = {
        role_level: 0, // 🔄 统一命名：使用role_level（snake_case标准）
        roles: [],
        permissions: []
      }
      // 缓存空结果，避免重复查询
      await setUserPermissionsCache(user_id, emptyResult)
      return emptyResult
    }

    // 计算最高权限级别
    const maxRoleLevel =
      user.roles.length > 0 ? Math.max(...user.roles.map(role => role.role_level)) : 0

    // 合并所有角色权限
    const allPermissions = new Set()
    user.roles.forEach(role => {
      if (role.permissions) {
        Object.entries(role.permissions).forEach(([resource, actions]) => {
          if (Array.isArray(actions)) {
            actions.forEach(action => {
              allPermissions.add(`${resource}:${action}`)
            })
          }
        })
      }
    })

    const result = {
      role_level: maxRoleLevel, // 🔄 统一命名：使用role_level（snake_case标准），管理员判断使用 role_level >= 100
      roles: user.roles.map(role => ({
        role_uuid: role.role_uuid,
        role_name: role.role_name,
        role_level: role.role_level
      })),
      permissions: Array.from(allPermissions)
    }

    // 缓存结果
    await setUserPermissionsCache(user_id, result)

    return result
  } catch (error) {
    logger.error('❌ 获取用户角色失败:', error.message)
    return {
      role_level: 0, // 🔄 统一命名：使用role_level（snake_case标准）
      roles: [],
      permissions: []
    }
  }
}

/**
 * 🔐 设备级会话 Redis 校验（热路径，docs/会话认证体系最终方案-设备级多会话.md 第四/六节）
 *
 * 决策D：Redis 命中即放行（Redis 为热路径权威），未命中才降级查 MySQL 并回填。
 * 键：session:{user_id}:{device_id}，值 JSON 含 session_token。
 * 校验通过条件：键存在 且 其中 session_token === JWT 里的 session_token。
 *
 * @param {number} user_id - JWT 中的用户ID
 * @param {string} device_id - JWT 中的设备ID
 * @param {string} session_token - JWT 中的会话令牌
 * @returns {Promise<'HIT'|'MISS'>} HIT=Redis命中且令牌一致（放行）；MISS=未命中（需降级查库）
 */
async function verifySessionViaRedis(user_id, device_id, session_token) {
  if (!redisClient || !user_id || !device_id || !session_token) {
    return 'MISS'
  }
  try {
    const key = `session:${user_id}:${device_id}`
    const raw = await redisClient.get(key)
    if (!raw) {
      return 'MISS'
    }
    const data = JSON.parse(raw)
    // 令牌一致才算命中；不一致说明该设备已被新登录轮换（旧token作废）
    return data.session_token === session_token ? 'HIT' : 'MISS'
  } catch (error) {
    logger.warn(`⚠️ [Auth] Redis会话校验异常（降级查库）: ${error.message}`)
    return 'MISS'
  }
}

/**
 * 🔁 Redis 未命中时回填会话注册表（降级容错后恢复热路径）
 *
 * @param {Object} session - MySQL 中查到的有效会话实例
 * @param {string} device_id - JWT 中的设备ID
 * @returns {Promise<void>} 无返回值（失败静默）
 */
async function backfillSessionToRedis(session, device_id) {
  if (!redisClient || !device_id || !session) {
    return
  }
  try {
    const key = `session:${session.user_id}:${device_id}`
    const expiresMs = new Date(session.expires_at).getTime() - Date.now()
    const ttl = Math.max(60, Math.floor(expiresMs / 1000))
    const value = JSON.stringify({
      session_token: session.session_token,
      user_type: session.user_type,
      login_platform: session.login_platform,
      login_ip: session.login_ip || null,
      expires_at: new Date(session.expires_at).toISOString()
    })
    await redisClient.set(key, value, 'EX', ttl)
    await redisClient.sadd(`user_sessions:${session.user_id}`, device_id)
    await redisClient.expire(`user_sessions:${session.user_id}`, ttl)
  } catch (error) {
    logger.debug(`🔁 [Auth] Redis会话回填跳过: ${error.message}`)
  }
}

/**
 * 🛡️ 生成JWT Token（基于UUID角色系统，支持会话存储）
 *
 * @description 生成 access_token 和 refresh_token，支持关联会话存储
 *
 * @param {Object} user - 用户对象
 * @param {Object} options - 可选配置
 * @param {string} options.session_token - 会话令牌（关联 authentication_sessions 表的 session_token）
 * @returns {Promise<Object>} Token信息（包含 access_token, refresh_token, session_token）
 *
 * @example
 * // 无会话存储（兼容旧逻辑）
 * const tokens = await generateTokens(user)
 *
 * // 有会话存储（2026-01-21 会话管理功能）
 * const sessionToken = require('uuid').v4()
 * const tokens = await generateTokens(user, { session_token: sessionToken })
 *
 * @since 2025
 * @updated 2026-01-21（新增 session_token 支持，用于会话管理）
 */
async function generateTokens(user, options = {}) {
  try {
    // 获取用户角色信息
    const userRoles = await getUserRoles(user.user_id)

    // 🔐 确定主要角色名称（用于前端显示）
    const primaryRole = userRoles.roles.find(r => r.role_level === userRoles.role_level)
    const userRole = primaryRole ? primaryRole.role_name : 'user'

    /**
     * 🔐 JWT Payload（B1 精简 A 案，2026-06-12）
     *
     * 安全原则（对标阿里/腾讯/游戏大厂）：JWT 只证明"你是谁"（身份 + 会话票据），
     * 不证明"你能干什么"（权限）和"你的资料"（手机号/角色/昵称）。原因：
     * - payload 是 Base64 明文（非加密），任何拿到 Token 的人可解码 → 手机号/role_level 等于半公开。
     * - role_level 放 Token 还有"权限漂移"（改了权限旧 Token 仍生效）问题。
     *
     * 故仅保留鉴权必需的最小字段：user_id（身份）+ iat（签发时间）；
     * session_token / device_id 按需附加（会话校验 / 多端）。
     * mobile / nickname / status / role_level / user_role 一律由 authenticateToken 实时查库注入 req.user，
     * 不进 Token（这些字段后端鉴权本就不依赖 payload，移除零风险）。
     */
    const payload = {
      user_id: user.user_id,
      iat: Math.floor(BeijingTimeHelper.timestamp() / 1000)
    }

    // 🆕 2026-01-21：如果传入 session_token，则添加到 JWT Payload
    if (options.session_token) {
      payload.session_token = options.session_token
    }

    /*
     * 🆕 设备级多会话：JWT 携带 device_id，middleware 用 (user_id, device_id) 走 Redis 校验。
     * device_id 不参与安全判定（安全靠 session_token + Redis + 可踢设备），前端无需解析。
     */
    if (options.device_id) {
      payload.device_id = options.device_id
    }

    const access_token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h'
    })

    const refresh_token = jwt.sign(
      { user_id: user.user_id, type: 'refresh' },
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
    )

    return {
      access_token,
      refresh_token,
      session_token: options.session_token || null, // 🆕 返回 session_token 供调用方使用
      expires_in: 24 * 60 * 60, // 24小时
      token_type: 'Bearer',
      user: {
        user_id: user.user_id,
        mobile: user.mobile,
        nickname: user.nickname,
        status: user.status,
        role_level: userRoles.role_level, // 🔄 统一使用 role_level，管理员判断: role_level >= 100
        user_role: userRole,
        roles: userRoles.roles
      }
    }
  } catch (error) {
    logger.error('❌ 生成Token失败:', error.message)
    throw error
  }
}

/**
 * 🛡️ 验证刷新Token
 * @param {string} refresh_token - 刷新Token
 * @returns {Promise<Object>} 验证结果
 */
async function verifyRefreshToken(refresh_token) {
  try {
    const decoded = jwt.verify(
      refresh_token,
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET
    )

    if (decoded.type !== 'refresh') {
      throw new Error('无效的刷新Token类型')
    }

    // 从数据库获取最新用户信息
    const user = await User.findOne({
      where: { user_id: decoded.user_id, status: 'active' }
    })

    if (!user) {
      throw new Error('用户不存在或已被禁用')
    }

    // 🛡️ 获取用户角色信息
    const userRoles = await getUserRoles(user.user_id)

    return {
      valid: true,
      user: {
        user_id: user.user_id,
        mobile: user.mobile,
        nickname: user.nickname,
        status: user.status,
        user_level: user.user_level,
        role_level: userRoles.role_level,
        roles: userRoles.roles
      }
    }
  } catch (error) {
    return {
      valid: false,
      error: error.message
    }
  }
}

/**
 * 🛡️ Token认证中间件（基于UUID角色系统）
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 * @param {Function} next - 下一个中间件
 * @returns {Promise<void>} 无返回值
 */
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.split(' ')[1]

    if (!token) {
      return res.apiUnauthorized
        ? res.apiUnauthorized('缺少认证Token', 'MISSING_TOKEN')
        : res.status(401).json({ success: false, code: 'MISSING_TOKEN', message: '缺少认证Token' })
    }

    // 验证Token
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    /**
     * 会话有效性验证（2026-06-01 设备级多会话）
     *
     * 业务规则：校验 JWT 中的 session_token（配合 device_id）在 Redis/MySQL 中是否仍有效
     * - 同设备（相同 device_id）重新登录会替换旧会话（旧 token 轮换失效）
     * - 不同设备登录并存、互不踢；旧设备会话被显式撤销/过期/清理则拒绝访问
     *
     */
    if (decoded.session_token) {
      const { AuthenticationSession } = require('../models')
      const deviceId = decoded.device_id || null

      /*
       * 🚀 设备级会话校验热路径（Redis 优先 / MySQL 降级，docs/会话认证体系最终方案-设备级多会话.md）
       * 1) Redis 命中且 session_token 一致 → 直接放行（毫秒级，决策D：Redis 为热路径权威）
       * 2) Redis 未命中 → 降级查 MySQL findValidByToken；有效则回填 Redis 后放行
       * 3) 查不到/已撤销/过期 → 401，细分 SESSION_REVOKED / SESSION_EXPIRED / SESSION_NOT_FOUND
       */
      const redisResult = await verifySessionViaRedis(
        decoded.user_id,
        deviceId,
        decoded.session_token
      )

      let session = null
      if (redisResult === 'HIT') {
        // Redis 命中即权威放行，跳过 MySQL 查询（热路径优化）
        session = null // 命中时不需要实例，活动时间更新走异步轻量逻辑
      } else {
        // 未命中：降级查 MySQL
        session = await AuthenticationSession.findValidByToken(decoded.session_token)

        if (!session) {
          // 会话无效 → 细分失效原因（前端按 code 分流）
          const rawSession = await AuthenticationSession.findOne({
            where: { session_token: decoded.session_token }
          })

          if (rawSession && !rawSession.is_active) {
            logger.warn(
              `🔒 [Auth] 会话已被撤销: session=${decoded.session_token.substring(0, 8)}..., user_id=${decoded.user_id}, device=${deviceId || 'legacy'}`
            )
            return res.apiUnauthorized
              ? res.apiUnauthorized('登录已在设备管理中退出，请重新登录', 'SESSION_REVOKED')
              : res.status(401).json({
                  success: false,
                  code: 'SESSION_REVOKED',
                  message: '登录已在设备管理中退出，请重新登录'
                })
          } else if (rawSession && rawSession.is_active) {
            logger.warn(
              `🔒 [Auth] 会话已过期: session=${decoded.session_token.substring(0, 8)}..., user_id=${decoded.user_id}`
            )
            return res.apiUnauthorized
              ? res.apiUnauthorized('登录已过期，请重新登录', 'SESSION_EXPIRED')
              : res.status(401).json({
                  success: false,
                  code: 'SESSION_EXPIRED',
                  message: '登录已过期，请重新登录'
                })
          } else {
            logger.warn(
              `🔒 [Auth] 会话记录不存在: session=${decoded.session_token.substring(0, 8)}..., user_id=${decoded.user_id}`
            )
            return res.apiUnauthorized
              ? res.apiUnauthorized('登录状态失效，请重新登录', 'SESSION_NOT_FOUND')
              : res.status(401).json({
                  success: false,
                  code: 'SESSION_NOT_FOUND',
                  message: '登录状态失效，请重新登录'
                })
          }
        }

        // MySQL 命中有效会话 → 回填 Redis（恢复热路径），随后放行
        await backfillSessionToRedis(session, deviceId)

        // 更新会话最后活动时间（异步，不阻塞请求）
        session.updateActivity().catch(err => {
          logger.warn(`⚠️ [Auth] 更新会话活动时间失败（非致命）: ${err.message}`)
        })
      }

      // 更新用户最后活跃时间（异步，用于 DAU 统计）
      const { User: UserModel, UserBehaviorTrack } = require('../models')
      UserModel.update(
        { last_active_at: new Date() },
        { where: { user_id: decoded.user_id }, silent: true }
      ).catch(err => {
        logger.warn(`⚠️ [Auth] 更新用户活跃时间失败（非致命）: ${err.message}`)
      })

      // 记录用户行为追踪（异步，不阻塞请求，每分钟最多记录一次避免写入风暴）
      if (UserBehaviorTrack) {
        ;(async () => {
          try {
            const trackKey = `track:${decoded.user_id}:${Math.floor(Date.now() / 60000)}`
            const { getRedisClient } = require('../utils/UnifiedRedisClient')
            const redisCli = getRedisClient()
            const wasSet = await redisCli.set(trackKey, '1', 'EX', 60, 'NX')
            if (wasSet) {
              await UserBehaviorTrack.create({
                user_id: decoded.user_id,
                behavior_type: 'api_access',
                behavior_action: req.method.toLowerCase(),
                behavior_target: 'api',
                behavior_data: { path: req.path },
                behavior_result: 'success',
                behavior_time: new Date(),
                ip_address: req.ip
              })
            }
          } catch (_) {
            /* 非致命，静默忽略 */
          }
        })()
      }
    }

    // 从数据库获取最新用户信息（包含user_uuid字段）
    const user = await User.findOne({
      where: { user_id: decoded.user_id, status: 'active' },
      attributes: ['user_id', 'user_uuid', 'mobile', 'nickname', 'status', 'user_level']
    })

    if (!user) {
      return res.apiUnauthorized
        ? res.apiUnauthorized('用户不存在或已被禁用', 'USER_NOT_FOUND')
        : res
            .status(401)
            .json({ success: false, code: 'USER_NOT_FOUND', message: '用户不存在或已被禁用' })
    }

    // 🛡️ 获取用户角色信息
    const userRoles = await getUserRoles(user.user_id)

    // 构建用户信息对象（包含user_uuid）
    const userInfo = {
      user_id: user.user_id,
      user_uuid: user.user_uuid,
      mobile: user.mobile,
      nickname: user.nickname,
      status: user.status,
      user_level: user.user_level,
      role_level: userRoles.role_level,
      roles: userRoles.roles,
      permissions: userRoles.permissions,
      session_token: decoded.session_token,
      device_id: decoded.device_id || null
    }

    // 一次性设置用户信息，避免竞态条件
    // eslint-disable-next-line require-atomic-updates
    req.user = userInfo

    /*
     * 🛡️ 设置角色级别（用于路由层权限判断）
     * 管理员判断：req.role_level >= 100
     */
    // eslint-disable-next-line require-atomic-updates
    req.role_level = userRoles.role_level

    next()
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.apiUnauthorized
        ? res.apiUnauthorized('无效的Token', 'INVALID_TOKEN')
        : res.status(401).json({ success: false, code: 'INVALID_TOKEN', message: '无效的Token' })
    } else if (error.name === 'TokenExpiredError') {
      return res.apiUnauthorized
        ? res.apiUnauthorized('Token已过期', 'TOKEN_EXPIRED')
        : res.status(401).json({ success: false, code: 'TOKEN_EXPIRED', message: 'Token已过期' })
    } else {
      logger.error('❌ Token认证失败:', error.message)
      return res.apiUnauthorized
        ? res.apiUnauthorized('认证失败', 'AUTH_FAILED')
        : res.status(401).json({ success: false, code: 'AUTH_FAILED', message: '认证失败' })
    }
  }
}

/**
 * 🛡️ 基于 role_level 的权限检查中间件（推荐使用）
 *
 * @description 直接使用 role_level 数值判断，无映射表，无技术债务
 * @file middleware/auth.js
 * @created 2026-01-27（role_level 映射方案技术评估 - 决策已确认）
 *
 * 设计决策：
 * - 废除 ROLE_LEVEL_MAP 映射表
 * - role_level 为唯一权限判断依据
 * - role_name 仅用于显示和日志
 *
 * 阈值参考（以数据库实际值为准）：
 * - ADMIN: 100（超级管理员）
 * - OPS: 30（运营及以上）
 * - CUSTOMER_SERVICE: 1（客服及以上）
 *
 * @param {number} min_level - 最低权限等级
 * @returns {Function} Express 中间件函数
 *
 * @example
 * // 运营及以上（role_level >= 30）
 * router.use(authenticateToken, requireRoleLevel(30))
 *
 * // 仅管理员（role_level >= 100）
 * router.use(authenticateToken, requireRoleLevel(100))
 *
 * // 使用常量
 * const { PERMISSION_LEVELS } = require('../shared/permission-constants')
 * router.use(authenticateToken, requireRoleLevel(PERMISSION_LEVELS.OPS))
 */
function requireRoleLevel(min_level) {
  return async (req, res, next) => {
    try {
      // 1. 验证是否已认证
      if (!req.user) {
        return res.apiUnauthorized
          ? res.apiUnauthorized('未认证用户', 'UNAUTHENTICATED')
          : res.status(401).json({ success: false, code: 'UNAUTHENTICATED', message: '未认证用户' })
      }

      // 2. 获取用户权限等级
      const user_level = req.user.role_level || 0

      // 3. 权限等级检查
      if (user_level < min_level) {
        logger.warn(
          `🚫 [Auth] 权限等级不足: user_id=${req.user.user_id}, ` +
            `需要>=${min_level}, 实际=${user_level}`
        )
        return res.apiForbidden
          ? res.apiForbidden(`需要权限等级 ${min_level} 以上`, 'INSUFFICIENT_LEVEL', {
              required_level: min_level,
              current_level: user_level
            })
          : res.status(403).json({
              success: false,
              code: 'INSUFFICIENT_LEVEL',
              message: `需要权限等级 ${min_level} 以上`,
              data: { required_level: min_level, current_level: user_level }
            })
      }

      // 4. 通过权限检查
      next()
    } catch (error) {
      logger.error('❌ 权限等级检查失败:', error.message)
      return res.apiError
        ? res.apiError('权限验证失败', 'LEVEL_CHECK_FAILED', null, 500)
        : res.status(500).json({
            success: false,
            code: 'LEVEL_CHECK_FAILED',
            message: '权限验证失败'
          })
    }
  }
}

/**
 * 🛡️ 可选Token认证中间件（用于公开接口）
 * @description 尝试认证用户，如果有token则设置用户信息，没有token则允许匿名访问
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 * @param {Function} next - 下一个中间件
 * @returns {Promise<void>} 无返回值（总是调用next()，允许继续处理请求）
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization
    const token = authHeader && authHeader.split(' ')[1]

    // 如果没有token，直接通过（匿名访问）
    if (!token) {
      return next()
    }

    // 有token时，尝试验证
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET)

      // 从数据库获取最新用户信息
      const user = await User.findOne({
        where: { user_id: decoded.user_id, status: 'active' }
      })

      if (!user) {
        // token无效但允许匿名访问
        return next()
      }

      // 🛡️ 获取用户角色信息
      const userRoles = await getUserRoles(user.user_id)

      // 构建用户信息对象
      const userInfo = {
        user_id: user.user_id,
        mobile: user.mobile,
        nickname: user.nickname,
        status: user.status,
        role_level: userRoles.role_level, // 🔄 统一命名：使用role_level
        roles: userRoles.roles,
        permissions: userRoles.permissions
      }

      // 一次性设置用户信息，避免竞态条件
      // eslint-disable-next-line require-atomic-updates
      req.user = userInfo

      // 🛡️ 设置角色级别（管理员判断：req.role_level >= 100）
      // eslint-disable-next-line require-atomic-updates
      req.role_level = userRoles.role_level

      next()
    } catch (tokenError) {
      // Token错误也允许匿名访问（不返回错误）
      logger.warn('⚠️ Token验证失败但允许匿名访问:', tokenError.message)
      next()
    }
  } catch (error) {
    logger.error('❌ 可选认证失败:', error.message)
    // 发生错误也允许匿名访问
    next()
  }
}

/**
 * 🛡️ 权限检查中间件（基于UUID角色系统）
 * @param {string} requiredPermission - 需要的权限
 * @returns {Function} 中间件函数
 */
function requirePermission(requiredPermission) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.apiUnauthorized
          ? res.apiUnauthorized('未认证用户', 'UNAUTHENTICATED')
          : res.status(401).json({ success: false, code: 'UNAUTHENTICATED', message: '未认证用户' })
      }

      // 超级管理员拥有所有权限
      if (req.user.role_level >= 100) {
        return next()
      }

      // 检查具体权限
      const [resource] = requiredPermission.split(':')

      // 检查通配符权限
      if (
        req.user.permissions.includes('*:*') ||
        req.user.permissions.includes(`${resource}:*`) ||
        req.user.permissions.includes(requiredPermission)
      ) {
        return next()
      }

      return res.apiForbidden
        ? res.apiForbidden('权限不足', 'INSUFFICIENT_PERMISSION', {
            required: requiredPermission,
            user_permissions: req.user.permissions
          })
        : res.status(403).json({
            success: false,
            code: 'INSUFFICIENT_PERMISSION',
            message: '权限不足',
            data: { required: requiredPermission, user_permissions: req.user.permissions }
          })
    } catch (error) {
      logger.error('❌ 权限检查失败:', error.message)
      return res.apiError
        ? res.apiError('权限验证失败', 'PERMISSION_CHECK_FAILED', null, 500)
        : res
            .status(500)
            .json({ success: false, code: 'PERMISSION_CHECK_FAILED', message: '权限验证失败' })
    }
  }
}

/**
 * 🏪 获取用户所属的所有在职门店
 *
 * @description 查询 store_staff 表获取用户所有 status='active' 的门店记录
 *
 * @param {number} user_id - 用户ID
 * @returns {Promise<Array>} 门店列表，每个元素包含 {store_id, store_name, role_in_store}
 *
 * @example
 * const stores = await getUserStores(123)
 * // 返回：[{ store_id: 1, store_name: '测试门店', role_in_store: 'staff' }]
 *
 * @since 2026
 */
async function getUserStores(user_id) {
  try {
    const storeStaffRecords = await StoreStaff.findAll({
      where: {
        user_id,
        status: 'active'
      },
      include: [
        {
          association: 'store',
          attributes: ['store_id', 'store_name', 'store_code', 'status'],
          required: true
        }
      ]
    })

    return storeStaffRecords.map(record => ({
      store_id: record.store_id,
      store_name: record.store?.store_name || null,
      store_code: record.store?.store_code || null,
      store_status: record.store?.status || null,
      role_in_store: record.role_in_store,
      joined_at: record.joined_at
    }))
  } catch (error) {
    logger.error(`❌ [Auth] 获取用户门店列表失败: user_id=${user_id}`, error.message)
    return []
  }
}

/**
 * 🏪 检查用户是否在指定门店在职
 *
 * @param {number} user_id - 用户ID
 * @param {number} store_id - 门店ID
 * @returns {Promise<boolean>} 是否在职
 *
 * @since 2026
 */
async function isUserActiveInStore(user_id, store_id) {
  try {
    const count = await StoreStaff.count({
      where: {
        user_id,
        store_id,
        status: 'active'
      }
    })
    return count > 0
  } catch (error) {
    logger.error(
      `❌ [Auth] 检查门店在职状态失败: user_id=${user_id}, store_id=${store_id}`,
      error.message
    )
    return false
  }
}

/**
 * 🏪 商家域准入中间件（2026-01-12 商家员工域权限体系升级 AC1.4）
 *
 * @description 强制隔离商家域入口：仅允许商家员工/店长访问 /api/v4/shop/*
 *
 * 业务规则：
 * 1. 超级管理员（role_level >= 100）可直接访问（兜底能力，但不建议日常使用）
 * 2. 非管理员用户必须满足以下所有条件：
 *    - 角色名称为 merchant_staff 或 merchant_manager
 *    - 在 store_staff 表中至少有一个 status='active' 的记录
 * 3. 平台内部角色（ops/regional_manager/business_manager/sales_staff）禁止访问商家域
 *
 * 安全意义：
 * - 防止平台内部角色误用商家域接口
 * - 确保商家域操作只能由真正的门店员工执行
 * - 为后续门店级别隔离打下基础
 *
 * @returns {Function} Express 中间件函数
 *
 * @example
 * // 在 routes/v4/shop/index.js 入口使用
 * router.use(authenticateToken, requireMerchantDomainAccess())
 *
 * @since 2026
 */
function requireMerchantDomainAccess() {
  // 允许访问商家域的角色名称列表
  const ALLOWED_MERCHANT_ROLES = ['merchant_staff', 'merchant_manager']

  return async (req, res, next) => {
    try {
      // 1. 验证是否已认证
      if (!req.user) {
        return res.apiUnauthorized
          ? res.apiUnauthorized('未认证用户', 'UNAUTHENTICATED')
          : res.status(401).json({
              success: false,
              code: 'UNAUTHENTICATED',
              message: '未认证用户'
            })
      }

      const userRoleLevel = req.user.role_level || 0
      const userRoleNames = req.user.roles?.map(r => r.role_name) || []
      const userId = req.user.user_id

      // 2. 超级管理员跳过所有检查（兜底能力）
      if (userRoleLevel >= 100) {
        logger.info(
          `🛡️ [MerchantDomain] 管理员访问商家域: user_id=${userId}, role_level=${userRoleLevel}`
        )
        return next()
      }

      // 3. 检查是否为商家域角色
      const isMerchantRole = ALLOWED_MERCHANT_ROLES.some(role => userRoleNames.includes(role))

      if (!isMerchantRole) {
        logger.warn(
          `🚫 [MerchantDomain] 非商家角色被拒绝: user_id=${userId}, roles=[${userRoleNames.join(',')}]`
        )
        return res.apiForbidden
          ? res.apiForbidden(
              '此接口仅限商家员工使用，平台内部角色请使用 /api/v4/console/* 接口',
              'MERCHANT_DOMAIN_ACCESS_DENIED',
              {
                user_roles: userRoleNames,
                allowed_roles: ALLOWED_MERCHANT_ROLES,
                suggestion: '请联系管理员分配商家员工角色，或使用 /api/v4/console/* 接口'
              }
            )
          : res.status(403).json({
              success: false,
              code: 'MERCHANT_DOMAIN_ACCESS_DENIED',
              message: '此接口仅限商家员工使用，平台内部角色请使用 /api/v4/console/* 接口',
              data: {
                user_roles: userRoleNames,
                allowed_roles: ALLOWED_MERCHANT_ROLES
              }
            })
      }

      // 4. 检查是否在 store_staff 表中有活跃记录
      const userStores = await getUserStores(userId)

      if (!userStores || userStores.length === 0) {
        logger.warn(`🚫 [MerchantDomain] 无门店绑定被拒绝: user_id=${userId}`)
        return res.apiForbidden
          ? res.apiForbidden('您尚未绑定任何门店，无法访问商家域接口', 'NO_STORE_BINDING', {
              suggestion: '请联系店长或管理员添加您的门店绑定'
            })
          : res.status(403).json({
              success: false,
              code: 'NO_STORE_BINDING',
              message: '您尚未绑定任何门店，无法访问商家域接口',
              data: {
                suggestion: '请联系店长或管理员添加您的门店绑定'
              }
            })
      }

      // 5. 将用户门店信息挂载到请求对象（供后续中间件和路由使用）
      // eslint-disable-next-line require-atomic-updates
      req.user_stores = userStores

      // 如果用户只绑定了一个门店，自动设置当前门店（简化后续操作）
      if (userStores.length === 1) {
        // eslint-disable-next-line require-atomic-updates
        req.current_store_id = userStores[0].store_id
        // eslint-disable-next-line require-atomic-updates
        req.current_store = userStores[0]
      }

      logger.info(
        `✅ [MerchantDomain] 商家域准入通过: user_id=${userId}, stores=[${userStores.map(s => s.store_id).join(',')}]`
      )

      next()
    } catch (error) {
      logger.error('❌ [MerchantDomain] 商家域准入检查失败:', error.message)
      return res.apiError
        ? res.apiError('商家域准入检查失败', 'MERCHANT_DOMAIN_CHECK_FAILED', null, 500)
        : res.status(500).json({
            success: false,
            code: 'MERCHANT_DOMAIN_CHECK_FAILED',
            message: '商家域准入检查失败'
          })
    }
  }
}

/**
 * 🛡️ 商家权限检查中间件（支持门店范围隔离）
 *
 * @description 检查用户是否具有指定的商家域权限，并可选验证门店访问权限
 *
 * 设计决策（2026-01-12 商家员工域权限体系升级；2026-06-11 议题3 门店上下文收口）：
 * - 本中间件只负责"能力位/权限"校验。
 * - 门店范围解析/校验已收口到 resolveStoreContext 中间件（需要门店上下文的路由在其后挂载）。
 * - 超级管理员（role_level >= 100）跳过权限校验（门店上下文仍由 resolveStoreContext 处理）。
 *
 * @param {string} capability - 需要的权限（如 'consumption:create'）
 * @param {Object} [_options] - 兼容旧调用签名的配置（scope/storeIdParam，已不再在此使用）
 * @returns {Function} 中间件函数
 *
 * @example
 * // 全局权限检查（不验证门店）
 * router.get('/list', authenticateToken, requireMerchantPermission('consumption:read'), handler)
 *
 * // 门店范围权限检查（验证用户是否在 request.body.store_id 对应门店在职）
 * router.post('/submit', authenticateToken, requireMerchantPermission('consumption:create', { scope: 'store' }), handler)
 *
 * @since 2026
 */
function requireMerchantPermission(capability, _options = {}) {
  /*
   * 议题3：本中间件只负责"能力位/权限"校验。门店范围（scope/storeIdParam）已收口到
   * resolveStoreContext 中间件，故 options 参数保留以兼容现有调用签名，但不再在此使用。
   */

  return async (req, res, next) => {
    try {
      // 1. 验证是否已认证
      if (!req.user) {
        return res.apiUnauthorized
          ? res.apiUnauthorized('未认证用户', 'UNAUTHENTICATED')
          : res.status(401).json({ success: false, code: 'UNAUTHENTICATED', message: '未认证用户' })
      }

      // 2. 超级管理员跳过所有检查
      if (req.user.role_level >= 100) {
        return next()
      }

      // 3. 检查具体权限
      const [resource] = capability.split(':')
      const hasPermission =
        req.user.permissions.includes('*:*') ||
        req.user.permissions.includes(`${resource}:*`) ||
        req.user.permissions.includes(capability)

      if (!hasPermission) {
        logger.warn(
          `🚫 [Auth] 商家权限不足: user_id=${req.user.user_id}, required=${capability}, user_permissions=[${req.user.permissions.join(',')}]`
        )
        return res.apiForbidden
          ? res.apiForbidden(
              `权限不足，需要 ${capability} 权限`,
              'INSUFFICIENT_MERCHANT_PERMISSION',
              {
                required: capability,
                user_permissions: req.user.permissions
              }
            )
          : res.status(403).json({
              success: false,
              code: 'INSUFFICIENT_MERCHANT_PERMISSION',
              message: `权限不足，需要 ${capability} 权限`,
              data: { required: capability, user_permissions: req.user.permissions }
            })
      }

      /*
       * 4. 门店范围权限：门店上下文解析已收口到 resolveStoreContext 中间件（议题3·方案丙）。
       *    本中间件只负责"能力位"校验，不再解析/校验门店，避免与 resolveStoreContext 重复，
       *    也避免历史"管理员提前 next 跳过门店填充"缺陷。
       *    需要门店上下文的路由请在本中间件之后挂载 resolveStoreContext({ storeIdParam })。
       * 5. 通过权限检查
       */
      next()
    } catch (error) {
      logger.error('❌ 商家权限检查失败:', error.message)
      return res.apiError
        ? res.apiError('商家权限验证失败', 'MERCHANT_PERMISSION_CHECK_FAILED', null, 500)
        : res.status(500).json({
            success: false,
            code: 'MERCHANT_PERMISSION_CHECK_FAILED',
            message: '商家权限验证失败'
          })
    }
  }
}

/**
 * 🎯 权限管理工具
 */
const PermissionManager = {
  // 清除用户缓存
  invalidateUser: invalidateUserPermissions,

  // 获取缓存统计
  getStats: () => ({
    ...cacheStats,
    memoryCacheSize: memoryCache.size,
    hitRate:
      cacheStats.totalQueries > 0
        ? (
            ((cacheStats.memoryHits + cacheStats.redisHits) / cacheStats.totalQueries) *
            100
          ).toFixed(1) + '%'
        : '0%',
    redisAvailable: !!redisClient
  }),

  // 强制刷新用户权限
  forceRefreshUser: user_id => getUserRoles(user_id, true),

  // 批量清除缓存
  invalidateMultipleUsers: async (userIds, reason = 'batch_operation') => {
    await Promise.all(userIds.map(user_id => invalidateUserPermissions(user_id, reason)))
  }
}

module.exports = {
  getUserRoles,
  generateTokens,
  verifyRefreshToken,
  authenticateToken,
  optionalAuth, // 可选认证中间件（用于公开接口）
  requireRoleLevel, // 🛡️ 基于 role_level 的权限检查中间件（推荐使用）
  requirePermission,
  requireMerchantDomainAccess, // 🆕 商家域准入中间件（AC1.4 域边界隔离）
  requireMerchantPermission, // 🆕 商家权限检查中间件（支持门店范围隔离）
  getUserStores, // 🆕 获取用户所属门店列表
  isUserActiveInStore, // 🆕 检查用户是否在指定门店在职
  PermissionManager,
  invalidateUserPermissions
}
