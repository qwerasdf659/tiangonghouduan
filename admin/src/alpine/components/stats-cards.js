/**
 * Stats Cards 统计卡片组件
 *
 * @file public/admin/js/alpine/components/stats-cards.js
 * @description 基于 Alpine.js 的统计卡片组件
 * @version 1.0.0
 * @date 2026-01-22
 *
 * 使用方式：
 * <div x-data="statsCards({ stats: [...] })">
 *   <template x-for="stat in stats">...</template>
 * </div>
 */

import { logger } from '../../utils/logger.js'
/**
 * Stats Cards 组件数据
 * @param {Object} config - 配置选项
 * @param {Array} config.stats - 统计卡片配置数组
 * @param {Object} config.data - 统计数据
 */
function statsCards(config = {}) {
  return {
    stats: config.stats || [],
    data: config.data || {},
    loading: false,

    // 初始化
    init() {
      logger.info('[StatsCards] 初始化')
    },

    // 设置数据
    setData(data) {
      this.data = data || {}
    },

    // 获取统计值
    getValue(stat) {
      if (this.loading) return '-'

      // 使用计算函数
      if (stat.compute && typeof stat.compute === 'function') {
        return stat.compute(this.data)
      }

      // 从数据中获取
      if (stat.field) {
        return this.getNestedValue(this.data, stat.field) ?? '-'
      }

      // 直接使用 key 获取
      if (stat.key && this.data[stat.key] !== undefined) {
        return this.data[stat.key]
      }

      return '-'
    },

    // 格式化显示值
    formatValue(stat, value) {
      if (value === '-' || value === null || value === undefined) return '-'

      switch (stat.format) {
        case 'number':
          return Number(value).toLocaleString('zh-CN')
        case 'currency':
          return `¥${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
        case 'percent':
          return `${(Number(value) * 100).toFixed(1)}%`
        case 'decimal':
          return Number(value).toFixed(stat.decimals || 2)
        default:
          return value
      }
    },

    // 获取卡片样式类
    getCardClass(stat) {
      const classes = ['card']
      if (stat.border) {
        classes.push(`border-${stat.border}`)
      }
      if (stat.bg) {
        classes.push(`bg-${stat.bg}`)
        classes.push('text-white')
      }
      return classes.join(' ')
    },

    // 获取值的颜色类
    getValueClass(stat) {
      return `text-${stat.color || 'primary'}`
    },

    // 获取图标
    getIcon(stat) {
      return stat.icon || 'bi-bar-chart'
    },

    // 获取嵌套属性值
    getNestedValue(obj, path) {
      return path.split('.').reduce((current, key) => current?.[key], obj)
    },

    // 计算列宽
    get colClass() {
      const count = this.stats.length
      if (count <= 2) return 'col-md-6'
      if (count <= 3) return 'col-md-4'
      if (count <= 4) return 'col-md-3'
      if (count <= 6) return 'col-md-2'
      return 'col-md-2'
    }
  }
}

/**
 * 单个统计卡片组件
 */
function statCard(config = {}) {
  return {
    label: config.label || '统计项',
    value: config.value || '-',
    icon: config.icon || 'bi-bar-chart',
    color: config.color || 'primary',
    border: config.border || '',
    trend: config.trend || null, // 'up', 'down', 'flat'
    trendValue: config.trendValue || '',
    loading: false,

    // 设置值
    setValue(value) {
      this.value = value
    },

    // 设置趋势
    setTrend(trend, value) {
      this.trend = trend
      this.trendValue = value
    },

    // 获取趋势图标
    get trendIcon() {
      if (this.trend === 'up') return 'bi-arrow-up'
      if (this.trend === 'down') return 'bi-arrow-down'
      return 'bi-dash'
    },

    // 获取趋势颜色
    get trendClass() {
      if (this.trend === 'up') return 'text-success'
      if (this.trend === 'down') return 'text-danger'
      return 'text-muted'
    }
  }
}

logger.info('StatsCards 组件已加载')
