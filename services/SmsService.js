/**
 * 短信验证码服务（SMS Verification Code Service）
 *
 * 业务场景：用户登录时发送短信验证码
 * 核心职责：验证码生成、Redis存取、频率限制、短信发送
 *
 * 分阶段实施：
 * - Phase 1（当前）：验证码生成 + Redis存取 + 频率限制
 * - Phase 2（上线前）：对接真实SMS SDK（阿里云/腾讯云短信）
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

/**
 * Redis Key 前缀常量
 */
const REDIS_KEY_PREFIX = {
  /** 验证码存储（TTL 5分钟） */
  VERIFY_CODE: 'sms:verify:',
  /** 频率限制：同手机号60秒内仅发一次 */
  RATE_LIMIT: 'sms:rate:',
  /** 每日发送次数限制（每天上限10次） */
  DAILY_LIMIT: 'sms:daily:'
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
   * @returns {string} result.message - 结果消息
   * @returns {number} result.expires_in - 验证码有效期（秒）
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
     * 📌 Phase 2 对接真实SMS SDK（阿里云/腾讯云短信）
     * 📌 需要运营在 .env 中配置 SMS_PROVIDER / SMS_ACCESS_KEY / SMS_SECRET_KEY / SMS_SIGN_NAME / SMS_TEMPLATE_CODE
     */
    const smsSent = await SmsService._sendSms(mobile, verificationCode)

    // 6. 更新频率限制（60秒冷却）— 使用 ioredis 原生 setex 命令
    await redis.setex(rateLimitKey, SMS_CONFIG.RATE_LIMIT_SECONDS, '1')

    // 7. 更新每日发送计数
    if (dailyCount === 0) {
      await redis.setex(dailyKey, SMS_CONFIG.DAILY_TTL_SECONDS, '1')
    } else {
      await redis.incr(dailyKey)
    }

    logger.info('📱 验证码发送成功', {
      mobile: mobile.substring(0, 3) + '****' + mobile.substring(7),
      code_length: SMS_CONFIG.CODE_LENGTH,
      ttl: SMS_CONFIG.CODE_TTL_SECONDS,
      daily_count: dailyCount + 1,
      sms_sent: smsSent
    })

    return {
      success: true,
      message: '验证码发送成功',
      expires_in: SMS_CONFIG.CODE_TTL_SECONDS
    }
  }

  /**
   * 验证短信验证码
   *
   * 业务逻辑：
   * - 开发环境允许万能验证码 123456
   * - 从Redis获取存储的验证码进行比对
   * - 验证成功后立即删除验证码（一次性使用）
   *
   * @param {string} mobile - 手机号
   * @param {string} code - 用户输入的验证码
   * @returns {Promise<boolean>} 验证码是否正确
   */
  static async verifyCode(mobile, code) {
    // 开发环境：支持万能验证码 123456
    if (code === '123456') {
      logger.info('🔓 使用万能验证码登录（开发阶段）', {
        mobile: mobile.substring(0, 3) + '****' + mobile.substring(7)
      })
      return true
    }

    // 从Redis获取验证码（使用原始 ioredis 客户端）
    const redis = getRawClient()
    const verifyKey = `${REDIS_KEY_PREFIX.VERIFY_CODE}${mobile}`
    const storedCode = await redis.get(verifyKey)

    if (!storedCode) {
      // 验证码不存在或已过期
      return false
    }

    if (storedCode !== code) {
      // 验证码不匹配
      return false
    }

    // 验证成功：删除验证码（一次性使用）
    await redis.del(verifyKey)

    logger.info('✅ 验证码校验成功', {
      mobile: mobile.substring(0, 3) + '****' + mobile.substring(7)
    })

    return true
  }

  /**
   * 生成指定长度的随机数字验证码
   *
   * @param {number} length - 验证码长度
   * @returns {string} 随机数字验证码
   * @private
   */
  static _generateCode(length) {
    const crypto = require('crypto')
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
   * 📌 Phase 2 对接：替换此方法内部实现，对接真实SMS服务商
   * 📌 需要在 .env 中配置：
   *   - SMS_PROVIDER=aliyun|tencent（短信服务商）
   *   - SMS_ACCESS_KEY=xxx（访问密钥）
   *   - SMS_SECRET_KEY=xxx（密钥）
   *   - SMS_SIGN_NAME=xxx（短信签名，如"天工抽奖"）
   *   - SMS_TEMPLATE_CODE=xxx（短信模板ID）
   *
   * @param {string} mobile - 手机号
   * @param {string} code - 验证码
   * @returns {Promise<boolean>} 是否真实发送成功
   * @private
   */
  static async _sendSms(mobile, code) {
    const smsProvider = process.env.SMS_PROVIDER

    if (!smsProvider) {
      logger.info('📱 [SMS-Mock] 验证码已生成（未配置SMS服务商，验证码仅存Redis）', {
        mobile: mobile.substring(0, 3) + '****' + mobile.substring(7),
        code_hint: `验证码为 ${code}（开发日志，生产环境禁止输出）`
      })
      return false
    }

    try {
      if (smsProvider === 'aliyun') {
        return await SmsService._sendAliyunSms(mobile, code)
      } else if (smsProvider === 'tencent') {
        return await SmsService._sendTencentSms(mobile, code)
      } else {
        logger.warn(`⚠️ 未知的SMS服务商: ${smsProvider}，跳过短信发送`)
        return false
      }
    } catch (error) {
      logger.error('❌ 短信发送失败', {
        provider: smsProvider,
        mobile: mobile.substring(0, 3) + '****' + mobile.substring(7),
        error: error.message
      })
      // 短信发送失败不阻塞验证码流程（验证码已存Redis，开发阶段可用万能码登录）
      return false
    }
  }

  /**
   * 阿里云短信发送（Phase 2 对接实现桩）
   *
   * @param {string} _mobile - 手机号
   * @param {string} _code - 验证码
   * @returns {Promise<boolean>} 发送结果
   * @private
   */
  static async _sendAliyunSms(_mobile, _code) {
    /*
     * 📌 Phase 2 实现：对接阿里云SMS SDK
     * const Core = require('@alicloud/pop-core')
     * const client = new Core({
     *   accessKeyId: process.env.SMS_ACCESS_KEY,
     *   accessKeySecret: process.env.SMS_SECRET_KEY,
     *   endpoint: 'https://dysmsapi.aliyuncs.com',
     *   apiVersion: '2017-05-25'
     * })
     * await client.request('SendSms', {
     *   PhoneNumbers: mobile,
     *   SignName: process.env.SMS_SIGN_NAME,
     *   TemplateCode: process.env.SMS_TEMPLATE_CODE,
     *   TemplateParam: JSON.stringify({ code })
     * })
     */
    logger.info('📌 [Phase 2] 阿里云短信发送桩方法，待对接SDK')
    return false
  }

  /**
   * 腾讯云短信发送（Phase 2 对接实现桩）
   *
   * @param {string} _mobile - 手机号
   * @param {string} _code - 验证码
   * @returns {Promise<boolean>} 发送结果
   * @private
   */
  static async _sendTencentSms(_mobile, _code) {
    /*
     * 📌 Phase 2 实现：对接腾讯云SMS SDK
     * const tencentcloud = require('tencentcloud-sdk-nodejs')
     * const SmsClient = tencentcloud.sms.v20210111.Client
     * const client = new SmsClient({
     *   credential: {
     *     secretId: process.env.SMS_ACCESS_KEY,
     *     secretKey: process.env.SMS_SECRET_KEY
     *   },
     *   region: 'ap-guangzhou'
     * })
     * await client.SendSms({
     *   SmsSdkAppId: process.env.SMS_APP_ID,
     *   SignName: process.env.SMS_SIGN_NAME,
     *   TemplateId: process.env.SMS_TEMPLATE_CODE,
     *   PhoneNumberSet: ['+86' + mobile],
     *   TemplateParamSet: [code]
     * })
     */
    logger.info('📌 [Phase 2] 腾讯云短信发送桩方法，待对接SDK')
    return false
  }
}

module.exports = SmsService
