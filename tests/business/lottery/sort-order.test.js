/**
 * 抽奖接口 sort_order 字段测试（V4架构迁移版本）
 * 
 * **原文件**: tests/api/lottery-sort-order.test.js
 * **迁移日期**: 2025年11月12日 北京时间
 * **业务域**: 抽奖系统 - 排序逻辑
 * **优先级**: P2 (辅助功能)
 * 
 * **测试内容**:
 * - 验证方案3实施：后端返回sort_order，前端计算索引
 * - sort_order字段范围验证（1-9）
 * - 前端索引计算逻辑验证（0-8）
 * - 奖品列表sort_order字段完整性
 * 
 * **创建时间**: 2025年10月07日
 */

const request = require('supertest')
const app = require('../../../app')
const jwt = require('jsonwebtoken')
const { TEST_DATA } = require('../../helpers/test-data')

describe('🎰 抽奖接口 sort_order 字段测试（V4架构 - 方案3验证）', () => {
  let testUserToken
  let testUser

  beforeAll(async () => {
    // 使用统一测试数据
    const { User } = require('../../../models')
    testUser = await User.findOne({
      where: { mobile: TEST_DATA.users.testUser.mobile }
    })

    if (!testUser) {
      throw new Error(`测试账号不存在：${TEST_DATA.users.testUser.mobile}`)
    }

    // 生成测试Token（直接使用JWT）
    testUserToken = jwt.sign(
      {
        user_id: testUser.user_id,
        mobile: testUser.mobile
      },
      process.env.JWT_SECRET || 'development_secret',
      { expiresIn: '1h' }
    )

    console.log('✅ 测试账号准备完成:', {
      user_id: testUser.user_id,
      mobile: testUser.mobile
    })
  })

  describe('POST /api/v4/lottery/draw - 抽奖sort_order验证', () => {
    test('✅ 应该返回 sort_order 字段（1-9范围）- 中奖时', async () => {
      // 多次抽奖确保至少中一次（保底机制10次必中）
      let wonPrize = null
      for (let i = 0; i < 15; i++) {
        const response = await request(app)
          .post('/api/v4/lottery/draw')
          .set('Authorization', `Bearer ${testUserToken}`)
          .send({
            campaign_code: 'BASIC_LOTTERY',
            draw_count: 1
          })

        if (response.status === 200 && response.body.data.prizes[0].sort_order !== null) {
          wonPrize = response.body.data.prizes[0]
          console.log(`✅ 第${i + 1}次抽奖中奖`)
          break
        }
      }

      // 验证中奖结果
      expect(wonPrize).not.toBeNull()
      expect(wonPrize).toHaveProperty('sort_order')

      // 验证sort_order是数字且在1-9范围内
      expect(typeof wonPrize.sort_order).toBe('number')
      expect(wonPrize.sort_order).toBeGreaterThanOrEqual(1)
      expect(wonPrize.sort_order).toBeLessThanOrEqual(9)

      console.log('✅ 中奖抽奖结果验证:')
      console.log('  奖品名称:', wonPrize.name)
      console.log('  sort_order:', wonPrize.sort_order, '(1-9范围)')
      console.log('  前端索引:', wonPrize.sort_order - 1, '(0-8范围)')
    })

    test('✅ 应该不返回 winning_index 字段（前端计算）', async () => {
      const response = await request(app)
        .post('/api/v4/lottery/draw')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          campaign_code: 'BASIC_LOTTERY',
          draw_count: 1
        })

      expect(response.status).toBe(200)
      const { prizes } = response.body.data

      // 验证不应该有winning_index字段（方案3：前端自己计算）
      const firstPrize = prizes[0]
      expect(firstPrize).not.toHaveProperty('winning_index')

      console.log('✅ 方案3验证通过：后端只返回 sort_order，前端自行计算索引')
    })

    test('✅ 前端索引计算逻辑验证', async () => {
      // 多次抽奖确保至少中一次
      let wonPrize = null
      for (let i = 0; i < 15; i++) {
        const response = await request(app)
          .post('/api/v4/lottery/draw')
          .set('Authorization', `Bearer ${testUserToken}`)
          .send({
            campaign_code: 'BASIC_LOTTERY',
            draw_count: 1
          })

        if (response.status === 200 && response.body.data.prizes[0].sort_order !== null) {
          wonPrize = response.body.data.prizes[0]
          break
        }
      }

      expect(wonPrize).not.toBeNull()

      // 模拟前端计算索引
      const calculatedIndex = wonPrize.sort_order - 1

      // 验证计算结果在0-8范围内（前端9宫格索引）
      expect(calculatedIndex).toBeGreaterThanOrEqual(0)
      expect(calculatedIndex).toBeLessThanOrEqual(8)

      console.log('✅ 前端索引计算验证:')
      console.log('  sort_order =', wonPrize.sort_order)
      console.log('  计算公式: index = sort_order - 1')
      console.log('  计算结果: index =', calculatedIndex)
      console.log('  ✅ 索引范围正确（0-8）')
    })

    test('✅ 多次抽奖的 sort_order 连续性验证', async () => {
      const response = await request(app)
        .post('/api/v4/lottery/draw')
        .set('Authorization', `Bearer ${testUserToken}`)
        .send({
          campaign_code: 'BASIC_LOTTERY',
          draw_count: 10 // 抽10次触发保底
        })

      expect(response.status).toBe(200)
      const { prizes } = response.body.data

      // 过滤出中奖的奖品
      const wonPrizes = prizes.filter(p => p.sort_order !== null)

      // 验证中奖奖品的sort_order
      wonPrizes.forEach((prize, index) => {
        expect(prize).toHaveProperty('sort_order')
        expect(typeof prize.sort_order).toBe('number')
        expect(prize.sort_order).toBeGreaterThanOrEqual(1)
        expect(prize.sort_order).toBeLessThanOrEqual(9)

        console.log(`  中奖${index + 1}: ${prize.name}, sort_order=${prize.sort_order}, index=${prize.sort_order - 1}`)
      })

      console.log(`✅ 10次抽奖中${wonPrizes.length}次中奖，sort_order验证通过`)
    })
  })

  describe('GET /api/v4/lottery/prizes/:campaignCode - 奖品列表sort_order验证', () => {
    test('✅ 奖品列表应该返回 sort_order 字段', async () => {
      const response = await request(app)
        .get('/api/v4/lottery/prizes/BASIC_LOTTERY')
        .set('Authorization', `Bearer ${testUserToken}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)

      const prizes = response.body.data

      // 验证prizes数组
      expect(Array.isArray(prizes)).toBe(true)
      expect(prizes.length).toBeGreaterThan(0)

      // 验证每个奖品都有sort_order
      prizes.forEach(prize => {
        expect(prize).toHaveProperty('sort_order')
        expect(typeof prize.sort_order).toBe('number')
      })

      console.log(`✅ 奖品列表验证通过，共${prizes.length}个奖品都包含sort_order字段`)
    })
  })
})

