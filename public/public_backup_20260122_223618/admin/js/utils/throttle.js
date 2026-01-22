/**
 * 节流/防抖工具模块
 * 解决：频繁触发的事件处理（如滚动、输入、调整大小等）
 * 
 * @file public/admin/js/utils/throttle.js
 * @description 提供防抖、节流和 requestAnimationFrame 包装函数
 * @version 1.0.0
 * @date 2026-01-23
 * 
 * @example
 * // 防抖：搜索输入
 * const debouncedSearch = debounce(search, 300)
 * input.addEventListener('input', debouncedSearch)
 * 
 * // 节流：滚动加载
 * const throttledLoad = throttle(loadMore, 200)
 * window.addEventListener('scroll', throttledLoad)
 */

/**
 * 防抖函数
 * 延迟执行，如果在延迟期间再次调用则重新计时
 * 适用于：搜索输入、窗口调整大小、表单验证
 * 
 * @param {Function} fn - 要执行的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @param {Object} [options={}] - 选项
 * @param {boolean} [options.immediate=false] - 是否立即执行第一次调用
 * @param {number} [options.maxWait] - 最大等待时间（超过后强制执行）
 * @returns {Function} 防抖后的函数
 * 
 * @example
 * const debouncedSearch = debounce((query) => {
 *   console.log('搜索:', query)
 * }, 300)
 * 
 * // 快速连续调用只会执行最后一次
 * debouncedSearch('a')
 * debouncedSearch('ab')
 * debouncedSearch('abc')  // 只有这个会执行
 */
function debounce(fn, delay, options = {}) {
  const { immediate = false, maxWait } = options
  
  let timeoutId = null
  let lastCallTime = null
  let lastArgs = null
  let lastThis = null
  
  function debounced(...args) {
    const now = Date.now()
    lastArgs = args
    lastThis = this
    
    // 检查是否需要立即执行（首次调用且 immediate 为 true）
    const callNow = immediate && !timeoutId
    
    // 检查是否超过最大等待时间
    const shouldMaxWait = maxWait && lastCallTime && (now - lastCallTime >= maxWait)
    
    // 清除之前的定时器
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    
    // 如果超过最大等待时间，立即执行
    if (shouldMaxWait) {
      fn.apply(lastThis, lastArgs)
      lastCallTime = now
      timeoutId = null
      return
    }
    
    // 记录首次调用时间
    if (!lastCallTime) {
      lastCallTime = now
    }
    
    // 设置延迟执行
    timeoutId = setTimeout(() => {
      if (!immediate || !callNow) {
        fn.apply(lastThis, lastArgs)
      }
      timeoutId = null
      lastCallTime = null
    }, delay)
    
    // 立即执行
    if (callNow) {
      fn.apply(this, args)
    }
  }
  
  /**
   * 取消防抖
   */
  debounced.cancel = function() {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
      lastCallTime = null
    }
  }
  
  /**
   * 立即执行并取消防抖
   */
  debounced.flush = function() {
    if (timeoutId) {
      clearTimeout(timeoutId)
      fn.apply(lastThis, lastArgs)
      timeoutId = null
      lastCallTime = null
    }
  }
  
  /**
   * 检查是否有待执行的调用
   */
  debounced.pending = function() {
    return timeoutId !== null
  }
  
  return debounced
}

/**
 * 节流函数
 * 在指定时间内只执行一次，超过时间后可以再次执行
 * 适用于：滚动事件、鼠标移动、API 请求限制
 * 
 * @param {Function} fn - 要执行的函数
 * @param {number} limit - 时间限制（毫秒）
 * @param {Object} [options={}] - 选项
 * @param {boolean} [options.leading=true] - 是否在开始时执行
 * @param {boolean} [options.trailing=true] - 是否在结束时执行
 * @returns {Function} 节流后的函数
 * 
 * @example
 * const throttledScroll = throttle(() => {
 *   console.log('滚动位置:', window.scrollY)
 * }, 100)
 * 
 * window.addEventListener('scroll', throttledScroll)
 */
function throttle(fn, limit, options = {}) {
  const { leading = true, trailing = true } = options
  
  let lastCallTime = 0
  let timeoutId = null
  let lastArgs = null
  let lastThis = null
  
  function throttled(...args) {
    const now = Date.now()
    const remaining = limit - (now - lastCallTime)
    
    lastArgs = args
    lastThis = this
    
    // 清除可能存在的定时器
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    
    if (remaining <= 0 || remaining > limit) {
      // 时间已过，可以执行
      if (leading || lastCallTime !== 0) {
        fn.apply(this, args)
        lastCallTime = now
      } else if (!lastCallTime) {
        lastCallTime = now
      }
    } else if (trailing) {
      // 设置定时器在剩余时间后执行
      timeoutId = setTimeout(() => {
        fn.apply(lastThis, lastArgs)
        lastCallTime = leading ? Date.now() : 0
        timeoutId = null
      }, remaining)
    }
  }
  
  /**
   * 取消节流
   */
  throttled.cancel = function() {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    lastCallTime = 0
  }
  
  return throttled
}

/**
 * requestAnimationFrame 包装器
 * 使用浏览器的动画帧来节流，适用于 DOM 操作和动画
 * 
 * @param {Function} fn - 要执行的函数
 * @returns {Function} 包装后的函数
 * 
 * @example
 * const optimizedResize = rafThrottle((width, height) => {
 *   element.style.width = width + 'px'
 *   element.style.height = height + 'px'
 * })
 * 
 * window.addEventListener('resize', () => {
 *   optimizedResize(window.innerWidth, window.innerHeight)
 * })
 */
function rafThrottle(fn) {
  let rafId = null
  let lastArgs = null
  let lastThis = null
  
  function throttled(...args) {
    lastArgs = args
    lastThis = this
    
    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        fn.apply(lastThis, lastArgs)
        rafId = null
      })
    }
  }
  
  throttled.cancel = function() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }
  
  return throttled
}

/**
 * 延迟执行函数
 * 简单的延迟执行，返回 Promise
 * 
 * @param {number} ms - 延迟时间（毫秒）
 * @returns {Promise<void>}
 * 
 * @example
 * await delay(1000)
 * console.log('1秒后执行')
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 带超时的 Promise
 * 为异步操作添加超时限制
 * 
 * @param {Promise} promise - 原始 Promise
 * @param {number} ms - 超时时间（毫秒）
 * @param {string} [message='操作超时'] - 超时错误消息
 * @returns {Promise}
 * 
 * @example
 * try {
 *   const result = await withTimeout(fetch('/api/data'), 5000)
 * } catch (error) {
 *   console.log('请求超时或失败')
 * }
 */
function withTimeout(promise, ms, message = '操作超时') {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms)
  })
  
  return Promise.race([promise, timeoutPromise])
}

/**
 * 重试函数
 * 自动重试失败的异步操作
 * 
 * @param {Function} fn - 异步函数
 * @param {Object} [options={}] - 选项
 * @param {number} [options.maxRetries=3] - 最大重试次数
 * @param {number} [options.delay=1000] - 重试间隔（毫秒）
 * @param {boolean} [options.exponential=true] - 是否使用指数退避
 * @param {Function} [options.onRetry] - 重试时的回调
 * @returns {Promise}
 * 
 * @example
 * const result = await retry(
 *   () => fetch('/api/data'),
 *   { maxRetries: 3, delay: 1000 }
 * )
 */
async function retry(fn, options = {}) {
  const { 
    maxRetries = 3, 
    delay: baseDelay = 1000, 
    exponential = true,
    onRetry 
  } = options
  
  let lastError
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      
      if (attempt < maxRetries) {
        const delayTime = exponential ? baseDelay * Math.pow(2, attempt) : baseDelay
        
        if (onRetry) {
          onRetry({ attempt, error, nextDelay: delayTime })
        }
        
        console.log(`[retry] 第 ${attempt + 1} 次尝试失败，${delayTime}ms 后重试...`)
        await delay(delayTime)
      }
    }
  }
  
  throw lastError
}

/**
 * 只执行一次的函数
 * 确保函数只执行一次，后续调用返回第一次的结果
 * 
 * @param {Function} fn - 要执行的函数
 * @returns {Function}
 * 
 * @example
 * const initialize = once(() => {
 *   console.log('初始化')
 *   return { initialized: true }
 * })
 * 
 * initialize() // 输出 "初始化"，返回 { initialized: true }
 * initialize() // 不输出，返回 { initialized: true }
 */
function once(fn) {
  let called = false
  let result
  
  return function(...args) {
    if (!called) {
      called = true
      result = fn.apply(this, args)
    }
    return result
  }
}

// 导出到全局作用域
window.debounce = debounce
window.throttle = throttle
window.rafThrottle = rafThrottle
window.delay = delay
window.withTimeout = withTimeout
window.retry = retry
window.once = once

console.log('✅ 节流/防抖工具模块已加载')

