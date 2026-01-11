/**
 * 参数验证中间件
 * 用于验证API请求参数
 * 🕐 时区：北京时间 (UTC+8) - 中国区域专用
 */

'use strict'

const BeijingTimeHelper = require('../utils/timeHelper') // 🕐 北京时间工具

/**
 * 创建验证中间件
 * @param {Array} rules - 验证规则数组
 * @returns {Function} Express中间件函数
 */
function validationMiddleware(rules) {
  return (req, res, next) => {
    const errors = []

    for (const rule of rules) {
      const value = req.body[rule.field]

      // 检查必填字段
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push(`${rule.field} 是必填字段`)
        continue
      }

      // 如果字段不存在且不是必填，跳过验证
      if (value === undefined || value === null) {
        continue
      }

      // 类型验证
      if (rule.type) {
        switch (rule.type) {
          case 'number':
            if (typeof value !== 'number' && isNaN(Number(value))) {
              errors.push(`${rule.field} 必须是数字`)
            } else {
              const numValue = Number(value)
              if (rule.min !== undefined && numValue < rule.min) {
                errors.push(`${rule.field} 不能小于 ${rule.min}`)
              }
              if (rule.max !== undefined && numValue > rule.max) {
                errors.push(`${rule.field} 不能大于 ${rule.max}`)
              }
            }
            break

          case 'string':
            if (typeof value !== 'string') {
              errors.push(`${rule.field} 必须是字符串`)
            } else {
              if (rule.minLength && value.length < rule.minLength) {
                errors.push(`${rule.field} 长度不能少于 ${rule.minLength} 个字符`)
              }
              if (rule.maxLength && value.length > rule.maxLength) {
                errors.push(`${rule.field} 长度不能超过 ${rule.maxLength} 个字符`)
              }
              if (rule.enum && !rule.enum.includes(value)) {
                errors.push(`${rule.field} 必须是以下值之一: ${rule.enum.join(', ')}`)
              }
              // 🔥 手机号格式验证
              if (rule.pattern === 'phone') {
                const phoneRegex = /^1[3-9]\d{9}$/
                if (!phoneRegex.test(value)) {
                  errors.push(`${rule.field} 格式不正确，请输入有效的中国大陆手机号`)
                }
              }
            }
            break

          case 'boolean':
            if (typeof value !== 'boolean') {
              errors.push(`${rule.field} 必须是布尔值`)
            }
            break

          case 'array':
            if (!Array.isArray(value)) {
              errors.push(`${rule.field} 必须是数组`)
            }
            break

          case 'object':
            if (typeof value !== 'object' || Array.isArray(value)) {
              errors.push(`${rule.field} 必须是对象`)
            }
            break
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: '参数验证失败',
        errors,
        timestamp: BeijingTimeHelper.apiTimestamp() // 🕐 北京时间API时间戳
      })
    }

    next()
  }
}

/**
 * 验证正整数参数（用于ID验证）
 * @param {string} paramName - 参数名称（如 'user_id', 'item_id'）
 * @param {string} source - 参数来源（'params', 'query', 'body'）
 * @param {Object} options - 可选配置 { optional: boolean, min: number }
 * @returns {Function} Express中间件函数
 */
function validatePositiveInteger(paramName, source = 'params', options = {}) {
  return (req, res, next) => {
    const value = req[source][paramName]

    // 如果是可选参数且未提供，直接跳过
    if (options.optional && (value === undefined || value === null || value === '')) {
      return next()
    }

    // 必填参数未提供
    if (!options.optional && (value === undefined || value === null || value === '')) {
      return res.apiError(`参数 ${paramName} 不能为空`, 'BAD_REQUEST', null, 400)
    }

    // 转换并验证整数
    const intValue = parseInt(value, 10)
    const minValue = options.min !== undefined ? options.min : 1

    if (isNaN(intValue) || intValue < minValue) {
      return res.apiError(
        `参数 ${paramName} 必须是大于等于${minValue}的整数`,
        'BAD_REQUEST',
        null,
        400
      )
    }

    // 验证通过，将转换后的整数值存储到 req.validated
    if (!req.validated) req.validated = {}
    req.validated[paramName] = intValue

    next()
  }
}

/**
 * 验证枚举值（用于status、space等白名单验证）
 * @param {string} paramName - 参数名称
 * @param {Array} allowedValues - 允许的值列表
 * @param {string} source - 参数来源（'params', 'query', 'body'）
 * @param {Object} options - 可选配置 { optional: boolean, defaultValue: any }
 * @returns {Function} Express中间件函数
 */
function validateEnumValue(paramName, allowedValues, source = 'query', options = {}) {
  return (req, res, next) => {
    const value = req[source][paramName]

    // 如果是可选参数且未提供，使用默认值或跳过
    if (value === undefined || value === null || value === '') {
      if (options.defaultValue !== undefined) {
        if (!req.validated) req.validated = {}
        req.validated[paramName] = options.defaultValue
        return next()
      }
      if (options.optional) {
        return next()
      }
      return res.apiError(`参数 ${paramName} 不能为空`, 'BAD_REQUEST', null, 400)
    }

    // 验证枚举值
    if (!allowedValues.includes(value)) {
      return res.apiError(
        `参数 ${paramName} 值无效，允许的值：${allowedValues.join(', ')}`,
        'BAD_REQUEST',
        { allowed_values: allowedValues },
        400
      )
    }

    // 验证通过
    if (!req.validated) req.validated = {}
    req.validated[paramName] = value

    next()
  }
}

/**
 * 验证分页参数
 * @param {Object} options - 配置 { maxPageSize: number, defaultPageSize: number }
 * @returns {Function} Express中间件函数
 */
function validatePaginationParams(options = {}) {
  const maxPageSize = options.maxPageSize || 100
  const defaultPageSize = options.defaultPageSize || 20

  return (req, res, next) => {
    // 验证 page 参数
    const page = req.query.page
    const validatedPage = defaultPageSize === 20 ? 1 : Math.max(parseInt(page) || 1, 1)

    // 验证 limit 参数
    const limit = req.query.limit
    let validatedLimit = defaultPageSize

    if (limit !== undefined) {
      const parsedLimit = parseInt(limit, 10)
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        return res.apiError('参数 limit 必须是大于0的整数', 'BAD_REQUEST', null, 400)
      }
      validatedLimit = Math.min(parsedLimit, maxPageSize)
    }

    // 存储验证后的值
    if (!req.validated) req.validated = {}
    req.validated.page = validatedPage
    req.validated.limit = validatedLimit

    next()
  }
}

/**
 * 通用错误处理辅助函数
 * 根据错误消息自动映射到合适的HTTP状态码和错误类型
 * @param {Error} error - 错误对象
 * @param {Object} res - Express响应对象
 * @param {string} defaultMessage - 默认错误消息
 * @returns {Object} Express响应
 */
function handleServiceError(error, res, defaultMessage = '操作失败') {
  const errorMessage = error.message || defaultMessage

  // 🔴 P1-1: 优先检查自定义的 statusCode 和 errorCode（用于幂等键冲突等场景）
  if (error.statusCode) {
    const errorCode = error.errorCode || 'SERVICE_ERROR'
    return res.apiError(errorMessage, errorCode, null, error.statusCode)
  }

  // 根据错误消息内容判断错误类型
  if (errorMessage.includes('不存在') || errorMessage.includes('未找到')) {
    return res.apiError(errorMessage, 'NOT_FOUND', null, 404)
  }

  if (errorMessage.includes('无权限') || errorMessage.includes('权限不足')) {
    return res.apiError(errorMessage, 'FORBIDDEN', null, 403)
  }

  if (
    errorMessage.includes('不能') ||
    errorMessage.includes('不支持') ||
    errorMessage.includes('无效') ||
    errorMessage.includes('不可用') ||
    errorMessage.includes('过期') ||
    errorMessage.includes('超出') ||
    errorMessage.includes('不足') ||
    errorMessage.includes('未绑定') ||
    errorMessage.includes('已被禁用') ||
    errorMessage.includes('已存在') ||
    errorMessage.includes('已被占用') ||
    errorMessage.includes('已离职') ||
    errorMessage.includes('状态异常')
  ) {
    return res.apiError(errorMessage, 'BAD_REQUEST', null, 400)
  }

  // Sequelize 错误
  if (error.name === 'SequelizeDatabaseError') {
    return res.apiError('数据库查询失败，请稍后重试', 'DATABASE_ERROR', null, 500)
  }

  if (error.name === 'SequelizeConnectionError') {
    return res.apiError('数据库连接失败，请稍后重试', 'SERVICE_UNAVAILABLE', null, 503)
  }

  if (error.name === 'SequelizeValidationError') {
    return res.apiError(`数据验证失败: ${errorMessage}`, 'BAD_REQUEST', null, 400)
  }

  if (error.name === 'SequelizeTimeoutError') {
    return res.apiError('数据库查询超时，请稍后重试', 'DATABASE_TIMEOUT', null, 504)
  }

  // 默认服务器错误
  return res.apiError(defaultMessage + '，请稍后重试', 'INTERNAL_ERROR', null, 500)
}

module.exports = {
  // 原有的验证中间件
  validationMiddleware,

  // 新增的验证辅助函数
  validatePositiveInteger,
  validateEnumValue,
  validatePaginationParams,
  handleServiceError
}
