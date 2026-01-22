/**
 * 表单验证 Mixin
 * 解决：重复的表单验证逻辑（约 20 行/页面）
 * 
 * @file public/admin/js/alpine/mixins/form-validation.js
 * @description 提供统一的表单验证规则、错误消息管理
 * @version 1.0.0
 * @date 2026-01-23
 * 
 * @example
 * function myPage() {
 *   return {
 *     ...formValidationMixin(),
 *     form: { name: '', email: '', phone: '' },
 *     rules: {
 *       name: [{ required: true, message: '请输入名称' }],
 *       email: [
 *         { required: true, message: '请输入邮箱' },
 *         { type: 'email', message: '邮箱格式不正确' }
 *       ],
 *       phone: [
 *         { required: true, message: '请输入手机号' },
 *         { type: 'phone', message: '手机号格式不正确' }
 *       ]
 *     },
 *     async submitForm() {
 *       if (!this.validateForm(this.form, this.rules)) {
 *         return
 *       }
 *       // 提交逻辑...
 *     }
 *   }
 * }
 */
function formValidationMixin() {
  return {
    // ========== 验证状态 ==========
    
    /** 表单错误信息 { fieldName: errorMessage } */
    formErrors: {},
    
    /** 是否正在验证 */
    validating: false,
    
    // ========== 计算属性 ==========
    
    /**
     * 表单是否有错误
     * @returns {boolean}
     */
    get hasFormErrors() {
      return Object.keys(this.formErrors).length > 0
    },
    
    /**
     * 获取第一个错误消息
     * @returns {string|null}
     */
    get firstError() {
      const keys = Object.keys(this.formErrors)
      return keys.length > 0 ? this.formErrors[keys[0]] : null
    },
    
    // ========== 验证规则 ==========
    
    /**
     * 内置验证规则
     * @private
     */
    _validators: {
      /** 必填验证 */
      required: (value) => {
        if (value === null || value === undefined) return false
        if (typeof value === 'string') return value.trim().length > 0
        if (Array.isArray(value)) return value.length > 0
        return true
      },
      
      /** 邮箱验证 */
      email: (value) => {
        if (!value) return true // 空值不验证，由 required 规则处理
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        return emailRegex.test(value)
      },
      
      /** 手机号验证（中国大陆） */
      phone: (value) => {
        if (!value) return true
        const phoneRegex = /^1[3-9]\d{9}$/
        return phoneRegex.test(value)
      },
      
      /** 最小长度 */
      minLength: (value, length) => {
        if (!value) return true
        return String(value).length >= length
      },
      
      /** 最大长度 */
      maxLength: (value, length) => {
        if (!value) return true
        return String(value).length <= length
      },
      
      /** 最小值 */
      min: (value, min) => {
        if (value === '' || value === null || value === undefined) return true
        return Number(value) >= min
      },
      
      /** 最大值 */
      max: (value, max) => {
        if (value === '' || value === null || value === undefined) return true
        return Number(value) <= max
      },
      
      /** 正则匹配 */
      pattern: (value, pattern) => {
        if (!value) return true
        const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern)
        return regex.test(value)
      },
      
      /** 数字验证 */
      number: (value) => {
        if (value === '' || value === null || value === undefined) return true
        return !isNaN(Number(value))
      },
      
      /** 整数验证 */
      integer: (value) => {
        if (value === '' || value === null || value === undefined) return true
        return Number.isInteger(Number(value))
      },
      
      /** URL 验证 */
      url: (value) => {
        if (!value) return true
        try {
          new URL(value)
          return true
        } catch {
          return false
        }
      }
    },
    
    // ========== 方法 ==========
    
    /**
     * 验证单个字段
     * 
     * @param {any} value - 字段值
     * @param {Array} rules - 验证规则数组
     * @returns {string|null} 错误消息或 null
     */
    validateField(value, rules) {
      if (!rules || !Array.isArray(rules)) return null
      
      for (const rule of rules) {
        // 必填验证
        if (rule.required && !this._validators.required(value)) {
          return rule.message || '此字段为必填项'
        }
        
        // 类型验证
        if (rule.type && this._validators[rule.type]) {
          if (!this._validators[rule.type](value)) {
            return rule.message || `格式不正确`
          }
        }
        
        // 最小长度
        if (rule.minLength !== undefined) {
          if (!this._validators.minLength(value, rule.minLength)) {
            return rule.message || `长度不能少于 ${rule.minLength} 个字符`
          }
        }
        
        // 最大长度
        if (rule.maxLength !== undefined) {
          if (!this._validators.maxLength(value, rule.maxLength)) {
            return rule.message || `长度不能超过 ${rule.maxLength} 个字符`
          }
        }
        
        // 最小值
        if (rule.min !== undefined) {
          if (!this._validators.min(value, rule.min)) {
            return rule.message || `不能小于 ${rule.min}`
          }
        }
        
        // 最大值
        if (rule.max !== undefined) {
          if (!this._validators.max(value, rule.max)) {
            return rule.message || `不能大于 ${rule.max}`
          }
        }
        
        // 正则验证
        if (rule.pattern) {
          if (!this._validators.pattern(value, rule.pattern)) {
            return rule.message || '格式不正确'
          }
        }
        
        // 自定义验证函数
        if (rule.validator && typeof rule.validator === 'function') {
          const result = rule.validator(value)
          if (result !== true) {
            return result || rule.message || '验证失败'
          }
        }
      }
      
      return null
    },
    
    /**
     * 验证整个表单
     * 
     * @param {Object} formData - 表单数据
     * @param {Object} rules - 验证规则 { fieldName: [rules] }
     * @returns {boolean} 是否验证通过
     */
    validateForm(formData, rules) {
      this.clearFormErrors()
      this.validating = true
      
      let isValid = true
      
      for (const [fieldName, fieldRules] of Object.entries(rules)) {
        const value = fieldName.includes('.') 
          ? fieldName.split('.').reduce((obj, key) => obj?.[key], formData)
          : formData[fieldName]
        
        const error = this.validateField(value, fieldRules)
        
        if (error) {
          this.formErrors[fieldName] = error
          isValid = false
        }
      }
      
      this.validating = false
      
      // 显示第一个错误
      if (!isValid && this.firstError) {
        this.$toast?.warning(this.firstError)
      }
      
      return isValid
    },
    
    /**
     * 清除所有表单错误
     */
    clearFormErrors() {
      this.formErrors = {}
    },
    
    /**
     * 清除指定字段的错误
     * 
     * @param {string} fieldName - 字段名
     */
    clearFieldError(fieldName) {
      delete this.formErrors[fieldName]
    },
    
    /**
     * 设置字段错误
     * 
     * @param {string} fieldName - 字段名
     * @param {string} message - 错误消息
     */
    setFieldError(fieldName, message) {
      this.formErrors[fieldName] = message
    },
    
    /**
     * 获取字段错误
     * 
     * @param {string} fieldName - 字段名
     * @returns {string|undefined}
     */
    getFieldError(fieldName) {
      return this.formErrors[fieldName]
    },
    
    /**
     * 检查字段是否有错误
     * 
     * @param {string} fieldName - 字段名
     * @returns {boolean}
     */
    hasFieldError(fieldName) {
      return !!this.formErrors[fieldName]
    },
    
    /**
     * 获取字段的 CSS 类（用于显示错误状态）
     * 
     * @param {string} fieldName - 字段名
     * @returns {string}
     */
    getFieldClass(fieldName) {
      return this.formErrors[fieldName] ? 'is-invalid' : ''
    },
    
    /**
     * 实时验证单个字段（用于 input/blur 事件）
     * 
     * @param {string} fieldName - 字段名
     * @param {any} value - 字段值
     * @param {Array} rules - 验证规则
     */
    validateOnChange(fieldName, value, rules) {
      const error = this.validateField(value, rules)
      if (error) {
        this.formErrors[fieldName] = error
      } else {
        delete this.formErrors[fieldName]
      }
    }
  }
}

// 导出到全局作用域
window.formValidationMixin = formValidationMixin

console.log('✅ FormValidation Mixin 已加载')

