/**
 * WebSocket 初始化与优雅关闭（bootstrap 模块，2026-07-11 自 app.js 拆分，纯搬移不改行为）
 *
 * 职责：
 * - initializeWebSocket：socket.io 聊天/通知实时通信服务挂载到 HTTP server
 * - registerGracefulShutdown：SIGTERM/SIGINT 信号处理（WebSocket 停止事件落库 + DB 连接关闭）
 *
 * @module bootstrap/websocket
 */

'use strict'

const appLogger = require('../utils/logger')

/**
 * 初始化聊天 WebSocket 服务（socket.io）
 *
 * @param {Object} server - http.Server 实例
 * @returns {void}
 */
function initializeWebSocket(server) {
  try {
    const ChatWebSocketService = require('../services/ChatWebSocketService')
    ChatWebSocketService.initialize(server)
    appLogger.info('聊天WebSocket服务已启动', {
      path: '/socket.io',
      transports: ['websocket']
    })
  } catch (error) {
    appLogger.error('聊天WebSocket服务初始化失败', { error: error.message })
  }
}

/**
 * 注册优雅关闭信号处理
 *
 * 功能：服务关闭时记录 WebSocket 停止事件到数据库（服务维护、部署更新、异常追踪、SLA统计）
 *
 * @returns {void}
 */
function registerGracefulShutdown() {
  /**
   * 优雅关闭处理器
   * @param {string} signal - 触发关闭的信号名（SIGTERM/SIGINT）
   * @returns {Promise<void>} 无返回值，处理完成后进程退出
   */
  const gracefulShutdown = async signal => {
    appLogger.info(`收到${signal}信号，开始优雅关闭...`)

    try {
      // 记录WebSocket服务停止事件
      const ChatWebSocketService = require('../services/ChatWebSocketService')
      await ChatWebSocketService.shutdown(`收到${signal}信号`)
      appLogger.info('WebSocket服务已优雅关闭')
    } catch (error) {
      appLogger.error('WebSocket关闭失败', { error: error.message })
    }

    // 关闭数据库连接
    try {
      const { sequelize } = require('../models')
      await sequelize.close()
      appLogger.info('数据库连接已关闭')
    } catch (error) {
      appLogger.error('数据库关闭失败', { error: error.message })
    }

    appLogger.info('服务已优雅关闭')
    process.exit(0)
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
  process.on('SIGINT', () => gracefulShutdown('SIGINT'))
}

module.exports = { initializeWebSocket, registerGracefulShutdown }
