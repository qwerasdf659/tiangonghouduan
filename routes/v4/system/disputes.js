/**
 * 售后申诉路由（C 端 / 小程序）
 *
 * @description 用户端售后申诉：自助发起 + 只读查询（查看自己的申诉进度，脱敏下发）
 * @prefix /api/v4/system/disputes
 *
 * 说明（方案A 第2项二期落地：开放 C 端自助发起）：
 * - POST /disputes：用户自助发起售后申诉（含归属校验 + 防滥用风控）
 * - GET /disputes/my、GET /disputes/:id：只读查询自己的申诉进度
 * - 拍卖争议仍保留独立入口 marketplace/auctions/:id/dispute
 * - 字段以后端为准，小程序直接使用 trade_dispute_id 等后端字段名，不做映射
 *
 * 创建时间：2026-06-02 北京时间
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { asyncHandler } = require('../../../middleware/validation')
const TransactionManager = require('../../../utils/TransactionManager')

/**
 * @route POST /api/v4/system/disputes
 * @desc 用户自助发起售后申诉（二期开放，方案A 第2项）
 * @access Private（已登录用户）
 *
 * @body {string} order_type - 订单类型（trade/redemption/consumption/auction）
 * @body {string|number} order_id - 关联订单ID
 * @body {string} dispute_type - 纠纷类型（item_not_received/item_mismatch/quality_issue/fraud/other）
 * @body {string} title - 申诉标题
 * @body {string} [description] - 申诉描述
 * @body {Array} [evidence] - 证据（截图URL数组等）
 *
 * 说明：
 * - 仅允许对"本人"且"可申诉状态"的订单发起（服务层按 order_type 分流校验归属）
 * - 含防滥用风控（冷却 + 月限，由 system_settings 配置，默认关闭）
 * - 写操作走 TransactionManager 事务边界，服务通过 ServiceManager 获取
 */
router.post(
  '/',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const svc = req.app.locals.services.getService('trade_dispute')
    const { order_type, order_id, dispute_type, title, description, evidence } = req.body

    if (!order_type || !order_id || !dispute_type || !title) {
      return res.apiError(
        '缺少必填参数：order_type, order_id, dispute_type, title',
        'BAD_REQUEST',
        null,
        400
      )
    }

    const result = await TransactionManager.execute(
      async transaction =>
        svc.createDispute(
          {
            order_type,
            order_id: String(order_id),
            user_id: req.user.user_id,
            dispute_type,
            title,
            description,
            evidence,
            created_by: req.user.user_id,
            self_service: true
          },
          { transaction }
        ),
      { description: '用户自助发起售后申诉' }
    )

    return res.apiSuccess(result, '申诉已提交')
  })
)

/**
 * @route GET /api/v4/system/disputes/my
 * @desc 我的售后申诉列表（仅本人，脱敏）
 * @access Private（已登录用户）
 * @query {string} [status] - 状态筛选（open/reviewing/arbitrating/resolved/rejected）
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=10] - 每页数量（最大50）
 */
router.get(
  '/my',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const svc = req.app.locals.services.getService('trade_dispute')
    const sanitizer = req.app.locals.services.getService('data_sanitizer')

    const data = await svc.listUserDisputes(req.user.user_id, req.query)
    data.rows = sanitizer.sanitizeDisputes(data.rows, 'public')

    return res.apiSuccess(data, '获取售后申诉列表成功')
  })
)

/**
 * @route GET /api/v4/system/disputes/:id
 * @desc 售后申诉详情（仅本人，脱敏）
 * @access Private（已登录用户）
 * @param {number} id - 申诉ID（trade_dispute_id）
 */
router.get(
  '/:id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const svc = req.app.locals.services.getService('trade_dispute')
    const sanitizer = req.app.locals.services.getService('data_sanitizer')

    const detail = await svc.getUserDisputeDetail(req.user.user_id, parseInt(req.params.id))
    const [sanitized] = sanitizer.sanitizeDisputes([detail], 'public')

    return res.apiSuccess(sanitized, '获取售后申诉详情成功')
  })
)

module.exports = router
