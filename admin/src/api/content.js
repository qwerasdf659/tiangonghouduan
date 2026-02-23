/**
 * 内容管理 API 模块
 *
 * @module api/content
 * @description 客服会话、反馈管理、内容管理相关的 API 调用
 * @version 1.0.0
 * @date 2026-01-23
 */

import { API_PREFIX, request, buildURL, buildQueryString } from './base.js'

// ========== 类型定义 ==========

/**
 * 会话状态枚举
 * @typedef {'waiting'|'active'|'closed'} SessionStatus
 */

/**
 * 反馈状态枚举（与后端 Feedback 模型一致）
 * @typedef {'pending'|'processing'|'replied'|'closed'} FeedbackStatus
 */

/**
 * 会话查询参数
 * @typedef {Object} SessionListParams
 * @property {number} [page=1] - 页码
 * @property {number} [page_size=20] - 每页数量
 * @property {SessionStatus} [status] - 会话状态筛选
 * @property {number} [admin_id] - 客服ID筛选
 */

/**
 * 会话信息
 * @typedef {Object} SessionInfo
 * @property {string} session_id - 会话ID
 * @property {number} user_id - 用户ID
 * @property {string} user_nickname - 用户昵称
 * @property {number} [admin_id] - 接待客服ID
 * @property {SessionStatus} status - 会话状态
 * @property {number} unread_count - 未读消息数
 * @property {string} last_message - 最后一条消息
 * @property {string} created_at - 创建时间
 */

/**
 * 反馈信息（与后端 Feedback 模型字段一致）
 * @typedef {Object} FeedbackInfo
 * @property {number} feedback_id - 反馈ID（主键）
 * @property {number} user_id - 用户ID
 * @property {string} category - 分类（technical/feature/bug/complaint/suggestion/other）
 * @property {string} content - 反馈内容
 * @property {string} priority - 优先级（high/medium/low）
 * @property {string} [attachments] - 附件列表（JSON）
 * @property {FeedbackStatus} status - 处理状态
 * @property {string} [reply_content] - 管理员回复内容
 * @property {string} [replied_at] - 回复时间
 * @property {string} [internal_notes] - 内部备注（仅管理员可见）
 * @property {string} created_at - 创建时间
 */

// ========== API 端点 ==========

export const CONTENT_ENDPOINTS = {
  // 客服会话
  CUSTOMER_SERVICE_SESSIONS: `${API_PREFIX}/console/customer-service/sessions`,
  CUSTOMER_SERVICE_SESSION_MESSAGES: `${API_PREFIX}/console/customer-service/sessions/:session_id/messages`,
  CUSTOMER_SERVICE_SEND_MESSAGE: `${API_PREFIX}/console/customer-service/sessions/:session_id/send`,
  CUSTOMER_SERVICE_MARK_READ: `${API_PREFIX}/console/customer-service/sessions/:session_id/mark-read`,
  CUSTOMER_SERVICE_TRANSFER: `${API_PREFIX}/console/customer-service/sessions/:session_id/transfer`,
  CUSTOMER_SERVICE_CLOSE: `${API_PREFIX}/console/customer-service/sessions/:session_id/close`,
  // P1-22: 客服响应时长统计
  CUSTOMER_SERVICE_STATS: `${API_PREFIX}/console/customer-service/sessions/stats`,
  CUSTOMER_SERVICE_RESPONSE_STATS: `${API_PREFIX}/console/customer-service/sessions/response-stats`,
  // 客服座席管理
  CS_AGENT_LIST: `${API_PREFIX}/console/customer-service/agents`,
  CS_AGENT_DETAIL: `${API_PREFIX}/console/customer-service/agents/:id`,
  CS_AGENT_WORKLOAD: `${API_PREFIX}/console/customer-service/agents/workload`,
  CS_AGENT_LOOKUP_USER: `${API_PREFIX}/console/customer-service/agents/lookup-user`,
  // 客服用户分配管理
  CS_ASSIGNMENT_LIST: `${API_PREFIX}/console/customer-service/assignments`,
  CS_ASSIGNMENT_BATCH: `${API_PREFIX}/console/customer-service/assignments/batch`,
  CS_ASSIGNMENT_DELETE: `${API_PREFIX}/console/customer-service/assignments/:id`,

  // 客服工作台 - 用户上下文查询（C区面板数据源）
  CS_USER_CONTEXT_SUMMARY: `${API_PREFIX}/console/customer-service/user-context/:userId/summary`,
  CS_USER_CONTEXT_ASSETS: `${API_PREFIX}/console/customer-service/user-context/:userId/assets`,
  CS_USER_CONTEXT_BACKPACK: `${API_PREFIX}/console/customer-service/user-context/:userId/backpack`,
  CS_USER_CONTEXT_LOTTERY: `${API_PREFIX}/console/customer-service/user-context/:userId/lottery`,
  CS_USER_CONTEXT_TRADES: `${API_PREFIX}/console/customer-service/user-context/:userId/trades`,
  CS_USER_CONTEXT_TIMELINE: `${API_PREFIX}/console/customer-service/user-context/:userId/timeline`,
  CS_USER_CONTEXT_RISK: `${API_PREFIX}/console/customer-service/user-context/:userId/risk`,
  CS_USER_CONTEXT_HISTORY: `${API_PREFIX}/console/customer-service/user-context/:userId/history`,
  CS_USER_CONTEXT_DIAGNOSE: `${API_PREFIX}/console/customer-service/user-context/:userId/diagnose`,
  CS_USER_CONTEXT_NOTES: `${API_PREFIX}/console/customer-service/user-context/:userId/notes`,
  // 客服工作台 - 工单管理
  CS_ISSUE_LIST: `${API_PREFIX}/console/customer-service/issues`,
  CS_ISSUE_DETAIL: `${API_PREFIX}/console/customer-service/issues/:id`,
  CS_ISSUE_NOTES: `${API_PREFIX}/console/customer-service/issues/:id/notes`,
  // 客服工作台 - GM工具
  CS_GM_COMPENSATE: `${API_PREFIX}/console/customer-service/gm-tools/compensate`,
  CS_GM_TEMPLATES: `${API_PREFIX}/console/customer-service/gm-tools/templates`,

  // 反馈管理
  FEEDBACK_LIST: `${API_PREFIX}/console/system/feedbacks`,
  FEEDBACK_STATS: `${API_PREFIX}/console/system/feedbacks/stats`,
  FEEDBACK_DETAIL: `${API_PREFIX}/console/system/feedbacks/:id`,
  FEEDBACK_REPLY: `${API_PREFIX}/console/system/feedbacks/:id/reply`,
  FEEDBACK_STATUS: `${API_PREFIX}/console/system/feedbacks/:id/status`,
  FEEDBACK_BATCH_STATUS: `${API_PREFIX}/console/system/feedbacks/batch-status`,

  // 活动管理
  ACTIVITY_LIST: `${API_PREFIX}/activities`,
  ACTIVITY_DETAIL: `${API_PREFIX}/activities/:id`
}

// ========== API 调用方法 ==========

export const ContentAPI = {
  // ===== 客服会话 =====

  /**
   * 获取客服会话列表
   * @async
   * @param {SessionListParams} [params={}] - 查询参数
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @param {SessionStatus} [params.status] - 会话状态筛选
   * @param {number} [params.admin_id] - 客服ID筛选
   * @returns {Promise<Object>} 会话列表
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 获取待处理的会话
   * const result = await ContentAPI.getSessions({
   *   status: 'waiting',
   *   page: 1
   * })
   *
   * @example
   * // 获取指定客服的活跃会话
   * const result = await ContentAPI.getSessions({
   *   admin_id: 5,
   *   status: 'active'
   * })
   */
  async getSessions(params = {}) {
    const url = CONTENT_ENDPOINTS.CUSTOMER_SERVICE_SESSIONS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取会话消息
   * @async
   * @param {string} sessionId - 会话 ID
   * @param {Object} [params={}] - 查询参数
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=50] - 每页数量
   * @returns {Promise<Object>} 消息列表
   * @throws {Error} 会话不存在
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 获取会话的历史消息
   * const result = await ContentAPI.getSessionMessages('sess_12345', {
   *   page: 1,
   *   page_size: 50
   * })
   */
  async getSessionMessages(sessionId, params = {}) {
    const url =
      buildURL(CONTENT_ENDPOINTS.CUSTOMER_SERVICE_SESSION_MESSAGES, { session_id: sessionId }) +
      buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 发送消息
   * @async
   * @param {string} sessionId - 会话 ID
   * @param {Object} data - 消息数据
   * @param {string} data.content - 消息内容
   * @param {string} [data.type='text'] - 消息类型 ('text'|'image')
   * @returns {Promise<Object>} 发送结果
   * @throws {Error} 会话不存在或已关闭
   * @throws {Error} 消息内容不能为空
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 发送文本消息
   * const result = await ContentAPI.sendMessage('sess_12345', {
   *   content: '您好，请问有什么可以帮助您？',
   *   type: 'text'
   * })
   */
  async sendMessage(sessionId, data) {
    const url = buildURL(CONTENT_ENDPOINTS.CUSTOMER_SERVICE_SEND_MESSAGE, { session_id: sessionId })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 标记会话已读
   * @async
   * @param {string} sessionId - 会话 ID
   * @returns {Promise<Object>} 操作结果
   * @throws {Error} 会话不存在
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 标记会话为已读
   * const result = await ContentAPI.markSessionRead('sess_12345')
   */
  async markSessionRead(sessionId) {
    const url = buildURL(CONTENT_ENDPOINTS.CUSTOMER_SERVICE_MARK_READ, { session_id: sessionId })
    return await request({ url, method: 'POST' })
  },

  /**
   * 转移会话
   * @async
   * @param {string} sessionId - 会话 ID
   * @param {Object} data - 转移数据
   * @param {number} data.target_admin_id - 目标客服ID
   * @param {string} [data.reason] - 转移原因
   * @returns {Promise<Object>} 转移结果
   * @throws {Error} 会话不存在或已关闭
   * @throws {Error} 目标客服不存在
   * @throws {Error} 无权限转移会话
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 转移会话给其他客服
   * const result = await ContentAPI.transferSession('sess_12345', {
   *   target_admin_id: 10,
   *   reason: '专业问题转接'
   * })
   */
  async transferSession(sessionId, data) {
    const url = buildURL(CONTENT_ENDPOINTS.CUSTOMER_SERVICE_TRANSFER, { session_id: sessionId })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 关闭会话
   * @async
   * @param {string} sessionId - 会话 ID
   * @param {Object} [data={}] - 关闭数据
   * @param {string} [data.reason] - 关闭原因
   * @returns {Promise<Object>} 关闭结果
   * @throws {Error} 会话不存在或已关闭
   * @throws {Error} 无权限关闭会话
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 关闭会话
   * const result = await ContentAPI.closeSession('sess_12345', {
   *   reason: '问题已解决'
   * })
   */
  async closeSession(sessionId, data = {}) {
    const url = buildURL(CONTENT_ENDPOINTS.CUSTOMER_SERVICE_CLOSE, { session_id: sessionId })
    return await request({ url, method: 'POST', data })
  },

  // ===== 客服会话统计 =====

  /**
   * 获取会话统计概览（各状态数量、今日会话数等）
   * @async
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 统计数据
   */
  async getSessionStats(params = {}) {
    const url = CONTENT_ENDPOINTS.CUSTOMER_SERVICE_STATS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取客服响应时长统计（平均/最大/最小响应时长、SLA达标率）
   * @async
   * @param {Object} [params={}] - 查询参数
   * @param {string} [params.start_date] - 起始日期
   * @param {string} [params.end_date] - 截止日期
   * @param {number} [params.admin_id] - 指定客服ID
   * @returns {Promise<Object>} 响应时长统计
   */
  async getResponseStats(params = {}) {
    const url = CONTENT_ENDPOINTS.CUSTOMER_SERVICE_RESPONSE_STATS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  // ===== 客服座席管理 =====

  /**
   * 获取客服座席列表
   * @async
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 座席列表
   */
  async getAgents(params = {}) {
    const url = CONTENT_ENDPOINTS.CS_AGENT_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取客服座席详情
   * @async
   * @param {number} id - 座席ID
   * @returns {Promise<Object>} 座席详情
   */
  async getAgentDetail(id) {
    const url = buildURL(CONTENT_ENDPOINTS.CS_AGENT_DETAIL, { id })
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取客服工作负载概览
   * @async
   * @returns {Promise<Object>} 各客服当前活跃会话数、今日处理量
   */
  async getAgentWorkload() {
    return await request({ url: CONTENT_ENDPOINTS.CS_AGENT_WORKLOAD, method: 'GET' })
  },

  /**
   * 根据手机号查找用户（用于客服座席注册时匹配系统用户）
   * @async
   * @param {Object} params - 查询参数
   * @param {string} params.mobile - 手机号
   * @returns {Promise<Object>} 用户信息
   */
  async lookupUser(params = {}) {
    const url = CONTENT_ENDPOINTS.CS_AGENT_LOOKUP_USER + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 注册客服座席
   * @async
   * @param {Object} data - 座席数据
   * @param {number} data.user_id - 系统用户ID
   * @param {number} [data.max_concurrent_sessions=5] - 最大并发会话数
   * @returns {Promise<Object>} 注册结果
   */
  async createAgent(data) {
    return await request({ url: CONTENT_ENDPOINTS.CS_AGENT_LIST, method: 'POST', data })
  },

  /**
   * 更新客服座席配置
   * @async
   * @param {number} id - 座席ID
   * @param {Object} data - 更新数据
   * @param {number} [data.max_concurrent_sessions] - 最大并发会话数
   * @param {boolean} [data.is_active] - 是否启用
   * @returns {Promise<Object>} 更新结果
   */
  async updateAgent(id, data) {
    const url = buildURL(CONTENT_ENDPOINTS.CS_AGENT_DETAIL, { id })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 删除客服座席
   * @async
   * @param {number} id - 座席ID
   * @returns {Promise<Object>} 删除结果
   */
  async deleteAgent(id) {
    const url = buildURL(CONTENT_ENDPOINTS.CS_AGENT_DETAIL, { id })
    return await request({ url, method: 'DELETE' })
  },

  // ===== 客服用户分配管理 =====

  /**
   * 获取用户分配列表
   * @async
   * @param {Object} [params={}] - 查询参数
   * @param {number} [params.agent_id] - 按座席筛选
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} 分配列表
   */
  async getAssignments(params = {}) {
    const url = CONTENT_ENDPOINTS.CS_ASSIGNMENT_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 分配用户给客服座席
   * @async
   * @param {Object} data - 分配数据
   * @param {number} data.user_id - 用户ID
   * @param {number} data.agent_id - 座席ID
   * @returns {Promise<Object>} 分配结果
   */
  async createAssignment(data) {
    return await request({ url: CONTENT_ENDPOINTS.CS_ASSIGNMENT_LIST, method: 'POST', data })
  },

  /**
   * 批量分配用户
   * @async
   * @param {Object} data - 批量分配数据
   * @param {Array<Object>} data.assignments - 分配列表 [{user_id, agent_id}]
   * @returns {Promise<Object>} 批量分配结果
   */
  async batchAssign(data) {
    return await request({ url: CONTENT_ENDPOINTS.CS_ASSIGNMENT_BATCH, method: 'POST', data })
  },

  /**
   * 解除用户分配
   * @async
   * @param {number} id - 分配记录ID
   * @returns {Promise<Object>} 解除结果
   */
  async deleteAssignment(id) {
    const url = buildURL(CONTENT_ENDPOINTS.CS_ASSIGNMENT_DELETE, { id })
    return await request({ url, method: 'DELETE' })
  },

  // ===== 客服工作台 - 用户上下文面板（C区） =====

  /**
   * 获取用户画像聚合摘要
   * @async
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>} 用户基础信息 + 统计摘要
   */
  async getUserContextSummary(userId) {
    const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_SUMMARY, { userId })
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取用户资产余额和最近变动
   * @async
   * @param {number} userId - 用户ID
   * @param {Object} [params={}] - 分页参数
   * @returns {Promise<Object>} 资产余额列表 + 最近交易记录
   */
  async getUserContextAssets(userId, params = {}) {
    const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_ASSETS, { userId }) + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取用户背包物品列表
   * @async
   * @param {number} userId - 用户ID
   * @param {Object} [params={}] - 筛选+分页参数
   * @param {string} [params.status] - 状态筛选（available/locked）
   * @returns {Promise<Object>} 物品列表
   */
  async getUserContextBackpack(userId, params = {}) {
    const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_BACKPACK, { userId }) + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取用户抽奖记录和统计
   * @async
   * @param {number} userId - 用户ID
   * @param {Object} [params={}] - 分页参数
   * @returns {Promise<Object>} 抽奖记录 + 中奖统计
   */
  async getUserContextLottery(userId, params = {}) {
    const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_LOTTERY, { userId }) + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取用户交易订单和市场挂单
   * @async
   * @param {number} userId - 用户ID
   * @param {Object} [params={}] - 分页参数
   * @returns {Promise<Object>} 交易订单 + 市场挂单
   */
  async getUserContextTrades(userId, params = {}) {
    const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_TRADES, { userId }) + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取用户混合业务时间线
   * @async
   * @param {number} userId - 用户ID
   * @param {Object} [params={}] - 分页参数
   * @returns {Promise<Object>} 多维度操作时间线
   */
  async getUserContextTimeline(userId, params = {}) {
    const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_TIMELINE, { userId }) + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取用户风控信息
   * @async
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>} 风控等级 + 告警记录
   */
  async getUserContextRisk(userId) {
    const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_RISK, { userId })
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取用户历史会话列表
   * @async
   * @param {number} userId - 用户ID
   * @param {Object} [params={}] - 分页参数
   * @returns {Promise<Object>} 历史会话列表
   */
  async getUserContextHistory(userId, params = {}) {
    const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_HISTORY, { userId }) + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取用户内部备注列表
   * @async
   * @param {number} userId - 用户ID
   * @param {Object} [params={}] - 分页参数
   * @returns {Promise<Object>} 备注列表
   */
  async getUserContextNotes(userId, params = {}) {
    const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_NOTES, { userId }) + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 添加用户内部备注
   * @async
   * @param {number} userId - 用户ID
   * @param {Object} data - 备注数据
   * @param {string} data.content - 备注内容
   * @returns {Promise<Object>} 添加结果
   */
  async addUserContextNote(userId, data) {
    const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_NOTES, { userId })
    return await request({ url, method: 'POST', data })
  },

  // ===== 反馈管理 =====

  /**
   * 获取反馈列表
   * @async
   * @param {Object} [params={}] - 查询参数
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @param {FeedbackStatus} [params.status] - 状态筛选
   * @param {string} [params.keyword] - 搜索关键词
   * @returns {Promise<Object>} 反馈列表
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 获取待处理的反馈
   * const result = await ContentAPI.getFeedbacks({
   *   status: 'pending',
   *   page: 1
   * })
   *
   * @example
   * // 搜索反馈
   * const result = await ContentAPI.getFeedbacks({ keyword: '退款' })
   */
  async getFeedbacks(params = {}) {
    const url = CONTENT_ENDPOINTS.FEEDBACK_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取反馈详情
   * @async
   * @param {number} id - 反馈 ID
   * @returns {Promise<Object>} 反馈详细信息
   * @throws {Error} 反馈不存在
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 获取反馈详情
   * const result = await ContentAPI.getFeedbackDetail(123)
   * logger.debug(result.data.content) // 反馈内容
   */
  async getFeedbackDetail(id) {
    const url = buildURL(CONTENT_ENDPOINTS.FEEDBACK_DETAIL, { id })
    return await request({ url, method: 'GET' })
  },

  /**
   * 回复反馈
   * @async
   * @param {number} id - 反馈 ID
   * @param {Object} data - 回复数据
   * @param {string} data.reply_content - 回复内容（必填，后端字段名 reply_content）
   * @param {string} [data.internal_notes] - 内部备注（仅管理员可见，可选）
   * @returns {Promise<Object>} 回复结果
   * @throws {Error} 反馈不存在
   * @throws {Error} 回复内容不能为空
   * @throws {Error} 无权限回复此反馈
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 回复用户反馈
   * const result = await ContentAPI.replyFeedback(123, {
   *   reply_content: '感谢您的反馈，我们会尽快处理。',
   *   internal_notes: '已通知开发团队'
   * })
   */
  async replyFeedback(id, data) {
    const url = buildURL(CONTENT_ENDPOINTS.FEEDBACK_REPLY, { id })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 更新反馈状态
   * @async
   * @param {number} id - 反馈 ID
   * @param {Object} data - 状态数据
   * @param {string} data.status - 新状态（pending/processing/replied/closed）
   * @param {string} [data.internal_notes] - 内部备注（仅管理员可见，可选）
   * @returns {Promise<Object>} 更新结果
   * @throws {Error} 反馈不存在
   * @throws {Error} 状态值无效
   * @throws {Error} 无权限修改此反馈
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 将反馈标记为已关闭
   * const result = await ContentAPI.updateFeedbackStatus(123, {
   *   status: 'closed',
   *   internal_notes: '已联系用户解决'
   * })
   */
  async updateFeedbackStatus(id, data) {
    const url = buildURL(CONTENT_ENDPOINTS.FEEDBACK_STATUS, { id })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 批量更新反馈状态
   * @async
   * @param {Object} data - 批量更新数据
   * @param {Array<number>} data.feedback_ids - 反馈ID数组（必填，最多100条）
   * @param {string} data.status - 目标状态（pending/processing/replied/closed）
   * @param {string} [data.internal_notes] - 内部备注（仅管理员可见，可选）
   * @returns {Promise<Object>} 批量更新结果 { updated_count, requested_count, target_status }
   * @throws {Error} 参数校验失败
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 批量关闭已处理的反馈
   * const result = await ContentAPI.batchUpdateFeedbackStatus({
   *   feedback_ids: [1, 2, 3],
   *   status: 'closed',
   *   internal_notes: '批量关闭'
   * })
   */
  async batchUpdateFeedbackStatus(data) {
    return await request({
      url: CONTENT_ENDPOINTS.FEEDBACK_BATCH_STATUS,
      method: 'PUT',
      data
    })
  },

  /**
   * 获取反馈统计（各状态数量、趋势）
   * @async
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 反馈统计数据
   */
  async getFeedbackStats(params = {}) {
    const url = CONTENT_ENDPOINTS.FEEDBACK_STATS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  // ===== 客服工作台 - GM工具 =====

  /**
   * 发放用户补偿（资产+物品，事务内执行）
   * @async
   * @param {Object} data - 补偿数据
   * @param {number} data.user_id - 目标用户ID
   * @param {string} data.reason - 补偿原因
   * @param {Array} data.items - 补偿项目列表 [{type:'asset',asset_code:'DIAMOND',amount:100}]
   * @param {number} [data.session_id] - 关联会话ID
   * @param {number} [data.issue_id] - 关联工单ID
   * @returns {Promise<Object>} 补偿结果
   */
  async compensateUser(data) {
    return await request({ url: CONTENT_ENDPOINTS.CS_GM_COMPENSATE, method: 'POST', data })
  },

  /**
   * 获取消息模板库
   * @async
   * @returns {Promise<Object>} 模板分类列表
   */
  async getMessageTemplates() {
    return await request({ url: CONTENT_ENDPOINTS.CS_GM_TEMPLATES, method: 'GET' })
  },

  /**
   * 更新消息模板库
   * @async
   * @param {Object} data - 模板数据
   * @returns {Promise<Object>} 更新结果
   */
  async updateMessageTemplates(data) {
    return await request({ url: CONTENT_ENDPOINTS.CS_GM_TEMPLATES, method: 'PUT', data })
  },

  /**
   * 对指定用户执行一键诊断
   * @async
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>} 诊断结果（含各模块检查状态）
   */
  async diagnoseUser(userId) {
    const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_DIAGNOSE, { userId })
    return await request({ url, method: 'GET' })
  },

  // ===== 客服工作台 - 工单管理 =====

  /**
   * 获取工单列表（支持筛选/分页）
   * @async
   * @param {Object} [params={}] - 查询参数
   * @param {string} [params.status] - 工单状态筛选
   * @param {number} [params.user_id] - 用户ID筛选
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} 工单列表
   */
  async getIssues(params = {}) {
    const url = CONTENT_ENDPOINTS.CS_ISSUE_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建工单（从会话创建）
   * @async
   * @param {Object} data - 工单数据
   * @param {number} data.user_id - 关联用户ID
   * @param {string} data.title - 问题标题
   * @param {string} data.issue_type - 问题类型
   * @param {string} [data.priority='medium'] - 优先级
   * @param {string} [data.description] - 问题描述
   * @param {number} [data.session_id] - 关联会话ID
   * @returns {Promise<Object>} 创建结果
   */
  async createIssue(data) {
    return await request({ url: CONTENT_ENDPOINTS.CS_ISSUE_LIST, method: 'POST', data })
  },

  /**
   * 获取工单详情
   * @async
   * @param {number} issueId - 工单ID
   * @returns {Promise<Object>} 工单详情（含关联会话和用户信息）
   */
  async getIssueDetail(issueId) {
    const url = buildURL(CONTENT_ENDPOINTS.CS_ISSUE_DETAIL, { id: issueId })
    return await request({ url, method: 'GET' })
  },

  /**
   * 更新工单（状态/指派/处理结果）
   * @async
   * @param {number} issueId - 工单ID
   * @param {Object} data - 更新数据
   * @param {string} [data.status] - 新状态
   * @param {number} [data.assigned_to] - 指派给
   * @param {string} [data.resolution] - 处理结果
   * @returns {Promise<Object>} 更新结果
   */
  async updateIssue(issueId, data) {
    const url = buildURL(CONTENT_ENDPOINTS.CS_ISSUE_DETAIL, { id: issueId })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 获取工单备注列表
   * @async
   * @param {number} issueId - 工单ID
   * @param {Object} [params={}] - 分页参数
   * @returns {Promise<Object>} 备注列表
   */
  async getIssueNotes(issueId, params = {}) {
    const url = buildURL(CONTENT_ENDPOINTS.CS_ISSUE_NOTES, { id: issueId }) + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 添加工单备注（仅客服可见）
   * @async
   * @param {number} issueId - 工单ID
   * @param {Object} data - 备注数据
   * @param {string} data.content - 备注内容
   * @returns {Promise<Object>} 添加结果
   */
  async addIssueNote(issueId, data) {
    const url = buildURL(CONTENT_ENDPOINTS.CS_ISSUE_NOTES, { id: issueId })
    return await request({ url, method: 'POST', data })
  },

  // ===== 活动管理 =====

  /**
   * 获取活动列表
   * @async
   * @param {Object} [params={}] - 查询参数
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @param {string} [params.status] - 状态筛选 ('active'|'ended'|'draft')
   * @returns {Promise<Object>} 活动列表
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 获取进行中的活动
   * const result = await ContentAPI.getActivities({
   *   status: 'active',
   *   page: 1
   * })
   */
  async getActivities(params = {}) {
    const url = CONTENT_ENDPOINTS.ACTIVITY_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取活动详情
   * @async
   * @param {string} id - 活动 ID
   * @returns {Promise<Object>} 活动详细信息
   * @throws {Error} 活动不存在
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 获取活动详情
   * const result = await ContentAPI.getActivityDetail('act_12345')
   * logger.debug(result.data.name) // 活动名称
   */
  async getActivityDetail(id) {
    const url = buildURL(CONTENT_ENDPOINTS.ACTIVITY_DETAIL, { id })
    return await request({ url, method: 'GET' })
  }
}

export default ContentAPI
