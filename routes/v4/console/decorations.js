/**
 * 管理后台 — 星石虚拟装饰管理路由（模块D·第5步）
 *
 * 路径：/api/v4/console/decorations
 *
 * 职责（路线B 合规改造 第十节）：
 * - 运营配置装饰 SKU（创建/更新/上下架），管理赛季
 * - 🔴 红线：装饰纯展示零数值、星石明码标价、严禁抽取/开箱（管理端只配明码价，无随机配置项）
 *
 * 架构规范：
 * - 通过 ServiceManager 获取 DecorationService（key: 'decoration'）
 * - 写操作通过 TransactionManager.execute() 管理事务边界
 * - 管理员权限 requireRoleLevel(100)
 *
 * @module routes/v4/console/decorations
 * @created 2026-06-08（路线B 合规改造 模块D）
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const { asyncHandler } = require('../../../middleware/validation')
const TransactionManager = require('../../../utils/TransactionManager')
const logger = require('../../../utils/logger').logger

/**
 * 获取 DecorationService 实例
 * @param {Object} req - Express 请求对象
 * @returns {Object} DecorationService 实例
 */
const getDecorationService = req => req.app.locals.services.getService('decoration')

/**
 * GET / - 列出全部装饰 SKU（含草稿/下架）
 * @access Private (管理员)
 */
router.get(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const decorations = await getDecorationService(req).listAllDecorationsForAdmin()
    return res.apiSuccess({ decorations }, '获取装饰列表成功')
  })
)

/**
 * POST / - 创建装饰 SKU（草稿态）
 * @access Private (管理员)
 */
router.post(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const result = await TransactionManager.execute(
      async transaction => {
        return getDecorationService(req).createDecorationSku(req.body, { transaction })
      },
      { description: 'createDecorationSku' }
    )
    logger.info('[Console装饰] 创建SKU', { admin_id: req.user?.user_id })
    return res.apiSuccess(result, '装饰创建成功')
  })
)

/**
 * PUT /:decoration_sku_id - 更新装饰 SKU（含上下架 status）
 * @access Private (管理员)
 */
router.put(
  '/:decoration_sku_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const skuId = parseInt(req.params.decoration_sku_id, 10)
    if (isNaN(skuId) || skuId <= 0) {
      return res.apiError('无效的装饰SKU ID', 'BAD_REQUEST', null, 400)
    }
    const result = await TransactionManager.execute(
      async transaction => {
        return getDecorationService(req).updateDecorationSku(skuId, req.body, { transaction })
      },
      { description: 'updateDecorationSku' }
    )
    logger.info('[Console装饰] 更新SKU', { admin_id: req.user?.user_id, decoration_sku_id: skuId })
    return res.apiSuccess(result, '装饰更新成功')
  })
)

/**
 * GET /seasons - 列出全部赛季
 * @access Private (管理员)
 */
router.get(
  '/seasons',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const seasons = await getDecorationService(req).listSeasons()
    return res.apiSuccess({ seasons }, '获取赛季列表成功')
  })
)

/**
 * POST /seasons - 创建赛季
 * @access Private (管理员)
 */
router.post(
  '/seasons',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const result = await TransactionManager.execute(
      async transaction => {
        return getDecorationService(req).createSeason(req.body, { transaction })
      },
      { description: 'createDecorationSeason' }
    )
    logger.info('[Console装饰] 创建赛季', { admin_id: req.user?.user_id })
    return res.apiSuccess(result, '赛季创建成功')
  })
)

/**
 * PUT /seasons/:decoration_season_id - 更新赛季（含状态）
 * @access Private (管理员)
 */
router.put(
  '/seasons/:decoration_season_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const seasonId = parseInt(req.params.decoration_season_id, 10)
    if (isNaN(seasonId) || seasonId <= 0) {
      return res.apiError('无效的赛季ID', 'BAD_REQUEST', null, 400)
    }
    const result = await TransactionManager.execute(
      async transaction => {
        return getDecorationService(req).updateSeason(seasonId, req.body, { transaction })
      },
      { description: 'updateDecorationSeason' }
    )
    logger.info('[Console装饰] 更新赛季', {
      admin_id: req.user?.user_id,
      decoration_season_id: seasonId
    })
    return res.apiSuccess(result, '赛季更新成功')
  })
)

module.exports = router
