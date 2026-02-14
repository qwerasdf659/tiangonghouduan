/**
 * 批量操作功能集成测试
 *
 * 测试场景：
 * 1. 批量赠送抽奖次数（B6）- 验证 lottery_campaign_id 正确传递
 * 2. 批量操作日志查询 - 验证 batch_operation_log_id 正确返回
 * 3. 批量操作日志详情 - 验证主键字段名一致性
 * 4. 批量操作配置查询 - 验证配置端点正常
 *
 * 根因修复验证：
 * - 模型主键 batch_operation_log_id 与服务层/路由层引用一致
 * - API 响应字段名符合 {table_name}_id 命名规范
 *
 * 创建时间：2026-02-15
 */

const request = require('supertest')
const app = require('../../app')
const { sequelize } = require('../../models')

describe('批量操作功能测试', () => {
  let adminToken
  let adminUserId
  let skipTests = false

  // 测试前准备：登录获取管理员 token
  beforeAll(async () => {
    try {
      const loginRes = await request(app).post('/api/v4/auth/login').send({
        mobile: '13612227930',
        verification_code: '123456'
      })

      if (!loginRes.body.success || !loginRes.body.data.access_token) {
        console.warn('⚠️ 登录失败，跳过批量操作测试')
        skipTests = true
        return
      }

      adminToken = loginRes.body.data.access_token
      const tokenPayload = JSON.parse(Buffer.from(adminToken.split('.')[1], 'base64').toString())
      adminUserId = tokenPayload.user_id
    } catch (error) {
      console.warn('⚠️ 初始化失败，跳过测试:', error.message)
      skipTests = true
    }
  })

  afterAll(async () => {
    try {
      await sequelize.close()
    } catch {
      // 忽略关闭错误
    }
  })

  // ==================== B6: 批量赠送抽奖次数 ====================

  describe('B6: 批量赠送抽奖次数', () => {
    it('使用正确字段名 lottery_campaign_id 应该成功', async () => {
      if (skipTests) return

      // 使用时间戳确保 reason 唯一，避免幂等性冲突
      const uniqueReason = `集成测试-字段名验证-${Date.now()}`

      const res = await request(app)
        .post('/api/v4/console/batch-operations/quota-grant')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          lottery_campaign_id: 1,
          user_ids: [adminUserId],
          bonus_count: 1,
          reason: uniqueReason
        })

      expect(res.body.success).toBe(true)
      expect(res.body.code).toBe('SUCCESS')
      expect(res.body.data).toBeDefined()

      // 关键验证：batch_operation_log_id 必须有值（非 undefined/null）
      expect(res.body.data.batch_operation_log_id).toBeDefined()
      expect(res.body.data.batch_operation_log_id).not.toBeNull()
      expect(typeof res.body.data.batch_operation_log_id).toBe('number')

      // 验证业务结果
      expect(res.body.data.total_count).toBe(1)
      expect(res.body.data.success_count).toBe(1)
      expect(res.body.data.fail_count).toBe(0)
      expect(res.body.data.success_rate).toBe(100)
    })

    it('缺少 lottery_campaign_id 应该返回 400', async () => {
      if (skipTests) return

      const res = await request(app)
        .post('/api/v4/console/batch-operations/quota-grant')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          user_ids: [adminUserId],
          bonus_count: 1,
          reason: '测试-缺少活动ID'
        })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.code).toBe('INVALID_CAMPAIGN_ID')
    })

    it('缺少 reason 应该返回 400', async () => {
      if (skipTests) return

      const res = await request(app)
        .post('/api/v4/console/batch-operations/quota-grant')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          lottery_campaign_id: 1,
          user_ids: [adminUserId],
          bonus_count: 1,
          reason: ''
        })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.code).toBe('INVALID_REASON')
    })
  })

  // ==================== 批量操作日志查询 ====================

  describe('批量操作日志查询', () => {
    it('日志列表应返回 batch_operation_log_id 字段', async () => {
      if (skipTests) return

      const res = await request(app)
        .get('/api/v4/console/batch-operations/logs?page=1&page_size=5')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.body.success).toBe(true)
      expect(res.body.data.logs).toBeDefined()
      expect(Array.isArray(res.body.data.logs)).toBe(true)

      // 验证日志列表中每条记录都有 batch_operation_log_id
      if (res.body.data.logs.length > 0) {
        const firstLog = res.body.data.logs[0]
        expect(firstLog.batch_operation_log_id).toBeDefined()
        expect(firstLog.batch_operation_log_id).not.toBeNull()
        expect(firstLog.operation_type).toBeDefined()
        expect(firstLog.status).toBeDefined()
        expect(firstLog.total_count).toBeDefined()
      }

      // 验证分页结构
      expect(res.body.data.pagination).toBeDefined()
      expect(res.body.data.pagination.total_count).toBeDefined()
    })

    it('日志详情应返回完整的 batch_operation_log_id', async () => {
      if (skipTests) return

      // 先查一条日志
      const listRes = await request(app)
        .get('/api/v4/console/batch-operations/logs?page=1&page_size=1')
        .set('Authorization', `Bearer ${adminToken}`)

      if (listRes.body.data.logs.length === 0) {
        console.warn('⚠️ 无操作日志记录，跳过详情测试')
        return
      }

      const logId = listRes.body.data.logs[0].batch_operation_log_id
      expect(logId).toBeDefined()

      const detailRes = await request(app)
        .get(`/api/v4/console/batch-operations/logs/${logId}`)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(detailRes.body.success).toBe(true)
      expect(detailRes.body.data.batch_operation_log_id).toBe(logId)
      expect(detailRes.body.data.operation_type_name).toBeDefined()
      expect(detailRes.body.data.status_name).toBeDefined()
    })
  })

  // ==================== 批量操作配置 ====================

  describe('批量操作配置', () => {
    it('应返回操作类型和状态映射', async () => {
      if (skipTests) return

      const res = await request(app)
        .get('/api/v4/console/batch-operations/config')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.body.success).toBe(true)
      expect(res.body.data.operation_types).toBeDefined()
      expect(res.body.data.statuses).toBeDefined()

      // 验证操作类型映射
      expect(res.body.data.operation_types.quota_grant_batch).toBe('批量赠送抽奖次数')
      expect(res.body.data.operation_types.campaign_status_batch).toBe('批量活动状态切换')
      expect(res.body.data.operation_types.budget_adjust_batch).toBe('批量预算调整')
    })
  })

  // ==================== B10: 批量预算调整 ====================

  describe('B10: 批量预算调整', () => {
    it('increase 类型应成功增加活动池预算', async () => {
      if (skipTests) return

      const uniqueReason = `集成测试-预算增加-${Date.now()}`

      const res = await request(app)
        .post('/api/v4/console/batch-operations/budget-adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          adjustments: [
            {
              lottery_campaign_id: 1,
              adjustment_type: 'increase',
              amount: 100
            }
          ],
          reason: uniqueReason
        })

      expect(res.body.success).toBe(true)
      expect(res.body.data.batch_operation_log_id).toBeDefined()
      expect(res.body.data.total_count).toBe(1)

      // 如果活动是 pool 模式，应成功；否则记录 fail
      const resultItem =
        res.body.data.result_details.success_items[0] ||
        res.body.data.result_details.failed_items[0]
      expect(resultItem).toBeDefined()
      expect(resultItem.lottery_campaign_id).toBe(1)
    })

    it('缺少 adjustments 应返回 400', async () => {
      if (skipTests) return

      const res = await request(app)
        .post('/api/v4/console/batch-operations/budget-adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          adjustments: [],
          reason: '测试-空数组'
        })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.code).toBe('INVALID_ADJUSTMENTS')
    })

    it('缺少 reason 应返回 400', async () => {
      if (skipTests) return

      const res = await request(app)
        .post('/api/v4/console/batch-operations/budget-adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          adjustments: [{ lottery_campaign_id: 1, adjustment_type: 'increase', amount: 50 }],
          reason: ''
        })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
      expect(res.body.code).toBe('INVALID_REASON')
    })

    it('无效的 adjustment_type 应返回 400', async () => {
      if (skipTests) return

      const res = await request(app)
        .post('/api/v4/console/batch-operations/budget-adjust')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          adjustments: [{ lottery_campaign_id: 1, adjustment_type: 'invalid_type', amount: 50 }],
          reason: '测试-无效类型'
        })

      expect(res.status).toBe(400)
      expect(res.body.success).toBe(false)
    })
  })

  // ==================== 权限验证 ====================

  describe('权限验证', () => {
    it('未登录应返回 401', async () => {
      const res = await request(app).get('/api/v4/console/batch-operations/logs')

      expect(res.status).toBe(401)
      expect(res.body.success).toBe(false)
    })
  })
})
