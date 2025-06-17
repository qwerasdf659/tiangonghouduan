/**
 * 认证授权API路由
 * 🔴 前端对接要点：
 * - POST /api/auth/login - 手机号验证码登录
 * - POST /api/auth/refresh - Token刷新
 * - GET /api/auth/verify-token - Token验证
 * - POST /api/auth/logout - 退出登录
 */

const express = require('express');
const { User, PointsRecord } = require('../models');
const { generateTokens, verifyRefreshToken, authenticateToken } = require('../middleware/auth');
const webSocketService = require('../services/websocket');

const router = express.Router();

// 🔴 前端对接点1：手机号验证码登录
router.post('/login', async (req, res) => {
  try {
    const { phone, code } = req.body;
    
    // 验证手机号格式
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return res.json({
        code: 1001,
        msg: '手机号格式不正确',
        data: null
      });
    }
    
    // 🔴 验证验证码（开发环境可放宽）
    const isValidCode = await verifyCode(phone, code);
    if (!isValidCode && process.env.NODE_ENV === 'production') {
      return res.json({
        code: 1002,
        msg: '验证码错误或已过期',
        data: null
      });
    }
    
    // 🔴 查询或创建用户 - 新用户奖励1000积分
    const { user, isNewUser } = await User.findOrCreateByMobile(phone);
    
    // 如果是新用户，记录注册积分
    if (isNewUser) {
      await PointsRecord.createRecord({
        user_id: user.user_id,
        points: 1000,
        description: '新用户注册奖励',
        source: 'register',
        balance_after: 1000
      });
      
      // 🔴 WebSocket推送新用户奖励通知
      webSocketService.notifyPointsUpdate(user.user_id, 1000, 1000, '新用户注册奖励');
    }
    
    // 🔴 生成JWT Token
    const { accessToken, refreshToken } = generateTokens(user);
    
    // 更新登录时间
    await user.update({ last_login: new Date() });
    
    // 🔴 返回前端所需的用户信息格式
    res.json({
      code: 0,
      msg: 'success',
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: 7200, // 2小时
        user_info: user.getSafeUserInfo() // 🔴 脱敏用户信息
      }
    });
    
    console.log(`👤 用户登录成功: ${user.user_id}(${user.getMaskedMobile()}) ${isNewUser ? '新用户' : '老用户'}`);
    
  } catch (error) {
    console.error('登录失败:', error);
    res.json({
      code: 1000,
      msg: '系统异常，请稍后重试',
      data: null
    });
  }
});

// 🔴 前端对接点2：Token刷新
router.post('/refresh', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const refreshToken = authHeader?.replace('Bearer ', '');
    
    if (!refreshToken) {
      return res.json({
        code: 2001,
        msg: 'Refresh Token不能为空',
        data: null
      });
    }
    
    // 验证Refresh Token
    const decoded = verifyRefreshToken(refreshToken);
    const user = await User.findByPk(decoded.user_id);
    
    if (!user) {
      return res.json({
        code: 2002,
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
    
    // 🔴 生成新的Token
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        access_token: accessToken,
        refresh_token: newRefreshToken,
        expires_in: 7200
      }
    });
    
  } catch (error) {
    console.error('Token刷新失败:', error);
    res.json({
      code: 2000,
      msg: 'Token无效或已过期',
      data: null
    });
  }
});

// 🔴 前端对接点3：Token验证
router.get('/verify-token', authenticateToken, async (req, res) => {
  try {
    // 如果中间件通过，说明Token有效
    const user = await User.findByPk(req.user.user_id);
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        valid: true,
        user_info: user.getSafeUserInfo()
      }
    });
  } catch (error) {
    console.error('Token验证失败:', error);
    res.json({
      code: 2000,
      msg: 'Token验证失败',
      data: null
    });
  }
});

// 🔴 前端对接点4：退出登录
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    // 这里可以实现Token黑名单机制
    // 目前前端删除本地Token即可
    
    res.json({
      code: 0,
      msg: 'success',
      data: null
    });
    
    console.log(`👤 用户退出登录: ${req.user.user_id}`);
  } catch (error) {
    console.error('退出登录失败:', error);
    res.json({
      code: 1000,
      msg: '退出登录失败',
      data: null
    });
  }
});

// 🔴 前端对接点5：发送验证码
router.post('/send-code', async (req, res) => {
  try {
    const { phone } = req.body;
    
    // 验证手机号格式
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return res.json({
        code: 1001,
        msg: '手机号格式不正确',
        data: null
      });
    }
    
    // 🔴 发送验证码（集成短信服务）
    const code = await sendSmsCode(phone);
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        message: '验证码发送成功',
        expires_in: 300, // 5分钟有效期
        ...(process.env.NODE_ENV === 'development' && { code }) // 开发环境返回验证码
      }
    });
    
  } catch (error) {
    console.error('发送验证码失败:', error);
    res.json({
      code: 1003,
      msg: '验证码发送失败，请稍后重试',
      data: null
    });
  }
});

// 🔴 验证码验证函数（模拟实现）
async function verifyCode(phone, code) {
  // 开发环境：万能验证码
  if (process.env.NODE_ENV === 'development') {
    return code === '123456' || code === '888888';
  }
  
  // 生产环境：实际验证逻辑
  // 这里需要集成实际的短信服务商API
  // 比如阿里云、腾讯云等
  return true;
}

// 🔴 发送短信验证码函数（模拟实现）
async function sendSmsCode(phone) {
  // 生成6位随机验证码
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`📱 发送验证码到 ${phone}: ${code}`);
    return code;
  }
  
  // 生产环境：集成实际短信服务
  // 这里需要调用短信服务商的API
  // 例如：阿里云短信服务、腾讯云短信等
  
  // 将验证码存储到Redis（5分钟过期）
  // await redis.setex(`sms:${phone}`, 300, code);
  
  return null; // 生产环境不返回验证码
}

module.exports = router; 