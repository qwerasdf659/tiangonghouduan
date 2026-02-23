/**
 * 商家管理 API 模块
 *
 * @module api/merchant
 * @description 商家 CRUD、类型选项、下拉选项相关的 API 调用
 * @version 1.0.0
 * @date 2026-02-23
 */

import { API_PREFIX, request, buildURL } from './base.js'

// ========== API 端点 ==========

export const MERCHANT_ENDPOINTS = {
  /** 商家列表（GET，分页/筛选/搜索） */
  LIST: `${API_PREFIX}/console/merchants`,
  /** 商家详情（GET :id） */
  DETAIL: `${API_PREFIX}/console/merchants/:id`,
  /** 创建商家（POST） */
  CREATE: `${API_PREFIX}/console/merchants`,
  /** 更新商家（PUT :id） */
  UPDATE: `${API_PREFIX}/console/merchants/:id`,
  /** 删除商家（DELETE :id） */
  DELETE: `${API_PREFIX}/console/merchants/:id`,
  /** 商家下拉选项（GET，活跃商家列表） */
  OPTIONS: `${API_PREFIX}/console/merchants/options`,
  /** 商家类型选项（GET，字典表驱动） */
  TYPE_OPTIONS: `${API_PREFIX}/console/merchants/type-options`
}

// ========== API 方法 ==========

/**
 * 获取商家列表
 *
 * @param {Object} params - 查询参数
 * @param {number} [params.page=1] - 页码
 * @param {number} [params.page_size=20] - 每页数量
 * @param {string} [params.merchant_type] - 商家类型筛选
 * @param {string} [params.status] - 状态筛选
 * @param {string} [params.keyword] - 名称关键字搜索
 * @returns {Promise<Object>} { list, total, page, page_size }
 */
export async function getMerchantList(params = {}) {
  const query = new URLSearchParams()
  if (params.page) query.set('page', params.page)
  if (params.page_size) query.set('page_size', params.page_size)
  if (params.merchant_type) query.set('merchant_type', params.merchant_type)
  if (params.status) query.set('status', params.status)
  if (params.keyword) query.set('keyword', params.keyword)

  const url = query.toString()
    ? `${MERCHANT_ENDPOINTS.LIST}?${query.toString()}`
    : MERCHANT_ENDPOINTS.LIST
  return request({ url, method: 'GET' })
}

/**
 * 获取商家详情
 * @param {number} merchantId - 商家ID
 * @returns {Promise<Object>} 商家详情
 */
export async function getMerchantDetail(merchantId) {
  return request({
    url: buildURL(MERCHANT_ENDPOINTS.DETAIL, { id: merchantId }),
    method: 'GET'
  })
}

/**
 * 创建商家
 * @param {Object} data - 商家数据
 * @returns {Promise<Object>} 创建结果
 */
export async function createMerchant(data) {
  return request({
    url: MERCHANT_ENDPOINTS.CREATE,
    method: 'POST',
    data
  })
}

/**
 * 更新商家
 * @param {number} merchantId - 商家ID
 * @param {Object} data - 更新数据
 * @returns {Promise<Object>} 更新结果
 */
export async function updateMerchant(merchantId, data) {
  return request({
    url: buildURL(MERCHANT_ENDPOINTS.UPDATE, { id: merchantId }),
    method: 'PUT',
    data
  })
}

/**
 * 删除商家
 * @param {number} merchantId - 商家ID
 * @returns {Promise<Object>} 删除结果
 */
export async function deleteMerchant(merchantId) {
  return request({
    url: buildURL(MERCHANT_ENDPOINTS.DELETE, { id: merchantId }),
    method: 'DELETE'
  })
}

/**
 * 获取商家下拉选项（活跃商家列表，用于其他页面筛选器）
 * @returns {Promise<Array>} [{ merchant_id, merchant_name, merchant_type }]
 */
export async function getMerchantOptions() {
  return request({
    url: MERCHANT_ENDPOINTS.OPTIONS,
    method: 'GET'
  })
}

/**
 * 获取商家类型选项（字典表驱动，用于下拉框）
 * @returns {Promise<Array>} [{ code, name, color }]
 */
export async function getMerchantTypeOptions() {
  return request({
    url: MERCHANT_ENDPOINTS.TYPE_OPTIONS,
    method: 'GET'
  })
}
