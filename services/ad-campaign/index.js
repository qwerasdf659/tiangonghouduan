/**
 * 广告活动服务模块入口（ad-campaign）
 *
 * 子服务划分：
 * - QueryService: 日志查询/标签浏览（竞价日志、反作弊日志、归因日志、用户标签）
 *
 * 服务键命名规范：业务域前缀_功能_snake_case
 * - ad_campaign_query: 广告活动日志查询服务（静态类）
 *
 * 注意：AdCampaignService（活动管理写服务）仍保留在 services/AdCampaignService.js
 * 本模块仅收口"路由层直连 models"的读查询
 *
 * @module services/ad-campaign
 */

const QueryService = require('./QueryService')

module.exports = {
  QueryService
}
