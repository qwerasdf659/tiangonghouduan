'use strict'

/**
 * 用户成长等级 C 端只读路由（BE-4 / 合规改造 V-4 / L-3）
 *
 * 顶层路径：/api/v4/user/growth-level
 * 内部目录：routes/v4/user/growth-level.js
 *
 * 职责：
 * - 向 C 端（微信小程序）下发"我的成长等级"只读视图，用于"会员尊享/解锁条件"展示。
 *
 * 安全口径（拍板点④/⑨，后端权威）：
 * - 严格脱敏：仅下发 level_key / level_name / 累计积分 / 等级阶梯；倍数/权重绝不下发。
 * - 占位阈值保护：成长等级阈值未定稿前不下发门槛数字（min_history_points=null）。
 *
 * 架构约束：
 * - 读操作收口到 UserGrowthLevelService（通过 ServiceManager 获取，路由不直连 models）。
 * - 统一使用 res.apiSuccess / res.apiError。
 *
 * 适用区域：中国（北京时间 Asia/Shanghai）
 */

const express = require('express')
const router = express.Router()
const { asyncHandler } = require('../../../middleware/validation')

/**
 * GET /api/v4/user/growth-level
 * @desc 获取当前用户的成长等级只读视图（脱敏，占位阈值不下发门槛数字）
 * @access Private（需登录，身份由 JWT 判定）
 *
 * @returns {Object} {
 *   current_level_key,       // 当前成长等级业务码（如 bronze）
 *   current_level_name,      // 当前成长等级中文名（如 青铜）
 *   history_total_points,    // 用户累计积分（成长等级的单一派生数据源）
 *   thresholds_confirmed,    // 等级阈值是否已定稿（false 时门槛数字为 null）
 *   levels: [{ level_key, level_name, min_history_points }]  // 等级阶梯（未定稿时 min_history_points=null）
 * }
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const userGrowthLevelService = req.app.locals.services.getService('user_growth_level')
    const view = await userGrowthLevelService.getUserGrowthLevelView(req.user.user_id)
    return res.apiSuccess(view, '获取成长等级成功')
  })
)

module.exports = router
