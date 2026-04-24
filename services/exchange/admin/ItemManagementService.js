'use strict'
const BusinessError = require('../../../utils/BusinessError')

/**
 * 兑换市场管理 - 商品 CRUD 服务
 *
 * 职责范围：
 * - createExchangeItem(): 创建兑换商品
 * - updateExchangeItem(): 更新兑换商品
 * - deleteExchangeItem(): 删除兑换商品
 * - _logStockChange(): 记录库存变动日志
 *
 * @module services/exchange/admin/ItemManagementService
 */

const logger = require('../../../utils/logger').logger
const { BusinessCacheHelper } = require('../../../utils/BusinessCacheHelper')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const { assertAndGetTransaction } = require('../../../utils/transactionHelpers')
const MediaService = require('../../MediaService')
const { MediaFile } = require('../../../models')

class ItemManagementService {
  constructor(models) {
    this.models = models
    this.ExchangeRecord = models.ExchangeRecord
    this.User = models.User
    this.ExchangeItem = models.ExchangeItem
    this.ExchangeItemSku = models.ExchangeItemSku
    this.ExchangeChannelPrice = models.ExchangeChannelPrice
    this.sequelize = models.sequelize
  }

  /**
   * 记录库存变动日志（复用 admin_operation_logs 表）
   *
   * @param {Object} params - 日志参数
   * @param {number} params.exchange_item_id - 商品 ID
   * @param {string} params.item_name - 商品名称
   * @param {number} params.before_stock - 变动前库存
   * @param {number} params.after_stock - 变动后库存
   * @param {string} params.action - 操作类型（admin_set/purchase/refund/batch_update）
   * @param {number} [params.operator_id] - 操作人 ID（系统操作为 null）
   * @param {string} [params.reason] - 变动原因
   * @param {Object} [params.transaction] - 事务对象
   * @returns {Promise<void>} 无返回值
   * @private
   */
  async _logStockChange({
    exchange_item_id,
    item_name,
    before_stock,
    after_stock,
    action,
    operator_id = null,
    reason = null,
    transaction = null
  }) {
    try {
      const delta = after_stock - before_stock
      if (delta === 0) return // 无变动不记录

      await this.models.AdminOperationLog.create(
        {
          operator_id,
          operation_type: 'stock_change',
          target_type: 'product',
          target_id: exchange_item_id,
          action,
          before_data: { stock: before_stock, item_name },
          after_data: { stock: after_stock, item_name },
          changed_fields: { stock: { from: before_stock, to: after_stock, delta } },
          reason:
            reason ||
            `库存变动：${before_stock} → ${after_stock}（${delta > 0 ? '+' : ''}${delta}）`,
          risk_level: Math.abs(delta) > 100 ? 'high' : 'low',
          requires_approval: false,
          approval_status: 'not_required',
          affected_amount: Math.abs(delta)
        },
        { transaction }
      )
    } catch (logError) {
      logger.warn('[兑换市场] 库存变动日志记录失败', {
        exchange_item_id,
        action,
        error: logError.message
      })
    }
  }

  /**
   * 创建兑换商品（管理员操作）
   *
   * @param {Object} itemData - 商品数据
   * @param {string} itemData.name - 商品名称
   * @param {string} [itemData.description] - 商品描述
   * @param {string} itemData.cost_asset_code - 材料资产代码
   * @param {number} itemData.cost_amount - 材料成本数量
   * @param {number} itemData.cost_price - 成本价
   * @param {number} itemData.stock - 初始库存
   * @param {number} [itemData.sort_order=100] - 排序号
   * @param {string} [itemData.status='active'] - 商品状态
   * @param {number} [itemData.primary_media_id] - 主媒体ID（media_files.media_id）
   * @param {string} [itemData.space='lucky'] - 空间归属（lucky=幸运空间, premium=臻选空间, both=两者都展示）
   * @param {number} [itemData.original_price] - 原价（材料数量，用于展示划线价）
   * @param {Array} [itemData.tags] - 商品标签数组，如 ["限量","新品"]
   * @param {boolean} [itemData.is_new=false] - 是否新品
   * @param {boolean} [itemData.is_hot=false] - 是否热门
   * @param {boolean} [itemData.is_lucky=false] - 是否幸运商品
   * @param {boolean} [itemData.has_warranty=false] - 是否有质保
   * @param {boolean} [itemData.free_shipping=false] - 是否包邮
   * @param {boolean} [itemData.is_limited=false] - 是否限量商品（前端触发旋转彩虹边框等视觉强调）
   * @param {string} [itemData.sell_point] - 营销卖点文案
   * @param {number} [itemData.category_id] - 商品分类ID（FK→categories.category_id）
   * @param {number} created_by - 创建者ID
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} 创建结果
   */
  async createExchangeItem(itemData, created_by, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AdminService.createExchangeItem')

    const { name = '', description = '' } = itemData

    logger.info('[兑换市场] 管理员创建商品', { name, created_by })

    if (!name || name.trim().length === 0) {
      throw new BusinessError('商品名称不能为空', 'EXCHANGE_NOT_ALLOWED', 400)
    }
    if (name.length > 100) {
      throw new BusinessError('商品名称最长100字符', 'EXCHANGE_ERROR', 400)
    }
    if (description && description.length > 500) {
      throw new BusinessError('商品描述最长500字符', 'EXCHANGE_ERROR', 400)
    }

    if (!itemData.cost_asset_code) {
      throw new BusinessError('材料资产代码（cost_asset_code）不能为空', 'EXCHANGE_NOT_ALLOWED', 400)
    }
    if (!itemData.cost_amount || itemData.cost_amount <= 0) {
      throw new BusinessError('材料成本数量（cost_amount）必须大于0', 'EXCHANGE_REQUIRED', 400)
    }
    if (itemData.cost_price === undefined || itemData.cost_price < 0) {
      throw new BusinessError('成本价必须大于等于0', 'EXCHANGE_REQUIRED', 400)
    }
    if (itemData.stock === undefined || itemData.stock < 0) {
      throw new BusinessError('库存必须大于等于0', 'EXCHANGE_REQUIRED', 400)
    }

    const validStatuses = ['active', 'inactive']
    if (itemData.status && !validStatuses.includes(itemData.status)) {
      throw new BusinessError(`无效的status参数，允许值：${validStatuses.join(', ')}`, 'EXCHANGE_INVALID_PARAM', 400)
    }

    const validSpaces = ['lucky', 'premium', 'both']
    if (itemData.space && !validSpaces.includes(itemData.space)) {
      throw new BusinessError(`无效的space参数，允许值：${validSpaces.join(', ')}`, 'EXCHANGE_INVALID_PARAM', 400)
    }

    const categoryDefId = itemData.category_id ? parseInt(itemData.category_id) : null

    const item = await this.ExchangeItem.create(
      {
        item_name: name.trim(),
        description: description.trim(),
        primary_media_id: itemData.primary_media_id ?? null,
        sort_order: parseInt(itemData.sort_order) || 100,
        status: itemData.status || 'active',
        category_id: categoryDefId,
        space: itemData.space || 'lucky',
        tags: itemData.tags || null,
        is_new: !!itemData.is_new,
        is_hot: !!itemData.is_hot,
        is_limited: !!itemData.is_limited,
        sell_point: itemData.sell_point || null,
        usage_rules: itemData.usage_rules || null,
        created_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    logger.info(`[兑换市场] 商品创建成功，exchange_item_id: ${item.exchange_item_id}`)

    const { ExchangeItemSku: ExchangeItemSkuModel, ExchangeChannelPrice: ChannelPriceModel } =
      this.models
    if (ExchangeItemSkuModel) {
      const defaultSkuCode = `default_${item.exchange_item_id}`
      const sku = await ExchangeItemSkuModel.create(
        {
          exchange_item_id: item.exchange_item_id,
          sku_code: defaultSkuCode,
          stock: parseInt(itemData.stock),
          sold_count: 0,
          cost_price: parseFloat(itemData.cost_price) || 0,
          status: item.status,
          sort_order: 0
        },
        { transaction }
      )

      if (ChannelPriceModel && itemData.cost_asset_code) {
        await ChannelPriceModel.create(
          {
            sku_id: sku.sku_id,
            cost_asset_code: itemData.cost_asset_code,
            cost_amount: parseInt(itemData.cost_amount) || 0,
            original_amount: itemData.original_price ? parseInt(itemData.original_price) : null,
            is_enabled: true
          },
          { transaction }
        )
      }

      logger.info('[兑换市场] 默认 SKU + 渠道定价创建成功', {
        exchange_item_id: item.exchange_item_id,
        sku_id: sku.sku_id,
        sku_code: defaultSkuCode
      })
    }

    let bound_image = false
    const primaryMediaId = itemData.primary_media_id
    if (primaryMediaId) {
      try {
        const mediaService = new MediaService({ getService: () => null })
        await mediaService.attach(
          primaryMediaId,
          'product',
          item.exchange_item_id,
          'primary',
          0,
          null,
          transaction
        )
        bound_image = true
        logger.info('[兑换市场] 商品主媒体绑定成功', {
          exchange_item_id: item.exchange_item_id,
          media_id: primaryMediaId
        })
      } catch (bindError) {
        logger.warn('[兑换市场] 商品主媒体绑定失败（非致命）', {
          exchange_item_id: item.exchange_item_id,
          media_id: primaryMediaId,
          error: bindError.message
        })
      }
    }

    try {
      await BusinessCacheHelper.invalidateExchangeItems('item_created')
    } catch (cacheError) {
      logger.warn('[兑换市场] 缓存失效失败（非致命）:', cacheError.message)
    }

    return {
      item: item.toJSON(),
      bound_image
    }
  }

  /**
   * 更新兑换商品（管理员操作）
   *
   * @param {number} item_id - 商品ID
   * @param {Object} updateData - 更新数据
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} 更新结果
   */
  async updateExchangeItem(item_id, updateData, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AdminService.updateExchangeItem')

    logger.info('[兑换市场] 管理员更新商品', { item_id })

    const item = await this.ExchangeItem.findByPk(item_id, { transaction })
    if (!item) {
      throw new BusinessError('商品不存在', 'EXCHANGE_ITEM_NOT_FOUND', 404)
    }

    const old_media_id = item.primary_media_id
    const finalUpdateData = { updated_at: BeijingTimeHelper.createDatabaseTime() }

    if (updateData.name !== undefined) {
      if (updateData.name.trim().length === 0) {
        throw new BusinessError('商品名称不能为空', 'EXCHANGE_NOT_ALLOWED', 400)
      }
      if (updateData.name.length > 100) {
        throw new BusinessError('商品名称最长100字符', 'EXCHANGE_ERROR', 400)
      }
      finalUpdateData.item_name = updateData.name.trim()
    }

    if (updateData.description !== undefined) {
      if (updateData.description.length > 500) {
        throw new BusinessError('商品描述最长500字符', 'EXCHANGE_ERROR', 400)
      }
      finalUpdateData.description = updateData.description.trim()
    }

    const skuPriceUpdates = {}
    if (updateData.cost_asset_code !== undefined) {
      if (!updateData.cost_asset_code) {
        throw new BusinessError('材料资产代码不能为空', 'EXCHANGE_NOT_ALLOWED', 400)
      }
      skuPriceUpdates.cost_asset_code = updateData.cost_asset_code
    }

    if (updateData.cost_amount !== undefined) {
      if (updateData.cost_amount <= 0) {
        throw new BusinessError('材料成本数量必须大于0', 'EXCHANGE_REQUIRED', 400)
      }
      skuPriceUpdates.cost_amount = parseInt(updateData.cost_amount)
    }

    if (updateData.cost_price !== undefined) {
      if (updateData.cost_price < 0) {
        throw new BusinessError('成本价必须大于等于0', 'EXCHANGE_REQUIRED', 400)
      }
      skuPriceUpdates.cost_price = parseFloat(updateData.cost_price)
    }

    if (updateData.stock !== undefined) {
      if (updateData.stock < 0) {
        throw new BusinessError('库存必须大于等于0', 'EXCHANGE_REQUIRED', 400)
      }
      skuPriceUpdates.stock = parseInt(updateData.stock)
    }

    if (updateData.sort_order !== undefined) {
      finalUpdateData.sort_order = parseInt(updateData.sort_order)
    }

    if (updateData.status !== undefined) {
      const validStatuses = ['active', 'inactive']
      if (!validStatuses.includes(updateData.status)) {
        throw new BusinessError(`无效的status参数，允许值：${validStatuses.join(', ')}`, 'EXCHANGE_INVALID_PARAM', 400)
      }

      if (updateData.status === 'active' && item.status !== 'active') {
        const targetMediaId = updateData.primary_media_id ?? item.primary_media_id
        if (!targetMediaId) {
          throw new BusinessError('商品上架必须上传主图片（primary_media_id 不能为空）', 'EXCHANGE_NOT_ALLOWED', 400)
        }
        const record = await MediaFile?.findByPk(targetMediaId, { transaction })
        if (!record) {
          throw new BusinessError(`商品上架失败：关联媒体不存在（media_id=${targetMediaId}）`, 'EXCHANGE_ITEM_NOT_FOUND', 404)
        }
        if (record && record.status !== 'active') {
          throw new BusinessError(`商品上架失败：关联媒体状态异常（status=${record.status}）`, 'EXCHANGE_STATUS_ABNORMAL', 400)
        }
      }

      finalUpdateData.status = updateData.status
    }

    if (updateData.space !== undefined) {
      const validSpaces = ['lucky', 'premium', 'both']
      if (!validSpaces.includes(updateData.space)) {
        throw new BusinessError(`无效的space参数，允许值：${validSpaces.join(', ')}`, 'EXCHANGE_INVALID_PARAM', 400)
      }
      finalUpdateData.space = updateData.space
    }

    if (updateData.original_price !== undefined) {
      skuPriceUpdates.original_amount = updateData.original_price
        ? parseInt(updateData.original_price)
        : null
    }

    if (updateData.tags !== undefined) finalUpdateData.tags = updateData.tags
    if (updateData.is_new !== undefined) finalUpdateData.is_new = !!updateData.is_new
    if (updateData.is_hot !== undefined) finalUpdateData.is_hot = !!updateData.is_hot
    if (updateData.is_lucky !== undefined) finalUpdateData.is_lucky = !!updateData.is_lucky
    if (updateData.has_warranty !== undefined) finalUpdateData.has_warranty = !!updateData.has_warranty
    if (updateData.free_shipping !== undefined) finalUpdateData.free_shipping = !!updateData.free_shipping
    if (updateData.is_limited !== undefined) finalUpdateData.is_limited = !!updateData.is_limited
    if (updateData.sell_point !== undefined) finalUpdateData.sell_point = updateData.sell_point || null
    if (updateData.category_id !== undefined) finalUpdateData.category_id = updateData.category_id ? parseInt(updateData.category_id) : null
    if (updateData.usage_rules !== undefined) finalUpdateData.usage_rules = updateData.usage_rules || null

    let deleted_old_image = false
    let bound_new_image = false
    const new_media_id = updateData.primary_media_id

    if (updateData.primary_media_id !== undefined) {
      finalUpdateData.primary_media_id = new_media_id || null

      const mediaService = new MediaService({ getService: () => null })

      if (old_media_id && old_media_id !== new_media_id) {
        try {
          await mediaService.detach('product', item_id, 'primary', transaction)
          deleted_old_image = true
          logger.info('[兑换市场] 商品旧主媒体解绑成功', { item_id, old_media_id })
        } catch (imageError) {
          logger.warn('[兑换市场] 商品旧主媒体解绑失败（非致命）', {
            item_id,
            old_media_id,
            error: imageError.message
          })
        }
      }

      if (new_media_id) {
        try {
          await mediaService.attach(
            new_media_id,
            'product',
            item_id,
            'primary',
            0,
            null,
            transaction
          )
          bound_new_image = true
          logger.info('[兑换市场] 商品新主媒体绑定成功', { item_id, new_media_id })
        } catch (bindError) {
          logger.warn('[兑换市场] 商品新主媒体绑定失败（非致命）', {
            item_id,
            new_media_id,
            error: bindError.message
          })
        }
      }
    }

    await item.update(finalUpdateData, { transaction })

    if (Object.keys(skuPriceUpdates).length > 0) {
      const defaultSku = await this.ExchangeItemSku.findOne({
        where: { exchange_item_id: item_id },
        order: [['sku_id', 'ASC']],
        transaction
      })

      if (defaultSku) {
        const skuFields = {}
        if (skuPriceUpdates.stock !== undefined) {
          const oldStock = defaultSku.stock
          skuFields.stock = skuPriceUpdates.stock
          if (skuPriceUpdates.stock !== oldStock) {
            await this._logStockChange({
              exchange_item_id: item_id,
              item_name: item.item_name,
              before_stock: oldStock,
              after_stock: skuPriceUpdates.stock,
              action: 'admin_set',
              operator_id: options.operator_id || null,
              reason: '管理员手动调整库存',
              transaction
            })
          }
        }
        if (skuPriceUpdates.cost_price !== undefined) {
          skuFields.cost_price = skuPriceUpdates.cost_price
        }
        if (Object.keys(skuFields).length > 0) {
          await defaultSku.update(skuFields, { transaction })
        }

        const priceFields = {}
        if (skuPriceUpdates.cost_asset_code !== undefined) {
          priceFields.cost_asset_code = skuPriceUpdates.cost_asset_code
        }
        if (skuPriceUpdates.cost_amount !== undefined) {
          priceFields.cost_amount = skuPriceUpdates.cost_amount
        }
        if (skuPriceUpdates.original_amount !== undefined) {
          priceFields.original_amount = skuPriceUpdates.original_amount
        }
        if (Object.keys(priceFields).length > 0) {
          const ChannelPriceModel = this.models.ExchangeChannelPrice
          if (ChannelPriceModel) {
            await ChannelPriceModel.update(priceFields, {
              where: { sku_id: defaultSku.sku_id },
              transaction
            })
          }
        }

        await this._updateSpuSummary(item_id, transaction)
      }
    }

    logger.info(`[兑换市场] 商品更新成功，item_id: ${item_id}`, {
      deleted_old_image,
      bound_new_image,
      old_media_id,
      new_media_id
    })

    try {
      await BusinessCacheHelper.invalidateExchangeItems('item_updated')
    } catch (cacheError) {
      logger.warn('[兑换市场] 缓存失效失败（非致命）:', cacheError.message)
    }

    return {
      item: item.toJSON(),
      image_changes: {
        deleted_old_image,
        bound_new_image,
        old_media_id,
        new_media_id
      }
    }
  }

  /**
   * 删除兑换商品（管理员操作）
   *
   * @param {number} item_id - 商品ID
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} 删除结果
   */
  async deleteExchangeItem(item_id, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AdminService.deleteExchangeItem')

    logger.info('[兑换市场] 管理员删除商品', { item_id })

    const item = await this.ExchangeItem.findByPk(item_id, { transaction })
    if (!item) {
      throw new BusinessError('商品不存在', 'EXCHANGE_ITEM_NOT_FOUND', 404)
    }

    const associated_media_id = item.primary_media_id

    const orderCount = await this.ExchangeRecord.count({
      where: { exchange_item_id: item_id },
      transaction
    })

    if (orderCount > 0) {
      await item.update(
        {
          status: 'inactive',
          updated_at: BeijingTimeHelper.createDatabaseTime()
        },
        { transaction }
      )

      logger.info(`[兑换市场] 商品有${orderCount}个关联订单，已下架而非删除`)

      try {
        await BusinessCacheHelper.invalidateExchangeItems('item_deactivated')
      } catch (cacheError) {
        logger.warn('[兑换市场] 缓存失效失败（非致命）:', cacheError.message)
      }

      return {
        action: 'deactivated',
        message: `该商品有${orderCount}个关联订单，已自动下架而非删除`,
        item: item.toJSON()
      }
    }

    if (associated_media_id) {
      try {
        const mediaService = new MediaService({ getService: () => null })
        const deletedCount = await mediaService.detach('product', item_id, 'primary', transaction)
        logger.info('[兑换市场] 商品关联主媒体解绑成功', {
          item_id,
          media_id: associated_media_id,
          deleted_count: deletedCount
        })
      } catch (imageError) {
        logger.warn('[兑换市场] 商品关联主媒体解绑失败（非致命）', {
          item_id,
          media_id: associated_media_id,
          error: imageError.message
        })
      }
    }

    await item.destroy({ transaction })

    logger.info(`[兑换市场] 商品删除成功，item_id: ${item_id}`, {
      deleted_media_id: associated_media_id
    })

    try {
      await BusinessCacheHelper.invalidateExchangeItems('item_deleted')
    } catch (cacheError) {
      logger.warn('[兑换市场] 缓存失效失败（非致命）:', cacheError.message)
    }

    return {
      action: 'deleted',
      message: '商品删除成功',
      deleted_media_id: associated_media_id
    }
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

module.exports = ItemManagementService
