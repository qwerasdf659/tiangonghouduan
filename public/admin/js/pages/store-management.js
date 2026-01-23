/**
 * Store Management Page - Alpine.js Mixin 重构版
 * 门店管理整合页面组件
 * 
 * @file public/admin/js/pages/store-management.js
 * @version 3.0.0
 * @date 2026-01-23
 * 
 * 包含子模块：
 * - 门店列表 (stores)
 * - 员工管理 (staff)
 * - 门店统计 (store-stats)
 */

document.addEventListener('alpine:init', () => {
  console.log('[StoreManagement] 注册 Alpine 组件 (Mixin v3.0)...')

  // 全局 Store
  Alpine.store('storePage', 'stores')

  // 导航组件
  Alpine.data('storeNavigation', () => ({
    ...createPageMixin(),
    currentPage: 'stores',
    subPages: [
      { id: 'stores', title: '门店列表', icon: 'bi-shop' },
      { id: 'staff', title: '员工管理', icon: 'bi-people' },
      { id: 'store-stats', title: '门店统计', icon: 'bi-graph-up' }
    ],

    init() {
      console.log('✅ 门店管理导航初始化')
      if (!this.checkAuth()) return
      const urlParams = new URLSearchParams(window.location.search)
      this.currentPage = urlParams.get('page') || 'stores'
      Alpine.store('storePage', this.currentPage)
    },

    switchPage(pageId) {
      this.currentPage = pageId
      Alpine.store('storePage', pageId)
      window.history.pushState({}, '', `?page=${pageId}`)
    }
  }))

  // 页面内容组件
  Alpine.data('storePageContent', () => ({
    ...createPageMixin(),

    // 门店管理
    stores: [],
    storeStats: { total: 0, active: 0, inactive: 0, closed: 0, totalStaff: 0, todayRevenue: 0 },
    storeFilters: { status: '', keyword: '' },
    storeForm: {
      name: '',
      contact_mobile: '',
      province_code: '',
      city_code: '',
      district_code: '',
      street_code: '',
      address: '',
      contact_name: '',
      status: 'active',
      description: ''
    },
    editingStoreId: null,
    storeRanking: [],

    // 省市区街道数据
    provinces: [],
    cities: [],
    districts: [],
    streets: [],

    // 员工管理
    staffList: [],
    staffFilters: { store_id: '', role: '', keyword: '' },
    staffPagination: { total: 0, totalPages: 1 },
    staffForm: { name: '', phone: '', role: 'waiter', store_id: '', hire_date: '' },
    editingStaffId: null,

    // 选中的数据项
    selectedStore: null,

    // 通用状态
    saving: false,
    isEditMode: false,

    get currentPage() {
      return Alpine.store('storePage')
    },

    init() {
      console.log('✅ 门店管理内容初始化')

      // 加载省份数据（供门店添加/编辑使用）
      this.loadProvinces()

      this.loadPageData()
      this.$watch('$store.storePage', () => this.loadPageData())
    },

    async loadPageData() {
      const page = this.currentPage
      await this.withLoading(async () => {
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
      }, { loadingText: '加载数据...' })
    },

    // ==================== 门店管理方法 ====================

    async loadStores() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.page)
        params.append('page_size', 100) // 获取全部门店供选择
        if (this.storeFilters.status) params.append('status', this.storeFilters.status)
        if (this.storeFilters.keyword) params.append('keyword', this.storeFilters.keyword)

        const response = await this.apiGet(
          `${API_ENDPOINTS.STORE?.LIST || '/api/v4/console/stores'}?${params}`,
          {}, { showLoading: false }
        )
        if (response?.success) {
          this.stores = response.data?.stores || response.data?.list || []
        }
      } catch (error) {
        console.error('加载门店失败:', error)
        this.stores = []
      }
    },

    async loadStoreStats() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.STORE?.STATS || '/api/v4/console/stores/stats',
          {}, { showError: false, showLoading: false }
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

    async loadStoreRanking() {
      try {
        const response = await this.apiGet(
          API_ENDPOINTS.STORE?.RANKING || '/api/v4/console/stores/ranking',
          {}, { showLoading: false, showError: false }
        )
        if (response?.success) {
          this.storeRanking = response.data?.ranking || response.data || []
        }
      } catch (error) {
        // 使用门店列表并排序
        this.storeRanking = [...this.stores]
          .sort((a, b) => (b.revenue || 0) - (a.revenue || 0))
          .slice(0, 10)
      }
    },

    openCreateStoreModal() {
      this.editingStoreId = null
      this.isEditMode = false
      this.storeForm = {
        name: '',
        contact_mobile: '',
        province_code: '',
        city_code: '',
        district_code: '',
        street_code: '',
        address: '',
        contact_name: '',
        status: 'active',
        description: ''
      }
      // 清空省市区联动数据
      this.cities = []
      this.districts = []
      this.streets = []
      this.showModal('storeModal')
    },

    async editStore(store) {
      this.editingStoreId = store.store_id || store.id
      this.isEditMode = true
      this.storeForm = {
        name: store.name || store.store_name || '',
        contact_mobile: store.contact_mobile || store.phone || '',
        province_code: store.province_code || '',
        city_code: store.city_code || '',
        district_code: store.district_code || '',
        street_code: store.street_code || '',
        address: store.address || store.store_address || '',
        contact_name: store.contact_name || '',
        status: store.status || 'active',
        description: store.description || store.notes || ''
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
     */
    viewStoreDetail(store) {
      this.selectedStore = store
      this.showModal('storeDetailModal')
    },

    async saveStore() {
      if (!this.storeForm.name.trim()) {
        this.showError('请输入门店名称')
        return
      }
      if (!this.storeForm.address.trim()) {
        this.showError('请输入详细地址')
        return
      }

      this.saving = true
      try {
        const payload = {
          store_name: this.storeForm.name.trim(),
          store_address: this.storeForm.address.trim(),
          contact_mobile: this.storeForm.contact_mobile?.trim() || '',
          contact_name: this.storeForm.contact_name?.trim() || '',
          province_code: this.storeForm.province_code || '',
          city_code: this.storeForm.city_code || '',
          district_code: this.storeForm.district_code || '',
          street_code: this.storeForm.street_code || '',
          status: this.storeForm.status,
          notes: this.storeForm.description || ''
        }

        let response
        if (this.editingStoreId) {
          response = await this.apiCall(
            API.buildURL(API_ENDPOINTS.STORE?.UPDATE || '/api/v4/console/stores/:id', { id: this.editingStoreId }),
            { method: 'PUT', data: payload }
          )
        } else {
          response = await this.apiCall(
            API_ENDPOINTS.STORE?.CREATE || '/api/v4/console/stores',
            { method: 'POST', data: payload }
          )
        }

        if (response?.success) {
          this.showSuccess(this.editingStoreId ? '门店更新成功' : '门店创建成功')
          this.hideModal('storeModal')
          this.loadStores()
          this.loadStoreStats()
        }
      } catch (error) {
        console.error('保存门店失败:', error)
        this.showError('保存失败: ' + error.message)
      } finally {
        this.saving = false
      }
    },

    getStoreStatusClass(status) {
      const map = { active: 'bg-success', inactive: 'bg-warning', closed: 'bg-secondary' }
      return map[status] || 'bg-secondary'
    },

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
          API_ENDPOINTS.REGION?.PROVINCES || '/api/v4/regions/provinces',
          {}, { showLoading: false, showError: false }
        )
        if (response?.success) {
          this.provinces = response.data?.provinces || response.data || []
        }
      } catch (error) {
        console.error('加载省份失败:', error)
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
          API.buildURL(API_ENDPOINTS.REGION?.CHILDREN || '/api/v4/regions/:parent_code/children', { parent_code: this.storeForm.province_code }),
          {}, { showLoading: false, showError: false }
        )
        if (response?.success) {
          this.cities = response.data?.children || response.data || []
        }
      } catch (error) {
        console.error('加载城市失败:', error)
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
          API.buildURL(API_ENDPOINTS.REGION?.CHILDREN || '/api/v4/regions/:parent_code/children', { parent_code: this.storeForm.city_code }),
          {}, { showLoading: false, showError: false }
        )
        if (response?.success) {
          this.districts = response.data?.children || response.data || []
        }
      } catch (error) {
        console.error('加载区县失败:', error)
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
          API.buildURL(API_ENDPOINTS.REGION?.CHILDREN || '/api/v4/regions/:parent_code/children', { parent_code: this.storeForm.district_code }),
          {}, { showLoading: false, showError: false }
        )
        if (response?.success) {
          this.streets = response.data?.children || response.data || []
        }
      } catch (error) {
        console.error('加载街道失败:', error)
        this.streets = []
      }
    },

    /**
     * 加载城市（编辑时使用，不清空选择）
     */
    async loadCitiesForEdit(provinceCode) {
      try {
        const response = await this.apiGet(
          API.buildURL(API_ENDPOINTS.REGION?.CHILDREN || '/api/v4/regions/:parent_code/children', { parent_code: provinceCode }),
          {}, { showLoading: false, showError: false }
        )
        if (response?.success) {
          this.cities = response.data?.children || response.data || []
        }
      } catch (error) {
        console.error('加载城市失败:', error)
        this.cities = []
      }
    },

    /**
     * 加载区县（编辑时使用，不清空选择）
     */
    async loadDistrictsForEdit(cityCode) {
      try {
        const response = await this.apiGet(
          API.buildURL(API_ENDPOINTS.REGION?.CHILDREN || '/api/v4/regions/:parent_code/children', { parent_code: cityCode }),
          {}, { showLoading: false, showError: false }
        )
        if (response?.success) {
          this.districts = response.data?.children || response.data || []
        }
      } catch (error) {
        console.error('加载区县失败:', error)
        this.districts = []
      }
    },

    /**
     * 加载街道（编辑时使用，不清空选择）
     */
    async loadStreetsForEdit(districtCode) {
      try {
        const response = await this.apiGet(
          API.buildURL(API_ENDPOINTS.REGION?.CHILDREN || '/api/v4/regions/:parent_code/children', { parent_code: districtCode }),
          {}, { showLoading: false, showError: false }
        )
        if (response?.success) {
          this.streets = response.data?.children || response.data || []
        }
      } catch (error) {
        console.error('加载街道失败:', error)
        this.streets = []
      }
    },

    /**
     * 获取地区名称
     */
    getRegionName(code, list) {
      if (!code || !list || list.length === 0) return ''
      const region = list.find(r => r.code === code || r.region_code === code)
      return region?.name || region?.region_name || ''
    },

    /**
     * 获取完整地址显示
     */
    getFullAddress(store) {
      const parts = []
      if (store.province_name) parts.push(store.province_name)
      if (store.city_name) parts.push(store.city_name)
      if (store.district_name) parts.push(store.district_name)
      if (store.street_name) parts.push(store.street_name)
      if (store.store_address || store.address) parts.push(store.store_address || store.address)
      return parts.join(' ') || store.address || '-'
    },

    // ==================== 员工管理方法 ====================

    async loadStaff() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.page)
        params.append('page_size', this.pageSize)
        if (this.staffFilters.store_id) params.append('store_id', this.staffFilters.store_id)
        if (this.staffFilters.role) params.append('role', this.staffFilters.role)
        if (this.staffFilters.keyword) params.append('keyword', this.staffFilters.keyword)

        const response = await this.apiGet(
          `${API_ENDPOINTS.STORE_STAFF?.LIST || '/api/v4/console/store-staff'}?${params}`,
          {}, { showLoading: false }
        )
        if (response?.success) {
          this.staffList = response.data?.staff || response.data?.list || []
          if (response.data?.pagination) {
            this.staffPagination = {
              total: response.data.pagination.total || 0,
              totalPages: response.data.pagination.total_pages || 1
            }
          }
        }
      } catch (error) {
        console.error('加载员工失败:', error)
        this.staffList = []
      }
    },

    openCreateStaffModal() {
      this.editingStaffId = null
      this.isEditMode = false
      this.staffForm = { name: '', phone: '', role: 'waiter', store_id: '', hire_date: '' }
      this.showModal('staffModal')
    },

    editStaff(staff) {
      this.editingStaffId = staff.staff_id || staff.id
      this.isEditMode = true
      this.staffForm = {
        name: staff.name || '',
        phone: staff.phone || '',
        role: staff.role || 'waiter',
        store_id: staff.store_id || '',
        hire_date: this.formatDateTimeLocal(staff.hire_date)
      }
      this.showModal('staffModal')
    },

    async deleteStaff(staff) {
      await this.confirmAndExecute(
        `确认删除员工「${staff.name}」？`,
        async () => {
          const response = await this.apiCall(
            API.buildURL(API_ENDPOINTS.STORE_STAFF?.DELETE || '/api/v4/console/store-staff/:id', { id: staff.staff_id }),
            { method: 'DELETE' }
          )
          if (response?.success) this.loadStaff()
        },
        { successMessage: '员工已删除' }
      )
    },

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
            API.buildURL(API_ENDPOINTS.STORE_STAFF?.UPDATE || '/api/v4/console/store-staff/:id', { id: this.editingStaffId }),
            { method: 'PUT', body: JSON.stringify(payload) }
          )
        } else {
          response = await this.apiCall(
            API_ENDPOINTS.STORE_STAFF?.CREATE || '/api/v4/console/store-staff',
            { method: 'POST', body: JSON.stringify(payload) }
          )
        }

        if (response?.success) {
          this.showSuccess(this.editingStaffId ? '员工更新成功' : '员工添加成功')
          this.hideModal('staffModal')
          this.loadStaff()
        }
      } catch (error) {
        console.error('保存员工失败:', error)
        this.showError('保存失败: ' + error.message)
      } finally {
        this.saving = false
      }
    },

    getStaffRoleText(role) {
      const map = { manager: '店长', cashier: '收银员', waiter: '服务员', chef: '厨师' }
      return map[role] || role
    },

    changePage(newPage) {
      if (newPage < 1 || newPage > this.staffPagination.totalPages) return
      this.page = newPage
      this.loadStaff()
    },

    // ==================== 工具方法 ====================

    formatDateTimeLocal(dateStr) {
      if (!dateStr) return ''
      try {
        const date = new Date(dateStr)
        if (isNaN(date.getTime())) return ''
        return date.toISOString().split('T')[0]
      } catch {
        return ''
      }
    },

    formatDateSafe(dateStr) {
      if (!dateStr) return '-'
      try {
        const date = new Date(dateStr)
        if (isNaN(date.getTime())) return dateStr
        return date.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })
      } catch {
        return dateStr
      }
    }
  }))

  console.log('✅ [StoreManagement] Alpine 组件已注册')
})

console.log('📦 [StoreManagement] 页面脚本已加载')

