/**
 * WebSocket服务单例
 * 解决多个模块需要访问同一个WebSocket服务实例的问题
 */

const WebSocketService = require('./WebSocketService')

let instance = null

/**
 * 获取WebSocket服务实例
 * @returns {WebSocketService} WebSocket服务实例
 */
function getInstance () {
  if (!instance) {
    instance = new WebSocketService()
  }
  return instance
}

/**
 * 设置WebSocket服务实例（主要用于app.js初始化时设置）
 * @param {WebSocketService} serviceInstance - WebSocket服务实例
 */
function setInstance (serviceInstance) {
  instance = serviceInstance
}

/**
 * 检查实例是否已初始化
 * @returns {boolean} 是否已初始化
 */
function isInitialized () {
  return instance !== null
}

module.exports = {
  getInstance,
  setInstance,
  isInitialized
}
