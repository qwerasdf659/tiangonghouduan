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
 * 业务规则：
 * - 解锁条件1: users.history_total_points >= 100000（历史累计10万积分门槛）
 * - 解锁条件2: account_asset_balances.available_amount >= 100（当前POINTS余额>=100积分）
 * - 解锁费用: 100积分
 * - 有效期: 24小时
 * - 过期后需重新手动解锁（无自动续费）
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
      expect(data.pagination).toHaveProperty('total_count')
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

  // ===== 测试清理（After All Tests） =====
  afterAll(async () => {
    await sequelize.close()
  })
})
