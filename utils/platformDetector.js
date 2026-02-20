/**
 * 登录平台检测工具（platformDetector）
 *
 * 从 HTTP 请求中识别登录来源平台，用于多平台会话隔离。
 * 识别策略（优先级从高到低）：
 *   1. 请求体 req.body.platform 字段（前端显式传入，为未来 App 等新平台预留）
 *   2. User-Agent 自动匹配（微信/抖音/支付宝小程序各有固定 UA 标识）
 *   3. 兜底返回 'web'
 *
 * 平台枚举值定义（与数据库 ENUM 一致）：
 *   web        - Web 浏览器（管理后台等）
 *   wechat_mp  - 微信小程序
 *   douyin_mp  - 抖音小程序
 *   alipay_mp  - 支付宝小程序
 *   app        - 原生 App（预留）
 *   unknown    - 仅用于旧数据迁移回填，新请求不会产生此值
 *
 * @see docs/multi-platform-session-design.md
 * @created 2026-02-19
 */

/** 允许前端显式传入的平台白名单 */
const VALID_PLATFORMS = new Set(['web', 'wechat_mp', 'douyin_mp', 'alipay_mp', 'app'])

/**
 * User-Agent 平台识别规则（按优先级排列）
 * 微信/抖音/支付宝小程序的 UA 都有固定标识字符串
 */
const UA_RULES = [
  { pattern: /MicroMessenger/i, platform: 'wechat_mp' },
  { pattern: /ByteDanceMicroApp/i, platform: 'douyin_mp' },
  { pattern: /AlipayClient/i, platform: 'alipay_mp' }
]

/**
 * 从 HTTP 请求中检测登录平台
 *
 * @param {Object} req - Express 请求对象
 * @returns {string} 平台枚举值（web / wechat_mp / douyin_mp / alipay_mp / app）
 */
function detectLoginPlatform(req) {
  // 优先级 1：前端显式传入 platform（白名单校验）
  const bodyPlatform = req.body?.platform
  if (bodyPlatform && VALID_PLATFORMS.has(bodyPlatform)) {
    return bodyPlatform
  }

  // 优先级 2：User-Agent 自动识别
  const userAgent = req.headers?.['user-agent'] || ''
  for (const rule of UA_RULES) {
    if (rule.pattern.test(userAgent)) {
      return rule.platform
    }
  }

  // 优先级 3：兜底 web
  return 'web'
}

module.exports = { detectLoginPlatform, VALID_PLATFORMS }
