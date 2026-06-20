/**
 * 管理端登录安全服务（Admin Login Security Service）
 *
 * 业务场景：
 * - 管理后台为无密码栈（手机号 + 短信验证码登录），受众少但权限大。
 * - P0.6 轻量加固：在「短信验证码」之外，再加「按手机号失败锁定 + IP 白名单 + 审计」三层，
 *   防爆破/撞库/短信轰炸，且零新依赖（复用现有 ioredis + AuditLogService + .env）。
 *
 * 核心职责（仅管理端 console 登录/发码使用，不影响用户端 C 端登录）：
 * 1. 失败锁定：同手机号连续登录失败达到阈值后锁定一段时间（LOGIN_LOCKED / 429）。
 * 2. IP 白名单：可选开关，`.env` 的 ADMIN_IP_ALLOWLIST 留空=不启用（默认不启用，管理员“到处登”）。
 * 3. 审计：命中锁定时写入 AdminOperationLog（仅当手机号能解析到真实用户，受 operator_id 外键约束）。
 *
 * Redis Key 设计（与 SmsService 的 sms:* 前缀区分，避免混淆）：
 * - admin:login:fail:{mobile} → 连续失败计数（首次失败时设置 TTL=锁定时长）
 *
 * 配置来源（.env 唯一真相源，禁止在代码/脚本写死兜底值）：
 * - ADMIN_LOGIN_MAX_FAIL    连续失败阈值（默认 5）
 * - ADMIN_LOGIN_LOCK_MINUTES 锁定时长（分钟，默认 15）
 * - ADMIN_IP_ALLOWLIST      允许登录的来源 IP（逗号分隔；留空=不启用）
 *
 * 事务边界：
 * - 本服务只操作 Redis（原子命令）与写审计日志，不参与业务数据库事务。
 *
 * @module services/AdminLoginSecurityService
 * @since 2026-06-18（验证码功能 P0.6 管理端轻量加固）
 */

'use strict'

const logger = require('../utils/logger').logger
const { getRawClient } = require('../utils/UnifiedRedisClient')
const BeijingTimeHelper = require('../utils/timeHelper')
const { OPERATION_TYPES } = require('../constants/AuditOperationTypes')

/** Redis Key 前缀：管理端登录失败计数（与 sms:* 前缀区分） */
const FAIL_KEY_PREFIX = 'admin:login:fail:'

/**
 * 管理端登录安全服务类
 *
 * @description 静态方法类（与 SmsService 同风格），通过 ServiceManager 以 'admin_login_security' 键注册。
 */
class AdminLoginSecurityService {
  /**
   * 读取 P0.6 加固配置（每次读取，保证 .env 改值后 --update-env 重启即生效，无硬编码兜底冲突）
   *
   * @returns {{maxFail:number, lockSeconds:number, ipAllowlist:string[]}} 加固配置
   * @private
   */
  static _getConfig() {
    const maxFail = parseInt(process.env.ADMIN_LOGIN_MAX_FAIL || '5', 10)
    const lockMinutes = parseInt(process.env.ADMIN_LOGIN_LOCK_MINUTES || '15', 10)
    const ipAllowlist = (process.env.ADMIN_IP_ALLOWLIST || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    return { maxFail, lockSeconds: lockMinutes * 60, ipAllowlist }
  }

  /**
   * 登录/发码前置校验：IP 白名单 + 手机号失败锁定
   *
   * 业务流程：
   * 1. IP 白名单（仅当 ADMIN_IP_ALLOWLIST 配置了值才启用）：来源 IP 不在白名单 → 抛 IP_NOT_ALLOWED(403)。
   * 2. 失败锁定：该手机号连续失败计数 >= 阈值 → 抛 LOGIN_LOCKED(429)，附剩余锁定秒数。
   *
   * @param {Object} params - 参数
   * @param {string} params.mobile - 手机号（11位裸号，发码/登录均传）
   * @param {string} [params.ip] - 来源 IP（req.ip）
   * @returns {Promise<void>} 校验通过则无返回；不通过抛带 code/statusCode 的错误
   * @throws {Error} IP_NOT_ALLOWED(403) / LOGIN_LOCKED(429)
   */
  static async assertLoginAllowed({ mobile, ip }) {
    const { maxFail, ipAllowlist } = AdminLoginSecurityService._getConfig()

    // 1. IP 白名单（留空=不启用；本项目默认不启用，管理员出口 IP 不固定）
    if (ipAllowlist.length > 0 && ip && !ipAllowlist.includes(ip)) {
      logger.warn('🚫 管理端登录 IP 不在白名单内', { ip })
      const error = new Error('当前 IP 不在管理端白名单内，禁止登录')
      error.code = 'IP_NOT_ALLOWED'
      error.statusCode = 403
      throw error
    }

    // 2. 失败锁定检查
    if (!mobile) {
      return
    }
    const redis = getRawClient()
    const failKey = `${FAIL_KEY_PREFIX}${mobile}`
    const count = parseInt((await redis.get(failKey)) || '0', 10)
    if (count >= maxFail) {
      const remainSeconds = await redis.ttl(failKey)
      logger.warn('🔒 管理端登录已锁定（连续失败达到阈值）', {
        mobile: AdminLoginSecurityService._maskMobile(mobile),
        fail_count: count,
        remaining_seconds: remainSeconds
      })
      const error = new Error('登录失败次数过多，账号已临时锁定，请稍后再试')
      error.code = 'LOGIN_LOCKED'
      error.statusCode = 429
      error.data = { remaining_seconds: remainSeconds > 0 ? remainSeconds : null }
      throw error
    }
  }

  /**
   * 记录一次登录失败（验证码错误等），命中阈值时落审计
   *
   * 业务流程：
   * 1. 失败计数 +1；首次失败时设置 TTL=锁定时长（滑动锁定窗口的起点）。
   * 2. 计数达到阈值 → 写 AdminOperationLog 审计（仅当手机号解析到真实用户，受 operator_id 外键约束）。
   *
   * @param {Object} params - 参数
   * @param {string} params.mobile - 手机号（11位裸号）
   * @param {string} [params.ip] - 来源 IP
   * @param {string} [params.user_agent] - User-Agent
   * @returns {Promise<{count:number, locked:boolean}>} 当前失败次数与是否已达锁定阈值
   */
  static async recordFailure({ mobile, ip = null, user_agent = null }) {
    if (!mobile) {
      return { count: 0, locked: false }
    }
    const { maxFail, lockSeconds } = AdminLoginSecurityService._getConfig()
    const redis = getRawClient()
    const failKey = `${FAIL_KEY_PREFIX}${mobile}`

    const count = await redis.incr(failKey)
    // 首次失败设置锁定窗口 TTL（incr 后值为 1 表示本窗口第一次失败）
    if (count === 1) {
      await redis.expire(failKey, lockSeconds)
    }

    const locked = count >= maxFail
    if (locked) {
      // 命中锁定阈值：尝试写审计（受 operator_id 外键约束，仅真实用户可落库）
      await AdminLoginSecurityService._auditLockout({ mobile, ip, user_agent, failCount: count })
    }

    logger.warn('⚠️ 管理端登录失败计数', {
      mobile: AdminLoginSecurityService._maskMobile(mobile),
      fail_count: count,
      max_fail: maxFail,
      locked
    })
    return { count, locked }
  }

  /**
   * 清除失败计数（登录成功时调用，复位锁定窗口）
   *
   * @param {string} mobile - 手机号（11位裸号）
   * @returns {Promise<void>} 无返回值
   */
  static async clearFailures(mobile) {
    if (!mobile) {
      return
    }
    const redis = getRawClient()
    await redis.del(`${FAIL_KEY_PREFIX}${mobile}`)
  }

  /**
   * 写锁定审计日志（内部方法）
   *
   * 约束：admin_operation_logs.operator_id 是 NOT NULL + 外键(users.user_id)，
   * 故仅当手机号能解析到真实用户时才落库；无法解析（如攻击者用不存在号码）时仅结构化日志，
   * 不违反外键约束。审计失败不阻断登录失败流程（本身已是失败路径）。
   *
   * @param {Object} params - 参数
   * @param {string} params.mobile - 手机号
   * @param {string|null} params.ip - 来源 IP
   * @param {string|null} params.user_agent - User-Agent
   * @param {number} params.failCount - 命中阈值时的失败次数
   * @returns {Promise<void>} 无返回值
   * @private
   */
  static async _auditLockout({ mobile, ip, user_agent, failCount }) {
    try {
      // 复用 UserService.findByMobile（内部处理 PII 盲索引），避免重复实现手机号查找
      const UserService = require('./UserService')
      const user = await UserService.findByMobile(mobile, { useCache: false })
      if (!user) {
        // 号码不存在：无法写入受外键约束的审计表，仅结构化日志留痕
        logger.warn('🔒 管理端登录锁定（手机号未注册，仅日志留痕，不落审计表）', {
          mobile: AdminLoginSecurityService._maskMobile(mobile),
          ip,
          fail_count: failCount
        })
        return
      }

      const AuditLogService = require('./AuditLogService')
      await AuditLogService.logOperation({
        operator_id: user.user_id,
        operation_type: OPERATION_TYPES.ADMIN_LOGIN_LOCKED,
        target_type: 'user',
        target_id: user.user_id,
        action: 'update',
        reason: `管理端登录连续失败${failCount}次，账号临时锁定`,
        idempotency_key: `admin_login_locked_${user.user_id}_${BeijingTimeHelper.formatDate()}`,
        ip_address: ip,
        user_agent
      })
    } catch (auditError) {
      // 审计失败不阻断（当前已是登录失败路径），仅记录错误
      logger.error('🔒 管理端登录锁定审计写入失败（不阻断）', { error: auditError.message })
    }
  }

  /**
   * 手机号脱敏（日志用，前3后4中间打码）
   *
   * @param {string} mobile - 手机号
   * @returns {string} 脱敏后的手机号
   * @private
   */
  static _maskMobile(mobile) {
    if (!mobile || mobile.length < 11) {
      return '***'
    }
    return mobile.substring(0, 3) + '****' + mobile.substring(7)
  }
}

module.exports = AdminLoginSecurityService
