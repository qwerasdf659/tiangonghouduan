'use strict'

/**
 * @file 抽奖指标采集器（Redis 实时计数层）
 * @description 负责抽奖策略引擎监控方案中的实时指标采集。
 *
 * 核心职责：
 * - 采集抽奖相关的实时指标到 Redis（INCR 原子计数）
 * - 支持高并发场景（Redis 原子操作保证准确性）
 * - 为小时聚合任务提供数据源
 *
 * 数据流向：
 * - 写入：在 SettleStage 结算完成后调用，收集单次抽奖的指标
 * - 读取：每小时定时任务从 Redis 聚合到 MySQL lottery_hourly_metrics
 *
 * Redis Key 设计规范：
 * - lottery:metrics:{campaign_id}:{metric_type}:{hour_bucket}
 * - TTL：25 小时（保留至下一小时聚合完成）
 *
 * 采集指标清单：
 * - total_draws：总抽奖次数
 * - unique_users：独立用户数（HyperLogLog）
 * - b0_count / b1_count / b2_count / b3_count：Budget Tier 分布
 * - empty_count：真正空奖次数（系统异常导致，需运营关注）
 * - fallback_tier_count：保底奖品次数（正常保底机制）
 * - high_tier_count / mid_tier_count / low_tier_count：奖品档位分布
 * - pity_triggered：Pity 保底触发次数
 * - anti_empty_triggered：反连空触发次数
 * - anti_high_triggered：反连高触发次数
 * - luck_debt_triggered：运气债务触发次数
 * - total_budget_consumed：总预算消耗（积分）
 * - total_prize_value：总奖品价值（积分）
 *
 * 使用方式（在 SettleStage 结算完成后调用）：
 * ```javascript
 * const collector = require('./LotteryMetricsCollector')
 * await collector.recordDraw({
 *   campaign_id: 1,
 *   user_id: 123,
 *   selected_tier: 'mid',
 *   budget_tier: 'B2',
 *   prize_value: 50,
 *   budget_consumed: 10,
 *   triggers: {
 *     pity_triggered: false,
 *     anti_empty_triggered: true,
 *     anti_high_triggered: false,
 *     luck_debt_triggered: false
 *   }
 * })
 * ```
 *
 * @version 1.0.0
 * @date 2026-01-22
 * @module services/LotteryMetricsCollector
 */

const { getRawClient } = require('../utils/UnifiedRedisClient')
const { logger: _logger } = require('../utils/logger')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 默认 TTL（秒）：25 小时
 * 保留至下一小时聚合完成后仍有一定缓冲时间
 */
const DEFAULT_TTL_SECONDS = 25 * 60 * 60

/**
 * Redis Key 前缀
 */
const KEY_PREFIX = 'lottery:metrics'

/**
 * Budget Tier 映射表（与抽奖引擎 BudgetProvider 一致）
 */
const BUDGET_TIER_MAP = {
  B0: 'b0_count', // 无预算
  B1: 'b1_count', // 低预算（≤100）
  B2: 'b2_count', // 中预算（101-500）
  B3: 'b3_count' // 高预算（>500）
}

/**
 * 奖品档位映射表（与抽奖引擎 reward_tier 一致）
 *
 * 注意：empty 与 fallback 分开统计
 * - fallback：正常保底机制触发，预期行为
 * - empty：系统异常或配置问题导致的空奖，需要运营关注
 */
const TIER_MAP = {
  high: 'high_tier_count',
  mid: 'mid_tier_count',
  low: 'low_tier_count',
  fallback: 'fallback_tier_count',
  empty: 'empty_count' // 真正空奖：与 fallback 保底分开统计
}

/**
 * 体验机制触发映射表
 */
const TRIGGER_MAP = {
  pity_triggered: 'pity_triggered',
  anti_empty_triggered: 'anti_empty_triggered',
  anti_high_triggered: 'anti_high_triggered',
  luck_debt_triggered: 'luck_debt_triggered'
}

/**
 * 抽奖指标采集器类
 *
 * 负责将抽奖相关的实时指标采集到 Redis，使用原子 INCR 操作保证高并发准确性。
 *
 * @class LotteryMetricsCollector
 */
class LotteryMetricsCollector {
  /**
   * 创建采集器实例
   *
   * @param {Object} options - 配置选项
   * @param {number} options.ttl_seconds - Redis Key 的 TTL（默认 25 小时）
   * @param {boolean} options.silent_errors - 是否静默错误（默认 true，避免影响主业务流程）
   */
  constructor(options = {}) {
    this.ttl_seconds = options.ttl_seconds || DEFAULT_TTL_SECONDS
    this.silent_errors = options.silent_errors !== false // 默认 true
    this.logger = _logger || console
  }

  /**
   * 获取 Redis 客户端（延迟获取）
   *
   * @returns {Object} ioredis 客户端实例
   * @private
   */
  _getClient() {
    return getRawClient()
  }

  /**
   * 生成小时桶标识（北京时间）
   * 格式：YYYYMMDDHH
   *
   * @param {Date|string} timestamp - 时间戳（可选，默认当前时间）
   * @returns {string} 小时桶标识
   * @example
   * _getHourBucket() // 返回 '2026012214'（2026年1月22日14点）
   */
  _getHourBucket(timestamp = null) {
    const date = timestamp ? new Date(timestamp) : new Date()
    // 使用 BeijingTimeHelper 格式化为北京时间（YYYYMMDDHH）
    const formatted = BeijingTimeHelper.formatDate(date, 'YYYY-MM-DD HH:mm:ss')
    // 提取并拼接为 YYYYMMDDHH 格式
    return (
      formatted.substring(0, 4) +
      formatted.substring(5, 7) +
      formatted.substring(8, 10) +
      formatted.substring(11, 13)
    )
  }

  /**
   * 生成日期标识（北京时间）
   * 格式：YYYYMMDD
   *
   * @param {Date|string} timestamp - 时间戳（可选，默认当前时间）
   * @returns {string} 日期标识
   */
  _getDateBucket(timestamp = null) {
    const date = timestamp ? new Date(timestamp) : new Date()
    // 使用 BeijingTimeHelper 格式化为北京时间（YYYYMMDD）
    const formatted = BeijingTimeHelper.formatDate(date, 'YYYY-MM-DD')
    // 去除破折号
    return formatted.replace(/-/g, '')
  }

  /**
   * 构建 Redis Key
   *
   * @param {number} campaign_id - 活动ID
   * @param {string} metric_type - 指标类型
   * @param {string} bucket - 时间桶标识
   * @returns {string} 完整的 Redis Key
   * @example
   * _buildKey(1, 'total_draws', '2026012214') // 返回 'lottery:metrics:1:total_draws:2026012214'
   */
  _buildKey(campaign_id, metric_type, bucket) {
    return `${KEY_PREFIX}:${campaign_id}:${metric_type}:${bucket}`
  }

  /**
   * 安全执行 Redis 操作（带错误处理）
   *
   * @param {Function} operation - 要执行的 Redis 操作
   * @param {string} operation_name - 操作名称（用于日志）
   * @returns {Promise<any>} 操作结果
   * @private
   */
  async _safeExecute(operation, operation_name) {
    try {
      return await operation()
    } catch (error) {
      if (this.silent_errors) {
        this.logger.warn(`[LotteryMetricsCollector] ${operation_name} 失败（静默处理）`, {
          error: error.message
        })
        return null
      }
      throw error
    }
  }

  /**
   * 原子递增计数器
   *
   * @param {number} campaign_id - 活动ID
   * @param {string} metric_type - 指标类型
   * @param {string} hour_bucket - 小时桶标识
   * @param {number} increment - 增量值（默认 1）
   * @returns {Promise<number|null>} 递增后的值
   * @private
   */
  async _incrMetric(campaign_id, metric_type, hour_bucket, increment = 1) {
    const key = this._buildKey(campaign_id, metric_type, hour_bucket)
    return this._safeExecute(async () => {
      const client = this._getClient()
      const result = await client.incrby(key, increment)
      // 设置 TTL（仅在首次创建时设置）
      await client.expire(key, this.ttl_seconds)
      return result
    }, `INCR ${key}`)
  }

  /**
   * 原子递增浮点数计数器（用于金额类指标）
   *
   * @param {number} campaign_id - 活动ID
   * @param {string} metric_type - 指标类型
   * @param {string} hour_bucket - 小时桶标识
   * @param {number} increment - 增量值（浮点数）
   * @returns {Promise<string|null>} 递增后的值（字符串形式）
   * @private
   */
  async _incrFloatMetric(campaign_id, metric_type, hour_bucket, increment) {
    const key = this._buildKey(campaign_id, metric_type, hour_bucket)
    return this._safeExecute(async () => {
      const client = this._getClient()
      const result = await client.incrbyfloat(key, increment)
      await client.expire(key, this.ttl_seconds)
      return result
    }, `INCRBYFLOAT ${key}`)
  }

  /**
   * 添加独立用户（HyperLogLog）
   *
   * @param {number} campaign_id - 活动ID
   * @param {number} user_id - 用户ID
   * @param {string} date_bucket - 日期桶标识
   * @returns {Promise<number|null>} 是否新增（1=新增，0=已存在）
   * @private
   */
  async _pfAddUser(campaign_id, user_id, date_bucket) {
    const key = this._buildKey(campaign_id, 'unique_users', date_bucket)
    return this._safeExecute(async () => {
      const client = this._getClient()
      const result = await client.pfadd(key, user_id.toString())
      await client.expire(key, 48 * 60 * 60) // 48 小时 TTL
      return result
    }, `PFADD ${key}`)
  }

  /**
   * 记录单次抽奖的所有指标
   *
   * 在 SettleStage 结算完成后调用，一次性采集所有相关指标。
   * 使用 Redis Pipeline 批量执行，减少网络往返。
   *
   * @param {Object} draw_data - 抽奖数据
   * @param {number} draw_data.campaign_id - 活动ID
   * @param {number} draw_data.user_id - 用户ID
   * @param {string} draw_data.selected_tier - 选中的奖品档位（high/mid/low/fallback）
   * @param {string} draw_data.budget_tier - 预算档位（B0/B1/B2/B3）
   * @param {number} draw_data.prize_value - 奖品价值（积分）
   * @param {number} draw_data.budget_consumed - 预算消耗（积分）
   * @param {Object} draw_data.triggers - 体验机制触发情况
   * @param {boolean} draw_data.triggers.pity_triggered - Pity 保底是否触发
   * @param {boolean} draw_data.triggers.anti_empty_triggered - 反连空是否触发
   * @param {boolean} draw_data.triggers.anti_high_triggered - 反连高是否触发
   * @param {boolean} draw_data.triggers.luck_debt_triggered - 运气债务是否触发
   * @param {Date|string} draw_data.timestamp - 抽奖时间（可选，默认当前时间）
   * @returns {Promise<Object>} 采集结果
   * @example
   * const result = await collector.recordDraw({
   *   campaign_id: 1,
   *   user_id: 123,
   *   selected_tier: 'mid',
   *   budget_tier: 'B2',
   *   prize_value: 50,
   *   budget_consumed: 10,
   *   triggers: {
   *     pity_triggered: false,
   *     anti_empty_triggered: true,
   *     anti_high_triggered: false,
   *     luck_debt_triggered: false
   *   }
   * })
   */
  async recordDraw(draw_data) {
    const {
      campaign_id,
      user_id,
      selected_tier,
      budget_tier,
      prize_value = 0,
      budget_consumed = 0,
      triggers = {},
      timestamp = null
    } = draw_data

    // 参数验证
    if (!campaign_id || !user_id) {
      this.logger.warn('[LotteryMetricsCollector] recordDraw 缺少必需参数', {
        campaign_id,
        user_id
      })
      return { success: false, error: 'MISSING_REQUIRED_PARAMS' }
    }

    const hour_bucket = this._getHourBucket(timestamp)
    const date_bucket = this._getDateBucket(timestamp)

    try {
      const client = this._getClient()
      const pipeline = client.pipeline()

      // 1. 总抽奖次数
      const total_draws_key = this._buildKey(campaign_id, 'total_draws', hour_bucket)
      pipeline.incr(total_draws_key)
      pipeline.expire(total_draws_key, this.ttl_seconds)

      // 2. 独立用户（HyperLogLog）
      const unique_users_key = this._buildKey(campaign_id, 'unique_users', date_bucket)
      pipeline.pfadd(unique_users_key, user_id.toString())
      pipeline.expire(unique_users_key, 48 * 60 * 60)

      // 3. Budget Tier 分布
      if (budget_tier && BUDGET_TIER_MAP[budget_tier]) {
        const budget_tier_key = this._buildKey(
          campaign_id,
          BUDGET_TIER_MAP[budget_tier],
          hour_bucket
        )
        pipeline.incr(budget_tier_key)
        pipeline.expire(budget_tier_key, this.ttl_seconds)
      }

      // 4. 奖品档位分布
      if (selected_tier && TIER_MAP[selected_tier]) {
        const tier_key = this._buildKey(campaign_id, TIER_MAP[selected_tier], hour_bucket)
        pipeline.incr(tier_key)
        pipeline.expire(tier_key, this.ttl_seconds)

        /*
         * 真正空奖（empty）运营预警日志
         * empty 表示系统异常或配置问题导致的空奖，需要运营关注
         * 与 fallback（正常保底机制）区分开
         */
        if (selected_tier === 'empty') {
          this.logger.warn('[LotteryMetricsCollector] 检测到真正空奖（empty），请运营关注！', {
            campaign_id,
            user_id,
            hour_bucket,
            alert_type: 'EMPTY_PRIZE_DETECTED',
            message: '系统出现空奖，可能是奖品配置问题或库存不足'
          })
        }
      }

      // 5. 体验机制触发统计
      for (const [trigger_name, redis_field] of Object.entries(TRIGGER_MAP)) {
        if (triggers[trigger_name] === true) {
          const trigger_key = this._buildKey(campaign_id, redis_field, hour_bucket)
          pipeline.incr(trigger_key)
          pipeline.expire(trigger_key, this.ttl_seconds)
        }
      }

      // 7. 总预算消耗（浮点数累加）
      if (budget_consumed > 0) {
        const budget_key = this._buildKey(campaign_id, 'total_budget_consumed', hour_bucket)
        pipeline.incrbyfloat(budget_key, budget_consumed)
        pipeline.expire(budget_key, this.ttl_seconds)
      }

      // 8. 总奖品价值（浮点数累加）
      if (prize_value > 0) {
        const prize_key = this._buildKey(campaign_id, 'total_prize_value', hour_bucket)
        pipeline.incrbyfloat(prize_key, prize_value)
        pipeline.expire(prize_key, this.ttl_seconds)
      }

      // 执行 Pipeline
      const results = await pipeline.exec()

      // 检查执行结果
      const errors = results.filter(([err]) => err !== null)
      if (errors.length > 0) {
        this.logger.warn('[LotteryMetricsCollector] Pipeline 部分操作失败', {
          campaign_id,
          user_id,
          error_count: errors.length,
          errors: errors.map(([err]) => err.message)
        })
      }

      this.logger.debug('[LotteryMetricsCollector] recordDraw 完成', {
        campaign_id,
        user_id,
        hour_bucket,
        selected_tier,
        budget_tier,
        operations_count: results.length
      })

      return {
        success: true,
        hour_bucket,
        date_bucket,
        operations_count: results.length,
        error_count: errors.length
      }
    } catch (error) {
      if (this.silent_errors) {
        this.logger.warn('[LotteryMetricsCollector] recordDraw 失败（静默处理）', {
          campaign_id,
          user_id,
          error: error.message
        })
        return { success: false, error: error.message }
      }
      throw error
    }
  }

  /**
   * 获取指定小时的所有指标
   *
   * 用于小时聚合任务从 Redis 读取数据。
   *
   * @param {number} campaign_id - 活动ID
   * @param {string} hour_bucket - 小时桶标识（YYYYMMDDHH）
   * @returns {Promise<Object>} 该小时的所有指标
   * @example
   * const metrics = await collector.getHourMetrics(1, '2026012214')
   * // 返回 { total_draws: 100, b0_count: 10, b1_count: 30, ... }
   */
  async getHourMetrics(campaign_id, hour_bucket) {
    try {
      const client = this._getClient()
      const pipeline = client.pipeline()

      // 需要获取的指标列表
      const metric_types = [
        'total_draws',
        'b0_count',
        'b1_count',
        'b2_count',
        'b3_count',
        'high_tier_count',
        'mid_tier_count',
        'low_tier_count',
        'fallback_tier_count',
        'empty_count',
        'pity_triggered',
        'anti_empty_triggered',
        'anti_high_triggered',
        'luck_debt_triggered',
        'total_budget_consumed',
        'total_prize_value'
      ]

      // 构建批量获取命令
      for (const metric_type of metric_types) {
        const key = this._buildKey(campaign_id, metric_type, hour_bucket)
        pipeline.get(key)
      }

      // 执行 Pipeline
      const results = await pipeline.exec()

      // 构建返回对象
      const metrics = {}
      for (let i = 0; i < metric_types.length; i++) {
        const [err, value] = results[i]
        if (err) {
          this.logger.warn(`[LotteryMetricsCollector] 获取 ${metric_types[i]} 失败`, {
            error: err.message
          })
          metrics[metric_types[i]] = 0
        } else {
          // 数值类型转换
          const float_metrics = ['total_budget_consumed', 'total_prize_value']
          if (float_metrics.includes(metric_types[i])) {
            metrics[metric_types[i]] = parseFloat(value) || 0
          } else {
            metrics[metric_types[i]] = parseInt(value) || 0
          }
        }
      }

      return metrics
    } catch (error) {
      this.logger.error('[LotteryMetricsCollector] getHourMetrics 失败', {
        campaign_id,
        hour_bucket,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 获取指定日期的独立用户数
   *
   * @param {number} campaign_id - 活动ID
   * @param {string} date_bucket - 日期桶标识（YYYYMMDD）
   * @returns {Promise<number>} 独立用户数
   */
  async getUniqueUsersCount(campaign_id, date_bucket) {
    try {
      const client = this._getClient()
      const key = this._buildKey(campaign_id, 'unique_users', date_bucket)
      const count = await client.pfcount(key)
      return count
    } catch (error) {
      this.logger.error('[LotteryMetricsCollector] getUniqueUsersCount 失败', {
        campaign_id,
        date_bucket,
        error: error.message
      })
      throw error
    }
  }

  /**
   * 删除指定小时的所有指标（清理用途）
   *
   * @param {number} campaign_id - 活动ID
   * @param {string} hour_bucket - 小时桶标识（YYYYMMDDHH）
   * @returns {Promise<number>} 删除的 Key 数量
   */
  async deleteHourMetrics(campaign_id, hour_bucket) {
    try {
      const client = this._getClient()
      const pattern = `${KEY_PREFIX}:${campaign_id}:*:${hour_bucket}`

      // 使用 SCAN 安全获取匹配的 Keys（SCAN 迭代必须使用循环 await）
      const keys = []
      let cursor = '0'
      do {
        // eslint-disable-next-line no-await-in-loop -- Redis SCAN 迭代器需要逐步推进游标
        const [newCursor, matchedKeys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
        cursor = newCursor
        keys.push(...matchedKeys)
      } while (cursor !== '0')

      if (keys.length === 0) {
        return 0
      }

      // 批量删除
      const deleted_count = await client.del(...keys)
      this.logger.info('[LotteryMetricsCollector] deleteHourMetrics 完成', {
        campaign_id,
        hour_bucket,
        deleted_count
      })
      return deleted_count
    } catch (error) {
      this.logger.error('[LotteryMetricsCollector] deleteHourMetrics 失败', {
        campaign_id,
        hour_bucket,
        error: error.message
      })
      throw error
    }
  }
}

// ========== 单例导出 ==========

/**
 * 获取单例实例
 * @type {LotteryMetricsCollector}
 */
let _instance = null

/**
 * 获取 LotteryMetricsCollector 单例
 *
 * @param {Object} options - 配置选项
 * @returns {LotteryMetricsCollector} 采集器实例
 */
function getInstance(options = {}) {
  if (!_instance) {
    _instance = new LotteryMetricsCollector(options)
  }
  return _instance
}

module.exports = {
  LotteryMetricsCollector,
  getInstance
}
