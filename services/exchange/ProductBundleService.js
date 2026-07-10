/**
 * @file 组合商品服务（ProductBundleService）— S4 组合/套装/赠品
 * @description 组合 CRUD、BOM 明细管理
 * @module services/exchange/ProductBundleService
 */

'use strict'

/* eslint-disable valid-jsdoc, require-jsdoc, no-await-in-loop */

const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const { logger } = require('../../utils/logger')
const BeijingTimeHelper = require('../../utils/timeHelper')
const BusinessError = require('../../utils/BusinessError')
const ExchangeItemService = require('./ExchangeItemService')

/**
 * @class ProductBundleService
 */
class ProductBundleService {
  /**
   * @param {Object} models - Sequelize 模型集合
   */
  constructor(models) {
    this.models = models
    this.sequelize = models.sequelize
    this._exchangeItemService = new ExchangeItemService(models)
  }

  /**
   * 分页查询组合商品
   */
  async listProductBundles(filters = {}, pagination = {}) {
    const { ProductBundle, ExchangeItem } = this.models
    const { Op } = this.sequelize.Sequelize

    const page = Math.max(1, parseInt(pagination.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(pagination.page_size, 10) || 20))
    const offset = (page - 1) * pageSize

    const where = {}
    if (filters.status) where.status = filters.status
    if (filters.bundle_type) where.bundle_type = filters.bundle_type

    const itemWhere = {}
    if (filters.keyword && String(filters.keyword).trim()) {
      const kw = `%${String(filters.keyword).trim()}%`
      itemWhere[Op.or] = [{ item_name: { [Op.like]: kw } }, { item_code: { [Op.like]: kw } }]
    }

    const { rows, count } = await ProductBundle.findAndCountAll({
      where,
      include: [
        {
          model: ExchangeItem,
          as: 'exchangeItem',
          required: Object.keys(itemWhere).length > 0,
          where: Object.keys(itemWhere).length > 0 ? itemWhere : undefined
        }
      ],
      order: [['bundle_id', 'DESC']],
      limit: pageSize,
      offset,
      distinct: true
    })

    return {
      items: rows.map(r => r.toJSON()),
      total: count,
      page,
      page_size: pageSize,
      total_pages: Math.ceil(count / pageSize)
    }
  }

  /**
   * 查询组合详情（含 BOM 明细）
   */
  async getProductBundle(bundleId, options = {}) {
    const { ProductBundle, ProductBundleItem, ExchangeItem, ExchangeItemSku } = this.models
    const transaction = options.transaction || null

    const bid = Number(bundleId)
    if (Number.isNaN(bid)) {
      throw new BusinessError('bundle_id 无效', 'PRODUCT_BUNDLE_INVALID_ID', 400)
    }

    const row = await ProductBundle.findByPk(bid, {
      transaction,
      include: [
        { model: ExchangeItem, as: 'exchangeItem' },
        {
          model: ProductBundleItem,
          as: 'items',
          include: [
            {
              model: ExchangeItem,
              as: 'childItem',
              attributes: ['exchange_item_id', 'item_code', 'item_name']
            },
            {
              model: ExchangeItemSku,
              as: 'childSku',
              attributes: ['sku_id', 'sku_code', 'stock']
            }
          ]
        }
      ]
    })

    if (!row) {
      throw new BusinessError('组合商品不存在', 'PRODUCT_BUNDLE_NOT_FOUND', 404)
    }
    return row.toJSON()
  }

  /**
   * 创建组合商品（先建 SPU 再建 BOM）
   */
  async createProductBundle(data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ProductBundleService.createProductBundle')
    const { ProductBundle } = this.models

    const exchangeItemData = { ...(data.exchange_item || data) }
    if (!exchangeItemData.item_name) {
      throw new BusinessError('组合商品名称不能为空', 'PRODUCT_BUNDLE_INVALID_NAME', 400)
    }
    /*
     * 组合是虚拟组合 SPU（拍板 #18 组合本身不备货、履约按 BOM 拆解）：
     * 默认不铸造实例（mint_instance=false），也就不要求挂物品模板；
     * 调用方显式传 mint_instance 时以调用方为准。
     */
    if (exchangeItemData.mint_instance === undefined) {
      exchangeItemData.mint_instance = false
    }

    const items = Array.isArray(data.items) ? data.items : []
    if (items.length === 0) {
      throw new BusinessError('组合明细不能为空', 'PRODUCT_BUNDLE_EMPTY_ITEMS', 400)
    }

    const spu = await this._exchangeItemService.createExchangeItem(exchangeItemData, {
      transaction
    })

    /*
     * 拍板 #20 反向防护：组合 SPU 由本方法在同事务内新建（不可能已被引用为子项），
     * 天然无反向嵌套；BOM 子项的正向嵌套校验在 _replaceBundleItems 内做。
     */
    const bundle = await ProductBundle.create(
      {
        exchange_item_id: spu.exchange_item_id,
        bundle_type: data.bundle_type || 'suit',
        status: data.status || 'active'
      },
      { transaction }
    )

    await this._replaceBundleItems(bundle.bundle_id, items, { transaction })

    logger.info('[S4] 组合商品创建成功', {
      bundle_id: bundle.bundle_id,
      exchange_item_id: spu.exchange_item_id,
      ts: BeijingTimeHelper.apiTimestamp()
    })

    return this.getProductBundle(bundle.bundle_id, { transaction })
  }

  /**
   * 更新组合商品（头 + 明细全量替换）
   */
  async updateProductBundle(bundleId, data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ProductBundleService.updateProductBundle')
    const { ProductBundle } = this.models

    const bid = Number(bundleId)
    if (Number.isNaN(bid)) {
      throw new BusinessError('bundle_id 无效', 'PRODUCT_BUNDLE_INVALID_ID', 400)
    }

    const bundle = await ProductBundle.findByPk(bid, { transaction, lock: transaction.LOCK.UPDATE })
    if (!bundle) {
      throw new BusinessError('组合商品不存在', 'PRODUCT_BUNDLE_NOT_FOUND', 404)
    }

    const headerUpdates = {}
    if (data.bundle_type) headerUpdates.bundle_type = data.bundle_type
    if (data.status) headerUpdates.status = data.status
    if (Object.keys(headerUpdates).length > 0) {
      await bundle.update(headerUpdates, { transaction })
    }

    if (data.exchange_item) {
      await this._exchangeItemService.updateExchangeItem(
        bundle.exchange_item_id,
        data.exchange_item,
        {
          transaction
        }
      )
    }

    if (Array.isArray(data.items)) {
      if (data.items.length === 0) {
        throw new BusinessError('组合明细不能为空', 'PRODUCT_BUNDLE_EMPTY_ITEMS', 400)
      }
      await this._replaceBundleItems(bid, data.items, { transaction })
    }

    logger.info('[S4] 组合商品更新成功', { bundle_id: bid, ts: BeijingTimeHelper.apiTimestamp() })
    return this.getProductBundle(bid, { transaction })
  }

  /**
   * 下单域：解析组合 BOM 为可扣减清单（拍板 #18 兑换下单按 BOM 拆解扣子项库存）
   *
   * 返回 null 表示该 SPU 不是组合（走普通商品链路）；是组合则校验：
   * - 组合 status=active（inactive 组合不可售）
   * - BOM 非空；每个子项 SPU status=active（拍板 #23 下单时强校验，子项失效即拒单）
   * - 子项 SKU 解析（child_sku_id 优先，否则取子 SPU 首个 active SKU）且 SKU active
   * - 子项库存预检（非锁定读，最终扣减在 deductBundleStockForOrder 内行锁复核）
   *
   * @param {number} exchangeItemId - 待检测的 SPU ID
   * @param {number} orderQuantity - 购买组合数量（子项需求量 = BOM quantity × 该值）
   * @param {Object} options - 配置（transaction 必填，随下单事务）
   * @returns {Promise<null|{bundle_id:number,bundle_type:string,items:Array}>} 组合下单清单
   */
  async resolveBundleForOrder(exchangeItemId, orderQuantity, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'ProductBundleService.resolveBundleForOrder'
    )
    const { ProductBundle, ProductBundleItem, ExchangeItem, ExchangeItemSku } = this.models

    const bundle = await ProductBundle.findOne({
      where: { exchange_item_id: Number(exchangeItemId) },
      include: [{ model: ProductBundleItem, as: 'items' }],
      transaction
    })
    if (!bundle) return null

    if (bundle.status !== 'active') {
      throw new BusinessError('组合商品已停用，不可兑换', 'PRODUCT_BUNDLE_INACTIVE', 400)
    }

    const bomRows = bundle.items || []
    if (bomRows.length === 0) {
      throw new BusinessError('组合商品无 BOM 明细，不可兑换', 'PRODUCT_BUNDLE_EMPTY_ITEMS', 400)
    }

    const resolved = []
    for (const row of bomRows) {
      // 解析子项 SKU：child_sku_id 优先；SPU 级子项取首个 active SKU
      let sku = null
      if (row.child_sku_id) {
        sku = await ExchangeItemSku.findByPk(row.child_sku_id, { transaction })
      } else if (row.child_item_id) {
        sku = await ExchangeItemSku.findOne({
          where: { exchange_item_id: row.child_item_id, status: 'active' },
          order: [
            ['sort_order', 'ASC'],
            ['sku_id', 'ASC']
          ],
          transaction
        })
      }
      if (!sku || sku.status !== 'active') {
        throw new BusinessError(
          `组合子项（bom_id=${row.id}）SKU 不存在或已停售，组合暂不可兑换`,
          'PRODUCT_BUNDLE_CHILD_UNAVAILABLE',
          400
        )
      }

      // 拍板 #23：子项 SPU 失效即拒单（下单时强校验，替代事件联动）
      const childItem = await ExchangeItem.findByPk(sku.exchange_item_id, {
        attributes: ['exchange_item_id', 'item_name', 'status'],
        transaction
      })
      if (!childItem || childItem.status !== 'active') {
        throw new BusinessError(
          `组合子项「${childItem ? childItem.item_name : sku.exchange_item_id}」已下架，组合暂不可兑换`,
          'PRODUCT_BUNDLE_CHILD_UNAVAILABLE',
          400
        )
      }

      const need = (parseInt(row.quantity, 10) || 1) * orderQuantity
      if (sku.stock < need) {
        throw new BusinessError(
          `组合子项「${childItem.item_name}」库存不足（需 ${need}，剩 ${sku.stock}）`,
          'PRODUCT_BUNDLE_CHILD_STOCK_INSUFFICIENT',
          400
        )
      }

      resolved.push({
        bom_id: row.id,
        child_item_id: row.child_item_id || sku.exchange_item_id,
        child_sku_id: row.child_sku_id || null,
        resolved_sku_id: sku.sku_id,
        resolved_item_id: sku.exchange_item_id,
        quantity: parseInt(row.quantity, 10) || 1,
        is_gift: !!row.is_gift
      })
    }

    return {
      bundle_id: bundle.bundle_id,
      bundle_type: bundle.bundle_type,
      items: resolved
    }
  }

  /**
   * 下单域：按解析清单扣减子项库存（拍板 #18/#19，行锁复核 + 同步 SPU 汇总）
   *
   * 赠品行（is_gift=true）同样扣库存、不另计价（钱只收组合价，拍板 #19 天然满足）。
   *
   * @param {Array} resolvedItems - resolveBundleForOrder 返回的 items
   * @param {number} orderQuantity - 购买组合数量
   * @param {Object} options - 配置（transaction 必填）
   * @returns {Promise<void>} 扣减完成
   */
  async deductBundleStockForOrder(resolvedItems, orderQuantity, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'ProductBundleService.deductBundleStockForOrder'
    )
    const { ExchangeItemSku } = this.models

    const touchedSpuIds = new Set()
    for (const row of resolvedItems) {
      const need = row.quantity * orderQuantity
      const sku = await ExchangeItemSku.findByPk(row.resolved_sku_id, {
        lock: transaction.LOCK.UPDATE,
        transaction
      })
      if (!sku || sku.status !== 'active') {
        throw new BusinessError(
          `组合子项 SKU（${row.resolved_sku_id}）不存在或已停售`,
          'PRODUCT_BUNDLE_CHILD_UNAVAILABLE',
          400
        )
      }
      if (sku.stock < need) {
        throw new BusinessError(
          `组合子项 SKU（${sku.sku_code}）库存不足（需 ${need}，剩 ${sku.stock}）`,
          'PRODUCT_BUNDLE_CHILD_STOCK_INSUFFICIENT',
          400
        )
      }
      await sku.update(
        {
          stock: sku.stock - need,
          sold_count: (sku.sold_count || 0) + need
        },
        { transaction }
      )
      touchedSpuIds.add(sku.exchange_item_id)
    }

    // 回填每个受影响子 SPU 的物化汇总列（与兑换扣库存同口径）
    for (const spuId of touchedSpuIds) {
      await this._exchangeItemService.syncSpuSummary(spuId, transaction)
    }
  }

  /**
   * 下单域：按订单快照回补子项库存（退款逆向，拍板 #18 对称操作）
   *
   * 必须用订单快照（item_snapshot.bundle.items）而非当前 BOM——
   * 下单后 BOM 可能已被运营修改，回补以下单时刻的扣减为准。
   *
   * @param {Array} snapshotItems - 订单快照中的 bundle.items
   * @param {number} orderQuantity - 订单购买数量
   * @param {Object} options - 配置（transaction 必填）
   * @returns {Promise<void>} 回补完成
   */
  async restoreBundleStockFromSnapshot(snapshotItems, orderQuantity, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'ProductBundleService.restoreBundleStockFromSnapshot'
    )
    const { ExchangeItemSku } = this.models

    const touchedSpuIds = new Set()
    for (const row of snapshotItems) {
      const back = (parseInt(row.quantity, 10) || 1) * orderQuantity
      const sku = await ExchangeItemSku.findByPk(row.resolved_sku_id, {
        lock: transaction.LOCK.UPDATE,
        transaction
      })
      if (!sku) {
        logger.warn('[S4] 退款回补跳过：快照 SKU 已不存在', {
          resolved_sku_id: row.resolved_sku_id
        })
        continue
      }
      await sku.update(
        {
          stock: sku.stock + back,
          sold_count: Math.max(0, (sku.sold_count || 0) - back)
        },
        { transaction }
      )
      touchedSpuIds.add(sku.exchange_item_id)
    }

    for (const spuId of touchedSpuIds) {
      await this._exchangeItemService.syncSpuSummary(spuId, transaction)
    }
  }

  /**
   * 全量替换 BOM 明细
   *
   * 嵌套防护（拍板 #20）：子项只能是普通 SPU/SKU，不允许是另一个组合
   * （product_bundles.exchange_item_id 命中即拒绝，防循环依赖）。
   *
   * @private
   */
  async _replaceBundleItems(bundleId, items, options) {
    const transaction = assertAndGetTransaction(options, 'ProductBundleService._replaceBundleItems')
    const { ProductBundleItem, ProductBundle, ExchangeItemSku } = this.models
    const { Op } = this.sequelize.Sequelize

    for (const item of items) {
      if (!item.child_item_id && !item.child_sku_id) {
        throw new BusinessError(
          '明细需指定 child_item_id 或 child_sku_id',
          'PRODUCT_BUNDLE_INVALID_ITEM',
          400
        )
      }
      const qty = parseInt(item.quantity, 10) || 1
      if (qty <= 0) {
        throw new BusinessError('明细数量必须大于 0', 'PRODUCT_BUNDLE_INVALID_ITEM', 400)
      }
    }

    // 拍板 #20：解析子项归属 SPU（child_sku_id 反查），任一命中组合表即拒绝嵌套
    const childItemIds = new Set(
      items.filter(i => i.child_item_id).map(i => Number(i.child_item_id))
    )
    const childSkuIds = items.filter(i => i.child_sku_id).map(i => Number(i.child_sku_id))
    if (childSkuIds.length > 0) {
      const skuRows = await ExchangeItemSku.findAll({
        where: { sku_id: { [Op.in]: childSkuIds } },
        attributes: ['sku_id', 'exchange_item_id'],
        transaction
      })
      skuRows.forEach(r => childItemIds.add(Number(r.exchange_item_id)))
    }
    if (childItemIds.size > 0) {
      const nested = await ProductBundle.findOne({
        where: { exchange_item_id: { [Op.in]: [...childItemIds] } },
        attributes: ['bundle_id', 'exchange_item_id'],
        transaction
      })
      if (nested) {
        throw new BusinessError(
          `子项（exchange_item_id=${nested.exchange_item_id}）本身是组合商品，不允许嵌套`,
          'PRODUCT_BUNDLE_NESTED_FORBIDDEN',
          400
        )
      }
    }

    await ProductBundleItem.destroy({ where: { bundle_id: bundleId }, transaction })

    const rows = items.map(item => ({
      bundle_id: bundleId,
      child_item_id: item.child_item_id || null,
      child_sku_id: item.child_sku_id || null,
      quantity: parseInt(item.quantity, 10) || 1,
      is_gift: !!item.is_gift
    }))

    await ProductBundleItem.bulkCreate(rows, { transaction })
  }
}

module.exports = ProductBundleService
