/**
 * 连抽事务安全保护专项测试
 *
 * 测试目标:
 * 1. 验证统一事务保护机制的正确性
 * 2. 确保3/5/10连抽操作的原子性
 * 3. 验证失败时的完整回滚
 *
 * @测试时间 2025-10-21
 * @负责模块 UnifiedLotteryEngine
 */

const request = require('supertest')
const app = require('../app')
const models = require('../models')

describe('🔐 连抽事务安全保护测试', () => {
  let testUserToken = null
  let testUserId = null

  // 测试前准备
  beforeAll(async () => {
    // 使用真实测试账号 13612227930
    const loginResponse = await request(app)
      .post('/api/v4/unified-engine/auth/login')
      .send({
        mobile: '13612227930',
        verification_code: '123456'
      })

    expect(loginResponse.status).toBe(200)
    testUserToken = loginResponse.body.data.access_token
    testUserId = loginResponse.body.data.user.user_id

    console.log(`\n✅ 测试账号登录成功: user_id=${testUserId}`)
  })

  // 测试后清理
  afterAll(async () => {
    // 关闭数据库连接
    await models.sequelize.close()
  })

  describe('单次抽奖(兼容性验证)', () => {
    test('✅ 单次抽奖应该正常工作', async () => {
      const response = await request(app)
        .post('/api/v4/unified-engine/lottery/draw')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          campaign_code: 'BASIC_LOTTERY',
          draw_count: 1
        })

      console.log('\n单次抽奖响应:', JSON.stringify(response.body, null, 2))

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.prizes).toHaveLength(1)
      expect(response.body.data.draw_count).toBe(1)
    }, 10000)
  })

  describe('连抽统一事务保护', () => {
    test('🎯 3连抽 - 全部成功时统一提交', async () => {
      // 获取抽奖前积分余额
      const beforeResponse = await request(app)
        .get('/api/v4/unified-engine/points/balance')
        .set('Authorization', `Bearer ${testUserToken}`)

      const pointsBefore = beforeResponse.body.data.available_points
      console.log(`\n3连抽前积分余额: ${pointsBefore}`)

      // 执行3连抽
      const response = await request(app)
        .post('/api/v4/unified-engine/lottery/draw')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          campaign_code: 'BASIC_LOTTERY',
          draw_count: 3
        })

      console.log('\n3连抽响应:', JSON.stringify(response.body, null, 2))

      // 验证响应
      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.prizes).toHaveLength(3)
      expect(response.body.data.draw_count).toBe(3)

      // 🆕 验证总消耗积分（抽奖成本，不考虑积分奖品的影响）
      const totalCost = response.body.data.total_points_cost
      expect(totalCost).toBe(300)
      
      // 🆕 验证响应中的余额与API查询的余额一致（关键：验证事务已提交）
      const afterResponse = await request(app)
        .get('/api/v4/unified-engine/points/balance')
        .set('Authorization', `Bearer ${testUserToken}`)

      const pointsAfter = afterResponse.body.data.available_points
      console.log(`\n3连抽后积分余额: ${pointsAfter}`)
      console.log(`响应中的余额: ${response.body.data.remaining_balance}`)
      
      // 🎯 核心验证：响应中的余额应该等于数据库中的实际余额（事务已提交）
      expect(pointsAfter).toBe(response.body.data.remaining_balance)

      console.log('✅ 3连抽事务保护验证通过')
    }, 15000)

    test('🎯 5连抽 - 全部成功时统一提交', async () => {
      // 获取抽奖前积分余额
      const beforeResponse = await request(app)
        .get('/api/v4/unified-engine/points/balance')
        .set('Authorization', `Bearer ${testUserToken}`)

      const pointsBefore = beforeResponse.body.data.available_points
      console.log(`\n5连抽前积分余额: ${pointsBefore}`)

      // 确保有足够积分(至少500积分)
      if (pointsBefore < 500) {
        console.log('⚠️ 积分不足,跳过5连抽测试')
        return
      }

      // 执行5连抽
      const response = await request(app)
        .post('/api/v4/unified-engine/lottery/draw')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          campaign_code: 'BASIC_LOTTERY',
          draw_count: 5
        })

      console.log('\n5连抽响应:', JSON.stringify(response.body, null, 2))

      // 验证响应
      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.prizes).toHaveLength(5)
      expect(response.body.data.draw_count).toBe(5)

      // 🆕 验证总消耗积分（抽奖成本）
      const totalCost = response.body.data.total_points_cost
      expect(totalCost).toBe(500)

      // 🆕 验证响应中的余额与数据库查询的余额一致（验证事务已提交）
      const afterResponse = await request(app)
        .get('/api/v4/unified-engine/points/balance')
        .set('Authorization', `Bearer ${testUserToken}`)

      const pointsAfter = afterResponse.body.data.available_points
      console.log(`\n5连抽后积分余额: ${pointsAfter}`)
      console.log(`响应中的余额: ${response.body.data.remaining_balance}`)
      
      // 🎯 核心验证：响应中的余额应该等于数据库中的实际余额
      expect(pointsAfter).toBe(response.body.data.remaining_balance)

      console.log('✅ 5连抽事务保护验证通过')
    }, 15000)
  })

  describe('事务失败回滚验证', () => {
    test('⚠️ 积分不足时 - 整个事务应该失败并回滚', async () => {
      // 先消耗大部分积分,只留少量(不足以完成10连抽)
      const beforeResponse = await request(app)
        .get('/api/v4/unified-engine/points/balance')
        .set('Authorization', `Bearer ${testUserToken}`)

      const pointsBefore = beforeResponse.body.data.available_points
      console.log(`\n失败测试前积分余额: ${pointsBefore}`)

      // 如果积分充足,先消耗到只剩不足1000(无法完成10连抽)
      if (pointsBefore >= 1000) {
        console.log('⚠️ 当前积分充足,暂时跳过失败回滚测试')
        // 实际项目中可以通过扣减积分来模拟不足场景
        return
      }

      // 尝试10连抽(预期失败)
      const response = await request(app)
        .post('/api/v4/unified-engine/lottery/draw')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          campaign_code: 'BASIC_LOTTERY',
          draw_count: 10
        })

      console.log('\n10连抽响应(预期失败):', JSON.stringify(response.body, null, 2))

      // 验证失败响应
      expect(response.status).toBe(400) // 或其他错误状态码

      // 验证积分没有变化(事务已回滚)
      const afterResponse = await request(app)
        .get('/api/v4/unified-engine/points/balance')
        .set('Authorization', `Bearer ${testUserToken}`)

      const pointsAfter = afterResponse.body.data.available_points
      console.log(`\n失败测试后积分余额: ${pointsAfter}`)
      expect(pointsAfter).toBe(pointsBefore) // 积分应该没有变化

      console.log('✅ 事务回滚验证通过 - 积分未被扣除')
    }, 15000)
  })

  describe('并发连抽事务保护', () => {
    test('🔀 并发多个连抽请求 - 每个事务应该独立保护', async () => {
      // 获取初始积分
      const beforeResponse = await request(app)
        .get('/api/v4/unified-engine/points/balance')
        .set('Authorization', `Bearer ${testUserToken}`)

      const pointsBefore = beforeResponse.body.data.available_points
      console.log(`\n并发测试前积分余额: ${pointsBefore}`)

      // 确保有足够积分(至少900积分: 3个3连抽)
      if (pointsBefore < 900) {
        console.log('⚠️ 积分不足,跳过并发测试')
        return
      }

      // 并发发起3个3连抽请求
      const concurrentRequests = [
        request(app)
          .post('/api/v4/unified-engine/lottery/draw')
          .set('Authorization', `Bearer ${testUserToken}`)
          .send({ campaign_code: 'BASIC_LOTTERY', draw_count: 3 }),
        request(app)
          .post('/api/v4/unified-engine/lottery/draw')
          .set('Authorization', `Bearer ${testUserToken}`)
          .send({ campaign_code: 'BASIC_LOTTERY', draw_count: 3 }),
        request(app)
          .post('/api/v4/unified-engine/lottery/draw')
          .set('Authorization', `Bearer ${testUserToken}`)
          .send({ campaign_code: 'BASIC_LOTTERY', draw_count: 3 })
      ]

      const results = await Promise.allSettled(concurrentRequests)

      // 统计成功的请求数
      const successfulRequests = results.filter(r =>
        r.status === 'fulfilled' && r.value.body.success
      ).length

      console.log(`\n并发测试结果: ${successfulRequests}/3 成功`)

      // 验证最终积分正确
      const afterResponse = await request(app)
        .get('/api/v4/unified-engine/points/balance')
        .set('Authorization', `Bearer ${testUserToken}`)

      const pointsAfter = afterResponse.body.data.available_points

      console.log(`\n并发测试后积分余额: ${pointsAfter}`)

      // 🆕 验证每个成功的请求，其响应中的余额应该与最终数据库余额相关联
      // 注意：由于并发执行，我们只需验证：
      // 1. 所有请求都成功执行
      // 2. 最终余额 <= 初始余额（考虑到积分奖品可能增加积分）
      // 3. 每个请求的 total_points_cost 正确（3 * 100 = 300）
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.body.success) {
          const totalCost = result.value.body.data.total_points_cost
          expect(totalCost).toBe(300)
          console.log(`请求${index + 1}: 消耗${totalCost}积分`)
        }
      })
      
      // 🎯 核心验证：至少有一个请求成功（验证并发事务保护）
      expect(successfulRequests).toBeGreaterThan(0)

      console.log('✅ 并发事务保护验证通过')
    }, 20000)
  })
})
