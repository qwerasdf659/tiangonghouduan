/**
 * 统一商品中心 — Alpine 可组合状态与方法
 *
 * @module modules/product/composables/product-center
 * @description 基于 ProductAPI 的列表、详情与元数据加载，供页面 mixin 展开使用
 */

import { logger } from '../../../utils/logger.js'
import { ProductAPI } from '../../../api/product/index.js'

/**
 * 统一商品中心页面状态（商品 / SKU / 类目 / 属性）
 * @returns {Object} 供 Alpine 组件展开的状态对象
 */
export function useProductCenterState() {
  return {
    /** @type {boolean} 全局加载中 */
    productCenterLoading: false,
    /** @type {string|null} 最近一次错误信息 */
    productCenterError: null,
    /** @type {Array<Object>} 商品列表 */
    products: [],
    /** @type {Object|null} 当前商品详情 */
    currentProduct: null,
    /** @type {Array<Object>} 当前商品 SKU 列表 */
    productSkus: [],
    /** @type {Array<Object>} 类目树或列表 */
    categories: [],
    /** @type {Array<Object>} 属性列表 */
    attributes: [],
    /** @type {Object} 商品列表查询与分页 */
    productListQuery: { page: 1, page_size: 20, keyword: '' }
  }
}

/**
 * 统一商品中心异步方法（封装 ProductAPI + 统一错误处理）
 * @returns {Object} 方法对象，可与 {@link useProductCenterState} 一并展开到 Alpine 组件
 */
export function useProductCenterMethods() {
  return {
    /**
     * 拉取商品列表并写入 this.products
     * @param {Object} [params] 查询参数，默认合并 this.productListQuery
     * @returns {Promise<Object|null>} API 完整响应，失败时返回 null
     */
    async loadProducts(params) {
      const query = { ...this.productListQuery, ...params }
      this.productCenterLoading = true
      this.productCenterError = null
      try {
        const res = await ProductAPI.listProducts(query)
        const data = res && res.data
        if (data && Array.isArray(data.list)) {
          this.products = data.list
        } else if (Array.isArray(data)) {
          this.products = data
        } else {
          this.products = []
        }
        return res
      } catch (e) {
        this.productCenterError = e.message || String(e)
        logger.error('[ProductCenter] loadProducts failed', e)
        return null
      } finally {
        this.productCenterLoading = false
      }
    },

    /**
     * 加载商品详情及 SKU 列表
     * @param {string|number} productId 商品 ID
     * @returns {Promise<void>}
     */
    async loadProductDetail(productId) {
      this.productCenterLoading = true
      this.productCenterError = null
      try {
        const res = await ProductAPI.getProduct(productId)
        this.currentProduct = res && res.data != null ? res.data : null
        const skuRes = await ProductAPI.listSkus(productId)
        const skuData = skuRes && skuRes.data
        this.productSkus = Array.isArray(skuData) ? skuData : (skuData && skuData.list) || []
      } catch (e) {
        this.productCenterError = e.message || String(e)
        logger.error('[ProductCenter] loadProductDetail failed', e)
      } finally {
        this.productCenterLoading = false
      }
    },

    /**
     * 加载类目列表
     * @param {Object} [params={}] 查询参数
     * @returns {Promise<void>}
     */
    async loadCategories(params = {}) {
      this.productCenterLoading = true
      this.productCenterError = null
      try {
        const res = await ProductAPI.listCategories(params)
        const data = res && res.data
        this.categories = Array.isArray(data) ? data : (data && data.list) || []
      } catch (e) {
        this.productCenterError = e.message || String(e)
        logger.error('[ProductCenter] loadCategories failed', e)
      } finally {
        this.productCenterLoading = false
      }
    },

    /**
     * 加载属性列表
     * @param {Object} [params={}] 查询参数
     * @returns {Promise<void>}
     */
    async loadAttributes(params = {}) {
      this.productCenterLoading = true
      this.productCenterError = null
      try {
        const res = await ProductAPI.listAttributes(params)
        const data = res && res.data
        this.attributes = Array.isArray(data) ? data : (data && data.list) || []
      } catch (e) {
        this.productCenterError = e.message || String(e)
        logger.error('[ProductCenter] loadAttributes failed', e)
      } finally {
        this.productCenterLoading = false
      }
    }
  }
}
