/**
 * 餐厅积分抽奖系统 V4.2 - 核销系统路由（Redemption System Routes）
 *
 * 职责：
 * - 新版核销系统HTTP API层
 * - 12位Base32核销码生成和核销
 * - 30天有效期管理
 * - 替代旧版8位HEX核销码系统
 *
 * 核心接口：
 * 1. POST /api/v4/redemption/orders - 生成核销订单（12位Base32码）
 * 2. POST /api/v4/redemption/fulfill - 核销订单
 * 3. GET /api/v4/redemption/orders/:order_id - 查询订单详情
 * 4. POST /api/v4/redemption/orders/:order_id/cancel - 取消订单
 * 5. GET /api/v4/redemption/items/:item_instance_id/order - 查询物品的核销订单
 *
 * 创建时间：2025-12-17
 * 使用模型：Claude Sonnet 4.5
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { validatePositiveInteger, handleServiceError } = require('../../../middleware/validation')
const Logger = require('../../../services/UnifiedLotteryEngine/utils/Logger')

const logger = new Logger('RedemptionAPI')

/**
 * 生成核销订单（Generate Redemption Order）
 * POST /api/v4/redemption/orders
 *
 * 业务场景：
 * - 用户兑换商品后，为物品实例生成12位Base32核销码
 * - 核销码有效期30天
 * - 核销码只返回一次，系统不存储明文
 * - 系统存储SHA-256哈希用于验证
 *
 * 请求参数：
 * @param {number} item_instance_id - 物品实例ID
 *
 * 返回数据：
 * @returns {Object} order - 订单对象
 * @returns {string} code - 核销码明文（格式：XXXX-YYYY-ZZZZ，仅返回一次）
 * @returns {string} expires_at - 过期时间（北京时间）
 * @returns {string} order_id - 订单ID（UUID）
 *
 * 错误场景：
 * - 物品实例不存在 → 404
 * - 物品不可用（已使用/已锁定等） → 409
 * - 核销码生成失败（碰撞重试失败） → 500
 */
router.post('/orders', authenticateToken, async (req, res) => {
  try {
    const { item_instance_id } = req.body
    const userId = req.user.user_id

    // 参数验证
    if (!item_instance_id || !Number.isInteger(item_instance_id) || item_instance_id <= 0) {
      return res.apiError('item_instance_id必须是正整数', 'BAD_REQUEST', null, 400)
    }

    logger.info('开始生成核销订单', {
      item_instance_id,
      user_id: userId
    })

    // 🔐 关键安全校验：所有权或管理员权限检查（防越权）
    const { ItemInstance } = req.app.locals.models
    const item = await ItemInstance.findByPk(item_instance_id)

    if (!item) {
      logger.error('物品实例不存在', { item_instance_id })
      return res.apiError('物品实例不存在', 'NOT_FOUND', null, 404)
    }

    // 检查物品所有权
    if (item.owner_user_id !== userId) {
      // 如果不是所有者，检查是否为管理员
      const { getUserRoles } = require('../../../middleware/auth')
      const userRoles = await getUserRoles(userId)

      if (!userRoles.isAdmin) {
        logger.warn('非所有者且非管理员尝试生成核销码（防越权）', {
          user_id: userId,
          item_instance_id,
          actual_owner: item.owner_user_id
        })
        return res.apiError('无权操作该物品，仅所有者或管理员可生成核销码', 'FORBIDDEN', null, 403)
      }

      logger.info('管理员生成核销码', {
        admin_user_id: userId,
        item_instance_id,
        actual_owner: item.owner_user_id
      })
    }

    // 调用RedemptionOrderService生成订单（传入创建者ID用于服务层兜底）
    const RedemptionOrderService = req.app.locals.services.getService('redemptionOrder')
    const result = await RedemptionOrderService.createOrder(item_instance_id, {
      creator_user_id: userId // 传入创建者ID，供服务层兜底校验
    })

    logger.info('核销订单生成成功', {
      order_id: result.order.order_id,
      item_instance_id,
      expires_at: result.order.expires_at
    })

    return res.apiSuccess(
      {
        order: {
          order_id: result.order.order_id,
          item_instance_id: result.order.item_instance_id,
          status: result.order.status,
          expires_at: result.order.expires_at,
          created_at: result.order.created_at
        },
        code: result.code // ⚠️ 明文码只返回一次，请用户妥善保存
      },
      '核销码生成成功（请妥善保存，仅显示一次）'
    )
  } catch (error) {
    logger.error('核销订单生成失败', {
      error: error.message,
      item_instance_id: req.body.item_instance_id,
      user_id: req.user?.user_id
    })

    // 业务错误处理
    if (error.message.includes('物品实例不存在')) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    }

    if (error.message.includes('不可用')) {
      return res.apiError(error.message, 'CONFLICT', null, 409)
    }

    return handleServiceError(error, res, '核销订单生成失败')
  }
})

/**
 * 核销订单（Fulfill Redemption Order）
 * POST /api/v4/redemption/fulfill
 *
 * 业务场景：
 * - 商家/管理员核销用户的12位核销码
 * - 验证核销码有效性（格式、状态、过期时间）
 * - 标记订单为已核销（status = fulfilled）
 * - 标记物品为已使用（ItemInstance.status = used）
 *
 * 请求参数：
 * @param {string} code - 12位Base32核销码（格式：XXXX-YYYY-ZZZZ）
 *
 * 权限要求：
 * - 商户（role_level >= 50）或管理员
 *
 * 返回数据：
 * @returns {Object} order - 订单对象
 * @returns {string} order_id - 订单ID
 * @returns {string} status - 订单状态（fulfilled）
 * @returns {string} fulfilled_at - 核销时间（北京时间）
 * @returns {number} redeemer_user_id - 核销人ID
 * @returns {Object} item_instance - 物品实例信息
 *
 * 错误场景：
 * - 核销码格式错误 → 400
 * - 核销码不存在 → 404
 * - 核销码已使用 → 409
 * - 核销码已过期 → 410
 * - 权限不足 → 403
 */
router.post('/fulfill', authenticateToken, async (req, res) => {
  try {
    const { code } = req.body
    const redeemerUserId = req.user.user_id

    // 参数验证
    if (!code || typeof code !== 'string') {
      return res.apiError('核销码不能为空', 'BAD_REQUEST', null, 400)
    }

    // 权限验证（只允许商户或管理员核销）
    const { getUserRoles } = require('../../../middleware/auth')
    const userRoles = await getUserRoles(redeemerUserId)

    if (userRoles.role_level < 50) {
      logger.warn('权限不足：非商户或管理员尝试核销', {
        user_id: redeemerUserId,
        role_level: userRoles.role_level
      })
      return res.apiError('权限不足，只有商户或管理员可以核销', 'FORBIDDEN', null, 403)
    }

    logger.info('开始核销订单', {
      code_partial: code.slice(0, 4) + '****',
      redeemer_user_id: redeemerUserId
    })

    // 调用RedemptionOrderService核销订单
    const RedemptionOrderService = req.app.locals.services.getService('redemptionOrder')
    const order = await RedemptionOrderService.fulfillOrder(
      code.trim().toUpperCase(),
      redeemerUserId
    )

    // 异步发送通知（不阻塞响应）
    const NotificationService = req.app.locals.services.getService('notification')
    if (order.item_instance && order.item_instance.owner_user_id) {
      NotificationService.send(order.item_instance.owner_user_id, {
        type: 'redemption_success',
        title: '核销通知',
        content: '您的商品已核销成功',
        data: {
          order_id: order.order_id,
          item_instance_id: order.item_instance_id,
          fulfilled_at: order.fulfilled_at
        }
      }).catch(error => {
        logger.warn('核销通知发送失败（不影响核销结果）', {
          error: error.message,
          user_id: order.item_instance.owner_user_id
        })
      })
    }

    logger.info('核销成功', {
      order_id: order.order_id,
      redeemer_user_id: redeemerUserId
    })

    return res.apiSuccess(
      {
        order: {
          order_id: order.order_id,
          item_instance_id: order.item_instance_id,
          status: order.status,
          fulfilled_at: order.fulfilled_at,
          redeemer_user_id: order.redeemer_user_id
        },
        item_instance: order.item_instance
          ? {
              item_instance_id: order.item_instance.item_instance_id,
              item_type: order.item_instance.item_type,
              item_name: order.item_instance.item_name,
              status: order.item_instance.status
            }
          : null,
        redeemer: {
          user_id: redeemerUserId,
          nickname: req.user.nickname || userRoles.roleName || '商户'
        }
      },
      '核销成功'
    )
  } catch (error) {
    logger.error('核销失败', {
      error: error.message,
      code_partial: req.body.code ? req.body.code.slice(0, 4) + '****' : 'N/A',
      redeemer_user_id: req.user?.user_id
    })

    // 业务错误处理
    if (error.message.includes('格式错误')) {
      return res.apiError(error.message, 'BAD_REQUEST', null, 400)
    }

    if (error.message.includes('不存在')) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    }

    if (error.message.includes('已被使用') || error.message.includes('已取消')) {
      return res.apiError(error.message, 'CONFLICT', null, 409)
    }

    if (error.message.includes('已过期') || error.message.includes('超过有效期')) {
      return res.apiError(error.message, 'GONE', null, 410)
    }

    return handleServiceError(error, res, '核销失败')
  }
})

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
 * 取消订单（Cancel Redemption Order）
 * POST /api/v4/redemption/orders/:order_id/cancel
 *
 * 业务场景：
 * - 取消未核销的订单
 * - 只能取消状态为pending的订单
 *
 * 路径参数：
 * @param {string} order_id - 订单ID（UUID）
 *
 * 返回数据：
 * @returns {Object} order - 取消后的订单对象
 */
router.post('/orders/:order_id/cancel', authenticateToken, async (req, res) => {
  try {
    const { order_id } = req.params

    logger.info('取消订单', {
      order_id,
      user_id: req.user.user_id
    })

    const RedemptionOrderService = req.app.locals.services.getService('redemptionOrder')
    const order = await RedemptionOrderService.cancelOrder(order_id)

    return res.apiSuccess(
      {
        order_id: order.order_id,
        status: order.status,
        updated_at: order.updated_at
      },
      '订单取消成功'
    )
  } catch (error) {
    logger.error('取消订单失败', {
      error: error.message,
      order_id: req.params.order_id
    })

    if (error.message.includes('不存在')) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    }

    if (error.message.includes('已核销')) {
      return res.apiError(error.message, 'CONFLICT', null, 409)
    }

    return handleServiceError(error, res, '取消订单失败')
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
