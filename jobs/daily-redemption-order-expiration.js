/**
 * 天工商户营销平台 V4.2 - 每日兑换订单过期清理任务
 *
 * 职责：
 * - 自动扫描并标记过期的兑换订单
 * - 调用 RedemptionService.expireOrders()
 * - 记录清理数量和日志
 *
 * 执行策略：
 * - 定时执行：每天凌晨2点
 * - 过期判断：expires_at < now 且 status = 'pending'
 * - 批量更新：status = 'expired'
 *
 * 创建时间：2025-12-17
 * 使用模型：Claude Sonnet 4.5
 */

const RedemptionService = require('../services/RedemptionService')
const TransactionManager = require('../utils/TransactionManager')

const logger = require('../utils/logger').logger

/**
 * 每日兑换订单过期清理任务类
 *
 * @class DailyRedemptionOrderExpiration
 * @description 自动清理过期的兑换订单
 */
class DailyRedemptionOrderExpiration {
  /**
   * 执行过期清理任务
   *
   * @returns {Promise<Object>} 清理报告
   * @returns {Object} report - 清理报告
   * @returns {number} report.expired_count - 过期订单数量
   * @returns {string} report.timestamp - 执行时间
   * @returns {number} report.duration_ms - 执行耗时(毫秒)
   */
  static async execute() {
    const start_time = Date.now()
    logger.info('开始每日兑换订单过期清理')

    try {
      /*
       * 使用 TransactionManager 包装事务操作
       * RedemptionService.expireOrders() 需要事务上下文
       */
      const expired_count = await TransactionManager.execute(
        async transaction => {
          return await RedemptionService.expireOrders({ transaction })
        },
        {
          operation: 'daily_redemption_order_expiration'
        }
      )

      // 生成报告
      const duration_ms = Date.now() - start_time
      const report = {
        timestamp: new Date().toISOString(),
        expired_count,
        duration_ms,
        status: 'SUCCESS'
      }

      // 输出报告
      this._outputReport(report)

      logger.info('每日兑换订单过期清理完成', {
        expired_count,
        duration_ms
      })

      return report
    } catch (error) {
      logger.error('每日兑换订单过期清理失败', {
        error_message: error.message,
        error_stack: error.stack
      })

      const _report = {
        timestamp: new Date().toISOString(),
        expired_count: 0,
        duration_ms: Date.now() - start_time,
        status: 'ERROR',
        error: error.message
      }

      throw error
    }
  }

  /**
   * 输出清理报告
   *
   * @param {Object} report - 清理报告
   * @returns {void}
   * @private
   */
  static _outputReport(report) {
    console.log('\n' + '='.repeat(80))
    console.log('📦 每日兑换订单过期清理报告')
    console.log('='.repeat(80))
    console.log(`时间: ${report.timestamp}`)
    console.log(`耗时: ${report.duration_ms}ms`)
    console.log(`过期订单数: ${report.expired_count}`)
    console.log(`状态: ${report.status === 'SUCCESS' ? '✅ SUCCESS' : '❌ ERROR'}`)

    if (report.error) {
      console.log(`错误: ${report.error}`)
    }

    console.log('='.repeat(80) + '\n')
  }
}

// 直接执行清理（供定时任务调用）
if (require.main === module) {
  ;(async () => {
    try {
      const report = await DailyRedemptionOrderExpiration.execute()
      process.exit(report.status === 'SUCCESS' ? 0 : 1)
    } catch (error) {
      console.error('清理任务执行失败:', error)
      process.exit(1)
    }
  })()
}

module.exports = DailyRedemptionOrderExpiration
