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
import { EXCHANGE_ENDPOINTS } from '../../../api/market/exchange.js'

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
    /** @type {Object} 发货表单（含快递信息） */
    shipForm: { shipping_company: '', shipping_company_name: '', shipping_no: '', remark: '' },
    /** @type {Object|null} 物流轨迹数据 */
    orderTrack: null,
    /** @type {Array<Object>} 快递公司列表 */
    shippingCompanies: [],
    /** @type {boolean} 快递公司列表是否已加载 */
    shippingCompaniesLoaded: false,
    /** @type {number} 订单当前页码 */
    orderCurrentPage: 1,
    /** @type {number} 订单每页数量 */
    orderPageSize: 20,
    /** @type {Object} 订单分页信息 */
    orderPagination: { total_pages: 1, total: 0 }
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
          page_size: this.orderPageSize,
          ...this.orderFilters
        }
        Object.keys(params).forEach(k => !params[k] && delete params[k])

        const res = await request({
          url: EXCHANGE_ENDPOINTS.ORDERS,
          method: 'GET',
          params
        })

        if (res.success) {
          // 后端返回 { orders: [...], pagination: {...} }
          this.orders = res.data?.orders || []
          this.orderPagination = {
            total_pages: res.data?.pagination?.total_pages || 1,
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
      if (page < 1 || page > this.orderPagination.total_pages) return
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
          url: buildURL(EXCHANGE_ENDPOINTS.ORDER_DETAIL, {
            order_no: order.order_no
          }),
          method: 'GET'
        })
        if (res.success) {
          this.selectedOrder = res.data?.order || res.data
          this.showModal('orderDetailModal')
        }
      } catch (e) {
        logger.error('[ExchangeOrders] 加载订单详情失败:', e)
        this.showError?.('加载订单详情失败')
      }
    },

    /**
     * 发货操作（支持结构化快递信息）
     * @param {Object} order - 订单对象
     * @param {Object} [shippingInfo={}] - 快递信息
     * @param {string} [shippingInfo.shipping_company] - 快递公司代码
     * @param {string} [shippingInfo.shipping_company_name] - 快递公司名称
     * @param {string} [shippingInfo.shipping_no] - 快递单号
     * @param {string} [shippingInfo.remark] - 发货备注
     */
    async shipOrder(order, shippingInfo = {}) {
      const confirmed = await this.$confirm?.(`确定要发货订单 ${order.order_no} 吗？`)
      if (!confirmed) return

      try {
        this.saving = true
        const res = await request({
          url: buildURL(EXCHANGE_ENDPOINTS.ORDER_SHIP, {
            order_no: order.order_no
          }),
          method: 'POST',
          data: {
            remark: shippingInfo.remark || '',
            shipping_company: shippingInfo.shipping_company || null,
            shipping_company_name: shippingInfo.shipping_company_name || null,
            shipping_no: shippingInfo.shipping_no || null
          }
        })

        if (res.success) {
          this.showSuccess?.('发货成功')
          window.dispatchEvent(new CustomEvent('refresh-exchange-orders'))
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
     * 审核通过订单（管理员操作：pending → approved）
     * @param {Object} order - 订单对象
     */
    async approveOrder(order) {
      const confirmed = await this.$confirm?.(`确定要审核通过订单 ${order.order_no} 吗？`)
      if (!confirmed) return

      try {
        this.saving = true
        const res = await request({
          url: buildURL(EXCHANGE_ENDPOINTS.ORDER_APPROVE, {
            order_no: order.order_no
          }),
          method: 'POST',
          data: { remark: '管理员审核通过' }
        })

        if (res.success) {
          this.showSuccess?.('订单审核通过')
          window.dispatchEvent(new CustomEvent('refresh-exchange-orders'))
          this.loadOrderStats()
        } else {
          this.showError?.(res.message || '审核失败')
        }
      } catch (e) {
        logger.error('[ExchangeOrders] 审核通过失败:', e)
        this.showError?.('审核失败')
      } finally {
        this.saving = false
      }
    },

    /**
     * 退款订单（管理员操作：approved/shipped → refunded，退还材料资产）
     * @param {Object} order - 订单对象
     */
    async refundOrder(order) {
      const confirmed = await this.$confirm?.(
        `确定要退款订单 ${order.order_no} 吗？已支付的材料资产将退回用户账户。`,
        { type: 'danger' }
      )
      if (!confirmed) return

      try {
        this.saving = true
        const res = await request({
          url: buildURL(EXCHANGE_ENDPOINTS.ORDER_REFUND, {
            order_no: order.order_no
          }),
          method: 'POST',
          data: { remark: '管理员退款' }
        })

        if (res.success) {
          this.showSuccess?.('订单已退款，材料资产已退还用户')
          window.dispatchEvent(new CustomEvent('refresh-exchange-orders'))
          this.loadOrderStats()
        } else {
          this.showError?.(res.message || '退款失败')
        }
      } catch (e) {
        logger.error('[ExchangeOrders] 退款失败:', e)
        this.showError?.('退款失败')
      } finally {
        this.saving = false
      }
    },

    /**
     * 标记订单完成（管理员操作：shipped/received/rated → completed）
     * @param {Object} order - 订单对象
     */
    async completeOrder(order) {
      const confirmed = await this.$confirm?.(`确定要标记订单 ${order.order_no} 为已完成吗？`)
      if (!confirmed) return

      try {
        this.saving = true
        const res = await request({
          url: buildURL(EXCHANGE_ENDPOINTS.ORDER_COMPLETE, {
            order_no: order.order_no
          }),
          method: 'POST',
          data: { remark: '管理员标记完成' }
        })

        if (res.success) {
          this.showSuccess?.('订单已完成')
          window.dispatchEvent(new CustomEvent('refresh-exchange-orders'))
          this.loadOrderStats()
        } else {
          this.showError?.(res.message || '完成失败')
        }
      } catch (e) {
        logger.error('[ExchangeOrders] 完成订单失败:', e)
        this.showError?.('完成订单失败')
      } finally {
        this.saving = false
      }
    },

    /**
     * 拒绝订单（管理员操作：审核拒绝，退还材料资产）
     * @param {Object} order - 订单对象
     */
    async rejectOrder(order) {
      const confirmed = await this.$confirm?.(
        `确定要拒绝订单 ${order.order_no} 吗？已支付的资产将退回用户账户。`,
        { type: 'danger' }
      )
      if (!confirmed) return

      try {
        this.saving = true
        const res = await request({
          url: buildURL(EXCHANGE_ENDPOINTS.ORDER_REJECT, {
            order_no: order.order_no
          }),
          method: 'POST',
          data: { remark: '管理员拒绝审批' }
        })

        if (res.success) {
          this.showSuccess?.('订单已拒绝，资产已退还用户')
          window.dispatchEvent(new CustomEvent('refresh-exchange-orders'))
          this.loadOrderStats()
        } else {
          this.showError?.(res.message || '拒绝失败')
        }
      } catch (e) {
        logger.error('[ExchangeOrders] 拒绝订单失败:', e)
        this.showError?.('拒绝失败')
      } finally {
        this.saving = false
      }
    },

    /**
     * 打开发货弹窗（重置发货表单并显示弹窗）
     * @param {Object} order - 订单对象
     */
    openShipModal(order) {
      this.selectedOrder = order
      this.shipForm = {
        shipping_company: '',
        shipping_company_name: '',
        shipping_no: '',
        remark: ''
      }
      this.showModal('shipModal')
    },

    /**
     * 提交发货表单（从发货弹窗提交）
     */
    async submitShipForm() {
      if (!this.selectedOrder) return
      await this.shipOrder(this.selectedOrder, { ...this.shipForm })
      this.closeModal('shipModal')
    },

    /**
     * 快递公司选择变更时同步名称
     * @param {Event} e - change 事件
     */
    onShippingCompanyChange(e) {
      const code = e.target.value
      const company = (this.shippingCompanies || []).find(c => c.code === code)
      this.shipForm.shipping_company = code
      this.shipForm.shipping_company_name = company?.name || ''
    },

    /**
     * 加载快递公司列表
     */
    async loadShippingCompanies() {
      if (this.shippingCompaniesLoaded) return
      try {
        const res = await request({
          url: EXCHANGE_ENDPOINTS.SHIPPING_COMPANIES,
          method: 'GET'
        })
        if (res.success) {
          this.shippingCompanies = res.data?.companies || []
          this.shippingCompaniesLoaded = true
        }
      } catch (e) {
        logger.error('[ExchangeOrders] 加载快递公司列表失败:', e)
      }
    },

    /**
     * 查询订单物流轨迹
     * @param {string} orderNo - 订单号
     */
    async queryOrderTrack(orderNo) {
      try {
        const url = buildURL(EXCHANGE_ENDPOINTS.ORDER_TRACK, { order_no: orderNo })
        const res = await request({ url, method: 'GET' })
        if (res.success) {
          this.orderTrack = res.data
        } else {
          this.showError?.(res.message || '查询物流失败')
          this.orderTrack = null
        }
      } catch (e) {
        logger.error('[ExchangeOrders] 查询物流失败:', e)
        this.showError?.('查询物流轨迹失败')
        this.orderTrack = null
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
        approved: 'bg-info',
        processing: 'bg-info',
        shipped: 'bg-blue-500',
        received: 'bg-green-500',
        rated: 'bg-green-600',
        rejected: 'bg-red-500',
        refunded: 'bg-secondary',
        completed: 'bg-success',
        cancelled: 'bg-danger'
      }
      return map[status] || 'bg-secondary'
    }

    /**
     * 获取订单状态文本
     * @param {string} status - 订单状态
     * @returns {string} 状态文本
     */
    // ✅ 已删除 getOrderStatusText 映射函数 - 改用后端 _display 字段（P2 中文化）
  }
}

export default { useExchangeOrdersState, useExchangeOrdersMethods }
