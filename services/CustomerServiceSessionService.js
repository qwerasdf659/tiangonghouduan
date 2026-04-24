const BusinessError = require('../utils/BusinessError')
const logger = require('../utils/logger').logger

/**
 * 客服会话服务（Customer Service Session Service）
 *
 * 业务场景：管理用户与客服的聊天会话
 * 核心职责：会话查询、消息收发、会话分配、状态管理
 *
 * 主要功能：
 * 1. 获取会话列表（分页、筛选、排序）
 * 2. 获取会话消息历史
 * 3. 发送消息（管理员端）
 * 4. 标记消息已读
 * 5. 转接会话给其他客服
 * 6. 关闭会话
 *
 * 集成服务：
 * - ChatWebSocketService：实时消息推送
 * - NotificationService：通知推送
 *
 * 事务边界治理（2026-01-05 决策）：
 * - 所有写操作 **强制要求** 外部事务传入（options.transaction）
 * - 未提供事务时直接报错（使用 assertAndGetTransaction）
 * - 服务层禁止自建事务，由入口层统一使用 TransactionManager.execute()
 *
 * 最后更新：2026年01月05日（事务边界治理改造）
 */

const { CustomerServiceSession, ChatMessage, User } = require('../models')
const { attachDisplayNames, DICT_TYPES } = require('../utils/displayNameHelper')
const BeijingTimeHelper = require('../utils/timeHelper')
const { Sequelize } = require('sequelize')
const { assertAndGetTransaction } = require('../utils/transactionHelpers')
const { Op } = Sequelize
const businessConfig = require('../config/business.config')
const ChatRateLimitService = require('./ChatRateLimitService')
const chatWsInstance = require('./ChatWebSocketService')

/*
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 🔒 安全工具函数（从 routes/v4/system.js 复制，避免重复代码）
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

/**
 * XSS内容安全过滤
 * 复用自 routes/v4/system.js 行1730-1736
 *
 * @param {string} content - 原始内容
 * @returns {string} 脱敏/转义后的安全内容
 */
function sanitizeContent(content) {
  return content
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
}

/**
 * 敏感词检测
 * 复用自 routes/v4/system.js 行1742-1751
 *
 * @param {string} content - 待检测内容
 * @returns {Object} result - 检测结果
 * @returns {boolean} result.passed - 是否通过检测（true-通过，false-不通过）
 * @returns {string} [result.matchedWord] - 命中的敏感词（仅当 passed=false 时返回）
 */
function checkSensitiveWords(content) {
  const { content_filter: contentFilter } = businessConfig.chat

  if (!contentFilter.enabled) {
    return { passed: true }
  }

  const matchedWord = contentFilter.sensitive_words.find(word => content.includes(word))

  if (matchedWord && contentFilter.reject_on_match) {
    return { passed: false, matchedWord }
  }

  return { passed: true }
}

/**
 * 聊天频率限制服务
 * ✅ P2-F架构重构：统一使用 ChatRateLimitService 管理所有频率限制逻辑
 * 移除重复代码，避免多处维护同一逻辑
 */

/**
 * 客服会话服务类
 * 负责客服聊天会话的业务逻辑处理
 *
 * @class CustomerServiceSessionService
 */
class CustomerServiceSessionService {
  /**
   * 获取会话列表（支持分页、筛选、排序）
   *
   * 业务场景：
   * - 管理员查看待处理的客服会话
   * - 用户查看自己的会话列表
   * - 支持按状态、时间范围、搜索关键词筛选
   * - 分页加载会话列表
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @param {string} [options.status] - 会话状态筛选（waiting/assigned/active/closed）
   * @param {number} [options.admin_id] - 筛选指定客服的会话
   * @param {number} [options.user_id] - 筛选指定用户的会话（用户端专用）
   * @param {string} [options.search] - 搜索关键词（用户昵称/手机号）
   * @param {string} [options.sort_by='updated_at'] - 排序字段
   * @param {string} [options.sort_order='DESC'] - 排序方向
   * @param {boolean} [options.include_last_message=false] - 是否包含最后一条消息
   * @param {boolean} [options.calculate_unread=false] - 是否计算未读消息数
   * @returns {Object} 会话列表和分页信息
   */
  static async getSessionList(options = {}) {
    try {
      const {
        page = 1,
        page_size = 20,
        status,
        admin_id,
        user_id,
        search,
        sort_by = 'updated_at',
        sort_order = 'DESC',
        include_last_message = false,
        calculate_unread = false
      } = options

      logger.info('📋 获取客服会话列表，参数:', JSON.stringify(options, null, 2))

      // 构建查询条件
      const where = {}

      // 状态筛选 - 'all' 或空值表示不筛选
      if (status && status !== 'all') {
        where.status = status
      }

      // 客服筛选
      if (admin_id) {
        where.admin_id = admin_id
      }

      // 用户筛选（用户端专用）
      if (user_id) {
        where.user_id = user_id
      }

      // 构建查询（包含用户信息）
      const includeOptions = [
        {
          model: User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile'],
          // 搜索条件
          where: search
            ? {
                [Op.or]: [
                  { nickname: { [Op.like]: `%${search}%` } },
                  { mobile: { [Op.like]: `%${search}%` } }
                ]
              }
            : undefined,
          required: !!search
        },
        {
          model: User,
          as: 'admin',
          attributes: ['user_id', 'nickname', 'mobile'],
          required: false
        }
      ]

      // 如果需要包含最后一条消息
      if (include_last_message) {
        includeOptions.push({
          model: ChatMessage,
          as: 'messages',
          limit: 1,
          order: [['created_at', 'DESC']],
          required: false,
          attributes: ['chat_message_id', 'content', 'sender_type', 'created_at']
        })
      }

      const queryOptions = {
        where,
        include: includeOptions,
        order: [[sort_by, sort_order]],
        limit: parseInt(page_size),
        offset: (parseInt(page) - 1) * parseInt(page_size)
      }

      // 执行查询
      const { rows: sessions, count: total } =
        await CustomerServiceSession.findAndCountAll(queryOptions)

      // 格式化返回数据
      let formattedSessions = sessions.map(session => ({
        customer_service_session_id: session.customer_service_session_id,
        user: session.user
          ? {
              user_id: session.user.user_id,
              nickname: session.user.nickname,
              mobile: session.user.mobile
            }
          : null,
        admin: session.admin
          ? {
              user_id: session.admin.user_id,
              nickname: session.admin.nickname
            }
          : null,
        status: session.status,
        priority: session.priority,
        last_message_at: session.last_message_at
          ? BeijingTimeHelper.formatForAPI(session.last_message_at).iso
          : null,
        created_at: BeijingTimeHelper.formatForAPI(session.created_at).iso,
        updated_at: BeijingTimeHelper.formatForAPI(session.updated_at).iso,
        last_message:
          include_last_message && session.messages && session.messages.length > 0
            ? session.messages[0]
            : null,
        unread_count: 0
      }))

      // 如果需要计算未读消息数
      if (calculate_unread) {
        formattedSessions = await Promise.all(
          formattedSessions.map(async session => {
            const unreadCount = await ChatMessage.count({
              where: {
                customer_service_session_id: session.customer_service_session_id,
                sender_type: 'admin',
                status: { [Op.in]: ['sent', 'delivered'] }
              }
            })
            return { ...session, unread_count: unreadCount }
          })
        )
      }

      // 附加中文显示名称（status → _display/_color）
      await attachDisplayNames(formattedSessions, [
        { field: 'status', dictType: DICT_TYPES.CS_SESSION_STATUS }
      ])

      logger.info(`✅ 成功获取${formattedSessions.length}条会话记录`)

      return {
        sessions: formattedSessions,
        pagination: {
          page: parseInt(page),
          page_size: parseInt(page_size),
          total,
          total_pages: Math.ceil(total / parseInt(page_size))
        }
      }
    } catch (error) {
      logger.error('❌ 获取会话列表失败:', error)
      throw error
    }
  }

  /**
   * 获取会话详情和消息历史
   *
   * 业务场景：
   * - 管理员点击会话，查看完整的聊天记录
   * - 用户查看自己的聊天历史（user_id验证）
   * - 加载会话基本信息和历史消息
   *
   * @param {number} session_id - 会话ID
   * @param {Object} options - 查询选项
   * @param {number} [options.page_size=50] - 每页消息数量（与全站分页字段一致）
   * @param {number} [options.before_message_id] - 加载指定消息之前的历史（用于分页）
   * @param {number} [options.page] - 页码（用于分页，与offset配合使用）
   * @param {number} [options.offset] - 偏移量（用于分页）
   * @param {number} [options.user_id] - 用户ID（用于权限验证，用户端专用）
   * @param {boolean} [options.mark_as_read=false] - 是否标记消息为已读（用户端查看时）
   * @param {boolean} [options.include_all_fields=false] - 是否包含所有消息字段（包括metadata等）
   * @returns {Object} 会话详情和消息列表
   */
  static async getSessionMessages(session_id, options = {}) {
    try {
      const {
        page_size = 50,
        before_message_id,
        page,
        offset,
        user_id,
        mark_as_read = false,
        include_all_fields = false
      } = options
      const limit = page_size

      logger.info(`📋 获取会话 ${session_id} 的消息，参数:`, JSON.stringify(options, null, 2))

      // 构建会话查询条件
      const sessionWhere = { customer_service_session_id: session_id }
      if (user_id) {
        // 用户端查询：验证权限（用户只能查看自己的会话）
        sessionWhere.user_id = user_id
      }

      // 获取会话详情
      const session = await CustomerServiceSession.findOne({
        where: sessionWhere,
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['user_id', 'nickname', 'mobile']
          },
          {
            model: User,
            as: 'admin',
            attributes: ['user_id', 'nickname', 'mobile']
          }
        ]
      })

      if (!session) {
        throw new BusinessError(user_id ? '会话不存在或无权限访问' : '会话不存在', 'CUSTOMER_SERVICE_NOT_FOUND', 404)
      }

      // 构建消息查询条件
      const messageWhere = { customer_service_session_id: session_id }
      if (before_message_id) {
        messageWhere.chat_message_id = { [Op.lt]: before_message_id }
      }

      // 构建查询选项
      const queryOptions = {
        where: messageWhere,
        include: [
          {
            model: User,
            as: 'sender',
            attributes: ['user_id', 'nickname'],
            required: false // ⚠️ 允许sender为null（系统消息、已删除用户）
          }
        ],
        order: [['created_at', 'DESC']],
        limit: parseInt(limit)
      }

      // 添加偏移量（如果提供了offset或page）
      if (offset !== undefined) {
        queryOptions.offset = parseInt(offset)
      } else if (page !== undefined) {
        queryOptions.offset = (parseInt(page) - 1) * parseInt(limit)
      }

      // 如果需要所有字段，显式指定属性列表
      if (include_all_fields) {
        queryOptions.attributes = [
          'chat_message_id',
          'customer_service_session_id',
          'sender_id',
          'sender_type',
          'message_source',
          'content',
          'message_type',
          'status',
          'reply_to_id',
          'temp_message_id',
          'metadata',
          'created_at',
          'updated_at'
        ]
      }

      // 获取消息列表（支持count用于分页）
      const { count, rows: messages } = await ChatMessage.findAndCountAll(queryOptions)

      // 如果需要标记为已读（用户查看聊天历史时）
      if (mark_as_read && user_id) {
        try {
          const [updateCount] = await ChatMessage.update(
            { status: 'read' },
            {
              where: {
                customer_service_session_id: session_id,
                sender_type: 'admin', // 只标记管理员发送的消息
                status: { [Op.in]: ['sent', 'delivered'] } // 只更新未读消息
              }
            }
          )
          if (updateCount > 0) {
            logger.info(`✅ 会话${session_id}：已标记${updateCount}条管理员消息为已读`)
          }
        } catch (updateError) {
          logger.error(`⚠️ 更新消息已读状态失败 (会话${session_id}):`, updateError.message)
          // 不影响主流程
        }
      }

      // 格式化返回数据
      const formattedMessages = messages.reverse().map(msg => {
        const data = msg.toJSON()

        // ✅ 防御性编程：处理sender为null的情况（已删除用户、系统消息）
        if (!data.sender) {
          data.sender = {
            user_id: data.sender_id,
            nickname: '已删除用户'
          }
        }

        // 如果不需要所有字段，只返回基础字段
        if (!include_all_fields) {
          return {
            chat_message_id: data.chat_message_id,
            customer_service_session_id: data.customer_service_session_id,
            sender: data.sender,
            sender_type: data.sender_type,
            message_source: data.message_source,
            content: data.content,
            message_type: data.message_type,
            status: data.status,
            created_at: BeijingTimeHelper.formatForAPI(msg.created_at).iso
          }
        }

        // 返回所有字段（包括metadata等）
        return {
          ...data,
          created_at: BeijingTimeHelper.formatForAPI(msg.created_at).iso,
          updated_at: BeijingTimeHelper.formatForAPI(msg.updated_at).iso
        }
      })

      logger.info(`✅ 成功获取${formattedMessages.length}条消息`)

      return {
        session: {
          customer_service_session_id: session.customer_service_session_id,
          user: session.user
            ? {
                user_id: session.user.user_id,
                nickname: session.user.nickname,
                mobile: session.user.mobile
              }
            : null,
          admin: session.admin
            ? {
                user_id: session.admin.user_id,
                nickname: session.admin.nickname
              }
            : null,
          status: session.status,
          priority: session.priority,
          created_at: BeijingTimeHelper.formatForAPI(session.created_at).iso
        },
        messages: formattedMessages,
        total: count, // 总消息数（用于分页）
        has_more: messages.length === parseInt(limit)
      }
    } catch (error) {
      logger.error('❌ 获取会话消息失败:', error)
      throw error
    }
  }

  /**
   * 发送消息（管理员端）
   *
   * 业务场景：
   * - 客服在管理后台回复用户消息
   * - 自动更新会话状态和最后消息时间
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * @param {number} session_id - 会话ID
   * @param {Object} data - 消息数据
   * @param {number} data.admin_id - 发送客服的ID
   * @param {string} data.content - 消息内容
   * @param {string} [data.message_type='text'] - 消息类型（text/image/system）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 外部事务对象（必填）
   * @returns {Object} 创建的消息对象
   */
  static async sendMessage(session_id, data, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(
      options,
      'CustomerServiceSessionService.sendMessage'
    )

    const { admin_id, content, message_type = 'text', role_level = 100 } = data

    logger.info(`📤 管理员 ${admin_id} 向会话 ${session_id} 发送消息`)

    // ✅ 1. XSS内容安全过滤
    const sanitized_content = sanitizeContent(content)

    // ✅ 2. 敏感词检测
    const sensitiveCheck = checkSensitiveWords(sanitized_content)
    if (!sensitiveCheck.passed) {
      throw new BusinessError(`消息包含敏感词：${sensitiveCheck.matchedWord}`, 'CUSTOMER_SERVICE_ERROR', 400)
    }

    /*
     * ✅ 3. 频率限制检查
     * ✅ P2-F架构重构：使用 ChatRateLimitService 统一管理频率限制
     * 管理员使用 role_level >= 100 标识
     */
    const rateLimitCheck = ChatRateLimitService.checkMessageRateLimit(admin_id, 100)
    if (!rateLimitCheck.allowed) {
      throw new BusinessError(`发送消息过于频繁，每分钟最多${rateLimitCheck.limit}条`, 'CUSTOMER_SERVICE_ERROR', 400)
    }

    // ✅ 4. 验证会话是否存在
    const session = await CustomerServiceSession.findOne({
      where: { customer_service_session_id: session_id },
      transaction
    })

    if (!session) {
      throw new BusinessError('会话不存在', 'CUSTOMER_SERVICE_NOT_FOUND', 404)
    }

    // ✅ 4.5. 验证会话状态（只有waiting/assigned/active可回复）
    const ACTIVE_STATUS = ['waiting', 'assigned', 'active']
    if (!ACTIVE_STATUS.includes(session.status)) {
      throw new BusinessError(`会话已关闭，无法发送消息（当前状态：${session.status}）`, 'CUSTOMER_SERVICE_ERROR', 400)
    }

    // ✅ 5. 权限细分控制（支持超级管理员接管）
    if (session.admin_id && session.admin_id !== admin_id) {
      if (role_level < 200) {
        throw new BusinessError('无权限操作此会话，需要超级管理员权限', 'CUSTOMER_SERVICE_FORBIDDEN', 403)
      }
      logger.info(`⚠️ 超级管理员 ${admin_id} 接管会话 ${session_id}`)
    }

    // ✅ 6. 自动分配未分配的会话
    if (!session.admin_id) {
      await session.update(
        {
          admin_id,
          status: 'assigned'
        },
        { transaction }
      )
    }

    // ✅ 7. 创建消息记录（使用过滤后的内容）
    const message = await ChatMessage.create(
      {
        customer_service_session_id: session_id,
        sender_id: admin_id,
        sender_type: 'admin',
        message_source: 'admin_client',
        content: sanitized_content,
        message_type,
        status: 'sent'
      },
      { transaction }
    )

    // ✅ 8. 更新会话的最后消息时间
    await session.update(
      {
        last_message_at: new Date(),
        status:
          session.status === 'waiting' || session.status === 'assigned' ? 'active' : session.status
      },
      { transaction }
    )

    logger.info(`✅ 消息发送成功，消息ID: ${message.chat_message_id}`)

    // ✅ 9. 返回结果（WebSocket推送由入口层事务提交后处理）
    return {
      chat_message_id: message.chat_message_id,
      content: sanitized_content,
      sender_type: message.sender_type,
      message_type: message.message_type,
      created_at: BeijingTimeHelper.formatForAPI(message.created_at).iso,
      session_user_id: session.user_id // 供入口层推送WebSocket使用
    }
  }

  /**
   * 发送用户消息（用户端专用）
   *
   * 业务场景：
   * - 用户在移动端或Web端发送聊天消息
   * - 自动验证会话权限（用户只能向自己的会话发送消息）
   * - 检查会话状态（已关闭的会话无法发送）
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * @param {number} session_id - 会话ID
   * @param {Object} data - 消息数据
   * @param {number} data.user_id - 发送用户的ID
   * @param {string} data.content - 消息内容（应该已经过滤和验证）
   * @param {string} [data.message_type='text'] - 消息类型（text/image）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 外部事务对象（必填）
   * @returns {Object} 创建的消息对象
   * @throws {Error} 会话不存在、无权限、会话已关闭等错误
   */
  static async sendUserMessage(session_id, data, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(
      options,
      'CustomerServiceSessionService.sendUserMessage'
    )

    const { user_id, content, message_type = 'text' } = data

    logger.info(`📤 用户 ${user_id} 向会话 ${session_id} 发送消息`)

    // ✅ 1. 验证会话是否存在且属于该用户
    const session = await CustomerServiceSession.findOne({
      where: {
        customer_service_session_id: session_id,
        user_id // 用户只能向自己的会话发送消息
      },
      transaction
    })

    if (!session) {
      throw new BusinessError('会话不存在或无权限访问', 'CUSTOMER_SERVICE_NOT_FOUND', 404)
    }

    // ✅ 2. 检查会话状态（只有waiting/assigned/active可发送消息）
    const ACTIVE_STATUS = ['waiting', 'assigned', 'active']
    if (!ACTIVE_STATUS.includes(session.status)) {
      throw new BusinessError(`会话已关闭，无法发送消息（当前状态：${session.status}）`, 'CUSTOMER_SERVICE_ERROR', 400)
    }

    // ✅ 3. 创建消息记录
    const message = await ChatMessage.create(
      {
        customer_service_session_id: session_id,
        sender_id: user_id,
        sender_type: 'user',
        message_source: 'user_client',
        content,
        message_type,
        status: 'sent'
      },
      { transaction }
    )

    // ✅ 4. 更新会话的最后消息时间
    await session.update(
      {
        last_message_at: new Date(),
        updated_at: new Date()
      },
      { transaction }
    )

    logger.info(`✅ 用户消息发送成功，消息ID: ${message.chat_message_id}`)

    // ✅ 5. 返回消息数据（供入口层WebSocket推送使用）
    return {
      chat_message_id: message.chat_message_id,
      customer_service_session_id: session_id,
      sender_id: user_id,
      sender_type: 'user',
      content: message.content,
      message_type: message.message_type,
      created_at: BeijingTimeHelper.formatForAPI(message.created_at).iso,
      session_admin_id: session.admin_id // 返回会话的admin_id（用于WebSocket推送）
    }
  }

  /**
   * 标记会话消息为已读
   *
   * 业务场景：
   * - 管理员打开会话时，标记用户发送的消息为已读
   *
   * @param {number} session_id - 会话ID
   * @param {number} admin_id - 管理员ID
   * @returns {Object} 更新结果
   */
  static async markSessionAsRead(session_id, admin_id) {
    try {
      logger.info(`👁️ 管理员 ${admin_id} 标记会话 ${session_id} 为已读`)

      // 验证会话是否存在
      const session = await CustomerServiceSession.findOne({
        where: { customer_service_session_id: session_id }
      })

      if (!session) {
        throw new BusinessError('会话不存在', 'CUSTOMER_SERVICE_NOT_FOUND', 404)
      }

      /*
       * 管理后台的管理员可以标记任何会话为已读（非破坏性操作）
       * 仅记录日志，不做权限限制
       */
      if (session.admin_id && session.admin_id !== admin_id) {
        logger.info(
          `📝 管理员 ${admin_id} 正在查看其他管理员 ${session.admin_id} 的会话 ${session_id}`
        )
      }

      // 标记用户发送的未读消息为已读
      const [updatedCount] = await ChatMessage.update(
        { status: 'read' },
        {
          where: {
            customer_service_session_id: session_id,
            sender_type: 'user',
            status: { [Op.in]: ['sent', 'delivered'] }
          }
        }
      )

      logger.info(`✅ 标记 ${updatedCount} 条消息为已读`)

      return {
        updated_count: updatedCount
      }
    } catch (error) {
      logger.error('❌ 标记已读失败:', error)
      throw error
    }
  }

  /**
   * 转接会话给其他客服
   *
   * 业务场景：
   * - 当前客服无法处理，转接给其他客服
   * - 自动创建系统消息记录转接操作
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * @param {number} session_id - 会话ID
   * @param {number} current_admin_id - 当前客服ID
   * @param {number} target_admin_id - 目标客服ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 外部事务对象（必填）
   * @returns {Object} 转接结果
   */
  static async transferSession(session_id, current_admin_id, target_admin_id, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(
      options,
      'CustomerServiceSessionService.transferSession'
    )

    logger.info(`🔄 转接会话 ${session_id}: ${current_admin_id} → ${target_admin_id}`)

    // 验证会话
    const session = await CustomerServiceSession.findOne({
      where: { customer_service_session_id: session_id },
      transaction
    })

    if (!session) {
      throw new BusinessError('会话不存在', 'CUSTOMER_SERVICE_NOT_FOUND', 404)
    }

    /*
     * 管理后台的管理员可以转接任何会话
     * 仅记录日志，不做权限限制
     */
    if (session.admin_id && session.admin_id !== current_admin_id) {
      logger.info(
        `📝 管理员 ${current_admin_id} 正在转接其他管理员 ${session.admin_id} 的会话 ${session_id}`
      )
    }

    // 获取客服信息
    const [currentAdmin, targetAdmin] = await Promise.all([
      User.findByPk(current_admin_id, { attributes: ['nickname'], transaction }),
      User.findByPk(target_admin_id, { attributes: ['nickname'], transaction })
    ])

    if (!targetAdmin) {
      throw new BusinessError('目标客服不存在', 'CUSTOMER_SERVICE_NOT_FOUND', 404)
    }

    // 更新会话的客服
    await session.update(
      {
        admin_id: target_admin_id,
        status: 'assigned'
      },
      { transaction }
    )

    // 创建系统消息记录转接操作
    const systemMessage = await ChatMessage.create(
      {
        customer_service_session_id: session_id,
        sender_id: null,
        sender_type: 'admin',
        message_source: 'system',
        content: `会话已从 ${currentAdmin?.nickname || '客服'} 转接给 ${targetAdmin.nickname}`,
        message_type: 'system',
        status: 'sent'
      },
      { transaction }
    )

    logger.info('✅ 会话转接成功')

    return {
      customer_service_session_id: session_id,
      new_admin_id: target_admin_id,
      new_admin_name: targetAdmin.nickname,
      system_message_id: systemMessage.chat_message_id
    }
  }

  /**
   * 关闭会话
   *
   * 业务场景：
   * - 客服处理完成，关闭会话
   * - 记录关闭原因和关闭时间
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * @param {number} session_id - 会话ID
   * @param {Object} data - 关闭数据
   * @param {number} data.admin_id - 操作客服ID
   * @param {string} [data.close_reason] - 关闭原因
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 外部事务对象（必填）
   * @returns {Object} 关闭结果
   */
  static async closeSession(session_id, data, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(
      options,
      'CustomerServiceSessionService.closeSession'
    )

    const { admin_id, close_reason = '问题已解决' } = data

    logger.info(`🔒 管理员 ${admin_id} 关闭会话 ${session_id}`)

    // 验证会话
    const session = await CustomerServiceSession.findOne({
      where: { customer_service_session_id: session_id },
      transaction
    })

    if (!session) {
      throw new BusinessError('会话不存在', 'CUSTOMER_SERVICE_NOT_FOUND', 404)
    }

    /*
     * 管理后台的管理员可以关闭任何会话
     * 仅记录日志，不做权限限制
     */
    if (session.admin_id && session.admin_id !== admin_id) {
      logger.info(
        `📝 管理员 ${admin_id} 正在关闭其他管理员 ${session.admin_id} 的会话 ${session_id}`
      )
    }

    // 更新会话状态
    await session.update(
      {
        status: 'closed',
        closed_at: new Date(),
        closed_by: admin_id,
        close_reason
      },
      { transaction }
    )

    // 创建系统消息
    await ChatMessage.create(
      {
        customer_service_session_id: session_id,
        sender_id: null,
        sender_type: 'admin',
        message_source: 'system',
        content: `会话已关闭：${close_reason}`,
        message_type: 'system',
        status: 'sent'
      },
      { transaction }
    )

    logger.info('✅ 会话关闭成功')

    return {
      customer_service_session_id: session_id,
      status: 'closed',
      closed_at: BeijingTimeHelper.formatForAPI(new Date()).iso
    }
  }

  /**
   * 获取会话统计信息
   *
   * 业务场景：
   * - 管理后台显示待处理会话数量
   * - 客服工作量统计
   *
   * @param {number} [admin_id] - 指定客服ID（可选）
   * @returns {Object} 统计信息
   */
  static async getSessionStats(admin_id) {
    try {
      const baseWhere = admin_id ? { admin_id } : {}

      const [waiting, assigned, active, closed] = await Promise.all([
        CustomerServiceSession.count({ where: { ...baseWhere, status: 'waiting' } }),
        CustomerServiceSession.count({ where: { ...baseWhere, status: 'assigned' } }),
        CustomerServiceSession.count({ where: { ...baseWhere, status: 'active' } }),
        CustomerServiceSession.count({ where: { ...baseWhere, status: 'closed' } })
      ])

      return {
        waiting,
        assigned,
        active,
        closed,
        total: waiting + assigned + active + closed,
        active_total: waiting + assigned + active
      }
    } catch (error) {
      logger.error('❌ 获取统计信息失败:', error)
      throw error
    }
  }

  /**
   * 获取或创建会话（支持并发安全）
   *
   * 业务场景：
   * - 用户发起聊天时自动创建或获取现有会话
   * - 支持高并发场景（多个请求同时创建会话）
   *
   * 并发安全机制：
   * 1. 数据库层面：UNIQUE(user_id, is_active_session) 索引保证唯一性
   * 2. 应用层：快速检查 → 创建 → 冲突重试
   * 3. 零锁等待：无需分布式锁，性能最优
   *
   * @param {number} user_id - 用户ID
   * @param {Object} options - 创建选项
   * @param {string} [options.source='mobile'] - 会话来源
   * @param {number} [options.priority=1] - 会话优先级
   * @returns {Promise<Object>} 会话对象
   * @returns {number} return.session_id - 会话ID
   * @returns {string} return.status - 会话状态
   * @returns {string} return.source - 会话来源
   * @returns {Date} return.created_at - 创建时间
   * @returns {boolean} return.is_new - 是否为新创建的会话
   */
  static async getOrCreateSession(user_id, options = {}) {
    try {
      const { source = 'mobile', priority = 1 } = options

      // 定义活跃状态（未关闭的会话）
      const ACTIVE_STATUS = ['waiting', 'assigned', 'active']

      // 🔴 步骤1：快速检查是否已有活跃会话（避免不必要的INSERT）
      const existingSession = await CustomerServiceSession.findOne({
        where: {
          user_id,
          status: ACTIVE_STATUS
        },
        order: [['created_at', 'DESC']]
      })

      if (existingSession) {
        logger.info(`✅ 用户${user_id}使用现有会话: ${existingSession.customer_service_session_id}`)
        return {
          customer_service_session_id: existingSession.customer_service_session_id,
          status: existingSession.status,
          source: existingSession.source,
          created_at: existingSession.created_at,
          is_new: false
        }
      }

      // 🔴 步骤2：创建新会话（依赖数据库唯一索引保证并发安全）
      try {
        const session = await CustomerServiceSession.create({
          user_id,
          status: 'waiting', // 初始状态：waiting（等待客服接单）
          source,
          priority,
          created_at: BeijingTimeHelper.createBeijingTime()
        })

        logger.info(`✅ 用户${user_id}创建新会话成功: ${session.customer_service_session_id}`)
        return {
          customer_service_session_id: session.customer_service_session_id,
          status: session.status,
          source: session.source,
          created_at: session.created_at,
          is_new: true
        }
      } catch (createError) {
        // 🔴 步骤3：处理并发创建冲突（唯一索引约束触发）
        if (createError.name === 'SequelizeUniqueConstraintError') {
          logger.info(`⚠️ 用户${user_id}并发创建会话被数据库唯一索引拦截，查询已创建的会话`)

          // 重新查询现有会话（此时另一个并发请求已成功创建）
          const concurrentSession = await CustomerServiceSession.findOne({
            where: {
              user_id,
              status: ACTIVE_STATUS
            },
            order: [['created_at', 'DESC']]
          })

          if (concurrentSession) {
            logger.info(
              `✅ 用户${user_id}获取并发创建的会话: ${concurrentSession.customer_service_session_id}`
            )
            return {
              customer_service_session_id: concurrentSession.customer_service_session_id,
              status: concurrentSession.status,
              source: concurrentSession.source,
              created_at: concurrentSession.created_at,
              is_new: false
            }
          }

          // 理论上不应该到达这里（唯一索引冲突说明会话必然存在）
          logger.error(`❌ 异常：唯一索引冲突但查询不到活跃会话（用户${user_id}）`)
          throw new BusinessError('会话状态异常，请刷新后重试', 'CUSTOMER_SERVICE_ERROR', 400)
        }

        // 其他创建错误，直接抛出
        throw createError
      }
    } catch (error) {
      logger.error('❌ 获取或创建会话失败:', error)
      throw error
    }
  }

  /**
   * 验证聊天统计数据的逻辑一致性
   *
   * 业务场景：
   * - 防止脏数据影响业务决策
   * - 确保管理后台展示的统计数据准确可信
   * - 数据质量保障和异常检测
   *
   * 验证内容：
   * 1. 基础数值合理性检查（数值>=0且为有限数）
   * 2. 逻辑一致性检查（活跃会话<=总会话等）
   * 3. 业务合理性检查（响应时间<1小时等）
   *
   * @param {Object} stats - 统计数据对象
   * @param {Object} stats.overall - 总体统计
   * @param {number} stats.overall.total_sessions - 总会话数
   * @param {number} stats.overall.active_sessions - 活跃会话数
   * @param {number} stats.overall.waiting_sessions - 等待会话数
   * @param {number} stats.overall.avg_response_time_seconds - 平均响应时间（秒）
   * @param {Object} stats.today - 今日统计
   * @param {number} stats.today.new_sessions - 今日新会话数
   * @param {number} stats.today.avg_messages_per_session - 平均消息数
   * @param {Object} stats.by_status - 按状态统计
   * @returns {Object} 验证结果
   * @returns {boolean} return.valid - 是否通过验证
   * @returns {Array<string>} return.warnings - 警告信息列表
   */
  static validateStatistics(stats) {
    const warnings = []

    // 1️⃣ 基础数值合理性检查（数值必须>=0）
    const numericFields = [
      'total_sessions',
      'active_sessions',
      'waiting_sessions',
      'avg_response_time_seconds',
      'new_sessions',
      'total_messages',
      'closed_sessions',
      'avg_messages_per_session'
    ]

    for (const field of numericFields) {
      // 安全的对象访问
      let value
      if (field.includes('.')) {
        const parts = field.split('.')
        value = stats[parts[0]]?.[parts[1]]
      } else {
        value = stats[field]
      }

      if (value !== undefined && (value < 0 || !isFinite(value))) {
        warnings.push(`${field}数值异常: ${value}（应>=0且为有限数）`)
      }
    }

    // 2️⃣ 逻辑一致性检查
    const { overall, today, by_status } = stats

    if (overall) {
      // 检查：活跃会话数不应超过总会话数
      if (overall.active_sessions > overall.total_sessions) {
        warnings.push(
          `活跃会话数(${overall.active_sessions})超过总会话数(${overall.total_sessions})，数据不一致`
        )
      }

      // 检查：等待会话数不应超过活跃会话数
      if (overall.waiting_sessions > overall.active_sessions) {
        warnings.push(
          `等待会话数(${overall.waiting_sessions})超过活跃会话数(${overall.active_sessions})，数据不一致`
        )
      }

      // 平均响应时间异常检测（>1小时可能异常）
      if (overall.avg_response_time_seconds > 3600) {
        warnings.push(`平均响应时间(${overall.avg_response_time_seconds}秒)超过1小时，可能异常`)
      }
    }

    if (today && overall) {
      // 检查：今日新会话数不应超过总会话数（除非是新系统）
      if (today.new_sessions > overall.total_sessions && overall.total_sessions > 0) {
        warnings.push(
          `今日新会话(${today.new_sessions})超过总会话数(${overall.total_sessions})，可能有误`
        )
      }

      // 平均消息数异常检测（>100可能异常）
      if (today.avg_messages_per_session > 100) {
        warnings.push(`平均消息数(${today.avg_messages_per_session})超过100，可能异常`)
      }
    }

    // 检查：按状态统计的总和应等于总会话数（允许10%误差）
    if (by_status && overall) {
      const statusSum =
        (by_status.waiting || 0) +
        (by_status.assigned || 0) +
        (by_status.active || 0) +
        (by_status.closed || 0)
      const deviation = Math.abs(statusSum - overall.total_sessions) / overall.total_sessions

      if (deviation > 0.1) {
        warnings.push(
          `按状态统计总和(${statusSum})与总会话数(${overall.total_sessions})偏差>10%，数据不一致`
        )
      }
    }

    return { valid: warnings.length === 0, warnings }
  }

  /**
   * 计算客服平均响应时间
   *
   * 业务场景：
   * - 监控客服响应速度（KPI指标）
   * - 支持客服绩效考核
   * - 优化人力资源配置
   * - 服务质量监控
   *
   * 计算逻辑：
   * 1. 查询指定时间范围内已响应的会话（排除waiting状态）
   * 2. 对每个会话计算：客服首次回复时间 - 用户首条消息时间
   * 3. 过滤异常数据（响应时间>1小时）
   * 4. 返回平均值
   *
   * @param {Date} startTime - 开始时间
   * @param {Date} endTime - 结束时间
   * @returns {Promise<number>} 平均响应时间（秒），无数据时返回60
   */
  static async calculateAverageResponseTime(startTime, endTime) {
    try {
      // 1️⃣ 查询已响应的会话（排除未响应的waiting状态）
      const sessions = await CustomerServiceSession.findAll({
        where: {
          created_at: {
            [Op.gte]: startTime,
            [Op.lte]: endTime
          },
          status: {
            [Op.not]: 'waiting'
          }
        },
        attributes: ['customer_service_session_id', 'created_at']
      })

      // 2️⃣ 无数据时返回默认值60秒
      if (sessions.length === 0) {
        logger.info('📊 [平均响应时间] 今日无已响应会话，返回默认值60秒')
        return 60
      }

      let totalResponseTime = 0
      let validSessions = 0

      // 3️⃣ 计算每个会话的响应时间
      for (const session of sessions) {
        // 并行查询该会话的第一条用户消息和第一条客服消息
        // eslint-disable-next-line no-await-in-loop -- 批量计算会话响应时间需要逐个处理
        const [firstUserMsg, firstAdminMsg] = await Promise.all([
          ChatMessage.findOne({
            where: {
              customer_service_session_id: session.customer_service_session_id,
              sender_type: 'user'
            },
            order: [['created_at', 'ASC']],
            attributes: ['created_at']
          }),
          ChatMessage.findOne({
            where: {
              customer_service_session_id: session.customer_service_session_id,
              sender_type: 'admin'
            },
            order: [['created_at', 'ASC']],
            attributes: ['created_at']
          })
        ])

        // 4️⃣ 计算响应时间差
        if (firstUserMsg && firstAdminMsg) {
          const responseTime = (firstAdminMsg.created_at - firstUserMsg.created_at) / 1000

          // 5️⃣ 排除异常数据（响应时间必须>0秒且<1小时）
          if (responseTime > 0 && responseTime < 3600) {
            totalResponseTime += responseTime
            validSessions++
          } else if (responseTime >= 3600) {
            logger.warn(
              `⚠️ [平均响应时间] 异常数据：session_id=${session.customer_service_session_id}，响应时间=${Math.round(responseTime)}秒（>1小时）`
            )
          }
        }
      }

      // 6️⃣ 计算平均值
      if (validSessions === 0) {
        logger.info('📊 [平均响应时间] 无有效数据，返回默认值60秒')
        return 60
      }

      const avgResponseTime = Math.round(totalResponseTime / validSessions)
      logger.info(`📊 [平均响应时间] ${avgResponseTime}秒（基于${validSessions}个有效会话）`)

      return avgResponseTime
    } catch (error) {
      logger.error('❌ 计算平均响应时间失败:', error)
      return 60 // 出错时返回默认值
    }
  }

  /**
   * 搜索聊天消息
   *
   * @description
   * 在当前用户的聊天会话中搜索消息内容。
   * 用户端专用：只在用户自己的会话范围内搜索，确保数据隔离。
   *
   * 业务场景：
   * - 用户在客服聊天界面搜索历史消息
   * - 支持模糊搜索消息文本内容
   *
   * @param {number} user_id - 当前用户ID（数据隔离：只搜索自己的会话）
   * @param {string} keyword - 搜索关键词（必填，至少1个字符）
   * @param {Object} [options] - 查询选项
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量（最大50）
   * @returns {Promise<Object>} { messages, pagination }
   *
   * @throws {Error} BAD_REQUEST - keyword 为空
   */
  static async searchMessages(user_id, keyword, options = {}) {
    const { page = 1, page_size = 20 } = options
    const finalPageSize = Math.min(parseInt(page_size) || 20, 50)
    const finalPage = Math.max(parseInt(page) || 1, 1)
    const offset = (finalPage - 1) * finalPageSize

    if (!keyword || keyword.trim().length === 0) {
      const error = new Error('搜索关键词不能为空')
      error.code = 'BAD_REQUEST'
      error.statusCode = 400
      throw error
    }

    const trimmedKeyword = keyword.trim()

    try {
      logger.info('搜索聊天消息', { user_id, keyword: trimmedKeyword, page: finalPage })

      /*
       * 先查询用户拥有的所有会话ID（数据隔离）
       * 然后在这些会话的消息中搜索内容
       */
      const userSessions = await CustomerServiceSession.findAll({
        where: { user_id },
        attributes: ['customer_service_session_id'],
        raw: true
      })

      if (userSessions.length === 0) {
        return {
          messages: [],
          pagination: { page: finalPage, page_size: finalPageSize, total: 0, total_pages: 0 }
        }
      }

      const sessionIds = userSessions.map(s => s.customer_service_session_id)

      /* 在用户的会话消息中搜索 keyword */
      const { count, rows } = await ChatMessage.findAndCountAll({
        where: {
          customer_service_session_id: { [Op.in]: sessionIds },
          content: { [Op.like]: `%${trimmedKeyword}%` }
        },
        attributes: [
          'chat_message_id',
          'customer_service_session_id',
          'sender_type',
          'content',
          'message_type',
          'created_at'
        ],
        order: [['created_at', 'DESC']],
        limit: finalPageSize,
        offset
      })

      const messages = rows.map(msg => ({
        chat_message_id: msg.chat_message_id,
        customer_service_session_id: msg.customer_service_session_id,
        sender_type: msg.sender_type,
        content: msg.content,
        message_type: msg.message_type,
        created_at: msg.created_at
      }))

      logger.info('搜索聊天消息完成', {
        user_id,
        keyword: trimmedKeyword,
        result_count: count
      })

      return {
        messages,
        pagination: {
          page: finalPage,
          page_size: finalPageSize,
          total: count,
          total_pages: Math.ceil(count / finalPageSize)
        }
      }
    } catch (error) {
      logger.error('搜索聊天消息失败', {
        error: error.message,
        user_id,
        keyword: trimmedKeyword
      })
      throw error
    }
  }

  /**
   * 用户提交满意度评分
   *
   * 业务场景：会话关闭后，用户对客服服务进行1-5星评分
   * 数据写入 customer_service_sessions.satisfaction_score 字段
   *
   * 约束：
   * - 仅已关闭的会话可评分
   * - 仅会话归属用户可评分
   * - 评分不可修改（防止刷分）
   *
   * @param {number} session_id - 会话ID
   * @param {Object} data - 评分数据
   * @param {number} data.user_id - 评分用户ID
   * @param {number} data.satisfaction_score - 满意度评分（1-5）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 外部事务对象（必填）
   * @returns {Object} 评分结果
   */
  /**
   * 客服接单 - 显式认领等待中的会话
   *
   * 业务场景：客服在会话队列中点击"接单"，将 waiting 状态的会话分配给自己
   * 状态流转：waiting → assigned（后续发送消息时自动变为 active）
   *
   * @param {number} session_id - 会话ID（customer_service_session_id）
   * @param {number} admin_id - 客服用户ID
   * @param {Object} options - 选项（必须包含 transaction）
   * @returns {{ customer_service_session_id, status, admin_id }} 更新后的会话信息
   */
  static async acceptSession(session_id, admin_id, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'CustomerServiceSessionService.acceptSession'
    )

    const session = await CustomerServiceSession.findOne({
      where: { customer_service_session_id: session_id },
      transaction
    })

    if (!session) {
      throw new BusinessError('会话不存在', 'CUSTOMER_SERVICE_NOT_FOUND', 404)
    }

    if (session.status !== 'waiting') {
      throw new BusinessError(`仅等待中的会话可接单，当前状态：${session.status}`, 'CUSTOMER_SERVICE_ERROR', 400)
    }

    await session.update({ admin_id, status: 'assigned' }, { transaction })

    logger.info(`📋 客服 ${admin_id} 接单会话 ${session_id}`)

    return {
      customer_service_session_id: session_id,
      status: 'assigned',
      admin_id
    }
  }

  /**
   * 更新会话标签 - 用于分类标记会话问题类型
   *
   * 业务场景：客服对会话打标签（如"交易纠纷"、"已补偿"），便于分类统计和后续查找
   *
   * @param {number} session_id - 会话ID
   * @param {string[]} tags - 标签数组（如 ["交易纠纷", "已补偿"]）
   * @param {number} admin_id - 操作人ID（用于权限校验）
   * @param {Object} options - 选项（必须包含 transaction）
   * @returns {{ customer_service_session_id, tags }} 更新后的标签
   */
  static async updateSessionTags(session_id, tags, admin_id, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'CustomerServiceSessionService.updateSessionTags'
    )

    const session = await CustomerServiceSession.findOne({
      where: { customer_service_session_id: session_id },
      transaction
    })

    if (!session) {
      throw new BusinessError('会话不存在', 'CUSTOMER_SERVICE_NOT_FOUND', 404)
    }

    await session.update({ tags }, { transaction })

    logger.info(`🏷️ 客服 ${admin_id} 更新会话 ${session_id} 标签: ${JSON.stringify(tags)}`)

    return {
      customer_service_session_id: session_id,
      tags
    }
  }

  /**
   * 请求满意度评价 - 通过 WebSocket 向用户推送评价邀请
   *
   * 业务场景：客服处理完问题后，主动邀请用户评价（不需要关闭会话也可以请求）
   * 触发方式：客服点击"请求评价"按钮 → 用户端显示内嵌评分卡片
   *
   * @param {number} session_id - 会话ID
   * @param {number} admin_id - 客服用户ID
   * @returns {{ session_id, user_id, pushed }} 推送结果
   */
  static async requestSatisfactionRating(session_id, admin_id) {
    const session = await CustomerServiceSession.findOne({
      where: { customer_service_session_id: session_id }
    })

    if (!session) {
      throw new BusinessError('会话不存在', 'CUSTOMER_SERVICE_NOT_FOUND', 404)
    }

    if (session.admin_id !== admin_id) {
      throw new BusinessError('仅负责该会话的客服可以请求评价', 'CUSTOMER_SERVICE_ERROR', 400)
    }

    if (session.satisfaction_score !== null) {
      throw new BusinessError('该会话已有评分，无需再次请求', 'CUSTOMER_SERVICE_ERROR', 400)
    }

    /* ChatWebSocketService 导出的是单例实例（非类），直接调用实例方法 */

    let pushed = false
    if (chatWsInstance && chatWsInstance.pushMessageToUser) {
      chatWsInstance.pushMessageToUser(session.user_id, {
        type: 'satisfaction_request',
        session_id
      })
      pushed = true
      logger.info(
        `⭐ 客服 ${admin_id} 向用户 ${session.user_id} 推送满意度评价邀请（会话 ${session_id}）`
      )
    } else {
      logger.warn(`⚠️ WebSocket 服务未启动，无法推送满意度评价邀请（会话 ${session_id}）`)
    }

    return {
      session_id,
      user_id: session.user_id,
      pushed
    }
  }

  /**
   * 用户对已关闭的客服会话提交满意度评分（1-5星）
   *
   * @param {number} session_id - 会话ID（customer_service_session_id）
   * @param {Object} data - 评分数据
   * @param {number} data.user_id - 用户ID
   * @param {number} data.satisfaction_score - 评分（1-5）
   * @param {Object} options - 选项（必须包含 transaction）
   * @returns {Promise<{customer_service_session_id: number, satisfaction_score: number, rated_at: string}>} 评分结果
   */
  static async rateSession(session_id, data, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'CustomerServiceSessionService.rateSession'
    )

    const { user_id, satisfaction_score } = data

    const session = await CustomerServiceSession.findOne({
      where: { customer_service_session_id: session_id },
      transaction
    })

    if (!session) {
      throw new BusinessError('会话不存在', 'CUSTOMER_SERVICE_NOT_FOUND', 404)
    }

    if (session.user_id !== user_id) {
      throw new BusinessError('无权对此会话评分', 'CUSTOMER_SERVICE_ERROR', 400)
    }

    if (session.status !== 'closed') {
      throw new BusinessError('仅已关闭的会话可评分', 'CUSTOMER_SERVICE_ERROR', 400)
    }

    if (session.satisfaction_score !== null) {
      throw new BusinessError('此会话已评分，不可重复评分', 'CUSTOMER_SERVICE_ALREADY_EXISTS', 409)
    }

    await session.update({ satisfaction_score }, { transaction })

    logger.info(`⭐ 用户 ${user_id} 对会话 ${session_id} 评分：${satisfaction_score}`)

    return {
      customer_service_session_id: session_id,
      satisfaction_score,
      rated_at: BeijingTimeHelper.formatForAPI(new Date()).iso
    }
  }
}

module.exports = CustomerServiceSessionService
