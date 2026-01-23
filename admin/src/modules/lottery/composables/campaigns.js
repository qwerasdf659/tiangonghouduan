/**
 * 活动管理模块
 *
 * @file admin/src/modules/lottery/composables/campaigns.js
 * @description 抽奖活动的 CRUD 操作和状态管理
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery.js'

/**
 * 活动管理状态
 * @returns {Object} 状态对象
 */
export function useCampaignsState() {
  return {
    /** @type {Array} 活动列表 */
    campaigns: [],
    /** @type {Object} 活动统计 */
    campaignStats: { total: 0, active: 0, todayParticipants: 0, todayWinners: 0 },
    /** @type {Object} 活动筛选条件 */
    campaignFilters: { status: '', keyword: '' },
    /** @type {Object} 活动编辑表单 */
    campaignForm: {
      name: '',
      description: '',
      start_time: '',
      end_time: '',
      status: 'pending',
      rules: ''
    },
    /** @type {number|string|null} 当前编辑的活动ID */
    editingCampaignId: null,
    /** @type {Object|null} 选中的活动 */
    selectedCampaign: null
  }
}

/**
 * 活动管理方法
 * @param {Object} context - 组件上下文 (this)
 * @returns {Object} 方法对象
 */
export function useCampaignsMethods(context) {
  return {
    /**
     * 加载活动列表
     */
    async loadCampaigns() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.page)
        params.append('page_size', this.pageSize)
        if (this.campaignFilters.status) {
          params.append('status', this.campaignFilters.status)
        }
        if (this.campaignFilters.keyword) {
          params.append('keyword', this.campaignFilters.keyword)
        }

        const response = await this.apiGet(
          `${LOTTERY_ENDPOINTS.CAMPAIGN_LIST}?${params}`,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          this.campaigns = response.data?.campaigns || response.data?.list || []
        }
      } catch (error) {
        logger.error('加载活动失败:', error)
        this.campaigns = []
      }
    },

    /**
     * 加载活动统计数据
     */
    async loadCampaignStats() {
      this.campaignStats = {
        total: this.campaigns.length,
        active: this.campaigns.filter(c => c.status === 'active').length,
        todayParticipants: 0,
        todayWinners: 0
      }
    },

    /**
     * 打开创建活动模态框
     */
    openCreateCampaignModal() {
      this.editingCampaignId = null
      this.isEditMode = false
      this.campaignForm = {
        name: '',
        description: '',
        start_time: '',
        end_time: '',
        status: 'pending',
        rules: ''
      }
      this.showModal('campaignModal')
    },

    /**
     * 编辑活动
     * @param {Object} campaign - 活动对象
     */
    editCampaign(campaign) {
      this.editingCampaignId = campaign.campaign_id || campaign.id
      this.isEditMode = true
      this.campaignForm = {
        name: campaign.name || '',
        description: campaign.description || '',
        start_time: this.formatDateTimeLocal(campaign.start_time),
        end_time: this.formatDateTimeLocal(campaign.end_time),
        status: campaign.status || 'pending',
        rules: campaign.rules || ''
      }
      this.showModal('campaignModal')
    },

    /**
     * 查看活动详情
     * @param {Object} campaign - 活动对象
     */
    viewCampaignDetail(campaign) {
      this.selectedCampaign = campaign
      this.showModal('campaignDetailModal')
    },

    /**
     * 提交活动表单
     */
    async submitCampaignForm() {
      if (!this.campaignForm.name) {
        this.showError('请输入活动名称')
        return
      }
      if (!this.campaignForm.start_time || !this.campaignForm.end_time) {
        this.showError('请设置活动时间')
        return
      }

      try {
        this.saving = true
        const url = this.isEditMode
          ? `${LOTTERY_ENDPOINTS.CAMPAIGN_LIST}/${this.editingCampaignId}`
          : LOTTERY_ENDPOINTS.CAMPAIGN_LIST

        const response = await this.apiCall(url, {
          method: this.isEditMode ? 'PUT' : 'POST',
          data: {
            name: this.campaignForm.name,
            description: this.campaignForm.description,
            start_time: this.campaignForm.start_time,
            end_time: this.campaignForm.end_time,
            status: this.campaignForm.status,
            rules: this.campaignForm.rules
          }
        })

        if (response?.success) {
          this.showSuccess(this.isEditMode ? '活动更新成功' : '活动创建成功')
          this.hideModal('campaignModal')
          await this.loadCampaigns()
          await this.loadCampaignStats()
        }
      } catch (error) {
        this.showError('保存活动失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 删除活动
     * @param {Object} campaign - 活动对象
     */
    async deleteCampaign(campaign) {
      await this.confirmAndExecute(
        `确认删除活动「${campaign.name}」？此操作不可恢复`,
        async () => {
          const response = await this.apiCall(
            `${LOTTERY_ENDPOINTS.CAMPAIGN_LIST}/${campaign.campaign_id || campaign.id}`,
            { method: 'DELETE' }
          )
          if (response?.success) {
            await this.loadCampaigns()
            await this.loadCampaignStats()
          }
        },
        { successMessage: '活动已删除', confirmText: '确认删除' }
      )
    },

    /**
     * 切换活动状态
     * @param {Object} campaign - 活动对象
     */
    async toggleCampaign(campaign) {
      const newStatus = campaign.status === 'active' ? 'inactive' : 'active'
      await this.confirmAndExecute(
        `确认${newStatus === 'active' ? '启用' : '停用'}活动「${campaign.name}」？`,
        async () => {
          const response = await this.apiCall(
            `${LOTTERY_ENDPOINTS.CAMPAIGN_LIST}/${campaign.campaign_id || campaign.id}/status`,
            { method: 'PUT', data: { status: newStatus } }
          )
          if (response?.success) {
            await this.loadCampaigns()
            await this.loadCampaignStats()
          }
        },
        { successMessage: `活动已${newStatus === 'active' ? '启用' : '停用'}` }
      )
    },

    /**
     * 获取活动状态CSS类
     * @param {string} status - 活动状态
     * @returns {string} CSS类名
     */
    getCampaignStatusClass(status) {
      const map = {
        active: 'bg-success',
        inactive: 'bg-secondary',
        pending: 'bg-warning',
        ended: 'bg-dark'
      }
      return map[status] || 'bg-secondary'
    },

    /**
     * 获取活动状态文本
     * @param {string} status - 活动状态
     * @returns {string} 状态文本
     */
    getCampaignStatusText(status) {
      const map = { active: '进行中', inactive: '已结束', pending: '待开始', ended: '已结束' }
      return map[status] || status
    }
  }
}

export default { useCampaignsState, useCampaignsMethods }

