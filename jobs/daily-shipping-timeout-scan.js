/**
 * 物流超时预警扫描任务（物流方案一·拍板③）
 *
 * 职责：
 * - 扫描 status='shipped' 的实物兑换订单，结合 shipping_tracks 轨迹判断：
 *   · 超时未揽收：发货后超过 PICKUP_HOURS 小时仍无揽收轨迹
 *   · 超时未签收：发货后超过 DELIVER_DAYS 天仍无签收轨迹
 * - 命中则通过 NotificationService 通知管理员（复用现有超时告警通道）
 *
 * 执行策略：定时执行（每天一次），只读扫描收口到 ExchangeQueryService.scanShippingTimeouts
 *
 * 创建时间：2026-06-14（实物兑换发货链路 P2 物流方案一）
 */

const logger = require('../utils/logger').logger

/** 未揽收预警阈值（小时） */
const PICKUP_HOURS = 48
/** 未签收预警阈值（天） */
const DELIVER_DAYS = 7

/**
 * 物流超时预警扫描任务类
 *
 * @class DailyShippingTimeoutScan
 */
class DailyShippingTimeoutScan {
  /**
   * 执行物流超时预警扫描
   *
   * @returns {Promise<Object>} 执行报告 { not_picked_up_count, not_delivered_count, duration_ms, status }
   */
  static async execute() {
    const start_time = Date.now()
    logger.info('开始物流超时预警扫描')

    try {
      const serviceManager = require('../services/index')
      if (!serviceManager._initialized) {
        await serviceManager.initialize()
      }

      const ExchangeQueryService = serviceManager.getService('exchange_query')
      const NotificationService = serviceManager.getService('notification')

      const result = await ExchangeQueryService.scanShippingTimeouts({
        pickupHours: PICKUP_HOURS,
        deliverDays: DELIVER_DAYS
      })

      const notPickedUpCount = result.not_picked_up.length
      const notDeliveredCount = result.not_delivered.length

      // 命中预警则通知管理员（非阻塞，失败不影响扫描结果）
      if (
        (notPickedUpCount > 0 || notDeliveredCount > 0) &&
        NotificationService?.notifyTimeoutAlert
      ) {
        NotificationService.notifyTimeoutAlert({
          count: notPickedUpCount + notDeliveredCount,
          timeout_hours: PICKUP_HOURS,
          statistics: [
            ...result.not_picked_up.map(o => `未揽收:${o.order_no}`),
            ...result.not_delivered.map(o => `未签收:${o.order_no}`)
          ]
        }).catch(e => logger.error('[物流超时预警] 通知发送失败', { error: e.message }))
      }

      const duration_ms = Date.now() - start_time
      const report = {
        timestamp: new Date().toISOString(),
        not_picked_up_count: notPickedUpCount,
        not_delivered_count: notDeliveredCount,
        duration_ms,
        status: 'SUCCESS'
      }

      logger.info('物流超时预警扫描完成', {
        not_picked_up_count: notPickedUpCount,
        not_delivered_count: notDeliveredCount,
        duration_ms
      })

      return report
    } catch (error) {
      logger.error('物流超时预警扫描失败', {
        error_message: error.message,
        error_stack: error.stack
      })
      throw error
    }
  }
}

if (require.main === module) {
  ;(async () => {
    try {
      require('dotenv').config()
      const report = await DailyShippingTimeoutScan.execute()
      process.exit(report.status === 'SUCCESS' ? 0 : 1)
    } catch (error) {
      console.error('物流超时预警扫描任务执行失败:', error)
      process.exit(1)
    }
  })()
}

module.exports = DailyShippingTimeoutScan
