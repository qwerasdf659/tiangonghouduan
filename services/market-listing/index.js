/**
 * 市场挂牌服务模块入口（market-listing）
 *
 * V4.7.0 大文件拆分方案 Phase 2（2026-01-31）
 * 原 MarketListingService.js (2295行) 拆分为3个子服务：
 *
 * 子服务划分：
 * - CoreService: 挂牌/撤回核心操作（~800行）
 * - QueryService: 查询/搜索/筛选（~700行）
 * - AdminService: 管理控制（暂停/恢复）（~500行）
 *
 * 服务键命名规范：业务域前缀_功能_snake_case
 * - market_listing_core: 核心挂牌操作
 * - market_listing_query: 查询服务
 * - market_listing_admin: 管理服务
 *
 * @module services/market-listing
 */

const CoreService = require('./CoreService')
const QueryService = require('./QueryService')
const AdminService = require('./AdminService')

module.exports = {
  CoreService,
  QueryService,
  AdminService
}
