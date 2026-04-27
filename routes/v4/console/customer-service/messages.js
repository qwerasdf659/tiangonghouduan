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
 * 最后更新：2026-01-09（事务边界修复）
 */

const { asyncHandler } = require('../../../../middleware/validation')
const express = require('express')
const router = express.Router()
const logger = require('../../../../utils/logger').logger
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const businessConfig = require('../../../../config/business.config')
const TransactionManager = require('../../../../utils/TransactionManager')

// 所有路由都需要后台访问权限（role_level >= 1 即可访问客服功能）
router.use(authenticateToken, requireRoleLevel(1))

/**
 * GET /:id/messages - 获取会话消息
 *
 * API路径参数设计规范 V2.2：
 * - 会话是事务实体，使用数字ID（:id）作为标识符
 *
 * @description 获取指定会话的消息历史
 * @route GET /api/v4/console/customer-service/sessions/:id/messages
 * @param {number} id - 会话ID（事务实体）
 * @access Admin
 */
router.get(
  '/:id/messages',
  asyncHandler(async (req, res) => {
    const AdminCustomerServiceService = req.app.locals.services.getService('admin_customer_service')

    const sessionId = parseInt(req.params.id)

    if (isNaN(sessionId) || sessionId <= 0) {
      return res.apiError('会话ID无效', 'BAD_REQUEST', null, 400)
    }

    const options = {
      page_size: req.query.page_size,
      before_message_id: req.query.before_message_id
    }

    const result = await AdminCustomerServiceService.getSessionMessages(sessionId, options)

    return res.apiSuccess(result, '获取会话消息成功')
  })
)

/**
 * POST /:id/send - 发送消息
 *
 * API路径参数设计规范 V2.2：
 * - 会话是事务实体，使用数字ID（:id）作为标识符
 *
 * @description 管理员发送消息给用户
 * @route POST /api/v4/console/customer-service/sessions/:id/send
 * @param {number} id - 会话ID（事务实体）
 * @access Admin
 */
router.post(
  '/:id/send',
  asyncHandler(async (req, res) => {
    const sessionId = parseInt(req.params.id)

    if (isNaN(sessionId) || sessionId <= 0) {
      return res.apiError('会话ID无效', 'BAD_REQUEST', null, 400)
    }

    const { content, message_type } = req.body

    if (!content || content.trim() === '') {
      return res.apiError('消息内容不能为空', 'BAD_REQUEST', null, 400)
    }

    const { message: messageConfig } = businessConfig.chat
    if (content.length > messageConfig.max_length) {
      return res.apiError(
        `消息内容不能超过${messageConfig.max_length}字符（当前${content.length}字符）`,
        'BAD_REQUEST',
        null,
        400
      )
    }

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

    const CustomerServiceSessionService = req.app.locals.services.getService(
      'customer_service_session'
    )

    const result = await TransactionManager.execute(
      async transaction => {
        return await CustomerServiceSessionService.sendMessage(sessionId, data, { transaction })
      },
      { description: 'sendMessage' }
    )

    try {
      const ChatWebSocketService = req.app.locals.services.getService('chat_web_socket')
      const messageData = {
        chat_message_id: result.chat_message_id,
        customer_service_session_id: sessionId,
        sender_id: req.user.user_id,
        sender_type: 'admin',
        content: result.content,
        message_type: result.message_type,
        created_at: result.created_at
      }
      ChatWebSocketService.pushMessageToUser(result.session_user_id, messageData)
    } catch (wsError) {
      logger.error('WebSocket推送消息给用户失败:', wsError.message)
    }

    return res.apiSuccess(result, '发送消息成功')
  })
)

/**
 * POST /:id/mark-read - 标记消息已读
 *
 * API路径参数设计规范 V2.2：
 * - 会话是事务实体，使用数字ID（:id）作为标识符
 *
 * @description 标记会话中用户发送的消息为已读
 * @route POST /api/v4/console/customer-service/sessions/:id/mark-read
 * @param {number} id - 会话ID（事务实体）
 * @access Admin
 */
router.post(
  '/:id/mark-read',
  asyncHandler(async (req, res) => {
    const sessionId = parseInt(req.params.id)

    if (isNaN(sessionId) || sessionId <= 0) {
      return res.apiError('会话ID无效', 'BAD_REQUEST', null, 400)
    }

    const adminId = req.user.user_id

    const AdminCustomerServiceService = req.app.locals.services.getService('admin_customer_service')

    const result = await AdminCustomerServiceService.markSessionAsRead(sessionId, adminId)

    return res.apiSuccess(result, '标记已读成功')
  })
)

module.exports = router
