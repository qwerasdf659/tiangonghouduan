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
    /** @type {Object|null} 日报数据（HTML模板兼容别名） */
    dailyReportData: null,
    /** @type {boolean} 日报加载状态 */
    loadingDailyReport: false,
    /** @type {Object} 日报筛选条件 */
    dailyReportFilters: {
      report_date: '', // YYYY-MM-DD，默认为昨天
      campaign_id: ''
    },
    /** @type {boolean} 显示日报页面 */
    showDailyReportPanel: true,
    /** @type {boolean} 显示日报弹窗（HTML模板兼容） */
    showDailyReportModal: false,
    /** @type {string} 日报日期显示（HTML模板兼容） */
    dailyReportDate: '',
    /** @type {Array<Object>} 日报历史记录（可选扩展） */
    dailyReportHistory: [],
    // ========== P1-7: 单用户高频预警 + 预算健康度 ==========
    /** @type {Array<Object>} 高频用户预警列表 */
    highFrequencyWarnings: [],
    /** @type {boolean} 高频预警加载状态 */
    loadingHighFrequency: false,
    /** @type {Object} 预算健康度数据 */
    budgetHealthData: {
      b0_count: 0,
      b1_count: 0,
      b2_count: 0,
      b3_count: 0,
      total_days: 0,
      health_level: 'unknown' // 'healthy' | 'warning' | 'critical'
    },
    /** @type {boolean} 预算健康度加载状态 */
    loadingBudgetHealth: false
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
      return yesterday
        .toLocaleDateString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        })
        .replace(/\//g, '-')
    },

    /**
     * 加载运营日报页面数据
     * 注意：与 metrics.js 的 loadDailyReport 区分，避免方法名冲突
     */
    async loadDailyReportPage() {
      this.loadingDailyReport = true
      this.dailyReport = null
      this.dailyReportData = null
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
          this.dailyReportData = response.data
          this.dailyReportDate = response.data?.report_date || ''

          // P1-7: 加载完成后分析高频预警和预算健康度
          this.analyzeHighFrequencyUsers()
          this.analyzeBudgetHealth()

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

    // ==================== P1-7: 单用户高频预警 ====================
    /**
     * 从日报数据中检测单用户高频预警
     * 当 unique_users 极低而 total_draws 极高时触发预警
     */
    analyzeHighFrequencyUsers() {
      if (!this.dailyReport?.summary) {
        this.highFrequencyWarnings = []
        return
      }

      const warnings = []
      const summary = this.dailyReport.summary
      const uniqueUsers = summary.unique_users || 0
      const totalDraws = summary.total_draws || 0

      // 当日活跃用户数极低但抽奖次数高时预警
      if (uniqueUsers > 0 && uniqueUsers <= 3 && totalDraws > 50) {
        const avgDrawsPerUser = Math.round(totalDraws / uniqueUsers)
        warnings.push({
          level: avgDrawsPerUser > 200 ? 'danger' : 'warning',
          title: '单用户高频抽奖预警',
          message: `仅 ${uniqueUsers} 个用户产生 ${totalDraws} 次抽奖，人均 ${avgDrawsPerUser} 次/天`,
          suggestion: '建议检查是否存在刷奖行为，或配置每日抽奖配额限制'
        })
      }

      // 检查日报中的 alerts 字段
      if (this.dailyReport.alerts && Array.isArray(this.dailyReport.alerts)) {
        this.dailyReport.alerts.forEach(alert => {
          if (alert.type === 'high_frequency' || alert.type === 'user_frequency') {
            warnings.push({
              level: alert.level || 'warning',
              title: alert.title || '频率异常',
              message: alert.message || alert.description || '',
              suggestion: alert.suggestion || ''
            })
          }
        })
      }

      this.highFrequencyWarnings = warnings
      if (warnings.length > 0) {
        logger.warn('[DailyReport] 检测到高频预警', { count: warnings.length })
      }
    },

    // ==================== P1-7: 预算健康度可视化 ====================
    /**
     * 从日报数据中提取预算健康度分布
     * B0-B3 分别代表预算层级（B3 最低预算层）
     *
     * 注意：B0-B3字段来自 lottery_daily_metrics 表，
     * 后端日报API（ReportService.generateDailyReport）当前暂未包含这些字段。
     * 如果后端扩展日报返回 b0_count~b3_count，此处自动生效。
     * 若后端未返回则显示全零（通过 || 0 fallback）。
     */
    analyzeBudgetHealth() {
      if (!this.dailyReport?.summary && !this.dailyReport?.budget) {
        return
      }

      const summary = this.dailyReport.summary || {}
      const budget = this.dailyReport.budget || {}

      const b0 = summary.b0_count || budget.b0_count || 0
      const b1 = summary.b1_count || budget.b1_count || 0
      const b2 = summary.b2_count || budget.b2_count || 0
      const b3 = summary.b3_count || budget.b3_count || 0
      const total = b0 + b1 + b2 + b3

      // 计算健康等级：如果 B3 占比过高则不健康
      let health_level = 'healthy'
      if (total > 0) {
        const b3_ratio = b3 / total
        if (b3_ratio >= 0.8) {
          health_level = 'critical'
        } else if (b3_ratio >= 0.5) {
          health_level = 'warning'
        }
      }

      this.budgetHealthData = {
        b0_count: b0,
        b1_count: b1,
        b2_count: b2,
        b3_count: b3,
        total_days: total,
        health_level
      }

      logger.info('[DailyReport] 预算健康度分析完成', this.budgetHealthData)
    },

    /**
     * 获取预算健康度CSS类
     * @param {string} level - 健康等级
     * @returns {string} CSS类
     */
    getBudgetHealthClass(level) {
      return {
        healthy: 'text-green-600 bg-green-50 border-green-200',
        warning: 'text-yellow-600 bg-yellow-50 border-yellow-200',
        critical: 'text-red-600 bg-red-50 border-red-200',
        unknown: 'text-gray-600 bg-gray-50 border-gray-200'
      }[level] || 'text-gray-600 bg-gray-50 border-gray-200'
    },

    /**
     * 获取预算健康度标签
     * @param {string} level - 健康等级
     * @returns {string} 标签文本
     */
    getBudgetHealthLabel(level) {
      return {
        healthy: '✅ 健康',
        warning: '⚠️ 警告',
        critical: '🔴 异常',
        unknown: '❓ 未知'
      }[level] || '❓ 未知'
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
      // 后端已返回百分比值（如 -68.8 表示下降68.8%），无需再乘以100
      const absValue = Math.abs(value).toFixed(1)

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
      // 后端已返回百分比值（如 100 表示100%），无需再乘以100
      return `${parseFloat(value).toFixed(1)}%`
    },

    /**
     * 获取变化值的颜色类（HTML模板兼容方法）
     * @param {number} value - 变化百分比
     * @returns {string} CSS颜色类
     */
    getChangeColorClass(value) {
      if (value === null || value === undefined) {
        return 'text-gray-500'
      }
      if (value > 0) {
        return 'text-green-600'
      } else if (value < 0) {
        return 'text-red-600'
      }
      return 'text-gray-500'
    },

    /**
     * 格式化变化值文本（HTML模板兼容方法）
     * @param {number} value - 变化百分比
     * @returns {string} 格式化的变化文本
     */
    formatReportChange(value) {
      if (value === null || value === undefined) {
        return '-'
      }
      // 后端已返回百分比值（如 -68.8 表示下降68.8%），无需再乘以100
      const absValue = Math.abs(value).toFixed(1)
      if (value > 0) {
        return `+${absValue}%`
      } else if (value < 0) {
        return `-${absValue}%`
      }
      return `${absValue}%`
    }
  }
}

export default { useDailyReportState, useDailyReportMethods }
