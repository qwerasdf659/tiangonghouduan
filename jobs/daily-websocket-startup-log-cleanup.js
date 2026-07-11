/**
 * 每日WebSocket启动日志180天清理任务（原定时任务30）
 *
 * 业务用途（定时任务统一管理改进 2026-01-30）：
 * - 与管理员操作日志统一保留策略（180天）
 * - websocket_startup_logs 表用于监控和审计
 *
 * 清理策略：
 * - 删除 created_at < (当前时间 - 180天) 的记录
 * - 分批删除（每批10000条），避免长事务锁表
 * - 记录清理日志供运维追踪
 *
 * 调度频率：30 3 * * *（每天凌晨3:30，由 scripts/maintenance/scheduled_tasks.js 注册，支持分布式锁；
 * 错开管理员操作日志清理的3:00，避免资源竞争）
 *
 * 创建时间：2026-01-30
 * 任务体自 scripts/maintenance/scheduled_tasks.js cleanupWebSocketStartupLogs 原样搬移（技术债务方案 7.4-1，2026-07-11）
 */

const logger = require('../utils/logger')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 每日WebSocket启动日志清理任务类
 *
 * @class DailyWebSocketStartupLogCleanup
 * @description 分批删除超过保留期限的WebSocket启动日志（websocket_startup_logs）
 */
class DailyWebSocketStartupLogCleanup {
  /**
   * 清理超过指定天数的WebSocket启动日志
   *
   * @param {number} [retentionDays=180] - 保留天数（默认180天）
   * @returns {Promise<Object>} 清理报告（deleted_count/cutoff_date/duration_ms/status）
   */
  static async execute(retentionDays = 180) {
    const startTime = Date.now()
    const { WebSocketStartupLog, sequelize } = require('../models')
    const { Op } = sequelize.Sequelize

    // 计算截止日期（180天前）
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

    logger.info('[WebSocket启动日志清理] 开始执行...', {
      retention_days: retentionDays,
      cutoff_date: BeijingTimeHelper.formatForAPI(cutoffDate).iso
    })

    try {
      // 分批删除，每批最多10000条，避免长事务
      const batchSize = 10000
      let totalDeleted = 0
      let hasMore = true

      while (hasMore) {
        // 使用 destroy 删除满足条件的记录
        const deletedCount = await WebSocketStartupLog.destroy({
          where: {
            created_at: {
              [Op.lt]: cutoffDate
            }
          },
          limit: batchSize
        })

        totalDeleted += deletedCount

        // 如果删除数量小于批次大小，说明没有更多记录了
        if (deletedCount < batchSize) {
          hasMore = false
        } else {
          // 等待一小段时间，避免对数据库造成过大压力
          await new Promise(resolve => {
            setTimeout(resolve, 100)
          })
        }

        logger.info('[WebSocket启动日志清理] 批次完成', {
          batch_deleted: deletedCount,
          total_deleted: totalDeleted
        })
      }

      const duration = Date.now() - startTime

      return {
        deleted_count: totalDeleted,
        cutoff_date: BeijingTimeHelper.formatForAPI(cutoffDate).iso,
        duration_ms: duration,
        status: 'SUCCESS'
      }
    } catch (error) {
      logger.error('[WebSocket启动日志清理] 执行失败', { error: error.message })
      throw error
    }
  }
}

module.exports = DailyWebSocketStartupLogCleanup
