/**
 * 客服工作台 - 用户订单聚合查询 Composable
 *
 * @file admin/src/modules/content/composables/cs-user-orders.js
 * @description A区「订单」Tab 的状态和方法，聚合查询用户的交易/兑换/消费订单
 * @version 1.0.0
 * @date 2026-05-27
 */

import { logger } from '../../../utils/logger.js'
import { buildURL, request } from '../../../api/base.js'
import { CONTENT_ENDPOINTS } from '../../../api/content.js'
import { UserAPI } from '../../../api/user.js'

/**
 * 用户订单聚合查询状态
 * @returns {Object} A区订单Tab状态
 */
export function useCsUserOrdersState() {
  return {
    /** @type {string} A区当前Tab（orders=订单列表, sessions=会话列表） */
    a_panel_tab: 'orders',
    /** @type {Array} 用户订单列表（三种类型混合） */
    user_orders: [],
    /** @type {boolean} 订单列表加载状态 */
    user_orders_loading: false,
    /** @type {number} 订单总数 */
    user_orders_total: 0
  }
}

/**
 * 用户订单聚合查询方法
 * @returns {Object} A区订单Tab方法
 */
export function useCsUserOrdersMethods() {
  return {
    /**
     * 加载用户订单列表（聚合三种订单类型）
     * 依赖 context_user_id（由 cs-user-context 提供）
     */
    async loadUserOrders() {
      let userId = this._getContextUserId()

      if (!userId && this.searchKeyword) {
        const mobile = this.searchKeyword.trim()
        if (/^1\d{10}$/.test(mobile)) {
          try {
            const res = await UserAPI.resolveUser({ mobile })
            if (res.success && res.data?.user_id) {
              userId = res.data.user_id
            }
          } catch (err) {
            logger.warn('[用户订单] 手机号解析失败:', err.message)
          }
        }
      }

      if (!userId) {
        this.user_orders = []
        this.user_orders_total = 0
        return
      }

      this.user_orders_loading = true
      try {
        const url = buildURL(CONTENT_ENDPOINTS.CS_USER_ORDERS, { user_id: userId })
        const res = await request({ url, method: 'GET' })
        if (res.success) {
          this.user_orders = res.data.orders || []
          this.user_orders_total = res.data.total || 0
          logger.info(`[用户订单] 加载成功: ${this.user_orders_total} 条`)
        }
      } catch (err) {
        logger.error('[用户订单] 加载失败:', err.message)
      } finally {
        this.user_orders_loading = false
      }
    },

    /**
     * 在 B区 打开订单详情 Tab
     * @param {Object} order - 订单对象（统一格式）
     */
    openOrderTab(order) {
      this.openWorkTab({
        type: 'order',
        id: order.order_id,
        label: `订单#${order.order_no || order.order_id}`,
        data: order
      })
      this._loadOrderIssues()
    },

    /**
     * 获取订单类型中文标签
     * @param {string} orderType - 订单类型（trade/redemption/consumption）
     * @returns {string} 中文标签
     */
    getOrderTypeLabel(orderType) {
      const labels = { trade: '交易', redemption: '兑换', consumption: '消费' }
      return labels[orderType] || '未知'
    },

    /**
     * 获取订单类型图标
     * @param {string} orderType - 订单类型
     * @returns {string} 图标字符
     */
    getOrderTypeIcon(orderType) {
      const icons = { trade: '🔄', redemption: '📦', consumption: '🏪' }
      return icons[orderType] || '📋'
    }
  }
}
