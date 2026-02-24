'use strict'

/**
 * @file 市场价格快照每日聚合定时任务
 * @description 每日凌晨执行，从 market_listings + trade_orders 聚合到 market_price_snapshots
 *
 * 执行时机：每日凌晨 01:15
 * Cron 表达式：15 1 * * *
 *
 * @version 1.0.0
 * @date 2026-02-23
 * @module jobs/daily-market-price-snapshot
 */

const { MarketListing, TradeOrder, MarketPriceSnapshot, sequelize } = require('../models')
const { Op, fn, col, literal } = require('sequelize')
const logger = require('../utils/logger').logger
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 市场价格快照聚合任务类
 *
 * @class DailyMarketPriceSnapshot
 */
class DailyMarketPriceSnapshot {
  /**
   * 执行快照聚合任务
   *
   * @param {Object} [options] - 配置
   * @param {string} [options.target_date] - 目标日期（YYYY-MM-DD），默认前一天
   * @returns {Promise<Object>} 聚合结果报告
   */
  static async execute(options = {}) {
    const startTime = Date.now()
    const targetDate = options.target_date || DailyMarketPriceSnapshot._getYesterdayDate()

    logger.info('[MarketPriceSnapshot] 开始市场价格快照聚合', { target_date: targetDate })

    try {
      const [listingSnapshots, tradeSnapshots] = await Promise.all([
        DailyMarketPriceSnapshot._aggregateListings(targetDate),
        DailyMarketPriceSnapshot._aggregateTrades(targetDate)
      ])

      const upsertCount = await DailyMarketPriceSnapshot._upsertSnapshots(
        targetDate,
        listingSnapshots,
        tradeSnapshots
      )

      const elapsed = Date.now() - startTime
      const report = {
        target_date: targetDate,
        listing_groups: listingSnapshots.length,
        trade_groups: tradeSnapshots.length,
        upserted_records: upsertCount,
        elapsed_ms: elapsed,
        status: 'OK'
      }

      logger.info('[MarketPriceSnapshot] 快照聚合完成', report)
      return report
    } catch (error) {
      logger.error('[MarketPriceSnapshot] 快照聚合失败', {
        target_date: targetDate,
        error: error.message,
        stack: error.stack
      })
      return {
        target_date: targetDate,
        status: 'ERROR',
        error: error.message,
        elapsed_ms: Date.now() - startTime
      }
    }
  }

  /**
   * 聚合在售挂牌的价格统计
   *
   * @private
   * @param {string} targetDate - 目标日期（YYYY-MM-DD）
   * @returns {Promise<Array>} 按维度聚合的挂牌统计
   */
  static async _aggregateListings(targetDate) {
    const nextDay = DailyMarketPriceSnapshot._addDays(targetDate, 1)
    /*
     * 物品挂牌优先用 offer_item_category_code，其次回退到 offer_asset_code，
     * 再回退到 'uncategorized_item'，确保不会产生 'unknown' 聚合桶
     */
    const assetCodeExpr =
      "CASE WHEN listing_kind = 'item' THEN COALESCE(offer_item_category_code, offer_asset_code, 'uncategorized_item') ELSE COALESCE(offer_asset_code, 'uncategorized_asset') END"

    const results = await MarketListing.findAll({
      attributes: [
        'listing_kind',
        'price_asset_code',
        [literal(assetCodeExpr), 'asset_code'],
        [fn('COUNT', col('market_listing_id')), 'active_listings'],
        [fn('MIN', col('price_amount')), 'min_price'],
        [fn('MAX', col('price_amount')), 'max_price'],
        [fn('AVG', col('price_amount')), 'avg_price']
      ],
      where: {
        status: 'on_sale',
        created_at: { [Op.lt]: new Date(nextDay) }
      },
      group: ['listing_kind', 'price_asset_code', literal(assetCodeExpr)],
      raw: true
    })

    logger.debug('[MarketPriceSnapshot] 挂牌聚合完成', {
      target_date: targetDate,
      groups: results.length
    })
    return results
  }

  /**
   * 聚合已完成交易订单的成交统计
   *
   * @private
   * @param {string} targetDate - 目标日期（YYYY-MM-DD）
   * @returns {Promise<Array>} 按资产代码聚合的成交统计
   */
  static async _aggregateTrades(targetDate) {
    const dayStart = new Date(targetDate + 'T00:00:00+08:00')
    const dayEnd = new Date(targetDate + 'T23:59:59+08:00')

    const results = await TradeOrder.findAll({
      attributes: [
        'asset_code',
        [fn('COUNT', col('trade_order_id')), 'completed_trades'],
        [fn('SUM', col('gross_amount')), 'total_volume']
      ],
      where: {
        status: 'completed',
        completed_at: { [Op.gte]: dayStart, [Op.lte]: dayEnd }
      },
      group: ['asset_code'],
      raw: true
    })

    logger.debug('[MarketPriceSnapshot] 交易聚合完成', {
      target_date: targetDate,
      groups: results.length
    })
    return results
  }

  /**
   * 合并挂牌和交易数据，UPSERT 到 market_price_snapshots
   *
   * @private
   * @param {string} targetDate - 目标日期
   * @param {Array} listingSnapshots - 挂牌聚合结果
   * @param {Array} tradeSnapshots - 交易聚合结果
   * @returns {Promise<number>} 写入记录数
   */
  static async _upsertSnapshots(targetDate, listingSnapshots, tradeSnapshots) {
    const tradeMap = new Map()
    tradeSnapshots.forEach(t => {
      tradeMap.set(t.asset_code, {
        completed_trades: parseInt(t.completed_trades) || 0,
        total_volume: Number(t.total_volume) || 0
      })
    })

    let upsertCount = 0
    const transaction = await sequelize.transaction()

    try {
      for (const listing of listingSnapshots) {
        const assetCode = listing.asset_code
        const tradeData = tradeMap.get(assetCode) || { completed_trades: 0, total_volume: 0 }

        // eslint-disable-next-line no-await-in-loop -- UPSERT 保证唯一约束
        await MarketPriceSnapshot.upsert(
          {
            snapshot_date: targetDate,
            asset_code: assetCode,
            listing_kind: listing.listing_kind,
            price_asset_code: listing.price_asset_code,
            active_listings: parseInt(listing.active_listings) || 0,
            min_price: listing.min_price ? Number(listing.min_price) : null,
            max_price: listing.max_price ? Number(listing.max_price) : null,
            avg_price: listing.avg_price ? Number(listing.avg_price) : null,
            total_volume: tradeData.total_volume,
            completed_trades: tradeData.completed_trades
          },
          { transaction }
        )

        upsertCount++
        tradeMap.delete(assetCode)
      }

      // 有成交但无在售挂牌的资产（已售罄场景）
      for (const [assetCode, tradeData] of tradeMap.entries()) {
        // eslint-disable-next-line no-await-in-loop -- UPSERT 保证唯一约束
        await MarketPriceSnapshot.upsert(
          {
            snapshot_date: targetDate,
            asset_code: assetCode,
            listing_kind: 'item',
            price_asset_code: 'DIAMOND',
            active_listings: 0,
            min_price: null,
            max_price: null,
            avg_price: null,
            total_volume: tradeData.total_volume,
            completed_trades: tradeData.completed_trades
          },
          { transaction }
        )

        upsertCount++
      }

      await transaction.commit()
      return upsertCount
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }

  /**
   * 获取前一天的日期字符串（北京时间）
   *
   * @private
   * @returns {string} YYYY-MM-DD 格式
   */
  static _getYesterdayDate() {
    const now = BeijingTimeHelper.now ? BeijingTimeHelper.now() : new Date()
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const y = yesterday.getFullYear()
    const m = String(yesterday.getMonth() + 1).padStart(2, '0')
    const d = String(yesterday.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  /**
   * 日期加N天
   *
   * @private
   * @param {string} dateStr - YYYY-MM-DD
   * @param {number} days - 天数
   * @returns {string} YYYY-MM-DD
   */
  static _addDays(dateStr, days) {
    const date = new Date(dateStr)
    date.setDate(date.getDate() + days)
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
}

module.exports = DailyMarketPriceSnapshot
