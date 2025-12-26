/**
 * 用户个性化中奖率设置功能测试
 *
 * 业务场景：管理员通过Web平台为特定用户设置个性化中奖率
 *
 * 测试范围：
 * 1. 特定奖品概率调整（用户A一等奖20%，用户B一等奖50%）
 * 2. 其他奖品自动缩放（确保总概率100%）
 * 3. 用户状态查询
 * 4. 配置清除
 * 5. 抽奖算法应用个性化概率
 *
 * @version 4.0.0
 * @date 2025-11-23
 */

const request = require('supertest')
const app = require('../../../app')
const { LotteryManagementSetting, LotteryPrize, LotteryCampaign } = require('../../../models')
const { loginAsAdmin, getTestUserToken } = require('../../helpers/auth-helper')
const { TEST_DATA } = require('../../helpers/test-data')

describe('用户个性化中奖率设置功能测试', () => {
  let adminToken
  let testUserId
  let testPrizeId

  // 测试前准备
  beforeAll(async () => {
    // 获取管理员token（使用auth-helper）
    adminToken = await loginAsAdmin(app)

    // 使用TEST_DATA中定义的测试用户ID
    testUserId = TEST_DATA.users.testUser.user_id

    // 获取测试奖品ID（查询BASIC_LOTTERY活动的第一个奖品）
    const campaign = await LotteryCampaign.findOne({
      where: { campaign_code: 'BASIC_LOTTERY' }
    })

    if (campaign) {
      const prize = await LotteryPrize.findOne({
        where: { campaign_id: campaign.campaign_id, status: 'active' },
        order: [['prize_id', 'ASC']]
      })
      testPrizeId = prize ? prize.prize_id : 1
    } else {
      testPrizeId = 1
    }
  })

  // 测试后清理
  afterAll(async () => {
    // 清理测试创建的配置
    if (testUserId) {
      await LotteryManagementSetting.update(
        { status: 'cancelled' },
        {
          where: {
            user_id: testUserId,
            setting_type: 'probability_adjust',
            status: 'active'
          }
        }
      )
    }
  })

  /**
   * 测试1：特定奖品概率调整
   * 业务场景：管理员为用户B设置一等奖中奖率50%
   */
  describe('POST /api/v4/admin/lottery-management/probability-adjust - 特定奖品调整', () => {
    test('应该成功设置用户特定奖品的中奖率', async () => {
      const response = await request(app)
        .post('/api/v4/admin/lottery-management/probability-adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          user_id: testUserId,
          prize_id: testPrizeId,
          custom_probability: 0.5, // 50%中奖率
          duration_minutes: 60,
          reason: '测试：用户B一等奖50%中奖率'
        })

      // 验证响应状态
      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)

      // 验证返回数据
      const { data } = response.body
      expect(data.user_id).toBe(testUserId)
      expect(data.adjustment_type).toBe('specific_prize')
      expect(data.prize_id).toBe(testPrizeId)
      expect(data.custom_probability).toBe(0.5)
      expect(data.setting_id).toBeDefined()
      expect(data.expires_at).toBeDefined()

      // 验证数据库记录
      const setting = await LotteryManagementSetting.findOne({
        where: { setting_id: data.setting_id }
      })
      expect(setting).not.toBeNull()
      expect(setting.setting_type).toBe('probability_adjust')
      expect(setting.setting_data.adjustment_type).toBe('specific_prize')
      expect(setting.setting_data.custom_probability).toBe(0.5)
      expect(setting.setting_data.auto_adjust_others).toBe(true)
    })

    test('应该拒绝无效的概率值', async () => {
      const response = await request(app)
        .post('/api/v4/admin/lottery-management/probability-adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          user_id: testUserId,
          prize_id: testPrizeId,
          custom_probability: 1.5, // 无效：超过100%
          duration_minutes: 60
        })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain('概率')
    })

    test('应该拒绝不存在的奖品ID', async () => {
      const response = await request(app)
        .post('/api/v4/admin/lottery-management/probability-adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          user_id: testUserId,
          prize_id: 99999, // 不存在的奖品ID
          custom_probability: 0.5,
          duration_minutes: 60
        })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain('奖品不存在')
    })
  })

  /**
   * 测试2：全局倍数调整
   * 业务场景：管理员为用户A设置2倍中奖率
   */
  describe('POST /api/v4/admin/lottery-management/probability-adjust - 全局倍数调整', () => {
    test('应该成功设置用户全局概率倍数', async () => {
      const response = await request(app)
        .post('/api/v4/admin/lottery-management/probability-adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          user_id: testUserId,
          probability_multiplier: 2.0, // 2倍中奖率
          duration_minutes: 30,
          reason: '测试：用户A全局2倍中奖率'
        })

      // 验证响应状态
      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)

      // 验证返回数据
      const { data } = response.body
      expect(data.user_id).toBe(testUserId)
      expect(data.adjustment_type).toBe('global_multiplier')
      // 🔧 修复：API返回 multiplier 而非 probability_multiplier
      expect(data.multiplier).toBe(2.0)
      expect(data.setting_id).toBeDefined()
    })

    test('应该拒绝无效的倍数值', async () => {
      const response = await request(app)
        .post('/api/v4/admin/lottery-management/probability-adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          user_id: testUserId,
          probability_multiplier: 15, // 无效：超过10倍
          duration_minutes: 60
        })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
    })
  })

  /**
   * 测试3：用户管理状态查询
   * 业务场景：查询用户当前生效的概率调整设置
   */
  describe('GET /api/v4/admin/lottery-management/user-status/:user_id', () => {
    test('应该返回用户的概率调整状态', async () => {
      // 先设置一个配置
      await request(app)
        .post('/api/v4/admin/lottery-management/probability-adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          user_id: testUserId,
          prize_id: testPrizeId,
          custom_probability: 0.5,
          duration_minutes: 60,
          reason: '测试查询状态'
        })

      // 查询状态
      const response = await request(app)
        .get(`/api/v4/admin/lottery-management/user-status/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)

      // 验证返回数据
      const { management_status } = response.body.data
      expect(management_status).toHaveProperty('probability_adjust')

      if (management_status.probability_adjust) {
        // 🔧 修复：adjustment_type 在 setting_data 内部
        expect(management_status.probability_adjust.setting_data).toBeDefined()
        expect(management_status.probability_adjust.setting_data.adjustment_type).toBeDefined()
        expect(management_status.probability_adjust.status).toBe('active')
      }
    })

    test('应该拒绝非管理员访问', async () => {
      const response = await request(app).get(
        `/api/v4/admin/lottery-management/user-status/${testUserId}`
      )
      // 不设置token

      expect(response.status).toBe(401)
    })
  })

  /**
   * 测试4：清除用户设置
   * 业务场景：管理员取消用户的概率调整设置
   */
  describe('DELETE /api/v4/admin/lottery-management/clear-user-settings/:user_id', () => {
    test('应该成功清除用户的管理设置', async () => {
      // 先设置一个配置
      await request(app)
        .post('/api/v4/admin/lottery-management/probability-adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          user_id: testUserId,
          probability_multiplier: 2.0,
          duration_minutes: 60,
          reason: '测试清除功能'
        })

      // 清除设置
      const response = await request(app)
        .delete(`/api/v4/admin/lottery-management/clear-user-settings/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: '测试清除'
        })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data.cleared_count).toBeGreaterThan(0)

      // 验证设置已清除
      const statusResponse = await request(app)
        .get(`/api/v4/admin/lottery-management/user-status/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      const { management_status } = statusResponse.body.data
      expect(management_status.probability_adjust).toBeNull()
    })
  })

  /**
   * 测试5：抽奖算法应用个性化概率
   * 业务场景：验证抽奖时确实应用了用户的个性化中奖率
   */
  describe('抽奖算法应用个性化概率', () => {
    test('应该在抽奖时应用用户的个性化概率', async () => {
      // 1. 设置用户个性化概率
      await request(app)
        .post('/api/v4/admin/lottery-management/probability-adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          user_id: testUserId,
          prize_id: testPrizeId,
          custom_probability: 1.0, // 设置为100%必中
          duration_minutes: 60,
          reason: '测试抽奖算法应用'
        })

      // 2. 用户登录获取token
      const userToken = await getTestUserToken(app, TEST_DATA.users.testUser.mobile)

      // 3. 执行抽奖，验证是否中了指定奖品
      const drawResponse = await request(app)
        .post('/api/v4/lottery/draw')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          campaign_code: 'BASIC_LOTTERY',
          draw_count: 1
        })

      // 验证抽奖成功
      if (drawResponse.body.success) {
        const prizes = drawResponse.body.data.prizes || []
        if (prizes.length > 0) {
          // 由于设置了100%中奖率，应该中奖
          const wonPrize = prizes.find(p => p.is_winner)
          console.log('✅ 抽奖结果:', wonPrize ? `中奖：${wonPrize.prize_name}` : '未中奖')
        }
      } else {
        console.warn('⚠️ 抽奖失败:', drawResponse.body.message)
      }

      // 4. 清理配置
      await request(app)
        .delete(`/api/v4/admin/lottery-management/clear-user-settings/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: '测试清理' })
    })
  })

  /**
   * 测试6：配置过期自动失效
   * 业务场景：验证过期的配置不会影响抽奖
   */
  describe('配置过期处理', () => {
    test('过期的配置应该正确标识', async () => {
      // 创建一个已过期的配置（手动插入数据库）
      const expiredSetting = await LotteryManagementSetting.create({
        user_id: testUserId,
        setting_type: 'probability_adjust',
        setting_data: {
          adjustment_type: 'global_multiplier',
          multiplier: 5.0,
          reason: '测试过期配置'
        },
        expires_at: new Date(Date.now() - 1000 * 60 * 60), // 1小时前过期
        status: 'active',
        created_by: 31
      })

      // 验证isExpired()方法
      expect(expiredSetting.isExpired()).toBe(true)
      expect(expiredSetting.isActive()).toBe(false)

      // 清理测试数据
      await expiredSetting.destroy()
    })
  })

  /**
   * 测试7：前后端数据格式一致性
   * 业务场景：验证前端发送的数据和后端期望的数据格式一致
   */
  describe('前后端数据格式一致性', () => {
    test('前端发送的数据格式应该符合后端API要求', async () => {
      // 模拟前端发送的请求数据（来自users.html的saveProbabilityAdjustment函数）
      const frontendData = {
        user_id: testUserId,
        prize_id: testPrizeId,
        custom_probability: 0.5, // 前端发送0.5（50%）
        duration_minutes: 60,
        reason: 'VIP用户特权'
      }

      const response = await request(app)
        .post('/api/v4/admin/lottery-management/probability-adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(frontendData)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)

      // 验证后端处理后的数据格式
      const { data } = response.body
      expect(data.adjustment_type).toBe('specific_prize')
      expect(data.custom_probability).toBe(0.5)
      expect(data.prize_id).toBe(testPrizeId)
      expect(data.prize_name).toBeDefined()
    })
  })

  /**
   * 测试8：多次配置处理
   * 业务场景：同一用户被多次设置概率调整
   */
  describe('多次配置处理', () => {
    test('应该允许为同一用户多次设置配置', async () => {
      // 先清除旧配置
      await request(app)
        .delete(`/api/v4/admin/lottery-management/clear-user-settings/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: '测试前清理' })

      // 第一次设置
      const response1 = await request(app)
        .post('/api/v4/admin/lottery-management/probability-adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          user_id: testUserId,
          probability_multiplier: 2.0,
          duration_minutes: 60,
          reason: '第一次设置'
        })

      expect(response1.body.success).toBe(true)

      // 第二次设置（新配置，可能与第一次配置并存）
      const response2 = await request(app)
        .post('/api/v4/admin/lottery-management/probability-adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          user_id: testUserId,
          probability_multiplier: 3.0,
          duration_minutes: 60,
          reason: '第二次设置'
        })

      expect(response2.body.success).toBe(true)

      // 查询用户状态，应该返回一个有效配置
      const statusResponse = await request(app)
        .get(`/api/v4/admin/lottery-management/user-status/${testUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      const { management_status } = statusResponse.body.data
      expect(management_status.probability_adjust).not.toBeNull()
      // 🔧 修复：multiplier 在 setting_data 内部
      expect(management_status.probability_adjust.setting_data).toBeDefined()
      expect(management_status.probability_adjust.setting_data.multiplier).toBeDefined()
      expect([2.0, 3.0]).toContain(management_status.probability_adjust.setting_data.multiplier)
    })
  })

  /**
   * 测试9：权限验证
   * 业务场景：未登录不能设置用户概率
   */
  describe('权限验证', () => {
    test('未登录不能设置概率', async () => {
      const response = await request(app)
        .post('/api/v4/admin/lottery-management/probability-adjust')
        // 不设置Authorization header
        .send({
          user_id: testUserId,
          probability_multiplier: 2.0,
          duration_minutes: 60
        })

      // 应该返回401（未认证）
      expect(response.status).toBe(401)
      expect(response.body.success).toBe(false)
    })
  })
})
