/**
 * 兑换商品管理模块
 *
 * @file admin/src/modules/market/composables/exchange-items.js
 * @description 商品列表、CRUD操作、库存管理
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { buildURL, request } from '../../../api/base.js'
import { MARKET_ENDPOINTS } from '../../../api/market/index.js'
import { ASSET_ENDPOINTS } from '../../../api/asset.js'
import { SYSTEM_ADMIN_ENDPOINTS } from '../../../api/system/admin.js'

/**
 * 商品管理状态
 * @returns {Object} 状态对象
 */
export function useExchangeItemsState() {
  return {
    /** @type {Array<Object>} 商品列表 */
    items: [],
    /** @type {Array<Object>} 资产类型列表 */
    assetTypes: [],
    /** @type {Object} 商品统计信息 */
    itemStats: { total: 0, active: 0, lowStock: 0, totalSold: 0 },
    /** @type {Object} 商品筛选条件 */
    itemFilters: { status: '', cost_asset_code: '', sort_by: 'sort_order', sort_order: 'ASC' },
    /** @type {number} 商品当前页码 */
    itemCurrentPage: 1,
    /** @type {number} 商品每页数量 */
    itemPageSize: 20,
    /** @type {Object} 商品分页信息 */
    itemPagination: { total_pages: 1, total: 0 },
    /** @type {Object} 商品表单数据 - 直接使用后端字段名 */
    itemForm: {
      item_name: '',
      description: '',
      cost_asset_code: '',
      cost_amount: 1,
      cost_price: 0,
      stock: 0,
      sort_order: 100,
      status: 'active',
      primary_image_id: null,
      is_new: false,
      is_hot: false,
      is_lucky: false,
      is_limited: false,
      has_warranty: false,
      free_shipping: false
    },
    /** @type {number|null} 正在编辑的商品ID */
    editingItemId: null,
    /** @type {string|null} 商品图片预览 URL（上传后由后端返回） */
    itemImagePreviewUrl: null,
    /** @type {boolean} 图片上传中 */
    imageUploading: false
  }
}

/**
 * 商品管理方法
 * @returns {Object} 方法对象
 */
export function useExchangeItemsMethods() {
  return {
    /**
     * 加载资产类型列表
     */
    async loadAssetTypes() {
      try {
        const res = await request({ url: ASSET_ENDPOINTS.MATERIAL_ASSET_TYPES, method: 'GET' })
        if (res.success) {
          // 后端返回 { asset_types: [...] }，按 asset_code 去重
          const rawTypes = res.data?.asset_types || []
          const typeMap = new Map()
          for (const type of rawTypes) {
            if (type && type.asset_code && !typeMap.has(type.asset_code)) {
              typeMap.set(type.asset_code, type)
            }
          }
          this.assetTypes = Array.from(typeMap.values())
        }
      } catch (e) {
        logger.error('[ExchangeItems] 加载资产类型失败:', e)
      }
    },

    /**
     * 加载商品列表
     */
    async loadItems() {
      try {
        this.loading = true
        const params = {
          page: this.itemCurrentPage,
          page_size: this.itemPageSize,
          ...this.itemFilters
        }
        Object.keys(params).forEach(k => !params[k] && delete params[k])

        const res = await request({
          url: MARKET_ENDPOINTS.EXCHANGE_ITEMS,
          method: 'GET',
          params
        })

        if (res.success) {
          // 后端返回数据结构: { items: [...], pagination: {...} }
          const newItems = res.data?.items || res.data?.list || []
          this.items = Array.isArray(newItems) ? [...newItems] : []
          this.itemPagination = {
            total_pages:
              res.data?.pagination?.total_pages || res.data?.pagination?.total_pages || 1,
            total: res.data?.pagination?.total || this.items.length
          }
        }
      } catch (e) {
        logger.error('[ExchangeItems] 加载商品失败:', e)
        this.showError?.('加载商品失败')
      } finally {
        this.loading = false
      }
    },

    /**
     * 加载商品统计信息
     */
    async loadItemStats() {
      try {
        const res = await request({
          url: MARKET_ENDPOINTS.EXCHANGE_STATS,
          method: 'GET'
        })
        if (res.success && res.data) {
          this.itemStats = {
            total: res.data.total || 0,
            active: res.data.active || 0,
            lowStock: res.data.lowStock || res.data.low_stock || 0,
            totalSold: res.data.totalSold || res.data.total_sold || 0
          }
        }
      } catch (e) {
        logger.error('[ExchangeItems] 加载商品统计失败:', e)
      }
    },

    /**
     * 切换商品列表页码
     * @param {number} page - 目标页码
     */
    changeItemPage(page) {
      if (page < 1 || page > this.itemPagination.total_pages) return
      this.itemCurrentPage = page
      this.loadItems()
    },

    /**
     * 打开新增商品弹窗
     */
    openAddItemModal() {
      this.editingItemId = null
      this.itemForm = {
        item_name: '',
        description: '',
        cost_asset_code: '',
        cost_amount: 1,
        cost_price: 0,
        stock: 0,
        sort_order: 100,
        status: 'active',
        primary_image_id: null,
        is_new: false,
        is_hot: false,
        is_lucky: false,
        is_limited: false,
        has_warranty: false,
        free_shipping: false
      }
      this.itemImagePreviewUrl = null
      this.showModal('itemModal')
    },

    /**
     * 编辑商品
     * @param {Object} item - 商品对象（字段名与后端模型一致）
     */
    editItem(item) {
      this.editingItemId = item.exchange_item_id
      this.itemForm = {
        item_name: item.item_name || '',
        description: item.description || '',
        cost_asset_code: item.cost_asset_code || '',
        cost_amount: item.cost_amount || 1,
        cost_price: item.cost_price || 0,
        stock: item.stock || 0,
        sort_order: item.sort_order || 100,
        status: item.status || 'active',
        primary_image_id: item.primary_image_id || null,
        is_new: !!item.is_new,
        is_hot: !!item.is_hot,
        is_lucky: !!item.is_lucky,
        is_limited: !!item.is_limited,
        has_warranty: !!item.has_warranty,
        free_shipping: !!item.free_shipping
      }
      this.itemImagePreviewUrl = item.primary_image?.thumbnail_url || item.primary_image?.url || null
      this.showModal('itemModal')
    },

    /**
     * 保存商品（新增或更新）
     */
    async saveItem() {
      if (!this.itemForm.item_name || !this.itemForm.cost_asset_code) {
        this.showError?.('请填写必填项')
        return
      }

      try {
        this.saving = true
        const url = this.editingItemId
          ? buildURL(MARKET_ENDPOINTS.EXCHANGE_ITEM_DETAIL, {
              exchange_item_id: this.editingItemId
            })
          : MARKET_ENDPOINTS.EXCHANGE_ITEMS
        const method = this.editingItemId ? 'PUT' : 'POST'

        const res = await request({ url, method, data: this.itemForm })

        if (res.success) {
          this.showSuccess?.(this.editingItemId ? '更新成功' : '添加成功')
          this.hideModal?.('itemModal')

          // 新增商品后：回到第一页，按创建时间倒序，确保新商品显示在最前面
          if (!this.editingItemId) {
            this.itemCurrentPage = 1
            this.itemFilters.sort_by = 'created_at'
            this.itemFilters.sort_order = 'DESC'
          }

          window.dispatchEvent(new CustomEvent('refresh-exchange-items'))
          await this.loadItemStats?.()
        } else {
          this.showError?.(res.message || '操作失败')
        }
      } catch (e) {
        logger.error('[ExchangeItems] 保存商品失败:', e)
        this.showError?.('操作失败')
      } finally {
        this.saving = false
      }
    },

    /**
     * 上传商品图片并绑定 primary_image_id
     *
     * @param {Event} event - 文件选择事件（input[type=file] change 事件）
     * @description 上传图片到 Sealos 对象存储，返回 image_resource_id，
     *              设置到 itemForm.primary_image_id 并更新预览 URL
     */
    async uploadItemImage(event) {
      const file = event.target.files?.[0]
      if (!file) return

      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      if (!allowedTypes.includes(file.type)) {
        this.showError?.('仅支持 JPG/PNG/GIF/WebP 格式')
        return
      }

      if (file.size > 5 * 1024 * 1024) {
        this.showError?.('图片大小不能超过 5MB')
        return
      }

      try {
        this.imageUploading = true

        const formData = new FormData()
        formData.append('image', file)
        formData.append('business_type', 'exchange')
        formData.append('category', 'products')

        const token = localStorage.getItem('token')
        const response = await fetch(SYSTEM_ADMIN_ENDPOINTS.IMAGE_UPLOAD, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        })
        const res = await response.json()

        if (res.success && res.data) {
          this.itemForm.primary_image_id = res.data.image_resource_id
          this.itemImagePreviewUrl = res.data.url || res.data.image_url || null
          this.showSuccess?.('图片上传成功')
          logger.info('[ExchangeItems] 图片上传成功:', res.data.image_resource_id)
        } else {
          this.showError?.(res.message || '图片上传失败')
        }
      } catch (e) {
        logger.error('[ExchangeItems] 图片上传失败:', e)
        this.showError?.('图片上传失败')
      } finally {
        this.imageUploading = false
      }
    },

    /**
     * 删除商品
     * @param {number} itemId - 商品ID
     */
    async deleteItem(itemId) {
      const confirmed = await this.$confirm?.('确定要删除此商品吗？', { type: 'danger' })
      if (!confirmed) return

      try {
        const res = await request({
          url: buildURL(MARKET_ENDPOINTS.EXCHANGE_ITEM_DETAIL, { exchange_item_id: itemId }),
          method: 'DELETE'
        })
        if (res.success) {
          this.showSuccess?.('删除成功')
          window.dispatchEvent(new CustomEvent('refresh-exchange-items'))
          this.loadItemStats()
        } else {
          this.showError?.(res.message || '删除失败')
        }
      } catch (e) {
        logger.error('[ExchangeItems] 删除商品失败:', e)
        this.showError?.('删除失败')
      }
    },

    /**
     * 切换商品状态
     * @param {Object} item - 商品对象
     */
    async toggleItemStatus(item) {
      const newStatus = item.status === 'active' ? 'inactive' : 'active'
      const actionText = newStatus === 'active' ? '上架' : '下架'

      try {
        const res = await request({
          url: buildURL(MARKET_ENDPOINTS.EXCHANGE_ITEM_DETAIL, {
            exchange_item_id: item.exchange_item_id
          }),
          method: 'PUT',
          data: { status: newStatus }
        })
        if (res.success) {
          this.showSuccess?.(`商品已${actionText}`)
          window.dispatchEvent(new CustomEvent('refresh-exchange-items'))
          this.loadItemStats()
        }
      } catch (e) {
        logger.error('[ExchangeItems] 切换状态失败:', e)
        this.showError?.('操作失败')
      }
    },

    /**
     * 获取商品状态CSS类
     * @param {string} status - 商品状态
     * @returns {string} CSS类名
     */
    getItemStatusClass(status) {
      return status === 'active' ? 'bg-success' : 'bg-secondary'
    },

    /**
     * 获取商品状态文本
     * @param {string} status - 商品状态
     * @returns {string} 状态文本
     */
    // ✅ 已删除 getItemStatusText 映射函数 - 改用后端 _display 字段（P2 中文化）
  }
}

export default { useExchangeItemsState, useExchangeItemsMethods }
