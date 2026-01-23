/**
 * 商户积分模块
 *
 * @file admin/src/modules/analytics/composables/merchant-points.js
 * @description 商户积分余额和历史查询
 * @version 1.1.0
 * @date 2026-01-24
 *
 * 使用 STORE_ENDPOINTS 端点
 */

import { logger } from '../../../utils/logger.js'
import { STORE_ENDPOINTS } from '../../../api/store.js'
import { buildURL } from '../../../api/base.js'

/**
 * 商户积分状态
 * @returns {Object} 状态对象
 */
export function useMerchantPointsState() {
  return {
    /** @type {Array} 商户积分列表 */
    merchantPoints: [],
    /** @type {Object} 商户积分筛选条件 */
    merchantFilters: { merchant_id: '', keyword: '' },
    /** @type {Object} 商户积分统计 */
    merchantStats: { totalMerchants: 0, totalPoints: 0, activeMerchants: 0 },
    /** @type {Object|null} 选中的商户 */
    selectedMerchant: null,
    /** @type {Array} 商户积分历史 */
    merchantPointsHistory: []
  }
}

/**
 * 商户积分方法
 * @returns {Object} 方法对象
 */
export function useMerchantPointsMethods() {
  return {
    /**
     * 加载商户积分列表
     */
    async loadMerchantPoints() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.page)
        params.append('page_size', this.pageSize)
        if (this.merchantFilters.merchant_id)
          params.append('merchant_id', this.merchantFilters.merchant_id)
        if (this.merchantFilters.keyword) params.append('keyword', this.merchantFilters.keyword)

        const response = await this.apiGet(
          `${STORE_ENDPOINTS.MERCHANT_POINTS_LIST}?${params}`,
          {},
          { showLoading: false }
        )

        if (response?.success) {
          this.merchantPoints = response.data?.merchants || response.data?.list || []
          if (response.data?.pagination) {
            this.total = response.data.pagination.total || 0
            this.totalPages = response.data.pagination.total_pages || 1
          }
        }
      } catch (error) {
        logger.error('加载商户积分失败:', error)
        this.merchantPoints = []
      }
    },

    /**
     * 加载商户积分统计
     */
    async loadMerchantStats() {
      try {
        const response = await this.apiGet(
          STORE_ENDPOINTS.MERCHANT_POINTS_STATS,
          {},
          { showLoading: false, showError: false }
        )
        if (response?.success && response.data) {
          this.merchantStats = {
            totalMerchants: response.data.total_merchants ?? 0,
            totalPoints: response.data.total_points ?? 0,
            activeMerchants: response.data.active_merchants ?? 0
          }
        }
      } catch (error) {
        logger.error('加载商户统计失败:', error)
      }
    },

    /**
     * 搜索商户
     */
    searchMerchants() {
      this.page = 1
      this.loadMerchantPoints()
    },

    /**
     * 查看商户积分详情
     * @param {Object} merchant - 商户对象
     */
    async viewMerchantDetail(merchant) {
      try {
        const response = await this.apiGet(
          buildURL(STORE_ENDPOINTS.MERCHANT_POINTS_DETAIL, {
            id: merchant.merchant_id || merchant.id
          }),
          {},
          { showLoading: true }
        )
        if (response?.success) {
          this.selectedMerchant = response.data
          this.showModal('merchantDetailModal')
        }
      } catch (error) {
        logger.error('加载商户详情失败:', error)
        this.showError('加载商户详情失败')
      }
    },

    /**
     * 查看商户积分历史
     * @param {Object} merchant - 商户对象
     */
    async viewMerchantHistory(merchant) {
      try {
        const response = await this.apiGet(
          buildURL(STORE_ENDPOINTS.MERCHANT_POINTS_HISTORY, {
            id: merchant.merchant_id || merchant.id
          }),
          {},
          { showLoading: true }
        )
        if (response?.success) {
          this.selectedMerchant = merchant
          this.merchantPointsHistory = response.data?.history || response.data?.list || []
          this.showModal('merchantHistoryModal')
        }
      } catch (error) {
        logger.error('加载商户积分历史失败:', error)
        this.showError('加载商户积分历史失败')
      }
    }
  }
}

export default { useMerchantPointsState, useMerchantPointsMethods }
