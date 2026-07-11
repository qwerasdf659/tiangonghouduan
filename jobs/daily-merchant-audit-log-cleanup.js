/**
 * 每日商家审计日志180天清理任务（原定时任务20）
 *
 * 业务用途（商家员工域权限体系升级 AC4.4 2026-01-12）：
 * - 商家操作日志保留期限为180天，超期自动删除，释放数据库空间
 * - 操作日志已合并为单表 operation_logs + operator_type 多态（models/OperationLog.js），
 *   本任务仅清理 operator_type='merchant' 域（admin 域由 daily-admin-operation-log-cleanup 负责）
 *
 * 清理策略：
 * - 删除 created_at < (当前时间 - 180天) 的记录
 * - 利用 created_at 索引高效查询
 * - 分批删除（每批10000条），避免长事务锁表
 * - 记录清理日志供运维追踪
 *
 * 调度频率：0 3 * * *（每天凌晨3点，由 scripts/maintenance/scheduled_tasks.js 注册，支持分布式锁）
 *
 * 创建时间：2026-01-12
 * 任务体自 scripts/maintenance/scheduled_tasks.js cleanupMerchantAuditLogs 原样搬移（技术债务方案 7.4-1，2026-07-11）
 */

const logger = require('../utils/logger')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 每日商家审计日志清理任务类
 *
 * @class DailyMerchantAuditLogCleanup
 * @description 分批删除超过保留期限的商家操作日志（operation_logs, operator_type='merchant'）
 */
class DailyMerchantAuditLogCleanup {
  /**
   * 清理超过指定天数的商家操作日志
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

    logger.info('[商家审计日志清理] 开始执行...', {
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
         * 仅清理 merchant 域（admin 审计日志永久保留，batch 任务日志单独策略）
         */
        const deletedCount = await OperationLog.destroy({
          where: {
            operator_type: 'merchant',
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

        logger.info('[商家审计日志清理] 批次完成', {
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
      logger.error('[商家审计日志清理] 执行失败', { error: error.message })
      throw error
    }
  }
}

module.exports = DailyMerchantAuditLogCleanup
