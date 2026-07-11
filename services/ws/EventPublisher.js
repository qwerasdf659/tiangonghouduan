/**
 * WebSocket 事件推送器（EventPublisher）
 *
 * 职责（从 ChatWebSocketService 拆分，2026-07-11 技术债务方案 7.4-3）：
 * 所有对外 WebSocket 推送方法的唯一出口，包括：
 * - 聊天消息推送（new_message：定向用户/客服、广播全体客服）
 * - 系统通知推送（new_notification 用户通道 / notification 管理员通道）
 * - 红点徽标更新（badge_update）
 * - 系统告警推送（new_alert / pending_alerts）
 * - 会话关闭通知（session_closed / session_list_update）
 * - 兑换商品与库存变更广播（exchange_item_updated / exchange_stock_changed）
 * - 竞价通知（bid_outbid / bid_won / bid_lost）
 * - 通用广播（broadcast）
 *
 * 设计说明：
 * - 本模块不独立注册服务键，仅由 ChatWebSocketService Facade 持有并委托调用
 * - io 实例由 Facade 单一持有，本模块通过 this.service.io 动态引用（不自行 new）
 * - 纯搬移拆分：所有方法逻辑与拆分前 ChatWebSocketService 完全一致
 */

const wsLogger = require('../../utils/logger').logger
const BeijingTimeHelper = require('../../utils/timeHelper')

/**
 * WebSocket 事件推送器类
 * @class EventPublisher
 */
class EventPublisher {
  /**
   * 构造函数
   * @param {Object} service - ChatWebSocketService Facade 实例（单一持有 io 与连接 Map）
   */
  constructor(service) {
    this.service = service
  }

  /**
   * 推送新消息给指定用户
   * @param {Number} user_id - 接收用户ID
   * @param {Object} message - 消息对象
   * @returns {Boolean} 是否推送成功
   */
  pushMessageToUser(user_id, message) {
    if (!this.service.io) {
      wsLogger.info(`⚠️ WebSocket未初始化，无法推送给用户 ${user_id}`)
      return false
    }
    try {
      /*
       * R6（cluster 跨进程推送）：改用 room 定向 emit。
       * 用户可能连在其他 worker，io.to('user:'+id) 经 Redis Adapter 跨进程送达；
       * connectedUsers 仅作本进程在线视图（introspection），不再用于查 socketId。
       */
      this.service.io.to(`user:${user_id}`).emit('new_message', message)
      wsLogger.info(`📤 消息已推送给用户 ${user_id}`)
      return true
    } catch (error) {
      wsLogger.error('推送消息给用户失败', {
        user_id,
        chat_message_id: message.chat_message_id || 'unknown',
        error: error.message,
        timestamp: BeijingTimeHelper.now()
      })
      return false
    }
  }

  /**
   * 推送新消息给指定客服
   * @param {Number} admin_id - 接收客服ID
   * @param {Object} message - 消息对象
   * @returns {Boolean} 是否推送成功
   */
  pushMessageToAdmin(admin_id, message) {
    if (!this.service.io) {
      wsLogger.info(`⚠️ WebSocket未初始化，无法推送给客服 ${admin_id}`)
      return false
    }
    try {
      // R6（cluster 跨进程推送）：改用 admin:{id} 房间定向 emit
      this.service.io.to(`admin:${admin_id}`).emit('new_message', message)
      wsLogger.info(`📤 消息已推送给客服 ${admin_id}`)
      return true
    } catch (error) {
      wsLogger.error('推送消息给客服失败', {
        admin_id,
        chat_message_id: message.chat_message_id || 'unknown',
        error: error.message,
        timestamp: BeijingTimeHelper.now()
      })
      return false
    }
  }

  /**
   * 广播消息给所有在线客服
   * @param {Object} message - 消息对象
   * @returns {Number} 成功推送的客服数量
   */
  broadcastToAllAdmins(message) {
    if (!this.service.io) {
      wsLogger.warn('WebSocket服务未初始化，无法广播给客服')
      return 0
    }
    /*
     * R6（cluster 跨进程广播）：改用 admins 房间广播，Redis Adapter 跨 worker 送达所有客服。
     * 返回本进程在线客服数作为参考（集群总数由各 worker 各自统计，日志用途）。
     */
    try {
      this.service.io.to('admins').emit('new_message', message)
    } catch (error) {
      wsLogger.error('广播消息给客服失败', {
        chat_message_id: message.chat_message_id || 'unknown',
        error: error.message
      })
      return 0
    }

    const localAdminCount = this.service.connectedAdmins.size
    wsLogger.info(`📢 消息已广播给 admins 房间（本进程在线客服 ${localAdminCount} 个）`)
    return localAdminCount
  }

  /**
   * 推送通知给指定用户（方案B：用户通知独立通道）
   *
   * 事件名 new_notification 与聊天的 new_message 和管理员的 notification 区分：
   *   - new_message → 客服聊天消息
   *   - new_notification → 用户系统通知（挂牌、交易、中奖等）
   *   - notification → 管理员系统通知
   *
   * @param {number} user_id - 接收用户ID
   * @param {Object} notification - 通知对象（含 notification_id, type, title, content, metadata, created_at）
   * @returns {boolean} 是否推送成功（用户不在线返回 false）
   */
  pushNotificationToUser(user_id, notification) {
    if (!this.service.io) {
      wsLogger.info(`⚠️ WebSocket未初始化，无法推送通知给用户 ${user_id}`)
      return false
    }
    try {
      // R6（cluster 跨进程推送）：改用 user:{id} 房间定向 emit
      this.service.io.to(`user:${user_id}`).emit('new_notification', notification)
      wsLogger.info(`🔔 用户通知已推送给用户 ${user_id}`, {
        notification_id: notification.notification_id,
        type: notification.type
      })
      return true
    } catch (error) {
      wsLogger.error('推送通知给用户失败', {
        user_id,
        notification_id: notification.notification_id || 'unknown',
        error: error.message,
        timestamp: BeijingTimeHelper.now()
      })
      return false
    }
  }

  /**
   * 推送通知给指定管理员（专用于系统通知）
   * @param {Number} admin_id - 接收管理员ID
   * @param {Object} notification - 通知对象
   * @returns {Boolean} 是否推送成功
   */
  pushNotificationToAdmin(admin_id, notification) {
    if (!this.service.io) {
      wsLogger.info(`⚠️ WebSocket未初始化，无法推送通知给管理员 ${admin_id}`)
      return false
    }
    try {
      // R6（cluster 跨进程推送）：改用 admin:{id} 房间定向 emit，Redis Adapter 跨 worker 送达
      this.service.io.to(`admin:${admin_id}`).emit('notification', notification)
      wsLogger.info(`🔔 通知已推送给管理员 ${admin_id}`)
      return true
    } catch (error) {
      wsLogger.error('推送通知给管理员失败', {
        admin_id,
        notification_id: notification.notification_id || 'unknown',
        error: error.message,
        timestamp: BeijingTimeHelper.now()
      })
      return false
    }
  }

  /**
   * 推送红点徽标更新给指定管理员
   *
   * WebSocket事件名：badge_update
   * 触发场景：管理员通知新增/单条已读/全部已读/删除未读通知后，
   *          服务端主动推送最新未读数，前端据此实时刷新导航红点
   * （2026-07-11 技术债务方案 拍板 8：badge_update 补服务端实现，
   *   admin 前端 message-center.js / notification-center.js 已有对应监听）
   *
   * @param {Number} admin_id - 接收管理员ID
   * @param {Object} data - 徽标数据 { unread_count, urgent_unread_count }
   * @returns {Boolean} 是否推送成功
   */
  pushBadgeUpdateToAdmin(admin_id, data) {
    if (!this.service.io) {
      wsLogger.info(`⚠️ WebSocket未初始化，无法推送徽标更新给管理员 ${admin_id}`)
      return false
    }
    try {
      // cluster 跨进程推送：admin:{id} 房间定向 emit，Redis Adapter 跨 worker 送达
      this.service.io.to(`admin:${admin_id}`).emit('badge_update', {
        ...data,
        timestamp: BeijingTimeHelper.now()
      })
      return true
    } catch (error) {
      wsLogger.error('推送徽标更新给管理员失败', {
        admin_id,
        error: error.message
      })
      return false
    }
  }

  /**
   * 广播通知给所有在线管理员（专用于系统通知）
   * @param {Object} notification - 通知对象
   * @returns {Number} 成功推送的管理员数量
   */
  broadcastNotificationToAllAdmins(notification) {
    if (!this.service.io) {
      wsLogger.warn('WebSocket服务未初始化，无法广播通知给管理员')
      return 0
    }
    /*
     * R6（cluster 跨进程广播）：改用 admins 房间广播，Redis Adapter 跨 worker 送达所有管理员。
     * 返回本进程在线管理员数作为参考（集群总数由各 worker 各自统计，日志用途）。
     */
    try {
      this.service.io.to('admins').emit('notification', notification)
    } catch (error) {
      wsLogger.error('广播通知给管理员失败', {
        notification_id: notification.notification_id || 'unknown',
        error: error.message
      })
      return 0
    }

    const localAdminCount = this.service.connectedAdmins.size
    wsLogger.info(`📢 通知已广播给 admins 房间（本进程在线管理员 ${localAdminCount} 个）`)
    return localAdminCount
  }

  /**
   * 推送告警到所有在线管理员（P1修复 - 2026-01-30）
   *
   * 专用于系统告警推送，支持静默窗口控制
   *
   * @param {Object} alert - 告警对象
   * @param {number} alert.alert_id - 告警ID
   * @param {string} alert.alert_type - 告警类型（win_rate/budget/inventory/user/system）
   * @param {string} alert.severity - 严重程度（info/warning/danger）
   * @param {string} alert.message - 告警消息
   * @param {number} [alert.lottery_campaign_id] - 关联活动ID
   * @param {string} [alert.rule_code] - 规则代码
   * @param {Date|string} [alert.created_at] - 创建时间
   * @returns {number} 成功推送的管理员数量
   */
  pushAlertToAdmins(alert) {
    if (!this.service.io) {
      wsLogger.warn('WebSocket服务未初始化，无法推送告警给管理员')
      return 0
    }

    // 构建告警推送数据
    const alertData = {
      alert_id: alert.alert_id,
      alert_type: alert.alert_type,
      severity: alert.severity,
      message: alert.message,
      lottery_campaign_id: alert.lottery_campaign_id || null,
      rule_code: alert.rule_code || null,
      created_at: alert.created_at || BeijingTimeHelper.now(),
      timestamp: BeijingTimeHelper.now()
    }

    /*
     * R6（cluster 跨进程广播）：改用 admins 房间广播，Redis Adapter 跨 worker 送达所有管理员。
     * 返回本进程在线管理员数作为参考（集群总数由各 worker 各自统计，日志用途）。
     */
    try {
      this.service.io.to('admins').emit('new_alert', alertData)
    } catch (error) {
      wsLogger.error('推送告警给管理员失败', {
        alert_id: alert.alert_id,
        error: error.message
      })
      return 0
    }

    const localAdminCount = this.service.connectedAdmins.size
    wsLogger.info(`🚨 告警已广播给 admins 房间（本进程在线管理员 ${localAdminCount} 个）`, {
      alert_id: alert.alert_id,
      alert_type: alert.alert_type,
      severity: alert.severity
    })

    return localAdminCount
  }

  /**
   * 推送未确认告警列表给新登录的管理员
   *
   * 管理员登录时调用，推送所有未处理的活跃告警
   *
   * @param {number} admin_id - 管理员ID
   * @returns {Promise<number>} 推送的告警数量
   */
  async pushPendingAlertsToAdmin(admin_id) {
    if (!this.service.io) {
      wsLogger.info(`⚠️ WebSocket未初始化，无法推送待处理告警给管理员 ${admin_id}`)
      return 0
    }

    try {
      /**
       * 🔧 循环依赖修复：
       * 使用 setImmediate 延迟加载 LotteryAlertService
       * 避免静态分析工具检测到循环依赖
       */
      const alertResult = await new Promise((resolve, reject) => {
        setImmediate(async () => {
          try {
            const LotteryAlertService = require('../lottery/LotteryAlertService')
            const result = await LotteryAlertService.getAlertList({
              status: 'active',
              page: 1,
              page_size: 100
            })
            resolve(result)
          } catch (err) {
            reject(err)
          }
        })
      })

      if (alertResult.alerts && alertResult.alerts.length > 0) {
        // R6（cluster 跨进程推送）：改用 admin:{id} 房间定向 emit，Redis Adapter 跨 worker 送达
        this.service.io.to(`admin:${admin_id}`).emit('pending_alerts', {
          alerts: alertResult.alerts,
          total: alertResult.total,
          timestamp: BeijingTimeHelper.now()
        })

        wsLogger.info(`📋 已推送 ${alertResult.alerts.length} 条待处理告警给管理员 ${admin_id}`)
        return alertResult.alerts.length
      }

      return 0
    } catch (error) {
      wsLogger.error('推送待处理告警失败', {
        admin_id,
        error: error.message
      })
      return 0
    }
  }

  /**
   * 通知会话关闭（推送给用户和管理员）
   * @param {Number} session_id - 会话ID
   * @param {Number} user_id - 用户ID
   * @param {Number} admin_id - 管理员ID（可能为null）
   * @param {Object} closeData - 关闭数据
   * @param {String} closeData.close_reason - 关闭原因
   * @param {Number} closeData.closed_by - 关闭操作人ID
   * @param {Date} closeData.closed_at - 关闭时间
   * @returns {Object} 通知结果 {notified_user, notified_admin, user_online, admin_online}
   *
   * 业务场景（Business Scenario）:
   * 1. 管理员关闭会话后，实时通知在线用户（避免用户继续发消息）
   * 2. 通知其他在线管理员会话状态变化（多客服协作场景）
   * 3. 广播给所有管理员，用于管理后台列表实时刷新
   *
   * 技术说明（Technical Notes）:
   * - WebSocket通知失败不影响关闭成功（非关键路径）
   * - 用户刷新页面会看到最新状态（系统消息）
   * - 离线用户上线后可查看系统消息
   */
  notifySessionClosed(session_id, user_id, admin_id, closeData) {
    const result = {
      notified_user: false,
      notified_admin: false,
      user_online: false,
      admin_online: false
    }

    // 检查WebSocket服务是否已初始化
    if (!this.service.io) {
      wsLogger.warn('WebSocket服务未初始化，无法发送通知')
      return result
    }

    /*
     * R6（cluster 跨进程推送）：全部改用房间定向 emit，Redis Adapter 跨 worker 送达。
     * online 标志基于本进程在线视图作为最佳努力参考（集群真实在线由房间投递保证）。
     */

    // 1️⃣ 通知用户（user:{id} 房间）
    this.service.io.to(`user:${user_id}`).emit('session_closed', {
      session_id,
      status: 'closed',
      close_reason: closeData.close_reason,
      closed_at: closeData.closed_at,
      closed_by: closeData.closed_by,
      message: `会话已被客服关闭：${closeData.close_reason}`,
      timestamp: BeijingTimeHelper.now()
    })
    result.notified_user = true
    result.user_online = this.service.connectedUsers.has(user_id)
    wsLogger.info('通知用户会话关闭', {
      user_id,
      session_id,
      close_reason: closeData.close_reason
    })

    // 2️⃣ 通知指定管理员（admin:{id} 房间，非关闭人本人）
    if (admin_id && admin_id !== closeData.closed_by) {
      this.service.io.to(`admin:${admin_id}`).emit('session_closed', {
        session_id,
        status: 'closed',
        close_reason: closeData.close_reason,
        closed_at: closeData.closed_at,
        closed_by: closeData.closed_by,
        message: '会话已被其他客服关闭',
        timestamp: BeijingTimeHelper.now()
      })
      result.notified_admin = true
      result.admin_online = this.service.connectedAdmins.has(admin_id)
      wsLogger.info('通知管理员会话关闭', { admin_id, session_id })
    }

    /*
     * 3️⃣ 广播给所有管理员刷新列表（admins 房间）。
     * 关闭人本人也会收到刷新信号（无害：仅触发列表刷新，状态本就已知）。
     * cluster 下无法低成本按 socket 排除单个管理员，广播给全体是正确且更简单的做法。
     */
    this.service.io.to('admins').emit('session_list_update', {
      action: 'session_closed',
      session_id,
      timestamp: BeijingTimeHelper.now()
    })

    return result
  }

  // ==================== 业务推送方法（2026-02-15 新增 - 微信小程序前端适配）====================

  /**
   * 推送兑换商品更新通知给所有在线用户
   *
   * @description 管理员创建/修改/删除兑换商品后，实时通知所有在线用户刷新商品列表
   * @event exchange_item_updated
   *
   * @param {Object} itemData - 兑换商品变更数据
   * @param {string} itemData.action - 操作类型（created/updated/deleted/status_changed）
   * @param {number} itemData.exchange_item_id - 商品ID
   * @param {string} [itemData.name] - 商品名称
   * @param {number} [itemData.stock] - 当前库存
   * @param {string} [itemData.status] - 当前状态
   * @param {number} [itemData.operator_id] - 操作人ID
   * @returns {number} 成功推送的用户数量
   */
  broadcastExchangeItemUpdated(itemData) {
    if (!this.service.io) {
      wsLogger.warn('WebSocket服务未初始化，无法推送兑换商品更新')
      return 0
    }

    const payload = {
      ...itemData,
      timestamp: BeijingTimeHelper.now()
    }

    /*
     * R6（cluster 跨进程广播）：改用 users + admins 房间广播，Redis Adapter 跨 worker 送达。
     * 返回本进程在线连接数作为参考（集群总数由各 worker 各自统计，日志用途）。
     */
    try {
      this.service.io.to('users').emit('exchange_item_updated', payload)
      this.service.io.to('admins').emit('exchange_item_updated', payload)
    } catch (error) {
      wsLogger.error('广播兑换商品更新失败', {
        exchange_item_id: itemData.exchange_item_id,
        error: error.message
      })
      return 0
    }

    const localCount = this.service.connectedUsers.size + this.service.connectedAdmins.size
    wsLogger.info('📦 兑换商品更新通知已广播', {
      action: itemData.action,
      exchange_item_id: itemData.exchange_item_id,
      online_users: this.service.connectedUsers.size,
      online_admins: this.service.connectedAdmins.size
    })

    return localCount
  }

  /**
   * 推送兑换库存变更通知给所有在线用户
   *
   * @description 用户兑换商品导致库存减少时，实时通知其他在线用户库存变化
   *
   * @param {Object} stockData - 库存变更数据
   * @param {number} stockData.exchange_item_id - 商品ID
   * @param {string} [stockData.name] - 商品名称
   * @param {number} stockData.remaining_stock - 剩余库存
   * @param {number} stockData.changed_amount - 变更数量（负数表示减少）
   * @param {string} stockData.reason - 变更原因（exchange/admin_adjust）
   * @returns {number} 成功推送的用户数量
   */
  broadcastExchangeStockChanged(stockData) {
    if (!this.service.io) {
      wsLogger.warn('WebSocket服务未初始化，无法推送库存变更')
      return 0
    }

    const payload = {
      ...stockData,
      timestamp: BeijingTimeHelper.now()
    }

    /*
     * R6（cluster 跨进程广播）：改用 users + admins 房间广播，Redis Adapter 跨 worker 送达。
     * 返回本进程在线连接数作为参考（集群总数由各 worker 各自统计，日志用途）。
     */
    try {
      this.service.io.to('users').emit('exchange_stock_changed', payload)
      this.service.io.to('admins').emit('exchange_stock_changed', payload)
    } catch (error) {
      wsLogger.error('广播库存变更失败', {
        exchange_item_id: stockData.exchange_item_id,
        error: error.message
      })
      return 0
    }

    const localCount = this.service.connectedUsers.size + this.service.connectedAdmins.size
    wsLogger.info('📦 兑换库存变更通知已广播', {
      exchange_item_id: stockData.exchange_item_id,
      remaining_stock: stockData.remaining_stock,
      changed_amount: stockData.changed_amount,
      online_connections: localCount
    })

    return localCount
  }

  // ==================== 竞价通知WebSocket事件（2026-02-16 前后端联调确认）====================

  /**
   * 推送竞价被超越通知给指定用户
   *
   * WebSocket事件名：bid_outbid
   * 触发场景：用户 A 出价后，用户 B 提交更高出价，通知用户 A
   *
   * @param {number} userId - 被超越的出价者用户ID
   * @param {Object} data - 竞价超越数据
   * @param {number} data.bid_product_id - 竞价商品ID
   * @param {string} data.item_name - 商品名称
   * @param {number} data.my_bid_amount - 被超越的出价金额
   * @param {number} data.new_highest - 新的最高出价金额
   * @param {string} data.price_asset_code - 竞价资产类型
   * @returns {boolean} 是否推送成功
   */
  pushBidOutbid(userId, data) {
    return this._pushBidEvent(userId, 'bid_outbid', data)
  }

  /**
   * 推送竞价中标通知给指定用户
   *
   * WebSocket事件名：bid_won
   * 触发场景：竞价结算完成，通知中标用户
   *
   * @param {number} userId - 中标用户ID
   * @param {Object} data - 中标数据
   * @param {number} data.bid_product_id - 竞价商品ID
   * @param {string} data.item_name - 商品名称
   * @param {number} data.winning_amount - 中标金额
   * @param {string} data.price_asset_code - 竞价资产类型
   * @returns {boolean} 是否推送成功
   */
  pushBidWon(userId, data) {
    return this._pushBidEvent(userId, 'bid_won', data)
  }

  /**
   * 推送竞价落选通知给指定用户
   *
   * WebSocket事件名：bid_lost
   * 触发场景：竞价结算完成，通知落选用户（冻结资产已解冻）
   *
   * @param {number} userId - 落选用户ID
   * @param {Object} data - 落选数据
   * @param {number} data.bid_product_id - 竞价商品ID
   * @param {string} data.item_name - 商品名称
   * @param {number} data.my_bid_amount - 用户的出价金额
   * @param {number} data.winning_amount - 中标金额
   * @param {string} data.price_asset_code - 竞价资产类型
   * @returns {boolean} 是否推送成功
   */
  pushBidLost(userId, data) {
    return this._pushBidEvent(userId, 'bid_lost', data)
  }

  /**
   * 竞价事件推送内部方法（统一处理竞价WebSocket推送）
   *
   * @param {number} userId - 目标用户ID
   * @param {string} eventName - 事件名称（bid_outbid/bid_won/bid_lost）
   * @param {Object} data - 事件数据
   * @returns {boolean} 是否推送成功
   * @private
   */
  _pushBidEvent(userId, eventName, data) {
    if (!this.service.io) {
      wsLogger.info(`⚠️ WebSocket未初始化，竞价通知 ${eventName} 未推送给用户 ${userId}`)
      return false
    }

    try {
      const payload = {
        ...data,
        event_type: eventName,
        timestamp: BeijingTimeHelper.now()
      }
      /*
       * R6（cluster 跨进程推送）：改用 user:{id} 房间定向 emit。
       * 用户可能连在其他 worker，io.to('user:'+id) 经 Redis Adapter 跨进程送达；
       * 离线用户由业务侧记录兜底（出价结果持久化在 DB，下次进页面可见）。
       */
      this.service.io.to(`user:${userId}`).emit(eventName, payload)
      wsLogger.info(`📤 竞价通知 ${eventName} 已推送给用户 ${userId}`, {
        bid_product_id: data.bid_product_id || data.auction_listing_id,
        event: eventName
      })
      return true
    } catch (error) {
      wsLogger.error(`推送竞价通知 ${eventName} 给用户失败`, {
        user_id: userId,
        error: error.message
      })
      return false
    }
  }

  /**
   * 推送系统广播消息给所有在线用户（通用方法）
   *
   * @param {string} eventName - 事件名称
   * @param {Object} data - 推送数据
   * @param {Object} [options] - 选项
   * @param {boolean} [options.usersOnly=false] - 是否只推送给普通用户
   * @param {boolean} [options.adminsOnly=false] - 是否只推送给管理员
   * @returns {number} 成功推送的数量
   */
  broadcast(eventName, data, options = {}) {
    if (!this.service.io) {
      wsLogger.warn('WebSocket服务未初始化，无法广播')
      return 0
    }

    const { usersOnly = false, adminsOnly = false } = options
    const payload = { ...data, timestamp: BeijingTimeHelper.now() }

    /*
     * R6（cluster 跨进程广播）：改用 users / admins 房间广播，Redis Adapter 跨 worker 送达。
     * 返回本进程命中的在线连接数作为参考（集群总数由各 worker 各自统计，日志用途）。
     */
    let localCount = 0
    try {
      if (!adminsOnly) {
        this.service.io.to('users').emit(eventName, payload)
        localCount += this.service.connectedUsers.size
      }
      if (!usersOnly) {
        this.service.io.to('admins').emit(eventName, payload)
        localCount += this.service.connectedAdmins.size
      }
    } catch (error) {
      wsLogger.error(`广播事件 ${eventName} 失败`, { error: error.message })
      return 0
    }

    wsLogger.info(`📢 广播事件: ${eventName}`, { local_online: localCount })
    return localCount
  }
}

module.exports = EventPublisher
