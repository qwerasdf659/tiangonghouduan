/**
 * @file 产品批次服务（ProductBatchService）— S2 批次管理
 * @description 批次 CRUD、批次码生成、按批次召回
 * @module services/exchange/ProductBatchService
 */

'use strict'

/* eslint-disable valid-jsdoc, require-jsdoc */

const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const { logger } = require('../../utils/logger')
const BeijingTimeHelper = require('../../utils/timeHelper')
const BusinessError = require('../../utils/BusinessError')
const BusinessSeqCodeGenerator = require('../../utils/BusinessSeqCodeGenerator')

/**
 * @class ProductBatchService
 */
class ProductBatchService {
  /**
   * @param {Object} models - Sequelize 模型集合
   */
  constructor(models) {
    this.models = models
    this.sequelize = models.sequelize
  }

  /**
   * 分页查询批次
   */
  async listProductBatches(filters = {}, pagination = {}) {
    const { ProductBatch, ExchangeItem, Supplier } = this.models
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
    if (filters.exchange_item_id) {
      const eid = Number(filters.exchange_item_id)
      if (!Number.isNaN(eid)) where.exchange_item_id = eid
    }
    if (filters.keyword && String(filters.keyword).trim()) {
      where.batch_code = { [Op.like]: `%${String(filters.keyword).trim()}%` }
    }

    const { rows, count } = await ProductBatch.findAndCountAll({
      where,
      include: [
        {
          model: ExchangeItem,
          as: 'exchangeItem',
          attributes: ['exchange_item_id', 'item_code', 'item_name'],
          required: false
        },
        {
          model: Supplier,
          as: 'supplier',
          attributes: ['supplier_id', 'supplier_name'],
          required: false
        }
      ],
      order: [['batch_id', 'DESC']],
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
   * 查询批次详情（含关联实物数量）
   */
  async getProductBatch(batchId, options = {}) {
    const { ProductBatch, ExchangeItem, ExchangeItemSku, Supplier, Item } = this.models
    const transaction = options.transaction || null

    const bid = Number(batchId)
    if (Number.isNaN(bid)) {
      throw new BusinessError('batch_id 无效', 'PRODUCT_BATCH_INVALID_ID', 400)
    }

    const row = await ProductBatch.findByPk(bid, {
      transaction,
      include: [
        { model: ExchangeItem, as: 'exchangeItem', required: false },
        { model: ExchangeItemSku, as: 'sku', required: false },
        { model: Supplier, as: 'supplier', required: false }
      ]
    })

    if (!row) {
      throw new BusinessError('批次不存在', 'PRODUCT_BATCH_NOT_FOUND', 404)
    }

    const itemCount = await Item.count({ where: { batch_id: bid }, transaction })
    const result = row.toJSON()
    result.linked_item_count = itemCount
    return result
  }

  /**
   * 创建批次
   */
  async createProductBatch(data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ProductBatchService.createProductBatch')
    const { ProductBatch } = this.models

    const batchCode = await BusinessSeqCodeGenerator.generateWithRetry({
      prefix: 'BC',
      model: ProductBatch,
      field: 'batch_code',
      transaction
    })

    const qty = parseInt(data.quantity, 10) || 0
    if (qty < 0) {
      throw new BusinessError('批次数量不能为负', 'PRODUCT_BATCH_INVALID_QUANTITY', 400)
    }

    const created = await ProductBatch.create(
      {
        batch_code: batchCode,
        exchange_item_id: data.exchange_item_id || null,
        sku_id: data.sku_id || null,
        supplier_id: data.supplier_id || null,
        batch_cost: data.batch_cost != null ? data.batch_cost : null,
        quantity: qty,
        produced_at: data.produced_at || BeijingTimeHelper.createDatabaseTime(),
        status: data.status || 'active'
      },
      { transaction }
    )

    logger.info('[S2] 批次创建成功', {
      batch_id: created.batch_id,
      batch_code: batchCode,
      ts: BeijingTimeHelper.apiTimestamp()
    })

    return created.toJSON()
  }

  /**
   * 更新批次
   */
  async updateProductBatch(batchId, data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ProductBatchService.updateProductBatch')
    const { ProductBatch } = this.models

    const bid = Number(batchId)
    if (Number.isNaN(bid)) {
      throw new BusinessError('batch_id 无效', 'PRODUCT_BATCH_INVALID_ID', 400)
    }

    const row = await ProductBatch.findByPk(bid, { transaction, lock: transaction.LOCK.UPDATE })
    if (!row) {
      throw new BusinessError('批次不存在', 'PRODUCT_BATCH_NOT_FOUND', 404)
    }

    const allowed = [
      'exchange_item_id',
      'sku_id',
      'supplier_id',
      'batch_cost',
      'quantity',
      'produced_at',
      'status'
    ]
    const updates = {}
    for (const key of allowed) {
      if (data[key] !== undefined) updates[key] = data[key]
    }

    if (Object.keys(updates).length > 0) {
      await row.update(updates, { transaction })
    }

    logger.info('[S2] 批次更新成功', { batch_id: bid, ts: BeijingTimeHelper.apiTimestamp() })
    return this.getProductBatch(bid, { transaction })
  }

  /**
   * 批次召回（active → inactive）
   */
  async recallProductBatch(batchId, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ProductBatchService.recallProductBatch')
    const { ProductBatch } = this.models

    const bid = Number(batchId)
    const row = await ProductBatch.findByPk(bid, { transaction, lock: transaction.LOCK.UPDATE })
    if (!row) {
      throw new BusinessError('批次不存在', 'PRODUCT_BATCH_NOT_FOUND', 404)
    }
    if (row.status === 'inactive') {
      throw new BusinessError('批次已召回', 'PRODUCT_BATCH_ALREADY_RECALLED', 409)
    }

    await row.update({ status: 'inactive' }, { transaction })
    logger.info('[S2] 批次已召回', { batch_id: bid, ts: BeijingTimeHelper.apiTimestamp() })
    return this.getProductBatch(bid, { transaction })
  }
}

module.exports = ProductBatchService
