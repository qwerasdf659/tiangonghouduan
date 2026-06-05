/**
 * 交易纠纷路由
 *
 * @description 交易纠纷与售后管理 API
 * @prefix /api/v4/console/customer-service/disputes
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const TransactionManager = require('../../../../utils/TransactionManager')
const { asyncHandler } = require('../../../../middleware/validation')

/**
 * 获取纠纷列表
 * GET /api/v4/console/customer-service/disputes
 */
router.get(
  '/',
  authenticateToken,
  requireRoleLevel(1),
  asyncHandler(async (req, res) => {
    const TradeDisputeService = req.app.locals.services.getService('trade_dispute')
    const { status, dispute_type, priority, page, page_size } = req.query

    const result = await TradeDisputeService.listDisputes({
      status,
      dispute_type,
      priority,
      page: parseInt(page) || 1,
      page_size: parseInt(page_size) || 20
    })

    return res.apiSuccess(result, '获取纠纷列表成功')
  })
)

/**
 * 获取纠纷统计
 * GET /api/v4/console/customer-service/disputes/stats
 */
router.get(
  '/stats',
  authenticateToken,
  requireRoleLevel(1),
  asyncHandler(async (req, res) => {
    const TradeDisputeService = req.app.locals.services.getService('trade_dispute')
    const stats = await TradeDisputeService.getDisputeStats()
    return res.apiSuccess(stats, '获取纠纷统计成功')
  })
)

/**
 * 获取纠纷详情
 * GET /api/v4/console/customer-service/disputes/:id
 */
router.get(
  '/:id',
  authenticateToken,
  requireRoleLevel(1),
  asyncHandler(async (req, res) => {
    const TradeDisputeService = req.app.locals.services.getService('trade_dispute')
    const detail = await TradeDisputeService.getDisputeDetail(parseInt(req.params.id))
    return res.apiSuccess(detail, '获取纠纷详情成功')
  })
)

/**
 * 创建交易纠纷（管理员代买家发起）
 * POST /api/v4/console/customer-service/disputes
 */
router.post(
  '/',
  authenticateToken,
  requireRoleLevel(50),
  asyncHandler(async (req, res) => {
    const TradeDisputeService = req.app.locals.services.getService('trade_dispute')
    const { order_type, order_id, user_id, dispute_type, title, description, evidence } = req.body

    if (!order_type || !order_id || !user_id || !dispute_type || !title) {
      return res.apiError(
        '缺少必填参数：order_type（redemption/consumption）, order_id, user_id, dispute_type, title',
        'BAD_REQUEST',
        null,
        400
      )
    }

    const result = await TransactionManager.execute(
      async transaction => {
        return await TradeDisputeService.createDispute(
          {
            order_type,
            order_id: String(order_id),
            user_id: parseInt(user_id),
            dispute_type,
            title,
            description,
            evidence,
            created_by: req.user.user_id
          },
          { transaction }
        )
      },
      { description: `创建交易纠纷（${order_type}订单：${order_id}）` }
    )

    return res.apiSuccess(result, '纠纷工单创建成功')
  })
)

/**
 * 受理纠纷（客服接单，open → reviewing）
 * POST /api/v4/console/customer-service/disputes/:id/accept
 *
 * 权限：requireRoleLevel(1)（一线客服即可受理/接单，与"查看"同级；解决=50/升级仲裁=100 不变）
 */
router.post(
  '/:id/accept',
  authenticateToken,
  requireRoleLevel(1),
  asyncHandler(async (req, res) => {
    const TradeDisputeService = req.app.locals.services.getService('trade_dispute')

    const result = await TransactionManager.execute(
      async transaction => {
        return await TradeDisputeService.acceptDispute(parseInt(req.params.id), req.user.user_id, {
          transaction
        })
      },
      { description: `受理交易纠纷（工单：${req.params.id}）` }
    )

    return res.apiSuccess(result, '纠纷已受理')
  })
)

/**
 * 升级纠纷为仲裁
 * POST /api/v4/console/customer-service/disputes/:id/escalate
 */
router.post(
  '/:id/escalate',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const TradeDisputeService = req.app.locals.services.getService('trade_dispute')

    const result = await TransactionManager.execute(
      async transaction => {
        return await TradeDisputeService.escalateToArbitration(
          parseInt(req.params.id),
          req.user.user_id,
          { transaction }
        )
      },
      { description: `升级纠纷为仲裁（工单：${req.params.id}）` }
    )

    return res.apiSuccess(result, '纠纷已升级为仲裁')
  })
)

/**
 * 解决纠纷
 * POST /api/v4/console/customer-service/disputes/:id/resolve
 */
router.post(
  '/:id/resolve',
  authenticateToken,
  requireRoleLevel(50),
  asyncHandler(async (req, res) => {
    const TradeDisputeService = req.app.locals.services.getService('trade_dispute')
    const { resolution, refund } = req.body

    if (!resolution) {
      return res.apiError('解决说明不能为空', 'BAD_REQUEST', null, 400)
    }

    const result = await TransactionManager.execute(
      async transaction => {
        return await TradeDisputeService.resolveDispute(
          parseInt(req.params.id),
          { resolution, refund: !!refund, operator_id: req.user.user_id },
          { transaction }
        )
      },
      { description: `解决纠纷（工单：${req.params.id}，退款：${!!refund}）` }
    )

    return res.apiSuccess(result, refund ? '纠纷已解决（已退款）' : '纠纷已解决')
  })
)

module.exports = router
