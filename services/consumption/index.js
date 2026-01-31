/**
 * 消费记录服务子服务入口
 * V4.7.0 ConsumptionService 拆分（2026-01-31 大文件拆分方案 Phase 4）
 *
 * 原 ConsumptionService.js (1826行) 已拆分为3个子服务：
 * - CoreService: 核心操作（提交/审核/删除/恢复）
 * - QueryService: 查询服务（用户/管理员/待审核列表）
 * - MerchantService: 商家侧服务（商家员工专用查询）
 *
 * @module services/consumption
 */
const CoreService = require('./CoreService')
const QueryService = require('./QueryService')
const MerchantService = require('./MerchantService')

module.exports = {
  CoreService,
  QueryService,
  MerchantService
}
