/**
 * 后台运营资产中心 - console/assets 路由入口
 *
 * 路由路径：/api/v4/console/assets/*
 *
 * 功能模块：
 * - portfolio.js - 资产总览接口（含物品列表、物品详情、物品事件历史）
 * - stats - 系统级资产统计（管理员运营视角）
 *
 * 权限要求：admin（可写）或 ops（只读）角色
 *
 * 迁移说明（2026-01-07）：
 * - 从 /api/v4/shop/assets/portfolio 迁移到 /api/v4/console/assets/portfolio
 * - 这些是后台运营能力，而非 shop 业务的一部分
 *
 * 创建时间：2026-01-07
 * 更新时间：2026-01-09（添加 stats 系统级资产统计端点）
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../../middleware/auth')
const { sequelize } = require('../../../../models')
const logger = require('../../../../utils/logger')

// 导入子路由模块
const portfolioRoutes = require('./portfolio')
const transactionsRoutes = require('./transactions')

/**
 * GET /stats - 获取系统级资产统计（运营中心使用）
 *
 * @description 查询系统所有资产的统计数据，用于运营资产中心仪表盘
 * @access Admin
 * @returns {Object} 各资产类型的流通量、持有用户数、冻结量等统计
 */
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    logger.info('📊 获取系统级资产统计')

    // 从 account_asset_balances 表聚合统计
    const [stats] = await sequelize.query(`
      SELECT 
        asset_code,
        COUNT(DISTINCT account_id) as holder_count,
        SUM(available_amount) as total_circulation,
        SUM(frozen_amount) as total_frozen,
        SUM(available_amount + frozen_amount) as total_issued
      FROM account_asset_balances
      WHERE available_amount > 0 OR frozen_amount > 0
      GROUP BY asset_code
      ORDER BY asset_code
    `)

    // 转换为前端需要的格式
    const assetStats = stats.map(stat => ({
      asset_code: stat.asset_code,
      holder_count: parseInt(stat.holder_count) || 0,
      total_circulation: parseFloat(stat.total_circulation) || 0,
      total_frozen: parseFloat(stat.total_frozen) || 0,
      total_issued: parseFloat(stat.total_issued) || 0,
      destroyed: 0 // 暂无销毁数据
    }))

    // 汇总数据
    const summary = {
      total_asset_types: assetStats.length,
      total_holders: assetStats.reduce((sum, s) => sum + s.holder_count, 0),
      total_circulation: assetStats.reduce((sum, s) => sum + s.total_circulation, 0),
      total_frozen: assetStats.reduce((sum, s) => sum + s.total_frozen, 0)
    }

    return res.apiSuccess({
      asset_stats: assetStats,
      summary,
      retrieved_at: new Date().toISOString()
    })
  } catch (error) {
    logger.error('❌ 获取系统资产统计失败', { error: error.message, stack: error.stack })
    return res.apiError(error.message || '获取资产统计失败', 'STATS_ERROR', null, 500)
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
