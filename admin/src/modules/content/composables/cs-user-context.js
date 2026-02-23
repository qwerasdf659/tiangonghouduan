/**
 * 客服工作台 - 用户上下文面板 Composable
 *
 * @file admin/src/modules/content/composables/cs-user-context.js
 * @description C区 8Tab 用户上下文面板的状态和方法
 * @version 1.0.0
 * @date 2026-02-22
 */

import { logger } from '../../../utils/logger.js'
import { buildURL, request, buildQueryString } from '../../../api/base.js'
import { CONTENT_ENDPOINTS } from '../../../api/content.js'

/**
 * 用户上下文面板状态
 * @returns {Object} C区面板状态
 */
export function useUserContextState () {
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
export function useUserContextMethods () {
  return {
    /**
     * 获取当前会话关联的用户ID
     * @returns {number|null} 用户ID
     */
    _getContextUserId () {
      return this.selectedSession?.user?.user_id || this.selectedSession?.user_id || null
    },

    /**
     * 加载用户上下文摘要（选择会话时调用）
     */
    async loadUserContext () {
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
    async loadContextTab (tab) {
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
        }
      } catch (error) {
        logger.error(`[UserContext] ${tab} 加载失败:`, error)
      } finally {
        this.context_loading = false
      }
    },

    async _loadAssets (userId) {
      const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_ASSETS, { userId }) + buildQueryString({ page_size: 10 })
      const res = await request({ url, method: 'GET' })
      if (res.success) this.context_assets = res.data
    },

    async _loadBackpack (userId) {
      const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_BACKPACK, { userId }) + buildQueryString({ page_size: 20 })
      const res = await request({ url, method: 'GET' })
      if (res.success) this.context_backpack = res.data
    },

    async _loadLottery (userId) {
      const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_LOTTERY, { userId }) + buildQueryString({ page_size: 10 })
      const res = await request({ url, method: 'GET' })
      if (res.success) this.context_lottery = res.data
    },

    async _loadTrades (userId) {
      const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_TRADES, { userId }) + buildQueryString({ page_size: 10 })
      const res = await request({ url, method: 'GET' })
      if (res.success) this.context_trades = res.data
    },

    async _loadTimeline (userId) {
      const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_TIMELINE, { userId }) + buildQueryString({ page_size: 20 })
      const res = await request({ url, method: 'GET' })
      if (res.success) this.context_timeline = res.data
    },

    async _loadRisk (userId) {
      const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_RISK, { userId })
      const res = await request({ url, method: 'GET' })
      if (res.success) this.context_risk = res.data
    },

    async _loadHistory (userId) {
      const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_HISTORY, { userId }) + buildQueryString({ page_size: 10 })
      const res = await request({ url, method: 'GET' })
      if (res.success) this.context_history = res.data
    },

    async _loadNotes (userId) {
      const notesUrl = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_NOTES, { userId }) + buildQueryString({ page_size: 50 })
      const issuesUrl = CONTENT_ENDPOINTS.CS_ISSUE_LIST + buildQueryString({ user_id: userId, page_size: 50 })
      const [notesRes, issuesRes] = await Promise.all([
        request({ url: notesUrl, method: 'GET' }),
        request({ url: issuesUrl, method: 'GET' })
      ])
      if (notesRes.success) this.context_notes = notesRes.data?.rows || []
      if (issuesRes.success) this.context_issues = issuesRes.data?.rows || []
    },

    /**
     * 执行一键诊断
     */
    async runDiagnose () {
      const userId = this._getContextUserId()
      if (!userId) return

      this.context_loading = true
      try {
        const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_DIAGNOSE, { userId })
        const res = await request({ url, method: 'GET' })
        if (res.success) {
          this.context_diagnose = res.data
          Alpine.store('notification').show('诊断完成', 'success')
          logger.info('[UserContext] 诊断完成', { overall_level: res.data?.overall_level })
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
    async createIssue () {
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
    async addNote () {
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
    getDiagnoseClass (level) {
      switch (level) {
        case 'ok': return 'text-green-600 bg-green-50'
        case 'warning': return 'text-yellow-600 bg-yellow-50'
        case 'error': return 'text-red-600 bg-red-50'
        default: return 'text-gray-600 bg-gray-50'
      }
    },

    /**
     * 诊断级别对应的图标
     * @param {string} level - ok/warning/error
     * @returns {string} emoji
     */
    getDiagnoseIcon (level) {
      switch (level) {
        case 'ok': return '✅'
        case 'warning': return '⚠️'
        case 'error': return '🔴'
        default: return '❓'
      }
    }
  }
}
