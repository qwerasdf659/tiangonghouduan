/**
 * 后台运营资产中心 - console/assets 路由入口
 *
 * 路由路径：/api/v4/console/assets/*
 *
 * 功能模块：
 * - portfolio.js - 资产总览接口（含物品列表、物品详情、物品事件历史）
 * - stats - 系统级资产统计（管理员运营视角）
 * - export - 资产数据导出（Excel/CSV格式）
 *
 * 权限要求：admin（可写）或 ops（只读）角色
 *
 * 迁移说明（2026-01-07）：
 * - 从 /api/v4/shop/assets/portfolio 迁移到 /api/v4/console/assets/portfolio
 * - 这些是后台运营能力，而非 shop 业务的一部分
 *
 * 创建时间：2026-01-07
 * 更新时间：2026-01-30（添加 export 资产导出端点）
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const logger = require('../../../../utils/logger')
const XLSX = require('xlsx')
const BeijingTimeHelper = require('../../../../utils/timeHelper')

// 导入子路由模块
const portfolioRoutes = require('./portfolio')
const transactionsRoutes = require('./transactions')

/**
 * GET /stats - 获取系统级资产统计（运营中心使用）
 *
 * @description 查询系统所有资产的统计数据，用于运营资产中心仪表盘
 * @access Admin
 * @returns {Object} 各资产类型的流通量、持有用户数、冻结量等统计
 *
 * @since 2026-01-18 路由层合规性治理：移除直接 sequelize 访问，使用 QueryService.getSystemStats()
 * @since 2026-01-31 V4.7.0 AssetService 拆分：使用 QueryService
 */
router.get('/stats', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    // V4.7.0 AssetService 拆分：通过 ServiceManager 获取 QueryService（2026-01-31）
    const QueryService = req.app.locals.services.getService('asset_query')
    const result = await QueryService.getSystemStats()

    return res.apiSuccess(result)
  } catch (error) {
    logger.error('❌ 获取系统资产统计失败', { error: error.message, stack: error.stack })
    return res.apiError(error.message || '获取资产统计失败', 'STATS_ERROR', null, 500)
  }
})

/**
 * GET /export - 导出资产数据（Excel/CSV格式）
 *
 * @description 导出系统资产数据，支持筛选条件和多种格式
 * @access Admin (role_level >= 100)
 *
 * @query {string} [type] - 资产类型筛选（如 POINTS, DIAMOND, 材料代码）
 * @query {string} [status] - 状态筛选（如 active, frozen）
 * @query {string} [format=excel] - 导出格式：excel | csv
 * @query {number} [user_id] - 筛选指定用户的资产
 * @query {number} [limit=1000] - 导出数据条数限制（最大10000）
 *
 * @returns {Stream} 文件流（Excel或CSV格式）
 *
 * @since 2026-01-30 P2任务：资产导出API实现
 */
router.get('/export', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { type: asset_type, status, format = 'excel', user_id, limit = 1000 } = req.query

    // 参数验证
    const validFormats = ['excel', 'csv']
    if (!validFormats.includes(format)) {
      return res.apiError('format 必须是 excel 或 csv', 'BAD_REQUEST', null, 400)
    }

    const exportLimit = Math.min(Math.max(1, parseInt(limit) || 1000), 10000)

    logger.info('📊 导出资产数据', {
      admin_id: req.user.user_id,
      asset_type,
      status,
      format,
      user_id,
      limit: exportLimit
    })

    // V4.7.0 AssetService 拆分：通过 ServiceManager 获取 QueryService（2026-01-31）
    const QueryService = req.app.locals.services.getService('asset_query')

    // 获取资产余额数据
    const balancesData = await QueryService.getBalancesForExport({
      asset_type,
      status,
      user_id: user_id ? parseInt(user_id) : null,
      limit: exportLimit
    })

    // 如果没有数据
    if (!balancesData || balancesData.length === 0) {
      return res.apiError('没有符合条件的数据', 'NO_DATA', null, 404)
    }

    // 准备导出数据
    const exportData = balancesData.map((item, index) => ({
      序号: index + 1,
      用户ID: item.user_id,
      用户昵称: item.nickname || '-',
      资产代码: item.asset_code,
      资产名称: item.asset_name || item.asset_code,
      可用余额: parseFloat(item.available_amount) || 0,
      冻结余额: parseFloat(item.frozen_amount) || 0,
      总余额: (parseFloat(item.available_amount) || 0) + (parseFloat(item.frozen_amount) || 0),
      活动ID: item.lottery_campaign_id || '-',
      更新时间: item.updated_at ? BeijingTimeHelper.format(item.updated_at) : '-'
    }))

    // 生成文件名
    const timestamp = BeijingTimeHelper.format(new Date(), 'YYYYMMDD_HHmmss')
    const fileName = `资产导出_${timestamp}`

    if (format === 'csv') {
      // CSV格式导出
      const worksheet = XLSX.utils.json_to_sheet(exportData)
      const csvContent = XLSX.utils.sheet_to_csv(worksheet)

      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(fileName)}.csv"`
      )

      logger.info('✅ 资产数据导出成功', {
        admin_id: req.user.user_id,
        format: 'csv',
        record_count: exportData.length
      })

      // 添加BOM以支持中文在Excel中正确显示
      return res.send('\uFEFF' + csvContent)
    }

    // Excel格式导出
    const workbook = XLSX.utils.book_new()
    const worksheet = XLSX.utils.json_to_sheet(exportData)

    // 设置列宽
    worksheet['!cols'] = [
      { wch: 6 }, // 序号
      { wch: 10 }, // 用户ID
      { wch: 15 }, // 用户昵称
      { wch: 15 }, // 资产代码
      { wch: 15 }, // 资产名称
      { wch: 12 }, // 可用余额
      { wch: 12 }, // 冻结余额
      { wch: 12 }, // 总余额
      { wch: 10 }, // 活动ID
      { wch: 20 } // 更新时间
    ]

    XLSX.utils.book_append_sheet(workbook, worksheet, '资产数据')

    // 生成Excel buffer
    const excelBuffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: 'xlsx'
    })

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(fileName)}.xlsx"`
    )

    logger.info('✅ 资产数据导出成功', {
      admin_id: req.user.user_id,
      format,
      record_count: exportData.length
    })

    return res.send(excelBuffer)
  } catch (error) {
    logger.error('❌ 资产数据导出失败', {
      admin_id: req.user?.user_id,
      error: error.message,
      stack: error.stack
    })
    return res.apiError(error.message || '导出失败', 'EXPORT_ERROR', null, 500)
  }
})

/*
 * 挂载子路由
 * GET /portfolio - 资产总览
 * GET /portfolio/items - 物品列表
 * GET /portfolio/items/:id - 物品详情
 * GET /item-events - 物品事件历史
 * GET /transactions - 资产流水查询（管理员视角）
 */
router.use('/', portfolioRoutes)
router.use('/transactions', transactionsRoutes)

module.exports = router
