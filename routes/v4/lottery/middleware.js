/**
 * 天工商户营销平台 V4.0 - 抽奖中间件
 *
 * 功能：
 * - 请求去重（防止重复提交）
 * - 抽奖限流（20次/分钟/用户）
 * - 积分查询限流（60次/分钟/用户）
 *
 */

const logger = require('../../../utils/logger').logger
const BeijingTimeHelper = require('../../../utils/timeHelper')
const { getRateLimiter } = require('../../../middleware/RateLimiterMiddleware')
const { getRawClient } = require('../../../utils/UnifiedRedisClient')

// 获取限流器实例
const rateLimiter = getRateLimiter()

/**
 * 请求去重 Redis Key 前缀
 *
 * 用途：防止用户多次点击导致重复提交抽奖请求
 * 实现：Redis SET NX PX 原子占位，5秒内相同请求直接拒绝
 *
 * R2（cluster 跨进程去重）：
 * - 原实现用进程内 Map，cluster 多 worker 下去重失效（连点可能落到不同 worker）
 * - 改用 Redis 原子写后，所有 worker 共享去重状态，连点必被拦截
 * - 注意：业务正确性（不重复扣分）最终由抽奖 Service 的 DB 行锁事务兜底，
 *   此处去重仅为「快速拒绝重复点击」的第一道闸门
 */
const DEDUP_KEY_PREFIX = 'lottery:dedup:'
const DEDUP_TTL_MS = 5000

/**
 * 请求去重中间件
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 * @param {Function} next - 下一个中间件
 * @returns {Promise<void>} 无返回值，重复请求时返回429，否则放行
 */
async function requestDeduplication(req, res, next) {
  const { campaign_code, draw_count = 1 } = req.body
  const user_id = req.user?.user_id

  if (!user_id || !campaign_code) {
    return next() // 参数不完整，继续执行后续逻辑
  }

  // 生成请求唯一标识（Redis Key）
  const requestKey = `${DEDUP_KEY_PREFIX}${user_id}_${campaign_code}_${draw_count}`

  try {
    const redis = getRawClient()

    /*
     * 原子占位：SET requestKey 1 PX 5000 NX
     * - 返回 'OK'：占位成功（首次请求），放行
     * - 返回 null：key 已存在（5秒内重复请求），拒绝
     * TTL 到期自动释放，无需 res.send 钩子手动清理
     */
    const acquired = await redis.set(requestKey, '1', 'PX', DEDUP_TTL_MS, 'NX')

    if (acquired !== 'OK') {
      logger.warn(`⚠️ 请求去重: ${requestKey} 5秒内重复提交，已拦截`)
      return res.apiError(
        '请求处理中，请勿重复提交',
        'REQUEST_IN_PROGRESS',
        { request_key: requestKey },
        429
      )
    }

    return next()
  } catch (error) {
    /*
     * Redis 异常时 fail-open 放行（与限流中间件一致的降级策略）：
     * 去重失效不会造成资损——抽奖 Service 的 DB 行锁事务是不重复扣分的最终保证。
     */
    logger.error('[Lottery] 请求去重 Redis 异常，降级放行', {
      user_id,
      campaign_code,
      error: error.message,
      timestamp: BeijingTimeHelper.now()
    })
    return next()
  }
}

/**
 * 创建抽奖专用限流中间件 - 20次/分钟/用户
 * 防止恶意用户频繁抽奖，保护系统稳定性
 */
const lotteryRateLimiter = rateLimiter.createLimiter({
  windowMs: 60 * 1000, // 1分钟窗口
  max: 20, // 最多20次抽奖
  keyPrefix: 'rate_limit:lottery:',
  keyGenerator: 'user', // 按用户限流
  message: '抽奖过于频繁，请稍后再试',
  onLimitReached: (req, key, count) => {
    logger.warn('[Lottery] 抽奖限流触发', {
      user_id: req.user?.user_id,
      count,
      limit: 20,
      timestamp: BeijingTimeHelper.now()
    })
  }
})

/**
 * 创建积分查询限流中间件 - 60次/分钟/用户
 * 防止恶意用户通过脚本大量查询积分，保护数据库和服务器
 * 限流策略：比抽奖更宽松（60次 vs 20次），因为查询频率低于抽奖
 */
const pointsRateLimiter = rateLimiter.createLimiter({
  windowMs: 60 * 1000, // 1分钟窗口
  max: 60, // 最多60次查询
  keyPrefix: 'rate_limit:points:',
  keyGenerator: 'user', // 按用户ID限流
  message: '查询过于频繁，请稍后再试',
  onLimitReached: (req, key, count) => {
    logger.warn('[Points] 积分查询限流触发', {
      user_id: req.user?.user_id,
      target_user_id: req.params.user_id,
      count,
      limit: 60,
      timestamp: BeijingTimeHelper.now()
    })
  }
})

module.exports = {
  requestDeduplication,
  lotteryRateLimiter,
  pointsRateLimiter
}
