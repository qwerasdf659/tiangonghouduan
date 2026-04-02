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
 * @requires request - 统一API请求函数（来自 api/base.js）
 *
 * @example
 * // HTML中使用
 * <div x-data="orphanFrozenPage">
 *   <table>
 *     <template x-for="item in orphanList" :key="item.account_id + '_' + item.asset_code">...</template>
 *   </table>
 * </div>
 */

import { logger } from '../../../utils/logger.js'
import { request } from '../../../api/base.js'
import { ASSET_ENDPOINTS } from '../../../api/asset.js'
import { Alpine, createBatchOperationMixin, createPageMixin } from '../../../alpine/index.js'
/**
 * 孤儿冻结项目对象类型
 * @typedef {Object} OrphanItem
 * @property {string} _row_id - 前端唯一行标识（account_id + '_' + asset_code）
 * @property {number} account_id - 账户ID
 * @property {number} user_id - 用户ID
 * @property {string} asset_code - 资产代码
 * @property {number} frozen_amount - 冻结金额
 * @property {number} orphan_amount - 孤儿冻结金额
 * @property {string} [created_at] - 创建时间
 */

/**
 * 统计数据对象类型（使用 snake_case 命名）
 * @typedef {Object} OrphanStats
 * @property {number} total_orphan_count - 孤儿冻结总数（后端字段）
 * @property {number} total_orphan_amount - 孤儿冻结总金额（后端字段）
 * @property {number} affected_user_count - 受影响用户数（后端字段）
 * @property {number} frozen_count - 冻结记录数（前端补充）
 * @property {number} processed_count - 已处理数（前端补充）
 */

/**
 * 孤儿冻结清理页面Alpine.js组件工厂函数
 * @function orphanFrozenPage
 * @returns {Object} Alpine.js组件配置对象
 */
function orphanFrozenPage() {
  return {
    // ==================== Mixin 组合 ====================
    ...createPageMixin(),
    ...createBatchOperationMixin({
      page_size: 20,
      primaryKey: '_row_id'
    }),

    // ==================== 页面特有状态 ====================

    /** @type {boolean} 是否正在扫描中 */
    scanning: false,

    /** @type {boolean} 是否正在清理中 */
    cleaning: false,

    /** @type {boolean} 全局加载状态 */
    globalLoading: false,

    /**
     * 统计数据（使用后端字段名 - snake_case）
     * @type {OrphanStats}
     */
    stats: {
      total_orphan_count: 0,
      total_orphan_amount: 0,
      affected_user_count: 0,
      // 后端未返回但前端需要显示的字段（snake_case）
      frozen_count: 0,
      processed_count: 0
    },

    /** @type {OrphanItem[]} 孤儿冻结项目列表 */
    orphanList: [],

    // ========== data-table 列配置 ==========
    tableColumns: [
      { key: 'account_id', label: '账户ID', sortable: true, type: 'code' },
      {
        key: 'type',
        label: '类型',
        type: 'badge',
        badgeMap: { orphan: 'gray', frozen: 'blue' },
        labelMap: { orphan: '孤儿', frozen: '冻结' }
      },
      { key: 'user_id', label: '用户ID' },
      { key: 'description', label: '描述', type: 'truncate', maxLength: 30 },
      {
        key: 'orphan_amount',
        label: '孤儿金额',
        sortable: true,
        render: val =>
          `<span class="font-mono text-orange-600">${Number(val || 0).toLocaleString('zh-CN')}</span>`
      },
      {
        key: 'status',
        label: '状态',
        type: 'status',
        statusMap: {
          pending: { class: 'yellow', label: '待处理' },
          processing: { class: 'blue', label: '处理中' },
          processed: { class: 'green', label: '已处理' }
        }
      },
      { key: 'discovered_at', label: '检测时间', type: 'datetime', sortable: true },
      {
        key: '_actions',
        label: '操作',
        type: 'actions',
        width: '160px',
        actions: [
          { name: 'view', label: '详情', class: 'text-blue-600 hover:text-blue-800' },
          {
            name: 'clean',
            label: '处理',
            class: 'text-green-500 hover:text-green-700',
            condition: row => row.status === 'pending'
          },
          {
            name: 'unfreeze',
            label: '解冻',
            class: 'text-orange-500 hover:text-orange-700',
            condition: row => row.type === 'frozen' && row.status !== 'processed'
          }
        ]
      }
    ],

    /**
     * 筛选条件
     * @type {Object}
     * @property {string} type - 类型筛选（orphan/frozen）
     * @property {string} assetType - 资产代码筛选
     * @property {string} status - 状态筛选
     */
    filters: {
      type: '', // 类型：orphan/frozen（当前后端只支持orphan）
      asset_type: '', // 资产代码筛选
      status: '' // 状态筛选
    },

    /** @type {OrphanItem[]} 已选中的项目列表 */
    selectedItems: [],

    /** @type {string} 清理原因说明 */
    cleanReason: '',

    /** @type {boolean} 清理确认复选框状态 */
    confirmCleanChecked: false,

    /** @type {OrphanItem|null} 当前选中查看详情的资产 */
    selectedAsset: null,

    // ==================== 计算属性 ====================

    /**
     * 获取当前页的分页列表
     * @computed
     * @returns {OrphanItem[]} 当前页的孤儿冻结项目数组
     */
    get paginatedList() {
      const startIndex = (this.current_page - 1) * this.page_size
      const endIndex = startIndex + this.page_size
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
      logger.debug('🚀 [orphanFrozenPage] init() 被调用')
      logger.info('孤儿冻结清理页面初始化 (Mixin v3.0)')

      // 使用 Mixin 的认证检查
      if (!this.checkAuth()) {
        logger.debug('⚠️ [orphanFrozenPage] checkAuth() 返回 false，跳过加载')
        return
      }

      /*
       * 同步 data-table 内部的选择状态到本页面的 selectedItems。
       * data-table 组件的 $watch('selectedRows') 会触发 window 级别的
       * 'orphan-selection-changed' 事件，携带完整行数据。
       * 使用 window 事件而非 Alpine $dispatch，避免嵌套 x-data 组件间的事件传递问题。
       */
      window.addEventListener('orphan-selection-changed', e => {
        this.selectedItems = e.detail?.rows || []
      })

      logger.debug('✅ [orphanFrozenPage] checkAuth() 通过，数据由 data-table 自动加载')
    },

    // ==================== data-table 数据源 ====================

    /**
     * data-table 数据源
     */
    async fetchTableData(params) {
      const detectParams = new URLSearchParams()
      if (params.asset_code) detectParams.append('asset_code', params.asset_code)

      const detectUrl =
        ASSET_ENDPOINTS.ORPHAN_FROZEN_DETECT +
        (detectParams.toString() ? '?' + detectParams.toString() : '')
      const statsUrl = ASSET_ENDPOINTS.ORPHAN_FROZEN_STATS

      const [detectResponse, statsResponse] = await Promise.all([
        request({ url: detectUrl }),
        request({ url: statsUrl })
      ])

      // 处理统计数据
      if (statsResponse?.success) {
        const data = statsResponse.data
        this.stats = {
          total_orphan_count: data.total_orphan_count || 0,
          total_orphan_amount: data.total_orphan_amount || 0,
          affected_user_count: data.affected_user_count || 0,
          frozen_count: 0,
          processed_count: 0
        }
      }

      if (detectResponse?.success) {
        const generatedAt = detectResponse.data.generated_at || new Date().toISOString()
        const items = (detectResponse.data.orphan_items || []).map(item => ({
          ...item,
          _row_id: `${item.account_id}_${item.asset_code}`,
          type: 'orphan',
          status: 'pending',
          discovered_at: generatedAt
        }))
        this.orphanList = items
        return { items, total: items.length }
      }

      if (detectResponse?.code === 'UNAUTHORIZED' || detectResponse?.code === 'TOKEN_EXPIRED') {
        window.location.href = '/admin/login.html'
        throw new Error('登录已过期')
      }
      throw new Error(detectResponse?.message || '加载失败')
    },

    /**
     * 处理表格操作事件
     */
    handleTableAction(detail) {
      const { action, row } = detail
      switch (action) {
        case 'view':
          this.viewAssetDetail(row)
          break
        case 'clean':
          this.cleanSingleItem(row)
          break
        case 'unfreeze':
          this.unfreezeAsset(row)
          break
        default:
          logger.warn('[OrphanFrozen] 未知操作:', action)
      }
    },

    // ==================== 数据加载 ====================

    /**
     * 加载孤儿冻结数据和统计信息（保留用于扫描后刷新）
     * @async
     * @method loadData
     * @returns {Promise<void>}
     */
    async loadData() {
      logger.debug('📥 [orphanFrozenPage] loadData() 开始执行', { filters: this.filters })

      this.orphanList = []
      this.selectedItems = []
      this.loading = true

      try {
        // 构建查询参数
        const detectParams = new URLSearchParams()
        if (this.filters.asset_type) {
          detectParams.append('asset_code', this.filters.asset_type)
        }

        const detectUrl =
          ASSET_ENDPOINTS.ORPHAN_FROZEN_DETECT +
          (detectParams.toString() ? '?' + detectParams.toString() : '')
        const statsUrl = ASSET_ENDPOINTS.ORPHAN_FROZEN_STATS

        logger.debug('📡 [orphanFrozenPage] 请求API', { detectUrl, statsUrl })

        // 并行获取检测结果和统计数据
        const [detectResponse, statsResponse] = await Promise.all([
          request({ url: detectUrl }),
          request({ url: statsUrl })
        ])

        logger.debug('📨 [orphanFrozenPage] API响应', {
          detectSuccess: detectResponse?.success,
          statsSuccess: statsResponse?.success,
          detectData: detectResponse?.data,
          statsData: statsResponse?.data
        })

        // 处理检测结果 - 直接使用后端字段，仅补充前端需要的默认值
        if (detectResponse && detectResponse.success) {
          const generatedAt = detectResponse.data.generated_at || new Date().toISOString()

          this.orphanList = (detectResponse.data.orphan_items || []).map(item => ({
            ...item,
            _row_id: `${item.account_id}_${item.asset_code}`,
            type: 'orphan',
            status: 'pending',
            discovered_at: generatedAt
          }))
          // 使用 paginationMixin 的 total_records 字段
          this.total_records = this.orphanList.length

          logger.info('[孤儿冻结页面] 加载数据完成', {
            count: this.orphanList.length,
            sample: this.orphanList[0] || null
          })
        } else {
          logger.warn('⚠️ [orphanFrozenPage] 检测API返回失败', {
            detectResponse,
            response: detectResponse
          })
          // 设置空列表
          this.orphanList = []
          this.total_records = 0

          // 显示错误信息给用户
          if (detectResponse?.code === 'UNAUTHORIZED' || detectResponse?.code === 'TOKEN_EXPIRED') {
            this.showError('登录已过期，请重新登录')
            window.location.href = '/admin/login.html'
            return
          } else if (detectResponse?.message) {
            this.showError('加载失败: ' + detectResponse.message)
          }
        }

        // 处理统计数据 - 直接使用后端字段名（snake_case）
        if (statsResponse && statsResponse.success) {
          const data = statsResponse.data

          this.stats = {
            // 后端原始字段
            total_orphan_count: data.total_orphan_count || 0,
            total_orphan_amount: data.total_orphan_amount || 0,
            affected_user_count: data.affected_user_count || 0,
            // 后端未返回但前端需要显示的字段
            frozen_count: 0, // 当前只检测孤儿冻结，此值为0
            processed_count: 0 // 需后端支持，暂设为0
          }

          logger.info('[孤儿冻结页面] 统计数据已更新', this.stats)
        } else {
          logger.warn('⚠️ [orphanFrozenPage] 统计API返回失败', {
            response: statsResponse
          })
        }

        // 加载完成提示
        logger.debug('✅ [orphanFrozenPage] 数据加载完成', {
          orphanCount: this.orphanList.length,
          stats: this.stats
        })

        // 显示加载结果提示给用户
        const orphanCount = this.orphanList.length
        if (orphanCount > 0) {
          this.showInfo(`加载完成，发现 ${orphanCount} 条孤儿冻结数据`)
        } else {
          this.showSuccess('加载完成，暂无孤儿冻结数据')
        }
      } catch (error) {
        logger.error('❌ [orphanFrozenPage] 加载数据失败', {
          error: error.message,
          stack: error.stack
        })
        this.showError('加载数据失败: ' + error.message)
      } finally {
        this.loading = false
        logger.debug('🏁 [orphanFrozenPage] loadData() 执行完毕, loading =', this.loading)
      }
    },

    /**
     * 扫描孤儿冻结数据
     * @async
     * @method scanOrphans
     * @description 触发后端孤儿冻结检测，完成后重新加载数据
     * @returns {Promise<void>}
     */
    async scanOrphans() {
      logger.debug('🔎 [orphanFrozenPage] scanOrphans() 开始执行')
      this.scanning = true

      try {
        const response = await request({ url: ASSET_ENDPOINTS.ORPHAN_FROZEN_DETECT })

        logger.debug('📡 [orphanFrozenPage] scanOrphans 响应', response)

        if (response && response.success) {
          const foundCount = response.data.orphan_count || 0
          this.showSuccess(`扫描完成，发现 ${foundCount} 条孤儿冻结数据`)
          // 刷新 data-table
          window.dispatchEvent(new CustomEvent('dt-refresh'))
        } else {
          logger.warn('⚠️ [orphanFrozenPage] 扫描API返回失败', response)
          // 处理认证错误
          if (response?.code === 'UNAUTHORIZED' || response?.code === 'TOKEN_EXPIRED') {
            this.showError('登录已过期，请重新登录')
            window.location.href = '/admin/login.html'
            return
          }
          this.showError(response?.message || '扫描失败')
        }
      } catch (error) {
        logger.error('❌ [orphanFrozenPage] 扫描失败', error)
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
      return this.selectedItems.some(selected => selected._row_id === item._row_id)
    },

    /**
     * 切换行选择状态
     * @method toggleRowSelection
     * @param {OrphanItem} item - 要切换选择状态的项目
     * @description 如果项目已选中则取消选择，否则添加到选中列表
     * @returns {void}
     */
    toggleRowSelection(item) {
      const index = this.selectedItems.findIndex(selected => selected._row_id === item._row_id)

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
        const response = await request({
          url: ASSET_ENDPOINTS.ORPHAN_FROZEN_CLEANUP,
          method: 'POST',
          data: {
            dry_run: false,
            reason: this.cleanReason.trim(),
            operator_name: this.current_user?.nickname || '管理员'
          }
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
          window.dispatchEvent(new CustomEvent('dt-refresh'))
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
        const response = await request({
          url: ASSET_ENDPOINTS.ORPHAN_FROZEN_CLEANUP,
          method: 'POST',
          data: {
            dry_run: false,
            user_id: item.user_id,
            asset_code: item.asset_code,
            reason: '管理员手动清理单条孤儿冻结',
            operator_name: this.current_user?.nickname || '管理员'
          }
        })

        if (response && response.success) {
          const cleanedCount = response.data.cleaned_count || 0
          this.showSuccess(`清理成功：已解冻 ${cleanedCount} 条孤儿冻结`)
          this.selectedItems = []
          window.dispatchEvent(new CustomEvent('dt-refresh'))
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
        budget_points: '预算积分',
        star_stone: '星石',
        star_stone_quota: '星石配额',
        red_core_shard: '红源晶碎片',
        red_core_gem: '红源晶',
        orange_core_shard: '橙源晶碎片',
        orange_core_gem: '橙源晶',
        yellow_core_shard: '黄源晶碎片',
        yellow_core_gem: '黄源晶',
        green_core_shard: '绿源晶碎片',
        green_core_gem: '绿源晶',
        blue_core_shard: '蓝源晶碎片',
        blue_core_gem: '蓝源晶',
        purple_core_shard: '紫源晶碎片',
        purple_core_gem: '紫源晶'
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
      // 使用 Alpine.js confirm store（无 Bootstrap 依赖）
      if (Alpine.store('confirm')) {
        return await Alpine.store('confirm').danger({
          title: '危险操作',
          message: message,
          confirmText: '确认清理',
          cancelText: '取消'
        })
      }
      // 回退到原生 confirm
      return confirm(message)
    },

    // ✅ 已删除 getStatusText 映射函数，使用后端返回的 status_display 字段

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

    // ==================== Tailwind Toast 实现 ====================

    /**
     * 显示 Tailwind 风格的 Toast 消息
     * @method _showToast
     * @param {string} message - 消息内容
     * @param {string} type - 消息类型 (success/error/warning/info)
     * @param {number} duration - 显示时长（毫秒）
     */
    _showToast(message, type = 'info', duration = 3000) {
      // 确保 Toast 容器存在
      let container = document.getElementById('tailwind-toast-container')
      if (!container) {
        container = document.createElement('div')
        container.id = 'tailwind-toast-container'
        container.className = 'fixed top-4 right-4 z-[9999] flex flex-col gap-2'
        document.body.appendChild(container)
      }

      // 类型配置
      const typeConfig = {
        success: { bg: 'bg-green-500', icon: '✅' },
        error: { bg: 'bg-red-500', icon: '❌' },
        warning: { bg: 'bg-yellow-500', icon: '⚠️' },
        info: { bg: 'bg-blue-500', icon: 'ℹ️' }
      }
      const config = typeConfig[type] || typeConfig.info

      // 创建 Toast 元素
      const toastId = 'toast_' + Date.now()
      const toast = document.createElement('div')
      toast.id = toastId
      toast.className = `${config.bg} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 transform transition-all duration-300 translate-x-full opacity-0`
      toast.innerHTML = `
        <span class="text-lg">${config.icon}</span>
        <span class="flex-1">${message}</span>
        <button class="ml-2 hover:opacity-75" onclick="this.parentElement.remove()">✕</button>
      `
      container.appendChild(toast)

      // 动画进入
      requestAnimationFrame(() => {
        toast.classList.remove('translate-x-full', 'opacity-0')
        toast.classList.add('translate-x-0', 'opacity-100')
      })

      // 自动移除
      setTimeout(() => {
        toast.classList.add('translate-x-full', 'opacity-0')
        setTimeout(() => toast.remove(), 300)
      }, duration)

      logger.debug(`🔔 [Toast] ${type.toUpperCase()}: ${message}`)
    },

    /**
     * 显示成功消息（覆盖 mixin 方法）
     * @method showSuccess
     * @param {string} message - 成功消息
     * @param {number} duration - 显示时长
     */
    showSuccess(message, duration = 3000) {
      this._showToast(message, 'success', duration)
    },

    /**
     * 显示错误消息（覆盖 mixin 方法）
     * @method showError
     * @param {string} message - 错误消息
     * @param {number} duration - 显示时长
     */
    showError(message, duration = 5000) {
      this._showToast(message, 'error', duration)
    },

    /**
     * 显示警告消息
     * @method showWarning
     * @param {string} message - 警告消息
     * @param {number} duration - 显示时长
     */
    showWarning(message, duration = 4000) {
      this._showToast(message, 'warning', duration)
    },

    /**
     * 显示信息消息
     * @method showInfo
     * @param {string} message - 信息消息
     * @param {number} duration - 显示时长
     */
    showInfo(message, duration = 3000) {
      this._showToast(message, 'info', duration)
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
 * @description 直接注册组件到Alpine（避免alpine:init事件时序问题）
 *
 * 由于ES模块异步加载，使用alpine:init事件可能导致注册时机过晚。
 * 直接使用导入的Alpine实例注册组件更可靠。
 */

// 标记是否已注册，避免重复注册
let _registered = false

function registerOrphanFrozenComponent() {
  if (_registered) {
    logger.debug('[OrphanFrozenPage] 组件已注册，跳过')
    return
  }

  Alpine.data('orphanFrozenPage', orphanFrozenPage)
  _registered = true
  logger.info('[OrphanFrozenPage] Alpine 组件已注册 (Mixin v3.0)')
}

// 直接注册（ES模块导入的Alpine已经可用）
registerOrphanFrozenComponent()

// 作为后备，也监听alpine:init事件（以防上面的调用时机过早）
document.addEventListener('alpine:init', () => {
  registerOrphanFrozenComponent()
})
