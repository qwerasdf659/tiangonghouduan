/**
 * 市场商品详情API修复验证测试
 *
 * 修复内容：
 * - 关联别名从 as: 'owner' 修正为 as: 'user'（与模型定义一致）
 * - 访问关联对象从 marketProduct.owner 修正为 marketProduct.user
 *
 * 验证目标：
 * 1. API可以正常调用，不会因为关联别名错误而报错
 * 2. 返回的seller_info字段完整，包含卖家信息
 * 3. 数据结构符合文档规范
 */

const request = require('supertest')
const app = require('../../app')
const { generateTestToken } = require('../helpers/authHelper')
const models = require('../../models')

describe('市场商品详情API修复验证', () => {
  let authToken
  let testProductId
  let testUserId

  beforeAll(async () => {
    // 查找测试用户
    const testUser = await models.User.findOne({
      where: { mobile: '13612227930' }
    })

    if (!testUser) {
      throw new Error('测试用户不存在')
    }

    testUserId = testUser.user_id

    // 生成测试token
    authToken = generateTestToken(testUserId, 'admin')
  })

  // 准备测试数据：创建一个测试商品并上架
  beforeAll(async () => {
    try {
      // 查找或创建测试商品
      let testProduct = await models.UserInventory.findOne({
        where: {
          user_id: testUserId,
          market_status: 'on_sale',
          is_available: true
        }
      })

      // 如果没有在售商品，创建一个测试商品
      if (!testProduct) {
        testProduct = await models.UserInventory.create({
          user_id: testUserId,
          // 统一使用name和type字段（已删除兼容性代码）
          name: '测试商品-关联别名修复验证',
          description: '用于验证market product detail API关联别名修复',
          type: 'voucher',
          value: 100,
          selling_points: 50,
          market_status: 'on_sale',
          is_available: true,
          condition: 'new',
          acquisition_method: 'admin',
          acquisition_cost: 0,
          transfer_count: 0,
          status: 'available',
          source_type: 'admin',
          can_transfer: true
        })
        console.log(`✅ 创建测试商品 ID: ${testProduct.id}`)
      }

      testProductId = testProduct.id
    } catch (error) {
      console.error('❌ 准备测试数据失败:', error.message)
      throw error
    }
  })

  describe('GET /api/v4/inventory/market/products/:id', () => {
    test('应该成功获取商品详情（验证关联别名修复）', async () => {
      if (!testProductId) {
        console.log('⚠️  无测试商品，跳过测试')
        return
      }

      const response = await request(app)
        .get(`/api/v4/inventory/market/products/${testProductId}`)
        .set('Authorization', `Bearer ${authToken}`)

      // 验证HTTP状态码
      expect(response.status).toBe(200)

      // 验证响应格式
      expect(response.body).toHaveProperty('success', true)
      expect(response.body).toHaveProperty('code', 'SUCCESS')
      expect(response.body).toHaveProperty('data')

      const data = response.body.data

      // 验证核心字段存在
      expect(data).toHaveProperty('id')
      expect(data).toHaveProperty('seller_id')
      expect(data).toHaveProperty('seller_info') // 🔑 关键：验证seller_info存在
      expect(data).toHaveProperty('name')
      expect(data).toHaveProperty('selling_points')
      expect(data).toHaveProperty('market_status', 'on_sale')

      // 🔑 核心验证：seller_info应该有完整的卖家信息（证明关联别名修复成功）
      expect(data.seller_info).toBeTruthy()
      expect(data.seller_info).toHaveProperty('user_id')
      expect(data.seller_info).toHaveProperty('nickname')
      expect(data.seller_info).toHaveProperty('mobile')
      expect(data.seller_info).toHaveProperty('registration_time')

      console.log('✅ 商品详情API测试通过')
      console.log(`   商品ID: ${data.id}`)
      console.log(`   卖家ID: ${data.seller_id}`)
      console.log(`   卖家昵称: ${data.seller_info.nickname}`)
      console.log(`   售价: ${data.selling_points}积分`)
    }, 15000)

    test('应该在seller_info中正确返回卖家信息', async () => {
      if (!testProductId) {
        console.log('⚠️  无测试商品，跳过测试')
        return
      }

      const response = await request(app)
        .get(`/api/v4/inventory/market/products/${testProductId}`)
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(200)

      const { seller_info } = response.body.data

      // seller_info的所有字段都应该有值（不是null/undefined）
      expect(seller_info.user_id).toBeTruthy()
      expect(seller_info.nickname).toBeTruthy()
      expect(seller_info.mobile).toBeTruthy() // 即使是脱敏的****也应该有值
      expect(seller_info.registration_time).toBeTruthy()

      console.log('✅ 卖家信息字段验证通过')
    }, 15000)

    test('不存在的商品应该返回404', async () => {
      const response = await request(app)
        .get('/api/v4/inventory/market/products/999999')
        .set('Authorization', `Bearer ${authToken}`)

      expect(response.status).toBe(404)
      expect(response.body.success).toBe(false)
      expect(response.body.code).toBe('NOT_FOUND')
    }, 15000)
  })

  // 清理测试数据
  afterAll(async () => {
    if (testProductId) {
      try {
        await models.UserInventory.update(
          { market_status: 'withdrawn', is_available: false },
          { where: { id: testProductId } }
        )
        console.log(`✅ 清理测试商品 ID: ${testProductId}`)
      } catch (error) {
        console.error('清理测试数据失败:', error.message)
      }
    }
  })
})
