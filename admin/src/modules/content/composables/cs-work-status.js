/**
 * 客服工作台 - 顶部工作状态栏 Composable
 *
 * @file admin/src/modules/content/composables/cs-work-status.js
 * @description 实时工作仪表板：等待队列、SLA告警、工单待处理数、满意度统计
 */

import { logger } from '../../../utils/logger.js'
import { request, buildQueryString } from '../../../api/base.js'
import { CONTENT_ENDPOINTS } from '../../../api/content.js'

/**
 * 工作状态栏状态
 * @returns {Object} 状态对象
 */
export function useCsWorkStatusState() {
  return {
    /** 等待中的会话数 */
    waitingCount: 0,
    /** 最久等待时间（分钟） */
    maxWaitMinutes: 0,
    /** 处理中的会话数 */
    activeCount: 0,
    /** 今日已解决数 */
    resolvedTodayCount: 0,
    /** SLA超时会话数（等待>15分钟） */
    slaBreachCount: 0,
    /** 待处理工单数 */
    pendingIssueCount: 0,
    /** 平均满意度评分 */
    avgSatisfaction: null
  }
}

/**
 * 工作状态栏方法
 * @returns {Object} 方法对象
 */
export function useCsWorkStatusMethods() {
  return {
    /**
     * 刷新工作状态栏数据
     * 从会话列表数据中实时计算各指标
     */
    updateWorkStatus() {
      if (!this.sessions) return

      const now = Date.now()
      const waiting = this.sessions.filter(s => s.status === 'waiting')
      const active = this.sessions.filter(s => s.status === 'active')
      const closedToday = this.sessions.filter(s => {
        if (s.status !== 'closed') return false
        const closedAt = new Date(s.closed_at || s.updated_at)
        const today = new Date()
        return closedAt.toDateString() === today.toDateString()
      })

      this.waitingCount = waiting.length
      this.activeCount = active.length
      this.resolvedTodayCount = closedToday.length

      /* 计算最久等待时间 */
      if (waiting.length > 0) {
        const waitTimes = waiting.map(s => {
          const created = new Date(s.created_at).getTime()
          return Math.floor((now - created) / 60000)
        })
        this.maxWaitMinutes = Math.max(...waitTimes)
      } else {
        this.maxWaitMinutes = 0
      }

      /* SLA 超时：等待超过15分钟 */
      this.slaBreachCount = waiting.filter(s => {
        const created = new Date(s.created_at).getTime()
        return (now - created) > 15 * 60000
      }).length
    },

    /**
     * 加载待处理工单数（定期轮询）
     */
    async loadPendingIssueCount () {
      try {
        const url = CONTENT_ENDPOINTS.CS_ISSUE_LIST + buildQueryString({ status: 'open', page_size: 1 })
        const response = await request({ url, method: 'GET' })
        if (response?.success) {
          this.pendingIssueCount = response.data?.count || response.data?.total || 0
        }
      } catch (error) {
        logger.warn('[WorkStatus] 加载待处理工单数失败:', error.message)
      }
    },

    /**
     * 获取等待时长的紧急程度样式
     * @param {number} minutes - 等待分钟数
     * @returns {string} Tailwind CSS 类名
     */
    getWaitUrgencyClass(minutes) {
      if (minutes > 30) return 'text-red-600 font-bold animate-pulse'
      if (minutes > 15) return 'text-red-500 font-semibold'
      if (minutes > 5) return 'text-yellow-600'
      return 'text-green-600'
    },

    /**
     * 获取等待时长显示文本
     * @param {string} createdAt - 创建时间字符串
     * @returns {string} 等待时长（中文）
     */
    getWaitTimeDisplay(createdAt) {
      if (!createdAt) return '-'
      const minutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
      if (minutes < 1) return '刚刚'
      if (minutes < 60) return `${minutes}分钟`
      const hours = Math.floor(minutes / 60)
      return `${hours}小时${minutes % 60}分`
    },

    /**
     * 获取等待时长颜色指示器
     * @param {string} createdAt - 创建时间
     * @returns {string} 颜色圆点的CSS类
     */
    getWaitColorDot(createdAt) {
      if (!createdAt) return 'bg-gray-400'
      const minutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
      if (minutes > 30) return 'bg-red-500 animate-pulse'
      if (minutes > 15) return 'bg-orange-500'
      if (minutes > 5) return 'bg-yellow-500'
      return 'bg-green-500'
    }
  }
}
