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
import { Alpine, createCrudMixin } from '../../../alpine/index.js'

// API基础地址
const API_BASE_URL = '/api/v4'
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
      ? createCrudMixin({ page_size: 20, enableFormValidation: true })
      : {}

  return {
    ...baseMixin,

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
     * 当前查看的用户对象（被搜索的目标用户）
     * @type {Object|null}
     */
    current_user: null,

    /**
     * 当前登录的管理员信息
     * @type {Object|null}
     */
    admin_user: null,

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

    /**
     * 当前选中的记录（用于查看详情）
     * @type {Object|null}
     */
    selectedRecord: null,

    // ==================== 统计数据（HTML模板需要） ====================

    /**
     * 统计数据对象
     * @type {Object}
     */
    stats: {
      totalAdjustments: 0,
      totalIncrease: 0,
      totalDecrease: 0,
      pendingApprovals: 0
    },

    /**
     * 调账记录列表
     * @type {Array}
     */
    records: [],

    /**
     * 总记录数
     * @type {number}
     */
    total_records: 0,

    /**
     * 材料类型列表（从 assetTypes 过滤和映射得到）
     * @type {Array}
     */
    materialTypes: [],

    // ==================== 分页控制 ====================

    /**
     * 当前页码
     * @type {number}
     */
    current_page: 1,

    /**
     * 每页大小
     * @type {number}
     */
    page_size: 20,

    /**
     * 分页信息
     * @type {Object|null}
     */
    pagination: null,

    // ==================== 模态框控制 ====================

    /**
     * 打开的模态框集合
     * @type {Set}
     */
    openModals: new Set(),

    // ==================== 调整表单 ====================

    /**
     * 调整表单数据（HTML模板使用）
     * @type {Object}
     */
    form: {
      user_id: '',
      user_info: '',
      asset_type: '',
      material_code: '',
      campaign_id: '', // 🔴 新增：预算积分需要关联活动ID
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
      asset_code: '',
      adjust_type: 'increase',
      amount: '',
      reason: '',
      campaign_id: ''
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

      // 初始化openModals为Set
      this.openModals = new Set()

      // 调用 Mixin 的初始化
      if (baseMixin.init) {
        baseMixin.init.call(this)
      }

      // 检查登录状态（authGuardMixin 提供）
      if (typeof this.checkAuth === 'function') {
        if (!this.checkAuth()) {
          return // 未登录，已跳转到登录页
        }
      }

      // 加载当前登录的管理员信息
      this.loadAdminUserInfo()

      // 加载资产类型
      await this.loadAssetTypes()

      // 加载活动列表
      await this.loadCampaigns()

      // 注意：不自动加载调账记录，因为需要先选择用户
      // 调账记录在用户搜索成功后加载

      logger.info('资产调整页面初始化完成')
    },

    /**
     * 加载当前登录的管理员信息
     * @description 从 localStorage 加载管理员信息，用于页面显示
     */
    loadAdminUserInfo() {
      try {
        const userInfoStr = localStorage.getItem('user_info') || localStorage.getItem('admin_user')
        if (userInfoStr) {
          this.admin_user = JSON.parse(userInfoStr)
          logger.info('已加载管理员信息:', this.admin_user?.nickname || this.admin_user?.user_id)
        }
      } catch (error) {
        logger.error('加载管理员信息失败:', error)
      }
    },

    // logout() 方法由 authGuardMixin 提供

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
            const rawAssetTypes = result.data?.asset_types || result.data || []

            // 去重处理：基于 asset_code 去重，保留第一个
            const seenCodes = new Set()
            this.assetTypes = rawAssetTypes.filter(t => {
              if (seenCodes.has(t.asset_code)) {
                return false
              }
              seenCodes.add(t.asset_code)
              return true
            })

            // 同步材料类型到materialTypes（HTML模板需要）
            this.materialTypes = this.assetTypes
              .filter(t => t.category === 'material')
              .map(t => ({
                code: t.asset_code,
                name: t.display_name || t.name
              }))

            logger.info(
              `📊 加载资产类型: ${this.assetTypes.length} 个 (去重前${rawAssetTypes.length}个), 材料类型: ${this.materialTypes.length} 个`
            )
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
        // 修正API路径: /admin/ -> /console/
        const response = await fetch(
          `${API_BASE_URL}/console/campaign-budget/batch-status?limit=50`,
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

    /**
     * 加载调账记录（HTML模板调用）
     * @async
     * @returns {Promise<void>}
     */
    async loadRecords() {
      logger.debug('🔄 [loadRecords] 刷新按钮被点击，开始加载记录...')

      // 如果没有用户ID，直接返回空记录（API要求user_id必填）
      if (!this.current_user?.user_id && !this.form?.user_id) {
        logger.info('未选择用户，跳过加载调账记录')
        this.records = []
        this.transactions = []
        this.total_records = 0
        this.updateStats()
        return
      }

      this.loadingRecords = true

      try {
        const token = localStorage.getItem('admin_token')
        const userId = this.current_user?.user_id || this.form?.user_id

        const params = new URLSearchParams({
          user_id: userId,
          page: this.current_page,
          page_size: this.page_size
        })

        if (this.filters.status) {
          params.append('status', this.filters.status)
        }

        const response = await fetch(`${API_BASE_URL}/console/assets/transactions?${params}`, {
          headers: { Authorization: `Bearer ${token}` }
        })

        if (response.ok) {
          const result = await response.json()
          if (result.success) {
            this.records = result.data?.transactions || result.data?.records || []
            this.transactions = this.records
            this.pagination = result.data?.pagination || null
            this.total_records = result.data?.pagination?.total || this.records.length

            // 更新统计数据
            this.updateStats()

            logger.info(`📊 加载调账记录: ${this.records.length} 条`)

            // 显示刷新成功提示
            logger.debug(`✅ [loadRecords] 刷新完成，共 ${this.total_records} 条记录`)
            this.showSuccess(`已刷新，共 ${this.total_records} 条记录`)
          }
        }
      } catch (error) {
        logger.error('加载调账记录失败:', error)
        this.records = []
        this.total_records = 0
      } finally {
        this.loadingRecords = false
      }
    },

    /**
     * 更新统计数据
     * @description 根据当前记录计算统计信息
     */
    updateStats() {
      this.stats.totalAdjustments = this.total_records

      // 计算增加/减少总额
      // API返回的amount字段：正数表示增加，负数表示减少
      let totalIncrease = 0
      let totalDecrease = 0

      this.records.forEach(record => {
        const amount = Number(record.amount) || 0
        if (amount > 0) {
          totalIncrease += amount
        } else if (amount < 0) {
          totalDecrease += Math.abs(amount)
        }
      })

      this.stats.totalIncrease = totalIncrease
      this.stats.totalDecrease = totalDecrease
      // 新架构中没有待审批状态，直接完成
      this.stats.pendingApprovals = 0
    },

    // ==================== 用户搜索 ====================

    /**
     * 处理用户搜索
     * @async
     * @description 根据用户ID或手机号搜索用户并加载其资产
     * @returns {Promise<void>}
     */
    async handleSearch() {
      logger.info('🔍 handleSearch() 被调用')
      logger.info('searchUserId:', this.searchUserId, 'searchMobile:', this.searchMobile)

      if (!this.searchUserId && !this.searchMobile) {
        logger.warn('未输入用户ID或手机号')
        this.showError('请输入用户ID或手机号')
        return
      }

      this.searching = true
      logger.info('开始搜索用户...')

      try {
        let targetUserId = this.searchUserId
        logger.info('targetUserId (初始):', targetUserId)

        // 如果只有手机号，先查询用户ID
        if (!targetUserId && this.searchMobile) {
          logger.info('通过手机号搜索用户:', this.searchMobile)
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
          logger.warn('无效的用户ID')
          this.showError('请输入有效的用户ID或手机号')
          return
        }

        logger.info('准备加载用户资产, targetUserId:', targetUserId)
        // 加载用户资产
        await this.loadUserAssets(targetUserId)
        logger.info('✅ 加载用户资产完成')
      } catch (error) {
        logger.error('搜索用户失败:', error)
        this.showError('搜索失败: ' + error.message)
      } finally {
        this.searching = false
        logger.info('搜索完成, searching:', this.searching)
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
      logger.info('📊 loadUserAssets() 被调用, userId:', userId)
      this.loading = true

      try {
        const token = localStorage.getItem('admin_token')
        logger.info('Token存在:', !!token, token ? token.substring(0, 20) + '...' : 'null')

        const url = `${API_BASE_URL}/console/asset-adjustment/user/${userId}/balances`
        logger.info('请求URL:', url)

        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` }
        })

        logger.info('响应状态:', response.status)

        if (!response.ok) {
          const errorText = await response.text()
          logger.error('响应错误:', errorText)
          throw new Error(`加载用户资产失败: ${response.status}`)
        }

        const result = await response.json()
        logger.info('响应数据:', result)

        if (result.success) {
          this.current_user = result.data.user
          this.balances = result.data.balances || []

          // 🔴 关键：设置 form.user_id，提交时需要用到
          this.form.user_id = String(this.current_user?.user_id || userId)

          // 同步到 form 以便在HTML模板中显示用户信息
          this.form.user_info = `✅ 已加载用户: ${this.current_user?.nickname || '未知'} (ID: ${this.form.user_id})`

          logger.info(
            `✅ 加载用户资产完成: ${this.balances.length} 种, form.user_id=${this.form.user_id}`
          )

          // 加载调整记录
          this.current_page = 1
          await this.loadRecords()
        } else {
          this.showError(result.message || '查询失败')
        }
      } catch (error) {
        logger.error('❌ 加载用户资产失败:', error)
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
      if (!this.current_user) return

      this.loadingRecords = true

      try {
        const token = localStorage.getItem('admin_token')
        const params = new URLSearchParams({
          user_id: this.current_user.user_id,
          page: this.current_page,
          page_size: this.page_size
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
      const current = this.current_page

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
      this.current_page = page
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
      if (!this.adjustForm.asset_code || !this.adjustForm.amount || !this.adjustForm.reason) {
        this.showError('请填写完整的调整信息')
        return
      }

      if (this.adjustForm.asset_code === 'BUDGET_POINTS' && !this.adjustForm.campaign_id) {
        this.showError('调整预算积分必须选择活动')
        return
      }

      this.submitting = true

      try {
        const token = localStorage.getItem('admin_token')
        const amount =
          this.adjustForm.adjust_type === 'decrease'
            ? -Math.abs(this.adjustForm.amount)
            : Math.abs(this.adjustForm.amount)

        const data = {
          user_id: this.current_user.user_id,
          asset_code: this.adjustForm.asset_code,
          amount: amount,
          reason: this.adjustForm.reason,
          idempotency_key: `asset_adjust_${this.current_user.user_id}_${this.adjustForm.asset_code}_${Date.now()}`
        }

        if (this.adjustForm.asset_code === 'BUDGET_POINTS') {
          data.campaign_id = parseInt(this.adjustForm.campaign_id)
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
          await this.loadUserAssets(this.current_user.user_id)
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
     * 查看记录详情
     * @param {Object} record - 记录对象
     * @returns {void}
     */
    viewRecordDetail(record) {
      this.selectedRecord = record
      this.showModal('recordDetailModal')
    },

    /**
     * 显示成功消息
     * @param {string} message - 消息内容
     * @returns {void}
     */
    showSuccess(message) {
      logger.info('✅ showSuccess:', message)
      // 使用 Alpine.store('notification') 显示Toast
      if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
        Alpine.store('notification').success(message)
      } else if (this.$toast?.success) {
        this.$toast.success(message)
      } else {
        // 降级为alert
        alert('✅ ' + message)
      }
    },

    /**
     * 显示错误消息
     * @param {string} message - 消息内容
     * @returns {void}
     */
    showError(message) {
      logger.error('❌ showError:', message)
      // 使用 Alpine.store('notification') 显示Toast
      if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
        Alpine.store('notification').error(message)
      } else if (this.$toast?.error) {
        this.$toast.error(message)
      } else {
        // 降级为alert
        alert('❌ ' + message)
      }
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
     * 搜索用户
     * @async
     * @description 根据用户ID搜索用户，包含输入验证和状态同步逻辑
     * @returns {Promise<void>}
     */
    async searchUser() {
      logger.info('🔍 searchUser() 被调用')
      logger.info('form.user_id:', this.form.user_id)

      // 🔴 修复：同步 form.user_id 到 searchUserId
      // 如果输入框为空，清空搜索状态
      const inputUserId = (this.form.user_id || '').trim()

      if (!inputUserId) {
        // 清空搜索状态和当前用户
        this.searchUserId = ''
        this.current_user = null
        this.balances = []
        this.records = []
        this.total_records = 0
        this.form.user_info = ''
        this.updateStats()
        this.showError('请输入用户ID')
        logger.info('输入为空，已清空搜索状态')
        return
      }

      // 设置搜索ID
      this.searchUserId = inputUserId
      logger.info('设置 searchUserId:', this.searchUserId)

      try {
        await this.handleSearch()
      } catch (error) {
        logger.error('searchUser 错误:', error)
        this.showError('搜索失败: ' + error.message)
      }
    },

    // ==================== 模态框控制 ====================

    /**
     * 检查模态框是否打开
     * @param {string} modalId - 模态框ID
     * @returns {boolean}
     */
    isModalOpen(modalId) {
      return this.openModals.has(modalId)
    },

    /**
     * 显示模态框
     * @param {string} modalId - 模态框ID
     */
    showModal(modalId) {
      this.openModals.add(modalId)
    },

    /**
     * 隐藏模态框
     * @param {string} modalId - 模态框ID
     */
    hideModal(modalId) {
      this.openModals.delete(modalId)
    },

    // ==================== 分页控制 ====================

    /**
     * 是否有上一页
     * @returns {boolean}
     */
    get hasPrevPage() {
      return this.current_page > 1
    },

    /**
     * 是否有下一页
     * @returns {boolean}
     */
    get hasNextPage() {
      if (!this.pagination) return false
      return this.current_page < (this.pagination.total_pages || 1)
    },

    /**
     * 分页信息文本
     * @returns {string}
     */
    get paginationInfo() {
      if (!this.pagination) {
        return `第 ${this.current_page} 页`
      }
      return `第 ${this.current_page}/${this.pagination.total_pages || 1} 页`
    },

    /**
     * 上一页
     */
    prevPage() {
      if (this.hasPrevPage) {
        this.current_page--
        this.loadRecords()
      }
    },

    /**
     * 下一页
     */
    nextPage() {
      if (this.hasNextPage) {
        this.current_page++
        this.loadRecords()
      }
    },

    // ==================== 资产类型辅助方法 ====================

    /**
     * 获取资产类型文本（HTML模板需要）
     * @param {string} assetType - 资产类型代码
     * @returns {string} 资产类型的中文名称
     */
    getAssetTypeText(assetType) {
      if (!assetType) return '-'

      // 内置类型映射
      const typeMap = {
        points: '积分',
        POINTS: '积分',
        balance: '余额',
        BALANCE: '余额',
        material: '材料',
        MATERIAL: '材料',
        DIAMOND: '钻石',
        BUDGET_POINTS: '预算积分'
      }

      if (typeMap[assetType]) {
        return typeMap[assetType]
      }

      // 从资产类型列表中查找
      const found = this.assetTypes.find(t => t.asset_code === assetType)
      if (found) {
        return found.display_name || found.name || assetType
      }

      return assetType
    },

    // ==================== 记录操作方法 ====================

    /**
     * 查看记录详情
     * @param {Object} record - 记录对象
     */
    viewRecord(record) {
      this.selectedRecord = record
    },

    /**
     * 审批记录
     * @async
     * @param {Object} record - 记录对象
     */
    async approveRecord(record) {
      if (!confirm(`确定要审批通过调账记录 ${record.adjustment_id} 吗？`)) {
        return
      }

      try {
        const token = localStorage.getItem('admin_token')
        const response = await fetch(
          `${API_BASE_URL}/console/asset-adjustment/approve/${record.adjustment_id}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ status: 'approved' })
          }
        )

        const result = await response.json()
        if (result.success) {
          this.showSuccess('审批成功')
          await this.loadRecords()
        } else {
          this.showError(result.message || '审批失败')
        }
      } catch (error) {
        logger.error('审批失败:', error)
        this.showError(error.message)
      }
    },

    // ==================== 提交调账 ====================

    /**
     * 提交调账（HTML表单使用）
     * @async
     */
    async submitAdjustment() {
      // 🔴 收集所有验证错误，一次性提示用户
      const errors = []

      if (!this.form.user_id) {
        errors.push('• 用户ID（必填）')
      }
      if (!this.form.asset_type) {
        errors.push('• 资产类型（必填）')
      }
      // 预算积分必须选择活动
      if (this.form.asset_type === 'BUDGET_POINTS' && !this.form.campaign_id) {
        errors.push('• 关联活动（预算积分必填）')
      }
      // 材料类型必须选择具体材料
      if (this.form.asset_type === 'material' && !this.form.material_code) {
        errors.push('• 材料类型（必填）')
      }
      if (!this.form.amount || this.form.amount <= 0) {
        errors.push('• 调账数量（必须大于0）')
      }
      if (!this.form.reason) {
        errors.push('• 调账原因（必填）')
      }

      // 如果有验证错误，弹窗提示用户
      if (errors.length > 0) {
        const errorMessage = '请填写以下必填项：\n\n' + errors.join('\n')
        alert(errorMessage)
        return
      }

      this.submitting = true

      try {
        const token = localStorage.getItem('admin_token')
        const amount =
          this.form.direction === 'decrease'
            ? -Math.abs(this.form.amount)
            : Math.abs(this.form.amount)

        // 构建资产代码（资产类型已经是正确的格式如 POINTS, DIAMOND, BUDGET_POINTS）
        let assetCode = this.form.asset_type
        // 如果是材料类型，使用具体的材料代码
        if (this.form.asset_type === 'material' && this.form.material_code) {
          assetCode = this.form.material_code
        }

        logger.info('提交调账:', {
          user_id: this.form.user_id,
          assetCode,
          amount,
          campaign_id: this.form.campaign_id
        })

        const data = {
          user_id: parseInt(this.form.user_id),
          asset_code: assetCode,
          amount: amount,
          reason: `[${this.form.reason_type}] ${this.form.reason}`,
          idempotency_key: `admin_adjust_${this.current_user?.user_id || 0}_${this.form.user_id}_${assetCode}_${Date.now()}`
        }

        // 🔴 新增：预算积分需要添加 campaign_id
        if (this.form.asset_type === 'BUDGET_POINTS' && this.form.campaign_id) {
          data.campaign_id = parseInt(this.form.campaign_id)
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
          this.showSuccess('调账成功')
          // 保存当前用户信息
          const current_userId = this.form.user_id
          const current_userInfo = this.form.user_info
          // 重置表单（保留用户信息以便连续调账）
          this.form = {
            user_id: current_userId,
            user_info: current_userInfo,
            asset_type: '',
            material_code: '',
            campaign_id: '', // 🔴 重置活动ID
            direction: 'increase',
            amount: '',
            reason_type: 'error_correction',
            reason: ''
          }
          // 刷新用户资产和记录
          await this.loadUserAssets(current_userId)
          await this.loadRecords()
        } else {
          this.showError(result.message || '调账失败')
        }
      } catch (error) {
        logger.error('调账失败:', error)
        this.showError(error.message)
      } finally {
        this.submitting = false
      }
    }
  }
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('assetAdjustmentPage', assetAdjustmentPage)
  logger.info('[AssetAdjustmentPage] Alpine 组件已注册')
})
