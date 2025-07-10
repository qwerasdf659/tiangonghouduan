/**
 * 认证中间件 - JWT Token验证和权限管理
 * 🔴 核心功能：
 * - JWT Token生成和验证
 * - 用户身份认证
 * - 管理员权限检查
 * - 商家权限检查
 * - 请求日志记录
 */

const jwt = require('jsonwebtoken');
const { User } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_change_in_production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h';
const REFRESH_TOKEN_EXPIRES_IN = '7d';

/**
 * 生成JWT Token
 * @param {Object} user - 用户对象
 * @returns {Object} - 包含accessToken和refreshToken
 */
function generateTokens(user) {
  const payload = {
    user_id: user.user_id,
    mobile: user.mobile,
    is_merchant: user.is_merchant || false,
    is_admin: user.is_admin || false
  };

  const accessToken = jwt.sign(payload, JWT_SECRET, { 
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'lottery-system'
  });

  const refreshToken = jwt.sign(
    { user_id: user.user_id, type: 'refresh' }, 
    JWT_SECRET, 
    { 
      expiresIn: REFRESH_TOKEN_EXPIRES_IN,
      issuer: 'lottery-system'
    }
  );

  return { accessToken, refreshToken };
}

/**
 * 验证访问Token
 * @param {string} token - JWT Token
 * @returns {Object|null} - 解码后的payload或null
 */
function verifyAccessToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    console.log('Token验证失败:', error.message);
    return null;
  }
}

/**
 * 验证刷新Token
 * @param {string} token - 刷新Token
 * @returns {Object|null} - 解码后的payload或null
 */
function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== 'refresh') {
      return null;
    }
    return decoded;
  } catch (error) {
    console.log('刷新Token验证失败:', error.message);
    return null;
  }
}

/**
 * JWT Token认证中间件
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        code: 4001,
        msg: '缺少访问令牌',
        data: null
      });
    }

    const decoded = verifyAccessToken(token);
    if (!decoded) {
      return res.status(401).json({
        code: 4002,
        msg: '访问令牌无效或已过期',
        data: null
      });
    }

    // 从数据库获取用户信息
    const user = await User.findByPk(decoded.user_id);
    if (!user) {
      return res.status(401).json({
        code: 4003,
        msg: '用户不存在',
        data: null
      });
    }

    // 检查用户状态
    if (user.status === 'banned') {
      return res.status(403).json({
        code: 4004,
        msg: '用户已被禁用',
        data: null
      });
    }

    // 将用户信息添加到请求对象
    req.user = user;
    req.token = decoded;
    
    next();
  } catch (error) {
    console.error('认证中间件错误:', error);
    res.status(500).json({
      code: 5000,
      msg: '认证服务异常',
      data: null
    });
  }
};

/**
 * 可选认证中间件 - 不强制要求Token
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = verifyAccessToken(token);
      if (decoded) {
        const user = await User.findByPk(decoded.user_id);
        if (user && user.status !== 'banned') {
          req.user = user;
          req.token = decoded;
        }
      }
    }

    next();
  } catch (error) {
    console.error('可选认证中间件错误:', error);
    next(); // 即使出错也继续执行
  }
};

/**
 * 管理员权限检查中间件
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      code: 4001,
      msg: '需要登录访问',
      data: null
    });
  }

  if (!req.user.is_admin) {
    return res.status(403).json({
      code: 4005,
      msg: '需要管理员权限',
      data: null
    });
  }

  next();
};

/**
 * 商家权限检查中间件
 */
const requireMerchant = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      code: 4001,
      msg: '需要登录访问',
      data: null
    });
  }

  // 检查是否具有商家权限或管理员权限
  if (!req.user.is_merchant && !req.user.is_admin) {
    return res.status(403).json({
      code: 4006,
      msg: '需要商家权限',
      data: null
    });
  }

  next();
};

/**
 * 超级管理员权限检查中间件（需要同时具有admin和merchant权限）
 */
const requireSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      code: 4001,
      msg: '需要登录访问',
      data: null
    });
  }

  if (!req.user.is_admin || !req.user.is_merchant) {
    return res.status(403).json({
      code: 4007,
      msg: '需要超级管理员权限',
      data: null
    });
  }

  next();
};

/**
 * 请求日志中间件
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();
  const { method, path, ip } = req;
  const userAgent = req.get('User-Agent');

  // 记录请求开始
  console.log(`📥 ${method} ${path} - ${ip} - ${userAgent}`);

  // 监听响应结束
  res.on('finish', () => {
    const duration = Date.now() - start;
    const { statusCode } = res;
    
    console.log(`📤 ${method} ${path} - ${statusCode} - ${duration}ms`);
  });

  next();
};

/**
 * 用户身份验证中间件（仅验证用户身份，不检查权限）
 */
const requireUser = authenticateToken;

module.exports = {
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken,
  authenticateToken,
  optionalAuth,
  requireAdmin,
  requireMerchant,
  requireSuperAdmin,
  requireUser,
  requestLogger
}; 