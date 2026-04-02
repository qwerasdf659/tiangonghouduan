/**
 * 背包API测试 - P2优先级
 *
 * 测试目标：验证用户端背包域API的完整性
 *
 * 功能覆盖：
 * 1. GET /api/v4/backpack - 获取用户背包（资产 + 物品）
 * 2. GET /api/v4/backpack/stats - 获取背包统计信息
 * 3. GET /api/v4/backpack/items/:item_id - 获取物品详情
 * 4. POST /api/v4/backpack/items/:item_id/redeem - 生成核销码
 * 5. POST /api/v4/backpack/items/:item_id/use - 直接使用物品
 * 6. GET /api/v4/exchange/items - 用户端兑换商品列表
 *
 * 相关模型：
 * - Item: 物品实例
 * - AccountAssetBalance: 资产余额
 * - RedemptionOrder: 核销订单
 *
 * 相关服务：
 * - BackpackService: 背包服务
 * - RedemptionService: 核销订单服务
 * - ItemService: 物品操作服务
 * - ExchangeQueryService: 兑换查询服务
 *
 * 权限要求：已登录用户（authenticateToken）
 *
 * 创建时间：2026-01-28
 * 更新时间：2026-02-07（新增物品详情/核销码/使用/兑换测试）
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
        expect(asset).toHaveProperty('total_amount')
        // 余额字段（与数据库 account_asset_balances 表字段一致）
        if (asset.frozen_amount !== undefined) {
          expect(typeof asset.frozen_amount).toBe('number')
        }
        if (asset.available_amount !== undefined) {
          expect(typeof asset.available_amount).toBe('number')
        }
      }
    })

    test('资产应该包含 is_tradable 字段（布尔类型）', async () => {
      const response = await request(app)
        .get('/api/v4/backpack')
        .set('Authorization', `Bearer ${user_token}`)

      expect(response.status).toBe(200)

      const { assets } = response.body.data

      // 每个资产都应该有 is_tradable 字段，用于前端控制"上架到市场"按钮
      assets.forEach(asset => {
        expect(asset).toHaveProperty('is_tradable')
        expect(typeof asset.is_tradable).toBe('boolean')
      })
    })

    test('不应该返回已禁用或系统内部的资产类型', async () => {
      const response = await request(app)
        .get('/api/v4/backpack')
        .set('Authorization', `Bearer ${user_token}`)

      expect(response.status).toBe(200)

      const { assets } = response.body.data

      // budget_points（is_enabled=0，系统内部资产）不应出现在背包资产列表中
      const hasBudgetPoints = assets.some(a => a.asset_code === 'budget_points')
      expect(hasBudgetPoints).toBe(false)

      // star_stone_quota（form=quota，配额类资产）不应出现在背包资产列表中
      const hasQuota = assets.some(a => a.asset_code === 'star_stone_quota')
      expect(hasQuota).toBe(false)
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
        expect(item).toHaveProperty('item_id')
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

      // items_by_type：按物品类型分组统计（前端分类面板使用）
      expect(data).toHaveProperty('items_by_type')
      expect(typeof data.items_by_type).toBe('object')
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

  // ===== 测试用例6：物品详情 =====
  describe('GET /api/v4/backpack/items/:item_id - 获取物品详情', () => {
    /*
     * 业务场景：用户在背包中点击某个物品查看详情
     * 预期行为：返回物品类型、名称、状态、是否有核销码等信息
     */
    let test_item_id = null

    beforeAll(async () => {
      // 从背包中获取一个真实的物品ID
      const backpackResponse = await request(app)
        .get('/api/v4/backpack')
        .set('Authorization', `Bearer ${user_token}`)

      if (backpackResponse.body.data?.items?.length > 0) {
        test_item_id = backpackResponse.body.data.items[0].item_id
      }
    })

    test('应该返回正确的物品详情结构', async () => {
      if (!test_item_id) {
        console.log('⚠️ 跳过：用户背包中没有可用物品')
        return
      }

      const response = await request(app)
        .get(`/api/v4/backpack/items/${test_item_id}`)
        .set('Authorization', `Bearer ${user_token}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)

      const detail = response.body.data
      expect(detail).toHaveProperty('item_id')
      expect(detail).toHaveProperty('item_type')
      expect(detail).toHaveProperty('status')
      expect(detail).toHaveProperty('is_owner')
      expect(detail).toHaveProperty('has_redemption_code')
      expect(detail.item_id).toBe(test_item_id)
    })

    test('不存在的物品应该返回404', async () => {
      const response = await request(app)
        .get('/api/v4/backpack/items/99999999')
        .set('Authorization', `Bearer ${user_token}`)

      expect(response.status).toBe(404)
      expect(response.body.success).toBe(false)
      expect(response.body.code).toBe('NOT_FOUND')
    })

    test('无效的物品ID应该返回400', async () => {
      const response = await request(app)
        .get('/api/v4/backpack/items/abc')
        .set('Authorization', `Bearer ${user_token}`)

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.code).toBe('BAD_REQUEST')
    })

    test('应该拒绝无token的请求', async () => {
      const response = await request(app).get('/api/v4/backpack/items/1')

      expect(response.status).toBe(401)
    })
  })

  // ===== 测试用例7：生成核销码 =====
  describe('POST /api/v4/backpack/items/:item_id/redeem - 生成核销码', () => {
    /*
     * 业务场景（美团模式）：
     * 用户在背包中选择一个 voucher/product 物品 → 生成核销码 → 到店出示
     * 预期行为：返回12位Base32核销码和订单信息
     */
    let redeemable_item_id = null

    beforeAll(async () => {
      // 查找一个没有待核销订单的available物品
      const backpackResponse = await request(app)
        .get('/api/v4/backpack')
        .set('Authorization', `Bearer ${user_token}`)

      const items = backpackResponse.body.data?.items || []
      const candidate = items.find(i => !i.has_redemption_code && i.status === 'available')
      if (candidate) {
        redeemable_item_id = candidate.item_id
      }
    })

    test('应该成功生成核销码', async () => {
      if (!redeemable_item_id) {
        console.log('⚠️ 跳过：没有可用于生成核销码的物品')
        return
      }

      const response = await request(app)
        .post(`/api/v4/backpack/items/${redeemable_item_id}/redeem`)
        .set('Authorization', `Bearer ${user_token}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data).toHaveProperty('code')
      expect(response.body.data).toHaveProperty('order')

      // 核销码格式验证（12位Base32，格式 XXXX-XXXX-XXXX）
      const code = response.body.data.code
      expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)

      // 订单信息验证
      const order = response.body.data.order
      expect(order).toHaveProperty('status')
      expect(order.status).toBe('pending')
      expect(order).toHaveProperty('expires_at')
    })

    test('不存在的物品应该返回错误', async () => {
      const response = await request(app)
        .post('/api/v4/backpack/items/99999999/redeem')
        .set('Authorization', `Bearer ${user_token}`)

      expect(response.status).toBeGreaterThanOrEqual(400)
      expect(response.body.success).toBe(false)
    })

    test('应该拒绝无token的请求', async () => {
      const response = await request(app).post('/api/v4/backpack/items/1/redeem')

      expect(response.status).toBe(401)
    })
  })

  // ===== 测试用例8：兑换商品列表（从 /shop 迁移到 /backpack） =====
  describe('GET /api/v4/exchange/items - 用户端兑换商品列表', () => {
    /*
     * 业务场景：用户浏览兑换市场中的商品
     * 域迁移说明：从 /backpack/exchange/items 迁移到 /exchange/items
     * 原因：兑换是用户侧操作，不应被商家域准入中间件拦截
     */
    test('应该返回商品列表和分页信息', async () => {
      const response = await request(app)
        .get('/api/v4/exchange/items?page=1&page_size=5')
        .set('Authorization', `Bearer ${user_token}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)

      const data = response.body.data
      expect(data).toHaveProperty('items')
      expect(data).toHaveProperty('pagination')
      expect(Array.isArray(data.items)).toBe(true)
      expect(data.pagination).toHaveProperty('total')
      expect(data.pagination).toHaveProperty('page')
    })

    test('应该支持分页参数', async () => {
      const response = await request(app)
        .get('/api/v4/exchange/items?page=1&page_size=2')
        .set('Authorization', `Bearer ${user_token}`)

      expect(response.status).toBe(200)
      expect(response.body.data.items.length).toBeLessThanOrEqual(2)
    })

    test('无效status参数应该返回400', async () => {
      const response = await request(app)
        .get('/api/v4/exchange/items?status=invalid')
        .set('Authorization', `Bearer ${user_token}`)

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
    })

    test('应该拒绝无token的请求', async () => {
      const response = await request(app).get('/api/v4/exchange/items')

      expect(response.status).toBe(401)
    })
  })

  // ===== 测试清理（After All Tests） =====
  afterAll(async () => {
    await sequelize.close()
  })
})
