'use strict'

/**
 * @file 管理员通知自动清理定时任务
 * @description 每日凌晨 3:00 清理过期和已读超过30天的管理员通知
 *
 * 清理策略（D4 决策：30天自动清理）：
 * - 已设置 expires_at 且已过期的通知 → 物理删除
 * - 已读超过 30 天的通知 → 物理删除
 * - 未读通知 → 不清理（确保管理员能看到历史告警）
 *
 * 环境变量控制：
 * - ENABLE_NOTIFICATION_CLEANUP=true 时启用（默认禁用）
 *
 * @version 1.0.0
 * @date 2026-03-01
 * @module jobs/daily-notification-cleanup
 */

const cron = require('node-cron')
const logger = require('../utils/logger').logger

const ENABLE_NOTIFICATION_CLEANUP = process.env.ENABLE_NOTIFICATION_CLEANUP === 'true'

if (!ENABLE_NOTIFICATION_CLEANUP) {
  logger.info(
    '[NotificationCleanup] 通知清理定时任务已禁用（设置 ENABLE_NOTIFICATION_CLEANUP=true 启用）'
  )
  module.exports = {}
} else {
  /**
   * 管理员通知清理定时任务
   * 每日凌晨 3:00 清理过期和已读超过30天的通知
   */
  class NotificationCleanupJob {
    /**
     * 初始化定时任务：每日凌晨 3:00 执行
     * @returns {void}
     */
    static init() {
      logger.info('[NotificationCleanup] 初始化管理员通知清理定时任务')

      cron.schedule('0 3 * * *', async () => {
        await NotificationCleanupJob.run()
      })

      logger.info('[NotificationCleanup] 定时任务已注册（每日 03:00 执行，保留30天）')
    }

    /**
     * 执行清理逻辑
     * @returns {Promise<void>} 无返回值
     */
    static async run() {
      const startTime = Date.now()
      logger.info('[NotificationCleanup] 开始清理过期管理员通知')

      try {
        const { AdminNotification } = require('../models')
        const deletedCount = await AdminNotification.cleanupExpired(30)

        const elapsed = Date.now() - startTime
        logger.info('[NotificationCleanup] 通知清理完成', {
          deleted_count: deletedCount,
          retention_days: 30,
          elapsed_ms: elapsed
        })
      } catch (error) {
        logger.error('[NotificationCleanup] 通知清理失败', {
          error: error.message,
          stack: error.stack
        })
      }
    }
  }

  NotificationCleanupJob.init()
  module.exports = NotificationCleanupJob
}
