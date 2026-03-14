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
      rarity_code: 'common',
      category: null,
      space: 'lucky',
      original_price: null,
      tags: [],
      sell_point: '',
      usage_rules: [],
      is_new: false,
      is_hot: false,
      is_lucky: false,
      is_limited: false,
      has_warranty: false,
      free_shipping: false
    },
    /** @type {Array<Object>} 稀有度选项（动态加载自 rarity_defs 字典表） */
    rarityOptions: [],
    /** @type {Array<Object>} 分类选项（动态加载自 category_defs 字典表） */
    categoryOptions: [],
    /** @type {boolean} 字典数据是否已加载 */
    dictionariesLoaded: false,
    /** @type {string} 标签输入临时值 */
    tagInput: '',
    /** @type {string} 使用说明输入临时值 */
    usageRuleInput: '',
    /** @type {number|null} 正在编辑的商品ID */
    editingItemId: null,
    /** @type {string|null} 商品图片预览 URL（上传后由后端返回） */
    itemImagePreviewUrl: null,
    /** @type {boolean} 图片上传中 */
    imageUploading: false,
    /** @type {Array<Object>} 商品详情图列表（多图支持） */
    detailImages: [],
    /** @type {boolean} 详情图上传中 */
    detailImageUploading: false,
    /** @type {Array<Object>} 商品展示图列表（多图支持） */
    showcaseImages: [],
    /** @type {boolean} 展示图上传中 */
    showcaseImageUploading: false
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
     * 加载字典数据（稀有度 + 分类），从后端动态获取替代硬编码
     */
    async loadDictionaries() {
      if (this.dictionariesLoaded) return
      try {
        const res = await request({
          url: SYSTEM_ADMIN_ENDPOINTS.DICT_ALL,
          method: 'GET'
        })
        if (res.success && res.data) {
          // 稀有度选项
          if (res.data.rarities) {
            this.rarityOptions = res.data.rarities.map(r => ({
              value: r.rarity_code,
              label: r.display_name,
              color: r.color_hex
            }))
          }
          // 分类选项（仅启用的）
          if (res.data.categories) {
            this.categoryOptions = res.data.categories
              .filter(c => c.is_enabled)
              .map(c => ({
                value: c.category_code,
                label: c.display_name,
                icon_url: c.icon_url
              }))
          }
          this.dictionariesLoaded = true
          logger.info('[ExchangeItems] 字典数据加载完成', {
            rarities: this.rarityOptions.length,
            categories: this.categoryOptions.length
          })
        }
      } catch (e) {
        logger.error('[ExchangeItems] 加载字典数据失败:', e)
      }
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
        rarity_code: 'common',
        category: null,
        space: 'lucky',
        original_price: null,
        tags: [],
        sell_point: '',
        usage_rules: [],
        is_new: false,
        is_hot: false,
        is_lucky: false,
        is_limited: false,
        has_warranty: false,
        free_shipping: false
      }
      this.itemImagePreviewUrl = null
      this.detailImages = []
      this.showcaseImages = []
      this.tagInput = ''
      this.usageRuleInput = ''
      this.loadDictionaries()
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
        rarity_code: item.rarity_code || 'common',
        category: item.category || null,
        space: item.space || 'lucky',
        original_price: item.original_price || null,
        tags: item.tags || [],
        sell_point: item.sell_point || '',
        usage_rules: item.usage_rules || [],
        is_new: !!item.is_new,
        is_hot: !!item.is_hot,
        is_lucky: !!item.is_lucky,
        is_limited: !!item.is_limited,
        has_warranty: !!item.has_warranty,
        free_shipping: !!item.free_shipping
      }
      this.itemImagePreviewUrl =
        item.primary_image?.thumbnail_url || item.primary_image?.url || null
      this.tagInput = ''
      this.usageRuleInput = ''
      this.loadDictionaries()
      this.loadDetailImages(item.exchange_item_id)
      this.loadShowcaseImages(item.exchange_item_id)
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

        const res = await request({
          url: SYSTEM_ADMIN_ENDPOINTS.IMAGE_UPLOAD,
          method: 'POST',
          data: formData
        })

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
     * 上传商品详情图（多图支持，最多9张）
     *
     * @param {Event} event - 文件选择事件
     * @description 上传详情图到 Sealos，绑定到当前编辑商品的 context_id
     */
    async uploadDetailImage(event) {
      const file = event.target.files?.[0]
      if (!file) return

      if (this.detailImages.length >= 9) {
        this.showError?.('详情图最多9张')
        return
      }

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
        this.detailImageUploading = true
        const formData = new FormData()
        formData.append('image', file)
        formData.append('business_type', 'exchange')
        formData.append('category', 'detail')
        if (this.editingItemId) {
          formData.append('context_id', String(this.editingItemId))
        }
        formData.append('sort_order', String(this.detailImages.length + 1))

        const res = await request({
          url: SYSTEM_ADMIN_ENDPOINTS.IMAGE_UPLOAD,
          method: 'POST',
          data: formData
        })

        if (res.success && res.data) {
          this.detailImages.push({
            image_resource_id: res.data.image_resource_id,
            url: res.data.url || res.data.image_url,
            sort_order: this.detailImages.length + 1
          })
          this.showSuccess?.('详情图上传成功')
        } else {
          this.showError?.(res.message || '详情图上传失败')
        }
      } catch (e) {
        logger.error('[ExchangeItems] 详情图上传失败:', e)
        this.showError?.('详情图上传失败')
      } finally {
        this.detailImageUploading = false
        // 清空 input 以允许重复选择同一文件
        if (event.target) event.target.value = ''
      }
    },

    /**
     * 加载商品的详情图列表
     *
     * @param {number} contextId - 商品 exchange_item_id
     */
    async loadDetailImages(contextId) {
      if (!contextId) {
        this.detailImages = []
        return
      }

      try {
        const res = await request({
          url: SYSTEM_ADMIN_ENDPOINTS.IMAGE_BY_BUSINESS,
          params: { business_type: 'exchange', context_id: contextId, category: 'detail' }
        })

        if (res.success && res.data?.images) {
          this.detailImages = res.data.images.map(img => ({
            image_resource_id: img.image_resource_id,
            url: img.public_url || img.url,
            sort_order: img.sort_order || 0
          }))
        } else {
          this.detailImages = []
        }
      } catch (e) {
        logger.error('[ExchangeItems] 加载详情图失败:', e)
        this.detailImages = []
      }
    },

    /**
     * 删除一张详情图
     *
     * @param {number} imageId - 图片资源 ID
     */
    async removeDetailImage(imageId) {
      const confirmed = await this.$confirm?.('确定要删除此详情图吗？')
      if (!confirmed) return

      try {
        const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.IMAGE_DELETE, { id: imageId })
        const res = await request({ url, method: 'DELETE' })

        if (res.success) {
          this.detailImages = this.detailImages.filter(img => img.image_resource_id !== imageId)
          this.showSuccess?.('详情图已删除')
        } else {
          this.showError?.(res.message || '删除失败')
        }
      } catch (e) {
        logger.error('[ExchangeItems] 删除详情图失败:', e)
        this.showError?.('删除详情图失败')
      }
    },

    /**
     * 移动详情图排序（上移/下移）
     *
     * @param {number} index - 当前位置索引
     * @param {string} direction - 'up' 或 'down'
     */
    async moveDetailImage(index, direction) {
      const newIndex = direction === 'up' ? index - 1 : index + 1
      if (newIndex < 0 || newIndex >= this.detailImages.length) return

      // 交换位置
      const temp = this.detailImages[index]
      this.detailImages[index] = this.detailImages[newIndex]
      this.detailImages[newIndex] = temp

      this.detailImages.forEach((img, i) => {
        img.sort_order = i + 1
        const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.IMAGE_UPDATE, { id: img.image_resource_id })
        request({ url, method: 'PATCH', data: { sort_order: i + 1 } }).catch(e => {
          logger.warn('[ExchangeItems] 更新排序失败:', e)
        })
      })
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

    // === 标签管理方法 ===

    /**
     * 添加标签
     */
    addTag() {
      const tag = this.tagInput?.trim()
      if (!tag) return
      if (!Array.isArray(this.itemForm.tags)) this.itemForm.tags = []
      if (this.itemForm.tags.includes(tag)) {
        this.showError?.('标签已存在')
        return
      }
      this.itemForm.tags.push(tag)
      this.tagInput = ''
    },

    /**
     * 移除标签
     * @param {number} index - 标签索引
     */
    removeTag(index) {
      if (Array.isArray(this.itemForm.tags)) {
        this.itemForm.tags.splice(index, 1)
      }
    },

    // === 使用说明管理方法 ===

    /**
     * 添加使用说明条目
     */
    addUsageRule() {
      const rule = this.usageRuleInput?.trim()
      if (!rule) return
      if (!Array.isArray(this.itemForm.usage_rules)) this.itemForm.usage_rules = []
      this.itemForm.usage_rules.push(rule)
      this.usageRuleInput = ''
    },

    /**
     * 移除使用说明条目
     * @param {number} index - 条目索引
     */
    removeUsageRule(index) {
      if (Array.isArray(this.itemForm.usage_rules)) {
        this.itemForm.usage_rules.splice(index, 1)
      }
    },

    // === 展示图管理方法（category='showcase'） ===

    /**
     * 上传商品展示图（多图支持，最多9张）
     * @param {Event} event - 文件选择事件
     */
    async uploadShowcaseImage(event) {
      const file = event.target.files?.[0]
      if (!file) return

      if (this.showcaseImages.length >= 9) {
        this.showError?.('展示图最多9张')
        return
      }

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
        this.showcaseImageUploading = true
        const formData = new FormData()
        formData.append('image', file)
        formData.append('business_type', 'exchange')
        formData.append('category', 'showcase')
        if (this.editingItemId) {
          formData.append('context_id', String(this.editingItemId))
        }
        formData.append('sort_order', String(this.showcaseImages.length + 1))

        const res = await request({
          url: SYSTEM_ADMIN_ENDPOINTS.IMAGE_UPLOAD,
          method: 'POST',
          data: formData
        })

        if (res.success && res.data) {
          this.showcaseImages.push({
            image_resource_id: res.data.image_resource_id,
            url: res.data.url || res.data.image_url,
            sort_order: this.showcaseImages.length + 1
          })
          this.showSuccess?.('展示图上传成功')
        } else {
          this.showError?.(res.message || '展示图上传失败')
        }
      } catch (e) {
        logger.error('[ExchangeItems] 展示图上传失败:', e)
        this.showError?.('展示图上传失败')
      } finally {
        this.showcaseImageUploading = false
        if (event.target) event.target.value = ''
      }
    },

    /**
     * 加载商品的展示图列表
     * @param {number} contextId - 商品 exchange_item_id
     */
    async loadShowcaseImages(contextId) {
      if (!contextId) {
        this.showcaseImages = []
        return
      }
      try {
        const res = await request({
          url: SYSTEM_ADMIN_ENDPOINTS.IMAGE_BY_BUSINESS,
          params: { business_type: 'exchange', context_id: contextId, category: 'showcase' }
        })
        if (res.success && res.data?.images) {
          this.showcaseImages = res.data.images.map(img => ({
            image_resource_id: img.image_resource_id,
            url: img.public_url || img.url,
            sort_order: img.sort_order || 0
          }))
        } else {
          this.showcaseImages = []
        }
      } catch (e) {
        logger.error('[ExchangeItems] 加载展示图失败:', e)
        this.showcaseImages = []
      }
    },

    /**
     * 删除一张展示图
     * @param {number} imageId - 图片资源 ID
     */
    async removeShowcaseImage(imageId) {
      const confirmed = await this.$confirm?.('确定要删除此展示图吗？')
      if (!confirmed) return
      try {
        const url = buildURL(SYSTEM_ADMIN_ENDPOINTS.IMAGE_DELETE, { id: imageId })
        const res = await request({ url, method: 'DELETE' })
        if (res.success) {
          this.showcaseImages = this.showcaseImages.filter(img => img.image_resource_id !== imageId)
          this.showSuccess?.('展示图已删除')
        } else {
          this.showError?.(res.message || '删除失败')
        }
      } catch (e) {
        logger.error('[ExchangeItems] 删除展示图失败:', e)
        this.showError?.('删除展示图失败')
      }
    },

    /**
     * 获取商品状态CSS类
     * @param {string} status - 商品状态
     * @returns {string} CSS类名
     */
    getItemStatusClass(status) {
      return status === 'active' ? 'bg-success' : 'bg-secondary'
    }

    /**
     * 获取商品状态文本
     * @param {string} status - 商品状态
     * @returns {string} 状态文本
     */
    // ✅ 已删除 getItemStatusText 映射函数 - 改用后端 _display 字段（P2 中文化）
  }
}

export default { useExchangeItemsState, useExchangeItemsMethods }
