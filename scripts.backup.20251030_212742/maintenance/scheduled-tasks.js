/**
 * 定时任务配置
 *
 * 使用node-cron实现定时任务调度
 *
 * 功能：
 * 1. 超时订单告警（每小时检查）
 * 2. 数据一致性检查（每天凌晨3点）
 *
 * 创建时间：2025-10-10
 * 更新时间：2025-10-12（服务重命名）
 */

const cron = require('node-cron')
// 服务重命名（2025-10-12）：AuditManagementService → ExchangeOperationService
const ExchangeOperationService = require('../../services/ExchangeOperationService')
const logger = require('../../utils/logger')

class ScheduledTasks {
  /**
   * 初始化所有定时任务
   */
  static initialize () {
    logger.info('开始初始化定时任务...')

    // 任务1: 每小时检查超时订单（24小时）
    this.scheduleTimeoutCheck()

    // 任务2: 每天检查超时订单（72小时，紧急告警）
    this.scheduleUrgentTimeoutCheck()

    // 任务3: 每天凌晨3点执行数据一致性检查
    this.scheduleDataConsistencyCheck()

    logger.info('所有定时任务已初始化完成')
  }

  /**
   * 定时任务1: 每小时检查超过24小时的待审核订单
   * Cron表达式: 0 * * * * (每小时的0分)
   */
  static scheduleTimeoutCheck () {
    cron.schedule('0 * * * *', async () => {
      try {
        logger.info('[定时任务] 开始执行24小时超时订单检查...')
        const result = await ExchangeOperationService.checkTimeoutAndAlert(24)

        if (result.hasTimeout) {
          logger.warn(`[定时任务] 发现${result.count}个超时订单（24小时）`)
        } else {
          logger.info('[定时任务] 24小时超时订单检查完成，无超时订单')
        }
      } catch (error) {
        logger.error('[定时任务] 24小时超时订单检查失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 24小时超时订单检查（每小时执行）')
  }

  /**
   * 定时任务2: 每天9点和18点检查超过72小时的待审核订单（紧急告警）
   * Cron表达式: 0 9,18 * * * (每天9点和18点)
   */
  static scheduleUrgentTimeoutCheck () {
    cron.schedule('0 9,18 * * *', async () => {
      try {
        logger.info('[定时任务] 开始执行72小时紧急超时订单检查...')
        const result = await ExchangeOperationService.checkTimeoutAndAlert(72)

        if (result.hasTimeout) {
          logger.error(`[定时任务] 🚨 发现${result.count}个紧急超时订单（72小时）`)
          // TODO: 发送紧急通知给管理员
        } else {
          logger.info('[定时任务] 72小时超时订单检查完成，无超时订单')
        }
      } catch (error) {
        logger.error('[定时任务] 72小时超时订单检查失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 72小时紧急超时订单检查（每天9点和18点执行）')
  }

  /**
   * 定时任务3: 每天凌晨3点执行数据一致性检查
   * Cron表达式: 0 3 * * * (每天凌晨3点)
   */
  static scheduleDataConsistencyCheck () {
    cron.schedule('0 3 * * *', async () => {
      try {
        logger.info('[定时任务] 开始执行每日数据一致性检查...')

        // 执行完整的数据一致性检查（包括自动修复）
        const DataConsistencyChecker = require('../archived/data-consistency-check')
        const results = await DataConsistencyChecker.performFullCheck()

        logger.info('[定时任务] 数据一致性检查完成', {
          total_checks: results.checks.length,
          total_fixes: results.fixes.length,
          total_errors: results.errors.length
        })

        // 获取待审核订单统计
        const statistics = await ExchangeOperationService.getPendingOrdersStatistics()

        logger.info('[定时任务] 待审核订单统计', {
          total: statistics.total,
          within24h: statistics.within24h,
          over24h: statistics.over24h,
          over72h: statistics.over72h
        })

        // 如果有大量超时订单，发送告警
        if (statistics.over24h > 10) {
          logger.warn('[定时任务] ⚠️ 待审核订单积压', {
            over24h: statistics.over24h,
            message: '超过24小时的待审核订单数量较多，请及时处理'
          })
        }

        if (statistics.over72h > 5) {
          logger.error('[定时任务] 🚨 待审核订单严重积压', {
            over72h: statistics.over72h,
            message: '超过72小时的待审核订单数量较多，需要紧急处理'
          })
        }

        logger.info('[定时任务] 每日数据一致性检查完成')
      } catch (error) {
        logger.error('[定时任务] 每日数据一致性检查失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 每日数据一致性检查（每天凌晨3点执行）')
  }

  /**
   * 手动触发24小时超时检查（用于测试）
   */
  static async manualTimeoutCheck () {
    logger.info('[手动触发] 执行24小时超时订单检查...')
    try {
      const result = await ExchangeOperationService.checkTimeoutAndAlert(24)
      logger.info('[手动触发] 检查完成', { result })
      return result
    } catch (error) {
      logger.error('[手动触发] 检查失败', { error: error.message })
      throw error
    }
  }

  /**
   * 手动触发72小时紧急超时检查（用于测试）
   */
  static async manualUrgentTimeoutCheck () {
    logger.info('[手动触发] 执行72小时紧急超时订单检查...')
    try {
      const result = await ExchangeOperationService.checkTimeoutAndAlert(72)
      logger.info('[手动触发] 检查完成', { result })
      return result
    } catch (error) {
      logger.error('[手动触发] 检查失败', { error: error.message })
      throw error
    }
  }
}

module.exports = ScheduledTasks
