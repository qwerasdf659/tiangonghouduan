/**
 * 物品锁定率监控服务（ItemLockRateService）
 *
 * 业务场景：
 * - 监控物品实例的锁定状态
 * - 统计锁定率用于识别潜在问题
 * - 提供锁定率告警判断
 *
 * 告警规则：
 * - 锁定率 > 20%：触发 warning 告警
 * - 锁定率 > 40%：触发 critical 告警
 *
 * API 端点：
 * - GET /api/v4/console/item-templates/lock-rate
 *
 * ServiceManager 键名：item_lock_rate
 *
 * 关联需求：
 * - 《运营后台优化 - 后端需求文档》§5.4
 *
 * 创建时间：2026-02-03
 * @version 1.0.0
 */

'use strict'

const { fn, col, literal } = require('sequelize')
const { BusinessCacheHelper, KEY_PREFIX } = require('../../utils/BusinessCacheHelper')
const BeijingTimeHelper = require('../../utils/timeHelper')
const logger = require('../../utils/logger').logger

/**
 * 锁定率告警阈值配置
 * @constant
 */
const LOCK_RATE_THRESHOLDS = {
  /** 警告阈值（20%） */
  WARNING: 0.2,
  /** 严重阈值（40%） */
  CRITICAL: 0.4
}

/**
 * 缓存配置
 * @constant
 */
const CACHE_KEY = 'item_lock_rate'
const CACHE_TTL = 300 // 5分钟缓存

/**
 * 物品锁定率监控服务
 *
 * @description 提供物品锁定率统计和告警功能
 */
class ItemLockRateService {
  /**
   * 构造函数
   * @param {Object} models - Sequelize 模型集合
   */
  constructor(models) {
    this.models = models
  }

  /**
   * 获取物品锁定率统计（主方法）
   *
   * @description 统计物品锁定率并判断告警级别
   *
   * @param {Object} [options] - 可选参数
   * @param {boolean} [options.use_cache=true] - 是否使用缓存
   * @param {boolean} [options.by_template=false] - 是否按模板分组统计
   *
   * @returns {Promise<Object>} 锁定率统计结果
   * @returns {Object} return.summary - 汇总统计
   * @returns {string} return.alert_level - 告警级别（null/warning/critical）
   * @returns {Array<Object>} return.by_template - 按模板分组的统计（可选）
   * @returns {string} return.updated_at - 更新时间
   *
   * @example
   * const stats = await itemLockRateService.getLockRateStats()
   * // { summary: { total_items: 1000, locked_items: 150, lock_rate: 0.15 }, alert_level: null }
   */
  async getLockRateStats(options = {}) {
    const { use_cache = true, by_template = false } = options
    const cacheKey = `${KEY_PREFIX}${CACHE_KEY}${by_template ? '_by_template' : ''}`

    try {
      // 1. 尝试从缓存获取
      if (use_cache) {
        const cached = await BusinessCacheHelper.get(cacheKey)
        if (cached) {
          logger.debug('[物品锁定率] 使用缓存数据')
          return cached
        }
      }

      // 2. 获取汇总统计
      const summary = await this._getSummaryStats()

      // 3. 判断告警级别
      const alertLevel = this._determineAlertLevel(summary.lock_rate)

      // 4. 可选：按模板分组统计
      let byTemplate = []
      if (by_template) {
        byTemplate = await this._getStatsByTemplate()
      }

      const result = {
        summary,
        alert_level: alertLevel,
        thresholds: {
          warning: LOCK_RATE_THRESHOLDS.WARNING,
          critical: LOCK_RATE_THRESHOLDS.CRITICAL
        },
        by_template: by_template ? byTemplate : undefined,
        updated_at: BeijingTimeHelper.apiTimestamp()
      }

      // 5. 写入缓存
      await BusinessCacheHelper.set(cacheKey, result, CACHE_TTL)

      logger.info('[物品锁定率] 统计计算完成', {
        lock_rate: summary.lock_rate,
        alert_level: alertLevel
      })

      return result
    } catch (error) {
      logger.error('[物品锁定率] 获取统计失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取汇总统计
   *
   * @private
   * @returns {Promise<Object>} 汇总统计结果
   */
  async _getSummaryStats() {
    try {
      const result = await this.models.Item.findOne({
        attributes: [
          [fn('COUNT', col('item_id')), 'total_items'],
          [fn('SUM', literal(`CASE WHEN status = 'locked' THEN 1 ELSE 0 END`)), 'locked_items']
        ],
        raw: true
      })

      const totalItems = parseInt(result?.total_items || 0, 10)
      const lockedItems = parseInt(result?.locked_items || 0, 10)
      const lockRate = totalItems > 0 ? lockedItems / totalItems : 0

      return {
        total_items: totalItems,
        locked_items: lockedItems,
        lock_rate: parseFloat(lockRate.toFixed(4))
      }
    } catch (error) {
      logger.error('[物品锁定率] 汇总统计计算失败', { error: error.message })
      return {
        total_items: 0,
        locked_items: 0,
        lock_rate: 0
      }
    }
  }

  /**
   * 按模板分组统计
   *
   * @private
   * @returns {Promise<Array<Object>>} 分组统计列表
   */
  async _getStatsByTemplate() {
    try {
      const results = await this.models.Item.findAll({
        attributes: [
          'item_template_id',
          [fn('COUNT', col('item_id')), 'total_items'],
          [fn('SUM', literal(`CASE WHEN status = 'locked' THEN 1 ELSE 0 END`)), 'locked_items']
        ],
        include: [
          {
            model: this.models.ItemTemplate,
            as: 'template',
            attributes: ['name', 'category_code']
          }
        ],
        group: ['item_template_id'],
        raw: true,
        nest: true
      })

      return results
        .map(row => {
          const totalItems = parseInt(row.total_items || 0, 10)
          const lockedItems = parseInt(row.locked_items || 0, 10)
          const lockRate = totalItems > 0 ? lockedItems / totalItems : 0

          return {
            item_template_id: row.item_template_id,
            template_name: row.template?.name || '未知',
            category_code: row.template?.category_code || 'UNKNOWN',
            total_items: totalItems,
            locked_items: lockedItems,
            lock_rate: parseFloat(lockRate.toFixed(4)),
            alert_level: this._determineAlertLevel(lockRate)
          }
        })
        .sort((a, b) => b.lock_rate - a.lock_rate) // 按锁定率降序排列
    } catch (error) {
      logger.error('[物品锁定率] 分组统计计算失败', { error: error.message })
      return []
    }
  }

  /**
   * 判断告警级别
   *
   * @private
   * @param {number} lockRate - 锁定率
   * @returns {string|null} 告警级别（null/warning/critical）
   */
  _determineAlertLevel(lockRate) {
    if (lockRate >= LOCK_RATE_THRESHOLDS.CRITICAL) {
      return 'critical'
    } else if (lockRate >= LOCK_RATE_THRESHOLDS.WARNING) {
      return 'warning'
    }
    return null
  }

  /**
   * 检查并触发告警
   *
   * @description 检查锁定率是否超过阈值，超过则创建告警
   *
   * @returns {Promise<Object>} 告警检查结果
   */
  async checkAndTriggerAlert() {
    try {
      const stats = await this.getLockRateStats({ use_cache: false })

      if (stats.alert_level) {
        logger.warn('[物品锁定率] 触发告警', {
          lock_rate: stats.summary.lock_rate,
          alert_level: stats.alert_level
        })

        /*
         * 可以在这里调用告警服务创建告警
         * await AlertService.createAlert({ ... })
         */
      }

      return {
        checked: true,
        alert_triggered: !!stats.alert_level,
        alert_level: stats.alert_level,
        lock_rate: stats.summary.lock_rate
      }
    } catch (error) {
      logger.error('[物品锁定率] 告警检查失败', { error: error.message })
      return {
        checked: false,
        error: error.message
      }
    }
  }

  /**
   * 手动失效缓存
   *
   * @param {string} reason - 失效原因
   * @returns {Promise<boolean>} 是否成功失效缓存
   */
  async invalidateCache(reason = 'manual_invalidation') {
    const cacheKey = `${KEY_PREFIX}${CACHE_KEY}`
    const cacheKeyByTemplate = `${KEY_PREFIX}${CACHE_KEY}_by_template`

    const result1 = await BusinessCacheHelper.del(cacheKey, reason)
    const result2 = await BusinessCacheHelper.del(cacheKeyByTemplate, reason)

    return result1 && result2
  }
}

module.exports = ItemLockRateService
