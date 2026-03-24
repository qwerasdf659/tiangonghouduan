/**
 * 广告系统管理 - Alpine.js 组件
 *
 * @file admin/src/modules/content/pages/ad-management.js
 * @description 广告活动管理、广告位管理、广告报表
 * @version 1.0.0
 * @date 2026-02-18
 */

import { logger } from '../../../utils/logger.js'
import { buildURL, request } from '../../../api/base.js'
import { SYSTEM_ENDPOINTS } from '../../../api/system/index.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { loadECharts } from '../../../utils/echarts-lazy.js'
import { useAdPricingState } from '../composables/ad-pricing.js'
import { imageUploadMixin } from '../../../alpine/mixins/image-upload.js'

document.addEventListener('alpine:init', () => {
  logger.info('[AdManagement] 注册 Alpine 组件...')

  Alpine.data('adManagement', () => ({
    ...createPageMixin(),
    ...useAdPricingState(),
    ...imageUploadMixin(),

    // ==================== 子页面导航 ====================
    current_page: 'dashboard',
    subPages: [
      { id: 'dashboard', name: '投放概览', icon: '📊' },
      { id: 'system-notices', name: '系统通知', icon: '📢' },
      { id: 'operational', name: '运营推广', icon: '🎯' },
      { id: 'campaigns', name: '商业广告', icon: '📋' },
      { id: 'slots', name: '广告位', icon: '📍' },
      { id: 'reports', name: '数据报表', icon: '📈' },
      { id: 'bid-logs', name: '竞价日志', icon: '🏷️' },
      { id: 'user-tags', name: '用户标签', icon: '🏷️' },
      { id: 'antifraud', name: '反作弊', icon: '🛡️' },
      { id: 'attribution', name: '归因追踪', icon: '🔗' },
      { id: 'pricing', name: '定价配置', icon: '💰' },
      { id: 'adjustments', name: '调价历史', icon: '📝' },
      { id: 'billing-records', name: '计费流水', icon: '🧾' }
    ],

    /** 当前选中的 category 筛选（system/operational/commercial）*/
    category_filter: null,

    // ==================== 中文映射字典 ====================
    /** 广告活动状态 → 中文 */
    STATUS_MAP: {
      draft: '草稿',
      pending_review: '待审核',
      approved: '已批准',
      active: '投放中',
      paused: '已暂停',
      completed: '已完成',
      rejected: '已拒绝',
      cancelled: '已取消'
    },
    /** 广告活动状态 → 颜色 */
    STATUS_COLOR: {
      draft: 'bg-gray-500',
      pending_review: 'bg-yellow-500',
      approved: 'bg-blue-500',
      active: 'bg-green-500',
      paused: 'bg-orange-500',
      completed: 'bg-indigo-500',
      rejected: 'bg-red-500',
      cancelled: 'bg-gray-400'
    },
    /** 计费模式 → 中文 */
    BILLING_MAP: {
      fixed_daily: '固定包天',
      bidding: '竞价排名',
      free: '免费（运营/系统）',
      cpm: 'CPM曝光计费'
    },
    /** 广告位类型 → 中文 */
    SLOT_TYPE_MAP: {
      popup: '弹窗',
      carousel: '轮播图',
      announcement: '系统公告',
      feed: '信息流'
    },
    /** 广告位大类 → 中文 */
    SLOT_CATEGORY_MAP: {
      display: '展示广告',
      feed: '信息流广告'
    },
    /** 计划分类 → 中文 */
    CATEGORY_MAP: {
      commercial: '商业广告',
      operational: '运营推广',
      system: '系统通知'
    },
    /** 计划分类 → 颜色 */
    CATEGORY_COLOR: {
      commercial: 'bg-blue-500',
      operational: 'bg-green-500',
      system: 'bg-purple-500'
    },
    /** 页面位置 → 中文 */
    POSITION_MAP: {
      home: '首页',
      lottery: '抽奖页',
      profile: '个人中心'
    },
    /** 竞价落选原因 → 中文 */
    LOSE_REASON_MAP: {
      outbid: '被更高出价击败',
      targeting_mismatch: '定向不匹配',
      budget_exhausted: '预算已耗尽'
    },
    /** 反作弊触发规则 → 中文 */
    RULE_MAP: {
      none: '无异常',
      frequency_cap: '频次超限',
      frequency_limit: '频次超限',
      batch_detection: '批量异常',
      device_fingerprint: '设备指纹异常',
      self_click: '自刷行为',
      fake_click: '虚假点击'
    },
    /** 反作弊判定结果 → 中文 + 颜色 */
    VERDICT_MAP: {
      valid: { text: '有效', color: 'bg-emerald-500' },
      invalid: { text: '无效', color: 'bg-red-500' },
      suspicious: { text: '可疑', color: 'bg-amber-500' }
    },
    /** 转化类型 → 中文 + 颜色 */
    CONVERSION_MAP: {
      lottery_draw: { text: '抽奖', color: 'bg-purple-100 text-purple-700' },
      exchange: { text: '兑换', color: 'bg-blue-100 text-blue-700' },
      market_buy: { text: '市场购买', color: 'bg-green-100 text-green-700' },
      page_view: { text: '页面浏览', color: 'bg-gray-100 text-gray-700' }
    },
    /** 频次规则 → 中文说明 */
    FREQUENCY_MAP: {
      always: '每次都显示',
      once: '只显示一次',
      once_per_session: '每次启动一次',
      once_per_day: '每天一次',
      once_per_n_days: '每N天一次',
      n_times_total: '总共N次'
    },
    /** DMP 标签键 → 中文说明 */
    TAG_KEY_MAP: {
      lottery_active_7d: '7天抽奖活跃',
      lottery_active_30d: '30天抽奖活跃',
      lottery_total_count: '累计抽奖次数',
      diamond_balance: '钻石余额',
      diamond_rich: '钻石富豪',
      has_red_shard: '持有红水晶碎片',
      market_trader: '交易市场用户',
      new_user: '新用户',
      register_days: '注册天数',
      active_7d: '7天活跃'
    },

    /** 获取状态中文名 */
    statusText(status) {
      return this.STATUS_MAP[status] || status
    },
    /** 获取状态颜色 */
    statusColor(status) {
      return this.STATUS_COLOR[status] || 'bg-gray-500'
    },
    /** 获取计费模式中文名 */
    billingText(mode) {
      return this.BILLING_MAP[mode] || mode
    },
    /** 获取广告位类型中文名 */
    slotTypeText(type) {
      return this.SLOT_TYPE_MAP[type] || type
    },
    /** 获取位置中文名 */
    positionText(pos) {
      return this.POSITION_MAP[pos] || pos
    },
    /** 获取落选原因中文 */
    loseReasonText(reason) {
      return this.LOSE_REASON_MAP[reason] || reason || '-'
    },
    /** 获取触发规则中文 */
    ruleText(rule) {
      return this.RULE_MAP[rule] || rule || '-'
    },
    /** 获取判定结果中文 */
    verdictText(v) {
      return this.VERDICT_MAP[v]?.text || v
    },
    /** 获取判定结果颜色 */
    verdictColor(v) {
      return this.VERDICT_MAP[v]?.color || 'bg-gray-500'
    },
    /** 获取转化类型中文 */
    conversionText(type) {
      return this.CONVERSION_MAP[type]?.text || type
    },
    /** 获取转化类型颜色 */
    conversionColor(type) {
      return this.CONVERSION_MAP[type]?.color || 'bg-gray-100 text-gray-700'
    },
    /** 获取标签键中文 */
    tagKeyText(key) {
      return this.TAG_KEY_MAP[key] || key
    },
    /** 获取频次规则中文 */
    frequencyText(rule) {
      return this.FREQUENCY_MAP[rule] || rule || '-'
    },

    // ==================== 图片上传 ====================
    /** 广告创意图片预览 URL（本地 blob 或已上传的 public_url） */
    campaignImagePreview: '',
    /** 已上传的 media_id（用于提交） */
    campaignPrimaryMediaId: null,
    /** 已上传的 object_key（仅用于本地状态追踪，不提交给后端） */
    campaignImageUrl: '',

    /** 处理广告图片选择 */
    async handleCampaignImageUpload(event) {
      const fileInfo = this.getFileFromEvent(event)
      if (!fileInfo) return
      this.campaignImagePreview = fileInfo.preview_url
      const result = await this.uploadImage(fileInfo.file, {
        business_type: 'uploads',
        category: 'ad_creative'
      })
      if (result) {
        this.campaignPrimaryMediaId = result.media_id
        this.campaignImageUrl = result.object_key || ''
        if (result.public_url) this.campaignImagePreview = result.public_url
      } else {
        this.campaignImagePreview = ''
        this.campaignPrimaryMediaId = null
        this.campaignImageUrl = ''
      }
    },

    /** 清除已选图片 */
    clearCampaignImage() {
      this.campaignImagePreview = ''
      this.campaignPrimaryMediaId = null
      this.campaignImageUrl = ''
    },

    // ==================== 通用状态 ====================
    saving: false,

    // ==================== 弹窗队列配置 ====================
    popupQueueMaxCount: 5,

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

    // ==================== 创建广告活动 ====================
    campaignForm: {
      campaign_name: '',
      ad_slot_id: '',
      billing_mode: 'fixed_daily',
      advertiser_user_id: '',
      daily_bid_diamond: 50,
      budget_total_diamond: 500,
      fixed_days: 7,
      start_date: '',
      end_date: '',
      priority: 50
    },

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
      slot_category: 'display',
      position: 'home',
      max_display_count: 3,
      daily_price_diamond: 100,
      min_bid_diamond: 50,
      min_budget_diamond: 500,
      min_daily_price_diamond: 0,
      cpm_price_diamond: 0,
      zone_id: null,
      description: ''
    },

    // ==================== 报表 ====================
    reportOverview: {},
    reportLoading: false,
    reportFilters: { start_date: '', end_date: '' },
    reportRangeLabel: '7天',
    // ==================== Phase 4-6 数据查询 ====================
    bidLogs: [],
    bidLogsLoading: false,
    bidLogsFilters: { ad_campaign_id: '', is_winner: '' },
    bidLogsPagination: { total: 0, total_pages: 0 },
    bidLogsPage: 1,
    userAdTags: [],
    userAdTagsLoading: false,
    userAdTagsFilters: { user_id: '', tag_key: '' },
    userAdTagsPagination: { total: 0, total_pages: 0 },
    userAdTagsPage: 1,
    antifraudLogs: [],
    antifraudLogsLoading: false,
    antifraudFilters: { ad_campaign_id: '', verdict: '', event_type: '' },
    antifraudPagination: { total: 0, total_pages: 0 },
    antifraudPage: 1,
    attributionLogs: [],
    attributionLogsLoading: false,
    attributionFilters: { ad_campaign_id: '', conversion_type: '' },
    attributionPagination: { total: 0, total_pages: 0 },
    attributionPage: 1,

    /** 调价历史列表 */
    price_adjustments: [],
    price_adjustments_loading: false,
    price_adjustments_pagination: { total: 0, total_pages: 0 },
    price_adjustments_page: 1,
    price_adjustments_filter: { status: '', trigger_type: '' },

    /** 调价状态映射 */
    ADJUSTMENT_STATUS_MAP: {
      pending: '待确认',
      confirmed: '已确认',
      rejected: '已拒绝',
      applied: '已执行'
    },
    ADJUSTMENT_STATUS_COLOR: {
      pending: 'bg-yellow-500',
      confirmed: 'bg-blue-500',
      rejected: 'bg-red-500',
      applied: 'bg-green-500'
    },
    TRIGGER_TYPE_MAP: {
      dau_shift: '日活变化自动触发',
      manual: '运营手动触发'
    },

    /** 计费流水列表（billing_no 展示） */
    billing_records: [],
    billing_records_loading: false,
    billing_records_pagination: { total: 0, total_pages: 0 },
    billing_records_page: 1,
    billing_records_filter: { billing_type: '', ad_campaign_id: '' },
    /** 计费类型 → 中文 */
    BILLING_TYPE_MAP: {
      freeze: '冻结',
      deduct: '扣款',
      refund: '退款',
      daily_deduct: '日扣',
      cpm_deduct: 'CPM扣费'
    },

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
          params: { page_size: 100 }
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
        case 'system-notices':
          this.category_filter = 'system'
          await this.loadCampaigns()
          break
        case 'operational':
          this.category_filter = 'operational'
          await this.loadCampaigns()
          break
        case 'campaigns':
          this.category_filter = 'commercial'
          await this.loadCampaigns()
          break
        case 'slots':
          await this.loadSlots()
          break
        case 'reports':
          await this.loadReportOverview()
          break
        case 'bid-logs':
          await this.loadBidLogs()
          break
        case 'user-tags':
          await this.loadUserAdTags()
          break
        case 'antifraud':
          await this.loadAntifraudLogs()
          break
        case 'attribution':
          await this.loadAttributionLogs()
          break
        case 'pricing':
          await this.loadPricingConfig()
          await this.loadDauStats(this.dau_chart_days || 30)
          break
        case 'adjustments':
          await this.loadPriceAdjustments()
          break
        case 'billing-records':
          await this.loadBillingRecords()
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
        await this.loadPopupQueueConfig()
      } catch (error) {
        logger.error('加载广告概览失败:', error)
        this.showError('加载广告概览失败: ' + error.message)
      } finally {
        this.dashboardLoading = false
      }
    },

    async loadPopupQueueConfig() {
      try {
        const response = await request({
          url: SYSTEM_ENDPOINTS.AD_POPUP_QUEUE_CONFIG,
          method: 'GET'
        })
        if (response?.success) {
          this.popupQueueMaxCount = response.data?.config_value || 5
        }
      } catch (error) {
        logger.warn('加载弹窗队列配置失败:', error.message)
      }
    },

    async savePopupQueueConfig() {
      this.saving = true
      try {
        const response = await request({
          url: SYSTEM_ENDPOINTS.AD_POPUP_QUEUE_CONFIG,
          method: 'PUT',
          data: { popup_queue_max_count: this.popupQueueMaxCount }
        })
        if (response?.success) {
          this.showSuccess('弹窗队列配置已保存')
        }
      } catch (error) {
        logger.error('保存弹窗队列配置失败:', error)
        this.showError('保存失败: ' + error.message)
      } finally {
        this.saving = false
      }
    },

    // ==================== 广告活动 ====================
    async loadCampaigns() {
      this.campaignsLoading = true
      try {
        const params = { page: this.campaignPage, page_size: 20 }
        if (this.category_filter) params.category = this.category_filter
        if (this.campaignFilters.status) params.status = this.campaignFilters.status
        if (this.campaignFilters.billing_mode)
          params.billing_mode = this.campaignFilters.billing_mode
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

    openCreateCampaignModal() {
      const today = new Date()
      const nextWeek = new Date(today.getTime() + 7 * 24 * 3600 * 1000)

      const isSystem = this.category_filter === 'system'
      const isOperational = this.category_filter === 'operational'

      this.campaignForm = {
        campaign_name: '',
        campaign_category: this.category_filter || 'commercial',
        ad_slot_id: this.allSlotsList.length > 0 ? this.allSlotsList[0].ad_slot_id : '',
        billing_mode: isSystem || isOperational ? 'free' : 'fixed_daily',
        advertiser_user_id: '',
        daily_bid_diamond: 50,
        budget_total_diamond: 500,
        fixed_days: 7,
        start_date: today.toISOString().slice(0, 10),
        end_date: nextWeek.toISOString().slice(0, 10),
        priority: isSystem ? 950 : isOperational ? 500 : 50,
        frequency_rule: isOperational ? 'once_per_day' : null,
        frequency_value: 1,
        force_show: isSystem,
        internal_notes: '',
        text_content: '',
        content_type: isSystem ? 'text' : 'image',
        display_mode: null
      }
      this.campaignImagePreview = ''
      this.campaignPrimaryMediaId = null
      this.campaignImageUrl = ''
      this.showModal('campaignCreateModal')
    },

    getSelectedSlotInfo() {
      if (!this.campaignForm.ad_slot_id) return null
      return this.allSlotsList.find(s => s.ad_slot_id === Number(this.campaignForm.ad_slot_id))
    },

    async saveCampaign() {
      if (!this.campaignForm.campaign_name?.trim()) {
        this.showError('请输入活动名称')
        return
      }
      if (!this.campaignForm.ad_slot_id) {
        this.showError('请选择广告位')
        return
      }

      const category = this.campaignForm.campaign_category || 'commercial'
      const isFree = category === 'system' || category === 'operational'

      if (!isFree) {
        if (!this.campaignForm.billing_mode) {
          this.showError('请选择计费模式')
          return
        }
        if (this.campaignForm.billing_mode === 'fixed_daily') {
          if (!this.campaignForm.fixed_days || this.campaignForm.fixed_days < 1) {
            this.showError('固定包天模式必须填写天数（≥1天）')
            return
          }
        } else if (this.campaignForm.billing_mode === 'bidding') {
          const slotInfo = this.getSelectedSlotInfo()
          const minBid = slotInfo?.min_bid_diamond || 50
          const minBudget = slotInfo?.min_budget_diamond || 500
          if (
            !this.campaignForm.daily_bid_diamond ||
            this.campaignForm.daily_bid_diamond < minBid
          ) {
            this.showError(`竞价模式每日出价不能低于 ${minBid} 钻石`)
            return
          }
          if (
            !this.campaignForm.budget_total_diamond ||
            this.campaignForm.budget_total_diamond < minBudget
          ) {
            this.showError(`竞价模式总预算不能低于 ${minBudget} 钻石`)
            return
          }
        }
      }

      this.saving = true
      try {
        const data = {
          campaign_name: this.campaignForm.campaign_name.trim(),
          campaign_category: category,
          ad_slot_id: Number(this.campaignForm.ad_slot_id),
          billing_mode: isFree ? 'free' : this.campaignForm.billing_mode,
          priority: Number(this.campaignForm.priority) || 50
        }

        if (this.campaignForm.advertiser_user_id) {
          data.advertiser_user_id = Number(this.campaignForm.advertiser_user_id)
        }

        if (!isFree) {
          if (this.campaignForm.billing_mode === 'fixed_daily') {
            data.fixed_days = Number(this.campaignForm.fixed_days)
          } else {
            data.daily_bid_diamond = Number(this.campaignForm.daily_bid_diamond)
            data.budget_total_diamond = Number(this.campaignForm.budget_total_diamond)
          }
        }

        if (this.campaignForm.start_date) data.start_date = this.campaignForm.start_date
        if (this.campaignForm.end_date) data.end_date = this.campaignForm.end_date

        if (category === 'operational' || category === 'system') {
          if (this.campaignForm.frequency_rule)
            data.frequency_rule = this.campaignForm.frequency_rule
          if (this.campaignForm.frequency_value)
            data.frequency_value = Number(this.campaignForm.frequency_value)
          data.force_show = !!this.campaignForm.force_show
        }
        if (category === 'system' && this.campaignForm.internal_notes) {
          data.internal_notes = this.campaignForm.internal_notes
        }

        // W1+W2: 传递 text_content 和 content_type（AdCreative 模型字段）
        if (this.campaignForm.content_type) {
          data.content_type = this.campaignForm.content_type
        }
        if (this.campaignForm.text_content?.trim()) {
          data.text_content = this.campaignForm.text_content.trim()
        }

        // W5: 传递 display_mode（弹窗显示模式）
        if (this.campaignForm.display_mode) {
          data.display_mode = this.campaignForm.display_mode
        }

        // 传递广告创意图片（ad_creatives 表通过 primary_media_id FK → media_files 关联媒体资源）
        if (this.campaignPrimaryMediaId) {
          data.primary_media_id = this.campaignPrimaryMediaId
        }

        // W4: 根据 category 使用对应的专用创建端点（跳过审核简化流程）
        let createUrl = SYSTEM_ENDPOINTS.AD_CAMPAIGN_CREATE
        if (category === 'operational') {
          createUrl = SYSTEM_ENDPOINTS.AD_CAMPAIGN_OPERATIONAL_CREATE
        } else if (category === 'system') {
          createUrl = SYSTEM_ENDPOINTS.AD_CAMPAIGN_SYSTEM_CREATE
        }

        const response = await request({
          url: createUrl,
          method: 'POST',
          data
        })
        if (response?.success) {
          this.hideModal('campaignCreateModal')
          const typeLabel = this.CATEGORY_MAP[category] || '广告活动'
          this.showSuccess(`${typeLabel}创建成功（草稿状态）`)
          await this.loadCampaigns()
        }
      } catch (error) {
        logger.error('创建广告活动失败:', error)
        this.showError('创建广告活动失败: ' + error.message)
      } finally {
        this.saving = false
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

    /** 发布活动（draft → active，用于 operational/system 类型跳过审核） */
    async publishCampaign(campaign) {
      if (!confirm(`确认发布「${campaign.campaign_name}」？发布后立即投放。`)) return
      this.saving = true
      try {
        const response = await request({
          url: buildURL(SYSTEM_ENDPOINTS.AD_CAMPAIGN_PUBLISH, { id: campaign.ad_campaign_id }),
          method: 'PATCH'
        })
        if (response?.success) {
          this.showSuccess('已发布，开始投放')
          await this.loadCampaigns()
        }
      } catch (error) {
        logger.error('发布失败:', error)
        this.showError('发布失败: ' + error.message)
      } finally {
        this.saving = false
      }
    },

    /** 暂停活动（active → paused） */
    async pauseCampaign(campaign) {
      if (!confirm(`确认暂停「${campaign.campaign_name}」？暂停后停止投放。`)) return
      this.saving = true
      try {
        const response = await request({
          url: buildURL(SYSTEM_ENDPOINTS.AD_CAMPAIGN_PAUSE, { id: campaign.ad_campaign_id }),
          method: 'PATCH'
        })
        if (response?.success) {
          this.showSuccess('已暂停投放')
          await this.loadCampaigns()
        }
      } catch (error) {
        logger.error('暂停失败:', error)
        this.showError('暂停失败: ' + error.message)
      } finally {
        this.saving = false
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
          url: buildURL(SYSTEM_ENDPOINTS.AD_CAMPAIGN_REVIEW, {
            id: this.reviewTarget.ad_campaign_id
          }),
          method: 'PATCH',
          data: {
            action: this.reviewAction,
            review_note: this.reviewNote
          }
        })
        if (response?.success) {
          this.hideModal('reviewModal')
          this.showSuccess(this.reviewAction === 'approve' ? '审核通过' : '审核拒绝')
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
        slot_category: 'display',
        position: 'home',
        max_display_count: 3,
        daily_price_diamond: 100,
        min_bid_diamond: 50,
        min_budget_diamond: 500,
        min_daily_price_diamond: 0,
        cpm_price_diamond: 0,
        zone_id: null,
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
        slot_category: slot.slot_category || 'display',
        position: slot.position,
        max_display_count: slot.max_display_count,
        daily_price_diamond: slot.daily_price_diamond,
        min_bid_diamond: slot.min_bid_diamond,
        min_budget_diamond: slot.min_budget_diamond || 500,
        min_daily_price_diamond: slot.min_daily_price_diamond || 0,
        cpm_price_diamond: slot.cpm_price_diamond || 0,
        zone_id: slot.zone_id || null,
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
    /** 快速设置报表时间范围 */
    setReportRange(days) {
      const today = new Date()
      const start = new Date(today.getTime() - (days - 1) * 24 * 3600 * 1000)
      this.reportFilters.end_date = today.toISOString().slice(0, 10)
      this.reportFilters.start_date = start.toISOString().slice(0, 10)
      this.reportRangeLabel = days === 1 ? '今天' : days + '天'
      this.loadReportOverview()
    },

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
        this.$nextTick(() => this.renderReportDetailChart())
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
        this.$nextTick(() => this.renderReportDetailChart())
      }
    },

    // ==================== Phase 4: 竞价日志 ====================
    async loadBidLogs() {
      this.bidLogsLoading = true
      try {
        const params = { page: this.bidLogsPage, page_size: 20 }
        if (this.bidLogsFilters.ad_campaign_id)
          params.ad_campaign_id = this.bidLogsFilters.ad_campaign_id
        if (this.bidLogsFilters.is_winner) params.is_winner = this.bidLogsFilters.is_winner
        const response = await request({ url: SYSTEM_ENDPOINTS.AD_BID_LOGS, method: 'GET', params })
        if (response?.success) {
          this.bidLogs = response.data?.bid_logs || []
          this.bidLogsPagination = response.data?.pagination || { total: 0, total_pages: 0 }
        }
      } catch (error) {
        logger.error('加载竞价日志失败:', error)
        this.bidLogs = []
      } finally {
        this.bidLogsLoading = false
      }
    },

    // ==================== Phase 5: 用户标签 ====================
    async loadUserAdTags() {
      this.userAdTagsLoading = true
      try {
        const params = { page: this.userAdTagsPage, page_size: 50 }
        if (this.userAdTagsFilters.user_id) params.user_id = this.userAdTagsFilters.user_id
        if (this.userAdTagsFilters.tag_key) params.tag_key = this.userAdTagsFilters.tag_key
        const response = await request({
          url: SYSTEM_ENDPOINTS.AD_USER_TAGS,
          method: 'GET',
          params
        })
        if (response?.success) {
          this.userAdTags = response.data?.user_ad_tags || []
          this.userAdTagsPagination = response.data?.pagination || { total: 0, total_pages: 0 }
        }
      } catch (error) {
        logger.error('加载用户标签失败:', error)
        this.userAdTags = []
      } finally {
        this.userAdTagsLoading = false
      }
    },

    // ==================== Phase 5: 反作弊日志 ====================
    async loadAntifraudLogs() {
      this.antifraudLogsLoading = true
      try {
        const params = { page: this.antifraudPage, page_size: 20 }
        if (this.antifraudFilters.ad_campaign_id)
          params.ad_campaign_id = this.antifraudFilters.ad_campaign_id
        if (this.antifraudFilters.verdict) params.verdict = this.antifraudFilters.verdict
        if (this.antifraudFilters.event_type) params.event_type = this.antifraudFilters.event_type
        const response = await request({
          url: SYSTEM_ENDPOINTS.AD_ANTIFRAUD_LOGS,
          method: 'GET',
          params
        })
        if (response?.success) {
          this.antifraudLogs = response.data?.antifraud_logs || []
          this.antifraudPagination = response.data?.pagination || { total: 0, total_pages: 0 }
        }
      } catch (error) {
        logger.error('加载反作弊日志失败:', error)
        this.antifraudLogs = []
      } finally {
        this.antifraudLogsLoading = false
      }
    },

    // ==================== Phase 6: 归因追踪 ====================
    async loadAttributionLogs() {
      this.attributionLogsLoading = true
      try {
        const params = { page: this.attributionPage, page_size: 20 }
        if (this.attributionFilters.ad_campaign_id)
          params.ad_campaign_id = this.attributionFilters.ad_campaign_id
        if (this.attributionFilters.conversion_type)
          params.conversion_type = this.attributionFilters.conversion_type
        const response = await request({
          url: SYSTEM_ENDPOINTS.AD_ATTRIBUTION_LOGS,
          method: 'GET',
          params
        })
        if (response?.success) {
          this.attributionLogs = response.data?.attribution_logs || []
          this.attributionPagination = response.data?.pagination || { total: 0, total_pages: 0 }
        }
      } catch (error) {
        logger.error('加载归因日志失败:', error)
        this.attributionLogs = []
      } finally {
        this.attributionLogsLoading = false
      }
    },

    // ==================== 调价历史管理 ====================
    async loadPriceAdjustments() {
      this.price_adjustments_loading = true
      try {
        const params = {
          page: this.price_adjustments_page,
          page_size: 20
        }
        if (this.price_adjustments_filter.status) {
          params.status = this.price_adjustments_filter.status
        }
        if (this.price_adjustments_filter.trigger_type) {
          params.trigger_type = this.price_adjustments_filter.trigger_type
        }

        const response = await request({
          url:
            SYSTEM_ENDPOINTS.AD_PRICE_ADJUSTMENT_LIST +
            '?' +
            new URLSearchParams(params).toString(),
          method: 'GET'
        })
        if (response?.success) {
          this.price_adjustments = response.data?.rows || []
          this.price_adjustments_pagination = {
            total: response.data?.count || 0,
            total_pages: Math.ceil((response.data?.count || 0) / 20)
          }
        }
      } catch (error) {
        logger.error('加载调价历史失败:', error)
        this.price_adjustments = []
      } finally {
        this.price_adjustments_loading = false
      }
    },

    async confirmAdjustment(adjustmentId) {
      if (!confirm('确认执行此调价建议？')) return
      try {
        const url = SYSTEM_ENDPOINTS.AD_PRICE_ADJUSTMENT_CONFIRM.replace(':id', adjustmentId)
        const response = await request({ url, method: 'POST' })
        if (response?.success) {
          Alpine.store('notification').show('调价建议已确认', 'success')
          await this.loadPriceAdjustments()
        }
      } catch (error) {
        logger.error('确认调价失败:', error)
        Alpine.store('notification').show('确认调价失败: ' + error.message, 'error')
      }
    },

    async rejectAdjustment(adjustmentId) {
      if (!confirm('确认拒绝此调价建议？')) return
      try {
        const url = SYSTEM_ENDPOINTS.AD_PRICE_ADJUSTMENT_REJECT.replace(':id', adjustmentId)
        const response = await request({ url, method: 'POST' })
        if (response?.success) {
          Alpine.store('notification').show('调价建议已拒绝', 'success')
          await this.loadPriceAdjustments()
        }
      } catch (error) {
        logger.error('拒绝调价失败:', error)
        Alpine.store('notification').show('拒绝调价失败: ' + error.message, 'error')
      }
    },

    async applyAdjustment(adjustmentId) {
      if (!confirm('确认执行此调价？执行后将更新系统定价配置。')) return
      try {
        const url = SYSTEM_ENDPOINTS.AD_PRICE_ADJUSTMENT_APPLY.replace(':id', adjustmentId)
        const response = await request({ url, method: 'POST' })
        if (response?.success) {
          Alpine.store('notification').show('调价已执行', 'success')
          await this.loadPriceAdjustments()
        }
      } catch (error) {
        logger.error('执行调价失败:', error)
        Alpine.store('notification').show('执行调价失败: ' + error.message, 'error')
      }
    },

    async renderReportDetailChart() {
      const report = this.reportDetailType === 'campaign' ? this.campaignReport : this.slotReport
      if (!report?.daily_snapshots?.length) return
      const container = document.getElementById('reportDetailChart')
      if (!container) return
      try {
        const echarts = await loadECharts()
        let chart = echarts.getInstanceByDom(container)
        if (!chart) chart = echarts.init(container)
        const days = report.daily_snapshots.map(s => s.snapshot_date)
        chart.setOption({
          tooltip: { trigger: 'axis' },
          legend: { data: ['曝光', '点击', '转化'] },
          grid: { left: 50, right: 20, top: 40, bottom: 30 },
          xAxis: { type: 'category', data: days },
          yAxis: { type: 'value' },
          series: [
            {
              name: '曝光',
              type: 'bar',
              data: report.daily_snapshots.map(s => s.impressions_total || 0),
              itemStyle: { color: '#6366f1' }
            },
            {
              name: '点击',
              type: 'line',
              data: report.daily_snapshots.map(s => s.clicks_total || 0),
              itemStyle: { color: '#10b981' }
            },
            {
              name: '转化',
              type: 'line',
              data: report.daily_snapshots.map(s => s.conversions || 0),
              itemStyle: { color: '#f59e0b' }
            }
          ]
        })
      } catch (error) {
        logger.warn('渲染报表图表失败:', error.message)
      }
    },

    // ==================== 计费流水（billing_no 展示） ====================
    async loadBillingRecords() {
      this.billing_records_loading = true
      try {
        const params = { page: this.billing_records_page, page_size: 20 }
        if (this.billing_records_filter.billing_type) {
          params.billing_type = this.billing_records_filter.billing_type
        }
        if (this.billing_records_filter.ad_campaign_id) {
          params.ad_campaign_id = this.billing_records_filter.ad_campaign_id
        }
        const response = await request({
          url: SYSTEM_ENDPOINTS.AD_BILLING_RECORDS,
          method: 'GET',
          params
        })
        if (response?.success) {
          this.billing_records = response.data?.billing_records || []
          this.billing_records_pagination = response.data?.pagination || {
            total: 0,
            total_pages: 0
          }
        }
      } catch (error) {
        logger.error('加载计费流水失败:', error)
        this.billing_records = []
      } finally {
        this.billing_records_loading = false
      }
    },

    /** 计费流水翻页 */
    billingRecordsGoPage(p) {
      if (p < 1 || p > (this.billing_records_pagination.total_pages || 1)) return
      this.billing_records_page = p
      this.loadBillingRecords()
    },

    /** 计费流水筛选 */
    filterBillingRecords() {
      this.billing_records_page = 1
      this.loadBillingRecords()
    },

    /** 计费类型中文 */
    billingTypeText(type) {
      return this.BILLING_TYPE_MAP[type] || type || '-'
    }
  }))

  logger.info('[AdManagement] Alpine 组件已注册')
})

logger.info('[AdManagement] 页面脚本已加载')
