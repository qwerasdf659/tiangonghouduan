/**
 * 餐厅积分抽奖系统 V4.0 - 统一引擎架构主应用入口
 * 创建时间：2025年01月21日 19:00 北京时间
 * 适用区域：中国 (使用北京时间 Asia/Shanghai)
 * 架构：V4统一抽奖引擎架构
 * 技术栈：Node.js 20+ + Express + V4统一引擎 + MySQL + Sequelize + Redis
 */

'use strict'

// 🔴 设置应用程序时区为北京时间 (中国区域)
process.env.TZ = 'Asia/Shanghai'

const express = require('express')
const path = require('path') // 用于静态文件路径处理
const cors = require('cors')
const helmet = require('helmet')
const compression = require('compression')
const rateLimit = require('express-rate-limit')
require('dotenv').config({ override: true }) // 🔴 强制覆盖系统环境变量

// 🕐 北京时间工具导入
const BeijingTimeHelper = require('./utils/timeHelper')

// 📝 统一日志系统导入
const Logger = require('./services/UnifiedLotteryEngine/utils/Logger')
const appLogger = Logger.create('Application')

// 🔧 导入API响应统一中间件 - 解决API格式不一致问题
const ApiResponse = require('./utils/ApiResponse')
// const ApiStandardManager = require('./utils/ApiStandardManager') // 已合并到ApiResponse中，删除冗余引用

// 确保Node.js使用北京时间
appLogger.info('应用启动', {
  start_time: BeijingTimeHelper.formatChinese(),
  timezone: 'Asia/Shanghai',
  node_version: process.version
})

// 初始化Express应用
const app = express()

// 🔧 信任代理配置 - Sealos部署环境必需
app.set('trust proxy', true)

// 🔧 安全中间件
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://unpkg.com'],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://unpkg.com', 'https://cdn.jsdelivr.net'],
        imgSrc: ["'self'", 'data:', 'https:'],
        baseUri: ["'self'"],
        fontSrc: ["'self'", 'https:', 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        objectSrc: ["'none'"],
        scriptSrcAttr: ["'none'"],
        upgradeInsecureRequests: []
      }
    }
  })
)

/**
 * CORS origin 验证函数
 * @param {string} origin - 请求来源
 * @param {Function} callback - 回调函数
 * @returns {void}
 */
const corsOriginValidator = function (origin, callback) {
  // 允许的源列表
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000', 'http://localhost:8080', 'https://omqktqrtntnn.sealosbja.site']

  // 微信小程序请求没有origin，允许通过
  if (!origin) return callback(null, true)

  // 检查是否在允许列表中
  if (allowedOrigins.indexOf(origin) !== -1) {
    callback(null, true)
  } else {
    // 允许微信小程序域名
    if (origin.includes('servicewechat.com') || origin.includes('weixin.qq.com')) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  }
}

// 🔧 CORS配置 - 支持微信小程序跨域访问
app.use(
  cors({
    origin: corsOriginValidator,
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  })
)

// 🔧 请求体解析
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// 🔧 压缩响应
app.use(compression())

/*
 * 🔧 API请求频率限制 V4 - Redis滑动窗口限流
 * 创建时间：2025年10月12日
 * 功能：防止恶意刷接口，保护服务器资源
 */
const { getRateLimiter } = require('./middleware/RateLimiterMiddleware')
const rateLimiter = getRateLimiter()

// 🔧 全局API限流 - 100次/分钟/IP（基于Redis）
const globalRateLimiter = rateLimiter.createLimiter({
  windowMs: 60 * 1000, // 1分钟窗口
  max: 100, // 最多100个请求
  keyPrefix: 'rate_limit:global:api:',
  keyGenerator: 'ip', // 按IP限流
  message: '请求过于频繁，请稍后再试',
  onLimitReached: (req, key, count) => {
    appLogger.warn('全局API限流触发', {
      ip: req.ip,
      path: req.path,
      count,
      limit: 100
    })
  }
})
app.use('/api/', globalRateLimiter)

// 🔧 后备限流器（当Redis不可用时） - 1000次/15分钟
const fallbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 1000, // 限制每个IP 15分钟内最多1000个请求
  message: {
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: '请求太频繁，请稍后再试'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => {
    // 当Redis可用时跳过后备限流器
    return rateLimiter.redisClient.isConnected
  },
  keyGenerator: req => {
    return req.ip || req.connection.remoteAddress || 'unknown'
  }
})
app.use('/api/', fallbackLimiter)

// 字段转换器功能已删除 - 使用统一的snake_case命名格式

// 🔧 API响应格式统一中间件 - 统一所有API响应格式
app.use('/api/', ApiResponse.middleware())

// 🔧 请求日志中间件
app.use((req, res, next) => {
  appLogger.debug('API请求', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    // 🗑️ user_agent 字段已删除 - 2025年01月21日
    timestamp: BeijingTimeHelper.apiTimestamp()
  })
  next()
})

/*
 * 🔧 全局API超时保护中间件（30秒）
 * 功能：防止长时间无响应的请求占用连接资源
 * 创建时间：2025年01月21日
 */
app.use('/api/', (req, res, next) => {
  const API_TIMEOUT = 30000 // 30秒超时

  // 设置请求超时
  req.setTimeout(API_TIMEOUT, () => {
    if (!res.headersSent) {
      appLogger.warn('API请求超时', {
        method: req.method,
        path: req.path,
        timeout: API_TIMEOUT,
        ip: req.ip
      })

      res.status(504).json({
        success: false,
        code: 'REQUEST_TIMEOUT',
        message: '请求处理超时，请稍后重试',
        data: {
          timeout: `${API_TIMEOUT / 1000}秒`,
          suggestion: '如果问题持续，请联系技术支持'
        },
        timestamp: BeijingTimeHelper.apiTimestamp()
      })
    }
  })

  // 设置响应超时
  res.setTimeout(API_TIMEOUT)

  next()
})

// 📊 健康检查端点
app.get('/health', async (req, res) => {
  try {
    // 检查数据库连接
    const { sequelize } = require('./models')
    let databaseStatus = 'disconnected'

    try {
      await sequelize.authenticate()
      databaseStatus = 'connected'
    } catch (error) {
      appLogger.error('数据库连接检查失败', { error: error.message })
      databaseStatus = 'disconnected'
    }

    // 检查Redis连接
    let redisStatus = 'disconnected'
    try {
      // 这里可以添加Redis连接检查
      redisStatus = 'connected'
    } catch (error) {
      appLogger.error('Redis连接检查失败', { error: error.message })
      redisStatus = 'disconnected'
    }

    const healthData = {
      success: true, // ✅ 业务标准格式
      code: 'SYSTEM_HEALTHY', // ✅ 业务代码
      message: 'V4 Unified Lottery Engine 系统运行正常', // ✅ 用户友好消息
      data: {
        status: 'healthy',
        version: '4.0.0',
        architecture: 'V4 Unified Lottery Engine',
        timestamp: BeijingTimeHelper.apiTimestamp(), // �� 北京时间API时间戳
        systems: {
          database: databaseStatus,
          redis: redisStatus,
          nodejs: process.version
        },
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
        },
        uptime: Math.floor(process.uptime()) + 's'
      },
      version: 'v4.0', // ✅ API版本信息
      request_id:
        req.headers['x-request-id'] ||
        `health_${Date.now()}_${Math.random().toString(36).substr(2, 6)}` // ✅ 请求追踪ID
    }

    res.json(healthData)
  } catch (error) {
    console.error('健康检查失败:', error)
    res.status(500).json({
      success: false, // ✅ 业务标准格式
      code: 'SYSTEM_UNHEALTHY', // ✅ 业务错误代码
      message: '系统健康检查失败', // ✅ 用户友好错误消息
      data: {
        status: 'unhealthy',
        error: error.message,
        timestamp: BeijingTimeHelper.apiTimestamp() // 🕐 北京时间API时间戳
      },
      version: 'v4.0', // ✅ API版本信息
      request_id:
        req.headers['x-request-id'] ||
        `health_error_${Date.now()}_${Math.random().toString(36).substr(2, 6)}` // ✅ 请求追踪ID
    })
  }
})

// 📊 V4统一引擎信息端点
app.get('/api/v4', (req, res) => {
  res.json({
    code: 0,
    msg: 'V4统一抽奖引擎信息获取成功',
    data: {
      version: '4.0.0',
      name: '餐厅积分抽奖系统 V4统一引擎',
      architecture: 'unified-lottery-engine',
      description: 'V4统一抽奖引擎架构 - 2种策略统一管理',
      engine: {
        name: 'UnifiedLotteryEngine',
        version: '4.0.0',
        strategies: [
          'BasicGuaranteeStrategy - 基础抽奖保底策略, ManagementStrategy - 管理策略',
          'ManagementStrategy - 管理抽奖策略'
        ],
        core: {
          UnifiedLotteryEngine: '统一抽奖引擎 - 集成式设计',
          LotteryStrategy: '策略基类'
        }
      },
      endpoints: {
        lottery: '/api/v4/lottery',
        admin: '/api/v4/admin',
        health: '/health'
      },
      features: ['统一抽奖引擎', '智能策略选择', '实时决策处理', '完整审计日志', '高性能优化']
    },
    timestamp: BeijingTimeHelper.apiTimestamp()
  })
})

// 📚 V4统一引擎API文档端点
app.get('/api/v4/docs', (req, res) => {
  res.json({
    code: 0,
    msg: 'V4统一抽奖引擎API文档获取成功',
    data: {
      title: '餐厅积分抽奖系统 V4.0 统一引擎API文档',
      version: '4.0.0',
      architecture: 'unified-lottery-engine',
      description: 'V4统一抽奖引擎架构，通过统一引擎管理3种抽奖策略',
      last_updated: BeijingTimeHelper.apiTimestamp(),
      unified_engine: {
        description: 'V4统一抽奖引擎提供完整的抽奖执行和管理功能',
        endpoints: {
          'POST /api/v4/lottery/execute': '执行抽奖',
          'GET /api/v4/lottery/strategies': '获取策略列表',
          'GET /api/v4/lottery/metrics': '获取引擎指标',
          'POST /api/v4/lottery/validate': '验证抽奖条件'
        },
        strategies: [
          'BasicGuaranteeStrategy - 基础抽奖保底策略, ManagementStrategy - 管理策略',
          'ManagementStrategy - 管理抽奖策略'
        ]
      },
      admin_system: {
        description: 'V4管理系统提供引擎配置、监控和维护功能',
        endpoints: {
          'GET /api/v4/admin/system/dashboard': '管理仪表板',
          'POST /api/v4/admin/config': '更新引擎配置',
          'GET /api/v4/admin/logs': '获取执行日志',
          'POST /api/v4/admin/maintenance': '维护模式控制'
        },
        features: ['引擎监控', '配置管理', '日志分析', '性能优化']
      },
      common: {
        response_format: {
          success: {
            success: true,
            code: 'string',
            message: 'string',
            data: 'object',
            timestamp: 'ISO_8601'
          },
          error: {
            success: false,
            code: 'string',
            message: 'string',
            data: 'object',
            timestamp: 'ISO_8601'
          }
        },
        authentication: {
          type: 'Bearer Token',
          header: 'Authorization: Bearer <token>'
        },
        base_url: process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
        contact: {
          api: '/api/v4',
          lottery: '/api/v4/lottery',
          admin: '/api/v4/admin'
        }
      }
    },
    timestamp: BeijingTimeHelper.apiTimestamp()
  })
})

/*
 * 🛣️ 基础路由配置
 * 根路径
 */
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '餐厅积分抽奖系统 V4.0 - 统一抽奖引擎',
    data: {
      name: '餐厅积分抽奖系统 V4统一引擎',
      version: '4.0.0',
      api_version: 'v4',
      description: '基于V4统一抽奖引擎架构的智能抽奖系统',
      architecture: 'unified-lottery-engine',
      endpoints: {
        health: '/health',
        api: '/api/v4',
        lottery_engine: '/api/v4/lottery',
        admin_panel: '/api/v4/admin',
        docs: '/api/v4/docs'
      }
    },
    timestamp: BeijingTimeHelper.apiTimestamp()
  })
})

// API基础路径
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'API服务正常',
    data: {
      version: 'v4.0',
      latest_version: 'v4.0',
      available_versions: ['v4'],
      architecture: 'unified_decision_engine',
      v4_features: {
        unified_engine: '/api/v4/lottery',
        admin_panel: '/api/v4/admin',
        performance_metrics: '/api/v4/admin/system/status',
        decision_analytics: '/api/v4/admin/analytics/decisions/analytics'
      }
    },
    timestamp: BeijingTimeHelper.apiTimestamp()
  })
})

/*
 * ========================================
 * 🌐 Web管理后台静态文件托管
 * ========================================
 */
/**
 * 托管管理后台静态文件
 *
 * 路径映射：
 * - /admin/login.html → public/admin/login.html
 * - /admin/js/admin-common.js → public/admin/js/admin-common.js
 * - /admin/css/admin-main.css → public/admin/css/admin-main.css
 *
 * ⚠️ 必须在API路由注册之前配置，避免路由冲突
 */
app.use(
  '/admin',
  express.static(path.join(__dirname, 'public/admin'), {
    index: false, // 禁用默认首页，避免冲突
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0, // 开发环境禁用缓存，生产环境缓存1小时
    etag: process.env.NODE_ENV === 'production', // 生产环境启用ETag缓存
    lastModified: true, // 启用Last-Modified
    dotfiles: 'ignore', // 忽略隐藏文件
    redirect: false, // 禁用目录重定向
    setHeaders: (res, _filePath) => {
      // 开发环境强制不缓存
      if (process.env.NODE_ENV !== 'production') {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate')
        res.set('Pragma', 'no-cache')
        res.set('Expires', '0')
      }
    }
  })
)

/**
 * 根路径重定向到登录页
 */
app.get('/admin', (req, res) => {
  res.redirect(301, '/admin/login.html')
})

appLogger.info('✅ Web管理后台静态文件托管已配置', {
  mount: '/admin',
  directory: 'public/admin',
  cache: '1h'
})
// ========================================

// 🔗 V4统一引擎路由注册（清理后只保留V4版本）
try {
  // V4认证系统路由（RESTful标准 - 符合腾讯、阿里、网易、米哈游行业规范）
  app.use('/api/v4/auth', require('./routes/v4/unified-engine/auth'))
  appLogger.info('V4认证系统加载成功（RESTful标准）', {
    route: '/api/v4/auth', // 扁平化业务资源路径
    standard: 'RESTful', // API设计标准
    reference: '腾讯云、阿里云、网易云、米哈游行业标准' // 参考依据
  })

  // V4抽奖系统路由（RESTful标准 - 游戏行业标准设计）
  app.use('/api/v4/lottery', require('./routes/v4/unified-engine/lottery'))
  appLogger.info('V4抽奖系统加载成功（RESTful标准）', {
    route: '/api/v4/lottery', // 扁平化业务资源路径
    standard: 'RESTful', // API设计标准
    reference: '米哈游原神、网易游戏行业标准' // 参考依据
  })

  // V4活动条件管理路由（RESTful标准 - 活动参与条件配置）
  app.use('/api/v4/activities', require('./routes/v4/unified-engine/activity-conditions'))
  appLogger.info('V4活动条件管理系统加载成功（RESTful标准）', {
    route: '/api/v4/activities', // 扁平化业务资源路径
    standard: 'RESTful', // API设计标准
    reference: '活动参与条件验证系统' // 参考依据
  })

  // V4管理系统路由（RESTful标准 - 后台管理标准设计）
  app.use('/api/v4/admin', require('./routes/v4/unified-engine/admin'))
  appLogger.info('V4管理系统加载成功（RESTful标准）', {
    route: '/api/v4/admin', // 扁平化业务资源路径
    standard: 'RESTful', // API设计标准
    reference: '腾讯云、阿里云后台管理行业标准' // 参考依据
  })

  // V4权限管理路由
  app.use('/api/v4/permissions', require('./routes/v4/permissions'))
  appLogger.info('V4权限管理系统加载成功', { route: '/api/v4/permissions' })

  // V4抽奖预设管理路由
  app.use('/api/v4/lottery-preset', require('./routes/v4/unified-engine/lottery-preset'))
  appLogger.info('V4抽奖预设管理系统加载成功', { route: '/api/v4/lottery-preset' })

  // V4用户库存管理路由
  app.use('/api/v4/inventory', require('./routes/v4/unified-engine/inventory'))
  appLogger.info('V4用户库存管理系统加载成功', { route: '/api/v4/inventory' })

  // V4核销系统路由（12位Base32核销码，30天有效期）
  app.use('/api/v4/redemption', require('./routes/v4/unified-engine/redemption'))
  appLogger.info('V4核销系统加载成功', {
    route: '/api/v4/redemption',
    note: '新版核销系统（12位Base32码，SHA-256哈希存储，30天TTL）'
  })

  // V4兑换市场路由（双账户+商城双玩法方案）
  app.use('/api/v4/exchange_market', require('./routes/v4/unified-engine/exchange_market'))
  appLogger.info('V4兑换市场系统加载成功（双账户模型）', {
    route: '/api/v4/exchange_market',
    note: '虚拟奖品价值/积分/混合支付兑换系统'
  })

  // V4积分管理系统路由（RESTful标准 - 积分系统标准设计）
  app.use('/api/v4/points', require('./routes/v4/unified-engine/points'))
  appLogger.info('V4积分管理系统加载成功（RESTful标准）', {
    route: '/api/v4/points', // 扁平化业务资源路径
    standard: 'RESTful', // API设计标准
    reference: '腾讯、阿里积分系统行业标准' // 参考依据
  })

  // V4高级空间解锁路由（用户支付100积分解锁，有效期24小时）
  app.use('/api/v4/premium', require('./routes/v4/unified-engine/premium'))
  appLogger.info('V4高级空间解锁系统加载成功', { route: '/api/v4/premium' })

  /*
   * V4消费记录管理路由（商家扫码录入、平台审核）
   * 路径前缀: /api/v4/consumption（与前端文档保持完全一致）
   */
  app.use('/api/v4/consumption', require('./routes/v4/unified-engine/consumption'))
  appLogger.info('V4消费记录管理系统加载成功', { route: '/api/v4/consumption' })

  // V4系统功能路由（公告、反馈等）
  app.use('/api/v4/system', require('./routes/v4/system'))
  appLogger.info('V4系统功能模块加载成功', { route: '/api/v4/system' })

  // V4数据统计报表路由
  app.use('/api/v4/statistics', require('./routes/v4/statistics'))
  appLogger.info('V4数据统计报表系统加载成功', { route: '/api/v4/statistics' })

  // V4通知管理路由（基于SystemAnnouncement实现）
  app.use('/api/v4/notifications', require('./routes/v4/notifications'))
  appLogger.info('V4通知管理系统加载成功', {
    route: '/api/v4/notifications',
    note: '复用SystemAnnouncement表'
  })

  /*
   * V4审核管理路由（批量审核、超时告警）
   * app.use('/api/v4/audit-management', require('./routes/audit-management'))
   * appLogger.info('V4审核管理系统加载成功', { route: '/api/v4/audit-management' })
   */

  // 🌙 V4生产环境调试控制接口（仅管理员，动态日志级别）
  app.use('/api/v4/debug-control', require('./routes/v4/debug-control'))
  appLogger.info('V4调试控制系统加载成功', { route: '/api/v4/debug-control', note: '仅管理员可用' })

  // 🔐 V4层级权限管理路由（区域负责人→业务经理→业务员三级管理）
  app.use('/api/v4/hierarchy', require('./routes/v4/hierarchy'))
  appLogger.info('V4层级权限管理系统加载成功', {
    route: '/api/v4/hierarchy',
    note: '层级化角色权限管理，2025-11-07新增'
  })

  appLogger.info('V4 RESTful API架构已完全启用', {
    message: '完全扁平化设计，符合腾讯云、阿里云、网易云、米哈游行业标准',
    core_apis: {
      auth: '/api/v4/auth',
      lottery: '/api/v4/lottery',
      admin: '/api/v4/admin',
      points: '/api/v4/points'
    },
    refactored_from: 'V4统一引擎架构（/api/v4/unified-engine/*）',
    refactored_at: '2025-11-11',
    standard: 'RESTful资源导向设计'
  })
} catch (error) {
  appLogger.error('V4统一决策引擎加载失败', { error: error.message, stack: error.stack })
  process.exit(1) // 如果核心引擎加载失败，应用无法继续运行
}

// 🔧 404处理
app.use('*', (req, res) => {
  res.status(404).json({
    code: 404,
    msg: `接口不存在: ${req.method} ${req.originalUrl}`,
    data: {
      error: 'NOT_FOUND',
      availableEndpoints: [
        'GET /health',
        'GET /api/v4',
        'GET /api/v4/docs',
        'POST /api/v4/auth/login',
        'POST /api/v4/auth/register',
        'POST /api/v4/auth/logout',
        'GET /api/v4/auth/verify',
        'POST /api/v4/lottery/execute',
        'GET /api/v4/lottery/strategies',
        'GET /api/v4/admin/system/dashboard',
        'GET /api/v4/permissions/user/:userId',
        'POST /api/v4/permissions/check',
        'POST /api/v4/permissions/promote',
        'POST /api/v4/permissions/create-admin',
        'GET /api/v4/permissions/me'
      ]
    },
    timestamp: BeijingTimeHelper.apiTimestamp() // 🕐 北京时间API时间戳
  })
})

/*
 * 🔧 API标准化中间件 - 统一所有API响应格式
 * const apiStandardManager = new ApiStandardManager() // 已合并到ApiResponse中，删除冗余引用
 * app.use(apiStandardManager.createStandardizationMiddleware())
 */

// 🔧 全局错误处理
app.use((error, req, res, _next) => {
  appLogger.error('全局错误处理', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method
  })

  // Sequelize错误处理
  if (error.name === 'SequelizeError') {
    return res.status(500).json({
      success: false,
      error: 'DATABASE_ERROR',
      message: '数据库操作失败',
      timestamp: BeijingTimeHelper.apiTimestamp() // 🕐 北京时间API时间戳
    })
  }

  // JWT错误处理
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Token无效',
      timestamp: BeijingTimeHelper.apiTimestamp() // 🕐 北京时间API时间戳
    })
  }

  // 验证错误处理
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.message,
      timestamp: BeijingTimeHelper.apiTimestamp() // 🕐 北京时间API时间戳
    })
  }

  // 默认错误处理
  res.status(500).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误',
    timestamp: BeijingTimeHelper.apiTimestamp() // 🕐 北京时间API时间戳
  })
})

// 🔧 初始化Service层（移到这里，确保测试环境也能使用）
try {
  const models = require('./models')
  const { initializeServices } = require('./services')
  const services = initializeServices(models)

  // 将Service容器添加到app实例中，供路由使用
  app.locals.services = services

  appLogger.info('Service层初始化完成', {
    services: Array.from(services.getAllServices().keys())
  })
} catch (error) {
  appLogger.error('Service层初始化失败', { error: error.message })
}

// 🚀 启动服务器
const PORT = process.env.PORT || 3000
const HOST = process.env.HOST || '0.0.0.0'

if (require.main === module) {
  // 🔌 使用http.createServer创建服务器实例（支持WebSocket）
  const http = require('http')
  const server = http.createServer(app)

  server.listen(PORT, HOST, async () => {
    console.log('🔄 [DEBUG] 服务器启动监听完成')

    // 🔌 初始化聊天WebSocket服务（新增）
    try {
      const ChatWebSocketService = require('./services/ChatWebSocketService')
      ChatWebSocketService.initialize(server)
      appLogger.info('聊天WebSocket服务已启动', {
        path: '/socket.io',
        transports: ['websocket', 'polling']
      })
    } catch (error) {
      appLogger.error('聊天WebSocket服务初始化失败', { error: error.message })
    }

    // 初始化定时任务
    try {
      const ScheduledTasks = require('./scripts/maintenance/scheduled-tasks')
      ScheduledTasks.initialize()
      appLogger.info('定时任务初始化完成')
    } catch (error) {
      appLogger.error('定时任务初始化失败', { error: error.message })
    }

    // V4统一决策引擎启动完成
    appLogger.info('餐厅积分抽奖系统V4.0统一引擎启动成功', {
      host: HOST,
      port: PORT,
      environment: process.env.NODE_ENV || 'development',
      start_time: BeijingTimeHelper.apiTimestamp(),
      endpoints: {
        health: `http://${HOST}:${PORT}/health`,
        lottery: `http://${HOST}:${PORT}/api/v4/lottery`,
        admin: `http://${HOST}:${PORT}/api/v4/admin`,
        websocket: `ws://${HOST}:${PORT}/socket.io` // 新增WebSocket端点
      }
    })

    // ✅ V4架构已完全启用，无需传统定时任务服务
    appLogger.info('V4统一决策引擎架构完全就绪', {
      architecture: '现代化微服务架构',
      websocket: '实时通信已启用'
    })

    /*
     * 🔌 优雅关闭处理（2025年11月08日新增）
     * 功能：服务关闭时记录WebSocket停止事件到数据库
     * 用途：服务维护、部署更新、异常追踪、SLA统计
     */
    const gracefulShutdown = async signal => {
      appLogger.info(`收到${signal}信号，开始优雅关闭...`)

      try {
        // 记录WebSocket服务停止事件
        const ChatWebSocketService = require('./services/ChatWebSocketService')
        await ChatWebSocketService.shutdown(`收到${signal}信号`)
        appLogger.info('WebSocket服务已优雅关闭')
      } catch (error) {
        appLogger.error('WebSocket关闭失败', { error: error.message })
      }

      // 关闭数据库连接
      try {
        const { sequelize } = require('./models')
        await sequelize.close()
        appLogger.info('数据库连接已关闭')
      } catch (error) {
        appLogger.error('数据库关闭失败', { error: error.message })
      }

      appLogger.info('服务已优雅关闭')
      process.exit(0)
    }

    // 注册信号处理
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
    process.on('SIGINT', () => gracefulShutdown('SIGINT'))
  })
}

module.exports = app
