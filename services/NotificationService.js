const logger = require('../utils/logger').logger

/**
 * 通知服务 - 用户通知独立系统（方案B）
 *
 * 功能：
 * 1. 发送用户通知（挂牌、交易、中奖、兑换审核等）→ 写入 user_notifications 表
 * 2. 发送管理员通知（新订单待审核、超时告警）→ WebSocket 广播
 * 3. 支持 WebSocket 实时推送（在线用户）+ 消息持久化（离线用户）
 *
 * 方案B改造：
 * - send() 写入目标从 chat_messages 切换到 user_notifications
 * - 客服聊天回归纯粹人工对话，不再被系统通知淹没
 * - sendToChat() 代码保留但不再作为默认通道
 *
 * 最后更新：2026-02-24 - 方案B通知通道独立化
 *
 */

const BeijingTimeHelper = require('../utils/timeHelper')
const {
  UserNotification,
  ChatMessage,
  CustomerServiceSession,
  User,
  Role,
  Op,
  AdminNotification
} = require('../models')
const ChatWebSocketService = require('./ChatWebSocketService')

/**
 * 通知服务类（静态类，无内部状态）
 * 业务职责：统一管理用户通知和管理员通知
 * 用户通知：写入 user_notifications 表 + WebSocket 推送 new_notification 事件
 * 管理员通知：WebSocket 广播 notification 事件
 */
class NotificationService {
  /**
   * 发送通知给指定用户（写入 user_notifications 表）
   *
   * 方案B改造：写入目标从 chat_messages 切换到 user_notifications，
   * 客服聊天回归纯粹人工对话场景。
   *
   * @param {number} user_id - 用户ID
   * @param {Object} options - 通知选项
   * @param {string} options.type - 通知类型（如 listing_created, purchase_completed）
   * @param {string} options.title - 通知标题（如 "📦 挂牌成功"）
   * @param {string} options.content - 通知内容
   * @param {Object} options.data - 附加业务数据（存入 metadata 字段）
   * @returns {Promise<Object>} 通知结果
   */
  static async send(user_id, options) {
    const { type, title, content, data = {} } = options

    try {
      // ✅ 方案B：写入 user_notifications 表（不再写入 chat_messages）
      const result = await this.sendToNotification(user_id, {
        type,
        title,
        content,
        metadata: data
      })

      logger.info('[通知] 用户通知已发送', {
        user_id,
        type,
        title,
        notification_id: result.notification_id,
        pushed: result.pushed_to_websocket,
        content: content.substring(0, 100)
      })

      return {
        success: true,
        notification_id: result.notification_id,
        user_id,
        type,
        title,
        content,
        data,
        pushed_to_websocket: result.pushed_to_websocket,
        saved_to_database: true,
        timestamp: result.created_at
      }
    } catch (error) {
      logger.error('[通知] 发送失败', {
        user_id,
        type,
        error: error.message
      })

      // 通知发送失败不应该影响业务流程
      return {
        success: false,
        error: error.message,
        user_id,
        type,
        title,
        content
      }
    }
  }

  /**
   * 写入 user_notifications 表并通过 WebSocket 推送（方案B核心方法）
   *
   * @param {number} user_id - 用户ID
   * @param {Object} options - 通知选项
   * @param {string} options.type - 通知类型
   * @param {string} options.title - 通知标题
   * @param {string} options.content - 通知内容
   * @param {Object} options.metadata - 附加业务数据
   * @returns {Promise<Object>} { notification_id, pushed_to_websocket, created_at }
   */
  static async sendToNotification(user_id, options) {
    const { type, title, content, metadata = {} } = options

    // 1. 写入 user_notifications 表（持久化）
    const notification = await UserNotification.create({
      user_id,
      type,
      title,
      content,
      metadata,
      is_read: 0,
      created_at: BeijingTimeHelper.createBeijingTime(),
      updated_at: BeijingTimeHelper.createBeijingTime()
    })

    // 2. 通过 WebSocket 推送 new_notification 事件（在线用户实时收到）
    let pushed = false
    try {
      const notificationData = {
        notification_id: notification.notification_id,
        type,
        title,
        content,
        metadata,
        is_read: 0,
        created_at: notification.created_at
      }

      pushed = ChatWebSocketService.pushNotificationToUser(user_id, notificationData)

      if (pushed) {
        logger.info(`✅ 用户通知已实时推送给用户 ${user_id}`)
      } else {
        logger.info(`📝 用户 ${user_id} 不在线，通知已保存到数据库`)
      }
    } catch (wsError) {
      logger.error('[通知] WebSocket推送失败（不影响通知持久化）:', wsError.message)
    }

    return {
      notification_id: notification.notification_id,
      created_at: notification.created_at,
      pushed_to_websocket: pushed
    }
  }

  /**
   * 通过客服聊天系统发送系统消息
   *
   * @param {number} user_id - 用户ID
   * @param {Object} options - 消息选项
   * @param {string} options.title - 消息标题
   * @param {string} options.content - 消息内容
   * @param {string} options.notification_type - 通知类型
   * @param {Object} options.metadata - 附加元数据
   * @returns {Promise<Object>} 消息发送结果
   */
  static async sendToChat(user_id, options) {
    const { title, content, notification_type, metadata = {} } = options

    // 导入必要的模型和服务

    // 1. 获取或创建用户的客服聊天会话
    const session = await this.getOrCreateCustomerServiceSession(user_id)

    // 2. 构建系统消息内容（包含标题和内容）
    const systemMessageContent = title ? `【${title}】\n${content}` : content

    // 3. 创建系统消息记录（持久化）
    const message = await ChatMessage.create({
      customer_service_session_id: session.customer_service_session_id,
      sender_id: null, // ✅ 系统消息sender_id为NULL（符合外键约束）
      sender_type: 'admin', // 系统消息以admin身份发送
      message_source: 'system', // ✅ 关键：标记为系统消息
      content: systemMessageContent,
      message_type: 'system',
      status: 'sent',
      metadata: {
        notification_type,
        title,
        ...metadata,
        is_system_notification: true
      },
      created_at: BeijingTimeHelper.createBeijingTime(),
      updated_at: BeijingTimeHelper.createBeijingTime()
    })

    // 4. 更新会话的最后消息时间
    await session.update({
      last_message_at: BeijingTimeHelper.createBeijingTime(),
      updated_at: BeijingTimeHelper.createBeijingTime()
    })

    // 5. 通过WebSocket实时推送（如果用户在线）
    let pushed = false
    try {
      const messageData = {
        chat_message_id: message.chat_message_id,
        customer_service_session_id: session.customer_service_session_id,
        sender_id: null, // ✅ 系统消息sender_id为NULL
        sender_type: 'admin',
        sender_name: '系统通知',
        message_source: 'system',
        content: systemMessageContent,
        message_type: 'system',
        notification_type,
        metadata: message.metadata,
        created_at: message.created_at,
        timestamp: BeijingTimeHelper.timestamp()
      }

      pushed = ChatWebSocketService.pushMessageToUser(user_id, messageData)

      if (pushed) {
        logger.info(`✅ 系统通知已实时推送给用户 ${user_id}`)
      } else {
        logger.info(`📝 用户 ${user_id} 不在线，系统通知已保存到数据库`)
      }
    } catch (wsError) {
      logger.error('[通知] WebSocket推送失败:', wsError.message)
      // WebSocket推送失败不影响消息保存
    }

    return {
      chat_message_id: message.chat_message_id,
      customer_service_session_id: session.customer_service_session_id,
      content: systemMessageContent,
      created_at: message.created_at,
      pushed_to_websocket: pushed
    }
  }

  /**
   * 获取或创建用户的客服聊天会话
   *
   * @param {number} user_id - 用户ID
   * @returns {Promise<Object>} 客服聊天会话对象
   */
  static async getOrCreateCustomerServiceSession(user_id) {
    // 1. 查找用户的活跃会话（waiting/assigned/active状态）
    let session = await CustomerServiceSession.findOne({
      where: {
        user_id,
        status: ['waiting', 'assigned', 'active']
      },
      order: [['created_at', 'DESC']]
    })

    // 2. 如果没有活跃会话，创建新会话
    if (!session) {
      session = await CustomerServiceSession.create({
        user_id,
        status: 'waiting',
        source: 'system_notification', // 标记为系统通知创建的会话
        priority: 1,
        created_at: BeijingTimeHelper.createBeijingTime(),
        updated_at: BeijingTimeHelper.createBeijingTime()
      })

      logger.info(`📱 为用户 ${user_id} 创建新的聊天会话（系统通知）`)
    }

    return session
  }

  /**
   * source_type → notification_type 映射（大分类）
   * @private
   * @param {string} sourceType - 来源类型
   * @returns {string} notification_type 枚举值（system/alert/reminder/task）
   */
  static _getNotificationType(sourceType) {
    const alertTypes = [
      'exchange_audit',
      'timeout_alert',
      'asset_reconciliation_alert',
      'business_record_reconciliation_alert',
      'market_monitor_alert',
      'orphan_frozen_alert',
      'orphan_frozen_error'
    ]
    const reminderTypes = ['reminder_alert']
    const taskTypes = ['activity_status_change']

    if (alertTypes.includes(sourceType)) return 'alert'
    if (reminderTypes.includes(sourceType)) return 'reminder'
    if (taskTypes.includes(sourceType)) return 'task'
    return 'system'
  }

  /**
   * source_type → priority 自动映射
   * @private
   * @param {string} sourceType - 来源类型
   * @returns {string} priority 枚举值（low/normal/high/urgent）
   */
  static _getPriority(sourceType) {
    const urgentTypes = ['orphan_frozen_alert']
    const highTypes = [
      'asset_reconciliation_alert',
      'business_record_reconciliation_alert',
      'timeout_alert',
      'orphan_frozen_error'
    ]

    if (urgentTypes.includes(sourceType)) return 'urgent'
    if (highTypes.includes(sourceType)) return 'high'
    return 'normal'
  }

  /**
   * 查询所有活跃管理员（role_level >= 100）
   * 通过 User.belongsToMany(Role, { through: UserRole, as: 'roles' }) 关联查询
   * @private
   * @returns {Promise<number[]>} 管理员 user_id 数组
   */
  static async _getAdminUserIds() {
    const admins = await User.findAll({
      where: { status: 'active' },
      include: [
        {
          model: Role,
          as: 'roles',
          required: true,
          where: {
            role_level: { [Op.gte]: 100 },
            is_active: true
          },
          through: { where: { is_active: true } }
        }
      ],
      attributes: ['user_id']
    })

    return admins.map(a => a.user_id)
  }

  /**
   * 发送通知给所有管理员（持久化到 admin_notifications 表 + WebSocket 广播）
   *
   * 流程：
   * 1. 查询所有活跃管理员（三表 JOIN）
   * 2. 批量写入 AdminNotification（每个管理员一条）— 失败不阻断广播
   * 3. WebSocket 广播（payload 携带 admin_notification_id 用于去重和已读）
   * 4. 返回持久化数量 + 广播数量
   *
   * @param {Object} options - 通知选项
   * @param {string} options.type - 来源类型（source_type），如 exchange_audit、timeout_alert
   * @param {string} options.title - 通知标题
   * @param {string} options.content - 通知内容
   * @param {Object} [options.data={}] - 附加业务数据（存入 extra_data JSON 字段）
   * @param {number} [options.source_id] - 来源实体 ID
   * @returns {Promise<Object>} 通知结果 { success, persisted_count, broadcasted_count, ... }
   */
  static async sendToAdmins(options) {
    const { type, title, content, data = {}, source_id } = options

    let persistedCount = 0
    const adminNotificationMap = new Map()

    // === Step 1 + 2: 持久化到 admin_notifications 表（失败不阻断广播） ===
    try {
      const adminIds = await NotificationService._getAdminUserIds()

      if (adminIds.length > 0) {
        const notificationType = NotificationService._getNotificationType(type)
        const priority = NotificationService._getPriority(type)

        const records = await AdminNotification.bulkCreate(
          adminIds.map(adminId => ({
            admin_id: adminId,
            title,
            content,
            notification_type: notificationType,
            priority,
            source_type: type,
            source_id: source_id || null,
            extra_data: Object.keys(data).length > 0 ? data : null
          }))
        )

        persistedCount = records.length
        records.forEach(r => adminNotificationMap.set(r.admin_id, r.admin_notification_id))

        logger.info('[通知] 管理员通知已持久化', {
          type,
          title,
          persisted_count: persistedCount,
          admin_ids: adminIds
        })
      }
    } catch (persistError) {
      logger.error('[通知] 管理员通知持久化失败（不阻断广播）', {
        type,
        title,
        error: persistError.message
      })
    }

    // === Step 3: WebSocket 广播（无论持久化成败都执行） ===
    let broadcastedCount = 0
    try {
      const basePayload = {
        notification_type: NotificationService._getNotificationType(type),
        source_type: type,
        title,
        content,
        data,
        priority: NotificationService._getPriority(type),
        sender_name: '系统通知',
        timestamp: BeijingTimeHelper.timestamp(),
        created_at: BeijingTimeHelper.createBeijingTime()
      }

      if (adminNotificationMap.size > 0) {
        // 按管理员注入对应的 admin_notification_id，便于前端去重和已读
        for (const [adminId, socketId] of ChatWebSocketService.connectedAdmins.entries()) {
          try {
            const payload = {
              ...basePayload,
              admin_notification_id: adminNotificationMap.get(adminId) || null
            }
            ChatWebSocketService.io.to(socketId).emit('notification', payload)
            broadcastedCount++
          } catch (emitError) {
            logger.error('[通知] 广播通知给管理员失败', {
              admin_id: adminId,
              error: emitError.message
            })
          }
        }
      } else {
        broadcastedCount = ChatWebSocketService.broadcastNotificationToAllAdmins(basePayload)
      }
    } catch (broadcastError) {
      logger.error('[通知] 管理员通知广播失败', {
        type,
        error: broadcastError.message
      })
    }

    logger.info('[通知] 管理员通知发送完成', {
      type,
      title,
      persisted_count: persistedCount,
      broadcasted_count: broadcastedCount,
      content: content.substring(0, 100)
    })

    return {
      success: true,
      target: 'admins',
      type,
      title,
      content,
      data,
      persisted_count: persistedCount,
      broadcasted_count: broadcastedCount,
      timestamp: BeijingTimeHelper.createBeijingTime()
    }
  }

  /**
   * 兑换申请提交通知（通知用户）
   * 业务场景：用户提交兑换申请后，系统发送确认通知
   * @param {number} user_id - 用户ID
   * @param {Object} exchangeData - 兑换数据
   * @returns {Promise<Object>} 通知发送结果
   */
  static async notifyExchangePending(user_id, exchangeData) {
    return await this.send(user_id, {
      type: 'exchange_pending',
      title: '兑换申请已提交',
      content: '您的兑换申请已提交，积分已扣除，请耐心等待管理员审核',
      data: {
        exchange_id: exchangeData.exchange_id,
        item_name: exchangeData.item_name,
        quantity: exchangeData.quantity,
        total_points: exchangeData.total_points
      }
    })
  }

  /**
   * 新订单待审核通知（通知管理员）
   * 业务场景：有新的兑换订单提交，广播通知所有在线管理员
   * @param {Object} exchangeData - 兑换数据
   * @returns {Promise<Object>} 通知发送结果
   */
  static async notifyNewExchangeAudit(exchangeData) {
    return await this.sendToAdmins({
      type: 'exchange_audit',
      title: '新的兑换订单待审核',
      content: `用户${exchangeData.user_id}申请兑换${exchangeData.item_name} × ${exchangeData.quantity}，总计${exchangeData.total_points}分`,
      data: {
        exchange_id: exchangeData.exchange_id,
        user_id: exchangeData.user_id,
        item_name: exchangeData.item_name,
        total_points: exchangeData.total_points,
        product_category: exchangeData.product_category
      }
    })
  }

  /**
   * 审核通过通知（通知用户）
   * 业务场景：兑换申请审核通过，通知用户商品已添加到库存
   * @param {number} user_id - 用户ID
   * @param {Object} exchangeData - 兑换数据
   * @returns {Promise<Object>} 通知发送结果
   */
  static async notifyExchangeApproved(user_id, exchangeData) {
    return await this.send(user_id, {
      type: 'exchange_approved',
      title: '兑换审核通过',
      content: `您的兑换申请已审核通过，${exchangeData.quantity}个${exchangeData.item_name}已添加到库存`,
      data: {
        exchange_id: exchangeData.exchange_id,
        item_name: exchangeData.item_name,
        quantity: exchangeData.quantity
      }
    })
  }

  /**
   * 审核拒绝通知（通知用户）
   * 业务场景：兑换申请审核拒绝，通知用户并说明原因，积分已退回
   * @param {number} user_id - 用户ID
   * @param {Object} exchangeData - 兑换数据
   * @returns {Promise<Object>} 通知发送结果
   */
  static async notifyExchangeRejected(user_id, exchangeData) {
    return await this.send(user_id, {
      type: 'exchange_rejected',
      title: '兑换审核未通过',
      content: `您的兑换申请审核未通过，${exchangeData.total_points}积分已退回。拒绝原因：${exchangeData.reject_reason}`,
      data: {
        exchange_id: exchangeData.exchange_id,
        item_name: exchangeData.item_name,
        total_points: exchangeData.total_points,
        reject_reason: exchangeData.reject_reason
      }
    })
  }

  /**
   * 超时订单告警通知（通知管理员）
   * 业务场景：定时任务检测到有订单待审核超时，广播告警给所有管理员
   * @param {Object} alertData - 告警数据
   * @returns {Promise<Object>} 通知发送结果
   */
  static async notifyTimeoutAlert(alertData) {
    return await this.sendToAdmins({
      type: 'timeout_alert',
      title: '待审核订单超时告警',
      content: `当前有${alertData.count}个订单待审核超过${alertData.timeout_hours}小时，请及时处理`,
      data: {
        timeout_hours: alertData.timeout_hours,
        count: alertData.count,
        statistics: alertData.statistics
      }
    })
  }

  /**
   * 高级空间解锁成功通知（通知用户）
   * 业务场景：用户成功解锁高级空间后，发送确认通知
   * @param {number} user_id - 用户ID
   * @param {Object} unlockData - 解锁数据
   * @returns {Promise<Object>} 通知发送结果
   * @example
   * await NotificationService.notifyPremiumUnlockSuccess(31, {
   *   unlock_cost: 100,
   *   remaining_points: 390012,
   *   expires_at: '2025-11-10 04:37:29',
   *   validity_hours: 24,
   *   is_first_unlock: false
   * })
   */
  static async notifyPremiumUnlockSuccess(user_id, unlockData) {
    const { unlock_cost, remaining_points, expires_at, validity_hours, is_first_unlock } =
      unlockData

    return await this.send(user_id, {
      type: 'premium_unlock_success',
      title: `${is_first_unlock ? '🎉 高级空间首次解锁成功' : '🔄 高级空间重新解锁成功'}`,
      content: `您已成功解锁高级空间功能（支付${unlock_cost}积分），剩余${remaining_points}积分，有效期${validity_hours}小时`,
      data: {
        unlock_cost,
        remaining_points,
        expires_at,
        validity_hours,
        is_first_unlock,
        unlock_time: BeijingTimeHelper.formatForAPI(new Date()).iso
      }
    })
  }

  /**
   * 高级空间即将过期提醒（通知用户）
   * 业务场景：高级空间即将过期时（距离过期<2小时），发送提醒通知
   * @param {number} user_id - 用户ID
   * @param {Object} reminderData - 提醒数据
   * @returns {Promise<Object>} 通知发送结果
   * @example
   * await NotificationService.notifyPremiumExpiringSoon(31, {
   *   expires_at: '2025-11-10 04:37:29',
   *   remaining_hours: 1,
   *   remaining_minutes: 45
   * })
   */
  static async notifyPremiumExpiringSoon(user_id, reminderData) {
    const { expires_at, remaining_hours, remaining_minutes } = reminderData

    return await this.send(user_id, {
      type: 'premium_expiring_soon',
      title: '⏰ 高级空间即将过期',
      content: `您的高级空间访问权限将在${remaining_hours}小时${remaining_minutes % 60}分钟后过期，请及时重新解锁`,
      data: {
        expires_at,
        remaining_hours,
        remaining_minutes,
        unlock_cost: 100,
        reminder_time: BeijingTimeHelper.formatForAPI(new Date()).iso
      }
    })
  }

  /**
   * 高级空间已过期通知（通知用户）
   * 业务场景：高级空间过期后，发送通知提醒用户重新解锁
   * @param {number} user_id - 用户ID
   * @param {Object} expiryData - 过期数据
   * @returns {Promise<Object>} 通知发送结果
   * @example
   * await NotificationService.notifyPremiumExpired(31, {
   *   expired_at: '2025-11-10 04:37:29',
   *   total_unlock_count: 2
   * })
   */
  static async notifyPremiumExpired(user_id, expiryData) {
    const { expired_at, total_unlock_count } = expiryData

    return await this.send(user_id, {
      type: 'premium_expired',
      title: '📅 高级空间已过期',
      content: '您的高级空间访问权限已过期，如需继续使用，请支付100积分重新解锁（有效期24小时）',
      data: {
        expired_at,
        total_unlock_count,
        unlock_cost: 100,
        validity_hours: 24,
        notification_time: BeijingTimeHelper.formatForAPI(new Date()).iso
      }
    })
  }

  /**
   * 通用审核通过通知（支持多种类型）
   * 业务场景：统一处理各类审核通过通知（兑换、图片、反馈等）
   * @param {number} user_id - 用户ID
   * @param {Object} auditData - 审核数据
   * @param {string} auditData.type - 审核类型（exchange/image/feedback）
   * @param {Object} _options - 选项（预留参数）
   * @returns {Promise<Object>} 通知发送结果
   */
  static async sendAuditApprovedNotification(user_id, auditData, _options = {}) {
    const { type } = auditData

    const notificationMap = {
      exchange: {
        title: '兑换审核通过',
        content: `您的兑换申请已审核通过，${auditData.quantity}个${auditData.item_name}已添加到库存`
      },
      image: {
        title: '图片审核通过',
        content:
          auditData.points_awarded > 0
            ? `您上传的图片已审核通过，奖励${auditData.points_awarded}积分`
            : '您上传的图片已审核通过'
      },
      feedback: {
        title: '反馈审核通过',
        content: '您的反馈已通过审核，我们将尽快处理'
      }
    }

    const notification = notificationMap[type] || {
      title: '审核通过',
      content: '您的申请已审核通过'
    }

    return await this.send(user_id, {
      type: `${type}_approved`,
      title: notification.title,
      content: notification.content,
      data: auditData
    })
  }

  /**
   * 通用审核拒绝通知（支持多种类型）
   * 业务场景：统一处理各类审核拒绝通知（兑换、图片、反馈等）
   * @param {number} user_id - 用户ID
   * @param {Object} auditData - 审核数据
   * @param {string} auditData.type - 审核类型（exchange/image/feedback）
   * @param {string} auditData.reason - 拒绝原因
   * @param {Object} _options - 选项（预留参数）
   * @returns {Promise<Object>} 通知发送结果
   */
  static async sendAuditRejectedNotification(user_id, auditData, _options = {}) {
    const { type, reason } = auditData

    const notificationMap = {
      exchange: {
        title: '兑换审核未通过',
        content: `您的兑换申请审核未通过，${auditData.refunded_points}积分已退回。拒绝原因：${reason}`
      },
      image: {
        title: '图片审核未通过',
        content: `您上传的图片审核未通过。原因：${reason}`
      },
      feedback: {
        title: '反馈审核未通过',
        content: `您的反馈未通过审核。原因：${reason}`
      }
    }

    const notification = notificationMap[type] || {
      title: '审核未通过',
      content: `您的申请未通过审核。原因：${reason}`
    }

    return await this.send(user_id, {
      type: `${type}_rejected`,
      title: notification.title,
      content: notification.content,
      data: auditData
    })
  }

  /**
   * 抽奖中奖通知
   *
   * @param {number} user_id - 用户ID
   * @param {Object} lotteryData - 抽奖数据
   * @param {string} lotteryData.prize_name - 奖品名称
   * @param {string} lotteryData.prize_type - 奖品类型
   * @param {number} lotteryData.prize_value - 奖品价值
   * @param {string} lotteryData.lottery_draw_id - 抽奖记录ID
   * @returns {Promise<Object>} 通知结果
   */
  static async notifyLotteryWin(user_id, lotteryData) {
    const { prize_name, prize_type, prize_value, lottery_draw_id } = lotteryData

    // 根据奖品类型定制消息
    let content = `恭喜您在抽奖中获得【${prize_name}】！`

    if (prize_type === 'points') {
      content += `已为您发放${prize_value}积分，请查收！`
    } else if (prize_type === 'product') {
      content += '商品已添加到您的库存中，请前往"我的库存"查看。'
    } else if (prize_type === 'voucher') {
      content += '优惠券已添加到您的库存中，请尽快使用。'
    }

    return await this.send(user_id, {
      type: 'lottery_win',
      title: '🎉 恭喜中奖',
      content,
      data: {
        lottery_draw_id,
        prize_name,
        prize_type,
        prize_value,
        ...lotteryData
      }
    })
  }

  /**
   * 积分变动通知
   *
   * @param {number} user_id - 用户ID
   * @param {Object} pointsData - 积分数据
   * @param {string} pointsData.change_type - 变动类型（earn/consume）
   * @param {number} pointsData.points_amount - 积分数量
   * @param {string} pointsData.reason - 变动原因
   * @param {number} pointsData.balance_after - 变动后余额
   * @returns {Promise<Object>} 通知结果
   */
  static async notifyPointsChange(user_id, pointsData) {
    const { change_type, points_amount, reason, balance_after } = pointsData

    const isEarn = change_type === 'earn'
    const title = isEarn ? '积分到账' : '积分消费'
    const content = isEarn
      ? `您获得了${points_amount}积分！原因：${reason}。当前余额：${balance_after}分`
      : `您消费了${points_amount}积分。原因：${reason}。当前余额：${balance_after}分`

    return await this.send(user_id, {
      type: isEarn ? 'points_earned' : 'points_consumed',
      title,
      content,
      data: pointsData
    })
  }

  /**
   * 系统公告通知
   *
   * @param {number|null} user_id - 用户ID，null表示广播给所有管理员
   * @param {Object} announcementData - 公告数据
   * @param {string} announcementData.title - 公告标题
   * @param {string} announcementData.content - 公告内容
   * @param {string} announcementData.announcement_type - 公告类型
   * @returns {Promise<Object>} 通知结果
   */
  static async notifyAnnouncement(user_id, announcementData) {
    const { title, content, announcement_type } = announcementData

    if (user_id) {
      return await this.send(user_id, {
        type: 'system_announcement',
        title: `📢 ${title}`,
        content,
        data: {
          announcement_type,
          ...announcementData
        }
      })
    } else {
      return await this.sendToAdmins({
        type: 'system_announcement',
        title: `📢 ${title}`,
        content,
        data: {
          announcement_type,
          ...announcementData
        }
      })
    }
  }

  /**
   * 账户安全通知
   *
   * @param {number} user_id - 用户ID
   * @param {Object} securityData - 安全数据
   * @param {string} securityData.event_type - 事件类型
   * @param {string} securityData.description - 事件描述
   * @param {string} securityData.ip_address - IP地址
   * @returns {Promise<Object>} 通知结果
   */
  static async notifySecurityEvent(user_id, securityData) {
    const { description, ip_address } = securityData

    return await this.send(user_id, {
      type: 'security_alert',
      title: '🔐 账户安全提醒',
      content: `${description}${ip_address ? `（IP: ${ip_address}）` : ''}。如非本人操作，请及时联系客服。`,
      data: securityData
    })
  }

  // ==================== 抽奖活动状态变更通知（2026-01-28新增）====================

  /**
   * 活动状态变更广播（Task 7.2）
   *
   * 业务场景：当抽奖活动状态发生变化时（启动/暂停/结束），实时通知相关用户
   * 通知对象：
   * - 所有管理员：通过WebSocket广播通知，用于管理后台实时更新
   * - 相关用户：通过系统消息通知，用于前端展示活动状态
   *
   * @param {Object} activityData - 活动数据
   * @param {string} activityData.campaign_code - 活动编码
   * @param {string} activityData.campaign_name - 活动名称
   * @param {string} activityData.old_status - 原状态
   * @param {string} activityData.new_status - 新状态
   * @param {number} [activityData.operator_id] - 操作人ID
   * @param {string} [activityData.reason] - 状态变更原因
   * @returns {Promise<Object>} 通知结果
   */
  static async notifyActivityStatusChange(activityData) {
    const { campaign_code, campaign_name, old_status, new_status, operator_id, reason } =
      activityData

    // 状态变更消息映射
    const statusMessageMap = {
      active: {
        title: '🎉 抽奖活动已开始',
        content: `【${campaign_name}】活动已开始，快来参与抽奖吧！`,
        admin_content: `活动【${campaign_name}】已启动（${campaign_code}）`
      },
      paused: {
        title: '⏸️ 抽奖活动已暂停',
        content: `【${campaign_name}】活动已暂停${reason ? `，原因：${reason}` : ''}`,
        admin_content: `活动【${campaign_name}】已暂停（${campaign_code}）`
      },
      ended: {
        title: '🏁 抽奖活动已结束',
        content: `【${campaign_name}】活动已结束，感谢您的参与！`,
        admin_content: `活动【${campaign_name}】已结束（${campaign_code}）`
      },
      draft: {
        title: '📝 抽奖活动已保存',
        content: `【${campaign_name}】活动配置已保存为草稿`,
        admin_content: `活动【${campaign_name}】已保存为草稿（${campaign_code}）`
      }
    }

    const statusMessage = statusMessageMap[new_status] || {
      title: '📢 活动状态变更',
      content: `【${campaign_name}】活动状态已更新`,
      admin_content: `活动【${campaign_name}】状态已变更（${campaign_code}）`
    }

    const results = {
      success: true,
      admin_notification: null,
      user_notification: null
    }

    try {
      // 1. 广播给所有在线管理员
      results.admin_notification = await this.sendToAdmins({
        type: 'activity_status_change',
        title: statusMessage.title,
        content: statusMessage.admin_content,
        data: {
          campaign_code,
          campaign_name,
          old_status,
          new_status,
          operator_id,
          reason,
          timestamp: BeijingTimeHelper.formatForAPI(new Date()).iso
        }
      })

      // 记录广播日志
      logger.info('[通知] 活动状态变更已广播给管理员', {
        campaign_code,
        old_status,
        new_status,
        broadcasted_count: results.admin_notification.broadcasted_count
      })
    } catch (error) {
      logger.error('[通知] 管理员广播失败', {
        campaign_code,
        error: error.message
      })
      results.admin_notification = { success: false, error: error.message }
    }

    return results
  }

  /**
   * 活动启动通知（快捷方法）
   *
   * @param {Object} activityData - 活动数据
   * @returns {Promise<Object>} 通知结果
   */
  static async notifyActivityStarted(activityData) {
    return await this.notifyActivityStatusChange({
      ...activityData,
      old_status: activityData.old_status || 'draft',
      new_status: 'active'
    })
  }

  /**
   * 活动暂停通知（快捷方法）
   *
   * @param {Object} activityData - 活动数据
   * @returns {Promise<Object>} 通知结果
   */
  static async notifyActivityPaused(activityData) {
    return await this.notifyActivityStatusChange({
      ...activityData,
      old_status: activityData.old_status || 'active',
      new_status: 'paused'
    })
  }

  /**
   * 活动结束通知（快捷方法）
   *
   * @param {Object} activityData - 活动数据
   * @returns {Promise<Object>} 通知结果
   */
  static async notifyActivityEnded(activityData) {
    return await this.notifyActivityStatusChange({
      ...activityData,
      old_status: activityData.old_status || 'active',
      new_status: 'ended'
    })
  }

  // ==================== 交易市场材料交易通知 ====================

  /**
   * 挂牌创建成功通知（卖家）
   *
   * @param {number} user_id - 卖家用户ID
   * @param {Object} listingData - 挂牌数据
   * @param {number} listingData.market_listing_id - 挂牌ID（数据库主键字段名）
   * @param {string} listingData.offer_asset_code - 挂卖资产代码
   * @param {number} listingData.offer_amount - 挂卖数量
   * @param {number} listingData.price_amount - 定价金额
   * @returns {Promise<Object>} 通知结果
   */
  static async notifyListingCreated(user_id, listingData) {
    const { market_listing_id, offer_asset_code, offer_amount, price_amount } = listingData

    return await this.send(user_id, {
      type: 'listing_created',
      title: '📦 挂牌成功',
      content: `您的 ${offer_amount} 个 ${offer_asset_code} 已成功上架，标价 ${price_amount} 星石。资产已冻结，等待买家购买。`,
      data: {
        market_listing_id,
        offer_asset_code,
        offer_amount,
        price_amount,
        action: 'listing_created'
      }
    })
  }

  /**
   * 挂牌售出通知（卖家）
   *
   * @param {number} user_id - 卖家用户ID
   * @param {Object} saleData - 销售数据
   * @param {number} saleData.market_listing_id - 挂牌ID（数据库主键字段名）
   * @param {string} saleData.offer_asset_code - 售出资产代码
   * @param {number} saleData.offer_amount - 售出数量
   * @param {number} saleData.price_amount - 成交金额
   * @param {number} saleData.net_amount - 实际到账（扣除手续费）
   * @param {number} saleData.buyer_user_id - 买家用户ID
   * @returns {Promise<Object>} 通知结果
   */
  static async notifyListingSold(user_id, saleData) {
    const { market_listing_id, offer_asset_code, offer_amount, price_amount, net_amount } = saleData

    return await this.send(user_id, {
      type: 'listing_sold',
      title: '💰 售出成功',
      content: `恭喜！您的 ${offer_amount} 个 ${offer_asset_code} 已售出，成交价 ${price_amount} 星石，实际到账 ${net_amount} 星石（扣除5%手续费）。`,
      data: {
        market_listing_id,
        offer_asset_code,
        offer_amount,
        price_amount,
        net_amount,
        action: 'listing_sold'
      }
    })
  }

  /**
   * 购买成功通知（买家）
   *
   * @param {number} user_id - 买家用户ID
   * @param {Object} purchaseData - 购买数据
   * @param {number} purchaseData.order_id - 订单ID
   * @param {string} purchaseData.offer_asset_code - 购买的资产代码
   * @param {number} purchaseData.offer_amount - 购买数量
   * @param {number} purchaseData.price_amount - 支付金额
   * @returns {Promise<Object>} 通知结果
   */
  static async notifyPurchaseCompleted(user_id, purchaseData) {
    const { order_id, offer_asset_code, offer_amount, price_amount } = purchaseData

    return await this.send(user_id, {
      type: 'purchase_completed',
      title: '🎉 购买成功',
      content: `您已成功购买 ${offer_amount} 个 ${offer_asset_code}，支付 ${price_amount} 星石。资产已到账，请在背包中查看。`,
      data: {
        order_id,
        offer_asset_code,
        offer_amount,
        price_amount,
        action: 'purchase_completed'
      }
    })
  }

  /**
   * 挂牌撤回通知（卖家）
   *
   * @param {number} user_id - 卖家用户ID
   * @param {Object} withdrawData - 撤回数据
   * @param {number} withdrawData.market_listing_id - 挂牌ID（数据库主键字段名）
   * @param {string} withdrawData.offer_asset_code - 撤回资产代码
   * @param {number} withdrawData.offer_amount - 撤回数量
   * @param {string} [withdrawData.reason='用户主动撤回'] - 撤回原因
   * @returns {Promise<Object>} 通知结果
   */
  static async notifyListingWithdrawn(user_id, withdrawData) {
    const {
      market_listing_id,
      offer_asset_code,
      offer_amount,
      reason = '用户主动撤回'
    } = withdrawData

    return await this.send(user_id, {
      type: 'listing_withdrawn',
      title: '📤 挂牌已撤回',
      content: `您的 ${offer_amount} 个 ${offer_asset_code} 挂牌已撤回（${reason}）。资产已解冻至您的可用余额。`,
      data: {
        market_listing_id,
        offer_asset_code,
        offer_amount,
        reason,
        action: 'listing_withdrawn'
      }
    })
  }

  /**
   * 挂牌过期通知（卖家）
   *
   * @param {number} user_id - 卖家用户ID
   * @param {Object} expireData - 过期数据
   * @param {number} expireData.market_listing_id - 挂牌ID（数据库主键字段名）
   * @param {string} expireData.offer_asset_code - 过期资产代码
   * @param {number} expireData.offer_amount - 过期数量
   * @returns {Promise<Object>} 通知结果
   */
  static async notifyListingExpired(user_id, expireData) {
    const { market_listing_id, offer_asset_code, offer_amount } = expireData

    return await this.send(user_id, {
      type: 'listing_expired',
      title: '⏰ 挂牌已过期',
      content: `您的 ${offer_amount} 个 ${offer_asset_code} 挂牌已超时（3天），系统已自动撤回并解冻资产。如需继续出售，请重新上架。`,
      data: {
        market_listing_id,
        offer_asset_code,
        offer_amount,
        action: 'listing_expired'
      }
    })
  }

  // ==================== 竞价通知（臻选空间/幸运空间 2026-02-16）====================

  /**
   * 竞价被超越通知（被超越的出价者）
   *
   * 业务场景：用户 A 是当前最高出价者，用户 B 提交了更高出价，
   * 系统通知用户 A 其出价已被超越，可考虑重新出价。
   *
   * @param {number} user_id - 被超越的出价者用户ID
   * @param {Object} bidData - 竞价数据
   * @param {number} bidData.bid_product_id - 竞价商品ID
   * @param {string} bidData.item_name - 竞价商品名称
   * @param {number} bidData.my_bid_amount - 用户之前的出价金额
   * @param {number} bidData.new_highest - 新的最高出价金额
   * @param {string} bidData.price_asset_code - 竞价资产类型
   * @returns {Promise<Object>} 通知结果
   */
  static async notifyBidOutbid(user_id, bidData) {
    const { bid_product_id, item_name, my_bid_amount, new_highest, price_asset_code } = bidData

    // 1. 通过聊天系统发送持久化通知（离线用户上线后可查看）
    const chatResult = await this.send(user_id, {
      type: 'bid_outbid',
      title: '⚠️ 您的竞价已被超越',
      content: `您对【${item_name}】的出价 ${my_bid_amount} ${price_asset_code} 已被超越，当前最高价 ${new_highest} ${price_asset_code}。如需继续竞拍，请提交更高出价。`,
      data: {
        bid_product_id,
        item_name,
        my_bid_amount,
        new_highest,
        price_asset_code,
        action: 'bid_outbid'
      }
    })

    // 2. 额外推送专用 WebSocket 事件（前端可独立监听 bid_outbid 事件）
    try {
      ChatWebSocketService.pushBidOutbid(user_id, {
        bid_product_id,
        item_name,
        my_bid_amount,
        new_highest,
        price_asset_code
      })
    } catch (wsError) {
      logger.warn('[竞价通知] WebSocket推送 bid_outbid 失败（非致命）', { error: wsError.message })
    }

    return chatResult
  }

  /**
   * 竞价中标通知（中标者/赢家）
   *
   * 业务场景：竞价结算完成后，通知中标用户其竞价成功，
   * 商品已添加到背包，冻结资产已正式扣除。
   *
   * @param {number} user_id - 中标用户ID
   * @param {Object} bidData - 竞价数据
   * @param {number} bidData.bid_product_id - 竞价商品ID
   * @param {string} bidData.item_name - 竞价商品名称
   * @param {number} bidData.winning_amount - 中标金额
   * @param {string} bidData.price_asset_code - 竞价资产类型
   * @returns {Promise<Object>} 通知结果
   */
  static async notifyBidWon(user_id, bidData) {
    const { bid_product_id, item_name, winning_amount, price_asset_code } = bidData

    // 1. 通过聊天系统发送持久化通知
    const chatResult = await this.send(user_id, {
      type: 'bid_won',
      title: '🎉 恭喜中标',
      content: `恭喜！您以 ${winning_amount} ${price_asset_code} 成功拍得【${item_name}】。商品已添加到您的背包，请前往查看。`,
      data: {
        bid_product_id,
        item_name,
        winning_amount,
        price_asset_code,
        action: 'bid_won'
      }
    })

    // 2. 额外推送专用 WebSocket 事件（前端可独立监听 bid_won 事件）
    try {
      ChatWebSocketService.pushBidWon(user_id, {
        bid_product_id,
        item_name,
        winning_amount,
        price_asset_code
      })
    } catch (wsError) {
      logger.warn('[竞价通知] WebSocket推送 bid_won 失败（非致命）', { error: wsError.message })
    }

    return chatResult
  }

  /**
   * 竞价落选通知（未中标者）
   *
   * 业务场景：竞价结算完成后，通知落选用户其竞价未成功，
   * 冻结资产已解冻返还。
   *
   * @param {number} user_id - 落选用户ID
   * @param {Object} bidData - 竞价数据
   * @param {number} bidData.bid_product_id - 竞价商品ID
   * @param {string} bidData.item_name - 竞价商品名称
   * @param {number} bidData.my_bid_amount - 用户的出价金额
   * @param {number} bidData.winning_amount - 中标金额
   * @param {string} bidData.price_asset_code - 竞价资产类型
   * @returns {Promise<Object>} 通知结果
   */
  static async notifyBidLost(user_id, bidData) {
    const { bid_product_id, item_name, my_bid_amount, winning_amount, price_asset_code } = bidData

    // 1. 通过聊天系统发送持久化通知
    const chatResult = await this.send(user_id, {
      type: 'bid_lost',
      title: '📤 竞价未中标',
      content: `很遗憾，您对【${item_name}】的出价 ${my_bid_amount} ${price_asset_code} 未中标（中标价 ${winning_amount} ${price_asset_code}）。您的冻结资产已解冻返还。`,
      data: {
        bid_product_id,
        item_name,
        my_bid_amount,
        winning_amount,
        price_asset_code,
        action: 'bid_lost'
      }
    })

    // 2. 额外推送专用 WebSocket 事件（前端可独立监听 bid_lost 事件）
    try {
      ChatWebSocketService.pushBidLost(user_id, {
        bid_product_id,
        item_name,
        my_bid_amount,
        winning_amount,
        price_asset_code
      })
    } catch (wsError) {
      logger.warn('[竞价通知] WebSocket推送 bid_lost 失败（非致命）', { error: wsError.message })
    }

    return chatResult
  }

  /*
   * ========================================
   * 用户通知查询方法（供路由层通过 ServiceManager 调用）
   * ========================================
   */

  /**
   * 获取用户通知列表（分页）
   *
   * @param {number} userId - 用户ID
   * @param {Object} [options={}] - 查询选项
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.pageSize=20] - 每页数量（最大50）
   * @param {string} [options.type] - 按通知类型筛选
   * @param {string} [options.isRead] - 按已读状态筛选（'0'未读 / '1'已读）
   * @returns {Promise<{notifications: Array, pagination: Object}>} 通知列表和分页信息
   */
  static async getNotifications(userId, options = {}) {
    const page = Math.max(1, parseInt(options.page) || 1)
    const pageSize = Math.min(50, Math.max(1, parseInt(options.pageSize) || 20))

    const where = { user_id: userId }

    if (options.type) {
      where.type = options.type
    }

    if (options.isRead !== undefined && options.isRead !== '') {
      where.is_read = parseInt(options.isRead) === 1 ? 1 : 0
    }

    const { count: totalCount, rows: notifications } = await UserNotification.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
      attributes: [
        'notification_id',
        'type',
        'title',
        'content',
        'metadata',
        'is_read',
        'read_at',
        'created_at'
      ]
    })

    const totalPages = Math.ceil(totalCount / pageSize)

    return {
      notifications,
      pagination: {
        page,
        page_size: pageSize,
        total: totalCount,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1
      }
    }
  }

  /**
   * 获取用户未读通知数量（铃铛角标数据源）
   *
   * @param {number} userId - 用户ID
   * @returns {Promise<number>} 未读数量
   */
  static async getUnreadCount(userId) {
    return UserNotification.getUnreadCount(userId)
  }

  /**
   * 批量标记通知为已读
   *
   * @param {number} userId - 用户ID
   * @param {number[]} [notificationIds] - 通知ID列表（空/不传则全部标记已读）
   * @returns {Promise<number>} 实际标记数量
   */
  static async markBatchAsRead(userId, notificationIds) {
    return UserNotification.markBatchAsRead(userId, notificationIds)
  }

  /**
   * 单条标记通知为已读
   *
   * @param {number} userId - 用户ID
   * @param {number} notificationId - 通知ID
   * @returns {Promise<{notification_id: number, is_read: number, read_at: Date}|null>} 更新后的通知数据，不存在返回 null
   */
  static async markSingleAsRead(userId, notificationId) {
    const notification = await UserNotification.findOne({
      where: { notification_id: notificationId, user_id: userId }
    })

    if (!notification) {
      return null
    }

    if (notification.is_read === 1) {
      return {
        notification_id: notification.notification_id,
        is_read: 1,
        read_at: notification.read_at,
        already_read: true
      }
    }

    await notification.markAsRead()

    return {
      notification_id: notification.notification_id,
      is_read: 1,
      read_at: notification.read_at,
      already_read: false
    }
  }
}

module.exports = NotificationService
