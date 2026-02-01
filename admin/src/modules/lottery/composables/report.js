/**
 * 活动复盘报告模块
 *
 * @file admin/src/modules/lottery/composables/report.js
 * @description P2优先级 - 活动复盘报告生成和导出
 * @version 1.0.0
 * @date 2026-01-29
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery/index.js'
import { buildURL } from '../../../api/base.js'

/**
 * 报告状态
 * @returns {Object} 状态对象
 */
export function useReportState() {
  return {
    /** @type {Object|null} 当前活动复盘报告 */
    campaignReport: null,
    /** @type {boolean} 报告加载状态 */
    loadingReport: false,
    /** @type {boolean} 显示报告弹窗 */
    showReportModal: false,
    /** @type {number|null} 当前选中的活动ID */
    selectedReportCampaignId: null,
    /** @type {boolean} 正在导出报告 */
    exportingReport: false
  }
}

/**
 * 报告方法
 * @returns {Object} 方法对象
 */
export function useReportMethods() {
  return {
    /**
     * 打开活动复盘报告弹窗
     * @param {number} campaignId - 活动ID
     */
    async openCampaignReport(campaignId) {
      if (!campaignId) {
        logger.warn('[Report] 无效的活动ID')
        return
      }

      this.selectedReportCampaignId = campaignId
      this.showReportModal = true
      await this.loadCampaignReport(campaignId)
    },

    /**
     * 加载活动复盘报告
     * @param {number} campaignId - 活动ID
     */
    async loadCampaignReport(campaignId) {
      logger.info('[Report] 加载活动复盘报告', { campaign_id: campaignId })
      this.loadingReport = true
      this.campaignReport = null

      try {
        const url = LOTTERY_ENDPOINTS.CAMPAIGN_REPORT.replace(':campaign_id', campaignId)
        const response = await this.apiGet(url, {}, { showLoading: false, showError: true })

        if (response?.success) {
          this.campaignReport = response.data
          logger.info('[Report] 活动复盘报告加载成功', {
            campaign_id: campaignId,
            campaign_name: this.campaignReport?.campaign_info?.campaign_name
          })
        } else {
          logger.warn('[Report] 活动复盘报告加载失败:', response?.message)
          this.campaignReport = null
        }
      } catch (error) {
        logger.error('[Report] 加载活动复盘报告失败:', error)
        this.campaignReport = null
      } finally {
        this.loadingReport = false
      }
    },

    /**
     * 关闭报告弹窗
     */
    closeReportModal() {
      this.showReportModal = false
      this.campaignReport = null
      this.selectedReportCampaignId = null
    },

    /**
     * 导出报告为PDF
     */
    async exportReportPDF() {
      if (!this.campaignReport) {
        logger.warn('[Report] 无报告数据可导出')
        return
      }

      this.exportingReport = true
      try {
        // 使用浏览器打印功能导出PDF
        const printContent = this.generatePrintableReport()
        const printWindow = window.open('', '_blank')

        if (printWindow) {
          printWindow.document.write(printContent)
          printWindow.document.close()
          printWindow.focus()

          // 延迟执行打印以确保内容加载完成
          setTimeout(() => {
            printWindow.print()
            printWindow.close()
          }, 500)

          if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
            Alpine.store('notification').success('报告已准备导出')
          }
        }
      } catch (error) {
        logger.error('[Report] 导出报告失败:', error)
        if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
          Alpine.store('notification').error('导出失败: ' + error.message)
        }
      } finally {
        this.exportingReport = false
      }
    },

    /**
     * 生成可打印的报告HTML
     * @returns {string} HTML字符串
     */
    generatePrintableReport() {
      const report = this.campaignReport
      if (!report) return ''

      const info = report.campaign_info || {}
      const overview = report.overview || {}
      const prizes = report.prize_analysis || {}
      const users = report.user_analysis || {}
      const experience = report.experience_metrics || {}

      return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${info.campaign_name || '活动'} - 复盘报告</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #333; }
    h1 { text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 16px; }
    h2 { color: #1e40af; margin-top: 32px; border-left: 4px solid #3b82f6; padding-left: 12px; }
    .info-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .info-table th, .info-table td { border: 1px solid #e5e7eb; padding: 12px; text-align: left; }
    .info-table th { background: #f3f4f6; width: 30%; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin: 16px 0; }
    .stat-card { background: #f0f9ff; padding: 16px; border-radius: 8px; text-align: center; }
    .stat-value { font-size: 24px; font-weight: bold; color: #1e40af; }
    .stat-label { font-size: 14px; color: #6b7280; margin-top: 4px; }
    .footer { margin-top: 40px; text-align: center; color: #9ca3af; font-size: 12px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>🎯 ${info.campaign_name || '活动'} 复盘报告</h1>
  
  <h2>📋 活动信息</h2>
  <table class="info-table">
    <tr><th>活动名称</th><td>${info.campaign_name || '-'}</td></tr>
    <tr><th>活动时间</th><td>${info.start_date || '-'} ~ ${info.end_date || '-'}</td></tr>
    <tr><th>持续天数</th><td>${info.duration_days || 0}天</td></tr>
    <tr><th>活动状态</th><td>${info.status || '-'}</td></tr>
  </table>

  <h2>📊 核心指标</h2>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-value">${overview.total_draws?.toLocaleString() || 0}</div>
      <div class="stat-label">抽奖次数</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${overview.unique_users?.toLocaleString() || 0}</div>
      <div class="stat-label">独立用户</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${overview.total_cost?.toLocaleString() || 0}</div>
      <div class="stat-label">成本(积分)</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${(overview.roi * 100)?.toFixed(1) || 0}%</div>
      <div class="stat-label">ROI</div>
    </div>
  </div>

  <h2>🏆 奖品分析</h2>
  <table class="info-table">
    <tr><th>总中奖次数</th><td>${prizes.total_wins?.toLocaleString() || 0}</td></tr>
    <tr><th>中奖率</th><td>${(prizes.win_rate * 100)?.toFixed(2) || 0}%</td></tr>
    <tr><th>最热门奖品</th><td>${prizes.top_prize?.name || '-'}</td></tr>
  </table>

  <h2>👥 用户分析</h2>
  <table class="info-table">
    <tr><th>新用户占比</th><td>${(users.new_user_ratio * 100)?.toFixed(1) || 0}%</td></tr>
    <tr><th>人均抽奖次数</th><td>${users.avg_draws_per_user?.toFixed(2) || 0}</td></tr>
    <tr><th>复购率</th><td>${(users.retention_rate * 100)?.toFixed(1) || 0}%</td></tr>
  </table>

  <h2>🎯 体验指标</h2>
  <table class="info-table">
    <tr><th>平均连空次数</th><td>${experience.avg_empty_streak?.toFixed(2) || 0}</td></tr>
    <tr><th>Pity触发率</th><td>${(experience.pity_trigger_rate * 100)?.toFixed(2) || 0}%</td></tr>
    <tr><th>AntiEmpty触发率</th><td>${(experience.anti_empty_trigger_rate * 100)?.toFixed(2) || 0}%</td></tr>
  </table>

  <div class="footer">
    <p>报告生成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>
    <p>抽奖运营管理后台</p>
  </div>
</body>
</html>`
    },

    /**
     * 格式化报告时间
     * @param {string} isoString - ISO时间字符串
     * @returns {string} 格式化后的时间
     */
    formatReportTime(isoString) {
      if (!isoString) return '-'
      try {
        const date = new Date(isoString)
        return date.toLocaleDateString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        })
      } catch {
        return isoString
      }
    },

    /**
     * 格式化百分比
     * @param {number} value - 小数值
     * @returns {string} 百分比字符串
     */
    formatPercent(value) {
      if (value === null || value === undefined) return '-'
      return (value * 100).toFixed(2) + '%'
    },

    /**
     * 格式化数字
     * @param {number} value - 数值
     * @returns {string} 格式化后的数字
     */
    formatNumber(value) {
      if (value === null || value === undefined) return '-'
      return value.toLocaleString('zh-CN')
    },

    /**
     * 格式化金额
     * @param {number} value - 金额
     * @returns {string} 格式化后的金额
     */
    formatMoney(value) {
      if (value === null || value === undefined) return '-'
      return '¥' + value.toLocaleString('zh-CN', { minimumFractionDigits: 2 })
    }
  }
}

export default { useReportState, useReportMethods }
