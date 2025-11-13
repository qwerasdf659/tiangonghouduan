/**
 * 管理员调整积分API修复验证测试
 *
 * 测试目标：验证《管理员调整积分API实施方案.md》文档中的2个核心修复
 * 1. ✅ 风险点1修复：幂等性保护（business_id）
 * 2. ✅ 风险点2修复：余额不足时的详细错误信息
 *
 * 创建时间：2025-11-10
 * 文档位置：docs/docs/管理员调整积分API实施方案.md
 */

const request = require('supertest')
const app = require('../../app')
const { sequelize } = require('../../models')

describe('【修复验证】管理员调整积分API - 幂等性和余额检查', () => {
  let adminToken // 管理员token
  let testUserId // 测试用户ID

  // 测试前准备
  beforeAll(async () => {
    // 使用真实登录接口获取管理员token（13612227930是已知管理员）
    const loginResponse = await request(app)
      .post('/api/v4/auth/login')
      .send({
        mobile: '13612227930',
        verification_code: '123456' // 开发环境万能验证码
      })

    if (!loginResponse.body.success) {
      throw new Error('管理员登录失败：' + JSON.stringify(loginResponse.body))
    }

    // 🔴 修复：登录返回的是access_token而不是token
    adminToken = loginResponse.body.data.access_token
    console.log('✅ 管理员登录成功，获取access_token')

    // 查找或创建测试用户
    const [User, UserPointsAccount] = await Promise.all([
      sequelize.model('User'),
      sequelize.model('UserPointsAccount')
    ])

    const testUser = await User.findOne({
      where: { mobile: '13800000001' }
    })

    if (testUser) {
      testUserId = testUser.user_id
      console.log(`✅ 找到测试用户，ID: ${testUserId}`)
    } else {
      // 创建测试用户
      const newUser = await User.create({
        mobile: '13800000001',
        nickname: '积分测试用户',
        status: 'active'
      })
      testUserId = newUser.user_id
      console.log(`✅ 创建测试用户，ID: ${testUserId}`)

      // 创建积分账户
      await UserPointsAccount.create({
        user_id: testUserId,
        available_points: 1000,
        total_earned: 1000,
        total_consumed: 0,
        is_active: true
      })
    }
  })

  describe('✅ 风险点1修复：幂等性保护测试', () => {
    it('应该支持request_id参数实现幂等性', async () => {
      const requestId = `test_idempotent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

      // 第一次调整：增加500积分
      const response1 = await request(app)
        .post('/api/v4/points/admin/adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          user_id: testUserId,
          amount: 500,
          reason: '幂等性测试-第一次调用',
          request_id: requestId
        })
        .expect(200)

      expect(response1.body.success).toBe(true)
      expect(response1.body.data.adjustment.is_duplicate).toBe(false)

      const firstBalance = response1.body.data.account_summary.available_points

      // 第二次调整：使用相同的request_id（应该被识别为重复请求）
      const response2 = await request(app)
        .post('/api/v4/points/admin/adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          user_id: testUserId,
          amount: 500,
          reason: '幂等性测试-第二次调用（重复）',
          request_id: requestId // 相同的request_id
        })
        .expect(200)

      expect(response2.body.success).toBe(true)

      // 核心验证：第二次调用应该被标记为重复，余额不应该变化
      const secondBalance = response2.body.data.account_summary.available_points
      expect(secondBalance).toBe(firstBalance) // 余额应该相同，不会重复增加

      console.log(`✅ 幂等性测试通过：相同request_id重复调用，余额保持一致 (${firstBalance}分)`)
    })

    it('应该自动生成business_id（未提供request_id时）', async () => {
      // 不提供request_id，系统应该自动生成business_id
      const response = await request(app)
        .post('/api/v4/points/admin/adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          user_id: testUserId,
          amount: 100,
          reason: '自动生成business_id测试'
        })
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.adjustment.is_duplicate).toBe(false)

      console.log('✅ 自动生成business_id测试通过')
    })
  })

  describe('✅ 风险点2修复：余额不足时的详细错误信息', () => {
    it('应该在扣除积分前检查余额并返回详细信息', async () => {
      // 先查询当前余额
      const balanceResponse = await request(app)
        .get(`/api/v4/points/balance/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      const currentBalance = parseFloat(balanceResponse.body.data.available_points)
      const attemptDeduct = currentBalance + 1000 // 尝试扣除超过余额的积分

      // 尝试扣除超额积分
      const response = await request(app)
        .post('/api/v4/points/admin/adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          user_id: testUserId,
          amount: -attemptDeduct, // 负数表示扣除
          reason: '余额不足测试'
        })
        .expect(400) // 应该返回400错误

      expect(response.body.success).toBe(false)
      expect(response.body.code).toBe('INSUFFICIENT_BALANCE')

      // 核心验证：错误信息应该包含详细的余额信息
      expect(response.body.data).toHaveProperty('current_balance')
      expect(response.body.data).toHaveProperty('required_amount')
      expect(response.body.data).toHaveProperty('shortage')

      expect(response.body.data.current_balance).toBe(currentBalance)
      expect(response.body.data.required_amount).toBe(attemptDeduct)
      expect(response.body.data.shortage).toBe(attemptDeduct - currentBalance)

      // 验证错误消息格式
      expect(response.body.message).toContain('积分余额不足')
      expect(response.body.message).toContain(`当前余额${currentBalance}分`)
      expect(response.body.message).toContain(`需要扣除${attemptDeduct}分`)

      console.log(`✅ 余额不足详细信息测试通过：当前${currentBalance}分，尝试扣除${attemptDeduct}分，差额${attemptDeduct - currentBalance}分`)
    })

    it('余额充足时应该正常扣除', async () => {
      // 先增加一些积分
      await request(app)
        .post('/api/v4/points/admin/adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          user_id: testUserId,
          amount: 1000,
          reason: '准备扣除测试：增加积分'
        })
        .expect(200)

      // 扣除少量积分（确保余额充足）
      const response = await request(app)
        .post('/api/v4/points/admin/adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          user_id: testUserId,
          amount: -200,
          reason: '余额充足扣除测试'
        })
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.balance_change.change).toBe(-200)

      console.log('✅ 余额充足扣除测试通过：成功扣除200分')
    })
  })

  describe('📊 返回数据结构验证', () => {
    it('应该返回完整的余额变化信息', async () => {
      const response = await request(app)
        .post('/api/v4/points/admin/adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          user_id: testUserId,
          amount: 50,
          reason: '数据结构测试'
        })
        .expect(200)

      // 验证返回数据结构
      expect(response.body.data).toHaveProperty('user_id')
      expect(response.body.data).toHaveProperty('adjustment')
      expect(response.body.data).toHaveProperty('balance_change')
      expect(response.body.data).toHaveProperty('account_summary')

      // 验证adjustment字段
      expect(response.body.data.adjustment).toHaveProperty('amount')
      expect(response.body.data.adjustment).toHaveProperty('reason')
      expect(response.body.data.adjustment).toHaveProperty('admin_id')
      expect(response.body.data.adjustment).toHaveProperty('timestamp')
      expect(response.body.data.adjustment).toHaveProperty('is_duplicate')

      // 验证balance_change字段（新增）
      expect(response.body.data.balance_change).toHaveProperty('old_balance')
      expect(response.body.data.balance_change).toHaveProperty('new_balance')
      expect(response.body.data.balance_change).toHaveProperty('change')

      // 验证account_summary字段（新增）
      expect(response.body.data.account_summary).toHaveProperty('available_points')
      expect(response.body.data.account_summary).toHaveProperty('total_earned')
      expect(response.body.data.account_summary).toHaveProperty('total_consumed')

      console.log('✅ 返回数据结构验证通过')
    })
  })

  // 测试后清理
  afterAll(async () => {
    await sequelize.close()
  })
})
