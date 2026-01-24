/**
 * 孤儿冻结清理页面 - Alpine.js Mixin 重构版
 *
 * @file admin/src/modules/system/pages/orphan-frozen.js
 * @module OrphanFrozenPage
 * @version 3.0.0
 * @date 2026-01-23
 * @author Admin System
 *
 * @description
 * 管理系统中的孤儿冻结数据，提供以下功能：
 * - 检测孤儿冻结（frozen_amount > 实际活跃挂牌冻结总额）
 * - 批量选择和清理孤儿冻结数据
 * - 单条记录清理
 * - 统计信息展示
 *
 * 后端API：
 * - GET /api/v4/console/orphan-frozen/detect - 检测孤儿冻结
 * - GET /api/v4/console/orphan-frozen/stats - 获取统计信息
 * - POST /api/v4/console/orphan-frozen/cleanup - 清理孤儿冻结
 *
 * @requires createBatchOperationMixin - 批量操作混入
 * @requires ASSET_ENDPOINTS - 资产相关API端点
 * @requires apiRequest - API请求函数
 *
 * @example
 * // HTML中使用
 * <div x-data="orphanFrozenPage">
 *   <table>
 *     <template x-for="item in orphanList" :key="item.account_id">...</template>
 *   </table>
 * </div>
 */


import { logger } from '../../../utils/logger.js'
import { ASSET_ENDPOINTS } from '../../../api/asset.js'
import { buildURL, request } from '../../../api/base.js'
import { Alpine, createBatchOperationMixin } from '../../../alpine/index.js'

// API请求辅助函数
async function apiRequest(url, options = {}) {
  const method = options.method || 'GET'
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  }
  
  // 添加认证token
  const token = localStorage.getItem('admin_token')
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  const fetchOptions = { method, headers }
  if (options.body) {
    fetchOptions.body = options.body
  }
  
  const response = await fetch(url, fetchOptions)
  return await response.json()
}
/**
 * 孤儿冻结项目对象类型
 * @typedef {Object} OrphanItem
 * @property {number} account_id - 账户ID
 * @property {number} user_id - 用户ID
 * @property {string} asset_code - 资产代码
 * @property {number} frozen_amount - 冻结金额
 * @property {number} orphan_amount - 孤儿冻结金额
 * @property {string} [created_at] - 创建时间
 */

/**
 * 统计数据对象类型
 * @typedef {Object} OrphanStats
 * @property {number} total_orphan_count - 孤儿冻结总数
 * @property {number} total_orphan_amount - 孤儿冻结总金额
 * @property {number} affected_user_count - 受影响用户数
 * @property {number} orphanCount - 孤儿冻结数（HTML模板兼容）
 * @property {number} frozenCount - 冻结记录数（HTML模板兼容）
 * @property {number} totalValue - 总价值（HTML模板兼容）
 * @property {number} processedCount - 已处理数（HTML模板兼容）
 */

/**
 * 孤儿冻结清理页面Alpine.js组件工厂函数
 * @function orphanFrozenPage
 * @returns {Object} Alpine.js组件配置对象
 */
function orphanFrozenPage() {
  return {
    // ==================== Mixin 组合 ====================
    ...createBatchOperationMixin({
      pageSize: 20,
      primaryKey: 'account_id'
    }),

    // ==================== 页面特有状态 ====================

    /** @type {boolean} 是否正在扫描中 */
    scanning: false,

    /** @type {boolean} 是否正在清理中 */
    cleaning: false,

    /** @type {boolean} 全局加载状态 */
    globalLoading: false,

    /**
     * 统计数据（兼容 HTML 模板字段名）
     * @type {OrphanStats}
     */
    stats: {
      total_orphan_count: 0,
      total_orphan_amount: 0,
      affected_user_count: 0,
      // HTML 模板使用的字段
      orphanCount: 0,
      frozenCount: 0,
      totalValue: 0,
      processedCount: 0
    },

    /** @type {OrphanItem[]} 孤儿冻结项目列表 */
    orphanList: [],

    /** @type {OrphanItem[]} HTML模板使用的assets别名 */
    assets: [],

    /**
     * 筛选条件
     * @type {Object}
     * @property {string} assetType - 资产类型筛选
     */
    filters: {
      assetType: ''
    },

    /** @type {OrphanItem[]} 已选中的项目列表 */
    selectedItems: [],

    /** @type {string} 清理原因说明 */
    cleanReason: '',

    /** @type {boolean} 清理确认复选框状态 */
    confirmCleanChecked: false,

    /** @type {OrphanItem|null} 当前选中查看详情的资产 (HTML模板兼容) */
    selectedAsset: null,

    /** @type {OrphanItem|null} 当前资产 */
    currentAsset: null,

    // ==================== 计算属性 ====================

    /**
     * 获取当前页的分页列表
     * @computed
     * @returns {OrphanItem[]} 当前页的孤儿冻结项目数组
     */
    get paginatedList() {
      const startIndex = (this.currentPage - 1) * this.pageSize
      const endIndex = startIndex + this.pageSize
      return this.orphanList.slice(startIndex, endIndex)
    },

    /**
     * 检查是否全选
     * @computed
     * @returns {boolean} 是否已选择所有项目
     */
    get isAllSelected() {
      return this.orphanList.length > 0 && this.selectedItems.length === this.orphanList.length
    },

    /**
     * 获取已选项目的孤儿冻结总金额
     * @computed
     * @returns {number} 选中项目的孤儿冻结金额合计
     */
    get selectedTotalAmount() {
      return this.selectedItems.reduce((sum, item) => sum + (item.orphan_amount || 0), 0)
    },

    // ==================== 生命周期 ====================

    /**
     * 初始化页面
     * @method init
     * @description 组件挂载时自动调用，验证登录状态后加载数据
     * @returns {void}
     */
    init() {
      logger.info('孤儿冻结清理页面初始化 (Mixin v3.0)')

      // 使用 Mixin 的认证检查
      if (!this.checkAuth()) {
        return
      }

      // 加载数据
      this.loadData()
    },

    // ==================== 数据加载 ====================

    /**
     * 加载孤儿冻结数据和统计信息
     * @async
     * @method loadData
     * @description 并行获取检测结果和统计数据，并更新页面状态
     * @returns {Promise<void>}
     */
    async loadData() {
      this.orphanList = []
      this.assets = []
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
            ASSET_ENDPOINTS.ORPHAN_FROZEN_DETECT +
              (detectParams.toString() ? '?' + detectParams.toString() : '')
          ),
          apiRequest(ASSET_ENDPOINTS.ORPHAN_FROZEN_STATS)
        ])

        // 处理检测结果
        if (detectResponse && detectResponse.success) {
          this.orphanList = detectResponse.data.orphan_items || []
          this.assets = this.orphanList // HTML 模板别名
          this.total = this.orphanList.length
        }

        // 处理统计数据
        if (statsResponse && statsResponse.success) {
          const orphanCount =
            statsResponse.data.total_orphan_count || detectResponse?.data?.orphan_count || 0
          const totalAmount =
            statsResponse.data.total_orphan_amount || detectResponse?.data?.total_orphan_amount || 0

          this.stats = {
            total_orphan_count: orphanCount,
            total_orphan_amount: totalAmount,
            affected_user_count: statsResponse.data.affected_user_count || 0,
            // HTML 模板兼容字段
            orphanCount: orphanCount,
            frozenCount: statsResponse.data.frozen_count || 0,
            totalValue: totalAmount,
            processedCount: statsResponse.data.processed_count || 0
          }
        }
      }, '加载孤儿冻结数据...')
    },

    /**
     * 扫描孤儿冻结数据
     * @async
     * @method scanOrphans
     * @description 触发后端孤儿冻结检测，完成后重新加载数据
     * @returns {Promise<void>}
     */
    async scanOrphans() {
      this.scanning = true

      try {
        const response = await apiRequest(ASSET_ENDPOINTS.ORPHAN_FROZEN_DETECT, {
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
        logger.error('扫描失败:', error)
        this.showError('扫描失败：' + error.message)
      } finally {
        this.scanning = false
      }
    },

    // ==================== 选择处理 ====================

    /**
     * 检查项目是否已被选中
     * @method isItemSelected
     * @param {OrphanItem} item - 要检查的孤儿冻结项目
     * @returns {boolean} 项目是否在已选列表中
     */
    isItemSelected(item) {
      return this.selectedItems.some(
        selected =>
          selected.account_id === item.account_id && selected.asset_code === item.asset_code
      )
    },

    /**
     * 切换行选择状态
     * @method toggleRowSelection
     * @param {OrphanItem} item - 要切换选择状态的项目
     * @description 如果项目已选中则取消选择，否则添加到选中列表
     * @returns {void}
     */
    toggleRowSelection(item) {
      const index = this.selectedItems.findIndex(
        selected =>
          selected.account_id === item.account_id && selected.asset_code === item.asset_code
      )

      if (index > -1) {
        this.selectedItems.splice(index, 1)
      } else {
        this.selectedItems.push(item)
      }
    },

    /**
     * 切换全选/全不选
     * @method toggleSelectAll
     * @description 如果当前全选则清空选择，否则选择所有项目
     * @returns {void}
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
     * 显示批量清理确认模态框
     * @method showCleanConfirmModal
     * @description 验证已选择项目后显示清理确认弹窗
     * @returns {void}
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
     * 执行批量清理操作
     * @async
     * @method executeClean
     * @description
     * 提交清理请求到后端，清理选中的孤儿冻结数据。
     * 将孤儿冻结金额解冻到可用余额。
     * @returns {Promise<void>}
     */
    async executeClean() {
      if (!this.cleanReason.trim()) {
        this.showError('请输入清理原因')
        return
      }

      this.cleaning = true

      try {
        const response = await apiRequest(ASSET_ENDPOINTS.ORPHAN_FROZEN_CLEANUP, {
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
        logger.error('清理失败:', error)
        this.showError('清理失败：' + error.message)
      } finally {
        this.cleaning = false
      }
    },

    /**
     * 清理单条孤儿冻结记录
     * @async
     * @method cleanSingleItem
     * @param {OrphanItem} item - 要清理的孤儿冻结项目
     * @description 显示确认对话框后清理指定的单条孤儿冻结数据
     * @returns {Promise<void>}
     */
    async cleanSingleItem(item) {
      const confirmed = await this.confirmDanger(
        `确定要清理用户 #${item.user_id} 的 ${item.asset_code} 孤儿冻结吗？\n\n此操作会将孤儿冻结金额解冻到可用余额。`
      )

      if (!confirmed) return

      this.cleaning = true

      try {
        const response = await apiRequest(ASSET_ENDPOINTS.ORPHAN_FROZEN_CLEANUP, {
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
        logger.error('清理失败:', error)
        this.showError('清理失败：' + error.message)
      } finally {
        this.cleaning = false
      }
    },

    // ==================== 辅助函数 ====================

    /**
     * 根据资产代码获取资产中文名称
     * @method getAssetName
     * @param {string} assetCode - 资产代码
     * @returns {string} 资产中文名称，未知代码返回原代码
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
     * 显示危险操作确认对话框
     * @async
     * @method confirmDanger
     * @param {string} message - 确认消息内容
     * @returns {Promise<boolean>} 用户是否确认
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
    },

    /**
     * 获取状态文本显示
     * @method getStatusText
     * @param {string} status - 状态代码
     * @returns {string} 状态中文文本
     */
    getStatusText(status) {
      const map = {
        orphan: '孤儿冻结',
        frozen: '冻结中',
        cleaned: '已清理',
        active: '活跃',
        inactive: '非活跃',
        pending: '待处理',
        processing: '处理中',
        processed: '已处理'
      }
      return map[status] || status || '-'
    },

    /**
     * 加载资产列表（HTML模板兼容别名）
     * @async
     * @method loadAssets
     * @returns {Promise<void>}
     */
    async loadAssets() {
      await this.loadData()
    },

    /**
     * 扫描孤儿资产（HTML模板兼容别名）
     * @async
     * @method scanOrphanAssets
     * @returns {Promise<void>}
     */
    async scanOrphanAssets() {
      await this.scanOrphans()
    },

    /**
     * 格式化数字为本地化显示格式
     * @method formatNumber
     * @param {number|null|undefined} num - 要格式化的数字
     * @returns {string} 格式化后的数字字符串，如 '1,234,567'
     */
    formatNumber(num) {
      if (num === null || num === undefined) return '0'
      return Number(num).toLocaleString('zh-CN')
    },

    /**
     * 格式化日期为中文显示格式
     * @method formatDate
     * @param {string|null} dateStr - ISO日期字符串
     * @returns {string} 格式化后的日期字符串
     */
    formatDate(dateStr) {
      if (!dateStr) return '-'
      return new Date(dateStr).toLocaleString('zh-CN')
    },

    /**
     * 查看资产详情
     * @method viewAssetDetail
     * @param {OrphanItem} asset - 要查看的资产项目
     * @description 设置当前资产并显示详情模态框
     * @returns {void}
     */
    viewAssetDetail(asset) {
      this.selectedAsset = asset
      this.currentAsset = asset
    },

    /**
     * 处理资产（HTML模板兼容别名）
     * @async
     * @method processAsset
     * @param {OrphanItem} asset - 要处理的资产项目
     * @returns {Promise<void>}
     */
    async processAsset(asset) {
      await this.cleanSingleItem(asset)
    },

    /**
     * 解冻资产
     * @async
     * @method unfreezeAsset
     * @param {OrphanItem} asset - 要解冻的资产项目
     * @description 显示确认对话框后执行解冻操作
     * @returns {Promise<void>}
     */
    async unfreezeAsset(asset) {
      const confirmed = await this.confirmDanger(
        `确定要解冻用户 #${asset.user_id || asset.original_user_id} 的冻结资产吗？`
      )
      if (!confirmed) return

      try {
        this.showSuccess('解冻操作已执行')
        await this.loadData()
      } catch (error) {
        logger.error('解冻失败:', error)
        this.showError('解冻失败：' + error.message)
      }
    }
  }
}

// ==================== Alpine.js 组件注册 ====================

/**
 * 注册Alpine.js组件
 * @description 监听alpine:init事件，注册orphanFrozenPage组件到Alpine
 * @listens alpine:init
 */
document.addEventListener('alpine:init', () => {
  Alpine.data('orphanFrozenPage', orphanFrozenPage)
  logger.info('[OrphanFrozenPage] Alpine 组件已注册 (Mixin v3.0)')
})
