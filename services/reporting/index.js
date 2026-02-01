/**
 * 报表服务子模块入口（V4.7.0 大文件拆分）
 *
 * @description 原 ReportingService.js (1820行) 已拆分为多个子服务
 * @see docs/大文件拆分方案（保持单体架构）.md
 *
 * 子服务职责划分：
 * - AnalyticsService: 决策分析、趋势分析
 * - ChartsService: 图表数据生成
 * - StatsService: 统计概览、用户画像、库存统计
 * - MultiDimensionStatsService: 多维度组合统计、下钻明细（B-25/B-27）
 */
const AnalyticsService = require('./AnalyticsService')
const ChartsService = require('./ChartsService')
const StatsService = require('./StatsService')
const MultiDimensionStatsService = require('./MultiDimensionStatsService')

module.exports = {
  AnalyticsService,
  ChartsService,
  StatsService,
  MultiDimensionStatsService
}
