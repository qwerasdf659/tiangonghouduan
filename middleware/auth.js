/**
 * JWT认证中间件
 * 🔴 前端对接要点：
 * - 所有API请求必须包含Authorization头
 * - Token格式：Bearer {access_token}
 * - Token过期自动返回2002错误码
 * - 用户信息注入req.user对象
 */

const jwt = require('jsonwebtoken');
const { User } = require('../models');

// 🔴 JWT认证中间件 - 验证访问令牌
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader) {
      return res.json({
        code: 2001,
        msg: '访问令牌不能为空',
        data: null
      });
    }

    // 提取Token
    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : authHeader;

    if (!token) {
      return res.json({
        code: 2001,
        msg: '访问令牌格式错误',
        data: null
      });
    }

    // 验证Token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key_change_in_production');
    
    // 🔴 验证用户是否仍然存在且状态正常
    const user = await User.findByPk(decoded.user_id);
    if (!user) {
      return res.json({
        code: 2003,
        msg: '用户不存在',
        data: null
      });
    }

    if (user.status !== 'active') {
      return res.json({
        code: 2004,
        msg: '用户账号已被禁用',
        data: null
      });
    }

    // 🔴 将用户信息注入请求对象 - 供后续中间件和路由使用
    req.user = {
      user_id: user.user_id,
      mobile: user.mobile,
      is_merchant: user.is_merchant,
      total_points: user.total_points,
      ...decoded
    };

    next();
  } catch (error) {
    // JWT相关错误处理
    if (error.name === 'TokenExpiredError') {
      return res.json({
        code: 2002,
        msg: '访问令牌已过期',
        data: null
      });
    } else if (error.name === 'JsonWebTokenError') {
      return res.json({
        code: 2002,
        msg: '访问令牌无效',
        data: null
      });
    } else {
      console.error('认证中间件错误:', error);
      return res.json({
        code: 2000,
        msg: '认证服务异常',
        data: null
      });
    }
  }
};

// 🔴 商家权限验证中间件 - 商家功能专用
const requireMerchant = (req, res, next) => {
  if (!req.user) {
    return res.json({
      code: 2001,
      msg: '请先登录',
      data: null
    });
  }

  if (!req.user.is_merchant) {
    return res.json({
      code: 2005,
      msg: '需要商家权限',
      data: null
    });
  }

  next();
};

// 🔴 可选认证中间件 - 某些接口登录用户和游客都可访问
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader) {
      // 没有token，继续处理（游客模式）
      req.user = null;
      return next();
    }

    const token = authHeader.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : authHeader;

    if (!token) {
      req.user = null;
      return next();
    }

    // 尝试验证Token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_key_change_in_production');
    const user = await User.findByPk(decoded.user_id);
    
    if (user && user.status === 'active') {
      req.user = {
        user_id: user.user_id,
        mobile: user.mobile,
        is_merchant: user.is_merchant,
        total_points: user.total_points,
        ...decoded
      };
    } else {
      req.user = null;
    }

    next();
  } catch (error) {
    // Token无效，但不阻止请求，继续以游客身份处理
    req.user = null;
    next();
  }
};

// 🔴 请求日志中间件 - 记录API调用
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  const userId = req.user?.user_id || 'anonymous';
  
  console.log(`📡 API请求: ${req.method} ${req.path} - 用户:${userId}`);
  
  // 记录响应时间
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    console.log(`📡 API响应: ${req.method} ${req.path} - 用户:${userId} - ${res.statusCode} - ${duration}ms`);
  });
  
  next();
};

// 🔴 生成JWT Token工具函数
const generateTokens = (user) => {
  const payload = {
    user_id: user.user_id,
    mobile: user.mobile,
    is_merchant: user.is_merchant
  };

  const accessToken = jwt.sign(
    payload,
    process.env.JWT_SECRET || 'your_jwt_secret_key_change_in_production',
    { expiresIn: process.env.JWT_EXPIRES_IN || '2h' }
  );

  const refreshToken = jwt.sign(
    { user_id: user.user_id },
    process.env.JWT_REFRESH_SECRET || 'your_refresh_secret_key_change_in_production',
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );

  return { accessToken, refreshToken };
};

// 🔴 验证Refresh Token工具函数
const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET || 'your_refresh_secret_key_change_in_production');
};

module.exports = {
  authenticateToken,
  requireMerchant,
  optionalAuth,
  requestLogger,
  generateTokens,
  verifyRefreshToken
}; 