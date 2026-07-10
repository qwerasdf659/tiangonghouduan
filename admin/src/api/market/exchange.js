/**
 * B2C 兑换市场 API 模块
 *
 * @module api/market/exchange
 * @description 兑换市场商品管理、兑换订单管理相关的 API 调用
 * @version 3.0.0
 * @date 2026-03-24
 *
 * 决策 3 落地：域直接导入 + key 去冗余前缀（§14.3）
 * 域上下文由变量名 EXCHANGE_ENDPOINTS 承载，key 不再重复 EXCHANGE_ 前缀
 */

import { API_PREFIX, request, buildURL, buildQueryString } from '../base.js'

// ========== API 端点（仅包含后端实际存在的路由） ==========

export const EXCHANGE_ENDPOINTS = {
  /** 兑换商品 SPU/SKU 列表与 CRUD（后端: routes/v4/console/exchange/items.js） */
  ITEMS: `${API_PREFIX}/console/exchange/items`,

  // 兑换订单（后端: routes/v4/console/exchange/orders.js）
  ORDERS: `${API_PREFIX}/console/exchange/orders`,
  ORDER_DETAIL: `${API_PREFIX}/console/exchange/orders/:order_no`,
  ORDER_APPROVE: `${API_PREFIX}/console/exchange/orders/:order_no/approve`,
  ORDER_SHIP: `${API_PREFIX}/console/exchange/orders/:order_no/ship`,
  ORDER_REJECT: `${API_PREFIX}/console/exchange/orders/:order_no/reject`,
  ORDER_REFUND: `${API_PREFIX}/console/exchange/orders/:order_no/refund`,
  ORDER_COMPLETE: `${API_PREFIX}/console/exchange/orders/:order_no/complete`,
  /** 运营修改订单收货地址（手填覆写快照，仅未发货阶段，后端: PUT /orders/:order_no/address） */
  ORDER_UPDATE_ADDRESS: `${API_PREFIX}/console/exchange/orders/:order_no/address`,

  // 商品运营（后端: routes/v4/console/exchange/operations.js）
  ITEM_PIN: `${API_PREFIX}/console/exchange/items/:exchange_item_id/pin`,
  ITEM_RECOMMEND: `${API_PREFIX}/console/exchange/items/:exchange_item_id/recommend`,
  ITEMS_BATCH_SORT: `${API_PREFIX}/console/exchange/items/batch-sort`,
  ITEMS_BATCH_STATUS: `${API_PREFIX}/console/exchange/items/batch-status`,
  ITEMS_BATCH_PRICE: `${API_PREFIX}/console/exchange/items/batch-price`,
  ITEMS_BATCH_CATEGORY: `${API_PREFIX}/console/exchange/items/batch-category`,

  /** 缺图商品查询（后端: GET /exchange/missing-images） */
  MISSING_IMAGES: `${API_PREFIX}/console/exchange/missing-images`,
  /** 批量绑定商品图片（后端: POST /exchange/batch-bind-images） */
  BATCH_BIND_IMAGES: `${API_PREFIX}/console/exchange/batch-bind-images`,

  // 快递（后端: routes/v4/console/exchange/orders.js — shipping-companies 挂在 orders 子路由中）
  SHIPPING_COMPANIES: `${API_PREFIX}/console/exchange/orders/shipping-companies`,
  ORDER_TRACK: `${API_PREFIX}/console/exchange/orders/:order_no/track`,

  // 以物易物配方（后端: routes/v4/console/exchange/barter-recipes.js）
  BARTER_RECIPES: `${API_PREFIX}/console/exchange/barter-recipes`,

  // 兑换等级门槛配置（后端: routes/v4/console/exchange/redeem-requirements.js，拍板⑪）
  REDEEM_REQUIREMENT_LIST: `${API_PREFIX}/console/exchange/redeem-requirements/:exchange_item_id`,
  REDEEM_REQUIREMENT_SAVE: `${API_PREFIX}/console/exchange/redeem-requirements`,
  REDEEM_REQUIREMENT_DELETE: `${API_PREFIX}/console/exchange/redeem-requirements/:exchange_redeem_requirement_id`,

  /** 换物运营看板统计（后端: GET /console/exchange/stats/barter，P2-5） */
  STATS_BARTER: `${API_PREFIX}/console/exchange/stats/barter`,

  /**
   * B2C 兑换聚合统计（订单/商品/履约/趋势）
   * 后端: GET /api/v4/console/exchange/stats ，query: trend_days（默认 90）
   */
  STATS: `${API_PREFIX}/console/exchange/stats`
}

// ========== API 调用方法 ==========

export const ExchangeAPI = {
  // ===== 兑换订单 =====

  /**
   * 获取兑换订单列表
   * @param {Object} [params={}] - 查询参数
   * @param {string} [params.status] - 订单状态（pending/completed/shipped/cancelled）
   * @param {number} [params.user_id] - 用户 ID 筛选
   * @param {number} [params.item_id] - 商品 ID 筛选
   * @param {string} [params.order_no] - 订单号模糊搜索
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} API 响应
   */
  async getExchangeOrders(params = {}) {
    const url = EXCHANGE_ENDPOINTS.ORDERS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取兑换订单详情
   * @param {string} orderNo - 订单号
   * @returns {Promise<Object>} API 响应
   */
  async getExchangeOrderDetail(orderNo) {
    const url = buildURL(EXCHANGE_ENDPOINTS.ORDER_DETAIL, { order_no: orderNo })
    return await request({ url, method: 'GET' })
  },

  /**
   * 管理员审核通过兑换订单（pending → approved）
   * @param {string} orderNo - 订单号
   * @param {Object} [data={}] - 审核数据
   * @param {string} [data.remark] - 审核备注
   * @returns {Promise<Object>} API 响应
   */
  async approveExchangeOrder(orderNo, data = {}) {
    const url = buildURL(EXCHANGE_ENDPOINTS.ORDER_APPROVE, { order_no: orderNo })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 管理员拒绝兑换订单（退还材料资产）
   * @param {string} orderNo - 订单号
   * @param {Object} [data={}] - 拒绝数据
   * @param {string} [data.remark] - 拒绝原因
   * @returns {Promise<Object>} API 响应
   */
  async rejectExchangeOrder(orderNo, data = {}) {
    const url = buildURL(EXCHANGE_ENDPOINTS.ORDER_REJECT, { order_no: orderNo })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 管理员发货（approved → shipped）
   * @param {string} orderNo - 订单号
   * @param {Object} [data={}] - 发货数据
   * @param {string} [data.remark] - 发货备注
   * @returns {Promise<Object>} API 响应
   */
  async shipExchangeOrder(orderNo, data = {}) {
    const url = buildURL(EXCHANGE_ENDPOINTS.ORDER_SHIP, { order_no: orderNo })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 管理员退款（approved/shipped → refunded，退还材料资产）
   * @param {string} orderNo - 订单号
   * @param {Object} [data={}] - 退款数据
   * @param {string} [data.remark] - 退款原因
   * @returns {Promise<Object>} API 响应
   */
  async refundExchangeOrder(orderNo, data = {}) {
    const url = buildURL(EXCHANGE_ENDPOINTS.ORDER_REFUND, { order_no: orderNo })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 管理员标记订单完成（shipped/received/rated → completed）
   * @param {string} orderNo - 订单号
   * @param {Object} [data={}] - 完成数据
   * @param {string} [data.remark] - 完成备注
   * @returns {Promise<Object>} API 响应
   */
  async completeExchangeOrder(orderNo, data = {}) {
    const url = buildURL(EXCHANGE_ENDPOINTS.ORDER_COMPLETE, { order_no: orderNo })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 运营修改订单收货地址（手填覆写快照，对标淘宝京东客服改地址，仅未发货阶段）
   * @param {string} orderNo - 订单号
   * @param {Object} data - 收货信息（全部必填）
   * @param {string} data.receiver_name - 收件人姓名
   * @param {string} data.receiver_phone - 收件人手机号
   * @param {string} data.province - 省
   * @param {string} data.city - 市
   * @param {string} data.district - 区/县
   * @param {string} data.detail_address - 详细地址
   * @returns {Promise<Object>} API 响应（{ order_no, address_snapshot }）
   */
  async updateExchangeOrderAddress(orderNo, data = {}) {
    const url = buildURL(EXCHANGE_ENDPOINTS.ORDER_UPDATE_ADDRESS, { order_no: orderNo })
    return await request({ url, method: 'PUT', data })
  },

  // ===== 商品运营 =====

  /**
   * 置顶/取消置顶商品
   * @param {number} itemId - 商品 ID
   * @param {boolean} isPinned - 是否置顶
   * @returns {Promise<Object>} 操作结果
   */
  async toggleItemPin(itemId, isPinned) {
    const url = buildURL(EXCHANGE_ENDPOINTS.ITEM_PIN, { exchange_item_id: itemId })
    return await request({ url, method: 'PUT', data: { is_pinned: isPinned } })
  },

  /**
   * 推荐/取消推荐商品
   * @param {number} itemId - 商品 ID
   * @param {boolean} isRecommended - 是否推荐
   * @returns {Promise<Object>} 操作结果
   */
  async toggleItemRecommend(itemId, isRecommended) {
    const url = buildURL(EXCHANGE_ENDPOINTS.ITEM_RECOMMEND, { exchange_item_id: itemId })
    return await request({ url, method: 'PUT', data: { is_recommended: isRecommended } })
  },

  /**
   * 批量调整商品排序
   * @param {Array<{exchange_item_id: number, sort_order: number}>} items - 排序数据
   * @returns {Promise<Object>} 操作结果
   */
  async batchSortItems(items) {
    return await request({
      url: EXCHANGE_ENDPOINTS.ITEMS_BATCH_SORT,
      method: 'PUT',
      data: { items }
    })
  },

  /** 批量上下架 */
  async batchUpdateStatus(exchangeItemIds, status) {
    return await request({
      url: EXCHANGE_ENDPOINTS.ITEMS_BATCH_STATUS,
      method: 'PUT',
      data: { exchange_item_ids: exchangeItemIds, status }
    })
  },

  /** 批量改价 */
  async batchUpdatePrice(items) {
    return await request({
      url: EXCHANGE_ENDPOINTS.ITEMS_BATCH_PRICE,
      method: 'PUT',
      data: { items }
    })
  },

  /** 批量修改分类 */
  async batchUpdateCategory(exchangeItemIds, categoryId) {
    return await request({
      url: EXCHANGE_ENDPOINTS.ITEMS_BATCH_CATEGORY,
      method: 'PUT',
      data: { exchange_item_ids: exchangeItemIds, category_id: categoryId }
    })
  },

  // ===== 缺图 / 绑图 =====

  /**
   * 查询缺少图片的兑换商品
   * @param {Object} [params={}] - 查询参数
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=50] - 每页数量
   * @returns {Promise<Object>} API 响应
   */
  async getMissingImages(params = {}) {
    return await request({ url: EXCHANGE_ENDPOINTS.MISSING_IMAGES, params })
  },

  /**
   * 批量绑定商品图片
   * @param {Array<{exchange_item_id: number, media_id: number}>} bindings - 绑定数据
   * @returns {Promise<Object>} API 响应
   */
  async batchBindImages(bindings) {
    return await request({
      url: EXCHANGE_ENDPOINTS.BATCH_BIND_IMAGES,
      method: 'POST',
      data: { bindings }
    })
  },

  // ===== 快递查询 =====

  /**
   * 获取快递公司列表（供发货弹窗下拉）
   * @returns {Promise<Object>} 快递公司列表
   */
  async getShippingCompanies() {
    return await request({ url: EXCHANGE_ENDPOINTS.SHIPPING_COMPANIES, method: 'GET' })
  },

  /**
   * 查询订单物流轨迹
   * @param {string} orderNo - 订单号
   * @returns {Promise<Object>} 物流轨迹
   */
  async getOrderTrack(orderNo) {
    const url = buildURL(EXCHANGE_ENDPOINTS.ORDER_TRACK, { order_no: orderNo })
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取以物易物配方列表（管理后台，含停用项）
   * @returns {Promise<Object>} { recipes }
   */
  async getBarterRecipes() {
    return await request({ url: EXCHANGE_ENDPOINTS.BARTER_RECIPES, method: 'GET' })
  },

  /**
   * 全量保存以物易物配方配置
   * @param {Array<Object>} recipes - 配方数组
   * @returns {Promise<Object>} { recipes }
   */
  async saveBarterRecipes(recipes) {
    return await request({
      url: EXCHANGE_ENDPOINTS.BARTER_RECIPES,
      method: 'PUT',
      data: { recipes }
    })
  },

  // ===== 兑换等级门槛配置（拍板⑪，P0-2） =====

  /**
   * 获取某商品的等级门槛配置列表
   * @param {number} exchange_item_id - 兑换商品 ID
   * @returns {Promise<Object>} { requirements: [{exchange_redeem_requirement_id, min_growth_level_key, max_growth_level_key, is_enabled, publish_at, unpublish_at, ...}] }
   */
  async getRedeemRequirements(exchange_item_id) {
    const url = buildURL(EXCHANGE_ENDPOINTS.REDEEM_REQUIREMENT_LIST, { exchange_item_id })
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建/更新等级门槛配置（带 exchange_redeem_requirement_id 为更新）
   * @param {Object} data - 门槛数据（snake_case 直接对接后端：exchange_item_id, min_growth_level_key, max_growth_level_key, is_enabled, publish_at, unpublish_at）
   * @returns {Promise<Object>} 保存后的门槛配置
   */
  async saveRedeemRequirement(data) {
    return await request({
      url: EXCHANGE_ENDPOINTS.REDEEM_REQUIREMENT_SAVE,
      method: 'POST',
      data
    })
  },

  /**
   * 删除等级门槛配置
   * @param {number} exchange_redeem_requirement_id - 门槛配置 ID
   * @returns {Promise<Object>} 删除结果
   */
  async deleteRedeemRequirement(exchange_redeem_requirement_id) {
    const url = buildURL(EXCHANGE_ENDPOINTS.REDEEM_REQUIREMENT_DELETE, {
      exchange_redeem_requirement_id
    })
    return await request({ url, method: 'DELETE' })
  },

  /**
   * 获取换物运营看板统计（P2-5）
   * @param {Object} [params={}] - 查询参数（days 统计天数）
   * @returns {Promise<Object>} { period_days, daily, by_recipe, status_distribution, summary }
   */
  async getBarterStats(params = {}) {
    const url = EXCHANGE_ENDPOINTS.STATS_BARTER + buildQueryString(params)
    return await request({ url, method: 'GET' })
  }
}

export default ExchangeAPI
