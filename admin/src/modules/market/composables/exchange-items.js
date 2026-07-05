/**
 * 兑换商品管理模块
 *
 * @file admin/src/modules/market/composables/exchange-items.js
 * @description 商品列表、CRUD操作、库存管理
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { formatProductCode, formatSeriesNo } from '../../../utils/index.js'
import { buildURL, request } from '../../../api/base.js'
import { EXCHANGE_ENDPOINTS } from '../../../api/market/exchange.js'
import { ExchangeItemAPI } from '../../../api/exchange-item/index.js'
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
    /** @type {Object} 商品表单数据 */
    itemForm: {
      item_name: '',
      description: '',
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
      attributes_json: null,
      max_quantity_per_order: 10,
      // 门店专属兑换券业务线：履约类型 + 核销范围（前端零映射直传后端字段）
      fulfillment_type: 'physical',
      applicable_scope: 'all',
      scoped_store_ids: [],
      merchant_id: null,
      // 商品编码体系：所属系列（可空；series_seq/item_code 由后端系统生成，前端不传）
      series_id: null
    },
    /** @type {string} 扫码/输码快速定位输入框绑定值（客服/对账直达单品用） */
    quickLocateCode: '',
    /** @type {string} 编辑中商品的平台展示码 item_code（规范形，后端生成只读） */
    editingItemCode: '',
    /** @type {string} 编辑中商品的系列号展示形（如 SLNB-001，未归系列为空） */
    editingSeriesNo: '',
    /** @type {Array<Object>} 系列选项（product_series，商品表单选系列用） */
    seriesOptions: [],
    /** @type {Array<Object>} 供应商选项（suppliers，多供应商区块选择用） */
    supplierOptions: [],
    /** @type {Array<Object>} 商品的供应商关联行（多供应商 + 各自货号 + 主供货商标记） */
    itemSupplierLinks: [],
    /** @type {Array<Object>} 门店选项（核销范围=指定门店时多选，复用 active 门店列表） */
    storeScopeOptions: [],
    /** @type {Array<Object>} 商家选项（核销范围=商家全门店时单选） */
    merchantScopeOptions: [],
    /** @type {string} 商品参数表编辑用 JSON 字符串 */
    attributesStr: '{}',
    /** @type {Object|null} 富文本编辑器实例 */
    _richEditorInstance: null,
    /** @type {Array<Object>} 稀有度选项（动态加载自 rarity_defs 字典表） */
    rarityOptions: [],
    /** @type {Array<Object>} 分类选项（动态加载自 categories 品类表） */
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
    /** @type {Array<Object>} 商品主图轮播组（事项A：role='gallery'，小程序详情主图轮播读 images[]） */
    galleryImages: [],
    /** @type {boolean} 主图轮播组上传中 */
    galleryImageUploading: false,
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
    /** @type {Array} 事项B：当前编辑 SKU 的多图轮播组（attachable_type='exchange_item_sku', role='gallery'） */
    skuGalleryImages: [],
    /** @type {boolean} SKU 多图上传中 */
    skuGalleryUploading: false,
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
          const rawTypes = res.data?.asset_types || []
          const typeMap = new Map()
          for (const type of rawTypes) {
            if (type && type.asset_code && !typeMap.has(type.asset_code)) {
              typeMap.set(type.asset_code, type)
            }
          }
          this.assetTypes = Array.from(typeMap.values())

          // 同步到 Alpine.store 供 data-table 等独立组件使用
          const { Alpine } = await import('../../../alpine/index.js')
          const displayMap = {}
          for (const [code, t] of typeMap) {
            displayMap[code] = t.display_name || code
          }
          Alpine.store('assetTypeMap', displayMap)
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

        const res = await ExchangeItemAPI.listExchangeItems(params)

        if (res.success) {
          const rawItems = res.data?.items || []
          this.items = (Array.isArray(rawItems) ? rawItems : []).map(p => ({
            ...p,
            exchange_item_id: p.exchange_item_id,
            item_name: p.item_name
          }))
          this.itemPagination = {
            total_pages: res.data?.total_pages || 1,
            total: res.data?.total || this.items.length
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
     * 加载商品统计信息（使用后端统计接口，不再前端拉取全量商品聚合）
     */
    async loadItemStats() {
      try {
        const res = await request({
          url: EXCHANGE_ENDPOINTS.STATS,
          method: 'GET'
        })
        if (res.success && res.data) {
          const isu = res.data.items_summary || {}
          const os = res.data.orders_summary || {}
          this.itemStats = {
            total: (isu.active_count ?? 0) + (isu.inactive_count ?? 0),
            active: isu.active_count ?? 0,
            lowStock: isu.low_stock_count ?? 0,
            totalSold: os.completed ?? 0
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
          this.loadItemCategories()
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
          const templates = res.data.list || []
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
     * 从统一商品中心加载品类树（categories 表）
     */
    async loadItemCategories() {
      try {
        const res = await ExchangeItemAPI.listCategories()
        if (res.success && res.data) {
          const cats = res.data.items || []
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
        item_name: '',
        description: '',
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
        attributes_json: null,
        max_quantity_per_order: 10,
        fulfillment_type: 'physical',
        applicable_scope: 'all',
        scoped_store_ids: [],
        merchant_id: null,
        series_id: null
      }
      this.editingItemCode = ''
      this.editingSeriesNo = ''
      this.itemSupplierLinks = []
      this.itemImagePreviewUrl = null
      this.galleryImages = []
      this.detailImages = []
      this.showcaseImages = []
      this.tagInput = ''
      this.usageRuleInput = ''
      this.loadDictionaries()
      this.loadScopeOptions()
      this.loadSeriesOptions()
      this.loadSupplierOptions()
      this.showModal('itemModal')
      this.$nextTick(() => this._initRichEditor(''))
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
        attributes_json: item.attributes_json || null,
        max_quantity_per_order: item.max_quantity_per_order ?? 10,
        fulfillment_type: item.fulfillment_type || 'physical',
        applicable_scope: item.applicable_scope || 'all',
        scoped_store_ids: Array.isArray(item.scoped_store_ids) ? item.scoped_store_ids : [],
        merchant_id: item.merchant_id || null,
        series_id: item.series_id || null
      }
      // 商品编码体系：编码/系列号只读展示（后端生成，前端不可改）
      this.editingItemCode = item.item_code || ''
      this.editingSeriesNo =
        item.series && item.series_seq != null
          ? formatSeriesNo(item.series.series_code, item.series_seq, item.series.seq_pad)
          : ''
      this.attributesStr = item.attributes ? JSON.stringify(item.attributes, null, 2) : '{}'
      this.itemImagePreviewUrl =
        item.primary_image?.thumbnail_url ||
        item.primary_image?.public_url ||
        item.primary_image?.url ||
        null
      this.tagInput = ''
      this.usageRuleInput = ''
      this.loadDictionaries()
      this.loadScopeOptions()
      this.loadSeriesOptions()
      this.loadSupplierOptions()
      const itemId = item.exchange_item_id
      this.loadDetailImages(itemId)
      this.loadShowcaseImages(itemId)
      this.loadGalleryImages(itemId)
      this.loadItemSkus(itemId)
      this.loadItemSupplierLinks(itemId)
      this.showModal('itemModal')
      this.$nextTick(() => {
        this._initRichEditor(item.description || '')
        this.renderItemCodeQr()
      })
    },

    /**
     * 加载系列选项（product_series 主数据，商品表单「所属系列」下拉用）
     * 仅取启用中的系列；未归系列的商品保持 series_id=null。
     */
    async loadSeriesOptions() {
      try {
        const res = await ExchangeItemAPI.listProductSeries({ status: 'active', page_size: 100 })
        if (res.success) {
          this.seriesOptions = (res.data?.items || []).map(s => ({
            series_id: s.series_id,
            series_code: s.series_code,
            series_name: s.series_name
          }))
        }
      } catch (e) {
        logger.error('[ExchangeItems] 加载系列选项失败:', e)
        this.seriesOptions = []
      }
    },

    /**
     * 加载供应商选项（suppliers 主数据，多供应商区块选择用）
     */
    async loadSupplierOptions() {
      try {
        const res = await ExchangeItemAPI.listSuppliers({ status: 'active', page_size: 200 })
        if (res.success) {
          this.supplierOptions = (res.data?.items || []).map(s => ({
            supplier_id: s.supplier_id,
            supplier_name: s.supplier_name
          }))
        }
      } catch (e) {
        logger.error('[ExchangeItems] 加载供应商选项失败:', e)
        this.supplierOptions = []
      }
    },

    /**
     * 加载商品的供应商关联行（编辑表单回显）
     * @param {number} itemId - 商品 ID
     */
    async loadItemSupplierLinks(itemId) {
      try {
        const res = await ExchangeItemAPI.getItemSupplierLinks(itemId)
        if (res.success) {
          this.itemSupplierLinks = (res.data?.links || []).map(l => ({
            supplier_id: l.supplier_id,
            supplier_item_code: l.supplier_item_code || '',
            is_primary: !!l.is_primary
          }))
        }
      } catch (e) {
        logger.error('[ExchangeItems] 加载商品供应商关联失败:', e)
        this.itemSupplierLinks = []
      }
    },

    /**
     * 新增一行供应商关联（多供应商：供应商 + 该供应商货号 + 主供货商标记）
     */
    addSupplierLink() {
      this.itemSupplierLinks.push({ supplier_id: '', supplier_item_code: '', is_primary: false })
    },

    /**
     * 移除一行供应商关联
     * @param {number} index - 行下标
     */
    removeSupplierLink(index) {
      this.itemSupplierLinks.splice(index, 1)
    },

    /**
     * 标记主供货商（最多一行；点选某行时其余行取消）
     * @param {number} index - 行下标
     */
    setPrimarySupplierLink(index) {
      this.itemSupplierLinks.forEach((l, i) => {
        l.is_primary = i === index ? !l.is_primary : false
      })
    },

    /**
     * 保存商品的供应商关联行（全量替换；空数组=解除全部关联/自营）
     * @param {number} itemId - 商品 ID
     * @returns {Promise<void>}
     */
    async _saveItemSupplierLinks(itemId) {
      // 过滤掉未选供应商的空行；货号可空可重复（脏数据如实存，仅对账参考）
      const links = this.itemSupplierLinks
        .filter(l => l.supplier_id)
        .map(l => ({
          supplier_id: Number(l.supplier_id),
          supplier_item_code: String(l.supplier_item_code || '').trim() || null,
          is_primary: !!l.is_primary
        }))
      const res = await ExchangeItemAPI.setItemSupplierLinks(itemId, links)
      if (!res.success) {
        throw new Error(res.message || '保存供应商关联失败')
      }
    },

    /**
     * 商品编码展示形（模态框只读展示用）
     * @param {string} code - 规范形编码
     * @returns {string} 展示形 SP-XXXX-XXXX-XXXX
     */
    formatItemCodeDisplay(code) {
      return formatProductCode(code)
    },

    /**
     * SKU 编码展示形（SKU 规格表用）
     * @param {string} code - 规范形 sku_code
     * @returns {string} 展示形 SK-XXXX-XXXX-XXXX
     */
    formatSkuCode(code) {
      return formatProductCode(code)
    },

    /**
     * 渲染商品编码二维码（拍1 方案A：后端出编码 payload，admin 用纯 JS qrcode 库端侧渲染）
     *
     * 二维码内容 = item_code 规范形（扫码结果作为搜索输入定位商品，与手册手工输码并存）。
     * qrcode 库按需懒加载（与 echarts-lazy 同思路），不进其它页面首屏。
     * @returns {Promise<void>}
     */
    async renderItemCodeQr() {
      if (!this.editingItemCode) return
      const canvas = document.getElementById('item-code-qr-canvas')
      if (!canvas) return
      try {
        const { default: QRCode } = await import('qrcode')
        await QRCode.toCanvas(canvas, this.editingItemCode, {
          width: 96,
          margin: 1,
          errorCorrectionLevel: 'M'
        })
      } catch (e) {
        logger.error('[ExchangeItems] 渲染编码二维码失败:', e)
      }
    },

    /**
     * 加载核销范围选项（门店专属兑换券业务线）
     * - storeScopeOptions：active 门店列表（核销范围=指定门店时多选）
     * - merchantScopeOptions：商家列表（核销范围=商家全门店时单选）
     * 复用现有 /console/stores 与 /console/merchants 接口，零新增后端端点。
     */
    async loadScopeOptions() {
      try {
        const { STORE_ENDPOINTS } = await import('../../../api/store.js')
        const { request } = await import('../../../api/base.js')
        const res = await request({
          url: `${STORE_ENDPOINTS.LIST}?status=active&page=1&page_size=200`
        })
        const list = res?.data?.stores || res?.data?.list || res?.data || []
        this.storeScopeOptions = Array.isArray(list)
          ? list.map(s => ({ store_id: s.store_id, store_name: s.store_name }))
          : []
      } catch (e) {
        logger.error('[ExchangeItems] 加载门店选项失败:', e)
        this.storeScopeOptions = []
      }
      try {
        const { getMerchantList } = await import('../../../api/merchant.js')
        const res = await getMerchantList({ page: 1, page_size: 200 })
        const list = res?.data?.merchants || res?.data?.list || res?.data || []
        this.merchantScopeOptions = Array.isArray(list)
          ? list.map(m => ({ merchant_id: m.merchant_id, merchant_name: m.merchant_name }))
          : []
      } catch (e) {
        logger.error('[ExchangeItems] 加载商家选项失败:', e)
        this.merchantScopeOptions = []
      }
    },

    /**
     * 切换门店多选（核销范围=指定门店）
     * @param {number} storeId - 门店ID
     */
    toggleScopeStore(storeId) {
      const id = Number(storeId)
      const arr = this.itemForm.scoped_store_ids || []
      const idx = arr.indexOf(id)
      if (idx >= 0) {
        arr.splice(idx, 1)
      } else {
        arr.push(id)
      }
      this.itemForm.scoped_store_ids = [...arr]
    },

    /**
     * 保存商品（新增或更新）
     */
    async saveItem() {
      if (!this.itemForm.item_name) {
        this.showError?.('请填写商品名称')
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

      // 门店专属兑换券：核销范围前端校验（避免建出"范围为空"的废券，后端也会再校验）
      if (this.itemForm.applicable_scope === 'specified_stores') {
        const ids = (this.itemForm.scoped_store_ids || []).map(Number).filter(Boolean)
        if (ids.length === 0) {
          this.showError?.('核销范围为「指定门店」时，请至少选择一个门店')
          return
        }
        this.itemForm.scoped_store_ids = ids
        this.itemForm.merchant_id = null
      } else if (this.itemForm.applicable_scope === 'merchant_all') {
        if (!this.itemForm.merchant_id) {
          this.showError?.('核销范围为「商家全门店」时，请选择归属商家')
          return
        }
        this.itemForm.scoped_store_ids = []
      } else {
        // 通用券：清空范围约束
        this.itemForm.scoped_store_ids = []
        this.itemForm.merchant_id = null
      }

      try {
        this.saving = true
        let res
        if (this.editingItemId) {
          res = await ExchangeItemAPI.updateExchangeItem(this.editingItemId, this.itemForm)
        } else {
          res = await ExchangeItemAPI.createExchangeItem(this.itemForm)
        }

        if (res.success) {
          // 新建商品：上传时 editingItemId 为空、详情/展示图未 attach，建好后用返回 id 补 attach
          if (!this.editingItemId) {
            const newItemId =
              res.data?.exchange_item_id || res.data?.id || res.data?.item?.exchange_item_id
            if (newItemId) {
              await this._attachPendingGalleryImages(newItemId)
            }
          }

          // 商品编码体系：同步保存供应商关联行（多供应商 + 各自货号；空=自营/未知来源）
          const savedItemId =
            this.editingItemId ||
            res.data?.exchange_item_id ||
            res.data?.id ||
            res.data?.item?.exchange_item_id
          if (savedItemId) {
            try {
              await this._saveItemSupplierLinks(savedItemId)
            } catch (linkErr) {
              // 商品主体已保存成功，供应商关联失败单独报错（不吞掉，运营可重新编辑保存）
              this.showError?.(`商品已保存，但供应商关联保存失败：${linkErr.message}`)
            }
          }

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
     * 新建商品后补绑详情图/展示图到 media_attachments（事项A）
     *
     * 新建时商品尚无 exchange_item_id，详情/展示图先上传到媒体库存于本地数组；
     * 商品创建成功后用返回的 id 逐张补调 attach，落 role='detail'/'showcase' + sort_order。
     * @param {number} newItemId - 新建商品的 exchange_item_id
     * @returns {Promise<void>}
     */
    async _attachPendingGalleryImages(newItemId) {
      const attachOne = (mediaId, role, sortOrder) =>
        request({
          url: SYSTEM_ADMIN_ENDPOINTS.MEDIA_ATTACH(mediaId),
          method: 'POST',
          data: {
            attachable_type: 'exchange_item',
            attachable_id: newItemId,
            role,
            sort_order: sortOrder
          }
        }).catch(e => logger.warn('[ExchangeItems] 补绑图片失败:', e))

      const tasks = []
      this.galleryImages.forEach((img, i) => tasks.push(attachOne(img.media_id, 'gallery', i + 1)))
      this.detailImages.forEach((img, i) => tasks.push(attachOne(img.media_id, 'detail', i + 1)))
      this.showcaseImages.forEach((img, i) =>
        tasks.push(attachOne(img.media_id, 'showcase', i + 1))
      )
      if (tasks.length > 0) await Promise.all(tasks)
    },

    /**
     * 上传商品主图并绑定 primary_media_id
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
     * 上传商品主图轮播组图片（事项A：role='gallery'，小程序详情主图轮播 images[]）
     * @param {Event} event - 文件选择事件
     */
    async uploadGalleryImage(event) {
      const file = event.target.files?.[0]
      if (!file) return
      if (this.galleryImages.length >= 9) {
        this.showError?.('主图轮播组最多9张')
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
        this.galleryImageUploading = true
        const formData = new FormData()
        formData.append('image', file)
        formData.append('business_type', 'exchange')
        const res = await request({
          url: SYSTEM_ADMIN_ENDPOINTS.MEDIA_UPLOAD,
          method: 'POST',
          data: formData
        })
        if (res.success && res.data) {
          const nextSort = this.galleryImages.length + 1
          if (this.editingItemId) {
            await request({
              url: SYSTEM_ADMIN_ENDPOINTS.MEDIA_ATTACH(res.data.media_id),
              method: 'POST',
              data: {
                attachable_type: 'exchange_item',
                attachable_id: this.editingItemId,
                role: 'gallery',
                sort_order: nextSort
              }
            })
          }
          this.galleryImages.push({
            media_id: res.data.media_id,
            url: res.data.public_url || res.data.url || res.data.image_url,
            sort_order: nextSort
          })
          this.showSuccess?.('主图上传成功')
        } else {
          this.showError?.(res.message || '主图上传失败')
        }
      } catch (e) {
        logger.error('[ExchangeItems] 主图轮播组上传失败:', e)
        this.showError?.('主图上传失败')
      } finally {
        this.galleryImageUploading = false
        if (event.target) event.target.value = ''
      }
    },

    /**
     * 加载商品主图轮播组（role='gallery'）
     * @param {number} contextId - 商品 exchange_item_id
     */
    async loadGalleryImages(contextId) {
      if (!contextId) {
        this.galleryImages = []
        return
      }
      try {
        const res = await request({
          url: SYSTEM_ADMIN_ENDPOINTS.MEDIA_BY_ENTITY('exchange_item', contextId),
          params: { role: 'gallery' }
        })
        const images = res.data?.items || res.data?.images || []
        this.galleryImages = images.map(img => ({
          media_id: img.media_id,
          url: img.public_url || img.url,
          sort_order: img.sort_order || 0
        }))
      } catch (e) {
        logger.error('[ExchangeItems] 加载主图轮播组失败:', e)
        this.galleryImages = []
      }
    },

    /**
     * 移除一张主图轮播组图片（解绑 gallery，不删媒体库源文件）
     * @param {number} mediaId - 媒体 ID
     */
    async removeGalleryImage(mediaId) {
      try {
        await request({
          url: SYSTEM_ADMIN_ENDPOINTS.MEDIA_DETACH(mediaId),
          method: 'POST',
          data: {
            attachable_type: 'exchange_item',
            attachable_id: this.editingItemId,
            role: 'gallery'
          }
        })
        this.galleryImages = this.galleryImages.filter(img => img.media_id !== mediaId)
        this.showSuccess?.('已移除')
      } catch (e) {
        logger.error('[ExchangeItems] 移除主图失败:', e)
        this.showError?.('移除失败')
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
        // 1) 上传文件到媒体库（仅落 media_files）
        const formData = new FormData()
        formData.append('image', file)
        formData.append('business_type', 'exchange')

        const res = await request({
          url: SYSTEM_ADMIN_ENDPOINTS.MEDIA_UPLOAD,
          method: 'POST',
          data: formData
        })

        if (res.success && res.data) {
          const nextSort = this.detailImages.length + 1
          /*
           * 2) 落 media_attachments（事项A：以后端权威字段为准）
           * attachable_type='exchange_item'、role='detail'、sort_order 排序；编辑态才能 attach（需 exchange_item_id）
           */
          if (this.editingItemId) {
            await request({
              url: SYSTEM_ADMIN_ENDPOINTS.MEDIA_ATTACH(res.data.media_id),
              method: 'POST',
              data: {
                attachable_type: 'exchange_item',
                attachable_id: this.editingItemId,
                role: 'detail',
                sort_order: nextSort
              }
            })
          }
          this.detailImages.push({
            media_id: res.data.media_id,
            url: res.data.public_url || res.data.url || res.data.image_url,
            sort_order: nextSort
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
          params: { role: 'detail' }
        })

        const images = res.data?.items || res.data?.images || res.data?.media || []
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
        const res = await ExchangeItemAPI.deleteExchangeItem(itemId)
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
      const itemId = item.exchange_item_id

      try {
        const res = await ExchangeItemAPI.updateExchangeItem(itemId, { status: newStatus })
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
        // 1) 上传文件到媒体库（仅落 media_files）
        const formData = new FormData()
        formData.append('image', file)
        formData.append('business_type', 'exchange')

        const res = await request({
          url: SYSTEM_ADMIN_ENDPOINTS.MEDIA_UPLOAD,
          method: 'POST',
          data: formData
        })

        if (res.success && res.data) {
          const nextSort = this.showcaseImages.length + 1
          // 2) 落 media_attachments（attachable_type='exchange_item'、role='showcase'）
          if (this.editingItemId) {
            await request({
              url: SYSTEM_ADMIN_ENDPOINTS.MEDIA_ATTACH(res.data.media_id),
              method: 'POST',
              data: {
                attachable_type: 'exchange_item',
                attachable_id: this.editingItemId,
                role: 'showcase',
                sort_order: nextSort
              }
            })
          }
          this.showcaseImages.push({
            media_id: res.data.media_id,
            url: res.data.public_url || res.data.url || res.data.image_url,
            sort_order: nextSort
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
          params: { role: 'showcase' }
        })
        const images = res.data?.items || res.data?.images || res.data?.media || []
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
        const res = await ExchangeItemAPI.listSkus(itemId)
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
     *
     * 价格真相源是 exchange_channel_prices：SKU 主体（createSku/updateSku）只写库存/状态/规格，
     * 价格通过独立的渠道价端点 setChannelPrices 全量替换（与 prop-shop 一体化上架链同一模式）。
     * @param {number} itemId - 商品 ID
     */
    async saveSku(itemId) {
      try {
        const exchangeItemId = itemId || this.editingItemId
        const { cost_amount, cost_asset_code, ...skuBody } = this.skuForm
        if (!cost_asset_code) {
          this.showError?.('请选择计价资产类型')
          return
        }
        let res
        let skuId
        if (this.editingSkuId) {
          res = await ExchangeItemAPI.updateSku(this.editingSkuId, skuBody)
          skuId = this.editingSkuId
        } else {
          res = await ExchangeItemAPI.createSku(exchangeItemId, skuBody)
          skuId = res.data?.sku_id
        }
        if (!res.success) {
          this.showError?.(res.message || '保存 SKU 失败')
          return
        }
        if (!skuId) {
          this.showError?.('保存 SKU 成功但未返回 sku_id，无法设置价格')
          return
        }
        const priceRes = await ExchangeItemAPI.setChannelPrices(skuId, [
          { cost_asset_code, cost_amount: Number(cost_amount) }
        ])
        if (!priceRes.success) {
          this.showError?.(priceRes.message || '保存价格失败')
          return
        }
        this.showSuccess?.(this.editingSkuId ? 'SKU 已更新' : 'SKU 已创建')
        await this.loadItemSkus(exchangeItemId)
        this.resetSkuForm()
      } catch (e) {
        logger.error('[ExchangeItems] 保存 SKU 失败:', e)
        this.showError?.('保存 SKU 失败')
      }
    },

    /**
     * 编辑 SKU（填充表单）
     *
     * 价格真相源是 exchange_channel_prices（每 SKU 多渠道价），后端 SKU 列表接口已 include channelPrices。
     * 故 cost_amount/cost_asset_code 从该 SKU 的 channelPrices[0] 读取，而非 SKU 主体（SKU 表无这两列）。
     * @param {Object} sku - SKU 数据（含 channelPrices 关联）
     */
    editSku(sku) {
      this.editingSkuId = sku.sku_id
      const price = Array.isArray(sku.channelPrices) ? sku.channelPrices[0] : null
      this.skuForm = {
        spec_values: sku.spec_values || {},
        cost_amount: price ? Number(price.cost_amount) : 1,
        stock: sku.stock,
        cost_asset_code: price ? price.cost_asset_code : '',
        status: sku.status
      }
      // 事项B：加载该 SKU 的多图轮播组
      this.loadSkuGalleryImages(sku.sku_id)
    },

    /**
     * 删除 SKU
     * @param {number} itemId - 商品 ID
     * @param {number} skuId - SKU ID
     */
    async deleteSku(itemId, skuId) {
      if (!confirm('确定要删除此 SKU 吗？')) return
      try {
        const res = await ExchangeItemAPI.deleteSku(skuId)
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

    /**
     * 加载 SKU 的多图轮播组（事项B：attachable_type='exchange_item_sku', role='gallery'）
     * @param {number} skuId - SKU ID
     */
    async loadSkuGalleryImages(skuId) {
      if (!skuId) {
        this.skuGalleryImages = []
        return
      }
      try {
        const res = await request({
          url: SYSTEM_ADMIN_ENDPOINTS.MEDIA_BY_ENTITY('exchange_item_sku', skuId),
          params: { role: 'gallery' }
        })
        const images = res.data?.items || res.data?.images || []
        this.skuGalleryImages = images.map(img => ({
          media_id: img.media_id,
          url: img.public_url || img.url,
          sort_order: img.sort_order || 0
        }))
      } catch (e) {
        logger.error('[ExchangeItems] 加载 SKU 多图失败:', e)
        this.skuGalleryImages = []
      }
    },

    /**
     * 上传 SKU 多图（事项B，需先保存 SKU 拿到 editingSkuId）
     * @param {Event} event - 文件选择事件
     */
    async uploadSkuGalleryImage(event) {
      const file = event.target.files?.[0]
      if (!file) return
      if (!this.editingSkuId) {
        this.showError?.('请先保存规格，再上传该规格的多图')
        if (event.target) event.target.value = ''
        return
      }
      if (this.skuGalleryImages.length >= 9) {
        this.showError?.('SKU 多图最多9张')
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
        this.skuGalleryUploading = true
        const formData = new FormData()
        formData.append('image', file)
        formData.append('business_type', 'exchange')
        const res = await request({
          url: SYSTEM_ADMIN_ENDPOINTS.MEDIA_UPLOAD,
          method: 'POST',
          data: formData
        })
        if (res.success && res.data) {
          const nextSort = this.skuGalleryImages.length + 1
          await request({
            url: SYSTEM_ADMIN_ENDPOINTS.MEDIA_ATTACH(res.data.media_id),
            method: 'POST',
            data: {
              attachable_type: 'exchange_item_sku',
              attachable_id: this.editingSkuId,
              role: 'gallery',
              sort_order: nextSort
            }
          })
          this.skuGalleryImages.push({
            media_id: res.data.media_id,
            url: res.data.public_url || res.data.url || res.data.image_url,
            sort_order: nextSort
          })
          this.showSuccess?.('SKU 图片上传成功')
        } else {
          this.showError?.(res.message || 'SKU 图片上传失败')
        }
      } catch (e) {
        logger.error('[ExchangeItems] SKU 多图上传失败:', e)
        this.showError?.('SKU 图片上传失败')
      } finally {
        this.skuGalleryUploading = false
        if (event.target) event.target.value = ''
      }
    },

    /**
     * 移除一张 SKU 多图（解绑该 SKU 的 gallery 挂载，不删媒体库源文件）
     * @param {number} mediaId - 媒体 ID
     */
    async removeSkuGalleryImage(mediaId) {
      try {
        await request({
          url: SYSTEM_ADMIN_ENDPOINTS.MEDIA_DETACH(mediaId),
          method: 'POST',
          data: {
            attachable_type: 'exchange_item_sku',
            attachable_id: this.editingSkuId,
            role: 'gallery'
          }
        })
        this.skuGalleryImages = this.skuGalleryImages.filter(img => img.media_id !== mediaId)
        this.showSuccess?.('已移除')
      } catch (e) {
        logger.error('[ExchangeItems] 移除 SKU 多图失败:', e)
        this.showError?.('移除失败')
      }
    },

    /** 重置 SKU 表单 */
    resetSkuForm() {
      this.editingSkuId = null
      this.skuGalleryImages = []
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
        const url = buildURL(EXCHANGE_ENDPOINTS.ITEM_PIN, {
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
        const url = buildURL(EXCHANGE_ENDPOINTS.ITEM_RECOMMEND, {
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
          url: EXCHANGE_ENDPOINTS.ITEMS_BATCH_SORT,
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
          url: EXCHANGE_ENDPOINTS.SHIPPING_COMPANIES,
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
        const url = buildURL(EXCHANGE_ENDPOINTS.ORDER_TRACK, { order_no: orderNo })
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
     * 导出兑换商品列表（后端 exceljs 产出 xlsx，前端 blob 下载）
     *
     * 后端 /export 返回 xlsx 二进制流（含商品编码 SP 展示形/系列号/展示价/图片URL 等列），
     * 这里以 blob 接收并触发浏览器下载，文件名带北京时间戳。
     * @param {Object} [params] - 筛选参数
     * @param {string} [params.status] - 按状态筛选（active/inactive）
     * @returns {Promise<void>}
     */
    async exportItems(params = {}) {
      try {
        const blob = await ExchangeItemAPI.exportItems(params)
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        // 文件名与后端一致语义：兑换商品导出_北京时间戳.xlsx（展示北京时间）
        const stamp = new Date()
          .toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
          .replace(/[/\s:]/g, '')
        a.download = `兑换商品导出_${stamp}.xlsx`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
        this.$toast?.success('商品清单已导出（xlsx）')
      } catch (e) {
        logger.error('[ExchangeItems] 导出商品清单失败:', e)
        this.$toast?.error(e.message || '导出失败')
      }
    },

    /**
     * 扫码/输码快速定位（§8.3 增强项6：后台输码或扫码直达单品详情，供客服/对账高频使用）
     *
     * 与列表搜索框（applyKeywordSearch，作用是过滤列表）区分：本方法做「精确直达」——
     * 输入/扫码枪录入编码后回车，调用后端编码搜索（归一化在后端），命中唯一商品则直接
     * 打开其编辑/详情弹窗；命中多条则回退为列表过滤展示；无命中则提示。
     * 扫码枪以键盘方式录入（零新增依赖），与手工输码共用同一入口。
     * @param {string} code - 用户输入或扫码枪录入的编码（SP/SK，容错大小写/横线/空格）
     * @returns {Promise<void>}
     */
    async quickLocate(code) {
      const kw = String(code || '').trim()
      if (!kw) {
        this.$toast?.error('请输入或扫描商品编码')
        return
      }
      try {
        const res = await ExchangeItemAPI.listExchangeItems({ keyword: kw, page: 1, page_size: 10 })
        const rows = res?.data?.items || res?.data?.list || []
        if (rows.length === 1) {
          this.quickLocateCode = ''
          this.editItem(rows[0])
          this.$toast?.success(`已定位：${rows[0].item_name || rows[0].item_code}`)
        } else if (rows.length > 1) {
          this.$toast?.info?.(`命中 ${rows.length} 条，已在列表按编码筛选，请人工确认`)
          window.dispatchEvent(new CustomEvent('quick-locate-multi', { detail: { keyword: kw } }))
        } else {
          this.$toast?.error(`未找到编码 ${kw} 对应的商品`)
        }
      } catch (e) {
        logger.error('[ExchangeItems] 快速定位失败:', e)
        this.$toast?.error(e.message || '快速定位失败')
      }
    },

    /**
     * 拉取「印刷手册」所需的全量商品（按当前筛选，分页汇总）
     *
     * 手册导出需要全量而非当前页，故循环翻页拉取；每页复用列表接口 listExchangeItems，
     * 字段（item_code/series/primary_image/cost_amount）与列表视图同源，零新增后端端点。
     * @returns {Promise<Array<Object>>} 商品数组（含编码/系列/价格/图片字段）
     */
    async _fetchAllItemsForManual() {
      const all = []
      let page = 1
      const pageSize = 100
      // 最多翻 50 页（5000 条）兜底，防异常情况下的死循环
      for (let guard = 0; guard < 50; guard++) {
        const params = { page, page_size: pageSize, ...this.itemFilters }
        Object.keys(params).forEach(k => !params[k] && delete params[k])
        const res = await ExchangeItemAPI.listExchangeItems(params)
        const rows = res?.data?.items || res?.data?.list || []
        all.push(...rows)
        const totalPages = res?.data?.total_pages || res?.data?.pagination?.total_pages || 1
        if (page >= totalPages || rows.length === 0) break
        page += 1
      }
      return all
    },

    /**
     * 导出商品印刷手册 PDF（§8.3 必备项3/4：商品名 + SP 码 + 图片 + 价格 + 二维码）
     *
     * 方案（贴合现网范式，零新增后端依赖）：
     * - 二维码：前端 `qrcode` 纯 JS 库把 item_code 规范形渲染成 dataURL（拍1 方案A）；
     * - 中文渲染：jsPDF 内置字体不支持中文，故用现网已装的 `html2canvas` 把 HTML 手册卡片
     *   截图为位图，再用 `jspdf` 逐页嵌图（与 lottery 模块 exportReportAsPDF 同范式）；
     * - 展示形编码统一带连字符（§3.5 落地约束2）。
     * @returns {Promise<void>}
     */
    async exportManualPdf() {
      try {
        this.$toast?.info?.('正在生成手册 PDF，请稍候…')
        const [{ default: html2canvas }, { jsPDF }, { default: QRCode }] = await Promise.all([
          import('html2canvas'),
          import('jspdf'),
          import('qrcode')
        ])
        const items = await this._fetchAllItemsForManual()
        if (!items.length) {
          this.$toast?.error('没有可导出的商品')
          return
        }
        const container = await this._buildManualHtml(items, QRCode)
        document.body.appendChild(container)
        try {
          await this._renderManualToPdf(container, html2canvas, jsPDF)
        } finally {
          document.body.removeChild(container)
        }
        this.$toast?.success(`手册 PDF 已导出（${items.length} 款商品）`)
      } catch (e) {
        logger.error('[ExchangeItems] 导出手册 PDF 失败:', e)
        this.$toast?.error(e.message || '导出手册 PDF 失败')
      }
    },

    /**
     * 构建手册的离屏 HTML 容器（每款商品一张卡片：图片 + 名称 + SP码 + 系列号 + 价格 + 二维码）
     * @param {Array<Object>} items - 商品数组
     * @param {Object} QRCode - qrcode 库
     * @returns {Promise<HTMLElement>} 离屏渲染容器
     */
    async _buildManualHtml(items, QRCode) {
      const container = document.createElement('div')
      // 离屏渲染：固定 A4 宽度像素（794px≈210mm@96dpi），置于视口外避免闪烁
      container.style.cssText =
        'position:fixed;left:-9999px;top:0;width:794px;background:#fff;' +
        'font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;padding:24px;box-sizing:border-box;'
      const nowStr = new Date().toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour12: false
      })
      const header = document.createElement('div')
      header.style.cssText = 'text-align:center;margin-bottom:16px;'
      header.innerHTML =
        '<div style="font-size:20px;font-weight:700;color:#111;">商品编码手册</div>' +
        `<div style="font-size:11px;color:#888;margin-top:4px;">生成时间：${nowStr}（北京时间） · 共 ${items.length} 款</div>`
      container.appendChild(header)

      const grid = document.createElement('div')
      grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px;'
      for (const it of items) {
        grid.appendChild(await this._buildManualCard(it, QRCode))
      }
      container.appendChild(grid)
      return container
    },

    /**
     * 构建单款商品的手册卡片
     * @param {Object} it - 商品对象
     * @param {Object} QRCode - qrcode 库
     * @returns {Promise<HTMLElement>} 卡片元素
     */
    async _buildManualCard(it, QRCode) {
      const codeDisplay = it.item_code ? formatProductCode(it.item_code) : '—'
      const seriesNo =
        it.series && it.series_seq != null
          ? formatSeriesNo(it.series.series_code, it.series_seq, it.series.seq_pad)
          : ''
      const priceVal = it.cost_amount ?? it.min_cost_amount ?? ''
      const assetName = this.getAssetTypeName?.(it.cost_asset_code || it.min_cost_asset_code) || ''
      const imgUrl =
        it.primary_image?.thumbnail_url ||
        it.primary_image?.url ||
        it.primary_image?.public_url ||
        ''

      // 二维码：把 item_code 规范形渲染为 dataURL（扫码结果=编码，可作搜索输入定位商品）
      let qrDataUrl = ''
      if (it.item_code) {
        try {
          qrDataUrl = await QRCode.toDataURL(it.item_code, { width: 88, margin: 1 })
        } catch (e) {
          logger.warn('[ExchangeItems] 手册二维码生成失败:', it.item_code, e?.message)
        }
      }
      return this._renderManualCardEl({
        it,
        codeDisplay,
        seriesNo,
        priceVal,
        assetName,
        imgUrl,
        qrDataUrl
      })
    },

    /**
     * 渲染手册卡片 DOM（纯拼装，无异步）
     * @param {Object} p - 卡片渲染参数
     * @returns {HTMLElement} 卡片元素
     */
    _renderManualCardEl(p) {
      const { it, codeDisplay, seriesNo, priceVal, assetName, imgUrl, qrDataUrl } = p
      const card = document.createElement('div')
      // 每行 2 张卡片：(794-48padding-12gap)/2 ≈ 367px
      card.style.cssText =
        'width:355px;border:1px solid #e5e7eb;border-radius:8px;padding:12px;box-sizing:border-box;' +
        'display:flex;gap:12px;align-items:flex-start;background:#fff;'
      const imgHtml = imgUrl
        ? `<img src="${imgUrl}" crossorigin="anonymous" style="width:72px;height:72px;object-fit:cover;border-radius:6px;flex-shrink:0;" />`
        : '<div style="width:72px;height:72px;border-radius:6px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:11px;flex-shrink:0;">无图</div>'
      const qrHtml = qrDataUrl
        ? `<img src="${qrDataUrl}" style="width:72px;height:72px;flex-shrink:0;" />`
        : '<div style="width:72px;height:72px;background:#f3f4f6;display:flex;align-items:center;justify-content:center;color:#bbb;font-size:10px;flex-shrink:0;">无码</div>'
      const seriesHtml = seriesNo
        ? `<div style="font-size:11px;color:#0d9488;margin-top:2px;">系列号：${seriesNo}</div>`
        : ''
      const priceHtml =
        priceVal !== ''
          ? `<div style="font-size:12px;color:#dc2626;margin-top:4px;">${priceVal} ${assetName}</div>`
          : ''
      const escName = String(it.item_name || '')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      card.innerHTML =
        imgHtml +
        '<div style="flex:1;min-width:0;">' +
        `<div style="font-size:13px;font-weight:600;color:#111;line-height:1.3;">${escName}</div>` +
        `<div style="font-size:12px;color:#4f46e5;font-family:monospace;margin-top:4px;">${codeDisplay}</div>` +
        seriesHtml +
        priceHtml +
        '</div>' +
        qrHtml
      return card
    },

    /**
     * 把离屏 HTML 分页渲染进 PDF（html2canvas 截图 → jsPDF 逐页嵌图）
     * @param {HTMLElement} container - 离屏容器
     * @param {Function} html2canvas - html2canvas
     * @param {Function} jsPDF - jsPDF 构造器
     * @returns {Promise<void>}
     */
    async _renderManualToPdf(container, html2canvas, jsPDF) {
      // 等待卡片内图片（商品图/二维码）加载完成，避免截图空白
      const imgs = Array.from(container.querySelectorAll('img'))
      await Promise.all(
        imgs.map(
          img =>
            new Promise(resolve => {
              if (img.complete) return resolve()
              img.onload = () => resolve()
              img.onerror = () => resolve()
            })
        )
      )
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#fff'
      })
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const imgW = pageW
      const imgH = (canvas.height * imgW) / canvas.width
      // 超过一页则按页高切片，逐页 addImage（负偏移实现分页裁切）
      let heightLeft = imgH
      let position = 0
      const imgData = canvas.toDataURL('image/jpeg', 0.92)
      pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH)
      heightLeft -= pageH
      while (heightLeft > 0) {
        position -= pageH
        pdf.addPage()
        pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH)
        heightLeft -= pageH
      }
      const stamp = new Date()
        .toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
        .replace(/[/\s:]/g, '')
      pdf.save(`商品编码手册_${stamp}.pdf`)
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
        const res = await ExchangeItemAPI.importItems(file)
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
