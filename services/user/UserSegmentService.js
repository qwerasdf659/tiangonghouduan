/**
 * @file 用户分层服务（User Segment Service）
 * @description 提供用户分层统计和分析功能
 *
 * P1 阶段任务 B-19~B-24：用户分层服务和相关接口
 *
 * D-4 决策：采用抽奖活跃度优先的 3 层简化版，放弃复杂 RFM 模型
 *
 * 业务场景：
 * - 识别高价值用户进行精细化运营
 * - 发现沉默用户进行唤醒触达
 * - 分析用户行为漏斗优化转化率
 *
 * 核心功能：
 * 1. getSegmentStats() - 获取分层统计（B-20）
 * 2. getSegmentUsers() - 获取分层用户列表（B-21）
 * 3. getActivityHeatmap() - 获取活跃时段热力图（B-22）
 * 4. getExchangePreferences() - 获取兑换偏好统计（B-23）
 * 5. getBehaviorFunnel() - 获取行为漏斗数据（B-24）
 *
 * 分层定义（D-4 决策简化版）：
 * - high_value: 高价值用户（7日抽奖≥10次 且 消费≥3次）
 * - active: 活跃用户（7日抽奖≥3次 或 消费≥1次）
 * - silent: 沉默用户（30日无抽奖 且 无消费）
 * - churned: 流失用户（60日无任何行为）
 *
 * @module services/user/UserSegmentService
 * @version 1.0.0
 * @date 2026-01-31
 */

'use strict'

const { Op, fn, col, literal } = require('sequelize')
const logger = require('../../utils/logger').logger
const BeijingTimeHelper = require('../../utils/timeHelper')
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')

/**
 * 用户分层规则配置（D-4 决策简化版）
 * 核心指标：抽奖活跃度 + 消费触发
 */
const SEGMENT_RULES = {
  /**
   * 高价值用户
   * 定义：7日抽奖≥10次 且 消费≥3次
   * 特征：高频抽奖 + 频繁消费触发
   */
  high_value: {
    name: '高价值用户',
    code: 'high_value',
    criteria: '7日抽奖≥10次 且 消费≥3次',
    color: '#4CAF50', // 绿色
    priority: 1
  },

  /**
   * 活跃用户
   * 定义：7日抽奖≥3次 或 消费≥1次
   * 特征：有持续行为但未达高价值
   */
  active: {
    name: '活跃用户',
    code: 'active',
    criteria: '7日抽奖≥3次 或 消费≥1次',
    color: '#2196F3', // 蓝色
    priority: 2
  },

  /**
   * 沉默用户
   * 定义：30日无抽奖 且 无消费
   * 特征：需要唤醒触达
   */
  silent: {
    name: '沉默用户',
    code: 'silent',
    criteria: '30日无抽奖 且 无消费',
    color: '#FF9800', // 橙色
    priority: 3
  },

  /**
   * 流失用户
   * 定义：60日无任何行为
   * 特征：已流失，唤回成本高
   */
  churned: {
    name: '流失用户',
    code: 'churned',
    criteria: '60日无任何行为',
    color: '#F44336', // 红色
    priority: 4
  }
}

/**
 * 用户分层服务
 * 提供用户分层统计、列表查询、行为分析功能
 *
 * @class UserSegmentService
 */
class UserSegmentService {
  /**
   * 获取分层规则配置
   * @returns {Object} 分层规则
   */
  static getSegmentRules() {
    return SEGMENT_RULES
  }

  /**
   * 获取分层统计数据
   *
   * P1 需求 B-20：分层统计接口
   *
   * @param {Object} models - Sequelize 模型集合
   * @param {Object} [_options] - 可选参数（预留扩展）
   * @returns {Promise<Object>} 分层统计数据
   *
   * @example
   * const stats = await UserSegmentService.getSegmentStats(models)
   * // 返回：
   * // {
   * //   segments: [
   * //     { code: 'high_value', name: '高价值用户', count: 150, percentage: 15.0 },
   * //     { code: 'active', name: '活跃用户', count: 400, percentage: 40.0 },
   * //     ...
   * //   ],
   * //   total_users: 1000,
   * //   generated_at: '2026-01-31T12:00:00+08:00'
   * // }
   */
  static async getSegmentStats(models, _options = {}) {
    // 尝试从缓存获取
    const cached = await BusinessCacheHelper.getStats('user_segment_stats', {})
    if (cached) {
      logger.debug('从缓存获取分层统计数据')
      return cached
    }

    logger.info('计算用户分层统计数据')

    try {
      const now = new Date()
      const day7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const day30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const day60Ago = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

      // 获取总用户数
      const totalUsers = await models.User.count({
        where: { status: 'active' }
      })

      // 使用原生 SQL 进行分层统计（性能优化）
      const segmentCounts = await UserSegmentService._calculateSegmentCounts(models, {
        day7Ago,
        day30Ago,
        day60Ago
      })

      // 计算百分比
      const segments = Object.entries(SEGMENT_RULES).map(([code, rule]) => {
        const count = segmentCounts[code] || 0
        return {
          code,
          name: rule.name,
          criteria: rule.criteria,
          color: rule.color,
          count,
          percentage: totalUsers > 0 ? Math.round((count / totalUsers) * 10000) / 100 : 0
        }
      })

      const result = {
        segments,
        total_users: totalUsers,
        segment_rules: SEGMENT_RULES,
        generated_at: BeijingTimeHelper.now()
      }

      // 缓存5分钟
      await BusinessCacheHelper.setStats('user_segment_stats', {}, result)

      logger.info('用户分层统计完成', {
        total: totalUsers,
        high_value: segmentCounts.high_value,
        active: segmentCounts.active,
        silent: segmentCounts.silent,
        churned: segmentCounts.churned
      })

      return result
    } catch (error) {
      logger.error('获取分层统计失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取分层用户列表
   *
   * P1 需求 B-21：分层用户列表接口
   *
   * @param {Object} models - Sequelize 模型集合
   * @param {string} segmentType - 分层类型
   * @param {Object} [options] - 查询选项
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 用户列表和分页信息
   */
  static async getSegmentUsers(models, segmentType, options = {}) {
    const { page = 1, page_size = 20 } = options

    if (!SEGMENT_RULES[segmentType]) {
      throw new Error(`无效的分层类型: ${segmentType}`)
    }

    logger.info('获取分层用户列表', { segment: segmentType, page })

    try {
      const now = new Date()
      const day7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const day30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      const day60Ago = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000)

      // 获取分层用户ID列表
      const userIds = await UserSegmentService._getSegmentUserIds(models, segmentType, {
        day7Ago,
        day30Ago,
        day60Ago,
        limit: page_size,
        offset: (page - 1) * page_size
      })

      if (userIds.length === 0) {
        return {
          segment: SEGMENT_RULES[segmentType],
          users: [],
          pagination: {
            total_count: 0,
            page,
            page_size,
            total_pages: 0
          }
        }
      }

      // 获取用户详情
      const users = await models.User.findAll({
        where: { user_id: { [Op.in]: userIds } },
        attributes: ['user_id', 'mobile', 'nickname', 'avatar_url', 'created_at', 'last_login'],
        order: [['last_login', 'DESC']]
      })

      // 获取总数
      const totalCount = await UserSegmentService._getSegmentUserCount(models, segmentType, {
        day7Ago,
        day30Ago,
        day60Ago
      })

      return {
        segment: SEGMENT_RULES[segmentType],
        users: users.map(u => ({
          user_id: u.user_id,
          mobile: u.mobile ? `${u.mobile.substring(0, 3)}****${u.mobile.substring(7)}` : null,
          nickname: u.nickname,
          avatar_url: u.avatar_url,
          created_at: u.created_at,
          last_login: u.last_login
        })),
        pagination: {
          total_count: totalCount,
          page,
          page_size,
          total_pages: Math.ceil(totalCount / page_size)
        }
      }
    } catch (error) {
      logger.error('获取分层用户列表失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取活跃时段热力图
   *
   * P1 需求 B-22：活跃时段统计接口
   *
   * @param {Object} models - Sequelize 模型集合
   * @param {Object} [options] - 查询选项
   * @param {number} [options.days=7] - 统计天数
   * @returns {Promise<Object>} 热力图数据
   */
  static async getActivityHeatmap(models, options = {}) {
    const { days = 7 } = options
    const cacheParams = { type: 'heatmap', days }

    // 尝试从缓存获取
    const cached = await BusinessCacheHelper.getStats('user_activity', cacheParams)
    if (cached) {
      logger.debug('从缓存获取活跃时段热力图')
      return cached
    }

    logger.info('计算活跃时段热力图', { days })

    try {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)

      // 按小时统计抽奖活动
      const hourlyStats = await models.LotteryDraw.findAll({
        attributes: [
          [fn('HOUR', col('created_at')), 'hour'],
          [fn('DAYOFWEEK', col('created_at')), 'day_of_week'],
          [fn('COUNT', col('lottery_draw_id')), 'count']
        ],
        where: {
          created_at: { [Op.gte]: startDate }
        },
        group: [literal('HOUR(created_at)'), literal('DAYOFWEEK(created_at)')],
        raw: true
      })

      // 构建热力图矩阵 (7天 x 24小时)
      const heatmapMatrix = Array(7)
        .fill(null)
        .map(() => Array(24).fill(0))

      hourlyStats.forEach(stat => {
        const dayIndex = (parseInt(stat.day_of_week) - 1) % 7 // 0=周日, 1=周一, ...
        const hourIndex = parseInt(stat.hour)
        if (dayIndex >= 0 && dayIndex < 7 && hourIndex >= 0 && hourIndex < 24) {
          heatmapMatrix[dayIndex][hourIndex] = parseInt(stat.count)
        }
      })

      // 找出峰值时段
      let maxCount = 0
      let peakHour = 0
      let peakDay = 0
      heatmapMatrix.forEach((dayData, dayIndex) => {
        dayData.forEach((count, hourIndex) => {
          if (count > maxCount) {
            maxCount = count
            peakHour = hourIndex
            peakDay = dayIndex
          }
        })
      })

      const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

      const result = {
        heatmap: heatmapMatrix,
        day_labels: dayNames,
        hour_labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
        peak: {
          day: dayNames[peakDay],
          hour: `${peakHour}:00-${peakHour + 1}:00`,
          count: maxCount
        },
        statistics: {
          total_draws: hourlyStats.reduce((sum, s) => sum + parseInt(s.count), 0),
          analysis_period: `最近${days}天`
        },
        generated_at: BeijingTimeHelper.now()
      }

      // 缓存10分钟
      await BusinessCacheHelper.setStats('user_activity', cacheParams, result)

      logger.info('活跃时段热力图计算完成', { peak: result.peak })

      return result
    } catch (error) {
      logger.error('获取活跃时段热力图失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取兑换偏好统计
   *
   * P1 需求 B-23：兑换偏好接口
   *
   * @param {Object} models - Sequelize 模型集合
   * @param {Object} [options] - 查询选项
   * @param {number} [options.days=30] - 统计天数
   * @param {number} [options.limit=10] - 返回数量
   * @returns {Promise<Object>} 兑换偏好数据
   */
  static async getExchangePreferences(models, options = {}) {
    const { days = 30, limit = 10 } = options
    const cacheParams = { type: 'preferences', days, limit }

    // 尝试从缓存获取
    const cached = await BusinessCacheHelper.getStats('user_exchange', cacheParams)
    if (cached) {
      logger.debug('从缓存获取兑换偏好数据')
      return cached
    }

    logger.info('计算兑换偏好统计', { days, limit })

    try {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)

      // 统计兑换商品偏好
      const exchangeStats = await models.ExchangeRecord.findAll({
        attributes: [
          'target_id',
          [fn('COUNT', col('exchange_id')), 'exchange_count'],
          [fn('SUM', col('quantity')), 'total_quantity'],
          [fn('COUNT', literal('DISTINCT user_id')), 'unique_users']
        ],
        where: {
          created_at: { [Op.gte]: startDate },
          status: { [Op.in]: ['completed', 'pending'] }
        },
        group: ['target_id'],
        order: [[literal('exchange_count'), 'DESC']],
        limit,
        raw: true
      })

      // 获取商品详情
      const targetIds = exchangeStats.map(s => s.target_id)
      const targetDetails = {}

      if (targetIds.length > 0 && models.ItemTemplate) {
        const templates = await models.ItemTemplate.findAll({
          where: { item_template_id: { [Op.in]: targetIds } },
          attributes: ['item_template_id', 'item_name', 'category_code', 'rarity_code'],
          raw: true
        })

        templates.forEach(t => {
          targetDetails[t.item_template_id] = t
        })
      }

      // 构建偏好列表
      const preferences = exchangeStats.map((stat, index) => {
        const detail = targetDetails[stat.target_id] || {}
        return {
          rank: index + 1,
          target_id: stat.target_id,
          item_name: detail.item_name || `商品${stat.target_id}`,
          category_code: detail.category_code,
          rarity_code: detail.rarity_code,
          exchange_count: parseInt(stat.exchange_count),
          total_quantity: parseInt(stat.total_quantity) || parseInt(stat.exchange_count),
          unique_users: parseInt(stat.unique_users)
        }
      })

      // 计算总体统计
      const totalExchanges = preferences.reduce((sum, p) => sum + p.exchange_count, 0)
      const totalUsers = preferences.reduce((sum, p) => sum + p.unique_users, 0)

      const result = {
        preferences,
        statistics: {
          total_exchanges: totalExchanges,
          total_unique_users: totalUsers,
          analysis_period: `最近${days}天`,
          top_item: preferences[0]?.item_name || '暂无数据'
        },
        generated_at: BeijingTimeHelper.now()
      }

      // 缓存15分钟
      await BusinessCacheHelper.setStats('user_exchange', cacheParams, result)

      logger.info('兑换偏好统计完成', {
        total_exchanges: totalExchanges,
        top_count: preferences.length
      })

      return result
    } catch (error) {
      logger.error('获取兑换偏好失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取行为漏斗数据
   *
   * P1 需求 B-24：行为漏斗接口
   *
   * @param {Object} models - Sequelize 模型集合
   * @param {Object} [options] - 查询选项
   * @param {number} [options.days=7] - 统计天数
   * @returns {Promise<Object>} 漏斗数据
   */
  static async getBehaviorFunnel(models, options = {}) {
    const { days = 7 } = options
    const cacheParams = { type: 'funnel', days }

    // 尝试从缓存获取
    const cached = await BusinessCacheHelper.getStats('user_behavior', cacheParams)
    if (cached) {
      logger.debug('从缓存获取行为漏斗数据')
      return cached
    }

    logger.info('计算行为漏斗数据', { days })

    try {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)

      // 并行查询各漏斗阶段数据
      const [activeUsers, lotteryUsers, consumptionUsers, exchangeUsers] = await Promise.all([
        // 1. 活跃用户（登录）
        models.User.count({
          where: {
            last_login: { [Op.gte]: startDate },
            status: 'active'
          }
        }),

        // 2. 参与抽奖用户
        models.LotteryDraw.count({
          distinct: true,
          col: 'user_id',
          where: {
            created_at: { [Op.gte]: startDate }
          }
        }),

        // 3. 消费触发用户
        models.ConsumptionRecord.count({
          distinct: true,
          col: 'user_id',
          where: {
            created_at: { [Op.gte]: startDate },
            status: 'approved'
          }
        }),

        // 4. 兑换用户
        models.ExchangeRecord.count({
          distinct: true,
          col: 'user_id',
          where: {
            created_at: { [Op.gte]: startDate },
            status: { [Op.in]: ['completed', 'pending'] }
          }
        })
      ])

      // 构建漏斗数据
      const funnel = [
        {
          stage: 'active',
          name: '活跃用户',
          count: activeUsers,
          percentage: 100
        },
        {
          stage: 'lottery',
          name: '参与抽奖',
          count: lotteryUsers,
          percentage: activeUsers > 0 ? Math.round((lotteryUsers / activeUsers) * 10000) / 100 : 0
        },
        {
          stage: 'consumption',
          name: '消费触发',
          count: consumptionUsers,
          percentage:
            activeUsers > 0 ? Math.round((consumptionUsers / activeUsers) * 10000) / 100 : 0
        },
        {
          stage: 'exchange',
          name: '积分兑换',
          count: exchangeUsers,
          percentage: activeUsers > 0 ? Math.round((exchangeUsers / activeUsers) * 10000) / 100 : 0
        }
      ]

      // 计算转化率
      const conversionRates = {
        active_to_lottery:
          activeUsers > 0 ? Math.round((lotteryUsers / activeUsers) * 10000) / 100 : 0,
        lottery_to_consumption:
          lotteryUsers > 0 ? Math.round((consumptionUsers / lotteryUsers) * 10000) / 100 : 0,
        consumption_to_exchange:
          consumptionUsers > 0 ? Math.round((exchangeUsers / consumptionUsers) * 10000) / 100 : 0,
        overall: activeUsers > 0 ? Math.round((exchangeUsers / activeUsers) * 10000) / 100 : 0
      }

      const result = {
        funnel,
        conversion_rates: conversionRates,
        analysis_period: `最近${days}天`,
        insights: UserSegmentService._generateFunnelInsights(funnel, conversionRates),
        generated_at: BeijingTimeHelper.now()
      }

      // 缓存10分钟
      await BusinessCacheHelper.setStats('user_behavior', cacheParams, result)

      logger.info('行为漏斗计算完成', {
        active: activeUsers,
        lottery: lotteryUsers,
        consumption: consumptionUsers,
        exchange: exchangeUsers
      })

      return result
    } catch (error) {
      logger.error('获取行为漏斗失败', { error: error.message })
      throw error
    }
  }

  // ========== 私有辅助方法 ==========

  /**
   * 计算各分层用户数量
   * @private
   * @param {Object} models - Sequelize 模型集合
   * @param {Object} dates - 日期范围对象
   * @returns {Promise<Object>} 各分层用户数量
   */
  static async _calculateSegmentCounts(models, dates) {
    const { day7Ago, day30Ago, day60Ago: _day60Ago } = dates

    // 使用原生 SQL 进行复杂统计（性能优化）
    const [results] = await models.sequelize.query(
      `
      WITH user_activity AS (
        SELECT 
          u.user_id,
          COALESCE(lottery_7d.cnt, 0) AS lottery_7d,
          COALESCE(consumption_7d.cnt, 0) AS consumption_7d,
          COALESCE(lottery_30d.cnt, 0) AS lottery_30d,
          COALESCE(consumption_30d.cnt, 0) AS consumption_30d,
          DATEDIFF(NOW(), COALESCE(u.last_login, u.created_at)) AS last_activity_days
        FROM users u
        LEFT JOIN (
          SELECT user_id, COUNT(*) AS cnt 
          FROM lottery_draws 
          WHERE created_at >= :day7Ago
          GROUP BY user_id
        ) lottery_7d ON u.user_id = lottery_7d.user_id
        LEFT JOIN (
          SELECT user_id, COUNT(*) AS cnt 
          FROM consumption_records 
          WHERE created_at >= :day7Ago AND status = 'approved'
          GROUP BY user_id
        ) consumption_7d ON u.user_id = consumption_7d.user_id
        LEFT JOIN (
          SELECT user_id, COUNT(*) AS cnt 
          FROM lottery_draws 
          WHERE created_at >= :day30Ago
          GROUP BY user_id
        ) lottery_30d ON u.user_id = lottery_30d.user_id
        LEFT JOIN (
          SELECT user_id, COUNT(*) AS cnt 
          FROM consumption_records 
          WHERE created_at >= :day30Ago AND status = 'approved'
          GROUP BY user_id
        ) consumption_30d ON u.user_id = consumption_30d.user_id
        WHERE u.status = 'active'
      )
      SELECT
        SUM(CASE WHEN lottery_7d >= 10 AND consumption_7d >= 3 THEN 1 ELSE 0 END) AS high_value,
        SUM(CASE WHEN (lottery_7d >= 3 OR consumption_7d >= 1) 
                  AND NOT (lottery_7d >= 10 AND consumption_7d >= 3) THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN lottery_30d = 0 AND consumption_30d = 0 
                  AND last_activity_days < 60 THEN 1 ELSE 0 END) AS silent,
        SUM(CASE WHEN last_activity_days >= 60 THEN 1 ELSE 0 END) AS churned
      FROM user_activity
    `,
      {
        replacements: {
          day7Ago: day7Ago.toISOString().slice(0, 19).replace('T', ' '),
          day30Ago: day30Ago.toISOString().slice(0, 19).replace('T', ' ')
        }
      }
    )

    return {
      high_value: parseInt(results[0]?.high_value || 0),
      active: parseInt(results[0]?.active || 0),
      silent: parseInt(results[0]?.silent || 0),
      churned: parseInt(results[0]?.churned || 0)
    }
  }

  /**
   * 获取分层用户ID列表
   * @private
   * @param {Object} models - Sequelize 模型集合
   * @param {string} segmentType - 分层类型
   * @param {Object} options - 查询选项
   * @returns {Promise<Array<number>>} 用户ID列表
   */
  static async _getSegmentUserIds(models, segmentType, options) {
    const { day7Ago, day30Ago, day60Ago: _day60Ago, limit, offset } = options

    let whereClause = ''
    switch (segmentType) {
      case 'high_value':
        whereClause = 'lottery_7d >= 10 AND consumption_7d >= 3'
        break
      case 'active':
        whereClause =
          '(lottery_7d >= 3 OR consumption_7d >= 1) AND NOT (lottery_7d >= 10 AND consumption_7d >= 3)'
        break
      case 'silent':
        whereClause = 'lottery_30d = 0 AND consumption_30d = 0 AND last_activity_days < 60'
        break
      case 'churned':
        whereClause = 'last_activity_days >= 60'
        break
      default:
        throw new Error(`无效的分层类型: ${segmentType}`)
    }

    const [results] = await models.sequelize.query(
      `
      WITH user_activity AS (
        SELECT 
          u.user_id,
          COALESCE(lottery_7d.cnt, 0) AS lottery_7d,
          COALESCE(consumption_7d.cnt, 0) AS consumption_7d,
          COALESCE(lottery_30d.cnt, 0) AS lottery_30d,
          COALESCE(consumption_30d.cnt, 0) AS consumption_30d,
          DATEDIFF(NOW(), COALESCE(u.last_login, u.created_at)) AS last_activity_days
        FROM users u
        LEFT JOIN (
          SELECT user_id, COUNT(*) AS cnt 
          FROM lottery_draws 
          WHERE created_at >= :day7Ago
          GROUP BY user_id
        ) lottery_7d ON u.user_id = lottery_7d.user_id
        LEFT JOIN (
          SELECT user_id, COUNT(*) AS cnt 
          FROM consumption_records 
          WHERE created_at >= :day7Ago AND status = 'approved'
          GROUP BY user_id
        ) consumption_7d ON u.user_id = consumption_7d.user_id
        LEFT JOIN (
          SELECT user_id, COUNT(*) AS cnt 
          FROM lottery_draws 
          WHERE created_at >= :day30Ago
          GROUP BY user_id
        ) lottery_30d ON u.user_id = lottery_30d.user_id
        LEFT JOIN (
          SELECT user_id, COUNT(*) AS cnt 
          FROM consumption_records 
          WHERE created_at >= :day30Ago AND status = 'approved'
          GROUP BY user_id
        ) consumption_30d ON u.user_id = consumption_30d.user_id
        WHERE u.status = 'active'
      )
      SELECT user_id
      FROM user_activity
      WHERE ${whereClause}
      LIMIT :limit OFFSET :offset
    `,
      {
        replacements: {
          day7Ago: day7Ago.toISOString().slice(0, 19).replace('T', ' '),
          day30Ago: day30Ago.toISOString().slice(0, 19).replace('T', ' '),
          limit,
          offset
        }
      }
    )

    return results.map(r => r.user_id)
  }

  /**
   * 获取分层用户总数
   * @private
   * @param {Object} models - Sequelize 模型集合
   * @param {string} segmentType - 分层类型
   * @param {Object} dates - 日期范围对象
   * @returns {Promise<number>} 用户总数
   */
  static async _getSegmentUserCount(models, segmentType, dates) {
    const counts = await UserSegmentService._calculateSegmentCounts(models, dates)
    return counts[segmentType] || 0
  }

  /**
   * 生成漏斗洞察
   * @private
   * @param {Array<Object>} funnel - 漏斗数据
   * @param {Object} conversionRates - 转化率数据
   * @returns {Array<Object>} 洞察建议列表
   */
  static _generateFunnelInsights(funnel, conversionRates) {
    const insights = []

    if (conversionRates.active_to_lottery < 30) {
      insights.push({
        type: 'warning',
        stage: 'active_to_lottery',
        message: `抽奖参与率 ${conversionRates.active_to_lottery}% 偏低，建议增加活动曝光`
      })
    }

    if (conversionRates.lottery_to_consumption < 20) {
      insights.push({
        type: 'warning',
        stage: 'lottery_to_consumption',
        message: `抽奖到消费转化率 ${conversionRates.lottery_to_consumption}% 较低，建议优化奖品激励`
      })
    }

    if (conversionRates.overall > 10) {
      insights.push({
        type: 'success',
        stage: 'overall',
        message: `整体转化率 ${conversionRates.overall}% 表现良好`
      })
    }

    return insights
  }
}

module.exports = UserSegmentService
