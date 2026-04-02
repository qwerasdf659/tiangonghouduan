/**
 * 竞价管理 API 模块
 *
 * @module api/market/bid
 * @description 竞价商品管理、手动结算、取消竞价相关的 API 调用
 * @version 2.0.0
 * @date 2026-03-24
 *
 * 决策 3 Phase B 落地：key 去冗余 BID_ 前缀，域上下文由变量名 BID_ENDPOINTS 承载
 * 后端路由：/api/v4/console/bids
 * 后端权限：role_level >= 100
 */

import { API_PREFIX, request, buildURL, buildQueryString } from '../base.js'

// ========== API 端点 ==========

export const BID_ENDPOINTS = {
  /** 竞价商品列表（后端: GET /api/v4/console/bids） */
  LIST: `${API_PREFIX}/console/bids`,
  /** 创建竞价商品（后端: POST /api/v4/console/bids） */
  CREATE: `${API_PREFIX}/console/bids`,
  /** 竞价商品详情 + 出价记录（后端: GET /api/v4/console/bids/:id） */
  DETAIL: `${API_PREFIX}/console/bids/:id`,
  /** 手动结算竞价（后端: POST /api/v4/console/bids/:id/settle） */
  SETTLE: `${API_PREFIX}/console/bids/:id/settle`,
  /** 取消竞价（后端: POST /api/v4/console/bids/:id/cancel） */
  CANCEL: `${API_PREFIX}/console/bids/:id/cancel`
}

// ========== API 调用方法 ==========

export const BidAPI = {
  /**
   * 获取竞价商品列表
   * @param {Object} [params={}] - 查询参数
   * @param {string} [params.status='all'] - 状态筛选：all/pending/active/ended/settled/no_bid/cancelled/settlement_failed
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} API 响应 { bid_products, pagination }
   */
  async getBidProducts(params = {}) {
    const url = BID_ENDPOINTS.LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建竞价商品
   * @param {Object} data - 竞价数据
   * @param {number} data.exchange_item_id - 关联兑换商品 ID
   * @param {number} data.start_price - 起拍价
   * @param {string} [data.price_asset_code='star_stone'] - 竞价资产类型
   * @param {number} [data.min_bid_increment=10] - 最小加价幅度
   * @param {string} data.start_time - 开始时间（ISO8601）
   * @param {string} data.end_time - 结束时间（ISO8601）
   * @param {string} [data.batch_no] - 批次号
   * @returns {Promise<Object>} API 响应
   */
  async createBidProduct(data) {
    return await request({ url: BID_ENDPOINTS.CREATE, method: 'POST', data })
  },

  /**
   * 获取竞价商品详情（含完整出价记录）
   * @param {number} id - 竞价商品 ID
   * @returns {Promise<Object>} API 响应
   */
  async getBidProductDetail(id) {
    const url = buildURL(BID_ENDPOINTS.DETAIL, { id })
    return await request({ url, method: 'GET' })
  },

  /**
   * 手动结算竞价
   * @param {number} id - 竞价商品 ID
   * @returns {Promise<Object>} API 响应
   */
  async settleBidProduct(id) {
    const url = buildURL(BID_ENDPOINTS.SETTLE, { id })
    return await request({ url, method: 'POST' })
  },

  /**
   * 取消竞价
   * @param {number} id - 竞价商品 ID
   * @param {Object} data - 取消数据
   * @param {string} data.reason - 取消原因（必填）
   * @returns {Promise<Object>} API 响应
   */
  async cancelBidProduct(id, data) {
    const url = buildURL(BID_ENDPOINTS.CANCEL, { id })
    return await request({ url, method: 'POST', data })
  }
}

export default BidAPI
