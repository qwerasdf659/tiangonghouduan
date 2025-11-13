/**
 * 审计日志功能集成测试
 *
 * 测试场景：
 * 1. 兑换审核操作的审计日志记录
 * 2. 审计日志查询功能
 * 3. 审计日志统计功能
 *
 * 创建时间：2025-10-12
 */

const request = require('supertest')
const app = require('../../app')
const { sequelize, AdminOperationLog, ExchangeRecords } = require('../../models')

describe('审计日志功能测试', () => {
  let adminToken
  let adminUserId
  let testExchangeId
  let testAdminOperationLogId

  // 测试前准备
  beforeAll(async () => {
    // 1. 获取管理员token
    const loginRes = await request(app).post('/api/v4/auth/login').send({
      mobile: '13612227930',
      verification_code: '123456'
    })

    if (!loginRes.body.success || !loginRes.body.data.access_token) {
      console.log('登录失败，跳过审计日志测试')
      return
    }

    adminToken = loginRes.body.data.access_token

    // 解析JWT token获取user_id
    const tokenPayload = JSON.parse(Buffer.from(adminToken.split('.')[1], 'base64').toString())
    adminUserId = tokenPayload.user_id

    // 2. 获取一个待审核的兑换记录
    const pendingExchange = await ExchangeRecords.findOne({
      where: {
        requires_audit: true,
        audit_status: 'pending'
      }
    })

    if (pendingExchange) {
      testExchangeId = pendingExchange.exchange_id
    }
  })

  // 测试后清理
  afterAll(async () => {
    // 关闭数据库连接
    await sequelize.close()
  })

  describe('审计日志记录功能', () => {
    test('审核通过操作应该记录审计日志', async () => {
      if (!testExchangeId) {
        console.log('跳过测试：没有待审核的兑换记录')
        return
      }

      // 执行审核通过操作
      const res = await request(app)
        .post(`/api/v4/admin/audit/${testExchangeId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: '测试审核通过'
        })

      // 验证审核操作成功
      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)

      // 查询审计日志
      await new Promise(resolve => setTimeout(resolve, 1000)) // 等待异步日志记录完成

      const auditLog = await AdminOperationLog.findOne({
        where: {
          operator_id: adminUserId,
          operation_type: 'exchange_audit',
          target_type: 'ExchangeRecords',
          target_id: testExchangeId,
          action: 'approve'
        },
        order: [['created_at', 'DESC']]
      })

      // 验证审计日志已创建
      expect(auditLog).toBeTruthy()
      expect(auditLog.operator_id).toBe(adminUserId)
      expect(auditLog.target_id).toBe(testExchangeId)
      expect(auditLog.operation_type).toBe('exchange_audit')
      expect(auditLog.action).toBe('approve')
      expect(auditLog.reason).toContain('测试审核通过')
      expect(auditLog.before_data).toBeTruthy()
      expect(auditLog.after_data).toBeTruthy()
      expect(auditLog.changed_fields).toBeTruthy()

      testAdminOperationLogId = auditLog.log_id
    })
  })

  describe('审计日志查询API', () => {
    test('GET /api/v4/audit-management/audit-logs - 应该返回审计日志列表', async () => {
      const res = await request(app)
        .get('/api/v4/audit-management/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          limit: 20,
          offset: 0
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.logs).toBeInstanceOf(Array)
      expect(res.body.data.count).toBeGreaterThanOrEqual(0)
    })

    test('GET /api/v4/audit-management/audit-logs - 应该支持按操作类型筛选', async () => {
      const res = await request(app)
        .get('/api/v4/audit-management/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          operation_type: 'exchange_audit',
          limit: 10
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)

      if (res.body.data.logs.length > 0) {
        res.body.data.logs.forEach(log => {
          expect(log.operation_type).toBe('exchange_audit')
        })
      }
    })

    test('GET /api/v4/audit-management/audit-logs - 应该支持按操作员筛选', async () => {
      const res = await request(app)
        .get('/api/v4/audit-management/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          operator_id: adminUserId,
          limit: 10
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)

      if (res.body.data.logs.length > 0) {
        res.body.data.logs.forEach(log => {
          expect(log.operator_id).toBe(adminUserId)
        })
      }
    })

    test('GET /api/v4/audit-management/audit-logs/:log_id - 应该返回审计日志详情', async () => {
      if (!testAdminOperationLogId) {
        console.log('跳过测试：没有测试审计日志ID')
        return
      }

      const res = await request(app)
        .get(`/api/v4/audit-management/audit-logs/${testAdminOperationLogId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.log_id).toBe(testAdminOperationLogId)
      expect(res.body.data.operator).toBeTruthy()
      expect(res.body.data.operator.user_id).toBe(adminUserId)
    })
  })

  describe('审计日志统计API', () => {
    test('GET /api/v4/audit-management/audit-logs/statistics - 应该返回统计信息', async () => {
      const res = await request(app)
        .get('/api/v4/audit-management/audit-logs/statistics')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.total).toBeGreaterThanOrEqual(0)
      expect(res.body.data.by_operation_type).toBeInstanceOf(Array)
      expect(res.body.data.by_action).toBeInstanceOf(Array)
    })

    test('GET /api/v4/audit-management/audit-logs/statistics - 应该支持按操作员统计', async () => {
      const res = await request(app)
        .get('/api/v4/audit-management/audit-logs/statistics')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          operator_id: adminUserId
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(typeof res.body.data.total).toBe('number')
    })
  })

  describe('审计日志权限控制', () => {
    test('非管理员不能查询审计日志', async () => {
      // 获取普通用户token
      const userLoginRes = await request(app).post('/api/v4/auth/login').send({
        mobile: '13800000000', // 假设这是普通用户
        verification_code: '123456'
      })

      if (userLoginRes.status === 200 && userLoginRes.body.success) {
        const userToken = userLoginRes.body.data.access_token

        const res = await request(app)
          .get('/api/v4/audit-management/audit-logs')
          .set('Authorization', `Bearer ${userToken}`)

        // 应该返回403或401
        expect([401, 403]).toContain(res.status)
      }
    })
  })

  describe('审计日志数据完整性', () => {
    test('审计日志应该包含必要的字段', async () => {
      const log = await AdminOperationLog.findOne({
        order: [['created_at', 'DESC']]
      })

      if (log) {
        expect(log.log_id).toBeTruthy()
        expect(log.operator_id).toBeTruthy()
        expect(log.operation_type).toBeTruthy()
        expect(log.target_type).toBeTruthy()
        expect(log.target_id).toBeTruthy()
        expect(log.action).toBeTruthy()
        expect(log.created_at).toBeTruthy()
      }
    })

    test('审计日志应该记录操作前后数据对比', async () => {
      const log = await AdminOperationLog.findOne({
        where: {
          operation_type: 'exchange_audit'
        },
        order: [['created_at', 'DESC']]
      })

      if (log) {
        expect(log.before_data).toBeTruthy()
        expect(log.after_data).toBeTruthy()
        expect(log.changed_fields).toBeInstanceOf(Array)

        // 验证changed_fields格式
        if (log.changed_fields.length > 0) {
          log.changed_fields.forEach(change => {
            expect(change).toHaveProperty('field')
            expect(change).toHaveProperty('old_value')
            expect(change).toHaveProperty('new_value')
          })
        }
      }
    })
  })
})
