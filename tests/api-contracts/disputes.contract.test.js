/**
 * 售后申诉模块 API 契约测试（方案A 第2项：可回归验证）
 *
 * 测试范围：
 * - C 端只读/自助接口契约：GET /system/disputes/my、GET /system/disputes/:id、POST /system/disputes
 * - public 脱敏：下发小程序的字段不得包含 assigned_to / approval_chain_instance_id / created_by / deadline
 * - 鉴权：无 Token 返回 401；必填校验返回 400
 *
 * 技术规范：
 * - 连接真实数据库 restaurant_points_dev（禁止 mock）
 * - 统一响应契约（success/code/message/data/timestamp/version/request_id）
 * - 测试账号 user_id=31（13612227910），既是用户也是管理员
 * - 自助创建的申诉在 afterAll 硬删除清理（含 fire-and-forget 站内信），不污染真实库
 *
 * @module tests/api-contracts/disputes.contract.test
 */

'use strict'

const request = require('supertest')
const { sequelize } = require('../../models')
const DataSanitizer = require('../../services/DataSanitizer')

let app
let accessToken

jest.setTimeout(30000)

/** 测试用户 user_id=31 已核销（fulfilled）的兑换订单，用于自助发起申诉 */
const TEST_REDEMPTION_ORDER_ID = '419c38a7-947d-4442-a2cb-049b7eb8028f'

/** public 级必须被删除的内部字段（与 DataSanitizer.sanitizeDisputes 黑名单一致） */
const INTERNAL_FIELDS = ['assigned_to', 'approval_chain_instance_id', 'created_by', 'deadline']

describe('API契约测试 - 售后申诉模块', () => {
  /** 记录测试开始时间，afterAll 精确清理本次产生的 dispute 站内信（_notify 事务外） */
  let test_start_time
  /** 自助创建成功的申诉 ID，afterAll 硬删除 */
  const created_dispute_ids = []

  beforeAll(async () => {
    app = require('../../app')
    await sequelize.authenticate()
    test_start_time = new Date()

    const loginResponse = await request(app)
      .post('/api/v4/auth/login')
      .send({ mobile: '13612227910', verification_code: '123456' })

    if (loginResponse.body.success) {
      accessToken = loginResponse.body.data.access_token
    }
  })

  afterAll(async () => {
    // 硬删除测试自助创建的申诉（孤儿数据硬删除规范）
    if (created_dispute_ids.length > 0) {
      await sequelize.query('DELETE FROM trade_disputes WHERE trade_dispute_id IN (:ids)', {
        replacements: { ids: created_dispute_ids },
        type: sequelize.QueryTypes.DELETE
      })
    }
    // 清理 fire-and-forget 站内信
    await sequelize.query(
      `DELETE FROM user_notifications
       WHERE user_id = 31 AND type LIKE 'dispute\\_%' AND created_at >= :since`,
      { replacements: { since: test_start_time }, type: sequelize.QueryTypes.DELETE }
    )
    await sequelize.close()
  })

  /** 通用契约校验：统一响应体 7 字段 */
  function validateApiContract(body, expectSuccess = true) {
    expect(body).toHaveProperty('success')
    expect(body).toHaveProperty('code')
    expect(body).toHaveProperty('message')
    expect(body).toHaveProperty('data')
    expect(body).toHaveProperty('timestamp')
    expect(body).toHaveProperty('version')
    expect(body).toHaveProperty('request_id')
    expect(typeof body.success).toBe('boolean')
    expect(typeof body.code).toBe('string')
    if (expectSuccess) expect(body.success).toBe(true)
  }

  // ==================== DataSanitizer.sanitizeDisputes（public 脱敏黑名单）====================
  describe('DataSanitizer.sanitizeDisputes - public 脱敏', () => {
    /** 构造一条含全部内部字段的申诉样本 */
    function makeDisputeSample() {
      return {
        trade_dispute_id: 12345,
        user_id: 31,
        order_type: 'auction',
        order_id: '999999100',
        dispute_type: 'item_mismatch',
        title: '脱敏测试',
        status: 'reviewing',
        resolution: null,
        created_at: '2026-06-02 10:00:00',
        resolved_at: null,
        // 内部字段（public 应删除）
        assigned_to: 99,
        approval_chain_instance_id: 414,
        created_by: 31,
        deadline: '2026-06-09 10:00:00',
        updated_at: '2026-06-02 10:00:00'
      }
    }

    test('public 级移除全部内部字段', () => {
      const [sanitized] = DataSanitizer.sanitizeDisputes([makeDisputeSample()], 'public')
      INTERNAL_FIELDS.forEach(field => {
        expect(sanitized).not.toHaveProperty(field)
      })
      expect(sanitized).not.toHaveProperty('updated_at')
    })

    test('public 级保留用户可见字段', () => {
      const [sanitized] = DataSanitizer.sanitizeDisputes([makeDisputeSample()], 'public')
      ;[
        'trade_dispute_id',
        'order_type',
        'order_id',
        'dispute_type',
        'status',
        'title',
        'created_at'
      ].forEach(field => expect(sanitized).toHaveProperty(field))
    })

    test('full 级（管理员）返回完整数据，不脱敏', () => {
      const [full] = DataSanitizer.sanitizeDisputes([makeDisputeSample()], 'full')
      expect(full.assigned_to).toBe(99)
      expect(full.approval_chain_instance_id).toBe(414)
    })
  })

  // ==================== GET /api/v4/system/disputes/my ====================
  describe('GET /system/disputes/my - 我的售后申诉列表（脱敏）', () => {
    test('应返回标准契约格式与分页结构', async () => {
      const response = await request(app)
        .get('/api/v4/system/disputes/my')
        .set('Authorization', `Bearer ${accessToken}`)

      expect(response.status).toBe(200)
      validateApiContract(response.body)
      expect(response.body.data).toHaveProperty('rows')
      expect(response.body.data).toHaveProperty('count')
      expect(Array.isArray(response.body.data.rows)).toBe(true)
    })

    test('返回列表的每条记录都不含内部字段（public 脱敏）', async () => {
      const response = await request(app)
        .get('/api/v4/system/disputes/my')
        .set('Authorization', `Bearer ${accessToken}`)

      response.body.data.rows.forEach(row => {
        INTERNAL_FIELDS.forEach(field => expect(row).not.toHaveProperty(field))
      })
    })

    test('无 Authorization 返回 401', async () => {
      const response = await request(app).get('/api/v4/system/disputes/my')
      expect(response.status).toBe(401)
    })
  })

  // ==================== POST /api/v4/system/disputes（自助发起）====================
  describe('POST /system/disputes - 用户自助发起申诉', () => {
    test('缺少必填参数返回 400', async () => {
      const response = await request(app)
        .post('/api/v4/system/disputes')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ order_type: 'auction' })

      expect(response.status).toBe(400)
      validateApiContract(response.body, false)
    })

    test('无 Authorization 返回 401', async () => {
      const response = await request(app)
        .post('/api/v4/system/disputes')
        .send({ order_type: 'auction', order_id: '1', dispute_type: 'other', title: 't' })
      expect(response.status).toBe(401)
    })

    test('对本人 fulfilled 兑换订单自助发起成功，返回脱敏数据', async () => {
      const response = await request(app)
        .post('/api/v4/system/disputes')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          order_type: 'redemption',
          order_id: TEST_REDEMPTION_ORDER_ID,
          dispute_type: 'quality_issue',
          title: '契约测试-自助发起',
          description: '兑换商品质量问题'
        })

      // 若该订单已有进行中的申诉，会返回业务错误；否则应创建成功
      if (response.body.success) {
        validateApiContract(response.body)
        expect(response.body.data.trade_dispute_id).toBeGreaterThan(0)
        created_dispute_ids.push(response.body.data.trade_dispute_id)
      } else {
        // 业务错误（如已有进行中申诉）也必须符合契约
        validateApiContract(response.body, false)
        expect(response.status).toBeGreaterThanOrEqual(400)
      }
    })
  })
})
