/**
 * 客服工作台 - 用户上下文面板 Composable
 *
 * @file admin/src/modules/content/composables/cs-user-context.js
 * @description C区 8Tab 用户上下文面板的状态和方法
 * @version 1.0.0
 * @date 2026-02-22
 */

import { logger } from '../../../utils/logger.js'
import { buildURL, request } from '../../../api/base.js'
import { CONTENT_ENDPOINTS } from '../../../api/content.js'
import {
  loadAssets,
  loadBackpack,
  loadLottery,
  loadTrades,
  loadTimeline,
  loadRisk,
  loadHistory,
  loadNotes,
  runDiagnose as runDiagnosePanel
} from '../components/index.js'

/**
 * 用户上下文面板状态
 * @returns {Object} C区面板状态
 */
export function useUserContextState() {
  return {
    /** @type {string} 当前选中的Tab（8个Tab之一） */
    context_active_tab: 'assets',
    /** @type {boolean} C区数据加载状态 */
    context_loading: false,

    /** @type {Object|null} 用户画像摘要数据 */
    context_summary: null,
    /** @type {Object|null} 资产数据 */
    context_assets: null,
    /** @type {Object|null} 背包数据 */
    context_backpack: null,
    /** @type {Object|null} 抽奖数据 */
    context_lottery: null,
    /** @type {Object|null} 交易数据 */
    context_trades: null,
    /** @type {Object|null} 时间线数据 */
    context_timeline: null,
    /** @type {Object|null} 风控数据 */
    context_risk: null,
    /** @type {Object|null} 历史会话数据 */
    context_history: null,
    /** @type {Object|null} 诊断结果 */
    context_diagnose: null,

    /** @type {Array} 工单列表（当前用户的） */
    context_issues: [],
    /** @type {Object|null} 工单表单 */
    issue_form: {
      issue_type: 'other',
      priority: 'medium',
      title: '',
      description: ''
    },

    /** @type {Array} 内部备注列表 */
    context_notes: [],
    /** @type {string} 新备注内容 */
    new_note_content: ''
  }
}

/**
 * 用户上下文面板方法
 * @returns {Object} C区面板方法
 */
export function useUserContextMethods() {
  return {
    /**
     * 获取当前会话关联的用户ID
     * @returns {number|null} 用户ID
     */
    _getContextUserId() {
      return this.selectedSession?.user?.user_id || this.selectedSession?.user_id || null
    },

    /**
     * 加载用户上下文摘要（选择会话时调用）
     */
    async loadUserContext() {
      const userId = this._getContextUserId()
      if (!userId) return

      this.context_loading = true
      try {
        const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_SUMMARY, { userId })
        const res = await request({ url, method: 'GET' })
        if (res.success) {
          this.context_summary = res.data
          logger.info('[UserContext] 摘要已加载', { user_id: userId })
        }
      } catch (error) {
        logger.error('[UserContext] 摘要加载失败:', error)
      } finally {
        this.context_loading = false
      }
      /* 同时加载当前Tab的数据 */
      this.loadContextTab(this.context_active_tab)
    },

    /**
     * 切换Tab并加载对应数据
     * @param {string} tab - Tab名称
     */
    async loadContextTab(tab) {
      this.context_active_tab = tab
      const userId = this._getContextUserId()
      if (!userId) return

      this.context_loading = true
      try {
        switch (tab) {
          case 'assets':
            await this._loadAssets(userId)
            break
          case 'backpack':
            await this._loadBackpack(userId)
            break
          case 'lottery':
            await this._loadLottery(userId)
            break
          case 'trades':
            await this._loadTrades(userId)
            break
          case 'timeline':
            await this._loadTimeline(userId)
            break
          case 'risk':
            await this._loadRisk(userId)
            break
          case 'history':
            await this._loadHistory(userId)
            break
          case 'notes':
            await this._loadNotes(userId)
            break
          case 'disputes':
            await this._loadDisputes()
            break
        }
      } catch (error) {
        logger.error(`[UserContext] ${tab} 加载失败:`, error)
      } finally {
        this.context_loading = false
      }
    },

    async _loadAssets(userId) {
      const data = await loadAssets(userId)
      if (data) this.context_assets = data
    },

    async _loadBackpack(userId) {
      const data = await loadBackpack(userId)
      if (data) this.context_backpack = data
    },

    async _loadLottery(userId) {
      const data = await loadLottery(userId)
      if (data) this.context_lottery = data
    },

    async _loadTrades(userId) {
      const data = await loadTrades(userId)
      if (data) this.context_trades = data
    },

    async _loadTimeline(userId) {
      const data = await loadTimeline(userId)
      if (data) this.context_timeline = data
    },

    async _loadRisk(userId) {
      const data = await loadRisk(userId)
      if (data) this.context_risk = data
    },

    async _loadHistory(userId) {
      const data = await loadHistory(userId)
      if (data) this.context_history = data
    },

    async _loadNotes(userId) {
      const result = await loadNotes(userId)
      this.context_notes = result.notes
      this.context_issues = result.issues
    },

    /**
     * 执行一键诊断
     */
    async runDiagnose() {
      const userId = this._getContextUserId()
      if (!userId) return

      this.context_loading = true
      try {
        const data = await runDiagnosePanel(userId)
        if (data) {
          this.context_diagnose = data
          Alpine.store('notification').show('诊断完成', 'success')
          logger.info('[UserContext] 诊断完成', { overall_level: data?.overall_level })
        }
      } catch (error) {
        logger.error('[UserContext] 诊断失败:', error)
        Alpine.store('notification').show('诊断失败: ' + error.message, 'error')
      } finally {
        this.context_loading = false
      }
    },

    /**
     * 创建工单
     */
    async createIssue() {
      const userId = this._getContextUserId()
      if (!userId || !this.issue_form.title) return

      try {
        const res = await request({
          url: CONTENT_ENDPOINTS.CS_ISSUE_LIST,
          method: 'POST',
          data: {
            user_id: userId,
            session_id: this.selectedSession?.customer_service_session_id,
            issue_type: this.issue_form.issue_type,
            priority: this.issue_form.priority,
            title: this.issue_form.title,
            description: this.issue_form.description
          }
        })
        if (res.success) {
          Alpine.store('notification').show('工单创建成功', 'success')
          this.issue_form = { issue_type: 'other', priority: 'medium', title: '', description: '' }
          await this._loadNotes(userId)
        }
      } catch (error) {
        logger.error('[UserContext] 创建工单失败:', error)
        Alpine.store('notification').show('创建失败: ' + error.message, 'error')
      }
    },

    /**
     * 添加内部备注
     */
    async addNote() {
      const userId = this._getContextUserId()
      if (!userId || !this.new_note_content.trim()) return

      try {
        const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_NOTES, { userId })
        const data = {
          content: this.new_note_content.trim(),
          session_id: this.selectedSession?.customer_service_session_id || null
        }

        const res = await request({ url, method: 'POST', data })

        if (res.success) {
          this.new_note_content = ''
          Alpine.store('notification').show('备注添加成功', 'success')
          await this._loadNotes(userId)
        }
      } catch (error) {
        logger.error('[UserContext] 添加备注失败:', error)
        Alpine.store('notification').show('添加失败: ' + error.message, 'error')
      }
    },

    /**
     * 诊断级别对应的显示样式
     * @param {string} level - ok/warning/error
     * @returns {string} CSS class
     */
    getDiagnoseClass(level) {
      switch (level) {
        case 'ok':
          return 'text-green-600 bg-green-50'
        case 'warning':
          return 'text-yellow-600 bg-yellow-50'
        case 'error':
          return 'text-red-600 bg-red-50'
        default:
          return 'text-gray-600 bg-gray-50'
      }
    },

    /**
     * 诊断级别对应的图标
     * @param {string} level - ok/warning/error
     * @returns {string} emoji
     */
    getDiagnoseIcon(level) {
      switch (level) {
        case 'ok':
          return '✅'
        case 'warning':
          return '⚠️'
        case 'error':
          return '🔴'
        default:
          return '❓'
      }
    },

    // ========== 交易纠纷 ==========
    disputes: [],
    dispute_stats: { open: 0, processing: 0, resolved: 0 },

    /** 加载纠纷列表和统计 */
    async _loadDisputes() {
      try {
        const { CONTENT_ENDPOINTS } = await import('../../../api/content.js')
        const { request, buildQueryString } = await import('../../../api/base.js')
        const [listRes, statsRes] = await Promise.all([
          request({
            url: CONTENT_ENDPOINTS.DISPUTE_LIST + buildQueryString({ page: 1, page_size: 50 }),
            method: 'GET'
          }),
          request({ url: CONTENT_ENDPOINTS.DISPUTE_STATS, method: 'GET' })
        ])
        this.disputes = listRes.data?.rows || listRes.data?.list || listRes.data || []
        this.dispute_stats = statsRes.data || { open: 0, processing: 0, resolved: 0 }
      } catch (error) {
        logger.error('[UserContext] 纠纷加载失败:', error)
        this.disputes = []
      }
    },

    /** 加载纠纷列表（供 HTML 刷新按钮调用） */
    async loadDisputes() {
      this.context_loading = true
      try {
        await this._loadDisputes()
      } finally {
        this.context_loading = false
      }
    },

    /** 查看纠纷详情 */
    async viewDisputeDetail(dispute) {
      logger.debug('[Dispute] 查看详情:', dispute.issue_id || dispute.customer_service_issue_id)
      Alpine.store('notification').show(
        '纠纷详情: #' +
          (dispute.issue_id || dispute.customer_service_issue_id) +
          ' ' +
          (dispute.title || ''),
        'info'
      )
    },

    /** 解决纠纷 */
    async resolveDisputeAction(dispute) {
      const id = dispute.issue_id || dispute.customer_service_issue_id
      if (!confirm(`确定解决纠纷 #${id}？`)) return
      try {
        const { CONTENT_ENDPOINTS } = await import('../../../api/content.js')
        const { request, buildURL } = await import('../../../api/base.js')
        const url = buildURL(CONTENT_ENDPOINTS.DISPUTE_RESOLVE, { id })
        await request({ url, method: 'POST', data: { resolution: '管理员手动解决' } })
        Alpine.store('notification').show('纠纷已解决', 'success')
        await this._loadDisputes()
      } catch (error) {
        Alpine.store('notification').show('解决失败: ' + error.message, 'error')
      }
    },

    /** 升级仲裁 */
    async escalateDisputeAction(dispute) {
      const id = dispute.issue_id || dispute.customer_service_issue_id
      if (!confirm(`确定将纠纷 #${id} 升级为仲裁？`)) return
      try {
        const { CONTENT_ENDPOINTS } = await import('../../../api/content.js')
        const { request, buildURL } = await import('../../../api/base.js')
        const url = buildURL(CONTENT_ENDPOINTS.DISPUTE_ESCALATE, { id })
        await request({ url, method: 'POST', data: { reason: '需要高级管理员介入' } })
        Alpine.store('notification').show('已升级为仲裁', 'success')
        await this._loadDisputes()
      } catch (error) {
        Alpine.store('notification').show('升级失败: ' + error.message, 'error')
      }
    }
  }
}
