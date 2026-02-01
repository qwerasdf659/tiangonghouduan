/**
 * 报表服务 - 图表数据子服务（V4.7.0 大文件拆分）
 *
 * @description 从 ReportingService.js 拆分出的图表数据相关功能
 * @see docs/大文件拆分方案（保持单体架构）.md
 *
 * 职责范围：
 * - 用户增长图表数据
 * - 用户类型分布数据
 * - 抽奖趋势图表数据
 * - 消费趋势图表数据
 * - 积分流水图表数据
 * - 热门奖品TOP10数据
 * - 活跃时段分布数据
 *
 * 使用场景：
 * - 管理后台图表展示
 * - 数据可视化报表
 *
 * 依赖：
 * - models: 数据库模型
 * - BusinessCacheHelper: Redis 缓存助手
 */

const models = require('../../models')
const { Op, fn, col, literal } = require('sequelize')
const logger = require('../../utils/logger').logger
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')

/**
 * 图表数据子服务
 *
 * @class ChartsService
 */
class ChartsService {
  /**
   * 获取图表统计数据
   *
   * @description 获取多维度的图表统计数据，支持不同时间周期
   *
   * @param {number} days - 统计天数（7/30/90）
   * @param {Object} options - 选项
   * @param {boolean} options.refresh - 强制刷新缓存
   * @returns {Promise<Object>} 包含所有图表数据的对象
   * @throws {Error} 参数错误、数据库查询失败等
   */
  static async getChartsData(days = 30, options = {}) {
    const { refresh = false } = options

    // 1. 验证查询参数 (扩展支持：1天用于今日/昨日, 7/14/30/90/365天用于不同周期)
    const allowedDays = [1, 7, 14, 30, 90, 365]
    if (!allowedDays.includes(days)) {
      const error = new Error(`参数错误：days必须是${allowedDays.join('、')}之一`)
      error.code = 'INVALID_DAYS_PARAMETER'
      error.allowedValues = allowedDays
      throw error
    }

    // ========== Redis 缓存读取（2026-01-03 P1 缓存优化）==========
    const cacheParams = { days }
    if (!refresh) {
      const cached = await BusinessCacheHelper.getStats('charts', cacheParams)
      if (cached) {
        logger.debug('[报表缓存] charts 命中', { days })
        return cached
      }
    }

    logger.info(`开始查询图表数据，时间范围: 最近${days}天`)

    // 2. 计算时间范围（北京时间）
    const now = new Date()
    const beijing_now = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))

    // 设置结束时间为今天23:59:59
    const end_date = new Date(beijing_now)
    end_date.setHours(23, 59, 59, 999)

    // 设置开始时间为N天前的00:00:00
    const start_date = new Date(beijing_now)
    start_date.setDate(start_date.getDate() - days)
    start_date.setHours(0, 0, 0, 0)

    logger.info(
      `查询时间范围: ${start_date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} ~ ${end_date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`
    )

    // 3. 并行查询所有统计数据
    const start_time = Date.now()

    const [
      user_growth,
      user_types,
      lottery_trend,
      consumption_trend,
      points_flow,
      top_prizes,
      active_hours
    ] = await Promise.all([
      this.getUserGrowthData(start_date, end_date, days),
      this.getUserTypesData(),
      this.getLotteryTrendData(start_date, end_date, days),
      this.getConsumptionTrendData(start_date, end_date, days),
      this.getPointsFlowData(start_date, end_date, days),
      this.getTopPrizesData(start_date, end_date),
      this.getActiveHoursData(start_date, end_date)
    ])

    const query_time = Date.now() - start_time
    logger.info(`图表数据查询完成，耗时: ${query_time}ms`)

    // 4. 组装响应数据
    const chartsData = {
      user_growth,
      user_types,
      lottery_trend,
      consumption_trend,
      points_flow,
      top_prizes,
      active_hours,

      // 元数据
      metadata: {
        days,
        start_date: start_date.toISOString().replace('Z', '+08:00'),
        end_date: end_date.toISOString().replace('Z', '+08:00'),
        query_time_ms: query_time,
        generated_at: beijing_now.toISOString().replace('Z', '+08:00')
      }
    }

    // ========== 写入 Redis 缓存（60s TTL）==========
    await BusinessCacheHelper.setStats('charts', cacheParams, chartsData)

    return chartsData
  }

  /**
   * 获取用户增长趋势数据
   *
   * @param {Date} start_date - 开始日期
   * @param {Date} end_date - 结束日期
   * @param {number} days - 天数
   * @returns {Promise<Array>} 用户增长数据数组
   */
  static async getUserGrowthData(start_date, end_date, days) {
    try {
      // 查询每天新增用户数
      const daily_users = await models.User.findAll({
        attributes: [
          [fn('DATE', col('created_at')), 'date'],
          [fn('COUNT', col('user_id')), 'count']
        ],
        where: {
          created_at: {
            [Op.between]: [start_date, end_date]
          }
        },
        group: [fn('DATE', col('created_at'))],
        order: [[fn('DATE', col('created_at')), 'ASC']],
        raw: true
      })

      // 查询总用户数（用于计算累计值）
      const total_users_before = await models.User.count({
        where: {
          created_at: {
            [Op.lt]: start_date
          }
        }
      })

      // 生成完整的日期序列（填充缺失日期）
      const growth_data = []
      let cumulative = total_users_before

      for (let i = 0; i < days; i++) {
        const current_date = new Date(start_date)
        current_date.setDate(current_date.getDate() + i)
        const date_str = current_date.toISOString().split('T')[0]

        // 查找当天的数据
        const day_data = daily_users.find(item => item.date === date_str)
        const count = day_data ? parseInt(day_data.count) : 0

        cumulative += count

        growth_data.push({
          date: date_str,
          count,
          cumulative
        })
      }

      logger.info(
        `用户增长数据: ${days}天内新增${cumulative - total_users_before}人，总用户${cumulative}人`
      )
      return growth_data
    } catch (error) {
      logger.error('获取用户增长数据失败:', error)
      return []
    }
  }

  /**
   * 获取用户类型分布数据
   *
   * @returns {Promise<Object>} 用户类型统计对象
   */
  static async getUserTypesData() {
    try {
      const Role = models.Role

      // 查询各类型用户数量（通过角色关联）
      const [admin_role_users, merchant_role_users, all_users] = await Promise.all([
        // 管理员用户：拥有admin角色
        models.User.count({
          distinct: true,
          include: [
            {
              model: Role,
              as: 'roles',
              where: { role_name: 'admin', is_active: true },
              through: { where: { is_active: true } },
              required: true
            }
          ]
        }),

        // 商家用户：拥有merchant角色
        models.User.count({
          distinct: true,
          include: [
            {
              model: Role,
              as: 'roles',
              where: { role_name: 'merchant', is_active: true },
              through: { where: { is_active: true } },
              required: true
            }
          ]
        }),

        // 总用户数
        models.User.count()
      ])

      // 普通用户 = 总用户 - 管理员 - 商家（未分配角色的用户计入普通用户）
      const regular_users = all_users - admin_role_users - merchant_role_users

      const types_data = {
        regular: {
          count: regular_users,
          percentage: all_users > 0 ? ((regular_users / all_users) * 100).toFixed(2) : '0.00'
        },
        admin: {
          count: admin_role_users,
          percentage: all_users > 0 ? ((admin_role_users / all_users) * 100).toFixed(2) : '0.00'
        },
        merchant: {
          count: merchant_role_users,
          percentage: all_users > 0 ? ((merchant_role_users / all_users) * 100).toFixed(2) : '0.00'
        },
        total: all_users
      }

      logger.info(
        `用户类型分布: 普通${regular_users}, 管理员${admin_role_users}, 商家${merchant_role_users}, 总用户${all_users}`
      )
      return types_data
    } catch (error) {
      logger.error('获取用户类型数据失败:', error)
      return {
        regular: { count: 0, percentage: '0.00' },
        admin: { count: 0, percentage: '0.00' },
        merchant: { count: 0, percentage: '0.00' },
        total: 0
      }
    }
  }

  /**
   * 获取抽奖趋势数据
   *
   * @param {Date} start_date - 开始日期
   * @param {Date} end_date - 结束日期
   * @param {number} days - 天数
   * @returns {Promise<Array>} 抽奖趋势数据数组
   */
  static async getLotteryTrendData(start_date, end_date, days) {
    try {
      // 查询每天抽奖数据
      const daily_lottery = await models.LotteryDraw.findAll({
        attributes: [
          [fn('DATE', col('created_at')), 'date'],
          [fn('COUNT', col('lottery_draw_id')), 'count'],
          // V4.0语义更新：统计高档奖励次数
          [
            fn('SUM', literal("CASE WHEN reward_tier = 'high' THEN 1 ELSE 0 END")),
            'high_tier_count'
          ]
        ],
        where: {
          created_at: {
            [Op.between]: [start_date, end_date]
          }
        },
        group: [fn('DATE', col('created_at'))],
        order: [[fn('DATE', col('created_at')), 'ASC']],
        raw: true
      })

      // 生成完整的日期序列
      const trend_data = []

      for (let i = 0; i < days; i++) {
        const current_date = new Date(start_date)
        current_date.setDate(current_date.getDate() + i)
        const date_str = current_date.toISOString().split('T')[0]

        const day_data = daily_lottery.find(item => item.date === date_str)
        const count = day_data ? parseInt(day_data.count) : 0
        // V4.0语义更新：使用 high_tier_count 替代 win_count
        const high_tier_count = day_data ? parseInt(day_data.high_tier_count || 0) : 0
        const high_tier_rate = count > 0 ? ((high_tier_count / count) * 100).toFixed(2) : '0.00'

        trend_data.push({
          date: date_str,
          count,
          // V4.0语义更新：使用 high_tier_count 和 high_tier_rate 替代 win_count 和 win_rate
          high_tier_count,
          high_tier_rate
        })
      }

      const total_draws = trend_data.reduce((sum, item) => sum + item.count, 0)
      logger.info(`抽奖趋势数据: ${days}天内共${total_draws}次抽奖`)
      return trend_data
    } catch (error) {
      logger.error('获取抽奖趋势数据失败:', error)
      return []
    }
  }

  /**
   * 获取消费趋势数据
   *
   * @param {Date} start_date - 开始日期
   * @param {Date} end_date - 结束日期
   * @param {number} days - 天数
   * @returns {Promise<Array>} 消费趋势数据数组
   */
  static async getConsumptionTrendData(start_date, end_date, days) {
    try {
      // 查询每天消费数据（只统计已审核通过的记录）
      const daily_consumption = await models.ConsumptionRecord.findAll({
        attributes: [
          [fn('DATE', col('created_at')), 'date'],
          [fn('COUNT', col('consumption_record_id')), 'count'],
          [fn('SUM', col('consumption_amount')), 'amount'],
          [fn('AVG', col('consumption_amount')), 'avg_amount']
        ],
        where: {
          created_at: {
            [Op.between]: [start_date, end_date]
          },
          status: 'approved'
        },
        group: [fn('DATE', col('created_at'))],
        order: [[fn('DATE', col('created_at')), 'ASC']],
        raw: true
      })

      // 生成完整的日期序列
      const trend_data = []

      for (let i = 0; i < days; i++) {
        const current_date = new Date(start_date)
        current_date.setDate(current_date.getDate() + i)
        const date_str = current_date.toISOString().split('T')[0]

        const day_data = daily_consumption.find(item => item.date === date_str)

        trend_data.push({
          date: date_str,
          count: day_data ? parseInt(day_data.count) : 0,
          amount: day_data ? parseFloat(day_data.amount).toFixed(2) : '0.00',
          avg_amount: day_data ? parseFloat(day_data.avg_amount).toFixed(2) : '0.00'
        })
      }

      const total_amount = trend_data.reduce((sum, item) => sum + parseFloat(item.amount), 0)
      logger.info(`消费趋势数据: ${days}天内消费总额¥${total_amount.toFixed(2)}`)
      return trend_data
    } catch (error) {
      logger.error('获取消费趋势数据失败:', error)
      return []
    }
  }

  /**
   * 获取积分流水数据
   *
   * @param {Date} start_date - 开始日期
   * @param {Date} end_date - 结束日期
   * @param {number} days - 天数
   * @returns {Promise<Array>} 积分流水数据数组
   */
  static async getPointsFlowData(start_date, end_date, days) {
    try {
      /**
       * 查询每天积分流水（使用 AssetTransaction，过滤 asset_code='POINTS'）
       * delta_amount > 0 表示收入，delta_amount < 0 表示支出
       */
      const daily_points = await models.AssetTransaction.findAll({
        attributes: [
          [fn('DATE', col('created_at')), 'date'],
          [fn('SUM', literal('CASE WHEN delta_amount > 0 THEN delta_amount ELSE 0 END')), 'earned'],
          [
            fn(
              'SUM',
              literal(
                'CASE WHEN delta_amount < 0 THEN -CAST(delta_amount AS DECIMAL(30,2)) ELSE 0 END'
              )
            ),
            'spent'
          ]
        ],
        where: {
          asset_code: 'POINTS',
          created_at: {
            [Op.between]: [start_date, end_date]
          }
        },
        group: [fn('DATE', col('created_at'))],
        order: [[fn('DATE', col('created_at')), 'ASC']],
        raw: true
      })

      // 生成完整的日期序列
      const flow_data = []

      for (let i = 0; i < days; i++) {
        const current_date = new Date(start_date)
        current_date.setDate(current_date.getDate() + i)
        const date_str = current_date.toISOString().split('T')[0]

        const day_data = daily_points.find(item => item.date === date_str)
        const earned = day_data ? parseInt(day_data.earned) : 0
        const spent = day_data ? parseInt(day_data.spent) : 0

        flow_data.push({
          date: date_str,
          earned,
          spent,
          balance_change: earned - spent
        })
      }

      const total_earned = flow_data.reduce((sum, item) => sum + item.earned, 0)
      const total_spent = flow_data.reduce((sum, item) => sum + item.spent, 0)
      logger.info(`积分流水数据: ${days}天内收入${total_earned}分，支出${total_spent}分`)
      return flow_data
    } catch (error) {
      logger.error('获取积分流水数据失败:', error)
      return []
    }
  }

  /**
   * 获取热门奖品TOP10数据
   *
   * @param {Date} start_date - 开始日期
   * @param {Date} end_date - 结束日期
   * @returns {Promise<Array>} 热门奖品数据数组
   */
  static async getTopPrizesData(start_date, end_date) {
    try {
      // V4.0语义更新：查询高档奖励记录，统计各奖品的获得次数
      const prize_stats = await models.LotteryDraw.findAll({
        attributes: ['prize_name', [fn('COUNT', col('lottery_draw_id')), 'count']],
        where: {
          created_at: {
            [Op.between]: [start_date, end_date]
          },
          reward_tier: 'high', // V4.0：只统计高档奖励
          prize_name: {
            [Op.ne]: null
          }
        },
        group: ['prize_name'],
        order: [[fn('COUNT', col('lottery_draw_id')), 'DESC']],
        limit: 10,
        raw: true
      })

      // 计算总中奖数（用于计算百分比）
      const total_wins = prize_stats.reduce((sum, item) => sum + parseInt(item.count), 0)

      // 格式化数据
      const top_prizes = prize_stats.map(item => ({
        prize_name: item.prize_name,
        count: parseInt(item.count),
        percentage: total_wins > 0 ? ((parseInt(item.count) / total_wins) * 100).toFixed(2) : '0.00'
      }))

      logger.info(`热门奖品TOP10: 共${prize_stats.length}个奖品，总中奖${total_wins}次`)
      return top_prizes
    } catch (error) {
      logger.error('获取热门奖品数据失败:', error)
      return []
    }
  }

  /**
   * 获取活跃时段分布数据（0-23时）
   *
   * @param {Date} start_date - 开始日期
   * @param {Date} end_date - 结束日期
   * @returns {Promise<Array>} 活跃时段数据数组
   */
  static async getActiveHoursData(start_date, end_date) {
    try {
      // 统计各个时段的用户活动（以抽奖记录为活跃度指标）
      const hourly_activity = await models.LotteryDraw.findAll({
        attributes: [
          [fn('HOUR', col('created_at')), 'hour'],
          [fn('COUNT', col('lottery_draw_id')), 'activity_count']
        ],
        where: {
          created_at: {
            [Op.between]: [start_date, end_date]
          }
        },
        group: [fn('HOUR', col('created_at'))],
        order: [[fn('HOUR', col('created_at')), 'ASC']],
        raw: true
      })

      // 生成完整的24小时数据（0-23时）
      const hours_data = []

      for (let hour = 0; hour < 24; hour++) {
        const hour_data = hourly_activity.find(item => parseInt(item.hour) === hour)

        hours_data.push({
          hour,
          hour_label: `${hour.toString().padStart(2, '0')}:00`,
          activity_count: hour_data ? parseInt(hour_data.activity_count) : 0
        })
      }

      const peak_hour = hours_data.reduce(
        (max, item) => (item.activity_count > max.activity_count ? item : max),
        hours_data[0]
      )
      logger.info(
        `活跃时段数据: 高峰时段${peak_hour.hour_label}，活跃度${peak_hour.activity_count}`
      )
      return hours_data
    } catch (error) {
      logger.error('获取活跃时段数据失败:', error)
      return []
    }
  }
}

module.exports = ChartsService
