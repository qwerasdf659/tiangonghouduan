/**
 * 兑换订单管理模块
 *
 * @file admin/src/modules/market/composables/exchange-orders.js
 * @description 订单列表、状态管理、发货操作
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { buildURL, request } from '../../../api/base.js'
import { MARKET_ENDPOINTS } from '../../../api/market.js'

/**
 * 订单管理状态
 * @returns {Object} 状态对象
 */
export function useExchangeOrdersState() {
  return {
    /** @type {Array<Object>} 订单列表 */
    orders: [],
    /** @type {Object|null} 当前选中的订单详情 */
    selectedOrder: null,
    /** @type {Object} 订单统计信息 */
    orderStats: { total: 0, pending: 0, shipped: 0, cancelled: 0 },
    /** @type {Object} 订单筛选条件 */
    orderFilters: { status: '', order_no: '' },
    /** @type {number} 订单当前页码 */
    orderCurrentPage: 1,
    /** @type {number} 订单每页数量 */
    orderPageSize: 20,
    /** @type {Object} 订单分页信息 */
    orderPagination: { totalPages: 1, total: 0 }
  }
}

/**
 * 订单管理方法
 * @returns {Object} 方法对象
 */
export function useExchangeOrdersMethods() {
  return {
    /**
     * 加载订单列表
     */
    async loadOrders() {
      try {
        this.loading = true
        const params = {
          page: this.orderCurrentPage,
          pageSize: this.orderPageSize,
          ...this.orderFilters
        }
        Object.keys(params).forEach(k => !params[k] && delete params[k])

        const res = await request({
          url: MARKET_ENDPOINTS.EXCHANGE_ORDERS,
          method: 'GET',
          params
        })

        if (res.success) {
          // 后端返回 { orders: [...], pagination: {...} }
          this.orders = res.data?.orders || []
          this.orderPagination = {
            totalPages: res.data?.pagination?.total_pages || 1,
            total: res.data?.pagination?.total || this.orders.length
          }
        }
      } catch (e) {
        logger.error('[ExchangeOrders] 加载订单失败:', e)
        this.showError?.('加载订单失败')
      } finally {
        this.loading = false
      }
    },

    /**
     * 计算订单统计信息（从已加载的订单列表计算，后端暂无独立统计接口）
     */
    async loadOrderStats() {
      // 从分页信息和订单列表计算统计
      // 注意：这只统计当前已加载的数据
      try {
        const total = this.orderPagination?.total || this.orders.length
        const pending = this.orders.filter(o => o.status === 'pending').length
        const shipped = this.orders.filter(
          o => o.status === 'shipped' || o.status === 'completed'
        ).length
        const cancelled = this.orders.filter(o => o.status === 'cancelled').length

        this.orderStats = { total, pending, shipped, cancelled }
      } catch (e) {
        logger.error('[ExchangeOrders] 计算订单统计失败:', e)
      }
    },

    /**
     * 切换订单列表页码
     * @param {number} page - 目标页码
     */
    changeOrderPage(page) {
      if (page < 1 || page > this.orderPagination.totalPages) return
      this.orderCurrentPage = page
      this.loadOrders()
    },

    /**
     * 搜索订单
     */
    searchOrders() {
      this.orderCurrentPage = 1
      this.loadOrders()
    },

    /**
     * 重置订单筛选
     */
    resetOrderFilters() {
      this.orderFilters = { status: '', order_no: '' }
      this.orderCurrentPage = 1
      this.loadOrders()
    },

    /**
     * 查看订单详情
     * @param {Object} order - 订单对象
     */
    async viewOrderDetail(order) {
      try {
        const res = await request({
          url: buildURL(MARKET_ENDPOINTS.EXCHANGE_ORDER_DETAIL, {
            order_no: order.order_no
          }),
          method: 'GET'
        })
        if (res.success) {
          this.selectedOrder = res.data
          this.showModal('orderDetailModal')
        }
      } catch (e) {
        logger.error('[ExchangeOrders] 加载订单详情失败:', e)
        this.showError?.('加载订单详情失败')
      }
    },

    /**
     * 发货操作
     * @param {Object} order - 订单对象
     */
    async shipOrder(order) {
      const confirmed = await this.$confirm?.(`确定要发货订单 ${order.order_no} 吗？`)
      if (!confirmed) return

      try {
        this.saving = true
        const res = await request({
          url: buildURL(MARKET_ENDPOINTS.EXCHANGE_ORDER_SHIP, {
            order_no: order.order_no
          }),
          method: 'POST',
          data: { status: 'shipped' }
        })

        if (res.success) {
          this.showSuccess?.('发货成功')
          this.loadOrders()
          this.loadOrderStats()
        } else {
          this.showError?.(res.message || '发货失败')
        }
      } catch (e) {
        logger.error('[ExchangeOrders] 发货失败:', e)
        this.showError?.('发货失败')
      } finally {
        this.saving = false
      }
    },

    /**
     * 取消订单
     * @param {Object} order - 订单对象
     */
    async cancelOrder(order) {
      const confirmed = await this.$confirm?.(
        `确定要取消订单 ${order.order_no} 吗？已支付的资产将退回用户账户。`,
        { type: 'danger' }
      )
      if (!confirmed) return

      try {
        this.saving = true
        const res = await request({
          url: buildURL(MARKET_ENDPOINTS.EXCHANGE_ORDER_CANCEL, {
            order_no: order.order_no
          }),
          method: 'POST',
          data: { status: 'cancelled' }
        })

        if (res.success) {
          this.showSuccess?.('订单已取消')
          this.loadOrders()
          this.loadOrderStats()
        } else {
          this.showError?.(res.message || '取消失败')
        }
      } catch (e) {
        logger.error('[ExchangeOrders] 取消订单失败:', e)
        this.showError?.('取消失败')
      } finally {
        this.saving = false
      }
    },

    /**
     * 获取订单状态CSS类
     * @param {string} status - 订单状态
     * @returns {string} CSS类名
     */
    getOrderStatusClass(status) {
      const map = {
        pending: 'bg-warning',
        processing: 'bg-info',
        shipped: 'bg-success',
        completed: 'bg-success',
        cancelled: 'bg-danger',
        refunded: 'bg-secondary'
      }
      return map[status] || 'bg-secondary'
    },

    /**
     * 获取订单状态文本
     * @param {string} status - 订单状态
     * @returns {string} 状态文本
     */
    getOrderStatusText(status) {
      const map = {
        pending: '待发货',
        processing: '处理中',
        shipped: '已发货',
        completed: '已完成',
        cancelled: '已取消',
        refunded: '已退款'
      }
      return map[status] || status
    }
  }
}

export default { useExchangeOrdersState, useExchangeOrdersMethods }
