/**
 * 审核链管理 API 模块
 *
 * @module api/approval-chain
 * @description 审核链模板配置、实例查询、审核操作
 * @version 1.0.0
 * @date 2026-03-10
 */

import { API_PREFIX, request, buildURL } from './base.js'

/** 审核链 API 端点 */
export const APPROVAL_CHAIN_ENDPOINTS = {
  /** 模板 CRUD */
  TEMPLATE_LIST: `${API_PREFIX}/console/approval-chain/templates`,
  TEMPLATE_DETAIL: `${API_PREFIX}/console/approval-chain/templates/:id`,
  TEMPLATE_CREATE: `${API_PREFIX}/console/approval-chain/templates`,
  TEMPLATE_UPDATE: `${API_PREFIX}/console/approval-chain/templates/:id`,
  TEMPLATE_TOGGLE: `${API_PREFIX}/console/approval-chain/templates/:id/toggle`,

  /** 实例查询 */
  INSTANCE_LIST: `${API_PREFIX}/console/approval-chain/instances`,
  INSTANCE_BY_AUDITABLE: `${API_PREFIX}/console/approval-chain/instances/by-auditable`,
  INSTANCE_DETAIL: `${API_PREFIX}/console/approval-chain/instances/:id`,

  /** 审核操作 */
  MY_PENDING: `${API_PREFIX}/console/approval-chain/my-pending`,
  STEP_APPROVE: `${API_PREFIX}/console/approval-chain/steps/:id/approve`,
  STEP_REJECT: `${API_PREFIX}/console/approval-chain/steps/:id/reject`
}

export const ApprovalChainAPI = {
  // ========== 模板管理 ==========

  /** 查询模板列表 */
  async getTemplates(params = {}) {
    const query = new URLSearchParams()
    if (params.auditable_type) query.append('auditable_type', params.auditable_type)
    if (params.is_active !== undefined) query.append('is_active', params.is_active)
    if (params.page) query.append('page', params.page)
    if (params.page_size) query.append('page_size', params.page_size)
    const qs = query.toString()
    return request({ url: `${APPROVAL_CHAIN_ENDPOINTS.TEMPLATE_LIST}${qs ? '?' + qs : ''}` })
  },

  /** 查询模板详情 */
  async getTemplateDetail(templateId) {
    return request({ url: buildURL(APPROVAL_CHAIN_ENDPOINTS.TEMPLATE_DETAIL, { id: templateId }) })
  },

  /** 创建模板 */
  async createTemplate(data) {
    return request({ url: APPROVAL_CHAIN_ENDPOINTS.TEMPLATE_CREATE, method: 'POST', data })
  },

  /** 更新模板 */
  async updateTemplate(templateId, data) {
    return request({
      url: buildURL(APPROVAL_CHAIN_ENDPOINTS.TEMPLATE_UPDATE, { id: templateId }),
      method: 'PUT',
      data
    })
  },

  /** 启用/禁用模板 */
  async toggleTemplate(templateId) {
    return request({
      url: buildURL(APPROVAL_CHAIN_ENDPOINTS.TEMPLATE_TOGGLE, { id: templateId }),
      method: 'PUT'
    })
  },

  // ========== 实例查询 ==========

  /** 查询实例列表 */
  async getInstances(params = {}) {
    const query = new URLSearchParams()
    if (params.auditable_type) query.append('auditable_type', params.auditable_type)
    if (params.status) query.append('status', params.status)
    if (params.page) query.append('page', params.page)
    if (params.page_size) query.append('page_size', params.page_size)
    const qs = query.toString()
    return request({ url: `${APPROVAL_CHAIN_ENDPOINTS.INSTANCE_LIST}${qs ? '?' + qs : ''}` })
  },

  /** 查询实例详情 */
  async getInstanceDetail(instanceId) {
    return request({ url: buildURL(APPROVAL_CHAIN_ENDPOINTS.INSTANCE_DETAIL, { id: instanceId }) })
  },

  /** 按业务记录查询审核链实例（用于消费审核列表等页面显示审核链进度） */
  async getInstanceByAuditable(auditableType, auditableId) {
    const query = new URLSearchParams({ auditable_type: auditableType, auditable_id: auditableId })
    return request({ url: `${APPROVAL_CHAIN_ENDPOINTS.INSTANCE_BY_AUDITABLE}?${query}` })
  },

  // ========== 审核操作 ==========

  /** 查询我的待审核步骤 */
  async getMyPending(params = {}) {
    const query = new URLSearchParams()
    if (params.page) query.append('page', params.page)
    if (params.page_size) query.append('page_size', params.page_size)
    const qs = query.toString()
    return request({ url: `${APPROVAL_CHAIN_ENDPOINTS.MY_PENDING}${qs ? '?' + qs : ''}` })
  },

  /** 审核通过 */
  async approveStep(stepId, reason = '') {
    return request({
      url: buildURL(APPROVAL_CHAIN_ENDPOINTS.STEP_APPROVE, { id: stepId }),
      method: 'POST',
      data: { reason }
    })
  },

  /** 审核拒绝 */
  async rejectStep(stepId, reason) {
    return request({
      url: buildURL(APPROVAL_CHAIN_ENDPOINTS.STEP_REJECT, { id: stepId }),
      method: 'POST',
      data: { reason }
    })
  }
}
