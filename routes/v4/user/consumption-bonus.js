'use strict'

/**
 * 消费加成活动 C 端只读路由（消费加成活动·方案C，2026-07-15）
 *
 * 顶层路径：/api/v4/user/consumption-bonus
 * 内部目录：routes/v4/user/consumption-bonus.js
 *
 * 职责：
 * - 向 C 端（微信小程序）下发"当前对某门店/商家生效的消费加成活动"展示信息，
 *   用于门店页/扫码页展示"本店双11消费多送50%积分"，激励消费。
 *
 * 安全口径（后端权威脱敏）：
 * - 仅下发 display_name / bonus_rate / start_at / end_at（营销展示信息）；
 * - 不下发 priority / max_bonus_rate / store_ids / merchant_ids / rule_name 等内部字段；
 * - 预算账户放大逻辑仍严格保密（同成长等级倍率红线）。
 *
 * 架构约束：
 * - 读操作收口到 ConsumptionBonusService（通过 ServiceManager 获取，路由不直连 models）。
 * - 统一使用 res.apiSuccess / res.apiError。
 *
 * 适用区域：中国（北京时间 Asia/Shanghai）
 */

const express = require('express')
const router = express.Router()
const { asyncHandler } = require('../../../middleware/validation')

/**
 * GET /api/v4/user/consumption-bonus
 * @desc 查询当前对指定门店/商家生效的消费加成活动（脱敏展示）
 * @access Private（需登录）
 *
 * @query {number} [store_id]    - 门店ID（查该门店当前生效活动）
 * @query {number} [merchant_id] - 商家ID（查该商家当前生效活动）
 * @returns {Object|null} { active: boolean, activity: { display_name, bonus_rate, start_at, end_at } | null }
 *   active=false 表示当前无生效加成活动
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { store_id, merchant_id } = req.query
    const bonusService = req.app.locals.services.getService('consumption_bonus')

    const activity = await bonusService.getActiveRuleForDisplay({
      store_id: store_id ? parseInt(store_id, 10) : null,
      merchant_id: merchant_id ? parseInt(merchant_id, 10) : null
    })

    return res.apiSuccess(
      { active: !!activity, activity: activity || null },
      activity ? '获取消费加成活动成功' : '当前无生效的消费加成活动'
    )
  })
)

module.exports = router
