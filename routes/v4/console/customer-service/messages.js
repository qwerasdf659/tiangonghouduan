/**
 * 客服管理 - 消息管理模块
 *
 * 业务范围：
 * - 获取会话消息
 * - 发送消息
 * - 标记消息已读
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
const businessConfig = require('../../../../config/business.config')
const TransactionManager = require('../../../../utils/TransactionManager')

// 所有路由都需要管理员权限
router.use(authenticateToken, requireAdmin)

/**
 * GET /:id/messages - 获取会话消息
 *
 * API路径参数设计规范 V2.2（2026-01-20）：
 * - 会话是事务实体，使用数字ID（:id）作为标识符
 *
 * @description 获取指定会话的消息历史
 * @route GET /api/v4/console/customer-service/sessions/:id/messages
 * @param {number} id - 会话ID（事务实体）
 * @access Admin
 */
router.get('/:id/messages', async (req, res) => {
  try {
    // 通过 ServiceManager 获取 AdminCustomerServiceService
    const AdminCustomerServiceService = req.app.locals.services.getService('admin_customer_service')

    const sessionId = parseInt(req.params.id)

    // 参数验证：防止NaN导致的SQL错误
    if (isNaN(sessionId) || sessionId <= 0) {
      return res.apiError('会话ID无效', 'BAD_REQUEST', null, 400)
    }

    const options = {
      limit: req.query.limit,
      before_message_id: req.query.before_message_id
    }

    // 调用服务层方法
    const result = await AdminCustomerServiceService.getSessionMessages(sessionId, options)

    return res.apiSuccess(result, '获取会话消息成功')
  } catch (error) {
    logger.error('获取会话消息失败:', error)
    const statusCode = error.message === '会话不存在' ? 404 : 500
    return res.apiError(
      error.message,
      error.message === '会话不存在' ? 'NOT_FOUND' : 'INTERNAL_ERROR',
      null,
      statusCode
    )
  }
})

/**
 * POST /:id/send - 发送消息
 *
 * API路径参数设计规范 V2.2（2026-01-20）：
 * - 会话是事务实体，使用数字ID（:id）作为标识符
 *
 * @description 管理员发送消息给用户
 * @route POST /api/v4/console/customer-service/sessions/:id/send
 * @param {number} id - 会话ID（事务实体）
 * @access Admin
 */
router.post('/:id/send', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id)

    // 参数验证：防止NaN导致的SQL错误
    if (isNaN(sessionId) || sessionId <= 0) {
      return res.apiError('会话ID无效', 'BAD_REQUEST', null, 400)
    }

    const { content, message_type } = req.body

    // 参数验证
    if (!content || content.trim() === '') {
      return res.apiError('消息内容不能为空', 'BAD_REQUEST', null, 400)
    }

    // 内容长度验证
    const { message: messageConfig } = businessConfig.chat
    if (content.length > messageConfig.max_length) {
      return res.apiError(
        `消息内容不能超过${messageConfig.max_length}字符（当前${content.length}字符）`,
        'BAD_REQUEST',
        null,
        400
      )
    }

    // 消息类型枚举验证
    const allowedTypes = ['text', 'image', 'system']
    if (message_type && !allowedTypes.includes(message_type)) {
      return res.apiError('消息类型无效（允许值：text/image/system）', 'BAD_REQUEST', null, 400)
    }

    const data = {
      admin_id: req.user.user_id,
      content: content.trim(),
      message_type: message_type || 'text',
      role_level: req.user.role_level
    }

    // 通过 ServiceManager 获取服务
    const CustomerServiceSessionService = req.app.locals.services.getService(
      'customer_service_session'
    )

    // 使用 TransactionManager.execute 包裹事务
    const result = await TransactionManager.execute(
      async transaction => {
        return await CustomerServiceSessionService.sendMessage(sessionId, data, { transaction })
      },
      { description: 'sendMessage' }
    )

    return res.apiSuccess(result, '发送消息成功')
  } catch (error) {
    logger.error('发送消息失败:', error)

    // 增强错误处理
    let statusCode = 500
    let errorCode = 'INTERNAL_ERROR'

    if (error.message === '会话不存在') {
      statusCode = 404
      errorCode = 'NOT_FOUND'
    } else if (error.message.includes('权限')) {
      statusCode = 403
      errorCode = 'FORBIDDEN'
    } else if (error.message.includes('敏感词')) {
      statusCode = 400
      errorCode = 'BAD_REQUEST'
    } else if (error.message.includes('频繁')) {
      statusCode = 429
      errorCode = 'TOO_MANY_REQUESTS'
    }

    return res.apiError(error.message, errorCode, null, statusCode)
  }
})

/**
 * POST /:id/mark-read - 标记消息已读
 *
 * API路径参数设计规范 V2.2（2026-01-20）：
 * - 会话是事务实体，使用数字ID（:id）作为标识符
 *
 * @description 标记会话中用户发送的消息为已读
 * @route POST /api/v4/console/customer-service/sessions/:id/mark-read
 * @param {number} id - 会话ID（事务实体）
 * @access Admin
 */
router.post('/:id/mark-read', async (req, res) => {
  try {
    const sessionId = parseInt(req.params.id)

    // 参数验证：防止NaN导致的SQL错误
    if (isNaN(sessionId) || sessionId <= 0) {
      return res.apiError('会话ID无效', 'BAD_REQUEST', null, 400)
    }

    const adminId = req.user.user_id

    // 通过 ServiceManager 获取 AdminCustomerServiceService
    const AdminCustomerServiceService = req.app.locals.services.getService('admin_customer_service')

    // 调用服务层方法
    const result = await AdminCustomerServiceService.markSessionAsRead(sessionId, adminId)

    return res.apiSuccess(result, '标记已读成功')
  } catch (error) {
    logger.error('标记已读失败:', error)
    let statusCode = 500
    let errorCode = 'INTERNAL_ERROR'

    if (error.message === '会话不存在') {
      statusCode = 404
      errorCode = 'NOT_FOUND'
    } else if (error.message === '无权限操作此会话') {
      statusCode = 403
      errorCode = 'FORBIDDEN'
    }

    return res.apiError(error.message, errorCode, null, statusCode)
  }
})

module.exports = router
