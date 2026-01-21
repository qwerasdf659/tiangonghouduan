'use strict'

/**
 * @file 抽奖指标小时聚合定时任务
 * @description 每小时整点执行，将 Redis 实时计数器聚合到 lottery_hourly_metrics 表。
 *
 * 核心业务场景：
 * - 从 Redis 读取上一小时的实时指标计数
 * - 计算派生指标（空奖率、高价值率、平均消耗等）
 * - 写入 lottery_hourly_metrics 表
 * - 可选：清理已聚合的 Redis 数据
 *
 * 执行时机：每小时整点后第 5 分钟（避开整点业务高峰）
 * Cron 表达式：5 * * * *
 *
 * 数据流向：
 * - 读取：Redis lottery:metrics:{campaign_id}:*:{hour_bucket}
 * - 写入：MySQL lottery_hourly_metrics
 *
 * 设计原则：
 * - 使用事务保证数据一致性
 * - 支持幂等执行（同一小时重复执行不会产生重复记录）
 * - 静默错误处理（不影响其他活动的聚合）
 *
 * @version 1.0.0
 * @date 2026-01-22
 * @module jobs/hourly-lottery-metrics-aggregation
 */

const { LotteryHourlyMetrics, LotteryCampaign, sequelize } = require('../models')
const { getInstance: getMetricsCollector } = require('../services/LotteryMetricsCollector')
const logger = require('../utils/logger').logger
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 抽奖指标小时聚合任务类
 *
 * @class HourlyLotteryMetricsAggregation
 */
class HourlyLotteryMetricsAggregation {
  /**
   * 创建任务实例
   *
   * @param {Object} options - 配置选项
   * @param {boolean} options.cleanup_redis - 聚合后是否清理 Redis 数据（默认 false，保留用于降级查询）
   * @param {boolean} options.silent_errors - 是否静默错误（默认 true）
   */
  constructor(options = {}) {
    this.cleanup_redis = options.cleanup_redis === true
    this.silent_errors = options.silent_errors !== false
    this.collector = getMetricsCollector()
  }

  /**
   * 获取需要聚合的活动ID列表
   * 仅处理激活状态的活动
   *
   * @returns {Promise<Array<number>>} 活动ID数组
   */
  async getActiveCampaignIds() {
    try {
      const campaigns = await LotteryCampaign.findAll({
        where: { status: 'active' },
        attributes: ['campaign_id']
      })
      return campaigns.map(c => c.campaign_id)
    } catch (error) {
      logger.error('[HourlyLotteryMetricsAggregation] 获取活动列表失败', {
        error: error.message
      })
      return []
    }
  }

  /**
   * 计算上一小时的时间桶标识（北京时间）
   *
   * @returns {Object} { hour_bucket: 'YYYYMMDDHH', hour_start: Date, hour_end: Date, hour_bucket_datetime: Date }
   */
  getLastHourBucket() {
    // 获取当前北京时间
    const now = new Date()
    // 往前推一小时
    const last_hour = new Date(now.getTime() - 60 * 60 * 1000)

    // 格式化为 YYYYMMDDHH（北京时间）
    const formatted = BeijingTimeHelper.formatDate(last_hour, 'YYYY-MM-DD HH:mm:ss')
    const hour_bucket =
      formatted.substring(0, 4) +
      formatted.substring(5, 7) +
      formatted.substring(8, 10) +
      formatted.substring(11, 13)

    /*
     * 计算小时的开始和结束时间
     * 使用 BeijingTimeHelper.startOfDay 并加上小时偏移
     */
    const hour_start_date = BeijingTimeHelper.startOfDay(last_hour)
    const hour_offset = parseInt(formatted.substring(11, 13)) * 60 * 60 * 1000
    const hour_start = new Date(hour_start_date.getTime() + hour_offset)
    const hour_end = new Date(hour_start.getTime() + 60 * 60 * 1000 - 1)

    return {
      hour_bucket,
      hour_start,
      hour_end,
      hour_bucket_datetime: hour_start // 用于写入 hour_bucket 字段
    }
  }

  /**
   * 聚合单个活动的指标
   *
   * @param {number} campaign_id - 活动ID
   * @param {string} hour_bucket - 小时桶标识
   * @param {Date} hour_bucket_datetime - 小时桶的 DateTime 对象
   * @param {string} date_bucket - 日期桶标识（用于获取独立用户数）
   * @returns {Promise<Object|null>} 聚合结果或 null
   */
  async aggregateCampaign(campaign_id, hour_bucket, hour_bucket_datetime, date_bucket) {
    const transaction = await sequelize.transaction()

    try {
      // 1. 从 Redis 获取该小时的所有指标
      const redis_metrics = await this.collector.getHourMetrics(campaign_id, hour_bucket)

      // 如果没有数据，跳过该活动
      if (!redis_metrics || redis_metrics.total_draws === 0) {
        await transaction.rollback()
        logger.debug('[HourlyLotteryMetricsAggregation] 无抽奖数据，跳过', {
          campaign_id,
          hour_bucket
        })
        return null
      }

      // 2. 获取独立用户数（从 HyperLogLog）
      const unique_users = await this.collector.getUniqueUsersCount(campaign_id, date_bucket)

      // 3. 计算派生指标
      const total_draws = redis_metrics.total_draws || 0
      const empty_count = redis_metrics.empty_count || 0
      const high_tier_count = redis_metrics.high_tier_count || 0
      const total_budget_consumed = redis_metrics.total_budget_consumed || 0
      const total_prize_value = redis_metrics.total_prize_value || 0

      const empty_rate = total_draws > 0 ? empty_count / total_draws : 0
      const high_value_rate = total_draws > 0 ? high_tier_count / total_draws : 0
      const avg_budget_per_draw = total_draws > 0 ? total_budget_consumed / total_draws : 0
      const avg_prize_value = total_draws > 0 ? total_prize_value / total_draws : 0

      // 4. 写入或更新 lottery_hourly_metrics（幂等性：使用 findOrCreate）
      const [metrics, created] = await LotteryHourlyMetrics.findOrCreate({
        where: {
          campaign_id,
          hour_bucket: hour_bucket_datetime
        },
        defaults: {
          campaign_id,
          hour_bucket: hour_bucket_datetime,
          total_draws,
          unique_users,
          high_tier_count,
          mid_tier_count: redis_metrics.mid_tier_count || 0,
          low_tier_count: redis_metrics.low_tier_count || 0,
          fallback_tier_count: redis_metrics.fallback_tier_count || 0,
          total_budget_consumed,
          avg_budget_per_draw: parseFloat(avg_budget_per_draw.toFixed(2)),
          total_prize_value,
          b0_tier_count: redis_metrics.b0_count || 0,
          b1_tier_count: redis_metrics.b1_count || 0,
          b2_tier_count: redis_metrics.b2_count || 0,
          b3_tier_count: redis_metrics.b3_count || 0,
          pity_triggered_count: redis_metrics.pity_triggered || 0,
          anti_empty_triggered_count: redis_metrics.anti_empty_triggered || 0,
          anti_high_triggered_count: redis_metrics.anti_high_triggered || 0,
          luck_debt_triggered_count: redis_metrics.luck_debt_triggered || 0,
          empty_rate: parseFloat(empty_rate.toFixed(4)),
          high_value_rate: parseFloat(high_value_rate.toFixed(4)),
          avg_prize_value: parseFloat(avg_prize_value.toFixed(2)),
          aggregated_at: new Date()
        },
        transaction
      })

      // 如果记录已存在，更新数据（覆盖式更新）
      if (!created) {
        await metrics.update(
          {
            total_draws,
            unique_users,
            high_tier_count,
            mid_tier_count: redis_metrics.mid_tier_count || 0,
            low_tier_count: redis_metrics.low_tier_count || 0,
            fallback_tier_count: redis_metrics.fallback_tier_count || 0,
            total_budget_consumed,
            avg_budget_per_draw: parseFloat(avg_budget_per_draw.toFixed(2)),
            total_prize_value,
            b0_tier_count: redis_metrics.b0_count || 0,
            b1_tier_count: redis_metrics.b1_count || 0,
            b2_tier_count: redis_metrics.b2_count || 0,
            b3_tier_count: redis_metrics.b3_count || 0,
            pity_triggered_count: redis_metrics.pity_triggered || 0,
            anti_empty_triggered_count: redis_metrics.anti_empty_triggered || 0,
            anti_high_triggered_count: redis_metrics.anti_high_triggered || 0,
            luck_debt_triggered_count: redis_metrics.luck_debt_triggered || 0,
            empty_rate: parseFloat(empty_rate.toFixed(4)),
            high_value_rate: parseFloat(high_value_rate.toFixed(4)),
            avg_prize_value: parseFloat(avg_prize_value.toFixed(2)),
            aggregated_at: new Date()
          },
          { transaction }
        )
      }

      await transaction.commit()

      // 5. 可选：清理 Redis 数据
      if (this.cleanup_redis) {
        try {
          await this.collector.deleteHourMetrics(campaign_id, hour_bucket)
        } catch (cleanup_error) {
          logger.warn('[HourlyLotteryMetricsAggregation] 清理 Redis 数据失败（非致命）', {
            campaign_id,
            hour_bucket,
            error: cleanup_error.message
          })
        }
      }

      logger.info('[HourlyLotteryMetricsAggregation] 活动聚合完成', {
        campaign_id,
        hour_bucket,
        total_draws,
        unique_users,
        empty_rate: parseFloat(empty_rate.toFixed(4)),
        created
      })

      return {
        campaign_id,
        hour_bucket,
        total_draws,
        unique_users,
        empty_rate: parseFloat(empty_rate.toFixed(4)),
        high_value_rate: parseFloat(high_value_rate.toFixed(4)),
        created
      }
    } catch (error) {
      await transaction.rollback()

      if (this.silent_errors) {
        logger.warn('[HourlyLotteryMetricsAggregation] 活动聚合失败（静默处理）', {
          campaign_id,
          hour_bucket,
          error: error.message
        })
        return null
      }

      throw error
    }
  }

  /**
   * 执行聚合任务
   *
   * @returns {Promise<Object>} 执行结果
   */
  async execute() {
    const start_time = Date.now()
    logger.info('[HourlyLotteryMetricsAggregation] 开始执行小时聚合任务')

    try {
      // 1. 获取时间桶信息
      const { hour_bucket, hour_bucket_datetime } = this.getLastHourBucket()
      // 计算上一小时所在的日期桶（YYYYMMDD）
      const last_hour = new Date(Date.now() - 60 * 60 * 1000)
      const date_formatted = BeijingTimeHelper.formatDate(last_hour, 'YYYY-MM-DD')
      const date_bucket = date_formatted.replace(/-/g, '')

      // 2. 获取活动列表
      const campaign_ids = await this.getActiveCampaignIds()

      if (campaign_ids.length === 0) {
        logger.info('[HourlyLotteryMetricsAggregation] 无激活活动，跳过聚合')
        return {
          success: true,
          hour_bucket,
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
            hour_bucket,
            hour_bucket_datetime,
            date_bucket
          )

          if (result) {
            results.push(result)
            success_count++
          }
        } catch (error) {
          error_count++
          logger.error('[HourlyLotteryMetricsAggregation] 单个活动聚合失败', {
            campaign_id,
            error: error.message
          })
        }
      }

      const duration_ms = Date.now() - start_time

      logger.info('[HourlyLotteryMetricsAggregation] 小时聚合任务完成', {
        hour_bucket,
        total_campaigns: campaign_ids.length,
        success_count,
        error_count,
        duration_ms
      })

      return {
        success: true,
        hour_bucket,
        campaigns_total: campaign_ids.length,
        campaigns_processed: success_count,
        campaigns_failed: error_count,
        results,
        duration_ms
      }
    } catch (error) {
      const duration_ms = Date.now() - start_time

      logger.error('[HourlyLotteryMetricsAggregation] 聚合任务执行失败', {
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

module.exports = HourlyLotteryMetricsAggregation
