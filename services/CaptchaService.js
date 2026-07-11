/**
 * 人机验证服务（Captcha Service - 腾讯云天御验证码）
 *
 * 业务场景：
 * - 营销/抽奖平台短信成本是真金白银，C 端 `send-code` 前若无人机验证，机器可批量刷短信烧钱。
 * - P1.5：在用户端发码（POST /api/v4/auth/send-code）前置校验腾讯云天御验证码票据，
 *   挡住机器刷短信，控制成本。管理端按拍板「不加天御」，仅用户端强制。
 *
 * 技术路线（复用现有腾讯云 SDK 依赖，零新依赖）：
 * - 使用 tencentcloud-sdk-nodejs-common 的 CommonClient 调用天御验证码 DescribeCaptchaMiniResult 接口，
 *   与 SmsService 的 tencentcloud-sdk-nodejs-sms 同属腾讯云官方 SDK 体系，无新依赖。
 *
 * ⚠️ 客户端类型与校验接口必须匹配（腾讯云官方：不可混用，否则报错）。本服务同时支持两条：
 * - 【微信小程序】插件回调【只返回 ticket，不返回 randstr】→ 服务端用 DescribeCaptchaMiniResult（仅需 Ticket）。
 * - 【Web/App】JS 控件回调返回 ticket + randstr → 服务端用 DescribeCaptchaResult（需 Ticket + Randstr）。
 * 分派依据：请求是否携带 randstr —— 有 randstr 走 Web/App 接口，无 randstr 走小程序接口。
 *   （本平台 C 端当前为小程序；保留 Web/App 分支以备将来 H5/App，零额外运营成本。）
 *
 * 配置来源（.env 唯一真相源，禁止在代码/脚本写死）：
 * - CAPTCHA_APP_ID         天御验证码 CaptchaAppId（数字）
 * - CAPTCHA_APP_SECRET_KEY 天御验证码 AppSecretKey
 * - CAPTCHA_FAIL_OPEN      天御服务异常时的降级策略：true=fail-open 放行（默认），false=fail-close 拒绝
 * - 复用 SMS_ACCESS_KEY / SMS_SECRET_KEY 作为腾讯云账号 SecretId/SecretKey（同一腾讯云账号）
 * - 可选 CAPTCHA_REGION（默认 ap-guangzhou）
 *
 * 环境策略：
 * - 非生产环境（NODE_ENV !== 'production'）默认放行，跳过票据校验，方便本地/测试调试（已拍板）。
 * - 生产环境强制校验；天御服务异常时按 CAPTCHA_FAIL_OPEN 开关降级。
 *
 * 事务边界：本服务只做外部 HTTP 校验，不涉及数据库事务。
 *
 * @module services/CaptchaService
 * @since 2026-06-18（验证码功能 P1.5 人机验证）
 */

'use strict'

const logger = require('../utils/logger').logger

/** 天御验证码接口默认地域 */
const DEFAULT_REGION = 'ap-guangzhou'
/** 天御验证码服务端点 */
const CAPTCHA_ENDPOINT = 'captcha.tencentcloudapi.com'
/** 天御验证码 API 版本 */
const CAPTCHA_API_VERSION = '2019-07-22'

/**
 * 人机验证服务类（Captcha Service）
 *
 * @description 静态方法类（与 SmsService 同风格），通过 ServiceManager 以 'captcha' 键注册。
 */
class CaptchaService {
  /**
   * 是否启用天御校验
   *
   * O5 灰度开关（2026-06-18）：优先看 `.env` 的 CAPTCHA_ENABLED（独立于 NODE_ENV）：
   * - CAPTCHA_ENABLED=true  → 强制启用（即使非生产，也校验票据，便于生产前灰度联调）
   * - CAPTCHA_ENABLED=false → 强制关闭（即使生产，也跳过，用于应急降级/天御故障兜底）
   * - 未配置（留空）       → 回退默认策略：生产启用、非生产放行
   *
   * @returns {boolean} true=需校验票据，false=跳过校验
   */
  static isEnabled() {
    const flag = (process.env.CAPTCHA_ENABLED || '').trim().toLowerCase()
    if (flag === 'true') {
      return true
    }
    if (flag === 'false') {
      return false
    }
    // 未显式配置：回退默认（生产强制、非生产放行）
    return process.env.NODE_ENV === 'production'
  }

  /**
   * 天御服务异常时是否 fail-open（放行）
   *
   * @returns {boolean} true=fail-open 放行（默认），false=fail-close 拒绝
   */
  static isFailOpen() {
    // 默认 fail-open：仅当显式配置为 'false' 才 fail-close
    return process.env.CAPTCHA_FAIL_OPEN !== 'false'
  }

  /**
   * 校验天御验证码票据（按来源自动分派小程序 / Web·App 校验接口）
   *
   * 业务流程：
   * 1. 未启用天御（非生产默认 / CAPTCHA_ENABLED=false）：直接放行，返回 true。
   * 2. 票据缺失（多为天御停服/未接入）：按 CAPTCHA_FAIL_OPEN 开关降级（默认 fail-open 放行 + 频控兜底）。
   * 3. 有票据：按是否携带 randstr 分派校验接口：
   *    - 有 randstr → Web/App → DescribeCaptchaResult（Ticket + Randstr）
   *    - 无 randstr → 微信小程序 → DescribeCaptchaMiniResult（仅 Ticket）
   *    CaptchaCode === 1 视为通过；天御接口异常同样按 CAPTCHA_FAIL_OPEN 开关降级。
   *
   * @param {Object} params - 参数
   * @param {string} params.captcha_ticket - 天御票据（两端通用，必填）
   * @param {string} [params.captcha_randstr] - 天御随机串（仅 Web/App 有；小程序不传）
   * @param {string} [params.user_ip] - 用户来源 IP（提升校验准确度）
   * @returns {Promise<boolean>} 是否校验通过（true=放行后续发码）
   */
  static async verify({ captcha_ticket, captcha_randstr, user_ip }) {
    // 1. 未启用天御校验（非生产默认放行 / CAPTCHA_ENABLED=false 应急关闭）→ 直接放行
    if (!CaptchaService.isEnabled()) {
      logger.info('🧪 天御验证码校验未启用（跳过校验）', {
        node_env: process.env.NODE_ENV,
        captcha_enabled: process.env.CAPTCHA_ENABLED || '(未配置,按NODE_ENV默认)'
      })
      return true
    }

    /*
     * 2. 票据缺失：接入 CAPTCHA_FAIL_OPEN 降级开关（2026-07-12 方案C）
     *
     * 天御套餐过期/停服时，前端加载不出验证码控件、用户拿不到票据，请求到后端即"票据缺失"。
     * 此场景与"天御接口异常"同属天御不可用，统一按 fail-open 兜底：
     * - CAPTCHA_FAIL_OPEN=true（默认）→ 放行发码，靠 SmsService 频控（同号 60s + 每日 10 次 + IP 限流）兜底，
     *   保证天御失效时短信验证码仍可用（不阻断正常用户登录）；
     * - CAPTCHA_FAIL_OPEN=false → 维持严格拒绝（要求前端必须先过天御拿到票据）。
     */
    if (!captcha_ticket) {
      const failOpen = CaptchaService.isFailOpen()
      logger.warn(
        `⚠️ 天御票据缺失（前端未拿到票据，多为天御停服/未接入），降级 ${failOpen ? 'fail-open 放行（频控兜底）' : 'fail-close 拒绝'}`
      )
      return failOpen
    }

    // 3. 按是否携带 randstr 分派校验接口（不可混用：小程序无 randstr）
    const isWebApp = !!captcha_randstr
    const action = isWebApp ? 'DescribeCaptchaResult' : 'DescribeCaptchaMiniResult'
    const payload = {
      CaptchaType: 9, // 9=滑块验证码（天御标准类型）
      Ticket: captcha_ticket,
      UserIp: user_ip || '',
      CaptchaAppId: parseInt(process.env.CAPTCHA_APP_ID, 10),
      AppSecretKey: process.env.CAPTCHA_APP_SECRET_KEY
    }
    // Web/App 接口才需要 Randstr；小程序接口不接受该字段
    if (isWebApp) {
      payload.Randstr = captcha_randstr
    }

    try {
      const client = CaptchaService._getClient()
      const response = await client.request(action, payload)

      // CaptchaCode === 1 表示验证通过
      const passed = response && response.CaptchaCode === 1
      if (passed) {
        logger.info('✅ 天御验证码校验通过', { action, client_type: isWebApp ? 'web_app' : 'mini' })
      } else {
        logger.warn('🚫 天御验证码校验未通过', {
          action,
          client_type: isWebApp ? 'web_app' : 'mini',
          captcha_code: response && response.CaptchaCode,
          captcha_msg: response && response.CaptchaMsg
        })
      }
      return passed
    } catch (error) {
      // 天御服务异常：按降级开关处理
      const failOpen = CaptchaService.isFailOpen()
      logger.warn(
        `⚠️ 天御校验服务异常（${action}），降级 ${failOpen ? 'fail-open 放行（频控兜底）' : 'fail-close 拒绝'}`,
        { error: error.message }
      )
      return failOpen
    }
  }

  /**
   * 获取（并缓存）腾讯云天御 CommonClient 实例
   *
   * 复用 SMS_ACCESS_KEY/SMS_SECRET_KEY（同一腾讯云账号的 SecretId/SecretKey），
   * 客户端懒加载并缓存到静态属性，避免每次校验重复构造。
   *
   * @returns {Object} 腾讯云 CommonClient 实例
   * @private
   */
  static _getClient() {
    if (CaptchaService._client) {
      return CaptchaService._client
    }
    const { CommonClient } = require('tencentcloud-sdk-nodejs-common')
    CaptchaService._client = new CommonClient(CAPTCHA_ENDPOINT, CAPTCHA_API_VERSION, {
      credential: {
        secretId: process.env.SMS_ACCESS_KEY, // 腾讯云 SecretId（与短信同账号）
        secretKey: process.env.SMS_SECRET_KEY // 腾讯云 SecretKey
      },
      region: process.env.CAPTCHA_REGION || DEFAULT_REGION,
      profile: {}
    })
    return CaptchaService._client
  }
}

// 天御 CommonClient 缓存（静态属性，首次校验时懒加载初始化）
CaptchaService._client = null

module.exports = CaptchaService
