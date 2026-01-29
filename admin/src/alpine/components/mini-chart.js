/**
 * Mini Chart 迷你图表组件
 *
 * @file src/alpine/components/mini-chart.js
 * @description 基于 Alpine.js 和 ECharts 的迷你图表组件（按需加载版本）
 * @version 2.0.0
 * @date 2026-01-29
 *
 * 使用方式：
 * <div x-data="miniChart({ type: 'line', data: [10, 20, 15, 30, 25] })"
 *      x-ref="chartContainer"
 *      class="w-24 h-12">
 * </div>
 */

import { loadECharts } from '../../utils/echarts-lazy.js'
import { logger } from '../../utils/logger.js'

/**
 * 预定义的迷你图表配置
 */
const CHART_PRESETS = {
  // 折线图 - 趋势线
  line: {
    grid: { top: 2, right: 2, bottom: 2, left: 2 },
    xAxis: { show: false, type: 'category' },
    yAxis: { show: false, type: 'value' },
    series: [
      {
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2 },
        areaStyle: { opacity: 0.2 }
      }
    ]
  },

  // 面积图
  area: {
    grid: { top: 2, right: 2, bottom: 2, left: 2 },
    xAxis: { show: false, type: 'category' },
    yAxis: { show: false, type: 'value' },
    series: [
      {
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 1.5 },
        areaStyle: { opacity: 0.4 }
      }
    ]
  },

  // 柱状图
  bar: {
    grid: { top: 2, right: 2, bottom: 2, left: 2 },
    xAxis: { show: false, type: 'category' },
    yAxis: { show: false, type: 'value' },
    series: [
      {
        type: 'bar',
        barWidth: '60%',
        itemStyle: { borderRadius: [2, 2, 0, 0] }
      }
    ]
  },

  // 迷你柱状图（条形更窄）
  barThin: {
    grid: { top: 2, right: 2, bottom: 2, left: 2 },
    xAxis: { show: false, type: 'category' },
    yAxis: { show: false, type: 'value' },
    series: [
      {
        type: 'bar',
        barWidth: '40%',
        itemStyle: { borderRadius: [1, 1, 0, 0] }
      }
    ]
  },

  // 进度环形图
  progress: {
    series: [
      {
        type: 'pie',
        radius: ['65%', '90%'],
        startAngle: 90,
        silent: true,
        label: { show: false },
        data: [
          { value: 0, itemStyle: {} }, // 已完成
          { value: 100, itemStyle: { color: 'rgba(128, 128, 128, 0.2)' } } // 未完成
        ]
      }
    ]
  },

  // 散点图
  scatter: {
    grid: { top: 2, right: 2, bottom: 2, left: 2 },
    xAxis: { show: false, type: 'value' },
    yAxis: { show: false, type: 'value' },
    series: [
      {
        type: 'scatter',
        symbolSize: 4
      }
    ]
  }
}

/**
 * 颜色预设
 */
const COLOR_PRESETS = {
  primary: '#3b82f6',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#8b5cf6',
  gray: '#6b7280',
  // 渐变色
  'gradient-primary': {
    type: 'linear',
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: '#3b82f6' },
      { offset: 1, color: '#93c5fd' }
    ]
  },
  'gradient-success': {
    type: 'linear',
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: '#22c55e' },
      { offset: 1, color: '#86efac' }
    ]
  },
  'gradient-danger': {
    type: 'linear',
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: '#ef4444' },
      { offset: 1, color: '#fca5a5' }
    ]
  }
}

/**
 * Mini Chart 组件
 * @param {Object} config - 配置选项
 * @param {string} config.type - 图表类型: 'line' | 'area' | 'bar' | 'barThin' | 'progress' | 'scatter'
 * @param {Array} config.data - 数据数组
 * @param {string} config.color - 颜色预设或自定义颜色
 * @param {number} config.width - 宽度（像素）
 * @param {number} config.height - 高度（像素）
 * @param {boolean} config.animate - 是否启用动画（默认 true）
 * @param {Object} config.options - 自定义 ECharts 配置
 */
function miniChart(config = {}) {
  return {
    // 配置
    type: config.type || 'line',
    data: config.data || [],
    color: config.color || 'primary',
    width: config.width || null,
    height: config.height || null,
    animate: config.animate !== false,
    customOptions: config.options || {},

    // 状态
    chart: null,
    resizeObserver: null,
    echartsModule: null,
    isLoading: false,

    // 初始化
    init() {
      logger.debug('[MiniChart] 初始化', { type: this.type })

      this.$nextTick(() => {
        this.createChart()
      })
    },

    // 销毁
    destroy() {
      if (this.resizeObserver) {
        this.resizeObserver.disconnect()
      }
      if (this.chart) {
        this.chart.dispose()
        this.chart = null
      }
    },

    // 创建图表（异步加载 ECharts）
    async createChart() {
      const container = this.$refs.chartContainer || this.$el

      if (!container) {
        logger.warn('[MiniChart] 未找到容器元素')
        return
      }

      // 设置容器尺寸
      if (this.width) container.style.width = `${this.width}px`
      if (this.height) container.style.height = `${this.height}px`

      // 懒加载 ECharts
      if (!this.echartsModule) {
        this.isLoading = true
        try {
          this.echartsModule = await loadECharts()
        } catch (error) {
          logger.error('[MiniChart] ECharts 加载失败', error)
          return
        } finally {
          this.isLoading = false
        }
      }

      // 初始化 ECharts
      this.chart = this.echartsModule.init(container, null, {
        renderer: 'canvas'
      })

      // 设置响应式
      this.setupResizeObserver()

      // 设置配置
      this.updateChart()
    },

    // 更新图表
    updateChart() {
      if (!this.chart) return

      const preset = CHART_PRESETS[this.type] || CHART_PRESETS.line
      const color = this.getColor()

      // 构建配置
      let option = JSON.parse(JSON.stringify(preset))

      // 设置颜色
      if (this.type === 'progress') {
        option = this.buildProgressOption(color)
      } else {
        option.color = [color]
        option.series[0].data = this.data

        // 面积图的渐变填充
        if (this.type === 'area' || this.type === 'line') {
          option.series[0].areaStyle = {
            opacity: 0.3,
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: color },
                { offset: 1, color: 'rgba(255, 255, 255, 0)' }
              ]
            }
          }
        }
      }

      // 动画设置
      option.animation = this.animate
      option.animationDuration = 800
      option.animationEasing = 'cubicOut'

      // 合并自定义配置
      if (this.customOptions) {
        option = this.mergeOptions(option, this.customOptions)
      }

      this.chart.setOption(option, true)
    },

    // 构建进度环形图配置
    buildProgressOption(color) {
      const value = Array.isArray(this.data) ? this.data[0] : this.data
      const percentage = Math.min(100, Math.max(0, value))

      return {
        series: [
          {
            type: 'pie',
            radius: ['60%', '85%'],
            startAngle: 90,
            silent: true,
            label: { show: false },
            emphasis: { disabled: true },
            data: [
              { value: percentage, itemStyle: { color: color } },
              {
                value: 100 - percentage,
                itemStyle: { color: 'rgba(128, 128, 128, 0.15)' }
              }
            ]
          }
        ]
      }
    },

    // 获取颜色
    getColor() {
      if (COLOR_PRESETS[this.color]) {
        const preset = COLOR_PRESETS[this.color]
        return typeof preset === 'string' ? preset : preset
      }
      return this.color
    },

    // 合并配置
    mergeOptions(base, custom) {
      const result = { ...base }
      for (const key in custom) {
        if (
          typeof custom[key] === 'object' &&
          !Array.isArray(custom[key]) &&
          custom[key] !== null
        ) {
          result[key] = this.mergeOptions(result[key] || {}, custom[key])
        } else {
          result[key] = custom[key]
        }
      }
      return result
    },

    // 设置响应式
    setupResizeObserver() {
      const container = this.$refs.chartContainer || this.$el
      if (!container || !window.ResizeObserver) return

      this.resizeObserver = new ResizeObserver(() => {
        if (this.chart) {
          this.chart.resize()
        }
      })

      this.resizeObserver.observe(container)
    },

    // 更新数据
    setData(newData) {
      this.data = newData
      this.updateChart()
    },

    // 更新颜色
    setColor(newColor) {
      this.color = newColor
      this.updateChart()
    },

    // 更新类型
    setType(newType) {
      if (CHART_PRESETS[newType]) {
        this.type = newType
        this.updateChart()
      }
    },

    // 重新渲染
    refresh() {
      if (this.chart) {
        this.chart.resize()
      }
    }
  }
}

/**
 * 快速创建折线趋势图
 */
function trendLine(config = {}) {
  return miniChart({
    type: 'line',
    color: 'primary',
    ...config
  })
}

/**
 * 快速创建柱状图
 */
function trendBar(config = {}) {
  return miniChart({
    type: 'bar',
    color: 'primary',
    ...config
  })
}

/**
 * 快速创建进度环
 */
function progressRing(config = {}) {
  return miniChart({
    type: 'progress',
    color: 'success',
    ...config
  })
}

/**
 * 迷你图表工厂
 */
const miniChartFactory = {
  // 获取可用类型
  getTypes() {
    return Object.keys(CHART_PRESETS)
  },

  // 获取可用颜色
  getColors() {
    return Object.keys(COLOR_PRESETS)
  },

  // 创建图表
  create(type, data, options = {}) {
    return miniChart({ type, data, ...options })
  }
}

// 导出
export {
  miniChart,
  trendLine,
  trendBar,
  progressRing,
  miniChartFactory,
  CHART_PRESETS,
  COLOR_PRESETS
}

logger.info('MiniChart 组件已加载')
