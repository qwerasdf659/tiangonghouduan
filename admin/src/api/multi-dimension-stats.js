/**
 * 多维度统计分析 API
 * @description 支持多维度筛选的统计分析
 * @version 1.1.0
 * @date 2026-02-01
 * @updated 2026-02-06 - 统一使用 request() 替代原生 fetch
 */

import { API_PREFIX, request } from './base.js'

// 多维度统计端点（后端挂载在 /console/statistics 下）
export const MULTI_DIMENSION_ENDPOINTS = {
  STATS: `${API_PREFIX}/console/statistics/multi-dimension`,
  DRILL_DOWN: `${API_PREFIX}/console/statistics/drill-down`
}

/**
 * 多维度统计 API
 */
export const MultiDimensionStatsAPI = {
  /**
   * 获取多维度统计数据
   * @param {Object} params - 查询参数
   * @param {string} params.dimensions - 维度列表（必需，逗号分隔）：campaign,time,user_level
   * @param {string} [params.metrics] - 指标列表（逗号分隔）：draws,win_rate
   * @param {string} [params.period] - 时间周期：day/week/month
   * @param {string} [params.compare] - 对比类型：wow/mom（周环比/月环比）
   * @param {number} [params.campaign_id] - 活动ID
   * @returns {Promise<Object>} 统计数据
   */
  async getStats(params = {}) {
    // 确保必需参数存在（后端必需）
    if (!params.dimensions) {
      params.dimensions = 'campaign,time' // 默认维度
    }
    if (!params.metrics) {
      params.metrics = 'draws,win_rate' // 默认指标
    }
    return request({ url: MULTI_DIMENSION_ENDPOINTS.STATS, params })
  },

  /**
   * 获取下钻明细
   * @param {Object} params - 查询参数
   * @param {string} params.source - 数据源（必需）：lottery/consumption
   * @param {number} [params.lottery_campaign_id] - 活动ID
   * @param {string} [params.period] - 时间周期
   * @param {string} [params.start_date] - 开始日期
   * @param {string} [params.end_date] - 结束日期
   * @param {number} [params.page] - 页码
   * @param {number} [params.page_size] - 每页数量
   * @returns {Promise<Object>} 明细数据
   */
  async getDrillDown(params = {}) {
    return request({ url: MULTI_DIMENSION_ENDPOINTS.DRILL_DOWN, params })
  }
}
