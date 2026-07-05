/**
 * 水晶奖品倍率规则管理路由（水晶奖品倍率活动设计方案 §16.1/§16.2/§22.3）
 *
 * 业务职责：
 * - 倍率规则 reward_multiplier_campaigns / reward_multiplier_targets 的完整 CRUD
 * - 成本水位查询（extra_cost_used/limit + 受益人数 + 多发水晶总量）
 * - 人群选择器数据源：用户标签 tag_key 选项（segment 选项见 lottery-campaigns/:id/segment-options）
 *
 * 路径（D-13 现网扁平短横线风格，挂载于 lottery/index.js 根 '/')：
 * - GET    /multiplier-rules            - 倍率规则列表（分页）
 * - GET    /multiplier-rules/:id        - 规则详情（含 targets）
 * - POST   /multiplier-rules            - 创建规则（D-11 自接幂等，Header Idempotency-Key 必填）
 * - PUT    /multiplier-rules/:id        - 更新规则（targets 全量替换）
 * - PATCH  /multiplier-rules/:id/status - 开关 active/inactive
 * - DELETE /multiplier-rules/:id        - 删除规则（FK 级联删 targets）
 * - GET    /multiplier-rules/:id/cost   - 成本水位
 * - GET    /ad-tags                     - 用户标签 tag_key 选项（§16.2，当前可能为空数组）
 *
 * 架构约束：
 * - 认证：authenticateToken + requireRoleLevel(100)（管理员）
 * - 路由不直连 models，通过 ServiceManager('reward_multiplier') 获取服务
 * - 写操作由路由层 TransactionManager.execute() 管理事务边界
 */

'use strict'

const express = require('express')
const router = express.Router()

const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const TransactionManager = require('../../../../utils/TransactionManager')
const logger = require('../../../../utils/logger').logger
const { asyncHandler } = require('../shared/middleware')

/**
 * 通过 ServiceManager 获取倍率规则管理服务
 * @param {Object} req - Express 请求对象
 * @returns {Object} RewardMultiplierService（静态类）
 */
const getRewardMultiplierService = req => {
  return req.app.locals.services.getService('reward_multiplier')
}

/**
 * 中间件：认证 + 管理员权限（全部端点）
 */
router.use(authenticateToken, requireRoleLevel(100))

/**
 * GET /multiplier-rules - 倍率规则列表（分页）
 *
 * 查询参数：
 * - lottery_campaign_id: number - 绑定的抽奖活动ID（可选）
 * - status: string - 规则状态（可选：active/inactive）
 * - page: number - 页码（默认1）
 * - page_size: number - 每页数量（默认20，最大100）
 */
router.get(
  '/multiplier-rules',
  asyncHandler(async (req, res) => {
    const { lottery_campaign_id, status, page = 1, page_size = 20 } = req.query

    const rewardMultiplierService = getRewardMultiplierService(req)
    const result = await rewardMultiplierService.listRules({
      lottery_campaign_id,
      status,
      page,
      page_size
    })

    return res.apiPaginated(
      result.rows,
      { page: result.page, page_size: result.page_size, total: result.total },
      '获取倍率规则列表成功'
    )
  })
)

/**
 * GET /ad-tags - 用户标签 tag_key 选项（人群选择器数据源，§16.2）
 *
 * 说明：user_ad_tags 由定时任务产出，当前可能为空 → 返回空数组，
 * 前端据此提示"暂无标签数据"。
 *
 * ⚠️ 路由顺序：本路由与 /multiplier-rules/* 平级，无参数冲突。
 */
router.get(
  '/ad-tags',
  asyncHandler(async (req, res) => {
    const rewardMultiplierService = getRewardMultiplierService(req)
    const tags = await rewardMultiplierService.getAdTagOptions()
    return res.apiSuccess({ tags, total: tags.length }, '获取用户标签选项成功')
  })
)

/**
 * GET /multiplier-user-explain - 某用户抽奖水晶倍率解释（§13.3 客服"为什么翻/没翻"）
 *
 * 查询参数：user_id（必填）、lottery_campaign_id（可选）、limit（默认20，最大100）
 * 返回：{ user_id, total, records: [{ lottery_draw_id, prize_name, multiplied, crystal_multiplier, ... }] }
 */
router.get(
  '/multiplier-user-explain',
  asyncHandler(async (req, res) => {
    const rewardMultiplierService = getRewardMultiplierService(req)
    const data = await rewardMultiplierService.getUserMultiplierExplain({
      user_id: req.query.user_id,
      lottery_campaign_id: req.query.lottery_campaign_id,
      limit: req.query.limit
    })
    return res.apiSuccess(data, '获取用户倍率解释成功')
  })
)

/**
 * GET /multiplier-analytics/event-points-trend - 活动积分发放/消耗按日趋势（§13.2 ECharts）
 *
 * 查询参数：days（默认30，最大180）
 * 返回：{ range_days, series: [{ date, issued, consumed }] }
 */
router.get(
  '/multiplier-analytics/event-points-trend',
  asyncHandler(async (req, res) => {
    const rewardMultiplierService = getRewardMultiplierService(req)
    const data = await rewardMultiplierService.getEventPointsTrend({ days: req.query.days })
    return res.apiSuccess(data, '获取活动积分趋势成功')
  })
)

/**
 * GET /multiplier-analytics/event-points-overview - 活动积分在途余额概览（§13.2）
 *
 * 返回：{ total_issued, total_consumed, expired_cleared, in_flight, holder_count }
 */
router.get(
  '/multiplier-analytics/event-points-overview',
  asyncHandler(async (req, res) => {
    const rewardMultiplierService = getRewardMultiplierService(req)
    const data = await rewardMultiplierService.getEventPointsOverview()
    return res.apiSuccess(data, '获取活动积分概览成功')
  })
)

/**
 * GET /multiplier-analytics/budget-distribution - 个人活动预算账户余额分布（§13.2 防套利监控）
 *
 * 查询参数：asset_code（event_points 默认 / budget_points）
 * 返回：{ asset_code, buckets: [{ bucket_label, holder_count, total_amount }] }
 */
router.get(
  '/multiplier-analytics/budget-distribution',
  asyncHandler(async (req, res) => {
    const rewardMultiplierService = getRewardMultiplierService(req)
    const data = await rewardMultiplierService.getPersonalBudgetDistribution({
      asset_code: req.query.asset_code
    })
    return res.apiSuccess(data, '获取个人活动账户余额分布成功')
  })
)

/**
 * GET /multiplier-rules/:id/cost - 成本水位查询
 *
 * 返回：extra_cost_used/limit、usage_ratio、exhausted、
 *       trigger_count（翻倍触发次数）、beneficiary_count（受益人数）、
 *       extra_units_total（多发水晶总量，读 lottery_draws.result_metadata 快照）
 */
router.get(
  '/multiplier-rules/:id/cost',
  asyncHandler(async (req, res) => {
    const rewardMultiplierService = getRewardMultiplierService(req)
    const cost = await rewardMultiplierService.getCostWaterLevel(parseInt(req.params.id, 10))
    return res.apiSuccess(cost, '获取成本水位成功')
  })
)

/**
 * GET /multiplier-rules/:id - 规则详情（含 targets）
 */
router.get(
  '/multiplier-rules/:id',
  asyncHandler(async (req, res) => {
    const rewardMultiplierService = getRewardMultiplierService(req)
    const rule = await rewardMultiplierService.getRule(parseInt(req.params.id, 10))
    return res.apiSuccess(rule, '获取倍率规则详情成功')
  })
)

/**
 * POST /multiplier-rules - 创建倍率规则（D-11 自接幂等）
 *
 * Header：
 * - Idempotency-Key: string - 幂等键（必填，缺失 400；重复请求回放首次结果）
 *
 * 请求体（snake_case，字段名 = 数据库列名，§16.1）：
 * - lottery_campaign_id: number - 绑定抽奖活动（必填，活动隔离禁止全局规则）
 * - campaign_name / display_name: string - 规则名/对用户展示名（必填）
 * - multiplier: number - 倍率 >=1，支持小数 1.50/1.75/2.00（必填）
 * - extra_cost_limit: number - 额外成本封顶（必填，拍板强制）
 * - reward_scope: string - crystal_all/group/asset_codes（默认 crystal_all）
 * - scope_values: Array - group/asset_codes 时必填
 * - target_type: string - all/segment/tag/growth_level/user（默认 all）
 * - targets: Array<{target_type,target_ref,target_value}> - target_type≠all 时必填
 * - rounding_mode / max_multiplier_cap / priority / per_user_daily_limit /
 *   eligibility_days / per_user_extra_cap / start_at / end_at / status / remark - 可选
 */
router.post(
  '/multiplier-rules',
  asyncHandler(async (req, res) => {
    const IdempotencyService = req.app.locals.services.getService('idempotency')
    const idempotency_key = req.headers['idempotency-key']

    // D-11：console 倍率写接口自接幂等（与 C 端抽奖同范式，缺失 400）
    if (!idempotency_key) {
      return res.apiError(
        '缺少必需的幂等键：请在 Header 中提供 Idempotency-Key',
        'MISSING_IDEMPOTENCY_KEY',
        {
          required_header: 'Idempotency-Key',
          example: 'Idempotency-Key: multiplier_rule_create_<admin_id>_<timestamp>'
        },
        400
      )
    }

    const admin_id = req.user.user_id

    // 入口幂等检查：重复请求回放首次结果
    const idempotencyResult = await IdempotencyService.getOrCreateRequest(idempotency_key, {
      api_path: '/api/v4/console/multiplier-rules',
      http_method: 'POST',
      request_params: { lottery_campaign_id: req.body.lottery_campaign_id },
      user_id: admin_id
    })
    if (!idempotencyResult.should_process) {
      logger.info('[POST /multiplier-rules] 入口幂等拦截：重复请求，返回首次结果', {
        idempotency_key,
        admin_id
      })
      return res.apiSuccess(
        { ...idempotencyResult.response, is_duplicate: true },
        '创建倍率规则成功（幂等回放）'
      )
    }

    const rewardMultiplierService = getRewardMultiplierService(req)

    try {
      const rule = await TransactionManager.execute(async transaction => {
        return await rewardMultiplierService.createRule(req.body, admin_id, { transaction })
      })

      const plainRule = rule.get({ plain: true })

      // 标记幂等请求完成（保存结果快照供回放）
      await IdempotencyService.markAsCompleted(
        idempotency_key,
        String(plainRule.multiplier_campaign_id),
        plainRule
      )

      logger.info('[POST /multiplier-rules] 创建倍率规则', {
        admin_id,
        multiplier_campaign_id: plainRule.multiplier_campaign_id,
        lottery_campaign_id: plainRule.lottery_campaign_id,
        multiplier: plainRule.multiplier
      })

      return res.apiCreated(plainRule, '创建倍率规则成功')
    } catch (error) {
      // 失败释放幂等键（允许修正参数后携同键重试）
      await IdempotencyService.markAsFailed(idempotency_key, error.message).catch(markError => {
        logger.error('[POST /multiplier-rules] 幂等状态标记失败', { error: markError.message })
      })
      throw error
    }
  })
)

/**
 * PUT /multiplier-rules/:id - 更新倍率规则（targets 显式提供时全量替换；禁止改绑活动）
 */
router.put(
  '/multiplier-rules/:id',
  asyncHandler(async (req, res) => {
    const rewardMultiplierService = getRewardMultiplierService(req)

    const rule = await TransactionManager.execute(async transaction => {
      return await rewardMultiplierService.updateRule(
        parseInt(req.params.id, 10),
        req.body,
        req.user.user_id,
        { transaction }
      )
    })

    logger.info('[PUT /multiplier-rules/:id] 更新倍率规则', {
      admin_id: req.user.user_id,
      multiplier_campaign_id: req.params.id
    })

    return res.apiSuccess(rule, '更新倍率规则成功')
  })
)

/**
 * PATCH /multiplier-rules/:id/status - 开关规则（应急秒级下线）
 *
 * 请求体：
 * - status: string - active/inactive（必填）
 */
router.patch(
  '/multiplier-rules/:id/status',
  asyncHandler(async (req, res) => {
    const { status } = req.body
    const rewardMultiplierService = getRewardMultiplierService(req)

    const rule = await TransactionManager.execute(async transaction => {
      return await rewardMultiplierService.setStatus(parseInt(req.params.id, 10), status, {
        transaction
      })
    })

    logger.info('[PATCH /multiplier-rules/:id/status] 切换规则状态', {
      admin_id: req.user.user_id,
      multiplier_campaign_id: req.params.id,
      status
    })

    return res.apiSuccess(rule, `倍率规则已${status === 'active' ? '启用' : '停用'}`)
  })
)

/**
 * DELETE /multiplier-rules/:id - 删除倍率规则（targets 随 FK ON DELETE CASCADE 删除）
 */
router.delete(
  '/multiplier-rules/:id',
  asyncHandler(async (req, res) => {
    const rewardMultiplierService = getRewardMultiplierService(req)

    await TransactionManager.execute(async transaction => {
      return await rewardMultiplierService.deleteRule(parseInt(req.params.id, 10), {
        transaction
      })
    })

    logger.info('[DELETE /multiplier-rules/:id] 删除倍率规则', {
      admin_id: req.user.user_id,
      multiplier_campaign_id: req.params.id
    })

    return res.apiSuccess(
      { multiplier_campaign_id: parseInt(req.params.id, 10) },
      '删除倍率规则成功'
    )
  })
)

module.exports = router
