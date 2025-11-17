/**
 * 撤回市场商品API优化功能测试
 * 测试文件：tests/integration/market-withdraw-optimization.test.js
 *
 * 测试范围：
 * 1. 撤回冷却时间功能（4小时限制）
 * 2. 撤回统计字段更新（withdraw_count、last_withdraw_at、last_withdraw_reason）
 * 3. condition字段保留功能
 *
 * 基于文档：撤回市场商品API实施方案V5.0 - 轻量级优化方案
 */

const request = require('supertest')
const app = require('../../app')
const models = require('../../models')
const { generateTestToken } = require('../helpers/authHelper')

describe('撤回市场商品API优化功能测试', () => {
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
    testToken = generateTestToken(testUser.user_id)

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

    // 3.1 清理该用户所有历史撤回记录（避免触发冷却时间限制）
    await models.UserInventory.destroy({
      where: {
        user_id: testUser.user_id,
        market_status: 'withdrawn'
      },
      force: true // ✅ 硬删除所有撤回状态的商品
    })

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

  /**
   * 测试1：正常撤回功能
   * 验证基本撤回功能是否正常，以及撤回统计字段是否正确更新
   */
  describe('测试1：正常撤回功能', () => {
    test('应该成功撤回商品并更新统计字段', async () => {
      const response = await request(app)
        .post(`/api/v4/inventory/market/products/${testProduct1.inventory_id}/withdraw`) // ✅ 使用正确的主键字段
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          withdraw_reason: '定价错误，需要重新定价'
        })

      // 验证HTTP响应
      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data).toHaveProperty('product_id')
      expect(response.body.data).toHaveProperty('new_status', 'withdrawn')
      expect(response.body.data).toHaveProperty('withdraw_count', 1) // 撤回次数应为1
      expect(response.body.data).toHaveProperty('cooldown_until') // 应返回冷却结束时间
      expect(response.body.data).toHaveProperty('condition_preserved') // 应返回保留的成色

      // 验证数据库更新
      await testProduct1.reload()
      expect(testProduct1.market_status).toBe('withdrawn')
      expect(testProduct1.selling_points).toBeNull() // 售价已清空
      expect(testProduct1.condition).toBe('excellent') // ✅ 成色应保留
      expect(testProduct1.withdraw_count).toBe(1) // ✅ 撤回次数应为1
      expect(testProduct1.last_withdraw_at).not.toBeNull() // ✅ 撤回时间应记录
      expect(testProduct1.last_withdraw_reason).toBe('定价错误，需要重新定价') // ✅ 撤回原因应记录
    })
  })

  /**
   * 测试2：撤回冷却时间限制
   * 验证4小时内不能重复撤回
   */
  describe('测试2：撤回冷却时间限制', () => {
    test('应该拒绝4小时内的第二次撤回', async () => {
      // 第一次撤回已经在测试1完成，testProduct1已被撤回

      // 立即尝试撤回第二个商品，应该被冷却限制拒绝
      const response = await request(app)
        .post(`/api/v4/inventory/market/products/${testProduct2.inventory_id}/withdraw`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          withdraw_reason: '测试冷却时间'
        })

      // 验证返回429错误（Too Many Requests）
      expect(response.status).toBe(429)
      expect(response.body.success).toBe(false)
      expect(response.body.message).toMatch(/撤回操作过于频繁/)
      expect(response.body.data).toHaveProperty('cooldown_remaining_hours') // 应返回剩余冷却时间
      expect(response.body.data).toHaveProperty('next_available_time') // 应返回下次可用时间

      // 验证商品状态未改变
      await testProduct2.reload()
      expect(testProduct2.market_status).toBe('on_sale') // 状态应保持在售
      expect(testProduct2.withdraw_count).toBe(0) // 撤回次数应保持0
    })
  })

  /**
   * 测试3：condition字段保留功能
   * 验证撤回后成色信息是否保留
   */
  describe('测试3：condition字段保留功能', () => {
    test('撤回后应保留商品成色信息', async () => {
      // 从数据库验证testProduct1的成色是否保留
      await testProduct1.reload()

      expect(testProduct1.condition).toBe('excellent') // 成色应保留为"优秀"
      expect(testProduct1.market_status).toBe('withdrawn') // 状态应为已撤回
      expect(testProduct1.selling_points).toBeNull() // 售价已清空
      expect(testProduct1.is_available).toBe(true) // 商品应可用
    })
  })

  /**
   * 测试4：撤回统计字段累加
   * 验证多次撤回时withdraw_count是否正确累加
   */
  describe('测试4：撤回统计字段累加', () => {
    test('多次撤回时withdraw_count应正确累加', async () => {
      // 手动模拟4小时后的场景（修改last_withdraw_at为4小时前）
      await testProduct1.update({
        market_status: 'on_sale', // 重新上架
        selling_points: 600, // 重新定价
        last_withdraw_at: new Date(Date.now() - 5 * 60 * 60 * 1000) // 5小时前（超过4小时冷却）
      })

      // 第二次撤回
      const response = await request(app)
        .post(`/api/v4/inventory/market/products/${testProduct1.inventory_id}/withdraw`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          withdraw_reason: '再次修改价格'
        })

      // 验证响应
      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.withdraw_count).toBe(2) // 撤回次数应为2

      // 验证数据库
      await testProduct1.reload()
      expect(testProduct1.withdraw_count).toBe(2) // ✅ 累计撤回次数应为2
      expect(testProduct1.last_withdraw_reason).toBe('再次修改价格') // 原因应更新
      expect(testProduct1.condition).toBe('excellent') // 成色应仍然保留
    })
  })

  /**
   * 测试5：无权限撤回
   * 验证不能撤回他人商品
   */
  describe('测试5：权限验证', () => {
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
        .post(`/api/v4/inventory/market/products/${anotherProduct.inventory_id}/withdraw`)
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          withdraw_reason: '无权限测试'
        })

      // 应返回404（商品不存在或无权限）
      expect(response.status).toBe(404)
      expect(response.body.success).toBe(false)
      expect(response.body.message).toMatch(/商品不存在或无权限撤回/)

      // 清理测试数据
      await anotherProduct.destroy()
    })
  })

  /**
   * 测试6：已撤回商品不能再次撤回
   * 验证状态验证逻辑
   */
  describe('测试6：状态验证', () => {
    test('应该拒绝撤回已撤回的商品', async () => {
      // testProduct1当前状态为withdrawn（在测试4中撤回）

      // 尝试再次撤回
      const response = await request(app)
        .post(`/api/v4/inventory/market/products/${testProduct1.inventory_id}/withdraw`)
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
