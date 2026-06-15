/**
 * 天工商户营销平台 V4.2 - 核销订单查询API
 * 处理核销订单的查询功能
 *
 * 功能说明：
 * - 查询订单详情
 * - 查询物品的核销订单
 *
 * 使用 Claude Sonnet 4.5 模型
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../../middleware/auth')
const { validatePositiveInteger, asyncHandler } = require('../../../../middleware/validation')
const BeijingTimeHelper = require('../../../../utils/timeHelper')

/**
 * 查询当前用户的核销订单列表（用户视角「我的核销订单」）
 * GET /api/v4/shop/redemption/me
 *
 * 业务场景：
 * - 用户查看自己生成/已核销的兑换订单，作为「申请售后」入口的数据源
 * - status=fulfilled 即「已核销、可申诉」的订单（售后链路按 fulfilled 校验）
 *
 * 查询参数：
 * @query {string} [status] - 订单状态过滤（pending/fulfilled/cancelled/expired）
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量（上限 50）
 *
 * 返回数据：
 * @returns {Object} { records: [...], pagination: {...} }
 */
router.get(
  '/me',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const page = parseInt(req.query.page, 10) || 1
    const page_size = parseInt(req.query.page_size, 10) || 20

    const RedemptionService = req.app.locals.services.getService('redemption_order')
    const { count, rows } = await RedemptionService.getUserOrders(req.user.user_id, {
      status: req.query.status,
      page,
      page_size
    })

    // 主键直用 redemption_order_id（UUID），时间统一北京时间，前端零映射
    const records = rows.map(o => ({
      redemption_order_id: o.redemption_order_id,
      order_no: o.order_no,
      status: o.status,
      fulfilled_at: o.fulfilled_at ? BeijingTimeHelper.formatForAPI(o.fulfilled_at) : null,
      created_at: BeijingTimeHelper.formatForAPI(o.created_at),
      item: o.item ? { item_id: o.item.item_id, item_name: o.item.item_name } : null
    }))

    return res.apiSuccess(
      {
        records,
        pagination: {
          total: count,
          page,
          page_size,
          total_pages: Math.ceil(count / page_size)
        }
      },
      '查询成功'
    )
  })
)

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
router.get(
  '/orders/:order_id',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const { order_id } = req.params

    const RedemptionService = req.app.locals.services.getService('redemption_order')
    const order = await RedemptionService.getOrderDetail(order_id, {
      include_item: true,
      include_redeemer: true
    })

    return res.apiSuccess(
      {
        order_id: order.redemption_order_id,
        item_id: order.item_id,
        status: order.status,
        expires_at: order.expires_at,
        fulfilled_at: order.fulfilled_at,
        created_at: order.created_at,
        item: order.item,
        redeemer: order.redeemer
      },
      '查询成功'
    )
  })
)

/**
 * 查询物品的核销订单（Get Order by Item）
 * GET /api/v4/redemption/items/:item_id/order
 *
 * 业务场景：
 * - 根据物品ID查询其核销订单
 * - 用于检查物品是否已生成核销码
 *
 * 路径参数：
 * @param {number} item_id - 物品ID
 *
 * 返回数据：
 * @returns {Object|null} order - 订单对象或null（如果未生成）
 */
router.get(
  '/items/:item_id/order',
  authenticateToken,
  validatePositiveInteger('item_id', 'params'),
  asyncHandler(async (req, res) => {
    const itemId = req.validated.item_id

    const RedemptionService = req.app.locals.services.getService('redemption_order')
    const order = await RedemptionService.getOrderByItem(itemId)

    if (!order) {
      return res.apiSuccess({ has_order: false, order: null }, '该物品尚未生成核销订单')
    }

    return res.apiSuccess(
      {
        has_order: true,
        order: {
          order_id: order.redemption_order_id,
          status: order.status,
          expires_at: order.expires_at,
          fulfilled_at: order.fulfilled_at,
          created_at: order.created_at
        }
      },
      '查询成功'
    )
  })
)

module.exports = router
