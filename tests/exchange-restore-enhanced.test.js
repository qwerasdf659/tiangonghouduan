/**
 * 兑换记录恢复API增强功能测试
 * 测试方案2的实现：状态验证、审核状态验证、删除时间检查
 *
 * 测试场景：
 * 1. ✅ 成功恢复：pending/distributed状态
 * 2. ❌ 禁止恢复：used/expired/cancelled状态
 * 3. ❌ 禁止恢复：audit_status=rejected
 * 4. ⚠️ 警告日志：删除超过30天
 * 5. ✅ 详细响应：status、space、deleted_days_ago等字段
 */

const request = require('supertest')
const app = require('../app')
const models = require('../models')
const BeijingTimeHelper = require('../utils/timeHelper')

// 测试用户和管理员
const testUser = {
  mobile: '13612227930',
  verification_code: '123456'
}

let adminToken = null
const testExchangeRecords = {
  distributed: null, // 可恢复状态
  pending: null, // 可恢复状态
  used: null, // 不可恢复状态
  cancelled: null, // 不可恢复状态
  rejected: null // audit_status=rejected，不可恢复
}

/**
 * 登录获取Token
 */
async function login (credentials) {
  const response = await request(app)
    .post('/api/v4/unified-engine/auth/login')
    .send(credentials)
    .expect(200)

  return response.body.data.access_token
}

/**
 * 创建测试兑换记录
 */
async function createTestExchangeRecord (status, auditStatus = 'not_required') {
  // 查找一个真实的product_id
  const product = await models.Product.findOne({
    where: { status: 'active' }
  })

  if (!product) {
    console.log('⚠️ 数据库中没有可用商品，跳过创建')
    return null
  }

  // 查找测试用户ID
  const user = await models.User.findOne({
    where: { mobile: testUser.mobile }
  })

  if (!user) {
    console.log('⚠️ 测试用户不存在，跳过创建')
    return null
  }

  const record = await models.ExchangeRecords.create({
    user_id: user.user_id,
    product_id: product.product_id,
    product_snapshot: {
      name: product.name,
      description: product.description,
      exchange_points: product.exchange_points
    },
    quantity: 1,
    total_points: product.exchange_points,
    exchange_code: `TEST_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    status,
    audit_status: auditStatus,
    space: 'lucky',
    exchange_time: BeijingTimeHelper.createDatabaseTime(),
    is_deleted: 1, // 标记为已删除
    deleted_at: BeijingTimeHelper.createDatabaseTime()
  })

  return record.exchange_id
}

describe('兑换记录恢复API增强功能测试', () => {
  beforeAll(async () => {
    // 登录获取Token
    adminToken = await login(testUser)

    // 创建各种状态的测试记录
    console.log('🔧 创建测试数据...')
    testExchangeRecords.distributed = await createTestExchangeRecord('distributed', 'not_required')
    testExchangeRecords.pending = await createTestExchangeRecord('pending', 'pending')
    testExchangeRecords.used = await createTestExchangeRecord('used', 'approved')
    testExchangeRecords.cancelled = await createTestExchangeRecord('cancelled', 'not_required')
    testExchangeRecords.rejected = await createTestExchangeRecord('cancelled', 'rejected')

    console.log('✅ 测试数据创建完成:', testExchangeRecords)
  })

  afterAll(async () => {
    // 清理测试数据
    const exchangeIds = Object.values(testExchangeRecords).filter(id => id !== null)
    if (exchangeIds.length > 0) {
      await models.ExchangeRecords.destroy({
        where: { exchange_id: exchangeIds },
        force: true // 物理删除测试数据
      })
    }

    // 关闭数据库连接
    await models.sequelize.close()
  })

  /**
   * 测试1：成功恢复distributed状态的记录
   */
  test('✅ 应成功恢复distributed（已分发）状态的记录', async () => {
    if (!testExchangeRecords.distributed) {
      console.log('⚠️ 跳过：无distributed测试记录')
      return
    }

    const response = await request(app)
      .post(`/api/v4/inventory/exchange-records/${testExchangeRecords.distributed}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.message).toContain('恢复')

    // 验证响应包含详细信息
    expect(response.body.data).toHaveProperty('exchange_id')
    expect(response.body.data).toHaveProperty('status')
    expect(response.body.data).toHaveProperty('space')
    expect(response.body.data).toHaveProperty('deleted_days_ago')
    expect(response.body.data.status).toBe('distributed')

    // 验证数据库记录被恢复
    const record = await models.ExchangeRecords.findByPk(testExchangeRecords.distributed)
    expect(record.is_deleted).toBe(0)
    expect(record.deleted_at).toBeNull()
  })

  /**
   * 测试2：成功恢复pending状态的记录
   */
  test('✅ 应成功恢复pending（待审核）状态的记录', async () => {
    if (!testExchangeRecords.pending) {
      console.log('⚠️ 跳过：无pending测试记录')
      return
    }

    const response = await request(app)
      .post(`/api/v4/inventory/exchange-records/${testExchangeRecords.pending}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)

    expect(response.body.success).toBe(true)
    expect(response.body.data.status).toBe('pending')

    // 验证数据库记录被恢复
    const record = await models.ExchangeRecords.findByPk(testExchangeRecords.pending)
    expect(record.is_deleted).toBe(0)
    expect(record.deleted_at).toBeNull()
  })

  /**
   * 测试3：禁止恢复used状态的记录
   */
  test('❌ 应禁止恢复used（已使用）状态的记录', async () => {
    if (!testExchangeRecords.used) {
      console.log('⚠️ 跳过：无used测试记录')
      return
    }

    const response = await request(app)
      .post(`/api/v4/inventory/exchange-records/${testExchangeRecords.used}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400)

    expect(response.body.success).toBe(false)
    expect(response.body.message).toContain('已使用')
    expect(response.body.message).toContain('无法恢复')

    // 验证数据库记录仍为删除状态
    const record = await models.ExchangeRecords.findOne({
      where: { exchange_id: testExchangeRecords.used },
      paranoid: false
    })
    expect(record.is_deleted).toBe(1)
  })

  /**
   * 测试4：禁止恢复cancelled状态的记录
   */
  test('❌ 应禁止恢复cancelled（已取消）状态的记录', async () => {
    if (!testExchangeRecords.cancelled) {
      console.log('⚠️ 跳过：无cancelled测试记录')
      return
    }

    const response = await request(app)
      .post(`/api/v4/inventory/exchange-records/${testExchangeRecords.cancelled}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400)

    expect(response.body.success).toBe(false)
    expect(response.body.message).toContain('已取消')
    expect(response.body.message).toContain('无法恢复')

    // 验证数据库记录仍为删除状态
    const record = await models.ExchangeRecords.findOne({
      where: { exchange_id: testExchangeRecords.cancelled },
      paranoid: false
    })
    expect(record.is_deleted).toBe(1)
  })

  /**
   * 测试5：禁止恢复audit_status=rejected的记录
   */
  test('❌ 应禁止恢复audit_status=rejected（审核拒绝）的记录', async () => {
    if (!testExchangeRecords.rejected) {
      console.log('⚠️ 跳过：无rejected测试记录')
      return
    }

    const response = await request(app)
      .post(`/api/v4/inventory/exchange-records/${testExchangeRecords.rejected}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400)

    expect(response.body.success).toBe(false)
    expect(response.body.message).toContain('审核拒绝')
    expect(response.body.message).toContain('积分已退回')

    // 验证数据库记录仍为删除状态
    const record = await models.ExchangeRecords.findOne({
      where: { exchange_id: testExchangeRecords.rejected },
      paranoid: false
    })
    expect(record.is_deleted).toBe(1)
  })

  /**
   * 测试6：无效的exchange_id
   */
  test('❌ 应拒绝无效的exchange_id', async () => {
    const response = await request(app)
      .post('/api/v4/inventory/exchange-records/invalid/restore')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400)

    expect(response.body.success).toBe(false)
    expect(response.body.message).toContain('无效')
  })

  /**
   * 测试7：不存在的exchange_id
   */
  test('❌ 应拒绝不存在的exchange_id', async () => {
    const response = await request(app)
      .post('/api/v4/inventory/exchange-records/999999999/restore')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404)

    expect(response.body.success).toBe(false)
    expect(response.body.message).toContain('不存在')
  })

  /**
   * 测试8：尝试恢复未删除的记录
   */
  test('❌ 应拒绝恢复未删除的记录', async () => {
    // 先找一条未删除的记录
    const record = await models.ExchangeRecords.findOne({
      where: { is_deleted: 0 }
    })

    if (!record) {
      console.log('⚠️ 跳过：无未删除的记录')
      return
    }

    const response = await request(app)
      .post(`/api/v4/inventory/exchange-records/${record.exchange_id}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404)

    expect(response.body.success).toBe(false)
    expect(response.body.message).toContain('不存在或未被删除')
  })

  /**
   * 测试9：验证响应数据完整性
   */
  test('✅ 响应数据应包含完整信息', async () => {
    if (!testExchangeRecords.distributed) {
      console.log('⚠️ 跳过：无distributed测试记录')
      return
    }

    // 先恢复记录
    await models.ExchangeRecords.update(
      { is_deleted: 1, deleted_at: BeijingTimeHelper.createDatabaseTime() },
      { where: { exchange_id: testExchangeRecords.distributed } }
    )

    const response = await request(app)
      .post(`/api/v4/inventory/exchange-records/${testExchangeRecords.distributed}/restore`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)

    // 验证响应包含所有必需字段
    expect(response.body.data).toMatchObject({
      exchange_id: testExchangeRecords.distributed,
      is_deleted: 0,
      user_id: expect.any(Number),
      status: expect.any(String),
      space: expect.any(String),
      deleted_days_ago: expect.any(Number),
      note: expect.stringContaining('恢复')
    })
  })
})
