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
    // 检查用户是否已认证
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: '用户未认证',
        code: 'UNAUTHORIZED'
      })
    }

    // 🛡️ 基于UUID角色系统判断用户数据访问级别
    const isSuperAdmin = req.user.role_level >= 100

    // 设置数据访问级别标识
    req.dataLevel = isSuperAdmin ? 'full' : 'public'
    req.isAdmin = isSuperAdmin

    // 记录访问日志（脱敏处理）
    console.log(`[DataAccess] User ${req.user.user_id} accessing with level: ${req.dataLevel}`)

    next()
  } catch (error) {
    console.error('[DataAccess] Middleware error:', error)
    return res.status(500).json({
      success: false,
      message: '权限检查失败',
      code: 'ACCESS_CONTROL_ERROR'
    })
  }
}

module.exports = dataAccessControl
