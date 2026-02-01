/**
 * @fileoverview 待处理中心页面 - Alpine.js Mixin 版本
 * @module modules/operations/pages/pending-center
 * @description 汇总所有待处理事项，提供统一的处理入口
 *
 * 功能特性:
 * - 汇总统计（消耗审核、客服会话、抽奖告警、风控告警、退款申请）
 * - 紧急事项高亮显示
 * - 统一待处理列表，支持分类筛选和排序
 * - 实时刷新（30秒间隔）
 *
 * @version 1.0.0
 * @date 2026-01-31
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

    // 更新计时器
    updateTimer: null,

    /**
     * 初始化页面
     */
    async init() {
      logger.info('[PendingCenter] 初始化待处理中心')

      await this.loadSummary()
      await this.loadPendingItems()

      // 每30秒刷新一次
      this.updateTimer = setInterval(() => {
        this.loadSummary()
        this.loadPendingItems()
      }, 30 * 1000)

      logger.info('[PendingCenter] 初始化完成')
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
      await this.loadSummary()
      await this.loadPendingItems()
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
