/**
 * 活动预算归集规则管理路由（水晶奖品倍率活动设计方案 §12.10 / §13.1 / W-4）
 *
 * 业务职责：
 * - 活动预算归集规则 event_budget_collection_rules 的完整 CRUD
 * - 限时翻倍活动期间消费预算重定向配置（去向活动、时间窗、门店/商家条件、event_points 发放比率）
 *
 * 路径（现网扁平短横线风格，挂载于 lottery/index.js）：
 * - GET    /event-budget-collection-rules            - 归集规则列表（分页）
 * - GET    /event-budget-collection-rules/:id        - 规则详情
 * - POST   /event-budget-collection-rules            - 创建规则
 * - PUT    /event-budget-collection-rules/:id        - 更新规则（禁止改绑活动）
 * - PATCH  /event-budget-collection-rules/:id/status - 开关 active/inactive
 * - DELETE /event-budget-collection-rules/:id        - 删除规则
 *
 * 架构约束：
 * - 认证：authenticateToken + requireRoleLevel(100)（管理员）
 * - 路由不直连 models，通过 ServiceManager('event_budget') 获取服务
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
 * 通过 ServiceManager 获取活动预算归集服务
 * @param {Object} req - Express 请求对象
 * @returns {Object} EventBudgetService（静态类）
 */
const getEventBudgetService = req => {
  return req.app.locals.services.getService('event_budget')
}

/**
 * 中间件：认证 + 管理员权限（全部端点）
 */
router.use(authenticateToken, requireRoleLevel(100))

/**
 * GET / - 归集规则列表（分页）
 *
 * 查询参数：
 * - lottery_campaign_id: number - 归集去向活动ID（可选）
 * - status: string - 规则状态（可选：active/inactive）
 * - page / page_size - 分页参数
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { lottery_campaign_id, status, page = 1, page_size = 20 } = req.query
    const eventBudgetService = getEventBudgetService(req)

    const result = await eventBudgetService.listRules({
      lottery_campaign_id,
      status,
      page,
      page_size
    })

    return res.apiPaginated(
      result.rows,
      { page: result.page, page_size: result.page_size, total: result.total },
      '获取归集规则列表成功'
    )
  })
)

/**
 * GET /expiry-clear-history - 到期清零执行历史（§13.4 运维视图）
 *
 * 查询参数：days（默认30，最大180）
 * 返回：{ enabled, range_days, total_cleared_amount, total_cleared_count, daily: [{ date, cleared_count, cleared_amount }] }
 *
 * ⚠️ 路由顺序：必须置于 /:id 之前，避免 'expiry-clear-history' 被当作 :id 捕获。
 */
router.get(
  '/expiry-clear-history',
  asyncHandler(async (req, res) => {
    const eventBudgetService = getEventBudgetService(req)
    const data = await eventBudgetService.getExpiryClearHistory({ days: req.query.days })
    return res.apiSuccess(data, '获取到期清零执行历史成功')
  })
)

/**
 * GET /:id - 归集规则详情（含所属活动摘要）
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const eventBudgetService = getEventBudgetService(req)
    const rule = await eventBudgetService.getRule(parseInt(req.params.id, 10))
    return res.apiSuccess(rule, '获取归集规则详情成功')
  })
)

/**
 * POST / - 创建归集规则
 *
 * 请求体（snake_case，字段名 = 数据库列名）：
 * - lottery_campaign_id: number - 归集去向活动（必填）
 * - rule_name: string - 规则名（必填）
 * - store_ids / merchant_ids: Array|null - 命中门店/商家ID数组（null=不限）
 * - event_points_ratio: number - 活动积分发放比率（默认 1.0，0=只归集预算）
 * - start_at / end_at: string|null - 生效时间窗（null=对齐活动窗口）
 * - priority / status / remark - 可选
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const eventBudgetService = getEventBudgetService(req)

    const rule = await TransactionManager.execute(async transaction => {
      return await eventBudgetService.createRule(req.body, req.user.user_id, { transaction })
    })

    logger.info('[POST /event-budget-collection-rules] 创建归集规则', {
      admin_id: req.user.user_id,
      collection_rule_id: rule.collection_rule_id,
      lottery_campaign_id: rule.lottery_campaign_id
    })

    return res.apiCreated(rule, '创建归集规则成功')
  })
)

/**
 * PUT /:id - 更新归集规则（禁止改绑活动，避免历史归集桶错位）
 */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const eventBudgetService = getEventBudgetService(req)

    const rule = await TransactionManager.execute(async transaction => {
      return await eventBudgetService.updateRule(
        parseInt(req.params.id, 10),
        req.body,
        req.user.user_id,
        { transaction }
      )
    })

    logger.info('[PUT /event-budget-collection-rules/:id] 更新归集规则', {
      admin_id: req.user.user_id,
      collection_rule_id: req.params.id
    })

    return res.apiSuccess(rule, '更新归集规则成功')
  })
)

/**
 * PATCH /:id/status - 开关归集规则（应急秒级停止归集）
 *
 * 请求体：
 * - status: string - active/inactive（必填）
 */
router.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const { status } = req.body
    const eventBudgetService = getEventBudgetService(req)

    const rule = await TransactionManager.execute(async transaction => {
      return await eventBudgetService.setStatus(parseInt(req.params.id, 10), status, {
        transaction
      })
    })

    logger.info('[PATCH /event-budget-collection-rules/:id/status] 切换归集规则状态', {
      admin_id: req.user.user_id,
      collection_rule_id: req.params.id,
      status
    })

    return res.apiSuccess(rule, `归集规则已${status === 'active' ? '启用' : '停用'}`)
  })
)

/**
 * DELETE /:id - 删除归集规则
 */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const eventBudgetService = getEventBudgetService(req)

    await TransactionManager.execute(async transaction => {
      return await eventBudgetService.deleteRule(parseInt(req.params.id, 10), { transaction })
    })

    logger.info('[DELETE /event-budget-collection-rules/:id] 删除归集规则', {
      admin_id: req.user.user_id,
      collection_rule_id: req.params.id
    })

    return res.apiSuccess({ collection_rule_id: parseInt(req.params.id, 10) }, '删除归集规则成功')
  })
)

module.exports = router
