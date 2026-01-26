/**
 * 市场交易 API 模块
 *
 * @module api/market
 * @description 兑换市场、交易订单、市场挂牌管理相关的 API 调用
 *
 * 功能范围：
 * - 兑换市场商品管理（B2C）
 * - 兑换订单管理
 * - C2C 交易订单查询
 * - 市场挂牌管理
 * - 孤儿冻结检测与清理
 *
 * @version 2.0.0
 * @date 2026-01-23
 * @see routes/v4/console/marketplace.js - 后端路由定义
 */

import { logger } from '../utils/logger.js'
import { request, buildURL, buildQueryString } from './base.js'

// ========== 类型定义 ==========

/**
 * 兑换商品查询参数
 * @typedef {Object} ExchangeItemsParams
 * @property {string} [status='all'] - 商品状态（active/inactive/all）
 * @property {string} [keyword] - 商品名称关键词搜索
 * @property {number} [page=1] - 页码
 * @property {number} [page_size=20] - 每页数量
 * @property {string} [sort_by='sort_order'] - 排序字段
 * @property {string} [sort_order='ASC'] - 排序方向（ASC/DESC）
 */

/**
 * 兑换订单查询参数
 * @typedef {Object} ExchangeOrdersParams
 * @property {string} [status] - 订单状态（pending/completed/shipped/cancelled）
 * @property {number} [user_id] - 用户 ID 筛选
 * @property {number} [item_id] - 商品 ID 筛选
 * @property {string} [order_no] - 订单号模糊搜索
 * @property {number} [page=1] - 页码
 * @property {number} [page_size=20] - 每页数量
 * @property {string} [sort_by='created_at'] - 排序字段
 * @property {string} [sort_order='DESC'] - 排序方向
 */

/**
 * 订单状态更新数据
 * @typedef {Object} OrderStatusUpdateData
 * @property {string} status - 新状态（pending/completed/shipped/cancelled）
 * @property {string} [remark] - 操作备注
 */

/**
 * C2C 交易订单查询参数
 * @typedef {Object} TradeOrdersParams
 * @property {string} [status] - 订单状态（created/frozen/completed/cancelled）
 * @property {number} [buyer_user_id] - 买家 ID 筛选
 * @property {number} [seller_user_id] - 卖家 ID 筛选
 * @property {number} [listing_id] - 挂牌 ID 筛选
 * @property {number} [page=1] - 页码
 * @property {number} [page_size=20] - 每页数量
 */

/**
 * 市场挂牌查询参数
 * @typedef {Object} ListingsParams
 * @property {number} [page=1] - 页码
 * @property {number} [limit=20] - 每页数量
 * @property {string} [listing_kind] - 挂牌类型（item_instance/fungible_asset）
 * @property {string} [asset_code] - 资产代码筛选（仅 fungible_asset）
 * @property {string} [item_category_code] - 物品类目代码（仅 item_instance）
 * @property {string} [asset_group_code] - 资产分组代码（仅 fungible_asset）
 * @property {string} [rarity_code] - 稀有度代码（仅 item_instance）
 * @property {number} [min_price] - 最低价格
 * @property {number} [max_price] - 最高价格
 * @property {string} [sort='newest'] - 排序（newest/price_asc/price_desc）
 */

/**
 * 创建挂牌数据
 * @typedef {Object} CreateListingData
 * @property {number} item_instance_id - 物品实例 ID（必填）
 * @property {number} price_amount - 售价（必填，>0）
 * @property {string} price_asset_code - 定价币种（必填：DIAMOND/red_shard）
 * @property {string} [condition='good'] - 物品状态
 */

/**
 * 更新挂牌数据
 * @typedef {Object} UpdateListingData
 * @property {number} [price_amount] - 新售价
 * @property {string} [status] - 新状态
 */

/**
 * 分页响应结构
 * @typedef {Object} PaginatedResponse
 * @property {Array} items - 数据列表
 * @property {Object} pagination - 分页信息
 * @property {number} pagination.page - 当前页码
 * @property {number} pagination.page_size - 每页数量
 * @property {number} pagination.total - 总记录数
 * @property {number} pagination.total_pages - 总页数
 */

// ========== API 端点 ==========

/**
 * 市场交易 API 端点常量
 *
 * @description 定义所有市场交易相关的 API 路径
 *
 * 端点分组：
 * - EXCHANGE_* : B2C 兑换市场（管理员管理商品和订单）
 * - TRADE_* : C2C 交易订单（用户间交易）
 * - LISTINGS_* : 市场挂牌（C2C 挂牌管理）
 * - ORPHAN_* : 孤儿冻结检测与清理
 *
 * @constant
 * @type {Object}
 *
 * @property {string} EXCHANGE_ITEMS - [GET] 获取兑换商品列表
 * @property {string} EXCHANGE_ITEM_DETAIL - [GET] 获取商品详情 - Path: :item_id
 * @property {string} EXCHANGE_ITEMS_SIMPLE - [GET] 兑换商品（简化路径）
 *
 * @property {string} EXCHANGE_ORDERS - [GET] 获取兑换订单列表
 * @property {string} EXCHANGE_ORDER_DETAIL - [GET] 获取订单详情 - Path: :order_no
 * @property {string} EXCHANGE_ORDER_STATUS - [PUT] 更新订单状态 - Path: :order_no
 * @property {string} EXCHANGE_ORDERS_SIMPLE - [GET] 兑换订单（简化路径）
 * @property {string} EXCHANGE_STATS - [GET] 获取兑换统计
 *
 * @property {string} TRADE_ORDERS - [GET] 获取C2C交易订单
 * @property {string} TRADE_ORDER_DETAIL - [GET] 获取交易订单详情 - Path: :order_id
 *
 * @property {string} LISTINGS_LIST - [GET] 获取上架列表
 * @property {string} LISTINGS_DETAIL - [GET] 获取上架详情 - Path: :listing_id
 * @property {string} LISTINGS_CREATE - [POST] 创建上架
 * @property {string} LISTINGS_UPDATE - [PUT] 更新上架 - Path: :listing_id
 * @property {string} LISTINGS_DELETE - [DELETE] 删除上架 - Path: :listing_id
 * @property {string} LISTINGS_STATS - [GET] 获取上架统计
 *
 * @property {string} ORPHAN_DETECT - [POST] 检测孤儿冻结
 * @property {string} ORPHAN_STATS - [GET] 获取孤儿冻结统计
 * @property {string} ORPHAN_CLEANUP - [POST] 清理孤儿冻结
 */
export const MARKET_ENDPOINTS = {
  // 兑换市场物品
  /** @type {string} [GET] 获取兑换商品列表 - Query: { page?, page_size?, status? } */
  EXCHANGE_ITEMS: '/api/v4/console/marketplace/exchange_market/items',
  /** @type {string} [GET] 获取商品详情 - Path: :item_id */
  EXCHANGE_ITEM_DETAIL: '/api/v4/console/marketplace/exchange_market/items/:item_id',
  /** @type {string} [GET] 兑换商品（简化路径别名） */
  EXCHANGE_ITEMS_SIMPLE: '/api/v4/console/marketplace/exchange_market/items',

  // 兑换订单
  /** @type {string} [GET] 获取兑换订单列表 - Query: { page?, page_size?, status? } */
  EXCHANGE_ORDERS: '/api/v4/console/marketplace/exchange_market/orders',
  /** @type {string} [GET] 获取订单详情 - Path: :order_no */
  EXCHANGE_ORDER_DETAIL: '/api/v4/console/marketplace/exchange_market/orders/:order_no',
  /** @type {string} [PUT] 更新订单状态 - Path: :order_no, Body: { status } */
  EXCHANGE_ORDER_STATUS: '/api/v4/shop/exchange/orders/:order_no/status',
  /** @type {string} [GET] 兑换订单（简化路径别名） */
  EXCHANGE_ORDERS_SIMPLE: '/api/v4/console/marketplace/exchange_market/orders',
  /** @type {string} [GET] 获取兑换统计 */
  EXCHANGE_STATS: '/api/v4/console/marketplace/exchange_market/statistics',
  /** @type {string} [GET] 获取兑换完整统计 */
  // 使用后端存在的统计接口（后端无 /full 接口）
  EXCHANGE_FULL_STATS: '/api/v4/console/marketplace/exchange_market/statistics',
  /** @type {string} [GET] 获取兑换趋势数据 */
  EXCHANGE_TREND: '/api/v4/console/marketplace/exchange_market/statistics/trend',
  /** @type {string} [GET] 获取兑换订单统计 */
  EXCHANGE_ORDER_STATS: '/api/v4/console/marketplace/exchange_market/orders/stats',
  /** @type {string} [POST] 发货订单 - Path: :order_no */
  EXCHANGE_ORDER_SHIP: '/api/v4/console/marketplace/exchange_market/orders/:order_no/ship',
  /** @type {string} [POST] 取消订单 - Path: :order_no */
  EXCHANGE_ORDER_CANCEL: '/api/v4/console/marketplace/exchange_market/orders/:order_no/cancel',

  // 交易订单
  /** @type {string} [GET] 获取C2C交易订单 - Query: { page?, page_size?, status? } */
  TRADE_ORDERS: '/api/v4/console/marketplace/trade_orders',
  /** @type {string} [GET] 获取交易订单详情 - Path: :order_id */
  TRADE_ORDER_DETAIL: '/api/v4/console/marketplace/trade_orders/:order_id',

  // 市场上架
  /** @type {string} [GET] 获取上架列表 - Query: { page?, page_size?, status? } */
  LISTINGS_LIST: '/api/v4/console/marketplace/listings',
  /** @type {string} [GET] 获取上架详情 - Path: :listing_id */
  LISTINGS_DETAIL: '/api/v4/console/marketplace/listings/:listing_id',
  /** @type {string} [POST] 创建上架 - Body: { item_id, price, ... } */
  LISTINGS_CREATE: '/api/v4/console/marketplace/listings',
  /** @type {string} [PUT] 更新上架 - Path: :listing_id, Body: { price?, ... } */
  LISTINGS_UPDATE: '/api/v4/console/marketplace/listings/:listing_id',
  /** @type {string} [DELETE] 删除上架 - Path: :listing_id */
  LISTINGS_DELETE: '/api/v4/console/marketplace/listings/:listing_id',
  /** @type {string} [GET] 获取上架统计 */
  LISTINGS_STATS: '/api/v4/console/marketplace/listing-stats',

  // 孤儿冻结检测
  /** @type {string} [POST] 检测孤儿冻结 */
  ORPHAN_DETECT: '/api/v4/console/orphan-frozen/detect',
  /** @type {string} [GET] 获取孤儿冻结统计 */
  ORPHAN_STATS: '/api/v4/console/orphan-frozen/stats',
  /** @type {string} [POST] 清理孤儿冻结 - Body: { ids?, force? } */
  ORPHAN_CLEANUP: '/api/v4/console/orphan-frozen/cleanup',

  // C2C市场扩展
  /** @type {string} [GET] 获取C2C订单 */
  C2C_MARKET_ORDERS: '/api/v4/console/c2c-market/orders',
  /** @type {string} [GET] 获取C2C订单统计 */
  C2C_MARKET_ORDERS_STATS: '/api/v4/console/c2c-market/orders/stats',
  /** @type {string} [GET] 获取上架汇总 */
  C2C_MARKET_LISTINGS_SUMMARY: '/api/v4/console/c2c-market/listings/summary',
  /** @type {string} [GET] 获取用户上架统计 */
  C2C_MARKET_LISTINGS_USER_STATS: '/api/v4/console/c2c-market/listings/user-stats',

  // 市场统计扩展
  /** @type {string} [GET] 商品统计 */
  MARKETPLACE_STATS_ITEM_STATS: '/api/v4/console/marketplace/stats/items',
  /** @type {string} [GET] 订单统计 */
  MARKETPLACE_STATS_ORDER_STATS: '/api/v4/console/marketplace/stats/orders',
  /** @type {string} [GET] 市场综合统计 */
  MARKETPLACE_STATS: '/api/v4/console/marketplace/stats',

  // 业务记录查询
  /** @type {string} [GET] 抽奖清除设置记录列表 */
  BUSINESS_RECORDS_LOTTERY_CLEAR: '/api/v4/console/business-records/lottery-clear-settings',
  /** @type {string} [GET] 抽奖清除设置记录详情 */
  BUSINESS_RECORDS_LOTTERY_CLEAR_DETAIL:
    '/api/v4/console/business-records/lottery-clear-settings/:record_id',
  /** @type {string} [GET] 核销订单列表 */
  BUSINESS_RECORDS_REDEMPTION: '/api/v4/console/business-records/redemption-orders',
  /** @type {string} [GET] 核销订单详情 */
  BUSINESS_RECORDS_REDEMPTION_DETAIL:
    '/api/v4/console/business-records/redemption-orders/:order_id',
  /** @type {string} [POST] 核销订单执行核销 */
  BUSINESS_RECORDS_REDEMPTION_REDEEM:
    '/api/v4/console/business-records/redemption-orders/:order_id/redeem',
  /** @type {string} [POST] 核销订单取消 */
  BUSINESS_RECORDS_REDEMPTION_CANCEL:
    '/api/v4/console/business-records/redemption-orders/:order_id/cancel',
  /** @type {string} [GET] 内容审核记录列表 */
  BUSINESS_RECORDS_CONTENT_REVIEWS: '/api/v4/console/business-records/content-reviews',
  /** @type {string} [GET] 内容审核记录详情 */
  BUSINESS_RECORDS_CONTENT_REVIEWS_DETAIL:
    '/api/v4/console/business-records/content-reviews/:audit_id',
  /** @type {string} [GET] 用户角色变更记录列表 */
  BUSINESS_RECORDS_ROLE_CHANGES: '/api/v4/console/business-records/user-role-changes',
  /** @type {string} [GET] 用户角色变更记录详情 */
  BUSINESS_RECORDS_ROLE_CHANGES_DETAIL:
    '/api/v4/console/business-records/user-role-changes/:record_id',
  /** @type {string} [GET] 用户状态变更记录列表 */
  BUSINESS_RECORDS_STATUS_CHANGES: '/api/v4/console/business-records/user-status-changes',
  /** @type {string} [GET] 用户状态变更记录详情 */
  BUSINESS_RECORDS_STATUS_CHANGES_DETAIL:
    '/api/v4/console/business-records/user-status-changes/:record_id',
  /** @type {string} [GET] 兑换记录列表 */
  BUSINESS_RECORDS_EXCHANGE: '/api/v4/console/business-records/exchange-records',
  /** @type {string} [GET] 兑换记录详情 */
  BUSINESS_RECORDS_EXCHANGE_DETAIL: '/api/v4/console/business-records/exchange-records/:record_id',
  /** @type {string} [GET] 聊天消息记录列表 */
  BUSINESS_RECORDS_CHAT: '/api/v4/console/business-records/chat-messages',
  /** @type {string} [GET] 聊天消息记录详情 */
  BUSINESS_RECORDS_CHAT_DETAIL: '/api/v4/console/business-records/chat-messages/:message_id',
  /** @type {string} [GET] 聊天消息统计汇总 */
  BUSINESS_RECORDS_CHAT_STATS: '/api/v4/console/business-records/chat-messages/statistics/summary',

  // 交易订单扩展
  /** @type {string} [GET] 交易订单列表 */
  TRADE_ORDERS_LIST: '/api/v4/console/trade-orders',
  /** @type {string} [GET] 交易订单详情 */
  TRADE_ORDERS_DETAIL: '/api/v4/console/trade-orders/:id',
  /** @type {string} [GET] 交易订单统计 */
  TRADE_ORDERS_STATS: '/api/v4/console/trade-orders/stats',
  /** @type {string} [GET] 用户交易订单统计 */
  TRADE_ORDERS_USER_STATS: '/api/v4/console/trade-orders/user/:user_id/stats',
  /** @type {string} [GET] 按业务ID查询交易订单 */
  TRADE_ORDERS_BY_BUSINESS_ID: '/api/v4/console/trade-orders/by-business-id/:business_id',

  // C2C市场扩展（补充）
  /** @type {string} [GET] C2C市场列表 */
  C2C_MARKET_LIST: '/api/v4/console/marketplace/listings',
  /** @type {string} [GET] C2C市场详情 */
  C2C_MARKET_DETAIL: '/api/v4/console/marketplace/listings/:listing_id',
  /** @type {string} [GET] C2C市场统计 */
  C2C_MARKET_STATS: '/api/v4/console/marketplace/listing-stats'
}

// ========== API 调用方法 ==========

export const MarketAPI = {
  // ===== 兑换市场物品 =====

  /**
   * 获取兑换市场物品列表
   *
   * @async
   * @function getExchangeItems
   * @memberof module:api/market.MarketAPI
   * @description 管理员查看所有兑换商品列表，支持状态筛选、分页、排序
   *
   * 业务场景：
   * - 管理后台商品管理页面
   * - 支持按状态筛选（active/inactive）
   * - 支持关键词搜索
   *
   * @param {ExchangeItemsParams} [params={}] - 查询参数
   * @param {string} [params.status='all'] - 商品状态（active/inactive/all）
   * @param {string} [params.keyword] - 商品名称关键词搜索
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @param {string} [params.sort_by='sort_order'] - 排序字段
   * @param {string} [params.sort_order='ASC'] - 排序方向（ASC/DESC）
   *
   * @returns {Promise<Object>} API 响应
   * @returns {boolean} return.success - 请求是否成功
   * @returns {Object} return.data - 响应数据
   * @returns {Array<Object>} return.data.items - 商品列表
   * @returns {number} return.data.items[].item_id - 商品 ID
   * @returns {string} return.data.items[].name - 商品名称
   * @returns {string} return.data.items[].description - 商品描述
   * @returns {string} return.data.items[].cost_asset_code - 兑换所需材料代码
   * @returns {number} return.data.items[].cost_amount - 兑换所需材料数量
   * @returns {number} return.data.items[].stock - 当前库存
   * @returns {string} return.data.items[].status - 商品状态
   * @returns {number} return.data.items[].sort_order - 排序号
   * @returns {Object} return.data.pagination - 分页信息
   *
   * @example
   * // 查询所有上架商品
   * const result = await MarketAPI.getExchangeItems({
   *   status: 'active',
   *   page: 1,
   *   page_size: 20
   * })
   *
   * @example
   * // 关键词搜索
   * const result = await MarketAPI.getExchangeItems({
   *   keyword: '碎片',
   *   status: 'all'
   * })
   *
   * @throws {Error} 网络错误或服务器错误
   */
  async getExchangeItems(params = {}) {
    const url = MARKET_ENDPOINTS.EXCHANGE_ITEMS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取兑换物品详情
   *
   * @async
   * @function getExchangeItemDetail
   * @memberof module:api/market.MarketAPI
   * @description 管理员查看单个商品详情，返回完整字段
   *
   * @param {number} itemId - 物品 ID（必填，正整数）
   *
   * @returns {Promise<Object>} API 响应
   * @returns {boolean} return.success - 请求是否成功
   * @returns {Object} return.data - 商品详情
   * @returns {Object} return.data.item - 商品信息
   * @returns {number} return.data.item.item_id - 商品 ID
   * @returns {string} return.data.item.name - 商品名称
   * @returns {string} return.data.item.description - 商品描述
   * @returns {string} return.data.item.cost_asset_code - 兑换材料代码
   * @returns {number} return.data.item.cost_amount - 兑换材料数量
   * @returns {number} return.data.item.cost_price - 成本价
   * @returns {number} return.data.item.stock - 库存数量
   * @returns {string} return.data.item.status - 商品状态
   * @returns {number} return.data.item.primary_image_id - 主图片 ID
   *
   * @example
   * const detail = await MarketAPI.getExchangeItemDetail(123)
   * logger.debug(detail.data.item.name)
   *
   * @throws {Error} 商品不存在时返回 404
   */
  async getExchangeItemDetail(itemId) {
    const url = buildURL(MARKET_ENDPOINTS.EXCHANGE_ITEM_DETAIL, { item_id: itemId })
    return await request({ url, method: 'GET' })
  },

  // ===== 兑换订单 =====

  /**
   * 获取兑换订单列表
   *
   * @async
   * @function getExchangeOrders
   * @memberof module:api/market.MarketAPI
   * @description 管理员查看所有兑换订单，支持状态筛选、分页、排序
   *
   * 业务场景：
   * - 管理后台订单管理页面
   * - 订单状态筛选和批量处理
   * - 订单详情查看
   *
   * @param {ExchangeOrdersParams} [params={}] - 查询参数
   * @param {string} [params.status] - 订单状态（pending/completed/shipped/cancelled）
   * @param {number} [params.user_id] - 用户 ID 筛选
   * @param {number} [params.item_id] - 商品 ID 筛选
   * @param {string} [params.order_no] - 订单号模糊搜索
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @param {string} [params.sort_by='created_at'] - 排序字段
   * @param {string} [params.sort_order='DESC'] - 排序方向
   *
   * @returns {Promise<Object>} API 响应
   * @returns {boolean} return.success - 请求是否成功
   * @returns {Object} return.data - 响应数据
   * @returns {Array<Object>} return.data.orders - 订单列表
   * @returns {string} return.data.orders[].order_no - 订单号
   * @returns {number} return.data.orders[].user_id - 用户 ID
   * @returns {number} return.data.orders[].item_id - 商品 ID
   * @returns {string} return.data.orders[].item_name - 商品名称
   * @returns {number} return.data.orders[].quantity - 兑换数量
   * @returns {string} return.data.orders[].status - 订单状态
   * @returns {string} return.data.orders[].created_at - 创建时间
   * @returns {Object} return.data.pagination - 分页信息
   *
   * @example
   * // 查询待处理订单
   * const result = await MarketAPI.getExchangeOrders({
   *   status: 'pending',
   *   page: 1,
   *   page_size: 20,
   *   sort_order: 'DESC'
   * })
   *
   * @example
   * // 按用户筛选订单
   * const result = await MarketAPI.getExchangeOrders({
   *   user_id: 12345,
   *   status: 'completed'
   * })
   *
   * @throws {Error} 网络错误或服务器错误
   */
  async getExchangeOrders(params = {}) {
    const url = MARKET_ENDPOINTS.EXCHANGE_ORDERS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取兑换订单详情
   *
   * @async
   * @function getExchangeOrderDetail
   * @memberof module:api/market.MarketAPI
   * @description 管理员查看订单详情，返回所有字段（包含敏感信息）
   *
   * @param {string} orderNo - 订单号（必填）
   *
   * @returns {Promise<Object>} API 响应
   * @returns {boolean} return.success - 请求是否成功
   * @returns {Object} return.data - 响应数据
   * @returns {Object} return.data.order - 订单详情
   *
   * @example
   * const detail = await MarketAPI.getExchangeOrderDetail('ORD202601230001')
   *
   * @throws {Error} 订单不存在时返回 404
   */
  async getExchangeOrderDetail(orderNo) {
    const url = buildURL(MARKET_ENDPOINTS.EXCHANGE_ORDER_DETAIL, { order_no: orderNo })
    return await request({ url, method: 'GET' })
  },

  /**
   * 更新兑换订单状态
   *
   * @async
   * @function updateExchangeOrderStatus
   * @memberof module:api/market.MarketAPI
   * @description 管理员更新兑换订单状态（如：发货、完成、取消）
   *
   * 状态流转规则：
   * - pending → shipped（发货）
   * - pending → cancelled（取消）
   * - shipped → completed（完成）
   *
   * @param {string} orderNo - 订单号（必填）
   * @param {OrderStatusUpdateData} data - 状态更新数据
   * @param {string} data.status - 新状态（必填：pending/completed/shipped/cancelled）
   * @param {string} [data.remark] - 操作备注
   *
   * @returns {Promise<Object>} API 响应
   * @returns {boolean} return.success - 请求是否成功
   * @returns {string} return.message - 操作结果消息
   * @returns {Object} return.data - 更新后的订单信息
   *
   * @example
   * // 订单发货
   * const result = await MarketAPI.updateExchangeOrderStatus('ORD202601230001', {
   *   status: 'shipped',
   *   remark: '顺丰快递 SF1234567890'
   * })
   *
   * @example
   * // 取消订单
   * const result = await MarketAPI.updateExchangeOrderStatus('ORD202601230001', {
   *   status: 'cancelled',
   *   remark: '用户申请取消'
   * })
   *
   * @throws {Error} 订单不存在或状态流转不合法时报错
   */
  async updateExchangeOrderStatus(orderNo, data) {
    const url = buildURL(MARKET_ENDPOINTS.EXCHANGE_ORDER_STATUS, { order_no: orderNo })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 获取兑换统计
   *
   * @async
   * @function getExchangeStats
   * @memberof module:api/market.MarketAPI
   * @description 管理员查看兑换市场统计数据
   *
   * @returns {Promise<Object>} API 响应
   * @returns {boolean} return.success - 请求是否成功
   * @returns {Object} return.data - 统计数据
   * @returns {number} return.data.total_items - 商品总数
   * @returns {number} return.data.active_items - 上架商品数
   * @returns {number} return.data.low_stock_items - 库存预警商品数（库存<10）
   * @returns {number} return.data.total_exchanges - 总兑换次数
   *
   * @example
   * const stats = await MarketAPI.getExchangeStats()
   * logger.info(`上架商品: ${stats.data.active_items}`)
   */
  async getExchangeStats() {
    return await request({ url: MARKET_ENDPOINTS.EXCHANGE_STATS, method: 'GET' })
  },

  // ===== 交易订单 =====

  /**
   * 获取交易订单列表
   *
   * @async
   * @function getTradeOrders
   * @memberof module:api/market.MarketAPI
   * @description 管理员查看所有 C2C 交易订单，支持状态筛选、分页
   *
   * 业务场景：
   * - 管理后台 C2C 交易订单管理页面
   * - 订单状态筛选和查看
   * - 交易纠纷处理
   *
   * 订单状态说明：
   * - created: 已创建（待支付）
   * - frozen: 冻结中（支付完成，待确认）
   * - completed: 已完成
   * - cancelled: 已取消
   *
   * @param {TradeOrdersParams} [params={}] - 查询参数
   * @param {string} [params.status] - 订单状态（created/frozen/completed/cancelled）
   * @param {number} [params.buyer_user_id] - 买家 ID 筛选
   * @param {number} [params.seller_user_id] - 卖家 ID 筛选
   * @param {number} [params.listing_id] - 挂牌 ID 筛选
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   *
   * @returns {Promise<Object>} API 响应
   * @returns {boolean} return.success - 请求是否成功
   * @returns {Object} return.data - 响应数据
   * @returns {Array<Object>} return.data.orders - 订单列表
   * @returns {number} return.data.orders[].order_id - 订单 ID
   * @returns {string} return.data.orders[].business_id - 业务唯一 ID
   * @returns {number} return.data.orders[].listing_id - 挂牌 ID
   * @returns {number} return.data.orders[].buyer_user_id - 买家 ID
   * @returns {number} return.data.orders[].seller_user_id - 卖家 ID
   * @returns {number} return.data.orders[].price_amount - 成交价格
   * @returns {string} return.data.orders[].price_asset_code - 结算币种
   * @returns {string} return.data.orders[].status - 订单状态
   * @returns {string} return.data.orders[].created_at - 创建时间
   * @returns {Object} return.data.pagination - 分页信息
   * @returns {number} return.data.pagination.total_count - 总记录数
   * @returns {number} return.data.pagination.page - 当前页码
   * @returns {number} return.data.pagination.page_size - 每页数量
   *
   * @example
   * // 查询所有已完成的交易订单
   * const result = await MarketAPI.getTradeOrders({
   *   status: 'completed',
   *   page: 1,
   *   page_size: 20
   * })
   *
   * @example
   * // 查询特定卖家的订单
   * const result = await MarketAPI.getTradeOrders({
   *   seller_user_id: 12345,
   *   status: 'frozen'
   * })
   *
   * @throws {Error} 网络错误或服务器错误
   */
  async getTradeOrders(params = {}) {
    const url = MARKET_ENDPOINTS.TRADE_ORDERS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取交易订单详情
   *
   * @async
   * @function getTradeOrderDetail
   * @memberof module:api/market.MarketAPI
   * @description 管理员查看 C2C 交易订单详情，返回完整信息
   *
   * @param {string} orderId - 订单 ID（必填）
   *
   * @returns {Promise<Object>} API 响应
   * @returns {boolean} return.success - 请求是否成功
   * @returns {Object} return.data - 响应数据
   * @returns {Object} return.data.order - 订单详情
   *
   * @example
   * const detail = await MarketAPI.getTradeOrderDetail('123')
   *
   * @throws {Error} 订单不存在时返回 404
   */
  async getTradeOrderDetail(orderId) {
    const url = buildURL(MARKET_ENDPOINTS.TRADE_ORDER_DETAIL, { order_id: orderId })
    return await request({ url, method: 'GET' })
  },

  // ===== 市场上架 =====

  /**
   * 获取上架列表
   *
   * @async
   * @function getListings
   * @memberof module:api/market.MarketAPI
   * @description 获取交易市场挂牌列表（管理员视角）
   *
   * 业务场景：
   * - 管理后台市场挂牌管理
   * - 查看用户上架的商品
   * - 支持多维度筛选
   *
   * 挂牌类型说明：
   * - item_instance: 物品实例挂牌（唯一物品）
   * - fungible_asset: 可叠加资产挂牌（材料类）
   *
   * @param {ListingsParams} [params={}] - 查询参数
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.limit=20] - 每页数量
   * @param {string} [params.listing_kind] - 挂牌类型（item_instance/fungible_asset）
   * @param {string} [params.asset_code] - 资产代码筛选（仅 fungible_asset 有效）
   * @param {string} [params.item_category_code] - 物品类目代码（仅 item_instance 有效）
   * @param {string} [params.asset_group_code] - 资产分组代码（仅 fungible_asset 有效）
   * @param {string} [params.rarity_code] - 稀有度代码（仅 item_instance 有效）
   * @param {number} [params.min_price] - 最低价格筛选
   * @param {number} [params.max_price] - 最高价格筛选
   * @param {string} [params.sort='newest'] - 排序方式（newest/price_asc/price_desc）
   *
   * @returns {Promise<Object>} API 响应
   * @returns {boolean} return.success - 请求是否成功
   * @returns {Object} return.data - 响应数据
   * @returns {Array<Object>} return.data.products - 挂牌商品列表
   * @returns {number} return.data.products[].listing_id - 挂牌 ID
   * @returns {string} return.data.products[].listing_kind - 挂牌类型
   * @returns {number} return.data.products[].seller_user_id - 卖家 ID
   * @returns {number} return.data.products[].price_amount - 价格
   * @returns {string} return.data.products[].price_asset_code - 定价币种
   * @returns {string} return.data.products[].status - 挂牌状态（on_sale/sold/withdrawn）
   * @returns {string} return.data.products[].created_at - 上架时间
   * @returns {Object} return.data.pagination - 分页信息
   *
   * @example
   * // 获取所有在售挂牌
   * const result = await MarketAPI.getListings({
   *   page: 1,
   *   limit: 20,
   *   sort: 'newest'
   * })
   *
   * @example
   * // 按材料类型筛选
   * const result = await MarketAPI.getListings({
   *   listing_kind: 'fungible_asset',
   *   asset_code: 'red_shard',
   *   min_price: 100,
   *   max_price: 500
   * })
   *
   * @example
   * // 按稀有度筛选物品
   * const result = await MarketAPI.getListings({
   *   listing_kind: 'item_instance',
   *   rarity_code: 'legendary',
   *   sort: 'price_desc'
   * })
   *
   * @throws {Error} 网络错误或服务器错误
   */
  async getListings(params = {}) {
    const url = MARKET_ENDPOINTS.LISTINGS_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取上架详情
   *
   * @async
   * @function getListingDetail
   * @memberof module:api/market.MarketAPI
   * @description 获取市场挂牌详情
   *
   * @param {string} listingId - 上架 ID（必填）
   *
   * @returns {Promise<Object>} API 响应
   * @returns {boolean} return.success - 请求是否成功
   * @returns {Object} return.data - 挂牌详情
   * @returns {number} return.data.listing_id - 挂牌 ID
   * @returns {string} return.data.listing_kind - 挂牌类型
   * @returns {number} return.data.item_instance_id - 物品实例 ID
   * @returns {string} return.data.name - 商品名称
   * @returns {number} return.data.price_amount - 价格
   * @returns {string} return.data.price_asset_code - 定价币种
   * @returns {number} return.data.seller_user_id - 卖家 ID
   * @returns {string} return.data.status - 挂牌状态
   * @returns {string} return.data.rarity - 稀有度
   * @returns {string} return.data.description - 描述
   *
   * @example
   * const detail = await MarketAPI.getListingDetail('456')
   */
  async getListingDetail(listingId) {
    const url = buildURL(MARKET_ENDPOINTS.LISTINGS_DETAIL, { listing_id: listingId })
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建上架
   *
   * @async
   * @function createListing
   * @memberof module:api/market.MarketAPI
   * @description 管理员创建市场挂牌（代用户上架）
   *
   * 注意：此接口为管理端功能，实际上架操作建议通过用户端 API
   * 用户端上架接口：POST /api/v4/market/list
   *
   * @param {CreateListingData} data - 上架数据
   * @param {number} data.item_instance_id - 物品实例 ID（必填）
   * @param {number} data.price_amount - 售价（必填，>0）
   * @param {string} data.price_asset_code - 定价币种（必填：DIAMOND/red_shard）
   * @param {string} [data.condition='good'] - 物品状态
   *
   * @returns {Promise<Object>} API 响应
   * @returns {boolean} return.success - 请求是否成功
   * @returns {Object} return.data - 创建的挂牌信息
   * @returns {Object} return.data.listing - 挂牌详情
   * @returns {number} return.data.listing.listing_id - 挂牌 ID
   *
   * @example
   * // 创建物品挂牌
   * const result = await MarketAPI.createListing({
   *   item_instance_id: 12345,
   *   price_amount: 1000,
   *   price_asset_code: 'DIAMOND'
   * })
   *
   * @throws {Error} 参数校验失败或物品不存在时报错
   */
  async createListing(data) {
    return await request({ url: MARKET_ENDPOINTS.LISTINGS_CREATE, method: 'POST', data })
  },

  /**
   * 更新上架
   *
   * @async
   * @function updateListing
   * @memberof module:api/market.MarketAPI
   * @description 管理员更新市场挂牌信息
   *
   * @param {string} listingId - 上架 ID（必填）
   * @param {UpdateListingData} data - 更新数据
   * @param {number} [data.price_amount] - 新售价
   * @param {string} [data.status] - 新状态
   *
   * @returns {Promise<Object>} API 响应
   * @returns {boolean} return.success - 请求是否成功
   * @returns {Object} return.data - 更新后的挂牌信息
   *
   * @example
   * // 更新挂牌价格
   * const result = await MarketAPI.updateListing('456', {
   *   price_amount: 800
   * })
   *
   * @throws {Error} 挂牌不存在或无权修改时报错
   */
  async updateListing(listingId, data) {
    const url = buildURL(MARKET_ENDPOINTS.LISTINGS_UPDATE, { listing_id: listingId })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 删除上架
   *
   * @async
   * @function deleteListing
   * @memberof module:api/market.MarketAPI
   * @description 管理员删除/撤回市场挂牌
   *
   * 业务说明：
   * - 强制撤回挂牌（管理员操作）
   * - 会解冻相关冻结的物品/资产
   * - 需要提供撤回原因用于审计
   *
   * @param {string} listingId - 上架 ID（必填）
   *
   * @returns {Promise<Object>} API 响应
   * @returns {boolean} return.success - 请求是否成功
   * @returns {string} return.message - 操作结果消息
   *
   * @example
   * const result = await MarketAPI.deleteListing('456')
   *
   * @throws {Error} 挂牌不存在时返回 404
   */
  async deleteListing(listingId) {
    const url = buildURL(MARKET_ENDPOINTS.LISTINGS_DELETE, { listing_id: listingId })
    return await request({ url, method: 'DELETE' })
  },

  /**
   * 获取上架统计
   *
   * @async
   * @function getListingStats
   * @memberof module:api/market.MarketAPI
   * @description 查询所有用户的上架状态统计，支持筛选和分页
   *
   * 核心功能：
   * 1. 按用户分组统计在售商品数量
   * 2. 支持筛选（全部/接近上限/达到上限）
   * 3. 分页查询
   * 4. 返回用户详情和统计信息
   *
   * @param {Object} [params={}] - 查询参数
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.limit=20] - 每页数量
   * @param {string} [params.filter='all'] - 筛选条件（all/near_limit/at_limit）
   *
   * @returns {Promise<Object>} API 响应
   * @returns {boolean} return.success - 请求是否成功
   * @returns {Object} return.data - 统计数据
   * @returns {Array<Object>} return.data.stats - 用户上架统计列表
   * @returns {Object} return.data.pagination - 分页信息
   * @returns {Object} return.data.summary - 总体统计摘要
   * @returns {number} return.data.summary.total_users_with_listings - 有上架的用户数
   *
   * @example
   * // 获取接近上限的用户
   * const stats = await MarketAPI.getListingStats({
   *   filter: 'near_limit',
   *   page: 1,
   *   limit: 50
   * })
   */
  async getListingStats() {
    return await request({ url: MARKET_ENDPOINTS.LISTINGS_STATS, method: 'GET' })
  },

  // ===== 孤儿冻结检测 =====

  /**
   * 检测孤儿冻结
   *
   * @async
   * @function detectOrphanFrozen
   * @memberof module:api/market.MarketAPI
   * @description 检测系统中的孤儿冻结记录（无对应挂牌的冻结）
   *
   * 业务场景：
   * - 系统维护时检测异常冻结
   * - 发现并处理因系统异常导致的孤儿冻结
   *
   * @returns {Promise<Object>} API 响应
   * @returns {boolean} return.success - 请求是否成功
   * @returns {Object} return.data - 检测结果
   * @returns {Array<Object>} return.data.orphan_records - 孤儿冻结记录列表
   * @returns {number} return.data.total_count - 孤儿记录总数
   *
   * @example
   * const result = await MarketAPI.detectOrphanFrozen()
   * if (result.data.total_count > 0) {
   *   logger.warn(`发现 ${result.data.total_count} 条孤儿冻结`)
   * }
   */
  async detectOrphanFrozen() {
    return await request({ url: MARKET_ENDPOINTS.ORPHAN_DETECT, method: 'POST' })
  },

  /**
   * 获取孤儿冻结统计
   *
   * @async
   * @function getOrphanStats
   * @memberof module:api/market.MarketAPI
   * @description 获取孤儿冻结的统计信息
   *
   * @returns {Promise<Object>} API 响应
   * @returns {boolean} return.success - 请求是否成功
   * @returns {Object} return.data - 统计信息
   *
   * @example
   * const stats = await MarketAPI.getOrphanStats()
   */
  async getOrphanStats() {
    return await request({ url: MARKET_ENDPOINTS.ORPHAN_STATS, method: 'GET' })
  },

  /**
   * 清理孤儿冻结
   *
   * @async
   * @function cleanupOrphanFrozen
   * @memberof module:api/market.MarketAPI
   * @description 清理系统中的孤儿冻结记录
   *
   * 注意：此操作会解冻相关资产，请谨慎使用
   *
   * @param {Object} data - 清理参数
   * @param {Array<number>} [data.ids] - 指定清理的记录 ID 列表（可选，为空则清理全部）
   * @param {boolean} [data.force=false] - 是否强制清理
   *
   * @returns {Promise<Object>} API 响应
   * @returns {boolean} return.success - 请求是否成功
   * @returns {Object} return.data - 清理结果
   * @returns {number} return.data.cleaned_count - 清理的记录数
   *
   * @example
   * // 清理指定记录
   * const result = await MarketAPI.cleanupOrphanFrozen({
   *   ids: [1, 2, 3],
   *   force: false
   * })
   *
   * @example
   * // 强制清理所有孤儿冻结
   * const result = await MarketAPI.cleanupOrphanFrozen({
   *   force: true
   * })
   */
  async cleanupOrphanFrozen(data) {
    return await request({ url: MARKET_ENDPOINTS.ORPHAN_CLEANUP, method: 'POST', data })
  },

  // ===== 业务记录查询 =====

  /**
   * 获取抽奖清除设置记录列表
   * @async
   * @param {Object} [params={}] - 查询参数
   * @param {number} [params.user_id] - 被清除设置的用户ID
   * @param {number} [params.admin_id] - 执行清除的管理员ID
   * @param {string} [params.setting_type] - 清除的设置类型
   * @param {string} [params.start_date] - 开始日期
   * @param {string} [params.end_date] - 结束日期
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} 记录列表
   */
  async getLotteryClearRecords(params = {}) {
    const url = MARKET_ENDPOINTS.BUSINESS_RECORDS_LOTTERY_CLEAR + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取抽奖清除设置记录详情
   * @async
   * @param {number} recordId - 记录ID
   * @returns {Promise<Object>} 记录详情
   */
  async getLotteryClearRecordDetail(recordId) {
    const url = buildURL(MARKET_ENDPOINTS.BUSINESS_RECORDS_LOTTERY_CLEAR_DETAIL, {
      record_id: recordId
    })
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取核销订单列表
   * @async
   * @param {Object} [params={}] - 查询参数
   * @param {string} [params.status] - 订单状态
   * @param {number} [params.user_id] - 用户ID
   * @param {number} [params.store_id] - 门店ID
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} 订单列表
   */
  async getRedemptionOrders(params = {}) {
    const url = MARKET_ENDPOINTS.BUSINESS_RECORDS_REDEMPTION + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取核销订单详情
   * @async
   * @param {number} orderId - 订单ID
   * @returns {Promise<Object>} 订单详情
   */
  async getRedemptionOrderDetail(orderId) {
    const url = buildURL(MARKET_ENDPOINTS.BUSINESS_RECORDS_REDEMPTION_DETAIL, { order_id: orderId })
    return await request({ url, method: 'GET' })
  },

  /**
   * 执行核销订单
   * @async
   * @param {number} orderId - 订单ID
   * @param {Object} [data={}] - 核销数据
   * @returns {Promise<Object>} 核销结果
   */
  async redeemOrder(orderId, data = {}) {
    const url = buildURL(MARKET_ENDPOINTS.BUSINESS_RECORDS_REDEMPTION_REDEEM, { order_id: orderId })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 取消核销订单
   * @async
   * @param {number} orderId - 订单ID
   * @param {Object} [data={}] - 取消数据
   * @returns {Promise<Object>} 取消结果
   */
  async cancelRedemptionOrder(orderId, data = {}) {
    const url = buildURL(MARKET_ENDPOINTS.BUSINESS_RECORDS_REDEMPTION_CANCEL, { order_id: orderId })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 获取内容审核记录列表
   * @async
   * @param {Object} [params={}] - 查询参数
   * @param {string} [params.status] - 审核状态
   * @param {string} [params.content_type] - 内容类型
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} 记录列表
   */
  async getContentReviews(params = {}) {
    const url = MARKET_ENDPOINTS.BUSINESS_RECORDS_CONTENT_REVIEWS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取内容审核记录详情
   * @async
   * @param {number} auditId - 审核ID
   * @returns {Promise<Object>} 记录详情
   */
  async getContentReviewDetail(auditId) {
    const url = buildURL(MARKET_ENDPOINTS.BUSINESS_RECORDS_CONTENT_REVIEWS_DETAIL, {
      audit_id: auditId
    })
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取用户角色变更记录列表
   * @async
   * @param {Object} [params={}] - 查询参数
   * @param {number} [params.user_id] - 用户ID
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} 记录列表
   */
  async getRoleChangeRecords(params = {}) {
    const url = MARKET_ENDPOINTS.BUSINESS_RECORDS_ROLE_CHANGES + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取用户角色变更记录详情
   * @async
   * @param {number} recordId - 记录ID
   * @returns {Promise<Object>} 记录详情
   */
  async getRoleChangeRecordDetail(recordId) {
    const url = buildURL(MARKET_ENDPOINTS.BUSINESS_RECORDS_ROLE_CHANGES_DETAIL, {
      record_id: recordId
    })
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取用户状态变更记录列表
   * @async
   * @param {Object} [params={}] - 查询参数
   * @param {number} [params.user_id] - 用户ID
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} 记录列表
   */
  async getStatusChangeRecords(params = {}) {
    const url = MARKET_ENDPOINTS.BUSINESS_RECORDS_STATUS_CHANGES + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取用户状态变更记录详情
   * @async
   * @param {number} recordId - 记录ID
   * @returns {Promise<Object>} 记录详情
   */
  async getStatusChangeRecordDetail(recordId) {
    const url = buildURL(MARKET_ENDPOINTS.BUSINESS_RECORDS_STATUS_CHANGES_DETAIL, {
      record_id: recordId
    })
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取兑换记录列表
   * @async
   * @param {Object} [params={}] - 查询参数
   * @param {number} [params.user_id] - 用户ID
   * @param {number} [params.item_id] - 商品ID
   * @param {string} [params.status] - 订单状态
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} 记录列表
   */
  async getExchangeRecords(params = {}) {
    const url = MARKET_ENDPOINTS.BUSINESS_RECORDS_EXCHANGE + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取兑换记录详情
   * @async
   * @param {number} recordId - 记录ID
   * @returns {Promise<Object>} 记录详情
   */
  async getExchangeRecordDetail(recordId) {
    const url = buildURL(MARKET_ENDPOINTS.BUSINESS_RECORDS_EXCHANGE_DETAIL, { record_id: recordId })
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取聊天消息记录列表
   * @async
   * @param {Object} [params={}] - 查询参数
   * @param {number} [params.session_id] - 会话ID
   * @param {number} [params.sender_id] - 发送者ID
   * @param {string} [params.message_type] - 消息类型
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} 记录列表
   */
  async getChatMessages(params = {}) {
    const url = MARKET_ENDPOINTS.BUSINESS_RECORDS_CHAT + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取聊天消息详情
   * @async
   * @param {number} messageId - 消息ID
   * @returns {Promise<Object>} 消息详情
   */
  async getChatMessageDetail(messageId) {
    const url = buildURL(MARKET_ENDPOINTS.BUSINESS_RECORDS_CHAT_DETAIL, { message_id: messageId })
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取聊天消息统计汇总
   * @async
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 统计汇总
   */
  async getChatMessageStats(params = {}) {
    const url = MARKET_ENDPOINTS.BUSINESS_RECORDS_CHAT_STATS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  // ===== 交易订单扩展 =====

  /**
   * 获取交易订单列表（扩展）
   * @async
   * @param {Object} [params={}] - 查询参数
   * @param {number} [params.buyer_user_id] - 买家ID
   * @param {number} [params.seller_user_id] - 卖家ID
   * @param {string} [params.status] - 订单状态
   * @param {string} [params.asset_code] - 结算资产代码
   * @param {string} [params.start_time] - 开始时间
   * @param {string} [params.end_time] - 结束时间
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} 订单列表
   */
  async getTradeOrdersList(params = {}) {
    const url = MARKET_ENDPOINTS.TRADE_ORDERS_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取交易订单详情（通过ID）
   * @async
   * @param {number} orderId - 订单ID
   * @returns {Promise<Object>} 订单详情
   */
  async getTradeOrderById(orderId) {
    const url = buildURL(MARKET_ENDPOINTS.TRADE_ORDERS_DETAIL, { id: orderId })
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取交易订单统计
   * @async
   * @param {Object} [params={}] - 查询参数
   * @param {string} [params.start_time] - 开始时间
   * @param {string} [params.end_time] - 结束时间
   * @returns {Promise<Object>} 统计数据
   */
  async getTradeOrdersStats(params = {}) {
    const url = MARKET_ENDPOINTS.TRADE_ORDERS_STATS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取用户交易订单统计
   * @async
   * @param {number} userId - 用户ID
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 用户统计数据
   */
  async getUserTradeOrdersStats(userId, params = {}) {
    const url =
      buildURL(MARKET_ENDPOINTS.TRADE_ORDERS_USER_STATS, { user_id: userId }) +
      buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 按业务ID查询交易订单
   * @async
   * @param {string} businessId - 业务ID
   * @returns {Promise<Object>} 订单信息
   */
  async getTradeOrderByBusinessId(businessId) {
    const url = buildURL(MARKET_ENDPOINTS.TRADE_ORDERS_BY_BUSINESS_ID, { business_id: businessId })
    return await request({ url, method: 'GET' })
  },

  // ===== 市场综合统计 =====

  /**
   * 获取市场综合统计
   * @async
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 市场统计数据
   */
  async getMarketplaceStats(params = {}) {
    const url = MARKET_ENDPOINTS.MARKETPLACE_STATS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取C2C市场列表（别名）
   * @async
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 市场列表
   */
  async getC2CMarketList(params = {}) {
    const url = MARKET_ENDPOINTS.C2C_MARKET_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取C2C市场详情
   * @async
   * @param {number} listingId - 挂牌ID
   * @returns {Promise<Object>} 挂牌详情
   */
  async getC2CMarketDetail(listingId) {
    const url = buildURL(MARKET_ENDPOINTS.C2C_MARKET_DETAIL, { listing_id: listingId })
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取C2C市场统计
   * @async
   * @param {Object} [params={}] - 查询参数
   * @returns {Promise<Object>} 统计数据
   */
  async getC2CMarketStats(params = {}) {
    const url = MARKET_ENDPOINTS.C2C_MARKET_STATS + buildQueryString(params)
    return await request({ url, method: 'GET' })
  }
}

export default MarketAPI
