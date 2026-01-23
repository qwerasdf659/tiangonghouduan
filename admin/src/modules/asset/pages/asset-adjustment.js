/**
 * 通用资产调整页面 - Alpine.js 组件
 *
 * @file admin/src/modules/asset/pages/asset-adjustment.js
 * @description 管理员资产调整页面，提供用户资产的查询、调整、记录查看等功能
 * @version 3.0.0 (Mixin 重构版)
 * @date 2026-01-23
 * @module AssetAdjustment
 *
 * @requires Alpine.js
 * @requires createCrudMixin - CRUD操作混入
 * @requires API_BASE_URL - API基础地址
 *
 * 功能模块：
 * 1. 用户搜索 - 通过用户ID或手机号搜索用户
 * 2. 资产查看 - 查看用户的各类资产余额
 * 3. 资产调整 - 增加或减少用户资产
 * 4. 记录查询 - 查看资产调整历史记录
 *
 * 后端API：
 * - GET /api/v4/console/asset-adjustment/asset-types (资产类型)
 * - GET /api/v4/console/asset-adjustment/user/:id/balances (用户资产)
 * - GET /api/v4/console/assets/transactions (交易记录)
 * - POST /api/v4/console/asset-adjustment/adjust (资产调整)
 */


import { logger } from '../../../utils/logger.js'
/**
 * @typedef {Object} AssetBalance
 * @property {string} asset_code - 资产代码
 * @property {number} available_amount - 可用余额
 * @property {number} frozen_amount - 冻结余额
 * @property {number} total - 总余额
 */

/**
 * @typedef {Object} AdjustForm
 * @property {string} assetCode - 资产代码
 * @property {'increase'|'decrease'} adjustType - 调整类型
 * @property {string|number} amount - 调整金额
 * @property {string} reason - 调整原因
 * @property {string} campaignId - 活动ID（预算积分时必填）
 */

/**
 * 创建资产调整页面组件
 *
 * @description 管理员资产调整页面组件，支持用户搜索、资产查看、资产调整等功能
 * @returns {Object} Alpine.js组件配置对象
 *
 * @example
 * // HTML中使用
 * <div x-data="assetAdjustmentPage()">
 *   <!-- 资产调整内容 -->
 * </div>
 */
function assetAdjustmentPage() {
  // 使用 createCrudMixin 获取标准功能
  const baseMixin =
    typeof createCrudMixin === 'function'
      ? createCrudMixin({ pageSize: 20, enableFormValidation: true })
      : {}

  return {
    ...baseMixin,

    /**
     * 当前登录用户信息
     * @type {Object}
     */
    userInfo: {},

    // ==================== 加载状态 ====================

    /**
     * 搜索进行中状态
     * @type {boolean}
     */
    searching: false,

    /**
     * 加载记录中状态
     * @type {boolean}
     */
    loadingRecords: false,

    /**
     * 提交中状态
     * @type {boolean}
     */
    submitting: false,

    // ==================== 搜索条件 ====================

    /**
     * 搜索的用户ID
     * @type {string}
     */
    searchUserId: '',

    /**
     * 搜索的手机号
     * @type {string}
     */
    searchMobile: '',

    // ==================== 当前用户数据 ====================

    /**
     * 当前查看的用户对象
     * @type {Object|null}
     */
    currentUser: null,

    /**
     * 用户资产余额列表
     * @type {Array<AssetBalance>}
     */
    balances: [],

    // ==================== 资产类型和活动列表 ====================

    /**
     * 资产类型列表
     * @type {Array<Object>}
     */
    assetTypes: [],

    /**
     * 活动列表（用于预算积分调整）
     * @type {Array<Object>}
     */
    campaigns: [],

    // ==================== 交易记录 ====================

    /**
     * 交易记录列表
     * @type {Array<Object>}
     */
    transactions: [],

    /**
     * 筛选的资产代码
     * @type {string}
     */
    filterAssetCode: '',

    /**
     * 筛选条件
     * @type {{status: string}}
     */
    filters: { status: '' },

    // ==================== 调整表单 ====================

    /**
     * 调整表单数据（HTML模板使用）
     * @type {Object}
     */
    form: {
      user_id: '',
      asset_type: '',
      material_code: '',
      direction: 'increase',
      amount: '',
      reason_type: 'error_correction',
      reason: ''
    },

    /**
     * 调整表单数据（旧版本兼容）
     * @type {AdjustForm}
     */
    adjustForm: {
      assetCode: '',
      adjustType: 'increase',
      amount: '',
      reason: '',
      campaignId: ''
    },

    /**
     * 调整弹窗实例
     * @type {Object|null}
     */
    adjustModal: null,

    // ==================== 生命周期 ====================

    /**
     * 组件初始化
     * @async
     * @description 初始化资产调整页面，加载必要数据
     * @returns {Promise<void>}
     */
    async init() {
      logger.info('初始化资产调整页面 (Mixin版)...')

      // 调用 Mixin 的初始化
      if (baseMixin.init) {
        baseMixin.init.call(this)
      }

      // 加载用户信息
      this.loadUserInfo()

      // 加载资产类型
      await this.loadAssetTypes()

      // 加载活动列表
      await this.loadCampaigns()
    },

    /**
     * 加载当前登录用户信息
     * @description 从localStorage加载用户信息
     * @returns {void}
     */
    loadUserInfo() {
      try {
        const stored = localStorage.getItem('userInfo')
        if (stored) {
          this.userInfo = JSON.parse(stored)
        }
      } catch (e) {
        logger.error('加载用户信息失败:', e)
      }
    },

    /**
     * 退出登录
     * @description 清除认证信息并跳转到登录页
     * @returns {void}
     */
    logout() {
      if (confirm('确定要退出登录吗？')) {
        localStorage.removeItem('token')
        localStorage.removeItem('userInfo')
        window.location.href = '/admin/login.html'
      }
    },

    // ==================== 数据加载 ====================

    /**
     * 加载资产类型列表
     * @async
     * @description 从API获取系统支持的资产类型
     * @returns {Promise<void>}
     */
    async loadAssetTypes() {
      try {
        const token = localStorage.getItem('admin_token')
        const response = await fetch(`${API_BASE_URL}/console/asset-adjustment/asset-types`, {
          headers: { Authorization: `Bearer ${token}` }
        })

        if (response.ok) {
          const result = await response.json()
          if (result.success) {
            this.assetTypes = result.data?.asset_types || result.data || []
            logger.info(`📊 加载资产类型: ${this.assetTypes.length} 个`)
          }
        }
      } catch (error) {
        logger.error('加载资产类型失败:', error)
      }
    },

    /**
     * 加载活动列表
     * @async
     * @description 获取活动列表，用于预算积分调整时选择关联活动
     * @returns {Promise<void>}
     */
    async loadCampaigns() {
      try {
        const token = localStorage.getItem('admin_token')
        const response = await fetch(
          `${API_BASE_URL}/admin/campaign-budget/batch-status?limit=50`,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        )

        if (response.ok) {
          const result = await response.json()
          if (result.success) {
            this.campaigns = result.data?.campaigns || []
            logger.info(`📊 加载活动列表: ${this.campaigns.length} 个`)
          }
        }
      } catch (error) {
        logger.error('加载活动列表失败:', error)
      }
    },

    // ==================== 用户搜索 ====================

    /**
     * 处理用户搜索
     * @async
     * @description 根据用户ID或手机号搜索用户并加载其资产
     * @returns {Promise<void>}
     */
    async handleSearch() {
      if (!this.searchUserId && !this.searchMobile) {
        this.showError('请输入用户ID或手机号')
        return
      }

      this.searching = true

      try {
        let targetUserId = this.searchUserId

        // 如果只有手机号，先查询用户ID
        if (!targetUserId && this.searchMobile) {
          const token = localStorage.getItem('admin_token')
          const userResponse = await fetch(
            `${API_BASE_URL}/admin/users?search=${this.searchMobile}`,
            {
              headers: { Authorization: `Bearer ${token}` }
            }
          )

          if (userResponse.ok) {
            const userResult = await userResponse.json()
            if (userResult.success && userResult.data?.users?.length > 0) {
              targetUserId = userResult.data.users[0].user_id
            } else {
              this.showError('未找到该手机号对应的用户')
              return
            }
          }
        }

        if (!targetUserId) {
          this.showError('请输入有效的用户ID或手机号')
          return
        }

        // 加载用户资产
        await this.loadUserAssets(targetUserId)
      } catch (error) {
        logger.error('搜索用户失败:', error)
        this.showError('搜索失败: ' + error.message)
      } finally {
        this.searching = false
      }
    },

    /**
     * 加载用户资产
     * @async
     * @param {string|number} userId - 用户ID
     * @description 获取指定用户的所有资产余额信息
     * @returns {Promise<void>}
     */
    async loadUserAssets(userId) {
      this.loading = true

      try {
        const token = localStorage.getItem('admin_token')
        const response = await fetch(
          `${API_BASE_URL}/console/asset-adjustment/user/${userId}/balances`,
          {
            headers: { Authorization: `Bearer ${token}` }
          }
        )

        if (!response.ok) throw new Error('加载用户资产失败')

        const result = await response.json()

        if (result.success) {
          this.currentUser = result.data.user
          this.balances = result.data.balances || []

          logger.info(`加载用户资产完成: ${this.balances.length} 种`)

          // 加载调整记录
          this.currentPage = 1
          await this.loadAdjustmentRecords()
        } else {
          this.showError(result.message || '查询失败')
        }
      } catch (error) {
        logger.error('加载用户资产失败:', error)
        this.showError(error.message)
      } finally {
        this.loading = false
      }
    },

    /**
     * 计算聚合后的余额
     * @description 将相同asset_code的余额合并计算
     * @returns {Array<AssetBalance>} 聚合后的余额数组
     */
    get aggregatedBalances() {
      const balanceMap = new Map()

      this.balances.forEach(balance => {
        const key = balance.asset_code
        if (balanceMap.has(key)) {
          const existing = balanceMap.get(key)
          existing.available_amount =
            (existing.available_amount || 0) + (balance.available_amount || 0)
          existing.frozen_amount = (existing.frozen_amount || 0) + (balance.frozen_amount || 0)
          existing.total = (existing.total || 0) + (balance.total || 0)
        } else {
          balanceMap.set(key, { ...balance })
        }
      })

      return Array.from(balanceMap.values())
    },

    /**
     * 加载调整记录
     * @async
     * @description 获取当前用户的资产调整历史记录
     * @returns {Promise<void>}
     */
    async loadAdjustmentRecords() {
      if (!this.currentUser) return

      this.loadingRecords = true

      try {
        const token = localStorage.getItem('admin_token')
        const params = new URLSearchParams({
          user_id: this.currentUser.user_id,
          page: this.currentPage,
          page_size: this.pageSize
        })

        if (this.filterAssetCode) {
          params.append('asset_code', this.filterAssetCode)
        }

        const response = await fetch(`${API_BASE_URL}/console/assets/transactions?${params}`, {
          headers: { Authorization: `Bearer ${token}` }
        })

        if (response.ok) {
          const result = await response.json()
          if (result.success) {
            this.transactions = result.data?.transactions || []
            this.pagination = result.data?.pagination || null
          }
        }
      } catch (error) {
        logger.error('加载调整记录失败:', error)
      } finally {
        this.loadingRecords = false
      }
    },

    // ==================== 分页控制 ====================

    /**
     * 计算可见页码
     * @description 生成分页导航的页码数组，包含省略号
     * @returns {Array<number|string>} 页码数组
     */
    get visiblePages() {
      if (!this.pagination) return []

      const pages = []
      const total = this.pagination.total_pages
      const current = this.currentPage

      for (let i = 1; i <= total; i++) {
        if (i === 1 || i === total || (i >= current - 2 && i <= current + 2)) {
          pages.push(i)
        } else if (i === current - 3 || i === current + 3) {
          pages.push('...')
        }
      }

      return pages
    },

    /**
     * 跳转到指定页面
     * @param {number} page - 目标页码
     * @returns {void}
     */
    goToPage(page) {
      if (page < 1 || page > this.pagination?.total_pages) return
      this.currentPage = page
      this.loadAdjustmentRecords()
    },

    // ==================== 资产调整 ====================

    /**
     * 打开资产调整弹窗
     * @description 重置表单并显示调整模态框
     * @returns {void}
     */
    openAdjustModal() {
      this.adjustForm = {
        assetCode: '',
        adjustType: 'increase',
        amount: '',
        reason: '',
        campaignId: ''
      }
      this.showModal('adjustModal')
    },

    /**
     * 提交资产调整
     * @async
     * @description 验证表单并提交资产调整请求
     * @returns {Promise<void>}
     */
    async submitAdjust() {
      if (!this.adjustForm.assetCode || !this.adjustForm.amount || !this.adjustForm.reason) {
        this.showError('请填写完整的调整信息')
        return
      }

      if (this.adjustForm.assetCode === 'BUDGET_POINTS' && !this.adjustForm.campaignId) {
        this.showError('调整预算积分必须选择活动')
        return
      }

      this.submitting = true

      try {
        const token = localStorage.getItem('admin_token')
        const amount =
          this.adjustForm.adjustType === 'decrease'
            ? -Math.abs(this.adjustForm.amount)
            : Math.abs(this.adjustForm.amount)

        const data = {
          user_id: this.currentUser.user_id,
          asset_code: this.adjustForm.assetCode,
          amount: amount,
          reason: this.adjustForm.reason,
          idempotency_key: `asset_adjust_${this.currentUser.user_id}_${this.adjustForm.assetCode}_${Date.now()}`
        }

        if (this.adjustForm.assetCode === 'BUDGET_POINTS') {
          data.campaign_id = parseInt(this.adjustForm.campaignId)
        }

        const response = await fetch(`${API_BASE_URL}/console/asset-adjustment/adjust`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(data)
        })

        const result = await response.json()

        if (result.success) {
          this.showSuccess('资产调整成功')
          this.hideModal('adjustModal')

          // 重新加载用户资产
          await this.loadUserAssets(this.currentUser.user_id)
        } else {
          this.showError(result.message || '调整失败')
        }
      } catch (error) {
        logger.error('资产调整失败:', error)
        this.showError(error.message)
      } finally {
        this.submitting = false
      }
    },

    // ==================== 辅助方法 ====================

    /**
     * 获取资产图标CSS类
     * @param {string} assetCode - 资产代码
     * @returns {string} Bootstrap图标CSS类名
     */
    getAssetIcon(assetCode) {
      const icons = {
        POINTS: 'bi-star-fill text-warning',
        DIAMOND: 'bi-gem text-info',
        BUDGET_POINTS: 'bi-wallet2 text-success',
        GOLD: 'bi-coin text-warning',
        SILVER: 'bi-circle-fill text-secondary'
      }
      return icons[assetCode] || 'bi-box text-primary'
    },

    /**
     * 获取资产显示名称
     * @param {string} assetCode - 资产代码
     * @returns {string} 资产的中文显示名称
     */
    getAssetDisplayName(assetCode) {
      const assetType = this.assetTypes.find(t => t.asset_code === assetCode)
      if (assetType) {
        return assetType.display_name || assetType.name || assetCode
      }

      const builtInNames = {
        POINTS: '积分',
        DIAMOND: '钻石',
        BUDGET_POINTS: '预算积分'
      }
      return builtInNames[assetCode] || assetCode
    },

    /**
     * 手机号脱敏处理
     * @param {string} phone - 手机号
     * @returns {string} 脱敏后的手机号 (例: 138****1234)
     */
    maskPhone(phone) {
      if (!phone) return '-'
      return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
    },

    /**
     * 格式化数字为千分位
     * @param {number|null|undefined} num - 数字
     * @returns {string} 格式化后的字符串
     */
    formatNumber(num) {
      if (num === null || num === undefined) return '0'
      return Number(num).toLocaleString('zh-CN')
    },

    /**
     * 格式化日期时间
     * @param {string} dateStr - 日期字符串
     * @returns {string} 格式化后的中文日期时间
     */
    formatDateTime(dateStr) {
      if (!dateStr) return '-'
      try {
        const date = new Date(dateStr)
        return date.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
      } catch {
        return dateStr
      }
    },

    /**
     * 显示成功消息
     * @param {string} message - 消息内容
     * @returns {void}
     */
    showSuccess(message) {
      this.$toast.success(message)
    },

    /**
     * 显示错误消息
     * @param {string} message - 消息内容
     * @returns {void}
     */
    showError(message) {
      this.$toast.error(message)
    },

    /**
     * 获取状态文本
     * @param {string} status - 状态代码
     * @returns {string} 状态的中文文本
     */
    getStatusText(status) {
      const map = {
        pending: '待处理',
        approved: '已批准',
        rejected: '已拒绝',
        completed: '已完成',
        processing: '处理中',
        success: '成功',
        failed: '失败'
      }
      return map[status] || status || '-'
    },

    /**
     * 搜索用户（HTML模板别名）
     * @async
     * @description handleSearch的别名方法，用于HTML模板调用
     * @returns {Promise<void>}
     */
    async searchUser() {
      await this.handleSearch()
    }
  }
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('assetAdjustmentPage', assetAdjustmentPage)
  logger.info('[AssetAdjustmentPage] Alpine 组件已注册')
})
