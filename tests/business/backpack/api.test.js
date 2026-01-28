/**
 * 背包API测试 - P2优先级
 *
 * 测试目标：验证用户端背包查询API的完整性
 *
 * 功能覆盖：
 * 1. GET /api/v4/backpack - 获取用户背包（资产 + 物品）
 * 2. GET /api/v4/backpack/stats - 获取背包统计信息
 *
 * 相关模型：
 * - ItemInstance: 物品实例
 * - AccountAssetBalance: 资产余额
 *
 * 相关服务：
 * - BackpackService: 背包服务
 *
 * 权限要求：已登录用户（authenticateToken）
 *
 * 创建时间：2026-01-28
 * P2优先级：物品系统模块
 */

const request = require('supertest')
const app = require('../../../app')
const { sequelize, User } = require('../../../models')
const { TEST_DATA } = require('../../helpers/test-data')

// 测试数据
let user_token = null
let _test_user_id = null // 前缀_ 表示可能未使用

// 测试用户数据
const test_mobile = TEST_DATA.users.testUser.mobile

describe('背包API测试 - P2优先级', () => {
  /*
   * ===== 测试准备（Before All Tests） =====
   */
  beforeAll(async () => {
    // 1. 获取测试用户信息
    const test_user = await User.findOne({
      where: { mobile: test_mobile }
    })

    if (!test_user) {
      throw new Error(`测试用户不存在：${test_mobile}，请先创建测试用户`)
    }

    _test_user_id = test_user.user_id

    // 2. 登录获取token
    const login_response = await request(app).post('/api/v4/auth/login').send({
      mobile: test_mobile,
      verification_code: TEST_DATA.auth.verificationCode
    })

    if (login_response.status !== 200) {
      throw new Error(`登录失败：${JSON.stringify(login_response.body)}`)
    }

    user_token = login_response.body.data.access_token
    console.log('✅ 测试准备完成：用户登录成功')
  }, 60000)

  // ===== 测试用例1：获取用户背包 =====
  describe('GET /api/v4/backpack - 获取用户背包', () => {
    test('应该返回正确的背包结构', async () => {
      const response = await request(app)
        .get('/api/v4/backpack')
        .set('Authorization', `Bearer ${user_token}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.code).toBe('SUCCESS')
      expect(response.body).toHaveProperty('data')

      const data = response.body.data
      // 验证双轨架构：assets[] + items[]
      expect(data).toHaveProperty('assets')
      expect(data).toHaveProperty('items')
      expect(Array.isArray(data.assets)).toBe(true)
      expect(Array.isArray(data.items)).toBe(true)
    })

    test('应该返回正确的资产数据结构', async () => {
      const response = await request(app)
        .get('/api/v4/backpack')
        .set('Authorization', `Bearer ${user_token}`)

      expect(response.status).toBe(200)

      const { assets } = response.body.data

      // 如果有资产数据，验证结构
      if (assets.length > 0) {
        const asset = assets[0]
        // 资产应该包含以下字段
        expect(asset).toHaveProperty('asset_code')
        expect(asset).toHaveProperty('display_name')
        expect(asset).toHaveProperty('balance')
        // 可选字段
        if (asset.frozen_balance !== undefined) {
          expect(typeof asset.frozen_balance).toBe('number')
        }
        if (asset.available_balance !== undefined) {
          expect(typeof asset.available_balance).toBe('number')
        }
      }
    })

    test('应该返回正确的物品数据结构', async () => {
      const response = await request(app)
        .get('/api/v4/backpack')
        .set('Authorization', `Bearer ${user_token}`)

      expect(response.status).toBe(200)

      const { items } = response.body.data

      // 如果有物品数据，验证结构
      if (items.length > 0) {
        const item = items[0]
        // 物品应该包含以下字段
        expect(item).toHaveProperty('item_instance_id')
        expect(item).toHaveProperty('status')
        // 可选但常见的字段
        if (item.item_type !== undefined) {
          expect(typeof item.item_type).toBe('string')
        }
        if (item.acquired_at !== undefined) {
          expect(typeof item.acquired_at).toBe('string')
        }
      }
    })

    test('应该拒绝无token的请求', async () => {
      const response = await request(app).get('/api/v4/backpack')

      expect(response.status).toBe(401)
    })

    test('应该拒绝无效token的请求', async () => {
      const response = await request(app)
        .get('/api/v4/backpack')
        .set('Authorization', 'Bearer invalid_token_12345')

      expect(response.status).toBe(401)
    })
  })

  // ===== 测试用例2：获取背包统计信息 =====
  describe('GET /api/v4/backpack/stats - 获取背包统计信息', () => {
    test('应该返回正确的统计结构', async () => {
      const response = await request(app)
        .get('/api/v4/backpack/stats')
        .set('Authorization', `Bearer ${user_token}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.code).toBe('SUCCESS')
      expect(response.body).toHaveProperty('data')

      const data = response.body.data
      // 统计信息应该包含数量字段
      expect(data).toHaveProperty('total_assets')
      expect(data).toHaveProperty('total_items')
      expect(typeof data.total_assets).toBe('number')
      expect(typeof data.total_items).toBe('number')
    })

    test('统计数量应该是非负数', async () => {
      const response = await request(app)
        .get('/api/v4/backpack/stats')
        .set('Authorization', `Bearer ${user_token}`)

      expect(response.status).toBe(200)

      const data = response.body.data
      expect(data.total_assets).toBeGreaterThanOrEqual(0)
      expect(data.total_items).toBeGreaterThanOrEqual(0)
    })

    test('应该拒绝无token的请求', async () => {
      const response = await request(app).get('/api/v4/backpack/stats')

      expect(response.status).toBe(401)
    })
  })

  // ===== 测试用例3：背包数据一致性 =====
  describe('背包数据一致性验证', () => {
    test('背包和统计的数量应该一致', async () => {
      // 获取背包数据
      const backpackResponse = await request(app)
        .get('/api/v4/backpack')
        .set('Authorization', `Bearer ${user_token}`)

      // 获取统计数据
      const statsResponse = await request(app)
        .get('/api/v4/backpack/stats')
        .set('Authorization', `Bearer ${user_token}`)

      expect(backpackResponse.status).toBe(200)
      expect(statsResponse.status).toBe(200)

      const backpack = backpackResponse.body.data
      const stats = statsResponse.body.data

      // 验证数量一致性
      expect(backpack.assets.length).toBe(stats.total_assets)
      expect(backpack.items.length).toBe(stats.total_items)
    })
  })

  // ===== 测试用例4：性能测试 =====
  describe('背包API性能测试', () => {
    test('背包查询响应时间应该在合理范围内', async () => {
      const startTime = Date.now()

      const response = await request(app)
        .get('/api/v4/backpack')
        .set('Authorization', `Bearer ${user_token}`)

      const endTime = Date.now()
      const responseTime = endTime - startTime

      expect(response.status).toBe(200)
      // 响应时间应该在5秒内
      expect(responseTime).toBeLessThan(5000)

      console.log(`📊 背包查询响应时间: ${responseTime}ms`)
    })

    test('统计查询响应时间应该在合理范围内', async () => {
      const startTime = Date.now()

      const response = await request(app)
        .get('/api/v4/backpack/stats')
        .set('Authorization', `Bearer ${user_token}`)

      const endTime = Date.now()
      const responseTime = endTime - startTime

      expect(response.status).toBe(200)
      // 响应时间应该在3秒内
      expect(responseTime).toBeLessThan(3000)

      console.log(`📊 统计查询响应时间: ${responseTime}ms`)
    })
  })

  // ===== 测试用例5：边界情况测试 =====
  describe('边界情况测试', () => {
    test('应该处理空背包情况', async () => {
      // 即使用户没有任何资产或物品，API也应该返回成功
      const response = await request(app)
        .get('/api/v4/backpack')
        .set('Authorization', `Bearer ${user_token}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      // 数组可以为空，但不应该为null或undefined
      expect(response.body.data.assets).not.toBeNull()
      expect(response.body.data.items).not.toBeNull()
    })
  })

  // ===== 测试清理（After All Tests） =====
  afterAll(async () => {
    await sequelize.close()
  })
})
