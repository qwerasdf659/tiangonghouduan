/**
 * 以物易物配方管理路由 - 管理后台
 *
 * 路径：/api/v4/console/exchange/barter-recipes
 *
 * 职责（合规整改 §10.15 阶段六 Step 17）：
 * - 查看以物易物配方列表（旧物组合 → 官方产出物）
 * - 保存（全量覆盖）配方配置
 *
 * 配方为运营配置数据（存 system_settings，非互锁资产），可直接改、不破坏资产体系。
 *
 * 架构规范：
 * - 通过 ServiceManager 获取 exchange_barter 服务
 * - 写操作通过 TransactionManager.execute() 管理事务边界
 * - 统一使用 res.apiSuccess / res.apiError 响应
 * - 管理员权限要求：role_level >= 100
 *
 * @module routes/v4/console/exchange/barter-recipes
 * @created 2026-06-05（合规整改 阶段六 以物易物）
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const { asyncHandler } = require('../../../../middleware/validation')
const TransactionManager = require('../../../../utils/TransactionManager')

/**
 * GET /api/v4/console/exchange/barter-recipes
 *
 * @description 获取全部以物易物配方（含停用的，供管理查看）
 * @access Admin（role_level >= 100）
 * @returns {Object} { recipes }
 */
router.get(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const BarterService = req.app.locals.services.getService('exchange_barter')
    const recipes = await BarterService.getRecipes()
    return res.apiSuccess({ recipes })
  })
)

/**
 * PUT /api/v4/console/exchange/barter-recipes
 *
 * @description 全量保存以物易物配方配置
 * @access Admin（role_level >= 100）
 * @body {Array} recipes - 配方数组，每条含 recipe_code/name/required_item_template_id/required_quantity/output_exchange_item_id/is_enabled
 * @returns {Object} { recipes }
 */
router.put(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const { recipes } = req.body
    if (!Array.isArray(recipes)) {
      return res.apiError('recipes 必须是数组', 'BAD_REQUEST', null, 400)
    }
    const BarterService = req.app.locals.services.getService('exchange_barter')
    const saved = await TransactionManager.execute(async transaction => {
      return BarterService.saveRecipes(recipes, req.user.user_id, { transaction })
    })
    return res.apiSuccess({ recipes: saved }, '以物易物配方已保存')
  })
)

module.exports = router
