/**
 * 导航徽标服务（NavBadgeService）
 *
 * 业务场景：
 * - 为运营后台侧边栏提供待处理事项徽标计数
 * - 轻量级接口，适合前端轮询调用
 * - 帮助管理员快速识别待处理工作
 *
 * 技术特性：
 * - 使用 BusinessCacheHelper 进行 Redis L2 缓存（TTL=60秒）
 * - 并行查询多个数据源（Promise.all）
 * - 返回最简数据结构，降低带宽消耗
 *
 * API 端点：
 * - GET /api/v4/admin/nav/badges
 *
 * 创建时间：2026年01月31日
 * 关联文档：后端数据库开发任务清单-2026年1月.md（P0-B13）
 *
 * @module services/nav/NavBadgeService
 */

'use strict'

const { Op } = require('sequelize')
const { BusinessCacheHelper, DEFAULT_TTL, KEY_PREFIX } = require('../../utils/BusinessCacheHelper')
const BeijingTimeHelper = require('../../utils/timeHelper')
const logger = require('../../utils/logger').logger

/**
 * 缓存 Key
 * @constant
 */
const CACHE_KEY = 'nav_badges'

/**
 * 徽标分类枚举
 * @constant
 */
const BADGE_CATEGORIES = {
  /** 消费记录审核 */
  CONSUMPTION: 'consumption',
  /** 客服会话 */
  CUSTOMER_SERVICE: 'customer_service',
  /** 风控告警 */
  RISK_ALERT: 'risk_alert',
  /** 抽奖告警 */
  LOTTERY_ALERT: 'lottery_alert'
}

/**
 * 导航徽标服务
 *
 * @description 提供侧边栏徽标计数功能
 */
class NavBadgeService {
  /**
   * 获取所有徽标计数
   *
   * @description 返回各菜单项的待处理数量，用于侧边栏徽标显示
   *
   * @returns {Promise<Object>} 徽标计数数据
   * @returns {Object} return.badges - 各分类的计数
   * @returns {number} return.total - 总待处理数量
   * @returns {string} return.updated_at - 更新时间
   *
   * @example
   * const badges = await NavBadgeService.getBadges()
   * // { badges: { consumption: 5, customer_service: 2, ... }, total: 10, updated_at: '...' }
   */
  static async getBadges() {
    const cacheKey = `${KEY_PREFIX}${CACHE_KEY}`

    try {
      // 1. 尝试从缓存获取
      const cached = await BusinessCacheHelper.get(cacheKey)
      if (cached) {
        logger.debug('[导航徽标] 使用缓存数据')
        return cached
      }

      // 2. 并行查询各分类计数
      const [consumption, customerService, riskAlerts, lotteryAlerts] = await Promise.all([
        this._getConsumptionCount(),
        this._getCustomerServiceCount(),
        this._getRiskAlertCount(),
        this._getLotteryAlertCount()
      ])

      // 3. 组装返回结构
      const badges = {
        [BADGE_CATEGORIES.CONSUMPTION]: consumption,
        [BADGE_CATEGORIES.CUSTOMER_SERVICE]: customerService,
        [BADGE_CATEGORIES.RISK_ALERT]: riskAlerts,
        [BADGE_CATEGORIES.LOTTERY_ALERT]: lotteryAlerts
      }

      // 4. 计算总数
      const total = Object.values(badges).reduce((sum, count) => sum + count, 0)

      const result = {
        badges,
        total,
        updated_at: BeijingTimeHelper.apiTimestamp()
      }

      // 5. 写入缓存
      await BusinessCacheHelper.set(cacheKey, result, DEFAULT_TTL.STATS)

      return result
    } catch (error) {
      logger.error('[导航徽标] 获取徽标计数失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取消费记录待审核数量
   *
   * @private
   * @returns {Promise<number>} 待审核数量
   */
  static async _getConsumptionCount() {
    try {
      const { ConsumptionRecord } = require('../../models')
      const count = await ConsumptionRecord.scope('pending').count()
      return count
    } catch (error) {
      logger.warn('[导航徽标] 消费记录计数失败', { error: error.message })
      return 0
    }
  }

  /**
   * 获取客服会话待处理数量
   *
   * @private
   * @returns {Promise<number>} 待处理数量
   */
  static async _getCustomerServiceCount() {
    try {
      const { CustomerServiceSession } = require('../../models')
      const count = await CustomerServiceSession.count({
        where: {
          status: { [Op.in]: ['waiting', 'assigned', 'active'] }
        }
      })
      return count
    } catch (error) {
      logger.warn('[导航徽标] 客服会话计数失败', { error: error.message })
      return 0
    }
  }

  /**
   * 获取风控告警待处理数量
   *
   * @private
   * @returns {Promise<number>} 待处理数量
   */
  static async _getRiskAlertCount() {
    try {
      const LotteryAlertService = require('../LotteryAlertService')
      const result = await LotteryAlertService.getAlertList({
        type: 'user',
        status: 'active',
        limit: 100
      })
      return (result.alerts || []).length
    } catch (error) {
      logger.warn('[导航徽标] 风控告警计数失败', { error: error.message })
      return 0
    }
  }

  /**
   * 获取抽奖告警待处理数量
   *
   * @private
   * @returns {Promise<number>} 待处理数量
   */
  static async _getLotteryAlertCount() {
    try {
      const LotteryAlertService = require('../LotteryAlertService')
      const result = await LotteryAlertService.getAlertList({
        status: 'active',
        limit: 100
      })
      const lotteryTypes = ['win_rate', 'budget', 'inventory']
      return (result.alerts || []).filter(a => lotteryTypes.includes(a.alert_type)).length
    } catch (error) {
      logger.warn('[导航徽标] 抽奖告警计数失败', { error: error.message })
      return 0
    }
  }

  /**
   * 手动失效缓存
   *
   * @description 当待处理数据发生变化时调用此方法刷新缓存
   *
   * @param {string} reason - 失效原因（用于日志记录）
   * @returns {Promise<boolean>} 是否成功失效缓存
   *
   * @example
   * // 消费记录审核后刷新徽标
   * await NavBadgeService.invalidateCache('consumption_reviewed')
   */
  static async invalidateCache(reason = 'manual_invalidation') {
    const cacheKey = `${KEY_PREFIX}${CACHE_KEY}`
    return await BusinessCacheHelper.del(cacheKey, reason)
  }

  /**
   * 获取单个分类的徽标计数
   *
   * @description 获取指定分类的待处理数量（不使用缓存）
   *
   * @param {string} category - 分类标识
   * @returns {Promise<number>} 待处理数量
   */
  static async getCategoryCount(category) {
    switch (category) {
      case BADGE_CATEGORIES.CONSUMPTION:
        return await this._getConsumptionCount()
      case BADGE_CATEGORIES.CUSTOMER_SERVICE:
        return await this._getCustomerServiceCount()
      case BADGE_CATEGORIES.RISK_ALERT:
        return await this._getRiskAlertCount()
      case BADGE_CATEGORIES.LOTTERY_ALERT:
        return await this._getLotteryAlertCount()
      default:
        logger.warn('[导航徽标] 未知分类', { category })
        return 0
    }
  }
}

module.exports = NavBadgeService
module.exports.BADGE_CATEGORIES = BADGE_CATEGORIES
