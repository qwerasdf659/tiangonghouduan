/**
 * @file 抽奖监控数据查询服务 - P2表只读查询API
 * @description 提供抽奖系统监控相关数据的只读查询功能
 *
 * 覆盖P2优先级表：
 * - lottery_hourly_metrics: 抽奖小时统计指标
 * - lottery_user_experience_state: 用户体验状态（Pity/AntiEmpty/AntiHigh）
 * - lottery_user_global_state: 用户全局状态（运气债务）
 * - lottery_campaign_quota_grants: 配额赠送记录
 * - lottery_campaign_user_quota: 用户配额状态
 *
 * 架构原则：
 * - 只读查询服务，不涉及写操作
 * - 所有方法均为查询方法，无需事务管理
 * - 严格遵循项目snake_case命名规范
 *
 * @version 1.0.0
 * @date 2026-01-21
 */

'use strict'

const { Op } = require('sequelize')
const logger = require('../utils/logger').logger

/**
 * 抽奖监控数据查询服务
 * 提供P2优先级表的只读查询API
 */
class LotteryMonitoringService {
  /**
   * 构造函数
   * @param {Object} models - Sequelize模型集合
   */
  constructor(models) {
    this.models = models
    this.logger = logger
  }

  /*
   * ==========================================
   * 1. lottery_hourly_metrics - 抽奖小时统计指标
   * ==========================================
   */

  /**
   * 查询抽奖小时统计指标列表
   *
   * @param {Object} options - 查询参数
   * @param {number} [options.campaign_id] - 活动ID（可选，不传则查询所有活动）
   * @param {string} [options.start_time] - 开始时间（ISO8601格式，北京时间）
   * @param {string} [options.end_time] - 结束时间（ISO8601格式，北京时间）
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=24] - 每页数量（默认24，即一天的小时数）
   * @returns {Promise<Object>} 统计指标列表和分页信息
   */
  async getHourlyMetrics(options = {}) {
    const { campaign_id, start_time, end_time, page = 1, page_size = 24 } = options

    const where = {}

    // 活动ID过滤
    if (campaign_id) {
      where.campaign_id = campaign_id
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
          attributes: ['campaign_id', 'campaign_name', 'status']
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
          attributes: ['campaign_id', 'campaign_name', 'status', 'budget_type']
        }
      ]
    })

    return metric ? metric.get({ plain: true }) : null
  }

  /**
   * 获取活动的统计汇总数据
   *
   * @param {number} campaign_id - 活动ID
   * @param {string} [start_time] - 开始时间
   * @param {string} [end_time] - 结束时间
   * @returns {Promise<Object>} 汇总统计数据
   */
  async getHourlyMetricsSummary(campaign_id, start_time, end_time) {
    const { fn, col } = require('sequelize')

    const where = { campaign_id }
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
      campaign_id,
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

  /*
   * ==========================================
   * 2. lottery_user_experience_state - 用户体验状态
   * ==========================================
   */

  /**
   * 查询用户体验状态列表
   *
   * @param {Object} options - 查询参数
   * @param {number} [options.campaign_id] - 活动ID
   * @param {number} [options.user_id] - 用户ID
   * @param {number} [options.min_empty_streak] - 最小连续空奖次数
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 用户体验状态列表和分页信息
   */
  async getUserExperienceStates(options = {}) {
    const { campaign_id, user_id, min_empty_streak, page = 1, page_size = 20 } = options

    const where = {}
    if (campaign_id) where.campaign_id = campaign_id
    if (user_id) where.user_id = user_id
    if (min_empty_streak !== undefined) {
      where.empty_streak = { [Op.gte]: min_empty_streak }
    }

    const offset = (page - 1) * page_size

    const { count, rows } = await this.models.LotteryUserExperienceState.findAndCountAll({
      where,
      include: [
        {
          model: this.models.User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: this.models.LotteryCampaign,
          as: 'campaign',
          attributes: ['campaign_id', 'campaign_name', 'status']
        }
      ],
      order: [['empty_streak', 'DESC']],
      limit: page_size,
      offset
    })

    return {
      states: rows.map(row => row.get({ plain: true })),
      pagination: {
        total_count: count,
        page,
        page_size,
        total_pages: Math.ceil(count / page_size)
      }
    }
  }

  /**
   * 获取单个用户在特定活动的体验状态
   *
   * @param {number} user_id - 用户ID
   * @param {number} campaign_id - 活动ID
   * @returns {Promise<Object|null>} 用户体验状态或null
   */
  async getUserExperienceState(user_id, campaign_id) {
    const state = await this.models.LotteryUserExperienceState.findOne({
      where: { user_id, campaign_id },
      include: [
        {
          model: this.models.User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: this.models.LotteryCampaign,
          as: 'campaign',
          attributes: ['campaign_id', 'campaign_name', 'status']
        }
      ]
    })

    return state ? state.get({ plain: true }) : null
  }

  /*
   * ==========================================
   * 3. lottery_user_global_state - 用户全局状态
   * ==========================================
   */

  /**
   * 查询用户全局状态列表
   *
   * @param {Object} options - 查询参数
   * @param {number} [options.user_id] - 用户ID
   * @param {string} [options.luck_debt_level] - 运气债务等级（none/low/medium/high）
   * @param {number} [options.min_draw_count] - 最小抽奖次数
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 用户全局状态列表和分页信息
   */
  async getUserGlobalStates(options = {}) {
    const { user_id, luck_debt_level, min_draw_count, page = 1, page_size = 20 } = options

    const where = {}
    if (user_id) where.user_id = user_id
    if (luck_debt_level) where.luck_debt_level = luck_debt_level
    if (min_draw_count !== undefined) {
      where.global_draw_count = { [Op.gte]: min_draw_count }
    }

    const offset = (page - 1) * page_size

    const { count, rows } = await this.models.LotteryUserGlobalState.findAndCountAll({
      where,
      include: [
        {
          model: this.models.User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile']
        }
      ],
      order: [['global_draw_count', 'DESC']],
      limit: page_size,
      offset
    })

    return {
      states: rows.map(row => row.get({ plain: true })),
      pagination: {
        total_count: count,
        page,
        page_size,
        total_pages: Math.ceil(count / page_size)
      }
    }
  }

  /**
   * 获取单个用户的全局状态
   *
   * @param {number} user_id - 用户ID
   * @returns {Promise<Object|null>} 用户全局状态或null
   */
  async getUserGlobalState(user_id) {
    const state = await this.models.LotteryUserGlobalState.findOne({
      where: { user_id },
      include: [
        {
          model: this.models.User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile']
        }
      ]
    })

    return state ? state.get({ plain: true }) : null
  }

  /*
   * ==========================================
   * 4. lottery_campaign_quota_grants - 配额赠送记录
   * ==========================================
   */

  /**
   * 查询配额赠送记录列表
   *
   * @param {Object} options - 查询参数
   * @param {number} [options.campaign_id] - 活动ID
   * @param {number} [options.user_id] - 被赠送用户ID
   * @param {number} [options.granted_by] - 赠送操作者ID
   * @param {string} [options.grant_type] - 赠送类型
   * @param {string} [options.start_time] - 开始时间
   * @param {string} [options.end_time] - 结束时间
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 配额赠送记录列表和分页信息
   */
  async getQuotaGrants(options = {}) {
    const {
      campaign_id,
      user_id,
      granted_by,
      grant_source,
      start_time,
      end_time,
      page = 1,
      page_size = 20
    } = options

    const where = {}
    if (campaign_id) where.campaign_id = campaign_id
    if (user_id) where.user_id = user_id
    if (granted_by) where.granted_by = granted_by
    if (grant_source) where.grant_source = grant_source

    if (start_time || end_time) {
      where.created_at = {}
      if (start_time) where.created_at[Op.gte] = new Date(start_time)
      if (end_time) where.created_at[Op.lte] = new Date(end_time)
    }

    const offset = (page - 1) * page_size

    const { count, rows } = await this.models.LotteryCampaignQuotaGrant.findAndCountAll({
      where,
      include: [
        {
          model: this.models.User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: this.models.User,
          as: 'granter',
          attributes: ['user_id', 'nickname']
        },
        {
          model: this.models.LotteryCampaign,
          as: 'campaign',
          attributes: ['campaign_id', 'campaign_name']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: page_size,
      offset
    })

    return {
      grants: rows.map(row => row.get({ plain: true })),
      pagination: {
        total_count: count,
        page,
        page_size,
        total_pages: Math.ceil(count / page_size)
      }
    }
  }

  /**
   * 获取单个配额赠送记录详情
   *
   * @param {number} grant_id - 赠送记录ID
   * @returns {Promise<Object|null>} 赠送记录详情或null
   */
  async getQuotaGrantById(grant_id) {
    const grant = await this.models.LotteryCampaignQuotaGrant.findByPk(grant_id, {
      include: [
        {
          model: this.models.User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: this.models.User,
          as: 'granter',
          attributes: ['user_id', 'nickname']
        },
        {
          model: this.models.LotteryCampaign,
          as: 'campaign',
          attributes: ['campaign_id', 'campaign_name', 'status']
        }
      ]
    })

    return grant ? grant.get({ plain: true }) : null
  }

  /*
   * ==========================================
   * 5. lottery_campaign_user_quota - 用户配额状态
   * ==========================================
   */

  /**
   * 查询用户配额状态列表
   *
   * @param {Object} options - 查询参数
   * @param {number} [options.campaign_id] - 活动ID
   * @param {number} [options.user_id] - 用户ID
   * @param {boolean} [options.has_remaining] - 是否有剩余配额
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 用户配额列表和分页信息
   */
  async getUserQuotas(options = {}) {
    const { campaign_id, user_id, has_remaining, page = 1, page_size = 20 } = options

    const where = {}
    if (campaign_id) where.campaign_id = campaign_id
    if (user_id) where.user_id = user_id
    if (has_remaining !== undefined) {
      where.quota_remaining = has_remaining ? { [Op.gt]: 0 } : { [Op.lte]: 0 }
    }

    const offset = (page - 1) * page_size

    const { count, rows } = await this.models.LotteryCampaignUserQuota.findAndCountAll({
      where,
      include: [
        {
          model: this.models.User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: this.models.LotteryCampaign,
          as: 'campaign',
          attributes: ['campaign_id', 'campaign_name', 'status']
        }
      ],
      order: [['quota_remaining', 'DESC']],
      limit: page_size,
      offset
    })

    return {
      quotas: rows.map(row => row.get({ plain: true })),
      pagination: {
        total_count: count,
        page,
        page_size,
        total_pages: Math.ceil(count / page_size)
      }
    }
  }

  /**
   * 获取用户在特定活动的配额状态
   *
   * @param {number} user_id - 用户ID
   * @param {number} campaign_id - 活动ID
   * @returns {Promise<Object|null>} 用户配额状态或null
   */
  async getUserQuota(user_id, campaign_id) {
    const quota = await this.models.LotteryCampaignUserQuota.findOne({
      where: { user_id, campaign_id },
      include: [
        {
          model: this.models.User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: this.models.LotteryCampaign,
          as: 'campaign',
          attributes: ['campaign_id', 'campaign_name', 'status', 'budget_type']
        }
      ]
    })

    return quota ? quota.get({ plain: true }) : null
  }

  /**
   * 获取活动配额统计汇总
   *
   * @param {number} campaign_id - 活动ID
   * @returns {Promise<Object>} 配额统计汇总
   */
  async getCampaignQuotaStats(campaign_id) {
    const stats = await this.models.LotteryCampaignUserQuota.getCampaignQuotaStats(campaign_id)

    // 获取活动信息
    const campaign = await this.models.LotteryCampaign.findByPk(campaign_id, {
      attributes: ['campaign_id', 'campaign_name', 'status', 'budget_type']
    })

    return {
      campaign: campaign ? campaign.get({ plain: true }) : null,
      stats
    }
  }
}

module.exports = LotteryMonitoringService
