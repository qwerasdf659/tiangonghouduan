'use strict'
const BusinessError = require('../../../utils/BusinessError')

/**
 * 兑换市场管理 - SKU 管理服务
 *
 * 职责范围：
 * - listSkus(): 获取商品的所有 SKU 列表
 * - createSku(): 创建 SKU
 * - updateSku(): 更新 SKU
 * - deleteSku(): 删除 SKU
 * - _updateSpuSummary(): 更新 SPU 汇总字段
 *
 * @module services/exchange/admin/SkuService
 */

const logger = require('../../../utils/logger').logger
const { AssetCode } = require('../../../constants/AssetCode')
const { BusinessCacheHelper } = require('../../../utils/BusinessCacheHelper')
const { assertAndGetTransaction } = require('../../../utils/transactionHelpers')

class SkuService {
  constructor(models) {
    this.models = models
    this.ExchangeItem = models.ExchangeItem
    this.ExchangeItemSku = models.ExchangeItemSku
    this.sequelize = models.sequelize
  }

  /**
   * 获取商品的所有 SKU 列表
   *
   * @param {number} exchangeItemId - SPU 商品ID
   * @returns {Promise<Object>} SKU 列表和商品基础信息
   */
  async listSkus(exchangeItemId) {
    const ExchangeItemSkuModel = this.models.ExchangeItemSku
    const item = await this.ExchangeItem.findByPk(exchangeItemId, {
      attributes: [
        'exchange_item_id', 'item_name', 'stock',
        'sold_count', 'min_cost_amount', 'max_cost_amount'
      ]
    })

    if (!item) {
      throw new BusinessError('商品不存在', 'EXCHANGE_ITEM_NOT_FOUND', 404)
    }

    const skus = await ExchangeItemSkuModel.findAll({
      where: { exchange_item_id: exchangeItemId },
      order: [
        ['sort_order', 'ASC'],
        ['sku_id', 'ASC']
      ]
    })

    return {
      item: item.toJSON(),
      skus: skus.map(s => s.toJSON()),
      total: skus.length
    }
  }

  /**
   * 创建 SKU（为商品添加新的规格变体）
   *
   * @param {number} exchangeItemId - SPU 商品ID
   * @param {Object} skuData - SKU 数据
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} 创建的 SKU
   */
  async createSku(exchangeItemId, skuData, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AdminService.createSku')
    const ExchangeItemSkuModel = this.models.ExchangeItemSku

    const item = await this.ExchangeItem.findByPk(exchangeItemId, {
      lock: transaction.LOCK.UPDATE,
      transaction
    })
    if (!item) {
      throw new BusinessError('商品不存在', 'EXCHANGE_ITEM_NOT_FOUND', 404)
    }

    if (!skuData.cost_amount || skuData.cost_amount <= 0) {
      throw new BusinessError('SKU 兑换价格必须大于 0', 'EXCHANGE_REQUIRED', 400)
    }

    if (skuData.stock === undefined || skuData.stock < 0) {
      throw new BusinessError('SKU 库存必须大于等于 0', 'EXCHANGE_REQUIRED', 400)
    }

    const sku = await ExchangeItemSkuModel.create(
      {
        exchange_item_id: exchangeItemId,
        stock: parseInt(skuData.stock),
        sold_count: 0,
        cost_price: parseFloat(skuData.cost_price) || 0,
        status: skuData.status || 'active',
        sort_order: parseInt(skuData.sort_order) || 0
      },
      { transaction }
    )

    const ChannelPriceModel = this.models.ExchangeChannelPrice
    if (ChannelPriceModel) {
      await ChannelPriceModel.create(
        {
          sku_id: sku.sku_id,
          cost_asset_code: skuData.cost_asset_code || AssetCode.STAR_STONE,
          cost_amount: parseInt(skuData.cost_amount),
          original_amount: skuData.original_amount ? parseInt(skuData.original_amount) : null,
          is_enabled: true
        },
        { transaction }
      )
    }

    await this._updateSpuSummary(exchangeItemId, transaction)

    await BusinessCacheHelper.invalidateExchangeItems('sku_created')

    logger.info('[兑换市场] SKU 创建成功', {
      sku_id: sku.sku_id,
      exchange_item_id: exchangeItemId,
      spec_values: skuData.spec_values
    })

    return { sku: sku.toJSON() }
  }

  /**
   * 更新 SKU
   *
   * @param {number} skuId - SKU ID
   * @param {Object} updateData - 更新数据
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} 更新后的 SKU
   */
  async updateSku(skuId, updateData, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AdminService.updateSku')
    const ExchangeItemSkuModel = this.models.ExchangeItemSku

    const sku = await ExchangeItemSkuModel.findByPk(skuId, {
      lock: transaction.LOCK.UPDATE,
      transaction
    })
    if (!sku) {
      throw new BusinessError('SKU 不存在', 'EXCHANGE_SKU_NOT_FOUND', 404)
    }

    const skuAllowedFields = ['stock', 'cost_price', 'status', 'sort_order']
    const skuUpdate = {}
    for (const field of skuAllowedFields) {
      if (updateData[field] !== undefined) {
        skuUpdate[field] = updateData[field]
      }
    }

    if (updateData.cost_amount !== undefined && updateData.cost_amount <= 0) {
      throw new BusinessError('SKU 兑换价格必须大于 0', 'EXCHANGE_REQUIRED', 400)
    }

    if (Object.keys(skuUpdate).length > 0) {
      await sku.update(skuUpdate, { transaction })
    }

    const priceUpdate = {}
    if (updateData.cost_asset_code !== undefined) {
      priceUpdate.cost_asset_code = updateData.cost_asset_code
    }
    if (updateData.cost_amount !== undefined) {
      priceUpdate.cost_amount = parseInt(updateData.cost_amount)
    }
    if (updateData.original_amount !== undefined) {
      priceUpdate.original_amount = updateData.original_amount
    }

    if (Object.keys(priceUpdate).length > 0) {
      const ChannelPriceModel = this.models.ExchangeChannelPrice
      if (ChannelPriceModel) {
        await ChannelPriceModel.update(priceUpdate, {
          where: { sku_id: skuId },
          transaction
        })
      }
    }

    await this._updateSpuSummary(sku.exchange_item_id, transaction)

    await BusinessCacheHelper.invalidateExchangeItems('sku_updated')

    return { sku: sku.toJSON() }
  }

  /**
   * 删除 SKU（不允许删除最后一个 SKU）
   *
   * @param {number} skuId - SKU ID
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} 删除结果
   */
  async deleteSku(skuId, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AdminService.deleteSku')
    const ExchangeItemSkuModel = this.models.ExchangeItemSku

    const sku = await ExchangeItemSkuModel.findByPk(skuId, { transaction })
    if (!sku) {
      throw new BusinessError('SKU 不存在', 'EXCHANGE_SKU_NOT_FOUND', 404)
    }

    const skuCount = await ExchangeItemSkuModel.count({
      where: { exchange_item_id: sku.exchange_item_id },
      transaction
    })

    if (skuCount <= 1) {
      throw new BusinessError('不能删除最后一个 SKU，每个商品至少保留一个 SKU', 'EXCHANGE_NOT_ALLOWED', 400)
    }

    const exchangeItemId = sku.exchange_item_id
    await sku.destroy({ transaction })
    await this._updateSpuSummary(exchangeItemId, transaction)

    await BusinessCacheHelper.invalidateExchangeItems('sku_deleted')

    logger.info('[兑换市场] SKU 删除成功', { sku_id: skuId, exchange_item_id: exchangeItemId })

    return { action: 'deleted', sku_id: skuId }
  }

  /**
   * 更新 SPU 汇总字段（stock/sold_count/min_cost_amount/max_cost_amount）
   * @param {number} exchangeItemId - SPU 商品ID
   * @param {Transaction} transaction - 事务对象
   * @returns {Promise<void>}
   * @private
   */
  async _updateSpuSummary(exchangeItemId, transaction) {
    const ExchangeItemSkuModel = this.models.ExchangeItemSku

    const [skuSummary] = await ExchangeItemSkuModel.findAll({
      where: { exchange_item_id: exchangeItemId, status: 'active' },
      attributes: [
        [this.sequelize.fn('SUM', this.sequelize.col('stock')), 'total_stock'],
        [this.sequelize.fn('SUM', this.sequelize.col('sold_count')), 'total_sold']
      ],
      raw: true,
      transaction
    })

    const [priceSummary] = await this.sequelize.query(
      `SELECT MIN(ecp.cost_amount) AS min_cost, MAX(ecp.cost_amount) AS max_cost
       FROM exchange_item_skus ps
       JOIN exchange_channel_prices ecp ON ecp.sku_id = ps.sku_id AND ecp.is_enabled = 1
       WHERE ps.exchange_item_id = :productId AND ps.status = 'active'`,
      {
        replacements: { productId: exchangeItemId },
        type: this.sequelize.QueryTypes.SELECT,
        transaction
      }
    )

    await this.ExchangeItem.update(
      {
        stock: parseInt(skuSummary.total_stock) || 0,
        sold_count: parseInt(skuSummary.total_sold) || 0,
        min_cost_amount: priceSummary?.min_cost !== null ? parseInt(priceSummary.min_cost) : null,
        max_cost_amount: priceSummary?.max_cost !== null ? parseInt(priceSummary.max_cost) : null
      },
      {
        where: { exchange_item_id: exchangeItemId },
        transaction
      }
    )
  }
}

module.exports = SkuService
