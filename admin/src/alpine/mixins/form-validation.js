/**
 * 表单验证 Mixin（ES Module 版本）
 *
 * @description 提供表单验证规则、错误状态管理和验证方法
 * @version 2.0.0
 * @date 2026-01-23
 *
 * @example
 * import { formValidationMixin } from '@/alpine/mixins/index.js'
 *
 * function myPage() {
 *   return {
 *     ...formValidationMixin(),
 *     form: { username: '', email: '' },
 *     rules: {
 *       username: [
 *         { required: true, message: '请输入用户名' },
 *         { minLength: 2, message: '用户名至少2个字符' }
 *       ],
 *       email: [
 *         { required: true, message: '请输入邮箱' },
 *         { pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: '邮箱格式不正确' }
 *       ]
 *     },
 *     async submit() {
 *       if (!this.validateForm(this.form, this.rules)) {
 *         return
 *       }
 *       // 提交逻辑...
 *     }
 *   }
 * }
 */
export function formValidationMixin() {
  return {
    // ========== 验证状态 ==========

    /** 字段错误信息 */
    formErrors: {},

    /** 是否已尝试提交（用于控制何时显示错误） */
    formSubmitted: false,

    // ========== 计算属性 ==========

    /**
     * 表单是否有效
     * @returns {boolean}
     */
    get isFormValid() {
      return Object.keys(this.formErrors).length === 0
    },

    // ========== 验证方法 ==========

    /**
     * 验证单个字段
     *
     * @param {string} field - 字段名
     * @param {any} value - 字段值
     * @param {Array} rules - 验证规则数组
     * @returns {string|null} 错误消息或 null
     */
    validateField(field, value, rules) {
      if (!rules || !Array.isArray(rules)) return null

      for (const rule of rules) {
        // 必填验证
        if (rule.required) {
          if (
            value === undefined ||
            value === null ||
            value === '' ||
            (Array.isArray(value) && value.length === 0)
          ) {
            return rule.message || `${field} 是必填项`
          }
        }

        // 跳过空值的后续验证
        if (value === undefined || value === null || value === '') continue

        // 最小长度验证
        if (rule.minLength && String(value).length < rule.minLength) {
          return rule.message || `${field} 至少需要 ${rule.minLength} 个字符`
        }

        // 最大长度验证
        if (rule.maxLength && String(value).length > rule.maxLength) {
          return rule.message || `${field} 最多允许 ${rule.maxLength} 个字符`
        }

        // 正则验证
        if (rule.pattern && !rule.pattern.test(String(value))) {
          return rule.message || `${field} 格式不正确`
        }

        // 最小值验证
        if (rule.min !== undefined && Number(value) < rule.min) {
          return rule.message || `${field} 不能小于 ${rule.min}`
        }

        // 最大值验证
        if (rule.max !== undefined && Number(value) > rule.max) {
          return rule.message || `${field} 不能大于 ${rule.max}`
        }

        // 自定义验证函数
        if (rule.validator && typeof rule.validator === 'function') {
          const result = rule.validator(value, this)
          if (result !== true) {
            return result || rule.message || `${field} 验证失败`
          }
        }

        // 枚举验证
        if (rule.enum && !rule.enum.includes(value)) {
          return rule.message || `${field} 值不在允许范围内`
        }
      }

      return null
    },

    /**
     * 验证整个表单
     *
     * @param {Object} form - 表单数据
     * @param {Object} rules - 验证规则对象
     * @returns {boolean} 是否通过验证
     */
    validateForm(form, rules) {
      this.formSubmitted = true
      this.formErrors = {}

      for (const [field, fieldRules] of Object.entries(rules)) {
        const error = this.validateField(field, form[field], fieldRules)
        if (error) {
          this.formErrors[field] = error
        }
      }

      return this.isFormValid
    },

    /**
     * 获取字段错误信息
     *
     * @param {string} field - 字段名
     * @returns {string|null} 错误消息或 null
     */
    getFieldError(field) {
      return this.formErrors[field] || null
    },

    /**
     * 检查字段是否有错误
     *
     * @param {string} field - 字段名
     * @returns {boolean}
     */
    hasFieldError(field) {
      return !!this.formErrors[field]
    },

    /**
     * 清除表单错误
     */
    clearFormErrors() {
      this.formErrors = {}
      this.formSubmitted = false
    },

    /**
     * 重置表单
     *
     * @param {Object} form - 表单对象
     * @param {Object} defaultValues - 默认值
     */
    resetForm(form, defaultValues = {}) {
      this.clearFormErrors()

      // 重置表单值
      for (const key of Object.keys(form)) {
        form[key] = defaultValues[key] !== undefined ? defaultValues[key] : ''
      }
    },

    /**
     * 设置字段错误（用于服务端验证错误）
     *
     * @param {string} field - 字段名
     * @param {string} message - 错误消息
     */
    setFieldError(field, message) {
      this.formErrors[field] = message
    },

    /**
     * 批量设置错误（用于服务端验证错误）
     *
     * @param {Object} errors - 错误对象 { field: message }
     */
    setFormErrors(errors) {
      this.formErrors = { ...this.formErrors, ...errors }
    }
  }
}
