/**
 * 抽奖干预管理页面 - Alpine.js Mixin 重构版
 *
 * @file public/admin/js/pages/presets.js
 * @description 抽奖干预规则管理（强制中奖、禁止中奖等）
 * @version 3.0.0 (Mixin 重构版)
 * @date 2026-01-23
 * @module lottery/pages/presets
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery/index.js'
import { buildURL, request } from '../../../api/base.js'
import { USER_ENDPOINTS } from '../../../api/user.js'
import { Alpine, createCrudMixin } from '../../../alpine/index.js'

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
 * @property {number} prize_id - 奖品ID
 * @property {string} status - 状态
 * @property {string} expire_time - 过期时间
 * @property {Object} user_info - 用户信息
 * @property {string} created_at - 创建时间
 */

/**
 * 抽奖干预管理页面组件
 *
 * @description 用于管理抽奖干预规则，包含强制中奖、禁止中奖、概率调整等功能
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
    // ==================== Mixin 组合 ====================
    ...createCrudMixin({ pageSize: 10 }),

    // ==================== 页面特有状态 ====================

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
      userSearch: '',
      prizeType: ''
    },

    /**
     * 干预规则列表
     * @type {Array<InterventionRule>}
     */
    interventions: [],

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
      logger.info('[PRESETS] 抽奖干预管理页面初始化 (Mixin v3.0)')

      // 验证关键属性
      logger.debug('组件状态检查:', {
        hasInterventions: Array.isArray(this.interventions),
        hasFilters: !!this.filters,
        hasTotalRecords: typeof this.totalRecords !== 'undefined'
      })

      // 使用 Mixin 的认证检查
      logger.debug('[PRESETS] 执行认证检查...')
      if (!this.checkAuth()) {
        logger.warn('[PRESETS] 认证检查未通过，跳过数据加载')
        return
      }
      logger.debug('[PRESETS] 认证检查通过')

      // 加载数据
      try {
        logger.debug('[PRESETS] 开始加载奖品和干预列表...')
        await Promise.all([this.loadPrizes(), this.loadData()])
        logger.info('[PRESETS] 页面初始化完成', {
          interventionsCount: this.interventions.length,
          prizesCount: this.allPrizes.length
        })
      } catch (error) {
        logger.error('[PRESETS] 页面初始化失败:', error)
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
     * 加载干预规则列表
     *
     * @description 根据当前筛选条件和分页参数加载干预规则数据
     * @async
     * @returns {Promise<void>}
     */
    async loadData() {
      await this.withLoading(async () => {
        const params = new URLSearchParams({
          page: this.currentPage,
          page_size: this.pageSize
        })

        if (this.filters.status) params.append('status', this.filters.status)
        if (this.filters.userSearch.trim())
          params.append('user_search', this.filters.userSearch.trim())
        if (this.filters.prizeType) params.append('setting_type', this.filters.prizeType)

        const response = await apiRequest(`${LOTTERY_ENDPOINTS.INTERVENTION_LIST}?${params}`)

        if (response && response.success) {
          this.interventions = response.data?.interventions || []
          const paginationData = response.data?.pagination || {}
          // 使用 paginationMixin 提供的 totalRecords 字段
          this.totalRecords = paginationData.total || this.interventions.length
          logger.debug('干预规则加载成功', {
            count: this.interventions.length,
            total: this.totalRecords
          })
        } else {
          logger.warn('干预规则加载响应异常', response)
        }
      }, '加载干预规则...')
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
     * 搜索用户
     *
     * @description 根据关键词搜索用户，用于创建干预规则时选择目标用户
     * @async
     * @returns {Promise<void>}
     * @throws {Error} 当搜索关键词为空时提示错误
     */
    async searchUser() {
      if (!this.userSearchKeyword.trim()) {
        this.showError('请输入搜索关键词')
        return
      }

      this.searchingUser = true
      this.userSearched = false

      try {
        // 使用正确的端点名称：USER_ENDPOINTS.LIST（不是 USER_LIST）
        const response = await apiRequest(
          `${USER_ENDPOINTS.LIST}?search=${encodeURIComponent(this.userSearchKeyword.trim())}&page_size=10`
        )

        if (response && response.success) {
          this.userSearchResults = response.data?.users || []
          logger.debug('用户搜索结果', { count: this.userSearchResults.length })
        } else {
          logger.warn('用户搜索响应异常', response)
        }
      } catch (error) {
        logger.error('搜索用户失败:', error)
        this.userSearchResults = []
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
      return this.allPrizes.find(p => p.prize_id == this.interventionForm.prize_id)
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

        const response = await apiRequest(LOTTERY_ENDPOINTS.INTERVENTION_FORCE_WIN, {
          method: 'POST',
          data: {
            user_id: parseInt(this.selectedUser.user_id),
            prize_id: parseInt(this.interventionForm.prize_id),
            duration_minutes: durationMinutes,
            reason: reason
          }
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
      const actualIndex = index + (this.currentPage - 1) * this.pageSize

      return `#${actualIndex + 1} ${typeName} - ${userName}`
    },

    /**
     * 获取设置类型的中文标签
     *
     * @param {string} type - 设置类型代码（probability_adjust/force_win/force_lose/blacklist）
     * @returns {string} 对应的中文标签
     */
    getSettingTypeLabel(type) {
      const labels = {
        probability_adjust: '概率调整',
        force_win: '强制中奖',
        force_lose: '强制不中奖',
        blacklist: '黑名单'
      }
      return labels[type] || type || '未知类型'
    },

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
     * 格式化日期为本地化字符串
     *
     * @param {string|Date} dateStr - 日期字符串或Date对象
     * @returns {string} 格式化后的日期字符串，无效日期返回'-'
     */
    formatDate(dateStr) {
      if (!dateStr) return '-'
      return new Date(dateStr).toLocaleString('zh-CN')
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
    },

    /**
     * 获取状态的中文文本
     *
     * @description HTML模板通用函数，将状态代码转换为中文显示
     * @param {string} status - 状态代码
     * @returns {string} 对应的中文状态文本
     */
    getStatusText(status) {
      const map = {
        active: '生效中',
        used: '已使用',
        expired: '已过期',
        cancelled: '已取消',
        pending: '待生效'
      }
      return map[status] || status || '-'
    },

    /**
     * 加载干预规则列表（HTML模板别名方法）
     *
     * @description 为HTML模板提供的loadData方法别名
     * @async
     * @returns {Promise<void>}
     */
    async loadInterventions() {
      await this.loadData()
    }
  }
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('presetsPage', presetsPage)
  logger.info('[PresetsPage] Alpine 组件已注册 (Mixin v3.0)')
})
