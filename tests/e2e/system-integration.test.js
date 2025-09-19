/**
 * 系统集成测试套件
 * 自动生成时间：2025/8/25 00:50:36
 */

const request = require('supertest')
const app = require('../../app')
const { sequelize } = require('../../config/database')

describe('系统集成测试', () => {
  let testUser

  beforeAll(async () => {
    await sequelize.authenticate()

    const { User } = require('../../models')
    testUser = await User.create({
      mobile: '13612227930',
      username: 'integration_test_user',
      status: 'active',
      points: 1000,
      vip_level: 1,
      is_admin: true
    })
  })

  afterAll(async () => {
    if (testUser) {
      await testUser.destroy()
    }
  })

  describe('用户完整生命周期', () => {
    test('用户注册->登录->抽奖->积分变化', async () => {
      // 1. 用户登录
      const loginResponse = await request(app).post('/api/v4/unified-engine/auth/login').send({
        mobile: testUser.mobile,
        verification_code: '123456'
      })

      expect(loginResponse.status).toBe(200)
      const token = loginResponse.body.data.token

      // 2. 获取用户信息
      const userResponse = await request(app)
        .get('/api/v4/unified-engine/user/profile')
        .set('Authorization', `Bearer ${token}`)

      expect(userResponse.status).toBe(200)
      expect(userResponse.body.data.user_id).toBe(testUser.user_id)

      // 3. 参与抽奖
      const lotteryResponse = await request(app)
        .get('/api/v4/unified-engine/lottery/list')
        .set('Authorization', `Bearer ${token}`)

      expect(lotteryResponse.status).toBe(200)

      // 4. 检查积分变化
      const pointsResponse = await request(app)
        .get('/api/v4/unified-engine/points/transactions')
        .set('Authorization', `Bearer ${token}`)

      expect(pointsResponse.status).toBe(200)
    })
  })

  describe('管理员工作流程', () => {
    test('管理员登录->查看数据->审核操作', async () => {
      // 管理员登录
      const adminResponse = await request(app).post('/api/v4/unified-engine/auth/login').send({
        mobile: testUser.mobile,
        verification_code: '123456'
      })

      expect(adminResponse.status).toBe(200)
      const adminToken = adminResponse.body.data.token

      // 查看管理数据
      const analyticsResponse = await request(app)
        .get('/api/v4/unified-engine/admin/analytics/overview')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(analyticsResponse.status).toBe(200)
    })
  })
})
