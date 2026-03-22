/**
 * 统一商品中心 — Alpine 可组合状态与方法
 *
 * @module modules/exchange-item/composables/exchange-item-center
 * @description 基于 ExchangeItemAPI 的列表、详情与元数据加载，供页面 mixin 展开使用
 */

import { logger } from '../../../utils/logger.js'
import { ExchangeItemAPI } from '../../../api/exchange-item/index.js'

/**
 * 统一商品中心页面状态（商品 / SKU / 类目 / 属性）
 * @returns {Object} 供 Alpine 组件展开的状态对象
 */
export function useExchangeItemCenterState() {
  return {
    /** @type {boolean} 全局加载中 */
    exchangeItemCenterLoading: false,
    /** @type {string|null} 最近一次错误信息 */
    exchangeItemCenterError: null,
    /** @type {Array<Object>} 商品列表 */
    exchangeItems: [],
    /** @type {Object|null} 当前商品详情 */
    currentExchangeItem: null,
    /** @type {Array<Object>} 当前商品 SKU 列表 */
    exchangeItemSkus: [],
    /** @type {Array<Object>} 类目树或列表 */
    categories: [],
    /** @type {Array<Object>} 属性列表 */
    attributes: [],
    /** @type {Object} 商品列表查询与分页 */
    exchangeItemListQuery: { page: 1, page_size: 20, keyword: '' }
  }
}

/**
 * 统一商品中心异步方法（封装 ExchangeItemAPI + 统一错误处理）
 * @returns {Object} 方法对象，可与 {@link useExchangeItemCenterState} 一并展开到 Alpine 组件
 */
export function useExchangeItemCenterMethods() {
  return {
    /**
     * 拉取商品列表并写入 this.exchangeItems
     * @param {Object} [params] 查询参数，默认合并 this.exchangeItemListQuery
     * @returns {Promise<Object|null>} API 完整响应，失败时返回 null
     */
    async loadExchangeItems(params) {
      const query = { ...this.exchangeItemListQuery, ...params }
      this.exchangeItemCenterLoading = true
      this.exchangeItemCenterError = null
      try {
        const res = await ExchangeItemAPI.listExchangeItems(query)
        const data = res && res.data
        if (data && Array.isArray(data.list)) {
          this.exchangeItems = data.list
        } else if (Array.isArray(data)) {
          this.exchangeItems = data
        } else {
          this.exchangeItems = []
        }
        return res
      } catch (e) {
        this.exchangeItemCenterError = e.message || String(e)
        logger.error('[ExchangeItemCenter] loadExchangeItems failed', e)
        return null
      } finally {
        this.exchangeItemCenterLoading = false
      }
    },

    /**
     * 加载商品详情及 SKU 列表
     * @param {string|number} exchangeItemId 兑换商品 ID
     * @returns {Promise<void>}
     */
    async loadExchangeItemDetail(exchangeItemId) {
      this.exchangeItemCenterLoading = true
      this.exchangeItemCenterError = null
      try {
        const res = await ExchangeItemAPI.getExchangeItem(exchangeItemId)
        this.currentExchangeItem = res && res.data != null ? res.data : null
        const skuRes = await ExchangeItemAPI.listSkus(exchangeItemId)
        const skuData = skuRes && skuRes.data
        this.exchangeItemSkus = Array.isArray(skuData) ? skuData : (skuData && skuData.list) || []
      } catch (e) {
        this.exchangeItemCenterError = e.message || String(e)
        logger.error('[ExchangeItemCenter] loadExchangeItemDetail failed', e)
      } finally {
        this.exchangeItemCenterLoading = false
      }
    },

    /**
     * 加载类目列表
     * @param {Object} [params={}] 查询参数
     * @returns {Promise<void>}
     */
    async loadCategories(params = {}) {
      this.exchangeItemCenterLoading = true
      this.exchangeItemCenterError = null
      try {
        const res = await ExchangeItemAPI.listCategories(params)
        const data = res && res.data
        this.categories = Array.isArray(data) ? data : (data && data.list) || []
      } catch (e) {
        this.exchangeItemCenterError = e.message || String(e)
        logger.error('[ExchangeItemCenter] loadCategories failed', e)
      } finally {
        this.exchangeItemCenterLoading = false
      }
    },

    /**
     * 加载属性列表
     * @param {Object} [params={}] 查询参数
     * @returns {Promise<void>}
     */
    async loadAttributes(params = {}) {
      this.exchangeItemCenterLoading = true
      this.exchangeItemCenterError = null
      try {
        const res = await ExchangeItemAPI.listAttributes(params)
        const data = res && res.data
        this.attributes = Array.isArray(data) ? data : (data && data.list) || []
      } catch (e) {
        this.exchangeItemCenterError = e.message || String(e)
        logger.error('[ExchangeItemCenter] loadAttributes failed', e)
      } finally {
        this.exchangeItemCenterLoading = false
      }
    }
  }
}
