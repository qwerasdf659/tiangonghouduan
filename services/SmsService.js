/**
 * 短信验证码服务（SMS Verification Code Service）
 *
 * 业务场景：用户登录时发送短信验证码
 * 核心职责：验证码生成、Redis存取、频率限制、短信发送
 *
 * 分阶段实施：
 * - Phase 1：验证码生成 + Redis存取 + 频率限制
 * - Phase 2：对接真实SMS SDK（腾讯云短信 tencentcloud-sdk-nodejs-sms）
 *
 * Redis Key 设计：
 * - sms:verify:{mobile} → 验证码值（TTL 5分钟）
 * - sms:rate:{mobile} → 频率限制计数器（TTL 60秒，同手机号60秒内仅发一次）
 * - sms:daily:{mobile}:{date} → 每日发送次数（TTL 24小时，每天上限10次）
 *
 * 事务边界：
 * - 短信服务不涉及数据库事务
 * - Redis操作为原子性操作
 *
 * @module services/SmsService
 * @created 2026-02-15
 */

'use strict'

const logger = require('../utils/logger').logger
const { getRawClient } = require('../utils/UnifiedRedisClient')
const BeijingTimeHelper = require('../utils/timeHelper')
const crypto = require('crypto')

/**
 * Redis Key 前缀常量
 */
const REDIS_KEY_PREFIX = {
  /** 验证码存储（TTL 5分钟） */
  VERIFY_CODE: 'sms:verify:',
  /** 频率限制：同手机号60秒内仅发一次 */
  RATE_LIMIT: 'sms:rate:',
  /** 每日发送次数限制（每天上限10次） */
  DAILY_LIMIT: 'sms:daily:',
  /** 发送失败按 fail_code 聚合计数（按天，O7 可观测） */
  FAIL_STAT: 'sms:fail_stat:'
}

/**
 * 短信配置常量
 */
const SMS_CONFIG = {
  /** 验证码有效期：5分钟（300秒） */
  CODE_TTL_SECONDS: 300,
  /** 同手机号最短发送间隔：60秒 */
  RATE_LIMIT_SECONDS: 60,
  /** 每日最大发送次数 */
  DAILY_MAX_COUNT: 10,
  /** 每日限制过期时间：24小时（86400秒） */
  DAILY_TTL_SECONDS: 86400,
  /** 验证码长度 */
  CODE_LENGTH: 6
}

/**
 * 短信下发失败的后端业务码（归一化映射，前端按此 code 做中文文案提示）
 *
 * 背景：腾讯云返回的是其平台错误码（如 LimitExceeded.PhoneNumberDailyLimit），
 * 前端不应耦合腾讯云原始码。后端在此归一化为稳定的后端业务码，前端只认这些 code。
 * 取值与 _mapTencentFailCode() 的映射保持一致（单一真相源）。
 */
const SMS_FAIL_CODE = Object.freeze({
  /** 未配置短信服务商（SMS_PROVIDER 为空），验证码仅存 Redis、未真正下发 */
  PROVIDER_NOT_CONFIGURED: 'SMS_PROVIDER_NOT_CONFIGURED',
  /** 腾讯云：同号当日发送达上限 */
  PROVIDER_DAILY_LIMIT: 'SMS_PROVIDER_DAILY_LIMIT',
  /** 腾讯云：同号 1 小时/30 秒等频率达上限 */
  PROVIDER_RATE_LIMIT: 'SMS_PROVIDER_RATE_LIMIT',
  /** 腾讯云：短信签名未审核/不存在 */
  PROVIDER_SIGN_INVALID: 'SMS_PROVIDER_SIGN_INVALID',
  /** 腾讯云：短信模板未审核/不存在/参数不匹配 */
  PROVIDER_TEMPLATE_INVALID: 'SMS_PROVIDER_TEMPLATE_INVALID',
  /** 腾讯云：账户余额不足/套餐包用尽 */
  PROVIDER_BALANCE_INSUFFICIENT: 'SMS_PROVIDER_BALANCE_INSUFFICIENT',
  /** 腾讯云：手机号格式错误/无效号码 */
  PROVIDER_INVALID_MOBILE: 'SMS_PROVIDER_INVALID_MOBILE',
  /** 腾讯云：鉴权失败（SecretId/SecretKey/AppId 配置错误） */
  PROVIDER_AUTH_FAILED: 'SMS_PROVIDER_AUTH_FAILED',
  /**
   * 运营商侧拒绝/送达失败（如 E:EXT、运营商内部错误、号码被运营商限频拦截）。
   * 说明：此类结果多来自异步投递回执（SendSms 同步返回时尚未产生）；
   * 但部分运营商受理失败码也会出现在同步 SendStatus.Code 中，故纳入归一化以即时命中。
   */
  PROVIDER_CARRIER_REJECTED: 'SMS_PROVIDER_CARRIER_REJECTED',
  /** 其它未归类的腾讯云错误或网络异常 */
  PROVIDER_ERROR: 'SMS_PROVIDER_ERROR'
})

/**
 * 短信下发失败业务码 → 面向用户的中文提示文案
 *
 * 前端可直接用后端返回的 message；此处集中维护，保证文案口径一致。
 */
const SMS_FAIL_MESSAGE = Object.freeze({
  [SMS_FAIL_CODE.PROVIDER_NOT_CONFIGURED]: '短信服务未配置，请稍后再试或联系管理员',
  [SMS_FAIL_CODE.PROVIDER_DAILY_LIMIT]: '该手机号今日短信发送已达上限，请明天再试',
  [SMS_FAIL_CODE.PROVIDER_RATE_LIMIT]: '短信发送过于频繁，请稍后再试',
  [SMS_FAIL_CODE.PROVIDER_SIGN_INVALID]: '短信服务异常（签名），请联系管理员',
  [SMS_FAIL_CODE.PROVIDER_TEMPLATE_INVALID]: '短信服务异常（模板），请联系管理员',
  [SMS_FAIL_CODE.PROVIDER_BALANCE_INSUFFICIENT]: '短信服务额度不足，请联系管理员',
  [SMS_FAIL_CODE.PROVIDER_INVALID_MOBILE]: '手机号无效，无法发送短信',
  [SMS_FAIL_CODE.PROVIDER_AUTH_FAILED]: '短信服务异常（鉴权），请联系管理员',
  [SMS_FAIL_CODE.PROVIDER_CARRIER_REJECTED]: '短信被运营商拦截或下发失败，请稍后重试或更换手机号',
  [SMS_FAIL_CODE.PROVIDER_ERROR]: '短信下发失败，请稍后再试'
})

/**
 * 短信验证码服务类
 *
 * @description 管理短信验证码的生成、存储、校验和发送
 */
class SmsService {
  /**
   * 发送短信验证码
   *
   * 业务流程：
   * 1. 频率限制检查（60秒内不能重复发送）
   * 2. 每日发送次数检查（每天上限10次）
   * 3. 生成6位随机验证码
   * 4. 存入Redis（TTL 5分钟）
   * 5. 调用SMS SDK发送短信（Phase 2 对接）
   * 6. 更新频率限制和每日计数器
   *
   * @param {string} mobile - 手机号（11位中国大陆手机号）
   * @returns {Promise<Object>} 发送结果
   * @returns {boolean} result.success - 是否发送成功
   * @returns {string} result.message - 结果消息（成功为"验证码发送成功"，失败为对应中文提示）
   * @returns {number} result.expires_in - 验证码有效期（秒）
   * @returns {number} result.cooldown_seconds - 发码冷却秒数（= 后端频控间隔，前端倒计时取此值）
   * @returns {boolean} result.sms_sent - 短信是否真正下发成功（false 时验证码仍已存 Redis）
   * @returns {string|null} result.sms_fail_code - 下发失败时的后端归一化业务码（成功为 null）
   * @throws {Object} 频率限制/每日限制错误（含 code 和 statusCode）
   */
  static async sendVerificationCode(mobile) {
    // 使用 getRawClient() 获取原始 ioredis 客户端（支持 ttl/incr/setex 等完整命令）
    const redis = getRawClient()

    // 1. 频率限制检查：同手机号60秒内仅发一次
    const rateLimitKey = `${REDIS_KEY_PREFIX.RATE_LIMIT}${mobile}`
    const rateLimitExists = await redis.get(rateLimitKey)
    if (rateLimitExists) {
      const remainTtl = await redis.ttl(rateLimitKey)
      const error = new Error(`验证码发送过于频繁，请${remainTtl}秒后再试`)
      error.code = 'SMS_RATE_LIMIT'
      error.statusCode = 429
      error.data = { remaining_seconds: remainTtl }
      throw error
    }

    // 2. 每日发送次数检查：每天上限10次
    const today = BeijingTimeHelper.formatDate() // YYYY-MM-DD 格式（北京时间）
    const dailyKey = `${REDIS_KEY_PREFIX.DAILY_LIMIT}${mobile}:${today}`
    const dailyCountStr = await redis.get(dailyKey)
    const dailyCount = dailyCountStr ? parseInt(dailyCountStr, 10) : 0
    if (dailyCount >= SMS_CONFIG.DAILY_MAX_COUNT) {
      const error = new Error(
        `今日验证码发送次数已达上限（${SMS_CONFIG.DAILY_MAX_COUNT}次），请明天再试`
      )
      error.code = 'SMS_DAILY_LIMIT'
      error.statusCode = 429
      error.data = { daily_count: dailyCount, daily_limit: SMS_CONFIG.DAILY_MAX_COUNT }
      throw error
    }

    // 3. 生成6位随机数字验证码
    const verificationCode = SmsService._generateCode(SMS_CONFIG.CODE_LENGTH)

    // 4. 存入Redis（TTL 5分钟）— 使用 ioredis 原生 setex 命令
    const verifyKey = `${REDIS_KEY_PREFIX.VERIFY_CODE}${mobile}`
    await redis.setex(verifyKey, SMS_CONFIG.CODE_TTL_SECONDS, verificationCode)

    /*
     * 5. 调用SMS SDK发送短信
     * 📌 对接真实SMS SDK（腾讯云短信 tencentcloud-sdk-nodejs-sms）
     * _sendSms 返回结构化结果 { sent, fail_code }：sent=是否真正下发成功，
     * fail_code=失败时的后端归一化业务码（成功为 null），供路由层如实下发给前端。
     */
    const sendResult = await SmsService._sendSms(mobile, verificationCode)
    const smsSent = sendResult.sent

    // 6. 更新频率限制（60秒冷却）— 使用 ioredis 原生 setex 命令
    await redis.setex(rateLimitKey, SMS_CONFIG.RATE_LIMIT_SECONDS, '1')

    // 7. 更新每日发送计数
    if (dailyCount === 0) {
      await redis.setex(dailyKey, SMS_CONFIG.DAILY_TTL_SECONDS, '1')
    } else {
      await redis.incr(dailyKey)
    }

    logger.info('📱 验证码发送处理完成', {
      mobile: mobile.substring(0, 3) + '****' + mobile.substring(7),
      code_length: SMS_CONFIG.CODE_LENGTH,
      ttl: SMS_CONFIG.CODE_TTL_SECONDS,
      daily_count: dailyCount + 1,
      sms_sent: smsSent,
      sms_fail_code: sendResult.fail_code
    })

    // O7：发送失败按 fail_code 聚合计数到 Redis（按天），供运营/监控查询"今天多少条因何种原因失败"
    if (!smsSent && sendResult.fail_code) {
      await SmsService._recordSendFailure(sendResult.fail_code)
    }

    /*
     * 返回口径（方案 A，2026-06-18）：
     * - success 恒为 true：本接口语义是"请求已受理、验证码已生成入 Redis"（非生产可用万能码登录），
     *   短信下发失败不阻塞登录流程，故不把 success 置为 false（避免旧前端误判整体失败）。
     * - sms_sent：短信是否真正下发成功，前端据此区分"已发短信" vs "未发出（看 sms_fail_code 提示）"。
     * - sms_fail_code / message：失败时给出归一化业务码 + 中文提示，成功时 message 为"验证码发送成功"。
     */
    return {
      success: true,
      message: smsSent
        ? '验证码发送成功'
        : SMS_FAIL_MESSAGE[sendResult.fail_code] || '验证码下发失败，请稍后再试',
      expires_in: SMS_CONFIG.CODE_TTL_SECONDS,
      // O1：回传发码冷却秒数（= 后端 RATE_LIMIT_SECONDS），前端用它驱动倒计时，避免前端写死与后端漂移
      cooldown_seconds: SMS_CONFIG.RATE_LIMIT_SECONDS,
      sms_sent: smsSent,
      sms_fail_code: sendResult.fail_code
    }
  }

  /**
   * 验证短信验证码
   *
   * 业务逻辑：
   * - 非生产环境（NODE_ENV !== 'production'）允许万能验证码 123456，生产环境禁用
   * - 从Redis获取存储的验证码进行比对
   * - 验证成功后立即删除验证码（一次性使用）
   *
   * O3（2026-06-18）：返回结构化结果以区分「过期/不存在」与「不匹配」，
   * 供调用方给出更精准的前端文案（"验证码已过期，请重新获取" vs "验证码错误"）。
   *
   * @param {string} mobile - 手机号
   * @param {string} code - 用户输入的验证码
   * @returns {Promise<{valid: boolean, reason: (null|'EXPIRED'|'MISMATCH')}>}
   *          valid=是否校验通过；reason=失败原因（EXPIRED=不存在/已过期，MISMATCH=不匹配，成功为 null）
   */
  static async verifyCode(mobile, code) {
    /*
     * 万能验证码 123456：仅非生产环境（NODE_ENV !== 'production'）放行，生产环境彻底禁用。
     * 业务背景：开发/测试阶段用户与管理员均可用 123456 登录；上线后必须走真实短信码，
     * 避免任何人用 123456 越权登录任意手机号（P0 安全守卫）。
     */
    if (process.env.NODE_ENV !== 'production' && code === '123456') {
      logger.info('🔓 使用万能验证码登录（非生产调试入口）', {
        mobile: mobile.substring(0, 3) + '****' + mobile.substring(7),
        node_env: process.env.NODE_ENV
      })
      return { valid: true, reason: null }
    }

    // 从Redis获取验证码（使用原始 ioredis 客户端）
    const redis = getRawClient()
    const verifyKey = `${REDIS_KEY_PREFIX.VERIFY_CODE}${mobile}`
    const storedCode = await redis.get(verifyKey)

    if (!storedCode) {
      // 验证码不存在或已过期（TTL 到期被 Redis 自动清除）
      return { valid: false, reason: 'EXPIRED' }
    }

    if (storedCode !== code) {
      // 验证码不匹配（用户输错）
      return { valid: false, reason: 'MISMATCH' }
    }

    // 验证成功：删除验证码（一次性使用）
    await redis.del(verifyKey)

    logger.info('✅ 验证码校验成功', {
      mobile: mobile.substring(0, 3) + '****' + mobile.substring(7)
    })

    return { valid: true, reason: null }
  }

  /**
   * 生成指定长度的随机数字验证码
   *
   * @param {number} length - 验证码长度
   * @returns {string} 随机数字验证码
   * @private
   */
  static _generateCode(length) {
    const digits = '0123456789'
    let code = ''
    for (let i = 0; i < length; i++) {
      code += digits[crypto.randomInt(0, digits.length)]
    }
    return code
  }

  /**
   * 发送短信（SMS SDK 调用入口）
   *
   * 服务商：腾讯云短信（Tencent Cloud SMS）。本项目未上线、不兼容旧方案，已移除阿里云分支。
   * 需要在 .env 中配置（唯一真相源，禁止在代码/脚本写死）：
   *   - SMS_PROVIDER=tencent（短信服务商，固定 tencent）
   *   - SMS_ACCESS_KEY=xxx（腾讯云 SecretId）
   *   - SMS_SECRET_KEY=xxx（腾讯云 SecretKey）
   *   - SMS_SIGN_NAME=xxx（短信签名内容，需控制台报备审核通过）
   *   - SMS_TEMPLATE_CODE=xxx（短信模板 ID / TemplateId，需报备审核）
   *   - SMS_APP_ID=xxx（短信应用 SmsSdkAppId，腾讯云必填）
   *   - SMS_REGION=ap-guangzhou（可选，默认 ap-guangzhou）
   *
   * @param {string} mobile - 手机号
   * @param {string} code - 验证码
   * @returns {Promise<{sent: boolean, fail_code: (string|null)}>} 发送结果：sent=是否真正下发成功，fail_code=失败时的后端归一化业务码（成功为 null）
   * @private
   */
  static async _sendSms(mobile, code) {
    const smsProvider = process.env.SMS_PROVIDER

    if (!smsProvider) {
      /*
       * 未配置服务商：验证码仅写入 Redis，不真正下发短信。
       * 明文验证码日志仅在非生产环境输出，生产环境禁止打印（P0 安全守卫，防日志泄露）。
       */
      const logPayload = {
        mobile: mobile.substring(0, 3) + '****' + mobile.substring(7)
      }
      if (process.env.NODE_ENV !== 'production') {
        logPayload.code_hint = `验证码为 ${code}（非生产调试日志，生产环境不输出）`
      }
      logger.info('📱 [SMS-Mock] 验证码已生成（未配置SMS服务商，验证码仅存Redis）', logPayload)
      return { sent: false, fail_code: SMS_FAIL_CODE.PROVIDER_NOT_CONFIGURED }
    }

    try {
      if (smsProvider === 'tencent') {
        return await SmsService._sendTencentSms(mobile, code)
      } else {
        logger.warn(
          `⚠️ 未知或不支持的SMS服务商: ${smsProvider}（当前仅支持 tencent），跳过短信发送`
        )
        return { sent: false, fail_code: SMS_FAIL_CODE.PROVIDER_NOT_CONFIGURED }
      }
    } catch (error) {
      logger.error('❌ 短信发送失败', {
        provider: smsProvider,
        mobile: mobile.substring(0, 3) + '****' + mobile.substring(7),
        error: error.message,
        provider_code: error.code || null
      })
      // 短信发送失败不阻塞验证码流程（验证码已存Redis，开发阶段可用万能码登录）
      return { sent: false, fail_code: SmsService._mapTencentFailCode(error.code, error.message) }
    }
  }

  /**
   * 腾讯云短信发送（真实 SDK 调用）
   *
   * 使用腾讯云官方精简包 tencentcloud-sdk-nodejs-sms。所有密钥/签名/模板/应用ID
   * 均从 process.env 读取（.env 唯一真相源），不写死。手机号按腾讯云要求拼接 +86 国家码。
   * 客户端按需懒加载并缓存到静态属性，避免每次发码重复构造。
   *
   * @param {string} mobile - 手机号（11位裸号，不带国家码）
   * @param {string} code - 验证码（6位数字）
   * @returns {Promise<{sent: boolean, fail_code: (string|null)}>} 发送结果：sent=腾讯云返回 Code==='Ok' 视为成功，fail_code=失败时归一化业务码
   * @private
   */
  static async _sendTencentSms(mobile, code) {
    const client = SmsService._getTencentClient()

    // 调用腾讯云 SendSms 接口（短信模板含一个验证码变量 {1}）
    const response = await client.SendSms({
      SmsSdkAppId: process.env.SMS_APP_ID, // 短信应用 ID（SmsSdkAppId）
      SignName: process.env.SMS_SIGN_NAME, // 已报备签名内容
      TemplateId: process.env.SMS_TEMPLATE_CODE, // 已报备模板 ID
      PhoneNumberSet: ['+86' + mobile], // 腾讯云要求带国家码
      TemplateParamSet: [String(code)] // 模板变量：验证码
    })

    // SendStatusSet[0].Code === 'Ok' 表示该号码发送成功
    const sendStatus = response && response.SendStatusSet && response.SendStatusSet[0]
    const success = !!sendStatus && sendStatus.Code === 'Ok'

    if (success) {
      logger.info('📨 腾讯云短信发送成功', {
        mobile: mobile.substring(0, 3) + '****' + mobile.substring(7),
        request_id: response.RequestId
      })
      return { sent: true, fail_code: null }
    }

    // 发送未成功：归一化腾讯云错误码为后端业务码
    const providerCode = sendStatus && sendStatus.Code
    const failCode = SmsService._mapTencentFailCode(providerCode, sendStatus && sendStatus.Message)
    logger.warn('⚠️ 腾讯云短信发送未成功', {
      mobile: mobile.substring(0, 3) + '****' + mobile.substring(7),
      code: providerCode,
      message: sendStatus && sendStatus.Message,
      fail_code: failCode,
      request_id: response && response.RequestId
    })

    return { sent: false, fail_code: failCode }
  }

  /**
   * 腾讯云短信错误码 → 后端归一化业务码映射
   *
   * 背景：腾讯云错误码以 `LimitExceeded.PhoneNumberDailyLimit` 等形式返回，
   * 前端不应耦合腾讯云原始码，故统一映射为 SMS_FAIL_CODE 业务码（单一真相源）。
   * 参考腾讯云短信 SendSms 错误码文档（v20210111）。
   *
   * @param {string|null} providerCode - 腾讯云返回的错误码（SendStatus.Code 或 error.code）
   * @param {string|null} [providerMsg] - 腾讯云返回的错误描述（兜底关键字匹配用）
   * @returns {string} SMS_FAIL_CODE 中的后端业务码
   * @private
   */
  static _mapTencentFailCode(providerCode, providerMsg = '') {
    const code = String(providerCode || '')
    const msg = String(providerMsg || '')

    // 日发送上限
    if (code.includes('PhoneNumberDailyLimit') || code.includes('DailyLimit')) {
      return SMS_FAIL_CODE.PROVIDER_DAILY_LIMIT
    }
    // 频率上限（分钟/小时/30秒/相同内容等）
    if (
      code.includes('PhoneNumberThirtySecondLimit') ||
      code.includes('PhoneNumberOneHourLimit') ||
      code.includes('PhoneNumberCodeOverLimit') ||
      code.includes('RequestLimitExceeded') ||
      code.includes('Frequency')
    ) {
      return SMS_FAIL_CODE.PROVIDER_RATE_LIMIT
    }
    // 鉴权失败（API 签名/密钥错误，AuthFailure.* 含 SignatureFailure，须在短信签名判断之前匹配）
    if (
      code.includes('AuthFailure') ||
      code.includes('UnauthorizedOperation') ||
      code.includes('SecretId')
    ) {
      return SMS_FAIL_CODE.PROVIDER_AUTH_FAILED
    }
    // 短信签名相关（SignName 未审核/不存在）
    if (code.includes('SignNotApprovedOrNotExist') || code.includes('Sign')) {
      return SMS_FAIL_CODE.PROVIDER_SIGN_INVALID
    }
    // 模板相关
    if (
      code.includes('TemplateNotApprovedOrNotExist') ||
      code.includes('TemplateParamSet') ||
      code.includes('Template')
    ) {
      return SMS_FAIL_CODE.PROVIDER_TEMPLATE_INVALID
    }
    // 余额/套餐包不足
    if (
      code.includes('InsufficientBalance') ||
      code.includes('Packished') ||
      msg.includes('余额')
    ) {
      return SMS_FAIL_CODE.PROVIDER_BALANCE_INSUFFICIENT
    }
    // 手机号无效
    if (
      code.includes('PhoneNumberError') ||
      code.includes('InvalidParameterValue.IncorrectPhoneNumber')
    ) {
      return SMS_FAIL_CODE.PROVIDER_INVALID_MOBILE
    }
    /*
     * 运营商侧拒绝/送达失败：E:EXT（运营商扩展错误，多为号码被限频拦截）、
     * 运营商内部错误、运营商拒绝等。这些多见于异步投递回执的 Description/ReportStatus，
     * 少数也出现在同步 SendStatus.Code；统一归一化，便于日志排查与前端一致文案。
     */
    if (
      code.includes('EXT') ||
      msg.includes('EXT') ||
      msg.includes('运营商') ||
      msg.includes('拦截') ||
      msg.includes('送达失败')
    ) {
      return SMS_FAIL_CODE.PROVIDER_CARRIER_REJECTED
    }
    // 其它未归类
    return SMS_FAIL_CODE.PROVIDER_ERROR
  }

  /**
   * 记录一次短信发送失败到 Redis（按天 + fail_code 聚合，O7 可观测）
   *
   * 使用 Hash 结构 `sms:fail_stat:{date}`，field=fail_code，value=当日累计次数，TTL 48 小时。
   * 失败统计为辅助可观测数据，写入异常不应影响发码主流程，故内部 try/catch 吞掉错误仅记日志。
   *
   * @param {string} failCode - 后端归一化失败业务码（SMS_FAIL_CODE 之一）
   * @returns {Promise<void>} 无返回值
   * @private
   */
  static async _recordSendFailure(failCode) {
    try {
      const redis = getRawClient()
      const today = BeijingTimeHelper.formatDate()
      const statKey = `${REDIS_KEY_PREFIX.FAIL_STAT}${today}`
      await redis.hincrby(statKey, failCode, 1)
      // 续期：48 小时（覆盖跨天查询），避免 key 永久堆积
      await redis.expire(statKey, 48 * 3600)
    } catch (error) {
      logger.warn('⚠️ 短信失败统计写入失败（不影响发码主流程）', { error: error.message })
    }
  }

  /**
   * 查询某日短信发送失败统计（按 fail_code 聚合，O7 可观测）
   *
   * 供运营/监控查看"今天有多少条短信因日限流/签名/模板等原因未发出"。
   *
   * @param {string} [date] - 北京时间日期 YYYY-MM-DD，默认今天
   * @returns {Promise<{date: string, total: number, by_fail_code: Object.<string, number>}>}
   *          date=日期，total=当日失败总数，by_fail_code=各业务码失败次数映射
   */
  static async getSendFailureStats(date) {
    const redis = getRawClient()
    const day = date || BeijingTimeHelper.formatDate()
    const statKey = `${REDIS_KEY_PREFIX.FAIL_STAT}${day}`
    const raw = (await redis.hgetall(statKey)) || {}

    const byFailCode = {}
    let total = 0
    for (const [code, countStr] of Object.entries(raw)) {
      const count = parseInt(countStr, 10) || 0
      byFailCode[code] = count
      total += count
    }

    return { date: day, total, by_fail_code: byFailCode }
  }

  /**
   * 获取（并缓存）腾讯云短信客户端实例
   *
   * @returns {Object} 腾讯云 SmsClient 实例
   * @private
   */
  static _getTencentClient() {
    if (SmsService._tencentClient) {
      return SmsService._tencentClient
    }
    const tencentcloud = require('tencentcloud-sdk-nodejs-sms')
    const SmsClient = tencentcloud.sms.v20210111.Client
    SmsService._tencentClient = new SmsClient({
      credential: {
        secretId: process.env.SMS_ACCESS_KEY, // 腾讯云 SecretId
        secretKey: process.env.SMS_SECRET_KEY // 腾讯云 SecretKey
      },
      region: process.env.SMS_REGION || 'ap-guangzhou'
    })
    return SmsService._tencentClient
  }
}

// 腾讯云短信客户端缓存（静态属性，首次发码时懒加载初始化）
SmsService._tencentClient = null

// 暴露失败业务码/文案映射，供路由层、测试与文档引用（单一真相源）
SmsService.SMS_FAIL_CODE = SMS_FAIL_CODE
SmsService.SMS_FAIL_MESSAGE = SMS_FAIL_MESSAGE

module.exports = SmsService
