'use strict'

/**
 * @file 抽奖指标日报聚合定时任务
 * @description 每日凌晨执行，将 lottery_hourly_metrics 聚合到 lottery_daily_metrics 表。
 *
 * 核心业务场景：
 * - 从 lottery_hourly_metrics 读取前一天（24小时）的小时级数据
 * - 计算日报派生指标（日空奖率、日高价值率、日均消耗等）
 * - 写入 lottery_daily_metrics 表（永久保留）
 *
 * 执行时机：每日凌晨 01:05（避开整点业务高峰和小时聚合任务）
 * Cron 表达式：5 1 * * *
 *
 * 数据流向：
 * - 读取：MySQL lottery_hourly_metrics（上一天 24 条记录）
 * - 写入：MySQL lottery_daily_metrics
 *
 * 设计原则：
 * - 使用事务保证数据一致性
 * - 支持幂等执行（同一日期重复执行不会产生重复记录）
 * - 静默错误处理（不影响其他活动的聚合）
 *
 * @version 1.0.0
 * @date 2026-01-22
 * @module jobs/daily-lottery-metrics-aggregation
 */

const {
  LotteryDailyMetrics,
  LotteryHourlyMetrics,
  LotteryCampaign,
  sequelize
} = require('../models')
const { Op, literal } = require('sequelize')
const logger = require('../utils/logger').logger
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 抽奖指标日报聚合任务类
 *
 * @class DailyLotteryMetricsAggregation
 */
class DailyLotteryMetricsAggregation {
  /**
   * 创建任务实例
   *
   * @param {Object} options - 配置选项
   * @param {boolean} options.silent_errors - 是否静默错误（默认 true）
   */
  constructor(options = {}) {
    this.silent_errors = options.silent_errors !== false
  }

  /**
   * 获取需要聚合的活动ID列表
   * 包括激活和已结束的活动（已结束活动可能还有历史数据需要聚合）
   *
   * @returns {Promise<Array<number>>} 活动ID数组
   */
  async getCampaignIds() {
    try {
      const campaigns = await LotteryCampaign.findAll({
        where: {
          status: { [Op.in]: ['active', 'completed', 'ended'] }
        },
        attributes: ['campaign_id']
      })
      return campaigns.map(c => c.campaign_id)
    } catch (error) {
      logger.error('[DailyLotteryMetricsAggregation] 获取活动列表失败', {
        error: error.message
      })
      return []
    }
  }

  /**
   * 获取前一天的日期范围（北京时间）
   *
   * @returns {Object} { date_str: 'YYYY-MM-DD', start_datetime: Date, end_datetime: Date }
   */
  getYesterdayRange() {
    // 获取当前时间并往前推一天
    const now = new Date()
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // 格式化为 YYYY-MM-DD（北京时间）
    const date_str = BeijingTimeHelper.formatDate(yesterday, 'YYYY-MM-DD')

    // 计算昨天的开始和结束时间（北京时间）
    const start_datetime = BeijingTimeHelper.startOfDay(yesterday)
    const end_datetime = BeijingTimeHelper.endOfDay(yesterday)

    return {
      date_str,
      start_datetime,
      end_datetime
    }
  }

  /**
   * 聚合单个活动的日报指标
   *
   * @param {number} campaign_id - 活动ID
   * @param {string} date_str - 日期字符串（YYYY-MM-DD）
   * @param {Date} start_datetime - 开始时间
   * @param {Date} end_datetime - 结束时间
   * @returns {Promise<Object|null>} 聚合结果或 null
   */
  async aggregateCampaign(campaign_id, date_str, start_datetime, end_datetime) {
    const transaction = await sequelize.transaction()

    try {
      // 1. 从 lottery_hourly_metrics 聚合该日的数据
      const hourly_aggregation = await LotteryHourlyMetrics.findOne({
        where: {
          campaign_id,
          hour_bucket: {
            [Op.gte]: start_datetime,
            [Op.lte]: end_datetime
          }
        },
        attributes: [
          [literal('SUM(total_draws)'), 'total_draws'],
          [literal('MAX(unique_users)'), 'unique_users'], // 取最大值（日级独立用户数）
          [literal('SUM(high_tier_count)'), 'high_tier_count'],
          [literal('SUM(mid_tier_count)'), 'mid_tier_count'],
          [literal('SUM(low_tier_count)'), 'low_tier_count'],
          [literal('SUM(fallback_tier_count)'), 'fallback_tier_count'],
          [literal('SUM(total_budget_consumed)'), 'total_budget_consumed'],
          [literal('SUM(total_prize_value)'), 'total_prize_value'],
          [literal('SUM(b0_tier_count)'), 'b0_count'],
          [literal('SUM(b1_tier_count)'), 'b1_count'],
          [literal('SUM(b2_tier_count)'), 'b2_count'],
          [literal('SUM(b3_tier_count)'), 'b3_count'],
          [literal('SUM(pity_triggered_count)'), 'pity_trigger_count'],
          [literal('SUM(anti_empty_triggered_count)'), 'anti_empty_trigger_count'],
          [literal('SUM(anti_high_triggered_count)'), 'anti_high_trigger_count'],
          [literal('SUM(luck_debt_triggered_count)'), 'luck_debt_trigger_count']
        ],
        raw: true,
        transaction
      })

      // 如果没有小时级数据，跳过
      if (!hourly_aggregation || !hourly_aggregation.total_draws) {
        await transaction.rollback()
        logger.debug('[DailyLotteryMetricsAggregation] 无小时级数据，跳过', {
          campaign_id,
          date_str
        })
        return null
      }

      // 2. 计算派生指标
      const total_draws = parseInt(hourly_aggregation.total_draws) || 0
      const unique_users = parseInt(hourly_aggregation.unique_users) || 0
      const high_tier_count = parseInt(hourly_aggregation.high_tier_count) || 0
      const fallback_tier_count = parseInt(hourly_aggregation.fallback_tier_count) || 0
      const total_budget_consumed = parseFloat(hourly_aggregation.total_budget_consumed) || 0
      const total_prize_value = parseFloat(hourly_aggregation.total_prize_value) || 0

      const empty_rate = total_draws > 0 ? fallback_tier_count / total_draws : 0
      const high_value_rate = total_draws > 0 ? high_tier_count / total_draws : 0
      const avg_budget_per_draw = total_draws > 0 ? total_budget_consumed / total_draws : 0
      const avg_prize_value = total_draws > 0 ? total_prize_value / total_draws : 0

      // 3. 写入或更新 lottery_daily_metrics（幂等性：使用 findOrCreate）
      const [daily_metrics, created] = await LotteryDailyMetrics.findOrCreate({
        where: {
          campaign_id,
          metric_date: date_str
        },
        defaults: {
          campaign_id,
          metric_date: date_str,
          total_draws,
          unique_users,
          high_tier_count,
          mid_tier_count: parseInt(hourly_aggregation.mid_tier_count) || 0,
          low_tier_count: parseInt(hourly_aggregation.low_tier_count) || 0,
          fallback_tier_count,
          total_budget_consumed: parseFloat(total_budget_consumed.toFixed(2)),
          avg_budget_per_draw: parseFloat(avg_budget_per_draw.toFixed(2)),
          total_prize_value: parseFloat(total_prize_value.toFixed(2)),
          b0_count: parseInt(hourly_aggregation.b0_count) || 0,
          b1_count: parseInt(hourly_aggregation.b1_count) || 0,
          b2_count: parseInt(hourly_aggregation.b2_count) || 0,
          b3_count: parseInt(hourly_aggregation.b3_count) || 0,
          pity_trigger_count: parseInt(hourly_aggregation.pity_trigger_count) || 0,
          anti_empty_trigger_count: parseInt(hourly_aggregation.anti_empty_trigger_count) || 0,
          anti_high_trigger_count: parseInt(hourly_aggregation.anti_high_trigger_count) || 0,
          luck_debt_trigger_count: parseInt(hourly_aggregation.luck_debt_trigger_count) || 0,
          empty_rate: parseFloat(empty_rate.toFixed(4)),
          high_value_rate: parseFloat(high_value_rate.toFixed(4)),
          avg_prize_value: parseFloat(avg_prize_value.toFixed(2)),
          aggregated_at: new Date()
        },
        transaction
      })

      // 如果记录已存在，更新数据（覆盖式更新）
      if (!created) {
        await daily_metrics.update(
          {
            total_draws,
            unique_users,
            high_tier_count,
            mid_tier_count: parseInt(hourly_aggregation.mid_tier_count) || 0,
            low_tier_count: parseInt(hourly_aggregation.low_tier_count) || 0,
            fallback_tier_count,
            total_budget_consumed: parseFloat(total_budget_consumed.toFixed(2)),
            avg_budget_per_draw: parseFloat(avg_budget_per_draw.toFixed(2)),
            total_prize_value: parseFloat(total_prize_value.toFixed(2)),
            b0_count: parseInt(hourly_aggregation.b0_count) || 0,
            b1_count: parseInt(hourly_aggregation.b1_count) || 0,
            b2_count: parseInt(hourly_aggregation.b2_count) || 0,
            b3_count: parseInt(hourly_aggregation.b3_count) || 0,
            pity_trigger_count: parseInt(hourly_aggregation.pity_trigger_count) || 0,
            anti_empty_trigger_count: parseInt(hourly_aggregation.anti_empty_trigger_count) || 0,
            anti_high_trigger_count: parseInt(hourly_aggregation.anti_high_trigger_count) || 0,
            luck_debt_trigger_count: parseInt(hourly_aggregation.luck_debt_trigger_count) || 0,
            empty_rate: parseFloat(empty_rate.toFixed(4)),
            high_value_rate: parseFloat(high_value_rate.toFixed(4)),
            avg_prize_value: parseFloat(avg_prize_value.toFixed(2)),
            aggregated_at: new Date()
          },
          { transaction }
        )
      }

      await transaction.commit()

      logger.info('[DailyLotteryMetricsAggregation] 活动日报聚合完成', {
        campaign_id,
        date_str,
        total_draws,
        unique_users,
        empty_rate: parseFloat(empty_rate.toFixed(4)),
        created
      })

      return {
        campaign_id,
        date_str,
        total_draws,
        unique_users,
        empty_rate: parseFloat(empty_rate.toFixed(4)),
        high_value_rate: parseFloat(high_value_rate.toFixed(4)),
        created
      }
    } catch (error) {
      await transaction.rollback()

      if (this.silent_errors) {
        logger.warn('[DailyLotteryMetricsAggregation] 活动日报聚合失败（静默处理）', {
          campaign_id,
          date_str,
          error: error.message
        })
        return null
      }

      throw error
    }
  }

  /**
   * 执行日报聚合任务
   *
   * @returns {Promise<Object>} 执行结果
   */
  async execute() {
    const start_time = Date.now()
    logger.info('[DailyLotteryMetricsAggregation] 开始执行日报聚合任务')

    try {
      // 1. 获取日期范围信息
      const { date_str, start_datetime, end_datetime } = this.getYesterdayRange()

      // 2. 获取活动列表
      const campaign_ids = await this.getCampaignIds()

      if (campaign_ids.length === 0) {
        logger.info('[DailyLotteryMetricsAggregation] 无活动，跳过日报聚合')
        return {
          success: true,
          date_str,
          campaigns_processed: 0,
          duration_ms: Date.now() - start_time
        }
      }

      // 3. 逐个活动聚合（错误隔离）
      const results = []
      let success_count = 0
      let error_count = 0

      for (const campaign_id of campaign_ids) {
        try {
          // eslint-disable-next-line no-await-in-loop -- 故意逐个活动串行聚合，避免事务冲突和数据库压力
          const result = await this.aggregateCampaign(
            campaign_id,
            date_str,
            start_datetime,
            end_datetime
          )

          if (result) {
            results.push(result)
            success_count++
          }
        } catch (error) {
          error_count++
          logger.error('[DailyLotteryMetricsAggregation] 单个活动日报聚合失败', {
            campaign_id,
            error: error.message
          })
        }
      }

      const duration_ms = Date.now() - start_time

      logger.info('[DailyLotteryMetricsAggregation] 日报聚合任务完成', {
        date_str,
        total_campaigns: campaign_ids.length,
        success_count,
        error_count,
        duration_ms
      })

      return {
        success: true,
        date_str,
        campaigns_total: campaign_ids.length,
        campaigns_processed: success_count,
        campaigns_failed: error_count,
        results,
        duration_ms
      }
    } catch (error) {
      const duration_ms = Date.now() - start_time

      logger.error('[DailyLotteryMetricsAggregation] 日报聚合任务执行失败', {
        error: error.message,
        stack: error.stack,
        duration_ms
      })

      return {
        success: false,
        error: error.message,
        duration_ms
      }
    }
  }
}

module.exports = DailyLotteryMetricsAggregation
