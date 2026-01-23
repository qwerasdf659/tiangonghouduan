/**
 * ECharts 懒加载模块
 *
 * @description 仅在需要图表的页面动态加载ECharts，减少非图表页面的加载体积
 * @usage
 *   import { loadECharts, isEChartsLoaded } from '@/utils/echarts-lazy.js'
 *
 *   // 在需要图表时调用
 *   async function initChart() {
 *     const echarts = await loadECharts()
 *     const chart = echarts.init(document.getElementById('chart'))
 *     chart.setOption({...})
 *   }
 */

/**
 * @type {Object|null} 缓存的ECharts实例
 */
let echartsInstance = null

/**
 * @type {Promise|null} 加载中的Promise，防止重复加载
 */
let loadingPromise = null

/**
 * 动态加载 ECharts
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
      console.log('[ECharts] 开始动态加载...')
      const startTime = performance.now()

      // 动态导入 ECharts 模块
      const echartsModule = await import('./echarts.js')
      echartsInstance = echartsModule.default || echartsModule.echarts

      // 确保挂载到 window
      if (!window.echarts) {
        window.echarts = echartsInstance
      }

      const loadTime = performance.now() - startTime
      console.log(`[ECharts] 加载完成，耗时 ${loadTime.toFixed(2)}ms`)

      return echartsInstance
    } catch (error) {
      console.error('[ECharts] 加载失败:', error)
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
  return echartsInstance !== null || window.echarts !== undefined
}

/**
 * 获取已加载的 ECharts 实例（同步方法）
 *
 * @returns {Object|null} ECharts 实例，未加载时返回 null
 */
export function getECharts() {
  return echartsInstance || window.echarts || null
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
      loadECharts().catch(() => {})
    }, 1000)
  }
}

export default {
  loadECharts,
  isEChartsLoaded,
  getECharts,
  preloadECharts
}
