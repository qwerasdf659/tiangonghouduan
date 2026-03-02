'use strict'

/**
 * @file 广告系统定时任务
 * @description 广告系统相关的定时任务调度
 *
 * 核心业务场景：
 * - 01:00 - 处理每日竞价结算（AdBillingService.processDailyBidding）
 * - 03:00 - 聚合用户标签（AdTagAggregationService.aggregateAllUserTags）
 * - 04:00 - 生成每日报表快照（AdReportService.generateDailySnapshot）
 *
 * 执行时机：
 * - 01:00 - 每日竞价结算
 * - 03:00 - 用户标签聚合
 * - 04:00 - 报表快照生成
 *
 * 环境变量控制：
 * - ENABLE_AD_CRON_JOBS=true 时启用（默认禁用）
 *
 * @version 1.0.0
 * @date 2026-02-18
 * @module jobs/ad-cron-jobs
 */

const cron = require('node-cron')
const logger = require('../utils/logger').logger

// 检查是否启用广告定时任务
const ENABLE_AD_CRON_JOBS = process.env.ENABLE_AD_CRON_JOBS === 'true'

if (!ENABLE_AD_CRON_JOBS) {
  logger.info('[AdCronJobs] 广告定时任务已禁用（设置 ENABLE_AD_CRON_JOBS=true 启用）')
  module.exports = {}
} else {
  /**
   * 广告定时任务调度器
   */
  class AdCronJobs {
    /**
     * 初始化所有定时任务
     * @returns {void}
     */
    static init() {
      logger.info('[AdCronJobs] 初始化广告定时任务')

      // 01:00 - 每日竞价结算
      cron.schedule('0 1 * * *', async () => {
        await AdCronJobs.runDailyBiddingSettlement()
      })

      // 03:00 - 用户标签聚合
      cron.schedule('0 3 * * *', async () => {
        await AdCronJobs.runTagAggregation()
      })

      // 00:30 - DAU 每日统计
      cron.schedule('30 0 * * *', async () => {
        await AdCronJobs.runDailyDauStats()
      })

      // 01:15 - CPM 每日结算
      cron.schedule('15 1 * * *', async () => {
        await AdCronJobs.runDailyCPMSettlement()
      })

      // 01:30 - 动态竞价底价更新
      cron.schedule('30 1 * * *', async () => {
        await AdCronJobs.runDynamicFloorPriceUpdate()
      })

      // 02:00 - 调价触发检查
      cron.schedule('0 2 * * *', async () => {
        await AdCronJobs.runPriceAdjustmentCheck()
      })

      // 04:00 - 报表快照生成
      cron.schedule('0 4 * * *', async () => {
        await AdCronJobs.runDailySnapshot()
      })

      logger.info('[AdCronJobs] 广告定时任务初始化完成')
    }

    /**
     * 执行每日竞价结算任务
     * @returns {Promise<void>} 无返回值
     */
    static async runDailyBiddingSettlement() {
      const startTime = Date.now()
      logger.info('[AdCronJobs] 开始执行每日竞价结算任务')

      try {
        /*
         * 注意：AdBillingService 可能尚未实现，这里先做占位
         * 实际使用时需要导入并调用 AdBillingService.processDailyBidding()
         */
        const AdBillingService = require('../services/AdBillingService')

        if (typeof AdBillingService.processDailyBidding === 'function') {
          const result = await AdBillingService.processDailyBidding()
          const duration = Date.now() - startTime

          logger.info('[AdCronJobs] 每日竞价结算任务完成', {
            result,
            duration_ms: duration
          })
        } else {
          logger.warn('[AdCronJobs] AdBillingService.processDailyBidding 方法不存在，跳过执行')
        }
      } catch (error) {
        const duration = Date.now() - startTime
        logger.error('[AdCronJobs] 每日竞价结算任务失败', {
          error: error.message,
          stack: error.stack,
          duration_ms: duration
        })
      }
    }

    /**
     * 执行用户标签聚合任务
     * @returns {Promise<void>} 无返回值
     */
    static async runTagAggregation() {
      const startTime = Date.now()
      logger.info('[AdCronJobs] 开始执行用户标签聚合任务')

      try {
        const AdTagAggregationService = require('../services/AdTagAggregationService')
        const result = await AdTagAggregationService.aggregateAllUserTags()

        const duration = Date.now() - startTime
        logger.info('[AdCronJobs] 用户标签聚合任务完成', {
          result,
          duration_ms: duration
        })
      } catch (error) {
        const duration = Date.now() - startTime
        logger.error('[AdCronJobs] 用户标签聚合任务失败', {
          error: error.message,
          stack: error.stack,
          duration_ms: duration
        })
      }
    }

    /**
     * 执行每日报表快照生成任务
     * @returns {Promise<void>} 无返回值
     */
    static async runDailySnapshot() {
      const startTime = Date.now()
      logger.info('[AdCronJobs] 开始执行每日报表快照生成任务')

      try {
        const AdReportService = require('../services/AdReportService')
        const result = await AdReportService.generateDailySnapshot()

        const duration = Date.now() - startTime
        logger.info('[AdCronJobs] 每日报表快照生成任务完成', {
          result,
          duration_ms: duration
        })
      } catch (error) {
        const duration = Date.now() - startTime
        logger.error('[AdCronJobs] 每日报表快照生成任务失败', {
          error: error.message,
          stack: error.stack,
          duration_ms: duration
        })
      }
    }

    /**
     * 执行 CPM 每日结算任务
     *
     * @returns {Promise<void>} 无返回值
     */
    static async runDailyCPMSettlement() {
      const startTime = Date.now()
      logger.info('[AdCronJobs] 开始执行 CPM 每日结算')

      try {
        const AdBillingService = require('../services/AdBillingService')
        const result = await AdBillingService.processDailyCPM()
        logger.info('[AdCronJobs] CPM 结算完成', {
          result,
          duration_ms: Date.now() - startTime
        })
      } catch (error) {
        logger.error('[AdCronJobs] CPM 结算失败', {
          error: error.message,
          duration_ms: Date.now() - startTime
        })
      }
    }

    /**
     * 执行 DAU 每日统计任务
     *
     * @returns {Promise<void>} 无返回值
     */
    static async runDailyDauStats() {
      const startTime = Date.now()
      logger.info('[AdCronJobs] 开始执行 DAU 每日统计')

      try {
        const { runDailyDauStats } = require('./daily-dau-stats')
        const result = await runDailyDauStats()
        logger.info('[AdCronJobs] DAU 统计完成', {
          result,
          duration_ms: Date.now() - startTime
        })
      } catch (error) {
        logger.error('[AdCronJobs] DAU 统计失败', {
          error: error.message,
          duration_ms: Date.now() - startTime
        })
      }
    }

    /**
     * 执行调价触发检查任务
     *
     * @returns {Promise<void>} 无返回值
     */
    static async runPriceAdjustmentCheck() {
      const startTime = Date.now()
      logger.info('[AdCronJobs] 开始执行调价触发检查')

      try {
        const { checkPriceAdjustment } = require('./daily-price-adjustment-check')
        const result = await checkPriceAdjustment()
        logger.info('[AdCronJobs] 调价检查完成', {
          result,
          duration_ms: Date.now() - startTime
        })
      } catch (error) {
        logger.error('[AdCronJobs] 调价检查失败', {
          error: error.message,
          duration_ms: Date.now() - startTime
        })
      }
    }

    /**
     * 执行动态竞价底价更新任务
     *
     * @returns {Promise<void>} 无返回值
     */
    static async runDynamicFloorPriceUpdate() {
      const startTime = Date.now()
      logger.info('[AdCronJobs] 开始执行动态底价更新')

      try {
        const AdPricingService = require('../services/AdPricingService')
        const results = await AdPricingService.updateAllDynamicFloorPrices()
        logger.info('[AdCronJobs] 动态底价更新完成', {
          results,
          duration_ms: Date.now() - startTime
        })
      } catch (error) {
        logger.error('[AdCronJobs] 动态底价更新失败', {
          error: error.message,
          duration_ms: Date.now() - startTime
        })
      }
    }
  }

  // 自动初始化（如果启用）
  if (ENABLE_AD_CRON_JOBS) {
    AdCronJobs.init()
  }

  module.exports = AdCronJobs
}
