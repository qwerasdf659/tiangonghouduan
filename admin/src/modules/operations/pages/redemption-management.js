/**
 * @fileoverview 兑换核销管理页面
 * @module modules/operations/pages/redemption-management
 * @description 管理兑换核销订单：列表查询、核销、取消、批量操作
 *
 * 后端路由：/api/v4/console/business-records/redemption-orders
 *
 * @version 1.0.0
 * @date 2026-02-17
 */

import { logger } from '../../../utils/logger.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'
import { RedemptionAPI } from '../../../api/redemption.js'
import { STORE_ENDPOINTS } from '../../../api/store.js'

/**
 * 创建兑换核销管理页面组件
 * @returns {Object} Alpine.js 组件配置对象
 */
function redemptionManagementPage() {
  return {
    // ==================== Mixin 组合 ====================
    ...createPageMixin({
      pagination: { page_size: 20 },
      modal: true,
      tableSelection: 'redemption_order_id',
      asyncData: true,
      authGuard: true
    }),

    // ==================== 页面状态 ====================

    /** @type {Array} 核销订单列表 */
    orders: [],

    /** @type {Object} 统计数据 */
    stats: {
      total: 0,
      pending: 0,
      fulfilled: 0,
      expired: 0,
      cancelled: 0
    },

    /** @type {Object} 筛选条件 */
    filter: {
      status: '',
      redeemer_user_id: '',
      start_date: '',
      end_date: ''
    },

    /** @type {Object|null} 当前查看的订单详情 */
    orderDetail: null,

    /** @type {Object} 核销表单 */
    redeemForm: {
      order_id: '',
      store_id: '',
      remark: ''
    },

    /** @type {Object} 取消表单 */
    cancelForm: {
      order_id: '',
      reason: ''
    },

    /** @type {Array} 门店列表（用于核销时选择门店） */
    stores: [],

    // ==================== 生命周期 ====================

    /**
     * 初始化页面
     */
    async init() {
      logger.info('[RedemptionMgmt] 初始化兑换核销管理页面')

      if (!this.checkAuth()) return

      // 并行加载数据
      await Promise.all([
        this.loadStats(),
        this.loadOrders(),
        this.loadStores()
      ])

      logger.info('[RedemptionMgmt] 初始化完成')
    },

    // ==================== 数据加载 ====================

    /**
     * 加载统计数据
     */
    async loadStats() {
      try {
        const result = await RedemptionAPI.getStatistics()
        if (result.success && result.data) {
          this.stats = {
            total: result.data.total || 0,
            pending: result.data.pending || 0,
            fulfilled: result.data.fulfilled || 0,
            expired: result.data.expired || 0,
            cancelled: result.data.cancelled || 0
          }
          logger.debug('[RedemptionMgmt] 统计数据加载成功', this.stats)
        }
      } catch (error) {
        logger.warn('[RedemptionMgmt] 加载统计数据失败:', error.message)
      }
    },

    /**
     * 加载核销订单列表
     */
    async loadOrders() {
      this.loading = true
      try {
        const params = {
          page: this.pagination.page,
          page_size: this.pagination.page_size
        }

        // 应用筛选条件
        if (this.filter.status) params.status = this.filter.status
        if (this.filter.redeemer_user_id) params.redeemer_user_id = this.filter.redeemer_user_id
        if (this.filter.start_date) params.start_date = this.filter.start_date
        if (this.filter.end_date) params.end_date = this.filter.end_date

        const result = await RedemptionAPI.getList(params)

        if (result.success && result.data) {
          this.orders = result.data.orders || result.data.items || result.data.list || []
          this.pagination.total = result.data.pagination?.total || result.data.total || 0
          logger.debug('[RedemptionMgmt] 订单列表加载成功', {
            count: this.orders.length,
            total: this.pagination.total
          })
        }
      } catch (error) {
        logger.error('[RedemptionMgmt] 加载订单列表失败:', error)
        this.orders = []
        this.pagination.total = 0
      } finally {
        this.loading = false
      }
    },

    /**
     * 加载门店列表
     */
    async loadStores() {
      try {
        const result = await this.apiGet(STORE_ENDPOINTS.LIST, {}, { showLoading: false, showError: false })
        const data = result?.success ? result.data : result
        if (data) {
          this.stores = data.items || data.stores || data.list || []
        }
      } catch (error) {
        logger.warn('[RedemptionMgmt] 加载门店列表失败:', error.message)
      }
    },

    // ==================== 筛选和搜索 ====================

    /**
     * 按状态筛选
     * @param {string} status - 状态值
     */
    filterByStatus(status) {
      this.filter.status = status
      this.pagination.page = 1
      this.loadOrders()
    },

    /**
     * 搜索
     */
    search() {
      this.pagination.page = 1
      this.loadOrders()
    },

    /**
     * 重置筛选条件
     */
    resetFilter() {
      this.filter = { status: '', redeemer_user_id: '', start_date: '', end_date: '' }
      this.pagination.page = 1
      this.loadOrders()
    },

    // ==================== 核销操作 ====================

    /**
     * 打开核销弹窗
     * @param {Object} order - 订单对象
     */
    openRedeemModal(order) {
      this.redeemForm = {
        order_id: order.redemption_order_id || order.order_id,
        store_id: '',
        remark: ''
      }
      this.orderDetail = order
      this.showModal('redeemModal')
    },

    /**
     * 确认核销
     */
    async confirmRedeem() {
      if (!this.redeemForm.order_id) {
        Alpine.store('notification').show('订单ID不能为空', 'error')
        return
      }

      try {
        this.loading = true
        const result = await RedemptionAPI.redeem(this.redeemForm.order_id, {
          store_id: this.redeemForm.store_id || undefined,
          remark: this.redeemForm.remark || undefined
        })

        if (result.success) {
          Alpine.store('notification').show('核销成功', 'success')
          this.hideModal('redeemModal')
          await Promise.all([this.loadStats(), this.loadOrders()])
        } else {
          Alpine.store('notification').show(result.message || '核销失败', 'error')
        }
      } catch (error) {
        logger.error('[RedemptionMgmt] 核销失败:', error)
        Alpine.store('notification').show('核销失败: ' + error.message, 'error')
      } finally {
        this.loading = false
      }
    },

    // ==================== 取消操作 ====================

    /**
     * 打开取消弹窗
     * @param {Object} order - 订单对象
     */
    openCancelModal(order) {
      this.cancelForm = {
        order_id: order.redemption_order_id || order.order_id,
        reason: ''
      }
      this.orderDetail = order
      this.showModal('cancelModal')
    },

    /**
     * 确认取消
     */
    async confirmCancel() {
      if (!this.cancelForm.order_id) {
        Alpine.store('notification').show('订单ID不能为空', 'error')
        return
      }

      try {
        this.loading = true
        const result = await RedemptionAPI.cancel(this.cancelForm.order_id, {
          reason: this.cancelForm.reason || undefined
        })

        if (result.success) {
          Alpine.store('notification').show('取消成功', 'success')
          this.hideModal('cancelModal')
          await Promise.all([this.loadStats(), this.loadOrders()])
        } else {
          Alpine.store('notification').show(result.message || '取消失败', 'error')
        }
      } catch (error) {
        logger.error('[RedemptionMgmt] 取消失败:', error)
        Alpine.store('notification').show('取消失败: ' + error.message, 'error')
      } finally {
        this.loading = false
      }
    },

    // ==================== 查看详情 ====================

    /**
     * 查看订单详情
     * @param {Object} order - 订单对象
     */
    async viewDetail(order) {
      const orderId = order.redemption_order_id || order.order_id
      try {
        const result = await RedemptionAPI.getDetail(orderId)
        if (result.success && result.data) {
          // 后端直接返回订单对象
          this.orderDetail = result.data
          this.showModal('detailModal')
        }
      } catch (error) {
        logger.error('[RedemptionMgmt] 获取详情失败:', error)
        Alpine.store('notification').show('获取详情失败: ' + error.message, 'error')
      }
    },

    // ==================== 批量操作 ====================

    /**
     * 批量过期处理
     */
    async batchExpire() {
      if (!this.hasSelected) {
        Alpine.store('notification').show('请先选择要处理的订单', 'warning')
        return
      }

      const confirmed = await Alpine.store('confirm').show(
        '批量过期确认',
        `确定要将选中的 ${this.selectedCount} 个订单标记为过期吗？`
      )
      if (!confirmed) return

      try {
        this.loading = true
        const result = await RedemptionAPI.batchExpire(this.selectedIds)

        if (result.success) {
          Alpine.store('notification').show(
            `成功处理 ${result.data?.updated_count || this.selectedCount} 个订单`,
            'success'
          )
          this.clearSelection()
          await Promise.all([this.loadStats(), this.loadOrders()])
        } else {
          Alpine.store('notification').show(result.message || '批量操作失败', 'error')
        }
      } catch (error) {
        logger.error('[RedemptionMgmt] 批量过期失败:', error)
        Alpine.store('notification').show('批量操作失败: ' + error.message, 'error')
      } finally {
        this.loading = false
      }
    },

    // ==================== 导出 ====================

    /**
     * 导出核销订单
     */
    exportOrders() {
      const url = RedemptionAPI.getExportUrl({ status: this.filter.status })
      // 使用隐藏的 a 标签触发下载
      const a = document.createElement('a')
      a.href = url
      a.download = ''
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      Alpine.store('notification').show('正在导出，请稍候...', 'info')
    },

    // ==================== 分页 ====================

    /**
     * 总页数（getter）
     */
    get totalPages() {
      return Math.ceil(this.pagination.total / this.pagination.page_size) || 1
    },

    /**
     * 切换页码
     * @param {number} page - 页码
     */
    changePage(page) {
      if (page < 1 || page > this.totalPages) return
      this.pagination.page = page
      this.loadOrders()
    },

    // ==================== 工具方法 ====================

    /**
     * 获取状态标签
     * @param {string} status - 状态值
     * @returns {string} 中文标签
     */
    getStatusLabel(status) {
      const labels = {
        pending: '待核销',
        fulfilled: '已核销',
        expired: '已过期',
        cancelled: '已取消'
      }
      return labels[status] || status
    },

    /**
     * 获取状态样式类
     * @param {string} status - 状态值
     * @returns {string} CSS 类名
     */
    getStatusClass(status) {
      const classes = {
        pending: 'bg-yellow-100 text-yellow-800',
        fulfilled: 'bg-green-100 text-green-800',
        expired: 'bg-gray-100 text-gray-800',
        cancelled: 'bg-red-100 text-red-800'
      }
      return classes[status] || 'bg-gray-100 text-gray-800'
    },

    /**
     * 获取奖品名称
     * @param {Object} order - 订单对象
     * @returns {string} 奖品名称
     */
    getPrizeName(order) {
      if (order.item_instance) {
        const meta = order.item_instance.meta || {}
        return meta.prize_name || meta.name || order.item_instance.item_type || '--'
      }
      return order.prize_name || '--'
    },

    /**
     * 获取用户信息显示
     * @param {Object} order - 订单对象
     * @returns {string} 用户信息
     */
    getUserDisplay(order) {
      if (order.redeemer) {
        return order.redeemer.nickname || order.redeemer.mobile || `用户#${order.redeemer.user_id}`
      }
      if (order.redeemer_user_id) {
        return `用户#${order.redeemer_user_id}`
      }
      return '--'
    }
  }
}

// 注册 Alpine 组件
document.addEventListener('alpine:init', () => {
  if (window.Alpine) {
    window.Alpine.data('redemptionManagementPage', redemptionManagementPage)
    logger.info('[RedemptionMgmt] Alpine 组件注册完成')
  }
})

export { redemptionManagementPage }
export default redemptionManagementPage

