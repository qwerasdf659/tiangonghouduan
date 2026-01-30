/**
 * User Hierarchy Page - Alpine.js Mixin 重构版
 * 用户层级管理页面组件
 *
 * @file public/admin/js/pages/user-hierarchy.js
 * @description 用户层级关系管理、下级查看、激活/停用等功能
 * @version 3.0.0 (Mixin 重构版)
 * @date 2026-01-23
 * @module user/pages/user-hierarchy
 *
 * 重构说明：
 * - 使用 createCrudMixin 组合多个 Mixin
 * - 减少约 80 行重复代码
 * - 保留所有原有业务功能
 */

import { logger } from '../../../utils/logger.js'
import { USER_ENDPOINTS } from '../../../api/user.js'
import { buildURL, request } from '../../../api/base.js'
import { Alpine, createCrudMixin } from '../../../alpine/index.js'

// API请求封装
const apiRequest = async (url, options = {}) => {
  return await request({ url, ...options })
}
/**
 * @typedef {Object} HierarchyFilters
 * @property {string} role_level - 角色等级筛选
 * @property {string} status - 状态筛选（active/inactive）
 * @property {string} superior_id - 上级用户ID筛选
 */

/**
 * @typedef {Object} HierarchyStats
 * @property {number} total - 总数
 * @property {number} active - 活跃数
 * @property {number} inactive - 非活跃数
 * @property {number} storeAssigned - 已分配门店数
 */

/**
 * @typedef {Object} HierarchyForm
 * @property {string} user_id - 用户ID
 * @property {string} role_id - 角色ID
 * @property {string} superior_id - 上级用户ID
 * @property {string} store_id - 门店ID
 */

/**
 * @typedef {Object} DeactivateForm
 * @property {number|null} user_id - 要停用的用户ID
 * @property {string} user_info - 用户信息描述
 * @property {string} reason - 停用原因
 * @property {boolean} include_subordinates - 是否同时停用下级
 */

/**
 * @typedef {Object} HierarchyItem
 * @property {number} user_id - 用户ID
 * @property {string} username - 用户名
 * @property {string} nickname - 昵称
 * @property {string} role_name - 角色名称
 * @property {number} superior_id - 上级用户ID
 * @property {string} superior_name - 上级名称
 * @property {number} store_id - 门店ID
 * @property {string} store_name - 门店名称
 * @property {boolean} is_active - 是否激活
 * @property {string} created_at - 创建时间
 */

document.addEventListener('alpine:init', () => {
  /**
   * 用户层级管理页面组件
   *
   * @description 管理用户层级关系，包括创建层级、查看下级、激活/停用用户层级权限、数据导出等功能
   * @returns {Object} Alpine.js组件配置对象
   *
   * @property {Array<HierarchyItem>} hierarchyList - 层级列表数据
   * @property {Array<Object>} rolesList - 可选角色列表
   * @property {HierarchyFilters} filters - 筛选条件
   * @property {HierarchyStats} stats - 统计数据
   * @property {HierarchyForm} form - 创建表单数据
   * @property {DeactivateForm} deactivateForm - 停用表单数据
   * @property {Array<Object>} subordinates - 下级用户列表
   * @property {boolean} subordinatesLoading - 下级列表加载状态
   *
   * @fires init - 组件初始化
   * @fires loadData - 加载层级列表
   * @fires loadRoles - 加载角色列表
   * @fires saveHierarchy - 保存层级关系
   * @fires viewSubordinates - 查看下级
   * @fires confirmDeactivate - 确认停用
   * @fires activateUser - 激活用户
   * @fires exportData - 导出数据
   *
   * @example
   * // 在HTML中使用
   * <div x-data="userHierarchyPage()">
   *   <button @click="openCreateModal()">创建层级</button>
   * </div>
   */
  Alpine.data('userHierarchyPage', () => ({
    // ==================== Mixin 组合 ====================
    ...createCrudMixin({ page_size: 20 }),

    // ==================== 页面特有状态 ====================

    /**
     * 用户层级列表数据
     * @type {Array<HierarchyItem>}
     */
    hierarchyList: [],

    /**
     * 可选角色列表
     * @type {Array<Object>}
     */
    rolesList: [],

    /**
     * 筛选条件
     * @type {HierarchyFilters}
     */
    filters: {
      role_level: '',
      status: '',
      superior_id: ''
    },

    /**
     * 统计数据
     * @type {HierarchyStats}
     */
    stats: {
      total: 0,
      active: 0,
      inactive: 0,
      storeAssigned: 0
    },

    /**
     * 创建层级表单数据
     * @type {HierarchyForm}
     */
    form: {
      user_id: '',
      role_id: '',
      superior_id: '',
      store_id: ''
    },

    /**
     * 停用用户表单数据
     * @type {DeactivateForm}
     */
    deactivateForm: {
      user_id: null,
      user_info: '',
      reason: '',
      include_subordinates: false
    },

    /**
     * 下级用户列表
     * @type {Array<Object>}
     */
    subordinates: [],

    /**
     * 下级列表加载状态
     * @type {boolean}
     */
    subordinatesLoading: false,

    // ==================== 生命周期 ====================

    /**
     * 初始化组件
     *
     * @description 执行认证检查并加载角色列表和层级数据
     * @returns {void}
     */
    init() {
      logger.info('用户层级管理页面初始化 (Mixin v3.0)')

      // 使用 Mixin 的认证检查
      if (!this.checkAuth()) {
        return
      }

      this.loadRoles()
      this.loadData()
    },

    // ==================== 数据加载方法 ====================

    /**
     * 加载角色列表
     *
     * @description 从API获取可分配的角色列表
     * @async
     * @returns {Promise<void>} 无返回值
     */
    async loadRoles() {
      const result = await this.apiGet(USER_ENDPOINTS.HIERARCHY_ROLES, {}, { showError: false })
      if (result.success) {
        this.rolesList = result.data || []
      }
    },

    /**
     * 加载层级列表（主数据加载方法）
     *
     * @description 根据当前筛选条件和分页参数加载用户层级数据
     * @async
     * @returns {Promise<void>} 无返回值
     * @throws {Error} 当API请求失败时抛出错误
     */
    async loadData() {
      logger.info('[UserHierarchy] 开始加载层级列表...')

      const result = await this.withLoading(async () => {
        const params = {
          ...this.buildPaginationParams()
        }

        if (this.filters.role_level) params.role_level = this.filters.role_level
        if (this.filters.status) params.is_active = this.filters.status
        if (this.filters.superior_id) params.superior_user_id = this.filters.superior_id

        const response = await apiRequest(
          `${USER_ENDPOINTS.HIERARCHY_LIST}?${new URLSearchParams(params)}`
        )

        if (response && response.success) {
          return response.data
        } else {
          throw new Error(response?.message || '加载层级列表失败')
        }
      })

      if (result.success) {
        this.hierarchyList = result.data.rows || []

        // 更新分页信息
        this.total_records = result.data.count || 0
        if (result.data.pagination?.total_pages) {
          // 后端直接提供了总页数
        }

        this._updateStatistics(result.data)
        logger.info('[UserHierarchy] 层级列表加载完成', {
          count: this.total_records,
          rows: this.hierarchyList.length
        })
      } else {
        logger.error('[UserHierarchy] 层级列表加载失败', result)
      }
    },

    /**
     * 更新统计信息（私有方法）
     *
     * @description 根据层级数据计算各项统计指标
     * @private
     * @param {Object} data - API返回的层级数据
     * @param {Array} data.rows - 层级列表
     * @param {number} data.count - 总记录数
     * @returns {void}
     */
    _updateStatistics(data) {
      const rows = data.rows || []
      this.stats.total = data.count || 0
      this.stats.active = rows.filter(r => r.is_active).length
      this.stats.inactive = rows.filter(r => !r.is_active).length
      this.stats.storeAssigned = rows.filter(r => r.store_id).length
    },

    // ==================== 筛选方法 ====================

    /**
     * 刷新数据（带反馈）
     *
     * @description 刷新层级列表数据并显示反馈
     * @async
     * @returns {Promise<void>}
     */
    async refreshData() {
      logger.info('[UserHierarchy] 用户点击刷新按钮')
      try {
        await this.loadData()
        this.showSuccess('刷新成功')
      } catch (error) {
        logger.error('[UserHierarchy] 刷新失败', error)
        this.showError('刷新失败: ' + error.message)
      }
    },

    /**
     * 应用筛选条件
     *
     * @description 重置分页并根据当前筛选条件重新加载数据
     * @returns {void}
     */
    applyFilters() {
      this.resetPagination()
      this.loadData()
    },

    /**
     * 重置筛选条件
     *
     * @description 清空所有筛选条件并重新加载数据
     * @returns {void}
     */
    resetFilters() {
      this.filters = {
        role_level: '',
        status: '',
        superior_id: ''
      }
      this.resetPagination()
      this.loadData()
    },

    // ==================== 业务方法 ====================

    /**
     * 格式化日期显示
     *
     * @description 将日期值转换为本地化的日期字符串
     * @param {Object|string|null} dateValue - 日期值，可以是包含beijing属性的对象或日期字符串
     * @returns {string} 格式化后的日期字符串，无效值返回'-'
     */
    formatDate(dateValue) {
      if (!dateValue) return '-'
      if (typeof dateValue === 'object' && dateValue.beijing) {
        return dateValue.beijing
      }
      if (typeof dateValue === 'string') {
        return new Date(dateValue).toLocaleString('zh-CN')
      }
      return '-'
    },

    /**
     * 打开创建层级关系模态框
     *
     * @description 重置表单并显示创建模态框
     * @returns {void}
     */
    openCreateModal() {
      this.form = { user_id: '', role_id: '', superior_id: '', store_id: '' }
      this.showModal('hierarchyModal')
    },

    /**
     * 保存层级关系
     *
     * @description 提交创建层级关系的请求
     * @async
     * @returns {Promise<void>} 无返回值
     * @throws {Error} 当必填字段为空时提示警告
     */
    async saveHierarchy() {
      if (!this.form.user_id || !this.form.role_id) {
        this.showWarning('请填写必填字段')
        return
      }

      const result = await this.apiPost(
        USER_ENDPOINTS.HIERARCHY_CREATE,
        {
          user_id: parseInt(this.form.user_id),
          role_id: parseInt(this.form.role_id),
          superior_user_id: this.form.superior_id ? parseInt(this.form.superior_id) : null,
          store_id: this.form.store_id ? parseInt(this.form.store_id) : null
        },
        { showSuccess: true, successMessage: '创建层级关系成功' }
      )

      if (result.success) {
        this.hideModal('hierarchyModal')
        this.loadData()
      }
    },

    /**
     * 查看用户下级列表
     *
     * @description 加载并显示指定用户的所有下级用户
     * @async
     * @param {number} userId - 要查看下级的用户ID
     * @returns {Promise<void>} 无返回值
     */
    async viewSubordinates(userId) {
      this.subordinatesLoading = true
      this.subordinates = []
      this.showModal('subordinatesModal')

      const result = await this.withLoading(
        async () => {
          const response = await apiRequest(
            buildURL(USER_ENDPOINTS.HIERARCHY_SUBORDINATES, { user_id: userId })
          )
          if (response.success) {
            return response.data.subordinates || []
          }
          throw new Error(response.message || '加载下级失败')
        },
        { showError: true }
      )

      this.subordinatesLoading = false

      if (result.success) {
        this.subordinates = result.data
      }
    },

    /**
     * 打开停用用户模态框
     *
     * @description 初始化停用表单并显示停用确认模态框
     * @param {number} user_id - 要停用的用户ID
     * @param {string} user_info - 用户信息描述（如昵称）
     * @returns {void}
     */
    openDeactivateModal(user_id, user_info) {
      // 检查是否尝试停用自己
      const current_user = this.getCurrentUser()
      const current_userId = current_user?.user_id

      if (current_userId && parseInt(user_id) === parseInt(current_userId)) {
        this.showWarning('不能停用自己的权限')
        logger.warn('[UserHierarchy] 阻止停用自己的权限', { user_id, current_userId })
        return
      }

      this.deactivateForm = {
        user_id,
        user_info: `${user_info} (ID: ${user_id})`,
        reason: '',
        include_subordinates: false
      }
      this.showModal('deactivateModal')
    },

    /**
     * 确认停用用户层级权限
     *
     * @description 提交停用用户层级权限的请求，可选择是否同时停用下级
     * @async
     * @returns {Promise<void>} 无返回值
     * @throws {Error} 当停用原因为空时提示警告
     */
    async confirmDeactivate() {
      if (!this.deactivateForm.reason.trim()) {
        this.showWarning('请填写停用原因')
        return
      }

      // 双重检查：防止停用自己
      const current_user = this.getCurrentUser()
      const current_userId = current_user?.user_id
      if (current_userId && parseInt(this.deactivateForm.user_id) === parseInt(current_userId)) {
        this.showWarning('不能停用自己的权限')
        this.hideModal('deactivateModal')
        return
      }

      const result = await this.apiPost(
        buildURL(USER_ENDPOINTS.HIERARCHY_DEACTIVATE, {
          user_id: this.deactivateForm.user_id
        }),
        {
          reason: this.deactivateForm.reason,
          include_subordinates: this.deactivateForm.include_subordinates
        },
        { global: true }
      )

      if (result.success) {
        this.showSuccess(`成功停用 ${result.data.deactivated_count} 个用户的权限`)
        this.hideModal('deactivateModal')
        this.loadData()
      } else {
        // 改进错误提示：解析后端错误消息
        const errorMessage = result.message || '停用失败'
        if (errorMessage.includes('无权限操作该用户')) {
          this.showError('无权限停用该用户，只能停用您的下级用户')
        } else {
          this.showError(errorMessage)
        }
      }
    },

    /**
     * 激活用户层级权限
     *
     * @description 激活指定用户的层级权限，需用户确认
     * @async
     * @param {number} userId - 要激活的用户ID
     * @returns {Promise<void>} 无返回值
     */
    async activateUser(userId) {
      const result = await this.confirmAndExecute(
        '确定要激活该用户的层级权限吗？',
        async () => {
          const response = await apiRequest(
            buildURL(USER_ENDPOINTS.HIERARCHY_ACTIVATE, { user_id: userId }),
            {
              method: 'POST',
              body: JSON.stringify({ include_subordinates: false })
            }
          )
          if (response.success) {
            return response.data
          }
          throw new Error(response.message || '激活失败')
        },
        { showSuccess: true, successMessage: '激活成功' }
      )

      if (result.success) {
        this.loadData()
      }
    },

    /**
     * 导出用户层级数据为CSV文件
     *
     * @description 将当前层级列表数据导出为CSV格式文件，包含统计汇总和明细数据
     *              支持中文Excel打开（添加BOM头）
     * @returns {void}
     * @throws {Error} 当导出过程发生错误时显示错误提示
     *
     * @example
     * // 点击导出按钮
     * <button @click="exportData()">导出CSV</button>
     */
    exportData() {
      try {
        if (!this.hierarchyList || this.hierarchyList.length === 0) {
          this.showWarning('没有可导出的数据')
          return
        }

        // 构建导出数据
        const exportData = []

        // 添加汇总统计
        exportData.push(['====== 用户层级统计 ======'])
        exportData.push(['指标', '数值'])
        exportData.push(['总数', this.stats.total || 0])
        exportData.push(['活跃', this.stats.active || 0])
        exportData.push(['停用', this.stats.inactive || 0])
        exportData.push(['已分配门店', this.stats.storeAssigned || 0])
        exportData.push([''])

        // 添加明细数据
        exportData.push(['====== 用户层级明细 ======'])
        exportData.push([
          '用户ID',
          '用户名',
          '昵称',
          '角色',
          '上级ID',
          '上级名称',
          '门店',
          '状态',
          '创建时间'
        ])

        this.hierarchyList.forEach(item => {
          exportData.push([
            item.user_id || item.userId || '-',
            item.username || '-',
            item.nickname || item.user_nickname || '-',
            item.role_name || item.roleName || '-',
            item.superior_id || item.superiorId || '-',
            item.superior_name || item.superiorName || '-',
            item.store_name || item.storeName || '-',
            item.status === 'active' ? '活跃' : '停用',
            item.created_at || item.createdAt || '-'
          ])
        })

        // 生成CSV内容
        const csvContent = exportData
          .map(row =>
            row
              .map(cell => {
                // 处理包含逗号或引号的单元格
                const cellStr = String(cell)
                if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                  return `"${cellStr.replace(/"/g, '""')}"`
                }
                return cellStr
              })
              .join(',')
          )
          .join('\n')

        // 添加BOM以支持中文Excel打开
        const BOM = '\uFEFF'
        const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })

        // 生成下载链接
        const link = document.createElement('a')
        const url = URL.createObjectURL(blob)
        const now = new Date()
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`

        link.setAttribute('href', url)
        link.setAttribute('download', `用户层级数据_${dateStr}.csv`)
        link.style.visibility = 'hidden'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)

        this.showSuccess('导出成功')
      } catch (error) {
        logger.error('导出失败:', error)
        this.showError('导出失败: ' + error.message)
      }
    }
  }))

  logger.info('[UserHierarchy] Alpine 组件已注册 (Mixin v3.0)')
})
