'use strict'

/**
 * @file 内容/广告计划过期自动清理定时任务
 * @description 每小时扫描 ad_campaigns 表，自动将已过期的计划标记为 completed
 *
 * 业务场景：
 * - 所有类型的 campaign（commercial/operational/system）统一通过 end_date 判断过期
 * - end_date < 当前日期 且 status='active' → 自动标记为 status='completed'
 *
 * 双保险架构（阿里/美团模式）：
 * - 第一层：查询时通过 AdBiddingService 的 start_date/end_date 过滤（实时准确）
 * - 第二层：定时任务自动清理（本文件，保证管理后台状态一致）
 *
 * 环境变量控制：
 * - ENABLE_CONTENT_CRON_JOBS=true 时启用（默认禁用）
 *
 * @version 2.0.0
 * @date 2026-02-22
 * @module jobs/content-cron-jobs
 */

const cron = require('node-cron')
const logger = require('../utils/logger').logger

const ENABLE_CONTENT_CRON_JOBS = process.env.ENABLE_CONTENT_CRON_JOBS === 'true'

if (!ENABLE_CONTENT_CRON_JOBS) {
  logger.info(
    '[ContentCronJobs] 内容过期清理定时任务已禁用（设置 ENABLE_CONTENT_CRON_JOBS=true 启用）'
  )
  module.exports = {}
} else {
  /**
   * 内容过期清理定时任务调度器
   */
  class ContentCronJobs {
    /**
     * 初始化所有定时任务
     * @returns {void} 无返回值
     */
    static init() {
      logger.info('[ContentCronJobs] 初始化内容过期清理定时任务')

      cron.schedule('0 * * * *', async () => {
        await ContentCronJobs.runExpiredContentCleanup()
      })

      logger.info('[ContentCronJobs] 内容过期清理定时任务初始化完成（每小时执行）')
    }

    /**
     * 执行过期内容清理任务
     * 扫描 ad_campaigns 表，将已过期但仍为 active 的计划标记为 completed
     * @returns {Promise<void>} 无返回值
     */
    static async runExpiredContentCleanup() {
      const startTime = Date.now()
      logger.info('[ContentCronJobs] 开始执行过期内容清理任务')

      try {
        const { Op } = require('sequelize')
        const { AdCampaign } = require('../models')
        const BeijingTimeHelper = require('../utils/timeHelper')
        const today = BeijingTimeHelper.createDatabaseTime()

        // 统一清理：end_date < 当前日期 且 status='active'
        const [completedCount] = await AdCampaign.update(
          { status: 'completed' },
          {
            where: {
              status: 'active',
              end_date: {
                [Op.not]: null,
                [Op.lt]: today
              }
            }
          }
        )

        const duration = Date.now() - startTime

        if (completedCount > 0) {
          logger.info('[ContentCronJobs] 过期内容清理完成', {
            completed_campaigns: completedCount,
            duration_ms: duration
          })
        } else {
          logger.debug('[ContentCronJobs] 无过期内容需要清理', { duration_ms: duration })
        }
      } catch (error) {
        const duration = Date.now() - startTime
        logger.error('[ContentCronJobs] 过期内容清理任务失败', {
          error: error.message,
          stack: error.stack,
          duration_ms: duration
        })
      }
    }
  }

  ContentCronJobs.init()
  module.exports = ContentCronJobs
}
