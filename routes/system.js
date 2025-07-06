/**
 * 系统API路由 - 新增接口规范
 * 🔴 基于最新接口对接规范文档的新增API接口
 * 包含：数据验证、错误报告、字段映射、微信登录、Canvas兼容性检测
 */

const express = require('express');
const { User } = require('../models');
const { authenticateToken, generateTokens } = require('../middleware/auth');

const router = express.Router();

// 🔴 数据验证API - 基于utils/validate.js实际实现
router.post('/validate/form', async (req, res) => {
  try {
    const { type, value, rules } = req.body;
    
    if (!type || !value || !rules) {
      return res.json({
        code: 4000,
        msg: '参数不完整',
        data: null
      });
    }
    
    const validationResults = {
      isValid: true,
      errors: [],
      message: '验证通过'
    };
    
    // 🔴 验证规则映射
    const validators = {
      phone: (val) => {
        const phoneRegex = /^1[3-9]\d{9}$/;
        if (!phoneRegex.test(val)) {
          return '手机号格式不正确';
        }
        return null;
      },
      code: (val) => {
        const codeRegex = /^\d{6}$/;
        if (!codeRegex.test(val)) {
          return '验证码格式不正确，应为6位数字';
        }
        return null;
      },
      amount: (val) => {
        const num = parseFloat(val);
        if (isNaN(num) || num <= 0) {
          return '金额必须为正数';
        }
        if (num > 9999) {
          return '金额不能超过9999元';
        }
        return null;
      },
      nickname: (val) => {
        if (!val || val.length < 2) {
          return '昵称长度不能少于2个字符';
        }
        if (val.length > 20) {
          return '昵称长度不能超过20个字符';
        }
        return null;
      },
      required: (val) => {
        if (!val || val.toString().trim() === '') {
          return '该字段不能为空';
        }
        return null;
      }
    };
    
    // 🔴 执行验证规则
    for (const rule of rules) {
      if (validators[rule]) {
        const error = validators[rule](value);
        if (error) {
          validationResults.isValid = false;
          validationResults.errors.push(error);
          validationResults.message = error;
          break;
        }
      }
    }
    
    res.json({
      code: 0,
      msg: 'success',
      data: validationResults
    });
    
  } catch (error) {
    console.error('数据验证失败:', error);
    res.json({
      code: 5000,
      msg: '验证服务异常',
      data: null
    });
  }
});

// 🔴 错误报告API - 基于app.js错误处理实际实现
router.post('/error-report', authenticateToken, async (req, res) => {
  try {
    const { errorType, errorCode, errorMessage, context } = req.body;
    
    const reportId = `err_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${Date.now()}`;
    
    // 🔴 错误日志记录
    console.error('🚨 前端错误报告:', {
      reportId,
      errorType,
      errorCode,
      errorMessage,
      context,
      userId: req.user?.user_id,
      timestamp: new Date().toISOString()
    });
    
    // 🔴 特定错误码处理
    if (errorCode === 2001) {
      console.log('📝 2001错误专项记录 - 访问令牌问题:', {
        userId: req.user?.user_id,
        userAgent: context?.userAgent,
        url: context?.url
      });
    }
    
    res.json({
      code: 0,
      msg: '错误报告已记录',
      data: {
        reportId,
        status: 'received'
      }
    });
    
  } catch (error) {
    console.error('错误报告处理失败:', error);
    res.json({
      code: 5000,
      msg: '错误报告服务异常',
      data: null
    });
  }
});

// 🔴 字段映射API - 基于app.js数据库字段映射实际实现
router.get('/field-mapping', authenticateToken, async (req, res) => {
  try {
    const { entity = 'user' } = req.query;
    
    const mappings = {
      user: {
        frontend: {
          id: 'user_id',
          mobile: 'mobile',
          points: 'total_points',
          isMerchant: 'is_merchant',
          createdAt: 'created_at',
          updatedAt: 'updated_at'
        },
        backend: {
          user_id: 'id',
          mobile: 'mobile', 
          total_points: 'points',
          is_merchant: 'isMerchant',
          created_at: 'createdAt',
          updated_at: 'updatedAt'
        }
      },
      points_record: {
        frontend: {
          id: 'record_id',
          userId: 'user_id',
          balanceAfter: 'balance_after',
          createdAt: 'created_at'
        },
        backend: {
          record_id: 'id',
          user_id: 'userId',
          balance_after: 'balanceAfter',
          created_at: 'createdAt'
        }
      },
      lottery_result: {
        frontend: {
          id: 'draw_id',
          userId: 'user_id',
          prizeName: 'prize_name',
          prizeType: 'prize_type',
          isPity: 'is_pity',
          drawSequence: 'draw_sequence',
          createdAt: 'created_at'
        },
        backend: {
          draw_id: 'id',
          user_id: 'userId',
          prize_name: 'prizeName',
          prize_type: 'prizeType',
          is_pity: 'isPity',
          draw_sequence: 'drawSequence',
          created_at: 'createdAt'
        }
      }
    };
    
    if (!mappings[entity]) {
      return res.json({
        code: 4001,
        msg: '不支持的实体类型',
        data: null
      });
    }
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        entity,
        mapping: mappings[entity]
      }
    });
    
  } catch (error) {
    console.error('字段映射查询失败:', error);
    res.json({
      code: 5000,
      msg: '字段映射服务异常',
      data: null
    });
  }
});

// 🔴 Canvas兼容性检测API - 基于lottery.js实际实现
router.get('/canvas-compatibility', authenticateToken, async (req, res) => {
  try {
    // 🔴 模拟Canvas兼容性检测结果
    const compatibility = {
      supportedFeatures: {
        createLinearGradient: true,
        createRadialGradient: true,
        quadraticCurveTo: true,
        filter: true,
        getImageData: true,
        putImageData: true,
        drawImage: true,
        arc: true,
        fillRect: true,
        strokeRect: true
      },
      recommendedSettings: {
        useAdvancedFeatures: true,
        fallbackMode: false,
        enableHardwareAcceleration: true
      },
      deviceCompatibility: '95%+',
      performance: {
        level: 'high',
        recommendation: 'canvas',
        alternatives: ['css-transform', 'dom-animation']
      }
    };
    
    res.json({
      code: 0,
      msg: 'success',
      data: compatibility
    });
    
  } catch (error) {
    console.error('Canvas兼容性检测失败:', error);
    res.json({
      code: 5000,
      msg: 'Canvas兼容性检测服务异常',
      data: null
    });
  }
});

// 🔴 微信登录配置API
router.get('/wechat/login-info', async (req, res) => {
  try {
    const loginInfo = {
      appId: process.env.WECHAT_APPID || 'wx0db69ddd264f9b81',
      scope: 'snsapi_userinfo',
      redirectUri: process.env.WECHAT_REDIRECT_URI || 'https://domain.com/auth/wechat/callback',
      loginUrl: 'https://open.weixin.qq.com/connect/oauth2/authorize',
      tips: {
        title: '微信登录',
        description: '使用微信账号快速登录，享受更好的服务体验',
        features: ['快速注册', '安全可靠', '一键登录', '新用户奖励1000积分']
      }
    };
    
    res.json({
      code: 0,
      msg: 'success',
      data: loginInfo
    });
    
  } catch (error) {
    console.error('微信登录配置获取失败:', error);
    res.json({
      code: 5000,
      msg: '微信登录配置服务异常',
      data: null
    });
  }
});

// 🔴 数据验证规则API
router.get('/validation-rules', async (req, res) => {
  try {
    const rules = {
      phone: {
        pattern: '^1[3-9]\\d{9}$',
        message: '请输入正确的手机号',
        example: '13800138000'
      },
      code: {
        pattern: '^\\d{6}$',
        message: '请输入6位数字验证码',
        example: '123456'
      },
      amount: {
        pattern: '^\\d+(\\.\\d{1,2})?$',
        message: '请输入正确的金额',
        min: 0.01,
        max: 9999.99,
        example: '88.88'
      },
      nickname: {
        minLength: 2,
        maxLength: 20,
        message: '昵称长度为2-20个字符',
        example: '用户昵称'
      }
    };
    
    res.json({
      code: 0,
      msg: 'success',
      data: rules
    });
    
  } catch (error) {
    console.error('验证规则获取失败:', error);
    res.json({
      code: 5000,
      msg: '验证规则服务异常',
      data: null
    });
  }
});

module.exports = router; 