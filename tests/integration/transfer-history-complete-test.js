/**
 * 库存转让历史功能完整测试
 *
 * 测试目标：验证《库存转让历史实施方案》的完整实施情况
 *
 * 测试内容：
 * 1. UserInventory模型字段验证 - last_transfer_at和last_transfer_from
 * 2. TradeRecord模型字段验证 - inventory_transfer类型
 * 3. 转让API功能测试 - POST /api/v4/inventory/transfer
 * 4. 转让历史查询测试 - GET /api/v4/inventory/transfer-history
 * 5. 数据一致性验证 - 转让记录与物品所有权同步
 *
 * 创建时间：2025年11月10日
 * 使用模型：Claude Sonnet 4.5
 */

const request = require('supertest')
const app = require('../../app')
const models = require('../../models')
const BeijingTimeHelper = require('../../utils/timeHelper')

describe('库存转让历史功能完整测试', () => {
  let testUserToken1, testUserToken2
  let testUser1Id, testUser2Id
  let testInventoryId

  // 测试前准备：创建测试用户和测试物品
  beforeAll(async () => {
    try {
      // 1. 创建测试用户1（转让发送方）
      const user1 = await models.User.create({
        mobile: '13800000001',
        nickname: '测试用户1-转让方',
        role_level: 1,
        created_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      })
      testUser1Id = user1.user_id

      // 2. 创建测试用户2（转让接收方）
      const user2 = await models.User.create({
        mobile: '13800000002',
        nickname: '测试用户2-接收方',
        role_level: 1,
        created_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      })
      testUser2Id = user2.user_id

      // 3. 生成JWT Token
      const jwt = require('jsonwebtoken')
      testUserToken1 = jwt.sign({ user_id: testUser1Id, mobile: '13800000001' }, process.env.JWT_SECRET)
      testUserToken2 = jwt.sign({ user_id: testUser2Id, mobile: '13800000002' }, process.env.JWT_SECRET)

      // 4. 创建测试物品（用户1拥有）
      const testItem = await models.UserInventory.create({
        user_id: testUser1Id,
        name: '测试转让物品-100积分优惠券',
        description: '用于测试转让功能的物品',
        type: 'voucher',
        value: 100,
        status: 'available',
        source_type: 'system',
        source_id: 'test_source',
        can_transfer: true,
        transfer_count: 0,
        acquired_at: BeijingTimeHelper.createDatabaseTime(),
        created_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      })
      testInventoryId = testItem.inventory_id

      console.log('✅ 测试数据准备完成')
      console.log(`   测试用户1 ID: ${testUser1Id}`)
      console.log(`   测试用户2 ID: ${testUser2Id}`)
      console.log(`   测试物品 ID: ${testInventoryId}`)
    } catch (error) {
      console.error('❌ 测试数据准备失败:', error.message)
      throw error
    }
  })

  // 测试后清理：删除测试数据
  afterAll(async () => {
    try {
      // 清理测试数据
      await models.TradeRecord.destroy({ where: { item_id: testInventoryId } })
      await models.UserInventory.destroy({ where: { inventory_id: testInventoryId } })
      await models.User.destroy({ where: { user_id: [testUser1Id, testUser2Id] } })
      console.log('✅ 测试数据清理完成')
    } catch (error) {
      console.error('⚠️ 测试数据清理失败:', error.message)
    }
  })

  /*
   * ========================================
   * 测试1: 模型字段验证
   * ========================================
   */
  describe('1. 模型字段验证', () => {
    test('1.1 UserInventory模型应包含last_transfer_at字段', async () => {
      const item = await models.UserInventory.findByPk(testInventoryId)
      expect(item).toBeDefined()
      expect(item).toHaveProperty('last_transfer_at')
    })

    test('1.2 UserInventory模型应包含last_transfer_from字段', async () => {
      const item = await models.UserInventory.findByPk(testInventoryId)
      expect(item).toBeDefined()
      expect(item).toHaveProperty('last_transfer_from')
    })

    test('1.3 UserInventory模型应包含transfer_count字段', async () => {
      const item = await models.UserInventory.findByPk(testInventoryId)
      expect(item).toBeDefined()
      expect(item).toHaveProperty('transfer_count')
      expect(item.transfer_count).toBe(0) // 初始值应为0
    })

    test('1.4 TradeRecord模型应支持inventory_transfer类型', () => {
      const tradeTypeEnum = models.TradeRecord.rawAttributes.trade_type.values
      expect(tradeTypeEnum).toContain('inventory_transfer')
    })

    test('1.5 TradeRecord模型应包含item_id字段', () => {
      expect(models.TradeRecord.rawAttributes).toHaveProperty('item_id')
    })

    test('1.6 TradeRecord模型应包含transfer_note字段', () => {
      expect(models.TradeRecord.rawAttributes).toHaveProperty('transfer_note')
    })
  })

  /*
   * ========================================
   * 测试2: 转让API功能测试
   * ========================================
   */
  describe('2. 转让API功能测试', () => {
    test('2.1 应成功转让物品并更新last_transfer_at和last_transfer_from', async () => {
      const response = await request(app)
        .post('/api/v4/inventory/transfer')
        .set('Authorization', `Bearer ${testUserToken1}`)
        .send({
          item_id: testInventoryId,
          target_user_id: testUser2Id,
          transfer_note: '测试转让功能-验证字段更新'
        })

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data).toHaveProperty('transfer_id')
      expect(response.body.data.transfer_count).toBe(1)

      // 验证物品所有者已更新
      const updatedItem = await models.UserInventory.findByPk(testInventoryId)
      expect(updatedItem.user_id).toBe(testUser2Id)
      expect(updatedItem.transfer_count).toBe(1)

      // ✅ 关键验证：last_transfer_at和last_transfer_from字段已更新
      expect(updatedItem.last_transfer_at).toBeDefined()
      expect(updatedItem.last_transfer_at).not.toBeNull()
      expect(updatedItem.last_transfer_from).toBe(testUser1Id)

      console.log('✅ 转让成功，字段已正确更新:')
      console.log(`   物品所有者: ${testUser1Id} → ${updatedItem.user_id}`)
      console.log(`   转让次数: ${updatedItem.transfer_count}`)
      console.log(`   最后转让时间: ${updatedItem.last_transfer_at}`)
      console.log(`   最后转让来源: ${updatedItem.last_transfer_from}`)
    })

    test('2.2 应在TradeRecord中创建转让记录', async () => {
      const tradeRecord = await models.TradeRecord.findOne({
        where: {
          trade_type: 'inventory_transfer',
          item_id: testInventoryId,
          from_user_id: testUser1Id,
          to_user_id: testUser2Id
        }
      })

      expect(tradeRecord).toBeDefined()
      expect(tradeRecord.trade_type).toBe('inventory_transfer')
      expect(tradeRecord.item_id).toBe(testInventoryId)
      expect(tradeRecord.name).toBe('测试转让物品-100积分优惠券')
      expect(tradeRecord.transfer_note).toBe('测试转让功能-验证字段更新')
      expect(tradeRecord.status).toBe('completed')

      console.log('✅ TradeRecord记录已创建:')
      console.log(`   交易ID: ${tradeRecord.trade_id}`)
      console.log(`   交易类型: ${tradeRecord.trade_type}`)
      console.log(`   物品ID: ${tradeRecord.item_id}`)
      console.log(`   转让备注: ${tradeRecord.transfer_note}`)
    })

    test('2.3 不应允许转让给自己', async () => {
      const response = await request(app)
        .post('/api/v4/inventory/transfer')
        .set('Authorization', `Bearer ${testUserToken2}`)
        .send({
          item_id: testInventoryId,
          target_user_id: testUser2Id,
          transfer_note: '测试-不应成功'
        })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain('不能转让给自己')
    })

    test('2.4 不应允许转让不属于自己的物品', async () => {
      const response = await request(app)
        .post('/api/v4/inventory/transfer')
        .set('Authorization', `Bearer ${testUserToken1}`) // 用户1尝试转让，但物品已属于用户2
        .send({
          item_id: testInventoryId,
          target_user_id: testUser2Id,
          transfer_note: '测试-不应成功'
        })

      expect(response.status).toBe(404)
      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain('库存物品不存在或不可转让')
    })
  })

  /*
   * ========================================
   * 测试3: 转让历史查询API测试
   * ========================================
   */
  describe('3. 转让历史查询API测试', () => {
    test('3.1 应能查询发出的转让记录(type=sent)', async () => {
      const response = await request(app)
        .get('/api/v4/inventory/transfer-history')
        .query({ type: 'sent', page: 1, limit: 20 })
        .set('Authorization', `Bearer ${testUserToken1}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data).toHaveProperty('transfer_history')
      expect(response.body.data).toHaveProperty('pagination')

      const history = response.body.data.transfer_history
      expect(history.length).toBeGreaterThan(0)

      // 验证第一条记录
      const firstRecord = history[0]
      expect(firstRecord).toHaveProperty('transfer_id')
      expect(firstRecord).toHaveProperty('item_id')
      expect(firstRecord).toHaveProperty('name')
      expect(firstRecord).toHaveProperty('from_user_id')
      expect(firstRecord).toHaveProperty('to_user_id')
      expect(firstRecord).toHaveProperty('transfer_note')
      expect(firstRecord).toHaveProperty('direction')
      expect(firstRecord.direction).toBe('sent')

      console.log('✅ 发出的转让记录查询成功:')
      console.log(`   记录数: ${history.length}`)
      console.log(`   第一条记录: ${firstRecord.name}`)
      console.log(`   转让方向: ${firstRecord.direction}`)
    })

    test('3.2 应能查询收到的转让记录(type=received)', async () => {
      const response = await request(app)
        .get('/api/v4/inventory/transfer-history')
        .query({ type: 'received', page: 1, limit: 20 })
        .set('Authorization', `Bearer ${testUserToken2}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data).toHaveProperty('transfer_history')

      const history = response.body.data.transfer_history
      expect(history.length).toBeGreaterThan(0)

      const firstRecord = history[0]
      expect(firstRecord.direction).toBe('received')
      expect(firstRecord.to_user_id).toBe(testUser2Id)

      console.log('✅ 收到的转让记录查询成功:')
      console.log(`   记录数: ${history.length}`)
      console.log(`   转让方向: ${firstRecord.direction}`)
    })

    test('3.3 应能查询全部转让记录(type=all)', async () => {
      const response = await request(app)
        .get('/api/v4/inventory/transfer-history')
        .query({ type: 'all', page: 1, limit: 20 })
        .set('Authorization', `Bearer ${testUserToken1}`)

      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.data).toHaveProperty('transfer_history')

      const history = response.body.data.transfer_history
      expect(history.length).toBeGreaterThan(0)

      console.log('✅ 全部转让记录查询成功:')
      console.log(`   记录数: ${history.length}`)
    })

    test('3.4 转让历史记录应包含用户昵称', async () => {
      const response = await request(app)
        .get('/api/v4/inventory/transfer-history')
        .query({ type: 'all', page: 1, limit: 20 })
        .set('Authorization', `Bearer ${testUserToken1}`)

      expect(response.status).toBe(200)
      const history = response.body.data.transfer_history

      if (history.length > 0) {
        const firstRecord = history[0]
        expect(firstRecord).toHaveProperty('from_user_name')
        expect(firstRecord).toHaveProperty('to_user_name')
        expect(firstRecord.from_user_name).not.toBe('未知用户')
        expect(firstRecord.to_user_name).not.toBe('未知用户')

        console.log('✅ 用户昵称关联成功:')
        console.log(`   转让方: ${firstRecord.from_user_name}`)
        console.log(`   接收方: ${firstRecord.to_user_name}`)
      }
    })

    test('3.5 应支持分页查询', async () => {
      const response = await request(app)
        .get('/api/v4/inventory/transfer-history')
        .query({ type: 'all', page: 1, limit: 5 })
        .set('Authorization', `Bearer ${testUserToken1}`)

      expect(response.status).toBe(200)
      expect(response.body.data.pagination).toHaveProperty('current_page')
      expect(response.body.data.pagination).toHaveProperty('total_pages')
      expect(response.body.data.pagination).toHaveProperty('total_count')
      expect(response.body.data.pagination.current_page).toBe(1)

      console.log('✅ 分页查询成功:')
      console.log(`   当前页: ${response.body.data.pagination.current_page}`)
      console.log(`   总页数: ${response.body.data.pagination.total_pages}`)
      console.log(`   总记录数: ${response.body.data.pagination.total_count}`)
    })
  })

  /*
   * ========================================
   * 测试4: 数据一致性验证
   * ========================================
   */
  describe('4. 数据一致性验证', () => {
    test('4.1 TradeRecord和UserInventory应保持一致', async () => {
      // 查询TradeRecord
      const tradeRecord = await models.TradeRecord.findOne({
        where: {
          trade_type: 'inventory_transfer',
          item_id: testInventoryId
        },
        order: [['created_at', 'DESC']]
      })

      // 查询UserInventory
      const inventoryItem = await models.UserInventory.findByPk(testInventoryId)

      // 验证一致性
      expect(tradeRecord).toBeDefined()
      expect(inventoryItem).toBeDefined()

      // 验证所有者
      expect(inventoryItem.user_id).toBe(tradeRecord.to_user_id)

      // 验证last_transfer_from
      expect(inventoryItem.last_transfer_from).toBe(tradeRecord.from_user_id)

      console.log('✅ 数据一致性验证通过:')
      console.log(`   TradeRecord.to_user_id: ${tradeRecord.to_user_id}`)
      console.log(`   UserInventory.user_id: ${inventoryItem.user_id}`)
      console.log(`   一致性: ${tradeRecord.to_user_id === inventoryItem.user_id ? '✅' : '❌'}`)
    })

    test('4.2 转让次数应正确累加', async () => {
      const item = await models.UserInventory.findByPk(testInventoryId)
      expect(item.transfer_count).toBe(1)

      console.log('✅ 转让次数验证通过:')
      console.log(`   当前转让次数: ${item.transfer_count}`)
    })

    test('4.3 last_transfer_at字段应为有效日期', async () => {
      const item = await models.UserInventory.findByPk(testInventoryId)
      expect(item.last_transfer_at).toBeDefined()
      expect(item.last_transfer_at).not.toBeNull()

      const lastTransferDate = new Date(item.last_transfer_at)
      expect(lastTransferDate).toBeInstanceOf(Date)
      expect(lastTransferDate.getTime()).toBeGreaterThan(0)

      console.log('✅ last_transfer_at字段验证通过:')
      console.log(`   最后转让时间: ${item.last_transfer_at}`)
    })
  })

  /*
   * ========================================
   * 测试5: 边界条件测试
   * ========================================
   */
  describe('5. 边界条件测试', () => {
    test('5.1 应拒绝超过最大转让次数限制的转让', async () => {
      // 更新物品转让次数为3
      await models.UserInventory.update(
        { transfer_count: 3 },
        { where: { inventory_id: testInventoryId } }
      )

      const response = await request(app)
        .post('/api/v4/inventory/transfer')
        .set('Authorization', `Bearer ${testUserToken2}`)
        .send({
          item_id: testInventoryId,
          target_user_id: testUser1Id,
          transfer_note: '测试-不应成功'
        })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain('已达到最大转让次数')

      // 恢复transfer_count
      await models.UserInventory.update(
        { transfer_count: 1 },
        { where: { inventory_id: testInventoryId } }
      )
    })

    test('5.2 应拒绝can_transfer=false的物品转让', async () => {
      // 设置物品不可转让
      await models.UserInventory.update(
        { can_transfer: false },
        { where: { inventory_id: testInventoryId } }
      )

      const response = await request(app)
        .post('/api/v4/inventory/transfer')
        .set('Authorization', `Bearer ${testUserToken2}`)
        .send({
          item_id: testInventoryId,
          target_user_id: testUser1Id,
          transfer_note: '测试-不应成功'
        })

      expect(response.status).toBe(400)
      expect(response.body.success).toBe(false)
      expect(response.body.message).toContain('该物品不支持转让')

      // 恢复can_transfer
      await models.UserInventory.update(
        { can_transfer: true },
        { where: { inventory_id: testInventoryId } }
      )
    })

    test('5.3 分页limit应受最大50条限制', async () => {
      const response = await request(app)
        .get('/api/v4/inventory/transfer-history')
        .query({ type: 'all', page: 1, limit: 100 }) // 尝试请求100条
        .set('Authorization', `Bearer ${testUserToken1}`)

      expect(response.status).toBe(200)
      expect(response.body.data.transfer_history.length).toBeLessThanOrEqual(50)
    })
  })
})


