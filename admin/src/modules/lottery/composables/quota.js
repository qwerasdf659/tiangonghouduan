/**
 * 配额管理模块
 *
 * @file admin/src/modules/lottery/composables/quota.js
 * @description 配额规则的 CRUD 操作和使用统计
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery.js'
import { buildURL } from '../../../api/base.js'

/**
 * 配额管理状态
 * @returns {Object} 状态对象
 */
export function useQuotaState() {
  return {
    /** @type {Array} 配额列表 */
    quotas: [],
    /** @type {Object} 配额表单 */
    quotaForm: {
      campaign_id: '',
      prize_id: '',
      total_quota: 0,
      period_type: 'daily',
      rule_type: 'campaign',
      status: 'active'
    },
    /** @type {number|string|null} 当前编辑的配额ID */
    editingQuotaId: null,
    /** @type {boolean} 是否编辑模式 */
    isEditQuota: false,
    /** @type {Object} 配额筛选条件 */
    quotaFilters: { ruleType: '', status: '', campaignId: '' },
    /** @type {Object} 配额统计 */
    quotaStats: { totalRules: 0, activeRules: 0, totalQuota: 0, usedQuota: 0, usedPercentage: 0 },
    /** @type {Array} 配额使用情况 */
    quotaUsage: [],
    /** @type {string} 用户配额检查ID */
    quotaCheckUserId: '',
    /** @type {Object|null} 用户配额检查结果 */
    userQuotaCheckResult: null,
    /** @type {Object} 配额统计（旧版本兼容） */
    quotaStatistics: { totalRules: 0, activeRules: 0, totalQuota: 0, usedQuota: 0 }
  }
}

/**
 * 配额管理方法
 * @returns {Object} 方法对象
 */
export function useQuotaMethods() {
  return {
    /**
     * 加载配额规则列表
     */
    async loadQuotas() {
      try {
        const params = new URLSearchParams()
        if (this.quotaFilters?.ruleType) {
          params.append('rule_type', this.quotaFilters.ruleType)
        }
        if (this.quotaFilters?.status) {
          params.append('status', this.quotaFilters.status)
        }
        if (this.quotaFilters?.campaignId) {
          params.append('campaign_id', this.quotaFilters.campaignId)
        }

        const response = await this.apiGet(
          `${LOTTERY_ENDPOINTS.QUOTA_RULES_LIST}?${params}`,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          this.quotas = response.data?.quotas || response.data?.list || response.data || []
          this.quotaStats = this.generateQuotaStats(this.quotas)
        }
      } catch (error) {
        logger.error('加载配额失败:', error)
        this.quotas = []
        this.quotaStats = { totalRules: 0, activeRules: 0, usedPercentage: 0 }
      }
    },

    /**
     * 生成配额统计
     * @param {Array} quotas - 配额规则列表
     * @returns {Object} 统计对象
     */
    generateQuotaStats(quotas) {
      const totalRules = quotas.length
      const activeRules = quotas.filter(q => q.status === 'active' || q.is_active).length
      const totalQuota = quotas.reduce((sum, q) => sum + (q.total_quota || 0), 0)
      const usedQuota = quotas.reduce((sum, q) => sum + (q.used_quota || 0), 0)
      const usedPercentage = totalQuota > 0 ? ((usedQuota / totalQuota) * 100).toFixed(1) : 0

      return { totalRules, activeRules, totalQuota, usedQuota, usedPercentage }
    },

    /**
     * 加载配额使用情况
     */
    async loadQuotaUsage() {
      try {
        const response = await this.apiGet(
          LOTTERY_ENDPOINTS.QUOTA_STATISTICS,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          this.quotaUsage = response.data?.usage || response.data || []
        }
      } catch (error) {
        logger.error('加载配额使用情况失败:', error)
        this.quotaUsage = []
      }
    },

    /**
     * 检查用户配额
     */
    async checkUserQuota() {
      if (!this.quotaCheckUserId) {
        this.showError('请输入用户ID')
        return
      }
      try {
        const response = await this.apiGet(
          buildURL(LOTTERY_ENDPOINTS.QUOTA_USER_CHECK, { user_id: this.quotaCheckUserId }),
          {},
          { showLoading: true }
        )
        if (response?.success) {
          this.userQuotaCheckResult = response.data
          this.showSuccess('配额检查完成')
        }
      } catch (error) {
        logger.error('检查用户配额失败:', error)
        this.showError('检查用户配额失败')
      }
    },

    /**
     * 打开创建配额模态框
     */
    openCreateQuotaModal() {
      this.editingQuotaId = null
      this.isEditQuota = false
      this.quotaForm = {
        campaign_id: '',
        prize_id: '',
        total_quota: 0,
        period_type: 'daily',
        rule_type: 'campaign',
        status: 'active'
      }
      this.showModal('quotaModal')
    },

    /**
     * 编辑配额规则
     * @param {Object} quota - 配额规则对象
     */
    editQuota(quota) {
      this.editingQuotaId = quota.quota_id || quota.id
      this.isEditQuota = true
      this.quotaForm = {
        campaign_id: quota.campaign_id,
        prize_id: quota.prize_id,
        total_quota: quota.total_quota,
        period_type: quota.period_type || 'daily',
        rule_type: quota.rule_type || 'campaign',
        status: quota.status || 'active'
      }
      this.showModal('quotaModal')
    },

    /**
     * 提交配额表单
     */
    async submitQuotaForm() {
      if (!this.quotaForm.campaign_id || !this.quotaForm.prize_id) {
        this.showError('请选择活动和奖品')
        return
      }
      if (!this.quotaForm.total_quota || this.quotaForm.total_quota <= 0) {
        this.showError('请输入有效的配额数量')
        return
      }

      try {
        this.saving = true
        const url = this.isEditQuota
          ? buildURL(LOTTERY_ENDPOINTS.QUOTA_RULES_DETAIL, { id: this.editingQuotaId })
          : LOTTERY_ENDPOINTS.QUOTA_RULES_CREATE

        const response = await this.apiCall(url, {
          method: this.isEditQuota ? 'PUT' : 'POST',
          data: this.quotaForm
        })

        if (response?.success) {
          this.showSuccess(this.isEditQuota ? '配额更新成功' : '配额创建成功')
          this.hideModal('quotaModal')
          await this.loadQuotas()
        }
      } catch (error) {
        this.showError('保存配额失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 删除配额
     * @param {Object} quota - 配额规则对象
     */
    async deleteQuota(quota) {
      await this.confirmAndExecute(
        `确认删除此配额配置？`,
        async () => {
          const response = await this.apiCall(
            buildURL(LOTTERY_ENDPOINTS.QUOTA_RULES_DETAIL, { id: quota.quota_id || quota.id }),
            { method: 'DELETE' }
          )
          if (response?.success) {
            await this.loadQuotas()
          }
        },
        { successMessage: '配额已删除' }
      )
    },

    /**
     * 切换配额状态
     * @param {Object} quota - 配额规则对象
     */
    async toggleQuotaStatus(quota) {
      const newStatus = quota.status === 'active' ? 'inactive' : 'active'
      try {
        const response = await this.apiCall(
          buildURL(LOTTERY_ENDPOINTS.QUOTA_RULES_DETAIL, { id: quota.quota_id || quota.id }),
          { method: 'PUT', data: { status: newStatus } }
        )
        if (response?.success) {
          this.showSuccess(`配额已${newStatus === 'active' ? '启用' : '禁用'}`)
          await this.loadQuotas()
        }
      } catch (error) {
        this.showError('切换配额状态失败')
      }
    },

    /**
     * 获取配额类型文本
     * @param {string} type - 配额类型代码
     * @returns {string} 配额类型文本
     */
    getQuotaTypeText(type) {
      const map = {
        global: '全局配额',
        user: '用户配额',
        tier: '等级配额',
        campaign: '活动配额',
        daily: '每日配额'
      }
      return map[type] || type || '-'
    },

    /**
     * 获取周期类型文本
     * @param {string} type - 周期类型代码
     * @returns {string} 周期类型文本
     */
    getPeriodTypeText(type) {
      const map = {
        daily: '每日',
        weekly: '每周',
        monthly: '每月',
        total: '总计',
        permanent: '永久'
      }
      return map[type] || type || '-'
    },

    /**
     * 计算配额使用百分比
     * @param {Object} quota - 配额规则对象
     * @returns {number|string} 使用率百分比
     */
    getQuotaUsagePercent(quota) {
      if (!quota.total_quota || quota.total_quota <= 0) return 0
      return (((quota.used_quota || 0) / quota.total_quota) * 100).toFixed(1)
    },

    /**
     * 获取配额状态样式
     * @param {Object} quota - 配额规则对象
     * @returns {string} CSS类名
     */
    getQuotaStatusClass(quota) {
      const percent = this.getQuotaUsagePercent(quota)
      if (percent >= 100) return 'bg-danger'
      if (percent >= 80) return 'bg-warning'
      return 'bg-success'
    }
  }
}

export default { useQuotaState, useQuotaMethods }

