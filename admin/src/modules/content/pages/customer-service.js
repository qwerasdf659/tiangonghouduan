/**
 * 客服工作台页面 - Alpine.js Mixin 重构版
 *
 * @file admin/src/modules/content/pages/customer-service.js
 * @description 客服工作台页面，提供会话管理、消息收发、WebSocket实时通信功能
 * @version 3.1.0 (Composable 重构版)
 * @date 2026-02-06
 */

import { logger } from '../../../utils/logger.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import {
  useCustomerServiceState,
  useCustomerServiceMethods,
  useUserContextState,
  useUserContextMethods
} from '../composables/index.js'

/**
 * 创建客服工作台页面组件
 * @returns {Object} Alpine.js组件配置对象
 */
function customerServicePage() {
  return {
    // ==================== Mixin 组合 ====================
    ...createPageMixin(),

    // ==================== Composables ====================
    ...useCustomerServiceState(),
    ...useCustomerServiceMethods(),
    ...useUserContextState(),
    ...useUserContextMethods(),

    // ==================== 生命周期 ====================

    init() {
      logger.info('客服工作台页面初始化 (Composable v3.1)')

      if (!this.checkAuth()) return

      // 获取用户信息
      try {
        const userStr = localStorage.getItem('admin_user')
        const userInfo = userStr ? JSON.parse(userStr) : null
        if (userInfo && userInfo.nickname) {
          this.welcomeText = userInfo.nickname
        }
      } catch {
        // ignore
      }

      // 加载数据
      this.loadSessions()
      this.loadAdminList()
      this.initWebSocket()
      this.loadResponseStats()

      // 定期轮询
      setInterval(() => this.loadSessions(true), 30000)
      setInterval(() => this.loadResponseStats(), 60000)

      // 页面卸载时关闭WebSocket
      this._beforeUnloadHandler = () => {
        if (this.wsConnection) this.wsConnection.disconnect()
      }
      window.addEventListener('beforeunload', this._beforeUnloadHandler)
    },

    /**
     * 组件销毁时清理资源
     */
    destroy() {
      if (this._beforeUnloadHandler) {
        window.removeEventListener('beforeunload', this._beforeUnloadHandler)
      }
      if (this._sessionPollTimer) clearInterval(this._sessionPollTimer)
      if (this._statsPollTimer) clearInterval(this._statsPollTimer)
      if (this.wsConnection) this.wsConnection.disconnect()
      logger.info('[CustomerService] 资源已清理')
    }
  }
}

// ========== Alpine.js 组件注册 ==========
document.addEventListener('alpine:init', () => {
  Alpine.data('customerServicePage', customerServicePage)
  Alpine.data('customerService', customerServicePage)
  logger.info('[CustomerServicePage] Alpine 组件已注册 (Composable v3.1)')
})
