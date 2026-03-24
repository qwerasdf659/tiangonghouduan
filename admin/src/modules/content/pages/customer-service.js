/**
 * 客服工作台页面 - Alpine.js Mixin 重构版
 *
 * @file admin/src/modules/content/pages/customer-service.js
 * @description 客服工作台页面，组合所有客服相关 Composable
 * 提供会话管理、消息收发、用户上下文面板、GM工具、SLA监控
 * @version 4.0.0
 * @date 2026-02-22
 */

import { logger } from '../../../utils/logger.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import {
  useCustomerServiceState,
  useCustomerServiceMethods,
  useUserContextState,
  useUserContextMethods,
  useCsWorkStatusState,
  useCsWorkStatusMethods,
  useCsCompensationState,
  useCsCompensationMethods,
  useCsTemplatesState,
  useCsTemplatesMethods,
  useCsDiagnosisState,
  useCsDiagnosisMethods,
  useCsIssuesState,
  useCsIssuesMethods
} from '../composables/index.js'

/**
 * 创建客服工作台页面组件
 * @returns {Object} Alpine.js组件配置对象
 */
function customerServicePage() {
  return {
    // ==================== Mixin 组合 ====================
    ...createPageMixin(),

    // ==================== 核心 Composables ====================
    ...useCustomerServiceState(),
    ...useCustomerServiceMethods(),

    // C区：用户上下文面板（8Tab + 诊断 + 工单 + 备注）
    ...useUserContextState(),
    ...useUserContextMethods(),

    // 顶部：工作状态栏（SLA告警、工单待处理数、满意度）
    ...useCsWorkStatusState(),
    ...useCsWorkStatusMethods(),

    // GM工具：补偿发放
    ...useCsCompensationState(),
    ...useCsCompensationMethods(),

    // 消息模板库
    ...useCsTemplatesState(),
    ...useCsTemplatesMethods(),

    // 一键诊断（独立composable，与C区内置的runDiagnose互补）
    ...useCsDiagnosisState(),
    ...useCsDiagnosisMethods(),

    // 工单管理（独立composable，与C区内置的createIssue/addNote互补）
    ...useCsIssuesState(),
    ...useCsIssuesMethods(),

    // ==================== 生命周期 ====================

    init() {
      logger.info('客服工作台页面初始化 (v4.0 全量集成)')

      if (!this.checkAuth()) return

      try {
        const userStr = localStorage.getItem('admin_user')
        const userInfo = userStr ? JSON.parse(userStr) : null
        if (userInfo && userInfo.nickname) {
          this.welcomeText = userInfo.nickname
        }
      } catch {
        // ignore
      }

      this.loadSessions()
      this.loadAdminList()
      this.initWebSocket()
      this.loadResponseStats()
      this.loadPendingIssueCount()

      /* 定期轮询：会话列表(30s)、响应统计(60s)、工作状态栏(10s)、待处理工单(30s) */
      this._sessionPollTimer = setInterval(() => this.loadSessions(true), 30000)
      this._statsPollTimer = setInterval(() => this.loadResponseStats(), 60000)
      this._workStatusTimer = setInterval(() => this.updateWorkStatus(), 10000)
      this._issueCountTimer = setInterval(() => this.loadPendingIssueCount(), 30000)

      /* 首次计算工作状态 */
      setTimeout(() => this.updateWorkStatus(), 2000)

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
      if (this._workStatusTimer) clearInterval(this._workStatusTimer)
      if (this._issueCountTimer) clearInterval(this._issueCountTimer)
      if (this.wsConnection) this.wsConnection.disconnect()
      logger.info('[CustomerService] 资源已清理')
    },

    // ==================== 模板库 getter ====================

    /** 按关键词过滤后的模板列表（供 HTML x-for 使用） */
    get filteredTemplates() {
      return this.getFilteredTemplates()
    },

    // ==================== A区增强：智能会话队列辅助方法 ====================

    /**
     * 获取按优先级分组的会话列表
     * 紧急(>15min) → 排队中 → 处理中 → 今日已关闭
     * @returns {Array<{group:string, sessions:Array}>}
     */
    get groupedSessions() {
      const now = Date.now()
      const urgent = []
      const waiting = []
      const active = []
      const closed = []

      for (const s of this.sessions) {
        if (s.status === 'waiting') {
          const waitMin = Math.floor((now - new Date(s.created_at).getTime()) / 60000)
          if (waitMin > 15) urgent.push(s)
          else waiting.push(s)
        } else if (s.status === 'active' || s.status === 'assigned') {
          active.push(s)
        } else if (s.status === 'closed') {
          closed.push(s)
        }
      }

      /* 紧急和排队按等待时间倒序（等得最久排最前） */
      urgent.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      waiting.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      active.sort(
        (a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
      )
      closed.sort(
        (a, b) =>
          new Date(b.updated_at || b.closed_at || b.created_at) -
          new Date(a.updated_at || a.closed_at || a.created_at)
      )

      const groups = []
      if (urgent.length) groups.push({ group: '紧急', icon: '🔴', sessions: urgent })
      if (waiting.length) groups.push({ group: '排队中', icon: '🟡', sessions: waiting })
      if (active.length) groups.push({ group: '处理中', icon: '🟢', sessions: active })
      if (closed.length) groups.push({ group: '已关闭', icon: '⚪', sessions: closed })
      return groups
    },

    /**
     * 从消息内容自动识别问题标签
     * @param {Object} session - 会话对象
     * @returns {Array<{icon:string, label:string}>}
     */
    getSessionTags(session) {
      const lastMsg = this.getSessionLastMessage(session)
      if (!lastMsg || lastMsg === '暂无消息') return []
      const msg = lastMsg.toLowerCase()
      const tags = []
      if (/钻石|余额|积分|到账|扣款|冻结/.test(msg)) tags.push({ icon: '💎', label: '资产' })
      if (/交易|买|卖|挂单|订单/.test(msg)) tags.push({ icon: '🔄', label: '交易' })
      if (/抽奖|抽|中奖|概率|保底/.test(msg)) tags.push({ icon: '🎰', label: '抽奖' })
      if (/物品|背包|锁|锁定|道具/.test(msg)) tags.push({ icon: '🎒', label: '背包' })
      if (/兑换|核销|发货|物流/.test(msg)) tags.push({ icon: '📦', label: '兑换' })
      if (/登录|密码|账号|封号/.test(msg)) tags.push({ icon: '👤', label: '账号' })
      return tags
    },

    /**
     * 获取会话等待时长显示文本
     * @param {Object} session - 会话对象
     * @returns {string} 等待时长
     */
    getSessionWaitTime(session) {
      if (session.status !== 'waiting') return ''
      return this.getWaitTimeDisplay(session.created_at)
    },

    /**
     * 获取会话等待状态颜色
     * @param {Object} session - 会话对象
     * @returns {string} CSS类
     */
    getSessionWaitColor(session) {
      if (session.status !== 'waiting') return ''
      return this.getWaitColorDot(session.created_at)
    }
  }
}

// ========== Alpine.js 组件注册 ==========
document.addEventListener('alpine:init', () => {
  Alpine.data('customerServicePage', customerServicePage)
  Alpine.data('customerService', customerServicePage)
  logger.info('[CustomerServicePage] Alpine 组件已注册 (v4.0 全量集成)')
})
