/**
 * ECharts 懒加载模块（按需导入版本）
 *
 * @description 仅在需要图表的页面动态加载ECharts，减少非图表页面的加载体积。
 *              使用按需导入，仅包含项目实际使用的图表类型和组件。
 *
 * @usage
 *   import { loadECharts, isEChartsLoaded } from '@/utils/echarts-lazy.js'
 *
 *   // 在需要图表时调用
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
 *
 * @see https://echarts.apache.org/handbook/zh/basics/import
 * @version 2.2.0
 * @date 2026-02-05
 */

import { logger } from './logger.js'

/**
 * @type {Object|null} 缓存的ECharts实例
 */
let echartsInstance = null

/**
 * @type {Promise|null} 加载中的Promise，防止重复加载
 */
let loadingPromise = null

/**
 * 初始化并配置 ECharts（按需导入）
 *
 * @returns {Promise<Object>} 配置好的 ECharts 实例
 */
async function initEChartsCore() {
  // 核心模块 — 只 import 一次，保证 use() 和 init() 在同一实例上
  const echartsCore = await import('echarts/core')

  // 图表类型 + 组件 + 渲染器并行加载
  const [charts, components, renderers] = await Promise.all([
    import('echarts/charts'),
    import('echarts/components'),
    import('echarts/renderers')
  ])

  echartsCore.use([
    charts.LineChart,
    charts.BarChart,
    charts.PieChart,
    charts.ScatterChart,
    charts.FunnelChart,
    charts.SankeyChart,
    components.TitleComponent,
    components.TooltipComponent,
    components.GridComponent,
    components.LegendComponent,
    components.DatasetComponent,
    components.TransformComponent,
    components.MarkPointComponent,
    components.MarkLineComponent,
    renderers.CanvasRenderer
  ])

  return echartsCore
}

/**
 * 动态加载 ECharts（按需导入）
 *
 * @returns {Promise<Object>} ECharts 实例
 * @example
 *   const echarts = await loadECharts()
 *   const chart = echarts.init(document.getElementById('myChart'))
 */
export async function loadECharts() {
  // 如果已加载，直接返回
  if (echartsInstance) {
    return echartsInstance
  }

  // 如果正在加载，等待加载完成
  if (loadingPromise) {
    return loadingPromise
  }

  // 开始加载
  loadingPromise = (async () => {
    try {
      logger.info('[ECharts] 开始动态加载（按需导入模式）...')
      const startTime = performance.now()

      // 初始化 ECharts（按需导入）
      echartsInstance = await initEChartsCore()

      // ========== window.echarts 已移除（方案 A：彻底 ES Module） ==========
      // 请使用 ES Module 导入：
      //   import { getECharts } from '@/utils/echarts-lazy.js'
      //   const echarts = await getECharts()

      const loadTime = performance.now() - startTime
      logger.info(`[ECharts] 加载完成，耗时 ${loadTime.toFixed(2)}ms`)

      return echartsInstance
    } catch (error) {
      logger.error('[ECharts] 加载失败:', error)
      loadingPromise = null // 重置，允许重试
      throw error
    }
  })()

  return loadingPromise
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
 * 预加载 ECharts（不阻塞）
 *
 * @description 在空闲时预加载，提升后续使用体验
 */
export function preloadECharts() {
  if (echartsInstance || loadingPromise) {
    return
  }

  // 使用 requestIdleCallback 在空闲时加载
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(() => {
      loadECharts().catch(() => {
        // 预加载失败不抛出错误
      })
    })
  } else {
    // 降级方案：延迟加载
    setTimeout(() => {
      loadECharts().catch(err => console.warn('[ECharts] 延迟预加载失败:', err.message))
    }, 1000)
  }
}

export default {
  loadECharts,
  isEChartsLoaded,
  getECharts,
  preloadECharts
}
