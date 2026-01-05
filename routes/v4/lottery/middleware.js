/**
 * 餐厅积分抽奖系统 V4.0 - 抽奖中间件
 *
 * 功能：
 * - 请求去重（防止重复提交）
 * - 抽奖限流（20次/分钟/用户）
 * - 积分查询限流（60次/分钟/用户）
 *
 * 创建时间：2025年12月22日
 */

const logger = require('../../../utils/logger').logger
const BeijingTimeHelper = require('../../../utils/timeHelper')
const { getRateLimiter } = require('../../../middleware/RateLimiterMiddleware')

// 获取限流器实例
const rateLimiter = getRateLimiter()

/**
 * 请求去重缓存
 * 用途：防止用户多次点击导致重复提交
 * 实现：内存缓存，5秒内相同请求返回"处理中"
 */
const requestCache = new Map()

/**
 * 请求去重中间件
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 * @param {Function} next - 下一个中间件
 * @returns {void}
 */
function requestDeduplication (req, res, next) {
  const { campaign_code, draw_count = 1 } = req.body
  const user_id = req.user?.user_id

  if (!user_id || !campaign_code) {
    return next() // 参数不完整，继续执行后续逻辑
  }

  // 生成请求唯一标识
  const requestKey = `${user_id}_${campaign_code}_${draw_count}`

  // 检查是否存在相同的进行中请求
  const existingRequest = requestCache.get(requestKey)
  const now = Date.now()

  if (existingRequest && now - existingRequest.timestamp < 5000) {
    // 5秒内重复请求，返回"请求处理中"
    logger.warn(
      `⚠️ 请求去重: ${requestKey} 距离上次请求仅${Math.round((now - existingRequest.timestamp) / 1000)}秒`
    )
    return res.apiError(
      '请求处理中，请勿重复提交',
      'REQUEST_IN_PROGRESS',
      { request_key: requestKey },
      429
    )
  }

  // 记录本次请求
  requestCache.set(requestKey, {
    timestamp: now,
    status: 'processing'
  })

  // 请求完成后清理缓存
  const originalSend = res.send
  res.send = function (data) {
    // 延迟清理（5秒后），避免立即清理导致重复请求
    setTimeout(() => {
      requestCache.delete(requestKey)
    }, 5000)

    return originalSend.call(this, data)
  }

  return next()
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
  requestCache,
  requestDeduplication,
  lotteryRateLimiter,
  pointsRateLimiter
}
