/**
 * 市场挂牌服务模块入口（market-listing）
 *
 * V4.7.0 大文件拆分方案 Phase 3
 * 原 CoreService.js (1375行) 进一步拆分为5个子服务：
 *
 * 子服务划分：
 * - CoreService: 挂牌/撤回核心操作
 * - QueryService: 查询/搜索/筛选
 * - AdminService: 管理控制（暂停/恢复）
 * - ValidationService: 校验/配置/风控
 * - AdminListingService: 管理员挂牌操作（强制撤回）
 *
 * @module services/market-listing
 */

const CoreService = require('./CoreService')
const QueryService = require('./QueryService')
const AdminService = require('./AdminService')
const ValidationService = require('./ValidationService')
const AdminListingService = require('./AdminListingService')

module.exports = {
  CoreService,
  QueryService,
  AdminService,
  ValidationService,
  AdminListingService
}
