/**
 * 天工商户营销平台 - 每日限时装饰到期清理任务（模块D）
 *
 * 职责（路线B 合规改造 第十节）：
 * - 自动扫描并标记到期的限时装饰（user_owned_decorations.expires_at < now 且 status='active'）
 * - 调用 DecorationService.expireOverdueDecorations()，批量置 status='expired' 并卸下佩戴
 * - 保证星石持续消耗（限时装饰到期需重新购买）
 *
 * 执行策略：
 * - 定时执行：每天凌晨（与其他每日 job 对齐，由调度器配置）
 * - 到期判断：expires_at < now 且 status='active'
 *
 * 参考模板：jobs/daily-redemption-order-expiration.js
 *
 * 创建时间：2026-06-08（路线B 合规改造 模块D）
 */

const models = require('../models')
const DecorationService = require('../services/DecorationService')
const TransactionManager = require('../utils/TransactionManager')

const logger = require('../utils/logger').logger

/**
 * 每日限时装饰到期清理任务类
 *
 * @class DailyDecorationExpiry
 */
class DailyDecorationExpiry {
  /**
   * 执行到期清理任务
   *
   * @returns {Promise<Object>} 清理报告 { timestamp, expired_count, duration_ms, status }
   */
  static async execute() {
    const start_time = Date.now()
    logger.info('开始每日限时装饰到期清理')

    try {
      const decorationService = new DecorationService(models)
      const expired_count = await TransactionManager.execute(
        async transaction => {
          return decorationService.expireOverdueDecorations({ transaction })
        },
        { operation: 'daily_decoration_expiry' }
      )

      const duration_ms = Date.now() - start_time
      const report = {
        timestamp: new Date().toISOString(),
        expired_count,
        duration_ms,
        status: 'SUCCESS'
      }

      this._outputReport(report)
      logger.info('每日限时装饰到期清理完成', { expired_count, duration_ms })
      return report
    } catch (error) {
      logger.error('每日限时装饰到期清理失败', {
        error_message: error.message,
        error_stack: error.stack
      })
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
    console.log('🎨 每日限时装饰到期清理报告')
    console.log('='.repeat(80))
    console.log(`时间: ${report.timestamp}`)
    console.log(`耗时: ${report.duration_ms}ms`)
    console.log(`到期装饰数: ${report.expired_count}`)
    console.log(`状态: ${report.status === 'SUCCESS' ? '✅ SUCCESS' : '❌ ERROR'}`)
    console.log('='.repeat(80) + '\n')
  }
}

// 直接执行清理（供定时任务调用）
if (require.main === module) {
  ;(async () => {
    try {
      const report = await DailyDecorationExpiry.execute()
      process.exit(report.status === 'SUCCESS' ? 0 : 1)
    } catch (error) {
      console.error('清理任务执行失败:', error)
      process.exit(1)
    }
  })()
}

module.exports = DailyDecorationExpiry
