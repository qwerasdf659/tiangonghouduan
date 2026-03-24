/**
 * 抽奖干预管理页面（一站式 Tab 切换）
 *
 * @file admin/src/modules/lottery/pages/presets.js
 * @description 聚合两套干预机制到同一页面：
 *              Tab 1 - 强制中奖管理：一次性强制用户中指定奖品（lottery_management_settings 表）
 *              Tab 2 - 预设队列管理：为用户安排多次连续中奖剧本（lottery_presets 表）
 * @version 4.0.0 (2026-02-15 合并强制中奖+预设队列到同一页面)
 * @module lottery/pages/presets
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery/index.js'
import { buildURL, request } from '../../../api/base.js'
import { USER_ENDPOINTS } from '../../../api/user.js'
import { Alpine, createCrudMixin } from '../../../alpine/index.js'
import {
  usePresetVisualizationState,
  usePresetVisualizationMethods
} from '../composables/preset-visualization.js'

// API 请求封装
const apiRequest = async (url, options = {}) => {
  return await request({ url, ...options })
}
/**
 * @typedef {Object} InterventionFilters
 * @property {string} status - 状态筛选（active/used/expired/cancelled）
 * @property {string} userSearch - 用户搜索关键词
 * @property {string} prizeType - 奖品类型筛选
 */

/**
 * @typedef {Object} InterventionForm
 * @property {string|number} prize_id - 奖品ID
 * @property {string} expire_time - 过期时间
 * @property {string} reason - 干预原因
 * @property {string} note - 备注说明
 */

/**
 * @typedef {Object} InterventionRule
 * @property {number} id - 规则ID
 * @property {number} user_id - 用户ID
 * @property {string} setting_type - 设置类型（force_win/force_lose/probability_adjust等）
 * @property {number} prize_id - 奖品ID（对应后端 force-win API 的 prize_id 参数）
 * @property {string} status - 状态
 * @property {string} expire_time - 过期时间
 * @property {Object} user_info - 用户信息
 * @property {string} created_at - 创建时间
 */

/**
 * 强制中奖管理页面组件
 *
 * @description 管理强制中奖规则。设置后用户下一次抽奖命中指定奖品，使用后自动消耗（一次性生效）
 * @returns {Object} Alpine.js组件配置对象
 *
 * @property {boolean} globalLoading - 全局加载状态
 * @property {boolean} submitting - 表单提交中状态
 * @property {InterventionFilters} filters - 筛选条件
 * @property {Array<InterventionRule>} interventions - 干预规则列表
 * @property {Array<Object>} allPrizes - 奖品列表
 * @property {string} userSearchKeyword - 用户搜索关键词
 * @property {Array<Object>} userSearchResults - 用户搜索结果
 * @property {boolean} searchingUser - 用户搜索中状态
 * @property {boolean} userSearched - 是否已搜索用户
 * @property {Object|null} selectedUser - 选中的用户
 * @property {InterventionForm} interventionForm - 干预表单数据
 * @property {Object|null} viewData - 查看详情数据
 *
 * @fires init - 组件初始化
 * @fires loadData - 加载干预规则列表
 * @fires loadPrizes - 加载奖品列表
 * @fires createIntervention - 创建干预规则
 * @fires cancelIntervention - 取消干预规则
 *
 * @example
 * // 在HTML中使用
 * <div x-data="presetsPage()">
 *   <button @click="openCreateModal()">创建干预</button>
 * </div>
 */
function presetsPage() {
  return {
    // ==================== Mixin 组合（不需要 pagination/tableSelection，data-table 内置） ====================
    ...createCrudMixin({ page_size: 10, userResolver: true }),

    // ==================== 预设队列 composable（Tab 2） ====================
    ...usePresetVisualizationState(),
    ...usePresetVisualizationMethods(),

    // ==================== Tab 切换状态 ====================

    /**
     * 当前激活的 Tab 标识
     * - force_win: 强制中奖管理（管理干预，一次性）
     * - preset_queue: 预设队列管理（多次连续中奖剧本）
     * @type {string}
     */
    activeTab: 'force_win',

    // ==================== 页面特有状态 ====================

    /** @type {Array} 活动列表（用于干预规则关联活动选择） */
    campaignsForIntervention: [],

    /**
     * 全局加载状态
     * @type {boolean}
     */
    globalLoading: false,

    /**
     * 表单提交中状态
     * @type {boolean}
     */
    submitting: false,

    /**
     * 筛选条件
     * @type {InterventionFilters}
     */
    filters: {
      status: '',
      user_search: '',
      prize_type: ''
    },

    /**
     * 干预规则列表（保留用于 CRUD 后刷新引用）
     * @type {Array<InterventionRule>}
     */
    interventions: [],

    // ========== data-table 列配置 ==========
    tableColumns: [
      { key: 'setting_id', label: 'ID', sortable: true, type: 'code' },
      {
        key: 'user_id',
        label: '用户',
        render: (_val, row) => `<span>${row.user_info?.nickname || row.user_id || '-'}</span>`
      },
      {
        key: 'setting_type',
        label: '干预类型',
        type: 'badge',
        badgeMap: { force_win: 'green', force_lose: 'red', probability_adjust: 'blue' },
        labelMap: { force_win: '强制中奖', force_lose: '禁止中奖', probability_adjust: '概率调整' }
      },
      {
        key: 'prize_info.prize_name',
        label: '目标奖品',
        render: (_val, row) => `<span>${row.prize_info?.prize_name || '-'}</span>`
      },
      {
        key: 'status',
        label: '状态',
        sortable: true,
        type: 'status',
        statusMap: {
          active: { class: 'green', label: '生效中' },
          expired: { class: 'gray', label: '已过期' },
          used: { class: 'blue', label: '已使用' },
          cancelled: { class: 'red', label: '已取消' }
        }
      },
      { key: 'expires_at', label: '过期时间', type: 'datetime', sortable: true },
      {
        key: '_actions',
        label: '操作',
        type: 'actions',
        width: '120px',
        actions: [
          { name: 'view', label: '查看', icon: '👁️', class: 'text-blue-600 hover:text-blue-800' },
          {
            name: 'cancel',
            label: '取消',
            icon: '❌',
            class: 'text-red-500 hover:text-red-700',
            condition: row => row.status === 'active'
          }
        ]
      }
    ],

    /**
     * data-table 数据源（闭包，不依赖 this）
     */
    async fetchTableData(params) {
      const queryParams = new URLSearchParams({
        page: params.page || 1,
        page_size: params.page_size || 10
      })
      if (params.status) queryParams.append('status', params.status)
      if (params.user_search) queryParams.append('user_search', params.user_search)
      if (params.setting_type) queryParams.append('setting_type', params.setting_type)

      const response = await request({
        url: `${LOTTERY_ENDPOINTS.INTERVENTION_LIST}?${queryParams}`
      })
      if (response?.success) {
        return {
          items: response.data?.interventions || [],
          total: response.data?.pagination?.total || 0
        }
      }
      throw new Error(response?.message || '加载干预规则失败')
    },

    /**
     * 处理表格操作事件
     */
    handleTableAction(detail) {
      const { action, row } = detail
      switch (action) {
        case 'view':
          this.viewIntervention(row.setting_id)
          break
        case 'cancel':
          this.cancelIntervention(row.setting_id)
          break
      }
    },

    /**
     * 搜索（触发 data-table 重载）
     */
    searchTable() {
      const filters = {}
      if (this.filters.status) filters.status = this.filters.status
      if (this.filters.user_search.trim()) filters.user_search = this.filters.user_search.trim()
      if (this.filters.prize_type) filters.setting_type = this.filters.prize_type
      window.dispatchEvent(new CustomEvent('dt-search', { detail: { filters } }))
    },

    /**
     * 奖品列表
     * @type {Array<Object>}
     */
    allPrizes: [],

    /**
     * 用户搜索关键词
     * @type {string}
     */
    userSearchKeyword: '',

    /**
     * 用户搜索结果列表
     * @type {Array<Object>}
     */
    userSearchResults: [],

    /**
     * 用户搜索中状态
     * @type {boolean}
     */
    searchingUser: false,

    /**
     * 是否已执行过用户搜索
     * @type {boolean}
     */
    userSearched: false,

    /**
     * 当前选中的用户
     * @type {Object|null}
     */
    selectedUser: null,

    /**
     * 干预规则表单数据
     * @type {InterventionForm}
     */
    interventionForm: {
      prize_id: '',
      lottery_campaign_id: '',
      expire_time: '',
      reason: '',
      note: ''
    },

    /**
     * 查看详情数据
     * @type {Object|null}
     */
    viewData: null,

    // ==================== 生命周期 ====================

    /**
     * 初始化组件
     *
     * @description 执行认证检查并加载初始数据（奖品列表和干预规则列表）
     * @async
     * @returns {Promise<void>}
     */
    async init() {
      logger.info('[PRESETS] 抽奖干预管理页面初始化 (v4.0 - 强制中奖 + 预设队列)')

      // 验证关键属性
      logger.debug('组件状态检查:', {
        hasInterventions: Array.isArray(this.interventions),
        hasFilters: !!this.filters,
        hasTotalRecords: typeof this.total_records !== 'undefined'
      })

      // 使用 Mixin 的认证检查
      logger.debug('[PRESETS] 执行认证检查...')
      if (!this.checkAuth()) {
        logger.warn('[PRESETS] 认证检查未通过，跳过数据加载')
        return
      }
      logger.debug('[PRESETS] 认证检查通过')

      // 加载 Tab 1 数据（强制中奖 + 奖品列表 + 活动列表）
      try {
        logger.debug('[PRESETS] 开始加载奖品、干预列表和活动列表...')
        await Promise.all([this.loadPrizes(), this.loadData(), this.loadCampaignsForIntervention()])
        logger.info('[PRESETS] Tab 1 初始化完成', {
          interventionsCount: this.interventions.length,
          prizesCount: this.allPrizes.length,
          campaignsCount: this.campaignsForIntervention.length
        })
      } catch (error) {
        logger.error('[PRESETS] Tab 1 初始化失败:', error)
      }
    },

    // ==================== 数据加载 ====================

    /**
     * 加载奖品列表
     *
     * @description 从API获取所有可用奖品，用于创建干预规则时选择
     * @async
     * @returns {Promise<void>}
     */
    async loadPrizes() {
      try {
        logger.debug('开始加载奖品列表', { endpoint: LOTTERY_ENDPOINTS.PRIZE_LIST })
        const response = await apiRequest(LOTTERY_ENDPOINTS.PRIZE_LIST)

        logger.debug('奖品列表响应', {
          success: response?.success,
          dataKeys: Object.keys(response?.data || {}),
          prizesCount: response?.data?.prizes?.length || 0
        })

        if (response && response.success) {
          this.allPrizes = response.data?.prizes || []
          logger.info('奖品列表加载成功', { count: this.allPrizes.length })

          if (this.allPrizes.length === 0) {
            logger.warn('奖品列表为空，请检查后端数据')
          }
        } else {
          logger.warn('奖品列表响应失败', { response })
        }
      } catch (error) {
        logger.error('加载奖品列表失败:', error)
        this.showError('加载奖品列表失败: ' + error.message)
      }
    },

    /**
     * 覆写 loadData：刷新 data-table（CRUD 操作后调用）
     */
    async loadData() {
      window.dispatchEvent(new CustomEvent('dt-refresh'))
    },

    // ==================== Tab 2: 预设队列数据加载 ====================

    /**
     * 加载预设队列 Tab 数据（切换到 Tab 2 时调用）
     *
     * @description 首次切换到预设队列 Tab 时加载统计和列表数据，避免页面初始化时加载不必要的数据
     */
    async loadPresetTabData() {
      // 只在首次切换时加载
      if (this._presetTabLoaded) return
      this._presetTabLoaded = true

      try {
        logger.debug('[PRESETS] 加载预设队列 Tab 数据...')
        await Promise.all([this.loadPresetStats(), this.loadPresets()])
        logger.info('[PRESETS] 预设队列 Tab 数据加载完成')
      } catch (error) {
        logger.error('[PRESETS] 预设队列数据加载失败:', error)
      }
    },

    /** @type {boolean} 预设队列 Tab 数据是否已加载（懒加载标记） */
    _presetTabLoaded: false,

    /**
     * 加载活动列表（用于干预规则创建时选择关联活动）
     * @async
     * @returns {Promise<void>}
     */
    async loadCampaignsForIntervention() {
      try {
        const response = await apiRequest(LOTTERY_ENDPOINTS.CAMPAIGN_LIST)
        const data = response?.data || response
        this.campaignsForIntervention = Array.isArray(data?.campaigns)
          ? data.campaigns
          : Array.isArray(data)
            ? data
            : []
        logger.debug('[PRESETS] 活动列表加载完成', { count: this.campaignsForIntervention.length })
      } catch (error) {
        logger.warn('[PRESETS] 加载活动列表失败（干预创建将使用全局模式）:', error.message)
        this.campaignsForIntervention = []
      }
    },

    // ==================== 创建干预规则 ====================

    /**
     * 打开创建干预规则模态框
     *
     * @description 重置表单数据并显示创建模态框
     * @returns {void}
     */
    openCreateModal() {
      this.resetForm()
      this.showModal('createModal')
    },

    /**
     * 重置表单数据
     *
     * @description 将干预表单和用户搜索相关状态重置为初始值
     * @returns {void}
     */
    resetForm() {
      this.interventionForm = {
        prize_id: '',
        lottery_campaign_id: '',
        expire_time: '',
        reason: '',
        note: ''
      }
      this.userSearchKeyword = ''
      this.userSearchResults = []
      this.userSearched = false
      this.selectedUser = null
    },

    /**
     * 搜索用户（通过手机号）
     *
     * @description 根据手机号搜索用户，使用后端 RESOLVE 端点精确匹配
     * @async
     * @returns {Promise<void>}
     * @throws {Error} 当手机号为空或格式错误时提示错误
     */
    async searchUser() {
      const mobile = this.userSearchKeyword.trim()
      if (!mobile) {
        this.showError('请输入手机号码')
        return
      }

      // 手机号格式校验（11位数字，1开头）
      if (!/^1\d{10}$/.test(mobile)) {
        this.showError('手机号格式错误，请输入11位手机号')
        return
      }

      this.searchingUser = true
      this.userSearched = false

      try {
        const response = await apiRequest(
          `${USER_ENDPOINTS.RESOLVE}?mobile=${encodeURIComponent(mobile)}`
        )

        if (response && response.success && response.data) {
          // RESOLVE 端点返回单个用户对象，包装为数组供列表展示
          this.userSearchResults = [response.data]
          logger.debug('用户搜索结果', { user_id: response.data.user_id })
        } else {
          this.userSearchResults = []
          this.showError(response?.message || '未找到该手机号对应的用户')
        }
      } catch (error) {
        logger.error('搜索用户失败:', error)
        this.userSearchResults = []
        this.showError('搜索用户失败: ' + error.message)
      } finally {
        this.searchingUser = false
        this.userSearched = true
      }
    },

    /**
     * 选择用户
     *
     * @description 从搜索结果中选择用户作为干预规则的目标
     * @param {Object} user - 用户对象
     * @param {number} user.user_id - 用户ID
     * @param {string} user.nickname - 用户昵称
     * @returns {void}
     */
    selectUser(user) {
      this.selectedUser = user
      this.userSearchResults = []
      this.userSearchKeyword = ''
    },

    /**
     * 获取当前选中的奖品
     *
     * @description 根据表单中的prize_id从奖品列表中查找对应奖品信息
     * @returns {Object|null} 选中的奖品对象，未选中时返回null
     */
    getSelectedPrize() {
      if (!this.interventionForm.prize_id) return null
      return this.allPrizes.find(p => p.lottery_prize_id == this.interventionForm.prize_id)
    },

    /**
     * 创建干预规则
     *
     * @description 提交创建干预规则请求，包含用户ID、奖品ID、过期时间等信息
     * @async
     * @returns {Promise<void>}
     * @throws {Error} 当未选择用户或奖品时提示错误
     */
    async createIntervention() {
      if (!this.selectedUser) {
        this.showError('请选择目标用户')
        return
      }

      if (!this.interventionForm.prize_id) {
        this.showError('请选择预设奖品')
        return
      }

      this.submitting = true

      try {
        // 计算持续时间（分钟）
        let durationMinutes = null
        if (this.interventionForm.expire_time) {
          const expireDate = new Date(this.interventionForm.expire_time)
          const now = new Date()
          const diffMs = expireDate - now
          if (diffMs > 0) {
            durationMinutes = Math.ceil(diffMs / (1000 * 60))
          }
        }

        const reason = this.interventionForm.note
          ? `${this.interventionForm.reason || '管理员强制中奖'} - ${this.interventionForm.note}`
          : this.interventionForm.reason || '管理员强制中奖'

        const data = {
          user_id: parseInt(this.selectedUser.user_id),
          prize_id: parseInt(this.interventionForm.prize_id),
          duration_minutes: durationMinutes,
          reason: reason
        }
        if (this.interventionForm.lottery_campaign_id) {
          data.lottery_campaign_id = parseInt(this.interventionForm.lottery_campaign_id)
        }

        const response = await apiRequest(LOTTERY_ENDPOINTS.INTERVENTION_FORCE_WIN, {
          method: 'POST',
          data
        })

        if (response && response.success) {
          this.showSuccess('干预规则创建成功')
          this.hideModal('createModal')
          this.resetForm()
          await this.loadData()
        } else {
          throw new Error(response?.message || '创建失败')
        }
      } catch (error) {
        logger.error('创建干预规则失败:', error)
        this.showError('创建失败：' + error.message)
      } finally {
        this.submitting = false
      }
    },

    // ==================== 查看和取消 ====================

    /**
     * 查看干预规则详情
     *
     * @description 根据规则ID获取并显示干预规则的详细信息
     * @async
     * @param {string} settingId - 干预规则ID（setting_id格式：setting_xxx）
     * @returns {Promise<void>}
     */
    async viewIntervention(settingId) {
      if (!settingId) {
        this.showError('规则ID无效')
        return
      }

      this.globalLoading = true

      try {
        const response = await apiRequest(
          buildURL(LOTTERY_ENDPOINTS.INTERVENTION_DETAIL, { id: settingId })
        )

        if (response && response.success) {
          this.viewData = response.data
          this.showModal('viewModal')
        } else {
          this.showError(response?.message || '获取详情失败')
        }
      } catch (error) {
        logger.error('获取干预规则详情失败:', error)
        this.showError('获取详情失败: ' + error.message)
      } finally {
        this.globalLoading = false
      }
    },

    /**
     * 取消干预规则
     *
     * @description 取消指定的干预规则，取消后无法恢复
     * @async
     * @param {string} settingId - 干预规则ID（setting_id格式：setting_xxx）
     * @returns {Promise<void>}
     */
    async cancelIntervention(settingId) {
      if (!settingId) {
        this.showError('规则ID无效')
        return
      }

      const confirmed = await this.confirmDanger('确定要取消此干预规则吗？取消后无法恢复。')
      if (!confirmed) return

      this.globalLoading = true

      try {
        const response = await apiRequest(
          buildURL(LOTTERY_ENDPOINTS.INTERVENTION_CANCEL, { id: settingId }),
          { method: 'POST' }
        )

        if (response && response.success) {
          this.showSuccess('干预规则已取消')
          await this.loadData()
        } else {
          throw new Error(response?.message || '取消失败')
        }
      } catch (error) {
        logger.error('取消干预规则失败:', error)
        this.showError('取消失败：' + error.message)
      } finally {
        this.globalLoading = false
      }
    },

    // ==================== 辅助函数 ====================

    /**
     * 格式化规则显示ID
     *
     * @description 根据规则类型、用户信息和索引生成友好的规则标识
     * @param {InterventionRule} item - 干预规则对象
     * @param {number} index - 当前页面中的索引位置
     * @returns {string} 格式化后的规则ID（如：#1 强制中奖 - 用户昵称）
     *
     * @example
     * formatRuleId({ setting_type: 'force_win', user_info: { nickname: '张三' } }, 0)
     * // 返回: "#1 强制中奖 - 张三"
     */
    formatRuleId(item, index) {
      const typeShort = {
        force_win: '强制中奖',
        force_lose: '禁止中奖',
        probability_adjust: '概率调整',
        user_queue: '队列设置',
        blacklist: '黑名单'
      }

      const typeName = typeShort[item.setting_type] || '规则'
      const userName = item.user_info?.nickname || '用户' + item.user_id
      const actualIndex = index + (this.current_page - 1) * this.page_size

      return `#${actualIndex + 1} ${typeName} - ${userName}`
    },

    /**
     * 获取设置类型的中文标签
     *
     * @param {string} type - 设置类型代码（probability_adjust/force_win/force_lose/blacklist）
     * @returns {string} 对应的中文标签
     */
    // ✅ 已删除 getSettingTypeLabel 映射函数
    // HTML 直接使用后端返回的 setting_type_display 字段

    /**
     * 获取奖品类型的中文标签
     *
     * @param {string} type - 奖品类型代码（physical/virtual/points/coupon）
     * @returns {string} 对应的中文标签
     */
    getPrizeTypeLabel(type) {
      const labels = {
        physical: '实物',
        virtual: '虚拟',
        points: '积分',
        coupon: '优惠券'
      }
      return labels[type] || '未知'
    },

    /**
     * 获取状态徽章的CSS类名
     *
     * @param {string} status - 状态代码（active/used/expired/cancelled）
     * @returns {string} Bootstrap徽章类名
     */
    getStatusBadgeClass(status) {
      const colorMap = {
        active: 'bg-success',
        used: 'bg-secondary',
        expired: 'bg-danger',
        cancelled: 'bg-warning text-dark'
      }
      return colorMap[(status || '').toLowerCase()] || 'bg-light text-dark'
    },

    /**
     * 显示危险操作确认对话框
     *
     * @description 使用全局确认Store或浏览器原生confirm显示确认对话框
     * @async
     * @param {string} message - 确认提示信息
     * @returns {Promise<boolean>} 用户确认返回true，取消返回false
     */
    async confirmDanger(message) {
      if (Alpine.store('confirm')) {
        return await Alpine.store('confirm').danger({
          title: '确认操作',
          message: message,
          confirmText: '确认',
          cancelText: '取消'
        })
      }
      return confirm(message)
    }

    // ✅ 已删除 getStatusText 映射函数
    // 中文显示名称由后端 attachDisplayNames 统一返回 status_display 字段
    // HTML 模板直接使用 item.status_display || item.status
  }
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('presetsPage', presetsPage)
  logger.info('[PresetsPage] Alpine 组件已注册 (v4.0 - 强制中奖 + 预设队列)')
})
