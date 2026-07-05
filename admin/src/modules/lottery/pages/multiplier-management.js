/**
 * 水晶奖品倍率活动管理页面 - Alpine.js 组件
 *
 * @file admin/src/modules/lottery/pages/multiplier-management.js
 * @description 倍率规则 CRUD（含人群选择器/成本水位）+ 活动预算归集规则 CRUD（Tab 切换）
 * @version 1.0.0
 * @date 2026-07-06
 *
 * @requires Alpine.js
 * @requires createPageMixin - 页面基础功能混入
 * @requires MultiplierAPI - 水晶倍率活动 API
 *
 * 后端路由（snake_case 契约，字段直连不做映射）：
 * - /api/v4/console/multiplier-rules（CRUD + :id/cost）
 * - /api/v4/console/lottery-campaigns/:id/segment-options（分群选项）
 * - /api/v4/console/lottery-management/growth-levels（成长等级选项）
 * - /api/v4/console/ad-tags（标签选项）
 * - /api/v4/console/event-budget-collection-rules（归集规则 CRUD）
 */

import { logger } from '../../../utils/index.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { MultiplierAPI } from '../../../api/lottery/multiplier.js'
import { LotteryCoreAPI } from '../../../api/lottery/core.js'
import { loadECharts } from '../../../utils/echarts-lazy.js'

/** 规则状态中文映射（语义化颜色：绿=生效、灰=停用） */
const STATUS_MAP = {
  active: { label: '生效中', color: 'bg-green-100 text-green-700' },
  inactive: { label: '已停用', color: 'bg-gray-100 text-gray-700' }
}

/** 作用人群类型中文映射 */
const TARGET_TYPE_MAP = {
  all: '全体用户',
  segment: '分群定向',
  tag: '标签定向',
  growth_level: '成长等级定向',
  user: '指定用户'
}

/** 作用奖品范围中文映射 */
const REWARD_SCOPE_MAP = {
  crystal_all: '全部水晶',
  group: '指定色系',
  asset_codes: '指定资产码'
}

/** 取整方式中文映射 */
const ROUNDING_MODE_OPTIONS = [
  { value: 'ceil', label: '向上取整（ceil，默认偏体感）' },
  { value: 'round', label: '四舍五入（round）' },
  { value: 'floor', label: '向下取整（floor）' }
]

/** 倍率规则空表单 */
function getEmptyRuleForm() {
  return {
    lottery_campaign_id: '',
    campaign_name: '',
    display_name: '',
    multiplier: 2.0,
    reward_scope: 'crystal_all',
    scope_values_text: '',
    target_type: 'all',
    targets: [],
    rounding_mode: 'ceil',
    priority: 0,
    max_multiplier_cap: 3.0,
    extra_cost_limit: null,
    per_user_daily_limit: null,
    eligibility_days: null,
    per_user_extra_cap: null,
    start_at: '',
    end_at: '',
    status: 'inactive',
    remark: ''
  }
}

/** 归集规则空表单 */
function getEmptyCollectionForm() {
  return {
    lottery_campaign_id: '',
    rule_name: '',
    store_ids_text: '',
    merchant_ids_text: '',
    event_points_ratio: 1.0,
    start_at: '',
    end_at: '',
    priority: 0,
    status: 'inactive',
    remark: ''
  }
}

/**
 * 把逗号分隔文本解析为数字数组（空文本 → null，即"不限"）
 * @param {string} text - 逗号分隔的 ID 文本
 * @returns {Array<number>|null} 数字数组或 null
 */
function parseIdListText(text) {
  const trimmed = (text || '').trim()
  if (!trimmed) return null
  return trimmed
    .split(/[,，\s]+/)
    .filter(Boolean)
    .map(v => parseInt(v, 10))
    .filter(v => !isNaN(v))
}

document.addEventListener('alpine:init', () => {
  Alpine.data('multiplierManagementPage', () => ({
    ...createPageMixin(),

    // ========== Tab ==========
    active_tab: 'rules', // rules=倍率规则 / collection=归集规则

    // ========== 公共数据 ==========
    campaigns: [], // 抽奖活动列表（选择器数据源）
    growth_levels: [], // 成长等级选项
    ad_tags: [], // 标签选项（可能为空）
    segment_options: [], // 当前所选活动的分群选项（随活动切换加载）

    // ========== 倍率规则列表 ==========
    rules: [],
    rules_loading: false,
    rules_error: '',
    filter_campaign_id: '',
    filter_status: '',
    pagination: { page: 1, page_size: 20, total: 0 },

    // ========== 倍率规则表单 ==========
    show_rule_form: false,
    is_editing_rule: false,
    editing_rule_id: null,
    rule_form: getEmptyRuleForm(),
    segment_options_loading: false,

    // ========== 成本水位弹窗 ==========
    show_cost_modal: false,
    cost_loading: false,
    cost_data: null,

    // ========== 归集规则列表 ==========
    collection_rules: [],
    collection_loading: false,
    collection_error: '',
    collection_pagination: { page: 1, page_size: 20, total: 0 },

    // ========== 归集规则表单 ==========
    show_collection_form: false,
    is_editing_collection: false,
    editing_collection_id: null,
    collection_form: getEmptyCollectionForm(),

    // ========== 监控看板（§13.2/§13.4） ==========
    _echarts: null, // ECharts 实例（懒加载）
    monitor_loading: false,
    monitor_error: '',
    monitor_trend_days: 30, // 趋势窗口天数
    event_points_overview: null, // 活动积分概览（发放/消耗/在途/清零/持有人数）
    budget_distribution: null, // 个人活动账户余额分布（防套利监控）
    expiry_history: null, // 到期清零执行历史（运维视图）
    _trendChart: null, // 活动积分趋势图实例
    _distChart: null, // 余额分布图实例

    // ========== 客服查询（§13.3 "为什么翻/没翻"） ==========
    explain_user_id: '',
    explain_campaign_id: '',
    explain_loading: false,
    explain_error: '',
    explain_result: null,

    // ========== 计算属性（单一分页状态 + getter 自动计算） ==========
    get total_pages() {
      return Math.ceil(this.pagination.total / this.pagination.page_size) || 1
    },
    get has_prev_page() {
      return this.pagination.page > 1
    },
    get has_next_page() {
      return this.pagination.page < this.total_pages
    },
    get collection_total_pages() {
      return Math.ceil(this.collection_pagination.total / this.collection_pagination.page_size) || 1
    },
    get collection_has_prev_page() {
      return this.collection_pagination.page > 1
    },
    get collection_has_next_page() {
      return this.collection_pagination.page < this.collection_total_pages
    },

    // ========== 初始化 ==========
    async init() {
      logger.info('[MultiplierManagement] 初始化...')
      await Promise.all([this.loadCampaigns(), this.loadGrowthLevels(), this.loadAdTags()])
      await this.loadRules()
    },

    /** 切换 Tab（首次进入对应 Tab 时按需加载数据） */
    async switchTab(tab) {
      this.active_tab = tab
      if (tab === 'collection' && this.collection_rules.length === 0 && !this.collection_loading) {
        await this.loadCollectionRules()
      }
      if (tab === 'monitor' && !this.event_points_overview && !this.monitor_loading) {
        await this.loadMonitor()
      }
    },

    // ========== 监控看板（§13.2/§13.4） ==========

    /** 加载监控看板数据（概览 + 趋势 + 余额分布 + 到期清零历史）并渲染 ECharts */
    async loadMonitor() {
      this.monitor_loading = true
      this.monitor_error = ''
      try {
        const [overviewRes, trendRes, distRes, expiryRes] = await Promise.all([
          MultiplierAPI.getEventPointsOverview(),
          MultiplierAPI.getEventPointsTrend({ days: this.monitor_trend_days }),
          MultiplierAPI.getBudgetDistribution({ asset_code: 'event_points' }),
          MultiplierAPI.getExpiryClearHistory({ days: this.monitor_trend_days })
        ])
        if (overviewRes.success) this.event_points_overview = overviewRes.data
        if (distRes.success) this.budget_distribution = distRes.data
        if (expiryRes.success) this.expiry_history = expiryRes.data
        // ECharts 懒加载 + 渲染（DOM 需先渲染出容器，$nextTick 后再 init）
        if (!this._echarts) this._echarts = await loadECharts()
        this.$nextTick(() => {
          this._renderTrendChart((trendRes.success && trendRes.data.series) || [])
          this._renderDistChart((distRes.success && distRes.data.buckets) || [])
        })
      } catch (err) {
        logger.error('[MultiplierManagement] 加载监控看板失败:', err)
        this.monitor_error = err.message || '加载监控看板失败'
      } finally {
        this.monitor_loading = false
      }
    },

    /** 渲染活动积分发放/消耗趋势图（折线图） */
    _renderTrendChart(series) {
      const echarts = this._echarts
      const el = document.getElementById('event-points-trend-chart')
      if (!echarts || !el) return
      if (!this._trendChart) this._trendChart = echarts.init(el)
      this._trendChart.setOption({
        tooltip: { trigger: 'axis' },
        legend: { data: ['发放', '消耗'] },
        grid: { left: 40, right: 20, top: 40, bottom: 30 },
        xAxis: { type: 'category', data: series.map(s => s.date) },
        yAxis: { type: 'value' },
        series: [
          { name: '发放', type: 'line', smooth: true, data: series.map(s => s.issued), itemStyle: { color: '#22c55e' } },
          { name: '消耗', type: 'line', smooth: true, data: series.map(s => s.consumed), itemStyle: { color: '#ef4444' } }
        ]
      })
    },

    /** 渲染个人活动账户余额分布图（柱状图，防套利监控） */
    _renderDistChart(buckets) {
      const echarts = this._echarts
      const el = document.getElementById('budget-distribution-chart')
      if (!echarts || !el) return
      if (!this._distChart) this._distChart = echarts.init(el)
      this._distChart.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: 40, right: 20, top: 30, bottom: 30 },
        xAxis: { type: 'category', data: buckets.map(b => b.bucket_label) },
        yAxis: { type: 'value', name: '持有人数' },
        series: [
          {
            name: '持有人数',
            type: 'bar',
            data: buckets.map(b => b.holder_count),
            itemStyle: { color: '#3b82f6' }
          }
        ]
      })
    },

    /** 切换趋势窗口天数并重载 */
    async changeTrendDays(days) {
      this.monitor_trend_days = days
      await this.loadMonitor()
    },

    // ========== 客服查询（§13.3 "为什么翻/没翻"） ==========

    /** 查某用户抽奖水晶倍率解释 */
    async queryUserExplain() {
      const userId = String(this.explain_user_id || '').trim()
      if (!userId) {
        this.explain_error = '请输入用户ID'
        return
      }
      this.explain_loading = true
      this.explain_error = ''
      this.explain_result = null
      try {
        const params = { user_id: userId, limit: 20 }
        if (this.explain_campaign_id) params.lottery_campaign_id = this.explain_campaign_id
        const res = await MultiplierAPI.getUserExplain(params)
        if (res.success) {
          this.explain_result = res.data
        } else {
          this.explain_error = res.message || '查询失败'
        }
      } catch (err) {
        logger.error('[MultiplierManagement] 查询用户倍率解释失败:', err)
        this.explain_error = err.message || '查询失败'
      } finally {
        this.explain_loading = false
      }
    },

    // ========== 公共数据加载 ==========

    /** 加载抽奖活动列表（活动选择器数据源） */
    async loadCampaigns() {
      try {
        const res = await LotteryCoreAPI.getCampaignList({ page: 1, page_size: 100 })
        if (res.success) {
          this.campaigns = res.data.campaigns || []
        }
      } catch (err) {
        logger.error('[MultiplierManagement] 加载活动列表失败:', err)
      }
    },

    /** 加载成长等级选项（growth_level 定向数据源） */
    async loadGrowthLevels() {
      try {
        const res = await MultiplierAPI.getGrowthLevels()
        if (res.success) {
          this.growth_levels = res.data.levels || res.data || []
        }
      } catch (err) {
        logger.error('[MultiplierManagement] 加载成长等级失败:', err)
      }
    },

    /** 加载标签选项（tag 定向数据源，可能为空 → 界面提示"暂无标签数据"） */
    async loadAdTags() {
      try {
        const res = await MultiplierAPI.getAdTags()
        if (res.success) {
          this.ad_tags = res.data.tags || []
        }
      } catch (err) {
        logger.error('[MultiplierManagement] 加载标签选项失败:', err)
      }
    },

    /** 加载所选活动的分群选项（活动 resolver_version 同源，随表单活动切换调用） */
    async loadSegmentOptions() {
      this.segment_options = []
      if (!this.rule_form.lottery_campaign_id) return
      this.segment_options_loading = true
      try {
        const res = await MultiplierAPI.getSegmentOptions(this.rule_form.lottery_campaign_id)
        if (res.success) {
          this.segment_options = res.data.options || []
        }
      } catch (err) {
        logger.error('[MultiplierManagement] 加载分群选项失败:', err)
      } finally {
        this.segment_options_loading = false
      }
    },

    // ========== 倍率规则：列表 ==========
    async loadRules() {
      this.rules_loading = true
      this.rules_error = ''
      try {
        const params = {
          page: this.pagination.page,
          page_size: this.pagination.page_size
        }
        if (this.filter_campaign_id) params.lottery_campaign_id = this.filter_campaign_id
        if (this.filter_status) params.status = this.filter_status

        const res = await MultiplierAPI.getRules(params)
        if (res.success) {
          this.rules = res.data || []
          this.pagination.total = res.pagination ? res.pagination.total : 0
        } else {
          this.rules_error = res.message || '加载失败'
        }
      } catch (err) {
        this.rules_error = err.message || '网络错误'
        logger.error('[MultiplierManagement] 加载倍率规则失败:', err)
      } finally {
        this.rules_loading = false
      }
    },

    async onFilterChange() {
      this.pagination.page = 1
      await this.loadRules()
    },

    async goToPage(page) {
      if (page < 1 || page > this.total_pages) return
      this.pagination.page = page
      await this.loadRules()
    },

    // ========== 倍率规则：表单 ==========
    openCreateRuleForm() {
      this.is_editing_rule = false
      this.editing_rule_id = null
      this.rule_form = getEmptyRuleForm()
      this.segment_options = []
      this.show_rule_form = true
    },

    openEditRuleForm(rule) {
      this.is_editing_rule = true
      this.editing_rule_id = rule.multiplier_campaign_id
      this.rule_form = {
        lottery_campaign_id: rule.lottery_campaign_id,
        campaign_name: rule.campaign_name,
        display_name: rule.display_name,
        multiplier: Number(rule.multiplier),
        reward_scope: rule.reward_scope,
        scope_values_text: Array.isArray(rule.scope_values) ? rule.scope_values.join(',') : '',
        target_type: rule.target_type,
        targets: (rule.targets || []).map(t => ({
          target_type: t.target_type,
          target_ref: t.target_ref,
          target_value: t.target_value
        })),
        rounding_mode: rule.rounding_mode,
        priority: Number(rule.priority) || 0,
        max_multiplier_cap: Number(rule.max_multiplier_cap),
        extra_cost_limit: Number(rule.extra_cost_limit),
        per_user_daily_limit: rule.per_user_daily_limit,
        eligibility_days: rule.eligibility_days,
        per_user_extra_cap: rule.per_user_extra_cap,
        start_at: rule.start_at ? rule.start_at.slice(0, 16) : '',
        end_at: rule.end_at ? rule.end_at.slice(0, 16) : '',
        status: rule.status,
        remark: rule.remark || ''
      }
      this.show_rule_form = true
      this.loadSegmentOptions()
    },

    closeRuleForm() {
      this.show_rule_form = false
      this.rule_form = getEmptyRuleForm()
    },

    /** 表单内活动切换 → 重载该活动的分群选项 + 清空已选 segment 目标（防跨版本引用） */
    async onFormCampaignChange() {
      this.rule_form.targets = this.rule_form.targets.filter(t => t.target_type !== 'segment')
      await this.loadSegmentOptions()
    },

    /** 人群类型切换 → 清空 targets（不同类型的 target_ref 语义不同） */
    onTargetTypeChange() {
      this.rule_form.targets = []
      if (this.rule_form.target_type === 'segment') {
        this.loadSegmentOptions()
      }
    },

    /** 添加一个作用对象行 */
    addTarget() {
      this.rule_form.targets.push({
        target_type: this.rule_form.target_type,
        target_ref: '',
        target_value: null
      })
    },

    /** 移除一个作用对象行 */
    removeTarget(index) {
      this.rule_form.targets.splice(index, 1)
    },

    async submitRuleForm() {
      try {
        const data = {
          lottery_campaign_id: parseInt(this.rule_form.lottery_campaign_id, 10),
          campaign_name: this.rule_form.campaign_name,
          display_name: this.rule_form.display_name,
          multiplier: Number(this.rule_form.multiplier),
          reward_scope: this.rule_form.reward_scope,
          scope_values:
            this.rule_form.reward_scope === 'crystal_all'
              ? null
              : (this.rule_form.scope_values_text || '')
                  .split(/[,，\s]+/)
                  .map(v => v.trim())
                  .filter(Boolean),
          target_type: this.rule_form.target_type,
          targets: this.rule_form.target_type === 'all' ? [] : this.rule_form.targets,
          rounding_mode: this.rule_form.rounding_mode,
          priority: Number(this.rule_form.priority) || 0,
          max_multiplier_cap: Number(this.rule_form.max_multiplier_cap),
          extra_cost_limit:
            this.rule_form.extra_cost_limit === null || this.rule_form.extra_cost_limit === ''
              ? null
              : Number(this.rule_form.extra_cost_limit),
          per_user_daily_limit: this.rule_form.per_user_daily_limit || null,
          eligibility_days: this.rule_form.eligibility_days || null,
          per_user_extra_cap: this.rule_form.per_user_extra_cap || null,
          start_at: this.rule_form.start_at || null,
          end_at: this.rule_form.end_at || null,
          status: this.rule_form.status,
          remark: this.rule_form.remark || null
        }

        let res
        if (this.is_editing_rule) {
          res = await MultiplierAPI.updateRule(this.editing_rule_id, data)
        } else {
          res = await MultiplierAPI.createRule(data)
        }

        if (res.success) {
          Alpine.store('notification').show(
            this.is_editing_rule ? '倍率规则更新成功' : '倍率规则创建成功',
            'success'
          )
          this.closeRuleForm()
          await this.loadRules()
        } else {
          Alpine.store('notification').show(res.message || '操作失败', 'error')
        }
      } catch (err) {
        Alpine.store('notification').show(err.message || '操作失败', 'error')
        logger.error('[MultiplierManagement] 提交倍率规则失败:', err)
      }
    },

    // ========== 倍率规则：状态/删除/成本 ==========
    async toggleRuleStatus(rule) {
      const newStatus = rule.status === 'active' ? 'inactive' : 'active'
      try {
        const res = await MultiplierAPI.updateRuleStatus(rule.multiplier_campaign_id, newStatus)
        if (res.success) {
          Alpine.store('notification').show(
            `规则已${newStatus === 'active' ? '启用' : '停用'}`,
            'success'
          )
          await this.loadRules()
        } else {
          Alpine.store('notification').show(res.message || '操作失败', 'error')
        }
      } catch (err) {
        Alpine.store('notification').show(err.message || '操作失败', 'error')
      }
    },

    async deleteRule(rule) {
      if (!confirm(`确定要删除倍率规则"${rule.campaign_name}"吗？删除后不可恢复。`)) return
      try {
        const res = await MultiplierAPI.deleteRule(rule.multiplier_campaign_id)
        if (res.success) {
          Alpine.store('notification').show('倍率规则已删除', 'success')
          await this.loadRules()
        } else {
          Alpine.store('notification').show(res.message || '操作失败', 'error')
        }
      } catch (err) {
        Alpine.store('notification').show(err.message || '操作失败', 'error')
      }
    },

    /** 查看成本水位（extra_cost_used/limit + 受益人数 + 多发水晶总量） */
    async openCostModal(rule) {
      this.show_cost_modal = true
      this.cost_loading = true
      this.cost_data = null
      try {
        const res = await MultiplierAPI.getRuleCost(rule.multiplier_campaign_id)
        if (res.success) {
          this.cost_data = res.data
        } else {
          Alpine.store('notification').show(res.message || '加载成本水位失败', 'error')
        }
      } catch (err) {
        Alpine.store('notification').show(err.message || '加载成本水位失败', 'error')
      } finally {
        this.cost_loading = false
      }
    },

    closeCostModal() {
      this.show_cost_modal = false
      this.cost_data = null
    },

    // ========== 归集规则：列表 ==========
    async loadCollectionRules() {
      this.collection_loading = true
      this.collection_error = ''
      try {
        const res = await MultiplierAPI.getCollectionRules({
          page: this.collection_pagination.page,
          page_size: this.collection_pagination.page_size
        })
        if (res.success) {
          this.collection_rules = res.data || []
          this.collection_pagination.total = res.pagination ? res.pagination.total : 0
        } else {
          this.collection_error = res.message || '加载失败'
        }
      } catch (err) {
        this.collection_error = err.message || '网络错误'
        logger.error('[MultiplierManagement] 加载归集规则失败:', err)
      } finally {
        this.collection_loading = false
      }
    },

    async goToCollectionPage(page) {
      if (page < 1 || page > this.collection_total_pages) return
      this.collection_pagination.page = page
      await this.loadCollectionRules()
    },

    // ========== 归集规则：表单 ==========
    openCreateCollectionForm() {
      this.is_editing_collection = false
      this.editing_collection_id = null
      this.collection_form = getEmptyCollectionForm()
      this.show_collection_form = true
    },

    openEditCollectionForm(rule) {
      this.is_editing_collection = true
      this.editing_collection_id = rule.collection_rule_id
      this.collection_form = {
        lottery_campaign_id: rule.lottery_campaign_id,
        rule_name: rule.rule_name,
        store_ids_text: Array.isArray(rule.store_ids) ? rule.store_ids.join(',') : '',
        merchant_ids_text: Array.isArray(rule.merchant_ids) ? rule.merchant_ids.join(',') : '',
        event_points_ratio: Number(rule.event_points_ratio),
        start_at: rule.start_at ? rule.start_at.slice(0, 16) : '',
        end_at: rule.end_at ? rule.end_at.slice(0, 16) : '',
        priority: Number(rule.priority) || 0,
        status: rule.status,
        remark: rule.remark || ''
      }
      this.show_collection_form = true
    },

    closeCollectionForm() {
      this.show_collection_form = false
      this.collection_form = getEmptyCollectionForm()
    },

    async submitCollectionForm() {
      try {
        const data = {
          lottery_campaign_id: parseInt(this.collection_form.lottery_campaign_id, 10),
          rule_name: this.collection_form.rule_name,
          store_ids: parseIdListText(this.collection_form.store_ids_text),
          merchant_ids: parseIdListText(this.collection_form.merchant_ids_text),
          event_points_ratio: Number(this.collection_form.event_points_ratio),
          start_at: this.collection_form.start_at || null,
          end_at: this.collection_form.end_at || null,
          priority: Number(this.collection_form.priority) || 0,
          status: this.collection_form.status,
          remark: this.collection_form.remark || null
        }

        let res
        if (this.is_editing_collection) {
          res = await MultiplierAPI.updateCollectionRule(this.editing_collection_id, data)
        } else {
          res = await MultiplierAPI.createCollectionRule(data)
        }

        if (res.success) {
          Alpine.store('notification').show(
            this.is_editing_collection ? '归集规则更新成功' : '归集规则创建成功',
            'success'
          )
          this.closeCollectionForm()
          await this.loadCollectionRules()
        } else {
          Alpine.store('notification').show(res.message || '操作失败', 'error')
        }
      } catch (err) {
        Alpine.store('notification').show(err.message || '操作失败', 'error')
        logger.error('[MultiplierManagement] 提交归集规则失败:', err)
      }
    },

    async toggleCollectionStatus(rule) {
      const newStatus = rule.status === 'active' ? 'inactive' : 'active'
      try {
        const res = await MultiplierAPI.updateCollectionRuleStatus(
          rule.collection_rule_id,
          newStatus
        )
        if (res.success) {
          Alpine.store('notification').show(
            `归集规则已${newStatus === 'active' ? '启用' : '停用'}`,
            'success'
          )
          await this.loadCollectionRules()
        } else {
          Alpine.store('notification').show(res.message || '操作失败', 'error')
        }
      } catch (err) {
        Alpine.store('notification').show(err.message || '操作失败', 'error')
      }
    },

    async deleteCollectionRule(rule) {
      if (!confirm(`确定要删除归集规则"${rule.rule_name}"吗？删除后不可恢复。`)) return
      try {
        const res = await MultiplierAPI.deleteCollectionRule(rule.collection_rule_id)
        if (res.success) {
          Alpine.store('notification').show('归集规则已删除', 'success')
          await this.loadCollectionRules()
        } else {
          Alpine.store('notification').show(res.message || '操作失败', 'error')
        }
      } catch (err) {
        Alpine.store('notification').show(err.message || '操作失败', 'error')
      }
    },

    // ========== 格式化方法 ==========
    getStatusInfo(status) {
      return STATUS_MAP[status] || { label: status, color: 'bg-gray-100 text-gray-700' }
    },

    getTargetTypeLabel(type) {
      return TARGET_TYPE_MAP[type] || type
    },

    getRewardScopeLabel(scope) {
      return REWARD_SCOPE_MAP[scope] || scope
    },

    /** 活动ID → 活动名（列表展示） */
    getCampaignName(lottery_campaign_id) {
      const campaign = this.campaigns.find(c => c.lottery_campaign_id === lottery_campaign_id)
      return campaign ? campaign.campaign_name : `活动#${lottery_campaign_id}`
    },

    /** 成本水位百分比（进度条宽度） */
    getCostPercent(rule) {
      const limit = Number(rule.extra_cost_limit)
      if (!limit) return 0
      return Math.min(100, Math.round((Number(rule.extra_cost_used) / limit) * 100))
    },

    /** 时间展示：北京时间 */
    formatDateTime(dt) {
      if (!dt) return '—'
      return new Date(dt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
    },

    /** 数值展示：NULL → 不限 */
    formatNullable(val) {
      if (val === null || val === undefined || val === '') return '不限'
      return String(val)
    },

    rounding_mode_options: ROUNDING_MODE_OPTIONS
  }))

  logger.info('[MultiplierManagement] Alpine 组件注册完成')
})
