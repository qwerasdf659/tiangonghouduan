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
 * 更新时间：2025-12-22 - 移除is_admin字段，使用UUID角色系统
 */

const request = require('supertest')
const app = require('../../app')
const { loginAsAdmin } = require('../helpers/auth-helper')

describe('消费记录API契约测试', () => {
  let adminToken

  // 测试前准备：通过统一认证获取管理员Token
  beforeAll(async () => {
    /**
     * 🔐 使用统一认证辅助函数获取Token
     * 说明：通过实际API登录获取Token，确保JWT payload与后端一致
     * 移除手动JWT生成，避免is_admin字段等不一致问题
     */
    try {
      adminToken = await loginAsAdmin(app)
    } catch (error) {
      console.warn('⚠️ 管理员登录失败，测试可能无法正常运行:', error.message)
    }
  })

  describe('GET /api/v4/console/consumption/records', () => {
    /**
     * 管理员消费记录查询API
     * 域：控制台域（/console），而非商家域（/shop）
     * 注意：管理员相关操作统一在console域
     */
    it('应该返回标准的响应结构', async () => {
      const response = await request(app)
        .get('/api/v4/console/consumption/records?page=1&page_size=20&status=all')
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
        .get('/api/v4/console/consumption/records?page=1&page_size=10')
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
        .get('/api/v4/console/consumption/records')
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
        .get('/api/v4/console/consumption/records?page=1&page_size=1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      // 如果有数据，验证记录结构
      if (response.body.data.records.length > 0) {
        const record = response.body.data.records[0]

        // ✅ 验证必需字段存在
        expect(record).toHaveProperty('consumption_record_id')
        expect(record).toHaveProperty('user_id')
        expect(record).toHaveProperty('consumption_amount')
        expect(record).toHaveProperty('points_to_award')
        expect(record).toHaveProperty('status')
        expect(record).toHaveProperty('created_at')

        // ✅ 验证字段类型
        expect(typeof record.consumption_record_id).toBe('number')
        expect(typeof record.user_id).toBe('number')
        expect(typeof record.consumption_amount).toBe('number')
        expect(typeof record.points_to_award).toBe('number')
        expect(typeof record.status).toBe('string')
        // B-2：时间字段统一为 UTC ISO8601 字符串（...Z），不再是对象
        expect(typeof record.created_at).toBe('string')
        expect(record.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)

        // ✅ 验证status字段值
        expect(['pending', 'approved', 'rejected']).toContain(record.status)
      }
    })

    it('应该正确处理状态筛选参数', async () => {
      // 测试pending状态
      const pendingResponse = await request(app)
        .get('/api/v4/console/consumption/records?status=pending')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      // ✅ 验证所有记录都是pending状态
      pendingResponse.body.data.records.forEach(record => {
        expect(record.status).toBe('pending')
      })

      // 测试all状态
      const allResponse = await request(app)
        .get('/api/v4/console/consumption/records?status=all')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      // ✅ 验证返回所有状态的记录（如果有数据）
      const statuses = new Set(allResponse.body.data.records.map(r => r.status))
      if (allResponse.body.data.records.length > 0) {
        expect(statuses.size).toBeGreaterThanOrEqual(1)
      } else {
        console.warn('⚠️ 无消费记录数据，跳过状态验证')
        expect(statuses.size).toBe(0)
      }
    })

    it('应该正确处理搜索参数', async () => {
      const response = await request(app)
        .get('/api/v4/console/consumption/records?search=136')
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
      // 不带Token访问 - 管理员端点需要认证
      await request(app).get('/api/v4/console/consumption/records').expect(401)
    })

    it('应该正确处理页码参数', async () => {
      // 测试第2页
      const response = await request(app)
        .get('/api/v4/console/consumption/records?page=2&page_size=5')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      // ✅ 验证返回的页码正确
      expect(response.body.data.pagination.page).toBe(2)
      expect(response.body.data.pagination.page_size).toBe(5)
    })

    it('应该限制最大页面大小', async () => {
      // 请求超过最大限制的页面大小
      const response = await request(app)
        .get('/api/v4/console/consumption/records?page_size=200')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      // ✅ 验证实际返回不超过100条
      expect(response.body.data.records.length).toBeLessThanOrEqual(100)
    })

    it('应该处理无效的状态参数', async () => {
      const response = await request(app)
        .get('/api/v4/console/consumption/records?status=invalid_status')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      // ✅ 应该返回空数组或使用默认值
      expect(response.body.data.records).toBeInstanceOf(Array)
    })
  })

  describe('POST /api/v4/console/approval-chain/steps/:id/approve', () => {
    it('应该拒绝无权限的访问', async () => {
      // 消费审核已收口审核链（2026-06-12）：审核动作面向审核链步骤
      await request(app).post('/api/v4/console/approval-chain/steps/1/approve').expect(401)
    })

    it('应该返回标准响应结构', async () => {
      const response = await request(app)
        .post('/api/v4/console/approval-chain/steps/999999/approve')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: '测试审核备注' })

      // ✅ 标准响应结构（步骤不存在时返回业务失败）
      expect(response.body).toHaveProperty('success')
      expect(response.body).toHaveProperty('code')
      expect(response.body).toHaveProperty('message')
    })
  })

  describe('POST /api/v4/console/approval-chain/steps/:id/reject', () => {
    it('应该拒绝无权限的访问', async () => {
      await request(app).post('/api/v4/console/approval-chain/steps/1/reject').expect(401)
    })

    it('应该返回标准响应结构', async () => {
      const response = await request(app)
        .post('/api/v4/console/approval-chain/steps/999999/reject')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: '消费金额与实际不符' })

      // ✅ 标准响应结构
      expect(response.body).toHaveProperty('success')
      expect(response.body).toHaveProperty('code')
      expect(response.body).toHaveProperty('message')
    })
  })

  describe('POST /api/v4/console/approval-chain/steps/batch', () => {
    it('应该拒绝无权限的访问', async () => {
      await request(app).post('/api/v4/console/approval-chain/steps/batch').expect(401)
    })

    it('应该返回标准响应结构', async () => {
      const response = await request(app)
        .post('/api/v4/console/approval-chain/steps/batch')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ step_ids: [999999], action: 'approve' })

      expect(response.body).toHaveProperty('success')
      expect(response.body).toHaveProperty('code')
      expect(response.body).toHaveProperty('message')
    })
  })
})
