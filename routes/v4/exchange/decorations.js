/**
 * 用户域 星石虚拟装饰路由（模块D）
 *
 * 路径：/api/v4/exchange/decorations
 *
 * 职责（路线B 合规改造 第十节）：
 * - 用户浏览装饰商城（在售装饰）
 * - 用户用星石明码标价购买装饰（向下销毁；🔴 严禁抽装饰/开箱，无随机入口）
 * - 用户查看自己拥有的装饰、佩戴/卸下（纯 UI 展示，不进任何业务计算）
 *
 * 架构规范：
 * - 通过 ServiceManager 获取 DecorationService（key: 'decoration'）
 * - 写操作通过 TransactionManager.execute() 管理事务边界
 * - 统一使用 res.apiSuccess / res.apiError
 *
 * @module routes/v4/exchange/decorations
 * @created 2026-06-08（路线B 合规改造 模块D）
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, optionalAuth } = require('../../../middleware/auth')
const { handleServiceError, asyncHandler } = require('../../../middleware/validation')
const TransactionManager = require('../../../utils/TransactionManager')
const logger = require('../../../utils/logger').logger

/**
 * GET /api/v4/exchange/decorations
 * @description 获取在售装饰商城列表
 * @access Public（optionalAuth）
 * @returns {Object} { decorations }
 */
router.get(
  '/',
  optionalAuth,
  asyncHandler(async (req, res) => {
    const DecorationService = req.app.locals.services.getService('decoration')
    const decorations = await DecorationService.listOnSaleDecorations()
    return res.apiSuccess({ decorations }, '获取装饰商城成功')
  })
)

/**
 * GET /api/v4/exchange/decorations/mine
 * @description 获取当前用户拥有的装饰
 * @access Private
 * @returns {Object} { decorations }
 */
router.get(
  '/mine',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const DecorationService = req.app.locals.services.getService('decoration')
    const decorations = await DecorationService.listUserDecorations(req.user.user_id)
    return res.apiSuccess({ decorations }, '获取我的装饰成功')
  })
)

/**
 * POST /api/v4/exchange/decorations/purchase
 * @description 购买装饰（星石明码标价直购；严禁抽取/开箱）
 * @access Private
 * @header {string} Idempotency-Key - 幂等键（必填）
 * @body {number} decoration_sku_id - 装饰SKU ID（必填）
 * @returns {Object} 购买结果
 */
router.post(
  '/purchase',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const idempotency_key = req.headers['idempotency-key']
    if (!idempotency_key) {
      return res.apiError(
        '缺少必需的幂等键：请在 Header 中提供 Idempotency-Key',
        'MISSING_IDEMPOTENCY_KEY',
        { required_header: 'Idempotency-Key' },
        400
      )
    }

    const { decoration_sku_id } = req.body
    const skuId = parseInt(decoration_sku_id, 10)
    if (isNaN(skuId) || skuId <= 0) {
      return res.apiError('无效的装饰SKU ID', 'BAD_REQUEST', null, 400)
    }

    const user_id = req.user.user_id
    logger.info('[装饰] 购买请求', { user_id, decoration_sku_id: skuId, idempotency_key })

    try {
      const DecorationService = req.app.locals.services.getService('decoration')
      const result = await TransactionManager.execute(async transaction => {
        return DecorationService.purchaseDecoration(user_id, skuId, {
          idempotency_key,
          transaction
        })
      })
      return res.apiSuccess(result, '装饰购买成功')
    } catch (error) {
      if (error.code && error.statusCode) {
        return res.apiError(error.message, error.code, error.data || null, error.statusCode)
      }
      logger.error('[装饰] 购买失败', { user_id, error: error.message })
      return handleServiceError(error, res, '装饰购买失败')
    }
  })
)

/**
 * POST /api/v4/exchange/decorations/:user_owned_decoration_id/equip
 * @description 佩戴/卸下装饰（仅影响 UI 展示）
 * @access Private
 * @body {boolean} equipped - true=佩戴 false=卸下
 * @returns {Object} 操作结果
 */
router.post(
  '/:user_owned_decoration_id/equip',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const ownedId = parseInt(req.params.user_owned_decoration_id, 10)
    if (isNaN(ownedId) || ownedId <= 0) {
      return res.apiError('无效的装饰ID', 'BAD_REQUEST', null, 400)
    }
    const equipped = req.body.equipped === true || req.body.equipped === 'true'
    const user_id = req.user.user_id

    try {
      const DecorationService = req.app.locals.services.getService('decoration')
      const result = await TransactionManager.execute(async transaction => {
        return DecorationService.setEquipped(user_id, ownedId, equipped, { transaction })
      })
      return res.apiSuccess(result, equipped ? '佩戴成功' : '卸下成功')
    } catch (error) {
      if (error.code && error.statusCode) {
        return res.apiError(error.message, error.code, error.data || null, error.statusCode)
      }
      logger.error('[装饰] 佩戴操作失败', { user_id, error: error.message })
      return handleServiceError(error, res, '佩戴操作失败')
    }
  })
)

module.exports = router
