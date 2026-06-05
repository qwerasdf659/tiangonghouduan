/**
 * V4.7.0 AdminLotteryService 拆分子服务入口
 *
 * 原 AdminLotteryService.js (1781行) 拆分为多个子服务：
 * - CampaignService: 活动管理操作（状态同步/预算管理/每日重置）
 * - QueryService: 干预规则查询服务（列表/详情/格式化）
 *
 * P2 路由层合规治理新增：
 * - CRUDService: 活动 CRUD 操作（创建/更新/删除活动，收口路由层直接操作模型）
 * - DisplayService: 活动展示控制（精选/隐藏/展示配置/批量排序）
 *
 * 拆分日期：2026-01-31
 * 拆分原因：大文件拆分方案（保持单体架构）Phase 6
 *
 * 2026-06-04 合规改造：CoreService（force_win/force_lose/probability_adjust/user_queue
 * 等 per-user 暗箱干预）整体下线，对应文件已删除。个人发奖统一走 cs_compensate 明示补偿。
 */
const CampaignService = require('./CampaignService')
const QueryService = require('./QueryService')
const CRUDService = require('./CRUDService')
const DisplayService = require('./DisplayService')

module.exports = {
  CampaignService,
  QueryService,
  CRUDService,
  DisplayService
}
