/**
 * 消费加成活动规则管理路由（消费加成活动·方案C，2026-07-15）
 *
 * 业务职责：
 * - 消费加成活动规则 consumption_bonus_rules 的完整 CRUD
 * - 多活动独立倍率配置（加成率、时间窗、门店/商家范围、优先级）
 * - 全平台活动（store_ids/merchant_ids 均 NULL）+ 单商家专属活动（任一非空）并存，商家专属优先
 *
 * 路径（现网扁平短横线风格，挂载于 lottery/index.js）：
 * - GET    /consumption-bonus-rules            - 规则列表（分页）
 * - GET    /consumption-bonus-rules/:id        - 规则详情
 * - POST   /consumption-bonus-rules            - 创建规则
 * - PUT    /consumption-bonus-rules/:id        - 更新规则
 * - PATCH  /consumption-bonus-rules/:id/status - 开关 active/inactive
 * - DELETE /consumption-bonus-rules/:id        - 删除规则
 *
 * 架构约束：
 * - 认证：authenticateToken + requireRoleLevel(100)（管理员）
 * - 路由不直连 models，通过 ServiceManager('consumption_bonus') 获取服务
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
 * 通过 ServiceManager 获取消费加成活动服务
 * @param {Object} req - Express 请求对象
 * @returns {Object} ConsumptionBonusService（静态类）
 */
const getBonusService = req => {
  return req.app.locals.services.getService('consumption_bonus')
}

/**
 * 中间件：认证 + 管理员权限（全部端点）
 */
router.use(authenticateToken, requireRoleLevel(100))

/**
 * GET / - 消费加成规则列表（分页）
 *
 * 查询参数：
 * - status: string - 规则状态（可选：active/inactive）
 * - page / page_size - 分页参数
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status, page = 1, page_size = 20 } = req.query
    const bonusService = getBonusService(req)

    const result = await bonusService.listRules({ status, page, page_size })

    return res.apiPaginated(
      result.rows,
      { page: result.page, page_size: result.page_size, total: result.total },
      '获取消费加成规则列表成功'
    )
  })
)

/**
 * GET /:id - 规则详情
 */
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const bonusService = getBonusService(req)
    const rule = await bonusService.getRule(parseInt(req.params.id, 10))
    return res.apiSuccess(rule, '获取消费加成规则详情成功')
  })
)

/**
 * POST / - 创建规则
 *
 * 请求体（snake_case，字段名 = 数据库列名）：
 * - rule_name / display_name: string - 规则名/展示名（必填）
 * - bonus_rate: number - 加成率（必填，如 0.5=多送50%）
 * - store_ids / merchant_ids: Array|null - 命中门店/商家ID数组（null=不限=全平台）
 * - start_at / end_at: string|null - 生效时间窗（null=不限）
 * - priority / max_bonus_rate / status / remark - 可选
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const bonusService = getBonusService(req)

    const rule = await TransactionManager.execute(async transaction => {
      return await bonusService.createRule(req.body, { transaction })
    })

    logger.info('[POST /consumption-bonus-rules] 创建消费加成规则', {
      admin_id: req.user.user_id,
      consumption_bonus_rule_id: rule.consumption_bonus_rule_id
    })

    return res.apiCreated(rule, '创建消费加成规则成功')
  })
)

/**
 * PUT /:id - 更新规则
 */
router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const bonusService = getBonusService(req)

    const rule = await TransactionManager.execute(async transaction => {
      return await bonusService.updateRule(parseInt(req.params.id, 10), req.body, { transaction })
    })

    logger.info('[PUT /consumption-bonus-rules/:id] 更新消费加成规则', {
      admin_id: req.user.user_id,
      consumption_bonus_rule_id: req.params.id
    })

    return res.apiSuccess(rule, '更新消费加成规则成功')
  })
)

/**
 * PATCH /:id/status - 开关规则（应急秒级启停）
 *
 * 请求体：
 * - status: string - active/inactive（必填）
 */
router.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const { status } = req.body
    const bonusService = getBonusService(req)

    const rule = await TransactionManager.execute(async transaction => {
      return await bonusService.updateRule(parseInt(req.params.id, 10), { status }, { transaction })
    })

    logger.info('[PATCH /consumption-bonus-rules/:id/status] 切换消费加成规则状态', {
      admin_id: req.user.user_id,
      consumption_bonus_rule_id: req.params.id,
      status
    })

    return res.apiSuccess(rule, `消费加成规则已${status === 'active' ? '启用' : '停用'}`)
  })
)

/**
 * DELETE /:id - 删除规则（配置数据硬删除）
 */
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const bonusService = getBonusService(req)

    await TransactionManager.execute(async transaction => {
      return await bonusService.deleteRule(parseInt(req.params.id, 10), { transaction })
    })

    logger.info('[DELETE /consumption-bonus-rules/:id] 删除消费加成规则', {
      admin_id: req.user.user_id,
      consumption_bonus_rule_id: req.params.id
    })

    return res.apiSuccess(
      { consumption_bonus_rule_id: parseInt(req.params.id, 10) },
      '删除消费加成规则成功'
    )
  })
)

module.exports = router
