/**
 * 广告系统管理 - Alpine.js 组件
 *
 * @file admin/src/modules/content/pages/ad-management.js
 * @description 广告活动管理、广告位管理、广告报表
 * @version 1.0.0
 * @date 2026-02-18
 */

import { logger } from '../../../utils/logger.js'
import { buildURL } from '../../../api/base.js'
import { SYSTEM_ENDPOINTS } from '../../../api/system/index.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { request } from '../../../api/base.js'

document.addEventListener('alpine:init', () => {
  logger.info('[AdManagement] 注册 Alpine 组件...')

  Alpine.data('adManagement', () => ({
    ...createPageMixin(),

    // ==================== 子页面导航 ====================
    current_page: 'dashboard',
    subPages: [
      { id: 'dashboard', name: '广告概览', icon: '📊' },
      { id: 'campaigns', name: '广告活动', icon: '📋' },
      { id: 'slots', name: '广告位', icon: '📍' },
      { id: 'reports', name: '数据报表', icon: '📈' }
    ],

    // ==================== 通用状态 ====================
    saving: false,

    // ==================== 仪表板 ====================
    dashboard: {},
    dashboardLoading: false,

    // ==================== 广告活动 ====================
    campaigns: [],
    campaignsLoading: false,
    campaignFilters: { status: '', billing_mode: '', ad_slot_id: '' },
    campaignPage: 1,
    campaignPagination: { total: 0, total_pages: 0 },
    campaignDetail: null,
    /** 广告位列表（用于筛选下拉） */
    allSlotsList: [],

    // ==================== 审核 ====================
    reviewTarget: null,
    reviewAction: '',
    reviewNote: '',

    // ==================== 广告位 ====================
    adSlots: [],
    slotsLoading: false,
    slotEditMode: false,
    slotForm: {
      ad_slot_id: null,
      slot_key: '',
      slot_name: '',
      slot_type: 'popup',
      position: 'home',
      max_display_count: 3,
      daily_price_diamond: 100,
      min_bid_diamond: 50,
      min_budget_diamond: 500,
      description: ''
    },

    // ==================== 报表 ====================
    reportOverview: {},
    reportLoading: false,
    reportFilters: { start_date: '', end_date: '' },
    /** 单活动/广告位详细报表 */
    campaignReport: null,
    campaignReportLoading: false,
    slotReport: null,
    slotReportLoading: false,
    reportDetailType: '',
    reportDetailId: null,

    init() {
      logger.info('[AdManagement] 页面初始化')
      if (!this.checkAuth()) return
      const urlParams = new URLSearchParams(window.location.search)
      this.current_page = urlParams.get('page') || 'dashboard'

      const today = new Date()
      const weekAgo = new Date(today.getTime() - 7 * 24 * 3600 * 1000)
      this.reportFilters.end_date = today.toISOString().slice(0, 10)
      this.reportFilters.start_date = weekAgo.toISOString().slice(0, 10)

      this.loadPageData()
      this.loadAllSlotsList()
    },

    async loadAllSlotsList() {
      try {
        const response = await request({
          url: SYSTEM_ENDPOINTS.AD_SLOT_LIST,
          method: 'GET',
          params: { limit: 100 }
        })
        if (response?.success) {
          this.allSlotsList = response.data?.slots || []
        }
      } catch (error) {
        logger.warn('加载广告位列表失败:', error.message)
      }
    },

    switchPage(pageId) {
      this.current_page = pageId
      const url = new URL(window.location)
      url.searchParams.set('page', pageId)
      window.history.pushState({}, '', url)
      this.loadPageData()
    },

    async loadPageData() {
      switch (this.current_page) {
        case 'dashboard':
          await this.loadDashboard()
          break
        case 'campaigns':
          await this.loadCampaigns()
          break
        case 'slots':
          await this.loadSlots()
          break
        case 'reports':
          await this.loadReportOverview()
          break
      }
    },

    // ==================== 仪表板 ====================
    async loadDashboard() {
      this.dashboardLoading = true
      try {
        const response = await request({
          url: SYSTEM_ENDPOINTS.AD_CAMPAIGN_DASHBOARD,
          method: 'GET'
        })
        if (response?.success) {
          this.dashboard = response.data || {}
        }
      } catch (error) {
        logger.error('加载广告概览失败:', error)
        this.showError('加载广告概览失败: ' + error.message)
      } finally {
        this.dashboardLoading = false
      }
    },

    // ==================== 广告活动 ====================
    async loadCampaigns() {
      this.campaignsLoading = true
      try {
        const params = { page: this.campaignPage, limit: 20 }
        if (this.campaignFilters.status) params.status = this.campaignFilters.status
        if (this.campaignFilters.billing_mode) params.billing_mode = this.campaignFilters.billing_mode
        if (this.campaignFilters.ad_slot_id) params.ad_slot_id = this.campaignFilters.ad_slot_id

        const response = await request({
          url: SYSTEM_ENDPOINTS.AD_CAMPAIGN_LIST,
          method: 'GET',
          params
        })
        if (response?.success) {
          this.campaigns = response.data?.campaigns || []
          this.campaignPagination = response.data?.pagination || { total: 0, total_pages: 0 }
        }
      } catch (error) {
        logger.error('加载广告活动失败:', error)
        this.campaigns = []
      } finally {
        this.campaignsLoading = false
      }
    },

    async viewCampaign(campaign) {
      try {
        const response = await request({
          url: buildURL(SYSTEM_ENDPOINTS.AD_CAMPAIGN_DETAIL, { id: campaign.ad_campaign_id }),
          method: 'GET'
        })
        if (response?.success) {
          this.campaignDetail = response.data?.campaign || response.data || {}
          this.showModal('campaignDetailModal')
        }
      } catch (error) {
        logger.error('加载活动详情失败:', error)
        this.showError('加载活动详情失败: ' + error.message)
      }
    },

    reviewCampaign(campaign, action) {
      this.reviewTarget = campaign
      this.reviewAction = action
      this.reviewNote = ''
      this.showModal('reviewModal')
    },

    async submitReview() {
      if (!this.reviewTarget) return
      this.saving = true
      try {
        const response = await request({
          url: buildURL(SYSTEM_ENDPOINTS.AD_CAMPAIGN_REVIEW, { id: this.reviewTarget.ad_campaign_id }),
          method: 'PATCH',
          data: {
            action: this.reviewAction,
            review_note: this.reviewNote
          }
        })
        if (response?.success) {
          this.hideModal('reviewModal')
          this.showSuccess(this.reviewAction === 'approved' ? '审核通过' : '审核拒绝')
          await this.loadCampaigns()
        }
      } catch (error) {
        logger.error('审核操作失败:', error)
        this.showError('审核操作失败: ' + error.message)
      } finally {
        this.saving = false
      }
    },

    // ==================== 广告位 ====================
    async loadSlots() {
      this.slotsLoading = true
      try {
        const response = await request({
          url: SYSTEM_ENDPOINTS.AD_SLOT_LIST,
          method: 'GET'
        })
        if (response?.success) {
          this.adSlots = response.data?.slots || []
        }
      } catch (error) {
        logger.error('加载广告位失败:', error)
        this.adSlots = []
      } finally {
        this.slotsLoading = false
      }
    },

    openCreateSlotModal() {
      this.slotEditMode = false
      this.slotForm = {
        ad_slot_id: null,
        slot_key: '',
        slot_name: '',
        slot_type: 'popup',
        position: 'home',
        max_display_count: 3,
        daily_price_diamond: 100,
        min_bid_diamond: 50,
        min_budget_diamond: 500,
        description: ''
      }
      this.showModal('slotModal')
    },

    editSlot(slot) {
      this.slotEditMode = true
      this.slotForm = {
        ad_slot_id: slot.ad_slot_id,
        slot_key: slot.slot_key,
        slot_name: slot.slot_name,
        slot_type: slot.slot_type,
        position: slot.position,
        max_display_count: slot.max_display_count,
        daily_price_diamond: slot.daily_price_diamond,
        min_bid_diamond: slot.min_bid_diamond,
        min_budget_diamond: slot.min_budget_diamond || 500,
        description: slot.description || ''
      }
      this.showModal('slotModal')
    },

    async saveSlot() {
      if (!this.slotForm.slot_name?.trim()) {
        this.showError('请输入广告位名称')
        return
      }
      if (!this.slotEditMode && !this.slotForm.slot_key?.trim()) {
        this.showError('请输入广告位标识')
        return
      }

      this.saving = true
      try {
        const url = this.slotEditMode
          ? buildURL(SYSTEM_ENDPOINTS.AD_SLOT_UPDATE, { id: this.slotForm.ad_slot_id })
          : SYSTEM_ENDPOINTS.AD_SLOT_CREATE
        const method = this.slotEditMode ? 'PUT' : 'POST'

        const response = await request({ url, method, data: this.slotForm })
        if (response?.success) {
          this.hideModal('slotModal')
          this.showSuccess(this.slotEditMode ? '广告位已更新' : '广告位已创建')
          await this.loadSlots()
        }
      } catch (error) {
        logger.error('保存广告位失败:', error)
        this.showError('保存广告位失败: ' + error.message)
      } finally {
        this.saving = false
      }
    },

    async toggleSlotStatus(slot) {
      try {
        const response = await request({
          url: buildURL(SYSTEM_ENDPOINTS.AD_SLOT_TOGGLE, { id: slot.ad_slot_id }),
          method: 'PATCH'
        })
        if (response?.success) {
          this.showSuccess(`广告位已${slot.is_active ? '禁用' : '启用'}`)
          await this.loadSlots()
        }
      } catch (error) {
        this.showError('切换状态失败: ' + error.message)
      }
    },

    // ==================== 报表 ====================
    async loadReportOverview() {
      this.reportLoading = true
      try {
        const params = {}
        if (this.reportFilters.start_date) params.start_date = this.reportFilters.start_date
        if (this.reportFilters.end_date) params.end_date = this.reportFilters.end_date

        const response = await request({
          url: SYSTEM_ENDPOINTS.AD_REPORT_OVERVIEW,
          method: 'GET',
          params
        })
        if (response?.success) {
          this.reportOverview = response.data || {}
        }
      } catch (error) {
        logger.error('加载报表失败:', error)
        this.reportOverview = {}
      } finally {
        this.reportLoading = false
      }
    },

    async viewCampaignReport(campaignId) {
      this.reportDetailType = 'campaign'
      this.reportDetailId = campaignId
      this.campaignReport = null
      this.campaignReportLoading = true
      this.showModal('reportDetailModal')
      try {
        const params = {}
        if (this.reportFilters.start_date) params.start_date = this.reportFilters.start_date
        if (this.reportFilters.end_date) params.end_date = this.reportFilters.end_date
        const response = await request({
          url: buildURL(SYSTEM_ENDPOINTS.AD_REPORT_CAMPAIGN, { id: campaignId }),
          method: 'GET',
          params
        })
        if (response?.success) {
          this.campaignReport = response.data || {}
        }
      } catch (error) {
        logger.error('加载活动报表失败:', error)
        this.showError('加载活动报表失败: ' + error.message)
      } finally {
        this.campaignReportLoading = false
      }
    },

    async viewSlotReport(slotId) {
      this.reportDetailType = 'slot'
      this.reportDetailId = slotId
      this.slotReport = null
      this.slotReportLoading = true
      this.showModal('reportDetailModal')
      try {
        const params = {}
        if (this.reportFilters.start_date) params.start_date = this.reportFilters.start_date
        if (this.reportFilters.end_date) params.end_date = this.reportFilters.end_date
        const response = await request({
          url: buildURL(SYSTEM_ENDPOINTS.AD_REPORT_SLOT, { id: slotId }),
          method: 'GET',
          params
        })
        if (response?.success) {
          this.slotReport = response.data || {}
        }
      } catch (error) {
        logger.error('加载广告位报表失败:', error)
        this.showError('加载广告位报表失败: ' + error.message)
      } finally {
        this.slotReportLoading = false
      }
    }
  }))

  logger.info('[AdManagement] Alpine 组件已注册')
})

logger.info('[AdManagement] 页面脚本已加载')
