/**
 * 工具模块入口文件
 * 统一导出所有工具函数
 * 
 * @file public/admin/js/utils/index.js
 * @description 汇总工具模块的导出
 * @version 1.0.0
 * @date 2026-01-23
 * 
 * 📦 包含的模块：
 * - throttle: 节流/防抖函数
 * - error-handler: 统一错误处理
 * - cache-strategy: 缓存策略
 * - error-boundary: 错误边界
 */

// 验证模块加载状态
const UtilModules = {
  // 节流/防抖
  debounce: window.debounce,
  throttle: window.throttle,
  rafThrottle: window.rafThrottle,
  delay: window.delay,
  withTimeout: window.withTimeout,
  retry: window.retry,
  once: window.once,
  
  // 错误处理
  ErrorHandler: window.ErrorHandler,
  
  // 缓存策略
  CacheStrategy: window.CacheStrategy,
  
  // 错误边界
  ErrorBoundary: window.ErrorBoundary
}

// 检查并报告模块状态
const loadedUtils = []
const missingUtils = []

Object.entries(UtilModules).forEach(([name, module]) => {
  if (module) {
    loadedUtils.push(name)
  } else {
    missingUtils.push(name)
  }
})

if (missingUtils.length > 0) {
  console.warn(`⚠️ 以下工具模块未加载: ${missingUtils.join(', ')}`)
}

console.log(`✅ 工具模块已加载: ${loadedUtils.length} 个`)

// 导出模块集合
window.UtilModules = UtilModules

// ========== 便捷工具函数 ==========

/**
 * 格式化文件大小
 * 
 * @param {number} bytes - 字节数
 * @param {number} [decimals=2] - 小数位数
 * @returns {string}
 */
window.formatFileSize = function(bytes, decimals = 2) {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i]
}

/**
 * 格式化持续时间
 * 
 * @param {number} ms - 毫秒数
 * @returns {string}
 */
window.formatDuration = function(ms) {
  if (ms < 1000) return ms + 'ms'
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's'
  if (ms < 3600000) return Math.floor(ms / 60000) + 'm ' + Math.floor((ms % 60000) / 1000) + 's'
  
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
  return hours + 'h ' + minutes + 'm'
}

/**
 * 深拷贝对象
 * 
 * @param {any} obj - 要拷贝的对象
 * @returns {any}
 */
window.deepClone = function(obj) {
  if (obj === null || typeof obj !== 'object') return obj
  
  // 处理日期
  if (obj instanceof Date) {
    return new Date(obj.getTime())
  }
  
  // 处理数组
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item))
  }
  
  // 处理普通对象
  const cloned = {}
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key])
    }
  }
  
  return cloned
}

/**
 * 安全获取嵌套属性
 * 
 * @param {Object} obj - 对象
 * @param {string} path - 属性路径（如 'user.profile.name'）
 * @param {any} [defaultValue=undefined] - 默认值
 * @returns {any}
 */
window.get = function(obj, path, defaultValue = undefined) {
  const keys = path.split('.')
  let result = obj
  
  for (const key of keys) {
    if (result === null || result === undefined) {
      return defaultValue
    }
    result = result[key]
  }
  
  return result === undefined ? defaultValue : result
}

/**
 * 安全设置嵌套属性
 * 
 * @param {Object} obj - 对象
 * @param {string} path - 属性路径
 * @param {any} value - 值
 * @returns {Object}
 */
window.set = function(obj, path, value) {
  const keys = path.split('.')
  let current = obj
  
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (!(key in current)) {
      current[key] = {}
    }
    current = current[key]
  }
  
  current[keys[keys.length - 1]] = value
  return obj
}

/**
 * 生成唯一 ID
 * 
 * @param {string} [prefix=''] - 前缀
 * @returns {string}
 */
window.generateId = function(prefix = '') {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 8)
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`
}

/**
 * 检查对象是否为空
 * 
 * @param {any} obj - 对象
 * @returns {boolean}
 */
window.isEmpty = function(obj) {
  if (obj === null || obj === undefined) return true
  if (Array.isArray(obj)) return obj.length === 0
  if (typeof obj === 'object') return Object.keys(obj).length === 0
  if (typeof obj === 'string') return obj.trim().length === 0
  return false
}

/**
 * 简单的模板字符串替换
 * 
 * @param {string} template - 模板字符串
 * @param {Object} data - 数据对象
 * @returns {string}
 * 
 * @example
 * template('Hello {name}!', { name: 'World' }) // 'Hello World!'
 */
window.template = function(template, data) {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return data.hasOwnProperty(key) ? data[key] : match
  })
}

/**
 * 复制文本到剪贴板
 * 
 * @param {string} text - 要复制的文本
 * @returns {Promise<boolean>}
 */
window.copyToClipboard = async function(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch (err) {
    // 降级方案
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    
    try {
      document.execCommand('copy')
      return true
    } catch (e) {
      return false
    } finally {
      document.body.removeChild(textarea)
    }
  }
}

/**
 * 下载文件
 * 
 * @param {string} url - 文件 URL 或 Blob URL
 * @param {string} filename - 文件名
 */
window.downloadFile = function(url, filename) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * 从数组中移除指定元素
 * 
 * @param {Array} array - 数组
 * @param {any} item - 要移除的元素
 * @returns {boolean} 是否成功移除
 */
window.removeFromArray = function(array, item) {
  const index = array.indexOf(item)
  if (index > -1) {
    array.splice(index, 1)
    return true
  }
  return false
}

/**
 * 数组去重
 * 
 * @param {Array} array - 数组
 * @param {string} [key] - 对象数组的去重键
 * @returns {Array}
 */
window.unique = function(array, key) {
  if (!key) {
    return [...new Set(array)]
  }
  
  const seen = new Set()
  return array.filter(item => {
    const val = item[key]
    if (seen.has(val)) {
      return false
    }
    seen.add(val)
    return true
  })
}

console.log('✅ 工具模块入口文件已加载')

