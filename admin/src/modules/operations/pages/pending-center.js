/**
 * @fileoverview 待处理中心页面 - Alpine.js Mixin 版本
 * @module modules/operations/pages/pending-center
 * @description 汇总所有待处理事项，提供统一的处理入口
 *
 * 功能特性:
 * - 汇总统计（消耗审核、客服会话、抽奖告警、风控告警、退款申请）
 * - 待办健康度评分（0-100分，带进度条和状态）
 * - 紧急事项高亮显示
 * - 统一待处理列表，支持分类筛选和排序
 * - 可配置的自动刷新（30秒间隔）
 * - 批量操作支持
 *
 * @version 1.1.0
 * @date 2026-02-03
 */

import { logger } from '../../../utils/logger.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'
import { PendingAPI } from '../../../api/pending.js'

/**
 * 创建待处理中心页面组件
 * @returns {Object} Alpine.js 组件配置对象
 */
function pendingCenterPage() {
  return {
    // ==================== Mixin 组合 ====================
    ...createPageMixin(),

    // ==================== 页面状态 ====================
    loading: false,
    lastUpdateTime: '--:--:--',

    // ==================== 健康度状态 ====================
    healthScore: {
      score: null, // 0-100 或 null（加载中/失败时）
      status: 'unknown', // healthy/warning/critical/unknown
      status_text: '加载中...',
      components: {},
      alerts: []
    },

    // ==================== 自动刷新控制 ====================
    autoRefresh: true,
    refreshInterval: 30000, // 30秒

    // ==================== 批量操作 ====================
    selectedIds: [],
    selectAll: false,

    // 汇总统计
    summary: {
      consumption: 0,
      customer_service: 0,
      lottery_alert: 0,
      risk_alert: 0,
      refund: 0,
      total: 0,
      total_urgent: 0
    },

    // 紧急事项（超时或标记为紧急的）
    urgentItems: [],

    // 待处理列表
    items: [],

    // 筛选条件
    filter: {
      type: '', // 对应后端 category
      urgency: '', // 对应后端 urgent_only
      sort: 'created_at_desc'
    },

    // 分页 - 遵循分页规范
    pagination: {
      page: 1,
      page_size: 20,
      total: 0
    },

    // 计算属性：总页数
    get totalPages() {
      return Math.ceil(this.pagination.total / this.pagination.page_size) || 1
    },

    // 计算属性：是否有选中项
    get hasSelected() {
      return this.selectedIds.length > 0
    },

    // 更新计时器
    updateTimer: null,

    /**
     * 初始化页面
     */
    async init() {
      logger.info('[PendingCenter] 初始化待处理中心')

      // 并行加载数据
      await Promise.all([this.loadHealthScore(), this.loadSummary(), this.loadPendingItems()])

      // 启动自动刷新
      this.startAutoRefresh()

      logger.info('[PendingCenter] 初始化完成')
    },

    /**
     * 启动自动刷新
     */
    startAutoRefresh() {
      if (this.updateTimer) {
        clearInterval(this.updateTimer)
      }

      if (this.autoRefresh) {
        this.updateTimer = setInterval(() => {
          logger.debug('[PendingCenter] 自动刷新数据')
          this.loadHealthScore()
          this.loadSummary()
          this.loadPendingItems()
        }, this.refreshInterval)
      }
    },

    /**
     * 切换自动刷新开关
     */
    toggleAutoRefresh() {
      this.autoRefresh = !this.autoRefresh
      this.startAutoRefresh()
      logger.info('[PendingCenter] 自动刷新', this.autoRefresh ? '已开启' : '已关闭')
    },

    /**
     * 加载健康度评分
     */
    async loadHealthScore() {
      try {
        const result = await PendingAPI.getHealthScore()

        if (result.success && result.data) {
          this.healthScore = {
            score: result.data.score ?? null,
            status: result.data.status || 'unknown',
            status_text: result.data.status_text || this.getStatusText(result.data.status),
            components: result.data.components || {},
            alerts: result.data.alerts || []
          }
          logger.debug('[PendingCenter] 健康度加载成功', { score: this.healthScore.score })
        }
      } catch (e) {
        logger.warn('[PendingCenter] loadHealthScore 失败:', e.message)
        this.healthScore.score = null
        this.healthScore.status = 'unknown'
        this.healthScore.status_text = '数据加载失败'
      }
    },

    /**
     * 获取健康度状态文本
     * @param {string} status - 状态码
     * @returns {string}
     */
    getStatusText(status) {
      const textMap = {
        healthy: '状态良好',
        warning: '压力较大，建议及时处理',
        critical: '需要立即处理'
      }
      return textMap[status] || '未知状态'
    },

    /**
     * 获取健康度状态颜色类
     * @returns {string}
     */
    getHealthScoreColorClass() {
      const score = this.healthScore.score
      if (score === null) return 'bg-gray-400'
      if (score >= 90) return 'bg-green-500'
      if (score >= 70) return 'bg-yellow-500'
      if (score >= 50) return 'bg-orange-500'
      return 'bg-red-500'
    },

    /**
     * 获取健康度状态文本颜色类
     */
    getHealthScoreTextClass() {
      const score = this.healthScore.score
      if (score === null) return 'text-gray-600'
      if (score >= 90) return 'text-green-600'
      if (score >= 70) return 'text-yellow-600'
      if (score >= 50) return 'text-orange-600'
      return 'text-red-600'
    },

    /**
     * 获取健康度状态标签
     */
    getHealthStatusLabel() {
      const score = this.healthScore.score
      if (score === null) return '--'
      if (score >= 90) return '优秀'
      if (score >= 70) return '良好'
      if (score >= 50) return '警告'
      return '危险'
    },

    /**
     * 加载汇总统计
     */
    async loadSummary() {
      try {
        const result = await PendingAPI.getSummary()

        if (result.success && result.data) {
          const { segments, total } = result.data

          // 后端返回格式: { segments: [...], total: {...} }
          if (segments) {
            segments.forEach(seg => {
              if (seg.category && this.summary.hasOwnProperty(seg.category)) {
                this.summary[seg.category] = seg.count || 0
              }
            })
          }

          // 保存总计
          if (total) {
            this.summary.total = total.total_count || 0
            this.summary.total_urgent = total.urgent_count || 0
          }

          logger.debug('[PendingCenter] 汇总数据加载成功', this.summary)
        }
      } catch (e) {
        logger.warn('[PendingCenter] loadSummary 失败:', e.message)
      }
    },

    /**
     * 加载待处理列表
     */
    async loadPendingItems() {
      this.loading = true

      try {
        // 构建请求参数 - 使用后端字段名
        const params = {
          page: this.pagination.page,
          page_size: this.pagination.page_size
        }

        // 映射筛选条件到后端参数
        if (this.filter.type) {
          params.category = this.filter.type
        }
        if (this.filter.urgency === 'urgent') {
          params.urgent_only = 'true'
        }

        const result = await PendingAPI.getList(params)

        if (result.success && result.data) {
          this.items = result.data.items || []
          this.pagination.total = result.data.pagination?.total || result.data.total || 0

          // 筛选出紧急事项
          this.urgentItems = this.items.filter(
            item =>
              item.is_urgent ||
              item.urgency === 'urgent' ||
              this.getTimeoutMinutes(item.created_at) > 30
          )
        }

        this.lastUpdateTime = new Date().toLocaleTimeString('zh-CN', {
          hour12: false,
          timeZone: 'Asia/Shanghai'
        })
      } catch (e) {
        logger.warn('[PendingCenter] loadPendingItems 失败:', e.message)
        this.items = []
        this.pagination.total = 0
      } finally {
        this.loading = false
      }
    },

    /**
     * 刷新所有数据
     */
    async refreshAll() {
      await Promise.all([this.loadHealthScore(), this.loadSummary(), this.loadPendingItems()])
    },

    // ==================== 批量操作 ====================

    /**
     * 切换全选状态
     */
    toggleSelectAll() {
      this.selectAll = !this.selectAll
      if (this.selectAll) {
        this.selectedIds = this.items.map(item => item.id)
      } else {
        this.selectedIds = []
      }
    },

    /**
     * 切换单项选择
     * @param {number} id - 项目ID
     */
    toggleSelect(id) {
      const index = this.selectedIds.indexOf(id)
      if (index > -1) {
        this.selectedIds.splice(index, 1)
      } else {
        this.selectedIds.push(id)
      }
      // 更新全选状态
      this.selectAll = this.selectedIds.length === this.items.length && this.items.length > 0
    },

    /**
     * 检查项目是否被选中
     * @param {number} id - 项目ID
     * @returns {boolean}
     */
    isSelected(id) {
      return this.selectedIds.includes(id)
    },

    /**
     * 清除选中
     */
    clearSelection() {
      this.selectedIds = []
      this.selectAll = false
    },

    /**
     * 批量通过选中项
     */
    async batchApprove() {
      if (this.selectedIds.length === 0) {
        Alpine.store('notification').show('请先选择要处理的项目', 'warning')
        return
      }

      const confirmed = await Alpine.store('confirm').show(
        '批量通过确认',
        `确定要通过选中的 ${this.selectedIds.length} 个待办事项吗？`
      )
      if (!confirmed) return

      try {
        this.loading = true
        const response = await PendingAPI.batch({
          ids: this.selectedIds,
          action: 'approve'
        })

        if (response.success) {
          Alpine.store('notification').show(
            `成功通过 ${this.selectedIds.length} 个待办事项`,
            'success'
          )
          this.clearSelection()
          await this.refreshAll()
        } else {
          Alpine.store('notification').show(response.message || '批量通过失败', 'error')
        }
      } catch (error) {
        logger.error('[PendingCenter] 批量通过失败:', error)
        Alpine.store('notification').show('批量通过失败: ' + error.message, 'error')
      } finally {
        this.loading = false
      }
    },

    /**
     * 批量拒绝选中项
     */
    async batchReject() {
      if (this.selectedIds.length === 0) {
        Alpine.store('notification').show('请先选择要处理的项目', 'warning')
        return
      }

      // 弹出拒绝原因输入
      const reason = prompt(`请输入拒绝 ${this.selectedIds.length} 个待办事项的原因：`)
      if (reason === null) return // 用户取消

      if (!reason.trim()) {
        Alpine.store('notification').show('请填写拒绝原因', 'warning')
        return
      }

      try {
        this.loading = true
        const response = await PendingAPI.batch({
          ids: this.selectedIds,
          action: 'reject',
          reason: reason.trim()
        })

        if (response.success) {
          Alpine.store('notification').show(
            `成功拒绝 ${this.selectedIds.length} 个待办事项`,
            'success'
          )
          this.clearSelection()
          await this.refreshAll()
        } else {
          Alpine.store('notification').show(response.message || '批量拒绝失败', 'error')
        }
      } catch (error) {
        logger.error('[PendingCenter] 批量拒绝失败:', error)
        Alpine.store('notification').show('批量拒绝失败: ' + error.message, 'error')
      } finally {
        this.loading = false
      }
    },

    /**
     * 批量处理超时项（跳转到对应页面）
     */
    handleAllTimeout() {
      // 跳转到消费审核页面，带超时筛选参数
      const url = '/admin/finance-management.html?filter=timeout'
      if (window.parent && window.parent !== window) {
        window.parent.dispatchEvent(
          new CustomEvent('open-tab', {
            detail: {
              id: 'consumption-review-timeout',
              title: '超时审核处理',
              icon: '🔴',
              url: url
            }
          })
        )
      } else {
        window.location.href = url
      }
    },

    /**
     * 分页切换
     * @param {number} page - 目标页码
     */
    changePage(page) {
      if (page < 1 || page > this.totalPages) return
      this.pagination.page = page
      this.loadPendingItems()
    },

    /**
     * 处理待办事项 - 跳转到对应页面
     * @param {Object} item - 待处理项
     */
    handleItem(item) {
      const urlMap = {
        consumption: '/admin/finance-management.html',
        customer_service: '/admin/customer-service.html',
        lottery_alert: '/admin/lottery-alerts.html',
        risk_alert: '/admin/risk-alerts.html',
        refund: '/admin/finance-management.html'
      }

      const url = urlMap[item.type] || '/admin/finance-management.html'

      // 通知父窗口打开Tab
      if (window.parent && window.parent !== window) {
        window.parent.dispatchEvent(
          new CustomEvent('open-tab', {
            detail: {
              id: item.type,
              title: this.getTypeLabel(item.type),
              icon: this.getTypeIcon(item.type),
              url: url
            }
          })
        )
      } else {
        window.location.href = url
      }
    },

    /**
     * 获取类型图标
     */
    getTypeIcon(type) {
      const icons = {
        consumption: '📋',
        customer_service: '💬',
        lottery_alert: '🎰',
        risk_alert: '⚠️',
        refund: '💰'
      }
      return icons[type] || '📄'
    },

    /**
     * 获取类型标签
     */
    getTypeLabel(type) {
      const labels = {
        consumption: '消耗审核',
        customer_service: '客服会话',
        lottery_alert: '抽奖告警',
        risk_alert: '风控告警',
        refund: '退款申请'
      }
      return labels[type] || type
    },

    /**
     * 获取紧急程度标签
     */
    getUrgencyLabel(urgency) {
      const labels = {
        urgent: '紧急',
        high: '高',
        normal: '普通',
        low: '低'
      }
      return labels[urgency] || urgency
    },

    /**
     * 计算等待时间（分钟）
     */
    getTimeoutMinutes(createdAt) {
      if (!createdAt) return 0
      const created = new Date(createdAt)
      const now = new Date()
      return Math.floor((now - created) / 60000)
    },

    /**
     * 获取超时样式类
     */
    getTimeoutClass(createdAt) {
      const minutes = this.getTimeoutMinutes(createdAt)
      if (minutes > 30) return 'timeout-critical'
      if (minutes > 10) return 'timeout-warning'
      return 'text-gray-500'
    },

    /**
     * 格式化等待时间
     */
    formatWaitingTime(createdAt) {
      const minutes = this.getTimeoutMinutes(createdAt)
      if (minutes < 1) return '刚刚'
      if (minutes < 60) return minutes + '分钟'
      const hours = Math.floor(minutes / 60)
      const mins = minutes % 60
      if (hours < 24) return hours + '小时' + (mins > 0 ? mins + '分' : '')
      const days = Math.floor(hours / 24)
      return days + '天' + (hours % 24) + '小时'
    },

    /**
     * 格式化时间
     */
    formatTime(dateStr) {
      if (!dateStr) return '--'
      return new Date(dateStr).toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Shanghai'
      })
    }
  }
}

// 注册 Alpine 组件
document.addEventListener('alpine:init', () => {
  if (window.Alpine) {
    window.Alpine.data('pendingCenterPage', pendingCenterPage)
    logger.info('[PendingCenter] Alpine 组件注册完成')
  }
})

// 导出
export { pendingCenterPage }
export default pendingCenterPage
