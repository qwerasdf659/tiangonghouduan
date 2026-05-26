/**
 * 奖品目录管理路由
 *
 * @description 集中奖品目录的 CRUD 和查询路由
 * @version 4.0.0
 * @date 2026-05-26
 *
 * 架构原则：
 * - 路由层不直连 models（所有数据库操作通过 Service 层）
 * - 写操作使用 TransactionManager.execute() 统一管理事务
 * - 通过 ServiceManager 统一获取服务实例（键名：prize_definition）
 *
 * API 路径：/api/v4/console/prize-definitions
 */

'use strict'

const express = require('express')
const TransactionManager = require('../../../../utils/TransactionManager')
const router = express.Router()
const { adminAuthMiddleware, asyncHandler } = require('../shared/middleware')

/**
 * GET / - 分页查询奖品目录
 *
 * @route GET /api/v4/console/prize-definitions
 * @query {string} [prize_type] - 奖品类型筛选（material/item/coupon/points）
 * @query {string} [rarity_code] - 稀有度筛选
 * @query {string} [reward_tier] - 档位筛选（high/mid/low）
 * @query {string} [keyword] - 关键词搜索
 * @query {string} [is_enabled] - 启用状态（1/0）
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 */
router.get(
  '/',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const PrizeDefinitionService = req.app.locals.services.getService('prize_definition')

    const filters = {
      prize_type: req.query.prize_type,
      rarity_code: req.query.rarity_code,
      reward_tier: req.query.reward_tier,
      keyword: req.query.keyword,
      is_enabled: req.query.is_enabled !== undefined ? req.query.is_enabled === '1' : undefined,
      merchant_id: req.query.merchant_id ? parseInt(req.query.merchant_id) : undefined,
      page: parseInt(req.query.page) || 1,
      page_size: parseInt(req.query.page_size) || 20
    }

    const result = await PrizeDefinitionService.list(filters)
    return res.apiSuccess(result, '查询成功')
  })
)

/**
 * GET /options - 获取下拉选项列表（活动配置时选择奖品用）
 *
 * @route GET /api/v4/console/prize-definitions/options
 * @query {string} [prize_type] - 按类型筛选
 */
router.get(
  '/options',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const PrizeDefinitionService = req.app.locals.services.getService('prize_definition')

    const filters = {
      prize_type: req.query.prize_type,
      merchant_id: req.query.merchant_id ? parseInt(req.query.merchant_id) : undefined
    }

    const options = await PrizeDefinitionService.getOptions(filters)
    return res.apiSuccess(options, '查询成功')
  })
)

/**
 * GET /:id - 获取单个奖品定义详情
 *
 * @route GET /api/v4/console/prize-definitions/:id
 * @param {number} id - 奖品定义ID
 */
router.get(
  '/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const PrizeDefinitionService = req.app.locals.services.getService('prize_definition')
    const prizeDefinitionId = parseInt(req.params.id)

    if (!prizeDefinitionId || isNaN(prizeDefinitionId)) {
      return res.apiError('无效的奖品定义ID', 'INVALID_PRIZE_DEFINITION_ID', null, 400)
    }

    const detail = await PrizeDefinitionService.getDetail(prizeDefinitionId)
    if (!detail) {
      return res.apiError('奖品定义不存在', 'PRIZE_DEFINITION_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(detail, '查询成功')
  })
)

/**
 * POST / - 创建奖品定义
 *
 * @route POST /api/v4/console/prize-definitions
 * @body {Object} 奖品定义数据
 */
router.post(
  '/',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const PrizeDefinitionService = req.app.locals.services.getService('prize_definition')

    const result = await TransactionManager.execute(
      async transaction => {
        return await PrizeDefinitionService.create(req.body, {
          created_by: req.user?.user_id,
          transaction
        })
      },
      { description: 'createPrizeDefinition' }
    )

    return res.apiSuccess(result, '奖品定义创建成功')
  })
)

/**
 * PUT /:id - 更新奖品定义
 *
 * @route PUT /api/v4/console/prize-definitions/:id
 * @param {number} id - 奖品定义ID
 * @body {Object} 更新数据
 */
router.put(
  '/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const PrizeDefinitionService = req.app.locals.services.getService('prize_definition')
    const prizeDefinitionId = parseInt(req.params.id)

    if (!prizeDefinitionId || isNaN(prizeDefinitionId)) {
      return res.apiError('无效的奖品定义ID', 'INVALID_PRIZE_DEFINITION_ID', null, 400)
    }

    const result = await TransactionManager.execute(
      async transaction => {
        return await PrizeDefinitionService.update(prizeDefinitionId, req.body, {
          created_by: req.user?.user_id,
          transaction
        })
      },
      { description: 'updatePrizeDefinition' }
    )

    return res.apiSuccess(result, '奖品定义更新成功')
  })
)

/**
 * DELETE /:id - 删除奖品定义（软删除）
 *
 * @route DELETE /api/v4/console/prize-definitions/:id
 * @param {number} id - 奖品定义ID
 */
router.delete(
  '/:id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const PrizeDefinitionService = req.app.locals.services.getService('prize_definition')
    const prizeDefinitionId = parseInt(req.params.id)

    if (!prizeDefinitionId || isNaN(prizeDefinitionId)) {
      return res.apiError('无效的奖品定义ID', 'INVALID_PRIZE_DEFINITION_ID', null, 400)
    }

    await TransactionManager.execute(
      async transaction => {
        await PrizeDefinitionService.delete(prizeDefinitionId, {
          created_by: req.user?.user_id,
          transaction
        })
      },
      { description: 'deletePrizeDefinition' }
    )

    return res.apiSuccess(null, '奖品定义删除成功')
  })
)

module.exports = router
