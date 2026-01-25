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
    /** @type {Object} 活动编辑表单 - 包含后端所有必填字段 */
    campaignForm: {
      // 基本信息（后端必填）
      campaign_name: '',
      campaign_code: '',
      campaign_type: 'event',
      description: '',
      // 时间设置（后端必填）
      start_time: '',
      end_time: '',
      // 抽奖配置（后端必填）
      cost_per_draw: 10,
      max_draws_per_user_daily: 3,
      max_draws_per_user_total: null,
      // 奖池配置
      total_prize_pool: 10000,
      remaining_prize_pool: 10000,
      // 状态和规则
      status: 'draft',
      rules_text: ''
    },
    /** @type {Array} 活动类型选项 */
    campaignTypeOptions: [
      { value: 'daily', label: '每日抽奖' },
      { value: 'weekly', label: '每周抽奖' },
      { value: 'event', label: '活动抽奖' },
      { value: 'permanent', label: '常驻抽奖' }
    ],
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
     * @description apiGet 返回的是 response.data（已解包），不是完整响应对象
     */
    async loadCampaigns() {
      try {
        console.log('📋 [Campaigns] loadCampaigns 开始执行')
        const params = new URLSearchParams()
        params.append('page', this.page)
        params.append('page_size', this.pageSize)
        if (this.campaignFilters.status) {
          params.append('status', this.campaignFilters.status)
        }
        if (this.campaignFilters.keyword) {
          params.append('keyword', this.campaignFilters.keyword)
        }

        // apiGet 通过 withLoading 包装，返回 { success: true, data: {...} }
        const response = await this.apiGet(
          `${LOTTERY_ENDPOINTS.CAMPAIGN_LIST}?${params}`,
          {},
          { showLoading: false }
        )
        console.log('📋 [Campaigns] API 返回数据:', response)
        
        // 解包 withLoading 返回的结构: { success: true, data: { campaigns: [...] } }
        const data = response?.success ? response.data : response
        console.log('📋 [Campaigns] 解包后数据:', data)
        
        if (data) {
          this.campaigns = data.campaigns || data.list || []
          // 更新分页信息
          if (data.pagination) {
            this.totalPages = data.pagination.total_pages || 1
            this.totalCount = data.pagination.total || 0
          }
          console.log('✅ [Campaigns] 数据加载完成, campaigns:', this.campaigns.length, 'total:', this.totalCount)
        }
      } catch (error) {
        logger.error('加载活动失败:', error)
        console.error('❌ [Campaigns] loadCampaigns 失败:', error)
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
     * 生成唯一的活动代码
     * @returns {string} 活动代码
     */
    generateCampaignCode() {
      const timestamp = Date.now()
      const random = Math.random().toString(36).substring(2, 8).toUpperCase()
      return `CAMP_${timestamp}_${random}`
    },

    /**
     * 打开创建活动模态框
     */
    openCreateCampaignModal() {
      this.editingCampaignId = null
      this.isEditMode = false
      // 计算默认时间（从明天开始，持续7天）
      const now = new Date()
      const startTime = new Date(now.getTime() + 24 * 60 * 60 * 1000)
      const endTime = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      
      this.campaignForm = {
        campaign_name: '',
        campaign_code: this.generateCampaignCode(),
        campaign_type: 'event',
        description: '',
        start_time: this.formatDateTimeLocal(startTime),
        end_time: this.formatDateTimeLocal(endTime),
        cost_per_draw: 10,
        max_draws_per_user_daily: 3,
        max_draws_per_user_total: null,
        total_prize_pool: 10000,
        remaining_prize_pool: 10000,
        status: 'draft',
        rules_text: ''
      }
      this.showModal('campaignModal')
    },

    /**
     * 编辑活动
     * 直接使用后端字段名称
     * @param {Object} campaign - 活动对象
     */
    editCampaign(campaign) {
      this.editingCampaignId = campaign.campaign_id
      this.isEditMode = true
      this.campaignForm = {
        campaign_name: campaign.campaign_name || '',
        campaign_code: campaign.campaign_code || '',
        campaign_type: campaign.campaign_type || 'event',
        description: campaign.description || '',
        start_time: this.formatDateTimeLocal(campaign.start_time),
        end_time: this.formatDateTimeLocal(campaign.end_time),
        cost_per_draw: campaign.cost_per_draw || 10,
        max_draws_per_user_daily: campaign.max_draws_per_user_daily || 3,
        max_draws_per_user_total: campaign.max_draws_per_user_total || null,
        total_prize_pool: campaign.total_prize_pool || 10000,
        remaining_prize_pool: campaign.remaining_prize_pool || 10000,
        status: campaign.status || 'draft',
        rules_text: campaign.rules_text || ''
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
     * 直接使用后端字段名称，包含所有必填字段
     */
    async submitCampaignForm() {
      // 验证必填字段
      if (!this.campaignForm.campaign_name) {
        this.showError('请输入活动名称')
        return
      }
      if (!this.campaignForm.campaign_code) {
        this.showError('请输入活动代码')
        return
      }
      if (!this.campaignForm.campaign_type) {
        this.showError('请选择活动类型')
        return
      }
      if (!this.campaignForm.start_time || !this.campaignForm.end_time) {
        this.showError('请设置活动时间')
        return
      }
      if (!this.campaignForm.cost_per_draw || this.campaignForm.cost_per_draw <= 0) {
        this.showError('每次抽奖消耗积分必须大于0')
        return
      }

      try {
        this.saving = true
        const url = this.isEditMode
          ? `${LOTTERY_ENDPOINTS.CAMPAIGN_LIST}/${this.editingCampaignId}`
          : LOTTERY_ENDPOINTS.CAMPAIGN_LIST

        // 构建请求数据 - 直接使用后端字段名称
        const requestData = {
          campaign_name: this.campaignForm.campaign_name,
          campaign_code: this.campaignForm.campaign_code,
          campaign_type: this.campaignForm.campaign_type,
          description: this.campaignForm.description || '',
          start_time: this.campaignForm.start_time,
          end_time: this.campaignForm.end_time,
          cost_per_draw: parseFloat(this.campaignForm.cost_per_draw) || 10,
          max_draws_per_user_daily: parseInt(this.campaignForm.max_draws_per_user_daily) || 3,
          max_draws_per_user_total: this.campaignForm.max_draws_per_user_total ? parseInt(this.campaignForm.max_draws_per_user_total) : null,
          total_prize_pool: parseFloat(this.campaignForm.total_prize_pool) || 10000,
          remaining_prize_pool: parseFloat(this.campaignForm.remaining_prize_pool) || 10000,
          status: this.campaignForm.status || 'draft',
          rules_text: this.campaignForm.rules_text || '',
          // 后端必填的prize_distribution_config - 提供默认配置
          prize_distribution_config: {
            tiers: [
              { tier_id: 1, tier_name: '特等奖', weight: 1000 },
              { tier_id: 2, tier_name: '一等奖', weight: 9000 },
              { tier_id: 3, tier_name: '二等奖', weight: 90000 },
              { tier_id: 4, tier_name: '三等奖', weight: 400000 },
              { tier_id: 5, tier_name: '谢谢参与', weight: 500000 }
            ]
          }
        }

        logger.debug('提交活动数据:', requestData)

        // apiCall 成功时返回 response.data，失败时抛出错误
        await this.apiCall(url, {
          method: this.isEditMode ? 'PUT' : 'POST',
          data: requestData
        })

        // 如果没有抛出错误，则表示成功
        this.showSuccess(this.isEditMode ? '活动更新成功' : '活动创建成功')
        this.hideModal('campaignModal')
        await this.loadCampaigns()
        await this.loadCampaignStats()
      } catch (error) {
        logger.error('保存活动失败:', error)
        this.showError('保存活动失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 删除活动
     * 使用后端字段：campaign_name
     * @param {Object} campaign - 活动对象
     */
    async deleteCampaign(campaign) {
      await this.confirmAndExecute(
        `确认删除活动「${campaign.campaign_name}」？此操作不可恢复`,
        async () => {
          // apiCall 成功时返回 response.data，失败时抛出错误
          await this.apiCall(
            `${LOTTERY_ENDPOINTS.CAMPAIGN_LIST}/${campaign.campaign_id}`,
            { method: 'DELETE' }
          )
          // 如果没有抛出错误，则表示成功
          await this.loadCampaigns()
          await this.loadCampaignStats()
        },
        { successMessage: '活动已删除', confirmText: '确认删除' }
      )
    },

    /**
     * 切换活动状态
     * 使用后端字段：campaign_name
     * @param {Object} campaign - 活动对象
     */
    async toggleCampaign(campaign) {
      const newStatus = campaign.status === 'active' ? 'paused' : 'active'
      await this.confirmAndExecute(
        `确认${newStatus === 'active' ? '启用' : '暂停'}活动「${campaign.campaign_name}」？`,
        async () => {
          // apiCall 成功时返回 response.data，失败时抛出错误
          await this.apiCall(
            `${LOTTERY_ENDPOINTS.CAMPAIGN_LIST}/${campaign.campaign_id}/status`,
            { method: 'PUT', data: { status: newStatus } }
          )
          // 如果没有抛出错误，则表示成功
          await this.loadCampaigns()
          await this.loadCampaignStats()
        },
        { successMessage: `活动已${newStatus === 'active' ? '启用' : '暂停'}` }
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

