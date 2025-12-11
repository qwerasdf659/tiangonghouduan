/**
 * 餐厅积分抽奖系统 V4.0 - 统计数据服务（StatisticsService）
 *
 * @description 提供管理后台图表统计数据服务
 *
 * 业务场景：
 * - 管理员查看系统运营数据统计图表
 * - 支持多时间周期数据查询（最近7天、30天、90天）
 * - 提供用户增长、抽奖趋势、消费趋势等多维度数据
 *
 * 核心功能：
 * 1. 获取图表统计数据 - getChartsData()
 * 2. 获取统计报表 - getStatisticsReport()
 * 3. 导出统计数据为Excel - exportStatisticsToExcel()
 *
 * 统计维度：
 * - 用户增长趋势（新增用户、累计用户）
 * - 用户类型分布（普通用户、管理员、商家）
 * - 抽奖趋势（抽奖次数、中奖次数、中奖率）
 * - 消费趋势（消费笔数、消费总额、平均消费）
 * - 积分流水（收入、支出、净变化）
 * - 热门奖品TOP10
 * - 活跃时段分布（0-23时）
 *
 * 设计原则：
 * - **Service层职责**：封装所有统计相关的业务逻辑和数据库操作
 * - **北京时间处理**：统一使用北京时间进行时间计算
 * - **并行查询**：使用Promise.all()提升查询性能
 * - **数据补全**：生成完整的日期/时段序列，填充缺失数据
 *
 * 数据模型关联：
 * - User：用户表
 * - LotteryDraw：抽奖记录表
 * - ConsumptionRecord：消费记录表
 * - PointsTransaction：积分交易表
 * - Role：角色表
 *
 * 创建时间：2025年12月10日
 * 使用模型：Claude Sonnet 4.5
 */

const models = require('../models')
const { Op, fn, col, literal } = require('sequelize')

/**
 * 统计数据服务类
 *
 * @class StatisticsService
 */
class StatisticsService {
  /**
   * 获取图表统计数据
   *
   * @description 获取多维度的图表统计数据，支持不同时间周期
   *
   * @param {number} days - 统计天数（7/30/90）
   * @returns {Promise<Object>} 包含所有图表数据的对象
   * @throws {Error} 参数错误、数据库查询失败等
   */
  static async getChartsData (days = 30) {
    // 1. 验证查询参数
    if (![7, 30, 90].includes(days)) {
      const error = new Error('参数错误：days必须是7、30或90')
      error.code = 'INVALID_DAYS_PARAMETER'
      error.allowedValues = [7, 30, 90]
      throw error
    }

    console.log(`[Statistics] 📊 开始查询图表数据，时间范围: 最近${days}天`)

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

    console.log(`[Statistics] 📅 查询时间范围: ${start_date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} ~ ${end_date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)

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
    console.log(`[Statistics] ✅ 图表数据查询完成，耗时: ${query_time}ms`)

    // 4. 组装响应数据
    return {
      user_growth, // 用户增长趋势
      user_types, // 用户类型分布
      lottery_trend, // 抽奖趋势
      consumption_trend, // 消费趋势
      points_flow, // 积分流水
      top_prizes, // 热门奖品
      active_hours, // 活跃时段

      // 元数据
      metadata: {
        days,
        start_date: start_date.toISOString().replace('Z', '+08:00'),
        end_date: end_date.toISOString().replace('Z', '+08:00'),
        query_time_ms: query_time,
        generated_at: beijing_now.toISOString().replace('Z', '+08:00')
      }
    }
  }

  /**
   * 获取用户增长趋势数据
   *
   * @param {Date} start_date - 开始日期
   * @param {Date} end_date - 结束日期
   * @param {number} days - 天数
   * @returns {Promise<Array>} 用户增长数据数组
   */
  static async getUserGrowthData (start_date, end_date, days) {
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
          count, // 当天新增用户数
          cumulative // 累计用户数
        })
      }

      console.log(`[Statistics] 📈 用户增长数据: ${days}天内新增${cumulative - total_users_before}人，总用户${cumulative}人`)
      return growth_data
    } catch (error) {
      console.error('[Statistics] ❌ 获取用户增长数据失败:', error)
      return []
    }
  }

  /**
   * 获取用户类型分布数据
   *
   * @returns {Promise<Object>} 用户类型统计对象
   */
  static async getUserTypesData () {
    try {
      const Role = models.Role

      // 查询各类型用户数量（通过角色关联）
      const [user_role_users, admin_role_users, merchant_role_users, all_users] = await Promise.all([
        // 普通用户：拥有user角色
        models.User.count({
          distinct: true,
          include: [{
            model: Role,
            as: 'roles',
            where: { role_name: 'user', is_active: true },
            through: { where: { is_active: true } },
            required: true
          }]
        }),

        // 管理员用户：拥有admin角色
        models.User.count({
          distinct: true,
          include: [{
            model: Role,
            as: 'roles',
            where: { role_name: 'admin', is_active: true },
            through: { where: { is_active: true } },
            required: true
          }]
        }),

        // 商家用户：拥有merchant角色
        models.User.count({
          distinct: true,
          include: [{
            model: Role,
            as: 'roles',
            where: { role_name: 'merchant', is_active: true },
            through: { where: { is_active: true } },
            required: true
          }]
        }),

        // 总用户数
        models.User.count()
      ])

      // 注意：一个用户可能有多个角色，所以这里统计的是"至少拥有该角色的用户数"
      const types_data = {
        regular: {
          count: user_role_users,
          percentage: all_users > 0 ? ((user_role_users / all_users) * 100).toFixed(2) : '0.00'
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

      console.log(`[Statistics] 👥 用户类型分布: 普通${user_role_users}, 管理员${admin_role_users}, 商家${merchant_role_users}, 总用户${all_users}`)
      return types_data
    } catch (error) {
      console.error('[Statistics] ❌ 获取用户类型数据失败:', error)
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
  static async getLotteryTrendData (start_date, end_date, days) {
    try {
      // 查询每天抽奖数据
      const daily_lottery = await models.LotteryDraw.findAll({
        attributes: [
          [fn('DATE', col('created_at')), 'date'],
          [fn('COUNT', col('draw_id')), 'count'],
          [fn('SUM', literal('CASE WHEN is_winner = 1 THEN 1 ELSE 0 END')), 'win_count']
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
        const win_count = day_data ? parseInt(day_data.win_count) : 0
        const win_rate = count > 0 ? ((win_count / count) * 100).toFixed(2) : '0.00'

        trend_data.push({
          date: date_str,
          count, // 抽奖次数
          win_count, // 中奖次数
          win_rate // 中奖率(%)
        })
      }

      const total_draws = trend_data.reduce((sum, item) => sum + item.count, 0)
      console.log(`[Statistics] 🎰 抽奖趋势数据: ${days}天内共${total_draws}次抽奖`)
      return trend_data
    } catch (error) {
      console.error('[Statistics] ❌ 获取抽奖趋势数据失败:', error)
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
  static async getConsumptionTrendData (start_date, end_date, days) {
    try {
      // 查询每天消费数据（只统计已审核通过的记录）
      const daily_consumption = await models.ConsumptionRecord.findAll({
        attributes: [
          [fn('DATE', col('created_at')), 'date'],
          [fn('COUNT', col('consumption_id')), 'count'],
          [fn('SUM', col('consumption_amount')), 'amount'],
          [fn('AVG', col('consumption_amount')), 'avg_amount']
        ],
        where: {
          created_at: {
            [Op.between]: [start_date, end_date]
          },
          audit_status: 'approved' // 只统计已通过的消费记录
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
          count: day_data ? parseInt(day_data.count) : 0, // 消费笔数
          amount: day_data ? parseFloat(day_data.amount).toFixed(2) : '0.00', // 消费总额
          avg_amount: day_data ? parseFloat(day_data.avg_amount).toFixed(2) : '0.00' // 平均消费
        })
      }

      const total_amount = trend_data.reduce((sum, item) => sum + parseFloat(item.amount), 0)
      console.log(`[Statistics] 💳 消费趋势数据: ${days}天内消费总额¥${total_amount.toFixed(2)}`)
      return trend_data
    } catch (error) {
      console.error('[Statistics] ❌ 获取消费趋势数据失败:', error)
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
  static async getPointsFlowData (start_date, end_date, days) {
    try {
      // 查询每天积分流水（区分收入和支出）
      const daily_points = await models.PointsTransaction.findAll({
        attributes: [
          [fn('DATE', col('transaction_time')), 'date'],
          [fn('SUM', literal('CASE WHEN transaction_type IN (\'earn\', \'admin_add\', \'refund\') THEN amount ELSE 0 END')), 'earned'],
          [fn('SUM', literal('CASE WHEN transaction_type IN (\'spend\', \'admin_deduct\') THEN amount ELSE 0 END')), 'spent']
        ],
        where: {
          transaction_time: {
            [Op.between]: [start_date, end_date]
          }
        },
        group: [fn('DATE', col('transaction_time'))],
        order: [[fn('DATE', col('transaction_time')), 'ASC']],
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
          earned, // 积分收入
          spent, // 积分支出
          balance_change: earned - spent // 净变化
        })
      }

      const total_earned = flow_data.reduce((sum, item) => sum + item.earned, 0)
      const total_spent = flow_data.reduce((sum, item) => sum + item.spent, 0)
      console.log(`[Statistics] 💰 积分流水数据: ${days}天内收入${total_earned}分，支出${total_spent}分`)
      return flow_data
    } catch (error) {
      console.error('[Statistics] ❌ 获取积分流水数据失败:', error)
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
  static async getTopPrizesData (start_date, end_date) {
    try {
      // 查询中奖记录，统计各奖品的中奖次数
      const prize_stats = await models.LotteryDraw.findAll({
        attributes: [
          'prize_name',
          [fn('COUNT', col('draw_id')), 'count']
        ],
        where: {
          created_at: {
            [Op.between]: [start_date, end_date]
          },
          is_winner: true, // 只统计中奖记录
          prize_name: {
            [Op.ne]: null // 排除空奖品名
          }
        },
        group: ['prize_name'],
        order: [[fn('COUNT', col('draw_id')), 'DESC']],
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

      console.log(`[Statistics] 🏆 热门奖品TOP10: 共${prize_stats.length}个奖品，总中奖${total_wins}次`)
      return top_prizes
    } catch (error) {
      console.error('[Statistics] ❌ 获取热门奖品数据失败:', error)
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
  static async getActiveHoursData (start_date, end_date) {
    try {
      // 统计各个时段的用户活动（以抽奖记录为活跃度指标）
      const hourly_activity = await models.LotteryDraw.findAll({
        attributes: [
          [fn('HOUR', col('created_at')), 'hour'],
          [fn('COUNT', col('draw_id')), 'activity_count']
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
          hour_label: `${hour.toString().padStart(2, '0')}:00`, // 格式化为"00:00"
          activity_count: hour_data ? parseInt(hour_data.activity_count) : 0
        })
      }

      const peak_hour = hours_data.reduce((max, item) => item.activity_count > max.activity_count ? item : max, hours_data[0])
      console.log(`[Statistics] ⏰ 活跃时段数据: 高峰时段${peak_hour.hour_label}，活跃度${peak_hour.activity_count}`)
      return hours_data
    } catch (error) {
      console.error('[Statistics] ❌ 获取活跃时段数据失败:', error)
      return []
    }
  }

  /**
   * 获取统计报表数据
   *
   * @description 获取汇总的统计报表数据
   *
   * @param {string} period - 统计周期（week/month/year）
   * @returns {Promise<Object>} 统计报表数据对象
   * @throws {Error} 无效的统计周期参数等
   */
  static async getStatisticsReport (period = 'week') {
    // 将 period 转换为 days 参数
    let days
    switch (period) {
    case 'week':
      days = 7
      break
    case 'month':
      days = 30
      break
    case 'year':
      days = 365
      break
    default: {
      const error = new Error('无效的统计周期参数')
      error.code = 'INVALID_PARAMETER'
      throw error
    }
    }

    const now = new Date()
    const end_date = new Date(now)
    const start_date = new Date(now)
    start_date.setDate(start_date.getDate() - days)

    // 并行获取所有统计数据
    const [
      userGrowth,
      userTypes,
      lotteryTrend,
      consumptionTrend,
      pointsFlow,
      topPrizes
    ] = await Promise.all([
      this.getUserGrowthData(start_date, end_date, days),
      this.getUserTypesData(),
      this.getLotteryTrendData(start_date, end_date, days),
      this.getConsumptionTrendData(start_date, end_date, days),
      this.getPointsFlowData(start_date, end_date, days),
      this.getTopPrizesData(start_date, end_date)
    ])

    // 计算核心指标
    const totalUsers = userGrowth.length > 0 ? userGrowth[userGrowth.length - 1].cumulative : 0
    const newUsers = userGrowth.reduce((sum, item) => sum + item.count, 0)

    const totalDraws = lotteryTrend.reduce((sum, item) => sum + item.count, 0)
    const totalWins = lotteryTrend.reduce((sum, item) => sum + item.win_count, 0)
    const avgWinRate = totalDraws > 0 ? ((totalWins / totalDraws) * 100).toFixed(2) : '0.00'

    const totalConsumption = consumptionTrend.reduce((sum, item) => sum + parseFloat(item.amount), 0)
    const consumptionCount = consumptionTrend.reduce((sum, item) => sum + item.count, 0)
    const avgConsumption = consumptionCount > 0 ? (totalConsumption / consumptionCount).toFixed(2) : '0.00'

    const totalEarned = pointsFlow.reduce((sum, item) => sum + item.earned, 0)
    const totalSpent = pointsFlow.reduce((sum, item) => sum + item.spent, 0)
    const netPoints = totalEarned - totalSpent

    return {
      period,
      time_range: {
        start: start_date.toISOString(),
        end: end_date.toISOString(),
        description: period === 'week' ? '本周' : period === 'month' ? '本月' : '本年'
      },
      timestamp: new Date().toISOString(),

      // 用户统计
      users: {
        total_users: totalUsers,
        new_users: newUsers,
        active_users: newUsers, // 简化处理，新用户即为活跃用户
        growth_rate: totalUsers > 0 ? ((newUsers / totalUsers) * 100).toFixed(2) + '%' : '0%',
        user_types: userTypes
      },

      // 抽奖统计
      lottery: {
        total_draws: totalDraws,
        winning_draws: totalWins,
        winning_rate: avgWinRate + '%',
        trend: lotteryTrend
      },

      // 奖品统计
      prizes: {
        top_prizes: topPrizes,
        total_distributed: totalWins
      },

      // 积分统计
      points: {
        total_earned: totalEarned,
        total_consumed: totalSpent,
        net_points: netPoints,
        flow: pointsFlow
      },

      // 消费统计
      consumption: {
        total_records: consumptionCount,
        total_amount: totalConsumption.toFixed(2),
        average_amount: avgConsumption,
        trend: consumptionTrend
      }
    }
  }
}

module.exports = StatisticsService
