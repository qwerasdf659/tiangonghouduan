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
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
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
 *
 * @since 2026-01-18 路由层合规性治理：移除直接 sequelize 访问，使用 AssetService.getSystemStats()
 */
router.get('/stats', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    // 通过 ServiceManager 获取 AssetService
    const AssetService = req.app.locals.services.getService('asset')
    const result = await AssetService.getSystemStats()

    return res.apiSuccess(result)
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
