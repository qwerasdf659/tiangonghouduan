/**
 * 客服工作台 - WebSocket 连接管理
 *
 * @file admin/src/modules/content/composables/cs-ws-connection.js
 * @description 从 customer-service.js 提取的 WebSocket 连接、重连、降级轮询逻辑
 * @version 1.0.0
 * @date 2026-02-23
 */

import { logger } from '../../../utils/logger.js'
import { getToken } from '../../../api/base.js'
import { io } from 'socket.io-client'
import { Alpine } from '../../../alpine/index.js'

/**
 * WebSocket 连接状态
 * @returns {Object} 状态对象
 */
export function useCsWsConnectionState() {
  return {
    /** @type {Object|null} Socket.IO 客户端实例 */
    wsConnection: null,
    /** @type {number|null} 轮询定时器 ID（WebSocket 不可用时降级） */
    messagePollingInterval: null,
    /** @type {boolean} WebSocket 是否已连接 */
    wsConnected: false
  }
}

/**
 * WebSocket 连接方法
 * @returns {Object} 方法对象
 */
export function useCsWsConnectionMethods() {
  return {
    /**
     * 初始化 WebSocket 连接
     * 连接失败时自动降级到 HTTP 轮询
     */
    initWebSocket() {
      try {
        const wsUrl = window.location.origin
        logger.info('[WS] 正在连接WebSocket...', wsUrl)

        this.wsConnection = io(wsUrl, {
          auth: { token: getToken() },
          transports: ['websocket', 'polling'],
          path: '/socket.io'
        })

        this.wsConnection.on('connect', () => {
          logger.info('[WS] WebSocket连接成功')
          this.wsConnected = true
          this.stopPolling()
        })

        this.wsConnection.on('message', data => this.handleWebSocketMessage(data))
        this.wsConnection.on('new_message', data =>
          this.handleWebSocketMessage({ type: 'new_message', ...data })
        )
        this.wsConnection.on('session_update', data =>
          this.handleWebSocketMessage({ type: 'session_update', ...data })
        )

        this.wsConnection.on('error', error => logger.error('[WS] WebSocket错误:', error))
        this.wsConnection.on('disconnect', reason => {
          logger.info('[WS] WebSocket连接已断开:', reason)
          this.wsConnected = false
          this.startPolling()
        })
        this.wsConnection.on('connect_error', error => {
          logger.error('[WS] WebSocket连接失败:', error)
          this.wsConnected = false
          this.startPolling()
        })
      } catch (error) {
        logger.error('[WS] WebSocket初始化失败:', error)
        this.startPolling()
      }
    },

    /**
     * 处理 WebSocket 消息（分发到对应处理器）
     * @param {Object} data - 消息数据
     */
    handleWebSocketMessage(data) {
      switch (data.type) {
        case 'new_message':
          if (String(data.session_id) === String(this.currentSessionId)) {
            this.messages.push(data.message)
            this.$nextTick(() => this.scrollToBottom())
          }
          this.loadSessions(true)
          break
        case 'new_session':
          this.loadSessions(true)
          break
        case 'session_closed':
          if (String(data.session_id) === String(this.currentSessionId)) {
            Alpine.store('notification').show('当前会话已被关闭', 'warning')
            this.closeCurrentChat()
          }
          this.loadSessions(true)
          break
      }
    },

    /**
     * 启动 HTTP 轮询（WebSocket 降级方案）
     */
    startPolling() {
      if (!this.messagePollingInterval) {
        this.messagePollingInterval = setInterval(() => {
          if (this.currentSessionId) {
            this.loadSessionMessages(this.currentSessionId, true)
          }
        }, 5000)
      }
    },

    /**
     * 停止 HTTP 轮询
     */
    stopPolling() {
      if (this.messagePollingInterval) {
        clearInterval(this.messagePollingInterval)
        this.messagePollingInterval = null
      }
    },

    /**
     * 断开 WebSocket 连接并清理
     */
    disconnectWebSocket() {
      this.stopPolling()
      if (this.wsConnection) {
        this.wsConnection.disconnect()
        this.wsConnection = null
      }
      this.wsConnected = false
    },

    /**
     * 通过 WebSocket 发送满意度评价邀请
     */
    async requestSatisfaction() {
      if (!this.currentSessionId) return
      try {
        if (this.wsConnection && this.wsConnection.connected) {
          this.wsConnection.emit('satisfaction_request', {
            session_id: this.currentSessionId
          })
          Alpine.store('notification').show('已向用户发送满意度评价邀请', 'success')
        } else {
          Alpine.store('notification').show('WebSocket未连接，无法发送评价邀请', 'warning')
        }
      } catch (error) {
        logger.error('[WS] 发送满意度评价邀请失败:', error)
      }
    }
  }
}
