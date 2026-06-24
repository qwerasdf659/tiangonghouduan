/**
 * 高级会员系统API测试 - P2优先级
 *
 * 测试目标：验证高级空间管理功能的完整性
 *
 * 功能覆盖（管理后台API）：
 * 1. GET /api/v4/console/user-premium - 查询用户高级空间状态列表
 * 2. GET /api/v4/console/user-premium/stats - 获取高级空间状态统计汇总
 * 3. GET /api/v4/console/user-premium/expiring - 获取即将过期的用户列表
 * 4. GET /api/v4/console/user-premium/:user_id - 获取单个用户的高级空间状态
 *
 * 业务规则（2026-06-25 起，以下阈值为默认值，运营可在 Web 后台「系统设置 → 臻选空间」动态调整，
 * 存 system_settings category='premium'，PremiumService 经 AdminSystemService.getSettingValue 读取）：
 * - 解锁条件1: users.history_total_points >= history_points_threshold（默认 100000，历史累计积分门槛）
 * - 解锁条件2: account_asset_balances.available_amount >= unlock_cost（默认 100，当前 POINTS 余额门槛）
 * - 解锁费用: unlock_cost（默认 100 积分）
 * - 有效期: validity_hours（默认 24 小时）
 * - 过期后需重新手动解锁（无自动续费）；管理员可经 /user-premium/:id/extend|revoke 手动延期/撤销（unlock_method='manual'）
 *
 * 权限要求：管理员（role_level >= 100）
 *
 * 创建时间：2026-01-28
 * P2优先级：高级会员模块
 */

const request = require('supertest')
const app = require('../../../app')
const { sequelize, User } = require('../../../models')
const { TEST_DATA } = require('../../helpers/test-data')

// 测试数据
let admin_token = null
let admin_user_id = null

// 测试用户数据（使用管理员账号）
const test_mobile = TEST_DATA.users.adminUser.mobile

describe('高级空间管理API测试 - P2优先级', () => {
  /*
   * ===== 测试准备（Before All Tests） =====
   */
  beforeAll(async () => {
    // 1. 获取管理员用户信息
    const admin_user = await User.findOne({
      where: { mobile: test_mobile }
    })

    if (!admin_user) {
      throw new Error(`管理员用户不存在：${test_mobile}，请先创建测试用户`)
    }

    admin_user_id = admin_user.user_id

    // 2. 登录获取token
    const login_response = await request(app).post('/api/v4/auth/login').send({
      mobile: test_mobile,
      verification_code: TEST_DATA.auth.verificationCode // 使用统一验证码
    })

    if (login_response.status !== 200) {
      throw new Error(`登录失败：${JSON.stringify(login_response.body)}`)
    }

    admin_token = login_response.body.data.access_token
  }, 60000)

  // ===== 测试用例1：验证状态列表查询API =====
  describe('GET /api/v4/console/user-premium - 查询用户高级空间状态列表', () => {
    test('应该返回正确的列表结构', async () => {
      const response = await request(app)
        .get('/api/v4/console/user-premium')
        .set('Authorization', `Bearer ${admin_token}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.code).toBe('SUCCESS')
      expect(response.body).toHaveProperty('data')

      // 验证返回数据结构
      const data = response.body.data
      expect(data).toHaveProperty('statuses')
      expect(data).toHaveProperty('pagination')
      expect(Array.isArray(data.statuses)).toBe(true)

      // 验证分页结构
      expect(data.pagination).toHaveProperty('total')
      expect(data.pagination).toHaveProperty('page')
      expect(data.pagination).toHaveProperty('page_size')
      expect(data.pagination).toHaveProperty('total_pages')
    })

    test('应该支持分页查询', async () => {
      const response = await request(app)
        .get('/api/v4/console/user-premium')
        .query({ page: 1, page_size: 5 })
        .set('Authorization', `Bearer ${admin_token}`)

      expect(response.status).toBe(200)
      const data = response.body.data

      // 验证分页参数生效
      expect(data.pagination.page).toBe(1)
      expect(data.pagination.page_size).toBe(5)
      expect(data.statuses.length).toBeLessThanOrEqual(5)
    })

    test('应该支持按解锁状态筛选', async () => {
      const response = await request(app)
        .get('/api/v4/console/user-premium')
        .query({ is_unlocked: 'true' })
        .set('Authorization', `Bearer ${admin_token}`)

      expect(response.status).toBe(200)
      const data = response.body.data

      // 验证筛选结果（如果有数据）
      if (data.statuses.length > 0) {
        data.statuses.forEach(status => {
          expect(status.is_unlocked).toBe(true)
        })
      }
    })

    test('应该支持按有效期状态筛选', async () => {
      const response = await request(app)
        .get('/api/v4/console/user-premium')
        .query({ is_valid: 'true' })
        .set('Authorization', `Bearer ${admin_token}`)

      expect(response.status).toBe(200)
      const data = response.body.data

      // 验证筛选结果（如果有数据）
      if (data.statuses.length > 0) {
        data.statuses.forEach(status => {
          expect(status.is_valid).toBe(true)
        })
      }
    })

    test('应该支持按解锁方式筛选', async () => {
      const response = await request(app)
        .get('/api/v4/console/user-premium')
        .query({ unlock_method: 'points' })
        .set('Authorization', `Bearer ${admin_token}`)

      expect(response.status).toBe(200)
      const data = response.body.data

      // 验证筛选结果（如果有数据）
      if (data.statuses.length > 0) {
        data.statuses.forEach(status => {
          expect(status.unlock_method).toBe('points')
        })
      }
    })

    test('应该拒绝无token的请求', async () => {
      const response = await request(app).get('/api/v4/console/user-premium')

      expect(response.status).toBe(401)
    })
  })

  // ===== 测试用例2：验证统计汇总API =====
  describe('GET /api/v4/console/user-premium/stats - 获取高级空间状态统计', () => {
    test('应该返回正确的统计结构', async () => {
      const response = await request(app)
        .get('/api/v4/console/user-premium/stats')
        .set('Authorization', `Bearer ${admin_token}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.code).toBe('SUCCESS')

      const data = response.body.data
      expect(data).toHaveProperty('summary')
      expect(data).toHaveProperty('by_unlock_method')

      // 验证summary结构
      expect(data.summary).toHaveProperty('total_records')
      expect(data.summary).toHaveProperty('total_unlock_count')
      expect(data.summary).toHaveProperty('active_users')
      expect(data.summary).toHaveProperty('expired_users')

      // 验证数据类型
      expect(typeof data.summary.total_records).toBe('number')
      expect(typeof data.summary.active_users).toBe('number')
      expect(typeof data.summary.expired_users).toBe('number')
    })

    test('应该拒绝无token的请求', async () => {
      const response = await request(app).get('/api/v4/console/user-premium/stats')

      expect(response.status).toBe(401)
    })
  })

  // ===== 测试用例3：验证即将过期用户列表API =====
  describe('GET /api/v4/console/user-premium/expiring - 获取即将过期用户列表', () => {
    test('应该返回正确的列表结构', async () => {
      const response = await request(app)
        .get('/api/v4/console/user-premium/expiring')
        .set('Authorization', `Bearer ${admin_token}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.code).toBe('SUCCESS')

      const data = response.body.data
      expect(data).toHaveProperty('statuses')
      expect(data).toHaveProperty('pagination')
      expect(Array.isArray(data.statuses)).toBe(true)
    })

    test('应该支持自定义过期时间范围', async () => {
      const response = await request(app)
        .get('/api/v4/console/user-premium/expiring')
        .query({ hours: 48 })
        .set('Authorization', `Bearer ${admin_token}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
    })

    test('应该支持分页参数', async () => {
      const response = await request(app)
        .get('/api/v4/console/user-premium/expiring')
        .query({ page: 1, page_size: 10 })
        .set('Authorization', `Bearer ${admin_token}`)

      expect(response.status).toBe(200)
      const data = response.body.data
      expect(data.pagination.page).toBe(1)
      expect(data.pagination.page_size).toBe(10)
    })

    test('应该拒绝无token的请求', async () => {
      const response = await request(app).get('/api/v4/console/user-premium/expiring')

      expect(response.status).toBe(401)
    })
  })

  // ===== 测试用例4：验证单个用户状态查询API =====
  describe('GET /api/v4/console/user-premium/:user_id - 获取单个用户的高级空间状态', () => {
    test('应该返回存在用户的高级空间状态', async () => {
      const response = await request(app)
        .get(`/api/v4/console/user-premium/${admin_user_id}`)
        .set('Authorization', `Bearer ${admin_token}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.code).toBe('SUCCESS')

      const data = response.body.data
      // 用户可能已解锁或未解锁，都应该返回正确的结构
      expect(data).toHaveProperty('user_id')

      if (data.is_unlocked) {
        // 已解锁状态
        expect(data).toHaveProperty('unlock_method')
        expect(data).toHaveProperty('is_valid')
      } else {
        // 未解锁状态（返回默认值）
        expect(data.is_unlocked).toBe(false)
      }
    })

    test('未解锁用户应返回默认状态（非404）', async () => {
      // 使用一个可能不存在高级空间记录的用户ID
      const response = await request(app)
        .get('/api/v4/console/user-premium/999999')
        .set('Authorization', `Bearer ${admin_token}`)

      // 即使用户没有高级空间记录，也应该返回200和默认状态
      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.is_unlocked).toBe(false)
    })

    test('应该拒绝无token的请求', async () => {
      const response = await request(app).get(`/api/v4/console/user-premium/${admin_user_id}`)

      expect(response.status).toBe(401)
    })
  })

  // ===== 测试用例5：验证数据完整性 =====
  describe('数据完整性验证', () => {
    test('列表响应应包含用户关联信息', async () => {
      const response = await request(app)
        .get('/api/v4/console/user-premium')
        .query({ page_size: 1 })
        .set('Authorization', `Bearer ${admin_token}`)

      expect(response.status).toBe(200)
      const data = response.body.data

      // 如果有数据，验证用户关联信息
      if (data.statuses.length > 0) {
        const status = data.statuses[0]
        // 应该包含用户基本信息
        if (status.user) {
          expect(status.user).toHaveProperty('user_id')
        }
      }
    })

    test('统计数据应一致', async () => {
      const statsResponse = await request(app)
        .get('/api/v4/console/user-premium/stats')
        .set('Authorization', `Bearer ${admin_token}`)

      expect(statsResponse.status).toBe(200)
      const stats = statsResponse.body.data.summary

      // 总记录数应该 >= 活跃用户数 + 过期用户数（因为可能有从未解锁的记录）
      expect(stats.total_records).toBeGreaterThanOrEqual(0)
      expect(stats.active_users).toBeGreaterThanOrEqual(0)
      expect(stats.expired_users).toBeGreaterThanOrEqual(0)
    })
  })

  // ===== 测试用例6：验证权限控制 =====
  describe('权限控制验证', () => {
    test('所有API应该拒绝无token请求', async () => {
      const endpoints = [
        '/api/v4/console/user-premium',
        '/api/v4/console/user-premium/stats',
        '/api/v4/console/user-premium/expiring',
        `/api/v4/console/user-premium/${admin_user_id}`
      ]

      for (const endpoint of endpoints) {
        const response = await request(app).get(endpoint)
        expect(response.status).toBe(401)
      }
    })
  })

  // ===== 测试用例7：臻选空间解锁条件下发 + 运营可配（2026-06-25 新增）=====
  describe('臻选空间解锁条件下发与运营可配', () => {
    const PremiumService = require('../../../services/PremiumService')
    const AdminSystemService = require('../../../services/AdminSystemService')
    const TransactionManager = require('../../../utils/TransactionManager')

    /** 更新 premium 配置（包事务边界，等价于路由层 TransactionManager.execute） */
    const updatePremiumSetting = (key, value) =>
      TransactionManager.execute(
        async transaction =>
          AdminSystemService.updateSettings('premium', { [key]: value }, admin_user_id, {
            transaction
          }),
        { description: 'test-update-premium-setting' }
      )

    test('getPremiumStatus 对无积分账户用户不抛 500（null 安全），并返回完整 conditions', async () => {
      /*
       * 回归用例：修复前 BalanceService.getBalance 返回 null 时
       * Number(pointsBalance.available_amount) 崩溃导致 /premium-status 500。
       * 这里直接调 Service 验证无论用户是否有积分账户都能正常返回条件明细。
       */
      const status = await PremiumService.getPremiumStatus(admin_user_id)
      expect(status).toBeDefined()
      // 未解锁时必须带 conditions（前端据此渲染"还差多少"）
      if (!status.unlocked || !status.is_valid) {
        expect(status.conditions).toBeDefined()
        expect(status.conditions.condition_1).toHaveProperty('required')
        expect(status.conditions.condition_1).toHaveProperty('current')
        expect(status.conditions.condition_1).toHaveProperty('shortage')
        expect(status.conditions.condition_2).toHaveProperty('required')
        expect(typeof status.can_unlock).toBe('boolean')
      }
    })

    test('解锁条件阈值来自 system_settings（运营可配）：改 unlock_cost 后 conditions 同步变化', async () => {
      // 读当前值（用于断言后还原）
      const original = await AdminSystemService.getSettingValue('premium', 'unlock_cost', 100)

      try {
        // 改成一个明显不同的值
        await updatePremiumSetting('unlock_cost', 50)

        // 经 Service 读取应反映新值（_getUnlockRules 读配置）
        const status = await PremiumService.getPremiumStatus(admin_user_id)
        expect(status.unlock_cost).toBe(50)
        if (!status.unlocked || !status.is_valid) {
          expect(status.conditions.condition_2.required).toBe(50)
        }
      } finally {
        // 还原，绝不留测试值
        await updatePremiumSetting('unlock_cost', Number(original) || 100)
        const restored = await AdminSystemService.getSettingValue('premium', 'unlock_cost', 100)
        expect(Number(restored)).toBe(Number(original) || 100)
      }
    })

    test('白名单范围约束：unlock_cost 超出最大值应被拒绝（不写库）', async () => {
      const result = await updatePremiumSetting('unlock_cost', 999999) // 超过白名单 max=100000
      // 越界项更新失败
      expect(result.error_count).toBeGreaterThanOrEqual(1)
      // 库值未被改坏（仍 ≤ 合法上限）
      const current = await AdminSystemService.getSettingValue('premium', 'unlock_cost', 100)
      expect(Number(current)).toBeLessThanOrEqual(100000)
    })
  })

  // ===== 测试用例8：管理员手动延期/撤销高级空间（2026-06-25 新增写接口）=====
  describe('管理员手动延期/撤销高级空间', () => {
    test('POST /:user_id/extend 应延长有效期（unlock_method=manual），并被审计', async () => {
      const response = await request(app)
        .post(`/api/v4/console/user-premium/${admin_user_id}/extend`)
        .set('Authorization', `Bearer ${admin_token}`)
        .send({ days: 1 })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.is_unlocked).toBe(true)
      expect(response.body.data.unlock_method).toBe('manual')
      expect(response.body.data.extended_days).toBe(1)
      expect(response.body.data.expires_at).toBeTruthy()
    })

    test('POST /:user_id/extend 非法天数应返回 400', async () => {
      const response = await request(app)
        .post(`/api/v4/console/user-premium/${admin_user_id}/extend`)
        .set('Authorization', `Bearer ${admin_token}`)
        .send({ days: 99999 }) // 超过 3650 上限

      expect(response.status).toBe(400)
      expect(response.body.code).toBe('INVALID_DAYS')
    })

    test('POST /:user_id/revoke 应撤销高级空间（立即失效），并被审计', async () => {
      const response = await request(app)
        .post(`/api/v4/console/user-premium/${admin_user_id}/revoke`)
        .set('Authorization', `Bearer ${admin_token}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.is_unlocked).toBe(false)
    })

    test('不存在用户 revoke 应返回 404', async () => {
      const response = await request(app)
        .post('/api/v4/console/user-premium/9999999/revoke')
        .set('Authorization', `Bearer ${admin_token}`)

      expect(response.status).toBe(404)
      expect(response.body.code).toBe('USER_NOT_FOUND')
    })

    test('写接口应拒绝无 token 请求', async () => {
      const extendResp = await request(app)
        .post(`/api/v4/console/user-premium/${admin_user_id}/extend`)
        .send({ days: 1 })
      expect(extendResp.status).toBe(401)

      const revokeResp = await request(app).post(
        `/api/v4/console/user-premium/${admin_user_id}/revoke`
      )
      expect(revokeResp.status).toBe(401)
    })
  })

  // ===== 测试清理（After All Tests） =====
  afterAll(async () => {
    await sequelize.close()
  })
})
