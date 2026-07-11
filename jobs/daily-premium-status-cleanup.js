/**
 * 每日高级空间状态清理任务（原定时任务6）
 *
 * 业务用途：自动清理已过期的高级空间状态，更新is_unlocked为false，发送过期通知
 *
 * 功能：
 * 1. 批量更新过期状态（is_unlocked: true → false）
 * 2. 发送过期通知给用户
 * 3. 记录清理日志
 *
 * ⚠️ 关键字段说明：
 * - UserPremiumStatus表没有status字段，使用is_unlocked字段
 * - is_unlocked: true=已解锁且有效，false=未解锁或已过期
 *
 * 调度频率：0 3 * * *（每天凌晨3点，由 scripts/maintenance/scheduled_tasks.js 注册）
 *
 * 创建时间：2025-11-09
 * 任务体自 scripts/maintenance/scheduled_tasks.js 原样搬移（技术债务方案 7.4-1，2026-07-11）
 */

const logger = require('../utils/logger')
const { UserPremiumStatus, sequelize } = require('../models')
const { Op } = sequelize.Sequelize
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 每日高级空间状态清理任务类
 *
 * @class DailyPremiumStatusCleanup
 * @description 批量清理过期高级空间状态并通知用户
 */
class DailyPremiumStatusCleanup {
  /**
   * 执行过期状态清理
   *
   * @returns {Promise<void>} 执行完成
   */
  static async execute() {
    logger.info('[定时任务] 开始清理过期的高级空间状态...')

    const now = new Date()

    // 批量更新过期状态
    const [updatedCount] = await UserPremiumStatus.update(
      { is_unlocked: false },
      {
        where: {
          is_unlocked: true,
          expires_at: {
            [Op.lt]: now
          }
        }
      }
    )

    if (updatedCount > 0) {
      logger.info(`[定时任务] 清理完成：${updatedCount}个过期高级空间状态已更新`)

      // 查询被更新的用户ID，发送过期通知
      const expiredUsers = await UserPremiumStatus.findAll({
        where: {
          is_unlocked: false,
          expires_at: {
            [Op.lt]: now,
            [Op.gt]: new Date(now.getTime() - 24 * 60 * 60 * 1000) // 最近24小时过期的
          }
        },
        attributes: ['user_id', 'expires_at', 'total_unlock_count']
      })

      // P1-9：通过 ServiceManager 获取 NotificationService（用于发送通知）
      const serviceManager = require('../services/index')
      if (!serviceManager._initialized) {
        await serviceManager.initialize()
      }
      const NotificationService = serviceManager.getService('notification')

      // 发送过期通知
      let notifiedCount = 0
      for (const expired of expiredUsers) {
        try {
          await NotificationService.notifyPremiumExpired(expired.user_id, {
            expired_at: BeijingTimeHelper.formatForAPI(expired.expires_at).iso,
            total_unlock_count: expired.total_unlock_count
          })
          notifiedCount++
        } catch (error) {
          logger.error(`[定时任务] 发送过期通知失败 (user_id: ${expired.user_id})`, {
            error: error.message
          })
        }
      }

      logger.info(`[定时任务] 过期通知发送完成：${notifiedCount}/${expiredUsers.length}`)
    } else {
      logger.info('[定时任务] 清理完成：无过期高级空间需要清理')
    }
  }
}

module.exports = DailyPremiumStatusCleanup
