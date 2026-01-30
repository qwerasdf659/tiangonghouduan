/**
 * 抽奖告警中心模块
 *
 * @file admin/src/modules/lottery/composables/alerts.js
 * @description P0优先级 - 实时告警中心、告警确认、告警解决
 * @version 1.0.0
 * @date 2026-01-29
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery/index.js'
import { buildURL } from '../../../api/base.js'

/**
 * 告警中心状态
 * @returns {Object} 状态对象
 */
export function useAlertsState() {
  return {
    /** @type {Array} 告警列表 */
    alerts: [],
    /** @type {Object} 告警统计汇总 */
    alertsSummary: {
      total: 0,
      danger: 0,
      warning: 0,
      info: 0
    },
    /** @type {Object} 告警筛选条件 */
    alertFilters: {
      campaign_id: '',
      level: '',
      acknowledged: '',
      page: 1,
      page_size: 20
    },
    /** @type {Object} 告警分页信息 */
    alertsPagination: {
      current_page: 1,
      page_size: 20,
      total_count: 0,
      total_pages: 0
    },
    /** @type {boolean} 是否正在加载告警 */
    loadingAlerts: false,
    /** @type {Object|null} 当前选中的告警（用于详情弹窗） */
    selectedAlert: null,
    /** @type {boolean} 显示告警详情弹窗 */
    showAlertDetailModal: false,
    /** @type {boolean} 显示解决告警弹窗 */
    showResolveModal: false,
    /** @type {string} 解决备注 */
    resolveNotes: '',
    /** @type {boolean} 正在处理告警操作 */
    processingAlert: false
  }
}

/**
 * 告警中心方法
 * @returns {Object} 方法对象
 */
export function useAlertsMethods() {
  return {
    /**
     * 加载实时告警列表
     * 使用后端 /realtime-alerts 接口获取告警数据
     */
    async loadAlerts() {
      logger.info('[Alerts] 加载告警列表...')
      this.loadingAlerts = true

      try {
        const params = new URLSearchParams()

        if (this.alertFilters.campaign_id) {
          params.append('campaign_id', this.alertFilters.campaign_id)
        }
        if (this.alertFilters.level) {
          params.append('level', this.alertFilters.level)
        }
        if (this.alertFilters.acknowledged !== '') {
          params.append('acknowledged', this.alertFilters.acknowledged)
        }
        params.append('page', this.alertFilters.page)
        params.append('page_size', this.alertFilters.page_size)

        const url = `${LOTTERY_ENDPOINTS.REALTIME_ALERTS}?${params}`
        const response = await this.apiGet(url, {}, { showLoading: false, showError: true })

        if (response?.success) {
          const data = response.data || {}
          this.alerts = data.alerts || []
          this.alertsSummary = data.summary || {
            total: 0,
            danger: 0,
            warning: 0,
            info: 0
          }
          this.alertsPagination = data.pagination || {
            current_page: 1,
            page_size: 20,
            total_count: 0,
            total_pages: 0
          }

          logger.info('[Alerts] 告警加载成功', {
            total: this.alertsSummary.total,
            danger: this.alertsSummary.danger
          })
        } else {
          logger.warn('[Alerts] 告警加载失败:', response?.message)
          this.alerts = []
          this.alertsSummary = { total: 0, danger: 0, warning: 0, info: 0 }
        }
      } catch (error) {
        logger.error('[Alerts] 加载告警失败:', error)
        this.alerts = []
        this.alertsSummary = { total: 0, danger: 0, warning: 0, info: 0 }
      } finally {
        this.loadingAlerts = false
      }
    },

    /**
     * 刷新告警数据
     */
    async refreshAlerts() {
      await this.loadAlerts()
      if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
        Alpine.store('notification').success('告警列表已刷新')
      }
    },

    /**
     * 切换告警页码
     * @param {number} page - 页码
     */
    async changeAlertsPage(page) {
      this.alertFilters.page = page
      await this.loadAlerts()
    },

    /**
     * 应用告警筛选
     */
    async applyAlertFilters() {
      this.alertFilters.page = 1 // 重置到第一页
      await this.loadAlerts()
    },

    /**
     * 重置告警筛选
     */
    async resetAlertFilters() {
      this.alertFilters = {
        campaign_id: '',
        level: '',
        acknowledged: '',
        page: 1,
        page_size: 20
      }
      await this.loadAlerts()
    },

    /**
     * 确认告警
     * @param {Object} alert - 告警对象
     */
    async acknowledgeAlert(alert) {
      if (!alert?.alert_id) {
        logger.warn('[Alerts] 确认告警失败: 无效的告警ID')
        return
      }

      this.processingAlert = true
      try {
        const url = buildURL(LOTTERY_ENDPOINTS.REALTIME_ALERT_ACKNOWLEDGE, { id: alert.alert_id })
        const response = await this.apiPost(url, {}, { showLoading: true })

        if (response?.success) {
          logger.info('[Alerts] 告警已确认', { alert_id: alert.alert_id })
          if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
            Alpine.store('notification').success('告警已确认')
          }
          // 刷新列表
          await this.loadAlerts()
        } else {
          throw new Error(response?.message || '确认失败')
        }
      } catch (error) {
        logger.error('[Alerts] 确认告警失败:', error)
        if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
          Alpine.store('notification').error('确认失败: ' + (error.message || '未知错误'))
        }
      } finally {
        this.processingAlert = false
      }
    },

    /**
     * 打开解决告警弹窗
     * @param {Object} alert - 告警对象
     */
    openResolveModal(alert) {
      this.selectedAlert = alert
      this.resolveNotes = ''
      this.showResolveModal = true
    },

    /**
     * 关闭解决告警弹窗
     */
    closeResolveModal() {
      this.showResolveModal = false
      this.selectedAlert = null
      this.resolveNotes = ''
    },

    /**
     * 解决告警
     */
    async resolveAlert() {
      if (!this.selectedAlert?.alert_id) {
        logger.warn('[Alerts] 解决告警失败: 无效的告警ID')
        return
      }

      this.processingAlert = true
      try {
        const url = buildURL(LOTTERY_ENDPOINTS.REALTIME_ALERT_RESOLVE, {
          id: this.selectedAlert.alert_id
        })
        const response = await this.apiPost(
          url,
          {
            resolve_notes: this.resolveNotes
          },
          { showLoading: true }
        )

        if (response?.success) {
          logger.info('[Alerts] 告警已解决', { alert_id: this.selectedAlert.alert_id })
          if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
            Alpine.store('notification').success('告警已解决')
          }
          this.closeResolveModal()
          // 刷新列表
          await this.loadAlerts()
        } else {
          throw new Error(response?.message || '解决失败')
        }
      } catch (error) {
        logger.error('[Alerts] 解决告警失败:', error)
        if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
          Alpine.store('notification').error('解决失败: ' + (error.message || '未知错误'))
        }
      } finally {
        this.processingAlert = false
      }
    },

    /**
     * 查看告警详情
     * @param {Object} alert - 告警对象
     */
    viewAlertDetail(alert) {
      this.selectedAlert = alert
      this.showAlertDetailModal = true
    },

    /**
     * 关闭告警详情弹窗
     */
    closeAlertDetailModal() {
      this.showAlertDetailModal = false
      this.selectedAlert = null
    },

    /**
     * 获取告警级别样式
     * @param {string} level - 告警级别（danger/warning/info）
     * @returns {string} CSS 类名
     */
    getAlertLevelStyle(level) {
      const styles = {
        danger: 'bg-red-100 border-l-4 border-red-500 text-red-700',
        warning: 'bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700',
        info: 'bg-blue-100 border-l-4 border-blue-500 text-blue-700',
        success: 'bg-green-100 border-l-4 border-green-500 text-green-700'
      }
      return styles[level] || styles.info
    },

    /**
     * 获取告警级别图标
     * @param {string} level - 告警级别
     * @returns {string} 图标
     */
    getAlertIcon(level) {
      const icons = {
        danger: '🔴',
        warning: '🟡',
        info: '🔵',
        success: '🟢'
      }
      return icons[level] || '🔵'
    },

    /**
     * 获取告警级别文本
     * @param {string} level - 告警级别
     * @returns {string} 文本
     */
    getAlertLevelText(level) {
      const texts = {
        danger: '紧急',
        warning: '警告',
        info: '信息'
      }
      return texts[level] || level
    },

    /**
     * 获取告警类型文本
     * @param {string} type - 告警类型
     * @returns {string} 文本
     */
    getAlertTypeText(type) {
      const texts = {
        budget_exhaust: '预算告急',
        budget_warning: '预算预警',
        stock_low: '库存告急',
        stock_warning: '库存预警',
        win_rate_high: '中奖率过高',
        win_rate_low: '中奖率过低',
        high_frequency_user: '高频用户',
        empty_streak_high: '连空用户过多'
      }
      return texts[type] || type
    },

    /**
     * 格式化告警时间
     * @param {string} time - ISO时间字符串
     * @returns {string} 格式化后的时间
     */
    formatAlertTime(time) {
      if (!time) return '-'
      try {
        const date = new Date(time)
        return date.toLocaleString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      } catch {
        return time
      }
    },

    /**
     * 获取相对时间
     * @param {string} time - ISO时间字符串
     * @returns {string} 相对时间
     */
    getRelativeTime(time) {
      if (!time) return '-'
      try {
        const now = new Date()
        const alertTime = new Date(time)
        const diffMs = now - alertTime
        const diffMinutes = Math.floor(diffMs / 60000)
        const diffHours = Math.floor(diffMinutes / 60)
        const diffDays = Math.floor(diffHours / 24)

        if (diffDays > 0) return `${diffDays}天前`
        if (diffHours > 0) return `${diffHours}小时前`
        if (diffMinutes > 0) return `${diffMinutes}分钟前`
        return '刚刚'
      } catch {
        return time
      }
    }
  }
}

export default { useAlertsState, useAlertsMethods }


