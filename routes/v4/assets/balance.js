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
const { authenticateToken } = require('../../../middleware/auth')
const { asyncHandler } = require('../../../middleware/validation')
const { getImageUrl } = require('../../../utils/ImageUrlHelper')
const { categoryIconAttachmentInclude } = require('../../../utils/mediaAttachmentGallery')
const { AssetCode } = require('../../../constants/AssetCode')
const logger = require('../../../utils/logger').logger

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
    const DataSanitizer = req.app.locals.services.getService('data_sanitizer')
    if (DataSanitizer.isForbiddenAsset(asset_code)) {
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

    /*
     * 「待审核消费积分」（pending_consumption_points）：仅 POINTS 资产对外展示该口径。
     * 单一事实源 = consumption_records(status=pending)，不动资产账本 frozen_amount。
     * 决策（2026-06-28）：首页 POINTS 用「可用 + 待审核消费积分」两栏，不再对外展示 frozen_amount；
     * 其他资产（star_stone 等）frozen_amount 仍有真实用途（兑换/竞价/DIY 锁定），保持原样。
     */
    const isPoints = String(asset_code).toLowerCase() === String(AssetCode.POINTS).toLowerCase()
    let pendingConsumptionPoints = 0
    if (isPoints) {
      const ConsumptionQueryService = req.app.locals.services.getService('consumption_query')
      pendingConsumptionPoints = await ConsumptionQueryService.getPendingConsumptionPoints(user_id)
    }

    // 处理不存在的资产类型：返回0余额（用户从未持有该资产）
    if (!balance) {
      logger.warn('[余额查询] getBalance 返回 null，返回零余额', {
        user_id,
        asset_code,
        reason: '用户从未持有该资产或账户查询异常'
      })
      if (isPoints) {
        return res.apiSuccess({
          asset_code,
          available_amount: 0,
          pending_consumption_points: pendingConsumptionPoints,
          total_amount: pendingConsumptionPoints
        })
      }
      return res.apiSuccess({
        asset_code,
        available_amount: 0,
        frozen_amount: 0,
        total_amount: 0
      })
    }

    // POINTS：可用 + 待审核消费积分（不下发 frozen_amount）
    if (isPoints) {
      return res.apiSuccess({
        asset_code,
        available_amount: Number(balance.available_amount),
        pending_consumption_points: pendingConsumptionPoints,
        total_amount: Number(balance.available_amount) + pendingConsumptionPoints
      })
    }

    // 其他资产：沿用 available/frozen 口径（frozen 为真实资产冻结）
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
    const MediaAttachment = req.app.locals.models.MediaAttachment
    const MediaFile = req.app.locals.models.MediaFile
    const balanceAssetCodes = balances.map(b => b.asset_code)
    const assetTypes = await MaterialAssetType.findAll({
      where: { asset_code: { [Op.in]: balanceAssetCodes } },
      attributes: ['asset_code', 'display_name', 'form', 'is_enabled', 'group_code'],
      include: [categoryIconAttachmentInclude({ MediaAttachment, MediaFile })].filter(Boolean)
    })
    const validAssetCodes = new Set(
      assetTypes.filter(t => t.is_enabled !== false && t.form !== 'quota').map(t => t.asset_code)
    )

    /* 构建 asset_code → icon_url 映射 */
    const assetIconMap = new Map()
    assetTypes.forEach(t => {
      const plain = t.get ? t.get({ plain: true }) : t
      const iconKey = plain.iconAttachment?.media?.object_key || null
      const iconHash = plain.iconAttachment?.media?.content_hash || null
      assetIconMap.set(plain.asset_code, {
        display_name: plain.display_name,
        icon_url: iconKey ? getImageUrl(iconKey, iconHash) : null,
        group_code: plain.group_code
      })
    })

    const DataSanitizer = req.app.locals.services.getService('data_sanitizer')
    const filteredBalances = balances.filter(
      b => !DataSanitizer.isForbiddenAsset(b.asset_code) && validAssetCodes.has(b.asset_code)
    )

    /*
     * POINTS 资产对外展示「待审核消费积分」（决策 2026-06-28）：
     * 单一事实源 = consumption_records(status=pending)，不动 frozen_amount；
     * POINTS 项以「可用 + 待审核消费积分」下发、不含 frozen_amount，其他资产保持 frozen_amount。
     * ⚠️ 注意：用户可能尚无 POINTS 余额行（从未有积分到账），但已有待审核消费积分。
     *   此时 getAllBalances 不含 POINTS，需补一条合成 POINTS 项（available=0 + pending），
     *   否则前端首页（用 /balances）拿不到待审核消费积分而显示 0。
     */
    const ConsumptionQueryService = req.app.locals.services.getService('consumption_query')
    const pendingConsumptionPoints =
      await ConsumptionQueryService.getPendingConsumptionPoints(user_id)
    const hasPoints = filteredBalances.some(b => b.asset_code === AssetCode.POINTS)

    const resultBalances = filteredBalances.map(b => {
      const assetMeta = assetIconMap.get(b.asset_code) || {}
      const base = {
        asset_code: b.asset_code,
        display_name: assetMeta.display_name || b.asset_code,
        icon_url: assetMeta.icon_url || null,
        group_code: assetMeta.group_code || null,
        available_amount: Number(b.available_amount)
      }
      if (b.asset_code === AssetCode.POINTS) {
        return {
          ...base,
          pending_consumption_points: pendingConsumptionPoints,
          total_amount: Number(b.available_amount) + pendingConsumptionPoints
        }
      }
      return {
        ...base,
        frozen_amount: Number(b.frozen_amount),
        total_amount: Number(b.available_amount) + Number(b.frozen_amount)
      }
    })

    // 补合成 POINTS 项：无 POINTS 余额行但有待审核消费积分时，仍要让前端拿到该口径
    if (!hasPoints && pendingConsumptionPoints > 0) {
      const pointsType = await MaterialAssetType.findOne({
        where: { asset_code: AssetCode.POINTS },
        attributes: ['asset_code', 'display_name', 'form', 'is_enabled', 'group_code'],
        include: [categoryIconAttachmentInclude({ MediaAttachment, MediaFile })].filter(Boolean)
      })
      if (pointsType && pointsType.is_enabled !== false && pointsType.form !== 'quota') {
        const plain = pointsType.get ? pointsType.get({ plain: true }) : pointsType
        const iconKey = plain.iconAttachment?.media?.object_key || null
        const iconHash = plain.iconAttachment?.media?.content_hash || null
        resultBalances.push({
          asset_code: AssetCode.POINTS,
          display_name: plain.display_name || AssetCode.POINTS,
          icon_url: iconKey ? getImageUrl(iconKey, iconHash) : null,
          group_code: plain.group_code || null,
          available_amount: 0,
          pending_consumption_points: pendingConsumptionPoints,
          total_amount: pendingConsumptionPoints
        })
      }
    }

    return res.apiSuccess({ balances: resultBalances })
  })
)

module.exports = router
