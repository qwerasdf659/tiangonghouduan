/**
 * 用户行为分析API验证中间件
 * 提供数据验证、安全控制、限流等功能
 * 深度集成v3.0架构的安全策略
 * 创建时间：2025年08月19日
 */

const joi = require('joi')
const rateLimit = require('express-rate-limit')
const ApiResponse = require('../utils/ApiResponse')

// 🔥 行为数据验证schema
const behaviorDataSchema = joi.object({
  behaviors: joi
    .array()
    .items(
      joi
        .object({
          eventType: joi
            .string()
            .valid(
              'page_view',
              'click',
              'draw',
              'earn_points',
              'consume_points',
              'login',
              'logout',
              'search',
              'share',
              'favorite'
            )
            .required()
            .messages({
              'any.only': '事件类型必须是有效值',
              'any.required': '事件类型为必填项'
            }),

          eventData: joi.object().required().messages({
            'any.required': '事件数据为必填项'
          }),

          sessionId: joi.string().max(64).messages({
            'string.max': '会话ID长度不能超过64个字符'
          }),

          timestamp: joi.number().positive().optional().messages({
            'number.positive': '时间戳必须是正数'
          }),

          deviceInfo: joi.object().optional(),
          ip: joi.string().optional(),
          userAgent: joi.string().optional()
        })
        .required()
    )
    .max(100)
    .min(1)
    .required()
    .messages({
      'array.max': '每次最多上报100条行为数据',
      'array.min': '至少需要1条行为数据',
      'any.required': '行为数据数组为必填项'
    }),

  sessionId: joi.string().max(64).required().messages({
    'string.max': '会话ID长度不能超过64个字符',
    'any.required': '会话ID为必填项'
  })
})

// 🔥 推荐查询参数验证schema
const recommendationQuerySchema = joi.object({
  type: joi
    .string()
    .valid('lottery_campaign', 'points_task', 'product', 'activity', 'all')
    .default('all')
    .messages({
      'any.only': '推荐类型必须是有效值'
    }),

  limit: joi.number().integer().min(1).max(50).default(10).messages({
    'number.base': '限制数量必须是数字',
    'number.integer': '限制数量必须是整数',
    'number.min': '限制数量最小为1',
    'number.max': '限制数量最大为50'
  })
})

// 🔥 管理员查询参数验证schema
const adminQuerySchema = joi.object({
  timeRange: joi
    .string()
    .pattern(/^\d+[dh]$/)
    .default('7d')
    .messages({
      'string.pattern.base': '时间范围格式错误，示例：7d、24h'
    }),

  page: joi.number().integer().min(1).default(1).messages({
    'number.min': '页码最小为1'
  }),

  limit: joi.number().integer().min(1).max(100).default(20).messages({
    'number.min': '每页最小1条',
    'number.max': '每页最大100条'
  })
})

/**
 * 🔥 验证行为数据上报
 */
const validateBehaviorData = (req, res, next) => {
  const { error, value } = behaviorDataSchema.validate(req.body, {
    abortEarly: false,
    stripUnknown: true
  })

  if (error) {
    const errorDetails = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      value: detail.context.value
    }))

    return res.status(400).json(
      ApiResponse.error('行为数据验证失败', 'VALIDATION_ERROR', {
        errors: errorDetails
      })
    )
  }

  // 🔥 数据安全清理
  value.behaviors = value.behaviors.map(behavior => ({
    ...behavior,
    // 移除可能的敏感数据
    eventData: sanitizeEventData(behavior.eventData),
    // 标准化时间戳
    timestamp: behavior.timestamp || Date.now()
  }))

  req.body = value
  next()
}

/**
 * 🔥 验证推荐查询参数
 */
const validateRecommendationQuery = (req, res, next) => {
  const { error, value } = recommendationQuerySchema.validate(req.query, {
    stripUnknown: true
  })

  if (error) {
    return res.status(400).json(
      ApiResponse.error('推荐查询参数验证失败', 'VALIDATION_ERROR', {
        error: error.details[0].message
      })
    )
  }

  req.query = value
  next()
}

/**
 * 🔥 验证管理员查询参数
 */
const validateAdminQuery = (req, res, next) => {
  const { error, value } = adminQuerySchema.validate(req.query, {
    stripUnknown: true
  })

  if (error) {
    return res.status(400).json(
      ApiResponse.error('管理员查询参数验证失败', 'VALIDATION_ERROR', {
        error: error.details[0].message
      })
    )
  }

  req.query = value
  next()
}

/**
 * 🔥 验证用户ID参数
 */
const validateUserId = (req, res, next) => {
  const userId = parseInt(req.params.userId)

  if (isNaN(userId) || userId <= 0) {
    return res.status(400).json(ApiResponse.error('用户ID格式错误', 'INVALID_USER_ID'))
  }

  req.params.userId = userId
  next()
}

/**
 * 🔥 验证用户权限
 * 用户只能访问自己的数据，管理员可以访问所有数据
 */
const validateUserAccess = (req, res, next) => {
  const requestUserId = parseInt(req.params.userId)
  const currentUserId = req.user.user_id
  const isAdmin = req.user.is_admin

  if (requestUserId !== currentUserId && !isAdmin) {
    return res.status(403).json(ApiResponse.error('权限不足，只能访问自己的数据', 'ACCESS_DENIED'))
  }

  next()
}

/**
 * 🔥 行为数据上报限流
 * 防止恶意高频上报
 */
const behaviorUploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 10, // 每分钟最多10次
  message: {
    code: -1,
    msg: '行为数据上报过于频繁，请稍后再试',
    data: null
  },
  standardHeaders: true,
  legacyHeaders: false,
  // 🔥 基于用户ID限流，而不是IP
  keyGenerator: req => {
    return req.user ? `user_${req.user.user_id}` : req.ip
  },
  skip: req => {
    // 管理员跳过限流
    return req.user && req.user.is_admin
  }
})

/**
 * 🔥 推荐查询限流
 * 防止频繁查询推荐接口
 */
const recommendationQueryLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 30, // 每分钟最多30次
  message: {
    code: -1,
    msg: '推荐查询过于频繁，请稍后再试',
    data: null
  },
  keyGenerator: req => {
    return req.user ? `rec_${req.user.user_id}` : req.ip
  }
})

/**
 * 🔥 管理员接口限流
 * 保护管理员接口
 */
const adminQueryLimiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 60, // 每分钟最多60次
  message: {
    code: -1,
    msg: '管理员接口访问过于频繁，请稍后再试',
    data: null
  },
  keyGenerator: req => {
    return req.user ? `admin_${req.user.user_id}` : req.ip
  }
})

/**
 * 🔥 数据安全清理函数
 * @param {Object} eventData - 事件数据
 * @returns {Object} 清理后的数据
 * @private
 */
function sanitizeEventData (eventData) {
  if (typeof eventData !== 'object' || eventData === null) {
    return {}
  }

  const sanitized = { ...eventData }

  // 🔥 移除敏感字段
  const sensitiveFields = [
    'password',
    'token',
    'sessionToken',
    'authToken',
    'apiKey',
    'secret',
    'privateKey',
    'creditCard',
    'ssn',
    'passport',
    'idCard'
  ]

  sensitiveFields.forEach(field => {
    delete sanitized[field]
  })

  // 🔥 限制数据大小（防止大数据攻击）
  const maxDataSize = 10 * 1024 // 10KB
  const dataString = JSON.stringify(sanitized)

  if (Buffer.byteLength(dataString, 'utf8') > maxDataSize) {
    console.warn('事件数据过大，已截断')
    return { truncated: true, originalSize: dataString.length }
  }

  return sanitized
}

/**
 * 🔥 错误处理中间件
 * 统一处理验证错误
 */
const handleValidationError = (error, req, res, next) => {
  if (error.name === 'ValidationError') {
    return res.status(400).json(
      ApiResponse.error('数据验证失败', 'VALIDATION_ERROR', {
        details: error.details
      })
    )
  }

  if (error.name === 'UnauthorizedError') {
    return res.status(401).json(ApiResponse.error('认证失败', 'UNAUTHORIZED'))
  }

  next(error)
}

/**
 * 🔥 请求日志中间件（用于行为分析调试）
 */
const requestLogger = (req, res, next) => {
  const startTime = Date.now()

  // 记录请求开始
  console.log(
    `📊 [Analytics API] ${req.method} ${req.path} - 用户${req.user?.user_id || 'anonymous'}`
  )

  // 监听响应结束
  res.on('finish', () => {
    const duration = Date.now() - startTime
    const statusColor = res.statusCode < 400 ? '✅' : '❌'

    console.log(
      `${statusColor} [Analytics API] ${req.method} ${req.path} - ` +
        `${res.statusCode} - ${duration}ms - 用户${req.user?.user_id || 'anonymous'}`
    )
  })

  next()
}

module.exports = {
  validateBehaviorData,
  validateRecommendationQuery,
  validateAdminQuery,
  validateUserId,
  validateUserAccess,
  behaviorUploadLimiter,
  recommendationQueryLimiter,
  adminQueryLimiter,
  handleValidationError,
  requestLogger
}
