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

      // 统计兑换商品偏好（按 exchange_item_id 分组）
      const exchangeStats = await models.ExchangeRecord.findAll({
        attributes: [
          'exchange_item_id',
          [fn('COUNT', col('exchange_record_id')), 'exchange_count'],
          [fn('SUM', col('quantity')), 'total_quantity'],
          [fn('COUNT', literal('DISTINCT user_id')), 'unique_users']
        ],
        where: {
          created_at: { [Op.gte]: startDate },
          status: { [Op.in]: ['completed', 'pending', 'shipped'] }
        },
        group: ['exchange_item_id'],
        order: [[literal('exchange_count'), 'DESC']],
        limit,
        raw: true
      })

      // 获取兑换商品详情（关联 ExchangeItem 模型）
      const exchangeItemIds = exchangeStats.map(s => s.exchange_item_id)
      const itemDetails = {}

      if (exchangeItemIds.length > 0 && models.ExchangeItem) {
        const items = await models.ExchangeItem.findAll({
          where: { exchange_item_id: { [Op.in]: exchangeItemIds } },
          attributes: ['exchange_item_id', 'item_name', 'cost_asset_code', 'cost_amount'],
          raw: true
        })

        items.forEach(item => {
          itemDetails[item.exchange_item_id] = item
        })
      }

      // 构建偏好列表
      const preferences = exchangeStats.map((stat, index) => {
        const detail = itemDetails[stat.exchange_item_id] || {}
        return {
          rank: index + 1,
          exchange_item_id: stat.exchange_item_id,
          item_name: detail.item_name || `商品${stat.exchange_item_id}`,
          cost_asset_code: detail.cost_asset_code,
          cost_amount: detail.cost_amount ? parseInt(detail.cost_amount) : null,
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

  /**
   * 获取行为漏斗趋势数据
   *
   * 功能说明：获取指定天数内每日的漏斗转化率变化趋势
   * 用于运营仪表盘"转化率趋势"图表展示
   *
   * @param {Object} models - Sequelize 模型集合
   * @param {Object} [options] - 查询选项
   * @param {number} [options.days=7] - 统计天数（默认7天）
   * @returns {Promise<Object>} 漏斗趋势数据
   *
   * @example
   * const trend = await UserSegmentService.getFunnelTrend(models, { days: 7 })
   * // 返回：
   * // {
   * //   trend: [
   * //     { date: '02/01', active_count: 100, lottery_rate: 65.5, consumption_rate: 40.2, exchange_rate: 20.1 },
   * //     { date: '02/02', active_count: 105, lottery_rate: 68.3, consumption_rate: 42.5, exchange_rate: 22.0 },
   * //     ...
   * //   ],
   * //   period_days: 7,
   * //   generated_at: '2026-02-05T10:00:00+08:00'
   * // }
   */
  static async getFunnelTrend(models, options = {}) {
    const { days = 7 } = options
    const cacheParams = { type: 'funnel_trend', days }

    // 尝试从缓存获取（趋势数据缓存15分钟）
    const cached = await BusinessCacheHelper.getStats('user_behavior_trend', cacheParams)
    if (cached) {
      logger.debug('从缓存获取漏斗趋势数据')
      return cached
    }

    logger.info('计算漏斗趋势数据', { days })

    try {
      // 计算日期范围
      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - days)

      /*
       * 使用原生SQL查询每日漏斗数据（性能优化）
       * 按日期分组统计各阶段数据
       */
      const [dailyStats] = await models.sequelize.query(
        `
        WITH date_series AS (
          -- 生成日期序列
          SELECT DATE(DATE_SUB(CURDATE(), INTERVAL n DAY)) AS stat_date
          FROM (
            SELECT 0 AS n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 
            UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7
            UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11
            UNION SELECT 12 UNION SELECT 13 UNION SELECT 14
          ) numbers
          WHERE n < :days
        ),
        daily_active AS (
          -- 每日活跃用户数（当日有登录）
          SELECT 
            DATE(last_login) AS stat_date,
            COUNT(DISTINCT user_id) AS active_count
          FROM users
          WHERE last_login >= :startDate
            AND last_login < DATE_ADD(:endDate, INTERVAL 1 DAY)
            AND status = 'active'
          GROUP BY DATE(last_login)
        ),
        daily_lottery AS (
          -- 每日抽奖用户数
          SELECT 
            DATE(created_at) AS stat_date,
            COUNT(DISTINCT user_id) AS lottery_count
          FROM lottery_draws
          WHERE created_at >= :startDate
            AND created_at < DATE_ADD(:endDate, INTERVAL 1 DAY)
          GROUP BY DATE(created_at)
        ),
        daily_consumption AS (
          -- 每日消费触发用户数（已审核通过）
          SELECT 
            DATE(created_at) AS stat_date,
            COUNT(DISTINCT user_id) AS consumption_count
          FROM consumption_records
          WHERE created_at >= :startDate
            AND created_at < DATE_ADD(:endDate, INTERVAL 1 DAY)
            AND status = 'approved'
          GROUP BY DATE(created_at)
        ),
        daily_exchange AS (
          -- 每日兑换用户数
          SELECT 
            DATE(created_at) AS stat_date,
            COUNT(DISTINCT user_id) AS exchange_count
          FROM exchange_records
          WHERE created_at >= :startDate
            AND created_at < DATE_ADD(:endDate, INTERVAL 1 DAY)
            AND status IN ('completed', 'pending')
          GROUP BY DATE(created_at)
        )
        SELECT 
          DATE_FORMAT(ds.stat_date, '%m/%d') AS date,
          ds.stat_date AS full_date,
          COALESCE(da.active_count, 0) AS active_count,
          COALESCE(dl.lottery_count, 0) AS lottery_count,
          COALESCE(dc.consumption_count, 0) AS consumption_count,
          COALESCE(de.exchange_count, 0) AS exchange_count
        FROM date_series ds
        LEFT JOIN daily_active da ON ds.stat_date = da.stat_date
        LEFT JOIN daily_lottery dl ON ds.stat_date = dl.stat_date
        LEFT JOIN daily_consumption dc ON ds.stat_date = dc.stat_date
        LEFT JOIN daily_exchange de ON ds.stat_date = de.stat_date
        ORDER BY ds.stat_date ASC
        `,
        {
          replacements: {
            days,
            startDate: startDate.toISOString().slice(0, 10),
            endDate: endDate.toISOString().slice(0, 10)
          }
        }
      )

      // 计算每日转化率
      const trend = dailyStats.map(day => {
        const activeCount = parseInt(day.active_count) || 0
        const lotteryCount = parseInt(day.lottery_count) || 0
        const consumptionCount = parseInt(day.consumption_count) || 0
        const exchangeCount = parseInt(day.exchange_count) || 0

        return {
          date: day.date,
          full_date: day.full_date,
          active_count: activeCount,
          // 转化率计算：各阶段用户数 / 活跃用户数 * 100
          lottery_rate:
            activeCount > 0 ? Math.round((lotteryCount / activeCount) * 10000) / 100 : 0,
          consumption_rate:
            activeCount > 0 ? Math.round((consumptionCount / activeCount) * 10000) / 100 : 0,
          exchange_rate:
            activeCount > 0 ? Math.round((exchangeCount / activeCount) * 10000) / 100 : 0
        }
      })

      // 计算趋势统计摘要
      const validDays = trend.filter(d => d.active_count > 0)
      const avgLotteryRate =
        validDays.length > 0
          ? Math.round(
              (validDays.reduce((sum, d) => sum + d.lottery_rate, 0) / validDays.length) * 100
            ) / 100
          : 0
      const avgConsumptionRate =
        validDays.length > 0
          ? Math.round(
              (validDays.reduce((sum, d) => sum + d.consumption_rate, 0) / validDays.length) * 100
            ) / 100
          : 0
      const avgExchangeRate =
        validDays.length > 0
          ? Math.round(
              (validDays.reduce((sum, d) => sum + d.exchange_rate, 0) / validDays.length) * 100
            ) / 100
          : 0

      const result = {
        trend,
        summary: {
          avg_lottery_rate: avgLotteryRate,
          avg_consumption_rate: avgConsumptionRate,
          avg_exchange_rate: avgExchangeRate,
          total_active_days: validDays.length
        },
        period_days: days,
        generated_at: BeijingTimeHelper.now()
      }

      // 缓存15分钟
      await BusinessCacheHelper.setStats('user_behavior_trend', cacheParams, result)

      logger.info('漏斗趋势数据计算完成', {
        days,
        trend_points: trend.length,
        avg_lottery_rate: avgLotteryRate
      })

      return result
    } catch (error) {
      logger.error('获取漏斗趋势数据失败', { error: error.message, stack: error.stack })
      throw error
    }
  }

  /**
   * 获取用户历史审核通过率
   *
   * @description 统计指定用户的消费记录历史审核通过率
   * 用于管理员审核时参考用户信用状况
   *
   * @param {Object} models - Sequelize 模型集合
   * @param {Object} options - 查询选项
   * @param {number} options.user_id - 用户ID
   * @param {number} [options.days=90] - 统计天数
   *
   * @returns {Promise<Object>} 审核率数据
   *
   * 关联需求：§4.11.1 用户审核率接口
   */
  static async getUserApprovalRate(models, options = {}) {
    const { user_id, days = 90 } = options
    const { Op, fn, col } = require('sequelize')
    const BeijingTimeHelper = require('../../utils/timeHelper')

    const startDate = BeijingTimeHelper.daysAgo(days)

    try {
      // 查询用户消费记录统计
      const stats = await models.ConsumptionRecord.findOne({
        attributes: [
          [fn('COUNT', col('consumption_record_id')), 'total_count'],
          [
            fn('SUM', models.sequelize.literal("CASE WHEN status = 'approved' THEN 1 ELSE 0 END")),
            'approved_count'
          ],
          [
            fn('SUM', models.sequelize.literal("CASE WHEN status = 'rejected' THEN 1 ELSE 0 END")),
            'rejected_count'
          ],
          [
            fn('SUM', models.sequelize.literal("CASE WHEN status = 'pending' THEN 1 ELSE 0 END")),
            'pending_count'
          ]
        ],
        where: {
          user_id,
          created_at: { [Op.gte]: startDate }
        },
        raw: true
      })

      const totalCount = parseInt(stats?.total_count || 0, 10)
      const approvedCount = parseInt(stats?.approved_count || 0, 10)
      const rejectedCount = parseInt(stats?.rejected_count || 0, 10)
      const pendingCount = parseInt(stats?.pending_count || 0, 10)

      // 计算审核通过率（排除待审核的）
      const decidedCount = approvedCount + rejectedCount
      const approvalRate = decidedCount > 0 ? approvedCount / decidedCount : 1 // 无记录默认为1

      // 确定信用等级
      let creditLevel
      let creditLevelText
      if (approvalRate >= 0.95) {
        creditLevel = 'excellent'
        creditLevelText = '信用优秀'
      } else if (approvalRate >= 0.85) {
        creditLevel = 'good'
        creditLevelText = '信用良好'
      } else if (approvalRate >= 0.7) {
        creditLevel = 'normal'
        creditLevelText = '信用一般'
      } else if (approvalRate >= 0.5) {
        creditLevel = 'warning'
        creditLevelText = '需要关注'
      } else {
        creditLevel = 'poor'
        creditLevelText = '信用较差'
      }

      return {
        user_id,
        approval_rate: parseFloat(approvalRate.toFixed(4)),
        total_count: totalCount,
        approved_count: approvedCount,
        rejected_count: rejectedCount,
        pending_count: pendingCount,
        credit_level: creditLevel,
        credit_level_text: creditLevelText,
        period_days: days,
        updated_at: BeijingTimeHelper.apiTimestamp()
      }
    } catch (error) {
      require('../../utils/logger').logger.error('[用户分层] 获取审核率失败', {
        user_id,
        error: error.message
      })
      throw error
    }
  }
}

module.exports = UserSegmentService
