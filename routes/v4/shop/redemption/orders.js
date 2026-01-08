/**
 * 餐厅积分抽奖系统 V4.2 - 核销订单管理API
 * 处理核销订单的生成和取消功能
 *
 * 功能说明：
 * - 生成12位Base32核销码
 * - 取消未核销的订单
 *
 * 创建时间：2025年12月22日
 * 使用 Claude Sonnet 4.5 模型
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger
const TransactionManager = require('../../../../utils/TransactionManager')

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
 * @body {number} item_instance_id - 物品实例ID
 *
 * 返回数据：
 * @returns {Object} order - 订单对象
 * @returns {string} code - 核销码明文（格式：XXXX-YYYY-ZZZZ，仅返回一次）
 * @returns {string} expires_at - 过期时间（北京时间）
 * @returns {string} order_id - 订单ID（UUID）
 *
 * 错误场景：
 * - 物品实例不存在 → 404 NOT_FOUND
 * - 物品不可用（已使用/已锁定等） → 409 CONFLICT
 * - 核销码生成失败（碰撞重试失败） → 500 INTERNAL_ERROR
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

    /**
     * 调用 RedemptionService 生成订单
     * - 传入 creator_user_id 用于服务层权限校验（所有权/管理员判定）
     * - 使用 TransactionManager 统一事务边界（符合治理决策）
     * - 路由层不直接操作 models，所有验证逻辑收口到 Service 层
     */
    const RedemptionService = req.app.locals.services.getService('redemptionOrder')
    const result = await TransactionManager.execute(async transaction => {
      return await RedemptionService.createOrder(item_instance_id, {
        creator_user_id: userId, // 传入创建者ID，供服务层权限校验
        transaction
      })
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

    // 业务错误处理（服务层返回的业务错误）
    if (error.message.includes('物品实例不存在')) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    }

    if (error.message.includes('权限不足')) {
      return res.apiError(error.message, 'FORBIDDEN', null, 403)
    }

    if (error.message.includes('不可用') || error.message.includes('已有待核销订单')) {
      return res.apiError(error.message, 'CONFLICT', null, 409)
    }

    return handleServiceError(error, res, '核销订单生成失败')
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
 *
 * 错误场景：
 * - 订单不存在 → 404 NOT_FOUND
 * - 订单已核销 → 409 CONFLICT
 */
router.post('/orders/:order_id/cancel', authenticateToken, async (req, res) => {
  try {
    const { order_id } = req.params

    logger.info('取消订单', {
      order_id,
      user_id: req.user.user_id
    })

    // 使用 TransactionManager 统一事务边界（符合治理决策）
    const RedemptionService = req.app.locals.services.getService('redemptionOrder')
    const order = await TransactionManager.execute(async transaction => {
      return await RedemptionService.cancelOrder(order_id, { transaction })
    })

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

module.exports = router
