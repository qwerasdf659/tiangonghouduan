/**
 * 兑换市场幂等性测试套件 (Exchange Market Idempotency Test Suite)
 *
 * V4.5.0 材料资产支付版本
 *
 * 业务场景：测试兑换市场的幂等性保护机制，确保不会产生重复订单
 *
 * P1-1待办任务：兑换市场 `/api/v4/backpack/exchange` 的 business_id 策略
 *
 * 核心功能测试：
 * 1. 强制幂等键验证 - 缺少business_id和Idempotency-Key时返回400
 * 2. 幂等性保护 - 相同business_id重复请求只创建一笔订单
 * 3. 材料资产防重复扣除 - 幂等请求不会重复扣除材料资产
 * 4. 冲突保护 - 同一幂等键但不同参数返回409
 * 5. 外部事务支持 - Service支持外部事务传入
 *
 * 设计原则：
 * - 强制幂等键：必须提供business_id或Idempotency-Key
 * - 缺失即拒绝：两者都未提供时直接返回400
 * - 禁止后端兜底生成：不自动生成business_id
 * - 冲突保护：同一幂等键但参数不同时返回409
 * - 幂等返回：同一幂等键返回原结果（标记is_duplicate）
 *
 * 创建时间：2025年12月18日
 * 更新时间：2025年12月18日 - 重构为材料资产支付
 * 符合规范：docs/架构重构待办清单.md - P1-1
 * 使用模型：Claude Sonnet 4.5
 *
 * P1-9 J2-RepoWide 改造说明：
 * - ExchangeService 通过 ServiceManager 获取（snake_case: exchange_core）
 * - BalanceService 通过 ServiceManager 获取（snake_case: asset）
 * - 模型直接引用用于测试数据准备/验证（业务测试场景合理）
 */

const request = require('supertest')
const {
  sequelize,
  ExchangeItem,
  ExchangeRecord,
  ExchangeOrderEvent,
  Account,
  AccountAssetBalance
} = require('../../../models')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const { generateStandaloneIdempotencyKey } = require('../../../utils/IdempotencyHelper')
// 事务边界治理 - 统一事务管理器
const TransactionManager = require('../../../utils/TransactionManager')

// 🔴 P1-9：通过 ServiceManager 获取服务（替代直接 require）
let ExchangeService
let BalanceService

describe('兑换市场幂等性测试 (Exchange Market Idempotency - V4.5.0 材料资产支付)', () => {
  let app
  let testUser
  let testToken
  let testItem

  /**
   * 测试前置准备
   * 1. 初始化 ServiceManager 并获取服务（P1-9）
   * 2. 初始化app和数据库连接
   * 3. 创建测试用户
   * 4. 创建测试商品（材料资产支付）
   * 5. 初始化测试用户的材料资产账户
   */
  beforeAll(async () => {
    // 🔴 P1-9：通过 ServiceManager 获取服务实例（snake_case key）
    ExchangeService = global.getTestService('exchange_core')
    BalanceService = global.getTestService('asset_balance')

    // 初始化Express应用
    app = require('../../../app')

    // 创建测试用户（使用统一的测试账号）
    const { User } = require('../../../models')
    testUser = await User.findOne({
      where: { mobile: '13612227930' }
    })

    if (!testUser) {
      throw new Error('测试用户不存在，请先创建测试用户：13612227930')
    }

    // 生成测试token
    const jwt = require('jsonwebtoken')
    testToken = jwt.sign(
      {
        user_id: testUser.user_id,
        mobile: testUser.mobile,
        nickname: testUser.nickname
      },
      process.env.JWT_SECRET || 'restaurant_points_lottery_jwt_secret_key_2024',
      { expiresIn: '24h' }
    )

    // 创建测试商品（V4.5.0 材料资产支付）
    testItem = await ExchangeItem.create({
      item_name: '【测试】幂等性测试商品',
      description: '用于测试兑换市场幂等性的测试商品（材料资产支付）',
      cost_asset_code: 'red_shard', // 材料资产代码：红水晶碎片
      cost_amount: 100, // 成本数量：100个红水晶碎片
      cost_price: 50,
      stock: 1000,
      sort_order: 1,
      status: 'active',
      created_at: BeijingTimeHelper.createDatabaseTime(),
      updated_at: BeijingTimeHelper.createDatabaseTime()
    })

    /*
     * 初始化测试用户的材料资产账户（red_shard）
     * 方案B：使用 Account + AccountAssetBalance 模型
     */
    let account = await Account.findOne({
      where: {
        account_type: 'user',
        user_id: testUser.user_id
      }
    })

    if (!account) {
      account = await Account.create({
        account_type: 'user',
        user_id: testUser.user_id,
        status: 'active'
      })
    }

    let assetBalance = await AccountAssetBalance.findOne({
      where: {
        account_id: account.account_id,
        asset_code: 'red_shard'
      }
    })

    if (!assetBalance) {
      assetBalance = await AccountAssetBalance.create({
        account_id: account.account_id,
        asset_code: 'red_shard',
        available_amount: 0,
        frozen_amount: 0
      })
    }

    console.log('✅ 测试环境初始化完成')
    console.log(`   - 测试用户ID: ${testUser.user_id}`)
    console.log(`   - 测试商品ID: ${testItem.exchange_item_id}`)
    console.log(`   - 商品成本: ${testItem.cost_amount} ${testItem.cost_asset_code}`)
  }, 30000)

  /**
   * 每个测试前的准备
   * 确保每个测试开始时都有足够的材料资产
   */
  beforeEach(async () => {
    // 方案B：使用 Account + AccountAssetBalance 模型查询余额
    const account = await Account.findOne({
      where: {
        account_type: 'user',
        user_id: testUser.user_id
      }
    })

    let currentBalance = 0
    if (account) {
      const assetBalance = await AccountAssetBalance.findOne({
        where: {
          account_id: account.account_id,
          asset_code: 'red_shard'
        }
      })
      currentBalance = assetBalance ? Number(assetBalance.available_amount) : 0
    }

    console.log(`🔍 测试前检查材料资产余额: ${currentBalance} red_shard`)

    // 如果余额不足1000，充值到1000
    if (currentBalance < 1000) {
      console.log(`⚠️ 材料资产不足(${currentBalance} < 1000)，充值到1000`)

      // 事务边界治理：使用 TransactionManager 包裹 BalanceService 调用
      await TransactionManager.execute(
        async transaction => {
          await BalanceService.changeBalance(
            {
              user_id: testUser.user_id,
              asset_code: 'red_shard',
              delta_amount: 1000 - currentBalance,
              business_type: 'test_recharge',
              counterpart_account_id: 2,
              idempotency_key: generateStandaloneIdempotencyKey('test_recharge', testUser.user_id),
              meta: { description: '测试充值' }
            },
            { transaction }
          )
        },
        { description: 'test_recharge_asset' }
      )

      console.log(`✅ 已充值 ${1000 - currentBalance} red_shard`)
    } else {
      console.log(`✅ 材料资产充足(${currentBalance})，无需充值`)
    }
  })

  /**
   * 测试后清理
   * 删除测试创建的数据
   */
  afterAll(async () => {
    if (testItem) {
      // 先删除事件记录（外键依赖 exchange_records.order_no）
      const records = await ExchangeRecord.findAll({
        where: { exchange_item_id: testItem.exchange_item_id },
        attributes: ['order_no']
      })
      const orderNos = records.map(r => r.order_no)
      if (orderNos.length > 0) {
        await ExchangeOrderEvent.destroy({ where: { order_no: orderNos } })
      }
      await ExchangeRecord.destroy({
        where: { exchange_item_id: testItem.exchange_item_id }
      })
      await testItem.destroy()
    }

    console.log('✅ 测试数据清理完成')
  }, 30000)

  /**
   * 测试1：强制幂等键验证
   * 验证：缺少 Idempotency-Key Header 时返回400错误
   * 业界标准形态（2026-01-02）：只接受 Header Idempotency-Key，不接受 body 中的 business_id
   */
  describe('P1-1-1: 强制幂等键验证', () => {
    test('缺少 Idempotency-Key Header 时应返回400', async () => {
      const response = await request(app)
        .post('/api/v4/backpack/exchange')
        .set('Authorization', `Bearer ${testToken}`)
        .send({
          exchange_item_id: testItem.exchange_item_id,
          quantity: 1
          // 🔴 故意不提供 Idempotency-Key Header
        })
        .expect(400)

      expect(response.body).toMatchObject({
        success: false,
        code: 'MISSING_IDEMPOTENCY_KEY'
      })

      expect(response.body.message).toContain('幂等键')
      expect(response.body.message).toContain('Idempotency-Key')

      console.log('✅ 强制幂等键验证通过：缺失时正确拒绝')
    })

    test('通过 Header Idempotency-Key 提供幂等键应正常处理', async () => {
      const idempotencyKey = `test_idempotency_header_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`

      const response = await request(app)
        .post('/api/v4/backpack/exchange')
        .set('Authorization', `Bearer ${testToken}`)
        .set('Idempotency-Key', idempotencyKey) // ✅ 通过Header提供Idempotency-Key
        .send({
          exchange_item_id: testItem.exchange_item_id,
          quantity: 1
        })
        .expect(200)

      expect(response.body).toMatchObject({
        success: true,
        data: {
          order: expect.objectContaining({
            order_no: expect.any(String),
            status: 'pending'
          })
        }
      })

      console.log('✅ Header Idempotency-Key 验证通过')
      console.log(`   - idempotency_key: ${idempotencyKey}`)
      console.log(`   - order_no: ${response.body.data.order.order_no}`)
    })
  })

  /**
   * 测试2：幂等性保护
   * 验证：相同 Idempotency-Key 重复请求只创建一笔订单
   * 业界标准形态：统一使用 Header Idempotency-Key
   */
  describe('P1-1-2: 幂等性保护（相同Idempotency-Key只创建一笔订单）', () => {
    test('相同 Idempotency-Key 重复请求应返回相同结果', async () => {
      const idempotencyKey = `test_same_key_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`

      // 第一次请求
      const response1 = await request(app)
        .post('/api/v4/backpack/exchange')
        .set('Authorization', `Bearer ${testToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          exchange_item_id: testItem.exchange_item_id,
          quantity: 1
        })
        .expect(200)

      expect(response1.body.success).toBe(true)
      expect(response1.body.data.is_duplicate).toBe(false) // 首次请求 is_duplicate 应为 false
      const firstOrderNo = response1.body.data.order.order_no

      console.log('✅ 第一次请求成功')
      console.log(`   - order_no: ${firstOrderNo}`)
      console.log(`   - is_duplicate: ${response1.body.data.is_duplicate || false}`)

      // 第二次请求（相同 Idempotency-Key）
      const response2 = await request(app)
        .post('/api/v4/backpack/exchange')
        .set('Authorization', `Bearer ${testToken}`)
        .set('Idempotency-Key', idempotencyKey) // 🔄 相同的 Idempotency-Key
        .send({
          exchange_item_id: testItem.exchange_item_id,
          quantity: 1
        })
        .expect(200)

      expect(response2.body.success).toBe(true)
      expect(response2.body.data.is_duplicate).toBe(true) // ✅ 应该标记为重复请求
      expect(response2.body.data.order.order_no).toBe(firstOrderNo) // ✅ 应该返回相同的订单号

      console.log('✅ 第二次请求成功（幂等返回）')
      console.log(`   - order_no: ${response2.body.data.order.order_no}`)
      console.log(`   - is_duplicate: ${response2.body.data.is_duplicate}`)
      console.log(`   - 订单号匹配: ${response2.body.data.order.order_no === firstOrderNo}`)

      // 验证数据库中只有一条订单记录
      const orderCount = await ExchangeRecord.count({
        where: { idempotency_key: idempotencyKey }
      })

      expect(orderCount).toBe(1) // ✅ 数据库中只有一条记录

      console.log('✅ 幂等性验证通过：数据库中只有1条记录')
    })

    test('材料资产应该只扣除一次', async () => {
      const idempotencyKey = `test_asset_deduct_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`

      // 获取初始材料资产余额（使用新模型结构 Account + AccountAssetBalance）
      const accountBefore = await Account.findOne({
        where: { user_id: testUser.user_id, account_type: 'user' }
      })
      const assetBalanceBefore = await AccountAssetBalance.findOne({
        where: { account_id: accountBefore.account_id, asset_code: 'red_shard' }
      })
      const balanceBefore = Number(assetBalanceBefore.available_amount)
      console.log(`🔍 初始材料资产余额: ${balanceBefore} red_shard`)

      // 第一次兑换
      const response1 = await request(app)
        .post('/api/v4/backpack/exchange')
        .set('Authorization', `Bearer ${testToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          exchange_item_id: testItem.exchange_item_id,
          quantity: 1
        })
        .expect(200)

      // 查询第一次兑换后的余额
      const assetBalanceAfterFirst = await AccountAssetBalance.findOne({
        where: { account_id: accountBefore.account_id, asset_code: 'red_shard' }
      })
      const balanceAfterFirst = Number(assetBalanceAfterFirst.available_amount)
      const deducted = balanceBefore - balanceAfterFirst

      console.log(`✅ 第一次兑换完成，扣除材料资产: ${deducted} red_shard`)
      console.log(`   - order_no: ${response1.body.data.order.order_no}`)
      expect(deducted).toBe(testItem.cost_amount) // 应该扣除商品成本

      // 第二次兑换（相同 Idempotency-Key）
      const response2 = await request(app)
        .post('/api/v4/backpack/exchange')
        .set('Authorization', `Bearer ${testToken}`)
        .set('Idempotency-Key', idempotencyKey) // 🔄 相同的 Idempotency-Key
        .send({
          exchange_item_id: testItem.exchange_item_id,
          quantity: 1
        })
        .expect(200)

      // 查询第二次兑换后的余额
      const assetBalanceAfterSecond = await AccountAssetBalance.findOne({
        where: { account_id: accountBefore.account_id, asset_code: 'red_shard' }
      })
      const balanceAfterSecond = Number(assetBalanceAfterSecond.available_amount)

      console.log('✅ 第二次兑换完成（幂等）')
      expect(balanceAfterSecond).toBe(balanceAfterFirst) // ✅ 材料资产不应该再次扣除
      expect(response2.body.data.is_duplicate).toBe(true)

      console.log('✅ 材料资产防重复扣除验证通过')
      console.log(`   - 扣除前: ${balanceBefore}`)
      console.log(`   - 第一次后: ${balanceAfterFirst}`)
      console.log(`   - 第二次后: ${balanceAfterSecond}`)
      console.log(`   - 只扣除一次: ${balanceAfterSecond === balanceAfterFirst}`)
    })
  })

  /**
   * 测试3：冲突保护
   * 验证：同一幂等键但不同参数时返回409错误
   */
  describe('P1-1-3: 冲突保护（同一幂等键但不同参数返回409）', () => {
    test('同一 Idempotency-Key 但不同 exchange_item_id 应返回409', async () => {
      const idempotencyKey = `test_conflict_item_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`

      // 第一次请求
      const response1 = await request(app)
        .post('/api/v4/backpack/exchange')
        .set('Authorization', `Bearer ${testToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          exchange_item_id: testItem.exchange_item_id,
          quantity: 1
        })
        .expect(200)

      console.log('✅ 第一次请求成功')
      console.log(`   - exchange_item_id: ${testItem.exchange_item_id}`)
      console.log(`   - order_no: ${response1.body.data.order.order_no}`)

      // 创建另一个测试商品
      const anotherItem = await ExchangeItem.create({
        item_name: '【测试】另一个商品',
        description: '用于测试冲突保护',
        cost_asset_code: 'red_shard',
        cost_amount: 100,
        cost_price: 50,
        stock: 1000,
        sort_order: 1,
        status: 'active',
        created_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      })

      // 第二次请求（相同 Idempotency-Key，但不同 exchange_item_id）
      const response2 = await request(app)
        .post('/api/v4/backpack/exchange')
        .set('Authorization', `Bearer ${testToken}`)
        .set('Idempotency-Key', idempotencyKey) // 🔄 相同的 Idempotency-Key
        .send({
          exchange_item_id: anotherItem.exchange_item_id, // 🔴 不同的exchange_item_id
          quantity: 1
        })
        .expect(409) // ✅ 应该返回409冲突

      expect(response2.body.success).toBe(false)
      expect(response2.body.message).toContain('幂等')

      console.log('✅ 冲突保护验证通过：不同exchange_item_id返回409')
      console.log(`   - 错误码: ${response2.body.code}`)
      console.log(`   - 错误信息: ${response2.body.message}`)

      // 清理测试数据
      await anotherItem.destroy()
    })

    test('同一 Idempotency-Key 但不同 quantity 应返回409', async () => {
      const idempotencyKey = `test_conflict_quantity_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`

      // 第一次请求
      const response1 = await request(app)
        .post('/api/v4/backpack/exchange')
        .set('Authorization', `Bearer ${testToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          exchange_item_id: testItem.exchange_item_id,
          quantity: 1
        })
        .expect(200)

      console.log('✅ 第一次请求成功')
      console.log('   - quantity: 1')
      console.log(`   - order_no: ${response1.body.data.order.order_no}`)

      // 第二次请求（相同 Idempotency-Key，但不同 quantity）
      const response2 = await request(app)
        .post('/api/v4/backpack/exchange')
        .set('Authorization', `Bearer ${testToken}`)
        .set('Idempotency-Key', idempotencyKey) // 🔄 相同的 Idempotency-Key
        .send({
          exchange_item_id: testItem.exchange_item_id,
          quantity: 2 // 🔴 不同的quantity
        })
        .expect(409) // ✅ 应该返回409冲突

      expect(response2.body.success).toBe(false)
      expect(response2.body.message).toContain('幂等')

      console.log('✅ 冲突保护验证通过：不同quantity返回409')
    })
  })

  /**
   * 测试4：外部事务支持
   * 验证：Service支持外部事务传入，不会二次commit
   */
  describe('P1-1-4: 外部事务支持', () => {
    test('Service应支持外部事务传入', async () => {
      const idempotencyKey = `test_external_transaction_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`

      // 创建外部事务
      const externalTransaction = await sequelize.transaction()

      try {
        console.log('🔄 创建外部事务')

        // 调用Service时传入外部事务
        const result = await ExchangeService.exchangeItem(
          testUser.user_id,
          testItem.exchange_item_id,
          1,
          {
            idempotency_key: idempotencyKey,
            transaction: externalTransaction // ✅ 传入外部事务
          }
        )

        expect(result.success).toBe(true)
        expect(result.order.order_no).toBeDefined()

        console.log('✅ Service成功使用外部事务')
        console.log(`   - order_no: ${result.order.order_no}`)

        // 手动提交外部事务
        await externalTransaction.commit()
        console.log('✅ 外部事务手动提交成功')

        // 验证订单已创建
        const order = await ExchangeRecord.findOne({
          where: { idempotency_key: idempotencyKey }
        })

        expect(order).not.toBeNull()
        expect(order.order_no).toBe(result.order.order_no)

        console.log('✅ 订单已正确创建（事务已提交）')
      } catch (error) {
        // 回滚外部事务
        if (!externalTransaction.finished) {
          await externalTransaction.rollback()
        }
        throw error
      }
    })

    test('Service不应该二次commit外部事务', async () => {
      const idempotencyKey = `test_no_double_commit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`

      // 创建外部事务
      const externalTransaction = await sequelize.transaction()

      try {
        // 调用Service
        await ExchangeService.exchangeItem(testUser.user_id, testItem.exchange_item_id, 1, {
          idempotency_key: idempotencyKey,
          transaction: externalTransaction
        })

        /*
         * 🔴 验证外部事务仍未完成（通过尝试commit来验证）
         * 如果Service已经commit，这里会抛出错误
         */
        let canCommit = false
        try {
          await externalTransaction.commit()
          canCommit = true
          console.log('✅ Service未提交外部事务（正确行为）')
        } catch (error) {
          // 如果这里捕获到错误，说明Service错误地提交了事务
          console.error('❌ Service错误地提交了外部事务:', error.message)
          throw new Error('Service不应该提交外部事务')
        }

        expect(canCommit).toBe(true)
      } catch (error) {
        // 只在需要时回滚（避免二次回滚错误）
        try {
          await externalTransaction.rollback()
        } catch (rollbackError) {
          // 忽略已完成事务的回滚错误
        }
        throw error
      }
    })
  })

  /**
   * 测试5：并发幂等性保护
   * 验证：高并发下相同 Idempotency-Key 只创建一笔订单
   *
   * 业务场景说明：
   * - 并发请求同一幂等键时，只有一个请求能获得锁并处理
   * - 其他请求会收到 409（REQUEST_PROCESSING - 请求正在处理中）
   * - 或者在首次请求完成后收到 200 + is_duplicate=true（幂等返回）
   * - 核心保证：数据库中只创建一条订单记录
   */
  describe('P1-1-5: 并发幂等性保护', () => {
    test('并发请求相同 Idempotency-Key 应只创建一笔订单', async () => {
      const idempotencyKey = `test_concurrent_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`

      console.log('🔄 开始并发幂等性测试（5个并发请求）')

      // 并发发送5个相同的请求
      const promises = Array.from({ length: 5 }, () =>
        request(app)
          .post('/api/v4/backpack/exchange')
          .set('Authorization', `Bearer ${testToken}`)
          .set('Idempotency-Key', idempotencyKey) // 🔄 相同的 Idempotency-Key
          .send({
            exchange_item_id: testItem.exchange_item_id,
            quantity: 1
          })
      )

      const responses = await Promise.all(promises)

      // 统计响应结果
      let successCount = 0 // 200 成功
      let processingCount = 0 // 409 正在处理中

      responses.forEach((response, index) => {
        if (response.status === 200) {
          successCount++
          console.log(
            `   - 请求${index + 1}: 200 ${response.body.data.is_duplicate ? '(幂等返回)' : '(首次创建)'}`
          )
        } else if (response.status === 409) {
          processingCount++
          console.log(`   - 请求${index + 1}: 409 (正在处理中)`)
        } else {
          console.log(`   - 请求${index + 1}: ${response.status} (异常)`)
        }
      })

      /*
       * 业务验证：
       * 1. 至少有一个请求成功（200）
       */
      expect(successCount).toBeGreaterThanOrEqual(1)

      // 2. 所有响应要么是 200（成功/幂等返回），要么是 409（正在处理中）
      expect(successCount + processingCount).toBe(responses.length)

      // 3. 数据库中只有一条订单记录（核心保证）
      const orderCount = await ExchangeRecord.count({
        where: { idempotency_key: idempotencyKey }
      })

      expect(orderCount).toBe(1) // ✅ 只有一条记录

      console.log('✅ 并发幂等性保护验证通过')
      console.log(`   - 并发请求数: ${responses.length}`)
      console.log(`   - 成功响应: ${successCount}`)
      console.log(`   - 处理中响应: ${processingCount}`)
      console.log(`   - 数据库订单数: ${orderCount}`)
    })
  })
})
