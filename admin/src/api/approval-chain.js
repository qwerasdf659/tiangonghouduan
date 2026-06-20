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
  TEMPLATE_CHECK_CONFLICTS: `${API_PREFIX}/console/approval-chain/templates/check-conflicts`,
  TEMPLATE_BATCH_ASSIGN: `${API_PREFIX}/console/approval-chain/templates/batch-assign-reviewer`,

  /** 实例查询 */
  INSTANCE_LIST: `${API_PREFIX}/console/approval-chain/instances`,
  INSTANCE_BY_AUDITABLE: `${API_PREFIX}/console/approval-chain/instances/by-auditable`,
  INSTANCE_DETAIL: `${API_PREFIX}/console/approval-chain/instances/:id`,

  /** 审核操作 */
  MY_PENDING: `${API_PREFIX}/console/approval-chain/my-pending`,
  STEP_APPROVE: `${API_PREFIX}/console/approval-chain/steps/:id/approve`,
  STEP_REJECT: `${API_PREFIX}/console/approval-chain/steps/:id/reject`,
  STEP_BATCH: `${API_PREFIX}/console/approval-chain/steps/batch`,

  /** 数据统计（按门店/区域聚合：待审/已审/通过/拒绝/超时/通过率/金额/积分） */
  STATS: `${API_PREFIX}/console/approval-chain/stats`,

  /** 运营分析（员工录入排行/消费趋势/拒绝原因TOP/用户复购活跃，脱敏） */
  ANALYTICS: `${API_PREFIX}/console/approval-chain/analytics`
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

  /**
   * 保存前冲突预检（只读，不写库）：返回与现有审核链的潜在风险
   * @param {Object} data - { auditable_type, priority, match_conditions, template_id? }
   * @returns {Promise<Object>} { success, data: { has_risk, risks: [{type, level, message}] } }
   */
  async checkTemplateConflicts(data) {
    return request({
      url: APPROVAL_CHAIN_ENDPOINTS.TEMPLATE_CHECK_CONFLICTS,
      method: 'POST',
      data
    })
  },

  /**
   * 批量配置审核人（9.3③）：跨多条链统一指派某节点的审核人
   * @param {Object} data - { template_ids[], target_step, assignee_type, assignee_role_id?, assignee_user_id? }
   * @returns {Promise<Object>} { success, data: { results, stats } }
   */
  async batchAssignReviewer(data) {
    return request({
      url: APPROVAL_CHAIN_ENDPOINTS.TEMPLATE_BATCH_ASSIGN,
      method: 'POST',
      data
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
  },

  /**
   * 批量审核步骤（通过/拒绝，收口到审核链 steps/batch）
   * @param {number[]} stepIds - 待审步骤ID数组
   * @param {string} action - approve | reject
   * @param {string} [reason] - 审核原因（reject 必填且 >=5 字符）
   * @returns {Promise<Object>} { results: [...], stats: {...} }
   */
  async batchSteps(stepIds, action, reason = '') {
    return request({
      url: APPROVAL_CHAIN_ENDPOINTS.STEP_BATCH,
      method: 'POST',
      data: { step_ids: stepIds, action, reason }
    })
  },

  // ========== 数据统计 ==========

  /**
   * 查询审核数据统计（按门店/区域聚合）
   * @param {Object} [params] - 查询参数
   * @param {string} [params.dimension='store'] - 聚合维度：store=按门店，region=按区域
   * @returns {Promise<Object>} { success, data: { dimension, rows: [...], summary: {...} } }
   */
  async getStats(params = {}) {
    const query = new URLSearchParams()
    if (params.dimension) query.append('dimension', params.dimension)
    const qs = query.toString()
    return request({ url: `${APPROVAL_CHAIN_ENDPOINTS.STATS}${qs ? '?' + qs : ''}` })
  },

  /**
   * 查询运营分析（员工录入排行/消费趋势/拒绝原因TOP/用户复购活跃）
   * @param {Object} [params] - { days?, store_id? }
   * @returns {Promise<Object>} { success, data: { staff_ranking, trend, reject_reasons, user_activity } }
   */
  async getAnalytics(params = {}) {
    const query = new URLSearchParams()
    if (params.days) query.append('days', params.days)
    if (params.store_id) query.append('store_id', params.store_id)
    const qs = query.toString()
    return request({ url: `${APPROVAL_CHAIN_ENDPOINTS.ANALYTICS}${qs ? '?' + qs : ''}` })
  }
}
