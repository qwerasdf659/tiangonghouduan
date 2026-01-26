/**
 * Animated Counter 数字动画组件
 *
 * @file src/alpine/components/animated-counter.js
 * @description 基于 Alpine.js 的数字动画组件，支持统计卡片数值动画
 * @version 1.0.0
 * @date 2026-01-26
 *
 * 使用方式：
 * <span x-data="animatedCounter({ target: 1234, duration: 1000 })" x-text="displayValue"></span>
 *
 * 或配合 stats-card：
 * <div x-data="animatedCounter({ target: 0 })" x-init="animateTo(1234)">
 *   <span x-text="displayValue"></span>
 * </div>
 */

import { logger } from '../../utils/logger.js'

/**
 * 缓动函数
 */
const EASING_FUNCTIONS = {
  // 线性
  linear: t => t,
  // 缓入
  easeIn: t => t * t,
  // 缓出
  easeOut: t => t * (2 - t),
  // 缓入缓出
  easeInOut: t => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  // 弹性
  easeOutElastic: t => {
    const p = 0.3
    return Math.pow(2, -10 * t) * Math.sin(((t - p / 4) * (2 * Math.PI)) / p) + 1
  },
  // 弹跳
  easeOutBounce: t => {
    if (t < 1 / 2.75) {
      return 7.5625 * t * t
    } else if (t < 2 / 2.75) {
      return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75
    } else if (t < 2.5 / 2.75) {
      return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375
    } else {
      return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375
    }
  }
}

/**
 * Animated Counter 组件数据
 * @param {Object} config - 配置选项
 * @param {number} config.target - 目标数值
 * @param {number} config.start - 起始数值（默认 0）
 * @param {number} config.duration - 动画时长（毫秒，默认 1000）
 * @param {string} config.easing - 缓动函数（默认 'easeOut'）
 * @param {string} config.format - 格式化类型: 'number' | 'currency' | 'percent' | 'decimal'
 * @param {number} config.decimals - 小数位数
 * @param {string} config.prefix - 前缀（如 '¥'）
 * @param {string} config.suffix - 后缀（如 '%', '个'）
 * @param {boolean} config.autoStart - 是否自动开始动画（默认 true）
 * @param {number} config.delay - 动画延迟（毫秒）
 */
function animatedCounter(config = {}) {
  return {
    // 状态
    current: config.start || 0,
    target: config.target || 0,
    duration: config.duration || 1000,
    easing: config.easing || 'easeOut',
    format: config.format || 'number',
    decimals: config.decimals ?? 0,
    prefix: config.prefix || '',
    suffix: config.suffix || '',
    autoStart: config.autoStart !== false,
    delay: config.delay || 0,
    isAnimating: false,
    animationId: null,

    // 计算属性
    get displayValue() {
      return this.formatNumber(this.current)
    },

    // 初始化
    init() {
      logger.debug('[AnimatedCounter] 初始化', { target: this.target })

      if (this.autoStart && this.target !== this.current) {
        if (this.delay > 0) {
          setTimeout(() => this.animateTo(this.target), this.delay)
        } else {
          this.animateTo(this.target)
        }
      }
    },

    // 销毁时清理
    destroy() {
      if (this.animationId) {
        cancelAnimationFrame(this.animationId)
        this.animationId = null
      }
    },

    /**
     * 动画到目标值
     * @param {number} targetValue - 目标数值
     * @param {Object} options - 动画选项
     */
    animateTo(targetValue, options = {}) {
      // 取消正在进行的动画
      if (this.animationId) {
        cancelAnimationFrame(this.animationId)
      }

      const startValue = this.current
      const newTarget = targetValue
      const duration = options.duration || this.duration
      const easingName = options.easing || this.easing
      const easingFn = EASING_FUNCTIONS[easingName] || EASING_FUNCTIONS.easeOut

      this.target = newTarget
      this.isAnimating = true

      const startTime = performance.now()

      const animate = currentTime => {
        const elapsed = currentTime - startTime
        const progress = Math.min(elapsed / duration, 1)

        // 应用缓动函数
        const easedProgress = easingFn(progress)

        // 计算当前值
        this.current = startValue + (newTarget - startValue) * easedProgress

        if (progress < 1) {
          this.animationId = requestAnimationFrame(animate)
        } else {
          // 确保最终值精确
          this.current = newTarget
          this.isAnimating = false
          this.animationId = null

          // 触发完成回调
          if (options.onComplete) {
            options.onComplete(newTarget)
          }
        }
      }

      this.animationId = requestAnimationFrame(animate)
    },

    /**
     * 立即设置值（无动画）
     * @param {number} value - 数值
     */
    setValue(value) {
      if (this.animationId) {
        cancelAnimationFrame(this.animationId)
        this.animationId = null
      }
      this.current = value
      this.target = value
      this.isAnimating = false
    },

    /**
     * 增加数值（带动画）
     * @param {number} amount - 增加量
     */
    increment(amount = 1, options = {}) {
      this.animateTo(this.target + amount, options)
    },

    /**
     * 减少数值（带动画）
     * @param {number} amount - 减少量
     */
    decrement(amount = 1, options = {}) {
      this.animateTo(this.target - amount, options)
    },

    /**
     * 重置到初始值
     * @param {boolean} animated - 是否带动画
     */
    reset(animated = false) {
      const startValue = config.start || 0
      if (animated) {
        this.animateTo(startValue)
      } else {
        this.setValue(startValue)
      }
    },

    /**
     * 格式化数字
     * @param {number} value - 数值
     * @returns {string} 格式化后的字符串
     */
    formatNumber(value) {
      let formatted

      switch (this.format) {
        case 'currency':
          formatted = Number(value).toLocaleString('zh-CN', {
            minimumFractionDigits: this.decimals || 2,
            maximumFractionDigits: this.decimals || 2
          })
          break

        case 'percent':
          formatted = (Number(value) * 100).toFixed(this.decimals || 1)
          break

        case 'decimal':
          formatted = Number(value).toFixed(this.decimals || 2)
          break

        case 'compact':
          // 紧凑格式：1234 -> 1.2k, 1234567 -> 1.2M
          formatted = this.compactNumber(value)
          break

        case 'number':
        default:
          if (this.decimals > 0) {
            formatted = Number(value).toLocaleString('zh-CN', {
              minimumFractionDigits: this.decimals,
              maximumFractionDigits: this.decimals
            })
          } else {
            formatted = Math.round(value).toLocaleString('zh-CN')
          }
          break
      }

      return `${this.prefix}${formatted}${this.suffix}`
    },

    /**
     * 紧凑数字格式化
     * @param {number} value - 数值
     * @returns {string}
     */
    compactNumber(value) {
      const absValue = Math.abs(value)
      const sign = value < 0 ? '-' : ''

      if (absValue >= 1e9) {
        return sign + (absValue / 1e9).toFixed(1) + 'B'
      }
      if (absValue >= 1e6) {
        return sign + (absValue / 1e6).toFixed(1) + 'M'
      }
      if (absValue >= 1e4) {
        return sign + (absValue / 1e4).toFixed(1) + '万'
      }
      if (absValue >= 1e3) {
        return sign + (absValue / 1e3).toFixed(1) + 'k'
      }
      return sign + Math.round(absValue).toString()
    }
  }
}

/**
 * 快速创建货币计数器
 */
function currencyCounter(config = {}) {
  return animatedCounter({
    format: 'currency',
    prefix: '¥',
    decimals: 2,
    ...config
  })
}

/**
 * 快速创建百分比计数器
 */
function percentCounter(config = {}) {
  return animatedCounter({
    format: 'percent',
    suffix: '%',
    decimals: 1,
    ...config
  })
}

/**
 * 快速创建紧凑数字计数器
 */
function compactCounter(config = {}) {
  return animatedCounter({
    format: 'compact',
    ...config
  })
}

/**
 * 统计卡片增强版（带动画数字）
 * @param {Object} config - 配置选项
 */
function animatedStatsCard(config = {}) {
  return {
    label: config.label || '统计项',
    icon: config.icon || '📊',
    color: config.color || 'primary',
    format: config.format || 'number',
    decimals: config.decimals || 0,
    prefix: config.prefix || '',
    suffix: config.suffix || '',
    trend: config.trend || null, // 'up' | 'down' | 'neutral'
    trendValue: config.trendValue || '',

    // 动画计数器状态
    current: 0,
    target: config.value || 0,
    duration: config.duration || 1200,
    isAnimating: false,
    animationId: null,

    get displayValue() {
      return this.formatNumber(this.current)
    },

    get trendIcon() {
      if (this.trend === 'up') return '📈'
      if (this.trend === 'down') return '📉'
      return '➡️'
    },

    get trendClass() {
      if (this.trend === 'up') return 'text-green-600'
      if (this.trend === 'down') return 'text-red-600'
      return 'text-gray-500'
    },

    init() {
      logger.debug('[AnimatedStatsCard] 初始化', { label: this.label })
      // 延迟启动动画，产生交错效果
      const delay = config.delay || 0
      setTimeout(() => this.animateValue(this.target), delay)
    },

    destroy() {
      if (this.animationId) {
        cancelAnimationFrame(this.animationId)
      }
    },

    // 更新数值（带动画）
    updateValue(newValue, newTrend = null, newTrendValue = '') {
      if (newTrend !== null) {
        this.trend = newTrend
        this.trendValue = newTrendValue
      }
      this.animateValue(newValue)
    },

    // 执行动画
    animateValue(targetValue) {
      if (this.animationId) {
        cancelAnimationFrame(this.animationId)
      }

      const startValue = this.current
      this.target = targetValue
      this.isAnimating = true

      const startTime = performance.now()
      const easing = t => t * (2 - t) // easeOut

      const animate = currentTime => {
        const elapsed = currentTime - startTime
        const progress = Math.min(elapsed / this.duration, 1)
        const easedProgress = easing(progress)

        this.current = startValue + (targetValue - startValue) * easedProgress

        if (progress < 1) {
          this.animationId = requestAnimationFrame(animate)
        } else {
          this.current = targetValue
          this.isAnimating = false
          this.animationId = null
        }
      }

      this.animationId = requestAnimationFrame(animate)
    },

    formatNumber(value) {
      let formatted

      switch (this.format) {
        case 'currency':
          formatted = Number(value).toLocaleString('zh-CN', {
            minimumFractionDigits: this.decimals || 2,
            maximumFractionDigits: this.decimals || 2
          })
          break
        case 'percent':
          formatted = (Number(value) * 100).toFixed(this.decimals || 1)
          break
        case 'decimal':
          formatted = Number(value).toFixed(this.decimals || 2)
          break
        default:
          formatted = Math.round(value).toLocaleString('zh-CN')
      }

      return `${this.prefix}${formatted}${this.suffix}`
    }
  }
}

// 导出
export {
  animatedCounter,
  currencyCounter,
  percentCounter,
  compactCounter,
  animatedStatsCard,
  EASING_FUNCTIONS
}

logger.info('AnimatedCounter 组件已加载')
