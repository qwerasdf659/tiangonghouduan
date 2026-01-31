'use strict'

/**
 * @file 抽奖分析模块索引
 * @description 提供统一的抽奖分析服务访问接口
 *
 * 拆分自原 LotteryAnalyticsService.js (4,744行)
 * 拆分为5个子服务，按职责划分：
 *
 * 1. RealtimeService - 实时监控和告警 (~800行)
 * 2. StatisticsService - 统计趋势分析 (~900行)
 * 3. ReportService - 报表生成 (~700行)
 * 4. UserAnalysisService - 用户维度分析 (~800行)
 * 5. CampaignAnalysisService - 活动维度分析 (~1000行)
 *
 * 服务注册键（业务域优先命名）：
 * - lottery_analytics_realtime
 * - lottery_analytics_statistics
 * - lottery_analytics_report
 * - lottery_analytics_user
 * - lottery_analytics_campaign
 *
 * @module services/lottery-analytics
 * @version 1.0.0
 * @date 2026-01-31
 */

const RealtimeService = require('./RealtimeService')
const StatisticsService = require('./StatisticsService')
const ReportService = require('./ReportService')
const UserAnalysisService = require('./UserAnalysisService')
const CampaignAnalysisService = require('./CampaignAnalysisService')

module.exports = {
  RealtimeService,
  StatisticsService,
  ReportService,
  UserAnalysisService,
  CampaignAnalysisService
}
