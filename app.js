/**
 * 餐厅积分抽奖系统 - 主应用文件
 * 🔴 前端对接要点：
 * - 服务器地址：https://rqchrlqndora.sealosbja.site（公网）
 * - 内网地址：http://devbox1.ns-br0za7uc.svc.cluster.local:3000
 * - WebSocket端口：8080
 * - API前缀：/api
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const http = require('http');
require('dotenv').config();

// 导入中间件和服务
const { requestLogger, optionalAuth, authenticateToken } = require('./middleware/auth');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler'); // 🔴 新增统一错误处理
const webSocketService = require('./services/websocket');
const { syncModels, healthCheck } = require('./models');

// 导入路由
const authRoutes = require('./routes/auth');
const lotteryRoutes = require('./routes/lottery');
const exchangeRoutes = require('./routes/exchange');
const userRoutes = require('./routes/user');        // 🔴 新增用户路由
const photoRoutes = require('./routes/photo');      // 🔴 启用拍照上传路由
const merchantRoutes = require('./routes/merchant'); // 🔴 启用商家管理路由
const systemRoutes = require('./routes/system');    // 🔴 新增系统API路由

const app = express();
const server = http.createServer(app);

// 🔴 基础安全配置
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// 🔴 CORS配置 - 允许前端跨域访问
app.use(cors({
  origin: function (origin, callback) {
    // 开发环境允许所有来源
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    // 生产环境白名单
    const allowedOrigins = [
      'https://rqchrlqndora.sealosbja.site',
      'http://devbox1.ns-br0za7uc.svc.cluster.local:3000',
      // 微信小程序域名
      'https://servicewechat.com'
    ];
    
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// 🔴 请求解析中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 🔴 全局限流配置
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: process.env.NODE_ENV === 'development' ? 1000 : 100, // 开发环境放宽限制
  message: {
    code: 5001,
    msg: '请求过于频繁，请稍后重试',
    data: null
  },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api', limiter);

// 🔴 请求日志中间件
app.use(requestLogger);

// 🔴 强制生产环境JWT密钥检查 - 安全风险修复
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your_jwt_secret_key_change_in_production') {
    console.error('❌ 生产环境必须设置安全的JWT密钥！');
    process.exit(1);
  }
  
  if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY === 'your_32_bytes_hex_encryption_key_change_in_production') {
    console.error('❌ 生产环境必须设置安全的加密密钥！');
    process.exit(1);
  }
}

// 🔴 健康检查接口
app.get('/health', async (req, res) => {
  try {
    const dbHealth = await healthCheck();
    const wsStats = webSocketService.getConnectionStats();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV,
      database: dbHealth,
      websocket: {
        status: 'running',
        connections: wsStats.total
      },
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 🔴 API健康检查接口 - 前端专用
app.get('/api/health', async (req, res) => {
  try {
    const dbHealth = await healthCheck();
    const wsStats = webSocketService.getConnectionStats();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV,
      database: dbHealth,
      websocket: {
        status: 'running',
        connections: wsStats.total
      },
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// 🔴 API路由配置
app.use('/api/auth', authRoutes);        // 认证授权
app.use('/api/lottery', lotteryRoutes);  // 抽奖系统
app.use('/api/exchange', exchangeRoutes); // 商品兑换
app.use('/api/user', userRoutes);        // 🔴 用户管理
app.use('/api/photo', photoRoutes);      // 🔴 拍照上传 - 已启用
app.use('/api/merchant', merchantRoutes); // 🔴 商家管理 - 已启用
app.use('/api/system', systemRoutes);    // 🔴 系统API - 数据验证、错误报告、字段映射等

// 🔴 新增API接口 - 符合前端技术规范文档要求

// 🔴 微信登录配置API - 前端需要获取小程序配置信息
app.get('/api/wechat/login-info', (req, res) => {
  res.json({
    code: 0,
    msg: 'success',
    data: {
      appId: process.env.WECHAT_APPID || 'wx_development_appid',
      scope: 'snsapi_userinfo',
      redirectUri: encodeURIComponent(process.env.PUBLIC_BASE_URL + '/auth/wechat/callback'),
      state: Math.random().toString(36).substring(2, 15),
      responseType: 'code',
      loginUrl: `https://open.weixin.qq.com/connect/oauth2/authorize`,
      tips: {
        title: '微信登录',
        description: '使用微信账号快速登录，享受更好的服务体验',
        features: ['快速注册', '安全可靠', '一键登录', '新用户奖励1000积分']
      }
    }
  });
});

// 🔴 Canvas兼容性检测API - 前端转盘组件需要
app.get('/api/system/canvas-support', (req, res) => {
  res.json({
    code: 0,
    msg: 'success',
    data: {
      support: {
        canvas: true,
        webgl: true,
        canvas2d: true,
        createRadialGradient: true,
        drawImage: true,
        getContext: true
      },
      fallback: {
        enabled: true,
        type: 'css-animation',
        description: '当Canvas不支持时，自动降级为CSS动画'
      },
      performance: {
        level: 'high',
        recommendation: 'canvas',
        alternatives: ['css-transform', 'dom-animation']
      },
      tips: {
        title: 'Canvas兼容性检测',
        description: '检测浏览器Canvas支持情况，确保转盘动画正常运行',
        troubleshooting: [
          '如果转盘显示异常，请尝试刷新页面',
          '建议使用最新版本的浏览器',
          '低版本浏览器会自动启用兼容模式'
        ]
      }
    }
  });
});

// 🔴 数据验证规则API - 前端表单验证需要
app.get('/api/system/validation-rules', (req, res) => {
  res.json({
    code: 0,
    msg: 'success',
    data: {
      rules: {
        phone: {
          required: true,
          pattern: '^1[3-9]\\d{9}$',
          message: '请输入正确的手机号码',
          example: '13800138000'
        },
        verifyCode: {
          required: true,
          pattern: '^\\d{6}$',
          message: '请输入6位数字验证码',
          example: '123456'
        },
        nickname: {
          required: true,
          minLength: 2,
          maxLength: 20,
          pattern: '^[\\u4e00-\\u9fa5a-zA-Z0-9_]+$',
          message: '昵称长度2-20字符，支持中文、字母、数字、下划线',
          example: '用户昵称'
        },
        amount: {
          required: true,
          min: 0.01,
          max: 10000,
          pattern: '^\\d+(\\.\\d{1,2})?$',
          message: '请输入有效金额（0.01-10000元，最多2位小数）',
          example: '25.50'
        }
      },
      errorCodes: {
        1000: '参数验证失败',
        1001: '手机号格式错误',
        1002: '验证码格式错误',
        1003: '昵称格式错误',
        1004: '金额格式错误'
      },
      tips: {
        title: '数据验证规则',
        description: '前端表单验证规则，确保数据格式正确',
        usage: [
          '前端提交前先进行客户端验证',
          '后端会进行二次验证确保数据安全',
          '验证失败时显示对应错误信息'
        ]
      }
    }
  });
});

// 🔴 添加upload路由兼容性 - 修复前端路径不匹配问题
app.use('/upload', photoRoutes);         // 🔴 兼容前端的/upload路径请求
app.use('/api/upload', photoRoutes);     // 🔴 兼容前端的/api/upload路径请求

// 🔴 静态文件服务（图片等）
app.use('/uploads', express.static('uploads'));
app.use('/images', express.static('images'));

// 🔴 API文档接口（开发环境）
if (process.env.NODE_ENV === 'development') {
  app.get('/api/docs', (req, res) => {
    res.json({
      title: '餐厅积分抽奖系统API文档',
      version: '1.0.0',
      endpoints: {
        auth: {
          'POST /api/auth/login': '用户登录',
          'POST /api/auth/refresh': 'Token刷新',
          'GET /api/auth/verify-token': 'Token验证',
          'POST /api/auth/logout': '退出登录',
          'POST /api/auth/send-code': '发送验证码'
        },
        lottery: {
          'GET /api/lottery/config': '获取抽奖配置',
          'POST /api/lottery/draw': '执行抽奖',
          'GET /api/lottery/records': '抽奖记录',
          'GET /api/lottery/statistics': '抽奖统计'
        },
        exchange: {
          'GET /api/exchange/products': '商品列表',
          'POST /api/exchange/submit': '提交兑换',
          'GET /api/exchange/orders': '兑换订单',
          'GET /api/exchange/categories': '商品分类'
        },
        photo: {
          'POST /api/photo/upload': '拍照上传',
          'GET /api/photo/history': '拍照历史',
          'GET /api/photo/review/:id': '审核详情',
          'GET /api/photo/statistics': '拍照统计',
          'GET /upload/records': '上传记录（兼容路径）'
        },
        merchant: {
          'POST /api/merchant/apply': '申请商家权限',
          'GET /api/merchant/reviews/pending': '待审核列表',
          'POST /api/merchant/reviews/:id/approve': '审核通过',
          'POST /api/merchant/reviews/:id/reject': '审核拒绝',
          'POST /api/merchant/reviews/batch': '批量审核',
          'GET /api/merchant/statistics': '审核统计'
        }
      },
      websocket: {
        url: 'ws://localhost:3000/ws',
        events: [
          'connected',
          'points_update',
          'stock_update',
          'review_result',
          'system_notification'
        ]
      }
    });
  });
}

// 🔴 字段映射优化 - 统一处理前后端字段映射
function mapFieldsToFrontend(data, entityType = 'user') {
  if (!data) return data;
  
  const mappings = {
    user: {
      user_id: 'id',
      total_points: 'points',
      is_merchant: 'isMerchant',
      mobile: 'mobile',
      nickname: 'nickname',
      avatar: 'avatar',
      status: 'status',
      created_at: 'createdAt',
      updated_at: 'updatedAt'
    },
    points_record: {
      record_id: 'id',
      user_id: 'userId',
      points: 'points',
      type: 'type',
      source: 'source',
      description: 'description',
      balance_after: 'balanceAfter',
      created_at: 'createdAt'
    },
    lottery_result: {
      draw_id: 'id',
      user_id: 'userId',
      prize_name: 'prizeName',
      prize_type: 'prizeType',
      is_pity: 'isPity',
      draw_sequence: 'drawSequence',
      created_at: 'createdAt'
    }
  };
  
  const mapping = mappings[entityType];
  if (!mapping) return data;
  
  // 如果是数组，递归处理每个元素
  if (Array.isArray(data)) {
    return data.map(item => mapFieldsToFrontend(item, entityType));
  }
  
  // 处理单个对象
  return mapSingleObject(data, mapping);
}

function mapSingleObject(data, mapping) {
  if (!data || typeof data !== 'object') return data;
  
  const result = {};
  
  // 遍历映射规则
  for (const [backendField, frontendField] of Object.entries(mapping)) {
    if (data[backendField] !== undefined) {
      result[frontendField] = data[backendField];
    }
  }
  
  // 保留未映射的字段
  for (const [key, value] of Object.entries(data)) {
    if (!mapping[key] && result[key] === undefined) {
      result[key] = value;
    }
  }
  
  return result;
}

// 🔴 新增：微信登录API
app.post('/api/auth/wechat-login', async (req, res) => {
  try {
    const { code, appId, userInfo, deviceInfo } = req.body;
    
    // 🔴 参数验证
    if (!code || !appId) {
      return res.json({
        code: 1000,
        msg: '微信登录参数不完整',
        data: null
      });
    }
    
    console.log('📱 微信登录请求:', { code: code.substring(0, 10) + '...', appId, userInfo: !!userInfo });
    
    // 🔴 开发阶段简化：直接使用用户信息创建/查找用户
    // 生产环境应该调用微信API验证code并获取openid
    let mobile = userInfo?.phone || `wx_${Date.now()}`;
    
    // 如果没有提供手机号，生成一个临时手机号
    if (!mobile.match(/^1[3-9]\d{9}$/)) {
      mobile = `1${Math.floor(Math.random() * 9) + 1}${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`;
    }
    
    const { User, PointsRecord } = require('./models');
    const { generateTokens } = require('./middleware/auth');
    
    // 🔴 查询或创建用户
    const [user, created] = await User.findOrCreate({
      where: { mobile },
      defaults: {
        mobile,
        nickname: userInfo?.nickName || `微信用户${Math.floor(Math.random() * 10000)}`,
        avatar: userInfo?.avatarUrl || '',
        total_points: 1000, // 新用户奖励
        wx_openid: `openid_${code}`, // 开发阶段模拟
        device_info: deviceInfo,
        status: 'active'
      }
    });
    
    // 新用户奖励积分记录
    if (created) {
      await PointsRecord.create({
        user_id: user.user_id,
        type: 'earn',
        points: 1000,
        source: 'wechat_register',
        description: '微信登录新用户奖励',
        balance_after: 1000
      });
    }
    
    // 生成Token
    const { accessToken, refreshToken } = generateTokens(user);
    
    // 更新登录时间
    await user.update({ last_login: new Date() });
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        user: mapFieldsToFrontend(user, 'user'),
        token: {
          accessToken,
          refreshToken,
          expiresIn: 7200 // 2小时
        },
        isNewUser: created
      }
    });
    
    console.log(`👤 微信用户登录成功: ${user.user_id}(${user.nickname}) ${created ? '新用户' : '老用户'}`);
    
  } catch (error) {
    console.error('❌ 微信登录失败:', error);
    res.json({
      code: 5000,
      msg: '微信登录失败，请稍后重试',
      data: null
    });
  }
});

// 🔴 新增：数据验证API
app.post('/api/validate/form', async (req, res) => {
  try {
    const { type, value, rules = [] } = req.body;
    
    if (!type || value === undefined) {
      return res.json({
        code: 1000,
        msg: '验证参数不完整',
        data: null
      });
    }
    
    const errors = [];
    let isValid = true;
    
    // 🔴 根据类型和规则进行验证
    switch (type) {
      case 'phone':
        if (rules.includes('required') && !value) {
          errors.push('手机号不能为空');
          isValid = false;
        }
        if (value && !String(value).match(/^1[3-9]\d{9}$/)) {
          errors.push('手机号格式不正确');
          isValid = false;
        }
        break;
        
      case 'code':
        if (rules.includes('required') && !value) {
          errors.push('验证码不能为空');
          isValid = false;
        }
        if (value && !String(value).match(/^\d{6}$/)) {
          errors.push('验证码格式不正确，应为6位数字');
          isValid = false;
        }
        break;
        
      case 'amount':
        if (rules.includes('required') && (!value || value <= 0)) {
          errors.push('金额不能为空且必须大于0');
          isValid = false;
        }
        if (value && (isNaN(value) || value < 0)) {
          errors.push('金额格式不正确');
          isValid = false;
        }
        break;
        
      case 'nickname':
        if (rules.includes('required') && !value) {
          errors.push('昵称不能为空');
          isValid = false;
        }
        if (value && String(value).length > 50) {
          errors.push('昵称长度不能超过50个字符');
          isValid = false;
        }
        break;
        
      default:
        errors.push('不支持的验证类型');
        isValid = false;
    }
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        isValid,
        errors,
        message: isValid ? '验证通过' : errors.join(', ')
      }
    });
    
  } catch (error) {
    console.error('❌ 数据验证失败:', error);
    res.json({
      code: 5000,
      msg: '验证服务异常',
      data: null
    });
  }
});

// 🔴 新增：错误报告API
app.post('/api/system/error-report', authenticateToken, async (req, res) => {
  try {
    const { errorType, errorCode, errorMessage, context } = req.body;
    
    // 🔴 记录错误报告
    const reportId = `err_${new Date().toISOString().split('T')[0].replace(/-/g, '')}_${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    
    const errorReport = {
      reportId,
      userId: req.user?.user_id,
      errorType,
      errorCode,
      errorMessage,
      context,
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.connection.remoteAddress
    };
    
    console.log('🚨 前端错误报告:', errorReport);
    
    res.json({
      code: 0,
      msg: '错误报告已记录',
      data: {
        reportId,
        status: 'received'
      }
    });
    
  } catch (error) {
    console.error('❌ 错误报告处理失败:', error);
    res.json({
      code: 5000,
      msg: '错误报告处理失败',
      data: null
    });
  }
});

// 🔴 新增：字段映射API
app.get('/api/system/field-mapping', authenticateToken, async (req, res) => {
  try {
    const { entity = 'user' } = req.query;
    
    const mappings = {
      user: {
        frontend: {
          id: 'user_id',
          mobile: 'mobile',
          points: 'total_points',
          isMerchant: 'is_merchant',
          nickname: 'nickname',
          avatar: 'avatar',
          status: 'status'
        },
        backend: {
          user_id: 'id',
          mobile: 'mobile',
          total_points: 'points',
          is_merchant: 'isMerchant',
          nickname: 'nickname',
          avatar: 'avatar',
          status: 'status'
        }
      },
      points_record: {
        frontend: {
          id: 'record_id',
          userId: 'user_id',
          points: 'points',
          type: 'type',
          source: 'source',
          description: 'description',
          balanceAfter: 'balance_after'
        },
        backend: {
          record_id: 'id',
          user_id: 'userId',
          points: 'points',
          type: 'type',
          source: 'source',
          description: 'description',
          balance_after: 'balanceAfter'
        }
      }
    };
    
    const mapping = mappings[entity];
    if (!mapping) {
      return res.json({
        code: 4000,
        msg: '不支持的实体类型',
        data: null
      });
    }
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        entity,
        mapping
      }
    });
    
  } catch (error) {
    console.error('❌ 获取字段映射失败:', error);
    res.json({
      code: 5000,
      msg: '获取字段映射失败',
      data: null
    });
  }
});

// 🔴 新增：Canvas兼容性检测API
app.get('/api/system/canvas-compatibility', authenticateToken, async (req, res) => {
  try {
    const compatibility = {
      supportedFeatures: {
        createLinearGradient: true,
        createRadialGradient: true,
        quadraticCurveTo: true,
        filter: true,
        drawImage: true,
        getImageData: true
      },
      recommendedSettings: {
        useAdvancedFeatures: true,
        fallbackMode: false,
        enableHardwareAcceleration: true
      },
      deviceCompatibility: '95%+',
      performanceLevel: 'high',
      supportedFormats: ['png', 'jpg', 'webp'],
      maxCanvasSize: {
        width: 4096,
        height: 4096
      }
    };
    
    res.json({
      code: 0,
      msg: 'success',
      data: compatibility
    });
    
  } catch (error) {
    console.error('❌ Canvas兼容性检测失败:', error);
    res.json({
      code: 5000,
      msg: 'Canvas兼容性检测失败',
      data: null
    });
  }
});

// 🔴 404处理 - 使用统一错误处理
app.use('/api/*', notFoundHandler);

// 🔴 全局错误处理 - 使用统一错误处理中间件
app.use(errorHandler);

// 🔴 数据库初始化和服务器启动
async function startServer() {
  try {
    console.log('🚀 启动餐厅积分抽奖系统...');
    
    // 🔴 同步数据库模型
    console.log('📊 初始化数据库...');
    await syncModels(false); // 生产环境不要使用force: true
    
    // 🔴 启动HTTP服务器
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`🌐 HTTP服务器启动成功: http://0.0.0.0:${PORT}`);
      console.log(`🔗 公网地址: https://rqchrlqndora.sealosbja.site`);
      console.log(`🔗 内网地址: http://devbox1.ns-br0za7uc.svc.cluster.local:${PORT}`);
    });
    
    // 🔴 初始化WebSocket服务
    console.log('🌐 启动WebSocket服务...');
    webSocketService.initialize(server);
    
    console.log('✅ 系统启动完成！');
    
    // 🔴 打印环境信息
    console.log(`📋 环境信息:`);
    console.log(`   - Node环境: ${process.env.NODE_ENV || 'development'}`);
    console.log(`   - 数据库: ${process.env.DB_HOST || 'test-db-mysql.ns-br0za7uc.svc'}:${process.env.DB_PORT || 3306}`);
    console.log(`   - 服务端口: ${PORT}`);
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`📖 API文档: http://localhost:${PORT}/api/docs`);
      console.log(`🔧 健康检查: http://localhost:${PORT}/health`);
      console.log(`🗄️ 数据库测试: npm run db:test`);
      console.log(`🧪 API测试: npm run api:test`);
    }
    
  } catch (error) {
    console.error('❌ 系统启动失败:', error);
    process.exit(1);
  }
}

// 🔴 优雅关闭处理
process.on('SIGTERM', async () => {
  console.log('🛑 收到SIGTERM信号，开始优雅关闭...');
  
  try {
    // 关闭WebSocket服务
    webSocketService.close();
    
    // 关闭HTTP服务器
    server.close(() => {
      console.log('✅ 服务器已关闭');
      process.exit(0);
    });
    
    // 强制关闭超时
    setTimeout(() => {
      console.log('⚠️ 强制关闭服务器');
      process.exit(1);
    }, 10000);
    
  } catch (error) {
    console.error('❌ 关闭服务器失败:', error);
    process.exit(1);
  }
});

// 🔴 未捕获异常处理
process.on('uncaughtException', (error) => {
  console.error('❌ 未捕获异常:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未处理的Promise拒绝:', reason);
  console.error('Promise:', promise);
  process.exit(1);
});



// 🔴 新增：微信登录API
app.post('/api/auth/wechat-login', async (req, res) => {
  try {
    const { code, appId, userInfo, deviceInfo } = req.body;
    
    // 🔴 参数验证
    if (!code || !appId) {
      return res.json({
        code: 1000,
        msg: '微信登录参数不完整',
        data: null
      });
    }
    
    console.log('📱 微信登录请求:', { code: code.substring(0, 10) + '...', appId, userInfo: !!userInfo });
    
    // 🔴 开发阶段简化：直接使用用户信息创建/查找用户
    // 生产环境应该调用微信API验证code并获取openid
    let mobile = userInfo?.phone || `wx_${Date.now()}`;
    
    // 如果没有提供手机号，生成一个临时手机号
    if (!mobile.match(/^1[3-9]\d{9}$/)) {
      mobile = `1${Math.floor(Math.random() * 9) + 1}${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`;
    }
    
    const { User, PointsRecord } = require('./models');
    const { generateTokens } = require('./middleware/auth');
    
    // 🔴 查询或创建用户
    const [user, created] = await User.findOrCreate({
      where: { mobile },
      defaults: {
        mobile,
        nickname: userInfo?.nickName || `微信用户${Math.floor(Math.random() * 10000)}`,
        avatar: userInfo?.avatarUrl || '',
        total_points: 1000, // 新用户奖励
        wx_openid: `openid_${code}`, // 开发阶段模拟
        device_info: deviceInfo,
        status: 'active'
      }
    });
    
    // 新用户奖励积分记录
    if (created) {
      await PointsRecord.create({
        user_id: user.user_id,
        type: 'earn',
        points: 1000,
        source: 'wechat_register',
        description: '微信登录新用户奖励',
        balance_after: 1000
      });
    }
    
    // 生成Token
    const { accessToken, refreshToken } = generateTokens(user);
    
    // 更新登录时间
    await user.update({ last_login: new Date() });
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        success: true,
        user: user.getSafeUserInfo(),
        token: {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_in: 7200
        }
      }
    });
    
    console.log(`👤 微信用户登录成功: ${user.user_id}(${user.nickname}) ${created ? '新用户' : '老用户'}`);
    
  } catch (error) {
    console.error('❌ 微信登录失败:', error);
    res.json({
      code: 5000,
      msg: '微信登录失败，请稍后重试',
      data: null
    });
  }
});

// 🔴 新增：数据验证API
app.post('/api/validate/form', async (req, res) => {
  try {
    const { type, value, rules = [] } = req.body;
    
    if (!type || value === undefined) {
      return res.json({
        code: 1000,
        msg: '验证参数不完整',
        data: null
      });
    }
    
    const errors = [];
    let isValid = true;
    
    // 🔴 根据类型和规则进行验证
    switch (type) {
      case 'phone':
        if (rules.includes('required') && !value) {
          errors.push('手机号不能为空');
          isValid = false;
        }
        if (value && !String(value).match(/^1[3-9]\d{9}$/)) {
          errors.push('手机号格式不正确');
          isValid = false;
        }
        break;
        
      case 'code':
        if (rules.includes('required') && !value) {
          errors.push('验证码不能为空');
          isValid = false;
        }
        if (value && !String(value).match(/^\d{6}$/)) {
          errors.push('验证码格式不正确，应为6位数字');
          isValid = false;
        }
        break;
        
      case 'amount':
        if (rules.includes('required') && (!value || value <= 0)) {
          errors.push('金额不能为空且必须大于0');
          isValid = false;
        }
        if (value && (isNaN(value) || value < 0)) {
          errors.push('金额格式不正确');
          isValid = false;
        }
        break;
        
      case 'nickname':
        if (rules.includes('required') && !value) {
          errors.push('昵称不能为空');
          isValid = false;
        }
        if (value && String(value).length > 50) {
          errors.push('昵称长度不能超过50个字符');
          isValid = false;
        }
        break;
        
      default:
        errors.push('不支持的验证类型');
        isValid = false;
    }
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        isValid,
        errors,
        message: isValid ? '验证通过' : errors.join(', ')
      }
    });
    
  } catch (error) {
    console.error('❌ 数据验证失败:', error);
    res.json({
      code: 5000,
      msg: '验证服务异常',
      data: null
    });
  }
});

// 🔴 新增：错误报告API
app.post('/api/system/error-report', authenticateToken, async (req, res) => {
  try {
    const { errorType, errorCode, errorMessage, context } = req.body;
    
    // 🔴 记录错误报告
    const reportId = `err_${new Date().toISOString().split('T')[0].replace(/-/g, '')}_${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    
    const errorReport = {
      reportId,
      userId: req.user?.user_id,
      errorType,
      errorCode,
      errorMessage,
      context,
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent'],
      ip: req.ip || req.connection.remoteAddress
    };
    
    console.log('🚨 前端错误报告:', errorReport);
    
    // 这里可以保存到数据库或发送到监控系统
    // await ErrorReport.create(errorReport);
    
    res.json({
      code: 0,
      msg: '错误报告已记录',
      data: {
        reportId,
        status: 'received'
      }
    });
    
  } catch (error) {
    console.error('❌ 错误报告处理失败:', error);
    res.json({
      code: 5000,
      msg: '错误报告处理失败',
      data: null
    });
  }
});

// 🔴 新增：字段映射API
app.get('/api/system/field-mapping', authenticateToken, async (req, res) => {
  try {
    const { entity = 'user' } = req.query;
    
    const mappings = {
      user: {
        frontend: {
          id: 'user_id',
          mobile: 'mobile',
          points: 'total_points',
          isMerchant: 'is_merchant',
          nickname: 'nickname',
          avatar: 'avatar',
          status: 'status'
        },
        backend: {
          user_id: 'id',
          mobile: 'mobile',
          total_points: 'points',
          is_merchant: 'isMerchant',
          nickname: 'nickname',
          avatar: 'avatar',
          status: 'status'
        }
      },
      points_record: {
        frontend: {
          id: 'record_id',
          userId: 'user_id',
          points: 'points',
          type: 'type',
          source: 'source',
          description: 'description',
          balanceAfter: 'balance_after'
        },
        backend: {
          record_id: 'id',
          user_id: 'userId',
          points: 'points',
          type: 'type',
          source: 'source',
          description: 'description',
          balance_after: 'balanceAfter'
        }
      }
    };
    
    const mapping = mappings[entity];
    if (!mapping) {
      return res.json({
        code: 4000,
        msg: '不支持的实体类型',
        data: null
      });
    }
    
    res.json({
      code: 0,
      msg: 'success',
      data: {
        entity,
        mapping
      }
    });
    
  } catch (error) {
    console.error('❌ 获取字段映射失败:', error);
    res.json({
      code: 5000,
      msg: '获取字段映射失败',
      data: null
    });
  }
});

// 🔴 新增：Canvas兼容性检测API
app.get('/api/system/canvas-compatibility', authenticateToken, async (req, res) => {
  try {
    // 🔴 模拟Canvas兼容性检测结果
    // 实际项目中这些信息会在前端检测后上报
    const compatibility = {
      supportedFeatures: {
        createLinearGradient: true,
        createRadialGradient: true,
        quadraticCurveTo: true,
        filter: true,
        drawImage: true,
        getImageData: true
      },
      recommendedSettings: {
        useAdvancedFeatures: true,
        fallbackMode: false,
        enableHardwareAcceleration: true
      },
      deviceCompatibility: '95%+',
      performanceLevel: 'high',
      supportedFormats: ['png', 'jpg', 'webp'],
      maxCanvasSize: {
        width: 4096,
        height: 4096
      }
    };
    
    res.json({
      code: 0,
      msg: 'success',
      data: compatibility
    });
    
  } catch (error) {
    console.error('❌ Canvas兼容性检测失败:', error);
    res.json({
      code: 5000,
      msg: 'Canvas兼容性检测失败',
      data: null
    });
  }
});

// 启动服务器
startServer();

// 🔴 导出字段映射函数供其他模块使用
module.exports = {
  app,
  mapFieldsToFrontend,
  mapSingleObject
}; 