/**
 * 餐厅积分抽奖系统 - 统一配置校验器
 *
 * @description 基于 CONFIG_SCHEMA 自动生成校验逻辑
 * @version 1.0.0
 * @created 2025-12-30
 *
 * 使用方式：
 * - 应用启动时调用 ConfigValidator.validate()
 * - 脚本检查时调用 ConfigValidator.validate(env, false)
 * - 生成模板时调用 ConfigValidator.generateTemplate()
 *
 * 参考文档：docs/配置管理三层分离与校验统一方案.md
 */

const { CONFIG_SCHEMA, CONFIG_CATEGORIES } = require('./schema')

/**
 * 配置校验器类
 *
 * @description 统一的环境变量校验逻辑
 */
class ConfigValidator {
  /**
   * 校验环境变量完整性和合规性
   *
   * @param {string} targetEnv - 目标环境（development/staging/production）
   * @param {boolean} failFast - 是否遇错即退出（默认 true）
   * @returns {Object} { valid: boolean, errors: [], warnings: [] }
   *
   * @example
   * // 应用启动时（fail-fast 模式）
   * ConfigValidator.validate('production', true)
   *
   * // 脚本检查时（收集所有错误）
   * const result = ConfigValidator.validate('development', false)
   * console.log(result.errors)
   */
  static validate(targetEnv = process.env.NODE_ENV || 'development', failFast = true) {
    const errors = []
    const warnings = []

    Object.entries(CONFIG_SCHEMA).forEach(([key, schema]) => {
      const value = process.env[key]

      // 1. 必需性检查
      if (schema.required && !value) {
        errors.push({
          key,
          type: 'MISSING',
          message: `缺少必需的环境变量: ${key}`,
          fix: this._generateFix(key, schema)
        })
        return // 缺失则跳过后续检查
      }

      // 如果值不存在且非必需，跳过检查
      if (!value) return

      // 2. 类型检查
      if (schema.type === 'number') {
        if (isNaN(Number(value))) {
          errors.push({
            key,
            type: 'TYPE_ERROR',
            message: `${key} 必须是数字，当前值: ${value}`,
            fix: `修改 .env 中的 ${key} 为有效数字`
          })
        } else {
          // 范围检查
          const num = Number(value)
          if (schema.min !== undefined && num < schema.min) {
            errors.push({
              key,
              type: 'RANGE_ERROR',
              message: `${key} 不能小于 ${schema.min}，当前值: ${num}`,
              fix: `将 ${key} 设置为 >= ${schema.min} 的值`
            })
          }
          if (schema.max !== undefined && num > schema.max) {
            errors.push({
              key,
              type: 'RANGE_ERROR',
              message: `${key} 不能大于 ${schema.max}，当前值: ${num}`,
              fix: `将 ${key} 设置为 <= ${schema.max} 的值`
            })
          }
        }
      }

      if (schema.type === 'boolean') {
        if (!['true', 'false', '1', '0'].includes(String(value).toLowerCase())) {
          errors.push({
            key,
            type: 'TYPE_ERROR',
            message: `${key} 必须是布尔值（true/false/1/0），当前值: ${value}`,
            fix: `将 ${key} 设置为 true 或 false`
          })
        }
      }

      // 3. 枚举值检查
      if (schema.type === 'enum' && schema.allowedValues) {
        if (!schema.allowedValues.includes(value)) {
          errors.push({
            key,
            type: 'INVALID_VALUE',
            message: `${key} 值不合法: ${value}`,
            fix: `允许的值: ${schema.allowedValues.join(', ')}`
          })
        }
      }

      // 4. 格式检查（正则表达式）
      if (schema.pattern && !schema.pattern.test(value)) {
        errors.push({
          key,
          type: 'FORMAT_ERROR',
          message: `${key} 格式不正确: ${value}`,
          fix: `参考格式: ${schema.pattern.toString()}`
        })
      }

      // 5. 长度检查
      if (schema.minLength && value.length < schema.minLength) {
        errors.push({
          key,
          type: 'TOO_SHORT',
          message: `${key} 长度不足（当前 ${value.length} 字符，最少 ${schema.minLength} 字符）`,
          fix:
            key.includes('SECRET') || key.includes('KEY')
              ? `生成强随机密钥: node -e "console.log(require('crypto').randomBytes(${Math.ceil(schema.minLength / 2)}).toString('hex'))"`
              : `使用更长的值（至少 ${schema.minLength} 字符）`
        })
      }

      if (schema.maxLength && value.length > schema.maxLength) {
        errors.push({
          key,
          type: 'TOO_LONG',
          message: `${key} 长度过长（当前 ${value.length} 字符，最多 ${schema.maxLength} 字符）`,
          fix: `将 ${key} 缩短到 ${schema.maxLength} 字符以内`
        })
      }

      // 6. 生产环境特殊检查
      if (targetEnv === 'production' && schema.production) {
        const prodSchema = schema.production

        // 禁止值检查
        if (prodSchema.forbiddenValues) {
          const isForbidden = prodSchema.forbiddenValues.some(forbidden => {
            if (forbidden.includes('*')) {
              const pattern = new RegExp('^' + forbidden.replace(/\*/g, '.*') + '$')
              return pattern.test(value)
            }
            return value === forbidden || value.toLowerCase() === forbidden.toLowerCase()
          })

          if (isForbidden) {
            errors.push({
              key,
              type: 'FORBIDDEN_VALUE',
              message: `生产环境禁止使用占位符/弱密钥: ${key}`,
              fix: "生成强随机密钥替换当前值: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
            })
          }
        }

        // 生产环境最小长度检查（更严格）
        if (prodSchema.minLength && value.length < prodSchema.minLength) {
          errors.push({
            key,
            type: 'PRODUCTION_TOO_SHORT',
            message: `生产环境 ${key} 长度不足（当前 ${value.length}，最少 ${prodSchema.minLength}）`,
            fix: `使用更强的密钥（至少 ${prodSchema.minLength} 字符）`
          })
        }

        // 禁止与其他字段相同
        if (prodSchema.mustDifferFrom) {
          prodSchema.mustDifferFrom.forEach(otherKey => {
            if (value === process.env[otherKey]) {
              errors.push({
                key,
                type: 'DUPLICATE_SECRET',
                message: `生产环境 ${key} 不能与 ${otherKey} 相同`,
                fix: `为 ${key} 生成独立的密钥: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
              })
            }
          })
        }
      }
    })

    // 输出结果
    if (errors.length > 0) {
      console.error('\n❌ 环境变量校验失败:')
      errors.forEach((err, index) => {
        console.error(`\n${index + 1}. [${err.type}] ${err.message}`)
        console.error(`   修复方案: ${err.fix}`)
      })

      if (failFast) {
        console.error(`\n🚫 检测到 ${errors.length} 个错误，应用无法启动`)
        process.exit(1)
      }
    }

    if (warnings.length > 0) {
      console.warn('\n⚠️ 环境变量警告:')
      warnings.forEach((warn, index) => {
        console.warn(`${index + 1}. ${warn.message}`)
      })
    }

    if (errors.length === 0 && warnings.length === 0) {
      console.log(`✅ 环境变量校验通过 (${targetEnv} 环境)`)
    }

    return { valid: errors.length === 0, errors, warnings }
  }

  /**
   * 生成 .env.example 模板
   *
   * @returns {string} 模板内容
   *
   * @example
   * const template = ConfigValidator.generateTemplate()
   * require('fs').writeFileSync('config.example', template)
   */
  static generateTemplate() {
    let template = '# 餐厅积分抽奖系统 V4.0 - 环境变量配置模板\n'
    template += '# 🔴 重要：生产环境部署前必须修改所有 CHANGE_ME_* 占位符\n'
    template += `# 生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n\n`

    Object.entries(CONFIG_CATEGORIES).forEach(([category, keys]) => {
      template += `# === ${category} ===\n`

      keys.forEach(key => {
        const schema = CONFIG_SCHEMA[key]
        if (!schema) return

        const required = schema.required ? '(必需)' : '(可选)'
        const example = this._getExampleValue(key, schema)
        const description = schema.description || ''

        template += `# ${description} ${required}\n`
        template += `${key}=${example}\n\n`
      })
    })

    return template
  }

  /**
   * 生成修复建议
   *
   * @private
   * @param {string} key - 环境变量名
   * @param {Object} schema - Schema 定义
   * @returns {string} 修复建议
   */
  static _generateFix(key, schema) {
    if (key.includes('SECRET') || key.includes('KEY') || key.includes('PASSWORD')) {
      const length = schema.minLength || 32
      return `生成密钥: node -e "console.log(require('crypto').randomBytes(${Math.ceil(length / 2)}).toString('hex'))"`
    }

    if (schema.type === 'enum') {
      return `在 .env 中添加: ${key}=${schema.allowedValues[0]}`
    }

    if (schema.default !== undefined && schema.default !== null) {
      return `在 .env 中添加: ${key}=${schema.default}`
    }

    return `在 .env 中添加: ${key}=<your_value>`
  }

  /**
   * 获取示例值
   *
   * @private
   * @param {string} key - 环境变量名
   * @param {Object} schema - Schema 定义
   * @returns {string} 示例值
   */
  static _getExampleValue(key, schema) {
    // 默认值优先
    if (schema.default !== undefined && schema.default !== null) {
      return String(schema.default)
    }

    // 枚举类型返回第一个值
    if (schema.type === 'enum' && schema.allowedValues) {
      return schema.allowedValues[0]
    }

    // 敏感信息使用占位符
    if (key.includes('SECRET') || key.includes('PASSWORD') || key.includes('KEY')) {
      if (
        key.includes('SEALOS') ||
        key.includes('OCR') ||
        key.includes('SMS') ||
        key.includes('WX')
      ) {
        return `CHANGE_ME_${key.toLowerCase()}`
      }
      return `CHANGE_ME_${key.toLowerCase()}_min_${schema.minLength || 32}_chars`
    }

    // 特定字段的示例值
    const exampleValues = {
      DB_HOST: 'your_database_host',
      DB_PORT: '3306',
      DB_NAME: 'your_database_name',
      DB_USER: 'your_username',
      DB_PASSWORD: 'CHANGE_ME_db_password',
      REDIS_URL: 'redis://localhost:6379',
      ALLOWED_ORIGINS: 'http://localhost:3000,https://your-domain.com',
      WX_APPID: 'wx1234567890abcdef',
      PORT: '3000',
      TZ: 'Asia/Shanghai',
      LOG_LEVEL: 'info',
      ENABLE_POOL_MONITORING: 'true'
    }

    if (exampleValues[key]) {
      return exampleValues[key]
    }

    // 数字类型
    if (schema.type === 'number') {
      return String(schema.min || 0)
    }

    // 布尔类型
    if (schema.type === 'boolean') {
      return 'false'
    }

    return 'your_value_here'
  }
}

module.exports = { ConfigValidator }
