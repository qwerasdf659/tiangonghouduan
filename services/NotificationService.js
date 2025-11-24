/**
 * 通知服务 - 统一客服聊天系统通知
 *
 * 功能：
 * 1. 发送用户通知（兑换审核结果、抽奖结果等）
 * 2. 发送管理员通知（新订单待审核、超时告警）
 * 3. 通过客服聊天系统发送系统消息
 * 4. 支持WebSocket实时推送（在线用户）+ 消息持久化（离线用户）
 *
 * 实现方式：
 * - 所有通知通过客服聊天系统的系统消息发送
 * - 在线用户：WebSocket实时推送
 * - 离线用户：消息持久化在ChatMessage表，用户上线后可查看
 *
 * 创建时间：2025-10-10
 * 最后更新：2025-10-11 - 集成客服聊天系统
 */

const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 通知服务类
 * 业务职责：统一管理用户通知和管理员通知，集成客服聊天系统
 * 实现方式：在线用户WebSocket实时推送 + 离线用户消息持久化
 * 设计模式：通知服务层，支持多种通知类型（兑换、抽奖、积分、审核等）
 */
class NotificationService {
  /**
   * 发送通知给指定用户（通过客服聊天系统）
   *
   * @param {number} user_id - 用户ID
   * @param {Object} options - 通知选项
   * @param {string} options.type - 通知类型
   * @param {string} options.title - 通知标题
   * @param {string} options.content - 通知内容
   * @param {Object} options.data - 附加数据
   * @returns {Promise<Object>} 通知结果
   */
  static async send (user_id, options) {
    const { type, title, content, data = {} } = options

    try {
      // ✅ 通过客服聊天系统发送系统通知
      const result = await this.sendToChat(user_id, {
        title,
        content,
        notification_type: type,
        metadata: data
      })

      // 记录通知日志
      console.log('[通知] 系统通知已发送', {
        user_id,
        type,
        title,
        message_id: result.message_id,
        pushed: result.pushed_to_websocket,
        content: content.substring(0, 100) // 限制日志长度
      })

      return {
        success: true,
        notification_id: result.message_id,
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
      console.error('[通知] 发送失败', {
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
  static async sendToChat (user_id, options) {
    const { title, content, notification_type, metadata = {} } = options

    // 导入必要的模型和服务
    const { ChatMessage } = require('../models')
    const ChatWebSocketService = require('./ChatWebSocketService')

    // 1. 获取或创建用户的客服聊天会话
    const session = await this.getOrCreateCustomerServiceSession(user_id)

    // 2. 构建系统消息内容（包含标题和内容）
    const systemMessageContent = title ? `【${title}】\n${content}` : content

    // 3. 创建系统消息记录（持久化）
    const message = await ChatMessage.create({
      session_id: session.session_id,
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
        message_id: message.message_id,
        session_id: session.session_id,
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
        console.log(`✅ 系统通知已实时推送给用户 ${user_id}`)
      } else {
        console.log(`📝 用户 ${user_id} 不在线，系统通知已保存到数据库`)
      }
    } catch (wsError) {
      console.error('[通知] WebSocket推送失败:', wsError.message)
      // WebSocket推送失败不影响消息保存
    }

    return {
      message_id: message.message_id,
      session_id: session.session_id,
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
  static async getOrCreateCustomerServiceSession (user_id) {
    const { CustomerServiceSession } = require('../models')

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

      console.log(`📱 为用户 ${user_id} 创建新的聊天会话（系统通知）`)
    }

    return session
  }

  /**
   * 发送通知给所有管理员（通过WebSocket广播）
   *
   * @param {Object} options - 通知选项
   * @param {string} options.type - 通知类型
   * @param {string} options.title - 通知标题
   * @param {string} options.content - 通知内容
   * @param {Object} options.data - 附加数据
   * @returns {Promise<Object>} 通知结果
   */
  static async sendToAdmins (options) {
    const { type, title, content, data = {} } = options

    try {
      const ChatWebSocketService = require('./ChatWebSocketService')

      // 构建管理员通知消息（特殊格式，不保存到数据库）
      const adminNotification = {
        notification_type: 'admin_alert',
        type,
        title,
        content,
        data,
        sender_name: '系统通知',
        timestamp: BeijingTimeHelper.timestamp(),
        created_at: BeijingTimeHelper.createBeijingTime()
      }

      // ✅ 广播通知给所有在线管理员（使用notification事件）
      const count = ChatWebSocketService.broadcastNotificationToAllAdmins(adminNotification)

      // 记录管理员通知日志
      console.log('[通知] 管理员通知已广播', {
        type,
        title,
        online_admins: count,
        content: content.substring(0, 100)
      })

      return {
        success: true,
        notification_id: `admin_notif_${BeijingTimeHelper.generateIdTimestamp()}`,
        target: 'admins',
        type,
        title,
        content,
        data,
        broadcasted_count: count,
        timestamp: adminNotification.created_at
      }
    } catch (error) {
      console.error('[通知] 管理员通知发送失败', {
        type,
        error: error.message
      })

      return {
        success: false,
        error: error.message,
        type,
        title,
        content
      }
    }
  }

  /**
   * 兑换申请提交通知（通知用户）
   * 业务场景：用户提交兑换申请后，系统发送确认通知
   * @param {number} user_id - 用户ID
   * @param {Object} exchangeData - 兑换数据
   * @returns {Promise<Object>} 通知发送结果
   */
  static async notifyExchangePending (user_id, exchangeData) {
    return await this.send(user_id, {
      type: 'exchange_pending',
      title: '兑换申请已提交',
      content: '您的兑换申请已提交，积分已扣除，请耐心等待管理员审核',
      data: {
        exchange_id: exchangeData.exchange_id,
        product_name: exchangeData.product_name,
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
  static async notifyNewExchangeAudit (exchangeData) {
    return await this.sendToAdmins({
      type: 'new_exchange_audit',
      title: '新的兑换订单待审核',
      content: `用户${exchangeData.user_id}申请兑换${exchangeData.product_name} × ${exchangeData.quantity}，总计${exchangeData.total_points}分`,
      data: {
        exchange_id: exchangeData.exchange_id,
        user_id: exchangeData.user_id,
        product_name: exchangeData.product_name,
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
  static async notifyExchangeApproved (user_id, exchangeData) {
    return await this.send(user_id, {
      type: 'exchange_approved',
      title: '兑换审核通过',
      content: `您的兑换申请已审核通过，${exchangeData.quantity}个${exchangeData.product_name}已添加到库存`,
      data: {
        exchange_id: exchangeData.exchange_id,
        product_name: exchangeData.product_name,
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
  static async notifyExchangeRejected (user_id, exchangeData) {
    return await this.send(user_id, {
      type: 'exchange_rejected',
      title: '兑换审核未通过',
      content: `您的兑换申请审核未通过，${exchangeData.total_points}积分已退回。拒绝原因：${exchangeData.reject_reason}`,
      data: {
        exchange_id: exchangeData.exchange_id,
        product_name: exchangeData.product_name,
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
  static async notifyTimeoutAlert (alertData) {
    return await this.sendToAdmins({
      type: 'pending_orders_alert',
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
  static async notifyPremiumUnlockSuccess (user_id, unlockData) {
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
  static async notifyPremiumExpiringSoon (user_id, reminderData) {
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
  static async notifyPremiumExpired (user_id, expiryData) {
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
  static async sendAuditApprovedNotification (user_id, auditData, _options = {}) {
    const { type } = auditData

    const notificationMap = {
      exchange: {
        title: '兑换审核通过',
        content: `您的兑换申请已审核通过，${auditData.quantity}个${auditData.product_name}已添加到库存`
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
  static async sendAuditRejectedNotification (user_id, auditData, _options = {}) {
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
   * @param {string} lotteryData.draw_id - 抽奖记录ID
   * @returns {Promise<Object>} 通知结果
   */
  static async notifyLotteryWin (user_id, lotteryData) {
    const { prize_name, prize_type, prize_value, draw_id } = lotteryData

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
        draw_id,
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
  static async notifyPointsChange (user_id, pointsData) {
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
   * 商品上新通知（发送给所有用户或特定用户）
   *
   * @param {number|null} user_id - 用户ID，null表示发送给所有管理员
   * @param {Object} productData - 商品数据
   * @param {string} productData.product_name - 商品名称
   * @param {number} productData.exchange_points - 兑换积分
   * @param {string} productData.product_category - 商品类别
   * @returns {Promise<Object>} 通知结果
   */
  static async notifyNewProduct (user_id, productData) {
    const { product_name, exchange_points, product_category } = productData

    if (user_id) {
      // 发送给特定用户
      return await this.send(user_id, {
        type: 'new_product',
        title: '🎁 新品上架',
        content: `新商品【${product_name}】已上架，仅需${exchange_points}积分即可兑换！类别：${product_category}`,
        data: productData
      })
    } else {
      // 发送给所有管理员（用于管理通知）
      return await this.sendToAdmins({
        type: 'new_product',
        title: '新商品已上架',
        content: `商品【${product_name}】已成功上架，兑换价格：${exchange_points}积分`,
        data: productData
      })
    }
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
  static async notifyAnnouncement (user_id, announcementData) {
    const { title, content, announcement_type } = announcementData

    if (user_id) {
      // 发送给特定用户
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
      // 广播给所有管理员
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
  static async notifySecurityEvent (user_id, securityData) {
    const { description, ip_address } = securityData

    return await this.send(user_id, {
      type: 'security_alert',
      title: '🔐 账户安全提醒',
      content: `${description}${ip_address ? `（IP: ${ip_address}）` : ''}。如非本人操作，请及时联系客服。`,
      data: securityData
    })
  }
}

module.exports = NotificationService
