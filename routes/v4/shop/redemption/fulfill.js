/**
 * 餐厅积分抽奖系统 V4.2 - 核销执行API
 * 处理核销码的验证和核销功能
 *
 * 功能说明：
 * - 商家/管理员核销用户的12位核销码
 * - 验证核销码有效性（格式、状态、过期时间）
 * - 标记订单为已核销
 *
 * 创建时间：2025年12月22日
 * 使用 Claude Sonnet 4.5 模型
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger

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
 * 规范遵循：
 * - API设计与契约标准规范 v2.0（2025-12-23）
 * - 参数命名规范：禁止语义不清的裸 code，使用 redeem_code 替代
 *
 * 请求参数：
 * @body {string} redeem_code - 12位Base32核销码（格式：XXXX-YYYY-ZZZZ）
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
 * - 核销码格式错误 → 400 BAD_REQUEST
 * - 核销码不存在 → 404 NOT_FOUND
 * - 核销码已使用 → 409 CONFLICT
 * - 核销码已过期 → 400 EXPIRED
 * - 权限不足 → 403 FORBIDDEN
 */
router.post('/fulfill', authenticateToken, async (req, res) => {
  try {
    const { redeem_code } = req.body
    const redeemerUserId = req.user.user_id

    // 参数验证（使用语义明确的 redeem_code 参数名）
    if (!redeem_code || typeof redeem_code !== 'string') {
      return res.apiError('核销码不能为空', 'REDEEM_CODE_REQUIRED', null, 400)
    }

    // 权限验证（只允许商户或管理员核销）
    const { getUserRoles } = require('../../../../middleware/auth')
    const userRoles = await getUserRoles(redeemerUserId)

    if (userRoles.role_level < 50) {
      logger.warn('权限不足：非商户或管理员尝试核销', {
        user_id: redeemerUserId,
        role_level: userRoles.role_level
      })
      return res.apiError('权限不足，只有商户或管理员可以核销', 'FORBIDDEN', null, 403)
    }

    logger.info('开始核销订单', {
      redeem_code_partial: redeem_code.slice(0, 4) + '****',
      redeemer_user_id: redeemerUserId
    })

    // 调用RedemptionService核销订单
    const RedemptionService = req.app.locals.services.getService('redemptionOrder')
    const order = await RedemptionService.fulfillOrder(
      redeem_code.trim().toUpperCase(),
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
      redeem_code_partial: req.body.redeem_code ? req.body.redeem_code.slice(0, 4) + '****' : 'N/A',
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
      return res.apiError(error.message, 'EXPIRED', null, 400)
    }

    return handleServiceError(error, res, '核销失败')
  }
})

module.exports = router
