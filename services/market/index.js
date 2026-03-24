'use strict'

/**
 * 市场域目录入口
 *
 * @description 价格发现、市场数据分析等 C2C 市场公共服务
 * @module services/market
 */

const PriceDiscoveryService = require('./PriceDiscoveryService')
const MarketAnalyticsService = require('./MarketAnalyticsService')

module.exports = {
  PriceDiscoveryService,
  MarketAnalyticsService
}
