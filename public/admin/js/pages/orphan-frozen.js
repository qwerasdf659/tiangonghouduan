/**
 * 孤儿冻结清理页面 - Alpine.js CSP 版本
 *
 * @description 管理系统中的孤儿冻结数据（frozen_amount > 实际活跃挂牌冻结总额）
 * @version 3.1.0
 * @date 2026-01-22
 *
 * 后端API说明：
 * - GET /api/v4/console/orphan-frozen/detect - 检测孤儿冻结
 * - GET /api/v4/console/orphan-frozen/stats - 获取统计信息
 * - POST /api/v4/console/orphan-frozen/cleanup - 清理孤儿冻结
 * 
 * 注意：使用 Alpine.data() 注册组件以兼容 CSP 策略
 */

function orphanFrozenPage() {
  return {
    // ============================================================
    // 响应式数据
    // ============================================================
    userInfo: {},
    loading: false,
    globalLoading: false,
    scanning: false,
    cleaning: false,

    // 统计数据
    stats: {
      total_orphan_count: 0,
      total_orphan_amount: 0,
      affected_user_count: 0
    },

    // 孤儿冻结列表
    orphanList: [],

    // 筛选条件
    filters: {
      assetType: ''
    },

    // 分页
    currentPage: 1,
    pageSize: 20,

    // 选择项
    selectedItems: [],

    // 清理相关
    cleanReason: '',
    confirmCleanChecked: false,

    // 模态框实例
    cleanConfirmModalInstance: null,

    // ============================================================
    // 计算属性
    // ============================================================
    get totalPages() {
      return Math.ceil(this.orphanList.length / this.pageSize) || 1
    },

    get paginatedList() {
      const startIndex = (this.currentPage - 1) * this.pageSize
      const endIndex = startIndex + this.pageSize
      return this.orphanList.slice(startIndex, endIndex)
    },

    get isAllSelected() {
      return this.orphanList.length > 0 && this.selectedItems.length === this.orphanList.length
    },

    get selectedTotalAmount() {
      return this.selectedItems.reduce((sum, item) => sum + (item.orphan_amount || 0), 0)
    },

    // ============================================================
    // 初始化
    // ============================================================
    init() {
      this.userInfo = getCurrentUser() || {}

      if (!getToken() || !checkAdminPermission()) {
        return
      }

      // 初始化模态框
      this.cleanConfirmModalInstance = new bootstrap.Modal(this.$refs.cleanConfirmModal)

      // 加载数据
      this.loadData()
    },

    // ============================================================
    // 数据加载
    // ============================================================

    /**
     * 加载数据
     */
    async loadData() {
      this.loading = true
      this.orphanList = []
      this.selectedItems = []

      try {
        // 构建查询参数
        const detectParams = new URLSearchParams()
        if (this.filters.assetType) {
          detectParams.append('asset_code', this.filters.assetType)
        }

        // 并行获取检测结果和统计数据
        const [detectResponse, statsResponse] = await Promise.all([
          apiRequest(
            API_ENDPOINTS.ORPHAN_FROZEN.DETECT + (detectParams.toString() ? '?' + detectParams.toString() : '')
          ),
          apiRequest(API_ENDPOINTS.ORPHAN_FROZEN.STATS)
        ])

        // 处理检测结果
        if (detectResponse && detectResponse.success) {
          this.orphanList = detectResponse.data.orphan_items || []
        }

        // 处理统计数据
        if (statsResponse && statsResponse.success) {
          this.stats = {
            total_orphan_count: statsResponse.data.total_orphan_count || detectResponse?.data?.orphan_count || 0,
            total_orphan_amount: statsResponse.data.total_orphan_amount || detectResponse?.data?.total_orphan_amount || 0,
            affected_user_count: statsResponse.data.affected_user_count || 0
          }
        }
      } catch (error) {
        console.error('加载数据失败:', error)
        this.showErrorToast('加载失败：' + error.message)
      } finally {
        this.loading = false
      }
    },

    /**
     * 扫描孤儿数据
     */
    async scanOrphans() {
      this.scanning = true

      try {
        const response = await apiRequest(API_ENDPOINTS.ORPHAN_FROZEN.DETECT, {
          method: 'GET'
        })

        if (response && response.success) {
          const foundCount = response.data.orphan_count || 0
          this.showSuccessToast(`扫描完成，发现 ${foundCount} 条孤儿冻结数据`)
          this.loadData()
        } else {
          this.showErrorToast(response?.message || '扫描失败')
        }
      } catch (error) {
        console.error('扫描失败:', error)
        this.showErrorToast('扫描失败：' + error.message)
      } finally {
        this.scanning = false
      }
    },

    // ============================================================
    // 分页处理
    // ============================================================

    /**
     * 切换页码
     * @param {number} page - 目标页码
     */
    changePage(page) {
      if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
        this.currentPage = page
      }
    },

    /**
     * 获取可见页码数组
     */
    getPageNumbers() {
      const maxVisible = 5
      let startPage = Math.max(1, this.currentPage - Math.floor(maxVisible / 2))
      let endPage = Math.min(this.totalPages, startPage + maxVisible - 1)

      if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, this.totalPages - maxVisible + 1)
      }

      const pages = []
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i)
      }
      return pages
    },

    // ============================================================
    // 选择处理
    // ============================================================

    /**
     * 检查项目是否被选中
     * @param {Object} item - 项目
     * @returns {boolean} 是否选中
     */
    isItemSelected(item) {
      return this.selectedItems.some(
        selected => selected.account_id === item.account_id && selected.asset_code === item.asset_code
      )
    },

    /**
     * 切换行选择
     * @param {Object} item - 项目
     */
    toggleRowSelection(item) {
      const index = this.selectedItems.findIndex(
        selected => selected.account_id === item.account_id && selected.asset_code === item.asset_code
      )

      if (index > -1) {
        this.selectedItems.splice(index, 1)
      } else {
        this.selectedItems.push(item)
      }
    },

    /**
     * 切换全选
     */
    toggleSelectAll() {
      if (this.isAllSelected) {
        this.selectedItems = []
      } else {
        this.selectedItems = [...this.orphanList]
      }
    },

    // ============================================================
    // 清理操作
    // ============================================================

    /**
     * 显示清理确认模态框
     */
    showCleanConfirmModal() {
      if (this.selectedItems.length === 0) {
        this.showErrorToast('请先选择要清理的数据')
        return
      }

      this.cleanReason = ''
      this.confirmCleanChecked = false
      this.cleanConfirmModalInstance.show()
    },

    /**
     * 执行清理
     */
    async executeClean() {
      if (!this.cleanReason.trim()) {
        this.showErrorToast('请输入清理原因')
        return
      }

      this.cleaning = true

      try {
        const response = await apiRequest(API_ENDPOINTS.ORPHAN_FROZEN.CLEANUP, {
          method: 'POST',
          body: JSON.stringify({
            dry_run: false,
            reason: this.cleanReason.trim(),
            operator_name: this.userInfo.nickname || '管理员'
          })
        })

        if (response && response.success) {
          const cleanedCount = response.data.cleaned_count || 0
          const failedCount = response.data.failed_count || 0

          if (failedCount > 0) {
            this.showSuccessToast(`清理完成：成功 ${cleanedCount} 条，失败 ${failedCount} 条`)
          } else {
            this.showSuccessToast(`成功清理 ${cleanedCount} 条孤儿冻结数据`)
          }

          this.cleanConfirmModalInstance.hide()
          this.selectedItems = []
          this.loadData()
        } else {
          this.showErrorToast(response?.message || '清理失败')
        }
      } catch (error) {
        console.error('清理失败:', error)
        this.showErrorToast('清理失败：' + error.message)
      } finally {
        this.cleaning = false
      }
    },

    /**
     * 清理单条记录
     * @param {Object} item - 项目
     */
    async cleanSingleItem(item) {
      if (!confirm(`确定要清理用户 #${item.user_id} 的 ${item.asset_code} 孤儿冻结吗？\n\n此操作会将孤儿冻结金额解冻到可用余额。`)) {
        return
      }

      this.cleaning = true

      try {
        const response = await apiRequest(API_ENDPOINTS.ORPHAN_FROZEN.CLEANUP, {
          method: 'POST',
          body: JSON.stringify({
            dry_run: false,
            user_id: item.user_id,
            asset_code: item.asset_code,
            reason: '管理员手动清理单条孤儿冻结',
            operator_name: this.userInfo.nickname || '管理员'
          })
        })

        if (response && response.success) {
          const cleanedCount = response.data.cleaned_count || 0
          this.showSuccessToast(`清理成功：已解冻 ${cleanedCount} 条孤儿冻结`)
          this.loadData()
        } else {
          this.showErrorToast(response?.message || '清理失败')
        }
      } catch (error) {
        console.error('清理失败:', error)
        this.showErrorToast('清理失败：' + error.message)
      } finally {
        this.cleaning = false
      }
    },

    // ============================================================
    // 辅助函数
    // ============================================================

    /**
     * 获取资产类型名称
     * @param {string} assetCode - 资产代码
     * @returns {string} 资产名称
     */
    getAssetName(assetCode) {
      const assetNames = {
        points: '积分',
        diamond: '钻石',
        gold_coin: '金币',
        silver_coin: '银币'
      }
      return assetNames[assetCode] || assetCode
    },

    /**
     * 显示成功提示
     * @param {string} message - 提示消息
     */
    showSuccessToast(message) {
      this.$toast.success(message)
    },

    /**
     * 显示错误提示
     * @param {string} message - 错误消息
     */
    showErrorToast(message) {
      this.$toast.error(message)
    },

    /**
     * 退出登录
     */
    logout() {
      logout()
    }
  }
}

// ========== Alpine.js CSP 兼容注册 ==========
document.addEventListener('alpine:init', () => {
  Alpine.data('orphanFrozenPage', orphanFrozenPage)
  console.log('✅ [OrphanFrozenPage] Alpine 组件已注册')
})
