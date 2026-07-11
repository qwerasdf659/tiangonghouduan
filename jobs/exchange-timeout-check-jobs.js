/**
 * 兑换订单超时检查任务集（原定时任务1/2/3）
 *
 * 业务用途：
 * - 任务1（executeHourlyCheck）：检查超过24小时的待审核订单并告警（每小时整点）
 * - 任务2（executeUrgentCheck）：检查超过72小时的待审核订单并紧急告警（每天9点和18点）
 * - 任务3（executeDailyStats）：每日运营数据统计（24h/72h 超时订单积压检测，每天凌晨3点）
 *
 * 调度频率（由 scripts/maintenance/scheduled_tasks.js 注册）：
 * - 任务1：0 * * * *
 * - 任务2：0 9,18 * * *
 * - 任务3：0 3 * * *
 *
 * 任务体自 scripts/maintenance/scheduled_tasks.js 原样搬移（技术债务方案 7.4-1，2026-07-11）
 */

const logger = require('../utils/logger')

/**
 * 获取任务所需服务实例（等价于原 ScheduledTasks.initializeServices 的服务获取逻辑）
 *
 * P1-9：服务通过 ServiceManager 获取（snake_case key），ServiceManager 内部缓存单例
 *
 * @returns {Promise<Object>} 服务集合 { ExchangeAdminService, NotificationService }
 */
async function getServices() {
  const serviceManager = require('../services/index')
  if (!serviceManager._initialized) {
    await serviceManager.initialize()
  }
  return {
    ExchangeAdminService: serviceManager.getService('exchange_admin'),
    NotificationService: serviceManager.getService('notification')
  }
}

/**
 * 兑换订单超时检查任务类
 *
 * @class ExchangeTimeoutCheckJobs
 * @description 待审核订单超时检测与告警（24小时常规告警 / 72小时紧急告警 / 每日统计）
 */
class ExchangeTimeoutCheckJobs {
  /**
   * 执行超时订单检测（供手动触发方法使用，返回检测结果）
   *
   * @param {number} timeoutHours - 超时阈值（小时）
   * @returns {Promise<Object>} 检测结果对象（hasTimeout/count/orders）
   */
  static async checkTimeoutAndAlert(timeoutHours) {
    const { ExchangeAdminService } = await getServices()
    return ExchangeAdminService.checkTimeoutAndAlert(timeoutHours)
  }

  /**
   * 任务1: 24小时超时订单检查（每小时执行）
   *
   * @returns {Promise<void>} 执行完成
   */
  static async executeHourlyCheck() {
    const { ExchangeAdminService, NotificationService } = await getServices()

    logger.info('[定时任务] 开始执行24小时超时订单检查...')
    const result = await ExchangeAdminService.checkTimeoutAndAlert(24)

    if (result.hasTimeout) {
      logger.warn(`[定时任务] 发现${result.count}个超时订单（24小时）`)
      NotificationService.notifyTimeoutAlert({
        count: result.count,
        timeout_hours: 24,
        statistics: result.orders?.map(o => o.order_no) || []
      }).catch(e => logger.error('[定时任务] 24小时超时通知发送失败', { error: e.message }))
    } else {
      logger.info('[定时任务] 24小时超时订单检查完成，无超时订单')
    }
  }

  /**
   * 任务2: 72小时紧急超时订单检查（每天9点和18点执行）
   *
   * @returns {Promise<void>} 执行完成
   */
  static async executeUrgentCheck() {
    const { ExchangeAdminService, NotificationService } = await getServices()

    logger.info('[定时任务] 开始执行72小时紧急超时订单检查...')
    const result = await ExchangeAdminService.checkTimeoutAndAlert(72)

    if (result.hasTimeout) {
      logger.error(`[定时任务] 🚨 发现${result.count}个紧急超时订单（72小时）`)
      NotificationService.notifyTimeoutAlert({
        count: result.count,
        timeout_hours: 72,
        statistics: result.orders?.map(o => o.order_no) || []
      }).catch(e => logger.error('[定时任务] 72小时超时通知发送失败', { error: e.message }))
    } else {
      logger.info('[定时任务] 72小时超时订单检查完成，无超时订单')
    }
  }

  /**
   * 任务3: 每日运营数据统计（每天凌晨3点执行）
   *
   * 2026-02-06 重构：移除已归档的 data-consistency-check 模块引用
   * 改为执行超时订单检测和统计，数据一致性由专门的孤儿检测任务处理
   *
   * @returns {Promise<void>} 执行完成
   */
  static async executeDailyStats() {
    logger.info('[定时任务] 开始执行每日运营数据统计...')

    const { ExchangeAdminService, NotificationService } = await getServices()

    // 使用 ExchangeAdminService 检查超时订单
    const timeoutResult24h = await ExchangeAdminService.checkTimeoutAndAlert(24)
    const timeoutResult72h = await ExchangeAdminService.checkTimeoutAndAlert(72)

    logger.info('[定时任务] 每日订单超时检测完成', {
      over_24h_count: timeoutResult24h?.count || 0,
      over_72h_count: timeoutResult72h?.count || 0,
      has_24h_timeout: timeoutResult24h?.hasTimeout || false,
      has_72h_timeout: timeoutResult72h?.hasTimeout || false
    })

    // 如果有大量超时订单，发送告警通知管理员
    if (timeoutResult24h?.count > 10) {
      logger.warn('[定时任务] ⚠️ 待审核订单积压', {
        over24h: timeoutResult24h.count,
        message: '超过24小时的待审核订单数量较多，请及时处理'
      })
      NotificationService.notifyTimeoutAlert({
        count: timeoutResult24h.count,
        timeout_hours: 24,
        statistics: timeoutResult24h.orders?.map(o => o.order_no) || []
      }).catch(e => logger.error('[定时任务] 每日24h超时通知发送失败', { error: e.message }))
    }

    if (timeoutResult72h?.count > 5) {
      logger.error('[定时任务] 🚨 待审核订单严重积压', {
        over72h: timeoutResult72h.count,
        message: '超过72小时的待审核订单数量较多，需要紧急处理'
      })
      NotificationService.notifyTimeoutAlert({
        count: timeoutResult72h.count,
        timeout_hours: 72,
        statistics: timeoutResult72h.orders?.map(o => o.order_no) || []
      }).catch(e => logger.error('[定时任务] 每日72h超时通知发送失败', { error: e.message }))
    }

    logger.info('[定时任务] 每日运营数据统计完成')
  }
}

module.exports = ExchangeTimeoutCheckJobs
