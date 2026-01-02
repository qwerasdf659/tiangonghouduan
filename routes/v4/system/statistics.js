const logger = require('../../../utils/logger').logger

/**
 * 统计数据API路由模块 (Statistics Data API Routes)
 *
 * @description 提供管理后台图表统计数据API接口
 * @module routes/v4/statistics
 * @requires express
 * @requires ../../middleware/auth - 身份认证中间件
 *
 * @author Restaurant Points System
 * @date 2025-11-23
 * @updated 2025-12-11 - P2-C架构重构：StatisticsService合并到ReportingService
 *
 * 业务场景：
 * - 管理员查看系统运营数据统计图表
 * - 支持多时间周期数据查询（最近7天、30天、90天）
 * - 提供用户增长、抽奖趋势、消费趋势等多维度数据
 *
 * 架构规范：
 * - 路由层不直接操作 models，所有数据库操作通过 ReportingService
 * - 路由层只做：鉴权 → 参数校验 → 调用Service → 统一响应
 * - 通过 req.app.locals.services.getService('reporting') 获取统一报表服务
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')

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
 * @returns {Object} data.lottery_trend - 抽奖趋势 [{date, count, high_tier_count, high_tier_rate}]
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
  try {
    // 1. 通过 ServiceManager 获取 ReportingService（P2-C架构重构：合并StatisticsService）
    const ReportingService = req.app.locals.services.getService('reporting')

    // 2. 参数验证
    const days = parseInt(req.query.days) || 30

    // 3. 调用 Service 层获取图表数据
    const statistics_data = await ReportingService.getChartsData(days)

    return res.apiSuccess(
      statistics_data,
      `成功获取最近${days}天的统计数据`,
      'STATISTICS_CHARTS_SUCCESS'
    )
  } catch (error) {
    logger.error('[Statistics] ❌ 获取图表数据失败', error)
    return handleServiceError(error, res, '获取统计数据失败')
  }
})

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
    // 1. 通过 ServiceManager 获取 ReportingService（P2-C架构重构）
    const ReportingService = req.app.locals.services.getService('reporting')

    // 2. 参数验证
    const { period = 'week' } = req.query

    /*
     * 3. 调用 Service 层获取报表数据（注意：ReportingService没有getStatisticsReport方法，需要使用其他方法）
     * 使用getChartsData作为替代，或者需要在ReportingService中添加此方法
     */
    const report_data = await ReportingService.getChartsData(
      period === 'week' ? 7 : period === 'month' ? 30 : 365
    )

    return res.apiSuccess(report_data, '数据统计报表获取成功')
  } catch (error) {
    logger.error('[Statistics] ❌ 获取统计报表失败:', error)
    return handleServiceError(error, res, '获取数据统计报表失败')
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
 *
 * 🔧 导出接口说明：
 * 本接口返回二进制文件流（Excel），不使用 ApiResponse 包装
 * 这是规范允许的特例，用于文件下载场景
 * 设置响应头：Content-Type、Content-Disposition、Content-Length
 * 直接使用 res.send() 发送二进制流
 */
router.get('/export', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const XLSX = require('xlsx')

    // 1. 通过 ServiceManager 获取 ReportingService（P2-C架构重构）
    const ReportingService = req.app.locals.services.getService('reporting')

    // 2. 参数验证
    const days = parseInt(req.query.days) || 30

    logger.info(`[Statistics] 📥 开始导出统计数据，时间范围: 最近${days}天`)

    // 3. 调用 Service 层获取图表数据
    const { user_growth, user_types, lottery_trend, consumption_trend, points_flow, top_prizes } =
      await ReportingService.getChartsData(days)

    // 4. 创建工作簿
    const workbook = XLSX.utils.book_new()

    // 5. 用户增长趋势表
    const user_growth_sheet = XLSX.utils.json_to_sheet(
      user_growth.map(item => ({
        日期: item.date,
        新增用户: item.count,
        累计用户: item.cumulative
      }))
    )
    XLSX.utils.book_append_sheet(workbook, user_growth_sheet, '用户增长趋势')

    // 6. 用户类型分布表
    const user_types_sheet = XLSX.utils.json_to_sheet([
      {
        用户类型: '普通用户',
        数量: user_types.regular.count,
        占比: user_types.regular.percentage + '%'
      },
      { 用户类型: '管理员', 数量: user_types.admin.count, 占比: user_types.admin.percentage + '%' },
      {
        用户类型: '商家',
        数量: user_types.merchant.count,
        占比: user_types.merchant.percentage + '%'
      },
      { 用户类型: '总计', 数量: user_types.total, 占比: '100.00%' }
    ])
    XLSX.utils.book_append_sheet(workbook, user_types_sheet, '用户类型分布')

    // 7. 抽奖趋势表（如果有数据）- V4.0语义更新
    if (lottery_trend.length > 0) {
      const lottery_trend_sheet = XLSX.utils.json_to_sheet(
        lottery_trend.map(item => ({
          日期: item.date,
          抽奖次数: item.count,
          // V4.0语义更新：使用高档奖励替代中奖
          高档奖励次数: item.high_tier_count || 0,
          高档奖励率: (item.high_tier_rate || 0) + '%'
        }))
      )
      XLSX.utils.book_append_sheet(workbook, lottery_trend_sheet, '抽奖趋势')
    }

    // 8. 消费趋势表（如果有数据）
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

    // 9. 积分流水表（如果有数据）
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

    // 10. 热门奖品表（如果有数据）
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

    // 11. 生成Excel buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })

    // 12. 设置响应头
    const now = new Date()
    const beijing_now = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }))
    const filename = `统计报表_${days}天_${beijing_now.toISOString().split('T')[0]}.xlsx`
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
    res.setHeader('Content-Length', excelBuffer.length)

    logger.info(`[Statistics] ✅ Excel导出成功: ${filename} (${excelBuffer.length} bytes)`)

    // 13. 发送文件
    return res.send(excelBuffer)
  } catch (error) {
    logger.error('[Statistics] ❌ 导出统计数据失败:', error)
    return handleServiceError(error, res, '导出统计数据失败')
  }
})

module.exports = router
