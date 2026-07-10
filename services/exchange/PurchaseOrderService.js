/**
 * @file 采购单服务（PurchaseOrderService）— S1 进货管理
 * @description 采购单头+明细 CRUD、状态机、收货入库、回写进货价
 * @module services/exchange/PurchaseOrderService
 */

'use strict'

/* eslint-disable valid-jsdoc, require-jsdoc, no-await-in-loop */

const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const { logger } = require('../../utils/logger')
const BeijingTimeHelper = require('../../utils/timeHelper')
const BusinessError = require('../../utils/BusinessError')
const BusinessSeqCodeGenerator = require('../../utils/BusinessSeqCodeGenerator')
const ExchangeItemService = require('./ExchangeItemService')
const ProductBatchService = require('./ProductBatchService')

/** 可编辑采购行的状态 */
const EDITABLE_STATUSES = ['draft', 'ordered']

/**
 * @class PurchaseOrderService
 */
class PurchaseOrderService {
  /**
   * @param {Object} models - Sequelize 模型集合
   */
  constructor(models) {
    this.models = models
    this.sequelize = models.sequelize
    this._exchangeItemService = new ExchangeItemService(models)
    this._batchService = new ProductBatchService(models)
  }

  /**
   * 分页查询采购单
   */
  async listPurchaseOrders(filters = {}, pagination = {}) {
    const { PurchaseOrder, Supplier } = this.models
    const { Op } = this.sequelize.Sequelize

    const page = Math.max(1, parseInt(pagination.page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(pagination.page_size, 10) || 20))
    const offset = (page - 1) * pageSize

    const where = {}
    if (filters.status) where.status = filters.status
    if (filters.supplier_id) {
      const sid = Number(filters.supplier_id)
      if (!Number.isNaN(sid)) where.supplier_id = sid
    }
    if (filters.keyword && String(filters.keyword).trim()) {
      where.order_no = { [Op.like]: `%${String(filters.keyword).trim()}%` }
    }

    const { rows, count } = await PurchaseOrder.findAndCountAll({
      where,
      include: [{ model: Supplier, as: 'supplier', attributes: ['supplier_id', 'supplier_name'] }],
      order: [['purchase_order_id', 'DESC']],
      limit: pageSize,
      offset
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
   * 查询采购单详情（含明细行）
   */
  async getPurchaseOrder(purchaseOrderId, options = {}) {
    const {
      PurchaseOrder,
      PurchaseOrderItem,
      Supplier,
      ExchangeItem,
      ExchangeItemSku,
      ProductBatch
    } = this.models
    const transaction = options.transaction || null

    const pid = Number(purchaseOrderId)
    if (Number.isNaN(pid)) {
      throw new BusinessError('purchase_order_id 无效', 'PURCHASE_ORDER_INVALID_ID', 400)
    }

    const row = await PurchaseOrder.findByPk(pid, {
      transaction,
      include: [
        { model: Supplier, as: 'supplier' },
        {
          model: PurchaseOrderItem,
          as: 'lines',
          include: [
            {
              model: ExchangeItem,
              as: 'exchangeItem',
              attributes: ['exchange_item_id', 'item_code', 'item_name']
            },
            {
              model: ExchangeItemSku,
              as: 'sku',
              attributes: ['sku_id', 'sku_code', 'stock']
            },
            {
              model: ProductBatch,
              as: 'batch',
              attributes: ['batch_id', 'batch_code', 'status']
            }
          ]
        }
      ]
    })

    if (!row) {
      throw new BusinessError('采购单不存在', 'PURCHASE_ORDER_NOT_FOUND', 404)
    }
    return row.toJSON()
  }

  /**
   * 创建采购单（draft 状态）
   */
  async createPurchaseOrder(data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'PurchaseOrderService.createPurchaseOrder')
    const { PurchaseOrder, Supplier } = this.models

    const supplierId = Number(data.supplier_id)
    if (Number.isNaN(supplierId)) {
      throw new BusinessError('supplier_id 无效', 'PURCHASE_ORDER_INVALID_SUPPLIER', 400)
    }

    const supplier = await Supplier.findByPk(supplierId, { transaction })
    if (!supplier) {
      throw new BusinessError('供应商不存在', 'PURCHASE_ORDER_SUPPLIER_NOT_FOUND', 404)
    }

    const lines = Array.isArray(data.lines) ? data.lines : []
    if (lines.length === 0) {
      throw new BusinessError('采购明细不能为空', 'PURCHASE_ORDER_EMPTY_LINES', 400)
    }

    const orderNo = await BusinessSeqCodeGenerator.generateWithRetry({
      prefix: 'PO',
      model: PurchaseOrder,
      field: 'order_no',
      transaction
    })

    const totalAmount = this._calcTotalAmount(lines)

    const header = await PurchaseOrder.create(
      {
        order_no: orderNo,
        supplier_id: supplierId,
        total_amount: totalAmount,
        status: data.status === 'ordered' ? 'ordered' : 'draft',
        ordered_at: data.status === 'ordered' ? BeijingTimeHelper.createDatabaseTime() : null,
        remark: data.remark || null
      },
      { transaction }
    )

    await this._replaceLines(header.purchase_order_id, lines, { transaction })

    logger.info('[S1] 采购单创建成功', {
      purchase_order_id: header.purchase_order_id,
      order_no: orderNo,
      ts: BeijingTimeHelper.apiTimestamp()
    })

    return this.getPurchaseOrder(header.purchase_order_id, { transaction })
  }

  /**
   * 更新采购单（received/cancelled 不可改）
   */
  async updatePurchaseOrder(purchaseOrderId, data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'PurchaseOrderService.updatePurchaseOrder')
    const { PurchaseOrder } = this.models

    const pid = Number(purchaseOrderId)
    if (Number.isNaN(pid)) {
      throw new BusinessError('purchase_order_id 无效', 'PURCHASE_ORDER_INVALID_ID', 400)
    }

    const header = await PurchaseOrder.findByPk(pid, { transaction, lock: transaction.LOCK.UPDATE })
    if (!header) {
      throw new BusinessError('采购单不存在', 'PURCHASE_ORDER_NOT_FOUND', 404)
    }
    if (!EDITABLE_STATUSES.includes(header.status)) {
      throw new BusinessError(`状态 ${header.status} 不可修改`, 'PURCHASE_ORDER_NOT_EDITABLE', 409)
    }

    const updates = {}
    if (data.remark !== undefined) updates.remark = data.remark
    if (data.supplier_id != null) {
      const sid = Number(data.supplier_id)
      if (Number.isNaN(sid)) {
        throw new BusinessError('supplier_id 无效', 'PURCHASE_ORDER_INVALID_SUPPLIER', 400)
      }
      updates.supplier_id = sid
    }

    if (Array.isArray(data.lines)) {
      if (data.lines.length === 0) {
        throw new BusinessError('采购明细不能为空', 'PURCHASE_ORDER_EMPTY_LINES', 400)
      }
      await this._replaceLines(pid, data.lines, { transaction })
      updates.total_amount = this._calcTotalAmount(data.lines)
    }

    if (Object.keys(updates).length > 0) {
      await header.update(updates, { transaction })
    }

    logger.info('[S1] 采购单更新成功', {
      purchase_order_id: pid,
      ts: BeijingTimeHelper.apiTimestamp()
    })
    return this.getPurchaseOrder(pid, { transaction })
  }

  /**
   * 提交下单（draft → ordered）
   */
  async submitPurchaseOrder(purchaseOrderId, options = {}) {
    const transaction = assertAndGetTransaction(options, 'PurchaseOrderService.submitPurchaseOrder')
    const { PurchaseOrder } = this.models

    const pid = Number(purchaseOrderId)
    const header = await PurchaseOrder.findByPk(pid, { transaction, lock: transaction.LOCK.UPDATE })
    if (!header) {
      throw new BusinessError('采购单不存在', 'PURCHASE_ORDER_NOT_FOUND', 404)
    }
    if (header.status !== 'draft') {
      throw new BusinessError('仅草稿状态可提交下单', 'PURCHASE_ORDER_INVALID_TRANSITION', 409)
    }

    await header.update(
      { status: 'ordered', ordered_at: BeijingTimeHelper.createDatabaseTime() },
      { transaction }
    )

    logger.info('[S1] 采购单已下单', {
      purchase_order_id: pid,
      ts: BeijingTimeHelper.apiTimestamp()
    })
    return this.getPurchaseOrder(pid, { transaction })
  }

  /**
   * 收货入库（ordered → received）：加库存 + 回写进货价 + 自动建批次（S2 联动）
   *
   * S1↔S2 联动（拍板 #12「批次成本从采购单自动带入，联动为主路径」）：
   * 默认对无批次归属的明细行自动创建批次（成本=进货价、数量=采购量、供应商同单头）；
   * payload.create_batch === false 时跳过（纯手工模式）。
   *
   * @param {number|string} purchaseOrderId - 采购单 ID
   * @param {Object} [payload={}] - 收货参数：create_batch?（默认 true）
   * @param {Object} options - 配置（transaction 必填）
   * @returns {Promise<Object>} 收货后的采购单详情
   */
  async receivePurchaseOrder(purchaseOrderId, payload = {}, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'PurchaseOrderService.receivePurchaseOrder'
    )
    const { PurchaseOrder, PurchaseOrderItem, ExchangeItemSupplier } = this.models

    const createBatch = payload.create_batch !== false

    const pid = Number(purchaseOrderId)
    const header = await PurchaseOrder.findByPk(pid, {
      transaction,
      lock: transaction.LOCK.UPDATE,
      include: [{ model: PurchaseOrderItem, as: 'lines' }]
    })

    if (!header) {
      throw new BusinessError('采购单不存在', 'PURCHASE_ORDER_NOT_FOUND', 404)
    }
    if (header.status !== 'ordered') {
      throw new BusinessError('仅已下单状态可收货', 'PURCHASE_ORDER_INVALID_TRANSITION', 409)
    }

    const lines = header.lines || []
    if (lines.length === 0) {
      throw new BusinessError('采购明细为空，无法收货', 'PURCHASE_ORDER_EMPTY_LINES', 400)
    }

    for (const line of lines) {
      const skuId = await this._resolveSkuId(line, { transaction })
      const exchangeItemId =
        line.exchange_item_id || (await this._getSkuItemId(skuId, { transaction }))

      let batchId = line.batch_id
      if (!batchId && createBatch) {
        const batch = await this._batchService.createProductBatch(
          {
            exchange_item_id: exchangeItemId,
            sku_id: skuId,
            supplier_id: header.supplier_id,
            batch_cost: line.purchase_price,
            quantity: line.quantity,
            produced_at: BeijingTimeHelper.createDatabaseTime()
          },
          { transaction }
        )
        batchId = batch.batch_id
        await line.update({ batch_id: batchId }, { transaction })
      }

      await this._exchangeItemService.adjustStock(skuId, line.quantity, { transaction })

      if (line.purchase_price != null && exchangeItemId) {
        const [link] = await ExchangeItemSupplier.findOrCreate({
          where: { exchange_item_id: exchangeItemId, supplier_id: header.supplier_id },
          defaults: { is_primary: false },
          transaction
        })
        await link.update({ purchase_price: line.purchase_price }, { transaction })
      }
    }

    await header.update(
      {
        status: 'received',
        received_at: BeijingTimeHelper.createDatabaseTime(),
        total_amount: this._calcTotalAmount(lines.map(l => l.toJSON()))
      },
      { transaction }
    )

    logger.info('[S1] 采购单收货成功', {
      purchase_order_id: pid,
      ts: BeijingTimeHelper.apiTimestamp()
    })
    return this.getPurchaseOrder(pid, { transaction })
  }

  /**
   * 取消采购单（draft/ordered → cancelled）
   */
  async cancelPurchaseOrder(purchaseOrderId, options = {}) {
    const transaction = assertAndGetTransaction(options, 'PurchaseOrderService.cancelPurchaseOrder')
    const { PurchaseOrder } = this.models

    const pid = Number(purchaseOrderId)
    const header = await PurchaseOrder.findByPk(pid, { transaction, lock: transaction.LOCK.UPDATE })
    if (!header) {
      throw new BusinessError('采购单不存在', 'PURCHASE_ORDER_NOT_FOUND', 404)
    }
    if (!EDITABLE_STATUSES.includes(header.status)) {
      throw new BusinessError('当前状态不可取消', 'PURCHASE_ORDER_INVALID_TRANSITION', 409)
    }

    await header.update({ status: 'cancelled' }, { transaction })
    logger.info('[S1] 采购单已取消', {
      purchase_order_id: pid,
      ts: BeijingTimeHelper.apiTimestamp()
    })
    return this.getPurchaseOrder(pid, { transaction })
  }

  /**
   * 全量替换采购明细行
   * @private
   */
  async _replaceLines(purchaseOrderId, lines, options) {
    const transaction = assertAndGetTransaction(options, 'PurchaseOrderService._replaceLines')
    const { PurchaseOrderItem } = this.models

    for (const line of lines) {
      this._validateLine(line)
    }

    await PurchaseOrderItem.destroy({ where: { purchase_order_id: purchaseOrderId }, transaction })

    const rows = lines.map(line => ({
      purchase_order_id: purchaseOrderId,
      exchange_item_id: line.exchange_item_id || null,
      sku_id: line.sku_id || null,
      batch_id: line.batch_id || null,
      quantity: parseInt(line.quantity, 10) || 0,
      purchase_price: line.purchase_price != null ? line.purchase_price : null
    }))

    await PurchaseOrderItem.bulkCreate(rows, { transaction })
  }

  /**
   * 校验明细行
   * @private
   */
  _validateLine(line) {
    if (!line.exchange_item_id && !line.sku_id) {
      throw new BusinessError(
        '明细行需指定 exchange_item_id 或 sku_id',
        'PURCHASE_ORDER_INVALID_LINE',
        400
      )
    }
    const qty = parseInt(line.quantity, 10)
    if (!qty || qty <= 0) {
      throw new BusinessError('明细数量必须大于 0', 'PURCHASE_ORDER_INVALID_LINE', 400)
    }
  }

  /**
   * 计算采购总额
   * @private
   */
  _calcTotalAmount(lines) {
    return lines.reduce((sum, line) => {
      const price = parseFloat(line.purchase_price) || 0
      const qty = parseInt(line.quantity, 10) || 0
      return sum + price * qty
    }, 0)
  }

  /**
   * 解析 SKU ID（行未指定 sku 时取 SPU 默认 SKU）
   * @private
   */
  async _resolveSkuId(line, options) {
    const transaction = assertAndGetTransaction(options, 'PurchaseOrderService._resolveSkuId')
    const { ExchangeItemSku } = this.models

    if (line.sku_id) return Number(line.sku_id)

    const sku = await ExchangeItemSku.findOne({
      where: { exchange_item_id: line.exchange_item_id, status: 'active' },
      order: [
        ['sort_order', 'ASC'],
        ['sku_id', 'ASC']
      ],
      transaction
    })
    if (!sku) {
      throw new BusinessError('商品无可用 SKU', 'PURCHASE_ORDER_SKU_NOT_FOUND', 404)
    }
    return sku.sku_id
  }

  /**
   * 根据 SKU 获取 SPU ID
   * @private
   */
  async _getSkuItemId(skuId, options) {
    const transaction = assertAndGetTransaction(options, 'PurchaseOrderService._getSkuItemId')
    const { ExchangeItemSku } = this.models
    const sku = await ExchangeItemSku.findByPk(skuId, { transaction })
    return sku ? sku.exchange_item_id : null
  }
}

module.exports = PurchaseOrderService
