/**
 * 参数验证中间件
 * 用于验证API请求参数
 */

'use strict'

/**
 * 创建验证中间件
 * @param {Array} rules - 验证规则数组
 * @returns {Function} Express中间件函数
 */
function validationMiddleware (rules) {
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
        timestamp: new Date().toISOString()
      })
    }

    next()
  }
}

module.exports = validationMiddleware
