/**
 * 内容管理 API 模块
 *
 * @module api/content
 * @description 客服会话、反馈管理、内容管理相关的 API 调用
 * @version 1.0.0
 * @date 2026-01-23
 */

import { request, buildURL, buildQueryString } from './base.js'

// ========== 类型定义 ==========

/**
 * 会话状态枚举
 * @typedef {'waiting'|'active'|'closed'} SessionStatus
 */

/**
 * 反馈状态枚举
 * @typedef {'pending'|'processing'|'resolved'|'closed'} FeedbackStatus
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
 * 反馈信息
 * @typedef {Object} FeedbackInfo
 * @property {number} id - 反馈ID
 * @property {number} user_id - 用户ID
 * @property {string} content - 反馈内容
 * @property {string} [images] - 图片URL列表
 * @property {FeedbackStatus} status - 处理状态
 * @property {string} [reply] - 回复内容
 * @property {string} created_at - 创建时间
 */

// ========== API 端点 ==========

export const CONTENT_ENDPOINTS = {
  // 客服会话
  CUSTOMER_SERVICE_SESSIONS: '/api/v4/console/customer-service/sessions',
  CUSTOMER_SERVICE_SESSION_MESSAGES:
    '/api/v4/console/customer-service/sessions/:session_id/messages',
  CUSTOMER_SERVICE_SEND_MESSAGE: '/api/v4/console/customer-service/sessions/:session_id/send',
  CUSTOMER_SERVICE_MARK_READ: '/api/v4/console/customer-service/sessions/:session_id/mark-read',
  CUSTOMER_SERVICE_TRANSFER: '/api/v4/console/customer-service/sessions/:session_id/transfer',
  CUSTOMER_SERVICE_CLOSE: '/api/v4/console/customer-service/sessions/:session_id/close',

  // 反馈管理
  FEEDBACK_LIST: '/api/v4/console/system/feedbacks',
  FEEDBACK_DETAIL: '/api/v4/console/system/feedbacks/:id',
  FEEDBACK_REPLY: '/api/v4/console/system/feedbacks/:id/reply',
  FEEDBACK_STATUS: '/api/v4/console/system/feedbacks/:id/status',

  // 活动管理
  ACTIVITIES_LIST: '/api/v4/activities',
  ACTIVITIES_DETAIL: '/api/v4/activities/:id'
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
   * console.log(result.data.content) // 反馈内容
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
   * @param {string} data.content - 回复内容（必填）
   * @returns {Promise<Object>} 回复结果
   * @throws {Error} 反馈不存在
   * @throws {Error} 回复内容不能为空
   * @throws {Error} 无权限回复此反馈
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 回复用户反馈
   * const result = await ContentAPI.replyFeedback(123, {
   *   content: '感谢您的反馈，我们会尽快处理。'
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
   * @param {FeedbackStatus} data.status - 新状态
   * @param {string} [data.remark] - 状态变更备注
   * @returns {Promise<Object>} 更新结果
   * @throws {Error} 反馈不存在
   * @throws {Error} 状态值无效
   * @throws {Error} 无权限修改此反馈
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 将反馈标记为已解决
   * const result = await ContentAPI.updateFeedbackStatus(123, {
   *   status: 'resolved',
   *   remark: '已联系用户解决'
   * })
   */
  async updateFeedbackStatus(id, data) {
    const url = buildURL(CONTENT_ENDPOINTS.FEEDBACK_STATUS, { id })
    return await request({ url, method: 'PUT', data })
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
    const url = CONTENT_ENDPOINTS.ACTIVITIES_LIST + buildQueryString(params)
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
   * console.log(result.data.name) // 活动名称
   */
  async getActivityDetail(id) {
    const url = buildURL(CONTENT_ENDPOINTS.ACTIVITIES_DETAIL, { id })
    return await request({ url, method: 'GET' })
  }
}

export default ContentAPI
