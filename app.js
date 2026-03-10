/**
 * 餐厅积分抽奖系统 V4.0 - 统一引擎架构主应用入口
 * 创建时间：2025年01月21日 19:00 北京时间
 * 适用区域：中国 (使用北京时间 Asia/Shanghai)
 * 架构：V4统一抽奖引擎架构
 * 技术栈：Node.js 20+ + Express + V4统一引擎 + MySQL + Sequelize + Redis
 */

'use strict'

//  设置应用程序时区为北京时间 (中国区域)
process.env.TZ = 'Asia/Shanghai'

const crypto = require('crypto')
const express = require('express')
const path = require('path') // 用于静态文件路径处理
const cors = require('cors')
const helmet = require('helmet')
const compression = require('compression')
const rateLimit = require('express-rate-limit')
const cookieParser = require('cookie-parser') //  Cookie解析中间件（Token安全升级）
/**
 * dotenv配置：所有环境统一禁止 override（单一真相源方案）
 * 优先级模型：PM2 env_file 注入 > .env 补齐（跨环境一致、可预测）
 */
require('dotenv').config()
console.log(` [${process.env.NODE_ENV || 'unknown'}] 环境变量已加载，配置源：.env 文件`)

//  配置校验（统一 fail-fast 模式）
const { validateConfig } = require('./config/environment')
/**
 * 配置校验架构升级（2025-12-30 配置管理三层分离方案）
 * - 所有环境统一 fail-fast（移除 development 的 try/catch 忽略）
 * - 校验逻辑统一到 ConfigValidator（基于 CONFIG_SCHEMA 权威定义）
 * - 避免"开发能跑、生产炸"的环境差异问题
 */
validateConfig(true) // failFast=true，所有环境遇错即退出

//  北京时间工具导入
const BeijingTimeHelper = require('./utils/timeHelper')

//  统一日志系统导入
const logger = require('./utils/logger')
const appLogger = logger

//  导入API响应统一中间件 - 解决API格式不一致问题
const ApiResponse = require('./utils/ApiResponse')

/**
 * 统一 request_id 获取逻辑（与 ApiResponse.middleware 兼容）
 * - /api/*：优先使用 ApiResponse.middleware 注入的 req.id
 * - 非 /api/*：使用请求头或本地生成
 * @param {Object} req - Express请求对象
 * @returns {string} 请求ID
 */
function getRequestId(req) {
  return (
    req.id ||
    req.headers['x-request-id'] ||
    req.headers['request-id'] ||
    `req_${crypto.randomUUID()}`
  )
}

// 确保Node.js使用北京时间
appLogger.info('应用启动', {
  start_time: BeijingTimeHelper.formatChinese(),
  timezone: 'Asia/Shanghai',
  node_version: process.version
})

// 初始化Express应用
const app = express()

//  信任代理配置 - Sealos部署环境必需
app.set('trust proxy', true)

//  安全中间件
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://unpkg.com'],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://unpkg.com',
          'https://cdn.jsdelivr.net'
        ],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
        baseUri: ["'self'"],
        fontSrc: ["'self'", 'https:', 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        objectSrc: ["'none'"],
        // 允许内联事件处理器（onclick等），管理后台页面需要
        scriptSrcAttr: ["'unsafe-inline'"],
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

//  CORS配置 - 支持微信小程序跨域访问
app.use(
  cors({
    origin: corsOriginValidator,
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  })
)

//  请求体解析
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

//  Cookie解析中间件（Token安全升级 - 用于读取HttpOnly refresh_token）
app.use(cookieParser())

//  压缩响应
app.use(compression())

/*
 *  API请求频率限制 V4 - Redis滑动窗口限流
 * 创建时间：2025年10月12日
 * 功能：防止恶意刷接口，保护服务器资源
 */
const { getRateLimiter } = require('./middleware/RateLimiterMiddleware')
const rateLimiter = getRateLimiter()

//  API响应格式统一中间件 - 统一所有API响应格式（必须在 /api 限流器之前，确保限流响应也包含 request_id）
app.use('/api/', ApiResponse.middleware())

//  全局API限流 - 100次/分钟/IP（基于Redis）
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

//  后备限流器（当Redis不可用时） - 1000次/15分钟
const fallbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 1000, // 限制每个IP 15分钟内最多1000个请求
  // 使用 handler 输出统一 ApiResponse 格式（禁止直接返回非标准 message 对象）
  handler: (req, res, _next, options) => {
    //  可观测性：记录后备限流触发（Redis退化）
    appLogger.warn('[RateLimiter] 后备限流触发（Redis不可用）', {
      limiter_type: 'fallback',
      redis_status: 'disconnected',
      ip: req.ip,
      path: req.path,
      method: req.method,
      timestamp: BeijingTimeHelper.now()
    })
    return res.apiError(
      options.message || '请求太频繁，请稍后再试',
      'RATE_LIMIT_EXCEEDED',
      { window_ms: options.windowMs, max: options.limit },
      429
    )
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: req => {
    const redisConnected = rateLimiter.redisClient.isConnected
    //  可观测性：记录限流链路切换
    if (!redisConnected) {
      appLogger.warn('[RateLimiter] Redis不可用，启用后备限流', {
        limiter_type: 'fallback',
        redis_status: 'disconnected',
        ip: req.ip,
        path: req.path,
        timestamp: BeijingTimeHelper.now()
      })
    }
    // 当Redis可用时跳过后备限流器
    return redisConnected
  },
  keyGenerator: req => {
    return req.ip || req.connection.remoteAddress || 'unknown'
  }
})
app.use('/api/', fallbackLimiter)

//  请求日志中间件
app.use((req, res, next) => {
  appLogger.debug('API请求', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    timestamp: BeijingTimeHelper.apiTimestamp()
  })
  next()
})

//  维护模式拦截中间件 — 管理员开启维护模式后，用户端 API 返回 503
const { createMaintenanceMiddleware } = require('./middleware/maintenanceMode')
app.use(createMaintenanceMiddleware())

/*
 *  全局API超时保护中间件（30秒）
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

      return res.apiError(
        '请求处理超时，请稍后重试',
        'REQUEST_TIMEOUT',
        {
          timeout: `${API_TIMEOUT / 1000}秒`,
          suggestion: '如果问题持续，请联系技术支持'
        },
        504
      )
    }
  })

  // 设置响应超时
  res.setTimeout(API_TIMEOUT)

  next()
})

//  健康检查端点
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

    // 检查Redis连接（真实检查 - P0修复）
    let redisStatus = 'disconnected'
    try {
      const { isRedisHealthy } = require('./utils/UnifiedRedisClient')
      const redisHealthy = await isRedisHealthy()
      redisStatus = redisHealthy ? 'connected' : 'disconnected'
    } catch (error) {
      appLogger.error('Redis连接检查失败', { error: error.message })
      redisStatus = 'disconnected'
    }

    // 计算整体状态（degraded模式 - P0修复）
    const overallStatus =
      databaseStatus === 'connected' && redisStatus === 'connected' ? 'healthy' : 'degraded'

    const healthCode = overallStatus === 'healthy' ? 'SYSTEM_HEALTHY' : 'SYSTEM_DEGRADED'

    const healthData = {
      success: true, //  业务标准格式
      code: healthCode, //  业务代码（根据整体状态）
      message:
        overallStatus === 'healthy'
          ? 'V4 Unified Lottery Engine 系统运行正常'
          : 'V4 Unified Lottery Engine 系统降级运行', //  用户友好消息
      data: {
        status: overallStatus,
        version: '4.0.0',
        architecture: 'V4 Unified Lottery Engine',
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
      timestamp: BeijingTimeHelper.apiTimestamp(), //  顶层 timestamp（监控标准）
      version: 'v4.0', //  API版本信息
      request_id: getRequestId(req) //  请求追踪ID
    }

    res.json(healthData)
  } catch (error) {
    appLogger.error('健康检查失败', { error: error.message, stack: error.stack })
    res.status(500).json({
      success: false, //  业务标准格式
      code: 'SYSTEM_UNHEALTHY', //  业务错误代码
      message: '系统健康检查失败', //  用户友好错误消息
      data: {
        status: 'unhealthy',
        error: error.message
      },
      timestamp: BeijingTimeHelper.apiTimestamp(), //  顶层 timestamp
      version: 'v4.0', //  API版本信息
      request_id: getRequestId(req) //  请求追踪ID
    })
  }
})

//  V4统一引擎信息端点
app.get('/api/v4', (req, res) => {
  return res.apiSuccess(
    {
      version: '4.0.0',
      name: '餐厅积分抽奖系统 V4.6统一引擎',
      architecture: 'unified-lottery-pipeline',
      description: 'V4.6统一抽奖引擎架构 - Pipeline 模式统一管理',
      engine: {
        name: 'UnifiedLotteryEngine',
        version: '4.6.0',
        /**
         * V4.6 管线架构（2026-01-19 Phase 5 迁移）
         *
         * 替代原 Strategy 模式
         * 统一使用 Pipeline 架构
         */
        /**
         * V4.6 Phase 5：原 3 条管线已合并为 1 条统一管线
         * 决策来源由 LoadDecisionSourceStage 在管线内判断
         */
        pipelines: ['NormalDrawPipeline - 统一抽奖管线（Phase 5 合并）'],
        decision_sources: ['normal', 'preset', 'override'], // 决策来源类型
        core: {
          UnifiedLotteryEngine: '统一抽奖引擎 - Pipeline 设计',
          DrawOrchestrator: '管线编排器',
          LoadDecisionSourceStage: '决策来源判断 Stage'
        }
      },
      endpoints: {
        lottery: '/api/v4/lottery',
        admin: '/api/v4/console',
        health: '/health'
      },
      features: ['统一抽奖引擎', '智能策略选择', '实时决策处理', '完整审计日志', '高性能优化']
    },
    'V4统一抽奖引擎信息获取成功',
    'ENGINE_INFO_SUCCESS'
  )
})

//  V4统一引擎API文档端点
app.get('/api/v4/docs', (req, res) => {
  return res.apiSuccess(
    {
      title: '餐厅积分抽奖系统 V4.0 统一引擎API文档',
      version: '4.0.0',
      architecture: 'unified-lottery-engine-v4.6-pipeline',
      description: 'V4.6统一抽奖引擎架构，使用 Pipeline 管线模式替代 Strategy 策略模式',
      last_updated: BeijingTimeHelper.apiTimestamp(),
      unified_engine: {
        description: 'V4.6统一抽奖引擎通过 DrawOrchestrator 编排 Pipeline 管线执行抽奖',
        endpoints: {
          'POST /api/v4/lottery/draw': '执行抽奖（Pipeline模式）',
          'GET /api/v4/lottery/strategies': '获取管线列表',
          'GET /api/v4/lottery/metrics': '获取引擎指标',
          'POST /api/v4/lottery/validate': '验证抽奖条件'
        },
        /**
         * V4.6 Phase 5：统一管线架构
         */
        pipelines: ['NormalDrawPipeline - 统一抽奖管线'],
        decision_sources: ['normal', 'preset', 'override'],
        orchestrator: 'DrawOrchestrator - 管线编排器'
      },
      admin_system: {
        description: 'V4管理系统提供引擎配置、监控和维护功能',
        endpoints: {
          'GET /api/v4/console/system/dashboard': '管理仪表板',
          'POST /api/v4/console/config': '更新引擎配置',
          'GET /api/v4/console/logs': '获取执行日志',
          'POST /api/v4/console/maintenance': '维护模式控制'
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
          admin: '/api/v4/console'
        }
      }
    },
    'V4统一抽奖引擎API文档获取成功',
    'API_DOCS_SUCCESS'
  )
})

/*
 *  基础路由配置
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
        admin_panel: '/api/v4/console',
        docs: '/api/v4/docs'
      }
    },
    timestamp: BeijingTimeHelper.apiTimestamp()
  })
})

// API基础路径
app.get('/api', (req, res) => {
  return res.apiSuccess(
    {
      version: 'v4.0',
      latest_version: 'v4.0',
      available_versions: ['v4'],
      architecture: 'unified_decision_engine',
      v4_features: {
        unified_engine: '/api/v4/lottery',
        admin_panel: '/api/v4/console',
        performance_metrics: '/api/v4/console/system/status',
        decision_analytics: '/api/v4/console/analytics/decisions/analytics'
      }
    },
    'API服务正常',
    'API_OK'
  )
})

/*
 * ========================================
 *  Web管理后台静态文件托管
 * ========================================
 */

/**
 * 托管管理后台静态文件（Vite 构建输出）
 *
 * 路径映射：
 * - /admin/dashboard.html → admin/dist/dashboard.html
 * - /admin/assets/main.js → admin/dist/assets/main.js
 * - /admin/assets/main.css → admin/dist/assets/main.css
 *
 *  必须在API路由注册之前配置，避免路由冲突
 *  已从 public/admin 迁移到 admin/dist（Vite 构建输出）
 */
app.use(
  '/admin',
  express.static(path.join(__dirname, 'admin/dist'), {
    index: false, // 禁用默认首页，避免冲突
    maxAge: 0, // 禁用缓存，更新立即生效
    etag: false, // 禁用ETag
    lastModified: true, // 启用Last-Modified
    dotfiles: 'ignore', // 忽略隐藏文件
    redirect: false, // 禁用目录重定向
    setHeaders: (res, _filePath) => {
      // 强制不缓存，确保每次都获取最新文件
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.set('Pragma', 'no-cache')
      res.set('Expires', '0')
    }
  })
)

/**
 * 根路径重定向到登录页
 */
app.get('/admin', (req, res) => {
  res.redirect(301, '/admin/login.html')
})

appLogger.info(' Web管理后台静态文件托管已配置', {
  mount: '/admin',
  directory: 'admin/dist',
  cache: '1h'
})
// ========================================

/*
 * ========================================
 *  V4 API路由注册（标准化域结构）
 * ========================================
 *
 *  API顶层域规范（共8个标准域）：
 * - /market    交易市场
 * - /shop      积分商城（积分、兑换、消费、会员）
 * - /lottery   抽奖系统
 * - /backpack  背包系统（用户资产统一入口）
 * - /user      用户中心
 * - /admin     管理后台
 * - /auth      认证授权
 * - /system    系统功能
 *
 *  目录结构规范：
 * - routes/v4/{domain}/ 目录名与顶层域一致
 * - 每个域有独立的index.js聚合子路由
 */
try {
  /*
   * ========================================
   * 0. /images - 图片代理域（公开接口，无需认证）
   *   解决 Sealos 对象存储 Content-Disposition: attachment
   *   导致微信小程序 <image> 组件无法渲染图片的问题
   * ========================================
   */
  app.use('/api/v4/images', require('./routes/v4/images'))
  appLogger.info(' images域加载成功', { route: '/api/v4/images' })

  /*
   * ========================================
   * 1. /auth - 认证授权域
   * ========================================
   */
  app.use('/api/v4/auth', require('./routes/v4/auth'))
  appLogger.info(' auth域加载成功', { route: '/api/v4/auth' })

  /*
   * ========================================
   * 1.1 /permissions - 权限管理域（2026-01-08 从 auth 域拆分）
   * ========================================
   *  拆分原因：解决 POST /api/v4/auth/refresh 路由冲突
   * - token.js 的 Token 刷新 和 permissions.js 的权限缓存失效 都注册了 /refresh
   * - Express 路由匹配规则：先注册先匹配，导致权限缓存失效接口不可达
   * 新路径：POST /api/v4/permissions/cache/invalidate
   */
  app.use('/api/v4/permissions', require('./routes/v4/auth/permissions'))
  appLogger.info(' permissions域加载成功', { route: '/api/v4/permissions' })

  /*
   * ========================================
   * 2. /console - 后台控制台域（从 admin 迁移）
   * ========================================
   */
  app.use('/api/v4/console', require('./routes/v4/console'))
  appLogger.info(' console域加载成功', { route: '/api/v4/console' })

  /*
   * ========================================
   * 3. /lottery - 抽奖系统域
   * ========================================
   */
  app.use('/api/v4/lottery', require('./routes/v4/lottery'))
  appLogger.info(' lottery域加载成功', { route: '/api/v4/lottery' })

  /*
   * ========================================
   * 4. /market - 交易市场域
   * ========================================
   */
  app.use('/api/v4/market', require('./routes/v4/market'))
  appLogger.info(' market域加载成功', { route: '/api/v4/market' })

  /*
   * ========================================
   * 5. /shop - 积分商城域
   * ========================================
   */
  app.use('/api/v4/shop', require('./routes/v4/shop'))
  appLogger.info(' shop域加载成功', { route: '/api/v4/shop' })

  /*
   * ========================================
   * 6. /system - 系统功能域
   * ========================================
   */
  app.use('/api/v4/system', require('./routes/v4/system'))
  appLogger.info(' system域加载成功', { route: '/api/v4/system' })

  /*
   * ========================================
   * 7. /user - 用户中心域
   * ========================================
   */
  app.use('/api/v4/user', require('./routes/v4/user'))
  appLogger.info(' user域加载成功', { route: '/api/v4/user' })

  /*
   * ========================================
   */

  /*
   * ========================================
   * 9. /assets - 资产查询域（2025-12-29 资产域标准架构新增）
   * ========================================
   */
  app.use('/api/v4/assets', require('./routes/v4/assets'))
  appLogger.info(' assets域加载成功', { route: '/api/v4/assets' })

  /*
   * ========================================
   * 10. /backpack - 背包查询域（2025-12-29 资产域标准架构新增）
   * ========================================
   */
  app.use('/api/v4/backpack', require('./routes/v4/backpack'))
  appLogger.info(' backpack域加载成功', { route: '/api/v4/backpack' })

  /*
   * ========================================
   * 11. /merchant-points - 商家积分申请域（P1 2026-01-09 统一审批流）
   * ========================================
   */
  app.use('/api/v4/merchant-points', require('./routes/v4/merchant-points'))
  appLogger.info(' merchant-points域加载成功', { route: '/api/v4/merchant-points' })

  /*
   * ========================================
   * 12. /activities - 活动条件域（2026-01-08 活动条件API）
   * ========================================
   * 功能：活动列表查询、参与条件验证、条件配置（管理员）
   */
  app.use('/api/v4/activities', require('./routes/v4/activities'))
  appLogger.info(' activities域加载成功', { route: '/api/v4/activities' })

  /*
   * ========================================
   *  调试控制接口（仅管理员）
   * ========================================
   */
  app.use('/api/v4/debug-control', require('./routes/v4/debug-control'))
  appLogger.info(' debug-control加载成功', { route: '/api/v4/debug-control' })

  /*
   * ========================================
   *  API架构信息汇总
   * ========================================
   */
  appLogger.info(' V4 API标准化域结构加载完成', {
    standard_domains: [
      '/auth',
      '/admin',
      '/lottery',
      '/market',
      '/shop',
      '/system',
      '/user',

      '/assets',
      '/backpack'
    ],
    compliance: '符合01-技术架构标准-权威版.md P0规范',
    refactored_at: '2025-12-21'
  })
} catch (error) {
  appLogger.error(' V4 API路由加载失败', { error: error.message, stack: error.stack })
  process.exit(1)
}

//  404处理
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    code: 'NOT_FOUND',
    message: `接口不存在: ${req.method} ${req.originalUrl}`,
    data: {
      availableEndpoints: [
        'GET /health',
        'GET /api/v4',
        'GET /api/v4/docs',
        // 认证域
        'POST /api/v4/auth/login',
        'POST /api/v4/auth/quick-login',
        'POST /api/v4/auth/logout',
        'GET /api/v4/auth/verify',
        'POST /api/v4/auth/refresh', // Token刷新
        // 权限域（2026-01-08 从 auth 域拆分）
        'GET /api/v4/permissions/me', // 获取当前用户权限
        'POST /api/v4/permissions/check', // 检查权限
        'POST /api/v4/permissions/cache/invalidate', // 权限缓存失效（ 新路径）
        'GET /api/v4/permissions/admins', // 管理员列表
        'GET /api/v4/permissions/statistics', // 权限统计
        'POST /api/v4/permissions/batch-check', // 批量权限检查
        // 抽奖域
        'POST /api/v4/lottery/draw',
        'GET /api/v4/lottery/strategies',
        // 活动域
        'GET /api/v4/activities/available',
        'GET /api/v4/activities/:idOrCode/check-eligibility',
        'POST /api/v4/activities/:idOrCode/participate',
        'POST /api/v4/activities/:code/configure-conditions',
        // 控制台域
        'GET /api/v4/console/system/dashboard'
      ]
    },
    timestamp: BeijingTimeHelper.apiTimestamp(), //  北京时间API时间戳
    version: 'v4.0',
    request_id: getRequestId(req)
  })
})

/**
 *  全局错误处理
 *
 * 架构决策4（2026-01-13）：
 * - BusinessError：使用业务错误码，details 仅日志记录，不返回给客户端
 * - Sequelize 错误：隐藏内部细节，返回通用 DATABASE_ERROR
 * - 其他错误：开发环境返回详细信息，生产环境隐藏
 */
app.use((error, req, res, _next) => {
  const requestId = getRequestId(req)

  //  记录完整错误信息到日志（包含 request_id 用于追踪）
  appLogger.error('全局错误处理', {
    error: error.message,
    code: error.code,
    statusCode: error.statusCode,
    stack: error.stack,
    url: req.url,
    method: req.method,
    request_id: requestId,
    // 架构决策5：details 仅记录到日志，不返回给客户端
    details: error.details || null
  })

  //  BusinessError 处理（架构决策4）
  if (error.name === 'BusinessError') {
    const resp = ApiResponse.error(
      error.message,
      error.code,
      null, // 架构决策4：details 不暴露给客户端
      error.statusCode || 400
    )
    resp.request_id = requestId
    return ApiResponse.send(res, resp)
  }

  // Sequelize错误处理（隐藏内部细节）
  if (error.name === 'SequelizeError' || error.name?.startsWith('Sequelize')) {
    const resp = ApiResponse.error('数据库操作失败', 'DATABASE_ERROR', null, 500)
    resp.request_id = requestId
    return ApiResponse.send(res, resp)
  }

  // JWT错误处理
  if (error.name === 'JsonWebTokenError') {
    const resp = ApiResponse.error('Token无效', 'INVALID_TOKEN', null, 401)
    resp.request_id = requestId
    return ApiResponse.send(res, resp)
  }

  // 验证错误处理
  if (error.name === 'ValidationError') {
    const resp = ApiResponse.error(error.message, 'VALIDATION_ERROR', null, 400)
    resp.request_id = requestId
    return ApiResponse.send(res, resp)
  }

  // 默认错误处理
  const resp = ApiResponse.error(
    process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误',
    'INTERNAL_SERVER_ERROR',
    null,
    500
  )
  resp.request_id = requestId
  return ApiResponse.send(res, resp)
})

/**
 *  应用初始化流程（同步阻塞模式）
 *
 * 初始化顺序：
 * 1. Service层初始化
 * 2. 关键 SystemSettings 启动预检（阻塞式）
 * 3. 启动服务器监听端口
 *
 * 配置管理三层分离方案（2025-12-30）：
 * - 预检失败会 process.exit(1)，阻止服务启动
 * - 使用 await 确保预检在服务器启动前完成
 *
 * @returns {Promise<void>} 无返回值，初始化失败时直接退出进程
 */
async function initializeApp() {
  // 步骤1：初始化 Service 层
  try {
    const models = require('./models')
    const { initializeServices } = require('./services')
    const services = initializeServices(models)

    // 将Service容器和Models添加到app实例中，供路由使用
    app.locals.services = services
    app.locals.models = models // 注入models供路由层使用

    appLogger.info('Service层初始化完成', {
      services: Array.from(services.getAllServices().keys())
    })

    // 审核链超时自动升级定时任务（每30分钟扫描）
    try {
      const ApprovalChainTimeoutService = require('./services/ApprovalChainTimeoutService')
      ApprovalChainTimeoutService.start()
      appLogger.info('审核链超时扫描定时任务已启动')
    } catch (timeoutError) {
      appLogger.warn(`审核链超时服务启动失败（非致命）: ${timeoutError.message}`)
    }

    // 运行时自检：打印连接池配置
    const pool = models.sequelize.connectionManager.pool
    if (pool && pool._factory) {
      appLogger.info('数据库连接池配置', {
        source: 'config/database.js',
        max: pool._factory.max || 0,
        min: pool._factory.min || 0,
        acquire: pool._factory.acquireTimeoutMillis || 0,
        idle: pool.idleTimeoutMillis || 0,
        evict: pool.reapIntervalMillis || 0,
        note: '单一配置源 - 禁止其他地方自建连接池'
      })
    }
  } catch (error) {
    appLogger.error('Service层初始化失败', { error: error.message })
    process.exit(1)
  }

  // 步骤2：关键 SystemSettings 启动预检（同步阻塞）
  try {
    const { validateCriticalSettings } = require('./config/system-settings-validator')
    await validateCriticalSettings() //  使用 await 确保同步阻塞
    appLogger.info(' SystemSettings 启动预检通过')
  } catch (error) {
    // 预检器内部已经 process.exit(1)，这里仅作日志记录
    appLogger.error('SystemSettings 启动预检失败', { error: error.message })
    // 确保进程退出
    process.exit(1)
  }

  // 步骤3：审计操作类型 ENUM 一致性校验（审计整合方案 V4.5.0 决策）
  try {
    const { validateDbEnumConsistency } = require('./constants/AuditOperationTypes')
    const { sequelize } = app.locals.models // 从已注入的 models 获取 sequelize
    const enumResult = await validateDbEnumConsistency(sequelize)

    if (!enumResult.valid) {
      appLogger.error(' 审计操作类型 ENUM 一致性校验失败', {
        missing: enumResult.missing,
        extra: enumResult.extra,
        solution: '请执行数据库迁移: npx sequelize-cli db:migrate'
      })
      // ENUM 不一致会导致审计日志写入失败，强制退出
      process.exit(1)
    }

    if (enumResult.skipped) {
      appLogger.warn(' 审计操作类型 ENUM 校验跳过（表或列不存在）')
    } else {
      appLogger.info(' 审计操作类型 ENUM 一致性校验通过')
    }
  } catch (error) {
    appLogger.warn('审计 ENUM 校验出错（非致命）', { error: error.message })
    // 校验函数内部已记录详细错误，不阻断启动
  }

  // 步骤4：审计日志 target_type 一致性校验（P0-5 实施 - 2026-01-09）
  try {
    const { validateTargetTypeConsistency } = require('./constants/AuditTargetTypes')
    const { sequelize } = app.locals.models
    const targetTypeResult = await validateTargetTypeConsistency(sequelize)

    if (!targetTypeResult.valid) {
      appLogger.error(' 审计日志 target_type 一致性校验失败', {
        unknown: targetTypeResult.unknown,
        stats: targetTypeResult.stats,
        solution: '请检查 constants/AuditTargetTypes.js 中的 AUDIT_TARGET_TYPES 定义'
      })
      /*
       * target_type 不一致可能导致审计追溯问题，但不强制退出
       * 仅记录错误，运维人员根据情况处理
       */
    } else if (targetTypeResult.warning) {
      appLogger.warn(' target_type 存在可规范化的值，建议执行数据迁移', {
        unknown: targetTypeResult.unknown
      })
    } else if (targetTypeResult.skipped) {
      appLogger.info('ℹ target_type 校验跳过（表为空）')
    } else {
      appLogger.info(' 审计日志 target_type 一致性校验通过', {
        total_types: targetTypeResult.stats?.total_types,
        total_records: targetTypeResult.stats?.total_records
      })
    }
  } catch (error) {
    appLogger.warn('target_type 校验出错（非致命）', { error: error.message })
  }

  // 步骤5：DisplayNameService 初始化（中文显示名称系统 V4.7 - 2026-01-22）
  try {
    const DisplayNameService = require('./services/DisplayNameService')
    await DisplayNameService.initialize()
    appLogger.info(' DisplayNameService 中文显示名称服务初始化完成')
  } catch (error) {
    appLogger.error('DisplayNameService 初始化失败（非致命）', { error: error.message })
    // 显示名称服务初始化失败不阻断启动，降级为使用内存缓存或直接数据库查询
  }
}

/*
 *  测试环境自动初始化 ServiceManager
 * 问题：测试通过 require('app') 加载时，initializeApp() 不会被调用
 * 解决：检测测试环境并自动初始化 Service 层
 */
if (process.env.NODE_ENV === 'test' && !app.locals.services) {
  try {
    const models = require('./models')
    const { initializeServices } = require('./services')
    const services = initializeServices(models)
    app.locals.services = services
    app.locals.models = models
    appLogger.info(' 测试环境 Service 层自动初始化完成', {
      services: Array.from(services.getAllServices().keys())
    })
  } catch (error) {
    appLogger.error(' 测试环境 Service 层初始化失败', { error: error.message })
  }
}

//  启动服务器
const PORT = process.env.PORT || 3000
const HOST = process.env.HOST || '0.0.0.0'

if (require.main === module) {
  //  使用http.createServer创建服务器实例（支持WebSocket）
  const http = require('http')
  const server = http.createServer(app)

  //  先执行初始化（包含预检），再启动服务器监听
  initializeApp()
    .then(() => {
      server.listen(PORT, HOST, async () => {
        console.log(' [DEBUG] 服务器启动监听完成')

        //  初始化聊天WebSocket服务
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
          const ScheduledTasks = require('./scripts/maintenance/scheduled_tasks')
          ScheduledTasks.initialize()
          appLogger.info('定时任务初始化完成')
        } catch (error) {
          appLogger.error('定时任务初始化失败', { error: error.message })
        }

        // 初始化广告系统定时任务（ENABLE_AD_CRON_JOBS=true 时启用）
        try {
          require('./jobs/ad-cron-jobs')
          appLogger.info('广告定时任务模块已加载', {
            enabled: process.env.ENABLE_AD_CRON_JOBS === 'true'
          })
        } catch (error) {
          appLogger.error('广告定时任务加载失败', { error: error.message })
        }

        // 初始化内容过期清理定时任务（ENABLE_CONTENT_CRON_JOBS=true 时启用）
        try {
          require('./jobs/ad-campaign-expiry-jobs')
          appLogger.info('内容过期清理定时任务模块已加载', {
            enabled: process.env.ENABLE_CONTENT_CRON_JOBS === 'true'
          })
        } catch (error) {
          appLogger.error('内容过期清理定时任务加载失败', { error: error.message })
        }

        // 初始化管理员通知清理定时任务（ENABLE_NOTIFICATION_CLEANUP=true 时启用）
        try {
          require('./jobs/daily-notification-cleanup')
          appLogger.info('管理员通知清理定时任务模块已加载', {
            enabled: process.env.ENABLE_NOTIFICATION_CLEANUP === 'true'
          })
        } catch (error) {
          appLogger.error('管理员通知清理定时任务加载失败', { error: error.message })
        }

        /*
         *  连接池持续监控（2025-12-30 方案A已拍板）
         * 功能：每60s打点到应用日志，建立连接池可观测性
         * 环境：生产环境已确认允许（噪音可接受）
         * 告警条件：waiting > 5（严重）、usage_rate > 80%（警告）
         */
        if (process.env.ENABLE_POOL_MONITORING !== 'false') {
          const { sequelize } = require('./models')

          setInterval(() => {
            const pool = sequelize.connectionManager.pool
            if (!pool) return

            const metrics = {
              size: pool.size || 0,
              available: pool.available || 0,
              using: pool.using || 0,
              waiting: pool.waiting || 0,
              max: pool.max || 0,
              usage_rate: pool.max > 0 ? ((pool.using / pool.max) * 100).toFixed(1) + '%' : '0%'
            }

            // 正常状态：info 级别（可通过日志级别过滤）
            appLogger.info('连接池状态', metrics)

            // 告警条件1：等待连接过多（严重）- 阈值已拍板
            if (metrics.waiting > 5) {
              appLogger.error('连接池告警: 等待连接过多', {
                ...metrics,
                alert_type: 'HIGH_WAITING_COUNT',
                severity: 'CRITICAL',
                recommendation: '立即排查慢查询或增加 pool.max',
                threshold: 'waiting > 5（已拍板，先跑一周再调整）'
              })
            }

            // 告警条件2：使用率过高（警告）- 阈值已拍板
            if (pool.using / pool.max > 0.8) {
              appLogger.warn('连接池告警: 使用率过高', {
                ...metrics,
                alert_type: 'HIGH_USAGE_RATE',
                severity: 'WARNING',
                recommendation: '评估是否需要增加 pool.max 或优化查询',
                threshold: 'usage_rate > 80%（已拍板，先跑一周再调整）'
              })
            }
          }, 60000) // 每分钟

          appLogger.info(' 连接池监控已启动', {
            interval: '60s',
            alert_thresholds: { waiting: 5, usage_rate: '80%' },
            log_level: 'info',
            environment: process.env.NODE_ENV,
            disable_with: 'ENABLE_POOL_MONITORING=false'
          })
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
            admin: `http://${HOST}:${PORT}/api/v4/console`,
            websocket: `ws://${HOST}:${PORT}/socket.io` // 新增WebSocket端点
          }
        })

        //  V4架构已完全启用，无需传统定时任务服务
        appLogger.info('V4统一决策引擎架构完全就绪', {
          architecture: '现代化微服务架构',
          websocket: '实时通信已启用'
        })

        /*
         *  优雅关闭处理（2025年11月08日新增）
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
    })
    .catch(error => {
      appLogger.error('应用初始化失败', { error: error.message })
      process.exit(1)
    })
}

module.exports = app
