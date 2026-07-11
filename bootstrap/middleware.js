/**
 * 基础中间件装配（bootstrap 模块，2026-07-11 自 app.js 拆分，纯搬移不改行为）
 *
 * 装配顺序（顺序即安全链，禁止调整）：
 * 1. helmet 安全头（CSP 白名单）
 * 2. CORS（微信小程序无 origin 放行 + 域名白名单）
 * 3. 请求体解析（json/urlencoded 10mb）
 * 4. cookie 解析（HttpOnly refresh_token）
 * 5. 压缩
 * 6. ApiResponse 统一响应中间件（必须在限流器之前，确保限流响应含 request_id）
 * 7. 全局 Redis 滑动窗口限流（登录按 user、未登录按 ip）
 * 8. 后备内存限流（Redis 不可用时退化）
 * 9. 请求日志
 * 10. 维护模式拦截
 * 11. 30 秒 API 超时保护
 *
 * @module bootstrap/middleware
 */

'use strict'

const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const compression = require('compression')
const rateLimit = require('express-rate-limit')
const cookieParser = require('cookie-parser')

const BeijingTimeHelper = require('../utils/timeHelper')
const appLogger = require('../utils/logger')
const ApiResponse = require('../utils/ApiResponse')

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
      callback(new Error('CORS策略不允许该来源访问'))
    }
  }
}

/**
 * 装配基础中间件链到 app 实例
 *
 * @param {Object} app - Express 应用实例
 * @returns {void}
 */
function mountBaseMiddleware(app) {
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
          /*
           * connect-src（2026-06-17 新增）：显式声明前端可发起连接的目标，避免回退到 default-src 'self'。
           * - 'self'：本站 API
           * - Sealos 对象存储域名：客服聊天图片下载需 fetch 该域名的图片成 blob（精确白名单，不用 https: 通配，符合安全红线）
           * - blob:：blob URL 下载
           * - ws:/wss:：socket.io 实时通信（客服聊天 WebSocket）
           */
          connectSrc: ["'self'", 'https://objectstorageapi.bja.sealos.run', 'blob:', 'ws:', 'wss:'],
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
   * 功能：防止恶意刷接口，保护服务器资源
   */
  const { getRateLimiter } = require('../middleware/RateLimiterMiddleware')
  const rateLimiter = getRateLimiter()

  //  API响应格式统一中间件 - 统一所有API响应格式（必须在 /api 限流器之前，确保限流响应也包含 request_id）
  app.use('/api/', ApiResponse.middleware())

  //  全局API限流（阈值读 .env：RATE_LIMIT_GLOBAL_MAX，默认600；登录按 user、未登录按 ip）
  const GLOBAL_RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_GLOBAL_MAX, 10) || 600
  const globalRateLimiter = rateLimiter.createLimiter({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60 * 1000, // 窗口读 .env，默认1分钟
    max: GLOBAL_RATE_LIMIT_MAX, // 全局兜底阈值，读 .env
    keyPrefix: 'rate_limit:global:api:',
    keyGenerator: 'user_or_ip', // 登录按 user_id、未登录回退 IP（避免同出口IP多用户互挤）
    message: '请求过于频繁，请稍后再试',
    onLimitReached: (req, key, count) => {
      appLogger.warn('全局API限流触发', {
        ip: req.ip,
        user_id: req.user?.user_id,
        path: req.path,
        count,
        limit: GLOBAL_RATE_LIMIT_MAX
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
  const { createMaintenanceMiddleware } = require('../middleware/maintenanceMode')
  app.use(createMaintenanceMiddleware())

  /*
   *  全局API超时保护中间件（30秒）
   * 功能：防止长时间无响应的请求占用连接资源
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
}

module.exports = { mountBaseMiddleware }
