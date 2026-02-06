/**
 * 省市区联动 - Composable
 *
 * @file admin/src/modules/store/composables/regions.js
 * @description 从 store-management.js 提取的省市区联动状态和方法
 * @version 1.0.0
 * @date 2026-02-06
 */

import { logger } from '../../../utils/logger.js'
import { SYSTEM_ENDPOINTS } from '../../../api/system/index.js'
import { buildURL } from '../../../api/base.js'

/**
 * 省市区联动状态
 * @returns {Object} 状态对象
 */
export function useRegionsState() {
  return {
    /** 省份列表 */
    provinces: [],
    /** 城市列表 */
    cities: [],
    /** 区县列表 */
    districts: [],
    /** 街道列表 */
    streets: []
  }
}

/**
 * 省市区联动方法
 * @returns {Object} 方法对象
 */
export function useRegionsMethods() {
  return {
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
          buildURL(SYSTEM_ENDPOINTS.REGION_CHILDREN, { parent_code: this.storeForm.province_code }),
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

    async loadStreets() {
      this.streets = []
      this.storeForm.street_code = ''

      if (!this.storeForm.district_code) return

      try {
        const response = await this.apiGet(
          buildURL(SYSTEM_ENDPOINTS.REGION_CHILDREN, { parent_code: this.storeForm.district_code }),
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

    getRegionName(code, list) {
      if (!code || !list || list.length === 0) return ''
      const region = list.find(r => r.region_code === code)
      return region?.region_name || ''
    },

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

    getFormFullAddress() {
      const parts = []
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
    }
  }
}


