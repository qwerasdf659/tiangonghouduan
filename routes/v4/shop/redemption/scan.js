/**
 * 天工商户营销平台 V4.2 - QR码扫码核销API
 *
 * 业务场景：商家扫描用户的动态QR码完成核销（决策7: QR码+文本码并存）
 * - 主流程：商家扫QR码 → 验证签名 → 核销
 * - 备用流程：手动输入文本码 → POST /fulfill
 *
 * QR码格式：RQRV1_{base64_payload}_{signature}
 * 有效期：5分钟，过期需用户刷新
 *
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireMerchantPermission } = require('../../../../middleware/auth')
const { asyncHandler } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger
const TransactionManager = require('../../../../utils/TransactionManager')

/**
 * 扫码核销（Scan QR Code to Fulfill）
 * POST /api/v4/shop/redemption/scan
 *
 * @body {string} qr_content - 扫描到的QR码原始内容（RQRV1_...格式）
 *
 * 权限要求：consumption:scan_user 权限码（merchant_staff/merchant_manager 角色具备；管理员 role_level>=100 自动放行）
 *   2026-06-24 统一口径：核销准入由「system_settings 角色等级阈值」改为「RBAC 权限码 consumption:scan_user」，
 *   与消费录入(consumption:create)、我的提交(consumption:read) 三个商家接口口径统一，运营在后台角色权限页可配。
 */
router.post(
  '/scan',
  authenticateToken,
  requireMerchantPermission('consumption:scan_user'),
  asyncHandler(async (req, res) => {
    const { qr_content } = req.body
    const redeemerUserId = req.user.user_id

    if (!qr_content || typeof qr_content !== 'string') {
      return res.apiError('QR码内容不能为空', 'QR_CONTENT_REQUIRED', null, 400)
    }

    // 验证QR码签名和有效期
    const { getRedemptionQRSigner } = require('../../../../utils/RedemptionQRSigner')
    const signer = getRedemptionQRSigner()
    const verifyResult = signer.verify(qr_content)

    if (!verifyResult.valid) {
      logger.warn('QR码验证失败', {
        error: verifyResult.error,
        user_id: redeemerUserId
      })
      return res.apiError(verifyResult.error, 'QR_INVALID', null, 400)
    }

    const { redemption_order_id, code_hash_prefix } = verifyResult.payload

    logger.info('QR码验证通过，开始核销', {
      redemption_order_id,
      code_hash_prefix,
      redeemer_user_id: redeemerUserId
    })

    // 通过 order_id 查找并核销（QR码内已包含订单ID，无需再输入核销码）
    const RedemptionService = req.app.locals.services.getService('redemption_order')
    const RedemptionAdminService = req.app.locals.services.getService('redemption_admin')
    const order = await TransactionManager.execute(async transaction => {
      const targetOrder = await RedemptionService.getOrderDetail(redemption_order_id, {
        transaction,
        lock: transaction.LOCK.UPDATE
      })

      if (targetOrder.code_hash && !targetOrder.code_hash.startsWith(code_hash_prefix)) {
        logger.error('QR码哈希前缀不匹配，可能被篡改', {
          expected_prefix: code_hash_prefix,
          actual_hash: targetOrder.code_hash?.substring(0, 8),
          redemption_order_id
        })
        throw new Error('QR码数据异常：哈希前缀不匹配')
      }

      return await RedemptionAdminService.adminFulfillOrderById(redemption_order_id, {
        transaction,
        admin_user_id: redeemerUserId
      })
    })

    // 异步通知物品所有者
    const NotificationService = req.app.locals.services.getService('notification')
    if (order.item && order.item.ownerAccount && order.item.ownerAccount.user_id) {
      NotificationService.send(order.item.ownerAccount.user_id, {
        type: 'redemption_success',
        title: '核销通知',
        content: '您的商品已核销成功',
        data: {
          redemption_order_id: order.redemption_order_id,
          item_id: order.item_id,
          fulfilled_at: order.fulfilled_at
        }
      }).catch(error => {
        logger.warn('核销通知发送失败（不影响核销结果）', {
          error: error.message,
          user_id: order.item.ownerAccount?.user_id
        })
      })
    }

    return res.apiSuccess(
      {
        order: {
          redemption_order_id: order.redemption_order_id,
          item_id: order.item_id,
          status: order.status,
          fulfilled_at: order.fulfilled_at,
          fulfilled_store_id: order.fulfilled_store_id,
          fulfilled_by_staff_id: order.fulfilled_by_staff_id
        },
        item: order.item
          ? {
              item_id: order.item.item_id,
              item_type: order.item.item_type,
              name: order.item.meta?.name || '未命名物品',
              status: order.item.status
            }
          : null,
        scan_method: 'qr_code'
      },
      '扫码核销成功'
    )
  })
)

module.exports = router
