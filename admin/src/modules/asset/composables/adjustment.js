/**
 * 资产调整 - Composable
 *
 * @file admin/src/modules/asset/composables/adjustment.js
 * @description 从 asset-adjustment.js 提取的状态和方法
 * @version 1.0.0
 * @date 2026-02-06
 */

import { logger, $confirm, formatDateTimeShort } from '../../../utils/index.js'
import { API_PREFIX, request } from '../../../api/base.js'

const API_BASE_URL = API_PREFIX

// 模块级变量：当前用户ID（供 fetchTableData 闭包使用）
let _currentUserId = null

/**
 * 资产调整状态
 * @returns {Object} 状态对象
 */
export function useAdjustmentState() {
  return {
    // 加载状态
    searching: false,
    loadingRecords: false,
    submitting: false,

    // 搜索条件（手机号主导）
    searchMobile: '',

    // 当前用户数据
    current_user: null,
    admin_user: null,
    balances: [],

    // 资产类型和活动列表
    assetTypes: [],
    campaigns: [],

    // 交易记录
    transactions: [],
    filterAssetCode: '',
    filters: { status: '' },
    selectedRecord: null,

    // 统计数据
    stats: {
      totalAdjustments: 0,
      totalIncrease: 0,
      totalDecrease: 0,
      pendingApprovals: 0
    },

    // 调账记录
    records: [],
    total_records: 0,

    // 材料类型
    materialTypes: [],

    // ========== data-table 列配置 ==========
    recordsTableColumns: [
      { key: 'transaction_id', label: '交易ID', sortable: true, type: 'code' },
      {
        key: 'operator_name',
        label: '操作人',
        render: (_val, row) => {
          const name = row.operator_name || '管理员'
          const id = row.operator_id || '-'
          return `<div>${name}</div><div class="text-gray-400 text-xs">ID: ${id}</div>`
        }
      },
      {
        key: 'asset_name',
        label: '资产类型',
        render: (val, row) => val || row.asset_type_display || row.asset_code || '-'
      },
      {
        key: 'amount',
        label: '变动',
        sortable: true,
        render: val => {
          const num = Number(val)
          const cls = num >= 0 ? 'text-green-600' : 'text-red-600'
          const prefix = num >= 0 ? '+' : ''
          return `<span class="font-mono ${cls}">${prefix}${num.toLocaleString('zh-CN')}</span>`
        }
      },
      {
        key: 'status',
        label: '状态',
        type: 'status',
        statusMap: {
          completed: { class: 'green', label: '已完成' },
          pending: { class: 'yellow', label: '待审批' },
          rejected: { class: 'red', label: '已拒绝' }
        }
      },
      { key: 'created_at', label: '时间', type: 'datetime', sortable: true },
      {
        key: '_actions',
        label: '操作',
        type: 'actions',
        width: '80px',
        actions: [{ name: 'view', label: '详情', class: 'text-blue-600 hover:text-blue-800' }]
      }
    ],

    // 分页
    current_page: 1,
    page_size: 20,
    pagination: null,

    // 模态框
    openModals: new Set(),

    // 调整表单
    form: {
      user_id: '',
      user_info: '',
      asset_type: '',
      material_code: '',
      campaign_id: '',
      direction: 'increase',
      amount: '',
      reason_type: 'error_correction',
      reason: ''
    },

    adjustForm: {
      asset_code: '',
      adjust_type: 'increase',
      amount: '',
      reason: '',
      campaign_id: ''
    },

    adjustModal: null
  }
}

/**
 * 资产调整方法
 * @returns {Object} 方法对象
 */
export function useAdjustmentMethods() {
  return {
    // ==================== 数据加载 ====================

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

    async loadAssetTypes() {
      try {
        const result = await request({
          url: `${API_BASE_URL}/console/asset-adjustment/asset-types`
        })
        if (result.success) {
          const rawAssetTypes = result.data?.asset_types || result.data || []

          const seenCodes = new Set()
          this.assetTypes = rawAssetTypes.filter(t => {
            if (seenCodes.has(t.asset_code)) return false
            seenCodes.add(t.asset_code)
            return true
          })

          this.materialTypes = this.assetTypes
            .filter(t => t.category === 'material')
            .map(t => ({ code: t.asset_code, name: t.display_name || t.name }))

          logger.info(
            `📊 加载资产类型: ${this.assetTypes.length} 个 (去重前${rawAssetTypes.length}个), 材料类型: ${this.materialTypes.length} 个`
          )
        }
      } catch (error) {
        logger.error('加载资产类型失败:', error)
      }
    },

    async loadCampaigns() {
      try {
        const result = await request({
          url: `${API_BASE_URL}/console/campaign-budget/batch-status`,
          params: { page_size: 50 }
        })
        if (result.success) {
          this.campaigns = result.data?.campaigns || []
          logger.info(`📊 加载活动列表: ${this.campaigns.length} 个`)
        }
      } catch (error) {
        logger.error('加载活动列表失败:', error)
      }
    },

    async loadRecords() {
      logger.debug('🔄 [loadRecords] 刷新按钮被点击，开始加载记录...')

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
        const userId = this.current_user?.user_id || this.form?.user_id
        const queryParams = {
          user_id: userId,
          page: this.current_page,
          page_size: this.page_size
        }
        if (this.filters.status) {
          queryParams.status = this.filters.status
        }

        const result = await request({
          url: `${API_BASE_URL}/console/assets/transactions`,
          params: queryParams
        })
        if (result.success) {
          this.records = result.data?.transactions || result.data?.records || []
          this.transactions = this.records
          this.pagination = result.data?.pagination || null
          this.total_records = result.data?.pagination?.total || this.records.length
          this.updateStats()
          logger.info(`📊 加载调账记录: ${this.records.length} 条`)
          logger.debug(`✅ [loadRecords] 刷新完成，共 ${this.total_records} 条记录`)
          this.showSuccess(`已刷新，共 ${this.total_records} 条记录`)
        }
      } catch (error) {
        logger.error('加载调账记录失败:', error)
        this.records = []
        this.total_records = 0
      } finally {
        this.loadingRecords = false
      }
    },

    updateStats() {
      this.stats.totalAdjustments = this.total_records
      let totalIncrease = 0
      let totalDecrease = 0

      this.records.forEach(record => {
        const amount = Number(record.amount) || 0
        if (amount > 0) totalIncrease += amount
        else if (amount < 0) totalDecrease += Math.abs(amount)
      })

      this.stats.totalIncrease = totalIncrease
      this.stats.totalDecrease = totalDecrease
      this.stats.pendingApprovals = 0
    },

    // ==================== data-table 数据源 ====================

    /**
     * data-table 数据源：调账记录
     * 通过模块级 _currentUserId 获取当前用户
     */
    async fetchRecordsTableData(params) {
      if (!_currentUserId) {
        return { items: [], total: 0 }
      }
      const queryParams = {
        user_id: _currentUserId,
        page: params.page || 1,
        page_size: params.page_size || 20
      }
      if (params.status) queryParams.status = params.status

      const result = await request({
        url: `${API_BASE_URL}/console/assets/transactions`,
        params: queryParams
      })
      if (result.success) {
        const items = result.data?.transactions || result.data?.records || []
        const total = result.data?.pagination?.total || items.length
        // 同步统计数据
        this.records = items
        this.updateStats()
        return { items, total }
      }
      throw new Error(result.message || '加载调账记录失败')
    },

    /**
     * 处理表格操作事件
     */
    handleRecordsTableAction(detail) {
      const { action, row } = detail
      switch (action) {
        case 'view':
          this.viewRecord(row)
          break
        default:
          logger.warn('[AssetAdjustment] 未知操作:', action)
      }
    },

    // ==================== 用户搜索（手机号主导） ====================

    async handleMobileSearch() {
      logger.info('🔍 handleMobileSearch() 被调用')

      if (!this.searchMobile) {
        this.showError('请输入手机号')
        return
      }

      this.searching = true

      try {
        // 使用 userResolverMixin 的 resolveUserByMobile
        const user = await this.resolveUserByMobile(this.searchMobile)
        if (!user) return // resolveError 已设置

        await this.loadUserAssets(user.user_id)
      } catch (error) {
        logger.error('搜索用户失败:', error)
        this.showError('搜索失败: ' + error.message)
      } finally {
        this.searching = false
      }
    },

    async loadUserAssets(userId) {
      this.loading = true

      try {
        const url = `${API_BASE_URL}/console/asset-adjustment/user/${userId}/balances`
        const result = await request({ url })

        if (result.success) {
          this.current_user = result.data.user
          this.balances = result.data.balances || []
          this.form.user_id = String(this.current_user?.user_id || userId)
          this.form.user_info = `✅ 已加载用户: ${this.current_user?.nickname || '未知'} (ID: ${this.form.user_id})`

          // 同步模块级用户ID并刷新 data-table
          _currentUserId = this.current_user?.user_id || userId

          logger.info(
            `✅ 加载用户资产完成: ${this.balances.length} 种, form.user_id=${this.form.user_id}`
          )

          // 刷新 data-table（替代旧 loadRecords）
          window.dispatchEvent(new CustomEvent('dt-records-refresh'))
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

    async loadAdjustmentRecords() {
      if (!this.current_user) return
      this.loadingRecords = true

      try {
        const queryParams = {
          user_id: this.current_user.user_id,
          page: this.current_page,
          page_size: this.page_size
        }
        if (this.filterAssetCode) queryParams.asset_code = this.filterAssetCode

        const result = await request({
          url: `${API_BASE_URL}/console/assets/transactions`,
          params: queryParams
        })
        if (result.success) {
          this.transactions = result.data?.transactions || []
          this.pagination = result.data?.pagination || null
        }
      } catch (error) {
        logger.error('加载调整记录失败:', error)
      } finally {
        this.loadingRecords = false
      }
    },

    // ==================== 分页 ====================

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

    goToPage(page) {
      if (page < 1 || page > this.pagination?.total_pages) return
      this.current_page = page
      this.loadAdjustmentRecords()
    },

    get hasPrevPage() {
      return this.current_page > 1
    },

    get hasNextPage() {
      if (!this.pagination) return false
      return this.current_page < (this.pagination.total_pages || 1)
    },

    get paginationInfo() {
      if (!this.pagination) return `第 ${this.current_page} 页`
      return `第 ${this.current_page}/${this.pagination.total_pages || 1} 页`
    },

    prevPage() {
      if (this.hasPrevPage) {
        this.current_page--
        this.loadRecords()
      }
    },

    nextPage() {
      if (this.hasNextPage) {
        this.current_page++
        this.loadRecords()
      }
    },

    // ==================== 资产调整 ====================

    openAdjustModal() {
      this.adjustForm = {
        asset_code: '',
        adjust_type: 'increase',
        amount: '',
        reason: '',
        campaign_id: ''
      }
      this.showModal('adjustModal')
    },

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
        const amount =
          this.adjustForm.adjust_type === 'decrease'
            ? -Math.abs(this.adjustForm.amount)
            : Math.abs(this.adjustForm.amount)

        const data = {
          user_id: this.current_user.user_id,
          asset_code: this.adjustForm.asset_code,
          amount: amount,
          reason: this.adjustForm.reason,
          idempotency_key: `asset_adjust_${this.current_user.user_id}_${this.adjustForm.asset_code}_${crypto.randomUUID()}`
        }

        if (this.adjustForm.asset_code === 'BUDGET_POINTS') {
          data.campaign_id = parseInt(this.adjustForm.campaign_id)
        }

        const result = await request({
          url: `${API_BASE_URL}/console/asset-adjustment/adjust`,
          method: 'POST',
          data
        })

        if (result.success) {
          this.showSuccess('资产调整成功')
          this.hideModal('adjustModal')
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

    getAssetDisplayName(assetCode) {
      const assetType = this.assetTypes.find(t => t.asset_code === assetCode)
      if (assetType) return assetType.display_name || assetType.name || assetCode

      const builtInNames = { POINTS: '积分', DIAMOND: '钻石', BUDGET_POINTS: '预算积分' }
      return builtInNames[assetCode] || assetCode
    },

    maskPhone(phone) {
      if (!phone) return '-'
      return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
    },

    formatNumber(num) {
      if (num === null || num === undefined) return '0'
      return Number(num).toLocaleString('zh-CN')
    },

    formatDateTimeShort(dateValue) {
      return formatDateTimeShort(dateValue)
    },

    viewRecordDetail(record) {
      this.selectedRecord = record
      this.showModal('recordDetailModal')
    },

    showSuccess(message) {
      logger.info('✅ showSuccess:', message)
      if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
        Alpine.store('notification').success(message)
      } else if (this.$toast?.success) {
        this.$toast.success(message)
      } else {
        alert('✅ ' + message)
      }
    },

    showError(message) {
      logger.error('❌ showError:', message)
      if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
        Alpine.store('notification').error(message)
      } else if (this.$toast?.error) {
        this.$toast.error(message)
      } else {
        alert('❌ ' + message)
      }
    },

    async searchUser() {
      // 兼容旧调用，统一使用手机号搜索
      await this.handleMobileSearch()
    },

    // ==================== 模态框 ====================

    isModalOpen(modalId) {
      return this.openModals.has(modalId)
    },

    showModal(modalId) {
      this.openModals.add(modalId)
    },

    hideModal(modalId) {
      this.openModals.delete(modalId)
    },

    viewRecord(record) {
      this.selectedRecord = record
    },

    async approveRecord(record) {
      if (!(await $confirm(`确定要审批通过调账记录 ${record.adjustment_id} 吗？`))) return

      try {
        const result = await request({
          url: `${API_BASE_URL}/console/asset-adjustment/approve/${record.adjustment_id}`,
          method: 'POST',
          data: { status: 'approved' }
        })
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

    async submitAdjustment() {
      const errors = []

      if (!this.form.user_id) errors.push('• 用户ID（必填）')
      if (!this.form.asset_type) errors.push('• 资产类型（必填）')
      if (this.form.asset_type === 'BUDGET_POINTS' && !this.form.campaign_id)
        errors.push('• 关联活动（预算积分必填）')
      if (this.form.asset_type === 'material' && !this.form.material_code)
        errors.push('• 材料类型（必填）')
      if (!this.form.amount || this.form.amount <= 0) errors.push('• 调账数量（必须大于0）')
      if (!this.form.reason) errors.push('• 调账原因（必填）')

      if (errors.length > 0) {
        alert('请填写以下必填项：\n\n' + errors.join('\n'))
        return
      }

      this.submitting = true

      try {
        const amount =
          this.form.direction === 'decrease'
            ? -Math.abs(this.form.amount)
            : Math.abs(this.form.amount)

        let assetCode = this.form.asset_type
        if (this.form.asset_type === 'material' && this.form.material_code) {
          assetCode = this.form.material_code
        }

        const data = {
          user_id: parseInt(this.form.user_id),
          asset_code: assetCode,
          amount: amount,
          reason: `[${this.form.reason_type}] ${this.form.reason}`,
          idempotency_key: `admin_adjust_${this.current_user?.user_id || 0}_${this.form.user_id}_${assetCode}_${crypto.randomUUID()}`
        }

        if (this.form.asset_type === 'BUDGET_POINTS' && this.form.campaign_id) {
          data.campaign_id = parseInt(this.form.campaign_id)
        }

        const result = await request({
          url: `${API_BASE_URL}/console/asset-adjustment/adjust`,
          method: 'POST',
          data
        })

        if (result.success) {
          this.showSuccess('调账成功')
          const current_userId = this.form.user_id
          const current_userInfo = this.form.user_info
          this.form = {
            user_id: current_userId,
            user_info: current_userInfo,
            asset_type: '',
            material_code: '',
            campaign_id: '',
            direction: 'increase',
            amount: '',
            reason_type: 'error_correction',
            reason: ''
          }
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
