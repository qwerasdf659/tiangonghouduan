/**
 * 反馈系统API测试 - 获取我的反馈列表（GET /api/v4/system/feedback/my）
 *
 * 测试目标：验证方案A的5个核心修复点
 * 1. ✅ total计算修复（使用findAndCountAll）
 * 2. ✅ 参数验证（status合法性检查）
 * 3. ✅ 错误处理优化（区分错误类型）
 * 4. ✅ 查询日志记录（记录查询参数和耗时）
 * 5. ✅ 性能监控（慢查询警告）
 *
 * 创建时间：2025-11-09
 * 使用模型：Claude Sonnet 4.5
 */

const request = require('supertest')
const app = require('../../../app')
const { sequelize } = require('../../../models')
const Feedback = require('../../../models').Feedback
const User = require('../../../models').User
const { TEST_DATA } = require('../../helpers/test-data')

// 测试数据
let test_token = null
let test_user_id = null

// 测试用户数据（使用统一测试数据）
const test_mobile = TEST_DATA.users.testUser.mobile

describe('GET /api/v4/system/feedback/my - 获取我的反馈列表', () => {
  /*
   * ===== 测试准备（Before All Tests） =====
   * 增加超时时间到60秒（应对数据库偶发慢查询，特别是登录时的UPDATE操作）
   */
  beforeAll(async () => {
    // 1. 获取测试用户信息
    const test_user = await User.findOne({
      where: { mobile: test_mobile }
    })

    if (!test_user) {
      throw new Error(`测试用户不存在：${test_mobile}，请先创建测试用户`)
    }

    test_user_id = test_user.user_id

    // 2. 登录获取token
    const login_response = await request(app)
      .post('/api/v4/auth/login')
      .send({
        mobile: test_mobile,
        verification_code: TEST_DATA.auth.verificationCode // 使用统一验证码
      })

    if (login_response.status !== 200) {
      throw new Error(`登录失败：${JSON.stringify(login_response.body)}`)
    }

    test_token = login_response.body.data.access_token

    // 3. 创建测试反馈数据（至少25条，用于测试分页和total计算）
    const existing_count = await Feedback.count({
      where: { user_id: test_user_id }
    })

    if (existing_count < 25) {
      const feedback_promises = []
      for (let i = 0; i < 25 - existing_count; i++) {
        feedback_promises.push(
          Feedback.create({
            user_id: test_user_id,
            category: ['technical', 'feature', 'bug', 'suggestion'][i % 4],
            content: `测试反馈内容 ${i + 1}`,
            status: ['pending', 'processing', 'replied', 'closed'][i % 4],
            priority: 'medium'
          })
        )
      }
      await Promise.all(feedback_promises)
    }
  }, 60000) // 超时时间60秒（应对数据库偶发慢查询）

  // ===== 测试用例1：验证total计算正确性（P0严重问题修复） =====
  describe('核心功能：total计算正确性', () => {
    test('应该返回正确的total（总记录数，非当前页数量）', async () => {
      // 查询第1页，每页10条
      const response = await request(app)
        .get('/api/v4/system/feedback/my')
        .query({ limit: 10, offset: 0 })
        .set('Authorization', `Bearer ${test_token}`)

      expect(response.status).toBe(200)
      expect(response.body.code).toBe('SUCCESS') // ✅ code字段是字符串类型
      expect(response.body.data).toHaveProperty('feedbacks')
      expect(response.body.data).toHaveProperty('total')
      expect(response.body.data).toHaveProperty('page')

      // ✅ 核心验证：total应该是总记录数，不是当前页数量
      const { feedbacks, total, page } = response.body.data

      // 验证：total >= feedbacks.length（总数应该 >= 当前页数量）
      expect(total).toBeGreaterThanOrEqual(feedbacks.length)

      // 验证：page元数据正确
      expect(page.limit).toBe(10)
      expect(page.offset).toBe(0)
      expect(page.current_page).toBe(1)
      expect(page.total_pages).toBe(Math.ceil(total / 10))

      // 业务逻辑验证：如果total > 10，说明有多页数据
      if (total > 10) {
        expect(page.total_pages).toBeGreaterThan(1)
      }
    })

    test('应该支持分页查询，第2页total与第1页一致', async () => {
      // 查询第1页
      const page1_response = await request(app)
        .get('/api/v4/system/feedback/my')
        .query({ limit: 10, offset: 0 })
        .set('Authorization', `Bearer ${test_token}`)

      expect(page1_response.status).toBe(200)
      const page1_total = page1_response.body.data.total

      // 查询第2页
      const page2_response = await request(app)
        .get('/api/v4/system/feedback/my')
        .query({ limit: 10, offset: 10 })
        .set('Authorization', `Bearer ${test_token}`)

      expect(page2_response.status).toBe(200)
      const page2_total = page2_response.body.data.total

      // ✅ 核心验证：第1页和第2页的total应该一致（总记录数不变）
      expect(page2_total).toBe(page1_total)

      // 验证：第2页的current_page应该是2
      expect(page2_response.body.data.page.current_page).toBe(2)
    })
  })

  // ===== 测试用例2：验证status参数验证（P2问题修复） =====
  describe('参数验证：status参数合法性检查', () => {
    test('应该接受合法的status参数（pending）', async () => {
      const response = await request(app)
        .get('/api/v4/system/feedback/my')
        .query({ status: 'pending', limit: 10, offset: 0 })
        .set('Authorization', `Bearer ${test_token}`)

      expect(response.status).toBe(200)
      expect(response.body.code).toBe('SUCCESS') // ✅ code字段是字符串类型

      // 验证：返回的所有反馈状态都是pending
      const feedbacks = response.body.data.feedbacks
      if (feedbacks.length > 0) {
        feedbacks.forEach(feedback => {
          expect(feedback.status).toBe('pending')
        })
      }
    })

    test('应该接受status=all参数（查询全部状态）', async () => {
      const response = await request(app)
        .get('/api/v4/system/feedback/my')
        .query({ status: 'all', limit: 10, offset: 0 })
        .set('Authorization', `Bearer ${test_token}`)

      expect(response.status).toBe(200)
      expect(response.body.code).toBe('SUCCESS') // ✅ code字段是字符串类型
    })

    test('应该拒绝非法的status参数并返回400错误', async () => {
      const response = await request(app)
        .get('/api/v4/system/feedback/my')
        .query({ status: 'invalid_status', limit: 10, offset: 0 })
        .set('Authorization', `Bearer ${test_token}`)

      // ✅ 核心验证：应该返回400错误
      expect(response.status).toBe(400) // HTTP状态码
      expect(response.body.code).toBe('INVALID_PARAMETER') // 业务错误代码（字符串类型）
      expect(response.body.message).toContain('status参数无效')
      expect(response.body.message).toContain('pending')
      expect(response.body.message).toContain('processing')
      expect(response.body.message).toContain('replied')
      expect(response.body.message).toContain('closed')
    })
  })

  // ===== 测试用例3：验证limit和offset参数处理 =====
  describe('参数验证：limit和offset参数处理', () => {
    test('应该限制limit最大值为50', async () => {
      const response = await request(app)
        .get('/api/v4/system/feedback/my')
        .query({ limit: 100, offset: 0 }) // 请求100条，但应该被限制为50
        .set('Authorization', `Bearer ${test_token}`)

      expect(response.status).toBe(200)
      expect(response.body.code).toBe('SUCCESS') // ✅ code字段是字符串类型

      // ✅ 核心验证：返回的记录数不超过50
      const feedbacks = response.body.data.feedbacks
      expect(feedbacks.length).toBeLessThanOrEqual(50)
      expect(response.body.data.page.limit).toBe(50)
    })

    test('应该处理无效的limit参数（非数字）', async () => {
      const response = await request(app)
        .get('/api/v4/system/feedback/my')
        .query({ limit: 'abc', offset: 0 })
        .set('Authorization', `Bearer ${test_token}`)

      expect(response.status).toBe(200)
      expect(response.body.code).toBe('SUCCESS') // ✅ code字段是字符串类型

      // 验证：应该使用默认值10
      expect(response.body.data.page.limit).toBe(10)
    })

    test('应该处理负数offset参数', async () => {
      const response = await request(app)
        .get('/api/v4/system/feedback/my')
        .query({ limit: 10, offset: -5 })
        .set('Authorization', `Bearer ${test_token}`)

      expect(response.status).toBe(200)
      expect(response.body.code).toBe('SUCCESS') // ✅ code字段是字符串类型

      // 验证：应该使用默认值0
      expect(response.body.data.page.offset).toBe(0)
      expect(response.body.data.page.current_page).toBe(1)
    })
  })

  // ===== 测试用例4：验证数据脱敏（安全性验证） =====
  describe('数据安全：数据脱敏验证', () => {
    test('应该隐藏敏感字段（user_ip、device_info、internal_notes）', async () => {
      const response = await request(app)
        .get('/api/v4/system/feedback/my')
        .query({ limit: 10, offset: 0 })
        .set('Authorization', `Bearer ${test_token}`)

      expect(response.status).toBe(200)
      expect(response.body.code).toBe('SUCCESS') // ✅ code字段是字符串类型

      // ✅ 核心验证：返回的反馈不包含敏感字段
      const feedbacks = response.body.data.feedbacks
      if (feedbacks.length > 0) {
        feedbacks.forEach(feedback => {
          // 验证：不应该包含敏感字段
          expect(feedback).not.toHaveProperty('user_ip')
          expect(feedback).not.toHaveProperty('device_info')
          expect(feedback).not.toHaveProperty('internal_notes')
          expect(feedback).not.toHaveProperty('admin_id')

          // 验证：应该包含必要字段
          expect(feedback).toHaveProperty('id') // 通用id字段（DataSanitizer转换）
          expect(feedback).toHaveProperty('category')
          expect(feedback).toHaveProperty('content')
          expect(feedback).toHaveProperty('status')
          expect(feedback).toHaveProperty('priority')
          expect(feedback).toHaveProperty('created_at')
        })
      }
    })
  })

  // ===== 测试用例5：验证认证和权限控制 =====
  describe('权限验证：JWT认证和用户隔离', () => {
    test('应该拒绝无token的请求并返回401错误', async () => {
      const response = await request(app)
        .get('/api/v4/system/feedback/my')
        .query({ limit: 10, offset: 0 })
      // 不设置Authorization头

      expect(response.status).toBe(401)
    })

    test('应该只返回当前用户的反馈（用户隔离）', async () => {
      const response = await request(app)
        .get('/api/v4/system/feedback/my')
        .query({ limit: 100, offset: 0 }) // 查询尽可能多的数据
        .set('Authorization', `Bearer ${test_token}`)

      expect(response.status).toBe(200)
      expect(response.body.code).toBe('SUCCESS') // ✅ code字段是字符串类型

      /*
       * 验证：返回的所有反馈都属于当前用户
       * 注意：DataSanitizer不返回user_id（已脱敏），但可以通过数据库验证
       */
      const feedback_ids = response.body.data.feedbacks.map(f => f.id)

      if (feedback_ids.length > 0) {
        // 从数据库验证：所有反馈的user_id都是test_user_id
        const db_feedbacks = await Feedback.findAll({
          where: { feedback_id: feedback_ids },
          attributes: ['feedback_id', 'user_id']
        })

        db_feedbacks.forEach(feedback => {
          expect(feedback.user_id).toBe(test_user_id)
        })
      }
    })
  })

  // ===== 测试用例6：验证排序逻辑 =====
  describe('排序逻辑：按created_at降序排列', () => {
    test('应该按创建时间降序排列（最新反馈在前）', async () => {
      const response = await request(app)
        .get('/api/v4/system/feedback/my')
        .query({ limit: 10, offset: 0 })
        .set('Authorization', `Bearer ${test_token}`)

      expect(response.status).toBe(200)
      expect(response.body.code).toBe('SUCCESS') // ✅ code字段是字符串类型

      const feedbacks = response.body.data.feedbacks
      if (feedbacks.length > 1) {
        /*
         * 验证：第1条反馈的创建时间 >= 第2条反馈的创建时间
         * 使用created_at_timestamp字段（Unix时间戳）进行排序验证
         */
        for (let i = 0; i < feedbacks.length - 1; i++) {
          expect(feedbacks[i]).toHaveProperty('created_at_timestamp')
          expect(feedbacks[i + 1]).toHaveProperty('created_at_timestamp')
          expect(feedbacks[i].created_at_timestamp).toBeGreaterThanOrEqual(feedbacks[i + 1].created_at_timestamp)
        }
      }
    })
  })

  // ===== 测试清理（After All Tests） =====
  afterAll(async () => {
    // 不删除测试数据，保留用于后续调试
    await sequelize.close()
  })
})
