/**
 * @file 统一商品中心 — 兑换渠道定价服务
 * @description 管理 SKU 在各材料资产下的兑换价格与上下架窗口
 */

'use strict'

const { Transaction } = require('sequelize')
const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const BusinessError = require('../../utils/BusinessError')
const { logger } = require('../../utils/logger')
const BeijingTimeHelper = require('../../utils/timeHelper')

/**
 * 兑换渠道定价服务（SKU × 材料资产）
 */
class ExchangeChannelPriceService {
  /**
   * @param {Object} models - Sequelize 模型集合
   */
  constructor(models) {
    this.models = models
    this.ExchangeChannelPrice = models.ExchangeChannelPrice
    this.ExchangeItemSku = models.ExchangeItemSku
  }

  /**
   * 解析可选时间字段
   *
   * @param {Date|string|null|undefined} v - 原始值
   * @param {string} fieldName - 字段名（用于错误信息）
   * @returns {Date|null}
   */
  _parseOptionalDate(v, fieldName) {
    if (v === undefined || v === null || v === '') {
      return null
    }
    const d = v instanceof Date ? v : new Date(v)
    if (Number.isNaN(d.getTime())) {
      throw new BusinessError(`${fieldName} 时间格式无效`, 'PRODUCT_CENTER_INVALID_DATE', 400, {
        field: fieldName
      })
    }
    return d
  }

  /**
   * 查询某 SKU 下全部渠道定价
   *
   * @param {number|string} skuId - SKU ID
   * @returns {Promise<Array>}
   */
  async getSkuPrices(skuId) {
    const sid = Number(skuId)
    if (Number.isNaN(sid)) {
      throw new BusinessError('sku_id 无效', 'PRODUCT_CENTER_INVALID_SKU_ID', 400)
    }

    const rows = await this.ExchangeChannelPrice.findAll({
      where: { sku_id: sid },
      order: [
        ['cost_asset_code', 'ASC'],
        ['id', 'ASC']
      ]
    })

    return rows.map(r => r.get({ plain: true }))
  }

  /**
   * 按 (sku_id, cost_asset_code) 创建或更新单条定价
   *
   * @param {number|string} skuId - SKU ID
   * @param {Object} data - 定价字段
   * @param {string} data.cost_asset_code - 材料资产代码
   * @param {number|string} data.cost_amount - 所需数量
   * @param {number|string} [data.original_amount] - 划线价
   * @param {boolean} [data.is_enabled]
   * @param {Date|string|null} [data.publish_at]
   * @param {Date|string|null} [data.unpublish_at]
   * @param {Object} [options={}]
   * @returns {Promise<Object>}
   */
  async setSkuPrice(skuId, data, options = {}) {
    const transaction = assertAndGetTransaction(options, 'ExchangeChannelPriceService.setSkuPrice')
    const sid = Number(skuId)
    if (Number.isNaN(sid)) {
      throw new BusinessError('sku_id 无效', 'PRODUCT_CENTER_INVALID_SKU_ID', 400)
    }

    const sku = await this.ExchangeItemSku.findByPk(sid, { transaction })
    if (!sku) {
      throw new BusinessError('SKU 不存在', 'PRODUCT_CENTER_SKU_NOT_FOUND', 404, { sku_id: sid })
    }

    const payload = data || {}
    const assetCode = payload.cost_asset_code != null ? String(payload.cost_asset_code).trim() : ''
    if (!assetCode) {
      throw new BusinessError('cost_asset_code 不能为空', 'PRODUCT_CENTER_COST_ASSET_REQUIRED', 400)
    }

    const costAmount = Number(payload.cost_amount)
    if (!Number.isFinite(costAmount) || costAmount < 0) {
      throw new BusinessError('cost_amount 无效', 'PRODUCT_CENTER_INVALID_COST_AMOUNT', 400)
    }

    let originalAmount = null
    if (
      payload.original_amount !== undefined &&
      payload.original_amount !== null &&
      payload.original_amount !== ''
    ) {
      const oa = Number(payload.original_amount)
      if (!Number.isFinite(oa) || oa < 0) {
        throw new BusinessError(
          'original_amount 无效',
          'PRODUCT_CENTER_INVALID_ORIGINAL_AMOUNT',
          400
        )
      }
      originalAmount = oa
    }

    const publishAt = this._parseOptionalDate(payload.publish_at, 'publish_at')
    const unpublishAt = this._parseOptionalDate(payload.unpublish_at, 'unpublish_at')
    if (publishAt && unpublishAt && publishAt >= unpublishAt) {
      throw new BusinessError(
        'publish_at 必须早于 unpublish_at',
        'PRODUCT_CENTER_INVALID_PUBLISH_WINDOW',
        400
      )
    }

    const isEnabled = payload.is_enabled === undefined ? true : Boolean(payload.is_enabled)

    const existing = await this.ExchangeChannelPrice.findOne({
      where: { sku_id: sid, cost_asset_code: assetCode },
      transaction,
      lock: Transaction.LOCK.UPDATE
    })

    if (existing) {
      await existing.update(
        {
          cost_amount: costAmount,
          original_amount: originalAmount,
          is_enabled: isEnabled,
          publish_at: publishAt,
          unpublish_at: unpublishAt
        },
        { transaction }
      )
      logger.info('ExchangeChannelPriceService.setSkuPrice', {
        action: 'update',
        id: existing.id,
        sku_id: sid,
        cost_asset_code: assetCode,
        ts: BeijingTimeHelper.now()
      })
      return existing.reload({ transaction }).then(r => r.get({ plain: true }))
    }

    const created = await this.ExchangeChannelPrice.create(
      {
        sku_id: sid,
        cost_asset_code: assetCode,
        cost_amount: costAmount,
        original_amount: originalAmount,
        is_enabled: isEnabled,
        publish_at: publishAt,
        unpublish_at: unpublishAt
      },
      { transaction }
    )

    logger.info('ExchangeChannelPriceService.setSkuPrice', {
      action: 'create',
      id: created.id,
      sku_id: sid,
      cost_asset_code: assetCode,
      ts: BeijingTimeHelper.now()
    })

    return created.get({ plain: true })
  }

  /**
   * 硬删除单条渠道定价
   *
   * @param {number|string} priceId - exchange_channel_prices.id
   * @param {Object} [options={}]
   * @returns {Promise<void>}
   */
  async deleteSkuPrice(priceId, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'ExchangeChannelPriceService.deleteSkuPrice'
    )
    const pid = Number(priceId)
    if (Number.isNaN(pid)) {
      throw new BusinessError('price_id 无效', 'PRODUCT_CENTER_INVALID_PRICE_ID', 400)
    }

    const row = await this.ExchangeChannelPrice.findByPk(pid, { transaction })
    if (!row) {
      throw new BusinessError('渠道定价不存在', 'PRODUCT_CENTER_EXCHANGE_PRICE_NOT_FOUND', 404, {
        price_id: pid
      })
    }

    await row.destroy({ transaction })

    logger.info('ExchangeChannelPriceService.deleteSkuPrice', {
      price_id: pid,
      sku_id: row.sku_id,
      ts: BeijingTimeHelper.now()
    })
  }

  /**
   * 获取当前「生效中」的定价（启用 + 发布窗口内）
   *
   * @param {number|string} skuId - SKU ID
   * @param {string} assetCode - 材料资产代码
   * @returns {Promise<Object|null>}
   */
  async getActivePrice(skuId, assetCode) {
    const sid = Number(skuId)
    if (Number.isNaN(sid)) {
      throw new BusinessError('sku_id 无效', 'PRODUCT_CENTER_INVALID_SKU_ID', 400)
    }
    if (assetCode === undefined || assetCode === null || String(assetCode).trim() === '') {
      throw new BusinessError('asset_code 不能为空', 'PRODUCT_CENTER_COST_ASSET_REQUIRED', 400)
    }

    const code = String(assetCode).trim()
    const row = await this.ExchangeChannelPrice.findOne({
      where: {
        sku_id: sid,
        cost_asset_code: code,
        is_enabled: true
      }
    })

    if (!row) {
      return null
    }

    const now = BeijingTimeHelper.nowDate()
    if (row.publish_at && new Date(row.publish_at) > now) {
      return null
    }
    if (row.unpublish_at && new Date(row.unpublish_at) <= now) {
      return null
    }

    return row.get({ plain: true })
  }

  /**
   * 批量替换某 SKU 下全部渠道定价
   *
   * @param {number|string} skuId - SKU ID
   * @param {Array<Object>} prices - 定价行列表
   * @param {Object} [options={}]
   * @returns {Promise<Array>} 新建记录 plain 列表
   */
  async bulkSetPrices(skuId, prices, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'ExchangeChannelPriceService.bulkSetPrices'
    )
    const sid = Number(skuId)
    if (Number.isNaN(sid)) {
      throw new BusinessError('sku_id 无效', 'PRODUCT_CENTER_INVALID_SKU_ID', 400)
    }

    const sku = await this.ExchangeItemSku.findByPk(sid, { transaction })
    if (!sku) {
      throw new BusinessError('SKU 不存在', 'PRODUCT_CENTER_SKU_NOT_FOUND', 404, { sku_id: sid })
    }

    const list = Array.isArray(prices) ? prices : []
    const seen = new Set()

    for (const raw of list) {
      const p = raw || {}
      const ac = p.cost_asset_code != null ? String(p.cost_asset_code).trim() : ''
      if (!ac) {
        throw new BusinessError(
          'cost_asset_code 不能为空',
          'PRODUCT_CENTER_COST_ASSET_REQUIRED',
          400
        )
      }
      if (seen.has(ac)) {
        throw new BusinessError(
          '同一 SKU 下 cost_asset_code 重复',
          'PRODUCT_CENTER_DUPLICATE_COST_ASSET',
          400,
          {
            cost_asset_code: ac
          }
        )
      }
      seen.add(ac)

      const costAmount = Number(p.cost_amount)
      if (!Number.isFinite(costAmount) || costAmount < 0) {
        throw new BusinessError('cost_amount 无效', 'PRODUCT_CENTER_INVALID_COST_AMOUNT', 400, {
          cost_asset_code: ac
        })
      }

      if (
        p.original_amount !== undefined &&
        p.original_amount !== null &&
        p.original_amount !== ''
      ) {
        const oa = Number(p.original_amount)
        if (!Number.isFinite(oa) || oa < 0) {
          throw new BusinessError(
            'original_amount 无效',
            'PRODUCT_CENTER_INVALID_ORIGINAL_AMOUNT',
            400,
            {
              cost_asset_code: ac
            }
          )
        }
      }

      const pub = this._parseOptionalDate(p.publish_at, 'publish_at')
      const unpub = this._parseOptionalDate(p.unpublish_at, 'unpublish_at')
      if (pub && unpub && pub >= unpub) {
        throw new BusinessError(
          'publish_at 必须早于 unpublish_at',
          'PRODUCT_CENTER_INVALID_PUBLISH_WINDOW',
          400,
          {
            cost_asset_code: ac
          }
        )
      }
    }

    await this.ExchangeChannelPrice.destroy({
      where: { sku_id: sid },
      transaction
    })

    if (list.length === 0) {
      logger.info('ExchangeChannelPriceService.bulkSetPrices', {
        sku_id: sid,
        inserted: 0,
        ts: BeijingTimeHelper.now()
      })
      return []
    }

    const rows = await this.ExchangeChannelPrice.bulkCreate(
      list.map(p => {
        const ac = String(p.cost_asset_code).trim()
        let originalAmount = null
        if (
          p.original_amount !== undefined &&
          p.original_amount !== null &&
          p.original_amount !== ''
        ) {
          originalAmount = Number(p.original_amount)
        }
        return {
          sku_id: sid,
          cost_asset_code: ac,
          cost_amount: Number(p.cost_amount),
          original_amount: originalAmount,
          is_enabled: p.is_enabled === undefined ? true : Boolean(p.is_enabled),
          publish_at: this._parseOptionalDate(p.publish_at, 'publish_at'),
          unpublish_at: this._parseOptionalDate(p.unpublish_at, 'unpublish_at')
        }
      }),
      { transaction }
    )

    logger.info('ExchangeChannelPriceService.bulkSetPrices', {
      sku_id: sid,
      inserted: rows.length,
      ts: BeijingTimeHelper.now()
    })

    return rows.map(r => r.get({ plain: true }))
  }
}

module.exports = ExchangeChannelPriceService
