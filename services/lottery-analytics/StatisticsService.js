'use strict'

/**
 * @file 统计趋势服务（Statistics Service）
 * @description 提供抽奖系统的统计趋势分析功能
 *
 * 拆分自原 LotteryAnalyticsService.js
 * 包含小时趋势、日报趋势、档位分布、体验机制触发统计、预算消耗统计等功能
 *
 * 核心功能：
 * 1. getHourlyTrend() - 小时趋势数据（双轨查询策略）
 * 2. getDailyTrend() - 日报趋势数据
 * 3. getTierDistribution() - Budget Tier分布统计
 * 4. getExperienceTriggers() - 体验机制触发统计
 * 5. getBudgetConsumption() - 预算消耗统计
 *
 * 双轨查询策略：
 * - 今日/最近24小时：lottery_draws（实时性优先）
 * - 最近7-90天：lottery_hourly_metrics（性能优先）
 * - 90天以上：lottery_daily_metrics（存储效率优先）
 *
 * @module services/lottery-analytics/StatisticsService
 * @version 1.0.0
 * @date 2026-01-31
 */

const { Op, fn, col, literal } = require('sequelize')
const logger = require('../../utils/logger').logger

/**
 * 时间范围类型枚举
 * @constant
 */
const TIME_RANGE_TYPE = {
  /** 今日/最近24小时 - 使用 lottery_draws */
  REALTIME: 'realtime',
  /** 7-90天 - 使用 lottery_hourly_metrics */
  HOURLY: 'hourly',
  /** 90天以上 - 使用 lottery_daily_metrics */
  DAILY: 'daily'
}

/**
 * 统计趋势服务
 * 提供抽奖系统的统计趋势分析功能
 *
 * @class StatisticsService
 */
class StatisticsService {
  /**
   * 构造函数
   * @param {Object} models - Sequelize模型集合
   */
  constructor(models) {
    this.models = models
    this.logger = logger
  }

  /**
   * 根据时间范围判断使用哪种查询策略
   * @private
   * @param {Date} start_time - 开始时间
   * @param {Date} end_time - 结束时间
   * @returns {string} 查询策略类型
   */
  _determineQueryStrategy(start_time, end_time) {
    const now = new Date()
    const daysAgo7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const daysAgo90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

    // 如果结束时间在7天内，使用实时查询
    if (end_time >= daysAgo7) {
      return TIME_RANGE_TYPE.REALTIME
    }

    // 如果开始时间在90天内，使用小时表
    if (start_time >= daysAgo90) {
      return TIME_RANGE_TYPE.HOURLY
    }

    // 超过90天，使用日报表
    return TIME_RANGE_TYPE.DAILY
  }

  /**
   * 获取今日北京时间日期范围
   * @private
   * @returns {Object} { start: Date, end: Date }
   */
  _getTodayRange() {
    const now = new Date()
    // 北京时间UTC+8
    const beijingOffset = 8 * 60 * 60 * 1000
    const beijingNow = new Date(now.getTime() + beijingOffset)

    // 今日开始（北京时间0点）
    const start = new Date(
      Date.UTC(beijingNow.getUTCFullYear(), beijingNow.getUTCMonth(), beijingNow.getUTCDate()) -
        beijingOffset
    )
    // 今日结束（北京时间23:59:59.999）
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1)

    return { start, end }
  }

  /**
   * 获取小时趋势数据
   * 使用双轨查询策略
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} options - 查询选项
   * @param {Date|string} options.start_time - 开始时间
   * @param {Date|string} options.end_time - 结束时间
   * @returns {Promise<Object>} 小时趋势数据
   */
  async getHourlyTrend(lottery_campaign_id, options = {}) {
    const start_time = options.start_time
      ? new Date(options.start_time)
      : new Date(Date.now() - 24 * 60 * 60 * 1000)
    const end_time = options.end_time ? new Date(options.end_time) : new Date()

    const strategy = this._determineQueryStrategy(start_time, end_time)
    this.logger.info('获取小时趋势数据', { lottery_campaign_id, strategy, start_time, end_time })

    if (strategy === TIME_RANGE_TYPE.REALTIME) {
      return await this._getHourlyFromDraws(lottery_campaign_id, start_time, end_time)
    } else {
      return await this._getHourlyFromMetrics(lottery_campaign_id, start_time, end_time)
    }
  }

  /**
   * 从lottery_draws表聚合小时数据
   * @private
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Date} start_time - 开始时间
   * @param {Date} end_time - 结束时间
   * @returns {Promise<Object>} 小时聚合数据
   */
  async _getHourlyFromDraws(lottery_campaign_id, start_time, end_time) {
    const LotteryDraw = this.models.LotteryDraw

    /*
     * 使用SQL按小时分组聚合
     * 注意：fallback 和 empty 分开统计
     * - fallback_tier_count：正常保底机制触发次数
     * - empty_count：真正空奖次数（系统异常，需要运营关注）
     */
    const hourly_data = await LotteryDraw.findAll({
      attributes: [
        [fn('DATE_FORMAT', col('created_at'), '%Y-%m-%d %H:00:00'), 'hour_bucket'],
        [fn('COUNT', col('lottery_draw_id')), 'total_draws'],
        [fn('COUNT', fn('DISTINCT', col('user_id'))), 'unique_users'],
        // 保底奖品次数（正常保底机制）
        [
          fn('SUM', literal("CASE WHEN prize_type = 'fallback' THEN 1 ELSE 0 END")),
          'fallback_tier_count'
        ],
        // 真正空奖次数（系统异常导致）
        [
          fn(
            'SUM',
            literal("CASE WHEN prize_type = 'empty' OR lottery_prize_id IS NULL THEN 1 ELSE 0 END")
          ),
          'empty_count'
        ]
      ],
      where: {
        lottery_campaign_id,
        created_at: {
          [Op.gte]: start_time,
          [Op.lte]: end_time
        }
      },
      group: [fn('DATE_FORMAT', col('created_at'), '%Y-%m-%d %H:00:00')],
      order: [[fn('DATE_FORMAT', col('created_at'), '%Y-%m-%d %H:00:00'), 'ASC']],
      raw: true
    })

    // 计算空奖率（使用真正空奖数 empty_count，而非保底数 fallback_tier_count）
    const result = hourly_data.map(row => ({
      hour_bucket: row.hour_bucket,
      total_draws: parseInt(row.total_draws) || 0,
      unique_users: parseInt(row.unique_users) || 0,
      fallback_tier_count: parseInt(row.fallback_tier_count) || 0,
      empty_count: parseInt(row.empty_count) || 0,
      empty_rate:
        row.total_draws > 0 ? (parseInt(row.empty_count) || 0) / parseInt(row.total_draws) : 0
    }))

    return {
      data: result,
      data_source: 'lottery_draws',
      generated_at: new Date().toISOString()
    }
  }

  /**
   * 从lottery_hourly_metrics表查询
   * @private
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Date} start_time - 开始时间
   * @param {Date} end_time - 结束时间
   * @returns {Promise<Object>} 小时指标数据
   */
  async _getHourlyFromMetrics(lottery_campaign_id, start_time, end_time) {
    const LotteryHourlyMetrics = this.models.LotteryHourlyMetrics

    const metrics = await LotteryHourlyMetrics.findAll({
      where: {
        lottery_campaign_id,
        hour_bucket: {
          [Op.gte]: start_time,
          [Op.lte]: end_time
        }
      },
      order: [['hour_bucket', 'ASC']],
      raw: true
    })

    return {
      data: metrics.map(row => ({
        hour_bucket: row.hour_bucket,
        total_draws: row.total_draws,
        unique_users: row.unique_users,
        fallback_tier_count: row.fallback_tier_count,
        empty_count: row.empty_count || 0, // 真正空奖次数
        empty_rate: parseFloat(row.empty_rate) || 0,
        high_tier_count: row.high_tier_count,
        mid_tier_count: row.mid_tier_count,
        low_tier_count: row.low_tier_count
      })),
      data_source: 'lottery_hourly_metrics',
      generated_at: new Date().toISOString()
    }
  }

  /**
   * 获取日报趋势数据
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} options - 查询选项
   * @param {Date|string} options.start_date - 开始日期
   * @param {Date|string} options.end_date - 结束日期
   * @param {number} options.days - 查询天数（默认30）
   * @returns {Promise<Object>} 日报趋势数据
   */
  async getDailyTrend(lottery_campaign_id, options = {}) {
    const days = options.days || 30
    const end_date = options.end_date ? new Date(options.end_date) : new Date()
    const start_date = options.start_date
      ? new Date(options.start_date)
      : new Date(end_date.getTime() - days * 24 * 60 * 60 * 1000)

    this.logger.info('获取日报趋势数据', { lottery_campaign_id, start_date, end_date })

    const LotteryDailyMetrics = this.models.LotteryDailyMetrics

    const metrics = await LotteryDailyMetrics.findAll({
      where: {
        lottery_campaign_id,
        metric_date: {
          [Op.gte]: start_date.toISOString().slice(0, 10),
          [Op.lte]: end_date.toISOString().slice(0, 10)
        }
      },
      order: [['metric_date', 'ASC']],
      raw: true
    })

    return {
      data: metrics.map(row => ({
        metric_date: row.metric_date,
        total_draws: row.total_draws,
        unique_users: row.unique_users,
        empty_rate: parseFloat(row.empty_rate) || 0,
        high_value_rate: parseFloat(row.high_value_rate) || 0,
        total_budget_consumed: parseFloat(row.total_budget_consumed) || 0,
        avg_budget_per_draw: parseFloat(row.avg_budget_per_draw) || 0,
        pity_trigger_count: row.pity_trigger_count,
        anti_empty_trigger_count: row.anti_empty_trigger_count,
        anti_high_trigger_count: row.anti_high_trigger_count,
        luck_debt_trigger_count: row.luck_debt_trigger_count
      })),
      data_source: 'lottery_daily_metrics',
      generated_at: new Date().toISOString()
    }
  }

  /**
   * 获取Budget Tier分布统计
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} options - 查询选项
   * @param {Date|string} options.start_time - 开始时间
   * @param {Date|string} options.end_time - 结束时间
   * @returns {Promise<Object>} Budget Tier分布数据
   */
  async getTierDistribution(lottery_campaign_id, options = {}) {
    const start_time = options.start_time
      ? new Date(options.start_time)
      : this._getTodayRange().start
    const end_time = options.end_time ? new Date(options.end_time) : new Date()

    const strategy = this._determineQueryStrategy(start_time, end_time)
    this.logger.info('获取Budget Tier分布', { lottery_campaign_id, strategy })

    if (strategy === TIME_RANGE_TYPE.REALTIME) {
      return await this._getTierDistributionFromDecisions(lottery_campaign_id, start_time, end_time)
    } else if (strategy === TIME_RANGE_TYPE.HOURLY) {
      return await this._getTierDistributionFromHourly(lottery_campaign_id, start_time, end_time)
    } else {
      return await this._getTierDistributionFromDaily(lottery_campaign_id, start_time, end_time)
    }
  }

  /**
   * 从lottery_draw_decisions表获取Budget Tier分布
   * @private
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Date} start_time - 开始时间
   * @param {Date} end_time - 结束时间
   * @returns {Promise<Object>} Budget Tier分布数据
   */
  async _getTierDistributionFromDecisions(lottery_campaign_id, start_time, end_time) {
    const LotteryDrawDecision = this.models.LotteryDrawDecision
    const LotteryDraw = this.models.LotteryDraw

    // 通过 lottery_draw_id 关联 LotteryDraw 表来过滤 lottery_campaign_id
    const distribution = await LotteryDrawDecision.findAll({
      attributes: [
        'budget_tier',
        [fn('COUNT', col('LotteryDrawDecision.lottery_draw_decision_id')), 'count']
      ],
      include: [
        {
          model: LotteryDraw,
          as: 'draw',
          attributes: [],
          where: {
            lottery_campaign_id,
            created_at: {
              [Op.gte]: start_time,
              [Op.lte]: end_time
            }
          },
          required: true
        }
      ],
      group: ['LotteryDrawDecision.budget_tier'],
      raw: true
    })

    const total = distribution.reduce((sum, row) => sum + parseInt(row.count), 0)

    const budget_tiers = {
      B0: { count: 0, percentage: 0 },
      B1: { count: 0, percentage: 0 },
      B2: { count: 0, percentage: 0 },
      B3: { count: 0, percentage: 0 }
    }

    for (const row of distribution) {
      const tier = row.budget_tier
      if (budget_tiers[tier]) {
        budget_tiers[tier].count = parseInt(row.count)
        budget_tiers[tier].percentage = total > 0 ? parseInt(row.count) / total : 0
      }
    }

    return {
      budget_tiers,
      total,
      data_source: 'lottery_draw_decisions',
      generated_at: new Date().toISOString()
    }
  }

  /**
   * 从lottery_hourly_metrics表聚合Budget Tier分布
   * @private
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Date} start_time - 开始时间
   * @param {Date} end_time - 结束时间
   * @returns {Promise<Object>} Budget Tier分布数据
   */
  async _getTierDistributionFromHourly(lottery_campaign_id, start_time, end_time) {
    const LotteryHourlyMetrics = this.models.LotteryHourlyMetrics

    const metrics = await LotteryHourlyMetrics.findAll({
      attributes: [
        [fn('SUM', col('b0_tier_count')), 'b0_count'],
        [fn('SUM', col('b1_tier_count')), 'b1_count'],
        [fn('SUM', col('b2_tier_count')), 'b2_count'],
        [fn('SUM', col('b3_tier_count')), 'b3_count'],
        [fn('SUM', col('total_draws')), 'total']
      ],
      where: {
        lottery_campaign_id,
        hour_bucket: {
          [Op.gte]: start_time,
          [Op.lte]: end_time
        }
      },
      raw: true
    })

    const row = metrics[0] || {}
    const total = parseInt(row.total) || 0

    const budget_tiers = {
      B0: { count: parseInt(row.b0_count) || 0, percentage: 0 },
      B1: { count: parseInt(row.b1_count) || 0, percentage: 0 },
      B2: { count: parseInt(row.b2_count) || 0, percentage: 0 },
      B3: { count: parseInt(row.b3_count) || 0, percentage: 0 }
    }

    if (total > 0) {
      Object.keys(budget_tiers).forEach(tier => {
        budget_tiers[tier].percentage = budget_tiers[tier].count / total
      })
    }

    return {
      budget_tiers,
      total,
      data_source: 'lottery_hourly_metrics',
      generated_at: new Date().toISOString()
    }
  }

  /**
   * 从lottery_daily_metrics表聚合Budget Tier分布
   * @private
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Date} start_time - 开始时间
   * @param {Date} end_time - 结束时间
   * @returns {Promise<Object>} Budget Tier分布数据
   */
  async _getTierDistributionFromDaily(lottery_campaign_id, start_time, end_time) {
    const LotteryDailyMetrics = this.models.LotteryDailyMetrics

    const metrics = await LotteryDailyMetrics.findAll({
      attributes: [
        [fn('SUM', col('b0_count')), 'b0_count'],
        [fn('SUM', col('b1_count')), 'b1_count'],
        [fn('SUM', col('b2_count')), 'b2_count'],
        [fn('SUM', col('b3_count')), 'b3_count'],
        [fn('SUM', col('total_draws')), 'total']
      ],
      where: {
        lottery_campaign_id,
        metric_date: {
          [Op.gte]: start_time.toISOString().slice(0, 10),
          [Op.lte]: end_time.toISOString().slice(0, 10)
        }
      },
      raw: true
    })

    const row = metrics[0] || {}
    const total = parseInt(row.total) || 0

    const budget_tiers = {
      B0: { count: parseInt(row.b0_count) || 0, percentage: 0 },
      B1: { count: parseInt(row.b1_count) || 0, percentage: 0 },
      B2: { count: parseInt(row.b2_count) || 0, percentage: 0 },
      B3: { count: parseInt(row.b3_count) || 0, percentage: 0 }
    }

    if (total > 0) {
      Object.keys(budget_tiers).forEach(tier => {
        budget_tiers[tier].percentage = budget_tiers[tier].count / total
      })
    }

    return {
      budget_tiers,
      total,
      data_source: 'lottery_daily_metrics',
      generated_at: new Date().toISOString()
    }
  }

  /**
   * 获取体验机制触发统计
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} options - 查询选项
   * @param {Date|string} options.start_time - 开始时间
   * @param {Date|string} options.end_time - 结束时间
   * @returns {Promise<Object>} 体验机制触发统计
   */
  async getExperienceTriggers(lottery_campaign_id, options = {}) {
    const start_time = options.start_time
      ? new Date(options.start_time)
      : this._getTodayRange().start
    const end_time = options.end_time ? new Date(options.end_time) : new Date()

    const strategy = this._determineQueryStrategy(start_time, end_time)
    this.logger.info('获取体验机制触发统计', { lottery_campaign_id, strategy })

    if (strategy === TIME_RANGE_TYPE.REALTIME) {
      return await this._getExperienceTriggersFromDecisions(
        lottery_campaign_id,
        start_time,
        end_time
      )
    } else if (strategy === TIME_RANGE_TYPE.HOURLY) {
      return await this._getExperienceTriggersFromHourly(lottery_campaign_id, start_time, end_time)
    } else {
      return await this._getExperienceTriggersFromDaily(lottery_campaign_id, start_time, end_time)
    }
  }

  /**
   * 从lottery_draw_decisions表获取体验机制触发统计
   * @private
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Date} start_time - 开始时间
   * @param {Date} end_time - 结束时间
   * @returns {Promise<Object>} 体验机制触发统计数据
   */
  async _getExperienceTriggersFromDecisions(lottery_campaign_id, start_time, end_time) {
    const LotteryDrawDecision = this.models.LotteryDrawDecision
    const LotteryDraw = this.models.LotteryDraw

    // 修正：通过关联 LotteryDraw 来过滤 lottery_campaign_id
    const [total_count, triggers] = await Promise.all([
      LotteryDrawDecision.count({
        include: [
          {
            model: LotteryDraw,
            as: 'draw',
            attributes: [],
            where: {
              lottery_campaign_id,
              created_at: { [Op.gte]: start_time, [Op.lte]: end_time }
            },
            required: true
          }
        ]
      }),
      LotteryDrawDecision.findAll({
        attributes: [
          // 修正：使用实际数据库字段名
          [
            fn(
              'SUM',
              literal(
                "CASE WHEN `LotteryDrawDecision`.`pity_decision` IS NOT NULL AND `LotteryDrawDecision`.`pity_decision` != '' THEN 1 ELSE 0 END"
              )
            ),
            'pity_count'
          ],
          [
            fn(
              'SUM',
              literal('CASE WHEN `LotteryDrawDecision`.`fallback_triggered` = 1 THEN 1 ELSE 0 END')
            ),
            'anti_empty_count'
          ],
          [
            fn(
              'SUM',
              literal('CASE WHEN `LotteryDrawDecision`.`guarantee_triggered` = 1 THEN 1 ELSE 0 END')
            ),
            'guarantee_count'
          ],
          [
            fn(
              'SUM',
              literal(
                "CASE WHEN `LotteryDrawDecision`.`luck_debt_decision` IS NOT NULL AND `LotteryDrawDecision`.`luck_debt_decision` != '' THEN 1 ELSE 0 END"
              )
            ),
            'luck_debt_count'
          ],
          [
            fn(
              'SUM',
              literal(
                'CASE WHEN `LotteryDrawDecision`.`system_advance_triggered` = 1 THEN 1 ELSE 0 END'
              )
            ),
            'system_advance_count'
          ],
          [
            fn(
              'SUM',
              literal(
                'CASE WHEN `LotteryDrawDecision`.`tier_downgrade_triggered` = 1 THEN 1 ELSE 0 END'
              )
            ),
            'tier_downgrade_count'
          ]
        ],
        include: [
          {
            model: LotteryDraw,
            as: 'draw',
            attributes: [],
            where: {
              lottery_campaign_id,
              created_at: { [Op.gte]: start_time, [Op.lte]: end_time }
            },
            required: true
          }
        ],
        raw: true
      })
    ])

    const row = triggers[0] || {}
    const total = total_count || 1

    return {
      experience_triggers: {
        pity: {
          count: parseInt(row.pity_count) || 0,
          rate: (parseInt(row.pity_count) || 0) / total
        },
        anti_empty: {
          count: parseInt(row.anti_empty_count) || 0,
          rate: (parseInt(row.anti_empty_count) || 0) / total
        },
        guarantee: {
          count: parseInt(row.guarantee_count) || 0,
          rate: (parseInt(row.guarantee_count) || 0) / total
        },
        luck_debt: {
          count: parseInt(row.luck_debt_count) || 0,
          rate: (parseInt(row.luck_debt_count) || 0) / total
        },
        system_advance: {
          count: parseInt(row.system_advance_count) || 0,
          rate: (parseInt(row.system_advance_count) || 0) / total
        },
        tier_downgrade: {
          count: parseInt(row.tier_downgrade_count) || 0,
          rate: (parseInt(row.tier_downgrade_count) || 0) / total
        }
      },
      total_draws: total_count,
      data_source: 'lottery_draw_decisions',
      generated_at: new Date().toISOString()
    }
  }

  /**
   * 从lottery_hourly_metrics表获取体验机制触发统计
   * @private
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Date} start_time - 开始时间
   * @param {Date} end_time - 结束时间
   * @returns {Promise<Object>} 体验机制触发统计数据
   */
  async _getExperienceTriggersFromHourly(lottery_campaign_id, start_time, end_time) {
    const LotteryHourlyMetrics = this.models.LotteryHourlyMetrics

    const metrics = await LotteryHourlyMetrics.findAll({
      attributes: [
        [fn('SUM', col('pity_triggered_count')), 'pity_count'],
        [fn('SUM', col('anti_empty_triggered_count')), 'anti_empty_count'],
        [fn('SUM', col('anti_high_triggered_count')), 'anti_high_count'],
        [fn('SUM', col('luck_debt_triggered_count')), 'luck_debt_count'],
        [fn('SUM', col('guarantee_triggered_count')), 'guarantee_count'],
        [fn('SUM', col('total_draws')), 'total']
      ],
      where: {
        lottery_campaign_id,
        hour_bucket: { [Op.gte]: start_time, [Op.lte]: end_time }
      },
      raw: true
    })

    const row = metrics[0] || {}
    const total = parseInt(row.total) || 1

    return {
      experience_triggers: {
        pity: {
          count: parseInt(row.pity_count) || 0,
          rate: (parseInt(row.pity_count) || 0) / total
        },
        anti_empty: {
          count: parseInt(row.anti_empty_count) || 0,
          rate: (parseInt(row.anti_empty_count) || 0) / total
        },
        anti_high: {
          count: parseInt(row.anti_high_count) || 0,
          rate: (parseInt(row.anti_high_count) || 0) / total
        },
        luck_debt: {
          count: parseInt(row.luck_debt_count) || 0,
          rate: (parseInt(row.luck_debt_count) || 0) / total
        },
        guarantee: {
          count: parseInt(row.guarantee_count) || 0,
          rate: (parseInt(row.guarantee_count) || 0) / total
        }
      },
      total_draws: parseInt(row.total) || 0,
      data_source: 'lottery_hourly_metrics',
      generated_at: new Date().toISOString()
    }
  }

  /**
   * 从lottery_daily_metrics表获取体验机制触发统计
   * @private
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Date} start_time - 开始时间
   * @param {Date} end_time - 结束时间
   * @returns {Promise<Object>} 体验机制触发统计数据
   */
  async _getExperienceTriggersFromDaily(lottery_campaign_id, start_time, end_time) {
    const LotteryDailyMetrics = this.models.LotteryDailyMetrics

    const metrics = await LotteryDailyMetrics.findAll({
      attributes: [
        [fn('SUM', col('pity_trigger_count')), 'pity_count'],
        [fn('SUM', col('anti_empty_trigger_count')), 'anti_empty_count'],
        [fn('SUM', col('anti_high_trigger_count')), 'anti_high_count'],
        [fn('SUM', col('luck_debt_trigger_count')), 'luck_debt_count'],
        [fn('SUM', col('total_draws')), 'total']
      ],
      where: {
        lottery_campaign_id,
        metric_date: {
          [Op.gte]: start_time.toISOString().slice(0, 10),
          [Op.lte]: end_time.toISOString().slice(0, 10)
        }
      },
      raw: true
    })

    const row = metrics[0] || {}
    const total = parseInt(row.total) || 1

    return {
      experience_triggers: {
        pity: {
          count: parseInt(row.pity_count) || 0,
          rate: (parseInt(row.pity_count) || 0) / total
        },
        anti_empty: {
          count: parseInt(row.anti_empty_count) || 0,
          rate: (parseInt(row.anti_empty_count) || 0) / total
        },
        anti_high: {
          count: parseInt(row.anti_high_count) || 0,
          rate: (parseInt(row.anti_high_count) || 0) / total
        },
        luck_debt: {
          count: parseInt(row.luck_debt_count) || 0,
          rate: (parseInt(row.luck_debt_count) || 0) / total
        },
        /*
         * 注意：lottery_daily_metrics 表没有 guarantee 字段
         * 为保持 API 返回格式一致性，此处返回 0
         */
        guarantee: {
          count: 0,
          rate: 0
        }
      },
      total_draws: parseInt(row.total) || 0,
      data_source: 'lottery_daily_metrics',
      generated_at: new Date().toISOString()
    }
  }

  /**
   * 获取预算消耗统计
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} options - 查询选项
   * @param {Date|string} options.start_time - 开始时间
   * @param {Date|string} options.end_time - 结束时间
   * @returns {Promise<Object>} 预算消耗统计
   */
  async getBudgetConsumption(lottery_campaign_id, options = {}) {
    const start_time = options.start_time
      ? new Date(options.start_time)
      : this._getTodayRange().start
    const end_time = options.end_time ? new Date(options.end_time) : new Date()

    const strategy = this._determineQueryStrategy(start_time, end_time)
    this.logger.info('获取预算消耗统计', { lottery_campaign_id, strategy })

    if (strategy === TIME_RANGE_TYPE.HOURLY) {
      return await this._getBudgetConsumptionFromHourly(lottery_campaign_id, start_time, end_time)
    } else if (strategy === TIME_RANGE_TYPE.DAILY) {
      return await this._getBudgetConsumptionFromDaily(lottery_campaign_id, start_time, end_time)
    } else {
      // 实时查询从draws表
      return await this._getBudgetConsumptionFromDraws(lottery_campaign_id, start_time, end_time)
    }
  }

  /**
   * 从lottery_draws获取预算消耗
   * @private
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Date} start_time - 开始时间
   * @param {Date} end_time - 结束时间
   * @returns {Promise<Object>} 预算消耗统计数据
   */
  async _getBudgetConsumptionFromDraws(lottery_campaign_id, start_time, end_time) {
    const LotteryDraw = this.models.LotteryDraw
    const LotteryDrawDecision = this.models.LotteryDrawDecision

    const draws = await LotteryDraw.findAll({
      attributes: ['lottery_draw_id', 'prize_value_points'],
      where: {
        lottery_campaign_id,
        created_at: { [Op.gte]: start_time, [Op.lte]: end_time }
      },
      include: [
        {
          model: LotteryDrawDecision,
          as: 'decision',
          attributes: ['budget_deducted'],
          required: false
        }
      ],
      raw: true,
      nest: true
    })

    const total_draws = draws.length
    let total_budget_consumed = 0
    let total_prize_value = 0

    for (const draw of draws) {
      total_budget_consumed += parseFloat(draw.decision?.budget_deducted) || 0
      total_prize_value += parseInt(draw.prize_value_points) || 0
    }

    return {
      budget_consumption: {
        total_budget_consumed: parseFloat(total_budget_consumed.toFixed(2)),
        total_prize_value,
        avg_budget_per_draw:
          total_draws > 0 ? parseFloat((total_budget_consumed / total_draws).toFixed(2)) : 0,
        avg_prize_value:
          total_draws > 0 ? parseFloat((total_prize_value / total_draws).toFixed(2)) : 0
      },
      total_draws,
      data_source: 'lottery_draws',
      generated_at: new Date().toISOString()
    }
  }

  /**
   * 从lottery_hourly_metrics获取预算消耗
   * @private
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Date} start_time - 开始时间
   * @param {Date} end_time - 结束时间
   * @returns {Promise<Object>} 预算消耗统计数据
   */
  async _getBudgetConsumptionFromHourly(lottery_campaign_id, start_time, end_time) {
    const LotteryHourlyMetrics = this.models.LotteryHourlyMetrics

    const metrics = await LotteryHourlyMetrics.findAll({
      attributes: [
        [fn('SUM', col('total_budget_consumed')), 'total_budget_consumed'],
        [fn('SUM', col('total_prize_value')), 'total_prize_value'],
        [fn('SUM', col('total_draws')), 'total_draws']
      ],
      where: {
        lottery_campaign_id,
        hour_bucket: { [Op.gte]: start_time, [Op.lte]: end_time }
      },
      raw: true
    })

    const row = metrics[0] || {}
    const total_draws = parseInt(row.total_draws) || 0
    const total_budget_consumed = parseFloat(row.total_budget_consumed) || 0
    const total_prize_value = parseFloat(row.total_prize_value) || 0

    return {
      budget_consumption: {
        total_budget_consumed,
        total_prize_value,
        avg_budget_per_draw:
          total_draws > 0 ? parseFloat((total_budget_consumed / total_draws).toFixed(2)) : 0,
        avg_prize_value:
          total_draws > 0 ? parseFloat((total_prize_value / total_draws).toFixed(2)) : 0
      },
      total_draws,
      data_source: 'lottery_hourly_metrics',
      generated_at: new Date().toISOString()
    }
  }

  /**
   * 从lottery_daily_metrics获取预算消耗
   * @private
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Date} start_time - 开始时间
   * @param {Date} end_time - 结束时间
   * @returns {Promise<Object>} 预算消耗统计数据
   */
  async _getBudgetConsumptionFromDaily(lottery_campaign_id, start_time, end_time) {
    const LotteryDailyMetrics = this.models.LotteryDailyMetrics

    const metrics = await LotteryDailyMetrics.findAll({
      attributes: [
        [fn('SUM', col('total_budget_consumed')), 'total_budget_consumed'],
        [fn('SUM', col('total_prize_value')), 'total_prize_value'],
        [fn('SUM', col('total_draws')), 'total_draws']
      ],
      where: {
        lottery_campaign_id,
        metric_date: {
          [Op.gte]: start_time.toISOString().slice(0, 10),
          [Op.lte]: end_time.toISOString().slice(0, 10)
        }
      },
      raw: true
    })

    const row = metrics[0] || {}
    const total_draws = parseInt(row.total_draws) || 0
    const total_budget_consumed = parseFloat(row.total_budget_consumed) || 0
    const total_prize_value = parseFloat(row.total_prize_value) || 0

    return {
      budget_consumption: {
        total_budget_consumed,
        total_prize_value,
        avg_budget_per_draw:
          total_draws > 0 ? parseFloat((total_budget_consumed / total_draws).toFixed(2)) : 0,
        avg_prize_value:
          total_draws > 0 ? parseFloat((total_prize_value / total_draws).toFixed(2)) : 0
      },
      total_draws,
      data_source: 'lottery_daily_metrics',
      generated_at: new Date().toISOString()
    }
  }

  /**
   * 查询抽奖小时统计指标列表
   *
   * @param {Object} options - 查询参数
   * @param {number} [options.lottery_campaign_id] - 活动ID（可选，不传则查询所有活动）
   * @param {string} [options.start_time] - 开始时间（ISO8601格式，北京时间）
   * @param {string} [options.end_time] - 结束时间（ISO8601格式，北京时间）
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=24] - 每页数量（默认24，即一天的小时数）
   * @returns {Promise<Object>} 统计指标列表和分页信息
   */
  async getHourlyMetrics(options = {}) {
    const { lottery_campaign_id, start_time, end_time, page = 1, page_size = 24 } = options

    const where = {}

    // 活动ID过滤
    if (lottery_campaign_id) {
      where.lottery_campaign_id = lottery_campaign_id
    }

    // 时间范围过滤
    if (start_time || end_time) {
      where.hour_bucket = {}
      if (start_time) {
        where.hour_bucket[Op.gte] = new Date(start_time)
      }
      if (end_time) {
        where.hour_bucket[Op.lte] = new Date(end_time)
      }
    }

    const offset = (page - 1) * page_size

    const { count, rows } = await this.models.LotteryHourlyMetrics.findAndCountAll({
      where,
      include: [
        {
          model: this.models.LotteryCampaign,
          as: 'campaign',
          attributes: ['lottery_campaign_id', 'campaign_name', 'status']
        }
      ],
      order: [['hour_bucket', 'DESC']],
      limit: page_size,
      offset
    })

    return {
      metrics: rows.map(row => row.get({ plain: true })),
      pagination: {
        total_count: count,
        page,
        page_size,
        total_pages: Math.ceil(count / page_size)
      }
    }
  }

  /**
   * 获取单个统计指标详情
   *
   * @param {number} metric_id - 指标记录ID
   * @returns {Promise<Object|null>} 指标详情或null
   */
  async getHourlyMetricById(metric_id) {
    const metric = await this.models.LotteryHourlyMetrics.findByPk(metric_id, {
      include: [
        {
          model: this.models.LotteryCampaign,
          as: 'campaign',
          attributes: ['lottery_campaign_id', 'campaign_name', 'status', 'budget_type']
        }
      ]
    })

    return metric ? metric.get({ plain: true }) : null
  }

  /**
   * 获取活动的统计汇总数据
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {string} [start_time] - 开始时间
   * @param {string} [end_time] - 结束时间
   * @returns {Promise<Object>} 汇总统计数据
   */
  async getHourlyMetricsSummary(lottery_campaign_id, start_time, end_time) {
    const where = { lottery_campaign_id }
    if (start_time || end_time) {
      where.hour_bucket = {}
      if (start_time) where.hour_bucket[Op.gte] = new Date(start_time)
      if (end_time) where.hour_bucket[Op.lte] = new Date(end_time)
    }

    const summary = await this.models.LotteryHourlyMetrics.findOne({
      attributes: [
        [fn('SUM', col('total_draws')), 'total_draws'],
        [fn('SUM', col('unique_users')), 'total_unique_users'],
        [fn('SUM', col('high_tier_count')), 'total_high_tier'],
        [fn('SUM', col('mid_tier_count')), 'total_mid_tier'],
        [fn('SUM', col('low_tier_count')), 'total_low_tier'],
        [fn('SUM', col('fallback_tier_count')), 'total_fallback_tier'],
        [fn('SUM', col('total_budget_consumed')), 'total_budget_consumed'],
        [fn('SUM', col('pity_triggered_count')), 'total_pity_triggered'],
        [fn('AVG', col('empty_rate')), 'avg_empty_rate'],
        [fn('AVG', col('high_value_rate')), 'avg_high_value_rate'],
        [fn('COUNT', col('metric_id')), 'record_count']
      ],
      where,
      raw: true
    })

    return {
      lottery_campaign_id,
      period: { start_time, end_time },
      summary: {
        total_draws: parseInt(summary.total_draws) || 0,
        total_unique_users: parseInt(summary.total_unique_users) || 0,
        total_high_tier: parseInt(summary.total_high_tier) || 0,
        total_mid_tier: parseInt(summary.total_mid_tier) || 0,
        total_low_tier: parseInt(summary.total_low_tier) || 0,
        total_fallback_tier: parseInt(summary.total_fallback_tier) || 0,
        total_budget_consumed: parseInt(summary.total_budget_consumed) || 0,
        total_pity_triggered: parseInt(summary.total_pity_triggered) || 0,
        avg_empty_rate: parseFloat(summary.avg_empty_rate) || 0,
        avg_high_value_rate: parseFloat(summary.avg_high_value_rate) || 0,
        record_count: parseInt(summary.record_count) || 0
      }
    }
  }
}

module.exports = StatisticsService
