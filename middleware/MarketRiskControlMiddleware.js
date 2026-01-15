/**
 * 交易市场风控限额中间件（MarketRiskControlMiddleware）
 *
 * 职责：
 * - 校验用户是否被冻结（账户级别）
 * - 校验用户日限次/日限额是否超出
 * - 实现 fail-closed 策略：Redis 不可用时拒绝挂牌/购买操作（撤回/取消不受影响）
 * - 提供 Redis 预占用+回滚机制（防止并发超限）
 *
 * 业务决策（2026-01-14 多币种扩展）：
 * - 挂牌统计维度：卖家 + 定价币种
 * - 购买统计维度：买家 + 支付币种
 * - 永久冻结、人工解冻
 * - 日限次重置时间：北京时间 00:00:00
 *
 * fail-closed 策略：
 * - Redis 不可用时：挂牌、购买操作拒绝（返回 503）
 * - Redis 不可用时：撤回、取消操作放行（不影响用户资产取回）
 *
 * @module middleware/MarketRiskControlMiddleware
 * @version 1.0.0
 * @date 2026-01-14
 */

const logger = require('../utils/logger').logger
const { getRedisClient, isRedisHealthy } = require('../utils/UnifiedRedisClient')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * Redis Key 前缀（风控计数器）
 * 格式：market_risk:{user_id}:{asset_code}:{date}:{metric}
 */
const REDIS_KEY_PREFIX = 'market_risk'

/**
 * 计数器 TTL（秒）
 * 设为 48 小时，确保跨天边界时统计仍然准确
 */
const COUNTER_TTL_SECONDS = 48 * 60 * 60

/**
 * 生成 Redis Key
 *
 * @function generateRedisKey
 * @param {number} userId - 用户ID
 * @param {string} assetCode - 币种代码
 * @param {string} metric - 指标类型（listings / trades / amount）
 * @param {string} [dateStr] - 日期字符串（YYYY-MM-DD），默认今天
 * @returns {string} Redis Key
 */
function generateRedisKey(userId, assetCode, metric, dateStr = null) {
  // 获取北京时间今天的日期字符串（YYYY-MM-DD）
  const date = dateStr || BeijingTimeHelper.formatDate(new Date(), 'YYYY-MM-DD')
  return `${REDIS_KEY_PREFIX}:${userId}:${assetCode}:${date}:${metric}`
}

/**
 * 市场风控中间件类
 *
 * @class MarketRiskControlMiddleware
 */
class MarketRiskControlMiddleware {
  /**
   * 构造函数，初始化 Redis 客户端连接
   *
   * @constructor
   */
  constructor() {
    this.redisClient = getRedisClient()
  }

  /**
   * 创建挂牌风控中间件
   *
   * 业务场景：
   * - 用户挂牌时校验日挂牌次数限制
   * - 用户被冻结时拒绝挂牌
   * - Redis 不可用时拒绝挂牌（fail-closed）
   *
   * @returns {Function} Express 中间件函数
   */
  createListingRiskMiddleware() {
    return async (req, res, next) => {
      try {
        // 1. 获取用户信息
        const userId = req.user?.user_id
        if (!userId) {
          return res.apiError('请先登录', 'UNAUTHORIZED', null, 401)
        }

        // 2. 从请求体获取定价币种（用于风控统计维度）
        const priceAssetCode = req.body?.price_asset_code || 'DIAMOND'

        // 3. Redis 健康检查（fail-closed 策略）
        const redisHealthy = await isRedisHealthy()
        if (!redisHealthy) {
          logger.error('[MarketRiskControl] Redis 不可用，执行 fail-closed 策略，拒绝挂牌', {
            user_id: userId,
            price_asset_code: priceAssetCode,
            path: req.path
          })

          return res.apiError(
            '系统繁忙，请稍后再试（风控服务暂不可用）',
            'RISK_SERVICE_UNAVAILABLE',
            { fail_closed: true },
            503
          )
        }

        /*
         * 4. 检查用户是否被冻结（从数据库检查，在 Service 层处理）
         * 此处不重复检查，由 MarketListingService.validateRiskLimitsForListing 处理
         *
         * 5. 将风控上下文注入到请求对象，供后续路由使用
         */
        const riskContext = {
          user_id: userId,
          price_asset_code: priceAssetCode,
          redis_healthy: true,
          check_timestamp: Date.now()
        }
        // eslint-disable-next-line require-atomic-updates -- Express 中间件顺序执行，无竞态条件
        req.riskContext = riskContext

        logger.debug('[MarketRiskControl] 挂牌风控预检通过', {
          user_id: userId,
          price_asset_code: priceAssetCode
        })

        next()
      } catch (error) {
        logger.error('[MarketRiskControl] 挂牌风控中间件异常', {
          error: error.message,
          stack: error.stack,
          user_id: req.user?.user_id
        })

        // 异常时执行 fail-closed 策略
        return res.apiError(
          '系统繁忙，请稍后再试',
          'RISK_MIDDLEWARE_ERROR',
          { error: error.message },
          503
        )
      }
    }
  }

  /**
   * 创建购买风控中间件
   *
   * 业务场景：
   * - 买家购买时校验日成交次数/日成交金额限制
   * - 买家被冻结时拒绝购买
   * - Redis 不可用时拒绝购买（fail-closed）
   *
   * @returns {Function} Express 中间件函数
   */
  createBuyRiskMiddleware() {
    return async (req, res, next) => {
      try {
        // 1. 获取用户信息
        const userId = req.user?.user_id
        if (!userId) {
          return res.apiError('请先登录', 'UNAUTHORIZED', null, 401)
        }

        // 2. Redis 健康检查（fail-closed 策略）
        const redisHealthy = await isRedisHealthy()
        if (!redisHealthy) {
          logger.error('[MarketRiskControl] Redis 不可用，执行 fail-closed 策略，拒绝购买', {
            user_id: userId,
            path: req.path
          })

          return res.apiError(
            '系统繁忙，请稍后再试（风控服务暂不可用）',
            'RISK_SERVICE_UNAVAILABLE',
            { fail_closed: true },
            503
          )
        }

        // 3. 将风控上下文注入到请求对象
        const buyRiskContext = {
          user_id: userId,
          redis_healthy: true,
          check_timestamp: Date.now()
        }
        // eslint-disable-next-line require-atomic-updates -- Express 中间件顺序执行，无竞态条件
        req.riskContext = buyRiskContext

        logger.debug('[MarketRiskControl] 购买风控预检通过', {
          user_id: userId
        })

        next()
      } catch (error) {
        logger.error('[MarketRiskControl] 购买风控中间件异常', {
          error: error.message,
          stack: error.stack,
          user_id: req.user?.user_id
        })

        return res.apiError(
          '系统繁忙，请稍后再试',
          'RISK_MIDDLEWARE_ERROR',
          { error: error.message },
          503
        )
      }
    }
  }

  /**
   * 创建撤回风控中间件（无 fail-closed 策略）
   *
   * 业务决策：
   * - 撤回/取消操作不受 Redis 可用性影响
   * - 允许用户在任何情况下取回自己的资产
   *
   * @returns {Function} Express 中间件函数
   */
  createWithdrawRiskMiddleware() {
    return async (req, res, next) => {
      try {
        const userId = req.user?.user_id
        if (!userId) {
          return res.apiError('请先登录', 'UNAUTHORIZED', null, 401)
        }

        // 撤回操作不执行 fail-closed，直接放行
        const redisHealthy = await isRedisHealthy()
        const withdrawRiskContext = {
          user_id: userId,
          redis_healthy: redisHealthy,
          skip_risk_check: true, // 标记跳过风控检查
          check_timestamp: Date.now()
        }
        // eslint-disable-next-line require-atomic-updates -- Express 中间件顺序执行，无竞态条件
        req.riskContext = withdrawRiskContext

        logger.debug('[MarketRiskControl] 撤回操作，跳过风控检查', {
          user_id: userId
        })

        next()
      } catch (error) {
        logger.error('[MarketRiskControl] 撤回风控中间件异常', {
          error: error.message,
          user_id: req.user?.user_id
        })

        // 撤回操作即使出错也放行（用户资产优先）
        next()
      }
    }
  }

  /**
   * 预占用 Redis 计数器（用于并发控制）
   *
   * 业务场景：
   * - 在实际挂牌/购买操作前先预占用计数器
   * - 操作成功后计数器自动保留
   * - 操作失败后需要调用 rollback 回滚计数器
   *
   * @param {number} userId - 用户ID
   * @param {string} assetCode - 币种代码
   * @param {string} metric - 指标类型（listings / trades / amount）
   * @param {number} increment - 增量（次数为 1，金额为具体值）
   * @returns {Promise<Object>} 预占用结果 {success, new_value, key}
   */
  async preOccupy(userId, assetCode, metric, increment = 1) {
    const key = generateRedisKey(userId, assetCode, metric)

    try {
      const client = await this.redisClient.ensureConnection()

      // 使用 INCRBY 原子操作
      const newValue = await client.incrby(key, increment)

      // 设置 TTL（如果是新 key）
      await client.expire(key, COUNTER_TTL_SECONDS)

      logger.debug('[MarketRiskControl] 预占用计数器', {
        key,
        increment,
        new_value: newValue
      })

      return {
        success: true,
        new_value: newValue,
        key,
        increment
      }
    } catch (error) {
      logger.error('[MarketRiskControl] 预占用计数器失败', {
        key,
        increment,
        error: error.message
      })

      return {
        success: false,
        error: error.message,
        key
      }
    }
  }

  /**
   * 回滚 Redis 计数器（操作失败时调用）
   *
   * @param {number} userId - 用户ID
   * @param {string} assetCode - 币种代码
   * @param {string} metric - 指标类型
   * @param {number} decrement - 减量
   * @returns {Promise<Object>} 回滚结果
   */
  async rollback(userId, assetCode, metric, decrement = 1) {
    const key = generateRedisKey(userId, assetCode, metric)

    try {
      const client = await this.redisClient.ensureConnection()

      // 使用 DECRBY 原子操作
      const newValue = await client.decrby(key, decrement)

      logger.debug('[MarketRiskControl] 回滚计数器', {
        key,
        decrement,
        new_value: newValue
      })

      return {
        success: true,
        new_value: Math.max(0, newValue), // 不允许负数
        key
      }
    } catch (error) {
      logger.error('[MarketRiskControl] 回滚计数器失败', {
        key,
        decrement,
        error: error.message
      })

      return {
        success: false,
        error: error.message,
        key
      }
    }
  }

  /**
   * 获取当前计数器值
   *
   * @param {number} userId - 用户ID
   * @param {string} assetCode - 币种代码
   * @param {string} metric - 指标类型
   * @returns {Promise<number>} 当前值（不存在则返回 0）
   */
  async getCurrentCount(userId, assetCode, metric) {
    const key = generateRedisKey(userId, assetCode, metric)

    try {
      const client = await this.redisClient.ensureConnection()
      const value = await client.get(key)
      return parseInt(value, 10) || 0
    } catch (error) {
      logger.error('[MarketRiskControl] 获取计数器失败', {
        key,
        error: error.message
      })
      return 0
    }
  }

  /**
   * 获取用户所有风控计数器
   *
   * @param {number} userId - 用户ID
   * @param {string} assetCode - 币种代码（可选，不传则返回所有币种）
   * @returns {Promise<Object>} 计数器统计 {listings, trades, amount}
   */
  async getUserRiskCounters(userId, assetCode = null) {
    // 获取北京时间今天的日期字符串（YYYY-MM-DD）
    const dateStr = BeijingTimeHelper.formatDate(new Date(), 'YYYY-MM-DD')
    const metrics = ['listings', 'trades', 'amount']
    const result = {}

    // 使用 Promise.all 避免循环中的 await
    const assetCodes = assetCode ? [assetCode] : ['DIAMOND', 'red_shard']

    const counterPromises = metrics.map(async metric => {
      if (assetCode) {
        const count = await this.getCurrentCount(userId, assetCode, metric)
        return { metric, count, isSingle: true }
      } else {
        const countsPerCode = await Promise.all(
          assetCodes.map(async code => {
            const cnt = await this.getCurrentCount(userId, code, metric)
            return { code, count: cnt }
          })
        )
        const codeMap = {}
        countsPerCode.forEach(({ code, count }) => {
          codeMap[code] = count
        })
        return { metric, count: codeMap, isSingle: false }
      }
    })

    const counterResults = await Promise.all(counterPromises)
    counterResults.forEach(({ metric, count }) => {
      result[metric] = count
    })

    return {
      user_id: userId,
      date: dateStr,
      asset_code: assetCode,
      counters: result
    }
  }
}

// 单例实例
let middlewareInstance = null

/**
 * 获取市场风控中间件单例
 *
 * @returns {MarketRiskControlMiddleware} 中间件实例
 */
function getMarketRiskControlMiddleware() {
  if (!middlewareInstance) {
    middlewareInstance = new MarketRiskControlMiddleware()
  }
  return middlewareInstance
}

module.exports = {
  MarketRiskControlMiddleware,
  getMarketRiskControlMiddleware,
  generateRedisKey,
  REDIS_KEY_PREFIX,
  COUNTER_TTL_SECONDS
}
