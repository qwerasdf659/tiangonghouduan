/**
 * 小程序简版客服回复端路由
 *
 * 路径前缀：/api/v4/system/cs-agent
 * 定位：给「客服座席」在微信小程序里使用的极简回复端——只看待回复会话、看聊天记录、发文字/图片。
 *      不提供任何统计/画像/工单/分配能力（那些在 Web 后台客服工作台）。
 *
 * 与 Web 后台数据互通原理：
 * - 复用同一批 Service（admin_customer_service / customer_service_session / chat_web_socket）
 *   和同一数据库表（customer_service_sessions / chat_messages），天然互通，无需同步逻辑。
 *
 * 权限模型（与 Web 后台不同，刻意收紧）：
 * - 准入基于「客服座席」身份：requireCsAgent()（查 customer_service_agents 且 status=active），
 *   而非 role_level。符合「客服是岗位职责而非权力等级」的行业惯例。
 *
 * 架构规范：
 * - 路由不直连 models，通过 ServiceManager 获取 Service；写操作走 TransactionManager.execute()。
 * - 统一使用 res.apiSuccess / res.apiError。
 *
 * 创建时间：2026-06-13（北京时间）
 */

'use strict'

const express = require('express')
const router = express.Router()
const logger = require('../../../utils/logger').logger
const { authenticateToken, requireCsAgent } = require('../../../middleware/auth')
const { asyncHandler } = require('../../../middleware/validation')
const TransactionManager = require('../../../utils/TransactionManager')
const businessConfig = require('../../../config/business.config')

/**
 * GET /api/v4/system/cs-agent/me
 * @desc 查询当前登录用户是否为客服座席（小程序「我的」页据此显示/隐藏「客服回复台」入口）
 * @access 登录用户（不经过 requireCsAgent，非座席不会被 403，返回 is_agent:false）
 * @returns {Object} { is_agent: boolean, status: string|null }
 *
 * 注意：本路由必须放在 `router.use(requireCsAgent())` 之前，否则非座席会被 403 拦截，
 * 前端就无法用它判断身份（这正是新增本接口要解决的问题）。
 */
router.get(
  '/me',
  authenticateToken,
  asyncHandler(async (req, res) => {
    const CsAgentManagementService = req.app.locals.services.getService('cs_agent_management')
    const identity = await CsAgentManagementService.getAgentIdentity(req.user.user_id)
    return res.apiSuccess(identity, '获取座席身份成功')
  })
)

// 以下路由：先认证，再校验客服座席身份（仅 active 座席可用）
router.use(authenticateToken, requireCsAgent())

/**
 * GET /api/v4/system/cs-agent/sessions
 * @desc 座席查看待回复的会话列表（复用 Web 后台同款服务，数据互通）
 * @access 客服座席（active）
 * @query {number} [page=1]
 * @query {number} [page_size=20]
 * @query {string} [status] 会话状态筛选（waiting/assigned/active/closed）
 */
router.get(
  '/sessions',
  asyncHandler(async (req, res) => {
    const AdminCustomerServiceService = req.app.locals.services.getService('admin_customer_service')
    const result = await AdminCustomerServiceService.getSessionList({
      page: req.query.page,
      page_size: req.query.page_size,
      status: req.query.status,
      sort_by: req.query.sort_by,
      sort_order: req.query.sort_order,
      // 座席端列表：带最后一条消息预览 + 未读红点（座席未读用户消息口径）
      include_last_message: true,
      calculate_unread: true,
      unread_for: 'agent'
    })
    return res.apiSuccess(result, '获取会话列表成功')
  })
)

/**
 * GET /api/v4/system/cs-agent/sessions/:id/messages
 * @desc 座席查看某会话的聊天记录（回复前看用户发了什么）
 * @access 客服座席（active）
 * @param {number} id 会话ID（事务实体）
 */
router.get(
  '/sessions/:id/messages',
  asyncHandler(async (req, res) => {
    const sessionId = parseInt(req.params.id, 10)
    if (isNaN(sessionId) || sessionId <= 0) {
      return res.apiError('会话ID无效', 'BAD_REQUEST', null, 400)
    }

    const AdminCustomerServiceService = req.app.locals.services.getService('admin_customer_service')
    const result = await AdminCustomerServiceService.getSessionMessages(sessionId, {
      page_size: req.query.page_size,
      before_message_id: req.query.before_message_id
    })
    return res.apiSuccess(result, '获取会话消息成功')
  })
)

/**
 * POST /api/v4/system/cs-agent/sessions/:id/send
 * @desc 座席给用户回复消息（文字或图片）。图片需先调用上传接口拿到 URL 再以 image 类型发送。
 * @access 客服座席（active）
 * @param {number} id 会话ID（事务实体）
 * @body {string} content 文字内容 或 图片URL（message_type=image 时）
 * @body {string} [message_type=text] text / image
 */
router.post(
  '/sessions/:id/send',
  asyncHandler(async (req, res) => {
    const sessionId = parseInt(req.params.id, 10)
    if (isNaN(sessionId) || sessionId <= 0) {
      return res.apiError('会话ID无效', 'BAD_REQUEST', null, 400)
    }

    const { content, message_type, file_name, file_size } = req.body
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

    // 简版客服端允许文字、图片、文件（不含 system 系统消息）
    const allowedTypes = ['text', 'image', 'file']
    if (message_type && !allowedTypes.includes(message_type)) {
      return res.apiError('消息类型无效（允许值：text/image/file）', 'BAD_REQUEST', null, 400)
    }

    // 文件消息必须带文件名（用于前端展示文件卡片）
    if (message_type === 'file' && (!file_name || String(file_name).trim() === '')) {
      return res.apiError('文件消息缺少 file_name', 'BAD_REQUEST', null, 400)
    }

    const data = {
      admin_id: req.user.user_id,
      content: content.trim(),
      message_type: message_type || 'text',
      role_level: req.user.role_level,
      // 文件消息元信息（仅 message_type=file 时透传，Service 内部按类型落库）
      file_name: message_type === 'file' ? file_name : undefined,
      file_size: message_type === 'file' ? file_size : undefined
    }

    const CustomerServiceSessionService = req.app.locals.services.getService(
      'customer_service_session'
    )
    const result = await TransactionManager.execute(
      async transaction => {
        return await CustomerServiceSessionService.sendMessage(sessionId, data, { transaction })
      },
      { description: 'csAgentSendMessage' }
    )

    // 实时推送给用户（与 Web 后台同款推送，失败不影响落库）
    try {
      const ChatWebSocketService = req.app.locals.services.getService('chat_web_socket')
      ChatWebSocketService.pushMessageToUser(result.session_user_id, {
        chat_message_id: result.chat_message_id,
        customer_service_session_id: sessionId,
        sender_id: req.user.user_id,
        sender_type: 'admin',
        content: result.content,
        message_type: result.message_type,
        file_name: result.file_name,
        file_size: result.file_size,
        created_at: result.created_at
      })
    } catch (wsError) {
      logger.error('WebSocket推送消息给用户失败:', wsError.message)
    }

    return res.apiSuccess(result, '发送消息成功')
  })
)

/**
 * POST /api/v4/system/cs-agent/sessions/:id/read
 * @desc 座席打开会话时，标记该会话「用户发来的」未读消息为已读，使座席端红点清零
 * @access 客服座席（active）
 * @param {number} id 会话ID（事务实体）
 * @returns {Object} { updated_count } 本次置为已读的消息条数
 *
 * 口径：复用 markSessionAsRead，置该会话 sender_type='user' 且 sent/delivered 的消息为 read，
 * 与座席端 unread_count（unread_for='agent'）口径一致，打开会话即清零。
 */
router.post(
  '/sessions/:id/read',
  asyncHandler(async (req, res) => {
    const sessionId = parseInt(req.params.id, 10)
    if (isNaN(sessionId) || sessionId <= 0) {
      return res.apiError('会话ID无效', 'BAD_REQUEST', null, 400)
    }

    const AdminCustomerServiceService = req.app.locals.services.getService('admin_customer_service')
    const result = await AdminCustomerServiceService.markSessionAsRead(sessionId, req.user.user_id)
    return res.apiSuccess(result, '标记已读成功')
  })
)

module.exports = router
