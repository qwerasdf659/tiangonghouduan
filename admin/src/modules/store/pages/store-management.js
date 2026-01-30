/**
 * Store Management Page - Alpine.js Mixin 重构版
 * 门店管理整合页面组件
 *
 * @file public/admin/js/pages/store-management.js
 * @description 门店管理整合页面，包含门店列表、员工管理和门店统计功能
 * @version 3.1.0
 * @date 2026-01-23
 *
 * @requires Alpine.js
 * @requires createPageMixin - 页面基础功能混入
 * @requires STORE_ENDPOINTS - 门店/员工相关API端点
 * @requires SYSTEM_ENDPOINTS - 地区相关API端点
 *
 * 包含子模块：
 * - 门店列表 (stores) - 门店CRUD操作
 * - 员工管理 (staff) - 员工CRUD操作
 * - 门店统计 (store-stats) - 门店业绩排名
 *
 * @example
 * <!-- 使用导航组件 -->
 * <nav x-data="storeNavigation()">
 *   <template x-for="page in subPages">
 *     <button @click="switchPage(page.id)" x-text="page.title"></button>
 *   </template>
 * </nav>
 *
 * <!-- 使用内容组件 -->
 * <div x-data="storePageContent()">
 *   <div x-show="current_page === 'stores'">门店列表</div>
 *   <div x-show="current_page === 'staff'">员工列表</div>
 *   <div x-show="current_page === 'store-stats'">门店统计</div>
 * </div>
 */

import { logger } from '../../../utils/logger.js'
import { STORE_ENDPOINTS } from '../../../api/store.js'
import { SYSTEM_ENDPOINTS } from '../../../api/system/index.js'
import { buildURL } from '../../../api/base.js'
import { createPageMixin } from '../../../alpine/mixins/index.js'

/**
 * 注册门店管理相关Alpine组件
 * @description 在 alpine:init 事件中调用，此时 Alpine.js 和所有依赖都已加载完成
 * @returns {void}
 */
function registerStoreManagementComponents() {
  logger.info('[StoreManagement] 注册 Alpine 组件 (Mixin v3.1)...')

  // 检查 Alpine.js 是否已加载
  if (typeof window.Alpine === 'undefined') {
    logger.error('[StoreManagement] Alpine.js 未加载，请检查脚本加载顺序')
    return
  }

  // 全局 Store
  Alpine.store('storePage', 'stores')

  // ==================== 导航组件 ====================

  /**
   * 门店管理导航组件
   *
   * @description 管理门店管理子页面导航，支持URL参数持久化
   * @returns {Object} Alpine组件对象
   *
   * @property {string} current_page - 当前激活的页面ID
   * @property {Array<{id: string, title: string, icon: string}>} subPages - 子页面配置列表
   */
  Alpine.data('storeNavigation', () => ({
    ...createPageMixin(),
    /** @type {string} 当前页面ID，默认为'stores' */
    current_page: 'stores',
    /**
     * 子页面配置列表
     * @type {Array<{id: string, title: string, icon: string}>}
     */
    subPages: [
      { id: 'stores', title: '门店列表', icon: 'bi-shop' },
      { id: 'staff', title: '员工管理', icon: 'bi-people' },
      { id: 'store-stats', title: '门店统计', icon: 'bi-graph-up' }
    ],

    /**
     * 初始化导航组件
     * @description 验证权限、从URL参数读取当前页面并同步到Alpine store
     * @returns {void}
     */
    init() {
      logger.info('门店管理导航初始化')
      if (!this.checkAuth()) return
      const urlParams = new URLSearchParams(window.location.search)
      this.current_page = urlParams.get('page') || 'stores'
      Alpine.store('storePage', this.current_page)
    },

    /**
     * 切换到指定页面
     * @param {string} pageId - 目标页面ID ('stores' | 'staff' | 'store-stats')
     * @returns {void}
     */
    switchPage(pageId) {
      this.current_page = pageId
      Alpine.store('storePage', pageId)
      window.history.pushState({}, '', `?page=${pageId}`)
    }
  }))

  // ==================== 页面内容组件 ====================

  /**
   * 门店管理内容组件
   *
   * @description 管理门店列表、员工管理和门店统计的数据展示与操作
   * @returns {Object} Alpine组件对象
   *
   * @property {Array} stores - 门店列表
   * @property {Array} staffList - 员工列表
   * @property {Array} storeRanking - 门店业绩排名
   */
  Alpine.data('storePageContent', () => ({
    ...createPageMixin(),

    // 门店管理
    /** @type {Array<Object>} 门店列表 */
    stores: [],
    /**
     * 门店统计信息
     * @type {{total: number, active: number, inactive: number, closed: number, totalStaff: number, todayRevenue: number}}
     */
    storeStats: { total: 0, active: 0, inactive: 0, closed: 0, totalStaff: 0, todayRevenue: 0 },
    /**
     * 门店筛选条件
     * @type {{status: string, keyword: string}}
     */
    storeFilters: { status: '', keyword: '' },
    /**
     * 门店表单数据
     * @type {Object}
     */
    storeForm: {
      store_name: '',
      contact_mobile: '',
      province_code: '',
      city_code: '',
      district_code: '',
      street_code: '',
      store_address: '',
      contact_name: '',
      status: 'active',
      notes: ''
    },
    /** @type {number|null} 正在编辑的门店ID */
    editingStoreId: null,
    /** @type {Array<Object>} 门店业绩排名列表 */
    storeRanking: [],

    // 省市区街道数据
    /** @type {Array<Object>} 省份列表 */
    provinces: [],
    /** @type {Array<Object>} 城市列表 */
    cities: [],
    /** @type {Array<Object>} 区县列表 */
    districts: [],
    /** @type {Array<Object>} 街道列表 */
    streets: [],

    // 员工管理
    /** @type {Array<Object>} 员工列表 */
    staffList: [],
    /**
     * 员工筛选条件
     * @type {{store_id: string, status: string, role: string, keyword: string}}
     */
    staffFilters: { store_id: '', status: '', role: '', keyword: '' },
    /**
     * 员工分页状态（单一对象 + Getter 模式）
     * @type {{page: number, page_size: number, total: number, total_pages: number}}
     */
    pagination: { page: 1, page_size: 20, total: 0, total_pages: 1 },
    /**
     * 员工表单数据
     * @type {{name: string, phone: string, role: string, store_id: string, hire_date: string}}
     */
    staffForm: { name: '', phone: '', role: 'waiter', store_id: '', hire_date: '' },
    /** @type {number|null} 正在编辑的员工ID */
    editingStaffId: null,

    // 选中的数据项
    /** @type {Object|null} 当前选中的门店 */
    selectedStore: null,

    // 通用状态
    /** @type {boolean} 保存操作进行中标志 */
    saving: false,
    /** @type {boolean} 编辑模式标志 */
    isEditMode: false,

    // 分页状态已移至 pagination 对象中

    /**
     * 获取当前页面ID（从Alpine store读取）
     * @returns {string} 当前页面ID
     */
    get current_page() {
      return Alpine.store('storePage')
    },

    /**
     * 初始化内容组件
     * @description 加载省份数据和页面数据，监听页面切换
     * @returns {void}
     */
    init() {
      logger.info('门店管理内容初始化')

      // 加载省份数据（供门店添加/编辑使用）
      this.loadProvinces()

      this.loadPageData()
      this.$watch('$store.storePage', () => this.loadPageData())
    },

    /**
     * 根据当前页面加载对应数据
     * @async
     * @description 根据current_page调用不同的数据加载方法
     * @returns {Promise<void>}
     */
    async loadPageData() {
      const page = this.current_page
      await this.withLoading(
        async () => {
          // 始终加载门店列表（供员工筛选使用）
          await this.loadStores()

          switch (page) {
            case 'stores':
              await this.loadStoreStats()
              break
            case 'staff':
              await this.loadStaff()
              break
            case 'store-stats':
              await this.loadStoreRanking()
              break
          }
        },
        { loadingText: '加载数据...' }
      )
    },

    // ==================== 门店管理方法 ====================

    /**
     * 加载门店列表
     * @async
     * @description 根据筛选条件获取门店数据
     * @returns {Promise<void>}
     */
    async loadStores() {
      try {
        const params = new URLSearchParams()
        params.append('page', 1) // 门店列表使用固定分页，获取全部
        params.append('page_size', 100) // 获取全部门店供选择
        if (this.storeFilters.status) params.append('status', this.storeFilters.status)
        if (this.storeFilters.keyword) params.append('keyword', this.storeFilters.keyword)

        const response = await this.apiGet(
          `${STORE_ENDPOINTS.LIST}?${params}`,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          // 后端返回 items 数组，前端使用 stores
          this.stores = response.data?.items || response.data?.stores || response.data?.list || []
        }
      } catch (error) {
        logger.error('加载门店失败:', error)
        this.stores = []
      }
    },

    /**
     * 加载门店统计信息
     * @async
     * @description 获取门店数量、员工总数、今日收入等统计数据
     * @returns {Promise<void>}
     */
    async loadStoreStats() {
      try {
        const response = await this.apiGet(
          STORE_ENDPOINTS.STATS,
          {},
          { showError: false, showLoading: false }
        )
        if (response?.success) {
          const stats = response.data?.statistics || response.data || {}
          this.storeStats = {
            total: stats.total ?? this.stores.length,
            active: stats.active ?? this.stores.filter(s => s.status === 'active').length,
            inactive: stats.inactive ?? this.stores.filter(s => s.status === 'inactive').length,
            closed: stats.closed ?? this.stores.filter(s => s.status === 'closed').length,
            totalStaff: stats.total_staff ?? 0,
            todayRevenue: stats.today_revenue ?? 0
          }
        }
      } catch (error) {
        // 使用本地数据计算
        this.storeStats = {
          total: this.stores.length,
          active: this.stores.filter(s => s.status === 'active').length,
          inactive: this.stores.filter(s => s.status === 'inactive').length,
          closed: this.stores.filter(s => s.status === 'closed').length,
          totalStaff: this.stores.reduce((sum, s) => sum + (s.staff_count || 0), 0),
          todayRevenue: 0
        }
      }
    },

    /**
     * 加载门店业绩排名
     * @async
     * @description 获取门店业绩排名前10名的数据
     * @returns {Promise<void>}
     */
    async loadStoreRanking() {
      // 直接使用已加载的门店列表按业绩排序（避免调用不存在的 API）
      // 后端暂未提供 /ranking 接口，使用前端排序作为替代方案
      this.storeRanking = [...this.stores]
        .sort((a, b) => (b.revenue || 0) - (a.revenue || 0))
        .slice(0, 10)
    },

    /**
     * 打开创建门店弹窗
     * @description 重置表单数据并显示门店编辑弹窗
     * @returns {void}
     */
    openCreateStoreModal() {
      this.editingStoreId = null
      this.isEditMode = false
      this.storeForm = {
        store_name: '',
        contact_mobile: '',
        province_code: '',
        city_code: '',
        district_code: '',
        street_code: '',
        store_address: '',
        contact_name: '',
        status: 'active',
        notes: ''
      }
      // 清空省市区联动数据
      this.cities = []
      this.districts = []
      this.streets = []
      this.showModal('storeModal')
    },

    /**
     * 编辑门店
     * @async
     * @description 填充门店数据到表单并加载关联的省市区数据
     * @param {Object} store - 门店对象
     * @param {number} [store.store_id] - 门店ID
     * @param {number} [store.id] - 门店ID（备用字段）
     * @param {string} [store.name] - 门店名称
     * @param {string} [store.province_code] - 省份代码
     * @param {string} [store.city_code] - 城市代码
     * @param {string} [store.district_code] - 区县代码
     * @returns {Promise<void>}
     */
    async editStore(store) {
      this.editingStoreId = store.store_id || store.id
      this.isEditMode = true
      this.storeForm = {
        store_name: store.store_name || '',
        contact_mobile: store.contact_mobile || '',
        province_code: store.province_code || '',
        city_code: store.city_code || '',
        district_code: store.district_code || '',
        street_code: store.street_code || '',
        store_address: store.store_address || '',
        contact_name: store.contact_name || '',
        status: store.status || 'active',
        notes: store.notes || ''
      }

      // 加载省市区联动数据
      if (store.province_code) {
        await this.loadCitiesForEdit(store.province_code)
        if (store.city_code) {
          await this.loadDistrictsForEdit(store.city_code)
          if (store.district_code) {
            await this.loadStreetsForEdit(store.district_code)
          }
        }
      }

      this.showModal('storeModal')
    },

    /**
     * 查看门店详情
     * @description 设置选中门店并显示详情弹窗
     * @param {Object} store - 门店对象
     * @returns {void}
     */
    viewStoreDetail(store) {
      this.selectedStore = store
      this.showModal('storeDetailModal')
    },

    /**
     * 保存门店（新增或更新）
     * @async
     * @description 验证表单数据后提交到后端
     * @returns {Promise<void>}
     */
    async saveStore() {
      if (!this.storeForm.store_name?.trim()) {
        this.showError('请输入门店名称')
        return
      }
      if (!this.storeForm.store_address?.trim()) {
        this.showError('请输入详细地址')
        return
      }

      this.saving = true
      try {
        const payload = {
          store_name: this.storeForm.store_name.trim(),
          store_address: this.storeForm.store_address.trim(),
          contact_mobile: this.storeForm.contact_mobile?.trim() || '',
          contact_name: this.storeForm.contact_name?.trim() || '',
          province_code: this.storeForm.province_code || '',
          city_code: this.storeForm.city_code || '',
          district_code: this.storeForm.district_code || '',
          street_code: this.storeForm.street_code || '',
          status: this.storeForm.status,
          notes: this.storeForm.notes || ''
        }

        let response
        if (this.editingStoreId) {
          response = await this.apiCall(
            buildURL(STORE_ENDPOINTS.UPDATE, { store_id: this.editingStoreId }),
            { method: 'PUT', data: payload }
          )
        } else {
          response = await this.apiCall(STORE_ENDPOINTS.CREATE, {
            method: 'POST',
            data: payload
          })
        }

        if (response?.success) {
          this.showSuccess(this.editingStoreId ? '门店更新成功' : '门店创建成功')
          this.hideModal('storeModal')
          this.loadStores()
          this.loadStoreStats()
        }
      } catch (error) {
        logger.error('保存门店失败:', error)
        this.showError('保存失败: ' + error.message)
      } finally {
        this.saving = false
      }
    },

    /**
     * 获取门店状态CSS类名
     * @param {string} status - 门店状态码
     * @returns {string} Bootstrap背景色类名
     */
    getStoreStatusClass(status) {
      const map = { active: 'bg-success', inactive: 'bg-warning', closed: 'bg-secondary' }
      return map[status] || 'bg-secondary'
    },

    /**
     * 获取门店状态显示文本
     * @param {string} status - 门店状态码
     * @returns {string} 状态显示文本
     */
    getStoreStatusText(status) {
      const map = { active: '营业中', inactive: '休息中', closed: '已关闭' }
      return map[status] || status
    },

    // ==================== 省市区联动方法 ====================

    /**
     * 加载省份列表
     */
    async loadProvinces() {
      try {
        const response = await this.apiGet(
          SYSTEM_ENDPOINTS.REGION_PROVINCES,
          {},
          { showLoading: false, showError: false }
        )
        if (response?.success) {
          const provincesData = response.data?.provinces || response.data
          this.provinces = Array.isArray(provincesData) ? provincesData : []
        }
      } catch (error) {
        logger.error('加载省份失败:', error)
        this.provinces = []
      }
    },

    /**
     * 加载城市列表（新建模式，会清空下级选择）
     */
    async loadCities() {
      this.cities = []
      this.districts = []
      this.streets = []
      this.storeForm.city_code = ''
      this.storeForm.district_code = ''
      this.storeForm.street_code = ''

      if (!this.storeForm.province_code) return

      try {
        const response = await this.apiGet(
          buildURL(SYSTEM_ENDPOINTS.REGION_CHILDREN, {
            parent_code: this.storeForm.province_code
          }),
          {},
          { showLoading: false, showError: false }
        )
        if (response?.success) {
          const citiesData = response.data?.children || response.data
          this.cities = Array.isArray(citiesData) ? citiesData : []
        }
      } catch (error) {
        logger.error('加载城市失败:', error)
        this.cities = []
      }
    },

    /**
     * 加载区县列表（新建模式，会清空下级选择）
     */
    async loadDistricts() {
      this.districts = []
      this.streets = []
      this.storeForm.district_code = ''
      this.storeForm.street_code = ''

      if (!this.storeForm.city_code) return

      try {
        const response = await this.apiGet(
          buildURL(SYSTEM_ENDPOINTS.REGION_CHILDREN, { parent_code: this.storeForm.city_code }),
          {},
          { showLoading: false, showError: false }
        )
        if (response?.success) {
          const districtsData = response.data?.children || response.data
          this.districts = Array.isArray(districtsData) ? districtsData : []
        }
      } catch (error) {
        logger.error('加载区县失败:', error)
        this.districts = []
      }
    },

    /**
     * 加载街道列表（新建模式，会清空下级选择）
     */
    async loadStreets() {
      this.streets = []
      this.storeForm.street_code = ''

      if (!this.storeForm.district_code) return

      try {
        const response = await this.apiGet(
          buildURL(SYSTEM_ENDPOINTS.REGION_CHILDREN, {
            parent_code: this.storeForm.district_code
          }),
          {},
          { showLoading: false, showError: false }
        )
        if (response?.success) {
          const streetsData = response.data?.children || response.data
          this.streets = Array.isArray(streetsData) ? streetsData : []
        }
      } catch (error) {
        logger.error('加载街道失败:', error)
        this.streets = []
      }
    },

    /**
     * 加载城市（编辑时使用，不清空选择）
     */
    async loadCitiesForEdit(provinceCode) {
      try {
        const response = await this.apiGet(
          buildURL(SYSTEM_ENDPOINTS.REGION_CHILDREN, { parent_code: provinceCode }),
          {},
          { showLoading: false, showError: false }
        )
        if (response?.success) {
          const citiesData = response.data?.children || response.data
          this.cities = Array.isArray(citiesData) ? citiesData : []
        }
      } catch (error) {
        logger.error('加载城市失败:', error)
        this.cities = []
      }
    },

    /**
     * 加载区县（编辑时使用，不清空选择）
     */
    async loadDistrictsForEdit(cityCode) {
      try {
        const response = await this.apiGet(
          buildURL(SYSTEM_ENDPOINTS.REGION_CHILDREN, { parent_code: cityCode }),
          {},
          { showLoading: false, showError: false }
        )
        if (response?.success) {
          const districtsData = response.data?.children || response.data
          this.districts = Array.isArray(districtsData) ? districtsData : []
        }
      } catch (error) {
        logger.error('加载区县失败:', error)
        this.districts = []
      }
    },

    /**
     * 加载街道（编辑时使用，不清空选择）
     */
    async loadStreetsForEdit(districtCode) {
      try {
        const response = await this.apiGet(
          buildURL(SYSTEM_ENDPOINTS.REGION_CHILDREN, { parent_code: districtCode }),
          {},
          { showLoading: false, showError: false }
        )
        if (response?.success) {
          const streetsData = response.data?.children || response.data
          this.streets = Array.isArray(streetsData) ? streetsData : []
        }
      } catch (error) {
        logger.error('加载街道失败:', error)
        this.streets = []
      }
    },

    /**
     * 获取地区名称（使用后端字段 region_code/region_name）
     */
    getRegionName(code, list) {
      if (!code || !list || list.length === 0) return ''
      const region = list.find(r => r.region_code === code)
      return region?.region_name || ''
    },

    /**
     * 获取完整地址显示（用于门店详情/列表）
     */
    getFullAddress(store) {
      if (!store) return '-'
      const parts = []
      if (store.province_name) parts.push(store.province_name)
      if (store.city_name) parts.push(store.city_name)
      if (store.district_name) parts.push(store.district_name)
      if (store.street_name) parts.push(store.street_name)
      if (store.store_address || store.address) parts.push(store.store_address || store.address)
      return parts.join(' ') || store.address || '-'
    },

    /**
     * 获取表单中的完整地址预览（用于门店表单）
     */
    getFormFullAddress() {
      const parts = []
      // 从当前选中的省市区街道获取名称
      const provinceName = this.getRegionName(this.storeForm.province_code, this.provinces)
      const cityName = this.getRegionName(this.storeForm.city_code, this.cities)
      const districtName = this.getRegionName(this.storeForm.district_code, this.districts)
      const streetName = this.getRegionName(this.storeForm.street_code, this.streets)

      if (provinceName) parts.push(provinceName)
      if (cityName) parts.push(cityName)
      if (districtName) parts.push(districtName)
      if (streetName) parts.push(streetName)
      if (this.storeForm.store_address) parts.push(this.storeForm.store_address)

      return parts.join(' ') || '-'
    },

    // ==================== 员工管理方法 ====================

    /**
     * 加载员工列表
     * @async
     * @description 根据筛选条件和分页参数获取员工数据
     * @returns {Promise<void>}
     */
    async loadStaff() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.pagination.page || 1) // 使用 pagination 对象
        params.append('page_size', this.pagination.page_size || 20)
        if (this.staffFilters.store_id) params.append('store_id', this.staffFilters.store_id)
        if (this.staffFilters.role) params.append('role', this.staffFilters.role)
        if (this.staffFilters.keyword) params.append('keyword', this.staffFilters.keyword)
        // 员工状态筛选
        if (this.staffFilters.status) {
          params.append('status', this.staffFilters.status)
          // 如果查询 deleted 状态，需要传递 include_deleted=true
          if (this.staffFilters.status === 'deleted') {
            params.append('include_deleted', 'true')
          }
        }

        const response = await this.apiGet(
          `${STORE_ENDPOINTS.STAFF_LIST}?${params}`,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          // 后端可能返回 items 数组
          this.staffList = response.data?.items || response.data?.staff || response.data?.list || []
          // 处理分页信息 - 更新 pagination 对象
          if (response.data?.pagination) {
            this.pagination.total = response.data.pagination.total || 0
            this.pagination.total_pages = response.data.pagination.total_pages || 1
          } else if (response.data?.total !== undefined) {
            this.pagination.total = response.data.total || 0
            this.pagination.total_pages =
              response.data.total_pages ||
              Math.ceil((response.data.total || 0) / (this.pagination.page_size || 20))
          }
        }
      } catch (error) {
        logger.error('加载员工失败:', error)
        this.staffList = []
      }
    },

    /**
     * 打开创建员工弹窗
     * @description 重置表单数据并显示员工编辑弹窗
     * @returns {void}
     */
    openCreateStaffModal() {
      this.editingStaffId = null
      this.isEditMode = false
      this.staffForm = { name: '', phone: '', role: 'waiter', store_id: '', hire_date: '' }
      this.showModal('staffModal')
    },

    /**
     * 编辑员工
     * @description 填充员工数据到表单并显示编辑弹窗
     * @param {Object} staff - 员工对象
     * @param {number} [staff.staff_id] - 员工ID
     * @param {string} staff.name - 员工姓名
     * @param {string} [staff.phone] - 员工电话
     * @param {string} [staff.role] - 员工角色
     * @param {string} [staff.store_id] - 所属门店ID
     * @param {string} [staff.hire_date] - 入职日期
     * @returns {void}
     */
    editStaff(staff) {
      this.editingStaffId = staff.store_staff_id || staff.id
      this.isEditMode = true
      this.staffForm = {
        name: staff.user_nickname || '',
        phone: staff.user_mobile || '',
        role: staff.role_in_store || 'staff',
        store_id: staff.store_id || '',
        hire_date: this.formatDateTimeLocal(staff.joined_at)
      }
      this.showModal('staffModal')
    },

    /**
     * 员工离职操作
     * @async
     * @description 将在职员工标记为离职状态（不带 force 参数）
     * @param {Object} staff - 员工对象
     * @param {number} staff.store_staff_id - 员工ID
     * @param {string} staff.user_nickname - 员工姓名
     * @returns {Promise<void>}
     */
    async resignStaff(staff) {
      const staffName = staff.user_nickname || staff.name || '该员工'
      await this.confirmAndExecute(
        `确认将员工「${staffName}」标记为离职？\n离职后员工将无法继续执行工作操作，但记录会保留。`,
        async () => {
          // 调用 DELETE 接口，不传 force 参数 → 离职操作
          const response = await this.apiCall(
            buildURL(STORE_ENDPOINTS.STAFF_DETAIL, { store_staff_id: staff.store_staff_id }),
            { method: 'DELETE' }
          )
          if (response?.success) this.loadStaff()
        },
        { successMessage: `员工「${staffName}」已离职` }
      )
    },

    /**
     * 永久删除员工（软删除）
     * @async
     * @description 将离职员工标记为已删除状态（带 force=true 参数）
     * @param {Object} staff - 员工对象
     * @param {number} staff.store_staff_id - 员工ID
     * @param {string} staff.user_nickname - 员工姓名
     * @returns {Promise<void>}
     */
    async permanentDeleteStaff(staff) {
      const staffName = staff.user_nickname || staff.name || '该员工'

      // 使用自定义确认对话框，包含删除原因输入
      const reason = await this.showDeleteReasonDialog(staffName)
      if (reason === null) return // 用户取消

      try {
        // 调用 DELETE 接口，传 reason 参数 → 删除操作（后端会根据 status=inactive 自动执行删除）
        const url = buildURL(STORE_ENDPOINTS.STAFF_DETAIL, { store_staff_id: staff.store_staff_id })
        const deleteUrl = reason ? `${url}?reason=${encodeURIComponent(reason)}` : url

        const response = await this.apiCall(deleteUrl, { method: 'DELETE' })
        if (response?.success) {
          this.showSuccess(`员工「${staffName}」已删除`)
          this.loadStaff()
        }
      } catch (error) {
        logger.error('删除员工失败:', error)
        this.showError('删除失败: ' + error.message)
      }
    },

    /**
     * 显示删除原因对话框
     * @param {string} staffName - 员工姓名
     * @returns {Promise<string|null>} 删除原因或null（取消）
     */
    async showDeleteReasonDialog(staffName) {
      return new Promise(resolve => {
        // 使用 Alpine store 的 confirm dialog 或简单 prompt
        const reason = prompt(
          `确定要删除员工「${staffName}」吗？\n\n请输入删除原因（可选）：\n\n注意：删除后记录将被标记为已删除，不会物理删除。`,
          ''
        )
        // 用户点击取消返回 null，确定返回原因（可能为空字符串）
        resolve(reason)
      })
    },

    /**
     * 获取员工状态CSS类名
     * @param {string} status - 员工状态码
     * @returns {string} Tailwind CSS 类名
     */
    getStaffStatusClass(status) {
      const map = {
        active: 'bg-green-100 text-green-700',
        inactive: 'bg-gray-100 text-gray-700',
        pending: 'bg-amber-100 text-amber-700',
        deleted: 'bg-red-100 text-red-500'
      }
      return map[status] || 'bg-gray-100 text-gray-700'
    },

    /**
     * 获取员工状态显示文本
     * @param {string} status - 员工状态码
     * @returns {string} 状态显示文本
     */
    getStaffStatusText(status) {
      const map = {
        active: '在职',
        inactive: '离职',
        pending: '待审核',
        deleted: '已删除'
      }
      return map[status] || status || '未知'
    },

    /**
     * 保存员工（新增或更新）
     * @async
     * @description 验证表单数据后提交到后端
     * @returns {Promise<void>}
     */
    async saveStaff() {
      if (!this.staffForm.name.trim()) {
        this.showError('请输入员工姓名')
        return
      }

      this.saving = true
      try {
        const payload = {
          name: this.staffForm.name.trim(),
          phone: this.staffForm.phone.trim(),
          role: this.staffForm.role,
          store_id: this.staffForm.store_id || null,
          hire_date: this.staffForm.hire_date || null
        }

        let response
        if (this.editingStaffId) {
          response = await this.apiCall(
            buildURL(STORE_ENDPOINTS.STAFF_UPDATE, { store_staff_id: this.editingStaffId }),
            { method: 'PUT', body: JSON.stringify(payload) }
          )
        } else {
          response = await this.apiCall(STORE_ENDPOINTS.STAFF_CREATE, {
            method: 'POST',
            body: JSON.stringify(payload)
          })
        }

        if (response?.success) {
          this.showSuccess(this.editingStaffId ? '员工更新成功' : '员工添加成功')
          this.hideModal('staffModal')
          this.loadStaff()
        }
      } catch (error) {
        logger.error('保存员工失败:', error)
        this.showError('保存失败: ' + error.message)
      } finally {
        this.saving = false
      }
    },

    /**
     * 获取员工角色显示文本
     * @param {string} role - 角色代码
     * @returns {string} 角色显示文本
     */
    getStaffRoleText(role) {
      const map = {
        manager: '店长',
        staff: '员工',
        cashier: '收银员',
        waiter: '服务员',
        chef: '厨师'
      }
      return map[role] || role || '员工'
    },

    /**
     * 切换员工列表页码
     * @param {number} newPage - 目标页码
     * @returns {void}
     */
    changePage(newPage) {
      if (newPage < 1 || newPage > this.pagination.total_pages) return
      this.pagination.page = newPage
      this.loadStaff()
    },

    // ==================== 工具方法 ====================

    /**
     * 格式化日期为本地输入格式
     * @param {string} dateStr - ISO日期字符串
     * @returns {string} YYYY-MM-DD格式的日期字符串
     */
    formatDateTimeLocal(dateValue) {
      if (!dateValue) return ''
      try {
        // 处理后端返回的对象格式 { iso, beijing, timestamp, relative }
        let dateStr = dateValue
        if (typeof dateValue === 'object') {
          dateStr = dateValue.iso || dateValue.beijing || dateValue.timestamp
        }
        if (!dateStr) return ''

        const date = new Date(dateStr)
        if (isNaN(date.getTime())) return ''
        return date.toISOString().split('T')[0]
      } catch {
        return ''
      }
    },

    /**
     * 安全格式化日期显示
     * @param {string} dateStr - ISO日期字符串
     * @returns {string} 本地化日期字符串
     */
    formatDateSafe(dateValue) {
      if (!dateValue) return '-'
      try {
        // 处理后端返回的对象格式 { iso, beijing, timestamp, relative }
        let dateStr = dateValue
        if (typeof dateValue === 'object') {
          dateStr = dateValue.beijing || dateValue.iso || dateValue.timestamp
        }
        if (!dateStr) return '-'

        const date = new Date(dateStr)
        if (isNaN(date.getTime())) return String(dateValue)
        return date.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })
      } catch {
        return String(dateValue)
      }
    }
  }))

  logger.info('[StoreManagement] Alpine 组件已注册')
}

// 使用 alpine:init 事件注册组件（推荐的标准方式）
document.addEventListener('alpine:init', registerStoreManagementComponents)

logger.info('[StoreManagement] 页面脚本已加载')
