/**
 * 管理员认证中间件 - V3统一安全版本
 * 用于验证管理员权限
 * 🔧 修复：统一JWT密钥配置，与主认证中间件保持一致
 */

'use strict'

const jwt = require('jsonwebtoken')

// 🔧 修复：统一JWT密钥配置，确保安全性
const JWT_SECRET = process.env.JWT_SECRET

// 🔧 启动时检查JWT密钥配置
if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET未配置，管理员认证功能将无法正常工作')
  if (process.env.NODE_ENV === 'production') {
    console.error('🚨 生产环境必须配置JWT_SECRET')
    process.exit(1)
  }
}

/**
 * 管理员认证中间件 - 修复：统一错误响应格式
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - Express下一个中间件函数
 */
function adminAuthMiddleware (req, res, next) {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '缺少认证token',
        timestamp: new Date().toISOString()
      })
    }

    const token = authHeader.substring(7)

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: '无效的token格式',
        timestamp: new Date().toISOString()
      })
    }

    // 🔧 修复：验证JWT token，统一密钥配置
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'restaurant-points-system',
      audience: 'restaurant-app'
    })

    // 🔧 增强：验证token类型（如果存在）
    if (decoded.type && decoded.type !== 'access') {
      return res.status(401).json({
        success: false,
        error: 'INVALID_TOKEN_TYPE',
        message: '无效的token类型',
        timestamp: new Date().toISOString()
      })
    }

    // 检查是否为管理员
    if (!decoded.is_admin) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: '需要管理员权限',
        timestamp: new Date().toISOString()
      })
    }

    // 将管理员信息添加到请求对象
    req.admin = {
      admin_id: decoded.user_id,
      mobile: decoded.mobile,
      is_admin: decoded.is_admin
    }

    // 🔧 新增：同时设置user对象，保持兼容性
    req.user = {
      user_id: decoded.user_id,
      mobile: decoded.mobile,
      is_admin: decoded.is_admin
    }

    next()
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'INVALID_TOKEN',
        message: '无效的认证token',
        timestamp: new Date().toISOString()
      })
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'TOKEN_EXPIRED',
        message: '认证token已过期',
        timestamp: new Date().toISOString()
      })
    }

    console.error('管理员认证中间件错误:', error)
    res.status(500).json({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      message: '服务器内部错误',
      timestamp: new Date().toISOString()
    })
  }
}

module.exports = adminAuthMiddleware
