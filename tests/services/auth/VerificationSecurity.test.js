/**
 * 验证码与登录安全 P2 单元测试
 *
 * 测试范围（验证码功能整改 P2 质量保障）：
 * 1. SmsService 发码频控（同号 60 秒冷却）、每日次数计数
 * 2. SmsService 验证码一次性使用、过期/不存在失效、错误码不匹配
 * 3. SmsService 万能码 123456 仅非生产环境放行（测试环境 NODE_ENV=test 视为非生产）
 * 4. CaptchaService 非生产环境放行（跳过天御票据校验）、票据缺失判定
 * 5. AdminLoginSecurityService 失败锁定（达到阈值抛 LOGIN_LOCKED/429）、成功清零、IP 白名单
 *
 * 业务背景：
 * - 验证码只走 Redis（不落库），频控/一次性/过期等行为是真实业务契约。
 * - 管理端 P0.6 加固：同手机号连续失败锁定，防爆破/撞库。
 *
 * 数据隔离与真实性（重要）：
 * - 连接 .env 指定的真实库 restaurant_points_dev + 真实 Redis（不使用 mock）。
 * - 使用独立测试手机号（非真实业务号段），afterEach 清理本测试写入的 Redis key，绝不误删真实数据。
 * - 通过 global.getTestService 获取服务（与业务代码同一 ServiceManager 入口）。
 *
 * @since 2026-06-18（验证码功能整改 P2）
 */

'use strict'

const { getRawClient } = require('../../../utils/UnifiedRedisClient')

jest.setTimeout(30000)

/** 测试专用手机号（11位合法格式，非真实业务用户，避免污染真实数据） */
const TEST_MOBILE = '13900000001'

/** 需要清理的 Redis key 前缀（与 SmsService / AdminLoginSecurityService 设计一致） */
const REDIS_KEYS_TO_CLEAN = [
  `sms:verify:${TEST_MOBILE}`,
  `sms:rate:${TEST_MOBILE}`,
  `admin:login:fail:${TEST_MOBILE}`
]

/**
 * 清理本测试写入的 Redis key（含每日计数 key，按当天日期拼接）
 *
 * @returns {Promise<void>} 无返回值
 */
async function cleanupRedis() {
  const redis = getRawClient()
  const BeijingTimeHelper = require('../../../utils/timeHelper')
  const today = BeijingTimeHelper.formatDate()
  const keys = [
    ...REDIS_KEYS_TO_CLEAN,
    `sms:daily:${TEST_MOBILE}:${today}`,
    `sms:fail_stat:${today}`
  ]
  await Promise.all(keys.map(k => redis.del(k)))
}

describe('SmsService - 验证码生成/频控/一次性/万能码（P2）', () => {
  let SmsService

  beforeAll(() => {
    SmsService = global.getTestService('sms')
    expect(SmsService).toBeTruthy()
  })

  afterEach(async () => {
    await cleanupRedis()
  })

  test('发码成功返回 expires_in=300，且验证码写入 Redis（TTL 约 5 分钟）', async () => {
    const result = await SmsService.sendVerificationCode(TEST_MOBILE)
    expect(result.success).toBe(true)
    expect(result.expires_in).toBe(300)

    const redis = getRawClient()
    const stored = await redis.get(`sms:verify:${TEST_MOBILE}`)
    expect(stored).toMatch(/^\d{6}$/) // 6 位数字验证码
    const ttl = await redis.ttl(`sms:verify:${TEST_MOBILE}`)
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(300)
  })

  test('同号 60 秒内重复发码触发频控（SMS_RATE_LIMIT / 429）', async () => {
    await SmsService.sendVerificationCode(TEST_MOBILE)
    await expect(SmsService.sendVerificationCode(TEST_MOBILE)).rejects.toMatchObject({
      code: 'SMS_RATE_LIMIT',
      statusCode: 429
    })
  })

  test('验证码一次性使用：校验成功后立即失效，二次校验失败', async () => {
    await SmsService.sendVerificationCode(TEST_MOBILE)
    const redis = getRawClient()
    const realCode = await redis.get(`sms:verify:${TEST_MOBILE}`)

    // 首次用真实码校验成功
    const firstVerify = await SmsService.verifyCode(TEST_MOBILE, realCode)
    expect(firstVerify.valid).toBe(true)
    expect(firstVerify.reason).toBeNull()

    // Redis 中验证码已被删除（一次性）
    const afterDelete = await redis.get(`sms:verify:${TEST_MOBILE}`)
    expect(afterDelete).toBeNull()

    // 再次用同一真实码校验失败（已被删除 → EXPIRED）
    const secondVerify = await SmsService.verifyCode(TEST_MOBILE, realCode)
    expect(secondVerify.valid).toBe(false)
    expect(secondVerify.reason).toBe('EXPIRED')
  })

  test('验证码不存在/过期时校验失败（reason=EXPIRED）', async () => {
    // 未发码，直接用任意真实格式码校验
    const result = await SmsService.verifyCode(TEST_MOBILE, '999999')
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('EXPIRED')
  })

  test('验证码不匹配时校验失败（reason=MISMATCH）', async () => {
    await SmsService.sendVerificationCode(TEST_MOBILE)
    const redis = getRawClient()
    const realCode = await redis.get(`sms:verify:${TEST_MOBILE}`)
    // 构造一个与真实码不同的 6 位码
    const wrongCode = realCode === '000000' ? '111111' : '000000'
    const result = await SmsService.verifyCode(TEST_MOBILE, wrongCode)
    expect(result.valid).toBe(false)
    expect(result.reason).toBe('MISMATCH')
  })

  test('万能码 123456 仅非生产环境放行（测试环境 NODE_ENV=test 应通过）', async () => {
    expect(process.env.NODE_ENV).not.toBe('production')
    const result = await SmsService.verifyCode(TEST_MOBILE, '123456')
    expect(result.valid).toBe(true)
  })

  test('发码返回结构含 sms_sent、sms_fail_code、cooldown_seconds（方案 A + O1）', async () => {
    const result = await SmsService.sendVerificationCode(TEST_MOBILE)
    expect(result).toHaveProperty('sms_sent')
    expect(typeof result.sms_sent).toBe('boolean')
    expect(result).toHaveProperty('sms_fail_code')
    // O1：回传冷却秒数，前端用它驱动倒计时
    expect(result).toHaveProperty('cooldown_seconds')
    expect(typeof result.cooldown_seconds).toBe('number')
    expect(result.cooldown_seconds).toBeGreaterThan(0)
    // 发送成功时 fail_code 为 null；失败时为 SMS_FAIL_CODE 中的业务码字符串
    if (result.sms_sent) {
      expect(result.sms_fail_code).toBeNull()
    } else {
      expect(Object.values(SmsService.SMS_FAIL_CODE)).toContain(result.sms_fail_code)
    }
  })

  test('O7：getSendFailureStats 返回当日失败聚合结构', async () => {
    const stats = await SmsService.getSendFailureStats()
    expect(stats).toHaveProperty('date')
    expect(stats).toHaveProperty('total')
    expect(typeof stats.total).toBe('number')
    expect(stats).toHaveProperty('by_fail_code')
    expect(typeof stats.by_fail_code).toBe('object')
  })

  test('_mapTencentFailCode 将腾讯云错误码归一化为后端业务码', () => {
    const FC = SmsService.SMS_FAIL_CODE
    expect(SmsService._mapTencentFailCode('LimitExceeded.PhoneNumberDailyLimit')).toBe(
      FC.PROVIDER_DAILY_LIMIT
    )
    expect(SmsService._mapTencentFailCode('LimitExceeded.PhoneNumberThirtySecondLimit')).toBe(
      FC.PROVIDER_RATE_LIMIT
    )
    expect(SmsService._mapTencentFailCode('FailedOperation.SignatureIncorrectOrUnapproved')).toBe(
      FC.PROVIDER_SIGN_INVALID
    )
    expect(SmsService._mapTencentFailCode('FailedOperation.TemplateIncorrectOrUnapproved')).toBe(
      FC.PROVIDER_TEMPLATE_INVALID
    )
    expect(SmsService._mapTencentFailCode('FailedOperation.InsufficientBalanceInSmsPackage')).toBe(
      FC.PROVIDER_BALANCE_INSUFFICIENT
    )
    expect(SmsService._mapTencentFailCode('AuthFailure.SignatureFailure')).toBe(
      FC.PROVIDER_AUTH_FAILED
    )
    // 运营商侧拒绝/送达失败（E:EXT、运营商内部错误、拦截等，2026-07-12 新增归一化）
    expect(SmsService._mapTencentFailCode('E:EXT')).toBe(FC.PROVIDER_CARRIER_REJECTED)
    expect(SmsService._mapTencentFailCode('', '运营商内部错误')).toBe(FC.PROVIDER_CARRIER_REJECTED)
    expect(SmsService._mapTencentFailCode('', '号码被拦截')).toBe(FC.PROVIDER_CARRIER_REJECTED)
    expect(SmsService._mapTencentFailCode('', '送达失败')).toBe(FC.PROVIDER_CARRIER_REJECTED)
    // 优先级守卫：更具体的鉴权/签名码不能被运营商规则误伤（鉴权在前命中）
    expect(SmsService._mapTencentFailCode('AuthFailure.SignatureFailure')).not.toBe(
      FC.PROVIDER_CARRIER_REJECTED
    )
    // 未知错误码归一化为通用 PROVIDER_ERROR
    expect(SmsService._mapTencentFailCode('Some.UnknownCode')).toBe(FC.PROVIDER_ERROR)
  })
})

describe('CaptchaService - 人机验证（P2，非生产放行）', () => {
  let CaptchaService

  beforeAll(() => {
    CaptchaService = global.getTestService('captcha')
    expect(CaptchaService).toBeTruthy()
  })

  test('非生产环境且 CAPTCHA_ENABLED 未配置时 isEnabled=false（跳过天御校验）', () => {
    /*
     * isEnabled() 的默认策略：未显式配置 CAPTCHA_ENABLED 时按 NODE_ENV（非生产=false）。
     * 显式移除该环境变量以隔离外部 .env 干扰（.env 可能已配 true 用于灰度），
     * 保证测试验证的是"未配置时回退默认策略"这一业务语义，而非依赖 .env 实际值。
     */
    const original = process.env.CAPTCHA_ENABLED
    delete process.env.CAPTCHA_ENABLED
    try {
      expect(process.env.NODE_ENV).not.toBe('production')
      expect(CaptchaService.isEnabled()).toBe(false)
    } finally {
      if (original !== undefined) process.env.CAPTCHA_ENABLED = original
    }
  })

  test('非生产环境且 CAPTCHA_ENABLED 未配置时 verify 直接放行（即使无票据）', async () => {
    // 隔离 .env 干扰：显式移除 CAPTCHA_ENABLED，验证"未配置回退非生产放行"语义
    const original = process.env.CAPTCHA_ENABLED
    delete process.env.CAPTCHA_ENABLED
    try {
      const passed = await CaptchaService.verify({
        captcha_ticket: '',
        captcha_randstr: '',
        user_ip: '127.0.0.1'
      })
      expect(passed).toBe(true)
    } finally {
      if (original !== undefined) process.env.CAPTCHA_ENABLED = original
    }
  })

  test('O5：CAPTCHA_ENABLED=false 强制关闭（即使生产也跳过）', () => {
    const original = process.env.CAPTCHA_ENABLED
    process.env.CAPTCHA_ENABLED = 'false'
    try {
      expect(CaptchaService.isEnabled()).toBe(false)
    } finally {
      if (original === undefined) {
        delete process.env.CAPTCHA_ENABLED
      } else {
        process.env.CAPTCHA_ENABLED = original
      }
    }
  })

  test('O5：CAPTCHA_ENABLED=true 强制启用（即使非生产）', () => {
    const original = process.env.CAPTCHA_ENABLED
    process.env.CAPTCHA_ENABLED = 'true'
    try {
      expect(CaptchaService.isEnabled()).toBe(true)
    } finally {
      if (original === undefined) {
        delete process.env.CAPTCHA_ENABLED
      } else {
        process.env.CAPTCHA_ENABLED = original
      }
    }
  })

  /*
   * 方案C（2026-07-12）：天御停服/未接入导致"票据缺失"时，接入 CAPTCHA_FAIL_OPEN 降级。
   * 业务语义：天御套餐过期后前端拿不到票据，短信验证码应仍可用（fail-open），不阻断正常用户登录。
   * 测试用 CAPTCHA_ENABLED=true 强制启用天御（绕过非生产默认放行），只验证"票据缺失"分支的降级行为。
   */
  describe('方案C：启用天御但票据缺失时按 CAPTCHA_FAIL_OPEN 降级', () => {
    const origEnabled = process.env.CAPTCHA_ENABLED
    const origFailOpen = process.env.CAPTCHA_FAIL_OPEN

    beforeEach(() => {
      process.env.CAPTCHA_ENABLED = 'true' // 强制启用，命中票据缺失分支
    })

    afterEach(() => {
      if (origEnabled === undefined) delete process.env.CAPTCHA_ENABLED
      else process.env.CAPTCHA_ENABLED = origEnabled
      if (origFailOpen === undefined) delete process.env.CAPTCHA_FAIL_OPEN
      else process.env.CAPTCHA_FAIL_OPEN = origFailOpen
    })

    test('CAPTCHA_FAIL_OPEN 默认（未配置）→ 票据缺失放行（天御失效时短信仍可用）', async () => {
      delete process.env.CAPTCHA_FAIL_OPEN // 默认 fail-open
      const passed = await CaptchaService.verify({ captcha_ticket: '', user_ip: '127.0.0.1' })
      expect(passed).toBe(true)
    })

    test('CAPTCHA_FAIL_OPEN=false → 票据缺失严格拒绝', async () => {
      process.env.CAPTCHA_FAIL_OPEN = 'false'
      const passed = await CaptchaService.verify({ captcha_ticket: '', user_ip: '127.0.0.1' })
      expect(passed).toBe(false)
    })
  })
})

describe('AdminLoginSecurityService - 管理端失败锁定（P2）', () => {
  let AdminLoginSecurityService

  beforeAll(() => {
    AdminLoginSecurityService = global.getTestService('admin_login_security')
    expect(AdminLoginSecurityService).toBeTruthy()
  })

  afterEach(async () => {
    await cleanupRedis()
  })

  test('连续失败达到阈值后 assertLoginAllowed 抛 LOGIN_LOCKED(429)', async () => {
    const maxFail = parseInt(process.env.ADMIN_LOGIN_MAX_FAIL || '5', 10)

    // 阈值前：每次记录失败后仍允许（未锁定）
    for (let i = 0; i < maxFail; i++) {
      // 用测试号（未注册），审计会走"仅日志留痕"分支，不写审计表（不违反外键）
      await AdminLoginSecurityService.recordFailure({ mobile: TEST_MOBILE, ip: '127.0.0.1' })
    }

    // 达到阈值：再次校验应被锁定
    await expect(
      AdminLoginSecurityService.assertLoginAllowed({ mobile: TEST_MOBILE, ip: '127.0.0.1' })
    ).rejects.toMatchObject({
      code: 'LOGIN_LOCKED',
      statusCode: 429
    })
  })

  test('clearFailures 清零后重新允许登录', async () => {
    const maxFail = parseInt(process.env.ADMIN_LOGIN_MAX_FAIL || '5', 10)
    for (let i = 0; i < maxFail; i++) {
      await AdminLoginSecurityService.recordFailure({ mobile: TEST_MOBILE, ip: '127.0.0.1' })
    }
    await AdminLoginSecurityService.clearFailures(TEST_MOBILE)

    // 清零后不再抛错
    await expect(
      AdminLoginSecurityService.assertLoginAllowed({ mobile: TEST_MOBILE, ip: '127.0.0.1' })
    ).resolves.toBeUndefined()
  })

  test('IP 白名单默认不启用（ADMIN_IP_ALLOWLIST 留空）时任意 IP 放行', async () => {
    // 默认 .env 未配置白名单 → 任意 IP 应放行（不抛 IP_NOT_ALLOWED）
    await expect(
      AdminLoginSecurityService.assertLoginAllowed({ mobile: TEST_MOBILE, ip: '8.8.8.8' })
    ).resolves.toBeUndefined()
  })
})
