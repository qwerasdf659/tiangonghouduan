/**
 * 每小时高级空间过期提醒任务（原定时任务5）
 *
 * 业务用途：提前通知用户高级空间即将过期（距离过期<2小时），提升用户体验
 *
 * 功能：
 * 1. 查询即将过期的高级空间（expires_at < 当前时间+2小时 AND expires_at > 当前时间）
 * 2. 通过NotificationService发送提醒通知
 * 3. 记录提醒日志
 *
 * ⚠️ 关键字段说明：
 * - UserPremiumStatus表没有status字段，使用is_unlocked字段
 * - is_unlocked: true=已解锁且有效，false=未解锁或已过期
 *
 * 调度频率：0 * * * *（每小时的0分，由 scripts/maintenance/scheduled_tasks.js 注册）
 *
 * 创建时间：2025-11-09
 * 任务体自 scripts/maintenance/scheduled_tasks.js 原样搬移（技术债务方案 7.4-1，2026-07-11）
 */

const logger = require('../utils/logger')
const { UserPremiumStatus, sequelize } = require('../models')
const { Op } = sequelize.Sequelize
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 每小时高级空间过期提醒任务类
 *
 * @class HourlyPremiumExpiryReminder
 * @description 检查即将过期的高级空间并发送提醒通知
 */
class HourlyPremiumExpiryReminder {
  /**
   * 执行过期提醒检查
   *
   * @returns {Promise<void>} 执行完成
   */
  static async execute() {
    // P1-9：通过 ServiceManager 获取 NotificationService
    const serviceManager = require('../services/index')
    if (!serviceManager._initialized) {
      await serviceManager.initialize()
    }
    const NotificationService = serviceManager.getService('notification')

    logger.info('[定时任务] 开始检查即将过期的高级空间...')

    const now = new Date()
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000)

    // 查询即将过期的高级空间（距离过期<2小时）
    const expiringStatuses = await UserPremiumStatus.findAll({
      where: {
        is_unlocked: true,
        expires_at: {
          [Op.gt]: now,
          [Op.lte]: twoHoursLater
        }
      },
      attributes: ['user_id', 'expires_at', 'total_unlock_count']
    })

    if (expiringStatuses.length > 0) {
      logger.info(`[定时任务] 发现${expiringStatuses.length}个即将过期的高级空间`)

      // 发送提醒通知
      let successCount = 0
      for (const status of expiringStatuses) {
        try {
          const expiresAt = new Date(status.expires_at)
          const remainingMs = expiresAt - now
          const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60))
          const remainingMinutes = Math.ceil(remainingMs / (1000 * 60))

          await NotificationService.notifyPremiumExpiringSoon(status.user_id, {
            expires_at: BeijingTimeHelper.formatForAPI(status.expires_at).iso,
            remaining_hours: remainingHours,
            remaining_minutes: remainingMinutes
          })

          successCount++
        } catch (error) {
          logger.error(`[定时任务] 发送过期提醒失败 (user_id: ${status.user_id})`, {
            error: error.message
          })
        }
      }

      logger.info(`[定时任务] 高级空间过期提醒发送完成：${successCount}/${expiringStatuses.length}`)
    } else {
      logger.info('[定时任务] 无即将过期的高级空间')
    }
  }
}

module.exports = HourlyPremiumExpiryReminder
