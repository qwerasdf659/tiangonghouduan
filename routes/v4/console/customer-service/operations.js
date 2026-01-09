/**
 * 客服管理 - 会话操作模块
 *
 * 业务范围：
 * - 转接会话
 * - 关闭会话
 *
 * 架构规范：
 * - 路由层不直连 models（通过 Service 层）
 * - 通过 ServiceManager 统一获取服务实例
 * - 写操作使用 TransactionManager.execute 包裹事务
 *
 * 创建时间：2025-12-22
 * 最后更新：2026-01-09（事务边界修复）
 */

const express = require('express')
const router = express.Router()
const logger = require('../../../../utils/logger').logger
const { authenticateToken, requireAdmin } = require('../../../../middleware/auth')
const TransactionManager = require('../../../../utils/TransactionManager')

// 所有路由都需要管理员权限
router.use(authenticateToken, requireAdmin)

/**
 * POST /:session_id/transfer - 转接会话
 *
 * @description 将会话转接给其他客服
 * @route POST /api/v4/console/customer-service/sessions/:session_id/transfer
 * @access Admin
 */
router.post('/:session_id/transfer', async (req, res) => {
  try {
    const session_id = parseInt(req.params.session_id)

    // 参数验证：防止NaN导致的SQL错误
    if (isNaN(session_id) || session_id <= 0) {
      return res.apiError('会话ID无效', 'BAD_REQUEST', null, 400)
    }

    const { target_admin_id } = req.body

    // 参数验证
    if (!target_admin_id) {
      return res.apiError('目标客服ID不能为空', 'BAD_REQUEST', null, 400)
    }

    const current_admin_id = req.user.user_id
    const target_id = parseInt(target_admin_id)

    if (current_admin_id === target_id) {
      return res.apiError('不能转接给自己', 'BAD_REQUEST', null, 400)
    }

    // 通过 ServiceManager 获取服务
    const CustomerServiceSessionService = req.app.locals.services.getService(
      'customer_service_session'
    )

    // 使用 TransactionManager.execute 包裹事务
    const result = await TransactionManager.execute(
      async transaction => {
        return await CustomerServiceSessionService.transferSession(
          session_id,
          current_admin_id,
          target_id,
          { transaction }
        )
      },
      { description: 'transferSession' }
    )

    return res.apiSuccess(result, '转接会话成功')
  } catch (error) {
    logger.error('转接会话失败:', error)
    let statusCode = 500
    let errorCode = 'INTERNAL_ERROR'

    if (error.message === '会话不存在' || error.message === '目标客服不存在') {
      statusCode = 404
      errorCode = 'NOT_FOUND'
    } else if (error.message === '无权限转接此会话') {
      statusCode = 403
      errorCode = 'FORBIDDEN'
    }

    return res.apiError(error.message, errorCode, null, statusCode)
  }
})

/**
 * POST /:session_id/close - 关闭会话
 *
 * @description 关闭客服会话
 * @route POST /api/v4/console/customer-service/sessions/:session_id/close
 * @access Admin
 */
router.post('/:session_id/close', async (req, res) => {
  try {
    const session_id = parseInt(req.params.session_id)

    // 参数验证：防止NaN导致的SQL错误
    if (isNaN(session_id) || session_id <= 0) {
      return res.apiError('会话ID无效', 'BAD_REQUEST', null, 400)
    }

    const { close_reason } = req.body

    const data = {
      admin_id: req.user.user_id,
      close_reason: close_reason || '问题已解决'
    }

    // 通过 ServiceManager 获取服务
    const CustomerServiceSessionService = req.app.locals.services.getService(
      'customer_service_session'
    )

    // 使用 TransactionManager.execute 包裹事务
    const result = await TransactionManager.execute(
      async transaction => {
        return await CustomerServiceSessionService.closeSession(session_id, data, { transaction })
      },
      { description: 'closeSession' }
    )

    return res.apiSuccess(result, '关闭会话成功')
  } catch (error) {
    logger.error('关闭会话失败:', error)
    let statusCode = 500
    let errorCode = 'INTERNAL_ERROR'

    if (error.message === '会话不存在') {
      statusCode = 404
      errorCode = 'NOT_FOUND'
    } else if (error.message === '无权限关闭此会话') {
      statusCode = 403
      errorCode = 'FORBIDDEN'
    }

    return res.apiError(error.message, errorCode, null, statusCode)
  }
})

module.exports = router
