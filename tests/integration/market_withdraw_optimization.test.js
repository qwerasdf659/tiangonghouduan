/**
 * 市场挂牌撤回（withdraw）接口测试
 *
 * 当前标准接口：
 * - POST /api/v4/inventory/market/listings/:listing_id/withdraw
 *
 * 注意：
 * - 旧接口 /market/products/:id/withdraw 已删除（不再兼容）
 * - 本测试聚焦“撤回是否成功 & 状态是否正确更新”
 */

const request = require('supertest')
const app = require('../../app')
const models = require('../../models')
const { getTestUserToken } = require('../helpers/auth-helper')

describe('市场挂牌撤回接口测试', () => {
  let testUser
  let testToken
  let testProduct1
  let testProduct2

  // 测试前准备：创建测试数据
  beforeAll(async () => {
    // 1. 创建测试用户
    testUser = await models.User.findOne({
      where: { mobile: '13612227930' }
    })

    if (!testUser) {
      throw new Error('测试用户13612227930不存在，请先初始化数据库')
    }

    // 2. 生成测试token
    testToken = await getTestUserToken(app, testUser.mobile)

    // 3. 清理测试数据（删除之前的测试商品和历史撤回记录）
    await models.UserInventory.destroy({
      where: {
        user_id: testUser.user_id,
        name: {
          [models.Sequelize.Op.like]: '测试撤回商品%'
        }
      },
      force: true // ✅ 硬删除，确保完全清理
    })

    // 3.1 注意：新方案采用商品级别冷却，无需清理其他商品的撤回记录

    // 4. 创建两个测试商品用于撤回测试
    testProduct1 = await models.UserInventory.create({
      user_id: testUser.user_id,
      name: '测试撤回商品1',
      type: 'physical_goods',
      value: 100,
      source: 'draw',
      source_type: 'lottery_draw', // 必需字段：来源类型
      source_id: '999999', // 必需字段：来源ID
      status: 'valid',
      is_available: true,
      market_status: 'on_sale',
      selling_points: 500,
      condition: 'excellent', // 成色：优秀
      withdraw_count: 0,
      last_withdraw_at: null,
      last_withdraw_reason: null
    })

    testProduct2 = await models.UserInventory.create({
      user_id: testUser.user_id,
      name: '测试撤回商品2',
      type: 'physical_goods',
      value: 200,
      source: 'draw',
      source_type: 'lottery_draw', // 必需字段：来源类型
      source_id: '999998', // 必需字段：来源ID
      status: 'valid',
      is_available: true,
      market_status: 'on_sale',
      selling_points: 800,
      condition: 'good', // 成色：良好
      withdraw_count: 0,
      last_withdraw_at: null,
      last_withdraw_reason: null
    })
  })

  // 测试后清理
  afterAll(async () => {
    // 清理测试数据
    await models.UserInventory.destroy({
      where: {
        user_id: testUser.user_id,
        name: {
          [models.Sequelize.Op.like]: '测试撤回商品%'
        }
      }
    })
  })

  describe('测试1：正常撤回（通过新路由）', () => {
    test('应该成功撤回并更新market_status', async () => {
      const response = await request(app)
        .post(`/api/v4/inventory/market/listings/${testProduct1.inventory_id}/withdraw`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          withdraw_reason: '定价错误，需要重新定价'
        })

      // 验证HTTP响应
      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      // 兼容旧库存数据的返回（InventoryService会回落到UserInventory.market_status）
      expect(response.body.data).toHaveProperty('market_status', 'withdrawn')

      // 验证数据库更新
      await testProduct1.reload()
      expect(testProduct1.market_status).toBe('withdrawn')
      expect(testProduct1.is_available).toBe(true)
      expect(testProduct1.withdrawn_at).not.toBeNull()
    })
  })

  describe('测试2：旧路由已删除（不兼容）', () => {
    test('旧路径应返回404', async () => {
      const response = await request(app)
        .post(`/api/v4/inventory/market/products/${testProduct2.inventory_id}/withdraw`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({ withdraw_reason: '旧路径应404' })

      expect(response.status).toBe(404)
      expect(response.body.success).toBe(false)
    })
  })

  describe('测试3：权限验证', () => {
    test('应该拒绝撤回他人商品', async () => {
      // 创建另一个用户的商品
      const anotherUser = await models.User.findOne({
        where: {
          user_id: { [models.Sequelize.Op.ne]: testUser.user_id }
        }
      })

      if (!anotherUser) {
        console.log('跳过测试：数据库中没有其他用户')
        return
      }

      const anotherProduct = await models.UserInventory.create({
        user_id: anotherUser.user_id,
        name: '其他用户的商品',
        type: 'physical_goods',
        value: 100,
        source: 'draw',
        source_type: 'lottery_draw', // 必需字段：来源类型
        source_id: '999997', // 必需字段：来源ID
        status: 'valid',
        is_available: true,
        market_status: 'on_sale',
        selling_points: 500,
        condition: 'good'
      })

      // 尝试用testUser的token撤回anotherUser的商品
      const response = await request(app)
        .post(`/api/v4/inventory/market/listings/${anotherProduct.inventory_id}/withdraw`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          withdraw_reason: '无权限测试'
        })

      // 应返回404（商品不存在或无权限）
      expect(response.status).toBe(404)
      expect(response.body.success).toBe(false)
      expect(response.body.message).toMatch(/不存在|无权限/)

      // 清理测试数据
      await anotherProduct.destroy()
    })
  })

  describe('测试4：状态验证', () => {
    test('应该拒绝撤回已撤回的商品', async () => {
      // testProduct2当前状态为withdrawn（在测试2中撤回）

      // 尝试再次撤回
      const response = await request(app)
        .post(`/api/v4/inventory/market/listings/${testProduct2.inventory_id}/withdraw`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          withdraw_reason: '尝试重复撤回'
        })

      // 应返回404（因为查询条件包含market_status='on_sale'）
      expect(response.status).toBe(404)
      expect(response.body.success).toBe(false)
    })
  })
})
