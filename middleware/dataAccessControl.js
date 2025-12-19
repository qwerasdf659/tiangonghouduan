const logger = require('../utils/logger').logger

/**
 * 统一数据访问控制中间件 - V4.0 统一架构版本
 * 用于所有需要数据脱敏的API路由
 * 🛡️ 基于UUID角色系统的数据访问控制
 *
 * 使用方式：
 * router.get('/api/endpoint', authenticateToken, dataAccessControl, handler)
 */

const dataAccessControl = (req, res, next) => {
  try {
    // 对于公开接口，允许未认证用户访问，但设置为公开数据级别
    if (!req.user) {
      req.dataLevel = 'public'
      req.roleBasedAdmin = false
      req.isAdmin = false // 未认证用户不是管理员
      logger.info('[DataAccess] Anonymous user accessing with level: public')
      return next()
    }

    // 🛡️ 基于UUID角色系统判断用户数据访问级别
    const isSuperAdmin = req.user.role_level >= 100

    // 设置数据访问级别标识
    req.dataLevel = isSuperAdmin ? 'full' : 'public'
    req.roleBasedAdmin = isSuperAdmin
    // req.isAdmin 由 auth.js 中间件设置，此处仅用于未认证用户的情况

    // 记录访问日志（脱敏处理）
    logger.info(`[DataAccess] User ${req.user.user_id} accessing with level: ${req.dataLevel}`)

    next()
  } catch (error) {
    logger.error('[DataAccess] Middleware error:', error)
    return res.status(500).json({
      success: false,
      message: '权限检查失败',
      code: 'ACCESS_CONTROL_ERROR'
    })
  }
}

module.exports = dataAccessControl
