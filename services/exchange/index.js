/**
 * 餐厅积分抽奖系统 V4.7.0 - 兑换市场服务入口
 * Exchange Service Entry Point（大文件拆分方案 Phase 4）
 *
 * 拆分原因：原 ExchangeService.js (1873行) 超过1500行阈值
 * 拆分策略：按职责边界拆分为3个子服务（单一职责原则）
 *
 * 子服务清单：
 * - CoreService: 核心兑换操作（兑换执行、订单状态更新）
 * - QueryService: 查询服务（商品列表、订单查询、统计数据）
 * - AdminService: 管理后台操作（商品CRUD、用户统计、超时检查）
 *
 * 服务键命名规范：业务域前缀_功能_snake_case
 * - exchange_core: 核心兑换服务
 * - exchange_query: 查询服务
 * - exchange_admin: 管理后台服务
 *
 * @module services/exchange
 * @created 2026-01-31（大文件拆分方案 Phase 4）
 */

const CoreService = require('./CoreService')
const QueryService = require('./QueryService')
const AdminService = require('./AdminService')

module.exports = {
  CoreService,
  QueryService,
  AdminService
}
