/**
 * 统计数据API路由模块 (Statistics Data API Routes)
 *
 * @description 提供管理后台图表统计数据API接口
 * @module routes/v4/statistics
 * @requires express
 * @requires ../../models - Sequelize模型
 * @requires ../../middleware/auth - 身份认证中间件
 *
 * @author Restaurant Points System
 * @date 2025-11-23
 *
 * 业务场景：
 * - 管理员查看系统运营数据统计图表
 * - 支持多时间周期数据查询（最近7天、30天、90天）
 * - 提供用户增长、抽奖趋势、消费趋势等多维度数据
 */

const express = require('express')
const router = express.Router()
const { Op, fn, col, literal } = require('sequelize')
const { authenticateToken, requireAdmin } = require('../../middleware/auth')
const {
  User,
  LotteryDraw,
  ConsumptionRecord,
  PointsTransaction
} = require('../../models')

/**
 * GET /api/v4/statistics/charts - 获取图表统计数据
 *
 * @route GET /api/v4/statistics/charts
 * @group Statistics - 统计数据
 * @security JWT
 * @param {number} days.query - 统计天数（7/30/90）
 *
 * @returns {Object} 200 - 成功返回图表数据
 * @returns {Object} data.user_growth - 用户增长趋势 [{date, count, cumulative}]
 * @returns {Object} data.user_types - 用户类型分布 {regular, merchant, premium}
 * @returns {Object} data.lottery_trend - 抽奖趋势 [{date, count, win_count, win_rate}]
 * @returns {Object} data.consumption_trend - 消费趋势 [{date, count, amount, avg_amount}]
 * @returns {Object} data.points_flow - 积分流水 [{date, earned, spent, balance_change}]
 * @returns {Object} data.top_prizes - 热门奖品TOP10 [{prize_name, count, percentage}]
 * @returns {Object} data.active_hours - 活跃时段分布 [{hour, activity_count}]
 *
 * @returns {Object} 400 - 参数错误
 * @returns {Object} 401 - 未授权
 * @returns {Object} 403 - 权限不足（非管理员）
 * @returns {Object} 500 - 服务器错误
 */
router.get('/charts', authenticateToken, requireAdmin, async (req, res) => {
  const start_time = Date.now()

  try {
    // 1. 验证查询参数
    const days = parseInt(req.query.days) || 30

    // 参数验证：只允许7、30、90天
    if (![7, 30, 90].includes(days)) {
      return res.apiError('参数错误', 'INVALID_DAYS_PARAMETER', {
        allowed_values: [7, 30, 90],
        provided_value: days
      }, 400)
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
    const [
      user_growth,
      user_types,
      lottery_trend,
      consumption_trend,
      points_flow,
      top_prizes,
      active_hours
    ] = await Promise.all([
      getUserGrowthData(start_date, end_date, days),
      getUserTypesData(),
      getLotteryTrendData(start_date, end_date, days),
      getConsumptionTrendData(start_date, end_date, days),
      getPointsFlowData(start_date, end_date, days),
      getTopPrizesData(start_date, end_date),
      getActiveHoursData(start_date, end_date)
    ])

    const query_time = Date.now() - start_time
    console.log(`[Statistics] ✅ 图表数据查询完成，耗时: ${query_time}ms`)

    // 4. 组装响应数据
    const statistics_data = {
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

    return res.apiSuccess(
      statistics_data,
      `成功获取最近${days}天的统计数据`,
      'STATISTICS_CHARTS_SUCCESS'
    )
  } catch (error) {
    const query_time = Date.now() - start_time
    console.error(`[Statistics] ❌ 获取图表数据失败，耗时: ${query_time}ms`, error)

    return res.apiInternalError(
      '获取统计数据失败',
      error.message,
      'STATISTICS_CHARTS_ERROR'
    )
  }
})

/**
 * 获取用户增长趋势数据
 * @param {Date} start_date - 开始日期
 * @param {Date} end_date - 结束日期
 * @param {number} days - 天数
 * @returns {Promise<Array>} 用户增长数据数组
 */
async function getUserGrowthData (start_date, end_date, days) {
  try {
    // 查询每天新增用户数
    const daily_users = await User.findAll({
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
    const total_users_before = await User.count({
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
 * @returns {Promise<Object>} 用户类型统计对象
 */
async function getUserTypesData () {
  try {
    const { Role } = require('../../models')

    // 查询各类型用户数量（通过角色关联）
    const [user_role_users, admin_role_users, merchant_role_users, all_users] = await Promise.all([
      // 普通用户：拥有user角色
      User.count({
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
      User.count({
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
      User.count({
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
      User.count()
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
 * @param {Date} start_date - 开始日期
 * @param {Date} end_date - 结束日期
 * @param {number} days - 天数
 * @returns {Promise<Array>} 抽奖趋势数据数组
 */
async function getLotteryTrendData (start_date, end_date, days) {
  try {
    // 查询每天抽奖数据
    const daily_lottery = await LotteryDraw.findAll({
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
 * @param {Date} start_date - 开始日期
 * @param {Date} end_date - 结束日期
 * @param {number} days - 天数
 * @returns {Promise<Array>} 消费趋势数据数组
 */
async function getConsumptionTrendData (start_date, end_date, days) {
  try {
    // 查询每天消费数据（只统计已审核通过的记录）
    const daily_consumption = await ConsumptionRecord.findAll({
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
 * @param {Date} start_date - 开始日期
 * @param {Date} end_date - 结束日期
 * @param {number} days - 天数
 * @returns {Promise<Array>} 积分流水数据数组
 */
async function getPointsFlowData (start_date, end_date, days) {
  try {
    // 查询每天积分流水（区分收入和支出）
    const daily_points = await PointsTransaction.findAll({
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
 * @param {Date} start_date - 开始日期
 * @param {Date} end_date - 结束日期
 * @returns {Promise<Array>} 热门奖品数据数组
 */
async function getTopPrizesData (start_date, end_date) {
  try {
    // 查询中奖记录，统计各奖品的中奖次数
    const prize_stats = await LotteryDraw.findAll({
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
 * @param {Date} start_date - 开始日期
 * @param {Date} end_date - 结束日期
 * @returns {Promise<Array>} 活跃时段数据数组
 */
async function getActiveHoursData (start_date, end_date) {
  try {
    // 统计各个时段的用户活动（以抽奖记录为活跃度指标）
    const hourly_activity = await LotteryDraw.findAll({
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
 * GET /api/v4/statistics/report - 获取数据统计报表
 *
 * @route GET /api/v4/statistics/report
 * @group Statistics - 统计数据
 * @security JWT
 * @param {string} period.query - 统计周期（week/month/year）
 *
 * @returns {Object} 200 - 成功返回统计报表数据
 * @returns {Object} 401 - 未授权
 * @returns {Object} 500 - 服务器错误
 */
router.get('/report', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { period = 'week' } = req.query

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
    default:
      return res.apiError('无效的统计周期参数', 'INVALID_PARAMETER', null, 400)
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
      getUserGrowthData(start_date, end_date, days),
      getUserTypesData(),
      getLotteryTrendData(start_date, end_date, days),
      getConsumptionTrendData(start_date, end_date, days),
      getPointsFlowData(start_date, end_date, days),
      getTopPrizesData(start_date, end_date)
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

    return res.apiSuccess({
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
    }, '数据统计报表获取成功')
  } catch (error) {
    console.error('[Statistics] ❌ 获取统计报表失败:', error)
    return res.apiError('获取数据统计报表失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * GET /api/v4/statistics/export - 导出统计数据为Excel
 *
 * @route GET /api/v4/statistics/export
 * @group Statistics - 统计数据
 * @security JWT
 * @param {number} days.query - 统计天数（7/30/90）
 *
 * @returns {File} 200 - Excel文件下载
 * @returns {Object} 400 - 参数错误
 * @returns {Object} 401 - 未授权
 * @returns {Object} 500 - 服务器错误
 */
router.get('/export', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const XLSX = require('xlsx')

    // 验证参数
    const days = parseInt(req.query.days) || 30

    if (![7, 30, 90].includes(days)) {
      return res.apiError('参数错误', 'INVALID_DAYS_PARAMETER', {
        allowed_values: [7, 30, 90]
      }, 400)
    }

    console.log(`[Statistics] 📥 开始导出统计数据，时间范围: 最近${days}天`)

    // 计算时间范围（北京时间）
    const now = new Date()
    const beijing_now = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))

    const end_date = new Date(beijing_now)
    end_date.setHours(23, 59, 59, 999)

    const start_date = new Date(beijing_now)
    start_date.setDate(start_date.getDate() - days)
    start_date.setHours(0, 0, 0, 0)

    // 并行查询所有统计数据
    const [
      user_growth,
      user_types,
      lottery_trend,
      consumption_trend,
      points_flow,
      top_prizes
    ] = await Promise.all([
      getUserGrowthData(start_date, end_date, days),
      getUserTypesData(),
      getLotteryTrendData(start_date, end_date, days),
      getConsumptionTrendData(start_date, end_date, days),
      getPointsFlowData(start_date, end_date, days),
      getTopPrizesData(start_date, end_date)
    ])

    // 创建工作簿
    const workbook = XLSX.utils.book_new()

    // 1. 用户增长趋势表
    const user_growth_sheet = XLSX.utils.json_to_sheet(
      user_growth.map(item => ({
        日期: item.date,
        新增用户: item.count,
        累计用户: item.cumulative
      }))
    )
    XLSX.utils.book_append_sheet(workbook, user_growth_sheet, '用户增长趋势')

    // 2. 用户类型分布表
    const user_types_sheet = XLSX.utils.json_to_sheet([
      { 用户类型: '普通用户', 数量: user_types.regular.count, 占比: user_types.regular.percentage + '%' },
      { 用户类型: '管理员', 数量: user_types.admin.count, 占比: user_types.admin.percentage + '%' },
      { 用户类型: '商家', 数量: user_types.merchant.count, 占比: user_types.merchant.percentage + '%' },
      { 用户类型: '总计', 数量: user_types.total, 占比: '100.00%' }
    ])
    XLSX.utils.book_append_sheet(workbook, user_types_sheet, '用户类型分布')

    // 3. 抽奖趋势表（如果有数据）
    if (lottery_trend.length > 0) {
      const lottery_trend_sheet = XLSX.utils.json_to_sheet(
        lottery_trend.map(item => ({
          日期: item.date,
          抽奖次数: item.count,
          中奖次数: item.win_count,
          中奖率: item.win_rate + '%'
        }))
      )
      XLSX.utils.book_append_sheet(workbook, lottery_trend_sheet, '抽奖趋势')
    }

    // 4. 消费趋势表（如果有数据）
    if (consumption_trend.length > 0) {
      const consumption_trend_sheet = XLSX.utils.json_to_sheet(
        consumption_trend.map(item => ({
          日期: item.date,
          消费笔数: item.count,
          消费总额: parseFloat(item.amount),
          平均消费: parseFloat(item.avg_amount)
        }))
      )
      XLSX.utils.book_append_sheet(workbook, consumption_trend_sheet, '消费趋势')
    }

    // 5. 积分流水表（如果有数据）
    if (points_flow.length > 0) {
      const points_flow_sheet = XLSX.utils.json_to_sheet(
        points_flow.map(item => ({
          日期: item.date,
          积分收入: item.earned,
          积分支出: item.spent,
          净变化: item.balance_change
        }))
      )
      XLSX.utils.book_append_sheet(workbook, points_flow_sheet, '积分流水')
    }

    // 6. 热门奖品表（如果有数据）
    if (top_prizes.length > 0) {
      const top_prizes_sheet = XLSX.utils.json_to_sheet(
        top_prizes.map((item, index) => ({
          排名: index + 1,
          奖品名称: item.prize_name,
          中奖次数: item.count,
          占比: item.percentage + '%'
        }))
      )
      XLSX.utils.book_append_sheet(workbook, top_prizes_sheet, '热门奖品TOP10')
    }

    // 生成Excel buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    // 设置响应头
    const filename = `统计报表_${days}天_${beijing_now.toISOString().split('T')[0]}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
    res.setHeader('Content-Length', excelBuffer.length)

    console.log(`[Statistics] ✅ Excel导出成功: ${filename} (${excelBuffer.length} bytes)`)

    // 发送文件
    return res.send(excelBuffer)
  } catch (error) {
    console.error('[Statistics] ❌ 导出统计数据失败:', error)
    return res.apiInternalError('导出统计数据失败', error.message, 'STATISTICS_EXPORT_ERROR')
  }
})

module.exports = router
