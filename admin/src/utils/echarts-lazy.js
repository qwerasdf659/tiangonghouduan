/**
 * ECharts 懒加载模块（静态命名导入 + tree-shaking 版本）
 *
 * @description 使用静态命名导入让 Rollup tree-shaking 生效，
 *              仅打包项目实际使用的 7 种图表 + 9 个组件 + 1 个渲染器。
 *              非图表页面不导入此文件，不会拉入 echarts 依赖。
 *
 * @usage
 *   import { loadECharts, isEChartsLoaded } from '@/utils/echarts-lazy.js'
 *
 *   async function initChart() {
 *     const echarts = await loadECharts()
 *     const chart = echarts.init(document.getElementById('chart'))
 *     chart.setOption({...})
 *   }
 *
 * 使用的图表类型：
 * - LineChart (折线图) - dashboard, statistics, analytics, exchange-market
 * - BarChart (柱状图) - analytics, risk-alerts
 * - PieChart (饼图) - dashboard, statistics, analytics, exchange-market, risk-alerts
 * - ScatterChart (散点图) - mini-chart组件
 * - FunnelChart (漏斗图) - dashboard 转化漏斗 Tab
 * - SankeyChart (桑基图) - dashboard 资产流动 Tab
 * - HeatmapChart (热力图) - 策略模拟 BxPx 矩阵热力图
 *
 * @see https://echarts.apache.org/handbook/zh/basics/import
 * @version 3.0.0
 * @date 2026-03-16
 */

// ========== 静态命名导入（Rollup tree-shaking 生效） ==========
import * as echarts from 'echarts/core'
import {
  LineChart,
  BarChart,
  PieChart,
  ScatterChart,
  FunnelChart,
  SankeyChart,
  HeatmapChart
} from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DatasetComponent,
  TransformComponent,
  MarkPointComponent,
  MarkLineComponent,
  VisualMapComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

import { logger } from './logger.js'

// 同步注册：模块加载时立即执行，use() 只跑一次
echarts.use([
  LineChart,
  BarChart,
  PieChart,
  ScatterChart,
  FunnelChart,
  SankeyChart,
  HeatmapChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DatasetComponent,
  TransformComponent,
  MarkPointComponent,
  MarkLineComponent,
  VisualMapComponent,
  CanvasRenderer
])

/**
 * @type {Object|null} 缓存的ECharts实例（首次调用 loadECharts() 时赋值）
 */
let echartsInstance = null

/**
 * 获取已注册的 ECharts 实例（静态导入版本，同步初始化）
 *
 * @description 保持 async 签名以兼容所有 20+ 个调用方（await loadECharts()），
 *              实际上模块加载时 echarts 已同步注册完毕，此处直接返回。
 * @returns {Promise<Object>} ECharts 实例
 * @example
 *   const echarts = await loadECharts()
 *   const chart = echarts.init(document.getElementById('myChart'))
 */
export async function loadECharts() {
  if (echartsInstance) {
    return echartsInstance
  }

  logger.info('[ECharts] 初始化（静态命名导入模式，tree-shaking 生效）')
  echartsInstance = echarts
  return echartsInstance
}

/**
 * 检查 ECharts 是否已加载
 *
 * @returns {boolean} 是否已加载
 */
export function isEChartsLoaded() {
  // 方案 A：彻底 ES Module，仅检查模块内部实例
  return echartsInstance !== null
}

/**
 * 获取已加载的 ECharts 实例（同步方法）
 *
 * @returns {Object|null} ECharts 实例，未加载时返回 null
 */
export function getECharts() {
  // 方案 A：彻底 ES Module，仅返回模块内部实例
  return echartsInstance
}

/**
 * 预加载 ECharts（静态导入版本下为空操作，保留 API 兼容）
 *
 * @description 静态导入模式下 echarts 模块随页面 JS 一起加载，无需预加载。
 *              保留此函数以兼容已有调用方。
 */
export function preloadECharts() {
  if (!echartsInstance) {
    echartsInstance = echarts
  }
}

export default {
  loadECharts,
  isEChartsLoaded,
  getECharts,
  preloadECharts
}
