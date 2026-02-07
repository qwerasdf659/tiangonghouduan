/**
 * 门店管理 - Composable
 *
 * @file admin/src/modules/store/composables/stores.js
 * @description 从 store-management.js 提取的门店管理状态和方法
 * @version 1.0.0
 * @date 2026-02-06
 */

import { logger } from '../../../utils/logger.js'
import { STORE_ENDPOINTS } from '../../../api/store.js'
import { buildURL } from '../../../api/base.js'

/**
 * 门店管理状态
 * @returns {Object} 状态对象
 */
export function useStoresState() {
  return {
    /** 门店列表 */
    stores: [],
    /** 门店统计 */
    storeStats: { total: 0, active: 0, inactive: 0, closed: 0, totalStaff: 0, todayRevenue: 0 },
    /** 门店筛选 */
    storeFilters: { status: '', keyword: '' },
    /** 门店表单 */
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
    /** 编辑中的门店ID */
    editingStoreId: null,
    /** 门店排名 */
    storeRanking: [],
    /** 选中门店 */
    selectedStore: null
  }
}

/**
 * 门店管理方法
 * @returns {Object} 方法对象
 */
export function useStoresMethods() {
  return {
    async loadStores() {
      try {
        const params = new URLSearchParams()
        params.append('page', 1)
        params.append('page_size', 100)
        if (this.storeFilters.status) params.append('status', this.storeFilters.status)
        if (this.storeFilters.keyword) params.append('keyword', this.storeFilters.keyword)

        const response = await this.apiGet(
          `${STORE_ENDPOINTS.LIST}?${params}`,
          {},
          { showLoading: false }
        )
        if (response?.success) {
          this.stores = response.data?.items || response.data?.stores || response.data?.list || []
        }
      } catch (error) {
        logger.error('加载门店失败:', error)
        this.stores = []
      }
    },

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
      } catch (_error) {
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
      this.storeRanking = [...this.stores]
        .sort((a, b) => (b.revenue || 0) - (a.revenue || 0))
        .slice(0, 10)
    },

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
      this.cities = []
      this.districts = []
      this.streets = []
      this.showModal('storeModal')
    },

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

    viewStoreDetail(store) {
      this.selectedStore = store
      this.showModal('storeDetailModal')
    },

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

    getStoreStatusClass(status) {
      const map = { active: 'bg-success', inactive: 'bg-warning', closed: 'bg-secondary' }
      return map[status] || 'bg-secondary'
    }
  }
}











