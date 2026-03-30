/* eslint-disable no-await-in-loop -- 逐条结算需要独立事务，确保每条拍卖独立回滚 */

/**
 * C2C 拍卖定时结算任务
 *
 * 职责（每分钟执行，cron: '* * * * *'）：
 * - 阶段A：pending → active 自动激活（到达 start_time）
 * - 阶段B：active → ended 到期结算 / 流拍
 *   - 有出价：结算（中标者扣除冻结 + 物品转移 + 手续费 + 卖方入账，落选者解冻）
 *   - 无出价：流拍（释放物品锁定，标记 no_bid）
 *   - 结算失败：标记 settlement_failed，retry_count+1，不阻塞其他拍卖
 * - 阶段C：settlement_failed 重试（决策7：最多3次，超限推送管理员告警）
 *
 * 执行策略：
 * - 每次最多处理 10 条到期拍卖（防止单次任务过重）
 * - 逐条在独立事务中处理（一条失败不影响其他）
 * - 使用 TransactionManager.execute() 管理事务边界
 *
 * 参考 bid-settlement-job.js 模式，换底表 + 增加物品转移/手续费/重试上限
 *
 * @module jobs/auction-settlement-job
 * @created 2026-03-24（C2C用户间竞拍功能）
 * @see docs/C2C竞拍方案.md §9
 */

'use strict'

const { AuctionListing, Op } = require('../models')
const TransactionManager = require('../utils/TransactionManager')
const logger = require('../utils/logger')

/** 结算重试上限（决策7：最多3次） */
const MAX_RETRY_COUNT = 3

class AuctionSettlementJob {
  /** 每次最多处理的到期拍卖数量 */
  static MAX_BATCH_SIZE = 10

  /**
   * 执行拍卖定时任务（主入口）
   * @returns {Promise<Object>} 执行结果统计
   */
  static async execute() {
    const startTime = Date.now()
    const stats = {
      activated: 0,
      settled: 0,
      no_bid: 0,
      settlement_failed: 0,
      retried: 0,
      retry_exhausted: 0,
      errors: []
    }

    try {
      // ====== 阶段 A：pending → active 自动激活 ======
      stats.activated = await AuctionSettlementJob._activatePendingAuctions()

      // ====== 阶段 B：到期拍卖结算 / 流拍 ======
      const settlementResult = await AuctionSettlementJob._settleExpiredAuctions()
      stats.settled = settlementResult.settled
      stats.no_bid = settlementResult.no_bid
      stats.settlement_failed = settlementResult.failed
      stats.errors = settlementResult.errors

      // ====== 阶段 C：settlement_failed 重试（决策7：最多3次） ======
      const retryResult = await AuctionSettlementJob._retryFailedSettlements()
      stats.retried = retryResult.retried
      stats.retry_exhausted = retryResult.exhausted

      const duration = Date.now() - startTime

      const hasActivity =
        stats.activated > 0 ||
        stats.settled > 0 ||
        stats.no_bid > 0 ||
        stats.settlement_failed > 0 ||
        stats.retried > 0 ||
        stats.retry_exhausted > 0

      if (hasActivity) {
        logger.info('[C2C拍卖定时任务] 执行完成', { duration_ms: duration, ...stats })
      }

      return stats
    } catch (error) {
      logger.error('[C2C拍卖定时任务] 执行异常', {
        error: error.message,
        duration_ms: Date.now() - startTime
      })
      throw error
    }
  }

  /**
   * 阶段 A：自动激活到达开始时间的 pending 拍卖
   * @returns {Promise<number>} 激活数量
   * @private
   */
  static async _activatePendingAuctions() {
    try {
      const [affectedRows] = await AuctionListing.update(
        { status: 'active' },
        {
          where: {
            status: 'pending',
            start_time: { [Op.lte]: new Date() }
          }
        }
      )

      if (affectedRows > 0) {
        logger.info('[C2C拍卖定时任务] 阶段A：自动激活拍卖', { count: affectedRows })
      }

      return affectedRows
    } catch (error) {
      logger.error('[C2C拍卖定时任务] 阶段A激活失败', { error: error.message })
      return 0
    }
  }

  /**
   * 发送拍卖结算通知（中标 + 落选 + 卖方，fire-and-forget）
   * @param {Object} settleResult - 结算结果对象
   * @private
   */
  static async _sendSettlementNotifications(settleResult) {
    try {
      const ChatWebSocketService = require('../services/ChatWebSocketService')
      const NotificationService = require('../services/NotificationService')

      const {
        auction_listing_id,
        winner_user_id,
        winning_amount,
        seller_user_id,
        item_name,
        price_asset_code,
        net_amount,
        fee_amount,
        _losers = []
      } = settleResult

      // 通知中标者
      ChatWebSocketService.pushAuctionWon(winner_user_id, {
        auction_listing_id,
        item_name,
        winning_amount,
        price_asset_code
      })

      // 通知卖方（成交）
      ChatWebSocketService.pushAuctionNewBid(seller_user_id, {
        auction_listing_id,
        item_name,
        bid_amount: winning_amount,
        net_amount,
        fee_amount,
        price_asset_code,
        settled: true
      })

      // 通知落选者
      for (const loser of _losers) {
        ChatWebSocketService.pushAuctionLost(loser.user_id, {
          auction_listing_id,
          item_name,
          my_bid_amount: loser.bid_amount,
          winning_amount,
          price_asset_code
        })
      }

      // 站内信通知（复用 B2C notifyBidWon，bid_product_id 传入 auction_listing_id 用于消息引用）
      await NotificationService.notifyBidWon(winner_user_id, {
        bid_product_id: auction_listing_id,
        auction_listing_id,
        item_name,
        winning_amount,
        price_asset_code
      })

      logger.info('[C2C拍卖定时任务] 结算通知发送完成', {
        auction_listing_id,
        winner_notified: true,
        losers_notified: _losers.length
      })
    } catch (err) {
      logger.error('[C2C拍卖定时任务] 发送结算通知失败', { error: err.message })
    }
  }

  /**
   * 阶段 B：结算到期的 active 拍卖
   * @returns {Promise<Object>} 结算结果统计
   * @private
   */
  static async _settleExpiredAuctions() {
    const result = { settled: 0, no_bid: 0, failed: 0, errors: [] }

    try {
      const expiredAuctions = await AuctionListing.findAll({
        where: {
          status: 'active',
          end_time: { [Op.lte]: new Date() }
        },
        limit: AuctionSettlementJob.MAX_BATCH_SIZE,
        order: [['end_time', 'ASC']]
      })

      if (expiredAuctions.length === 0) return result

      logger.info('[C2C拍卖定时任务] 阶段B：发现到期拍卖', { count: expiredAuctions.length })

      for (const auction of expiredAuctions) {
        try {
          const { AuctionService } = require('../services/auction')
          const models = require('../models')
          const auctionService = new AuctionService(models)

          const settleResult = await TransactionManager.execute(async transaction => {
            return await auctionService.settleAuction(auction.auction_listing_id, { transaction })
          })

          if (settleResult.status === 'no_bid') {
            result.no_bid++
          } else if (settleResult.status === 'settled') {
            result.settled++
            AuctionSettlementJob._sendSettlementNotifications(settleResult).catch(() => {})
          }
        } catch (error) {
          result.failed++
          result.errors.push({
            auction_listing_id: auction.auction_listing_id,
            error: error.message
          })

          try {
            await auction.update({
              status: 'settlement_failed',
              retry_count: auction.retry_count + 1
            })
          } catch (updateError) {
            logger.error('[C2C拍卖定时任务] 标记结算失败状态时出错', {
              auction_listing_id: auction.auction_listing_id,
              error: updateError.message
            })
          }

          logger.error('[C2C拍卖定时任务] 结算失败', {
            auction_listing_id: auction.auction_listing_id,
            error: error.message
          })
        }
      }

      return result
    } catch (error) {
      logger.error('[C2C拍卖定时任务] 阶段B查询失败', { error: error.message })
      return result
    }
  }

  /**
   * 阶段 C：重试 settlement_failed 的拍卖（决策7：最多3次，超限推送管理员告警）
   * @returns {Promise<Object>} 重试结果统计
   * @private
   */
  static async _retryFailedSettlements() {
    const result = { retried: 0, exhausted: 0 }

    try {
      const failedAuctions = await AuctionListing.findAll({
        where: {
          status: 'settlement_failed',
          retry_count: { [Op.lt]: MAX_RETRY_COUNT }
        },
        limit: 5,
        order: [['updated_at', 'ASC']]
      })

      for (const auction of failedAuctions) {
        try {
          const { AuctionService } = require('../services/auction')
          const models = require('../models')
          const auctionService = new AuctionService(models)

          await TransactionManager.execute(async transaction => {
            // 先重置状态为 ended 再结算
            await auction.update({ status: 'ended' }, { transaction })
            return await auctionService.settleAuction(auction.auction_listing_id, { transaction })
          })

          result.retried++
          logger.info('[C2C拍卖定时任务] 阶段C：重试结算成功', {
            auction_listing_id: auction.auction_listing_id,
            retry_count: auction.retry_count
          })
        } catch (retryError) {
          const newRetryCount = auction.retry_count + 1
          await auction.update({
            status: 'settlement_failed',
            retry_count: newRetryCount
          })

          if (newRetryCount >= MAX_RETRY_COUNT) {
            result.exhausted++
            logger.error('[C2C拍卖定时任务] 阶段C：重试次数耗尽，推送管理员告警', {
              auction_listing_id: auction.auction_listing_id,
              retry_count: newRetryCount,
              error: retryError.message
            })

            // 推送管理员告警（复用 ChatWebSocketService.broadcastNotificationToAllAdmins）
            try {
              const ChatWebSocketService = require('../services/ChatWebSocketService')
              ChatWebSocketService.broadcastNotificationToAllAdmins({
                type: 'auction_settlement_exhausted',
                title: 'C2C拍卖结算重试耗尽',
                message: `拍卖 #${auction.auction_listing_id} 结算重试 ${MAX_RETRY_COUNT} 次仍失败，需人工处理`,
                auction_listing_id: auction.auction_listing_id,
                error: retryError.message
              })
            } catch (alertError) {
              logger.error('[C2C拍卖定时任务] 推送管理员告警失败', { error: alertError.message })
            }
          }
        }
      }

      return result
    } catch (error) {
      logger.error('[C2C拍卖定时任务] 阶段C查询失败', { error: error.message })
      return result
    }
  }
}

module.exports = AuctionSettlementJob
