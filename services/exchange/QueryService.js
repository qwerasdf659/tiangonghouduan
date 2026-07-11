'use strict'

/**
 * 天工商户营销平台 V4.7.0 - 兑换市场查询服务（Facade 入口）
 * Exchange Query Service Facade（技术债务方案 7.4-2：大文件拆分）
 *
 * 拆分背景：原 QueryService.js (2547行) 超过 1500 行阈值，
 * 按查询域拆分为 3 个子服务，本文件保留为 Facade 转发层：
 * - 对外方法签名完全不变（纯搬移不改行为）；
 * - getService('exchange_query') 服务键不变（services/index.js 注册无需改动）；
 * - 子服务不独立注册服务键，经本 Facade 持有（防单例状态分裂）。
 *
 * 子服务清单（services/exchange/query/）：
 * - MallQueryService: 商城列表/详情查询（getMarketItems/getItemDetail/attachLevelRequirements/
 *   listExchangeItems/getExchangeItemDetail）
 * - OrderQueryService: 订单/兑换记录查询（getUserOrders/getOrderDetail/getAdminOrders/
 *   getAdminOrderDetail/getOrderContact/getOrderByShippingNo/scanShippingTimeouts）
 * - StatsQueryService: 统计查询（getMarketStatistics/getSpaceStats/getExchangeItemStats/
 *   getExchangeTrend/getItemRanking）
 *
 * @module services/exchange/QueryService
 * @created 2026-01-31（大文件拆分方案 Phase 4）
 * @updated 2026-07-11（技术债务方案 7.4-2：拆分为 query/ 子目录 + Facade）
 */

const MallQueryService = require('./query/MallQueryService')
const OrderQueryService = require('./query/OrderQueryService')
const StatsQueryService = require('./query/StatsQueryService')

/* eslint-disable require-jsdoc */
class QueryService {
  /**
   * 构造函数
   *
   * @param {Object} models - Sequelize 模型对象
   */
  constructor(models) {
    this.models = models
    this._mall = new MallQueryService(models)
    this._order = new OrderQueryService(models)
    this._stats = new StatsQueryService(models)
  }

  // --- MallQueryService（商城列表/详情查询）---
  getMarketItems(...args) {
    return this._mall.getMarketItems(...args)
  }

  getItemDetail(...args) {
    return this._mall.getItemDetail(...args)
  }

  attachLevelRequirements(...args) {
    return this._mall.attachLevelRequirements(...args)
  }

  listExchangeItems(...args) {
    return this._mall.listExchangeItems(...args)
  }

  getExchangeItemDetail(...args) {
    return this._mall.getExchangeItemDetail(...args)
  }

  // --- OrderQueryService（订单/兑换记录查询）---
  getUserOrders(...args) {
    return this._order.getUserOrders(...args)
  }

  getOrderDetail(...args) {
    return this._order.getOrderDetail(...args)
  }

  getAdminOrders(...args) {
    return this._order.getAdminOrders(...args)
  }

  getAdminOrderDetail(...args) {
    return this._order.getAdminOrderDetail(...args)
  }

  getOrderContact(...args) {
    return this._order.getOrderContact(...args)
  }

  getOrderByShippingNo(...args) {
    return this._order.getOrderByShippingNo(...args)
  }

  scanShippingTimeouts(...args) {
    return this._order.scanShippingTimeouts(...args)
  }

  // --- StatsQueryService（统计查询）---
  getMarketStatistics(...args) {
    return this._stats.getMarketStatistics(...args)
  }

  getSpaceStats(...args) {
    return this._stats.getSpaceStats(...args)
  }

  getExchangeItemStats(...args) {
    return this._stats.getExchangeItemStats(...args)
  }

  getExchangeTrend(...args) {
    return this._stats.getExchangeTrend(...args)
  }

  getItemRanking(...args) {
    return this._stats.getItemRanking(...args)
  }
}

module.exports = QueryService
