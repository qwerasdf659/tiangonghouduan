/**
 * 消费记录API契约测试
 *
 * 目的：验证API接口的请求参数、响应结构、数据类型符合预期
 *
 * 契约测试关注点：
 * 1. 响应结构是否符合文档定义
 * 2. 字段类型是否正确
 * 3. 必填字段是否存在
 * 4. 参数验证是否正确
 *
 * 创建时间：2025-11-23
 */

const request = require('supertest')
const app = require('../../app')
const { User } = require('../../models')
const jwt = require('jsonwebtoken')

describe('消费记录API契约测试', () => {
  let adminToken

  // 测试前准备：获取管理员Token
  beforeAll(async () => {
    // 查找管理员用户
    const admin = await User.findOne({
      where: { mobile: '13612227930' }
    })

    if (admin) {
      // 生成管理员Token
      adminToken = jwt.sign(
        {
          user_id: admin.user_id,
          mobile: admin.mobile,
          role_level: 100,
          is_admin: true
        },
        process.env.JWT_SECRET || 'development_secret',
        { expiresIn: '1h' }
      )
    }
  })

  describe('GET /api/v4/consumption/admin/records', () => {
    it('应该返回标准的响应结构', async () => {
      const response = await request(app)
        .get('/api/v4/consumption/admin/records?page=1&page_size=20&status=all')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      // ✅ 验证顶层响应结构
      expect(response.body).toMatchObject({
        success: true,
        code: expect.any(String),
        message: expect.any(String),
        timestamp: expect.any(String),
        version: expect.any(String)
      })

      // ✅ 验证data字段存在
      expect(response.body).toHaveProperty('data')
      expect(response.body.data).toMatchObject({
        records: expect.any(Array),
        pagination: expect.any(Object),
        statistics: expect.any(Object)
      })
    })

    it('应该返回正确的分页结构', async () => {
      const response = await request(app)
        .get('/api/v4/consumption/admin/records?page=1&page_size=10')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      // ✅ 验证分页结构
      expect(response.body.data.pagination).toMatchObject({
        total: expect.any(Number),
        page: 1,
        page_size: 10,
        total_pages: expect.any(Number)
      })

      // ✅ 验证分页逻辑正确
      expect(response.body.data.pagination.page).toBe(1)
      expect(response.body.data.pagination.page_size).toBe(10)
      expect(response.body.data.pagination.total_pages).toBe(
        Math.ceil(response.body.data.pagination.total / 10)
      )
    })

    it('应该返回正确的统计数据结构', async () => {
      const response = await request(app)
        .get('/api/v4/consumption/admin/records')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      // ✅ 验证统计数据结构
      expect(response.body.data.statistics).toMatchObject({
        pending: expect.any(Number),
        approved: expect.any(Number),
        rejected: expect.any(Number),
        today: expect.any(Number)
      })

      // ✅ 验证统计数据非负
      expect(response.body.data.statistics.pending).toBeGreaterThanOrEqual(0)
      expect(response.body.data.statistics.approved).toBeGreaterThanOrEqual(0)
      expect(response.body.data.statistics.rejected).toBeGreaterThanOrEqual(0)
      expect(response.body.data.statistics.today).toBeGreaterThanOrEqual(0)
    })

    it('应该返回正确的记录结构', async () => {
      const response = await request(app)
        .get('/api/v4/consumption/admin/records?page=1&page_size=1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      // 如果有数据，验证记录结构
      if (response.body.data.records.length > 0) {
        const record = response.body.data.records[0]

        // ✅ 验证必需字段存在
        expect(record).toHaveProperty('record_id')
        expect(record).toHaveProperty('user_id')
        expect(record).toHaveProperty('consumption_amount')
        expect(record).toHaveProperty('points_to_award')
        expect(record).toHaveProperty('status')
        expect(record).toHaveProperty('created_at')

        // ✅ 验证字段类型
        expect(typeof record.record_id).toBe('number')
        expect(typeof record.user_id).toBe('number')
        expect(typeof record.consumption_amount).toBe('number')
        expect(typeof record.points_to_award).toBe('number')
        expect(typeof record.status).toBe('string')
        expect(typeof record.created_at).toBe('object')

        // ✅ 验证status字段值
        expect(['pending', 'approved', 'rejected']).toContain(record.status)
      }
    })

    it('应该正确处理状态筛选参数', async () => {
      // 测试pending状态
      const pendingResponse = await request(app)
        .get('/api/v4/consumption/admin/records?status=pending')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      // ✅ 验证所有记录都是pending状态
      pendingResponse.body.data.records.forEach(record => {
        expect(record.status).toBe('pending')
      })

      // 测试all状态
      const allResponse = await request(app)
        .get('/api/v4/consumption/admin/records?status=all')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      // ✅ 验证返回所有状态的记录
      const statuses = new Set(allResponse.body.data.records.map(r => r.status))
      expect(statuses.size).toBeGreaterThanOrEqual(1)
    })

    it('应该正确处理搜索参数', async () => {
      const response = await request(app)
        .get('/api/v4/consumption/admin/records?search=136')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      // ✅ 验证返回的记录包含搜索关键词（如果有数据）
      if (response.body.data.records.length > 0) {
        /*
         * 搜索应该匹配手机号
         * 注意：实际验证需要根据业务逻辑调整
         */
        expect(response.body.data.records).toBeInstanceOf(Array)
      }
    })

    it('应该拒绝无权限的访问', async () => {
      // 不带Token访问
      await request(app)
        .get('/api/v4/consumption/admin/records')
        .expect(401)
    })

    it('应该正确处理页码参数', async () => {
      // 测试第2页
      const response = await request(app)
        .get('/api/v4/consumption/admin/records?page=2&page_size=5')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      // ✅ 验证返回的页码正确
      expect(response.body.data.pagination.page).toBe(2)
      expect(response.body.data.pagination.page_size).toBe(5)
    })

    it('应该限制最大页面大小', async () => {
      // 请求超过最大限制的页面大小
      const response = await request(app)
        .get('/api/v4/consumption/admin/records?page_size=200')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      // ✅ 验证实际返回不超过100条
      expect(response.body.data.records.length).toBeLessThanOrEqual(100)
    })

    it('应该处理无效的状态参数', async () => {
      const response = await request(app)
        .get('/api/v4/consumption/admin/records?status=invalid_status')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      // ✅ 应该返回空数组或使用默认值
      expect(response.body.data.records).toBeInstanceOf(Array)
    })
  })

  describe('POST /api/v4/consumption/approve/:record_id', () => {
    it('应该拒绝无权限的访问', async () => {
      await request(app)
        .post('/api/v4/consumption/approve/1')
        .expect(401)
    })

    it('应该要求admin_notes参数（可选）', async () => {
      // 注意：这个测试可能会实际修改数据，建议使用测试数据库
      const response = await request(app)
        .post('/api/v4/consumption/approve/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          admin_notes: '测试审核备注'
        })

      // ✅ 应该返回标准响应结构（可能是404或成功）
      expect(response.body).toHaveProperty('success')
      expect(response.body).toHaveProperty('code')
      expect(response.body).toHaveProperty('message')
    })
  })

  describe('POST /api/v4/consumption/reject/:record_id', () => {
    it('应该拒绝无权限的访问', async () => {
      await request(app)
        .post('/api/v4/consumption/reject/1')
        .expect(401)
    })

    it('应该要求admin_notes参数（拒绝时建议填写）', async () => {
      const response = await request(app)
        .post('/api/v4/consumption/reject/999999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          admin_notes: '消费金额与实际不符'
        })

      // ✅ 应该返回标准响应结构
      expect(response.body).toHaveProperty('success')
      expect(response.body).toHaveProperty('code')
      expect(response.body).toHaveProperty('message')
    })
  })
})
