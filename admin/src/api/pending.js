/**
 * 待处理中心 API
 * @description 待处理事项汇总和列表查询
 * @version 1.2.0
 * @date 2026-02-03
 * @updated 2026-02-06 - 统一使用 request() 替代原生 fetch
 */

import { API_PREFIX, request } from './base.js'

// 待处理中心端点（以后端实际路由为准）
export const PENDING_ENDPOINTS = {
  SUMMARY: `${API_PREFIX}/console/pending/summary`,
  LIST: `${API_PREFIX}/console/pending/list`,
  BATCH: `${API_PREFIX}/console/pending/batch`
}

// 注意：健康评分已移至 dashboard 模块
// 使用 dashboard.js 中的 DASHBOARD_ENDPOINTS.BUSINESS_HEALTH

/**
 * 待处理中心 API
 */
export const PendingAPI = {
  /**
   * 获取待处理汇总统计
   * @returns {Promise<Object>} 汇总数据
   */
  async getSummary() {
    return request({ url: PENDING_ENDPOINTS.SUMMARY })
  },

  /**
   * 获取待处理列表
   * @param {Object} params - 查询参数
   * @param {string} [params.category] - 分类: consumption/customer_service/risk_alert/lottery_alert
   * @param {string} [params.priority] - 优先级: urgent/normal
   * @param {boolean} [params.urgent_only] - 仅紧急事项
   * @param {number} [params.page] - 页码
   * @param {number} [params.page_size] - 每页数量
   * @returns {Promise<Object>} 列表数据
   */
  async getList(params = {}) {
    return request({ url: PENDING_ENDPOINTS.LIST, params })
  },

  /**
   * 获取业务健康度评分（已迁移至 dashboard 模块）
   * @deprecated 请使用 DashboardAPI.getBusinessHealth()
   * @returns {Promise<Object>} 健康度数据
   * @returns {number} data.score - 综合健康度评分（0-100）
   * @returns {string} data.status - 健康状态（healthy/warning/critical）
   * @returns {Object} data.components - 各维度得分明细
   */
  async getHealthScore() {
    // 使用后端实际端点
    return request({ url: `${API_PREFIX}/console/dashboard/business-health` })
  },

  /**
   * 批量操作待处理事项
   * @param {Object} params - 操作参数
   * @param {Array<number>} params.ids - 待处理事项ID列表
   * @param {string} params.action - 操作类型: approve/reject/handle
   * @param {string} [params.reason] - 拒绝原因（仅拒绝时必填）
   * @returns {Promise<Object>} 操作结果
   */
  async batch(params) {
    return request({ url: PENDING_ENDPOINTS.BATCH, method: 'POST', data: params })
  }
}

export default PendingAPI
