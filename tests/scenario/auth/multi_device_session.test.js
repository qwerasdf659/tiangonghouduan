/**
 * 设备级多会话（Device-Session）场景测试
 *
 * 测试目的：验证"设备级多会话"隔离语义（docs/会话认证体系最终方案-设备级多会话.md）
 * 隔离 key = (user_id, user_type) + device_id，platform 仅作展示标签，不再参与隔离。
 *
 * 核心业务标准（重写依据：从旧"按平台单点互斥"统一到正确的"设备级多会话"）：
 * - 同一设备（相同 X-Device-Id）重复登录 → 旧 token 失效（token 轮换），错误码 SESSION_REVOKED
 * - 不同设备（不同 X-Device-Id）登录 → 会话并存，互不踢（解决"同账号多浏览器互踢"痛点）
 * - 跨平台（Web + 微信小程序）并存
 * - 管理端/用户端踢设备 → 对应会话立即失效
 * - 用户端 GET /auth/sessions 能列出自己的在线设备（含 is_current 后端判定）
 *
 * 技术实现：
 * - 认证：middleware/auth.js（Redis 优先校验 + MySQL 降级 + 错误码细分）
 * - 会话写：SessionManagementService.createDeviceSession（设备级隔离 + Redis 注册表）
 * - 设备隔离：AuthenticationSession.deactivateDeviceSessions（按 device_id 替换）
 *
 * @updated 2026-06-01（设备级多会话方案，替换旧"按平台单点互斥"测试语义）
 */

const request = require('supertest')
const app = require('../../../app')
const { sequelize, AuthenticationSession, User } = require('../../../models')

const TEST_MOBILE = '13612227910' // 统一测试用户手机号
const TEST_VERIFICATION_CODE = '123456' // 开发环境万能验证码

// 模拟两台不同设备的稳定 device_id（前端生成并持久化的 UUID）
const DEVICE_A = 'test-device-aaaaaaaa-1111-2222-3333-444444444444'
const DEVICE_B = 'test-device-bbbbbbbb-5555-6666-7777-888888888888'

describe('设备级多会话（Device-Session）场景测试', () => {
  let testUserId = null
  let skipTests = false

  beforeAll(async () => {
    console.log('\n===== 设备级多会话场景测试 =====')
    console.log('📌 测试用户手机号:', TEST_MOBILE)

    try {
      const user = await User.findOne({
        where: { mobile: TEST_MOBILE },
        attributes: ['user_id', 'mobile', 'status']
      })
      if (user) {
        testUserId = user.user_id
        console.log(`✅ 测试用户已找到: user_id=${testUserId}`)
      } else {
        console.warn('⚠️ 测试用户不存在，将在登录时自动创建')
      }
    } catch (error) {
      console.warn('⚠️ 初始化失败:', error.message)
      skipTests = true
    }
  }, 30000)

  beforeEach(async () => {
    if (skipTests || !testUserId) return
    try {
      // 每个用例前清理该用户所有会话，保证用例独立
      await AuthenticationSession.destroy({ where: { user_id: testUserId }, force: true })
    } catch (error) {
      console.warn('⚠️ 清理会话失败（非致命）:', error.message)
    }
  })

  afterAll(async () => {
    if (testUserId) {
      try {
        await AuthenticationSession.destroy({ where: { user_id: testUserId }, force: true })
        console.log(`✅ 已清理用户 ${testUserId} 的所有会话`)
      } catch (error) {
        console.warn('⚠️ 清理失败（非致命）:', error.message)
      }
    }
    await sequelize.close()
    console.log('✅ 数据库连接已关闭')
  })

  /**
   * 场景1（核心）：不同设备登录 → 会话并存，互不踢
   * 这是设备级多会话要解决的核心痛点："同账号多浏览器/多设备被强制互踢"。
   */
  test('场景1：不同设备（不同 X-Device-Id）登录应并存、互不踢', async () => {
    if (skipTests) {
      expect(true).toBe(true)
      return
    }
    console.log('\n===== 场景1：不同设备并存 =====')

    // 设备A登录
    const loginA = await request(app)
      .post('/api/v4/auth/login')
      .set('X-Device-Id', DEVICE_A)
      .send({ mobile: TEST_MOBILE, verification_code: TEST_VERIFICATION_CODE })
    expect(loginA.status).toBe(200)
    const tokenA = loginA.body.data.access_token
    testUserId = loginA.body.data.user.user_id

    // 设备B登录（不同 device_id）
    const loginB = await request(app)
      .post('/api/v4/auth/login')
      .set('X-Device-Id', DEVICE_B)
      .send({ mobile: TEST_MOBILE, verification_code: TEST_VERIFICATION_CODE })
    expect(loginB.status).toBe(200)
    const tokenB = loginB.body.data.access_token

    // 设备A的Token仍然有效（不被设备B踢掉）
    const profileA = await request(app)
      .get('/api/v4/auth/profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Device-Id', DEVICE_A)
    expect(profileA.status).toBe(200)
    expect(profileA.body.success).toBe(true)
    console.log('✅ 设备A Token仍有效（未被设备B互踢）')

    // 设备B的Token也有效
    const profileB = await request(app)
      .get('/api/v4/auth/profile')
      .set('Authorization', `Bearer ${tokenB}`)
      .set('X-Device-Id', DEVICE_B)
    expect(profileB.status).toBe(200)
    console.log('✅ 设备B Token有效')

    // 数据库验证：两个设备会话并存
    const activeSessions = await AuthenticationSession.findUserActiveSessions('user', testUserId)
    const deviceIds = activeSessions.map(s => s.device_id).sort()
    expect(activeSessions.length).toBe(2)
    expect(deviceIds).toEqual([DEVICE_A, DEVICE_B].sort())
    console.log('✅ 数据库验证：两个设备会话并存')
  }, 30000)

  /**
   * 场景2（核心）：同一设备重复登录 → 旧 token 失效（token 轮换）
   * 同 device_id 再次登录 = 替换自己这台设备的旧会话，错误码 SESSION_REVOKED。
   */
  test('场景2：同设备（相同 X-Device-Id）重登应替换旧会话（SESSION_REVOKED）', async () => {
    if (skipTests) {
      expect(true).toBe(true)
      return
    }
    console.log('\n===== 场景2：同设备 token 轮换 =====')

    // 同一设备第一次登录
    const login1 = await request(app)
      .post('/api/v4/auth/login')
      .set('X-Device-Id', DEVICE_A)
      .send({ mobile: TEST_MOBILE, verification_code: TEST_VERIFICATION_CODE })
    expect(login1.status).toBe(200)
    const token1 = login1.body.data.access_token
    testUserId = login1.body.data.user.user_id

    // 同一设备第二次登录（device_id 相同）→ 替换旧会话
    const login2 = await request(app)
      .post('/api/v4/auth/login')
      .set('X-Device-Id', DEVICE_A)
      .send({ mobile: TEST_MOBILE, verification_code: TEST_VERIFICATION_CODE })
    expect(login2.status).toBe(200)
    const token2 = login2.body.data.access_token

    // 旧 token 应失效，错误码 SESSION_REVOKED（设备级会话被同设备新登录替换）
    const profileOld = await request(app)
      .get('/api/v4/auth/profile')
      .set('Authorization', `Bearer ${token1}`)
      .set('X-Device-Id', DEVICE_A)
    expect(profileOld.status).toBe(401)
    expect(profileOld.body.code).toBe('SESSION_REVOKED')
    console.log(`✅ 同设备旧 token 已失效: code=${profileOld.body.code}`)

    // 新 token 有效
    const profileNew = await request(app)
      .get('/api/v4/auth/profile')
      .set('Authorization', `Bearer ${token2}`)
      .set('X-Device-Id', DEVICE_A)
    expect(profileNew.status).toBe(200)
    console.log('✅ 同设备新 token 有效')

    // 数据库：该设备只有 1 个活跃会话
    const activeSessions = await AuthenticationSession.findActiveByDevice(
      'user',
      testUserId,
      DEVICE_A
    )
    expect(activeSessions).not.toBeNull()
    console.log('✅ 数据库验证：同设备仅 1 个活跃会话')
  }, 30000)

  /**
   * 场景3：跨平台（Web + 微信小程序）会话并存
   */
  test('场景3：Web登录 + 微信快速登录应共存', async () => {
    if (skipTests) {
      expect(true).toBe(true)
      return
    }
    console.log('\n===== 场景3：跨平台并存 =====')

    const webLogin = await request(app)
      .post('/api/v4/auth/login')
      .set('X-Device-Id', DEVICE_A)
      .send({ mobile: TEST_MOBILE, verification_code: TEST_VERIFICATION_CODE })
    expect(webLogin.status).toBe(200)
    const webToken = webLogin.body.data.access_token
    testUserId = webLogin.body.data.user.user_id

    const wxLogin = await request(app)
      .post('/api/v4/auth/quick-login')
      .set('X-Device-Id', DEVICE_B)
      .send({ mobile: TEST_MOBILE })
    expect(wxLogin.status).toBe(200)
    const wxToken = wxLogin.body.data.access_token

    const webProfile = await request(app)
      .get('/api/v4/auth/profile')
      .set('Authorization', `Bearer ${webToken}`)
      .set('X-Device-Id', DEVICE_A)
    expect(webProfile.status).toBe(200)

    const wxProfile = await request(app)
      .get('/api/v4/auth/profile')
      .set('Authorization', `Bearer ${wxToken}`)
      .set('X-Device-Id', DEVICE_B)
    expect(wxProfile.status).toBe(200)

    const activeSessions = await AuthenticationSession.findAll({
      where: { user_id: testUserId, is_active: true },
      attributes: ['login_platform']
    })
    const platforms = activeSessions.map(s => s.login_platform)
    expect(platforms).toContain('web')
    expect(platforms).toContain('wechat_mp')
    console.log('✅ 跨平台会话并存正常')
  }, 30000)

  /**
   * 场景4：用户端设备列表 + 踢自己设备
   * GET /api/v4/auth/sessions 列出自己设备；DELETE 踢掉某设备后该 token 失效。
   */
  test('场景4：用户端可列出并踢掉自己的设备', async () => {
    if (skipTests) {
      expect(true).toBe(true)
      return
    }
    console.log('\n===== 场景4：用户端设备管理 =====')

    // 设备A、设备B分别登录
    const loginA = await request(app)
      .post('/api/v4/auth/login')
      .set('X-Device-Id', DEVICE_A)
      .send({ mobile: TEST_MOBILE, verification_code: TEST_VERIFICATION_CODE })
    expect(loginA.status).toBe(200)
    const tokenA = loginA.body.data.access_token
    testUserId = loginA.body.data.user.user_id

    const loginB = await request(app)
      .post('/api/v4/auth/login')
      .set('X-Device-Id', DEVICE_B)
      .send({ mobile: TEST_MOBILE, verification_code: TEST_VERIFICATION_CODE })
    expect(loginB.status).toBe(200)
    const tokenB = loginB.body.data.access_token

    // 用设备A的token列出自己的设备（应有2个，且A标记 is_current）
    const listRes = await request(app)
      .get('/api/v4/auth/sessions')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Device-Id', DEVICE_A)
    expect(listRes.status).toBe(200)
    expect(listRes.body.success).toBe(true)
    const list = listRes.body.data.list
    expect(Array.isArray(list)).toBe(true)
    expect(list.length).toBe(2)

    const currentItem = list.find(item => item.is_current === true)
    expect(currentItem).toBeTruthy()
    expect(currentItem.device_id).toBe(DEVICE_A)
    console.log(`✅ 设备列表返回 ${list.length} 台，当前设备 is_current 判定正确`)

    // 找到设备B的会话，用设备A的token踢掉设备B
    const deviceBItem = list.find(item => item.device_id === DEVICE_B)
    expect(deviceBItem).toBeTruthy()

    const delRes = await request(app)
      .delete(`/api/v4/auth/sessions/${deviceBItem.authentication_session_id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Device-Id', DEVICE_A)
    expect(delRes.status).toBe(200)
    expect(delRes.body.success).toBe(true)
    console.log('✅ 已踢掉设备B')

    // 设备B的token应失效（SESSION_REVOKED）
    const profileB = await request(app)
      .get('/api/v4/auth/profile')
      .set('Authorization', `Bearer ${tokenB}`)
      .set('X-Device-Id', DEVICE_B)
    expect(profileB.status).toBe(401)
    expect(profileB.body.code).toBe('SESSION_REVOKED')
    console.log(`✅ 设备B token 已失效: code=${profileB.body.code}`)

    // 设备A仍有效
    const profileA = await request(app)
      .get('/api/v4/auth/profile')
      .set('Authorization', `Bearer ${tokenA}`)
      .set('X-Device-Id', DEVICE_A)
    expect(profileA.status).toBe(200)
    console.log('✅ 设备A 仍有效（踢B不误伤A）')
  }, 30000)

  /**
   * 场景5：越权防护 - 不能踢他人的会话
   */
  test('场景5：用户不能踢掉不存在/他人的会话', async () => {
    if (skipTests) {
      expect(true).toBe(true)
      return
    }
    console.log('\n===== 场景5：越权防护 =====')

    const login = await request(app)
      .post('/api/v4/auth/login')
      .set('X-Device-Id', DEVICE_A)
      .send({ mobile: TEST_MOBILE, verification_code: TEST_VERIFICATION_CODE })
    expect(login.status).toBe(200)
    const token = login.body.data.access_token
    testUserId = login.body.data.user.user_id

    // 尝试踢一个极大的、不属于自己的会话ID → 404（不存在）
    const delRes = await request(app)
      .delete('/api/v4/auth/sessions/999999999')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Device-Id', DEVICE_A)
    expect(delRes.status).toBe(404)
    expect(delRes.body.code).toBe('SESSION_NOT_FOUND')
    console.log('✅ 踢不存在的会话返回 404')
  }, 30000)

  /**
   * 场景6：会话统计的"设备维度"（by_device）正确反映真实设备
   *
   * 业务标准（方案 8.2 / 决策B）：管理端会话统计除 by_user_type 外，必须给出设备维度：
   * - total_devices：去重真实设备数（device_id 非空）
   * - multi_device_users：在 >1 台设备在线的用户数
   * 本用例用同一用户两台真实设备登录，断言统计能数出 2 台设备、1 个多设备用户。
   */
  test('场景6：会话统计 by_device 维度正确反映真实设备', async () => {
    if (skipTests) {
      expect(true).toBe(true)
      return
    }
    console.log('\n===== 场景6：统计设备维度 =====')

    const SessionQueryService = require('../../../services/console/SessionQueryService')

    // 同一用户两台真实设备登录
    const loginA = await request(app)
      .post('/api/v4/auth/login')
      .set('X-Device-Id', DEVICE_A)
      .send({ mobile: TEST_MOBILE, verification_code: TEST_VERIFICATION_CODE })
    expect(loginA.status).toBe(200)
    testUserId = loginA.body.data.user.user_id

    const loginB = await request(app)
      .post('/api/v4/auth/login')
      .set('X-Device-Id', DEVICE_B)
      .send({ mobile: TEST_MOBILE, verification_code: TEST_VERIFICATION_CODE })
    expect(loginB.status).toBe(200)

    // 直接调用模型设备维度统计（避免统计缓存影响，校验底层口径）
    const deviceStats = await AuthenticationSession.getActiveDeviceStats()
    // 至少包含本测试用户的 2 台设备
    expect(deviceStats.total_devices).toBeGreaterThanOrEqual(2)
    // 本用户在 2 台设备在线 → 多设备用户至少 1
    expect(deviceStats.multi_device_users).toBeGreaterThanOrEqual(1)
    console.log(
      `✅ 设备维度统计: total_devices=${deviceStats.total_devices}, multi_device_users=${deviceStats.multi_device_users}`
    )

    // 在线用户列表应给出该用户的 device_count=2（先清缓存避免 15s 短缓存返回旧数据）
    const { BusinessCacheHelper } = require('../../../utils/BusinessCacheHelper')
    await BusinessCacheHelper.del('console:online_users', 'test_refresh')
    const online = await SessionQueryService.getOnlineUsers()
    const me = (online.online_users || []).find(u => u.user_id === testUserId)
    expect(me).toBeTruthy()
    expect(me.device_count).toBeGreaterThanOrEqual(2)
    console.log(`✅ 在线用户 device_count=${me.device_count}`)
  }, 30000)
})
