/**
 * 兑换市场整合页面 - Alpine.js 组件 (Mixin v3.0)
 *
 * @file public/admin/js/pages/exchange-market.js
 * @description 整合商品管理、订单管理、统计分析的完整兑换市场页面
 * @version 3.0.0
 * @date 2026-01-23
 *
 * @requires Alpine.js
 * @requires createPageMixin - 页面基础功能混入
 * @requires ECharts - 图表渲染（统计页面）
 * @requires API_ENDPOINTS.MARKETPLACE - 市场相关API端点
 *
 * @example
 * <!-- 使用导航组件 -->
 * <nav x-data="exchangeNavigation()">
 *   <template x-for="page in subPages">
 *     <button @click="switchPage(page.id)" x-text="page.title"></button>
 *   </template>
 * </nav>
 *
 * <!-- 使用主组件 -->
 * <div x-data="exchangeMarket()">
 *   <div x-show="currentPage === 'items'">商品列表</div>
 *   <div x-show="currentPage === 'orders'">订单列表</div>
 *   <div x-show="currentPage === 'stats'">统计图表</div>
 * </div>
 */

document.addEventListener('alpine:init', () => {
  console.log('[ExchangeMarket] 注册 Alpine 组件 (Mixin v3.0)...')

  // 存储当前子页面
  Alpine.store('exchangePage', 'items')

  // ==================== 导航组件 ====================

  /**
   * 兑换市场导航组件
   *
   * @description 管理兑换市场子页面导航，支持URL参数持久化
   * @returns {Object} Alpine组件对象
   *
   * @property {string} currentPage - 当前激活的页面ID
   * @property {Array<{id: string, title: string, icon: string}>} subPages - 子页面配置列表
   */
  Alpine.data('exchangeNavigation', () => ({
    ...createPageMixin(),

    /** @type {string} 当前页面ID，默认为'items' */
    currentPage: 'items',

    /**
     * 子页面配置列表
     * @type {Array<{id: string, title: string, icon: string}>}
     */
    subPages: [
      { id: 'items', title: '商品管理', icon: 'bi-box-seam' },
      { id: 'orders', title: '订单管理', icon: 'bi-receipt' },
      { id: 'stats', title: '统计分析', icon: 'bi-graph-up' }
    ],

    /**
     * 初始化导航组件
     * @description 从URL参数读取当前页面，并同步到Alpine store
     * @returns {void}
     */
    init() {
      // 从 URL 参数读取页面
      const urlParams = new URLSearchParams(window.location.search)
      const page = urlParams.get('page')
      if (page && this.subPages.some(p => p.id === page)) {
        this.currentPage = page
      }
      Alpine.store('exchangePage', this.currentPage)
      console.log('[ExchangeNavigation] 当前页面:', this.currentPage)
    },

    /**
     * 切换到指定页面
     * @description 更新当前页面状态、URL参数，并触发页面切换事件
     * @param {string} pageId - 目标页面ID ('items' | 'orders' | 'stats')
     * @fires exchange-page-changed - 页面切换自定义事件
     * @returns {void}
     */
    switchPage(pageId) {
      this.currentPage = pageId
      Alpine.store('exchangePage', pageId)

      // 更新 URL
      const url = new URL(window.location)
      url.searchParams.set('page', pageId)
      window.history.pushState({}, '', url)

      // 触发数据加载事件
      window.dispatchEvent(new CustomEvent('exchange-page-changed', { detail: pageId }))
      console.log('[ExchangeNavigation] 切换到:', pageId)
    }
  }))

  // ==================== 内容组件 ====================

  /**
   * 兑换市场内容组件
   *
   * @description 管理兑换市场的商品、订单和统计数据展示
   * @returns {Object} Alpine组件对象
   *
   * @property {Array} items - 商品列表数据
   * @property {Array} orders - 订单列表数据
   * @property {Object} exchangeStats - 统计分析数据
   */
  Alpine.data('exchangePageContent', () => ({
    ...createPageMixin(),

    // ========== 商品管理数据 ==========
    /** @type {Array<Object>} 商品列表 */
    items: [],
    /** @type {Array<Object>} 资产类型列表 */
    assetTypes: [],
    /**
     * 商品统计信息
     * @type {{total: number, active: number, lowStock: number, totalSold: number}}
     */
    itemStats: {
      total: 0,
      active: 0,
      lowStock: 0,
      totalSold: 0
    },
    /**
     * 商品筛选条件
     * @type {{status: string, cost_asset_code: string, sort_by: string}}
     */
    itemFilters: {
      status: '',
      cost_asset_code: '',
      sort_by: 'sort_order'
    },
    /** @type {number} 商品当前页码 */
    itemCurrentPage: 1,
    /** @type {number} 商品每页数量 */
    itemPageSize: 20,
    /** @type {{totalPages: number, total: number}} 商品分页信息 */
    itemPagination: { totalPages: 1, total: 0 },

    /**
     * 商品表单数据
     * @type {Object}
     */
    itemForm: {
      item_name: '',
      item_description: '',
      cost_asset_code: '',
      cost_amount: 1,
      stock: 0,
      sort_order: 100,
      status: 'active'
    },
    /** @type {number|null} 正在编辑的商品ID */
    editingItemId: null,

    // ========== 订单管理数据 ==========
    /** @type {Array<Object>} 订单列表 */
    orders: [],
    /** @type {Object|null} 当前选中的订单详情 */
    selectedOrder: null,
    /**
     * 订单统计信息
     * @type {{total: number, pending: number, shipped: number, cancelled: number}}
     */
    orderStats: {
      total: 0,
      pending: 0,
      shipped: 0,
      cancelled: 0
    },
    /**
     * 订单筛选条件
     * @type {{status: string, order_no: string}}
     */
    orderFilters: {
      status: '',
      order_no: ''
    },
    /** @type {number} 订单当前页码 */
    orderCurrentPage: 1,
    /** @type {number} 订单每页数量 */
    orderPageSize: 20,
    /** @type {{totalPages: number, total: number}} 订单分页信息 */
    orderPagination: { totalPages: 1, total: 0 },

    // ========== 统计分析数据 ==========
    /**
     * 兑换统计数据
     * @type {{orders: Object, revenue: Object, items: Object}}
     */
    exchangeStats: {
      orders: { total: 0, pending: 0, completed: 0, shipped: 0, cancelled: 0 },
      revenue: { total_virtual_value: 0, total_points: 0 },
      items: { activeCount: 0, activeStock: 0, inactiveCount: 0, inactiveStock: 0 }
    },
    /** @type {Object|null} 订单状态分布图表实例 */
    orderStatusChart: null,
    /** @type {Object|null} 兑换趋势图表实例 */
    exchangeTrendChart: null,

    // ========== 通用状态 ==========
    /** @type {boolean} 保存操作进行中标志 */
    saving: false,

    /**
     * 获取当前页面ID（从Alpine store读取）
     * @returns {string} 当前页面ID
     */
    get currentPage() {
      return Alpine.store('exchangePage')
    },

    // ========== 初始化 ==========
    /**
     * 初始化内容组件
     * @description 加载资产类型、页面数据，并监听页面切换事件
     * @returns {void}
     */
    init() {
      console.log('[ExchangePageContent] 初始化...')

      // 加载资产类型
      this.loadAssetTypes()

      // 根据当前页面加载数据
      this.loadPageData()

      // 监听页面切换
      window.addEventListener('exchange-page-changed', e => {
        this.loadPageData()
      })
    },

    /**
     * 根据当前页面加载对应数据
     * @async
     * @description 根据currentPage调用不同的数据加载方法
     * @returns {Promise<void>}
     */
    async loadPageData() {
      const page = this.currentPage
      console.log('[ExchangePageContent] 加载数据:', page)

      switch (page) {
        case 'items':
          await this.loadItems()
          await this.loadItemStats()
          break
        case 'orders':
          await this.loadOrders()
          await this.loadOrderStats()
          break
        case 'stats':
          await this.loadExchangeStats()
          this.$nextTick(() => this.initCharts())
          break
      }
    },

    // ==================== 资产类型 ====================

    /**
     * 加载资产类型列表
     * @async
     * @description 从后端获取可用的资产类型，用于商品定价选择
     * @returns {Promise<void>}
     */
    async loadAssetTypes() {
      try {
        const res = await request({ url: API_ENDPOINTS.MATERIAL.ASSET_TYPES_ALT, method: 'GET' })
        if (res.success) {
          this.assetTypes = res.data?.list || res.data || []
        }
      } catch (e) {
        console.error('[ExchangeMarket] 加载资产类型失败:', e)
      }
    },

    // ==================== 商品管理方法 ====================

    /**
     * 加载商品列表
     * @async
     * @description 根据筛选条件和分页参数获取商品数据
     * @returns {Promise<void>}
     */
    async loadItems() {
      try {
        this.loading = true
        const params = {
          page: this.itemCurrentPage,
          pageSize: this.itemPageSize,
          ...this.itemFilters
        }

        // 移除空值
        Object.keys(params).forEach(k => !params[k] && delete params[k])

        const res = await request({
          url: API_ENDPOINTS.MARKETPLACE.EXCHANGE_ITEMS,
          method: 'GET',
          params
        })

        if (res.success) {
          this.items = res.data?.list || res.data || []
          this.itemPagination = {
            totalPages: res.data?.pagination?.totalPages || 1,
            total: res.data?.pagination?.total || this.items.length
          }
        }
      } catch (e) {
        console.error('[ExchangeMarket] 加载商品失败:', e)
        this.$toast?.error('加载商品失败')
      } finally {
        this.loading = false
      }
    },

    /**
     * 加载商品统计信息
     * @async
     * @description 获取商品总数、上架数、低库存数、已售数等统计
     * @returns {Promise<void>}
     */
    async loadItemStats() {
      try {
        const res = await request({
          url: API_ENDPOINTS.MARKETPLACE.EXCHANGE_STATS,
          method: 'GET'
        })
        if (res.success && res.data) {
          this.itemStats = {
            total: res.data.total || 0,
            active: res.data.active || 0,
            lowStock: res.data.lowStock || res.data.low_stock || 0,
            totalSold: res.data.totalSold || res.data.total_sold || 0
          }
        }
      } catch (e) {
        console.error('[ExchangeMarket] 加载商品统计失败:', e)
      }
    },

    /**
     * 切换商品列表页码
     * @param {number} page - 目标页码
     * @returns {void}
     */
    changeItemPage(page) {
      if (page < 1 || page > this.itemPagination.totalPages) return
      this.itemCurrentPage = page
      this.loadItems()
    },

    /**
     * 打开新增商品弹窗
     * @description 重置表单数据并显示商品编辑弹窗
     * @returns {void}
     */
    openAddItemModal() {
      this.editingItemId = null
      this.itemForm = {
        item_name: '',
        item_description: '',
        cost_asset_code: '',
        cost_amount: 1,
        stock: 0,
        sort_order: 100,
        status: 'active'
      }
      this.showModal('itemModal')
    },

    /**
     * 编辑商品
     * @description 填充商品数据到表单并显示编辑弹窗
     * @param {Object} item - 商品对象
     * @param {number} item.item_id - 商品ID
     * @param {string} item.item_name - 商品名称
     * @param {string} [item.item_description] - 商品描述
     * @param {string} item.cost_asset_code - 消耗资产类型
     * @param {number} item.cost_amount - 消耗数量
     * @param {number} item.stock - 库存数量
     * @param {number} [item.sort_order] - 排序权重
     * @param {string} item.status - 商品状态
     * @returns {void}
     */
    editItem(item) {
      this.editingItemId = item.item_id
      this.itemForm = {
        item_name: item.item_name,
        item_description: item.item_description || '',
        cost_asset_code: item.cost_asset_code,
        cost_amount: item.cost_amount,
        stock: item.stock,
        sort_order: item.sort_order || 100,
        status: item.status
      }
      this.showModal('itemModal')
    },

    /**
     * 保存商品（新增或更新）
     * @async
     * @description 验证表单数据后提交到后端，根据editingItemId判断新增或更新
     * @returns {Promise<void>}
     */
    async saveItem() {
      if (!this.itemForm.item_name || !this.itemForm.cost_asset_code) {
        this.$toast?.error('请填写必填项')
        return
      }

      try {
        this.saving = true
        const url = this.editingItemId
          ? API.buildURL(API_ENDPOINTS.MARKETPLACE.EXCHANGE_ITEM_DETAIL, {
              item_id: this.editingItemId
            })
          : API_ENDPOINTS.MARKETPLACE.EXCHANGE_ITEMS
        const method = this.editingItemId ? 'PUT' : 'POST'

        const res = await request({ url, method, data: this.itemForm })

        if (res.success) {
          this.$toast?.success(this.editingItemId ? '更新成功' : '添加成功')
          this.hideModal('itemModal')
          this.loadItems()
          this.loadItemStats()
        } else {
          this.$toast?.error(res.message || '操作失败')
        }
      } catch (e) {
        console.error('[ExchangeMarket] 保存商品失败:', e)
        this.$toast?.error('操作失败')
      } finally {
        this.saving = false
      }
    },

    /**
     * 删除商品
     * @async
     * @description 确认后删除指定商品
     * @param {number} itemId - 商品ID
     * @returns {Promise<void>}
     */
    async deleteItem(itemId) {
      const confirmed = await this.$confirm?.('确定要删除此商品吗？', { type: 'danger' })
      if (!confirmed) return

      try {
        const res = await request({
          url: `/api/v4/console/marketplace/exchange_market/items/${itemId}`,
          method: 'DELETE'
        })
        if (res.success) {
          this.$toast?.success('删除成功')
          this.loadItems()
          this.loadItemStats()
        } else {
          this.$toast?.error(res.message || '删除失败')
        }
      } catch (e) {
        console.error('[ExchangeMarket] 删除商品失败:', e)
        this.$toast?.error('删除失败')
      }
    },

    // ==================== 订单管理方法 ====================

    /**
     * 加载订单列表
     * @async
     * @description 根据筛选条件和分页参数获取订单数据
     * @returns {Promise<void>}
     */
    async loadOrders() {
      try {
        this.loading = true
        const params = {
          page: this.orderCurrentPage,
          pageSize: this.orderPageSize,
          ...this.orderFilters
        }

        Object.keys(params).forEach(k => !params[k] && delete params[k])

        const res = await request({
          url: API_ENDPOINTS.MARKETPLACE.EXCHANGE_ORDERS,
          method: 'GET',
          params
        })

        if (res.success) {
          this.orders = res.data?.list || res.data || []
          this.orderPagination = {
            totalPages: res.data?.pagination?.totalPages || 1,
            total: res.data?.pagination?.total || this.orders.length
          }
        }
      } catch (e) {
        console.error('[ExchangeMarket] 加载订单失败:', e)
        this.$toast?.error('加载订单失败')
      } finally {
        this.loading = false
      }
    },

    /**
     * 加载订单统计信息
     * @async
     * @description 获取订单总数、待处理数、已发货数、已取消数等统计
     * @returns {Promise<void>}
     */
    async loadOrderStats() {
      try {
        const res = await request({
          url: API_ENDPOINTS.MARKETPLACE.EXCHANGE_ORDERS_STATS,
          method: 'GET'
        })
        if (res.success && res.data) {
          this.orderStats = {
            total: res.data.total || 0,
            pending: res.data.pending || 0,
            shipped: res.data.shipped || 0,
            cancelled: res.data.cancelled || 0
          }
        }
      } catch (e) {
        console.error('[ExchangeMarket] 加载订单统计失败:', e)
      }
    },

    /**
     * 切换订单列表页码
     * @param {number} page - 目标页码
     * @returns {void}
     */
    changeOrderPage(page) {
      if (page < 1 || page > this.orderPagination.totalPages) return
      this.orderCurrentPage = page
      this.loadOrders()
    },

    /**
     * 获取订单状态显示文本
     * @param {string} status - 订单状态码
     * @returns {string} 状态显示文本
     */
    getOrderStatusText(status) {
      const map = {
        pending: '待处理',
        shipped: '已发货',
        completed: '已完成',
        cancelled: '已取消'
      }
      return map[status] || status
    },

    /**
     * 查看订单详情
     * @description 设置选中订单并显示详情弹窗
     * @param {Object} order - 订单对象
     * @returns {void}
     */
    viewOrderDetail(order) {
      this.selectedOrder = order
      this.showModal('orderDetailModal')
    },

    /**
     * 更新订单状态为已发货
     * @async
     * @description 确认后将订单状态更新为shipped
     * @param {Object} order - 订单对象
     * @param {string} order.order_no - 订单编号
     * @returns {Promise<void>}
     */
    async updateOrderStatus(order) {
      const confirmed = await this.$confirm?.('确定要发货此订单吗？')
      if (!confirmed) return

      try {
        const res = await request({
          url: `/api/v4/console/marketplace/exchange_market/orders/${order.order_no}/status`,
          method: 'PUT',
          data: { status: 'shipped' }
        })

        if (res.success) {
          this.$toast?.success('发货成功')
          this.loadOrders()
          this.loadOrderStats()
        } else {
          this.$toast?.error(res.message || '操作失败')
        }
      } catch (e) {
        console.error('[ExchangeMarket] 更新订单状态失败:', e)
        this.$toast?.error('操作失败')
      }
    },

    // ==================== 统计分析方法 ====================

    /**
     * 加载兑换统计数据
     * @async
     * @description 获取订单、收入、商品等综合统计数据
     * @returns {Promise<void>}
     */
    async loadExchangeStats() {
      try {
        this.loading = true
        const res = await request({
          url: API_ENDPOINTS.MARKETPLACE.EXCHANGE_STATS,
          method: 'GET'
        })

        if (res.success && res.data) {
          this.exchangeStats = {
            orders: res.data.orders || {
              total: 0,
              pending: 0,
              completed: 0,
              shipped: 0,
              cancelled: 0
            },
            revenue: res.data.revenue || { total_virtual_value: 0, total_points: 0 },
            items: res.data.items || {
              activeCount: 0,
              activeStock: 0,
              inactiveCount: 0,
              inactiveStock: 0
            }
          }
        }
      } catch (e) {
        console.error('[ExchangeMarket] 加载统计失败:', e)
      } finally {
        this.loading = false
      }
    },

    /**
     * 初始化统计图表
     * @description 使用ECharts渲染订单状态分布饼图和兑换趋势折线图
     * @requires ECharts
     * @returns {void}
     */
    initCharts() {
      if (typeof echarts === 'undefined') {
        console.warn('[ExchangeMarket] ECharts 未加载')
        return
      }

      // 订单状态分布图
      const orderStatusDom = document.getElementById('orderStatusChart')
      if (orderStatusDom) {
        this.orderStatusChart = echarts.init(orderStatusDom)
        this.orderStatusChart.setOption({
          tooltip: { trigger: 'item' },
          legend: { bottom: '5%' },
          series: [
            {
              type: 'pie',
              radius: ['40%', '70%'],
              avoidLabelOverlap: false,
              itemStyle: { borderRadius: 10, borderColor: '#fff', borderWidth: 2 },
              label: { show: false },
              data: [
                {
                  value: this.exchangeStats.orders.pending,
                  name: '待处理',
                  itemStyle: { color: '#ffc107' }
                },
                {
                  value: this.exchangeStats.orders.shipped,
                  name: '已发货',
                  itemStyle: { color: '#17a2b8' }
                },
                {
                  value: this.exchangeStats.orders.completed,
                  name: '已完成',
                  itemStyle: { color: '#28a745' }
                },
                {
                  value: this.exchangeStats.orders.cancelled,
                  name: '已取消',
                  itemStyle: { color: '#dc3545' }
                }
              ]
            }
          ]
        })
      }

      // 兑换趋势图 (简单示例)
      const trendDom = document.getElementById('exchangeTrendChart')
      if (trendDom) {
        this.exchangeTrendChart = echarts.init(trendDom)
        this.exchangeTrendChart.setOption({
          tooltip: { trigger: 'axis' },
          xAxis: {
            type: 'category',
            data: ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
          },
          yAxis: { type: 'value' },
          series: [
            {
              data: [12, 8, 15, 10, 20, 18, 25],
              type: 'line',
              smooth: true,
              areaStyle: { opacity: 0.3 }
            }
          ]
        })
      }

      // 响应式
      window.addEventListener('resize', () => {
        this.orderStatusChart?.resize()
        this.exchangeTrendChart?.resize()
      })
    }
  }))

  // ==================== 主组件 ====================

  /**
   * 兑换市场主组件
   *
   * @description 整合商品管理、订单管理、统计分析的完整页面组件
   * @returns {Object} Alpine组件对象
   *
   * @property {string} currentPage - 当前子页面 ('items' | 'orders' | 'stats')
   * @property {Array} items - 商品列表
   * @property {Array} orders - 订单列表
   * @property {Object} exchangeStats - 统计数据
   * @property {Object} marketStats - 市场统计（用于HTML显示）
   *
   * @example
   * <div x-data="exchangeMarket()">
   *   <nav>
   *     <template x-for="page in subPages">
   *       <button @click="switchPage(page.id)" x-text="page.name"></button>
   *     </template>
   *   </nav>
   *   <div x-show="currentPage === 'items'">
   *     <!-- 商品列表 -->
   *   </div>
   * </div>
   */
  Alpine.data('exchangeMarket', () => ({
    ...createPageMixin(),

    // 子页面导航
    /** @type {string} 当前页面ID */
    currentPage: 'items',
    /**
     * 子页面配置列表
     * @type {Array<{id: string, name: string, icon: string}>}
     */
    subPages: [
      { id: 'items', name: '商品管理', icon: '📦' },
      { id: 'orders', name: '订单管理', icon: '📋' },
      { id: 'stats', name: '统计分析', icon: '📊' }
    ],

    // 商品管理
    /** @type {Array<Object>} 商品列表 */
    items: [],
    /** @type {Array<Object>} 资产类型列表 */
    assetTypes: [],
    /** @type {{total: number, active: number, lowStock: number, totalSold: number}} 商品统计 */
    itemStats: { total: 0, active: 0, lowStock: 0, totalSold: 0 },
    /** @type {{status: string, cost_asset_code: string, sort_by: string}} 商品筛选条件 */
    itemFilters: { status: '', cost_asset_code: '', sort_by: 'sort_order' },
    /** @type {number} 商品当前页码 */
    itemCurrentPage: 1,
    /** @type {number} 商品每页数量 */
    itemPageSize: 20,
    /** @type {{totalPages: number, total: number}} 商品分页信息 */
    itemPagination: { totalPages: 1, total: 0 },
    /** @type {Object} 商品表单数据 */
    itemForm: {
      item_name: '',
      item_description: '',
      cost_asset_code: '',
      cost_amount: 1,
      stock: 0,
      sort_order: 100,
      status: 'active'
    },
    /** @type {number|null} 正在编辑的商品ID */
    editingItemId: null,

    // 订单管理
    /** @type {Array<Object>} 订单列表 */
    orders: [],
    /** @type {Object|null} 当前选中的订单 */
    selectedOrder: null,
    /** @type {{total: number, pending: number, shipped: number, cancelled: number}} 订单统计 */
    orderStats: { total: 0, pending: 0, shipped: 0, cancelled: 0 },
    /** @type {{status: string, userId: string, startDate: string, endDate: string}} 订单筛选条件 */
    orderFilters: { status: '', userId: '', startDate: '', endDate: '' },
    /** @type {number} 订单当前页码 */
    orderCurrentPage: 1,
    /** @type {number} 订单每页数量 */
    orderPageSize: 20,
    /** @type {{totalPages: number, total: number}} 订单分页信息 */
    orderPagination: { totalPages: 1, total: 0 },

    // 统计分析
    /** @type {Object} 兑换统计原始数据 */
    exchangeStats: {},
    /**
     * 市场统计（用于HTML显示的格式化数据）
     * @type {{totalItems: number, todayOrders: number, pendingShipments: number, pointsConsumed: number}}
     */
    marketStats: {
      totalItems: 0,
      todayOrders: 0,
      pendingShipments: 0,
      pointsConsumed: 0
    },

    // 通用状态
    /** @type {boolean} 保存操作进行中标志 */
    saving: false,

    /**
     * 初始化兑换市场主组件
     * @async
     * @description 验证权限、预加载ECharts、从URL读取页面并加载数据
     * @returns {Promise<void>}
     */
    async init() {
      console.log('✅ 兑换市场页面初始化 (合并组件)')
      if (!this.checkAuth()) return

      // 预加载 ECharts（统计页面需要）
      window.preloadECharts()

      const urlParams = new URLSearchParams(window.location.search)
      this.currentPage = urlParams.get('page') || 'items'
      this.loadPageData()
    },

    /**
     * 切换子页面
     * @param {string} pageId - 目标页面ID
     * @returns {void}
     */
    switchPage(pageId) {
      this.currentPage = pageId
      window.history.pushState({}, '', `?page=${pageId}`)
      this.loadPageData()
    },

    /**
     * 根据当前页面加载数据
     * @async
     * @returns {Promise<void>}
     */
    async loadPageData() {
      await this.withLoading(async () => {
        switch (this.currentPage) {
          case 'items':
            await this.loadItems()
            break
          case 'orders':
            await this.loadOrders()
            break
          case 'stats':
            await this.loadStats()
            break
        }
      })
    },

    /**
     * 加载商品列表
     * @async
     * @returns {Promise<void>}
     */
    async loadItems() {
      try {
        const response = await this.apiGet(API_ENDPOINTS.MARKETPLACE.EXCHANGE_ITEMS, {
          ...this.itemFilters,
          page: this.itemCurrentPage,
          pageSize: this.itemPageSize
        })
        if (response.success && response.data) {
          const itemData = response.data?.list || response.data
          this.items = Array.isArray(itemData) ? itemData : []
          this.itemPagination = response.data.pagination || {
            totalPages: 1,
            total: this.items.length
          }
          this.itemStats = {
            total: this.items.length,
            active: this.items.filter(i => i.status === 'active').length,
            lowStock: 0,
            totalSold: 0
          }
        }
      } catch (error) {
        console.error('加载商品失败:', error)
      }
    },

    /**
     * 打开新增商品弹窗
     * @returns {void}
     */
    openAddItemModal() {
      this.editingItemId = null
      this.itemForm = {
        item_name: '',
        item_description: '',
        cost_asset_code: '',
        cost_amount: 1,
        stock: 0,
        sort_order: 100,
        status: 'active'
      }
      this.$refs.itemModal?.show()
    },

    /**
     * 编辑商品
     * @param {Object} item - 商品对象
     * @returns {void}
     */
    editItem(item) {
      this.editingItemId = item.item_id
      this.itemForm = { ...item }
      this.$refs.itemModal?.show()
    },

    /**
     * 保存商品（新增或更新）
     * @async
     * @returns {Promise<void>}
     */
    async saveItem() {
      try {
        this.saving = true
        const endpoint = this.editingItemId
          ? API.buildURL(API_ENDPOINTS.MARKETPLACE.EXCHANGE_ITEM_DETAIL, {
              item_id: this.editingItemId
            })
          : API_ENDPOINTS.MARKETPLACE.EXCHANGE_ITEMS
        const method = this.editingItemId ? 'apiPut' : 'apiPost'
        await this[method](endpoint, this.itemForm)
        this.$refs.itemModal?.hide()
        await this.loadItems()
        this.showSuccess(this.editingItemId ? '商品已更新' : '商品已创建')
      } catch (error) {
        this.showError('保存失败')
      } finally {
        this.saving = false
      }
    },

    /**
     * 加载订单列表
     * @async
     * @returns {Promise<void>}
     */
    async loadOrders() {
      try {
        const response = await this.apiGet(API_ENDPOINTS.MARKETPLACE.EXCHANGE_ORDERS, {
          ...this.orderFilters,
          page: this.orderCurrentPage,
          pageSize: this.orderPageSize
        })
        if (response.success && response.data) {
          const orderData = response.data?.list || response.data
          this.orders = Array.isArray(orderData) ? orderData : []
          this.orderPagination = response.data.pagination || {
            totalPages: 1,
            total: this.orders.length
          }
        }
      } catch (error) {
        console.error('加载订单失败:', error)
      }
    },

    /**
     * 查看订单详情
     * @param {Object} order - 订单对象
     * @returns {void}
     */
    viewOrderDetail(order) {
      this.selectedOrder = order
      this.$refs.orderDetailModal?.show()
    },

    /**
     * 加载统计数据
     * @async
     * @returns {Promise<void>}
     */
    async loadStats() {
      try {
        const response = await this.apiGet(API_ENDPOINTS.MARKETPLACE.EXCHANGE_STATS)
        if (response.success && response.data) {
          this.exchangeStats = response.data
          // 更新 marketStats 用于 HTML 显示
          this.marketStats = {
            totalItems:
              response.data.items?.total || response.data.totalItems || this.items.length || 0,
            todayOrders: response.data.orders?.today || response.data.todayOrders || 0,
            pendingShipments: response.data.orders?.pending || response.data.pendingShipments || 0,
            pointsConsumed: response.data.revenue?.total_points || response.data.pointsConsumed || 0
          }
        }
      } catch (error) {
        console.error('加载统计失败:', error)
      }
    },

    /**
     * 获取状态显示文本
     * @param {string} status - 状态码
     * @returns {string} 状态显示文本
     */
    getStatusText(status) {
      const map = {
        active: '上架中',
        inactive: '已下架',
        pending: '待处理',
        shipped: '已发货',
        completed: '已完成',
        cancelled: '已取消'
      }
      return map[status] || status || '-'
    },

    /**
     * 格式化日期显示
     * @param {string} dateStr - ISO日期字符串
     * @returns {string} 本地化日期字符串
     */
    formatDate(dateStr) {
      if (!dateStr) return '-'
      return new Date(dateStr).toLocaleString('zh-CN')
    },

    // ========== 商品操作方法 ==========

    /**
     * 打开新增商品弹窗（备用方法）
     * @returns {void}
     */
    openAddItemModal() {
      this.editingItemId = null
      this.itemForm = {
        item_name: '',
        item_description: '',
        cost_asset_code: '',
        cost_amount: 1,
        stock: 0,
        sort_order: 100,
        status: 'active'
      }
      this.showModal('itemModal')
    },

    /**
     * 切换商品上下架状态
     * @async
     * @param {Object} item - 商品对象
     * @param {number} item.item_id - 商品ID
     * @param {string} item.status - 当前状态
     * @returns {Promise<void>}
     */
    async toggleItemStatus(item) {
      try {
        const newStatus = item.status === 'active' ? 'inactive' : 'active'
        const response = await this.apiPut(
          `/api/v4/console/marketplace/exchange_market/items/${item.item_id}`,
          { status: newStatus }
        )
        if (response.success) {
          this.showSuccess(newStatus === 'active' ? '商品已上架' : '商品已下架')
          await this.loadItems()
        }
      } catch (error) {
        this.showError('操作失败')
      }
    },

    /**
     * 删除商品
     * @async
     * @param {Object} item - 商品对象
     * @param {number} item.item_id - 商品ID
     * @returns {Promise<void>}
     */
    async deleteItem(item) {
      if (!confirm('确定要删除此商品吗？')) return
      try {
        const response = await this.apiDelete(
          `/api/v4/console/marketplace/exchange_market/items/${item.item_id}`
        )
        if (response.success) {
          this.showSuccess('商品已删除')
          await this.loadItems()
        }
      } catch (error) {
        this.showError('删除失败')
      }
    },

    // ========== 订单操作方法 ==========

    /**
     * 订单发货
     * @async
     * @param {Object} order - 订单对象
     * @param {string} [order.order_id] - 订单ID
     * @param {string} [order.order_no] - 订单编号
     * @returns {Promise<void>}
     */
    async shipOrder(order) {
      try {
        const response = await this.apiPut(
          `/api/v4/console/marketplace/exchange_market/orders/${order.order_id || order.order_no}/status`,
          { status: 'shipped' }
        )
        if (response.success) {
          this.showSuccess('订单已发货')
          await this.loadOrders()
        }
      } catch (error) {
        this.showError('发货失败')
      }
    },

    /**
     * 完成订单
     * @async
     * @param {Object} order - 订单对象
     * @param {string} [order.order_id] - 订单ID
     * @param {string} [order.order_no] - 订单编号
     * @returns {Promise<void>}
     */
    async completeOrder(order) {
      try {
        const response = await this.apiPut(
          `/api/v4/console/marketplace/exchange_market/orders/${order.order_id || order.order_no}/status`,
          { status: 'completed' }
        )
        if (response.success) {
          this.showSuccess('订单已完成')
          await this.loadOrders()
        }
      } catch (error) {
        this.showError('操作失败')
      }
    }
  }))

  console.log('[ExchangeMarket] ✅ Alpine 组件已注册')
})
