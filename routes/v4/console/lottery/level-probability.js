'use strict'

/**
 * 抽奖管理 — 成长等级公示分级概率（B 线，2026-06-04 合规改造）
 *
 * 业务背景（详见 docs/抽奖管理干预接入缺口诊断.md §十六 B 线）：
 * - per-user 暗箱干预下线后，"让某类人更易中"改为"按成长等级的公示分级概率"
 * - 成长等级由 users.history_total_points 实时派生（UserGrowthLevelService）
 * - 各等级的中奖率倍数存于 lottery_strategy_config.level_probability（按活动），抽奖内核 TierPickStage 只读消费
 *
 * 架构规范：
 * - 路由层通过 ServiceManager 获取服务，不直连 models
 * - 写操作通过 TransactionManager.execute() 统一管理事务边界
 * - 统一使用 res.apiSuccess / res.apiError
 * - 管理员权限（requireRoleLevel(100)）
 *
 * API 端点（挂载于 /api/v4/console/lottery-management）：
 * - GET  /growth-levels                                 - 成长等级阶梯定义（公示）
 * - GET  /level-probability/:lottery_campaign_id        - 某活动各等级中奖率倍数
 * - PUT  /level-probability/:lottery_campaign_id        - 批量配置某活动各等级中奖率倍数
 */

const express = require('express')
const router = express.Router()
const TransactionManager = require('../../../../utils/TransactionManager')
const logger = require('../../../../utils/logger').logger
const {
  adminAuthMiddleware,
  adminOpsAuthMiddleware,
  asyncHandler
} = require('../shared/middleware')

/**
 * 通过 ServiceManager 获取 UserGrowthLevelService
 * @param {Object} req - Express 请求对象
 * @returns {Object} UserGrowthLevelService 实例
 */
const getGrowthLevelService = req => req.app.locals.services.getService('user_growth_level')

/**
 * GET /growth-levels - 成长等级阶梯定义（含停用可选）
 * @route GET /api/v4/console/lottery-management/growth-levels
 * @access Private (管理员)
 */
router.get(
  '/growth-levels',
  adminOpsAuthMiddleware,
  asyncHandler(async (req, res) => {
    const include_inactive = req.query.include_inactive === 'true'
    const levels = await getGrowthLevelService(req).listLevels({ include_inactive })
    return res.apiSuccess({ levels }, '获取成长等级阶梯成功')
  })
)

/**
 * GET /level-probability/:lottery_campaign_id - 某活动各成长等级中奖率倍数
 * @route GET /api/v4/console/lottery-management/level-probability/:lottery_campaign_id
 * @access Private (管理员)
 */
router.get(
  '/level-probability/:lottery_campaign_id',
  adminOpsAuthMiddleware,
  asyncHandler(async (req, res) => {
    const lottery_campaign_id = parseInt(req.params.lottery_campaign_id, 10)
    if (!Number.isInteger(lottery_campaign_id) || lottery_campaign_id <= 0) {
      return res.apiError('无效的活动ID', 'INVALID_CAMPAIGN_ID', null, 400)
    }
    const items = await getGrowthLevelService(req).getLevelProbabilityConfig(lottery_campaign_id)
    return res.apiSuccess({ lottery_campaign_id, items }, '获取成长等级公示分级概率配置成功')
  })
)

/**
 * PUT /level-probability/:lottery_campaign_id - 批量配置某活动各成长等级中奖率倍数
 *
 * 请求体：{ items: [{ level_key: 'silver', multiplier: 1.3 }, ...] }
 *
 * @route PUT /api/v4/console/lottery-management/level-probability/:lottery_campaign_id
 * @access Private (管理员)
 */
router.put(
  '/level-probability/:lottery_campaign_id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const lottery_campaign_id = parseInt(req.params.lottery_campaign_id, 10)
    if (!Number.isInteger(lottery_campaign_id) || lottery_campaign_id <= 0) {
      return res.apiError('无效的活动ID', 'INVALID_CAMPAIGN_ID', null, 400)
    }

    const { items } = req.body
    if (!Array.isArray(items) || items.length === 0) {
      return res.apiError('items 必须为非空数组', 'INVALID_ITEMS', null, 400)
    }

    const growthLevelService = getGrowthLevelService(req)
    const result = await TransactionManager.execute(
      async transaction => {
        return growthLevelService.upsertLevelProbabilityConfig(
          lottery_campaign_id,
          items,
          req.user?.user_id,
          { transaction }
        )
      },
      { description: 'upsertLevelProbabilityConfig' }
    )

    logger.info('[PUT /level-probability] 配置成长等级公示分级概率', {
      admin_id: req.user?.user_id,
      lottery_campaign_id,
      count: result.length
    })

    return res.apiSuccess({ lottery_campaign_id, items: result }, '成长等级公示分级概率配置成功')
  })
)

module.exports = router
