/**
 * 餐厅积分抽奖系统 V4.2 - 核销订单查询API
 * 处理核销订单的查询功能
 *
 * 功能说明：
 * - 查询订单详情
 * - 查询物品的核销订单
 *
 * 创建时间：2025年12月22日
 * 使用 Claude Sonnet 4.5 模型
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../../middleware/auth')
const { validatePositiveInteger, handleServiceError } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger

/**
 * 查询订单详情（Get Redemption Order Detail）
 * GET /api/v4/redemption/orders/:order_id
 *
 * 业务场景：
 * - 查询核销订单的详细信息
 * - 包含物品实例信息和核销人信息
 *
 * 路径参数：
 * @param {string} order_id - 订单ID（UUID）
 *
 * 返回数据：
 * @returns {Object} order - 订单完整信息
 *
 * 错误场景：
 * - 订单不存在 → 404 NOT_FOUND
 */
router.get('/orders/:order_id', authenticateToken, async (req, res) => {
  try {
    const { order_id } = req.params

    logger.info('查询订单详情', {
      order_id,
      user_id: req.user.user_id
    })

    const RedemptionOrderService = req.app.locals.services.getService('redemptionOrder')
    const order = await RedemptionOrderService.getOrderDetail(order_id, {
      include_item: true,
      include_redeemer: true
    })

    return res.apiSuccess(
      {
        order_id: order.order_id,
        item_instance_id: order.item_instance_id,
        status: order.status,
        expires_at: order.expires_at,
        fulfilled_at: order.fulfilled_at,
        created_at: order.created_at,
        item_instance: order.item_instance,
        redeemer: order.redeemer
      },
      '查询成功'
    )
  } catch (error) {
    logger.error('查询订单详情失败', {
      error: error.message,
      order_id: req.params.order_id
    })

    if (error.message.includes('不存在')) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    }

    return handleServiceError(error, res, '查询订单详情失败')
  }
})

/**
 * 查询物品的核销订单（Get Order by Item Instance）
 * GET /api/v4/redemption/items/:item_instance_id/order
 *
 * 业务场景：
 * - 根据物品实例ID查询其核销订单
 * - 用于检查物品是否已生成核销码
 *
 * 路径参数：
 * @param {number} item_instance_id - 物品实例ID
 *
 * 返回数据：
 * @returns {Object|null} order - 订单对象或null（如果未生成）
 */
router.get(
  '/items/:item_instance_id/order',
  authenticateToken,
  validatePositiveInteger('item_instance_id', 'params'),
  async (req, res) => {
    try {
      const itemInstanceId = req.validated.item_instance_id

      logger.info('查询物品的核销订单', {
        item_instance_id: itemInstanceId,
        user_id: req.user.user_id
      })

      const RedemptionOrderService = req.app.locals.services.getService('redemptionOrder')
      const order = await RedemptionOrderService.getOrderByItem(itemInstanceId)

      if (!order) {
        return res.apiSuccess({ has_order: false, order: null }, '该物品尚未生成核销订单')
      }

      return res.apiSuccess(
        {
          has_order: true,
          order: {
            order_id: order.order_id,
            status: order.status,
            expires_at: order.expires_at,
            fulfilled_at: order.fulfilled_at,
            created_at: order.created_at
          }
        },
        '查询成功'
      )
    } catch (error) {
      logger.error('查询物品核销订单失败', {
        error: error.message,
        item_instance_id: req.validated.item_instance_id
      })

      return handleServiceError(error, res, '查询物品核销订单失败')
    }
  }
)

module.exports = router
