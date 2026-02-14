/* eslint-disable no-await-in-loop -- 逐条结算需要独立事务，确保每条竞价独立回滚 */

/**
 * 竞价定时结算任务
 *
 * 职责（每分钟执行，cron: '* * * * *'，决策6）：
 * - 阶段A：pending → active 自动激活（到达 start_time，决策15）
 * - 阶段B：active → ended 到期结算 / 流拍（决策13/16）
 *   - 有出价：结算（中标者扣除冻结 + 入背包 + 库存扣减，落选者解冻）
 *   - 无出价：流拍（标记 no_bid，不做任何资产/库存操作）
 *   - 结算失败：标记 settlement_failed，不阻塞其他竞价
 *
 * 执行策略：
 * - 每次最多处理 10 条到期竞价（防止单次任务过重）
 * - 逐条在独立事务中处理（一条失败不影响其他）
 * - 使用 TransactionManager.execute() 管理事务边界
 *
 * @module jobs/bid-settlement-job
 * @created 2026-02-16（臻选空间/幸运空间/竞价功能）
 */

'use strict'

const { BidProduct, Op } = require('../models')
const TransactionManager = require('../utils/TransactionManager')
const logger = require('../utils/logger')

/**
 * 竞价结算定时任务类
 *
 * @class BidSettlementJob
 */
class BidSettlementJob {
  /** 每次最多处理的到期竞价数量 */
  static MAX_BATCH_SIZE = 10

  /**
   * 执行竞价定时任务（主入口）
   *
   * @returns {Promise<Object>} 执行结果统计
   */
  static async execute() {
    const startTime = Date.now()
    const stats = {
      activated: 0,
      settled: 0,
      no_bid: 0,
      settlement_failed: 0,
      errors: []
    }

    try {
      // ====== 阶段 A：pending → active 自动激活（决策15）======
      const activatedCount = await BidSettlementJob._activatePendingBids()
      stats.activated = activatedCount

      // ====== 阶段 B：到期竞价结算 / 流拍 ======
      const settlementResult = await BidSettlementJob._settleExpiredBids()
      stats.settled = settlementResult.settled
      stats.no_bid = settlementResult.no_bid
      stats.settlement_failed = settlementResult.failed
      stats.errors = settlementResult.errors

      const duration = Date.now() - startTime

      // 仅在有实际操作时记录日志（避免每分钟空日志）
      if (
        stats.activated > 0 ||
        stats.settled > 0 ||
        stats.no_bid > 0 ||
        stats.settlement_failed > 0
      ) {
        logger.info('[竞价定时任务] 执行完成', {
          duration_ms: duration,
          ...stats
        })
      }

      return stats
    } catch (error) {
      logger.error('[竞价定时任务] 执行异常', {
        error: error.message,
        duration_ms: Date.now() - startTime
      })
      throw error
    }
  }

  /**
   * 阶段 A：自动激活到达开始时间的 pending 竞价
   *
   * @returns {Promise<number>} 激活数量
   * @private
   */
  static async _activatePendingBids() {
    try {
      const [affectedRows] = await BidProduct.update(
        { status: 'active' },
        {
          where: {
            status: 'pending',
            start_time: { [Op.lte]: new Date() }
          }
        }
      )

      if (affectedRows > 0) {
        logger.info('[竞价定时任务] 阶段A：自动激活竞价', { count: affectedRows })
      }

      return affectedRows
    } catch (error) {
      logger.error('[竞价定时任务] 阶段A激活失败', { error: error.message })
      return 0
    }
  }

  /**
   * 阶段 B：结算到期的 active 竞价
   *
   * @returns {Promise<Object>} 结算结果统计
   * @private
   */
  static async _settleExpiredBids() {
    const result = { settled: 0, no_bid: 0, failed: 0, errors: [] }

    try {
      // 查询到期的 active 竞价（每次最多处理 MAX_BATCH_SIZE 条）
      const expiredBids = await BidProduct.findAll({
        where: {
          status: 'active',
          end_time: { [Op.lte]: new Date() }
        },
        limit: BidSettlementJob.MAX_BATCH_SIZE,
        order: [['end_time', 'ASC']]
      })

      if (expiredBids.length === 0) {
        return result
      }

      logger.info('[竞价定时任务] 阶段B：发现到期竞价', { count: expiredBids.length })

      // 逐条在独立事务中处理
      for (const bidProduct of expiredBids) {
        try {
          // 获取 BidService（通过 require 而非 ServiceManager，因为定时任务不在请求上下文中）
          const { BidService: BidServiceClass } = require('../services/exchange')
          const models = require('../models')
          const bidService = new BidServiceClass(models)

          const settleResult = await TransactionManager.execute(async transaction => {
            return await bidService.settleBidProduct(bidProduct.bid_product_id, { transaction })
          })

          if (settleResult.status === 'no_bid') {
            result.no_bid++
          } else if (settleResult.status === 'settled') {
            result.settled++
          }
        } catch (error) {
          result.failed++
          result.errors.push({
            bid_product_id: bidProduct.bid_product_id,
            error: error.message
          })

          // 标记为结算失败（不在事务内，直接更新）
          try {
            await bidProduct.update({ status: 'settlement_failed' })
          } catch (updateError) {
            logger.error('[竞价定时任务] 标记结算失败状态时出错', {
              bid_product_id: bidProduct.bid_product_id,
              error: updateError.message
            })
          }

          logger.error('[竞价定时任务] 结算失败', {
            bid_product_id: bidProduct.bid_product_id,
            error: error.message
          })
        }
      }

      return result
    } catch (error) {
      logger.error('[竞价定时任务] 阶段B查询失败', { error: error.message })
      return result
    }
  }
}

module.exports = BidSettlementJob
