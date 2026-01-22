/**
 * 门店管理页面 - Alpine.js 版本
 *
 * @file public/admin/js/pages/stores.js
 * @description 门店列表、添加、编辑、状态切换、省市区联动等功能
 * @version 2.0.0 (Alpine.js 重构版)
 * @date 2026-01-22
 */

/**
 * 门店管理页面 Alpine.js 组件
 */
function storesPage() {
  return {
    // ==================== 状态数据 ====================
    
    /** 用户信息 */
    userInfo: null,
    
    /** 门店列表 */
    stores: [],
    
    /** 加载状态 */
    loading: true,
    
    /** 全局加载状态（遮罩层） */
    globalLoading: false,
    
    /** 筛选条件 */
    filters: {
      status: '',
      search: ''
    },
    
    /** 统计数据 */
    statistics: {
      total: '-',
      active: '-',
      inactive: '-',
      pending: '-'
    },
    
    /** 省份列表 */
    provinces: [],
    
    /** 城市列表 */
    cities: [],
    
    /** 区县列表 */
    districts: [],
    
    /** 街道列表 */
    streets: [],
    
    /** 门店表单数据 */
    storeForm: {
      id: null,
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
    
    /** 选中的门店详情 */
    selectedStore: null,
    
    // ==================== 生命周期 ====================
    
    /**
     * 初始化
     */
    init() {
      console.log('✅ 门店管理页面 Alpine.js 组件初始化')
      
      // 获取用户信息
      this.userInfo = getCurrentUser()
      
      // 加载数据
      this.loadStores()
      this.loadProvinces()
    },
    
    // ==================== 数据加载方法 ====================
    
    /**
     * 加载门店列表
     */
    async loadStores() {
      this.loading = true
      
      try {
        const params = new URLSearchParams()
        if (this.filters.status) params.append('status', this.filters.status)
        if (this.filters.search) params.append('keyword', this.filters.search)
        
        const url = API_ENDPOINTS.STORE.LIST + (params.toString() ? `?${params.toString()}` : '')
        const response = await apiRequest(url)
        
        if (response && response.success) {
          this.stores = response.data.items || []
          this.loadStoreStats()
        } else {
          this.showError('加载失败', response?.message || '获取门店列表失败')
        }
      } catch (error) {
        console.error('加载门店失败:', error)
        this.showError('加载失败', error.message)
      } finally {
        this.loading = false
      }
    },
    
    /**
     * 加载门店统计数据
     */
    async loadStoreStats() {
      try {
        const response = await apiRequest(API_ENDPOINTS.STORE.STATS)
        if (response && response.success) {
          const stats = response.data
          this.statistics = {
            total: stats.total ?? '-',
            active: stats.active ?? '-',
            inactive: stats.inactive ?? '-',
            pending: stats.pending ?? '-'
          }
        }
      } catch (error) {
        console.error('加载门店统计失败:', error)
      }
    },
    
    /**
     * 加载省份列表
     */
    async loadProvinces() {
      try {
        const response = await apiRequest(API_ENDPOINTS.REGION.PROVINCES)
        if (response && response.success) {
          this.provinces = response.data.provinces || response.data || []
        }
      } catch (error) {
        console.error('加载省份失败:', error)
      }
    },
    
    /**
     * 加载城市列表
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
        const response = await apiRequest(
          API.buildURL(API_ENDPOINTS.REGION.CHILDREN, { parent_code: this.storeForm.province_code })
        )
        if (response && response.success) {
          this.cities = response.data.children || response.data || []
        }
      } catch (error) {
        console.error('加载城市失败:', error)
      }
    },
    
    /**
     * 加载区县列表
     */
    async loadDistricts() {
      this.districts = []
      this.streets = []
      this.storeForm.district_code = ''
      this.storeForm.street_code = ''
      
      if (!this.storeForm.city_code) return
      
      try {
        const response = await apiRequest(
          API.buildURL(API_ENDPOINTS.REGION.CHILDREN, { parent_code: this.storeForm.city_code })
        )
        if (response && response.success) {
          this.districts = response.data.children || response.data || []
        }
      } catch (error) {
        console.error('加载区县失败:', error)
      }
    },
    
    /**
     * 加载街道列表
     */
    async loadStreets() {
      this.streets = []
      this.storeForm.street_code = ''
      
      if (!this.storeForm.district_code) return
      
      try {
        const response = await apiRequest(
          API.buildURL(API_ENDPOINTS.REGION.CHILDREN, { parent_code: this.storeForm.district_code })
        )
        if (response && response.success) {
          this.streets = response.data.children || response.data || []
        }
      } catch (error) {
        console.error('加载街道失败:', error)
      }
    },
    
    // ==================== 门店操作方法 ====================
    
    /**
     * 打开新增模态框
     */
    openCreateModal() {
      this.storeForm = {
        id: null,
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
      this.cities = []
      this.districts = []
      this.streets = []
      new bootstrap.Modal(this.$refs.storeModal).show()
    },
    
    /**
     * 编辑门店
     */
    async editStore(storeId) {
      this.globalLoading = true
      
      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.STORE.DETAIL, { store_id: storeId }))
        
        if (response && response.success) {
          const store = response.data
          this.storeForm = {
            id: store.store_id,
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
          
          new bootstrap.Modal(this.$refs.storeModal).show()
        } else {
          this.showError('加载失败', response?.message || '获取门店详情失败')
        }
      } catch (error) {
        console.error('加载门店详情失败:', error)
        this.showError('加载失败', error.message)
      } finally {
        this.globalLoading = false
      }
    },
    
    /**
     * 加载城市（编辑时使用，不清空选择）
     */
    async loadCitiesForEdit(provinceCode) {
      try {
        const response = await apiRequest(
          API.buildURL(API_ENDPOINTS.REGION.CHILDREN, { parent_code: provinceCode })
        )
        if (response && response.success) {
          this.cities = response.data.children || response.data || []
        }
      } catch (error) {
        console.error('加载城市失败:', error)
      }
    },
    
    /**
     * 加载区县（编辑时使用，不清空选择）
     */
    async loadDistrictsForEdit(cityCode) {
      try {
        const response = await apiRequest(
          API.buildURL(API_ENDPOINTS.REGION.CHILDREN, { parent_code: cityCode })
        )
        if (response && response.success) {
          this.districts = response.data.children || response.data || []
        }
      } catch (error) {
        console.error('加载区县失败:', error)
      }
    },
    
    /**
     * 加载街道（编辑时使用，不清空选择）
     */
    async loadStreetsForEdit(districtCode) {
      try {
        const response = await apiRequest(
          API.buildURL(API_ENDPOINTS.REGION.CHILDREN, { parent_code: districtCode })
        )
        if (response && response.success) {
          this.streets = response.data.children || response.data || []
        }
      } catch (error) {
        console.error('加载街道失败:', error)
      }
    },
    
    /**
     * 提交门店表单
     */
    async submitStore() {
      if (!this.storeForm.store_name || !this.storeForm.store_address) {
        alert('请填写门店名称和详细地址')
        return
      }
      
      this.globalLoading = true
      
      try {
        const data = {
          store_name: this.storeForm.store_name,
          contact_mobile: this.storeForm.contact_mobile,
          province_code: this.storeForm.province_code,
          city_code: this.storeForm.city_code,
          district_code: this.storeForm.district_code,
          street_code: this.storeForm.street_code,
          store_address: this.storeForm.store_address,
          contact_name: this.storeForm.contact_name,
          status: this.storeForm.status,
          notes: this.storeForm.notes
        }
        
        const url = this.storeForm.id
          ? API.buildURL(API_ENDPOINTS.STORE.UPDATE, { store_id: this.storeForm.id })
          : API_ENDPOINTS.STORE.CREATE
        const method = this.storeForm.id ? 'PUT' : 'POST'
        
        const response = await apiRequest(url, {
          method: method,
          body: JSON.stringify(data)
        })
        
        if (response && response.success) {
          bootstrap.Modal.getInstance(this.$refs.storeModal).hide()
          alert(`✅ ${this.storeForm.id ? '更新' : '创建'}成功`)
          this.loadStores()
        } else {
          this.showError('保存失败', response?.message || '操作失败')
        }
      } catch (error) {
        console.error('保存门店失败:', error)
        this.showError('保存失败', error.message)
      } finally {
        this.globalLoading = false
      }
    },
    
    /**
     * 查看门店详情
     */
    async viewStoreDetail(storeId) {
      this.globalLoading = true
      
      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.STORE.DETAIL, { store_id: storeId }))
        
        if (response && response.success) {
          this.selectedStore = response.data
          new bootstrap.Modal(this.$refs.storeDetailModal).show()
        } else {
          this.showError('加载失败', response?.message || '获取门店详情失败')
        }
      } catch (error) {
        console.error('加载门店详情失败:', error)
        this.showError('加载失败', error.message)
      } finally {
        this.globalLoading = false
      }
    },
    
    /**
     * 切换门店状态
     */
    async toggleStoreStatus(storeId, currentStatus) {
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
      const action = newStatus === 'active' ? '营业' : '停业'
      
      if (!confirm(`确定要将此门店设为${action}状态吗？`)) return
      
      this.globalLoading = true
      
      try {
        const url = newStatus === 'active'
          ? API.buildURL(API_ENDPOINTS.STORE.ACTIVATE, { store_id: storeId })
          : API.buildURL(API_ENDPOINTS.STORE.DEACTIVATE, { store_id: storeId })
        
        const response = await apiRequest(url, { method: 'POST' })
        
        if (response && response.success) {
          alert(`✅ 门店已${action}`)
          this.loadStores()
        } else {
          this.showError('操作失败', response?.message || '状态更新失败')
        }
      } catch (error) {
        console.error('更新状态失败:', error)
        this.showError('操作失败', error.message)
      } finally {
        this.globalLoading = false
      }
    },
    
    // ==================== 工具方法 ====================
    
    /**
     * 格式化日期时间
     */
    formatDateTime(dateStr) {
      if (!dateStr) return '-'
      return new Date(dateStr).toLocaleString('zh-CN')
    },
    
    /**
     * 显示错误提示
     */
    showError(title, message) {
      alert(`❌ ${title}\n${message}`)
    },
    
    /**
     * 退出登录
     */
    logout() {
      if (typeof window.logout === 'function') {
        window.logout()
      }
    }
  }
}

// 注册 Alpine.js 组件
document.addEventListener('alpine:init', () => {
  Alpine.data('storesPage', storesPage)
})

