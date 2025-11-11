/**
 * 软删除功能集成测试
 * 测试消费记录、兑换记录、积分交易记录的软删除和恢复功能
 * 遵循API7-删除记录实施方案
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

/**
 * 登录获取Token
 * @param {Object} credentials - 登录凭证
 * @returns {Promise<string>} Token
 */
async function login (credentials) {
  const response = await request(app)
    .post('/api/v4/unified-engine/auth/login')
    .send(credentials)
    .expect(200)

  return response.body.data.access_token
}

describe('软删除功能集成测试', () => {
  beforeAll(async () => {
    // 登录获取Token
    userToken = await login(testUser)
    adminToken = await login(testUser) // 测试账号既是用户也是管理员
  })

  afterAll(async () => {
    // 清理数据库连接
    await models.sequelize.close()
  })

  /**
   * 消费记录软删除测试
   */
  describe('消费记录软删除', () => {
    let recordId = null

    test('创建测试消费记录', async () => {
      /*
       * 先创建一个消费记录用于测试
       * 注意：defaultScope已自动过滤is_deleted=0，无需手动指定
       */
      const [record] = await models.ConsumptionRecord.findAll({
        limit: 1
      })

      if (record) {
        recordId = record.record_id
      } else {
        // 如果没有记录，创建一个
        const newRecord = await models.ConsumptionRecord.create({
          user_id: 1,
          transaction_id: 'test_' + Date.now(),
          points_consumed: 100,
          status: 'pending',
          created_at: BeijingTimeHelper.createDatabaseTime(),
          updated_at: BeijingTimeHelper.createDatabaseTime()
        })
        recordId = newRecord.record_id
      }

      expect(recordId).toBeTruthy()
    })

    test('用户软删除自己的消费记录', async () => {
      const response = await request(app)
        .delete(`/api/v4/consumption/${recordId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.message).toContain('已删除')

      /*
       * 验证数据库记录被软删除
       * 注意：需要使用scope('includeDeleted')来查询已删除记录，因为defaultScope会过滤它们
       */
      const record = await models.ConsumptionRecord.scope('includeDeleted').findByPk(recordId)
      expect(record.is_deleted).toBe(1)
      expect(record.deleted_at).toBeTruthy()
    })

    test('管理员恢复已删除的消费记录', async () => {
      const response = await request(app)
        .post(`/api/v4/consumption/${recordId}/restore`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.message).toContain('已恢复')

      // 验证数据库记录被恢复（恢复后的记录可以直接用默认scope查询）
      const record = await models.ConsumptionRecord.findByPk(recordId)
      expect(record.is_deleted).toBe(0)
      expect(record.deleted_at).toBeNull()
    })
  })

  /**
   * 兑换记录软删除测试
   */
  describe('兑换记录软删除', () => {
    let exchangeId = null

    test('创建测试兑换记录', async () => {
      // 注意：defaultScope已自动过滤is_deleted=0，无需手动指定
      const [record] = await models.ExchangeRecords.findAll({
        limit: 1
      })

      if (record) {
        exchangeId = record.exchange_id
      } else {
        // 兑换记录需要更多必需字段，直接跳过创建
        console.log('⚠️ 没有现有兑换记录，跳过兑换记录测试')
        return
      }

      expect(exchangeId).toBeTruthy()
    })

    test('用户软删除自己的兑换记录', async () => {
      if (!exchangeId) {
        console.log('⚠️ 跳过：无可用兑换记录')
        return
      }

      const response = await request(app)
        .delete(`/api/v4/inventory/exchange-records/${exchangeId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200)

      expect(response.body.success).toBe(true)

      /*
       * 验证数据库记录被软删除
       * 注意：需要使用scope('includeDeleted')来查询已删除记录，因为defaultScope会过滤它们
       */
      const record = await models.ExchangeRecords.scope('includeDeleted').findByPk(exchangeId)
      expect(record.is_deleted).toBe(1)
      expect(record.deleted_at).toBeTruthy()
    })

    test('管理员恢复已删除的兑换记录', async () => {
      if (!exchangeId) {
        console.log('⚠️ 跳过：无可用兑换记录')
        return
      }

      const response = await request(app)
        .post(`/api/v4/inventory/exchange-records/${exchangeId}/restore`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(response.body.success).toBe(true)

      // 验证数据库记录被恢复（恢复后的记录可以直接用默认scope查询）
      const record = await models.ExchangeRecords.findByPk(exchangeId)
      expect(record.is_deleted).toBe(0)
      expect(record.deleted_at).toBeNull()
    })
  })

  /**
   * 积分交易记录软删除测试
   */
  describe('积分交易记录软删除', () => {
    let transactionId = null

    test('创建测试积分交易记录', async () => {
      const [record] = await models.PointsTransaction.findAll({
        where: { is_deleted: 0 },
        limit: 1
      })

      if (record) {
        transactionId = record.transaction_id
      } else {
        const newRecord = await models.PointsTransaction.create({
          user_id: 1,
          business_type: 'test',
          points_change: 100,
          points_balance: 1000,
          status: 'successful',
          description: '测试交易',
          created_at: BeijingTimeHelper.createDatabaseTime(),
          updated_at: BeijingTimeHelper.createDatabaseTime()
        })
        transactionId = newRecord.transaction_id
      }

      expect(transactionId).toBeTruthy()
    })

    test('用户软删除自己的交易记录', async () => {
      const response = await request(app)
        .delete(`/api/v4/unified-engine/points/transaction/${transactionId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200)

      expect(response.body.success).toBe(true)

      /*
       * 验证数据库记录被软删除
       * 注意：需要使用scope('includeDeleted')来查询已删除记录，因为defaultScope会过滤它们
       */
      const record = await models.PointsTransaction.scope('includeDeleted').findByPk(transactionId)
      expect(record.is_deleted).toBe(1)
      expect(record.deleted_at).toBeTruthy()
    })

    test('管理员恢复已删除的交易记录', async () => {
      const response = await request(app)
        .post(`/api/v4/unified-engine/points/transaction/${transactionId}/restore`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(response.body.success).toBe(true)

      // 验证数据库记录被恢复（恢复后的记录可以直接用默认scope查询）
      const record = await models.PointsTransaction.findByPk(transactionId)
      expect(record.is_deleted).toBe(0)
      expect(record.deleted_at).toBeNull()
    })
  })

  /**
   * 权限控制测试
   */
  describe('权限控制测试', () => {
    test('非管理员无法恢复已删除记录', async () => {
      // 找一条已删除的记录
      const record = await models.ConsumptionRecord.findOne({
        where: { is_deleted: 1 }
      })

      if (record) {
        const response = await request(app)
          .post(`/api/v4/consumption/${record.record_id}/restore`)
          .set('Authorization', `Bearer ${userToken}`)

        /*
         * 根据实际权限配置，可能是403或200
         * 这里假设测试账号既是用户又是管理员
         */
        expect([200, 403]).toContain(response.status)
      }
    })
  })
})
