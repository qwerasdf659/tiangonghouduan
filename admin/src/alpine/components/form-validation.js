/**
 * Form Validation 表单验证组件
 *
 * @file src/alpine/components/form-validation.js
 * @description 基于 Alpine.js 的表单验证组件，支持实时反馈和错误抖动
 * @version 1.0.0
 * @date 2026-01-26
 *
 * 使用方式：
 * <form x-data="formValidation({ rules: {...} })" @submit.prevent="handleSubmit">
 *   <div class="form-group">
 *     <input type="text" x-model="formData.username"
 *            @blur="validateField('username')"
 *            :class="{ 'form-input-error': errors.username, 'form-input-success': validated.username }" />
 *     <span x-show="errors.username" x-text="errors.username" class="form-error"></span>
 *   </div>
 * </form>
 */

import { logger } from '../../utils/logger.js'

/**
 * 内置验证规则
 */
const VALIDATION_RULES = {
  // 必填
  required: {
    validate: value => value !== null && value !== undefined && value !== '',
    message: '此字段为必填项'
  },

  // 邮箱
  email: {
    validate: value => !value || /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value),
    message: '请输入有效的邮箱地址'
  },

  // 手机号（中国大陆）
  phone: {
    validate: value => !value || /^1[3-9]\d{9}$/.test(value),
    message: '请输入有效的手机号码'
  },

  // URL
  url: {
    validate: value =>
      !value || /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/.test(value),
    message: '请输入有效的网址'
  },

  // 最小长度
  minLength: min => ({
    validate: value => !value || value.length >= min,
    message: `最少需要 ${min} 个字符`
  }),

  // 最大长度
  maxLength: max => ({
    validate: value => !value || value.length <= max,
    message: `最多允许 ${max} 个字符`
  }),

  // 最小值
  min: minValue => ({
    validate: value => value === '' || Number(value) >= minValue,
    message: `数值不能小于 ${minValue}`
  }),

  // 最大值
  max: maxValue => ({
    validate: value => value === '' || Number(value) <= maxValue,
    message: `数值不能大于 ${maxValue}`
  }),

  // 正则匹配
  pattern: (regex, msg = '格式不正确') => ({
    validate: value => !value || regex.test(value),
    message: msg
  }),

  // 确认密码
  confirmPassword: passwordField => ({
    validate: (value, formData) => !value || value === formData[passwordField],
    message: '两次输入的密码不一致'
  }),

  // 数字
  numeric: {
    validate: value => !value || /^-?\d+(\.\d+)?$/.test(value),
    message: '请输入有效的数字'
  },

  // 整数
  integer: {
    validate: value => !value || /^-?\d+$/.test(value),
    message: '请输入整数'
  },

  // 正整数
  positiveInteger: {
    validate: value => !value || /^[1-9]\d*$/.test(value),
    message: '请输入正整数'
  }
}

/**
 * Form Validation 组件
 * @param {Object} config - 配置选项
 * @param {Object} config.rules - 验证规则配置
 * @param {Object} config.initialData - 初始表单数据
 * @param {Function} config.onSubmit - 提交回调
 * @param {boolean} config.validateOnBlur - 失焦时验证（默认 true）
 * @param {boolean} config.validateOnInput - 输入时验证（默认 false）
 * @param {boolean} config.shakeOnError - 错误时抖动（默认 true）
 */
function formValidation(config = {}) {
  return {
    // 表单数据
    formData: { ...(config.initialData || {}) },
    // 验证规则
    rules: config.rules || {},
    // 错误信息
    errors: {},
    // 已验证通过的字段
    validated: {},
    // 触摸过的字段（用于延迟显示错误）
    touched: {},
    // 是否正在提交
    isSubmitting: false,
    // 配置选项
    validateOnBlur: config.validateOnBlur !== false,
    validateOnInput: config.validateOnInput === true,
    shakeOnError: config.shakeOnError !== false,
    // 回调
    onSubmit: config.onSubmit || null,

    // 计算属性
    get isValid() {
      return Object.keys(this.errors).length === 0
    },

    get hasErrors() {
      return Object.keys(this.errors).length > 0
    },

    // 初始化
    init() {
      logger.debug('[FormValidation] 初始化', {
        fields: Object.keys(this.rules)
      })

      // 初始化 errors 和 validated 对象
      Object.keys(this.rules).forEach(field => {
        this.errors[field] = ''
        this.validated[field] = false
        this.touched[field] = false
      })
    },

    /**
     * 验证单个字段
     * @param {string} field - 字段名
     * @returns {boolean} 是否通过验证
     */
    validateField(field) {
      this.touched[field] = true
      const rules = this.rules[field]
      const value = this.formData[field]

      if (!rules) return true

      // 清除之前的错误
      this.errors[field] = ''
      this.validated[field] = false

      // 遍历规则进行验证
      for (const rule of rules) {
        let validator
        let message

        if (typeof rule === 'string') {
          // 内置规则名
          validator = VALIDATION_RULES[rule]
          if (!validator) {
            logger.warn(`[FormValidation] 未知规则: ${rule}`)
            continue
          }
        } else if (typeof rule === 'object') {
          if (rule.name && VALIDATION_RULES[rule.name]) {
            // 带参数的内置规则
            const ruleFn = VALIDATION_RULES[rule.name]
            validator = typeof ruleFn === 'function' ? ruleFn(rule.params) : ruleFn
          } else if (rule.validate) {
            // 自定义规则对象
            validator = rule
          }
          message = rule.message
        } else if (typeof rule === 'function') {
          // 自定义验证函数
          validator = { validate: rule, message: '验证失败' }
        }

        if (!validator) continue

        const isValid = validator.validate(value, this.formData)

        if (!isValid) {
          this.errors[field] = message || validator.message
          this.validated[field] = false

          // 错误抖动效果
          if (this.shakeOnError) {
            this.triggerShake(field)
          }

          return false
        }
      }

      this.validated[field] = true
      return true
    },

    /**
     * 验证所有字段
     * @returns {boolean} 是否全部通过
     */
    validateAll() {
      let allValid = true

      Object.keys(this.rules).forEach(field => {
        const valid = this.validateField(field)
        if (!valid) allValid = false
      })

      return allValid
    },

    /**
     * 触发抖动效果
     * @param {string} field - 字段名
     */
    triggerShake(field) {
      const input = document.querySelector(`[name="${field}"], [x-model*="${field}"]`)
      if (input) {
        input.classList.add('shake')
        setTimeout(() => input.classList.remove('shake'), 500)
      }
    },

    /**
     * 处理表单提交
     * @param {Event} event - 提交事件
     */
    async handleSubmit(event) {
      if (event) event.preventDefault()

      // 验证所有字段
      if (!this.validateAll()) {
        logger.debug('[FormValidation] 验证失败', this.errors)
        return false
      }

      // 设置提交状态
      this.isSubmitting = true

      try {
        if (this.onSubmit && typeof this.onSubmit === 'function') {
          await this.onSubmit(this.formData)
        }
        return true
      } catch (error) {
        logger.error('[FormValidation] 提交失败', error)
        throw error
      } finally {
        this.isSubmitting = false
      }
    },

    /**
     * 重置表单
     */
    reset() {
      // 重置数据
      this.formData = { ...(config.initialData || {}) }

      // 清除错误和验证状态
      Object.keys(this.rules).forEach(field => {
        this.errors[field] = ''
        this.validated[field] = false
        this.touched[field] = false
      })

      this.isSubmitting = false
    },

    /**
     * 设置字段值
     * @param {string} field - 字段名
     * @param {any} value - 值
     */
    setFieldValue(field, value) {
      this.formData[field] = value

      if (this.validateOnInput && this.touched[field]) {
        this.validateField(field)
      }
    },

    /**
     * 设置字段错误
     * @param {string} field - 字段名
     * @param {string} message - 错误信息
     */
    setFieldError(field, message) {
      this.errors[field] = message
      this.validated[field] = false
    },

    /**
     * 清除字段错误
     * @param {string} field - 字段名
     */
    clearFieldError(field) {
      this.errors[field] = ''
    },

    /**
     * 处理输入事件
     * @param {string} field - 字段名
     */
    handleInput(field) {
      if (this.validateOnInput && this.touched[field]) {
        this.validateField(field)
      }
    },

    /**
     * 处理失焦事件
     * @param {string} field - 字段名
     */
    handleBlur(field) {
      if (this.validateOnBlur) {
        this.validateField(field)
      }
    },

    /**
     * 获取字段的 CSS 类
     * @param {string} field - 字段名
     * @returns {Object} CSS 类对象
     */
    getFieldClass(field) {
      return {
        'form-input-error': this.errors[field] && this.touched[field],
        'form-input-success': this.validated[field] && this.touched[field]
      }
    }
  }
}

/**
 * 创建验证规则的辅助函数
 */
const rules = {
  required: () => ({ name: 'required', message: '此字段为必填项' }),
  email: () => ({ name: 'email', message: '请输入有效的邮箱地址' }),
  phone: () => ({ name: 'phone', message: '请输入有效的手机号码' }),
  url: () => ({ name: 'url', message: '请输入有效的网址' }),
  minLength: (min, message) => ({
    name: 'minLength',
    params: min,
    message: message || `最少需要 ${min} 个字符`
  }),
  maxLength: (max, message) => ({
    name: 'maxLength',
    params: max,
    message: message || `最多允许 ${max} 个字符`
  }),
  min: (minValue, message) => ({
    name: 'min',
    params: minValue,
    message: message || `数值不能小于 ${minValue}`
  }),
  max: (maxValue, message) => ({
    name: 'max',
    params: maxValue,
    message: message || `数值不能大于 ${maxValue}`
  }),
  pattern: (regex, message) => ({
    validate: value => !value || regex.test(value),
    message: message || '格式不正确'
  }),
  confirmPassword: (field, message) => ({
    name: 'confirmPassword',
    params: field,
    message: message || '两次输入的密码不一致'
  }),
  numeric: () => ({ name: 'numeric', message: '请输入有效的数字' }),
  integer: () => ({ name: 'integer', message: '请输入整数' }),
  custom: (validateFn, message) => ({
    validate: validateFn,
    message: message || '验证失败'
  })
}

// 导出
export { formValidation, rules, VALIDATION_RULES }

logger.info('FormValidation 组件已加载')
