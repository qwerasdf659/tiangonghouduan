/**
 * 餐厅积分抽奖系统 V4.0 - 市场域共享中间件
 *
 * 功能：
 * - 匿名行情公开限流（IP 维度，默认 100 次/分钟）
 *
 * 设计说明（与 routes/v4/lottery/middleware.js 同范式）：
 * - 域内多个路由文件（price.js / analytics.js）共用同一限流实例，
 *   避免在各文件重复定义同一份限流配置（消除重复、降低维护面）
 * - 5 个公开行情接口（price/trend、price/volume、price/summary、
 *   price/recent-trades、analytics/history）共用同一 keyPrefix，
 *   按 IP「合计」计数，符合拍板项③/⑧（IP×100/分）
 */

'use strict'

const logger = require('../../../utils/logger').logger
const { getRateLimiter } = require('../../../middleware/RateLimiterMiddleware')

// 获取限流器实例（单例）
const rateLimiter = getRateLimiter()

/**
 * 匿名行情公开限流中间件
 *
 * - 阈值来自 .env MARKET_PUBLIC_RATE_LIMIT_PER_MIN（单一真相源，运营可热调）
 * - keyGenerator: 'ip' —— 行情无 user_id 维度需求，匿名/登录用户统一按 IP 计数
 * - 置于 optionalAuth 之后：匿名放行、登录用户照常识别，再进入限流
 * - 超限返回统一 429 + code:RATE_LIMIT_EXCEEDED（由 RateLimiterMiddleware 统一处理）
 */
const marketPublicRateLimiter = rateLimiter.createLimiter({
  windowMs: 60 * 1000,
  max: parseInt(process.env.MARKET_PUBLIC_RATE_LIMIT_PER_MIN, 10) || 100,
  keyPrefix: 'rate_limit:market_public:',
  keyGenerator: 'ip',
  message: '行情查询过于频繁，请稍后再试',
  onLimitReached: (req, key, count) => {
    logger.warn('[MarketPublic] 匿名行情限流触发', {
      ip: req.ip,
      path: req.path,
      count
    })
  }
})

module.exports = {
  marketPublicRateLimiter
}
