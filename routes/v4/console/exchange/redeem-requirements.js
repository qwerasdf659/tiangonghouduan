/**
 * 兑换复合门槛配置管理路由 - 管理后台（模块C 第5步）
 *
 * 路径：/api/v4/console/exchange/redeem-requirements
 *
 * 职责（路线B 合规改造 第七节 / 模块C）：
 * - 查看某兑换商品的复合门槛配置（exchange_redeem_requirement）
 * - 创建/更新/删除门槛（VIP等级 + 多资产 + 消耗道具）
 *
 * 🔴 合规红线（保存时由 Service 校验）：
 * - 目标为实物/券时，extra_cost_assets 禁含 star_stone（仅水晶系），由 AssetProductGuard 拦截
 *
 * 架构规范：
 * - 通过 ServiceManager 获取 exchange_core 服务
 * - 写操作通过 TransactionManager.execute() 管理事务边界
 * - 统一使用 res.apiSuccess / res.apiError，管理员权限 role_level >= 100
 *
 * @module routes/v4/console/exchange/redeem-requirements
 * @created 2026-06-08（路线B 合规改造 模块C 闭环）
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const { asyncHandler } = require('../../../../middleware/validation')
const TransactionManager = require('../../../../utils/TransactionManager')
const logger = require('../../../../utils/logger').logger

/**
 * 获取 exchange_core 服务
 * @param {Object} req - Express 请求对象
 * @returns {Object} CoreService 实例
 */
const getCoreService = req => req.app.locals.services.getService('exchange_core')

/**
 * GET /:exchange_item_id - 列出某商品的门槛配置
 * @access Admin
 */
router.get(
  '/:exchange_item_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const exchange_item_id = parseInt(req.params.exchange_item_id, 10)
    if (!Number.isInteger(exchange_item_id) || exchange_item_id <= 0) {
      return res.apiError('无效的商品ID', 'BAD_REQUEST', null, 400)
    }
    const requirements = await getCoreService(req).listRedeemRequirements(exchange_item_id)
    return res.apiSuccess({ requirements }, '获取门槛配置成功')
  })
)

/**
 * POST / - 创建/更新门槛配置（带 exchange_redeem_requirement_id 为更新）
 * @access Admin
 */
router.post(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const result = await TransactionManager.execute(
      async transaction => {
        return getCoreService(req).saveRedeemRequirement(req.body, { transaction })
      },
      { description: 'saveRedeemRequirement' }
    )
    logger.info('[Console门槛] 保存门槛配置', { admin_id: req.user?.user_id })
    return res.apiSuccess(result, '门槛配置保存成功')
  })
)

/**
 * DELETE /:exchange_redeem_requirement_id - 删除门槛配置
 * @access Admin
 */
router.delete(
  '/:exchange_redeem_requirement_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.exchange_redeem_requirement_id, 10)
    if (!Number.isInteger(id) || id <= 0) {
      return res.apiError('无效的门槛配置ID', 'BAD_REQUEST', null, 400)
    }
    const result = await TransactionManager.execute(
      async transaction => {
        return getCoreService(req).deleteRedeemRequirement(id, { transaction })
      },
      { description: 'deleteRedeemRequirement' }
    )
    logger.info('[Console门槛] 删除门槛配置', { admin_id: req.user?.user_id, id })
    return res.apiSuccess(result, '门槛配置删除成功')
  })
)

module.exports = router
