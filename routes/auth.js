/**
 * 认证授权API路由 - v2.1.2开发阶段简化版本
 * 🔴 重要更新：开发阶段暂停手机号码验证功能，简化认证流程
 * 🔴 前端对接要点：
 * - POST /api/auth/login - 手机号验证码登录（开发阶段简化）
 * - POST /api/auth/admin-login - 管理员隐藏登录入口
 * - POST /api/auth/refresh - Token刷新
 * - GET /api/auth/verify-token - Token验证
 * - POST /api/auth/logout - 退出登录
 */

const express = require('express');
const { User, PointsRecord } = require('../models');
const { generateTokens, verifyRefreshToken, authenticateToken } = require('../middleware/auth');
const webSocketService = require('../services/websocket');

const router = express.Router();

// 🔴 前端对接点1：手机号验证码登录（开发阶段简化版本）
router.post('/login', async (req, res) => {
  try {
    const { phone, code, verify_code, mobile, password } = req.body;
    
    // 🔴 参数兼容性处理：支持不同的前端参数格式
    const userPhone = phone || mobile;
    const verificationCode = code || verify_code || password; // 开发阶段将password当作验证码处理
    
    // 🔴 添加调试日志
    console.log('📱 登录请求调试:', {
      原始数据: req.body,
      手机号: userPhone,
      手机号类型: typeof userPhone,
      手机号长度: userPhone ? userPhone.length : 'undefined',
      验证码: verificationCode,
      验证码类型: typeof verificationCode,
      code参数: code,
      verify_code参数: verify_code,
      mobile参数: mobile,
      password参数: password
    });
    
    // 🔴 参数基础验证
    if (!userPhone || !verificationCode) {
      console.log('❌ 参数缺失:', { phone: !!userPhone, verificationCode: !!verificationCode });
      return res.json({
        code: 1000,
        msg: '手机号和验证码不能为空',
        data: null
      });
    }
    
    // 🔴 确保手机号是字符串类型
    const phoneStr = String(userPhone).trim();
    
    console.log('📱 手机号处理:', {
      原始手机号: userPhone,
      处理后手机号: phoneStr,
      长度: phoneStr.length,
      正则测试: /^1[3-9]\d{9}$/.test(phoneStr)
    });
    
    // 验证手机号格式
    if (!/^1[3-9]\d{9}$/.test(phoneStr)) {
      console.log('❌ 手机号格式验证失败:', phoneStr);
      return res.json({
        code: 1001,
        msg: '手机号格式不正确',
        data: null
      });
    }
    
    // 🔴 严格验证码验证（所有环境都必须验证）
    const isValidCode = await verifyCodeOrPassword(phoneStr, verificationCode, password);
    if (!isValidCode) {
      return res.json({
        code: 1002,
        msg: process.env.NODE_ENV === 'production' ? '验证码错误' : '验证码错误，开发环境请使用123456',
        data: null
      });
    }
    
    // 🔴 查询或创建用户 - 新用户奖励1000积分
    const { user, isNewUser } = await User.findOrCreateByMobile(phoneStr);
    
    // 如果是新用户，记录注册积分
    if (isNewUser) {
      await PointsRecord.create({
        user_id: user.user_id,
        type: 'earn',                    // ✅ 修复：正确的字段名
        points: 1000,
        source: 'register',
        description: '新用户注册奖励',
        balance_after: 1000              // ✅ 修复：删除不存在的balance_before字段
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

// 🔴 管理员登录已移除：统一使用手机号+验证码123456登录
// 管理员权限通过数据库中的is_admin字段控制

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

// 🔴 前端对接点5：发送验证码（开发阶段简化版本）
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
    
    // 🔴 开发和测试环境：万能验证码123456
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      console.log(`📱 开发/测试模式：为 ${phone} 提供万能验证码: 123456`);
      
      return res.json({
        code: 0,
        msg: '验证码发送成功',
        data: {
          phone: phone,
          code_hint: '开发/测试模式：请使用万能验证码 123456',
          expires_in: 300, // 5分钟有效期
          dev_mode: true
        }
      });
    }
    
    // 🔴 生产环境：实际发送短信（暂时也简化处理）
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    console.log(`📱 生产模式：为 ${phone} 生成验证码: ${code}`);
    
    // TODO: 这里应该调用真实的短信服务
    // await sendSmsCode(phone, code);
    
    res.json({
      code: 0,
      msg: '验证码发送成功',
      data: {
        phone: phone,
        expires_in: 300
      }
    });
    
  } catch (error) {
    console.error('发送验证码失败:', error);
    res.json({
      code: 1000,
      msg: '发送验证码失败，请重试',
      data: null
    });
  }
});

// 🔴 验证码验证函数（仅支持验证码登录）
async function verifyCodeOrPassword(phone, code, password) {
  // 🔴 开发和测试环境：万能验证码123456
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    // 统一使用验证码登录（兼容前端传入password参数）
    const verificationCode = code || password;
    
    if (verificationCode === '123456') {
      console.log(`✅ 开发/测试模式：万能验证码验证通过 ${phone} - 123456`);
      return true;
    }
    
    console.log(`❌ 开发/测试模式：验证码错误 ${phone} - ${verificationCode}，请使用123456`);
    return false;
  }
  
  // 🔴 生产环境：实际验证逻辑
  console.log(`🔍 生产环境验证: ${phone} - code:${code}`);
  
  // 生产环境：验证真实的短信验证码
  if (code && /^\d{6}$/.test(code)) {
    // TODO: 这里应该调用真实的验证码验证服务
    // 当前生产环境需要接入真实短信验证，暂时返回false
    console.log(`❌ 生产环境：需要接入真实短信验证服务`);
    return false;
  }
  
  return false;
}

// 🔴 短信发送服务（预留接口）
async function sendSmsCode(phone, code) {
  try {
    console.log(`📤 发送短信验证码到 ${phone}: ${code}`);
    
    // TODO: 接入真实的短信服务商
    // 如：阿里云短信、腾讯云短信、华为云短信等
    
    return {
      success: true,
      message: '短信发送成功'
    };
  } catch (error) {
    console.error('短信发送失败:', error);
    throw new Error('短信发送失败');
  }
}

module.exports = router; 