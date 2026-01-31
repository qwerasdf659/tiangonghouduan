// services/admin-lottery/index.js
/**
 * V4.7.0 AdminLotteryService 拆分子服务入口
 *
 * 原 AdminLotteryService.js (1781行) 拆分为3个子服务：
 * - CoreService: 核心干预操作（强制中奖/不中奖/概率调整/队列设置/清除设置）
 * - CampaignService: 活动管理操作（状态同步/预算管理/每日重置）
 * - QueryService: 干预规则查询服务（列表/详情/格式化）
 *
 * P2 路由层合规治理（2026-01-31）新增：
 * - CRUDService: 活动 CRUD 操作（创建/更新/删除活动，收口路由层直接操作模型）
 *
 * 拆分日期：2026-01-31
 * 拆分原因：大文件拆分方案（保持单体架构）Phase 6
 */
const CoreService = require('./CoreService')
const CampaignService = require('./CampaignService')
const QueryService = require('./QueryService')
const CRUDService = require('./CRUDService') // P2 路由层合规治理

module.exports = {
  CoreService,
  CampaignService,
  QueryService,
  CRUDService
}
