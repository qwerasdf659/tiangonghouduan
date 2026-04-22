/**
 * 资产余额查询路由
 *
 * 路径：/api/v4/assets/balance, /api/v4/assets/balances
 *
 * 职责：
 * - 查询单个资产余额
 * - 查询所有资产余额
 *
 * 架构原则：
 * - 路由层不直连 models（通过 ServiceManager 获取 BalanceService）
 * - 路由层不开启事务（事务管理在 Service 层）
 *
 */

'use strict'

const express = require('express')
const router = express.Router()
const { AssetCode } = require('../../../constants/AssetCode')
const { authenticateToken } = require('../../../middleware/auth')
const { asyncHandler } = require('../../../middleware/validation')

/**
 * GET /api/v4/assets/balance
 *
 * @description 查询单个资产余额
 * @query {string} asset_code - 资产代码（如 POINTS, star_stone, red_core_shard）
 * @access Private
 */
router.get(
  '/balance',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { asset_code } = req.query
    const user_id = req.user.user_id

    if (!asset_code) {
      return res.apiError('asset_code 是必填参数', 'BAD_REQUEST', null, 400)
    }

    // 系统内部资产禁止前端直接查询（BUDGET_POINTS 预算积分、STAR_STONE_QUOTA 星石配额等）
    const BLOCKED_ASSET_CODES = new Set([AssetCode.BUDGET_POINTS])
    if (BLOCKED_ASSET_CODES.has(asset_code)) {
      return res.apiError('无效的资产类型', 'BAD_REQUEST', null, 400)
    }

    // 动态检查：form='quota' 的内部配额类资产也禁止查询
    const MaterialAssetType = req.app.locals.models.MaterialAssetType
    const assetTypeDef = await MaterialAssetType.findOne({
      where: { asset_code },
      attributes: ['asset_code', 'form', 'is_enabled']
    })
    if (!assetTypeDef) {
      return res.apiError('无效的资产类型', 'BAD_REQUEST', null, 400)
    }
    if (assetTypeDef.form === 'quota') {
      return res.apiError('无效的资产类型', 'BAD_REQUEST', null, 400)
    }
    if (assetTypeDef.is_enabled === false) {
      return res.apiError('无效的资产类型', 'BAD_REQUEST', null, 400)
    }

    // V4.7.0 AssetService 拆分：通过 ServiceManager 获取 BalanceService
    const BalanceService = req.app.locals.services.getService('asset_balance')

    const balance = await BalanceService.getBalance({ user_id, asset_code })

    // 处理不存在的资产类型：返回0余额（用户从未持有该资产）
    if (!balance) {
      return res.apiSuccess({
        asset_code,
        available_amount: 0,
        frozen_amount: 0,
        total_amount: 0
      })
    }

    // 返回字段命名与 BalanceService.getBalance() 保持一致（全链路统一）
    return res.apiSuccess({
      asset_code,
      available_amount: Number(balance.available_amount),
      frozen_amount: Number(balance.frozen_amount),
      total_amount: Number(balance.available_amount) + Number(balance.frozen_amount)
    })
  })
)

/**
 * GET /api/v4/assets/balances
 *
 * @description 查询所有资产余额
 * @access Private
 */
router.get(
  '/balances',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const user_id = req.user.user_id

    // V4.7.0 AssetService 拆分：通过 ServiceManager 获取 BalanceService
    const BalanceService = req.app.locals.services.getService('asset_balance')

    const balances = await BalanceService.getAllBalances({ user_id })

    /*
     * 过滤策略（与 BackpackService._getAssets 一致）：
     * ① 必须有 material_asset_types 类型定义（排除孤儿数据如 MATERIAL_001）
     * ② is_enabled 非 false
     * ③ form 非 'quota'（排除 star_stone_quota 等内部配额类资产）
     * ④ 非 BUDGET_POINTS（活动预算积分，仅抽奖引擎内部使用）
     */
    const { Op } = require('sequelize')
    const MaterialAssetType = req.app.locals.models.MaterialAssetType
    const balanceAssetCodes = balances.map(b => b.asset_code)
    const assetTypes = await MaterialAssetType.findAll({
      where: { asset_code: { [Op.in]: balanceAssetCodes } },
      attributes: ['asset_code', 'form', 'is_enabled']
    })
    const validAssetCodes = new Set(
      assetTypes.filter(t => t.is_enabled !== false && t.form !== 'quota').map(t => t.asset_code)
    )
    const filteredBalances = balances.filter(
      b => b.asset_code !== AssetCode.BUDGET_POINTS && validAssetCodes.has(b.asset_code)
    )

    // 返回字段命名与 BalanceService.getBalance() 保持一致（全链路统一）
    return res.apiSuccess({
      balances: filteredBalances.map(b => ({
        asset_code: b.asset_code,
        available_amount: Number(b.available_amount),
        frozen_amount: Number(b.frozen_amount),
        total_amount: Number(b.available_amount) + Number(b.frozen_amount)
      }))
    })
  })
)

module.exports = router
