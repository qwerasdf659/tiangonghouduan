/**
 * 统一商品中心 API 客户端
 *
 * @module api/product
 * @description 商品、SKU、类目、属性及选项的控制台接口封装
 */

import { request, buildURL, buildQueryString } from '../base.js'

const API_PREFIX = '/api/v4/console'

/**
 * 统一商品中心相关端点路径常量
 * @constant {Object<string, string>}
 */
export const PRODUCT_ENDPOINTS = {
  PRODUCT_LIST: `${API_PREFIX}/products`,
  PRODUCT_DETAIL: `${API_PREFIX}/products/:id`,
  PRODUCT_CREATE: `${API_PREFIX}/products`,
  PRODUCT_UPDATE: `${API_PREFIX}/products/:id`,
  PRODUCT_DELETE: `${API_PREFIX}/products/:id`,
  SKU_LIST: `${API_PREFIX}/products/:id/skus`,
  SKU_CREATE: `${API_PREFIX}/products/:id/skus`,
  SKU_UPDATE: `${API_PREFIX}/products/skus/:sku_id`,
  SKU_DELETE: `${API_PREFIX}/products/skus/:sku_id`,
  SKU_GENERATE: `${API_PREFIX}/products/:id/skus/generate`,
  SKU_STOCK_ADJUST: `${API_PREFIX}/products/skus/:sku_id/stock`,
  SKU_CHANNEL_PRICES: `${API_PREFIX}/products/skus/:sku_id/channel-prices`,
  CATEGORY_LIST: `${API_PREFIX}/categories`,
  CATEGORY_DETAIL: `${API_PREFIX}/categories/:id`,
  CATEGORY_CREATE: `${API_PREFIX}/categories`,
  CATEGORY_UPDATE: `${API_PREFIX}/categories/:id`,
  CATEGORY_DELETE: `${API_PREFIX}/categories/:id`,
  CATEGORY_ATTRIBUTES: `${API_PREFIX}/categories/:id/attributes`,
  ATTRIBUTE_LIST: `${API_PREFIX}/attributes`,
  ATTRIBUTE_DETAIL: `${API_PREFIX}/attributes/:id`,
  ATTRIBUTE_CREATE: `${API_PREFIX}/attributes`,
  ATTRIBUTE_UPDATE: `${API_PREFIX}/attributes/:id`,
  ATTRIBUTE_DELETE: `${API_PREFIX}/attributes/:id`,
  ATTRIBUTE_OPTION_CREATE: `${API_PREFIX}/attributes/:id/options`,
  ATTRIBUTE_OPTION_UPDATE: `${API_PREFIX}/attributes/options/:option_id`,
  ATTRIBUTE_OPTION_DELETE: `${API_PREFIX}/attributes/options/:option_id`
}

/**
 * 统一商品中心 API 方法集合
 * @namespace ProductAPI
 */
export const ProductAPI = {
  /**
   * 分页/条件查询商品列表
   * @param {Object} [params={}] 查询参数
   * @returns {Promise<Object>} 标准 API 响应
   */
  async listProducts(params = {}) {
    return request({ url: PRODUCT_ENDPOINTS.PRODUCT_LIST + buildQueryString(params) })
  },

  /**
   * 获取商品详情
   * @param {string|number} id 商品 ID
   * @returns {Promise<Object>} 标准 API 响应
   */
  async getProduct(id) {
    return request({ url: buildURL(PRODUCT_ENDPOINTS.PRODUCT_DETAIL, { id }) })
  },

  /**
   * 创建商品
   * @param {Object} data 请求体
   * @returns {Promise<Object>} 标准 API 响应
   */
  async createProduct(data) {
    return request({ url: PRODUCT_ENDPOINTS.PRODUCT_CREATE, method: 'POST', data })
  },

  /**
   * 更新商品
   * @param {string|number} id 商品 ID
   * @param {Object} data 请求体
   * @returns {Promise<Object>} 标准 API 响应
   */
  async updateProduct(id, data) {
    return request({ url: buildURL(PRODUCT_ENDPOINTS.PRODUCT_UPDATE, { id }), method: 'PUT', data })
  },

  /**
   * 删除商品
   * @param {string|number} id 商品 ID
   * @returns {Promise<Object>} 标准 API 响应
   */
  async deleteProduct(id) {
    return request({ url: buildURL(PRODUCT_ENDPOINTS.PRODUCT_DELETE, { id }), method: 'DELETE' })
  },

  /**
   * 列出某商品下 SKU
   * @param {string|number} productId 商品 ID
   * @returns {Promise<Object>} 标准 API 响应
   */
  async listSkus(productId) {
    return request({ url: buildURL(PRODUCT_ENDPOINTS.SKU_LIST, { id: productId }) })
  },

  /**
   * 创建 SKU
   * @param {string|number} productId 商品 ID
   * @param {Object} data 请求体
   * @returns {Promise<Object>} 标准 API 响应
   */
  async createSku(productId, data) {
    return request({ url: buildURL(PRODUCT_ENDPOINTS.SKU_CREATE, { id: productId }), method: 'POST', data })
  },

  /**
   * 更新 SKU
   * @param {string|number} skuId SKU ID
   * @param {Object} data 请求体
   * @returns {Promise<Object>} 标准 API 响应
   */
  async updateSku(skuId, data) {
    return request({ url: buildURL(PRODUCT_ENDPOINTS.SKU_UPDATE, { sku_id: skuId }), method: 'PUT', data })
  },

  /**
   * 删除 SKU
   * @param {string|number} skuId SKU ID
   * @returns {Promise<Object>} 标准 API 响应
   */
  async deleteSku(skuId) {
    return request({ url: buildURL(PRODUCT_ENDPOINTS.SKU_DELETE, { sku_id: skuId }), method: 'DELETE' })
  },

  /**
   * 按规则批量生成 SKU
   * @param {string|number} productId 商品 ID
   * @param {Object} data 请求体
   * @returns {Promise<Object>} 标准 API 响应
   */
  async generateSkus(productId, data) {
    return request({ url: buildURL(PRODUCT_ENDPOINTS.SKU_GENERATE, { id: productId }), method: 'POST', data })
  },

  /**
   * 调整 SKU 库存（增量）
   * @param {string|number} skuId SKU ID
   * @param {number} delta 库存变更量
   * @returns {Promise<Object>} 标准 API 响应
   */
  async adjustStock(skuId, delta) {
    return request({ url: buildURL(PRODUCT_ENDPOINTS.SKU_STOCK_ADJUST, { sku_id: skuId }), method: 'PUT', data: { delta } })
  },

  /**
   * 获取 SKU 各渠道价
   * @param {string|number} skuId SKU ID
   * @returns {Promise<Object>} 标准 API 响应
   */
  async getChannelPrices(skuId) {
    return request({ url: buildURL(PRODUCT_ENDPOINTS.SKU_CHANNEL_PRICES, { sku_id: skuId }) })
  },

  /**
   * 设置 SKU 各渠道价
   * @param {string|number} skuId SKU ID
   * @param {Object|Array} prices 价格数据
   * @returns {Promise<Object>} 标准 API 响应
   */
  async setChannelPrices(skuId, prices) {
    return request({ url: buildURL(PRODUCT_ENDPOINTS.SKU_CHANNEL_PRICES, { sku_id: skuId }), method: 'PUT', data: { prices } })
  },

  /**
   * 类目列表
   * @param {Object} [params={}] 查询参数
   * @returns {Promise<Object>} 标准 API 响应
   */
  async listCategories(params = {}) {
    return request({ url: PRODUCT_ENDPOINTS.CATEGORY_LIST + buildQueryString(params) })
  },

  /**
   * 类目详情
   * @param {string|number} id 类目 ID
   * @returns {Promise<Object>} 标准 API 响应
   */
  async getCategory(id) {
    return request({ url: buildURL(PRODUCT_ENDPOINTS.CATEGORY_DETAIL, { id }) })
  },

  /**
   * 创建类目
   * @param {Object} data 请求体
   * @returns {Promise<Object>} 标准 API 响应
   */
  async createCategory(data) {
    return request({ url: PRODUCT_ENDPOINTS.CATEGORY_CREATE, method: 'POST', data })
  },

  /**
   * 更新类目
   * @param {string|number} id 类目 ID
   * @param {Object} data 请求体
   * @returns {Promise<Object>} 标准 API 响应
   */
  async updateCategory(id, data) {
    return request({ url: buildURL(PRODUCT_ENDPOINTS.CATEGORY_UPDATE, { id }), method: 'PUT', data })
  },

  /**
   * 删除类目
   * @param {string|number} id 类目 ID
   * @returns {Promise<Object>} 标准 API 响应
   */
  async deleteCategory(id) {
    return request({ url: buildURL(PRODUCT_ENDPOINTS.CATEGORY_DELETE, { id }), method: 'DELETE' })
  },

  /**
   * 获取类目已绑定属性
   * @param {string|number} id 类目 ID
   * @returns {Promise<Object>} 标准 API 响应
   */
  async getCategoryAttributes(id) {
    return request({ url: buildURL(PRODUCT_ENDPOINTS.CATEGORY_ATTRIBUTES, { id }) })
  },

  /**
   * 设置类目属性绑定
   * @param {string|number} id 类目 ID
   * @param {Array<string|number>} attributeIds 属性 ID 列表
   * @returns {Promise<Object>} 标准 API 响应
   */
  async setCategoryAttributes(id, attributeIds) {
    return request({ url: buildURL(PRODUCT_ENDPOINTS.CATEGORY_ATTRIBUTES, { id }), method: 'PUT', data: { attribute_ids: attributeIds } })
  },

  /**
   * 属性列表
   * @param {Object} [params={}] 查询参数
   * @returns {Promise<Object>} 标准 API 响应
   */
  async listAttributes(params = {}) {
    return request({ url: PRODUCT_ENDPOINTS.ATTRIBUTE_LIST + buildQueryString(params) })
  },

  /**
   * 属性详情
   * @param {string|number} id 属性 ID
   * @returns {Promise<Object>} 标准 API 响应
   */
  async getAttribute(id) {
    return request({ url: buildURL(PRODUCT_ENDPOINTS.ATTRIBUTE_DETAIL, { id }) })
  },

  /**
   * 创建属性
   * @param {Object} data 请求体
   * @returns {Promise<Object>} 标准 API 响应
   */
  async createAttribute(data) {
    return request({ url: PRODUCT_ENDPOINTS.ATTRIBUTE_CREATE, method: 'POST', data })
  },

  /**
   * 更新属性
   * @param {string|number} id 属性 ID
   * @param {Object} data 请求体
   * @returns {Promise<Object>} 标准 API 响应
   */
  async updateAttribute(id, data) {
    return request({ url: buildURL(PRODUCT_ENDPOINTS.ATTRIBUTE_UPDATE, { id }), method: 'PUT', data })
  },

  /**
   * 删除属性
   * @param {string|number} id 属性 ID
   * @returns {Promise<Object>} 标准 API 响应
   */
  async deleteAttribute(id) {
    return request({ url: buildURL(PRODUCT_ENDPOINTS.ATTRIBUTE_DELETE, { id }), method: 'DELETE' })
  },

  /**
   * 为属性新增选项
   * @param {string|number} attributeId 属性 ID
   * @param {Object} data 请求体
   * @returns {Promise<Object>} 标准 API 响应
   */
  async createAttributeOption(attributeId, data) {
    return request({ url: buildURL(PRODUCT_ENDPOINTS.ATTRIBUTE_OPTION_CREATE, { id: attributeId }), method: 'POST', data })
  },

  /**
   * 更新属性选项
   * @param {string|number} optionId 选项 ID
   * @param {Object} data 请求体
   * @returns {Promise<Object>} 标准 API 响应
   */
  async updateAttributeOption(optionId, data) {
    return request({ url: buildURL(PRODUCT_ENDPOINTS.ATTRIBUTE_OPTION_UPDATE, { option_id: optionId }), method: 'PUT', data })
  },

  /**
   * 删除属性选项
   * @param {string|number} optionId 选项 ID
   * @returns {Promise<Object>} 标准 API 响应
   */
  async deleteAttributeOption(optionId) {
    return request({ url: buildURL(PRODUCT_ENDPOINTS.ATTRIBUTE_OPTION_DELETE, { option_id: optionId }), method: 'DELETE' })
  }
}

export default ProductAPI
