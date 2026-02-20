/**
 * 登录平台检测工具（platformDetector）
 *
 * 从 HTTP 请求中识别登录来源平台，用于多平台会话隔离。
 *
 * 识别策略（优先级从高到低）：
 *   1. 请求体/请求头 platform 字段（客户端显式声明，最可靠）
 *   2. Referer 域名特征（小程序框架自动携带，可靠性高）
 *   3. User-Agent 关键词匹配（仅对内置浏览器有效，小程序 wx.request 无此标识）
 *   4. 兜底返回 'web'
 *
 * ⚠️ 重要说明：
 *   微信小程序的 wx.request() 发出的 HTTP 请求 User-Agent 中
 *   **不包含** MicroMessenger 字符串（只有微信内置浏览器/WebView 才有）。
 *   但小程序请求的 Referer 固定为 https://servicewechat.com/{appid}/...
 *   这是识别微信小程序请求最可靠的自动检测方式。
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
 * @updated 2026-02-20（修复：微信小程序 wx.request UA 不含 MicroMessenger 导致误判为 web）
 */

const { logger } = require('./logger')

/** 允许客户端显式传入的平台白名单 */
const VALID_PLATFORMS = new Set(['web', 'wechat_mp', 'douyin_mp', 'alipay_mp', 'app'])

/**
 * Referer 域名平台识别规则
 *
 * 小程序框架发起的 HTTP 请求会自动携带特定域名的 Referer：
 *   - 微信小程序：https://servicewechat.com/{appid}/{version}/page-frame.html
 *   - 抖音小程序：https://tmaservice.developer.toutiao.com/...
 *   - 支付宝小程序：https://appx/{appid}/...
 *
 * 这些 Referer 由平台框架强制注入，客户端无法伪造，可靠性高于 User-Agent。
 */
const REFERER_RULES = [
  { pattern: /servicewechat\.com/i, platform: 'wechat_mp' },
  { pattern: /tmaservice\.developer\.toutiao\.com|bytedance/i, platform: 'douyin_mp' },
  { pattern: /alipay\.com|myapp\.com/i, platform: 'alipay_mp' }
]

/**
 * User-Agent 平台识别规则（仅对内置浏览器/WebView 有效）
 *
 * 注意：微信小程序的 wx.request() 不携带 MicroMessenger UA，
 *       此规则仅匹配微信内置浏览器（H5 页面在微信中打开的场景）。
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
  // 优先级 1：客户端显式声明（请求体 或 自定义请求头），白名单校验
  const explicitPlatform = req.body?.platform || req.headers?.['x-platform']
  if (explicitPlatform && VALID_PLATFORMS.has(explicitPlatform)) {
    logger.debug(`[PlatformDetect] 客户端显式声明: ${explicitPlatform}`)
    return explicitPlatform
  }

  // 优先级 2：Referer 域名特征（小程序框架自动注入，可靠性高）
  const referer = req.headers?.referer || req.headers?.referrer || ''
  for (const rule of REFERER_RULES) {
    if (rule.pattern.test(referer)) {
      logger.debug(
        `[PlatformDetect] Referer 匹配: ${rule.platform} (referer=${referer.substring(0, 60)})`
      )
      return rule.platform
    }
  }

  // 优先级 3：User-Agent 关键词匹配（内置浏览器/WebView 场景）
  const userAgent = req.headers?.['user-agent'] || ''
  for (const rule of UA_RULES) {
    if (rule.pattern.test(userAgent)) {
      logger.debug(`[PlatformDetect] UA 匹配: ${rule.platform}`)
      return rule.platform
    }
  }

  // 优先级 4：兜底返回 web
  logger.debug(`[PlatformDetect] 无匹配特征，兜底返回 web (UA=${userAgent.substring(0, 80)})`)
  return 'web'
}

module.exports = { detectLoginPlatform, VALID_PLATFORMS }
