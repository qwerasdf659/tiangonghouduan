const logger = require('../utils/logger').logger

/**
 * 统一认证中间件 - V4.0 统一架构版本
 * 🛡️ 权限认证：完全使用UUID角色系统，移除is_admin字段依赖
 * 🚀 性能优化：集成内存+Redis双层缓存，智能降级
 * 创建时间：2025年01月21日
 * 更新时间：2025年01月28日
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
const MEMORY_TTL = 5 * 60 * 1000 // 5分钟
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
 * 🛡️ 生成JWT Token（基于UUID角色系统）
 * @param {Object} user - 用户对象
 * @returns {Promise<Object>} Token信息
 */
async function generateTokens(user) {
  try {
    // 获取用户角色信息
    const userRoles = await getUserRoles(user.user_id)

    // 🔐 确定主要角色名称（用于前端显示）
    const primaryRole = userRoles.roles.find(r => r.role_level === userRoles.role_level)
    const userRole = primaryRole ? primaryRole.role_name : 'user'

    /**
     * 🔐 JWT Payload（P1-2修复：移除is_admin字段）
     * 原因：管理员权限应实时从数据库查询，而非存储在Token中
     * 安全性：避免权限变更后Token未过期导致的权限漂移问题
     */
    const payload = {
      user_id: user.user_id,
      mobile: user.mobile,
      nickname: user.nickname,
      status: user.status,
      role_level: userRoles.role_level, // 🛡️ 基于角色计算
      // P1-2修复：移除is_admin字段，权限实时查询而非存储在JWT中
      user_role: userRole, // 🔐 角色名称
      iat: Math.floor(BeijingTimeHelper.timestamp() / 1000)
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
        role_level: userRoles.role_level, // 🔄 统一命名：使用role_level
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

    // 从数据库获取最新用户信息（包含user_uuid字段）
    const user = await User.findOne({
      where: { user_id: decoded.user_id, status: 'active' },
      attributes: ['user_id', 'user_uuid', 'mobile', 'nickname', 'status'] // 明确包含user_uuid
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
      user_uuid: user.user_uuid, // ⭐ 新增：用户UUID（用于QR码生成）
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
 * 🛡️ 管理员权限验证中间件（基于UUID角色系统）
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 * @param {Function} next - 下一个中间件
 * @returns {Promise<void>} 无返回值（验证通过调用next()，失败返回错误响应）
 */
async function requireAdmin(req, res, next) {
  try {
    if (!req.user) {
      return res.apiUnauthorized
        ? res.apiUnauthorized('未认证用户', 'UNAUTHENTICATED')
        : res.status(401).json({ success: false, code: 'UNAUTHENTICATED', message: '未认证用户' })
    }

    if (req.user.role_level < 100) {
      return res.apiForbidden
        ? res.apiForbidden('需要管理员权限', 'INSUFFICIENT_PERMISSION')
        : res
            .status(403)
            .json({ success: false, code: 'INSUFFICIENT_PERMISSION', message: '需要管理员权限' })
    }

    next()
  } catch (error) {
    logger.error('❌ 管理员权限验证失败:', error.message)
    return res.apiError
      ? res.apiError('权限验证失败', 'PERMISSION_CHECK_FAILED', null, 500)
      : res
          .status(500)
          .json({ success: false, code: 'PERMISSION_CHECK_FAILED', message: '权限验证失败' })
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
 * 🛡️ 角色检查中间件（支持多角色 + 读写权限区分）
 *
 * 功能说明（2026-01-07 架构重构）：
 * - 支持多角色检查：requireRole(['admin', 'ops'])
 * - 按能力细分：ops 只读、admin 可写
 * - 普通用户：访问 console 接口返回 403
 *
 * 权限模型（已拍板 2026-01-07）：
 * - admin 角色（role_level >= 100）：可读可写所有 console 接口
 * - ops 角色（role_level = 30）：仅可读（GET 请求）；POST/PUT/DELETE 返回 403
 * - 普通用户（role_level < 30）：访问 console 接口返回 403
 *
 * @param {string|string[]} allowedRoles - 允许的角色名称（单个或数组）
 * @param {Object} _options - 配置选项（保留，未来扩展用）
 * @returns {Function} 中间件函数
 *
 * @example
 * // 允许 admin 和 ops 角色访问，ops 只能读
 * router.get('/portfolio', authenticateToken, requireRole(['admin', 'ops']), handler)
 *
 * // 仅允许 admin 角色访问（写操作）
 * router.post('/adjust', authenticateToken, requireRole('admin'), handler)
 */
function requireRole(allowedRoles, _options = {}) {
  // 统一转换为数组
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]

  return async (req, res, next) => {
    try {
      // 1. 验证是否已认证
      if (!req.user) {
        return res.apiUnauthorized
          ? res.apiUnauthorized('未认证用户', 'UNAUTHENTICATED')
          : res.status(401).json({ success: false, code: 'UNAUTHENTICATED', message: '未认证用户' })
      }

      // 2. 获取用户角色名称列表
      const userRoleNames = req.user.roles?.map(r => r.role_name) || []
      const userRoleLevel = req.user.role_level || 0

      // 3. 检查是否有匹配的角色
      const hasMatchingRole = roles.some(role => {
        // 角色名称匹配
        if (userRoleNames.includes(role)) {
          return true
        }

        // 角色级别匹配（admin = 100+, ops = 30）
        if (role === 'admin' && userRoleLevel >= 100) {
          return true
        }

        return false
      })

      if (!hasMatchingRole) {
        logger.warn(
          `🚫 [Auth] 角色权限不足: user_id=${req.user.user_id}, 需要角色=[${roles.join(',')}], 用户角色=[${userRoleNames.join(',')}]`
        )
        return res.apiForbidden
          ? res.apiForbidden(
              '角色权限不足，需要 ' + roles.join(' 或 ') + ' 角色',
              'INSUFFICIENT_ROLE'
            )
          : res.status(403).json({
              success: false,
              code: 'INSUFFICIENT_ROLE',
              message: '角色权限不足，需要 ' + roles.join(' 或 ') + ' 角色'
            })
      }

      // 4. 检查 ops 角色的读写权限（ops 只能读，不能写）
      const isOpsRole = userRoleNames.includes('ops') && userRoleLevel < 100
      const isWriteOperation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)

      if (isOpsRole && isWriteOperation) {
        logger.warn(
          `🚫 [Auth] ops角色不能执行写操作: user_id=${req.user.user_id}, method=${req.method}, path=${req.path}`
        )
        return res.apiForbidden
          ? res.apiForbidden(
              'ops 角色仅可读，不能执行写操作（POST/PUT/PATCH/DELETE）',
              'OPS_READ_ONLY'
            )
          : res.status(403).json({
              success: false,
              code: 'OPS_READ_ONLY',
              message: 'ops 角色仅可读，不能执行写操作（POST/PUT/PATCH/DELETE）'
            })
      }

      // 5. 通过权限检查
      next()
    } catch (error) {
      logger.error('❌ 角色权限检查失败:', error.message)
      return res.apiError
        ? res.apiError('角色权限验证失败', 'ROLE_CHECK_FAILED', null, 500)
        : res
            .status(500)
            .json({ success: false, code: 'ROLE_CHECK_FAILED', message: '角色权限验证失败' })
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
 * @since 2026-01-12
 * @see docs/商家员工域权限体系升级方案.md - AC2 组织边界隔离
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
 * @since 2026-01-12
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
 * @since 2026-01-12
 * @see docs/商家员工域权限体系升级方案.md - AC1.4 域边界强制隔离
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
 * 设计决策（2026-01-12 商家员工域权限体系升级）：
 * - 支持两种 scope：'global'（全局权限）和 'store'（门店范围权限）
 * - scope='store' 时，要求请求中包含 store_id 参数，并验证用户在该门店在职
 * - 超级管理员（role_level >= 100）跳过所有检查
 *
 * @param {string} capability - 需要的权限（如 'consumption:create'）
 * @param {Object} options - 配置选项
 * @param {string} options.scope - 权限范围：'global' | 'store'，默认 'global'
 * @param {string} options.storeIdParam - store_id 参数来源：'body' | 'query' | 'params'，默认 'body'
 * @returns {Function} 中间件函数
 *
 * @example
 * // 全局权限检查（不验证门店）
 * router.get('/list', authenticateToken, requireMerchantPermission('consumption:read'), handler)
 *
 * // 门店范围权限检查（验证用户是否在 request.body.store_id 对应门店在职）
 * router.post('/submit', authenticateToken, requireMerchantPermission('consumption:create', { scope: 'store' }), handler)
 *
 * @since 2026-01-12
 * @see docs/商家员工域权限体系升级方案.md - AC1 权限分层
 */
function requireMerchantPermission(capability, options = {}) {
  const { scope = 'global', storeIdParam = 'body' } = options

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

      // 4. 如果是门店范围权限，验证 store_id 访问权限
      if (scope === 'store') {
        // 获取 store_id
        let storeId = null
        if (storeIdParam === 'body') {
          storeId = req.body?.store_id
        } else if (storeIdParam === 'query') {
          storeId = req.query?.store_id
        } else if (storeIdParam === 'params') {
          storeId = req.params?.store_id
        }

        // store_id 可选：如果没有提供，后续由 Service 层自动填充
        if (storeId) {
          const storeIdNum = parseInt(storeId, 10)
          if (isNaN(storeIdNum) || storeIdNum <= 0) {
            return res.apiError
              ? res.apiError('store_id 必须是有效的正整数', 'INVALID_STORE_ID', null, 400)
              : res.status(400).json({
                  success: false,
                  code: 'INVALID_STORE_ID',
                  message: 'store_id 必须是有效的正整数'
                })
          }

          // 验证用户是否在该门店在职
          const isActive = await isUserActiveInStore(req.user.user_id, storeIdNum)
          if (!isActive) {
            logger.warn(
              `🚫 [Auth] 门店访问被拒绝: user_id=${req.user.user_id}, store_id=${storeIdNum}`
            )
            return res.apiForbidden
              ? res.apiForbidden('您不是该门店的在职员工，无法执行此操作', 'STORE_ACCESS_DENIED')
              : res.status(403).json({
                  success: false,
                  code: 'STORE_ACCESS_DENIED',
                  message: '您不是该门店的在职员工，无法执行此操作'
                })
          }

          // 将验证过的 store_id 挂载到请求对象
          // eslint-disable-next-line require-atomic-updates
          req.verified_store_id = storeIdNum
        }

        // 获取用户所有在职门店（供 Service 层使用）
        // eslint-disable-next-line require-atomic-updates
        req.user_stores = await getUserStores(req.user.user_id)
      }

      // 5. 通过权限检查
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
  requireAdmin,
  requireRole, // 🆕 角色检查中间件（支持多角色 + 读写权限区分）
  requirePermission,
  requireMerchantDomainAccess, // 🆕 商家域准入中间件（AC1.4 域边界隔离）
  requireMerchantPermission, // 🆕 商家权限检查中间件（支持门店范围隔离）
  getUserStores, // 🆕 获取用户所属门店列表
  isUserActiveInStore, // 🆕 检查用户是否在指定门店在职
  PermissionManager,
  invalidateUserPermissions
}
