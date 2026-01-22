/**
 * 孤儿冻结清理页面 - Alpine.js Mixin 重构版
 *
 * @file public/admin/js/pages/orphan-frozen.js
 * @description 管理系统中的孤儿冻结数据（frozen_amount > 实际活跃挂牌冻结总额）
 * @version 3.0.0 (Mixin 重构版)
 * @date 2026-01-23
 *
 * 后端API说明：
 * - GET /api/v4/console/orphan-frozen/detect - 检测孤儿冻结
 * - GET /api/v4/console/orphan-frozen/stats - 获取统计信息
 * - POST /api/v4/console/orphan-frozen/cleanup - 清理孤儿冻结
 */

function orphanFrozenPage() {
  return {
    // ==================== Mixin 组合 ====================
    ...createBatchOperationMixin({ 
      pageSize: 20,
      primaryKey: 'account_id'
    }),
    
    // ==================== 页面特有状态 ====================
    
    /** 扫描中 */
    scanning: false,
    
    /** 清理中 */
    cleaning: false,
    
    /** 全局加载 */
    globalLoading: false,

    /** 统计数据 */
    stats: {
      total_orphan_count: 0,
      total_orphan_amount: 0,
      affected_user_count: 0
    },

    /** 孤儿冻结列表 */
    orphanList: [],

    /** 筛选条件 */
    filters: {
      assetType: ''
    },

    /** 选中的项目 */
    selectedItems: [],

    /** 清理相关 */
    cleanReason: '',
    confirmCleanChecked: false,

    // ==================== 计算属性 ====================
    
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

    // ==================== 生命周期 ====================
    
    /**
     * 初始化
     */
    init() {
      console.log('✅ 孤儿冻结清理页面初始化 (Mixin v3.0)')
      
      // 使用 Mixin 的认证检查
      if (!this.checkAuth()) {
        return
      }

      // 加载数据
      this.loadData()
    },

    // ==================== 数据加载 ====================

    /**
     * 加载数据
     */
    async loadData() {
      this.orphanList = []
      this.selectedItems = []

      await this.withLoading(async () => {
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
          this.total = this.orphanList.length
        }

        // 处理统计数据
        if (statsResponse && statsResponse.success) {
          this.stats = {
            total_orphan_count: statsResponse.data.total_orphan_count || detectResponse?.data?.orphan_count || 0,
            total_orphan_amount: statsResponse.data.total_orphan_amount || detectResponse?.data?.total_orphan_amount || 0,
            affected_user_count: statsResponse.data.affected_user_count || 0
          }
        }
      }, '加载孤儿冻结数据...')
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
          this.showSuccess(`扫描完成，发现 ${foundCount} 条孤儿冻结数据`)
          this.loadData()
        } else {
          this.showError(response?.message || '扫描失败')
        }
      } catch (error) {
        console.error('扫描失败:', error)
        this.showError('扫描失败：' + error.message)
      } finally {
        this.scanning = false
      }
    },

    // ==================== 选择处理 ====================

    /**
     * 检查项目是否被选中
     */
    isItemSelected(item) {
      return this.selectedItems.some(
        selected => selected.account_id === item.account_id && selected.asset_code === item.asset_code
      )
    },

    /**
     * 切换行选择
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

    // ==================== 清理操作 ====================

    /**
     * 显示清理确认模态框
     */
    showCleanConfirmModal() {
      if (this.selectedItems.length === 0) {
        this.showError('请先选择要清理的数据')
        return
      }

      this.cleanReason = ''
      this.confirmCleanChecked = false
      this.showModal('cleanModal')
    },

    /**
     * 执行清理
     */
    async executeClean() {
      if (!this.cleanReason.trim()) {
        this.showError('请输入清理原因')
        return
      }

      this.cleaning = true

      try {
        const response = await apiRequest(API_ENDPOINTS.ORPHAN_FROZEN.CLEANUP, {
          method: 'POST',
          body: JSON.stringify({
            dry_run: false,
            reason: this.cleanReason.trim(),
            operator_name: this.userInfo?.nickname || '管理员'
          })
        })

        if (response && response.success) {
          const cleanedCount = response.data.cleaned_count || 0
          const failedCount = response.data.failed_count || 0

          if (failedCount > 0) {
            this.showSuccess(`清理完成：成功 ${cleanedCount} 条，失败 ${failedCount} 条`)
          } else {
            this.showSuccess(`成功清理 ${cleanedCount} 条孤儿冻结数据`)
          }

          this.hideModal('cleanModal')
          this.selectedItems = []
          this.loadData()
        } else {
          this.showError(response?.message || '清理失败')
        }
      } catch (error) {
        console.error('清理失败:', error)
        this.showError('清理失败：' + error.message)
      } finally {
        this.cleaning = false
      }
    },

    /**
     * 清理单条记录
     */
    async cleanSingleItem(item) {
      const confirmed = await this.confirmDanger(
        `确定要清理用户 #${item.user_id} 的 ${item.asset_code} 孤儿冻结吗？\n\n此操作会将孤儿冻结金额解冻到可用余额。`
      )
      
      if (!confirmed) return

      this.cleaning = true

      try {
        const response = await apiRequest(API_ENDPOINTS.ORPHAN_FROZEN.CLEANUP, {
          method: 'POST',
          body: JSON.stringify({
            dry_run: false,
            user_id: item.user_id,
            asset_code: item.asset_code,
            reason: '管理员手动清理单条孤儿冻结',
            operator_name: this.userInfo?.nickname || '管理员'
          })
        })

        if (response && response.success) {
          const cleanedCount = response.data.cleaned_count || 0
          this.showSuccess(`清理成功：已解冻 ${cleanedCount} 条孤儿冻结`)
          this.loadData()
        } else {
          this.showError(response?.message || '清理失败')
        }
      } catch (error) {
        console.error('清理失败:', error)
        this.showError('清理失败：' + error.message)
      } finally {
        this.cleaning = false
      }
    },

    // ==================== 辅助函数 ====================

    /**
     * 获取资产类型名称
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
     * 危险操作确认
     */
    async confirmDanger(message) {
      if (Alpine.store('confirm')) {
        return await Alpine.store('confirm').danger({
          title: '危险操作',
          message: message,
          confirmText: '确认清理',
          cancelText: '取消'
        })
      }
      return confirm(message)
    }
  }
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('orphanFrozenPage', orphanFrozenPage)
  console.log('✅ [OrphanFrozenPage] Alpine 组件已注册 (Mixin v3.0)')
})
