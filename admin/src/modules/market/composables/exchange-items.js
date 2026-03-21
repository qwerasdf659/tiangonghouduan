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
import { ProductAPI } from '../../../api/product/index.js'
import { ASSET_ENDPOINTS } from '../../../api/asset.js'
import { SYSTEM_ADMIN_ENDPOINTS } from '../../../api/system/admin.js'
import { useSortable } from '../../../alpine/mixins/sortable.js'

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
    /** @type {Object} 商品表单数据 - 使用 Product 模型字段名 */
    itemForm: {
      product_name: '',
      description: '',
      cost_asset_code: '',
      cost_amount: 1,
      cost_price: 0,
      stock: 0,
      sort_order: 100,
      status: 'active',
      primary_media_id: null,
      rarity_code: 'common',
      category_id: null,
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
      free_shipping: false,
      publish_at: '',
      unpublish_at: '',
      attributes: null,
      stock_alert_threshold: 0,
      video_url: '',
      mint_instance: true,
      item_template_id: null,
      attributes_json: null
    },
    /** @type {string} 商品参数表编辑用 JSON 字符串 */
    attributesStr: '{}',
    /** @type {Object|null} 富文本编辑器实例 */
    _richEditorInstance: null,
    /** @type {Array<Object>} 稀有度选项（动态加载自 rarity_defs 字典表） */
    rarityOptions: [],
    /** @type {Array<Object>} 分类选项（动态加载自 category_defs 字典表） */
    categoryOptions: [],
    /** @type {Array<Object>} 物品模板选项（铸造实例时关联的模板） */
    itemTemplateOptions: [],
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
    showcaseImageUploading: false,

    // === SKU 管理状态（Phase 2） ===
    /** @type {Array<Object>} 当前商品的 SKU 列表 */
    itemSkus: [],
    /** @type {Object} SKU 表单（添加/编辑 SKU 用） */
    skuForm: { spec_values: {}, cost_amount: 1, stock: 0, cost_asset_code: '', status: 'active' },
    /** @type {number|null} 正在编辑的 SKU ID（null 表示新增） */
    editingSkuId: null,
    /** @type {boolean} SKU 管理弹窗是否显示 */
    showSkuModal: false,
    /** @type {string} 新规格维度名输入 */
    specNameInput: '',
    /** @type {string} 新规格值输入 */
    specValueInput: '',

    // === 快递公司列表（Phase 4） ===
    /** @type {Array<Object>} 快递公司列表（供发货弹窗下拉选择） */
    shippingCompanies: [],
    /** @type {boolean} 快递公司列表是否已加载 */
    shippingCompaniesLoaded: false
  }
}

/**
 * 商品管理方法
 * @returns {Object} 方法对象
 */
export function useExchangeItemsMethods() {
  /** 排序 mixin：列表键=items，主键=exchange_item_id，保存回调=batchSortItems */
  const sortMixin = useSortable({
    listKey: 'items',
    idKey: 'exchange_item_id',
    sortKey: 'sort_order',
    onSave: async function (sortedItems) {
      await this.batchSortItems(sortedItems)
    }
  })

  return {
    ...sortMixin,
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

        const res = await ProductAPI.listProducts(params)

        if (res.success) {
          const rawItems = res.data?.items || res.data?.list || res.data?.products || []
          this.items = (Array.isArray(rawItems) ? rawItems : []).map(p => ({
            ...p,
            exchange_item_id: p.product_id ?? p.exchange_item_id,
            item_name: p.product_name ?? p.item_name
          }))
          this.itemPagination = {
            total_pages: res.data?.pagination?.total_pages || 1,
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
          // 分类选项从统一商品中心品类树加载
          this.loadProductCategories()
          this.dictionariesLoaded = true
          logger.info('[ExchangeItems] 字典数据加载完成', {
            rarities: this.rarityOptions.length,
            categories: this.categoryOptions.length
          })
        }
        this.loadItemTemplates()
      } catch (e) {
        logger.error('[ExchangeItems] 加载字典数据失败:', e)
      }
    },

    /**
     * 加载物品模板列表（供铸造关联下拉选择）
     */
    async loadItemTemplates() {
      try {
        const res = await request({
          url: ASSET_ENDPOINTS.ITEM_TEMPLATE_LIST,
          method: 'GET',
          params: { page_size: 200 }
        })
        if (res.success && res.data) {
          const templates = res.data.item_templates || res.data.rows || res.data || []
          this.itemTemplateOptions = templates.map(t => ({
            value: t.item_template_id,
            label: `${t.display_name || t.template_code} (${t.item_type})`,
            item_type: t.item_type,
            rarity_code: t.rarity_code
          }))
          logger.info('[ExchangeItems] 物品模板加载完成:', this.itemTemplateOptions.length)
        }
      } catch (e) {
        logger.error('[ExchangeItems] 加载物品模板失败:', e)
      }
    },

    /**
     * 从统一商品中心加载品类树（替代旧 category_defs 字典）
     */
    async loadProductCategories() {
      try {
        const res = await ProductAPI.listCategories()
        if (res.success && res.data) {
          const cats = res.data.categories || res.data || []
          const enabled = cats
            .filter(c => c.is_enabled)
            .map(c => ({
              value: c.category_id,
              label: c.category_name,
              category_code: c.category_code,
              parent_category_id: c.parent_category_id || null,
              level: c.level || 1
            }))
          const parents = enabled.filter(c => c.level === 1).sort((a, b) => a.value - b.value)
          const sorted = []
          for (const p of parents) {
            sorted.push(p)
            const children = enabled.filter(c => c.parent_category_id === p.value)
            sorted.push(...children)
          }
          const orphans = enabled.filter(
            c => c.level === 2 && !parents.some(p => p.value === c.parent_category_id)
          )
          sorted.push(...orphans)
          this.categoryOptions = sorted
          logger.info('[ExchangeItems] 品类树加载完成:', this.categoryOptions.length)
        }
      } catch (e) {
        logger.error('[ExchangeItems] 加载品类树失败:', e)
      }
    },

    /**
     * 打开新增商品弹窗
     */
    openAddItemModal() {
      this.editingItemId = null
      this.itemForm = {
        product_name: '',
        description: '',
        cost_asset_code: '',
        cost_amount: 1,
        cost_price: 0,
        stock: 0,
        sort_order: 100,
        status: 'active',
        primary_media_id: null,
        rarity_code: 'common',
        category_id: null,
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
        free_shipping: false,
        video_url: '',
        mint_instance: true,
        item_template_id: null,
        attributes_json: null
      }
      this.itemImagePreviewUrl = null
      this.detailImages = []
      this.showcaseImages = []
      this.tagInput = ''
      this.usageRuleInput = ''
      this.loadDictionaries()
      this.showModal('itemModal')
      this.$nextTick(() => this._initRichEditor(''))
    },

    /**
     * 编辑商品
     * @param {Object} item - 商品对象（字段名与后端模型一致）
     */
    editItem(item) {
      this.editingItemId = item.product_id || item.exchange_item_id
      this.itemForm = {
        product_name: item.product_name || item.item_name || '',
        description: item.description || '',
        cost_asset_code: item.cost_asset_code || '',
        cost_amount: item.cost_amount || 1,
        cost_price: item.cost_price || 0,
        stock: item.stock || 0,
        sort_order: item.sort_order || 100,
        status: item.status || 'active',
        primary_media_id: item.primary_media_id ?? null,
        rarity_code: item.rarity_code || 'common',
        category_id: item.category_id || null,
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
        free_shipping: !!item.free_shipping,
        publish_at: item.publish_at ? item.publish_at.substring(0, 16) : '',
        unpublish_at: item.unpublish_at ? item.unpublish_at.substring(0, 16) : '',
        attributes: item.attributes || null,
        stock_alert_threshold: item.stock_alert_threshold || 0,
        video_url: item.video_url || '',
        mint_instance: item.mint_instance ?? true,
        item_template_id: item.item_template_id || null,
        attributes_json: item.attributes_json || null
      }
      this.attributesStr = item.attributes ? JSON.stringify(item.attributes, null, 2) : '{}'
      this.itemImagePreviewUrl =
        item.primary_image?.thumbnail_url ||
        item.primary_image?.public_url ||
        item.primary_image?.url ||
        null
      this.tagInput = ''
      this.usageRuleInput = ''
      this.loadDictionaries()
      const itemId = item.product_id || item.exchange_item_id
      this.loadDetailImages(itemId)
      this.loadShowcaseImages(itemId)
      this.loadItemSkus(itemId)
      this.showModal('itemModal')
      this.$nextTick(() => this._initRichEditor(item.description || ''))
    },

    /**
     * 保存商品（新增或更新）
     */
    async saveItem() {
      if (!this.itemForm.product_name || !this.itemForm.cost_asset_code) {
        this.showError?.('请填写必填项')
        return
      }

      if (
        this.attributesStr &&
        this.attributesStr.trim() !== '{}' &&
        this.attributesStr.trim() !== ''
      ) {
        try {
          this.itemForm.attributes = JSON.parse(this.attributesStr)
        } catch {
          this.showError?.('商品参数表 JSON 格式错误')
          return
        }
      } else {
        this.itemForm.attributes = null
      }

      if (!this.itemForm.publish_at) this.itemForm.publish_at = null
      if (!this.itemForm.unpublish_at) this.itemForm.unpublish_at = null

      try {
        this.saving = true
        let res
        if (this.editingItemId) {
          res = await ProductAPI.updateProduct(this.editingItemId, this.itemForm)
        } else {
          res = await ProductAPI.createProduct(this.itemForm)
        }

        if (res.success) {
          this.showSuccess?.(this.editingItemId ? '更新成功' : '添加成功')
          this.hideModal?.('itemModal')

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
     * 上传商品图片并绑定 primary_media_id
     *
     * @param {Event} event - 文件选择事件（input[type=file] change 事件）
     * @description 上传图片到 Sealos 对象存储，返回 media_id，
     *              设置到 itemForm.primary_media_id 并更新预览 URL
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
          url: SYSTEM_ADMIN_ENDPOINTS.MEDIA_UPLOAD,
          method: 'POST',
          data: formData
        })

        if (res.success && res.data) {
          this.itemForm.primary_media_id = res.data.media_id
          this.itemImagePreviewUrl =
            res.data.public_url || res.data.url || res.data.image_url || null
          this.showSuccess?.('图片上传成功')
          logger.info('[ExchangeItems] 图片上传成功:', res.data.media_id)
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
          url: SYSTEM_ADMIN_ENDPOINTS.MEDIA_UPLOAD,
          method: 'POST',
          data: formData
        })

        if (res.success && res.data) {
          this.detailImages.push({
            media_id: res.data.media_id,
            url: res.data.public_url || res.data.url || res.data.image_url,
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
          url: SYSTEM_ADMIN_ENDPOINTS.MEDIA_BY_ENTITY('exchange_item', contextId),
          params: { category: 'detail' }
        })

        const images = res.data?.images || res.data?.items || res.data?.media || []
        if (res.success && images.length >= 0) {
          this.detailImages = images.map(img => ({
            media_id: img.media_id,
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
    async removeDetailImage(mediaId) {
      const confirmed = await this.$confirm?.('确定要删除此详情图吗？')
      if (!confirmed) return

      try {
        const url = SYSTEM_ADMIN_ENDPOINTS.MEDIA_DELETE(mediaId)
        const res = await request({ url, method: 'DELETE' })

        if (res.success) {
          this.detailImages = this.detailImages.filter(img => img.media_id !== mediaId)
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
        const url = SYSTEM_ADMIN_ENDPOINTS.MEDIA_UPDATE(img.media_id)
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
        const res = await ProductAPI.deleteProduct(itemId)
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
      const itemId = item.product_id || item.exchange_item_id

      try {
        const res = await ProductAPI.updateProduct(itemId, { status: newStatus })
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
          url: SYSTEM_ADMIN_ENDPOINTS.MEDIA_UPLOAD,
          method: 'POST',
          data: formData
        })

        if (res.success && res.data) {
          this.showcaseImages.push({
            media_id: res.data.media_id,
            url: res.data.public_url || res.data.url || res.data.image_url,
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
          url: SYSTEM_ADMIN_ENDPOINTS.MEDIA_BY_ENTITY('exchange_item', contextId),
          params: { category: 'showcase' }
        })
        const images = res.data?.images || res.data?.items || res.data?.media || []
        if (res.success && images.length >= 0) {
          this.showcaseImages = images.map(img => ({
            media_id: img.media_id,
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
    async removeShowcaseImage(mediaId) {
      const confirmed = await this.$confirm?.('确定要删除此展示图吗？')
      if (!confirmed) return
      try {
        const url = SYSTEM_ADMIN_ENDPOINTS.MEDIA_DELETE(mediaId)
        const res = await request({ url, method: 'DELETE' })
        if (res.success) {
          this.showcaseImages = this.showcaseImages.filter(img => img.media_id !== mediaId)
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
    },

    // ===== SKU 管理方法（Phase 2 — SPU/SKU 全量模式） =====

    /**
     * 加载商品的 SKU 列表
     * @param {number} itemId - 商品 ID
     */
    async loadItemSkus(itemId) {
      try {
        const res = await ProductAPI.listSkus(itemId)
        if (res.success) {
          this.itemSkus = res.data?.skus || res.data?.items || []
        }
      } catch (e) {
        logger.error('[ExchangeItems] 加载 SKU 列表失败:', e)
        this.itemSkus = []
      }
    },

    /**
     * 保存 SKU（新建或更新）
     * @param {number} itemId - 商品 ID
     */
    async saveSku(itemId) {
      try {
        let res
        if (this.editingSkuId) {
          res = await ProductAPI.updateSku(this.editingSkuId, this.skuForm)
        } else {
          res = await ProductAPI.createSku(itemId, this.skuForm)
        }
        if (res.success) {
          this.showSuccess?.(this.editingSkuId ? 'SKU 已更新' : 'SKU 已创建')
          await this.loadItemSkus(itemId)
          this.resetSkuForm()
        } else {
          this.showError?.(res.message || '保存 SKU 失败')
        }
      } catch (e) {
        logger.error('[ExchangeItems] 保存 SKU 失败:', e)
        this.showError?.('保存 SKU 失败')
      }
    },

    /**
     * 编辑 SKU（填充表单）
     * @param {Object} sku - SKU 数据
     */
    editSku(sku) {
      this.editingSkuId = sku.sku_id
      this.skuForm = {
        spec_values: sku.spec_values || {},
        cost_amount: sku.cost_amount,
        stock: sku.stock,
        cost_asset_code: sku.cost_asset_code || '',
        status: sku.status
      }
    },

    /**
     * 删除 SKU
     * @param {number} itemId - 商品 ID
     * @param {number} skuId - SKU ID
     */
    async deleteSku(itemId, skuId) {
      if (!confirm('确定要删除此 SKU 吗？')) return
      try {
        const res = await ProductAPI.deleteSku(skuId)
        if (res.success) {
          this.showSuccess?.('SKU 已删除')
          await this.loadItemSkus(itemId)
        } else {
          this.showError?.(res.message || '删除失败')
        }
      } catch (e) {
        logger.error('[ExchangeItems] 删除 SKU 失败:', e)
        this.showError?.('删除 SKU 失败')
      }
    },

    /** 重置 SKU 表单 */
    resetSkuForm() {
      this.editingSkuId = null
      this.skuForm = {
        spec_values: {},
        cost_amount: 1,
        stock: 0,
        cost_asset_code: '',
        status: 'active'
      }
    },

    // ===== 排序管理方法（Phase 3 — 排序增强） =====

    /**
     * 置顶/取消置顶商品
     * @param {Object} item - 商品对象
     */
    async togglePin(item) {
      try {
        const url = buildURL(MARKET_ENDPOINTS.EXCHANGE_ITEM_PIN, {
          exchange_item_id: item.exchange_item_id
        })
        const res = await request({ url, method: 'PUT', data: { is_pinned: !item.is_pinned } })
        if (res.success) {
          this.showSuccess?.(res.data?.is_pinned ? '商品已置顶' : '已取消置顶')
          await this.loadItems()
        }
      } catch (e) {
        logger.error('[ExchangeItems] 置顶操作失败:', e)
        this.showError?.('操作失败')
      }
    },

    /**
     * 推荐/取消推荐商品
     * @param {Object} item - 商品对象
     */
    async toggleRecommend(item) {
      try {
        const url = buildURL(MARKET_ENDPOINTS.EXCHANGE_ITEM_RECOMMEND, {
          exchange_item_id: item.exchange_item_id
        })
        const res = await request({
          url,
          method: 'PUT',
          data: { is_recommended: !item.is_recommended }
        })
        if (res.success) {
          this.showSuccess?.(res.data?.is_recommended ? '商品已推荐' : '已取消推荐')
          await this.loadItems()
        }
      } catch (e) {
        logger.error('[ExchangeItems] 推荐操作失败:', e)
        this.showError?.('操作失败')
      }
    },

    /**
     * 批量更新商品排序（调用后端 batch-sort 接口）
     * @param {Array<{exchange_item_id: number, sort_order: number}>} sortItems - 排序数组
     */
    async batchSortItems(sortItems) {
      if (!Array.isArray(sortItems) || sortItems.length === 0) return
      try {
        this.saving = true
        const res = await request({
          url: MARKET_ENDPOINTS.EXCHANGE_ITEMS_BATCH_SORT,
          method: 'PUT',
          data: { items: sortItems }
        })
        if (res.success) {
          this.showSuccess?.(`已更新 ${res.data?.updated_count || sortItems.length} 个商品排序`)
          await this.loadItems()
        } else {
          this.showError?.(res.message || '批量排序失败')
        }
      } catch (e) {
        logger.error('[ExchangeItems] 批量排序失败:', e)
        this.showError?.('批量排序失败')
      } finally {
        this.saving = false
      }
    },

    // ===== 富文本编辑器（WangEditor） =====

    /**
     * 初始化富文本编辑器
     * @param {string} initialHtml - 初始 HTML 内容
     */
    async _initRichEditor(initialHtml) {
      this._destroyRichEditor()
      try {
        const { createRichEditor } = await import('../../../utils/wangeditor-lazy.js')
        this._richEditorInstance = await createRichEditor('#description-editor', {
          toolbarSelector: '#description-toolbar',
          initialHtml: initialHtml || '',
          placeholder: '请输入商品描述（支持富文本格式）...',
          onChange: html => {
            this.itemForm.description = html
          }
        })
      } catch (e) {
        const { logger } = await import('../../../utils/logger.js')
        logger.warn('[ExchangeItems] 富文本编辑器初始化失败，降级为纯文本:', e.message)
      }
    },

    /** 销毁富文本编辑器 */
    _destroyRichEditor() {
      if (this._richEditorInstance?.editor) {
        try {
          this._richEditorInstance.editor.destroy()
        } catch {
          // 静默处理
        }
        this._richEditorInstance = null
      }
    },

    // ===== 快递公司加载（Phase 4） =====

    /** 加载快递公司列表（首次调用时从后端获取并缓存） */
    async loadShippingCompanies() {
      if (this.shippingCompaniesLoaded) return
      try {
        const res = await request({
          url: MARKET_ENDPOINTS.EXCHANGE_SHIPPING_COMPANIES,
          method: 'GET'
        })
        if (res.success) {
          this.shippingCompanies = res.data?.companies || []
          this.shippingCompaniesLoaded = true
        }
      } catch (e) {
        logger.error('[ExchangeItems] 加载快递公司列表失败:', e)
      }
    },

    /**
     * 查询订单物流轨迹
     * @param {string} orderNo - 订单号
     * @returns {Promise<Object|null>} 物流轨迹数据
     */
    async queryOrderTrack(orderNo) {
      try {
        const url = buildURL(MARKET_ENDPOINTS.EXCHANGE_ORDER_TRACK, { order_no: orderNo })
        const res = await request({ url, method: 'GET' })
        if (res.success) return res.data
        this.showError?.(res.message || '查询物流失败')
        return null
      } catch (e) {
        logger.error('[ExchangeItems] 查询物流失败:', e)
        this.showError?.('查询物流轨迹失败')
        return null
      }
    },

    /**
     * 导出兑换商品列表（CSV 下载）
     *
     * @param {Object} [params] - 筛选参数
     * @param {string} [params.status] - 按状态筛选（active/inactive）
     */
    exportItems(params = {}) {
      ExchangeAPI.exportItems(params)
    },

    /**
     * 导入兑换商品（Excel/CSV 文件上传）
     * 通过文件选择器选择文件后调用后端导入接口
     *
     * @param {Event} event - input[type=file] 的 change 事件
     */
    async importItems(event) {
      const file = event?.target?.files?.[0]
      if (!file) return

      try {
        this.saving = true
        const res = await ExchangeAPI.importItems(file)
        if (res.success) {
          const msg = `成功导入 ${res.data?.imported_count || 0} 个商品`
          const errMsg = res.data?.error_count ? `，${res.data.error_count} 行失败` : ''
          this.$toast?.success(msg + errMsg)
          await this.loadItems?.()
          await this.loadItemStats?.()
        } else {
          this.$toast?.error(res.message || '导入失败')
        }
      } catch (e) {
        logger.error('[ExchangeItems] 导入失败:', e)
        this.$toast?.error(e.message || '导入失败')
      } finally {
        this.saving = false
        // 重置 file input 以便再次选择同一文件
        if (event?.target) event.target.value = ''
      }
    }
  }
}
