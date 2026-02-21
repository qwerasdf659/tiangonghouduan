'use strict'

/**
 * @file 内容过期自动清理定时任务
 * @description 每小时扫描弹窗Banner、轮播图、系统公告，自动将已过期的内容标记为停用
 *
 * 业务场景：
 * - 弹窗Banner（popup_banners）：end_time 已过但 is_active=1 → 自动标记为 is_active=0
 * - 轮播图（carousel_items）：end_time 已过但 is_active=1 → 自动标记为 is_active=0
 * - 系统公告（system_announcements）：expires_at 已过但 is_active=1 → 自动标记为 is_active=0
 *
 * 双保险架构（阿里/美团模式）：
 * - 第一层：查询时过滤（已有，实时准确）
 * - 第二层：定时任务自动清理（本文件，保证管理后台状态一致）
 *
 * 环境变量控制：
 * - ENABLE_CONTENT_CRON_JOBS=true 时启用（默认禁用）
 *
 * @version 1.0.0
 * @date 2026-02-21
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

      // 每小时整点执行过期内容清理
      cron.schedule('0 * * * *', async () => {
        await ContentCronJobs.runExpiredContentCleanup()
      })

      logger.info('[ContentCronJobs] 内容过期清理定时任务初始化完成（每小时执行）')
    }

    /**
     * 执行过期内容清理任务
     * 扫描三张内容表，将已过期但仍标记为活跃的记录自动停用
     * @returns {Promise<void>} 无返回值
     */
    static async runExpiredContentCleanup() {
      const startTime = Date.now()
      logger.info('[ContentCronJobs] 开始执行过期内容清理任务')

      const results = {
        popup_banners: 0,
        carousel_items: 0,
        system_announcements: 0
      }

      try {
        const { Op } = require('sequelize')
        const { PopupBanner, CarouselItem, SystemAnnouncement } = require('../models')
        const now = new Date()

        // 1. 清理过期弹窗Banner：end_time < 当前时间 且 is_active=1
        const [bannerCount] = await PopupBanner.update(
          { is_active: false },
          {
            where: {
              is_active: true,
              end_time: { [Op.lt]: now }
            }
          }
        )
        results.popup_banners = bannerCount

        // 2. 清理过期轮播图：end_time < 当前时间 且 is_active=1
        const [carouselCount] = await CarouselItem.update(
          { is_active: false },
          {
            where: {
              is_active: true,
              end_time: { [Op.lt]: now }
            }
          }
        )
        results.carousel_items = carouselCount

        // 3. 清理过期公告：expires_at < 当前时间 且 is_active=1（expires_at 为 null 的不处理，表示永不过期）
        const [announcementCount] = await SystemAnnouncement.update(
          { is_active: false },
          {
            where: {
              is_active: true,
              expires_at: {
                [Op.not]: null,
                [Op.lt]: now
              }
            }
          }
        )
        results.system_announcements = announcementCount

        const duration = Date.now() - startTime
        const totalCleaned = bannerCount + carouselCount + announcementCount

        if (totalCleaned > 0) {
          logger.info('[ContentCronJobs] 过期内容清理完成', {
            results,
            total_cleaned: totalCleaned,
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
