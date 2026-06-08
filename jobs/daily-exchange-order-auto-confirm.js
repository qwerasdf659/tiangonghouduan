/**
 * 天工商户营销平台 V4.2 - 积分商城订单7天自动确认收货任务
 *
 * 职责：
 * - 扫描已发货超过7天未确认收货的积分商城订单
 * - 自动将 status 从 shipped 更新为 received
 * - 设置 auto_confirmed = true 标记为系统自动确认
 *
 * 执行策略：
 * - 定时执行：每天凌晨3点
 * - 判断条件：status = 'shipped' AND shipped_at + 7天 < NOW()
 *
 * 业务依据：决策4（积分商城确认收货）+ Phase 3 Step 3.3
 *
 * 创建时间：2026-02-21
 */

const TransactionManager = require('../utils/TransactionManager')
const logger = require('../utils/logger').logger

/**
 * 积分商城订单自动确认收货任务类
 *
 * @class DailyExchangeOrderAutoConfirm
 */
class DailyExchangeOrderAutoConfirm {
  /**
   * 执行自动确认收货任务
   *
   * @returns {Promise<Object>} 执行报告
   */
  static async execute() {
    const start_time = Date.now()
    logger.info('开始每日积分商城订单自动确认收货')

    try {
      const serviceManager = require('../services/index')
      if (!serviceManager._initialized) {
        await serviceManager.initialize()
      }

      const ExchangeCoreService = serviceManager.getService('exchange_core')

      const auto_confirmed_count = await TransactionManager.execute(
        async transaction => {
          return await ExchangeCoreService.autoConfirmShippedOrders({ transaction })
        },
        {
          operation: 'daily_exchange_order_auto_confirm'
        }
      )

      const duration_ms = Date.now() - start_time
      const report = {
        timestamp: new Date().toISOString(),
        auto_confirmed_count,
        duration_ms,
        status: 'SUCCESS'
      }

      this._outputReport(report)

      logger.info('每日积分商城订单自动确认收货完成', {
        auto_confirmed_count,
        duration_ms
      })

      return report
    } catch (error) {
      logger.error('每日积分商城订单自动确认收货失败', {
        error_message: error.message,
        error_stack: error.stack
      })

      throw error
    }
  }

  /**
   * 输出报告
   *
   * @param {Object} report - 执行报告
   * @returns {void}
   * @private
   */
  static _outputReport(report) {
    console.log('\n' + '='.repeat(80))
    console.log('📦 积分商城订单自动确认收货报告')
    console.log('='.repeat(80))
    console.log(`时间: ${report.timestamp}`)
    console.log(`耗时: ${report.duration_ms}ms`)
    console.log(`自动确认数: ${report.auto_confirmed_count}`)
    console.log(`状态: ${report.status === 'SUCCESS' ? '✅ SUCCESS' : '❌ ERROR'}`)
    console.log('='.repeat(80) + '\n')
  }
}

if (require.main === module) {
  ;(async () => {
    try {
      require('dotenv').config()
      const report = await DailyExchangeOrderAutoConfirm.execute()
      process.exit(report.status === 'SUCCESS' ? 0 : 1)
    } catch (error) {
      console.error('自动确认收货任务执行失败:', error)
      process.exit(1)
    }
  })()
}

module.exports = DailyExchangeOrderAutoConfirm
