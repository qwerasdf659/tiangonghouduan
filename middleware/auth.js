const Logger = require('../services/UnifiedLotteryEngine/utils/Logger')
const logger = new Logger('auth')

/**
 * 统一认证中间件 - V4.0 统一架构版本
 * 🛡️ 权限认证：完全使用UUID角色系统，移除is_admin字段依赖
 * 🚀 性能优化：集成内存+Redis双层缓存，智能降级
 * 创建时间：2025年01月21日
 * 更新时间：2025年01月28日
 */

const jwt = require('jsonwebtoken')
const { User, Role } = require('../models')
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
 * 🗑️ 清除用户权限缓存
 * @param {number} user_id - 用户ID
 * @param {string} reason - 清除原因
 * @returns {Promise<void>} 无返回值
 */
async function invalidateUserPermissions(user_id, reason = 'unknown') {
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

  logger.info(`🔄 [Auth] 清除用户权限缓存: ${user_id} (原因: ${reason})`)
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
        isAdmin: false,
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
      isAdmin: maxRoleLevel >= 100, // 🛡️ 基于角色级别计算管理员权限
      role_level: maxRoleLevel, // 🔄 统一命名：使用role_level替代roleLevel（snake_case标准）
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
      isAdmin: false,
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

    const payload = {
      user_id: user.user_id,
      mobile: user.mobile,
      nickname: user.nickname,
      status: user.status,
      role_level: userRoles.role_level, // 🛡️ 基于角色计算
      is_admin: userRoles.isAdmin, // 🔐 管理员标识
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
        role_level: userRoles.role_level, // 🔄 统一命名：使用role_level
        is_admin: userRoles.isAdmin,
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
      return res.status(401).json({
        success: false,
        error: 'MISSING_TOKEN',
        message: '缺少认证Token'
      })
    }

    // 验证Token
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    // 从数据库获取最新用户信息（包含user_uuid字段）
    const user = await User.findOne({
      where: { user_id: decoded.user_id, status: 'active' },
      attributes: ['user_id', 'user_uuid', 'mobile', 'nickname', 'status'] // 明确包含user_uuid
    })

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: '用户不存在或已被禁用'
      })
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
     * 🛡️ 设置管理员标识（基于角色级别 >= 100）
     * 用于路由层快速判断管理员权限
     */
    // eslint-disable-next-line require-atomic-updates
    req.isAdmin = userRoles.isAdmin

    next()
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'INVALID_TOKEN',
        message: '无效的Token'
      })
    } else if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'TOKEN_EXPIRED',
        message: 'Token已过期'
      })
    } else {
      logger.error('❌ Token认证失败:', error.message)
      return res.status(401).json({
        success: false,
        error: 'AUTH_FAILED',
        message: '认证失败'
      })
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
      return res.status(401).json({
        success: false,
        error: 'UNAUTHENTICATED',
        message: '未认证用户'
      })
    }

    if (req.user.role_level < 100) {
      return res.status(403).json({
        success: false,
        error: 'INSUFFICIENT_PERMISSION',
        message: '需要管理员权限'
      })
    }

    next()
  } catch (error) {
    logger.error('❌ 管理员权限验证失败:', error.message)
    return res.status(500).json({
      success: false,
      error: 'PERMISSION_CHECK_FAILED',
      message: '权限验证失败'
    })
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

      // 🛡️ 设置管理员标识（基于角色级别 >= 100）
      // eslint-disable-next-line require-atomic-updates
      req.isAdmin = userRoles.isAdmin

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
        return res.status(401).json({
          success: false,
          error: 'UNAUTHENTICATED',
          message: '未认证用户'
        })
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

      return res.status(403).json({
        success: false,
        error: 'INSUFFICIENT_PERMISSION',
        message: '权限不足',
        data: {
          required: requiredPermission,
          user_permissions: req.user.permissions
        }
      })
    } catch (error) {
      logger.error('❌ 权限检查失败:', error.message)
      return res.status(500).json({
        success: false,
        error: 'PERMISSION_CHECK_FAILED',
        message: '权限验证失败'
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
  requirePermission,
  PermissionManager,
  invalidateUserPermissions
}
