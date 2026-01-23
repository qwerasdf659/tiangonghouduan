/**
 * 门店管理 API 模块
 *
 * @module api/store
 * @description 门店、商户积分、消费记录相关的 API 调用
 * @version 1.0.0
 * @date 2026-01-23
 */

import { request, buildURL, buildQueryString } from './base.js'

// ========== 类型定义 ==========

/**
 * 门店状态枚举
 * @typedef {'active'|'inactive'|'closed'} StoreStatus
 */

/**
 * 门店查询参数
 * @typedef {Object} StoreListParams
 * @property {number} [page=1] - 页码
 * @property {number} [page_size=20] - 每页数量
 * @property {string} [keyword] - 搜索关键词（门店名称/地址）
 * @property {StoreStatus} [status] - 状态筛选
 * @property {number} [region_id] - 区域ID筛选
 */

/**
 * 门店信息
 * @typedef {Object} StoreInfo
 * @property {number} store_id - 门店ID
 * @property {string} name - 门店名称
 * @property {string} address - 门店地址
 * @property {string} contact_phone - 联系电话
 * @property {StoreStatus} status - 门店状态
 * @property {number} [region_id] - 所属区域ID
 * @property {string} created_at - 创建时间
 */

/**
 * 门店创建/更新数据
 * @typedef {Object} StoreData
 * @property {string} name - 门店名称
 * @property {string} address - 门店地址
 * @property {string} contact_phone - 联系电话
 * @property {StoreStatus} [status='active'] - 门店状态
 * @property {number} [region_id] - 所属区域ID
 */

/**
 * 商户积分记录
 * @typedef {Object} MerchantPointsRecord
 * @property {number} id - 记录ID
 * @property {number} store_id - 门店ID
 * @property {string} store_name - 门店名称
 * @property {number} points - 积分数量
 * @property {string} status - 状态 ('pending'|'approved'|'rejected')
 * @property {string} [reason] - 审批原因/拒绝原因
 * @property {string} created_at - 创建时间
 */

/**
 * 消费记录
 * @typedef {Object} ConsumptionRecord
 * @property {number} id - 记录ID
 * @property {number} user_id - 用户ID
 * @property {number} store_id - 门店ID
 * @property {number} amount - 消费金额
 * @property {string} status - 状态 ('pending'|'approved'|'rejected')
 * @property {string} created_at - 创建时间
 */

// ========== API 端点 ==========

export const STORE_ENDPOINTS = {
  // 门店管理
  LIST: '/api/v4/console/stores',
  DETAIL: '/api/v4/console/stores/:store_id',
  CREATE: '/api/v4/console/stores',
  UPDATE: '/api/v4/console/stores/:store_id',
  DELETE: '/api/v4/console/stores/:store_id',

  // 商户积分
  MERCHANT_POINTS_LIST: '/api/v4/console/merchant-points',
  MERCHANT_POINTS_DETAIL: '/api/v4/console/merchant-points/:id',
  MERCHANT_POINTS_BATCH: '/api/v4/console/merchant-points/batch',
  MERCHANT_POINTS_APPROVE: '/api/v4/console/merchant-points/:id/approve',
  MERCHANT_POINTS_REJECT: '/api/v4/console/merchant-points/:id/reject',
  MERCHANT_POINTS_STATS: '/api/v4/console/merchant-points/stats/pending',

  // 消费记录
  CONSUMPTION_RECORDS: '/api/v4/console/consumption/records',
  CONSUMPTION_PENDING: '/api/v4/console/consumption/pending',
  CONSUMPTION_APPROVE: '/api/v4/console/consumption/approve/:id',
  CONSUMPTION_REJECT: '/api/v4/console/consumption/reject/:id'
}

// ========== API 调用方法 ==========

export const StoreAPI = {
  // ===== 门店管理 =====

  /**
   * 获取门店列表
   * @async
   * @param {StoreListParams} [params={}] - 查询参数
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @param {string} [params.keyword] - 搜索关键词
   * @param {StoreStatus} [params.status] - 状态筛选
   * @returns {Promise<Object>} 门店列表分页响应
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 获取第一页门店列表
   * const result = await StoreAPI.getList({ page: 1, page_size: 20 })
   *
   * @example
   * // 搜索活跃门店
   * const result = await StoreAPI.getList({
   *   keyword: '北京',
   *   status: 'active'
   * })
   */
  async getList(params = {}) {
    const url = STORE_ENDPOINTS.LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取门店详情
   * @async
   * @param {number} storeId - 门店 ID
   * @returns {Promise<Object>} 门店详细信息
   * @throws {Error} 门店不存在
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 获取门店详情
   * const result = await StoreAPI.getDetail(123)
   * console.log(result.data.name) // 门店名称
   */
  async getDetail(storeId) {
    const url = buildURL(STORE_ENDPOINTS.DETAIL, { store_id: storeId })
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建门店
   * @async
   * @param {StoreData} data - 门店数据
   * @param {string} data.name - 门店名称（必填）
   * @param {string} data.address - 门店地址（必填）
   * @param {string} data.contact_phone - 联系电话（必填）
   * @param {StoreStatus} [data.status='active'] - 门店状态
   * @param {number} [data.region_id] - 所属区域ID
   * @returns {Promise<Object>} 创建结果
   * @throws {Error} 门店名称已存在
   * @throws {Error} 必填字段缺失
   * @throws {Error} 无权限创建门店
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 创建新门店
   * const result = await StoreAPI.create({
   *   name: '北京朝阳店',
   *   address: '北京市朝阳区xxx街道',
   *   contact_phone: '13800138000',
   *   region_id: 1
   * })
   */
  async create(data) {
    return await request({ url: STORE_ENDPOINTS.CREATE, method: 'POST', data })
  },

  /**
   * 更新门店
   * @async
   * @param {number} storeId - 门店 ID
   * @param {Partial<StoreData>} data - 门店更新数据
   * @param {string} [data.name] - 门店名称
   * @param {string} [data.address] - 门店地址
   * @param {string} [data.contact_phone] - 联系电话
   * @param {StoreStatus} [data.status] - 门店状态
   * @returns {Promise<Object>} 更新结果
   * @throws {Error} 门店不存在
   * @throws {Error} 门店名称已被占用
   * @throws {Error} 无权限修改此门店
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 更新门店名称和地址
   * const result = await StoreAPI.update(123, {
   *   name: '北京朝阳旗舰店',
   *   address: '北京市朝阳区新地址'
   * })
   *
   * @example
   * // 停用门店
   * const result = await StoreAPI.update(123, { status: 'inactive' })
   */
  async update(storeId, data) {
    const url = buildURL(STORE_ENDPOINTS.UPDATE, { store_id: storeId })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 删除门店
   * @async
   * @param {number} storeId - 门店 ID
   * @returns {Promise<Object>} 删除结果
   * @throws {Error} 门店不存在
   * @throws {Error} 门店有关联数据无法删除
   * @throws {Error} 无权限删除此门店
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 删除门店
   * const result = await StoreAPI.delete(123)
   */
  async delete(storeId) {
    const url = buildURL(STORE_ENDPOINTS.DELETE, { store_id: storeId })
    return await request({ url, method: 'DELETE' })
  },

  // ===== 商户积分 =====

  /**
   * 获取商户积分列表
   * @async
   * @param {Object} [params={}] - 查询参数
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @param {number} [params.store_id] - 门店ID筛选
   * @param {string} [params.status] - 状态筛选 ('pending'|'approved'|'rejected')
   * @returns {Promise<Object>} 商户积分列表
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 获取待审核的商户积分
   * const result = await StoreAPI.getMerchantPoints({
   *   status: 'pending',
   *   page: 1
   * })
   *
   * @example
   * // 获取指定门店的积分记录
   * const result = await StoreAPI.getMerchantPoints({ store_id: 123 })
   */
  async getMerchantPoints(params = {}) {
    const url = STORE_ENDPOINTS.MERCHANT_POINTS_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取商户积分详情
   * @async
   * @param {number} id - 记录 ID
   * @returns {Promise<Object>} 积分记录详情
   * @throws {Error} 记录不存在
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 获取积分记录详情
   * const result = await StoreAPI.getMerchantPointsDetail(456)
   */
  async getMerchantPointsDetail(id) {
    const url = buildURL(STORE_ENDPOINTS.MERCHANT_POINTS_DETAIL, { id })
    return await request({ url, method: 'GET' })
  },

  /**
   * 批量发放商户积分
   * @async
   * @param {Object} data - 批量数据
   * @param {Array<{store_id: number, points: number}>} data.items - 积分发放列表
   * @param {string} [data.reason] - 发放原因
   * @returns {Promise<Object>} 批量发放结果
   * @throws {Error} 批量数据格式错误
   * @throws {Error} 部分商户不存在
   * @throws {Error} 积分额度不足
   * @throws {Error} 无权限发放积分
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 批量发放积分
   * const result = await StoreAPI.batchMerchantPoints({
   *   items: [
   *     { store_id: 1, points: 100 },
   *     { store_id: 2, points: 200 }
   *   ],
   *   reason: '月度奖励'
   * })
   */
  async batchMerchantPoints(data) {
    return await request({ url: STORE_ENDPOINTS.MERCHANT_POINTS_BATCH, method: 'POST', data })
  },

  /**
   * 审批通过商户积分
   * @async
   * @param {number} id - 记录 ID
   * @param {Object} [data={}] - 审批数据
   * @param {string} [data.remark] - 审批备注
   * @returns {Promise<Object>} 审批结果
   * @throws {Error} 记录不存在
   * @throws {Error} 记录状态不允许审批
   * @throws {Error} 无权限审批
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 审批通过积分申请
   * const result = await StoreAPI.approveMerchantPoints(456, {
   *   remark: '符合发放条件'
   * })
   */
  async approveMerchantPoints(id, data = {}) {
    const url = buildURL(STORE_ENDPOINTS.MERCHANT_POINTS_APPROVE, { id })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 拒绝商户积分
   * @async
   * @param {number} id - 记录 ID
   * @param {Object} data - 拒绝数据
   * @param {string} data.reason - 拒绝原因（必填）
   * @returns {Promise<Object>} 拒绝结果
   * @throws {Error} 记录不存在
   * @throws {Error} 记录状态不允许拒绝
   * @throws {Error} 拒绝原因不能为空
   * @throws {Error} 无权限拒绝
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 拒绝积分申请
   * const result = await StoreAPI.rejectMerchantPoints(456, {
   *   reason: '不符合发放条件'
   * })
   */
  async rejectMerchantPoints(id, data) {
    const url = buildURL(STORE_ENDPOINTS.MERCHANT_POINTS_REJECT, { id })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 获取待处理商户积分统计
   * @async
   * @returns {Promise<Object>} 待处理统计数据
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 获取待处理统计
   * const result = await StoreAPI.getMerchantPointsStats()
   * console.log(result.data.pending_count) // 待审核数量
   */
  async getMerchantPointsStats() {
    return await request({ url: STORE_ENDPOINTS.MERCHANT_POINTS_STATS, method: 'GET' })
  },

  // ===== 消费记录 =====

  /**
   * 获取消费记录列表
   * @async
   * @param {Object} [params={}] - 查询参数
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @param {number} [params.user_id] - 用户ID筛选
   * @param {number} [params.store_id] - 门店ID筛选
   * @param {string} [params.status] - 状态筛选
   * @returns {Promise<Object>} 消费记录列表
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 获取某用户的消费记录
   * const result = await StoreAPI.getConsumptionRecords({
   *   user_id: 1001,
   *   page: 1
   * })
   *
   * @example
   * // 获取某门店的消费记录
   * const result = await StoreAPI.getConsumptionRecords({ store_id: 123 })
   */
  async getConsumptionRecords(params = {}) {
    const url = STORE_ENDPOINTS.CONSUMPTION_RECORDS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取待审核消费记录
   * @async
   * @param {Object} [params={}] - 查询参数
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} 待审核消费记录列表
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 获取待审核消费记录
   * const result = await StoreAPI.getPendingConsumptions({ page: 1 })
   */
  async getPendingConsumptions(params = {}) {
    const url = STORE_ENDPOINTS.CONSUMPTION_PENDING + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 审批通过消费记录
   * @async
   * @param {number} id - 记录 ID
   * @param {Object} [data={}] - 审批数据
   * @param {string} [data.remark] - 审批备注
   * @returns {Promise<Object>} 审批结果
   * @throws {Error} 消费记录不存在
   * @throws {Error} 记录状态不允许审批
   * @throws {Error} 无权限审批
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 审批通过消费记录
   * const result = await StoreAPI.approveConsumption(789, {
   *   remark: '核实通过'
   * })
   */
  async approveConsumption(id, data = {}) {
    const url = buildURL(STORE_ENDPOINTS.CONSUMPTION_APPROVE, { id })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 拒绝消费记录
   * @async
   * @param {number} id - 记录 ID
   * @param {Object} data - 拒绝数据
   * @param {string} data.reason - 拒绝原因（必填）
   * @returns {Promise<Object>} 拒绝结果
   * @throws {Error} 消费记录不存在
   * @throws {Error} 记录状态不允许拒绝
   * @throws {Error} 拒绝原因不能为空
   * @throws {Error} 无权限拒绝
   * @throws {Error} 网络请求失败
   *
   * @example
   * // 拒绝消费记录
   * const result = await StoreAPI.rejectConsumption(789, {
   *   reason: '消费凭证不清晰'
   * })
   */
  async rejectConsumption(id, data) {
    const url = buildURL(STORE_ENDPOINTS.CONSUMPTION_REJECT, { id })
    return await request({ url, method: 'POST', data })
  }
}

export default StoreAPI
