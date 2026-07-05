/**
 * 兑换商品中心 API 客户端
 *
 * @module api/exchange-item
 * @description 商品、SKU、类目、属性及选项的控制台接口封装
 */

import { API_PREFIX, request, buildURL, buildQueryString } from '../base.js'

const CONSOLE_PREFIX = `${API_PREFIX}/console`

/**
 * 兑换商品中心相关端点路径常量
 * @constant {Object<string, string>}
 */
export const EXCHANGE_ITEM_ENDPOINTS = {
  ITEM_LIST: `${CONSOLE_PREFIX}/exchange/items`,
  ITEM_DETAIL: `${CONSOLE_PREFIX}/exchange/items/:id`,
  ITEM_CREATE: `${CONSOLE_PREFIX}/exchange/items`,
  ITEM_UPDATE: `${CONSOLE_PREFIX}/exchange/items/:id`,
  ITEM_DELETE: `${CONSOLE_PREFIX}/exchange/items/:id`,
  SKU_LIST: `${CONSOLE_PREFIX}/exchange/items/:id/skus`,
  SKU_CREATE: `${CONSOLE_PREFIX}/exchange/items/:id/skus`,
  SKU_UPDATE: `${CONSOLE_PREFIX}/exchange/items/skus/:sku_id`,
  SKU_DELETE: `${CONSOLE_PREFIX}/exchange/items/skus/:sku_id`,
  SKU_GENERATE: `${CONSOLE_PREFIX}/exchange/items/:id/skus/generate`,
  SKU_STOCK_ADJUST: `${CONSOLE_PREFIX}/exchange/items/skus/:sku_id/stock`,
  SKU_CHANNEL_PRICES: `${CONSOLE_PREFIX}/exchange/items/skus/:sku_id/channel-prices`,
  CATEGORY_LIST: `${CONSOLE_PREFIX}/categories`,
  CATEGORY_DETAIL: `${CONSOLE_PREFIX}/categories/:id`,
  CATEGORY_CREATE: `${CONSOLE_PREFIX}/categories`,
  CATEGORY_UPDATE: `${CONSOLE_PREFIX}/categories/:id`,
  CATEGORY_DELETE: `${CONSOLE_PREFIX}/categories/:id`,
  CATEGORY_ATTRIBUTES: `${CONSOLE_PREFIX}/categories/:id/attributes`,
  ATTRIBUTE_LIST: `${CONSOLE_PREFIX}/attributes`,
  ATTRIBUTE_DETAIL: `${CONSOLE_PREFIX}/attributes/:id`,
  ATTRIBUTE_CREATE: `${CONSOLE_PREFIX}/attributes`,
  ATTRIBUTE_UPDATE: `${CONSOLE_PREFIX}/attributes/:id`,
  ATTRIBUTE_DELETE: `${CONSOLE_PREFIX}/attributes/:id`,
  ATTRIBUTE_OPTION_CREATE: `${CONSOLE_PREFIX}/attributes/:id/options`,
  ATTRIBUTE_OPTION_UPDATE: `${CONSOLE_PREFIX}/attributes/options/:option_id`,
  ATTRIBUTE_OPTION_DELETE: `${CONSOLE_PREFIX}/attributes/options/:option_id`,
  ITEM_EXPORT: `${CONSOLE_PREFIX}/exchange/items/export`,
  ITEM_IMPORT: `${CONSOLE_PREFIX}/exchange/items/import`,
  // 商品编码体系（供应商/系列/货号辅助查询/健康统计，直接反映后端路由）
  ITEM_SUPPLIER_LINKS: `${CONSOLE_PREFIX}/exchange/items/:id/supplier-links`,
  SUPPLIER_LIST: `${CONSOLE_PREFIX}/exchange/suppliers`,
  SUPPLIER_DETAIL: `${CONSOLE_PREFIX}/exchange/suppliers/:supplier_id`,
  SUPPLIER_CREATE: `${CONSOLE_PREFIX}/exchange/suppliers`,
  SUPPLIER_UPDATE: `${CONSOLE_PREFIX}/exchange/suppliers/:supplier_id`,
  SUPPLIER_DELETE: `${CONSOLE_PREFIX}/exchange/suppliers/:supplier_id`,
  SUPPLIER_CODE_SEARCH: `${CONSOLE_PREFIX}/exchange/suppliers/code-search`,
  SUPPLIER_HEALTH_STATS: `${CONSOLE_PREFIX}/exchange/suppliers/health-stats`,
  PRODUCT_SERIES_LIST: `${CONSOLE_PREFIX}/exchange/product-series`,
  PRODUCT_SERIES_DETAIL: `${CONSOLE_PREFIX}/exchange/product-series/:series_id`,
  PRODUCT_SERIES_CREATE: `${CONSOLE_PREFIX}/exchange/product-series`,
  PRODUCT_SERIES_UPDATE: `${CONSOLE_PREFIX}/exchange/product-series/:series_id`,
  PRODUCT_SERIES_DELETE: `${CONSOLE_PREFIX}/exchange/product-series/:series_id`
}

/**
 * 兑换商品中心 API 方法集合
 * @namespace ExchangeItemAPI
 */
export const ExchangeItemAPI = {
  /**
   * 分页/条件查询商品列表
   * @param {Object} [params={}] 查询参数
   * @returns {Promise<Object>} 标准 API 响应
   */
  async listExchangeItems(params = {}) {
    return request({ url: EXCHANGE_ITEM_ENDPOINTS.ITEM_LIST + buildQueryString(params) })
  },

  /**
   * 获取商品详情
   * @param {string|number} id 商品 ID
   * @returns {Promise<Object>} 标准 API 响应
   */
  async getExchangeItem(id) {
    return request({ url: buildURL(EXCHANGE_ITEM_ENDPOINTS.ITEM_DETAIL, { id }) })
  },

  /**
   * 创建商品
   * @param {Object} data 请求体
   * @returns {Promise<Object>} 标准 API 响应
   */
  async createExchangeItem(data) {
    return request({ url: EXCHANGE_ITEM_ENDPOINTS.ITEM_CREATE, method: 'POST', data })
  },

  /**
   * 更新商品
   * @param {string|number} id 商品 ID
   * @param {Object} data 请求体
   * @returns {Promise<Object>} 标准 API 响应
   */
  async updateExchangeItem(id, data) {
    return request({
      url: buildURL(EXCHANGE_ITEM_ENDPOINTS.ITEM_UPDATE, { id }),
      method: 'PUT',
      data
    })
  },

  /**
   * 删除商品
   * @param {string|number} id 商品 ID
   * @returns {Promise<Object>} 标准 API 响应
   */
  async deleteExchangeItem(id) {
    return request({ url: buildURL(EXCHANGE_ITEM_ENDPOINTS.ITEM_DELETE, { id }), method: 'DELETE' })
  },

  /**
   * 列出某商品下 SKU
   * @param {string|number} exchangeItemId 兑换商品 ID
   * @returns {Promise<Object>} 标准 API 响应
   */
  async listSkus(exchangeItemId) {
    return request({ url: buildURL(EXCHANGE_ITEM_ENDPOINTS.SKU_LIST, { id: exchangeItemId }) })
  },

  /**
   * 创建 SKU
   * @param {string|number} exchangeItemId 兑换商品 ID
   * @param {Object} data 请求体
   * @returns {Promise<Object>} 标准 API 响应
   */
  async createSku(exchangeItemId, data) {
    return request({
      url: buildURL(EXCHANGE_ITEM_ENDPOINTS.SKU_CREATE, { id: exchangeItemId }),
      method: 'POST',
      data
    })
  },

  /**
   * 更新 SKU
   * @param {string|number} skuId SKU ID
   * @param {Object} data 请求体
   * @returns {Promise<Object>} 标准 API 响应
   */
  async updateSku(skuId, data) {
    return request({
      url: buildURL(EXCHANGE_ITEM_ENDPOINTS.SKU_UPDATE, { sku_id: skuId }),
      method: 'PUT',
      data
    })
  },

  /**
   * 删除 SKU
   * @param {string|number} skuId SKU ID
   * @returns {Promise<Object>} 标准 API 响应
   */
  async deleteSku(skuId) {
    return request({
      url: buildURL(EXCHANGE_ITEM_ENDPOINTS.SKU_DELETE, { sku_id: skuId }),
      method: 'DELETE'
    })
  },

  /**
   * 按规则批量生成 SKU
   * @param {string|number} exchangeItemId 兑换商品 ID
   * @param {Object} data 请求体
   * @returns {Promise<Object>} 标准 API 响应
   */
  async generateSkus(exchangeItemId, data) {
    return request({
      url: buildURL(EXCHANGE_ITEM_ENDPOINTS.SKU_GENERATE, { id: exchangeItemId }),
      method: 'POST',
      data
    })
  },

  /**
   * 调整 SKU 库存（增量）
   * @param {string|number} skuId SKU ID
   * @param {number} delta 库存变更量
   * @returns {Promise<Object>} 标准 API 响应
   */
  async adjustStock(skuId, delta) {
    return request({
      url: buildURL(EXCHANGE_ITEM_ENDPOINTS.SKU_STOCK_ADJUST, { sku_id: skuId }),
      method: 'PUT',
      data: { delta }
    })
  },

  /**
   * 获取 SKU 各渠道价
   * @param {string|number} skuId SKU ID
   * @returns {Promise<Object>} 标准 API 响应
   */
  async getChannelPrices(skuId) {
    return request({ url: buildURL(EXCHANGE_ITEM_ENDPOINTS.SKU_CHANNEL_PRICES, { sku_id: skuId }) })
  },

  /**
   * 设置 SKU 各渠道价
   * @param {string|number} skuId SKU ID
   * @param {Object|Array} prices 价格数据
   * @returns {Promise<Object>} 标准 API 响应
   */
  async setChannelPrices(skuId, prices) {
    return request({
      url: buildURL(EXCHANGE_ITEM_ENDPOINTS.SKU_CHANNEL_PRICES, { sku_id: skuId }),
      method: 'PUT',
      data: { prices }
    })
  },

  /**
   * 类目列表
   * @param {Object} [params={}] 查询参数
   * @returns {Promise<Object>} 标准 API 响应
   */
  async listCategories(params = {}) {
    return request({ url: EXCHANGE_ITEM_ENDPOINTS.CATEGORY_LIST + buildQueryString(params) })
  },

  /**
   * 类目详情
   * @param {string|number} id 类目 ID
   * @returns {Promise<Object>} 标准 API 响应
   */
  async getCategory(id) {
    return request({ url: buildURL(EXCHANGE_ITEM_ENDPOINTS.CATEGORY_DETAIL, { id }) })
  },

  /**
   * 创建类目
   * @param {Object} data 请求体
   * @returns {Promise<Object>} 标准 API 响应
   */
  async createCategory(data) {
    return request({ url: EXCHANGE_ITEM_ENDPOINTS.CATEGORY_CREATE, method: 'POST', data })
  },

  /**
   * 更新类目
   * @param {string|number} id 类目 ID
   * @param {Object} data 请求体
   * @returns {Promise<Object>} 标准 API 响应
   */
  async updateCategory(id, data) {
    return request({
      url: buildURL(EXCHANGE_ITEM_ENDPOINTS.CATEGORY_UPDATE, { id }),
      method: 'PUT',
      data
    })
  },

  /**
   * 删除类目
   * @param {string|number} id 类目 ID
   * @returns {Promise<Object>} 标准 API 响应
   */
  async deleteCategory(id) {
    return request({
      url: buildURL(EXCHANGE_ITEM_ENDPOINTS.CATEGORY_DELETE, { id }),
      method: 'DELETE'
    })
  },

  /**
   * 获取类目已绑定属性
   * @param {string|number} id 类目 ID
   * @returns {Promise<Object>} 标准 API 响应
   */
  async getCategoryAttributes(id) {
    return request({ url: buildURL(EXCHANGE_ITEM_ENDPOINTS.CATEGORY_ATTRIBUTES, { id }) })
  },

  /**
   * 设置类目属性绑定
   * @param {string|number} id 类目 ID
   * @param {Array<string|number>} attributeIds 属性 ID 列表
   * @returns {Promise<Object>} 标准 API 响应
   */
  async setCategoryAttributes(id, attributeIds) {
    return request({
      url: buildURL(EXCHANGE_ITEM_ENDPOINTS.CATEGORY_ATTRIBUTES, { id }),
      method: 'PUT',
      data: { attribute_ids: attributeIds }
    })
  },

  /**
   * 属性列表
   * @param {Object} [params={}] 查询参数
   * @returns {Promise<Object>} 标准 API 响应
   */
  async listAttributes(params = {}) {
    return request({ url: EXCHANGE_ITEM_ENDPOINTS.ATTRIBUTE_LIST + buildQueryString(params) })
  },

  /**
   * 属性详情
   * @param {string|number} id 属性 ID
   * @returns {Promise<Object>} 标准 API 响应
   */
  async getAttribute(id) {
    return request({ url: buildURL(EXCHANGE_ITEM_ENDPOINTS.ATTRIBUTE_DETAIL, { id }) })
  },

  /**
   * 创建属性
   * @param {Object} data 请求体
   * @returns {Promise<Object>} 标准 API 响应
   */
  async createAttribute(data) {
    return request({ url: EXCHANGE_ITEM_ENDPOINTS.ATTRIBUTE_CREATE, method: 'POST', data })
  },

  /**
   * 更新属性
   * @param {string|number} id 属性 ID
   * @param {Object} data 请求体
   * @returns {Promise<Object>} 标准 API 响应
   */
  async updateAttribute(id, data) {
    return request({
      url: buildURL(EXCHANGE_ITEM_ENDPOINTS.ATTRIBUTE_UPDATE, { id }),
      method: 'PUT',
      data
    })
  },

  /**
   * 删除属性
   * @param {string|number} id 属性 ID
   * @returns {Promise<Object>} 标准 API 响应
   */
  async deleteAttribute(id) {
    return request({
      url: buildURL(EXCHANGE_ITEM_ENDPOINTS.ATTRIBUTE_DELETE, { id }),
      method: 'DELETE'
    })
  },

  /**
   * 为属性新增选项
   * @param {string|number} attributeId 属性 ID
   * @param {Object} data 请求体
   * @returns {Promise<Object>} 标准 API 响应
   */
  async createAttributeOption(attributeId, data) {
    return request({
      url: buildURL(EXCHANGE_ITEM_ENDPOINTS.ATTRIBUTE_OPTION_CREATE, { id: attributeId }),
      method: 'POST',
      data
    })
  },

  /**
   * 更新属性选项
   * @param {string|number} optionId 选项 ID
   * @param {Object} data 请求体
   * @returns {Promise<Object>} 标准 API 响应
   */
  async updateAttributeOption(optionId, data) {
    return request({
      url: buildURL(EXCHANGE_ITEM_ENDPOINTS.ATTRIBUTE_OPTION_UPDATE, { option_id: optionId }),
      method: 'PUT',
      data
    })
  },

  /**
   * 删除属性选项
   * @param {string|number} optionId 选项 ID
   * @returns {Promise<Object>} 标准 API 响应
   */
  async deleteAttributeOption(optionId) {
    return request({
      url: buildURL(EXCHANGE_ITEM_ENDPOINTS.ATTRIBUTE_OPTION_DELETE, { option_id: optionId }),
      method: 'DELETE'
    })
  },

  /**
   * 导出兑换商品列表（后端 exceljs 产出 xlsx 二进制流）
   *
   * 后端 GET /export 返回的是 xlsx 二进制（Content-Type 为 spreadsheetml.sheet），
   * 必须以 blob 方式接收，交由调用方 createObjectURL 触发下载；不可按 json 解析。
   * @param {Object} [params={}] 筛选参数（status 等）
   * @returns {Promise<Blob>} xlsx 文件的 Blob
   */
  async exportItems(params = {}) {
    return request({
      url: EXCHANGE_ITEM_ENDPOINTS.ITEM_EXPORT + buildQueryString(params),
      responseType: 'blob'
    })
  },

  /**
   * 导入兑换商品（文件上传）
   * @param {File} file 要上传的文件
   * @returns {Promise<Object>} 标准 API 响应
   */
  async importItems(file) {
    const formData = new FormData()
    formData.append('file', file)
    return request({ url: EXCHANGE_ITEM_ENDPOINTS.ITEM_IMPORT, method: 'POST', data: formData })
  },

  /* ==================== 商品编码体系：供应商 / 系列 / 货号辅助查询 ==================== */

  /**
   * 获取商品的供应商关联行（商品编辑表单「多供应商区块」回显）
   * @param {string|number} exchangeItemId 商品 ID
   * @returns {Promise<Object>} 标准 API 响应（data.links）
   */
  async getItemSupplierLinks(exchangeItemId) {
    return request({
      url: buildURL(EXCHANGE_ITEM_ENDPOINTS.ITEM_SUPPLIER_LINKS, { id: exchangeItemId })
    })
  },

  /**
   * 全量替换商品的供应商关联行（多供应商 + 各自货号 + 主供货商标记；空数组=解除全部关联）
   * @param {string|number} exchangeItemId 商品 ID
   * @param {Array<Object>} links 关联行数组 [{ supplier_id, supplier_item_code?, is_primary? }]
   * @returns {Promise<Object>} 标准 API 响应
   */
  async setItemSupplierLinks(exchangeItemId, links) {
    return request({
      url: buildURL(EXCHANGE_ITEM_ENDPOINTS.ITEM_SUPPLIER_LINKS, { id: exchangeItemId }),
      method: 'PUT',
      data: { links }
    })
  },

  /**
   * 供应商分页列表
   * @param {Object} [params={}] 查询参数（status/keyword/page/page_size）
   * @returns {Promise<Object>} 标准 API 响应
   */
  async listSuppliers(params = {}) {
    return request({ url: EXCHANGE_ITEM_ENDPOINTS.SUPPLIER_LIST + buildQueryString(params) })
  },

  /**
   * 供应商详情（含供货 SPU 关联行）
   * @param {string|number} supplierId 供应商 ID
   * @returns {Promise<Object>} 标准 API 响应
   */
  async getSupplier(supplierId) {
    return request({
      url: buildURL(EXCHANGE_ITEM_ENDPOINTS.SUPPLIER_DETAIL, { supplier_id: supplierId })
    })
  },

  /**
   * 创建供应商（supplier_name 唯一，防重复建档）
   * @param {Object} data 请求体（supplier_name/contact_name?/contact_phone?/status?/notes?）
   * @returns {Promise<Object>} 标准 API 响应
   */
  async createSupplier(data) {
    return request({ url: EXCHANGE_ITEM_ENDPOINTS.SUPPLIER_CREATE, method: 'POST', data })
  },

  /**
   * 更新供应商
   * @param {string|number} supplierId 供应商 ID
   * @param {Object} data 请求体
   * @returns {Promise<Object>} 标准 API 响应
   */
  async updateSupplier(supplierId, data) {
    return request({
      url: buildURL(EXCHANGE_ITEM_ENDPOINTS.SUPPLIER_UPDATE, { supplier_id: supplierId }),
      method: 'PUT',
      data
    })
  },

  /**
   * 删除供应商（存在商品关联时后端 409 拒绝）
   * @param {string|number} supplierId 供应商 ID
   * @returns {Promise<Object>} 标准 API 响应
   */
  async deleteSupplier(supplierId) {
    return request({
      url: buildURL(EXCHANGE_ITEM_ENDPOINTS.SUPPLIER_DELETE, { supplier_id: supplierId }),
      method: 'DELETE'
    })
  },

  /**
   * 货号辅助查询（按供应商货号找货：模糊 + 供应商筛选 + 组合定位，多条命中不去重）
   * @param {Object} [params={}] 查询参数（supplier_item_code?/supplier_id?/page/page_size）
   * @returns {Promise<Object>} 标准 API 响应
   */
  async searchBySupplierItemCode(params = {}) {
    return request({
      url: EXCHANGE_ITEM_ENDPOINTS.SUPPLIER_CODE_SEARCH + buildQueryString(params)
    })
  },

  /**
   * 商品主数据健康统计（item_code 回填/货号缺失/重复货号/供货分布，dashboard 健康看板用）
   * @returns {Promise<Object>} 标准 API 响应
   */
  async getProductCodeHealthStats() {
    return request({ url: EXCHANGE_ITEM_ENDPOINTS.SUPPLIER_HEALTH_STATS })
  },

  /**
   * 产品系列分页列表
   * @param {Object} [params={}] 查询参数（status/keyword/page/page_size）
   * @returns {Promise<Object>} 标准 API 响应
   */
  async listProductSeries(params = {}) {
    return request({ url: EXCHANGE_ITEM_ENDPOINTS.PRODUCT_SERIES_LIST + buildQueryString(params) })
  },

  /**
   * 系列详情
   * @param {string|number} seriesId 系列 ID
   * @returns {Promise<Object>} 标准 API 响应
   */
  async getProductSeries(seriesId) {
    return request({
      url: buildURL(EXCHANGE_ITEM_ENDPOINTS.PRODUCT_SERIES_DETAIL, { series_id: seriesId })
    })
  },

  /**
   * 创建系列（series_code 唯一 + 后端全大写归一化）
   * @param {Object} data 请求体（series_code/series_name/seq_pad?/status?）
   * @returns {Promise<Object>} 标准 API 响应
   */
  async createProductSeries(data) {
    return request({ url: EXCHANGE_ITEM_ENDPOINTS.PRODUCT_SERIES_CREATE, method: 'POST', data })
  },

  /**
   * 更新系列（next_seq 由后端发号器维护，不可人工改）
   * @param {string|number} seriesId 系列 ID
   * @param {Object} data 请求体
   * @returns {Promise<Object>} 标准 API 响应
   */
  async updateProductSeries(seriesId, data) {
    return request({
      url: buildURL(EXCHANGE_ITEM_ENDPOINTS.PRODUCT_SERIES_UPDATE, { series_id: seriesId }),
      method: 'PUT',
      data
    })
  },

  /**
   * 删除系列（存在归属商品时后端 409 拒绝）
   * @param {string|number} seriesId 系列 ID
   * @returns {Promise<Object>} 标准 API 响应
   */
  async deleteProductSeries(seriesId) {
    return request({
      url: buildURL(EXCHANGE_ITEM_ENDPOINTS.PRODUCT_SERIES_DELETE, { series_id: seriesId }),
      method: 'DELETE'
    })
  }
}

export default ExchangeItemAPI
