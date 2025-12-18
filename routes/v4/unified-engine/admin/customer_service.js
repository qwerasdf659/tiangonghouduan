const Logger = require('../../../../services/UnifiedLotteryEngine/utils/Logger')
const logger = new Logger('customer_service')

/**
 * 客服管理路由 - Admin Customer Service Routes
 *
 * @description 管理员端客服系统API路由
 * @module routes/v4/unified-engine/admin/customer_service
 * @version 5.0.0（重构版：使用AdminCustomerServiceService）
 * @date 2025-11-23
 * @updated 2025-12-09（重构：路由层委托给AdminCustomerServiceService处理）
 *
 * 业务场景：
 * - 管理员查看和管理客服会话
 * - 回复用户消息
 * - 转接和关闭会话
 *
 * API端点：
 * - GET    /sessions              - 获取会话列表
 * - GET    /sessions/:id/messages - 获取会话消息
 * - POST   /sessions/:id/send     - 发送消息
 * - POST   /sessions/:id/mark-read - 标记已读
 * - POST   /sessions/:id/transfer - 转接会话
 * - POST   /sessions/:id/close    - 关闭会话
 * - GET    /sessions/stats        - 获取统计信息
 *
 * 架构原则：
 * - 路由层不直连 models（所有数据库操作通过 Service 层）
 * - 路由层不开启事务（事务管理在 Service 层）
 * - 通过 ServiceManager 统一获取服务实例
 * - 使用 AdminCustomerServiceService 作为 Facade 层
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../../middleware/auth')
const businessConfig = require('../../../../config/business.config')

// 🔐 所有路由都需要管理员权限
router.use(authenticateToken, requireAdmin)

/**
 * GET /api/v4/admin/customer-service/sessions - 获取会话列表
 *
 * @description 获取客服会话列表，支持分页、筛选、排序
 * @route GET /api/v4/admin/customer-service/sessions
 * @access Admin
 *
 * @queryparam {number} [page=1] - 页码
 * @queryparam {number} [page_size=20] - 每页数量
 * @queryparam {string} [status] - 会话状态（waiting/assigned/active/closed）
 * @queryparam {number} [admin_id] - 筛选指定客服的会话
 * @queryparam {string} [search] - 搜索关键词（用户昵称/手机号）
 * @queryparam {string} [sort_by=updated_at] - 排序字段
 * @queryparam {string} [sort_order=DESC] - 排序方向
 *
 * @response {200} 成功返回会话列表
 * @response {401} 未授权
 * @response {403} 无管理员权限
 * @response {500} 服务器错误
 */
router.get('/sessions', async (req, res) => {
  try {
    // 🎯 通过 ServiceManager 获取 AdminCustomerServiceService
    const AdminCustomerServiceService = req.app.locals.services.getService('adminCustomerService')

    const options = {
      page: req.query.page,
      page_size: req.query.page_size,
      status: req.query.status,
      admin_id: req.query.admin_id,
      search: req.query.search,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order
    }

    // 🎯 调用服务层方法
    const result = await AdminCustomerServiceService.getSessionList(options)

    res.apiSuccess(result, '获取会话列表成功')
  } catch (error) {
    logger.error('获取会话列表失败:', error)
    res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * GET /api/v4/admin/customer-service/sessions/stats - 获取会话统计
 *
 * @description 获取会话统计信息（待处理、进行中、已关闭等）
 * @route GET /api/v4/admin/customer-service/sessions/stats
 * @access Admin
 *
 * @queryparam {number} [admin_id] - 指定客服ID（可选）
 *
 * @response {200} 成功返回统计信息
 * @response {401} 未授权
 * @response {403} 无管理员权限
 * @response {500} 服务器错误
 */
router.get('/sessions/stats', async (req, res) => {
  try {
    // 🎯 通过 ServiceManager 获取 AdminCustomerServiceService
    const AdminCustomerServiceService = req.app.locals.services.getService('adminCustomerService')

    const admin_id = req.query.admin_id ? parseInt(req.query.admin_id) : undefined

    // 🎯 调用服务层方法
    const stats = await AdminCustomerServiceService.getSessionStats(admin_id)

    res.apiSuccess(stats, '获取统计信息成功')
  } catch (error) {
    logger.error('获取统计信息失败:', error)
    res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * GET /api/v4/admin/customer-service/sessions/:session_id/messages - 获取会话消息
 *
 * @description 获取指定会话的消息历史
 * @route GET /api/v4/admin/customer-service/sessions/:session_id/messages
 * @access Admin
 *
 * @param {number} session_id - 会话ID
 * @queryparam {number} [limit=50] - 消息数量限制
 * @queryparam {number} [before_message_id] - 加载指定消息之前的历史（分页）
 *
 * @response {200} 成功返回会话详情和消息列表
 * @response {401} 未授权
 * @response {403} 无管理员权限
 * @response {404} 会话不存在
 * @response {500} 服务器错误
 */
router.get('/sessions/:session_id/messages', async (req, res) => {
  try {
    // 🎯 通过 ServiceManager 获取 AdminCustomerServiceService
    const AdminCustomerServiceService = req.app.locals.services.getService('adminCustomerService')

    const session_id = parseInt(req.params.session_id)
    const options = {
      limit: req.query.limit,
      before_message_id: req.query.before_message_id
    }

    // 🎯 调用服务层方法
    const result = await AdminCustomerServiceService.getSessionMessages(session_id, options)

    res.apiSuccess(result, '获取会话消息成功')
  } catch (error) {
    logger.error('获取会话消息失败:', error)
    const statusCode = error.message === '会话不存在' ? 404 : 500
    res.apiError(
      error.message,
      error.message === '会话不存在' ? 'NOT_FOUND' : 'INTERNAL_ERROR',
      null,
      statusCode
    )
  }
})

/**
 * POST /api/v4/admin/customer-service/sessions/:session_id/send - 发送消息
 *
 * @description 管理员发送消息给用户
 * @route POST /api/v4/admin/customer-service/sessions/:session_id/send
 * @access Admin
 *
 * @param {number} session_id - 会话ID
 * @bodyparam {string} content - 消息内容（必填）
 * @bodyparam {string} [message_type='text'] - 消息类型（text/image/system）
 *
 * @response {200} 成功发送消息
 * @response {400} 参数错误
 * @response {401} 未授权
 * @response {403} 无管理员权限或无权限操作此会话
 * @response {404} 会话不存在
 * @response {500} 服务器错误
 */
router.post('/sessions/:session_id/send', async (req, res) => {
  try {
    const session_id = parseInt(req.params.session_id)
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
      role_level: req.user.role_level // ✅ 传递权限等级
    }

    // 🎯 通过 ServiceManager 获取 AdminCustomerServiceService
    const AdminCustomerServiceService = req.app.locals.services.getService('adminCustomerService')

    // 🎯 调用服务层方法
    const result = await AdminCustomerServiceService.sendMessage(session_id, data)

    return res.apiSuccess(result, '发送消息成功')
  } catch (error) {
    logger.error('发送消息失败:', error)

    // ✅ 增强错误处理
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
 * POST /api/v4/admin/customer-service/sessions/:session_id/mark-read - 标记消息已读
 *
 * @description 标记会话中用户发送的消息为已读
 * @route POST /api/v4/admin/customer-service/sessions/:session_id/mark-read
 * @access Admin
 *
 * @param {number} session_id - 会话ID
 *
 * @response {200} 成功标记已读
 * @response {401} 未授权
 * @response {403} 无管理员权限或无权限操作此会话
 * @response {404} 会话不存在
 * @response {500} 服务器错误
 */
router.post('/sessions/:session_id/mark-read', async (req, res) => {
  try {
    const session_id = parseInt(req.params.session_id)
    const admin_id = req.user.user_id

    // 🎯 通过 ServiceManager 获取 AdminCustomerServiceService
    const AdminCustomerServiceService = req.app.locals.services.getService('adminCustomerService')

    // 🎯 调用服务层方法
    const result = await AdminCustomerServiceService.markSessionAsRead(session_id, admin_id)

    res.apiSuccess(result, '标记已读成功')
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

    res.apiError(error.message, errorCode, null, statusCode)
  }
})

/**
 * POST /api/v4/admin/customer-service/sessions/:session_id/transfer - 转接会话
 *
 * @description 将会话转接给其他客服
 * @route POST /api/v4/admin/customer-service/sessions/:session_id/transfer
 * @access Admin
 *
 * @param {number} session_id - 会话ID
 * @bodyparam {number} target_admin_id - 目标客服ID（必填）
 *
 * @response {200} 成功转接会话
 * @response {400} 参数错误
 * @response {401} 未授权
 * @response {403} 无管理员权限或无权限操作此会话
 * @response {404} 会话不存在或目标客服不存在
 * @response {500} 服务器错误
 */
router.post('/sessions/:session_id/transfer', async (req, res) => {
  try {
    const session_id = parseInt(req.params.session_id)
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

    // 🎯 通过 ServiceManager 获取 AdminCustomerServiceService
    const AdminCustomerServiceService = req.app.locals.services.getService('adminCustomerService')

    // 🎯 调用服务层方法
    const result = await AdminCustomerServiceService.transferSession(
      session_id,
      current_admin_id,
      target_id
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
 * POST /api/v4/admin/customer-service/sessions/:session_id/close - 关闭会话
 *
 * @description 关闭客服会话
 * @route POST /api/v4/admin/customer-service/sessions/:session_id/close
 * @access Admin
 *
 * @param {number} session_id - 会话ID
 * @bodyparam {string} [close_reason='问题已解决'] - 关闭原因（可选）
 *
 * @response {200} 成功关闭会话
 * @response {401} 未授权
 * @response {403} 无管理员权限或无权限操作此会话
 * @response {404} 会话不存在
 * @response {500} 服务器错误
 */
router.post('/sessions/:session_id/close', async (req, res) => {
  try {
    const session_id = parseInt(req.params.session_id)
    const { close_reason } = req.body

    const data = {
      admin_id: req.user.user_id,
      close_reason: close_reason || '问题已解决'
    }

    // 🎯 通过 ServiceManager 获取 AdminCustomerServiceService
    const AdminCustomerServiceService = req.app.locals.services.getService('adminCustomerService')

    // 🎯 调用服务层方法
    const result = await AdminCustomerServiceService.closeSession(session_id, data)

    res.apiSuccess(result, '关闭会话成功')
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

    res.apiError(error.message, errorCode, null, statusCode)
  }
})

module.exports = router
