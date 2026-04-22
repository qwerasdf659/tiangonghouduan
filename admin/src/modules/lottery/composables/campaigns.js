/**
 * 活动管理模块
 *
 * @file admin/src/modules/lottery/composables/campaigns.js
 * @description 抽奖活动的 CRUD 操作和状态管理
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery/index.js'
import { MERCHANT_ENDPOINTS } from '../../../api/merchant.js'
import { API_PREFIX } from '../../../api/base.js'

/**
 * 活动管理状态
 * @returns {Object} 状态对象
 */
export function useCampaignsState() {
  return {
    /** @type {Array} 活动列表 */
    campaigns: [],
    /** @type {Object} 活动统计 */
    campaignStats: { total: 0, active: 0, today_participants: 0, today_winners: 0 },
    /** @type {Object|null} 全局默认配置（从 system_settings 读取，用于优先级可视化提示） */
    globalDefaults: null,
    /** @type {Array} 可用的分群策略版本列表（动态从后端加载） */
    availableSegmentVersions: [{ version_key: 'default', description: '默认版本' }],
    /** @type {Object} 活动筛选条件 */
    campaignFilters: { status: '', keyword: '', merchant_id: '' },
    /** @type {Array} 商家下拉选项列表（来自 /api/v4/console/merchants/options） */
    campaignMerchantOptions: [],
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
      // 抽奖配置（后端必填，定价通过 pricing_config 管理，创建活动时自动生成默认定价）
      max_draws_per_user_daily: 3,
      max_draws_per_user_total: null,
      // ======== 抽奖引擎核心配置（pipeline 路径分叉参数） ========
      /** 选奖方法：tier_first=先选档位再选奖品 / normalize=归一化百分比选奖 */
      pick_method: 'tier_first',
      /** 预算模式：user=用户预算扣减 / pool=活动池预算扣减 / none=不限制（测试用） */
      budget_mode: 'user',
      /** 预设预算策略：follow_campaign=遵循budget_mode / pool_first=先pool后user / user_first=先user后pool */
      preset_budget_policy: 'follow_campaign',
      /** 默认用户配额（pool+quota模式按需初始化时使用） */
      default_quota: 0,
      /** 配额初始化模式：on_demand=按需初始化 / pre_allocated=预分配 */
      quota_init_mode: 'on_demand',
      /** 档位权重比例因子（系统常量，所有档位权重之和必须等于此值） */
      tier_weight_scale: 1000000,
      // 奖池配置
      total_prize_pool: 10000,
      remaining_prize_pool: 10000,
      // 状态和规则
      status: 'draft',
      rules_text: '',
      // ======== 前端展示配置（多活动抽奖系统 2026-02-15） ========
      /** 前端展示方式（15种玩法） */
      display_mode: 'grid_4x3',
      /** 网格列数（仅 grid 模式有效） */
      grid_cols: 4,
      /** 特效主题（6套） */
      effect_theme: 'default',
      /** 是否启用稀有度光效 */
      rarity_effects_enabled: true,
      /** 中奖动画类型 */
      win_animation: 'simple',
      /** 活动背景图URL */
      background_image_url: null
      // guarantee_enabled/threshold/lottery_prize_id 已迁移到策略开关页面管理
    },
    /** @type {Array} 活动类型选项 */
    campaignTypeOptions: [
      { value: 'daily', label: '每日抽奖' },
      { value: 'weekly', label: '每周抽奖' },
      { value: 'event', label: '活动抽奖' },
      { value: 'permanent', label: '常驻抽奖' }
    ],
    /** @type {Array} 玩法类型选项（14种，对应 display_mode 字段） */
    displayModeOptions: [
      { value: 'grid_3x3', label: '九宫格 3×3（8奖品）', icon: '🎰' },
      { value: 'grid_4x3', label: '网格 4×3（12奖品）', icon: '🎰' },
      { value: 'grid_4x4', label: '网格 4×4（16奖品）', icon: '🎰' },
      { value: 'wheel', label: '转盘', icon: '🎡' },
      { value: 'card_flip', label: '卡牌翻转', icon: '🃏' },
      { value: 'golden_egg', label: '砸金蛋', icon: '🥚' },
      { value: 'scratch_card', label: '刮刮卡', icon: '🎫' },
      { value: 'blind_box', label: '虚拟盲盒', icon: '📦' },
      { value: 'gashapon', label: '扭蛋机', icon: '🎱' },
      { value: 'lucky_bag', label: '福袋', icon: '🎒' },
      { value: 'red_packet', label: '拆红包', icon: '🧧' },
      { value: 'slot_machine', label: '老虎机', icon: '🎰' },
      { value: 'whack_mole', label: '打地鼠', icon: '🔨' },
      { value: 'pinball', label: '弹珠机', icon: '🎯' },
      { value: 'card_collect', label: '集卡', icon: '🃏' },
      { value: 'flash_sale', label: '限时秒杀', icon: '⚡' }
    ],
    /** @type {Array} 特效主题选项（6套，对应 effect_theme 字段） */
    effectThemeOptions: [
      { value: 'default', label: '默认', primary: '#e67e22', secondary: '#ffffff' },
      { value: 'gold_luxury', label: '金色奢华', primary: '#f1c40f', secondary: '#2c3e50' },
      { value: 'purple_mystery', label: '紫色神秘', primary: '#9b59b6', secondary: '#2c3e50' },
      { value: 'spring_festival', label: '春节红色', primary: '#e74c3c', secondary: '#f1c40f' },
      { value: 'christmas', label: '圣诞绿色', primary: '#27ae60', secondary: '#e74c3c' },
      { value: 'summer', label: '夏日清凉', primary: '#3498db', secondary: '#ffffff' }
    ],
    /** @type {Array} 中奖动画选项（3种，对应 win_animation 字段） */
    winAnimationOptions: [
      { value: 'simple', label: '简单弹窗' },
      { value: 'card_flip', label: '卡牌翻转' },
      { value: 'fireworks', label: '烟花特效' }
    ],
    /** @type {Array} 预算模式选项（对应 budget_mode 字段） */
    budgetModeOptions: [
      { value: 'user', label: '用户预算', desc: '从用户预算账户扣减' },
      { value: 'pool', label: '活动池预算', desc: '从活动池预算扣减' },
      { value: 'none', label: '不限制（测试用）', desc: '无预算限制，仅用于测试' }
    ],
    /** @type {Array} 预设预算策略选项（对应 preset_budget_policy 字段） */
    presetBudgetPolicyOptions: [
      { value: 'follow_campaign', label: '遵循活动预算模式', desc: '跟随 budget_mode 设置' },
      { value: 'pool_first', label: '先扣活动池后扣用户', desc: '优先使用活动池预算' },
      { value: 'user_first', label: '先扣用户后扣活动池', desc: '优先使用用户预算' }
    ],
    /** @type {Array} 配额初始化模式选项（对应 quota_init_mode 字段） */
    quotaInitModeOptions: [
      { value: 'on_demand', label: '按需初始化', desc: '用户首次参与时创建配额' },
      { value: 'pre_allocated', label: '预分配', desc: '管理员批量导入配额' }
    ],
    /** @type {number|string|null} 当前编辑的活动ID */
    editingCampaignId: null,
    /** @type {Object|null} 选中的活动 */
    selectedCampaign: null,

    // ========== P3新增: 活动ROI分析状态 ==========
    /** @type {Object|null} 活动ROI分析数据 */
    campaignRoiData: null,
    /** @type {boolean} ROI分析加载状态 */
    loadingCampaignRoi: false,
    /** @type {boolean} 显示ROI分析模态框 */
    showCampaignRoiModal: false
  }
}

/**
 * 活动管理方法
 * @param {Object} context - 组件上下文 (this)
 * @returns {Object} 方法对象
 */
export function useCampaignsMethods(_context) {
  return {
    /**
     * 加载全局默认配置（从 system_settings 读取）
     *
     * 业务场景：在活动编辑弹窗中显示"当前全局默认值 → 10次/日"等参考信息，
     * 帮助运营理解配置优先级：活动级配置 > 全局配置
     */
    async loadGlobalDefaults() {
      try {
        const response = await this.apiGet(LOTTERY_ENDPOINTS.CAMPAIGN_GLOBAL_DEFAULTS)
        const data = response?.success ? response.data : response
        if (data?.global_defaults) {
          this.globalDefaults = data.global_defaults
          logger.debug('[Campaigns] 全局默认配置已加载:', this.globalDefaults)
        }
      } catch (error) {
        logger.warn('[Campaigns] 加载全局默认配置失败（非致命）:', error.message)
      }
    },

    /**
     * 加载商家下拉选项（供活动列表按商家筛选使用）
     * 后端返回：[{ merchant_id, merchant_name, merchant_type }]
     */
    async loadCampaignMerchantOptions() {
      try {
        const response = await this.apiGet(MERCHANT_ENDPOINTS.OPTIONS, {}, { showLoading: false })
        const data = response?.success ? response.data : response
        this.campaignMerchantOptions = Array.isArray(data) ? data : []
        logger.debug('[Campaigns] 商家选项加载完成', { count: this.campaignMerchantOptions.length })
      } catch (error) {
        logger.warn('[Campaigns] 加载商家选项失败', error)
        this.campaignMerchantOptions = []
      }
    },

    /**
     * 加载活动列表
     * @description apiGet 返回的是 response.data（已解包），不是完整响应对象
     */
    async loadCampaigns() {
      try {
        logger.debug('📋 [Campaigns] loadCampaigns 开始执行')
        const params = new URLSearchParams()
        params.append('page', this.page)
        params.append('page_size', this.page_size)
        if (this.campaignFilters.status) {
          params.append('status', this.campaignFilters.status)
        }
        if (this.campaignFilters.keyword) {
          params.append('keyword', this.campaignFilters.keyword)
        }
        if (this.campaignFilters.merchant_id) {
          params.append('merchant_id', this.campaignFilters.merchant_id)
        }

        // apiGet 通过 withLoading 包装，返回 { success: true, data: {...} }
        const response = await this.apiGet(
          `${LOTTERY_ENDPOINTS.CAMPAIGN_LIST}?${params}`,
          {},
          { showLoading: false }
        )
        logger.debug('📋 [Campaigns] API 返回数据:', response)

        // 解包 withLoading 返回的结构: { success: true, data: { campaigns: [...] } }
        const data = response?.success ? response.data : response
        logger.debug('📋 [Campaigns] 解包后数据:', data)

        if (data) {
          this.campaigns = data.campaigns || data.list || []
          // 更新分页信息
          if (data.pagination) {
            this.total_pages = data.pagination.total_pages || 1
            this.totalCount = data.pagination.total || 0
          }
          logger.debug(
            '✅ [Campaigns] 数据加载完成, campaigns:',
            this.campaigns.length,
            'total:',
            this.totalCount
          )
        }
      } catch (error) {
        logger.error('❌ [Campaigns] loadCampaigns 失败:', error)
        this.campaigns = []
      }
    },

    /**
     * 加载可用的分群策略版本列表（供活动编辑下拉选择）
     */
    async loadAvailableSegmentVersions() {
      try {
        const response = await this.apiGet(
          `${API_PREFIX}/console/segment-rules`,
          {},
          { showLoading: false }
        )
        const data = response?.success ? response.data : response
        const configs = data?.configs || data || []
        this.availableSegmentVersions = configs.map(c => ({
          version_key: c.version_key || c.config_key,
          description: c.description || c.version_key || '未命名'
        }))
        if (this.availableSegmentVersions.length === 0) {
          this.availableSegmentVersions = [{ version_key: 'default', description: '默认版本' }]
        }
      } catch (error) {
        logger.warn('[Campaigns] 加载分群策略版本失败（使用默认列表）:', error.message)
        this.availableSegmentVersions = [{ version_key: 'default', description: '默认版本' }]
      }
    },

    /**
     * 加载活动统计数据
     */
    async loadCampaignStats() {
      this.campaignStats = {
        total: this.campaigns.length,
        active: this.campaigns.filter(c => c.status === 'active').length,
        today_participants: 0,
        today_winners: 0
      }
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
        campaign_code: '',
        campaign_type: 'event',
        description: '',
        start_time: this.formatDateTimeLocal(startTime),
        end_time: this.formatDateTimeLocal(endTime),
        max_draws_per_user_daily: 3,
        max_draws_per_user_total: null,
        total_prize_pool: 10000,
        remaining_prize_pool: 10000,
        status: 'draft',
        rules_text: '',
        // 抽奖引擎核心配置
        pick_method: 'tier_first',
        budget_mode: 'user',
        preset_budget_policy: 'follow_campaign',
        default_quota: 0,
        quota_init_mode: 'on_demand',
        tier_weight_scale: 1000000,
        // 展示配置默认值
        display_mode: 'grid_4x3',
        grid_cols: 4,
        effect_theme: 'default',
        rarity_effects_enabled: true,
        win_animation: 'simple',
        background_image_url: null
      }
      this.showModal('campaignModal')
    },

    /**
     * 编辑活动
     * 通过 system-data 详情接口获取完整数据（含关联奖品），用于保底奖品下拉
     * @param {Object} campaign - 活动列表中的活动对象
     */
    async editCampaign(campaign) {
      this.editingCampaignId = campaign.lottery_campaign_id
      this.isEditMode = true

      // 通过 system-data 详情接口获取完整活动数据（含 prizes 关联）
      let fullCampaign = campaign
      try {
        const detailUrl = `${LOTTERY_ENDPOINTS.CAMPAIGN_CREATE}/${campaign.lottery_campaign_id}`
        const response = await this.apiGet(detailUrl, {}, { showLoading: false })
        const data = response?.success ? response.data : response
        if (data) {
          fullCampaign = data
        }
      } catch (error) {
        logger.warn('获取活动详情失败，使用列表数据:', error.message)
      }

      this.campaignForm = {
        campaign_name: fullCampaign.campaign_name || '',
        campaign_code: fullCampaign.campaign_code || '',
        campaign_type: fullCampaign.campaign_type || 'event',
        description: fullCampaign.description || '',
        start_time: this.formatDateTimeLocal(fullCampaign.start_time),
        end_time: this.formatDateTimeLocal(fullCampaign.end_time),
        max_draws_per_user_daily: fullCampaign.max_draws_per_user_daily || 3,
        max_draws_per_user_total: fullCampaign.max_draws_per_user_total || null,
        total_prize_pool: fullCampaign.total_prize_pool || 10000,
        remaining_prize_pool: fullCampaign.remaining_prize_pool || 10000,
        status: fullCampaign.status || 'draft',
        rules_text: fullCampaign.rules_text || '',
        // 抽奖引擎核心配置
        pick_method: fullCampaign.pick_method || 'tier_first',
        budget_mode: fullCampaign.budget_mode || 'user',
        preset_budget_policy: fullCampaign.preset_budget_policy || 'follow_campaign',
        default_quota: fullCampaign.default_quota ?? 0,
        quota_init_mode: fullCampaign.quota_init_mode || 'on_demand',
        tier_weight_scale: fullCampaign.tier_weight_scale ?? 1000000,
        // 展示配置
        display_mode: fullCampaign.display_mode || 'grid_3x3',
        grid_cols: fullCampaign.grid_cols || 3,
        effect_theme: fullCampaign.effect_theme || 'default',
        rarity_effects_enabled: fullCampaign.rarity_effects_enabled !== false,
        win_animation: fullCampaign.win_animation || 'simple',
        background_image_url: fullCampaign.background_image_url || null
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
      if (!this.campaignForm.campaign_type) {
        this.showError('请选择活动类型')
        return
      }
      if (!this.campaignForm.start_time || !this.campaignForm.end_time) {
        this.showError('请设置活动时间')
        return
      }
      try {
        this.saving = true

        // 使用正确的后端 CRUD 端点（system-data 路由）
        const url = this.isEditMode
          ? `${LOTTERY_ENDPOINTS.CAMPAIGN_CREATE}/${this.editingCampaignId}`
          : LOTTERY_ENDPOINTS.CAMPAIGN_CREATE

        // 构建请求数据 - 直接使用后端 snake_case 字段名
        // campaign_code 由后端 CampaignCodeGenerator 自动生成，前端不传
        const requestData = {
          campaign_name: this.campaignForm.campaign_name,
          campaign_type: this.campaignForm.campaign_type,
          description: this.campaignForm.description || '',
          start_time: this.campaignForm.start_time,
          end_time: this.campaignForm.end_time,
          max_draws_per_user_daily: parseInt(this.campaignForm.max_draws_per_user_daily) || 3,
          max_draws_per_user_total: this.campaignForm.max_draws_per_user_total
            ? parseInt(this.campaignForm.max_draws_per_user_total)
            : null,
          total_prize_pool: parseFloat(this.campaignForm.total_prize_pool) || 10000,
          remaining_prize_pool: parseFloat(this.campaignForm.remaining_prize_pool) || 10000,
          status: this.campaignForm.status || 'draft',
          rules_text: this.campaignForm.rules_text || '',
          prize_distribution_config: {
            tiers: [
              { tier_id: 1, tier_name: '特等奖', weight: 1000 },
              { tier_id: 2, tier_name: '一等奖', weight: 9000 },
              { tier_id: 3, tier_name: '二等奖', weight: 90000 },
              { tier_id: 4, tier_name: '三等奖', weight: 400000 },
              { tier_id: 5, tier_name: '谢谢参与', weight: 500000 }
            ]
          },
          // ======== 抽奖引擎核心配置 ========
          pick_method: this.campaignForm.pick_method || 'tier_first',
          budget_mode: this.campaignForm.budget_mode || 'user',
          preset_budget_policy: this.campaignForm.preset_budget_policy || 'follow_campaign',
          default_quota: parseFloat(this.campaignForm.default_quota) || 0,
          quota_init_mode: this.campaignForm.quota_init_mode || 'on_demand',
          tier_weight_scale: parseInt(this.campaignForm.tier_weight_scale) || 1000000,
          // ======== 前端展示配置 ========
          display_mode: this.campaignForm.display_mode || 'grid_3x3',
          grid_cols: parseInt(this.campaignForm.grid_cols) || 3,
          effect_theme: this.campaignForm.effect_theme || 'default',
          rarity_effects_enabled: this.campaignForm.rarity_effects_enabled !== false,
          win_animation: this.campaignForm.win_animation || 'simple',
          background_image_url: this.campaignForm.background_image_url || null
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
          // 使用 system-data 路由删除活动
          await this.apiCall(
            `${LOTTERY_ENDPOINTS.CAMPAIGN_CREATE}/${campaign.lottery_campaign_id}`,
            {
              method: 'DELETE'
            }
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
          // 使用 system-data 路由更新活动状态
          await this.apiCall(
            `${LOTTERY_ENDPOINTS.CAMPAIGN_CREATE}/${campaign.lottery_campaign_id}/status`,
            {
              method: 'PUT',
              data: { status: newStatus }
            }
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
        draft: 'bg-gray-100 text-gray-700',
        active: 'bg-green-100 text-green-700',
        paused: 'bg-yellow-100 text-yellow-700',
        ended: 'bg-gray-200 text-gray-600',
        cancelled: 'bg-red-100 text-red-700'
      }
      return map[status] || 'bg-gray-100 text-gray-600'
    },

    // ✅ 已删除 getCampaignStatusText 映射函数
    // 中文显示名称由后端 attachDisplayNames 统一返回 status_display 字段

    // ========== P3新增: 活动ROI分析方法 ==========

    /**
     * 加载活动ROI分析数据
     * @param {number} campaignId - 活动ID
     */
    async loadCampaignRoiData(campaignId) {
      if (!campaignId) {
        logger.warn('[Campaigns] 未指定活动ID')
        return
      }

      this.loadingCampaignRoi = true
      try {
        logger.info('[Campaigns] 加载活动ROI分析', { campaign_id: campaignId })

        const url = `${LOTTERY_ENDPOINTS.MONITORING_CAMPAIGN_ROI}`.replace(
          ':campaign_id',
          campaignId
        )

        const response = await this.apiGet(url, {}, { showLoading: false })

        const data = response?.success ? response.data : response

        if (data) {
          // 转换 tier_cost_breakdown：后端返回对象 { high: 100, mid: 50 }，前端需要数组
          const rawTierCost = data.tier_cost_breakdown || {}
          const totalCostSum = Object.values(rawTierCost).reduce((s, v) => s + v, 0)
          const tierCostArray = Object.entries(rawTierCost)
            .filter(([, cost]) => cost > 0)
            .map(([tier, total_cost]) => ({
              tier,
              total_cost,
              count: 0, // 后端未返回此字段
              unit_cost: 0, // 后端未返回此字段
              percentage: totalCostSum > 0 ? (total_cost / totalCostSum) * 100 : 0
            }))

          this.campaignRoiData = {
            ...data,
            tier_cost_breakdown: tierCostArray,
            lottery_campaign_id: campaignId,
            campaign_name:
              this.campaigns.find(c => c.lottery_campaign_id === campaignId)?.campaign_name ||
              '未知活动'
          }
          logger.info('[Campaigns] ROI分析数据加载成功')
        }
      } catch (error) {
        logger.error('[Campaigns] 加载ROI分析失败:', error)
        this.showError('加载ROI分析失败: ' + (error.message || '未知错误'))
      } finally {
        this.loadingCampaignRoi = false
      }
    },

    /**
     * 打开活动ROI分析模态框
     * @param {Object} campaign - 活动对象
     */
    async openCampaignRoiModal(campaign) {
      this.selectedCampaign = campaign
      await this.loadCampaignRoiData(campaign.lottery_campaign_id)
      this.showCampaignRoiModal = true
    },

    /**
     * 关闭活动ROI分析模态框
     */
    closeCampaignRoiModal() {
      this.showCampaignRoiModal = false
      this.campaignRoiData = null
    },

    /**
     * 格式化ROI值
     * @param {number} value - ROI百分比
     * @returns {string} 格式化后的字符串
     */
    formatRoiValue(value) {
      if (value === null || value === undefined) return '-'
      const sign = value >= 0 ? '+' : ''
      return `${sign}${value.toFixed(1)}%`
    },

    /**
     * 获取ROI颜色类
     * @param {number} value - ROI百分比
     * @returns {string} CSS 类名
     */
    getRoiColorClass(value) {
      if (value === null || value === undefined) return 'text-gray-500'
      if (value > 10) return 'text-green-600'
      if (value > 0) return 'text-green-500'
      if (value > -10) return 'text-yellow-600'
      return 'text-red-600'
    },

    // ===== Phase 3：活动展示控制 =====

    /**
     * 切换活动精选状态
     * @param {Object} campaign - 活动对象
     */
    async toggleCampaignFeatured(campaign) {
      try {
        const { LotteryCoreAPI } = await import('../../../api/lottery/core.js')
        const res = await LotteryCoreAPI.toggleCampaignFeatured(
          campaign.lottery_campaign_id,
          !campaign.is_featured
        )
        if (res.success) {
          this.showSuccess?.(res.data?.is_featured ? '活动已设为精选' : '已取消精选')
          await this.loadCampaigns()
        } else {
          this.showError?.(res.message || '操作失败')
        }
      } catch (e) {
        logger.error('[Campaigns] 切换精选状态失败:', e)
        this.showError?.('操作失败')
      }
    },

    /**
     * 切换活动隐藏状态
     * @param {Object} campaign - 活动对象
     */
    async toggleCampaignHidden(campaign) {
      try {
        const { LotteryCoreAPI } = await import('../../../api/lottery/core.js')
        const res = await LotteryCoreAPI.toggleCampaignHidden(
          campaign.lottery_campaign_id,
          !campaign.is_hidden
        )
        if (res.success) {
          this.showSuccess?.(res.data?.is_hidden ? '活动已隐藏' : '已取消隐藏')
          await this.loadCampaigns()
        } else {
          this.showError?.(res.message || '操作失败')
        }
      } catch (e) {
        logger.error('[Campaigns] 切换隐藏状态失败:', e)
        this.showError?.('操作失败')
      }
    },

    /**
     * 批量更新活动排序
     * @param {Array<{lottery_campaign_id: number, sort_order: number}>} sortItems - 排序数组
     */
    async batchSortCampaigns(sortItems) {
      if (!Array.isArray(sortItems) || sortItems.length === 0) return
      try {
        const { LotteryCoreAPI } = await import('../../../api/lottery/core.js')
        const res = await LotteryCoreAPI.batchSortCampaigns(sortItems)
        if (res.success) {
          this.showSuccess?.(`已更新 ${res.data?.updated_count || sortItems.length} 个活动排序`)
          await this.loadCampaigns()
        } else {
          this.showError?.(res.message || '批量排序失败')
        }
      } catch (e) {
        logger.error('[Campaigns] 批量排序失败:', e)
        this.showError?.('批量排序失败')
      }
    }
  }
}

export default { useCampaignsState, useCampaignsMethods }
