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
const logger = require('../../../../utils/logger').logger
const { handleServiceError } = require('../../../../middleware/validation')

/**
 * 获取纠纷列表
 * GET /api/v4/console/customer-service/disputes
 */
router.get('/', authenticateToken, requireRoleLevel(1), async (req, res) => {
  try {
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
  } catch (error) {
    logger.error('获取纠纷列表失败', { error: error.message })
    return handleServiceError(error, res)
  }
})

/**
 * 获取纠纷统计
 * GET /api/v4/console/customer-service/disputes/stats
 */
router.get('/stats', authenticateToken, requireRoleLevel(1), async (req, res) => {
  try {
    const TradeDisputeService = req.app.locals.services.getService('trade_dispute')
    const stats = await TradeDisputeService.getDisputeStats()
    return res.apiSuccess(stats, '获取纠纷统计成功')
  } catch (error) {
    logger.error('获取纠纷统计失败', { error: error.message })
    return handleServiceError(error, res)
  }
})

/**
 * 获取纠纷详情
 * GET /api/v4/console/customer-service/disputes/:id
 */
router.get('/:id', authenticateToken, requireRoleLevel(1), async (req, res) => {
  try {
    const TradeDisputeService = req.app.locals.services.getService('trade_dispute')
    const detail = await TradeDisputeService.getDisputeDetail(parseInt(req.params.id))
    return res.apiSuccess(detail, '获取纠纷详情成功')
  } catch (error) {
    logger.error('获取纠纷详情失败', { error: error.message })
    if (error.message.includes('不存在')) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    }
    return handleServiceError(error, res)
  }
})

/**
 * 创建交易纠纷（管理员代买家发起）
 * POST /api/v4/console/customer-service/disputes
 */
router.post('/', authenticateToken, requireRoleLevel(50), async (req, res) => {
  try {
    const TradeDisputeService = req.app.locals.services.getService('trade_dispute')
    const { trade_order_id, user_id, dispute_type, title, description, evidence } = req.body

    if (!trade_order_id || !user_id || !dispute_type || !title) {
      return res.apiError(
        '缺少必填参数：trade_order_id, user_id, dispute_type, title',
        'BAD_REQUEST',
        null,
        400
      )
    }

    const result = await TransactionManager.execute(
      async transaction => {
        return await TradeDisputeService.createDispute(
          {
            trade_order_id: parseInt(trade_order_id),
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
      { description: `创建交易纠纷（订单：${trade_order_id}）` }
    )

    return res.apiSuccess(result, '纠纷工单创建成功')
  } catch (error) {
    logger.error('创建交易纠纷失败', { error: error.message })
    if (error.message.includes('不允许') || error.message.includes('仅买家')) {
      return res.apiError(error.message, 'BAD_REQUEST', null, 400)
    }
    if (error.message.includes('已有进行中')) {
      return res.apiError(error.message, 'CONFLICT', null, 409)
    }
    return handleServiceError(error, res)
  }
})

/**
 * 升级纠纷为仲裁
 * POST /api/v4/console/customer-service/disputes/:id/escalate
 */
router.post('/:id/escalate', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
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
  } catch (error) {
    logger.error('升级仲裁失败', { error: error.message })
    return handleServiceError(error, res)
  }
})

/**
 * 解决纠纷
 * POST /api/v4/console/customer-service/disputes/:id/resolve
 */
router.post('/:id/resolve', authenticateToken, requireRoleLevel(50), async (req, res) => {
  try {
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
  } catch (error) {
    logger.error('解决纠纷失败', { error: error.message })
    return handleServiceError(error, res)
  }
})

module.exports = router
