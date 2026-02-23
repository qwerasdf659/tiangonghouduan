/**
 * 交易市场模块 - C2C担保码确认
 *
 * @route /api/v4/market
 * @description 买方通过担保码确认收货，完成实物交易
 *
 * API列表：
 * - POST /trade-orders/:trade_order_id/confirm-delivery - 买方确认收货（输入担保码）
 * - GET /trade-orders/:trade_order_id/escrow-status - 查询担保码状态
 * - POST /trade-orders/:trade_order_id/cancel - 取消交易（买方/超时取消）
 *
 * 业务场景（决策5/Phase 4）：
 * - 仅用于 listing_kind = 'item' 的实物交易
 * - 买方付款后资产冻结，系统生成担保码发给卖方
 * - 卖方当面交付物品后将码告知买方
 * - 买方输入码确认 → 冻结资产转给卖方 → 交易完成
 *
 * 创建时间：2026-02-21
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const { validatePositiveInteger, handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger
const TransactionManager = require('../../../utils/TransactionManager')

/**
 * @route POST /api/v4/market/trade-orders/:trade_order_id/confirm-delivery
 * @desc 买方确认收货（输入担保码完成交易）
 * @access Private (需要登录，必须是买方)
 *
 * @param {number} trade_order_id - 交易订单ID
 * @body {string} escrow_code - 6位担保码
 */
router.post(
  '/trade-orders/:trade_order_id/confirm-delivery',
  authenticateToken,
  validatePositiveInteger('trade_order_id', 'params'),
  async (req, res) => {
    try {
      const EscrowCodeService = req.app.locals.services.getService('escrow_code')
      const TradeOrderService = req.app.locals.services.getService('trade_order')

      const trade_order_id = req.validated.trade_order_id
      const buyer_id = req.user.user_id
      const { escrow_code } = req.body

      if (!escrow_code || typeof escrow_code !== 'string' || escrow_code.length !== 6) {
        return res.apiError('请输入6位担保码', 'INVALID_ESCROW_CODE', null, 400)
      }

      logger.info('买方确认收货', { trade_order_id, buyer_id })

      // 验证担保码
      const verifyResult = await EscrowCodeService.verifyEscrowCode(
        trade_order_id,
        escrow_code.trim(),
        buyer_id
      )

      if (!verifyResult.valid) {
        return res.apiError(verifyResult.error, 'ESCROW_VERIFY_FAILED', null, 400)
      }

      // 担保码验证通过，完成交易
      const completeResult = await TransactionManager.execute(async transaction => {
        return await TradeOrderService.completeOrder({ trade_order_id, buyer_id }, { transaction })
      })

      logger.info('担保码验证通过，交易完成', {
        trade_order_id,
        buyer_id,
        fee_amount: completeResult.fee_amount
      })

      return res.apiSuccess(
        {
          trade_order_id,
          status: 'completed',
          fee_amount: completeResult.fee_amount || 0,
          net_amount: completeResult.net_amount || 0
        },
        '确认收货成功，交易已完成'
      )
    } catch (error) {
      logger.error('确认收货失败', {
        error: error.message,
        trade_order_id: req.params.trade_order_id,
        buyer_id: req.user?.user_id
      })
      return handleServiceError(error, res, '确认收货失败')
    }
  }
)

/**
 * @route GET /api/v4/market/trade-orders/:trade_order_id/escrow-status
 * @desc 查询担保码状态（不返回明文码）
 * @access Private (买方/卖方/管理员)
 *
 * @param {number} trade_order_id - 交易订单ID
 */
router.get(
  '/trade-orders/:trade_order_id/escrow-status',
  authenticateToken,
  validatePositiveInteger('trade_order_id', 'params'),
  async (req, res) => {
    try {
      const EscrowCodeService = req.app.locals.services.getService('escrow_code')
      const trade_order_id = req.validated.trade_order_id

      const status = await EscrowCodeService.getEscrowStatus(trade_order_id)

      if (!status) {
        return res.apiError('该交易无担保码或已过期', 'ESCROW_NOT_FOUND', null, 404)
      }

      return res.apiSuccess(status, '查询担保码状态成功')
    } catch (error) {
      logger.error('查询担保码状态失败', {
        error: error.message,
        trade_order_id: req.params.trade_order_id
      })
      return handleServiceError(error, res, '查询担保码状态失败')
    }
  }
)

/**
 * @route POST /api/v4/market/trade-orders/:trade_order_id/cancel
 * @desc 取消交易（买方主动取消或系统超时取消）
 * @access Private (买方/管理员)
 *
 * @param {number} trade_order_id - 交易订单ID
 * @body {string} cancel_reason - 取消原因（可选）
 */
router.post(
  '/trade-orders/:trade_order_id/cancel',
  authenticateToken,
  validatePositiveInteger('trade_order_id', 'params'),
  async (req, res) => {
    try {
      const TradeOrderService = req.app.locals.services.getService('trade_order')
      const EscrowCodeService = req.app.locals.services.getService('escrow_code')

      const trade_order_id = req.validated.trade_order_id
      const { cancel_reason } = req.body

      logger.info('取消交易订单', { trade_order_id, user_id: req.user.user_id })

      await TransactionManager.execute(async transaction => {
        return await TradeOrderService.cancelOrder(
          { trade_order_id, cancel_reason },
          { transaction }
        )
      })

      // 清理担保码
      await EscrowCodeService.cancelEscrowCode(trade_order_id).catch(err => {
        logger.warn('清理担保码失败（非致命）', { error: err.message })
      })

      return res.apiSuccess({ trade_order_id, status: 'cancelled' }, '交易已取消')
    } catch (error) {
      logger.error('取消交易失败', {
        error: error.message,
        trade_order_id: req.params.trade_order_id
      })
      return handleServiceError(error, res, '取消交易失败')
    }
  }
)

module.exports = router
