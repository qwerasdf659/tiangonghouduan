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
    errorMessage.includes('状态异常') ||
    errorMessage.includes('必须') ||
    errorMessage.includes('必填')
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

/**
 * 验证数字ID（事务实体标识符）
 *
 * @description 用于验证 URL 路径参数中的数字 ID（如 :id, :listing_id, :user_id）
 * 适用于高频创建、有状态的事务实体（如抽奖记录、交易记录、用户等）
 *
 * @param {string} paramName - 路由参数名称（如 'id', 'listing_id'）
 * @param {string} source - 参数来源（'params', 'query', 'body'），默认 'params'
 * @param {Object} options - 可选配置
 *   - optional: boolean - 是否可选，默认 false
 *   - min: number - 最小值，默认 1
 *   - storeName: string - 存储到 req.validated 的键名，默认与 paramName 相同
 * @returns {Function} Express 中间件函数
 *
 * @example
 * // 基础用法：验证 :id 参数
 * router.get('/:id', validateNumericId('id'), (req, res) => { ... })
 *
 * // 自定义存储名：将 :listing_id 存储为 listing_id
 * router.get('/:listing_id', validateNumericId('listing_id'), (req, res) => { ... })
 */
function validateNumericId(paramName, source = 'params', options = {}) {
  return (req, res, next) => {
    const value = req[source][paramName]

    // 如果是可选参数且未提供，直接跳过
    if (options.optional && (value === undefined || value === null || value === '')) {
      return next()
    }

    // 必填参数未提供
    if (!options.optional && (value === undefined || value === null || value === '')) {
      return res.apiError(`路径参数 ${paramName} 不能为空`, 'BAD_REQUEST', null, 400)
    }

    // 转换并验证整数
    const intValue = parseInt(value, 10)
    const minValue = options.min !== undefined ? options.min : 1

    // 验证是否为有效的正整数
    if (isNaN(intValue) || intValue < minValue || String(intValue) !== String(value)) {
      return res.apiError(
        `路径参数 ${paramName} 必须是有效的正整数（>= ${minValue}）`,
        'INVALID_RESOURCE_ID',
        { received: value, expected: 'positive integer' },
        400
      )
    }

    // 验证通过，将转换后的整数值存储到 req.validated
    if (!req.validated) req.validated = {}
    const storeName = options.storeName || paramName
    req.validated[storeName] = intValue

    next()
  }
}

/**
 * 验证业务码（配置实体标识符）
 *
 * @description 用于验证 URL 路径参数中的业务码（如 :code, :asset_code, :campaign_code）
 * 适用于低频变更、语义稳定的配置实体（如资产类型、活动配置、系统设置等）
 *
 * 业务码格式规范：
 * - 以字母开头
 * - 只包含字母、数字、下划线
 * - 长度 2-64 字符
 * - 示例：default_campaign, RARE, material_001
 *
 * @param {string} paramName - 路由参数名称（如 'code', 'asset_code', 'campaign_code'）
 * @param {string} source - 参数来源（'params', 'query', 'body'），默认 'params'
 * @param {Object} options - 可选配置
 *   - optional: boolean - 是否可选，默认 false
 *   - minLength: number - 最小长度，默认 2
 *   - maxLength: number - 最大长度，默认 64
 *   - storeName: string - 存储到 req.validated 的键名，默认与 paramName 相同
 * @returns {Function} Express 中间件函数
 *
 * @example
 * // 基础用法：验证 :code 参数
 * router.get('/campaigns/:code', validateBusinessCode('code'), (req, res) => { ... })
 *
 * // 验证资产类型码
 * router.get('/asset-types/:asset_code', validateBusinessCode('asset_code'), (req, res) => { ... })
 */
function validateBusinessCode(paramName, source = 'params', options = {}) {
  return (req, res, next) => {
    const value = req[source][paramName]

    // 如果是可选参数且未提供，直接跳过
    if (options.optional && (value === undefined || value === null || value === '')) {
      return next()
    }

    // 必填参数未提供
    if (!options.optional && (value === undefined || value === null || value === '')) {
      return res.apiError(`路径参数 ${paramName} 不能为空`, 'BAD_REQUEST', null, 400)
    }

    const strValue = String(value).trim()
    const minLength = options.minLength || 2
    const maxLength = options.maxLength || 64

    // 长度验证
    if (strValue.length < minLength || strValue.length > maxLength) {
      return res.apiError(
        `路径参数 ${paramName} 长度必须在 ${minLength}-${maxLength} 字符之间`,
        'INVALID_BUSINESS_CODE',
        { received: strValue, expected: `${minLength}-${maxLength} characters` },
        400
      )
    }

    // 格式验证：以字母开头，只包含字母、数字、下划线
    const businessCodePattern = /^[a-zA-Z][a-zA-Z0-9_]*$/
    if (!businessCodePattern.test(strValue)) {
      return res.apiError(
        `路径参数 ${paramName} 格式无效，必须以字母开头，只包含字母、数字和下划线`,
        'INVALID_BUSINESS_CODE',
        { received: strValue, expected: 'format: /^[a-zA-Z][a-zA-Z0-9_]*$/' },
        400
      )
    }

    // 验证通过，将值存储到 req.validated
    if (!req.validated) req.validated = {}
    const storeName = options.storeName || paramName
    req.validated[storeName] = strValue

    next()
  }
}

/**
 * 验证 UUID（外部实体标识符）
 *
 * @description 用于验证 URL 路径参数中的 UUID（如 :uuid, :user_uuid）
 * 适用于需要隐藏内部ID、防止枚举攻击的外部暴露实体（如对外用户标识符、分享链接等）
 *
 * UUID 格式规范：
 * - 标准 UUID v4 格式：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 * - 36 字符，包含 4 个连字符
 * - 十六进制字符（0-9, a-f, A-F）
 *
 * @param {string} paramName - 路由参数名称（如 'uuid', 'user_uuid', 'share_uuid'）
 * @param {string} source - 参数来源（'params', 'query', 'body'），默认 'params'
 * @param {Object} options - 可选配置
 *   - optional: boolean - 是否可选，默认 false
 *   - storeName: string - 存储到 req.validated 的键名，默认与 paramName 相同
 * @returns {Function} Express 中间件函数
 *
 * @example
 * // 基础用法：验证 :uuid 参数
 * router.get('/users/:uuid', validateUUID('uuid'), (req, res) => { ... })
 *
 * // 验证分享链接 UUID
 * router.get('/share/:share_uuid', validateUUID('share_uuid'), (req, res) => { ... })
 */
function validateUUID(paramName, source = 'params', options = {}) {
  return (req, res, next) => {
    const value = req[source][paramName]

    // 如果是可选参数且未提供，直接跳过
    if (options.optional && (value === undefined || value === null || value === '')) {
      return next()
    }

    // 必填参数未提供
    if (!options.optional && (value === undefined || value === null || value === '')) {
      return res.apiError(`路径参数 ${paramName} 不能为空`, 'BAD_REQUEST', null, 400)
    }

    const strValue = String(value).trim().toLowerCase()

    // UUID 格式验证（标准 v4 UUID）
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidPattern.test(strValue)) {
      return res.apiError(
        `路径参数 ${paramName} 格式无效，必须是有效的 UUID`,
        'INVALID_UUID',
        { received: value, expected: 'UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
        400
      )
    }

    // 验证通过，将值存储到 req.validated（统一小写存储）
    if (!req.validated) req.validated = {}
    const storeName = options.storeName || paramName
    req.validated[storeName] = strValue

    next()
  }
}

module.exports = {
  // 原有的验证中间件
  validationMiddleware,

  // 新增的验证辅助函数
  validatePositiveInteger,
  validateEnumValue,
  validatePaginationParams,
  handleServiceError,

  // API路径参数验证器（符合 API路径参数设计规范.md）
  validateNumericId, // 事务实体 :id 验证
  validateBusinessCode, // 配置实体 :code 验证
  validateUUID // 外部实体 :uuid 验证
}
