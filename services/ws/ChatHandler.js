/**
 * WebSocket 聊天消息处理器（ChatHandler）
 *
 * 职责（从 ChatWebSocketService 拆分，2026-07-11 技术债务方案 7.4-3）：
 * - 处理用户通过 WebSocket 发送的聊天消息（send_message 事件业务逻辑）
 * - 离线消息查询（断线重连会话恢复时由 ConnectionManager 调用）
 *
 * 设计说明：
 * - 本模块不独立注册服务键，仅由 ChatWebSocketService Facade 持有并委托调用
 * - io 实例由 Facade 单一持有，本模块通过 this.service 动态引用（不自行 new）
 * - 消息广播出口统一走 Facade（this.service.broadcastToAllAdmins → EventPublisher）
 * - 纯搬移拆分：所有方法逻辑与拆分前 ChatWebSocketService 完全一致
 */

const wsLogger = require('../../utils/logger').logger
const BeijingTimeHelper = require('../../utils/timeHelper')
const { ChatMessage, CustomerServiceSession } = require('../../models')
const TransactionManager = require('../../utils/TransactionManager')

/**
 * WebSocket 聊天消息处理器类
 * @class ChatHandler
 */
class ChatHandler {
  /**
   * 构造函数
   * @param {Object} service - ChatWebSocketService Facade 实例
   */
  constructor(service) {
    this.service = service
  }

  /**
   * 处理用户通过WebSocket发送的聊天消息（send_message 事件）
   *
   * 业务流程：
   * 1. 参数校验（session_id、content 必填）
   * 2. 通过 CustomerServiceSessionService.sendUserMessage() 写库（含事务）
   * 3. 返回 message_sent 回执给发送者
   * 4. 广播 new_message 给在线管理员
   *
   * 技术说明：
   * - 延迟加载 Service 和 TransactionManager 避免循环依赖
   * - 写操作收口到 Service 层，WebSocket handler 仅做入口编排
   * - 事务边界由 TransactionManager.execute() 统一管理
   *
   * @param {Object} socket - Socket.IO socket对象（已通过握手鉴权，socket.user 可用）
   * @param {Object} data - 消息数据 {session_id, content, message_type, metadata}
   * @returns {Promise<void>} 无返回值，处理结果通过 socket 事件回执
   */
  async handleSendMessage(socket, data) {
    try {
      const senderId = socket.user.user_id
      const { session_id, content, message_type = 'text', metadata } = data

      // ✅ 参数校验
      if (!session_id || !content) {
        socket.emit('message_error', {
          error: 'INVALID_PARAMS',
          message: '缺少 session_id 或 content',
          timestamp: BeijingTimeHelper.now()
        })
        return
      }

      wsLogger.info('收到WebSocket聊天消息', {
        user_id: senderId,
        session_id,
        message_type,
        content_length: content.length
      })

      // ✅ 延迟加载 Service 和 TransactionManager 避免循环依赖
      const message = await new Promise((resolve, reject) => {
        setImmediate(async () => {
          try {
            const CustomerServiceSessionService = require('../CustomerServiceSessionService')
            const result = await TransactionManager.execute(
              async transaction => {
                return await CustomerServiceSessionService.sendUserMessage(
                  session_id,
                  { user_id: senderId, content, message_type, metadata },
                  { transaction }
                )
              },
              {
                description: `WebSocket send_message (user=${senderId}, session=${session_id})`
              }
            )

            resolve(result)
          } catch (err) {
            reject(err)
          }
        })
      })

      // ✅ 发送成功回执给发送者
      socket.emit('message_sent', {
        chat_message_id: message.chat_message_id,
        session_id,
        timestamp: BeijingTimeHelper.now()
      })

      // ✅ 构建 new_message 推送数据，广播给在线管理员
      const msgData = {
        chat_message_id: message.chat_message_id,
        customer_service_session_id: message.customer_service_session_id,
        sender_id: senderId,
        sender_type: 'user',
        content: message.content,
        message_type: message.message_type,
        metadata: message.metadata,
        created_at: message.created_at
      }

      this.service.broadcastToAllAdmins(msgData)

      wsLogger.info('WebSocket聊天消息处理完成', {
        user_id: senderId,
        session_id,
        chat_message_id: message.chat_message_id
      })
    } catch (error) {
      wsLogger.error('处理WebSocket聊天消息失败', {
        user_id: socket.user?.user_id,
        error: error.message,
        stack: error.stack
      })

      // ✅ 根据错误消息返回具体错误码，帮助前端区分原因
      let errorCode = 'SEND_FAILED'
      let errorMsg = '消息发送失败，请重试'

      if (error.message.includes('不存在') || error.message.includes('无权限')) {
        errorCode = 'SESSION_NOT_FOUND'
        errorMsg = '会话不存在或无权限访问'
      } else if (error.message.includes('已关闭')) {
        errorCode = 'SESSION_CLOSED'
        errorMsg = '会话已关闭，无法发送消息'
      }

      socket.emit('message_error', {
        error: errorCode,
        message: errorMsg,
        session_id: data?.session_id,
        timestamp: BeijingTimeHelper.now()
      })
    }
  }

  /**
   * 获取用户的离线消息（用于断线重连后的会话恢复）
   *
   * @description 用户断线重连后，获取其在离线期间收到的消息
   *
   * 业务场景：
   * - 用户网络断开后重新连接，需要获取离线期间的系统通知
   * - 用户从后台切回前台，需要同步最新消息
   * - 客户端重连时调用，确保消息不丢失
   *
   * @param {number} user_id - 用户ID
   * @param {Object} options - 选项
   * @param {Date} [options.since] - 从什么时间开始获取（默认获取最近24小时）
   * @param {number} [options.limit=50] - 限制返回消息数量
   * @returns {Promise<Object>} 离线消息结果 {messages, count, sync_timestamp}
   */
  async getOfflineMessages(user_id, options = {}) {
    const { limit = 50 } = options
    let { since } = options

    // 默认获取最近24小时的消息
    if (!since) {
      since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    }

    try {
      // 1. 查找用户的聊天会话
      const sessions = await CustomerServiceSession.findAll({
        where: { user_id },
        attributes: ['customer_service_session_id']
      })

      if (sessions.length === 0) {
        return {
          messages: [],
          count: 0,
          sync_timestamp: BeijingTimeHelper.now()
        }
      }

      const sessionIds = sessions.map(s => s.customer_service_session_id)

      // 2. 查询离线期间的消息
      const messages = await ChatMessage.findAll({
        where: {
          customer_service_session_id: { [require('sequelize').Op.in]: sessionIds },
          created_at: { [require('sequelize').Op.gte]: since },
          // 只获取系统消息（message_source='system'）或发给用户的消息（管理员发的）
          [require('sequelize').Op.or]: [{ message_source: 'system' }, { sender_type: 'admin' }]
        },
        order: [['created_at', 'ASC']],
        limit
      })

      wsLogger.info('获取离线消息完成', {
        user_id,
        since: since.toISOString(),
        message_count: messages.length
      })

      return {
        messages: messages.map(msg => ({
          chat_message_id: msg.chat_message_id,
          customer_service_session_id: msg.customer_service_session_id,
          content: msg.content,
          message_type: msg.message_type,
          sender_type: msg.sender_type,
          message_source: msg.message_source,
          metadata: msg.metadata,
          created_at: msg.created_at
        })),
        count: messages.length,
        sync_timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      wsLogger.error('获取离线消息失败', {
        user_id,
        error: error.message
      })

      return {
        messages: [],
        count: 0,
        sync_timestamp: BeijingTimeHelper.now(),
        error: error.message
      }
    }
  }
}

module.exports = ChatHandler
