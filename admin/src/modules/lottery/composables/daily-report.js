/**
 * 运营日报模块
 *
 * @file admin/src/modules/lottery/composables/daily-report.js
 * @description P2优先级 - 运营日报生成、展示、导出
 * @version 1.0.0
 * @date 2026-01-29
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery/index.js'
import { buildQueryString } from '../../../api/base.js'

/**
 * 运营日报状态
 * @returns {Object} 状态对象
 */
export function useDailyReportState() {
  return {
    /** @type {Object|null} 日报数据 */
    dailyReport: null,
    /** @type {boolean} 日报加载状态 */
    loadingDailyReport: false,
    /** @type {Object} 日报筛选条件 */
    dailyReportFilters: {
      report_date: '', // YYYY-MM-DD，默认为昨天
      campaign_id: ''
    },
    /** @type {boolean} 显示日报页面 */
    showDailyReportPanel: true,
    /** @type {Array<Object>} 日报历史记录（可选扩展） */
    dailyReportHistory: []
  }
}

/**
 * 运营日报方法
 * @returns {Object} 方法对象
 */
export function useDailyReportMethods() {
  return {
    /**
     * 获取默认日期（昨天）
     * @returns {string} YYYY-MM-DD 格式的日期字符串
     */
    getDefaultReportDate() {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      // 使用北京时间
      return yesterday.toLocaleDateString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).replace(/\//g, '-')
    },

    /**
     * 加载运营日报页面数据
     * 注意：与 metrics.js 的 loadDailyReport 区分，避免方法名冲突
     */
    async loadDailyReportPage() {
      this.loadingDailyReport = true
      this.dailyReport = null
      try {
        const params = {}
        
        // 使用筛选条件的日期，否则使用默认（昨天）
        if (this.dailyReportFilters.report_date) {
          params.report_date = this.dailyReportFilters.report_date
        }
        
        if (this.dailyReportFilters.campaign_id) {
          params.campaign_id = this.dailyReportFilters.campaign_id
        }

        const queryString = buildQueryString(params)
        const response = await this.apiGet(
          `${LOTTERY_ENDPOINTS.ANALYTICS_DAILY_REPORT}${queryString}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          this.dailyReport = response.data
          logger.info('[DailyReport] 运营日报加载成功', {
            report_date: response.data?.report_date,
            total_draws: response.data?.summary?.total_draws
          })
        } else {
          this.showError('加载运营日报失败: ' + (response?.message || '未知错误'))
        }
      } catch (error) {
        logger.error('[DailyReport] 加载运营日报失败:', error)
        this.showError('加载运营日报失败: ' + (error.message || '网络错误'))
      } finally {
        this.loadingDailyReport = false
      }
    },

    /**
     * 刷新运营日报
     */
    async refreshDailyReport() {
      await this.loadDailyReportPage()
      if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
        Alpine.store('notification').success('运营日报已刷新')
      }
    },

    /**
     * 应用日报筛选
     */
    async applyDailyReportFilters() {
      await this.loadDailyReportPage()
    },

    /**
     * 重置日报筛选
     */
    async resetDailyReportFilters() {
      this.dailyReportFilters = {
        report_date: '',
        campaign_id: ''
      }
      await this.loadDailyReportPage()
    },

    /**
     * 切换日报日期（前一天/后一天）
     * @param {number} days - 天数偏移（-1 前一天，+1 后一天）
     */
    async changeDailyReportDate(days) {
      const currentDate = this.dailyReportFilters.report_date 
        ? new Date(this.dailyReportFilters.report_date)
        : new Date()
      
      currentDate.setDate(currentDate.getDate() + days)
      
      this.dailyReportFilters.report_date = currentDate.toISOString().split('T')[0]
      await this.loadDailyReportPage()
    },

    /**
     * 导出日报为图片/PDF（基础实现）
     */
    async exportDailyReport() {
      if (!this.dailyReport) {
        this.showError('没有可导出的日报数据')
        return
      }
      
      // 前端提示，实际导出可能需要后端支持
      this.showSuccess('日报导出功能正在开发中...')
      logger.info('[DailyReport] 尝试导出日报', { 
        report_date: this.dailyReport.report_date 
      })
    },

    /**
     * 格式化变化值（带正负号和颜色类）
     * @param {number} value - 变化百分比
     * @param {boolean} inverse - 是否反转颜色逻辑（如成本上升为负面）
     * @returns {Object} { text, colorClass }
     */
    formatDailyReportChange(value, inverse = false) {
      if (value === null || value === undefined) {
        return { text: '-', colorClass: 'text-gray-500' }
      }
      
      const isPositive = value > 0
      const isNegative = value < 0
      const absValue = Math.abs(value * 100).toFixed(1)
      
      let text = `${absValue}%`
      let colorClass = 'text-gray-500'
      
      if (isPositive) {
        text = `+${text}`
        colorClass = inverse ? 'text-red-600' : 'text-green-600'
      } else if (isNegative) {
        text = `-${text}`
        colorClass = inverse ? 'text-green-600' : 'text-red-600'
      }
      
      return { text, colorClass }
    },

    /**
     * 获取告警级别样式
     * @param {string} level - 告警级别
     * @returns {string} CSS类
     */
    getDailyAlertStyle(level) {
      const styles = {
        danger: 'bg-red-100 text-red-700 border-red-300',
        warning: 'bg-yellow-100 text-yellow-700 border-yellow-300',
        info: 'bg-blue-100 text-blue-700 border-blue-300'
      }
      return styles[level] || styles.info
    },

    /**
     * 格式化日报时间
     * @param {string} isoString - ISO 格式时间字符串
     * @returns {string} 格式化后的北京时间
     */
    formatDailyReportTime(isoString) {
      if (!isoString) return '-'
      const date = new Date(isoString)
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Shanghai'
      })
    },

    /**
     * 格式化金额
     * @param {number} value - 金额
     * @returns {string} 格式化的金额
     */
    formatDailyReportCurrency(value) {
      if (value === null || value === undefined) return '-'
      return `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    },

    /**
     * 格式化百分比
     * @param {number} value - 数值 (0-1)
     * @returns {string} 百分比字符串
     */
    formatDailyReportPercentage(value) {
      if (value === null || value === undefined) return '-'
      return `${(value * 100).toFixed(2)}%`
    }
  }
}

export default { useDailyReportState, useDailyReportMethods }

