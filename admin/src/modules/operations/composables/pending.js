/**
 * 待处理中心 - Composable
 *
 * @file admin/src/modules/operations/composables/pending.js
 * @description 从 pending-center.js 提取的状态和方法
 * @version 1.0.0
 * @date 2026-02-06
 */

import { logger } from '../../../utils/logger.js'
import { PendingAPI } from '../../../api/pending.js'

/**
 * 待处理中心状态
 * @returns {Object} 状态对象
 */
export function usePendingState() {
  return {
    /** 加载状态 */
    loading: false,
    /** 最后更新时间 */
    lastUpdateTime: '--:--:--',

    /** 健康度状态 */
    healthScore: {
      score: null,
      status: 'unknown',
      status_text: '加载中...',
      components: {},
      alerts: []
    },

    /** 自动刷新控制 */
    autoRefresh: true,
    refreshInterval: 30000,

    /** 批量操作 */
    selectedIds: [],
    selectAll: false,

    /** 汇总统计 */
    summary: {
      consumption: 0,
      customer_service: 0,
      lottery_alert: 0,
      risk_alert: 0,
      refund: 0,
      redemption: 0,
      feedback: 0,
      total: 0,
      total_urgent: 0
    },

    /** 紧急事项 */
    urgentItems: [],

    /** 待处理列表 */
    items: [],

    /** 筛选条件 */
    filter: {
      type: '',
      urgency: '',
      sort: 'created_at_desc'
    },

    /** 分页 */
    pagination: {
      page: 1,
      page_size: 20,
      total: 0
    },

    /** 更新计时器 */
    updateTimer: null
  }
}

/**
 * 待处理中心方法
 * @returns {Object} 方法对象
 */
export function usePendingMethods() {
  return {
    /** 计算属性：总页数 */
    get totalPages() {
      return Math.ceil(this.pagination.total / this.pagination.page_size) || 1
    },

    /** 计算属性：是否有选中项 */
    get hasSelected() {
      return this.selectedIds.length > 0
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
            status_text: result.data.status_text || result.data.status || '未知状态',
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
     * 获取健康度状态颜色类
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

          if (segments) {
            segments.forEach(seg => {
              if (seg.category && Object.hasOwn(this.summary, seg.category)) {
                this.summary[seg.category] = seg.count || 0
              }
            })
          }

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
        const params = {
          page: this.pagination.page,
          page_size: this.pagination.page_size
        }

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

    toggleSelectAll() {
      this.selectAll = !this.selectAll
      if (this.selectAll) {
        this.selectedIds = this.items.map(item => item.id)
      } else {
        this.selectedIds = []
      }
    },

    toggleSelect(id) {
      const index = this.selectedIds.indexOf(id)
      if (index > -1) {
        this.selectedIds.splice(index, 1)
      } else {
        this.selectedIds.push(id)
      }
      this.selectAll = this.selectedIds.length === this.items.length && this.items.length > 0
    },

    isSelected(id) {
      return this.selectedIds.includes(id)
    },

    clearSelection() {
      this.selectedIds = []
      this.selectAll = false
    },

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

    async batchReject() {
      if (this.selectedIds.length === 0) {
        Alpine.store('notification').show('请先选择要处理的项目', 'warning')
        return
      }

      const reason = prompt(`请输入拒绝 ${this.selectedIds.length} 个待办事项的原因：`)
      if (reason === null) return

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

    handleAllTimeout() {
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

    changePage(page) {
      if (page < 1 || page > this.totalPages) return
      this.pagination.page = page
      this.loadPendingItems()
    },

    handleItem(item) {
      const urlMap = {
        consumption: '/admin/finance-management.html',
        customer_service: '/admin/customer-service.html',
        lottery_alert: '/admin/lottery-alerts.html',
        risk_alert: '/admin/risk-alerts.html',
        refund: '/admin/finance-management.html',
        redemption: '/admin/redemption-management.html',
        feedback: '/admin/customer-service.html'
      }

      const url = urlMap[item.type] || '/admin/finance-management.html'

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

    // ==================== 工具方法 ====================

    getTypeIcon(type) {
      const icons = {
        consumption: '📋',
        customer_service: '💬',
        lottery_alert: '🎰',
        risk_alert: '⚠️',
        refund: '💰',
        redemption: '🎫',
        feedback: '📝'
      }
      return icons[type] || '📄'
    },

    getTypeLabel(type) {
      const labels = {
        consumption: '消耗审核',
        customer_service: '客服会话',
        lottery_alert: '抽奖告警',
        risk_alert: '风控告警',
        refund: '退款申请',
        redemption: '兑换核销',
        feedback: '用户反馈'
      }
      return labels[type] || type
    },

    getUrgencyLabel(urgency) {
      const labels = {
        urgent: '紧急',
        high: '高',
        normal: '普通',
        low: '低'
      }
      return labels[urgency] || urgency
    },

    getTimeoutMinutes(createdAt) {
      if (!createdAt) return 0
      const created = new Date(createdAt)
      const now = new Date()
      return Math.floor((now - created) / 60000)
    },

    getTimeoutClass(createdAt) {
      const minutes = this.getTimeoutMinutes(createdAt)
      if (minutes > 30) return 'timeout-critical'
      if (minutes > 10) return 'timeout-warning'
      return 'text-gray-500'
    },

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



































