/**
 * 自定义报表 API
 * @description 报表模板CRUD和预览
 * @version 1.0.0
 * @date 2026-02-01
 */

import { API_PREFIX, authHeaders, handleResponse, buildURL } from './base.js'

// 报表模板端点
export const REPORT_TEMPLATES_ENDPOINTS = {
  LIST: `${API_PREFIX}/console/report-templates`,
  DETAIL: id => `${API_PREFIX}/console/report-templates/${id}`,
  PREVIEW: `${API_PREFIX}/console/report-templates/preview`,
  EXPORT: id => `${API_PREFIX}/console/report-templates/${id}/export`,
  SCHEDULE: id => `${API_PREFIX}/console/report-templates/${id}/schedule`
}

/**
 * 报表模板 API
 */
export const ReportTemplatesAPI = {
  /**
   * 获取模板列表
   * @param {Object} params - 查询参数
   * @returns {Promise<Object>} 模板列表
   */
  async getTemplates(params = {}) {
    const url = buildURL(REPORT_TEMPLATES_ENDPOINTS.LIST, params)
    const response = await fetch(url, {
      headers: authHeaders()
    })
    return handleResponse(response)
  },

  /**
   * 获取模板详情
   * @param {number} templateId - 模板ID
   * @returns {Promise<Object>} 模板详情
   */
  async getTemplate(templateId) {
    const response = await fetch(REPORT_TEMPLATES_ENDPOINTS.DETAIL(templateId), {
      headers: authHeaders()
    })
    return handleResponse(response)
  },

  /**
   * 创建模板
   * @param {Object} data - 模板数据
   * @param {string} data.template_name - 模板名称
   * @param {Object} data.metrics_config - 指标配置
   * @param {Object} data.dimension_config - 维度配置
   * @param {string} data.time_range_type - 时间范围类型
   * @param {string} data.compare_type - 对比类型
   * @param {Object} data.schedule_config - 定时配置
   * @returns {Promise<Object>} 创建结果
   */
  async createTemplate(data) {
    const response = await fetch(REPORT_TEMPLATES_ENDPOINTS.LIST, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    return handleResponse(response)
  },

  /**
   * 更新模板
   * @param {number} templateId - 模板ID
   * @param {Object} data - 模板数据
   * @returns {Promise<Object>} 更新结果
   */
  async updateTemplate(templateId, data) {
    const response = await fetch(REPORT_TEMPLATES_ENDPOINTS.DETAIL(templateId), {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    return handleResponse(response)
  },

  /**
   * 删除模板
   * @param {number} templateId - 模板ID
   * @returns {Promise<Object>} 删除结果
   */
  async deleteTemplate(templateId) {
    const response = await fetch(REPORT_TEMPLATES_ENDPOINTS.DETAIL(templateId), {
      method: 'DELETE',
      headers: authHeaders()
    })
    return handleResponse(response)
  },

  /**
   * 预览报表
   * @param {Object} config - 报表配置
   * @returns {Promise<Object>} 预览数据
   */
  async previewReport(config) {
    const response = await fetch(REPORT_TEMPLATES_ENDPOINTS.PREVIEW, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    })
    return handleResponse(response)
  },

  /**
   * 导出报表
   * @param {number} templateId - 模板ID
   * @param {Object} params - 导出参数
   * @param {string} params.format - 导出格式：xlsx/csv
   * @returns {Promise<Blob>} 文件数据
   */
  async exportReport(templateId, params = {}) {
    const url = buildURL(REPORT_TEMPLATES_ENDPOINTS.EXPORT(templateId), params)
    const response = await fetch(url, {
      headers: authHeaders()
    })
    if (!response.ok) {
      throw new Error('导出失败')
    }
    return response.blob()
  },

  /**
   * 配置定时推送
   * @param {number} templateId - 模板ID
   * @param {Object} scheduleConfig - 定时配置
   * @returns {Promise<Object>} 配置结果
   */
  async setSchedule(templateId, scheduleConfig) {
    const response = await fetch(REPORT_TEMPLATES_ENDPOINTS.SCHEDULE(templateId), {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(scheduleConfig)
    })
    return handleResponse(response)
  }
}
