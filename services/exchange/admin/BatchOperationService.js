'use strict'
const BusinessError = require('../../../utils/BusinessError')

/**
 * 兑换市场管理 - 批量操作服务
 *
 * 职责范围：
 * - batchBindImages(): 批量绑定商品图片
 * - batchUpdateSpace(): 批量更新商品空间归属
 * - batchUpdateStatus(): 批量上下架商品
 * - batchUpdatePrice(): 批量调整商品价格
 * - batchSetIndividualPrices(): 批量逐个设价
 * - batchUpdateCategory(): 批量修改商品分类
 * - batchUpdateRarity(): 批量修改商品稀有度
 * - getMissingImageItems(): 查询缺少图片的商品列表
 *
 * @module services/exchange/admin/BatchOperationService
 */

const logger = require('../../../utils/logger').logger
const { BusinessCacheHelper } = require('../../../utils/BusinessCacheHelper')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const { assertAndGetTransaction } = require('../../../utils/transactionHelpers')
const { Op } = require('sequelize')
const MediaService = require('../../MediaService')

class BatchOperationService {
  constructor(models) {
    this.models = models
    this.ExchangeItem = models.ExchangeItem
    this.ExchangeItemSku = models.ExchangeItemSku
    this.sequelize = models.sequelize
  }

  /**
   * 批量绑定商品图片（运营批量上传图片后绑定）
   *
   * @param {Array<Object>} bindings - 绑定关系数组
   * @param {number} bindings[].exchange_item_id - 商品ID
   * @param {number} bindings[].media_id - 媒体文件ID（media_files.media_id）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @returns {Promise<Object>} 绑定结果
   */
  async batchBindImages(bindings, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AdminService.batchBindImages')

    if (!Array.isArray(bindings) || bindings.length === 0) {
      throw new BusinessError('绑定关系数组不能为空', 'EXCHANGE_NOT_ALLOWED', 400)
    }

    for (const binding of bindings) {
      if (!binding.exchange_item_id || !binding.media_id) {
        throw new BusinessError('每条绑定记录必须包含 exchange_item_id 和 media_id', 'EXCHANGE_REQUIRED', 400)
      }
    }

    logger.info('[兑换市场-管理] 批量绑定商品主媒体', { count: bindings.length })

    const mediaService = new MediaService({ getService: () => null })
    const results = { success: 0, failed: 0, details: [] }

    for (const binding of bindings) {
      try {
        const item = await this.ExchangeItem.findByPk(binding.exchange_item_id, { transaction })
        if (!item) {
          results.failed++
          results.details.push({
            exchange_item_id: binding.exchange_item_id,
            success: false,
            error: '商品不存在'
          })
          continue
        }

        await mediaService.attach(
          binding.media_id,
          'product',
          binding.exchange_item_id,
          'primary',
          0,
          null,
          transaction
        )

        results.success++
        results.details.push({
          exchange_item_id: binding.exchange_item_id,
          media_id: binding.media_id,
          success: true
        })
      } catch (bindError) {
        results.failed++
        results.details.push({
          exchange_item_id: binding.exchange_item_id,
          media_id: binding.media_id,
          success: false,
          error: bindError.message
        })
        logger.warn('[兑换市场-管理] 单条主媒体绑定失败', {
          exchange_item_id: binding.exchange_item_id,
          error: bindError.message
        })
      }
    }

    try {
      await BusinessCacheHelper.invalidateExchangeItems('batch_image_bind')
    } catch (cacheError) {
      logger.warn('[兑换市场-管理] 缓存失效失败（非致命）:', cacheError.message)
    }

    logger.info('[兑换市场-管理] 批量绑定商品图片完成', {
      total: bindings.length,
      success: results.success,
      failed: results.failed
    })

    return {
      total: bindings.length,
      success: results.success,
      failed: results.failed,
      details: results.details
    }
  }

  /**
   * 批量更新商品空间归属（臻选空间/幸运空间管理，决策4 + Phase 3.8）
   *
   * @param {number[]} exchangeItemIds - 商品ID数组
   * @param {string} space - 目标空间：lucky/premium/both
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @returns {Promise<Object>} 更新结果
   */
  async batchUpdateSpace(exchangeItemIds, space, options = {}) {
    const { transaction } = assertAndGetTransaction(options)

    const validSpaces = ['lucky', 'premium', 'both']
    if (!validSpaces.includes(space)) {
      throw new BusinessError(`无效的空间类型：${space}，允许值：${validSpaces.join(', ')}`, 'EXCHANGE_INVALID_ID', 400)
    }

    if (!Array.isArray(exchangeItemIds) || exchangeItemIds.length === 0) {
      throw new BusinessError('商品ID数组不能为空', 'EXCHANGE_NOT_ALLOWED', 400)
    }

    logger.info('[兑换市场-管理] 批量更新商品空间', {
      count: exchangeItemIds.length,
      target_space: space
    })

    const [affectedRows] = await this.ExchangeItem.update(
      { space },
      {
        where: { exchange_item_id: { [Op.in]: exchangeItemIds } },
        transaction
      }
    )

    await BusinessCacheHelper.invalidateExchangeItems('batch_space')

    logger.info('[兑换市场-管理] 批量更新空间完成', {
      requested: exchangeItemIds.length,
      affected: affectedRows,
      target_space: space
    })

    return { affected_rows: affectedRows, space }
  }

  /**
   * 批量上下架商品（C1：批量切换 active/inactive）
   *
   * @param {number[]} exchangeItemIds - 商品 ID 数组
   * @param {string} status - 目标状态：active/inactive
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @param {number} [options.operator_id] - 操作人 ID
   * @returns {Promise<Object>} { affected_rows, status }
   */
  async batchUpdateStatus(exchangeItemIds, status, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AdminService.batchUpdateStatus')

    const validStatuses = ['active', 'inactive']
    if (!validStatuses.includes(status)) {
      throw new BusinessError(`无效的状态：${status}，允许值：${validStatuses.join(', ')}`, 'EXCHANGE_INVALID_STATUS', 400)
    }

    if (!Array.isArray(exchangeItemIds) || exchangeItemIds.length === 0) {
      throw new BusinessError('商品ID数组不能为空', 'EXCHANGE_NOT_ALLOWED', 400)
    }

    logger.info('[兑换市场-管理] 批量更新商品状态', {
      count: exchangeItemIds.length,
      target_status: status
    })

    const [affectedRows] = await this.ExchangeItem.update(
      { status, updated_at: BeijingTimeHelper.createDatabaseTime() },
      { where: { exchange_item_id: { [Op.in]: exchangeItemIds } }, transaction }
    )

    await BusinessCacheHelper.invalidateExchangeItems('batch_status_update').catch(() => {})

    logger.info('[兑换市场-管理] 批量更新状态完成', {
      requested: exchangeItemIds.length,
      affected: affectedRows
    })
    return { affected_rows: affectedRows, status }
  }

  /**
   * 批量调整商品价格（C2：按比例或固定值调整 cost_amount）
   *
   * @param {number[]} exchangeItemIds - 商品 ID 数组
   * @param {Object} adjustment - 调整参数
   * @param {string} adjustment.mode - 调整模式：ratio（按比例）/ fixed（固定值增减）/ set（直接设置）
   * @param {number} adjustment.value - 调整值
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @param {number} [options.operator_id] - 操作人 ID
   * @returns {Promise<Object>} { affected_rows, adjustment }
   */
  async batchUpdatePrice(exchangeItemIds, adjustment, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AdminService.batchUpdatePrice')

    if (!Array.isArray(exchangeItemIds) || exchangeItemIds.length === 0) {
      throw new BusinessError('商品ID数组不能为空', 'EXCHANGE_NOT_ALLOWED', 400)
    }

    const { mode, value } = adjustment
    if (!['ratio', 'fixed', 'set'].includes(mode)) {
      throw new BusinessError('调整模式必须是 ratio/fixed/set', 'EXCHANGE_REQUIRED', 400)
    }
    if (typeof value !== 'number' || isNaN(value)) {
      throw new BusinessError('调整值必须是有效数字', 'EXCHANGE_REQUIRED', 400)
    }
    if (mode === 'ratio' && value <= 0) {
      throw new BusinessError('比例调整值必须大于0', 'EXCHANGE_REQUIRED', 400)
    }
    if (mode === 'set' && value <= 0) {
      throw new BusinessError('直接设置的价格必须大于0', 'EXCHANGE_REQUIRED', 400)
    }

    logger.info('[兑换市场-管理] 批量调整商品价格', { count: exchangeItemIds.length, mode, value })

    const ChannelPriceModel = this.models.ExchangeChannelPrice

    const skus = await this.ExchangeItemSku.findAll({
      where: { exchange_item_id: { [Op.in]: exchangeItemIds } },
      include: [
        {
          model: ChannelPriceModel,
          as: 'channelPrices',
          where: { is_enabled: true },
          required: true
        }
      ],
      transaction
    })

    let updatedCount = 0
    const productIdsToRefresh = new Set()

    for (const sku of skus) {
      for (const price of sku.channelPrices) {
        const oldAmount = Number(price.cost_amount)
        let newAmount

        if (mode === 'ratio') {
          newAmount = Math.round(oldAmount * value)
        } else if (mode === 'fixed') {
          newAmount = oldAmount + value
        } else {
          newAmount = value
        }

        newAmount = Math.max(1, newAmount)

        if (newAmount !== oldAmount) {
          await price.update({ cost_amount: newAmount }, { transaction })
          updatedCount++
          productIdsToRefresh.add(sku.exchange_item_id)

          try {
            await this.models.AdminOperationLog.create(
              {
                operator_id: options.operator_id || null,
                operation_type: 'price_change',
                target_type: 'product',
                target_id: sku.exchange_item_id,
                action: 'batch_update',
                before_data: { cost_amount: oldAmount, sku_id: sku.sku_id },
                after_data: { cost_amount: newAmount, sku_id: sku.sku_id },
                changed_fields: { cost_amount: { from: oldAmount, to: newAmount } },
                reason: `批量调价（${mode}=${value}）`,
                risk_level: 'medium',
                requires_approval: false,
                approval_status: 'not_required'
              },
              { transaction }
            )
          } catch (logErr) {
            logger.warn('[兑换市场] 价格变动日志记录失败', { error: logErr.message })
          }
        }
      }
    }

    for (const pid of productIdsToRefresh) {
      await this._updateSpuSummary(pid, transaction)
    }

    await BusinessCacheHelper.invalidateExchangeItems('batch_price_update').catch(() => {})

    logger.info('[兑换市场-管理] 批量调价完成', {
      requested: exchangeItemIds.length,
      affected: updatedCount
    })
    return { affected_rows: updatedCount, adjustment }
  }

  /**
   * 批量逐个设价（每个兑换商品可指定不同 cost_amount）
   *
   * @param {Array<{ exchange_item_id: number, cost_amount: number }>} priceItems - 商品价格行
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize 事务（必填）
   * @param {number} [options.operator_id] - 操作人 user_id
   * @returns {Promise<{ affected_rows: number }>} 实际更新的渠道价行数
   */
  async batchSetIndividualPrices(priceItems, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AdminService.batchSetIndividualPrices')

    if (!Array.isArray(priceItems) || priceItems.length === 0) {
      throw new BusinessError('价格数据不能为空', 'EXCHANGE_NOT_ALLOWED', 400)
    }

    const priceMap = new Map()
    for (const item of priceItems) {
      if (!item.exchange_item_id || item.cost_amount === undefined || item.cost_amount < 0) {
        continue
      }
      priceMap.set(Number(item.exchange_item_id), Number(item.cost_amount))
    }

    if (priceMap.size === 0) {
      return { affected_rows: 0 }
    }

    logger.info('[兑换市场-管理] 批量逐个设价', { count: priceMap.size })

    const ChannelPriceModel = this.models.ExchangeChannelPrice

    const skus = await this.ExchangeItemSku.findAll({
      where: { exchange_item_id: { [Op.in]: [...priceMap.keys()] } },
      include: [
        {
          model: ChannelPriceModel,
          as: 'channelPrices',
          where: { is_enabled: true },
          required: true
        }
      ],
      transaction
    })

    let updatedCount = 0
    const productIdsToRefresh = new Set()

    for (const sku of skus) {
      const targetAmount = priceMap.get(sku.exchange_item_id)
      if (targetAmount === undefined) continue

      const newAmount = Math.max(1, Math.round(targetAmount))

      for (const price of sku.channelPrices) {
        const oldAmount = Number(price.cost_amount)
        if (newAmount === oldAmount) continue

        await price.update({ cost_amount: newAmount }, { transaction })
        updatedCount++
        productIdsToRefresh.add(sku.exchange_item_id)

        try {
          await this.models.AdminOperationLog.create(
            {
              operator_id: options.operator_id || null,
              operation_type: 'price_change',
              target_type: 'product',
              target_id: sku.exchange_item_id,
              action: 'batch_set_individual',
              before_data: { cost_amount: oldAmount, sku_id: sku.sku_id },
              after_data: { cost_amount: newAmount, sku_id: sku.sku_id },
              changed_fields: { cost_amount: { from: oldAmount, to: newAmount } },
              reason: '批量逐个设价',
              risk_level: 'medium',
              requires_approval: false,
              approval_status: 'not_required'
            },
            { transaction }
          )
        } catch (logErr) {
          logger.warn('[兑换市场] 价格变动日志记录失败', { error: logErr.message })
        }
      }
    }

    for (const pid of productIdsToRefresh) {
      await this._updateSpuSummary(pid, transaction)
    }

    await BusinessCacheHelper.invalidateExchangeItems('batch_individual_price_set').catch(() => {})

    logger.info('[兑换市场-管理] 批量逐个设价完成', {
      requested: priceMap.size,
      affected: updatedCount
    })
    return { affected_rows: updatedCount }
  }

  /**
   * 批量修改商品分类（C3：批量修改 category_id）
   *
   * @param {number[]} exchangeItemIds - 商品 ID 数组
   * @param {number|null} categoryDefId - 目标分类 ID（null 表示清除分类）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @returns {Promise<Object>} { affected_rows, category_id }
   */
  async batchUpdateCategory(exchangeItemIds, categoryDefId, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AdminService.batchUpdateCategory')

    if (!Array.isArray(exchangeItemIds) || exchangeItemIds.length === 0) {
      throw new BusinessError('商品ID数组不能为空', 'EXCHANGE_NOT_ALLOWED', 400)
    }

    if (categoryDefId !== null) {
      const { Category } = this.models
      const category = await Category.findByPk(categoryDefId, { transaction })
      if (!category) {
        throw new BusinessError(`分类不存在：${categoryDefId}`, 'EXCHANGE_NOT_FOUND', 404)
      }
    }

    logger.info('[兑换市场-管理] 批量修改商品分类', {
      count: exchangeItemIds.length,
      category_id: categoryDefId
    })

    const [affectedRows] = await this.ExchangeItem.update(
      { category_id: categoryDefId, updated_at: BeijingTimeHelper.createDatabaseTime() },
      { where: { exchange_item_id: { [Op.in]: exchangeItemIds } }, transaction }
    )

    await BusinessCacheHelper.invalidateExchangeItems('batch_category_update').catch(() => {})

    logger.info('[兑换市场-管理] 批量修改分类完成', {
      requested: exchangeItemIds.length,
      affected: affectedRows
    })
    return { affected_rows: affectedRows, category_id: categoryDefId }
  }

  /**
   * 批量修改商品稀有度（C3 扩展：批量修改 rarity_code）
   *
   * @param {number[]} exchangeItemIds - 商品 ID 数组
   * @param {string} rarityCode - 目标稀有度代码
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @returns {Promise<Object>} { affected_rows, rarity_code }
   */
  async batchUpdateRarity(exchangeItemIds, rarityCode, options = {}) {
    const transaction = assertAndGetTransaction(options, 'AdminService.batchUpdateRarity')

    if (!Array.isArray(exchangeItemIds) || exchangeItemIds.length === 0) {
      throw new BusinessError('商品ID数组不能为空', 'EXCHANGE_NOT_ALLOWED', 400)
    }

    if (!rarityCode) {
      throw new BusinessError('稀有度代码不能为空', 'EXCHANGE_NOT_ALLOWED', 400)
    }

    const { RarityDef } = this.models
    const rarity = await RarityDef.findOne({ where: { rarity_code: rarityCode }, transaction })
    if (!rarity) {
      throw new BusinessError(`稀有度不存在：${rarityCode}`, 'EXCHANGE_NOT_FOUND', 404)
    }

    logger.info('[兑换市场-管理] 批量修改商品稀有度', {
      count: exchangeItemIds.length,
      rarity_code: rarityCode
    })

    const [affectedRows] = await this.ExchangeItem.update(
      { rarity_code: rarityCode, updated_at: BeijingTimeHelper.createDatabaseTime() },
      { where: { exchange_item_id: { [Op.in]: exchangeItemIds } }, transaction }
    )

    await BusinessCacheHelper.invalidateExchangeItems('batch_rarity_update').catch(() => {})

    logger.info('[兑换市场-管理] 批量修改稀有度完成', {
      requested: exchangeItemIds.length,
      affected: affectedRows
    })
    return { affected_rows: affectedRows, rarity_code: rarityCode }
  }

  /**
   * 查询缺少图片的商品列表（运营排查工具）
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=50] - 每页数量（默认50，一次性查看更多）
   * @returns {Promise<Object>} 缺图商品列表
   */
  async getMissingImageItems(options = {}) {
    const { page = 1, page_size = 50 } = options

    try {
      const offset = (page - 1) * page_size
      const limit = page_size

      const { count, rows } = await this.ExchangeItem.findAndCountAll({
        where: { primary_media_id: null },
        attributes: ['exchange_item_id', 'item_name', 'category_id', 'status', 'space', 'stock'],
        limit,
        offset,
        order: [['exchange_item_id', 'ASC']]
      })

      logger.info('[兑换市场-管理] 查询缺图商品列表', {
        total: count,
        page,
        returned: rows.length
      })

      return {
        items: rows.map(item => item.toJSON()),
        pagination: {
          total: count,
          page,
          page_size,
          total_pages: Math.ceil(count / page_size)
        }
      }
    } catch (error) {
      logger.error('[兑换市场-管理] 查询缺图商品列表失败:', error.message)
      throw error
    }
  }

  /**
   * 更新 SPU 汇总字段（供批量价格操作后刷新）
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

module.exports = BatchOperationService
