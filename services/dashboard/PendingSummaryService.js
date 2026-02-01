/**
 * 仪表盘待处理事项汇总服务（PendingSummaryService）
 *
 * 业务场景：
 * - 为运营后台首页提供待处理事项的实时汇总数据
 * - 汇聚4大核心待处理数据源：消费记录审核、客服会话、风控告警、抽奖告警
 * - 支持超时项筛选和紧急程度标识
 *
 * 技术特性：
 * - 使用 BusinessCacheHelper 进行 Redis L2 缓存（TTL=60秒）
 * - 并行查询多个数据源（Promise.all）
 * - 基于 BeijingTimeHelper 进行超时判定
 *
 * API 端点：
 * - GET /api/v4/console/dashboard/pending-summary
 *
 * 创建时间：2026年01月31日
 * 关联文档：后端数据库开发任务清单-2026年1月.md（P0-B5）
 *
 * @module services/dashboard/PendingSummaryService
 */

'use strict'

const { Op } = require('sequelize')
const { BusinessCacheHelper, DEFAULT_TTL, KEY_PREFIX } = require('../../utils/BusinessCacheHelper')
const BeijingTimeHelper = require('../../utils/timeHelper')
const logger = require('../../utils/logger').logger

/**
 * 超时阈值配置（单位：分钟）
 * @description 基于 D-5 决策：使用硬编码配置 + system_config 表动态调整
 * @constant
 */
const TIMEOUT_THRESHOLDS = {
  /** 消费记录审核超时阈值（24小时） */
  consumption: 24 * 60,
  /** 客服会话超时阈值（30分钟） */
  customer_service: 30,
  /** 风控告警超时阈值（1小时） */
  risk_alert: 60,
  /** 抽奖告警超时阈值（2小时） */
  lottery_alert: 120
}

/**
 * 缓存 Key 前缀
 * @constant
 */
const CACHE_KEY = 'pending_summary'

/**
 * 仪表盘待处理事项汇总服务
 *
 * @description 提供运营仪表盘的待处理事项汇总功能
 */
class PendingSummaryService {
  /**
   * 获取待处理事项汇总（主方法）
   *
   * @description 汇聚4大核心待处理数据源，返回统一的汇总结构
   *
   * @returns {Promise<Object>} 待处理汇总数据
   * @returns {Object} return.consumption - 消费记录审核待处理
   * @returns {Object} return.customer_service - 客服会话待处理
   * @returns {Object} return.risk_alerts - 风控告警待处理
   * @returns {Object} return.lottery_alerts - 抽奖告警待处理
   * @returns {Object} return.summary - 汇总统计（总数、紧急项数）
   *
   * @example
   * const summary = await PendingSummaryService.getPendingSummary()
   * // { consumption: { count: 5, urgent_count: 2 }, ... }
   */
  static async getPendingSummary() {
    const cacheKey = `${KEY_PREFIX}${CACHE_KEY}`

    try {
      // 1. 尝试从缓存获取
      const cached = await BusinessCacheHelper.get(cacheKey)
      if (cached) {
        logger.debug('[待处理汇总] 使用缓存数据')
        return cached
      }

      // 2. 并行查询4大数据源
      logger.debug('[待处理汇总] 开始并行查询数据源')
      const [consumption, customerService, riskAlerts, lotteryAlerts] = await Promise.all([
        this._getConsumptionPending(),
        this._getCustomerServicePending(),
        this._getRiskAlertsPending(),
        this._getLotteryAlertsPending()
      ])

      // 3. 计算汇总统计
      const totalCount =
        consumption.count + customerService.count + riskAlerts.count + lotteryAlerts.count
      const urgentCount =
        consumption.urgent_count +
        customerService.urgent_count +
        riskAlerts.urgent_count +
        lotteryAlerts.urgent_count

      const result = {
        consumption,
        customer_service: customerService,
        risk_alerts: riskAlerts,
        lottery_alerts: lotteryAlerts,
        summary: {
          total_count: totalCount,
          urgent_count: urgentCount,
          updated_at: BeijingTimeHelper.apiTimestamp()
        }
      }

      // 4. 写入缓存（TTL=60秒）
      await BusinessCacheHelper.set(cacheKey, result, DEFAULT_TTL.STATS)

      logger.info('[待处理汇总] 数据更新完成', {
        total_count: totalCount,
        urgent_count: urgentCount
      })

      return result
    } catch (error) {
      logger.error('[待处理汇总] 查询失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取消费记录审核待处理数据
   *
   * @description 查询 consumption_records 表中 status='pending' 的记录
   *
   * @private
   * @returns {Promise<Object>} 消费记录待处理统计
   * @returns {number} return.count - 待处理总数
   * @returns {number} return.urgent_count - 超时/紧急数量
   * @returns {number} return.oldest_minutes - 最早待处理的等待分钟数
   */
  static async _getConsumptionPending() {
    try {
      const { ConsumptionRecord } = require('../../models')

      // 使用 scope 查询待审核记录
      const records = await ConsumptionRecord.scope('pending').findAll({
        attributes: ['consumption_record_id', 'created_at'],
        order: [['created_at', 'ASC']]
      })

      const count = records.length
      let urgentCount = 0
      let oldestMinutes = 0

      if (count > 0) {
        const now = new Date()
        const timeoutThreshold = TIMEOUT_THRESHOLDS.consumption

        records.forEach(record => {
          const waitMinutes = Math.floor((now - new Date(record.created_at)) / 60000)
          if (waitMinutes >= timeoutThreshold) {
            urgentCount++
          }
          if (waitMinutes > oldestMinutes) {
            oldestMinutes = waitMinutes
          }
        })
      }

      return {
        count,
        urgent_count: urgentCount,
        oldest_minutes: oldestMinutes,
        timeout_threshold_minutes: TIMEOUT_THRESHOLDS.consumption
      }
    } catch (error) {
      logger.warn('[待处理汇总] 消费记录查询失败', { error: error.message })
      return { count: 0, urgent_count: 0, oldest_minutes: 0, error: error.message }
    }
  }

  /**
   * 获取客服会话待处理数据
   *
   * @description 查询 customer_service_sessions 表中 status IN ('waiting', 'active') 的会话
   *
   * @private
   * @returns {Promise<Object>} 客服会话待处理统计
   */
  static async _getCustomerServicePending() {
    try {
      const { CustomerServiceSession } = require('../../models')

      // 查询等待中和活跃的会话
      const sessions = await CustomerServiceSession.findAll({
        where: {
          status: { [Op.in]: ['waiting', 'assigned', 'active'] }
        },
        attributes: ['session_id', 'status', 'created_at', 'last_message_at']
      })

      const count = sessions.length
      let urgentCount = 0
      let oldestMinutes = 0

      if (count > 0) {
        const now = new Date()
        const timeoutThreshold = TIMEOUT_THRESHOLDS.customer_service

        sessions.forEach(session => {
          // 使用最后消息时间或创建时间计算等待时长
          const referenceTime = session.last_message_at || session.created_at
          const waitMinutes = Math.floor((now - new Date(referenceTime)) / 60000)

          if (waitMinutes >= timeoutThreshold) {
            urgentCount++
          }
          if (waitMinutes > oldestMinutes) {
            oldestMinutes = waitMinutes
          }
        })
      }

      return {
        count,
        urgent_count: urgentCount,
        oldest_minutes: oldestMinutes,
        timeout_threshold_minutes: TIMEOUT_THRESHOLDS.customer_service
      }
    } catch (error) {
      logger.warn('[待处理汇总] 客服会话查询失败', { error: error.message })
      return { count: 0, urgent_count: 0, oldest_minutes: 0, error: error.message }
    }
  }

  /**
   * 获取风控告警待处理数据
   *
   * @description 查询未处理的风控告警记录
   * @note D-1 决策：扩展 LotteryAlertService 来统一处理告警
   *
   * @private
   * @returns {Promise<Object>} 风控告警待处理统计
   */
  static async _getRiskAlertsPending() {
    try {
      // 使用 LotteryAlertService 获取风控相关告警
      const LotteryAlertService = require('../LotteryAlertService')

      // 获取未处理的用户/系统类型告警（作为风控告警）
      const result = await LotteryAlertService.getAlertList({
        type: 'user', // 用户风控相关告警
        status: 'active',
        limit: 100
      })

      const alerts = result.alerts || []
      const count = alerts.length
      let urgentCount = 0
      let oldestMinutes = 0

      if (count > 0) {
        const now = new Date()
        const timeoutThreshold = TIMEOUT_THRESHOLDS.risk_alert

        alerts.forEach(alert => {
          const waitMinutes = Math.floor((now - new Date(alert.created_at)) / 60000)
          if (waitMinutes >= timeoutThreshold) {
            urgentCount++
          }
          if (waitMinutes > oldestMinutes) {
            oldestMinutes = waitMinutes
          }
        })
      }

      return {
        count,
        urgent_count: urgentCount,
        oldest_minutes: oldestMinutes,
        timeout_threshold_minutes: TIMEOUT_THRESHOLDS.risk_alert
      }
    } catch (error) {
      logger.warn('[待处理汇总] 风控告警查询失败', { error: error.message })
      return { count: 0, urgent_count: 0, oldest_minutes: 0, error: error.message }
    }
  }

  /**
   * 获取抽奖告警待处理数据
   *
   * @description 查询未处理的抽奖系统告警
   * @note D-1 决策：使用已有的 LotteryAlertService
   *
   * @private
   * @returns {Promise<Object>} 抽奖告警待处理统计
   */
  static async _getLotteryAlertsPending() {
    try {
      const LotteryAlertService = require('../LotteryAlertService')

      // 获取未处理的抽奖相关告警（预算、库存、中奖率）
      const result = await LotteryAlertService.getAlertList({
        status: 'active',
        limit: 100
      })

      // 过滤出抽奖相关类型的告警
      const lotteryTypes = ['win_rate', 'budget', 'inventory']
      const alerts = (result.alerts || []).filter(a => lotteryTypes.includes(a.alert_type))

      const count = alerts.length
      let urgentCount = 0
      let oldestMinutes = 0

      if (count > 0) {
        const now = new Date()
        const timeoutThreshold = TIMEOUT_THRESHOLDS.lottery_alert

        alerts.forEach(alert => {
          const waitMinutes = Math.floor((now - new Date(alert.created_at)) / 60000)
          if (waitMinutes >= timeoutThreshold) {
            urgentCount++
          }
          if (waitMinutes > oldestMinutes) {
            oldestMinutes = waitMinutes
          }
        })
      }

      return {
        count,
        urgent_count: urgentCount,
        oldest_minutes: oldestMinutes,
        timeout_threshold_minutes: TIMEOUT_THRESHOLDS.lottery_alert
      }
    } catch (error) {
      logger.warn('[待处理汇总] 抽奖告警查询失败', { error: error.message })
      return { count: 0, urgent_count: 0, oldest_minutes: 0, error: error.message }
    }
  }

  /**
   * 手动失效缓存
   *
   * @description 当待处理状态发生变化时调用，触发缓存刷新
   *
   * @param {string} reason - 失效原因（用于日志记录）
   * @returns {Promise<boolean>} 是否成功失效缓存
   *
   * @example
   * await PendingSummaryService.invalidateCache('consumption_reviewed')
   */
  static async invalidateCache(reason = 'manual_invalidation') {
    const cacheKey = `${KEY_PREFIX}${CACHE_KEY}`
    return await BusinessCacheHelper.del(cacheKey, reason)
  }
}

module.exports = PendingSummaryService
