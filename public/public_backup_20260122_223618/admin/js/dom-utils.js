/**
 * 安全的DOM操作工具类
 * 自动进行null检查，避免TypeError
 *
 * 使用方式：
 * 1. 在HTML中引入此文件：<script src="js/dom-utils.js"></script>
 * 2. 使用DOMUtils替代直接的document.getElementById()
 *
 * 创建时间：2025年11月23日
 */

class DOMUtils {
  /**
   * 安全获取元素（自动null检查）
   * @param {string} elementId - 元素ID
   * @param {string} errorMsg - 自定义错误提示信息
   * @returns {HTMLElement|null} 元素对象或null
   *
   * @example
   * const button = DOMUtils.getElement('submitBtn');
   * if (button) {
   *   button.disabled = false;
   * }
   */
  static getElement(elementId, errorMsg = null) {
    const element = document.getElementById(elementId)

    if (!element) {
      const message = errorMsg || `元素不存在: #${elementId}`
      console.error(`❌ ${message}`)

      // 开发环境显示明显提示
      if (
        window.location.hostname === 'localhost' ||
        window.location.hostname.includes('devbox') ||
        window.location.hostname.includes('127.0.0.1')
      ) {
        console.warn(`💡 开发提示: 请检查HTML中是否存在 id="${elementId}" 的元素`)
      }
    }

    return element
  }

  /**
   * 安全添加事件监听器
   * @param {string} elementId - 元素ID
   * @param {string} eventType - 事件类型（如'click', 'change'）
   * @param {Function} handler - 事件处理函数
   * @param {Object} options - 事件监听选项
   * @returns {boolean} 是否成功添加
   *
   * @example
   * DOMUtils.safeAddEventListener('submitBtn', 'click', handleSubmit);
   */
  static safeAddEventListener(elementId, eventType, handler, options = {}) {
    const element = this.getElement(elementId)

    if (element && typeof handler === 'function') {
      element.addEventListener(eventType, handler, options)
      console.log(`✅ 事件绑定成功: #${elementId} -> ${eventType}`)
      return true
    }

    if (!handler || typeof handler !== 'function') {
      console.error(`❌ 事件处理函数无效: #${elementId}`)
    }

    return false
  }

  /**
   * 批量绑定事件（减少重复代码）
   * @param {Array} bindings - 绑定配置数组
   * @returns {Object} 绑定结果统计
   *
   * @example
   * DOMUtils.batchBindEvents([
   *   { id: 'submitBtn', event: 'click', handler: submitForm },
   *   { id: 'cancelBtn', event: 'click', handler: closeModal },
   *   { id: 'nameInput', event: 'input', handler: validateName }
   * ]);
   */
  static batchBindEvents(bindings) {
    const results = bindings.map(({ id, event, handler, options }) => ({
      id,
      event,
      success: this.safeAddEventListener(id, event, handler, options)
    }))

    const successCount = results.filter(r => r.success).length
    const failedCount = results.length - successCount

    console.log(`📊 批量事件绑定结果: ${successCount}/${results.length} 成功`)

    if (failedCount > 0) {
      console.warn(`⚠️ ${failedCount}个事件绑定失败`)
      results
        .filter(r => !r.success)
        .forEach(r => {
          console.warn(`   - #${r.id} (${r.event})`)
        })
    }

    return {
      total: results.length,
      success: successCount,
      failed: failedCount,
      results
    }
  }

  /**
   * 安全设置元素内容（innerHTML）
   * @param {string} elementId - 元素ID
   * @param {string} content - HTML内容
   * @returns {boolean} 是否成功设置
   *
   * @example
   * DOMUtils.safeSetHTML('resultsList', '<div>数据加载完成</div>');
   */
  static safeSetHTML(elementId, content) {
    const element = this.getElement(elementId)

    if (element) {
      element.innerHTML = content
      return true
    }

    return false
  }

  /**
   * 安全设置元素文本内容（textContent）
   * @param {string} elementId - 元素ID
   * @param {string} text - 文本内容
   * @returns {boolean} 是否成功设置
   *
   * @example
   * DOMUtils.safeSetText('userName', '张三');
   */
  static safeSetText(elementId, text) {
    const element = this.getElement(elementId)

    if (element) {
      element.textContent = text
      return true
    }

    return false
  }

  /**
   * 安全获取表单值
   * @param {string} elementId - 表单元素ID
   * @param {*} defaultValue - 默认值（元素不存在时返回）
   * @returns {*} 表单值或默认值
   *
   * @example
   * const name = DOMUtils.safeGetValue('nameInput', '');
   * const age = DOMUtils.safeGetValue('ageInput', 0);
   */
  static safeGetValue(elementId, defaultValue = '') {
    const element = this.getElement(elementId)
    return element ? element.value : defaultValue
  }

  /**
   * 安全设置表单值
   * @param {string} elementId - 表单元素ID
   * @param {*} value - 要设置的值
   * @returns {boolean} 是否成功设置
   *
   * @example
   * DOMUtils.safeSetValue('nameInput', '张三');
   */
  static safeSetValue(elementId, value) {
    const element = this.getElement(elementId)

    if (element) {
      element.value = value
      return true
    }

    return false
  }

  /**
   * 安全添加CSS类
   * @param {string} elementId - 元素ID
   * @param {string|Array} classNames - 类名（字符串或数组）
   * @returns {boolean} 是否成功添加
   *
   * @example
   * DOMUtils.safeAddClass('alertBox', 'show');
   * DOMUtils.safeAddClass('alertBox', ['show', 'fade-in']);
   */
  static safeAddClass(elementId, classNames) {
    const element = this.getElement(elementId)

    if (element) {
      const classes = Array.isArray(classNames) ? classNames : [classNames]
      element.classList.add(...classes)
      return true
    }

    return false
  }

  /**
   * 安全移除CSS类
   * @param {string} elementId - 元素ID
   * @param {string|Array} classNames - 类名（字符串或数组）
   * @returns {boolean} 是否成功移除
   *
   * @example
   * DOMUtils.safeRemoveClass('alertBox', 'show');
   */
  static safeRemoveClass(elementId, classNames) {
    const element = this.getElement(elementId)

    if (element) {
      const classes = Array.isArray(classNames) ? classNames : [classNames]
      element.classList.remove(...classes)
      return true
    }

    return false
  }

  /**
   * 安全切换CSS类
   * @param {string} elementId - 元素ID
   * @param {string} className - 类名
   * @returns {boolean|null} true-已添加, false-已移除, null-操作失败
   *
   * @example
   * DOMUtils.safeToggleClass('menu', 'active');
   */
  static safeToggleClass(elementId, className) {
    const element = this.getElement(elementId)

    if (element) {
      return element.classList.toggle(className)
    }

    return null
  }

  /**
   * 安全显示元素
   * @param {string} elementId - 元素ID
   * @param {string} displayType - display类型（默认'block'）
   * @returns {boolean} 是否成功显示
   *
   * @example
   * DOMUtils.safeShow('loadingSpinner');
   * DOMUtils.safeShow('userMenu', 'flex');
   */
  static safeShow(elementId, displayType = 'block') {
    const element = this.getElement(elementId)

    if (element) {
      element.style.display = displayType
      return true
    }

    return false
  }

  /**
   * 安全隐藏元素
   * @param {string} elementId - 元素ID
   * @returns {boolean} 是否成功隐藏
   *
   * @example
   * DOMUtils.safeHide('loadingSpinner');
   */
  static safeHide(elementId) {
    const element = this.getElement(elementId)

    if (element) {
      element.style.display = 'none'
      return true
    }

    return false
  }

  /**
   * 安全启用/禁用表单元素
   * @param {string} elementId - 元素ID
   * @param {boolean} disabled - true-禁用, false-启用
   * @returns {boolean} 是否成功设置
   *
   * @example
   * DOMUtils.safeSetDisabled('submitBtn', true);  // 禁用
   * DOMUtils.safeSetDisabled('submitBtn', false); // 启用
   */
  static safeSetDisabled(elementId, disabled) {
    const element = this.getElement(elementId)

    if (element) {
      element.disabled = disabled
      return true
    }

    return false
  }

  /**
   * 批量获取表单数据
   * @param {Array} fieldIds - 表单字段ID数组
   * @returns {Object} 表单数据对象
   *
   * @example
   * const formData = DOMUtils.batchGetFormData(['name', 'email', 'phone']);
   * // 返回: { name: '张三', email: 'test@example.com', phone: '13800138000' }
   */
  static batchGetFormData(fieldIds) {
    const formData = {}

    fieldIds.forEach(id => {
      formData[id] = this.safeGetValue(id, '')
    })

    return formData
  }

  /**
   * 批量设置表单数据
   * @param {Object} data - 表单数据对象
   * @returns {Object} 设置结果统计
   *
   * @example
   * DOMUtils.batchSetFormData({
   *   name: '张三',
   *   email: 'test@example.com',
   *   phone: '13800138000'
   * });
   */
  static batchSetFormData(data) {
    let successCount = 0
    let failedCount = 0

    Object.entries(data).forEach(([id, value]) => {
      if (this.safeSetValue(id, value)) {
        successCount++
      } else {
        failedCount++
      }
    })

    return {
      total: Object.keys(data).length,
      success: successCount,
      failed: failedCount
    }
  }
}

// 暴露到全局作用域
if (typeof window !== 'undefined') {
  window.DOMUtils = DOMUtils
  console.log('✅ DOMUtils 工具类已加载')
}

// 支持模块化导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DOMUtils
}
