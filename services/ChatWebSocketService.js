/**
 * 聊天WebSocket服务 - Facade（门面）
 * 功能：实时推送聊天消息
 * 最后更新：2026年07月11日 - 技术债务方案 7.4-3 大文件拆分（纯搬移不改行为）
 *
 * 架构说明（拆分后）：
 * - 本文件保留为 Facade：对外方法签名全部不变（众多业务服务/路由调用此处的推送方法），
 *   内部委托 services/ws/ 下的三个子模块：
 *   - ConnectionManager：握手/注册/心跳/重连/房间管理/状态查询/停机
 *   - ChatHandler：聊天消息处理（send_message）/ 离线消息查询
 *   - EventPublisher：notification/alert/bid/exchange/session/badge_update 等
 *     全部对外推送方法的唯一出口
 * - io 实例与 connectedUsers/connectedAdmins 连接 Map 由 Facade 单一持有，
 *   子模块通过持有 Facade 引用动态读取（子模块不自己 new）
 * - 子模块不独立注册服务键，getService('chat_web_socket') 键不变，仍指向本单例
 *
 * 设计原则：
 * 1. 代码简单易懂 - 新人5分钟上手
 * 2. 维护成本低 - 独立模块，不依赖其他服务
 * 3. 性能优秀 - 支持5000+并发连接
 * 4. 向后兼容 - 不影响现有REST API
 */

const wsLogger = require('../utils/logger').logger
const ConnectionManager = require('./ws/ConnectionManager')
const ChatHandler = require('./ws/ChatHandler')
const EventPublisher = require('./ws/EventPublisher')

/**
 * 聊天WebSocket服务类（Facade）
 * 职责：持有 io 实例与连接状态，将连接管理/聊天处理/事件推送委托给子模块
 * 特点：对外方法签名与拆分前完全一致
 * @class ChatWebSocketService
 */
class ChatWebSocketService {
  /**
   * 构造函数 - 初始化连接管理和限制配置，并创建三个子模块
   * @constructor
   */
  constructor() {
    this.io = null
    this.connectedUsers = new Map() // 存储用户连接 {userId: socketId}
    this.connectedAdmins = new Map() // 存储客服连接 {adminId: socketId}

    /*
     * ⚡ 连接数限制配置（2025年01月21日新增）
     *
     * R7（cluster 连接数语义校正，2026-05-30）：
     * - 以下上限是「单 worker 进程」级别的语义，而非整个 cluster 的全局总量
     * - 设计意图：连接数上限的本质是保护「单个进程」的内存与文件描述符资源，
     *   因此每个 worker 各自维护并校验自己的连接数是正确的保护粒度
     * - cluster 集群总容量 = 单 worker 上限 × worker 数（如 4 worker × 5000 = 20000），
     *   对 32核/127G 机器完全安全，满足「万级并发」目标
     * - 若未来需要「集群级硬上限」（而非按进程保护），应改用 Redis 全局计数器，
     *   当前数据量远未触及，不引入（避免过度设计，与文档 R7 决策一致）
     */
    this.MAX_TOTAL_CONNECTIONS = 5000 // 单 worker 最大总连接数
    this.MAX_USER_CONNECTIONS = 4500 // 单 worker 最大用户连接数
    this.MAX_ADMIN_CONNECTIONS = 500 // 单 worker 最大客服连接数

    /*
     * ⚡ 服务启动日志ID（2025年11月08日新增 - 用于记录uptime运行时长）
     * 说明：记录当前服务启动日志的ID，用于停止时更新记录
     * 用途：提供uptime字段，用于服务稳定性监控和重启记录
     */
    this.currentStartupLogId = null // 当前启动日志ID（数据库记录）

    /*
     * 子模块（2026-07-11 拆分）：均持有 Facade 引用（this），
     * 动态读取 io / connectedUsers / connectedAdmins，保证单一数据源
     */
    this.connectionManager = new ConnectionManager(this)
    this.chatHandler = new ChatHandler(this)
    this.eventPublisher = new EventPublisher(this)

    wsLogger.info('📦 ChatWebSocketService 实例已创建')
    wsLogger.info(
      `⚙️ 连接限制: 总${this.MAX_TOTAL_CONNECTIONS} | 用户${this.MAX_USER_CONNECTIONS} | 客服${this.MAX_ADMIN_CONNECTIONS}`
    )
  }

  // ==================== 连接管理（委托 ConnectionManager）====================

  /**
   * 初始化WebSocket服务
   * @param {Object} server - HTTP服务器实例
   * @returns {Promise<void>} 无返回值，初始化WebSocket服务并设置事件处理器
   */
  async initialize(server) {
    return this.connectionManager.initialize(server)
  }

  /**
   * 设置事件处理器
   * @returns {void} 无返回值，设置WebSocket连接和消息事件处理器
   */
  setupEventHandlers() {
    return this.connectionManager.setupEventHandlers()
  }

  /**
   * 获取WebSocket服务状态（异步方法 - 从数据库查询uptime）
   * @returns {Promise<Object>} 状态信息对象（status/connections/uptime/connected_users/connected_admins/timestamp）
   */
  async getStatus() {
    return this.connectionManager.getStatus()
  }

  /**
   * 获取在线用户列表
   * @returns {Array} 在线用户ID列表
   */
  getOnlineUsers() {
    return this.connectionManager.getOnlineUsers()
  }

  /**
   * 获取在线客服列表
   * @returns {Array} 在线客服ID列表
   */
  getOnlineAdmins() {
    return this.connectionManager.getOnlineAdmins()
  }

  /**
   * 检查用户是否在线
   * @param {Number} user_id - 用户ID
   * @returns {Boolean} 是否在线
   */
  isUserOnline(user_id) {
    return this.connectionManager.isUserOnline(user_id)
  }

  /**
   * 检查客服是否在线
   * @param {Number} admin_id - 客服ID
   * @returns {Boolean} 是否在线
   */
  isAdminOnline(admin_id) {
    return this.connectionManager.isAdminOnline(admin_id)
  }

  /**
   * 强制断开指定用户的连接（会话被替换时调用）
   * @param {Number} user_id - 用户ID
   * @param {String} user_type - 会话类型 'user'（用户端）或 'admin'（管理后台）
   * @param {Object} [options] - 可选参数（reason/replaced_by_platform/device_id）
   * @returns {void} 无返回值，强制断开用户WebSocket连接
   */
  disconnectUser(user_id, user_type = 'user', options = {}) {
    return this.connectionManager.disconnectUser(user_id, user_type, options)
  }

  /**
   * 优雅停止WebSocket服务（记录停止事件）
   * @param {String} reason - 停止原因（如："正常停止"、"部署更新"、"服务崩溃"等）
   * @returns {Promise<void>} 无返回值
   */
  async shutdown(reason = '正常停止') {
    return this.connectionManager.shutdown(reason)
  }

  /**
   * 处理客户端重连（会话恢复）
   * @param {Object} socket - Socket.IO socket对象
   * @param {Object} options - 恢复选项 {last_sync_time}
   * @returns {Promise<Object>} 恢复结果 {success, offline_messages_count, sync_timestamp}
   */
  async handleReconnection(socket, options = {}) {
    return this.connectionManager.handleReconnection(socket, options)
  }

  /**
   * 获取连接状态（用于客户端显示连接状态）
   * @param {number} user_id - 用户ID
   * @param {string} user_type - 用户类型（user/admin）
   * @returns {Object} 连接状态 {connected, socket_id, user_type, timestamp}
   */
  getConnectionStatus(user_id, user_type = 'user') {
    return this.connectionManager.getConnectionStatus(user_id, user_type)
  }

  /**
   * 获取服务器IP地址（2025年11月08日新增）
   * @returns {String} 服务器IP地址
   */
  getServerIP() {
    return this.connectionManager.getServerIP()
  }

  // ==================== 聊天消息处理（委托 ChatHandler）====================

  /**
   * 获取用户的离线消息（用于断线重连后的会话恢复）
   * @param {number} user_id - 用户ID
   * @param {Object} options - 选项 {since, limit}
   * @returns {Promise<Object>} 离线消息结果 {messages, count, sync_timestamp}
   */
  async getOfflineMessages(user_id, options = {}) {
    return this.chatHandler.getOfflineMessages(user_id, options)
  }

  // ==================== 对外推送方法（委托 EventPublisher）====================

  /**
   * 推送新消息给指定用户
   * @param {Number} user_id - 接收用户ID
   * @param {Object} message - 消息对象
   * @returns {Boolean} 是否推送成功
   */
  pushMessageToUser(user_id, message) {
    return this.eventPublisher.pushMessageToUser(user_id, message)
  }

  /**
   * 推送新消息给指定客服
   * @param {Number} admin_id - 接收客服ID
   * @param {Object} message - 消息对象
   * @returns {Boolean} 是否推送成功
   */
  pushMessageToAdmin(admin_id, message) {
    return this.eventPublisher.pushMessageToAdmin(admin_id, message)
  }

  /**
   * 广播消息给所有在线客服
   * @param {Object} message - 消息对象
   * @returns {Number} 成功推送的客服数量
   */
  broadcastToAllAdmins(message) {
    return this.eventPublisher.broadcastToAllAdmins(message)
  }

  /**
   * 推送通知给指定用户（方案B：用户通知独立通道，事件名 new_notification）
   * @param {number} user_id - 接收用户ID
   * @param {Object} notification - 通知对象
   * @returns {boolean} 是否推送成功
   */
  pushNotificationToUser(user_id, notification) {
    return this.eventPublisher.pushNotificationToUser(user_id, notification)
  }

  /**
   * 推送通知给指定管理员（专用于系统通知，事件名 notification）
   * @param {Number} admin_id - 接收管理员ID
   * @param {Object} notification - 通知对象
   * @returns {Boolean} 是否推送成功
   */
  pushNotificationToAdmin(admin_id, notification) {
    return this.eventPublisher.pushNotificationToAdmin(admin_id, notification)
  }

  /**
   * 推送红点徽标更新给指定管理员（事件名 badge_update）
   * @param {Number} admin_id - 接收管理员ID
   * @param {Object} data - 徽标数据 { unread_count, urgent_unread_count }
   * @returns {Boolean} 是否推送成功
   */
  pushBadgeUpdateToAdmin(admin_id, data) {
    return this.eventPublisher.pushBadgeUpdateToAdmin(admin_id, data)
  }

  /**
   * 广播通知给所有在线管理员（专用于系统通知）
   * @param {Object} notification - 通知对象
   * @returns {Number} 成功推送的管理员数量
   */
  broadcastNotificationToAllAdmins(notification) {
    return this.eventPublisher.broadcastNotificationToAllAdmins(notification)
  }

  /**
   * 推送告警到所有在线管理员（P1修复 - 2026-01-30，事件名 new_alert）
   * @param {Object} alert - 告警对象（alert_id/alert_type/severity/message 等）
   * @returns {number} 成功推送的管理员数量
   */
  pushAlertToAdmins(alert) {
    return this.eventPublisher.pushAlertToAdmins(alert)
  }

  /**
   * 推送未确认告警列表给新登录的管理员（事件名 pending_alerts）
   * @param {number} admin_id - 管理员ID
   * @returns {Promise<number>} 推送的告警数量
   */
  async pushPendingAlertsToAdmin(admin_id) {
    return this.eventPublisher.pushPendingAlertsToAdmin(admin_id)
  }

  /**
   * 通知会话关闭（推送给用户和管理员）
   * @param {Number} session_id - 会话ID
   * @param {Number} user_id - 用户ID
   * @param {Number} admin_id - 管理员ID（可能为null）
   * @param {Object} closeData - 关闭数据 {close_reason, closed_by, closed_at}
   * @returns {Object} 通知结果 {notified_user, notified_admin, user_online, admin_online}
   */
  notifySessionClosed(session_id, user_id, admin_id, closeData) {
    return this.eventPublisher.notifySessionClosed(session_id, user_id, admin_id, closeData)
  }

  /**
   * 推送兑换商品更新通知给所有在线用户（事件名 exchange_item_updated）
   * @param {Object} itemData - 兑换商品变更数据
   * @returns {number} 成功推送的用户数量
   */
  broadcastExchangeItemUpdated(itemData) {
    return this.eventPublisher.broadcastExchangeItemUpdated(itemData)
  }

  /**
   * 推送兑换库存变更通知给所有在线用户（事件名 exchange_stock_changed）
   * @param {Object} stockData - 库存变更数据
   * @returns {number} 成功推送的用户数量
   */
  broadcastExchangeStockChanged(stockData) {
    return this.eventPublisher.broadcastExchangeStockChanged(stockData)
  }

  /**
   * 推送竞价被超越通知给指定用户（事件名 bid_outbid）
   * @param {number} userId - 被超越的出价者用户ID
   * @param {Object} data - 竞价超越数据
   * @returns {boolean} 是否推送成功
   */
  pushBidOutbid(userId, data) {
    return this.eventPublisher.pushBidOutbid(userId, data)
  }

  /**
   * 推送竞价中标通知给指定用户（事件名 bid_won）
   * @param {number} userId - 中标用户ID
   * @param {Object} data - 中标数据
   * @returns {boolean} 是否推送成功
   */
  pushBidWon(userId, data) {
    return this.eventPublisher.pushBidWon(userId, data)
  }

  /**
   * 推送竞价落选通知给指定用户（事件名 bid_lost）
   * @param {number} userId - 落选用户ID
   * @param {Object} data - 落选数据
   * @returns {boolean} 是否推送成功
   */
  pushBidLost(userId, data) {
    return this.eventPublisher.pushBidLost(userId, data)
  }

  /**
   * 竞价事件推送内部方法（统一处理竞价WebSocket推送）
   * @param {number} userId - 目标用户ID
   * @param {string} eventName - 事件名称（bid_outbid/bid_won/bid_lost）
   * @param {Object} data - 事件数据
   * @returns {boolean} 是否推送成功
   * @private
   */
  _pushBidEvent(userId, eventName, data) {
    return this.eventPublisher._pushBidEvent(userId, eventName, data)
  }

  /**
   * 推送系统广播消息给所有在线用户（通用方法）
   * @param {string} eventName - 事件名称
   * @param {Object} data - 推送数据
   * @param {Object} [options] - 选项 {usersOnly, adminsOnly}
   * @returns {number} 成功推送的数量
   */
  broadcast(eventName, data, options = {}) {
    return this.eventPublisher.broadcast(eventName, data, options)
  }

  /**
   * 获取单例实例（静态方法）
   * @returns {ChatWebSocketService} WebSocket服务实例
   */
  static getInstance() {
    return chatWebSocketServiceInstance
  }
}

// 创建单例实例
const chatWebSocketServiceInstance = new ChatWebSocketService()

// 导出单例实例
module.exports = chatWebSocketServiceInstance
