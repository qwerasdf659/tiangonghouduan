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
const { requestLogger, optionalAuth } = require('./middleware/auth');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler'); // 🔴 新增统一错误处理
const webSocketService = require('./services/websocket');
const { syncModels, healthCheck } = require('./models');

// 导入路由
const authRoutes = require('./routes/auth');
const lotteryRoutes = require('./routes/lottery');
const exchangeRoutes = require('./routes/exchange');
const userRoutes = require('./routes/user');        // 🔴 新增用户路由
const photoRoutes = require('./routes/photo');      // 🔴 启用拍照上传路由
const merchantRoutes = require('./routes/merchant'); // 🔴 商家管理路由（仅管理员可访问）

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
app.use('/api/merchant', merchantRoutes); // 🔴 商家管理（仅管理员可访问）

// 🔴 添加upload路由兼容性 - 修复前端路径不匹配问题
app.use('/upload', photoRoutes);         // 🔴 兼容前端的/upload路径请求
app.use('/api/upload', photoRoutes);     // 🔴 兼容前端的/api/upload路径请求

// 🔴 添加photo路由兼容性 - 修复前端/photo/history路径404问题
app.use('/photo', photoRoutes);          // 🔴 兼容前端的/photo/history路径请求

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
          'GET /upload/records': '上传记录（兼容路径）',
          'POST /api/upload': '拍照上传（兼容路径）'  // 🔴 新增兼容路径说明
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

// 🔴 404处理 - 必须放在所有API路由配置之后
app.use('/api/*', notFoundHandler);

// 🔴 全局错误处理 - 使用统一错误处理中间件
app.use(errorHandler);

// 🔴 数据库初始化和服务器启动
async function startServer() {
  try {
    console.log('🚀 启动餐厅积分抽奖系统...');
    
    // 🔴 同步数据库模型
    console.log('📊 初始化数据库...');
    await syncModels({ alter: false }); // 暂时禁用alter模式，解决索引问题
    
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

// 启动服务器
startServer();

module.exports = app; 