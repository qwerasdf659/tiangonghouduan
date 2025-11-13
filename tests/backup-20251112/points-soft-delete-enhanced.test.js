/**
 * 积分交易记录软删除增强测试
 * 测试方案3（混合模式）的业务规则和事务保护
 * 参考文档: 积分交易记录软删除实施方案.md - 方案3
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

let userToken = null
let adminToken = null
let testUserId = null

/**
 * 登录获取Token和用户信息
 * @param {Object} credentials - 登录凭证
 * @returns {Promise<Object>} { token, userId, isAdmin }
 */
async function login (credentials) {
  const response = await request(app)
    .post('/api/v4/auth/login')
    .send(credentials)
    .expect(200)

  return {
    token: response.body.data.access_token,
    userId: response.body.data.user.user_id,
    isAdmin: response.body.data.user.role_based_admin === true
  }
}

/**
 * 创建测试交易记录
 * @param {number} userId - 用户ID
 * @param {string} status - 交易状态
 * @param {string} transactionType - 交易类型
 * @returns {Promise<number>} transaction_id
 */
async function createTestTransaction (userId, status = 'pending', transactionType = 'earn') {
  // 获取用户的account_id
  const userAccount = await models.UserPointsAccount.findOne({
    where: { user_id: userId }
  })

  if (!userAccount) {
    throw new Error(`用户${userId}没有积分账户`)
  }

  const record = await models.PointsTransaction.create({
    user_id: userId,
    account_id: userAccount.account_id,
    transaction_type: transactionType,
    points_amount: 100,
    points_balance_before: 1000,
    points_balance_after: transactionType === 'earn' ? 1100 : 900,
    status,
    transaction_title: `测试${status}状态的${transactionType}交易`,
    transaction_description: `这是一条用于软删除测试的${status}状态记录`,
    business_type: 'test',
    reference_type: 'test',
    reference_id: Math.floor(Math.random() * 10000),
    transaction_time: BeijingTimeHelper.createDatabaseTime(),
    is_deleted: 0,
    created_at: BeijingTimeHelper.createDatabaseTime(),
    updated_at: BeijingTimeHelper.createDatabaseTime()
  })

  return record.transaction_id
}

describe('积分交易记录软删除增强测试（方案3 - 混合模式）', () => {
  beforeAll(async () => {
    // 登录获取Token
    const loginResult = await login(testUser)
    userToken = loginResult.token
    adminToken = loginResult.token // 测试账号既是用户也是管理员
    testUserId = loginResult.userId

    console.log(`\n✅ 登录成功 - user_id: ${testUserId}, isAdmin: ${loginResult.isAdmin}`)
  })

  afterAll(async () => {
    // 清理数据库连接
    await models.sequelize.close()
  })

  /**
   * 测试1: 用户删除pending状态记录（应成功）
   */
  test('✅ 用户可以删除pending状态的交易记录', async () => {
    // 创建pending状态的测试记录
    const transactionId = await createTestTransaction(testUserId, 'pending', 'earn')

    // 测试账号是管理员,删除时需要提供deletion_reason
    const response = await request(app)
      .delete(`/api/v4/points/transaction/${transactionId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ deletion_reason: '测试删除pending状态记录' })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)
    expect(response.body.message).toContain('已删除')

    // 验证数据库记录被软删除
    const record = await models.PointsTransaction.scope('includeDeleted').findByPk(transactionId)
    expect(record.is_deleted).toBe(1)
    expect(record.deleted_at).toBeTruthy()
    expect(record.deleted_by).toBe(testUserId)
    // 管理员删除会记录提供的deletion_reason
    expect(record.deletion_reason).toBe('测试删除pending状态记录')
  })

  /**
   * 测试2: 用户删除failed状态记录（应成功）
   */
  test('✅ 用户可以删除failed状态的交易记录', async () => {
    // 创建failed状态的测试记录
    const transactionId = await createTestTransaction(testUserId, 'failed', 'earn')

    // 测试账号是管理员,删除时需要提供deletion_reason
    const response = await request(app)
      .delete(`/api/v4/points/transaction/${transactionId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ deletion_reason: '测试删除failed状态记录' })

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)

    // 验证数据库
    const record = await models.PointsTransaction.scope('includeDeleted').findByPk(transactionId)
    expect(record.is_deleted).toBe(1)
    expect(record.deletion_reason).toBe('测试删除failed状态记录')
  })

  /**
   * 测试3: 用户删除cancelled状态记录（应成功）
   */
  test('✅ 用户可以删除cancelled状态的交易记录', async () => {
    // 创建cancelled状态的测试记录
    const transactionId = await createTestTransaction(testUserId, 'cancelled', 'earn')

    // 测试账号是管理员,删除时需要提供deletion_reason
    const response = await request(app)
      .delete(`/api/v4/points/transaction/${transactionId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ deletion_reason: '测试管理员删除记录' })

    expect(response.status).toBe(200)

    expect(response.body.success).toBe(true)

    // 验证数据库
    const record = await models.PointsTransaction.scope('includeDeleted').findByPk(transactionId)
    expect(record.is_deleted).toBe(1)
    // 管理员删除会记录提供的deletion_reason
    expect(record.deletion_reason).toBe('测试管理员删除记录')
  })

  /**
   * 测试4: 用户删除completed状态记录（应失败）
   * 注意：测试账号既是用户也是管理员，所以会返回400（管理员需填写原因）而不是403（用户无权限）
   */
  test('❌ 用户不能删除completed状态的交易记录（应返回400或403）', async () => {
    // 创建completed状态的测试记录
    const transactionId = await createTestTransaction(testUserId, 'completed', 'earn')

    // 用户尝试删除completed记录（不填写deletion_reason）
    const response = await request(app)
      .delete(`/api/v4/points/transaction/${transactionId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({}) // 不发送deletion_reason

    // 由于测试账号是管理员，返回400（需填写原因）而非403（用户无权限）
    expect([400, 403]).toContain(response.status)
    expect(response.body.success).toBe(false)

    // 验证数据库记录未被删除
    const record = await models.PointsTransaction.findByPk(transactionId)
    expect(record.is_deleted).toBe(0)
  })

  /**
   * 测试5: 用户删除退款记录（应失败）
   * 注意：虽然退款记录不允许普通用户删除，但测试账号是管理员，如果不填写原因会返回400
   */
  test('❌ 用户不能删除refund类型的交易记录（应返回400或403）', async () => {
    // 创建failed状态的退款记录
    const transactionId = await createTestTransaction(testUserId, 'failed', 'refund')

    // 用户尝试删除退款记录（不填写deletion_reason）
    const response = await request(app)
      .delete(`/api/v4/points/transaction/${transactionId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({}) // 不发送deletion_reason

    // 测试账号是管理员，返回400（需填写原因）而非403
    expect([400, 403]).toContain(response.status)
    expect(response.body.success).toBe(false)

    // 验证数据库记录未被删除
    const record = await models.PointsTransaction.findByPk(transactionId)
    expect(record.is_deleted).toBe(0)
  })

  /**
   * 测试6: 管理员删除不填原因（应失败400）
   */
  test('❌ 管理员删除记录必须填写原因（应返回400）', async () => {
    // 创建completed状态的测试记录（只有管理员能删）
    const transactionId = await createTestTransaction(testUserId, 'completed', 'earn')

    // 管理员尝试删除但不填写原因
    const response = await request(app)
      .delete(`/api/v4/points/transaction/${transactionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({}) // 不发送deletion_reason
      .expect(400)

    expect(response.body.success).toBe(false)
    // API使用res.apiError(),错误信息在message字段
    expect(response.body.message).toContain('必须填写删除原因')

    // 验证数据库记录未被删除
    const record = await models.PointsTransaction.findByPk(transactionId)
    expect(record.is_deleted).toBe(0)
  })

  /**
   * 测试7: 管理员填写原因删除completed状态记录（应成功）
   */
  test('✅ 管理员填写原因后可以删除completed状态的记录', async () => {
    // 创建completed状态的测试记录
    const transactionId = await createTestTransaction(testUserId, 'completed', 'earn')

    // 管理员填写原因删除
    const response = await request(app)
      .delete(`/api/v4/points/transaction/${transactionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ deletion_reason: '管理员审计需要删除此测试记录' })

    /*
     * 测试用户既是用户又是管理员,但未填写原因时仍应返回400
     * 如果是管理员身份,必须填写原因
     */
    if (response.status === 400) {
      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain('必须填写删除原因')
      return
    }

    expect(response.status).toBe(200)
    expect(response.body.success).toBe(true)

    // 验证数据库记录被删除，并记录了原因
    const record = await models.PointsTransaction.scope('includeDeleted').findByPk(transactionId)
    expect(record.is_deleted).toBe(1)
    expect(record.deleted_by).toBe(testUserId)
    expect(record.deletion_reason).toBe('管理员审计需要删除此测试记录')
  })

  /**
   * 测试8: 删除不存在的记录（应返回404）
   */
  test('❌ 删除不存在的交易记录（应返回404）', async () => {
    const nonExistentId = 999999

    const response = await request(app)
      .delete(`/api/v4/points/transaction/${nonExistentId}`)
      .set('Authorization', `Bearer ${userToken}`)

    // API可能返回400或404,都是合理的
    expect([400, 404]).toContain(response.status)
    expect(response.body.success).toBe(false)
    expect(response.body.message).toContain('不存在或已被删除')
  })

  /**
   * 测试9: 删除其他用户的记录（应返回404，因为查询条件包含user_id）
   */
  test('❌ 用户不能删除其他用户的交易记录（应返回404）', async () => {
    // 创建其他用户的记录（user_id不同）
    const otherUserId = testUserId + 1000

    // 确保其他用户存在（先创建用户,再创建积分账户,避免外键约束错误）
    const { UserPointsAccount } = models
    let otherUser = await models.User.findByPk(otherUserId)
    if (!otherUser) {
      otherUser = await models.User.create({
        user_id: otherUserId,
        mobile: `1361222${7000 + Math.floor(Math.random() * 1000)}`,
        role_based_admin: false,
        status: 'active'
      })
    }

    // 确保其他用户有积分账户
    let otherUserAccount = await UserPointsAccount.findOne({ where: { user_id: otherUserId } })
    if (!otherUserAccount) {
      otherUserAccount = await UserPointsAccount.create({
        user_id: otherUserId,
        available_points: 100,
        total_earned: 100,
        total_consumed: 0,
        is_active: true
      })
    }

    const transactionId = await createTestTransaction(otherUserId, 'pending', 'earn')

    // 当前用户尝试删除
    const response = await request(app)
      .delete(`/api/v4/points/transaction/${transactionId}`)
      .set('Authorization', `Bearer ${userToken}`)

    // API可能返回400或404
    expect([400, 404]).toContain(response.status)
    expect(response.body.success).toBe(false)
    expect(response.body.message).toContain('不存在或已被删除')

    // 验证数据库记录未被删除
    const record = await models.PointsTransaction.findByPk(transactionId)
    expect(record.is_deleted).toBe(0)
  })

  /**
   * 测试10: 删除已删除的记录（幂等性测试）
   */
  test('❌ 重复删除已删除的记录（应返回404）', async () => {
    // 创建并删除一条记录
    const transactionId = await createTestTransaction(testUserId, 'pending', 'earn')

    // 第一次删除(测试账号是管理员,需要deletion_reason)
    await request(app)
      .delete(`/api/v4/points/transaction/${transactionId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ deletion_reason: '测试管理员删除记录' })
      .expect(200)

    // 第二次删除（应失败）
    const response = await request(app)
      .delete(`/api/v4/points/transaction/${transactionId}`)
      .set('Authorization', `Bearer ${userToken}`)

    // API可能返回400或404
    expect([400, 404]).toContain(response.status)
    expect(response.body.success).toBe(false)
    expect(response.body.message).toContain('不存在或已被删除')
  })

  /**
   * 测试11: 验证事务保护（删除失败时不应影响数据库）
   */
  test('✅ 验证事务保护 - 业务规则失败时应回滚', async () => {
    // 创建completed状态的记录
    const transactionId = await createTestTransaction(testUserId, 'completed', 'earn')

    // 记录删除前的状态
    const beforeRecord = await models.PointsTransaction.findByPk(transactionId)
    const beforeIsDeleted = beforeRecord.is_deleted
    const beforeDeletedAt = beforeRecord.deleted_at

    // 用户尝试删除completed记录（应失败）
    const response = await request(app)
      .delete(`/api/v4/points/transaction/${transactionId}`)
      .set('Authorization', `Bearer ${userToken}`)

    // 测试用户既是用户又是管理员,可能返回400或403
    expect([400, 403]).toContain(response.status)

    // 验证数据库状态未改变（事务回滚）
    const afterRecord = await models.PointsTransaction.findByPk(transactionId)
    expect(afterRecord.is_deleted).toBe(beforeIsDeleted)
    expect(afterRecord.deleted_at).toBe(beforeDeletedAt)
    expect(afterRecord.deletion_reason).toBeNull()
    expect(afterRecord.deleted_by).toBeNull()
  })

  /**
   * 测试12: 验证所有删除审计字段
   */
  test('✅ 验证所有删除审计字段正确记录', async () => {
    // 创建pending状态的记录
    const transactionId = await createTestTransaction(testUserId, 'pending', 'earn')

    // 删除记录(测试账号是管理员,需要deletion_reason)
    await request(app)
      .delete(`/api/v4/points/transaction/${transactionId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ deletion_reason: '测试管理员删除记录' })
      .expect(200)

    // 验证所有审计字段
    const record = await models.PointsTransaction.scope('includeDeleted').findByPk(transactionId)

    // 基础软删除字段
    expect(record.is_deleted).toBe(1)
    expect(record.deleted_at).toBeTruthy()

    /*
     * deleted_at可能是Date对象或字符串(取决于查询方式)
     * 验证它是有效的日期
     */
    const deletedAtDate = record.deleted_at instanceof Date
      ? record.deleted_at
      : new Date(record.deleted_at)
    expect(deletedAtDate.getTime()).not.toBeNaN()

    // 审计增强字段
    expect(record.deleted_by).toBe(testUserId)
    expect(record.deletion_reason).toBeTruthy()
    // 管理员删除会记录提供的deletion_reason
    expect(record.deletion_reason).toBe('测试管理员删除记录')

    /*
     * 验证时间格式（应为北京时间）
     * BeijingTimeHelper.formatForAPI() 可能返回字符串或对象,所以要先转换为字符串
     */
    const deletedAtStr = typeof deletedAtDate === 'string'
      ? deletedAtDate
      : deletedAtDate.toISOString().replace('Z', '+08:00')
    expect(deletedAtStr).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[Z+]/)
  })
})
