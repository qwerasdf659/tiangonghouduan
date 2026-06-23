/**
 * 道具商城管理 - Composable（道具商城 / 星石轨）
 *
 * @file admin/src/modules/market/composables/prop-shop.js
 * @description 道具商城（item_type='prop' 的零价值虚拟道具）一体化上架：
 *   一次填写 → 串联「建 prop 模板 → 建 SPU → 建默认 SKU → 设星石渠道价」四步，
 *   运营无需在「物品模板」和「兑换市场」两个页面间来回切换。
 *
 * 合规背景（见 docs/legal/道具商城与兑换空间关系及双轨合规模型.md）：
 *   道具商城属星石娱乐轨，商品恒为 item_type='prop'（零价值、买入即销毁、禁退）。
 *   后端 AssetProductGuard 焊死该约束，前端仅按契约提交，不做映射层。
 *
 * 复用后端现有接口（零后端改动）：
 *   - POST /api/v4/console/item-templates              建 prop 模板
 *   - POST /api/v4/console/exchange/items              建 SPU
 *   - POST /api/v4/console/exchange/items/:id/skus     建默认 SKU
 *   - PUT  /api/v4/console/exchange/items/skus/:id/channel-prices  设星石渠道价
 *   - GET  /api/v4/console/exchange/items?keyword=...   列表（prop 由关联模板判定）
 */

import { API_PREFIX, request } from '../../../api/base.js'
import { ExchangeItemAPI } from '../../../api/exchange-item/index.js'
import { SYSTEM_ADMIN_ENDPOINTS } from '../../../api/system/admin.js'
import { logger } from '../../../utils/logger.js'

/** 道具商城专用：星石资产代码（计价唯一币，后端 is_biddable/计价守卫一致） */
export const PROP_STAR_STONE = 'star_stone'

/** 物品模板 API 端点 */
export const ITEM_TEMPLATE_ENDPOINT = `${API_PREFIX}/console/item-templates`

/** 兑换商品列表端点（用于道具列表查询） */
export const EXCHANGE_ITEMS_ENDPOINT = `${API_PREFIX}/console/exchange/items`

// [STATE]
/**
 * 创建一份空的道具表单
 * @returns {Object} 空道具表单
 */
function createEmptyPropForm() {
  return {
    name: '',
    description: '',
    star_stone_price: 1,
    stock: 0,
    sell_point: '',
    primary_media_id: null,
    status: 'active'
  }
}

/**
 * 道具商城 - 状态
 * @returns {Object} Alpine 响应式状态
 */
export function usePropShopState() {
  return {
    propList: [],
    listLoading: false,
    propForm: createEmptyPropForm(),
    imagePreviewUrl: '',
    imageUploading: false,
    submitting: false,
    showForm: false,
    keyword: '',
    // [EDIT_STATE] 修改库存/价格/状态（道具上架后运营调整）
    showEditForm: false,
    editSubmitting: false,
    editForm: createEmptyEditForm()
  }
}

/**
 * 创建一份空的「修改道具」表单（编辑现有道具的库存/星石价/状态）
 * @returns {Object} 空编辑表单
 */
function createEmptyEditForm() {
  return {
    exchange_item_id: null,
    sku_id: null,
    item_name: '',
    star_stone_price: 1,
    stock: 0,
    status: 'active'
  }
}

// [METHODS]
/**
 * 道具商城 - 方法
 * @returns {Object} Alpine 方法集合
 */
export function usePropShopMethods() {
  return {
    // [LOAD]
    /**
     * 加载道具列表：后端按 item_type='prop' 服务端筛选（频道隔离）。
     * exchange_items 列表接口已支持 item_type 参数（关联 item_templates 做 INNER JOIN），
     * 故无需前端"先取 prop 模板 ID 再过滤"，单次查询即精确返回道具，分页 total 准确。
     */
    async loadPropList() {
      this.listLoading = true
      try {
        const res = await this.apiGet(EXCHANGE_ITEMS_ENDPOINT, {
          item_type: 'prop',
          keyword: this.keyword || undefined,
          page: 1,
          page_size: 100
        })
        const items = res?.data?.items || res?.data?.list || []
        this.propList = Array.isArray(items) ? items : []
      } catch (e) {
        logger.error('[PropShop] 加载道具列表失败', e)
        this.showError?.('加载道具列表失败：' + e.message)
      } finally {
        this.listLoading = false
      }
    },
    // [FORM]
    /**
     * 打开新增道具表单
     */
    openCreateForm() {
      this.propForm = createEmptyPropForm()
      this.imagePreviewUrl = ''
      this.showForm = true
    },

    /**
     * 关闭表单
     */
    closeForm() {
      this.showForm = false
    },

    // [EDIT]
    /**
     * 打开「修改道具」表单：用列表项已下发的 SPU 物化列 + 默认 SKU 回显当前库存/星石价/状态。
     * 道具恒为单 active SKU（一体化上架链固定建一个默认 SKU），故取 skus[0] 即默认 SKU。
     * @param {Object} item - 列表中的道具项（含 stock/min_cost_amount/min_cost_asset_code/skus）
     */
    openEditForm(item) {
      const defaultSku = Array.isArray(item.skus) ? item.skus[0] : null
      if (!defaultSku) {
        this.showError?.('该道具无可用 SKU，无法修改库存（请检查上架是否完整）')
        return
      }
      this.editForm = {
        exchange_item_id: item.exchange_item_id,
        sku_id: defaultSku.sku_id,
        item_name: item.item_name,
        star_stone_price: Number(item.min_cost_amount) || 1,
        stock: Number(defaultSku.stock) || 0,
        status: defaultSku.status || 'active'
      }
      this.showEditForm = true
    },

    /**
     * 关闭「修改道具」表单
     */
    closeEditForm() {
      this.showEditForm = false
    },

    /**
     * 上传道具图片，绑定 primary_media_id
     * @param {Event} event - 文件选择事件
     */
    async uploadPropImage(event) {
      const file = event.target.files?.[0]
      if (!file) return
      const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      if (!allowed.includes(file.type)) {
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
          this.propForm.primary_media_id = res.data.media_id
          this.imagePreviewUrl = res.data.public_url || res.data.url || res.data.image_url || ''
          this.showSuccess?.('图片上传成功')
        } else {
          this.showError?.(res.message || '图片上传失败')
        }
      } catch (e) {
        logger.error('[PropShop] 图片上传失败', e)
        this.showError?.('图片上传失败')
      } finally {
        this.imageUploading = false
      }
    },

    // [SUBMIT]
    /**
     * 提交「修改道具」：更新默认 SKU 的库存/状态（绝对值），并重设星石渠道价。
     * 后端 updateSku 直接写 stock 绝对值（非增量），setChannelPrices 全量替换该 SKU 渠道价。
     * 两步均由后端在事务内回填 SPU 物化列（议题1 一致性），前端无需手动聚合。
     */
    async submitEdit() {
      const f = this.editForm
      if (!Number.isFinite(Number(f.star_stone_price)) || Number(f.star_stone_price) <= 0) {
        this.showError?.('星石价格必须大于 0')
        return
      }
      if (!Number.isFinite(Number(f.stock)) || Number(f.stock) < 0) {
        this.showError?.('库存必须大于等于 0')
        return
      }
      this.editSubmitting = true
      try {
        await ExchangeItemAPI.updateSku(f.sku_id, {
          stock: Number(f.stock),
          status: f.status
        })
        await ExchangeItemAPI.setChannelPrices(f.sku_id, [
          { cost_asset_code: PROP_STAR_STONE, cost_amount: Number(f.star_stone_price) }
        ])
        this.showSuccess?.('道具已更新（库存/星石价/状态）')
        this.showEditForm = false
        await this.loadPropList()
      } catch (e) {
        logger.error('[PropShop] 修改道具失败', e)
        this.showError?.('修改失败：' + e.message)
      } finally {
        this.editSubmitting = false
      }
    },

    // [SUBMIT_CREATE]
    /**
     * 一体化上架道具：建模板 → 建 SPU → 建 SKU → 设星石价（任一步失败即终止并提示）
     */
    async submitProp() {
      const f = this.propForm
      if (!f.name || f.name.trim() === '') {
        this.showError?.('请填写道具名称')
        return
      }
      if (!Number.isFinite(Number(f.star_stone_price)) || Number(f.star_stone_price) <= 0) {
        this.showError?.('星石价格必须大于 0')
        return
      }
      if (!Number.isFinite(Number(f.stock)) || Number(f.stock) < 0) {
        this.showError?.('库存必须大于等于 0')
        return
      }
      this.submitting = true
      try {
        await this._runCreateChain(f)
        this.showSuccess?.('道具上架成功（已自动创建模板、商品、星石定价）')
        this.showForm = false
        await this.loadPropList()
      } catch (e) {
        logger.error('[PropShop] 上架道具失败', e)
        this.showError?.('上架失败：' + e.message)
      } finally {
        this.submitting = false
      }
    },

    // [CHAIN]
    /**
     * 执行四步创建链（模板→SPU→SKU→星石价）
     * @param {Object} f - 道具表单
     */
    async _runCreateChain(f) {
      const ts = Date.now()
      // 步骤1：建 prop 模板（item_type 焊死 prop，value_tier 恒 low）
      const tplRes = await this.apiPost(
        ITEM_TEMPLATE_ENDPOINT,
        {
          template_code: `prop_${ts}`,
          item_type: 'prop',
          display_name: f.name.trim(),
          description: f.description?.trim() || '',
          value_tier: 'low',
          reference_price_points: 0,
          is_tradable: false,
          primary_media_id: f.primary_media_id || null
        },
        { showSuccess: false }
      )
      const tpl = tplRes?.data || tplRes
      const templateId = tpl?.item_template_id || tpl?.id || tpl?.template?.item_template_id
      if (!templateId) {
        throw new Error('创建道具模板未返回 item_template_id')
      }
      // [CHAIN2]
      // 步骤2：建 SPU（关联 prop 模板，mint 实例，space 给 lucky 占位仅满足存储，不影响道具轨）
      const spuRes = await ExchangeItemAPI.createExchangeItem({
        item_name: f.name.trim(),
        description: f.description?.trim() || '',
        item_template_id: templateId,
        mint_instance: true,
        status: f.status || 'active',
        space: 'lucky',
        sell_point: f.sell_point?.trim() || null,
        primary_media_id: f.primary_media_id || null
      })
      const spu = spuRes?.data || spuRes
      const exchangeItemId = spu?.exchange_item_id || spu?.id
      if (!exchangeItemId) {
        throw new Error('创建商品未返回 exchange_item_id')
      }
      // 步骤3：建默认 SKU
      const skuRes = await ExchangeItemAPI.createSku(exchangeItemId, {
        sku_code: `prop_${exchangeItemId}_default`,
        stock: Number(f.stock) || 0,
        cost_price: 0,
        status: f.status || 'active'
      })
      const sku = skuRes?.data || skuRes
      const skuId = sku?.sku_id || sku?.id
      if (!skuId) {
        throw new Error('创建 SKU 未返回 sku_id')
      }
      // 步骤4：设星石渠道价（道具商城唯一计价币）
      await ExchangeItemAPI.setChannelPrices(skuId, [
        { cost_asset_code: PROP_STAR_STONE, cost_amount: Number(f.star_stone_price) }
      ])
    },
  }
}


