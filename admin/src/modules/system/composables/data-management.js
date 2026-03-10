/**
 * 数据管理 Composable - 状态 + 方法
 *
 * @module system/composables/data-management
 * @description 数据一键删除功能的 Alpine.js 状态和方法
 * @version 1.0.0
 * @date 2026-03-10
 */

import { DataManagementAPI } from '../../../api/system/data-management.js'

/**
 * 数据管理状态
 * @returns {Object} Alpine.js 响应式状态
 */
export function useDataManagementState() {
  return {
    /** @type {string} 当前激活的 Tab */
    activeTab: 'overview',

    // ========== Tab 1: 数据总览 ==========
    /** @type {Object|null} 数据量统计 */
    stats: null,
    /** @type {boolean} 统计加载中 */
    statsLoading: false,

    // ========== Tab 2: 自动清理策略 ==========
    /** @type {Array} 策略列表 */
    policies: [],
    /** @type {boolean} 策略加载中 */
    policiesLoading: false,
    /** @type {Object|null} 正在编辑的策略 */
    editingPolicy: null,

    // ========== Tab 3: 手动清理 ==========
    /** @type {number} 手动清理步骤（1-5） */
    cleanupStep: 1,
    /** @type {string[]} 选中的清理类目 */
    selectedCategories: [],
    /** @type {Object} 时间范围 */
    timeRange: { start: '', end: '' },
    /** @type {Object} 筛选条件 */
    cleanupFilters: { user_id: '' },
    /** @type {Object|null} 预览结果 */
    previewResult: null,
    /** @type {boolean} 预览加载中 */
    previewLoading: false,
    /** @type {string} 确认文字输入 */
    confirmationText: '',
    /** @type {string} 操作原因 */
    cleanupReason: '',
    /** @type {boolean} 清理执行中 */
    cleanupExecuting: false,
    /** @type {Object|null} 清理结果 */
    cleanupResult: null,

    // ========== Tab 4: 对账校验 ==========
    /** @type {Object|null} 资产域对账结果 */
    assetReconciliation: null,
    /** @type {Object|null} 物品域对账结果 */
    itemReconciliation: null,
    /** @type {boolean} 对账加载中 */
    reconcileLoading: false,

    // ========== Tab 5: 清理历史 ==========
    /** @type {Array} 清理历史列表 */
    historyList: [],
    /** @type {Object} 历史分页 */
    historyPagination: { page: 1, page_size: 20, total: 0, total_pages: 1 },
    /** @type {boolean} 历史加载中 */
    historyLoading: false,

    /** @type {string[]} 可用的清理类目 */
    availableCategories: [
      { key: 'lottery_records', label: '抽奖记录' },
      { key: 'lottery_monitoring', label: '抽奖监控' },
      { key: 'consumption_records', label: '消费与核销' },
      { key: 'customer_service', label: '客服会话' },
      { key: 'market_listings', label: '市场挂牌' },
      { key: 'notifications', label: '用户通知' },
      { key: 'feedbacks', label: '用户反馈' },
      { key: 'market_snapshots', label: '市场快照' },
      { key: 'exchange_records', label: '兑换记录' },
      { key: 'bid_records', label: '竞拍记录' },
      { key: 'system_debts', label: '系统垫付' }
    ]
  }
}

/**
 * 数据管理方法
 * @returns {Object} Alpine.js 方法
 */
export function useDataManagementMethods() {
  return {
    /**
     * 切换 Tab
     * @param {string} tab - Tab 名称
     */
    switchTab(tab) {
      this.activeTab = tab
      if (tab === 'overview' && !this.stats) this.loadStats()
      if (tab === 'policies' && this.policies.length === 0) this.loadPolicies()
      if (tab === 'history' && this.historyList.length === 0) this.loadHistory()
    },

    // ==================== Tab 1: 数据总览 ====================

    /** 加载数据量统计 */
    async loadStats() {
      this.statsLoading = true
      try {
        const res = await DataManagementAPI.getStats()
        if (res.success) {
          this.stats = res.data
        } else {
          this.showError(res.message || '获取统计失败')
        }
      } catch (error) {
        this.showError('获取统计失败: ' + error.message)
      } finally {
        this.statsLoading = false
      }
    },

    // ==================== Tab 2: 自动清理策略 ====================

    /** 加载策略列表 */
    async loadPolicies() {
      this.policiesLoading = true
      try {
        const res = await DataManagementAPI.getPolicies()
        if (res.success) {
          this.policies = res.data?.policies || []
        }
      } catch (error) {
        this.showError('获取策略失败: ' + error.message)
      } finally {
        this.policiesLoading = false
      }
    },

    /**
     * 开始编辑策略
     * @param {Object} policy - 策略对象
     */
    startEditPolicy(policy) {
      this.editingPolicy = { ...policy }
    },

    /** 取消编辑策略 */
    cancelEditPolicy() {
      this.editingPolicy = null
    },

    /** 保存策略 */
    async savePolicy() {
      if (!this.editingPolicy) return
      try {
        const res = await DataManagementAPI.updatePolicy(
          this.editingPolicy.table,
          {
            retention_days: this.editingPolicy.retention_days,
            enabled: this.editingPolicy.enabled
          }
        )
        if (res.success) {
          this.showSuccess('策略更新成功')
          this.editingPolicy = null
          await this.loadPolicies()
        } else {
          this.showError(res.message || '更新失败')
        }
      } catch (error) {
        this.showError('策略更新失败: ' + error.message)
      }
    },

    /**
     * 切换策略启用状态
     * @param {Object} policy - 策略对象
     */
    async togglePolicy(policy) {
      try {
        const res = await DataManagementAPI.updatePolicy(
          policy.table,
          { enabled: !policy.enabled }
        )
        if (res.success) {
          policy.enabled = !policy.enabled
        }
      } catch (error) {
        this.showError('切换失败: ' + error.message)
      }
    },

    // ==================== Tab 3: 手动清理 ====================

    /**
     * 切换清理类目选中状态
     * @param {string} catKey - 类目键
     */
    toggleCategory(catKey) {
      const idx = this.selectedCategories.indexOf(catKey)
      if (idx === -1) {
        this.selectedCategories.push(catKey)
      } else {
        this.selectedCategories.splice(idx, 1)
      }
    },

    /**
     * 检查类目是否选中
     * @param {string} catKey - 类目键
     * @returns {boolean}
     */
    isCategorySelected(catKey) {
      return this.selectedCategories.includes(catKey)
    },

    /** 进入下一步 */
    nextStep() {
      if (this.cleanupStep === 1 && this.selectedCategories.length === 0) {
        this.showError('请至少选择一个清理类目')
        return
      }
      if (this.cleanupStep === 2) {
        this.runPreview()
        return
      }
      this.cleanupStep++
    },

    /** 返回上一步 */
    prevStep() {
      if (this.cleanupStep > 1) {
        this.cleanupStep--
      }
    },

    /** 重置手动清理状态 */
    resetManualCleanup() {
      this.cleanupStep = 1
      this.selectedCategories = []
      this.timeRange = { start: '', end: '' }
      this.cleanupFilters = { user_id: '' }
      this.previewResult = null
      this.confirmationText = ''
      this.cleanupReason = ''
      this.cleanupResult = null
    },

    /** 执行预览 */
    async runPreview() {
      this.previewLoading = true
      try {
        const params = {
          mode: 'manual',
          categories: this.selectedCategories
        }
        if (this.timeRange.start || this.timeRange.end) {
          params.time_range = {}
          if (this.timeRange.start) params.time_range.start = this.timeRange.start
          if (this.timeRange.end) params.time_range.end = this.timeRange.end
        }
        if (this.cleanupFilters.user_id) {
          params.filters = { user_id: Number(this.cleanupFilters.user_id) }
        }

        const res = await DataManagementAPI.preview(params)
        if (res.success) {
          this.previewResult = res.data
          this.cleanupStep = 3
        } else {
          this.showError(res.message || '预览失败')
        }
      } catch (error) {
        this.showError('预览失败: ' + error.message)
      } finally {
        this.previewLoading = false
      }
    },

    /** 执行清理 */
    async executeCleanup() {
      if (this.confirmationText !== '确认删除') {
        this.showError('请输入"确认删除"以确认操作')
        return
      }
      if (!this.cleanupReason.trim()) {
        this.showError('请填写操作原因')
        return
      }

      this.cleanupExecuting = true
      try {
        const res = await DataManagementAPI.cleanup({
          preview_token: this.previewResult.preview_token,
          dry_run: false,
          reason: this.cleanupReason,
          confirmation_text: this.confirmationText
        })
        if (res.success) {
          this.cleanupResult = res.data
          this.cleanupStep = 5
          this.showSuccess(`清理完成，共删除 ${res.data.total_deleted} 条数据`)
        } else {
          this.showError(res.message || '清理失败')
        }
      } catch (error) {
        this.showError('清理失败: ' + error.message)
      } finally {
        this.cleanupExecuting = false
      }
    },

    // ==================== Tab 4: 对账校验 ====================

    /** 运行对账校验 */
    async runReconciliation() {
      this.reconcileLoading = true
      try {
        const [assetsRes, itemsRes] = await Promise.all([
          DataManagementAPI.reconcileAssets(),
          DataManagementAPI.reconcileItems()
        ])
        if (assetsRes.success) this.assetReconciliation = assetsRes.data
        if (itemsRes.success) this.itemReconciliation = itemsRes.data
        this.showSuccess('对账校验完成')
      } catch (error) {
        this.showError('对账校验失败: ' + error.message)
      } finally {
        this.reconcileLoading = false
      }
    },

    // ==================== Tab 5: 清理历史 ====================

    /** 加载清理历史 */
    async loadHistory() {
      this.historyLoading = true
      try {
        const res = await DataManagementAPI.getHistory({
          page: this.historyPagination.page,
          page_size: this.historyPagination.page_size
        })
        if (res.success) {
          this.historyList = res.data || []
          if (res.pagination) {
            this.historyPagination.total = res.pagination.total
            this.historyPagination.total_pages = res.pagination.total_pages
          }
        }
      } catch (error) {
        this.showError('获取历史失败: ' + error.message)
      } finally {
        this.historyLoading = false
      }
    },

    /**
     * 历史分页跳转
     * @param {number} page - 页码
     */
    goToHistoryPage(page) {
      if (page >= 1 && page <= this.historyPagination.total_pages) {
        this.historyPagination.page = page
        this.loadHistory()
      }
    },

    /**
     * 安全等级徽标样式
     * @param {string} level - L0/L1/L2/L3
     * @returns {string} Tailwind CSS 类名
     */
    getLevelBadgeClass(level) {
      const map = {
        L0: 'bg-red-100 text-red-800',
        L1: 'bg-orange-100 text-orange-800',
        L2: 'bg-yellow-100 text-yellow-800',
        L3: 'bg-green-100 text-green-800'
      }
      return map[level] || 'bg-gray-100 text-gray-800'
    }
  }
}
