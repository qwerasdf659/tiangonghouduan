/**
 * @file 用户高级空间状态查询路由 - P2表只读查询API
 * @description 提供用户高级空间状态的只读查询接口
 *
 * 覆盖P2优先级表：
 * - user_premium_status: 用户高级空间状态表
 *
 * 架构原则：
 * - 路由层不直连 models（所有数据库操作通过 Service 层）
 * - 所有接口均为 GET 方法（只读查询）
 * - 严格遵循项目 snake_case 命名规范
 * - 使用 res.apiSuccess/res.apiError 统一响应格式
 *
 * 服务合并记录：
 * - 原使用 UserPremiumQueryService，现已合并到 PremiumService
 * - 通过 ServiceManager 获取 'premium' 服务调用查询方法
 *
 * @version 1.1.0
 * @date 2026-01-21
 */

'use strict'

const { asyncHandler } = require('../../../../middleware/validation')
const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const TransactionManager = require('../../../../utils/TransactionManager')
const logger = require('../../../../utils/logger').logger

/**
 * 获取 PremiumService 的辅助函数
 * 服务合并后，高级空间相关的查询方法已合并到 PremiumService
 *
 * @param {Object} req - Express 请求对象
 * @returns {Object} PremiumService 类（静态方法调用）
 */
function getPremiumService(req) {
  return req.app.locals.services.getService('premium')
}

/**
 * GET / - 查询用户高级空间状态列表
 *
 * Query参数：
 * - user_id: 用户ID（可选）
 * - is_unlocked: 是否已解锁（true/false，可选）
 * - unlock_method: 解锁方式（points/exchange/vip/manual，可选）
 * - is_valid: 是否在有效期内（true/false，可选）
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 *
 * 返回：用户高级空间状态列表和分页信息
 */
router.get(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const { user_id, is_unlocked, unlock_method, is_valid, page = 1, page_size = 20 } = req.query

    const result = await getPremiumService(req).getPremiumStatuses({
      user_id: user_id ? parseInt(user_id) : undefined,
      is_unlocked: is_unlocked !== undefined ? is_unlocked === 'true' : undefined,
      unlock_method,
      is_valid: is_valid !== undefined ? is_valid === 'true' : undefined,
      page: parseInt(page),
      page_size: parseInt(page_size)
    })

    logger.info('查询用户高级空间状态列表', {
      admin_id: req.user.user_id,
      filters: { user_id, is_unlocked, unlock_method, is_valid },
      total: result.pagination.total
    })

    return res.apiSuccess(result, '查询用户高级空间状态成功')
  })
)

/**
 * GET /stats - 获取高级空间状态统计汇总
 *
 * 返回：统计汇总数据
 */
router.get(
  '/stats',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const stats = await getPremiumService(req).getPremiumStats()

    logger.info('获取高级空间状态统计', {
      admin_id: req.user.user_id
    })

    return res.apiSuccess(stats, '获取高级空间状态统计成功')
  })
)

/**
 * GET /expiring - 获取即将过期的用户列表
 *
 * Query参数：
 * - hours: 在多少小时内即将过期（默认24小时）
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 *
 * 返回：即将过期用户列表和分页信息
 */
router.get(
  '/expiring',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const { hours = 24, page = 1, page_size = 20 } = req.query

    const result = await getPremiumService(req).getExpiringUsers(
      parseInt(hours),
      parseInt(page),
      parseInt(page_size)
    )

    logger.info('获取即将过期用户列表', {
      admin_id: req.user.user_id,
      hours,
      total: result.pagination.total
    })

    return res.apiSuccess(result, '获取即将过期用户列表成功')
  })
)

/**
 * POST /:user_id/extend - 管理员手动延长用户高级空间有效期
 *
 * 路径参数：user_id（用户ID）
 * Body：{ days: number }（延长天数，1~3650）
 *
 * 说明：不扣积分、unlock_method 标记为 'manual'；已有有效期则叠加，否则从当前起算。
 * 返回：延期结果（含新的 expires_at）
 */
router.post(
  '/:user_id/extend',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const user_id = parseInt(req.params.user_id)
    if (isNaN(user_id)) {
      return res.apiError('无效的用户ID', 'INVALID_USER_ID', null, 400)
    }
    const days = req.body?.days

    try {
      const result = await TransactionManager.execute(
        async transaction =>
          getPremiumService(req).extendPremium(user_id, days, req.user.user_id, { transaction }),
        { description: 'extendPremium' }
      )

      // 危险/运营操作留痕
      const AuditLogService = req.app.locals.services.getService('audit_log')
      await AuditLogService.logOperation({
        operator_id: req.user.user_id,
        operation_type: 'premium_extend',
        target_type: 'user_premium_status',
        target_id: user_id,
        action: 'extend',
        reason: `管理员手动延长高级空间 ${result.extended_days} 天`,
        after_data: { expires_at: result.expires_at, extended_days: result.extended_days },
        idempotency_key: `premium_extend:${user_id}:${req.user.user_id}:${Date.now()}`,
        ip_address: req.ip,
        user_agent: req.get('user-agent')
      }).catch(() => {})

      logger.info('管理员延长用户高级空间', {
        admin_id: req.user.user_id,
        user_id,
        days: result.extended_days
      })

      return res.apiSuccess(result, '高级空间已延长')
    } catch (error) {
      if (error.code && error.statusCode) {
        return res.apiError(error.message, error.code, null, error.statusCode)
      }
      throw error
    }
  })
)

/**
 * POST /:user_id/revoke - 管理员撤销用户高级空间（立即失效，不退积分）
 *
 * 路径参数：user_id（用户ID）
 * 返回：撤销结果
 */
router.post(
  '/:user_id/revoke',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const user_id = parseInt(req.params.user_id)
    if (isNaN(user_id)) {
      return res.apiError('无效的用户ID', 'INVALID_USER_ID', null, 400)
    }

    try {
      const result = await TransactionManager.execute(
        async transaction =>
          getPremiumService(req).revokePremium(user_id, req.user.user_id, { transaction }),
        { description: 'revokePremium' }
      )

      const AuditLogService = req.app.locals.services.getService('audit_log')
      await AuditLogService.logOperation({
        operator_id: req.user.user_id,
        operation_type: 'premium_revoke',
        target_type: 'user_premium_status',
        target_id: user_id,
        action: 'revoke',
        reason: '管理员撤销用户高级空间',
        idempotency_key: `premium_revoke:${user_id}:${req.user.user_id}:${Date.now()}`,
        ip_address: req.ip,
        user_agent: req.get('user-agent')
      }).catch(() => {})

      logger.info('管理员撤销用户高级空间', { admin_id: req.user.user_id, user_id })

      return res.apiSuccess(result, '高级空间已撤销')
    } catch (error) {
      if (error.code && error.statusCode) {
        return res.apiError(error.message, error.code, null, error.statusCode)
      }
      throw error
    }
  })
)

/**
 * GET /:user_id - 获取单个用户的高级空间状态
 *
 * 路径参数：
 * - user_id: 用户ID
 *
 * 返回：用户高级空间状态详情（无记录时返回默认状态，不返回404）
 */
router.get(
  '/:user_id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const user_id = parseInt(req.params.user_id)

    const status = await getPremiumService(req).getUserPremiumStatusDetail(user_id)

    // 用户没有高级空间记录是正常状态，返回默认值而不是404
    if (!status) {
      return res.apiSuccess(
        {
          user_id,
          is_unlocked: false,
          unlock_method: null,
          expire_time: null,
          message: '用户尚未解锁高级空间'
        },
        '获取用户高级空间状态成功'
      )
    }

    return res.apiSuccess(status, '获取用户高级空间状态成功')
  })
)

module.exports = router
