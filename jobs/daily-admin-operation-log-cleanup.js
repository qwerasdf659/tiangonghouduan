/**
 * 每日管理员操作日志180天清理任务（原定时任务29）
 *
 * 业务用途（定时任务统一管理改进 2026-01-30）：
 * - 参照商家审计日志180天清理的实现，管理员操作日志保留策略一致（180天）
 * - 操作日志已合并为单表 operation_logs + operator_type 多态（models/OperationLog.js），
 *   本任务仅清理 operator_type='admin' 域（merchant 域由 daily-merchant-audit-log-cleanup 负责）
 *
 * 清理策略：
 * - 删除 created_at < (当前时间 - 180天) 的记录
 * - 分批删除（每批10000条），避免长事务锁表
 * - 记录清理日志供运维追踪
 *
 * 调度频率：0 3 * * *（每天凌晨3点，由 scripts/maintenance/scheduled_tasks.js 注册，支持分布式锁）
 *
 * 创建时间：2026-01-30
 * 任务体自 scripts/maintenance/scheduled_tasks.js cleanupAdminOperationLogs 原样搬移（技术债务方案 7.4-1，2026-07-11）
 */

const logger = require('../utils/logger')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 每日管理员操作日志清理任务类
 *
 * @class DailyAdminOperationLogCleanup
 * @description 分批删除超过保留期限的管理员操作日志（operation_logs, operator_type='admin'）
 */
class DailyAdminOperationLogCleanup {
  /**
   * 清理超过指定天数的管理员操作日志
   *
   * @param {number} [retentionDays=180] - 保留天数（默认180天）
   * @returns {Promise<Object>} 清理报告（deleted_count/cutoff_date/duration_ms/status）
   */
  static async execute(retentionDays = 180) {
    const startTime = Date.now()
    const { OperationLog, sequelize } = require('../models')
    const { Op } = sequelize.Sequelize

    // 计算截止日期（180天前）
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

    logger.info('[管理员操作日志清理] 开始执行...', {
      retention_days: retentionDays,
      cutoff_date: BeijingTimeHelper.formatForAPI(cutoffDate).iso
    })

    try {
      // 分批删除，每批最多10000条，避免长事务
      const batchSize = 10000
      let totalDeleted = 0
      let hasMore = true

      while (hasMore) {
        /*
         * 使用 destroy 删除满足条件的记录
         * 仅清理 admin 域（merchant 域由 daily-merchant-audit-log-cleanup 负责）
         */
        const deletedCount = await OperationLog.destroy({
          where: {
            operator_type: 'admin',
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

        logger.info('[管理员操作日志清理] 批次完成', {
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
      logger.error('[管理员操作日志清理] 执行失败', { error: error.message })
      throw error
    }
  }
}

module.exports = DailyAdminOperationLogCleanup
