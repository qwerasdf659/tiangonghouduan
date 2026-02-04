/**
 * 数据下钻 Mixin（P1-15: 数据下钻路径标准化）
 *
 * @description 提供标准化的数据下钻交互功能：
 * - 点击数字→弹窗列表
 * - 点击行→侧边抽屉
 * - 点击图表点→Tooltip
 * - 点击"查看更多"→跳转
 *
 * @version 1.0.0
 * @date 2026-02-03
 *
 * @example
 * import { drillDownMixin } from '@/alpine/mixins/index.js'
 *
 * function myPage() {
 *   return {
 *     ...drillDownMixin(),
 *     async handleStatClick(statKey) {
 *       await this.drillDownToList(statKey, {
 *         title: '待审核列表',
 *         loadFn: () => this.loadPendingList()
 *       })
 *     }
 *   }
 * }
 */

import { logger } from '../../utils/logger.js'

/**
 * 弹窗/抽屉尺寸规范
 */
export const DRILL_DOWN_SIZES = {
  /** 小型弹窗: 480px, 60vh - 简单确认 */
  small: { width: '480px', maxHeight: '60vh' },
  /** 中型弹窗: 640px, 70vh - 列表展示 */
  medium: { width: '640px', maxHeight: '70vh' },
  /** 大型弹窗: 800px, 80vh - 复杂详情 */
  large: { width: '800px', maxHeight: '80vh' },
  /** 超大弹窗: 1000px, 85vh - 综合视图 */
  xlarge: { width: '1000px', maxHeight: '85vh' },
  /** 侧边抽屉: 480px, 100vh - 用户详情 */
  drawer: { width: '480px', maxHeight: '100vh' },
  /** 宽侧边抽屉: 600px, 100vh - 复杂详情 */
  drawerWide: { width: '600px', maxHeight: '100vh' }
}

/**
 * 下钻类型枚举
 */
export const DRILL_DOWN_TYPES = {
  /** 数字点击 → 弹窗列表 */
  STAT_TO_LIST: 'stat_to_list',
  /** 行点击 → 侧边抽屉 */
  ROW_TO_DRAWER: 'row_to_drawer',
  /** 图表点击 → Tooltip/弹窗 */
  CHART_TO_DETAIL: 'chart_to_detail',
  /** 查看更多 → 页面跳转 */
  LINK_TO_PAGE: 'link_to_page'
}

/**
 * 数据下钻 Mixin
 * @returns {Object} Mixin 对象
 */
export function drillDownMixin() {
  return {
    // ========== 下钻状态 ==========

    /** 下钻弹窗是否显示 */
    drillDownModalOpen: false,

    /** 下钻侧边抽屉是否显示 */
    drillDownDrawerOpen: false,

    /** 当前下钻类型 */
    drillDownType: '',

    /** 当前下钻尺寸 */
    drillDownSize: 'medium',

    /** 下钻弹窗/抽屉标题 */
    drillDownTitle: '',

    /** 下钻数据列表 */
    drillDownList: [],

    /** 下钻详情数据 */
    drillDownDetail: null,

    /** 下钻加载状态 */
    drillDownLoading: false,

    /** 下钻分页 */
    drillDownPagination: {
      page: 1,
      page_size: 10,
      total: 0
    },

    /** 下钻历史栈（支持面包屑导航） */
    drillDownHistory: [],

    // ========== 计算属性 (Getter) ==========

    /**
     * 获取当前下钻尺寸样式
     * @returns {Object} 样式对象
     */
    get drillDownStyle() {
      const size = DRILL_DOWN_SIZES[this.drillDownSize] || DRILL_DOWN_SIZES.medium
      return {
        width: size.width,
        maxHeight: size.maxHeight
      }
    },

    /**
     * 获取下钻总页数
     * @returns {number}
     */
    get drillDownTotalPages() {
      return Math.ceil(this.drillDownPagination.total / this.drillDownPagination.page_size) || 1
    },

    // ========== 下钻方法 ==========

    /**
     * 统计数字下钻到列表弹窗
     * @param {string} statKey - 统计项标识
     * @param {Object} options - 配置选项
     * @param {string} options.title - 弹窗标题
     * @param {Function} options.loadFn - 数据加载函数
     * @param {string} [options.size='medium'] - 弹窗尺寸
     * @param {Object} [options.filters] - 初始筛选条件
     */
    async drillDownToList(statKey, options = {}) {
      const { title, loadFn, size = 'medium', filters = {} } = options

      logger.debug('[DrillDown] 下钻到列表:', statKey, options)

      // 记录下钻历史
      this.pushDrillDownHistory({
        type: DRILL_DOWN_TYPES.STAT_TO_LIST,
        key: statKey,
        title
      })

      this.drillDownType = DRILL_DOWN_TYPES.STAT_TO_LIST
      this.drillDownSize = size
      this.drillDownTitle = title || `${statKey} 详情列表`
      this.drillDownList = []
      this.drillDownPagination = { page: 1, page_size: 10, total: 0, ...filters }
      this.drillDownModalOpen = true

      // 加载数据
      if (typeof loadFn === 'function') {
        await this.loadDrillDownData(loadFn)
      }
    },

    /**
     * 行点击下钻到详情抽屉
     * @param {Object} rowData - 行数据
     * @param {Object} options - 配置选项
     * @param {string} options.title - 抽屉标题
     * @param {Function} [options.loadFn] - 详情加载函数
     * @param {string} [options.size='drawer'] - 抽屉尺寸
     */
    async drillDownToDrawer(rowData, options = {}) {
      const { title, loadFn, size = 'drawer' } = options

      logger.debug('[DrillDown] 下钻到抽屉:', rowData, options)

      // 记录下钻历史
      this.pushDrillDownHistory({
        type: DRILL_DOWN_TYPES.ROW_TO_DRAWER,
        data: rowData,
        title
      })

      this.drillDownType = DRILL_DOWN_TYPES.ROW_TO_DRAWER
      this.drillDownSize = size
      this.drillDownTitle = title || '详情'
      this.drillDownDetail = rowData
      this.drillDownDrawerOpen = true

      // 如果需要加载更多详情数据
      if (typeof loadFn === 'function') {
        this.drillDownLoading = true
        try {
          const detail = await loadFn(rowData)
          this.drillDownDetail = { ...rowData, ...detail }
        } catch (error) {
          logger.error('[DrillDown] 加载详情失败:', error)
          this.showError?.('加载详情失败')
        } finally {
          this.drillDownLoading = false
        }
      }
    },

    /**
     * 图表点击下钻
     * @param {Object} chartPoint - 图表数据点
     * @param {Object} options - 配置选项
     */
    async drillDownFromChart(chartPoint, options = {}) {
      const { title, loadFn, size = 'medium' } = options

      logger.debug('[DrillDown] 图表下钻:', chartPoint, options)

      this.pushDrillDownHistory({
        type: DRILL_DOWN_TYPES.CHART_TO_DETAIL,
        point: chartPoint,
        title
      })

      this.drillDownType = DRILL_DOWN_TYPES.CHART_TO_DETAIL
      this.drillDownSize = size
      this.drillDownTitle = title || `${chartPoint.name || chartPoint.date || ''} 详情`
      this.drillDownDetail = chartPoint
      this.drillDownModalOpen = true

      if (typeof loadFn === 'function') {
        await this.loadDrillDownData(loadFn)
      }
    },

    /**
     * 页面跳转下钻
     * @param {string} url - 目标URL
     * @param {Object} options - 配置选项
     * @param {boolean} [options.newTab=false] - 是否新标签页打开
     * @param {Object} [options.params] - URL参数
     */
    drillDownToPage(url, options = {}) {
      const { newTab = false, params = {} } = options

      logger.debug('[DrillDown] 跳转到页面:', url, options)

      // 构建URL参数
      const queryString = Object.keys(params).length > 0
        ? '?' + new URLSearchParams(params).toString()
        : ''
      const targetUrl = url + queryString

      if (newTab) {
        window.open(targetUrl, '_blank')
      } else {
        window.location.href = targetUrl
      }
    },

    /**
     * 加载下钻数据
     * @param {Function} loadFn - 数据加载函数
     */
    async loadDrillDownData(loadFn) {
      this.drillDownLoading = true
      try {
        const result = await loadFn(this.drillDownPagination)
        if (result) {
          if (Array.isArray(result)) {
            this.drillDownList = result
          } else if (result.list || result.items || result.data) {
            this.drillDownList = result.list || result.items || result.data
            if (result.pagination) {
              this.drillDownPagination.total = result.pagination.total || 0
            } else if (result.total !== undefined) {
              this.drillDownPagination.total = result.total
            }
          } else {
            this.drillDownDetail = result
          }
        }
        logger.debug('[DrillDown] 数据加载成功:', this.drillDownList.length || 1, '条')
      } catch (error) {
        logger.error('[DrillDown] 数据加载失败:', error)
        this.showError?.('数据加载失败')
        this.drillDownList = []
      } finally {
        this.drillDownLoading = false
      }
    },

    /**
     * 下钻列表分页切换
     * @param {number} page - 页码
     * @param {Function} loadFn - 数据加载函数
     */
    async changeDrillDownPage(page, loadFn) {
      this.drillDownPagination.page = page
      if (typeof loadFn === 'function') {
        await this.loadDrillDownData(loadFn)
      }
    },

    /**
     * 关闭下钻弹窗
     */
    closeDrillDownModal() {
      this.drillDownModalOpen = false
      this.drillDownList = []
      this.drillDownDetail = null
      this.drillDownTitle = ''
      logger.debug('[DrillDown] 关闭弹窗')
    },

    /**
     * 关闭下钻抽屉
     */
    closeDrillDownDrawer() {
      this.drillDownDrawerOpen = false
      this.drillDownDetail = null
      this.drillDownTitle = ''
      logger.debug('[DrillDown] 关闭抽屉')
    },

    /**
     * 关闭所有下钻UI
     */
    closeDrillDown() {
      this.closeDrillDownModal()
      this.closeDrillDownDrawer()
      this.drillDownHistory = []
    },

    // ========== 下钻历史管理 ==========

    /**
     * 添加下钻历史记录
     * @param {Object} entry - 历史记录
     */
    pushDrillDownHistory(entry) {
      this.drillDownHistory.push({
        ...entry,
        timestamp: Date.now()
      })
      // 限制历史记录数量
      if (this.drillDownHistory.length > 10) {
        this.drillDownHistory.shift()
      }
    },

    /**
     * 返回上一级下钻
     */
    goBackDrillDown() {
      if (this.drillDownHistory.length > 1) {
        this.drillDownHistory.pop()
        const prevEntry = this.drillDownHistory[this.drillDownHistory.length - 1]
        logger.debug('[DrillDown] 返回上一级:', prevEntry)
        // 可以根据 prevEntry.type 恢复之前的状态
      } else {
        this.closeDrillDown()
      }
    },

    /**
     * 检查是否可以返回上一级
     * @returns {boolean}
     */
    get canGoBackDrillDown() {
      return this.drillDownHistory.length > 1
    },

    // ========== 快捷方法 ==========

    /**
     * 快捷方法：打开用户详情抽屉
     * @param {number} userId - 用户ID
     * @param {Object} [userData] - 可选的用户数据
     */
    openUserDrawer(userId, userData = null) {
      this.drillDownToDrawer(
        userData || { user_id: userId },
        {
          title: `用户详情 #${userId}`,
          size: 'drawerWide'
        }
      )
    },

    /**
     * 快捷方法：打开待处理列表弹窗
     * @param {string} title - 标题
     * @param {Array} list - 数据列表
     * @param {number} [total] - 总数
     */
    openPendingListModal(title, list, total) {
      this.drillDownType = DRILL_DOWN_TYPES.STAT_TO_LIST
      this.drillDownSize = 'medium'
      this.drillDownTitle = title
      this.drillDownList = list || []
      this.drillDownPagination.total = total ?? list?.length ?? 0
      this.drillDownModalOpen = true
    },

    /**
     * 快捷方法：跳转到用户管理页面
     * @param {number} userId - 用户ID
     */
    navigateToUser(userId) {
      this.drillDownToPage('/admin/user-management.html', {
        newTab: true,
        params: { user_id: userId }
      })
    },

    /**
     * 快捷方法：跳转到订单详情（跳转到财务管理页面的订单详情Tab）
     * @param {string} orderId - 订单ID
     */
    navigateToOrder(orderId) {
      this.drillDownToPage('/admin/finance-management.html', {
        newTab: true,
        params: { order_id: orderId, page: 'order-detail' }
      })
    }
  }
}

export default drillDownMixin

