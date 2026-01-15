/**
 * 交易市场风控中间件测试（market_risk_control_middleware.test.js）
 *
 * 测试范围：
 * - Redis 计数器预占用 / 回滚
 * - fail-closed 策略验证
 * - 日限次 / 日限额生效
 *
 * 业务决策（2026-01-14 多币种扩展）：
 * - 挂牌统计维度：卖家 + 定价币种
 * - 购买统计维度：买家 + 支付币种
 * - fail-closed：Redis 不可用时拒绝挂牌/购买，但允许撤回/取消
 *
 * @module tests/middleware/market_risk_control_middleware.test.js
 * @date 2026-01-14
 */

const {
  MarketRiskControlMiddleware,
  getMarketRiskControlMiddleware,
  generateRedisKey,
  REDIS_KEY_PREFIX,
  COUNTER_TTL_SECONDS
} = require('../../middleware/MarketRiskControlMiddleware')
const { isRedisHealthy, getRedisClient } = require('../../utils/UnifiedRedisClient')
const BeijingTimeHelper = require('../../utils/timeHelper')

describe('MarketRiskControlMiddleware - 交易市场风控中间件测试', () => {
  let middlewareInstance = null
  let redisClient = null
  const testUserId = 99999 // 使用特殊测试用户ID避免影响真实数据
  const testAssetCode = 'DIAMOND'

  beforeAll(async () => {
    // 获取中间件单例
    middlewareInstance = getMarketRiskControlMiddleware()

    // 获取 Redis 客户端用于测试前后的数据清理
    try {
      const clientWrapper = getRedisClient()
      redisClient = await clientWrapper.ensureConnection()
    } catch (error) {
      console.warn('[Test Setup] Redis 连接失败，部分测试将被跳过:', error.message)
    }
  })

  afterAll(async () => {
    // 清理测试数据
    if (redisClient) {
      try {
        // 清理所有测试用户的 Redis key
        const dateStr = BeijingTimeHelper.formatDate(new Date(), 'YYYY-MM-DD')
        const metrics = ['listings', 'trades', 'amount']
        const assetCodes = ['DIAMOND', 'red_shard']

        for (const metric of metrics) {
          for (const assetCode of assetCodes) {
            const key = generateRedisKey(testUserId, assetCode, metric, dateStr)
            await redisClient.del(key)
          }
        }
      } catch (cleanupError) {
        console.warn('[Test Cleanup] 清理 Redis 测试数据失败:', cleanupError.message)
      }
    }
  })

  beforeEach(async () => {
    // 每个测试前清理测试用户的计数器
    if (redisClient) {
      const dateStr = BeijingTimeHelper.formatDate(new Date(), 'YYYY-MM-DD')
      const key = generateRedisKey(testUserId, testAssetCode, 'listings', dateStr)
      await redisClient.del(key)
    }
  })

  /*
   * ========================================
   * 测试组1：Redis Key 生成规则验证
   * ========================================
   */
  describe('Redis Key 生成规则验证', () => {
    test('generateRedisKey - 正确生成 Redis Key', () => {
      const key = generateRedisKey(123, 'DIAMOND', 'listings', '2026-01-14')

      expect(key).toBe('market_risk:123:DIAMOND:2026-01-14:listings')
      expect(key.startsWith(REDIS_KEY_PREFIX)).toBe(true)
    })

    test('generateRedisKey - 不传日期时使用今天（北京时间）', () => {
      const key = generateRedisKey(456, 'red_shard', 'trades')
      const todayBeijing = BeijingTimeHelper.formatDate(new Date(), 'YYYY-MM-DD')

      expect(key).toBe(`market_risk:456:red_shard:${todayBeijing}:trades`)
    })

    test('generateRedisKey - 支持不同指标类型', () => {
      const listingsKey = generateRedisKey(100, 'DIAMOND', 'listings')
      const tradesKey = generateRedisKey(100, 'DIAMOND', 'trades')
      const amountKey = generateRedisKey(100, 'DIAMOND', 'amount')

      expect(listingsKey).toContain(':listings')
      expect(tradesKey).toContain(':trades')
      expect(amountKey).toContain(':amount')

      // 三个 key 应该不同
      expect(new Set([listingsKey, tradesKey, amountKey]).size).toBe(3)
    })

    test('COUNTER_TTL_SECONDS - 计数器 TTL 为 48 小时', () => {
      expect(COUNTER_TTL_SECONDS).toBe(48 * 60 * 60)
    })
  })

  /*
   * ========================================
   * 测试组2：预占用 / 回滚机制测试
   * ========================================
   */
  describe('预占用 / 回滚机制测试', () => {
    test('preOccupy - 预占用计数器成功', async () => {
      if (!redisClient) {
        console.log('⏭️ 跳过测试：Redis 不可用')
        return
      }

      const result = await middlewareInstance.preOccupy(testUserId, testAssetCode, 'listings', 1)

      expect(result.success).toBe(true)
      expect(result.new_value).toBe(1)
      expect(result.key).toContain(String(testUserId))
      expect(result.increment).toBe(1)
    })

    test('preOccupy - 连续预占用累加', async () => {
      if (!redisClient) {
        console.log('⏭️ 跳过测试：Redis 不可用')
        return
      }

      // 预占用 3 次
      const result1 = await middlewareInstance.preOccupy(testUserId, testAssetCode, 'listings', 1)
      const result2 = await middlewareInstance.preOccupy(testUserId, testAssetCode, 'listings', 1)
      const result3 = await middlewareInstance.preOccupy(testUserId, testAssetCode, 'listings', 1)

      expect(result1.new_value).toBe(1)
      expect(result2.new_value).toBe(2)
      expect(result3.new_value).toBe(3)
    })

    test('preOccupy - 支持自定义增量（金额场景）', async () => {
      if (!redisClient) {
        console.log('⏭️ 跳过测试：Redis 不可用')
        return
      }

      // 先清理
      const dateStr = BeijingTimeHelper.formatDate(new Date(), 'YYYY-MM-DD')
      const key = generateRedisKey(testUserId, testAssetCode, 'amount', dateStr)
      await redisClient.del(key)

      // 预占用 500 额度
      const result = await middlewareInstance.preOccupy(testUserId, testAssetCode, 'amount', 500)

      expect(result.success).toBe(true)
      expect(result.new_value).toBe(500)
      expect(result.increment).toBe(500)
    })

    test('rollback - 回滚计数器成功', async () => {
      if (!redisClient) {
        console.log('⏭️ 跳过测试：Redis 不可用')
        return
      }

      // 先预占用 5 次
      for (let i = 0; i < 5; i++) {
        await middlewareInstance.preOccupy(testUserId, testAssetCode, 'listings', 1)
      }

      // 回滚 2 次
      const rollbackResult = await middlewareInstance.rollback(
        testUserId,
        testAssetCode,
        'listings',
        2
      )

      expect(rollbackResult.success).toBe(true)
      expect(rollbackResult.new_value).toBe(3) // 5 - 2 = 3

      // 验证当前值
      const currentCount = await middlewareInstance.getCurrentCount(
        testUserId,
        testAssetCode,
        'listings'
      )
      expect(currentCount).toBe(3)
    })

    test('getCurrentCount - 获取当前计数器值', async () => {
      if (!redisClient) {
        console.log('⏭️ 跳过测试：Redis 不可用')
        return
      }

      // 先清理再预占用
      const dateStr = BeijingTimeHelper.formatDate(new Date(), 'YYYY-MM-DD')
      const key = generateRedisKey(testUserId, 'red_shard', 'listings', dateStr)
      await redisClient.del(key)

      await middlewareInstance.preOccupy(testUserId, 'red_shard', 'listings', 1)
      await middlewareInstance.preOccupy(testUserId, 'red_shard', 'listings', 1)

      const count = await middlewareInstance.getCurrentCount(testUserId, 'red_shard', 'listings')
      expect(count).toBe(2)
    })

    test('getCurrentCount - 不存在的 key 返回 0', async () => {
      if (!redisClient) {
        console.log('⏭️ 跳过测试：Redis 不可用')
        return
      }

      const count = await middlewareInstance.getCurrentCount(88888, 'NONEXISTENT', 'listings')
      expect(count).toBe(0)
    })
  })

  /*
   * ========================================
   * 测试组3：getUserRiskCounters 综合查询测试
   * ========================================
   */
  describe('getUserRiskCounters 综合查询测试', () => {
    test('getUserRiskCounters - 获取指定币种的所有计数器', async () => {
      if (!redisClient) {
        console.log('⏭️ 跳过测试：Redis 不可用')
        return
      }

      // 清理并设置测试数据
      const dateStr = BeijingTimeHelper.formatDate(new Date(), 'YYYY-MM-DD')
      await redisClient.del(generateRedisKey(testUserId, testAssetCode, 'listings', dateStr))
      await redisClient.del(generateRedisKey(testUserId, testAssetCode, 'trades', dateStr))
      await redisClient.del(generateRedisKey(testUserId, testAssetCode, 'amount', dateStr))

      await middlewareInstance.preOccupy(testUserId, testAssetCode, 'listings', 3)
      await middlewareInstance.preOccupy(testUserId, testAssetCode, 'trades', 2)
      await middlewareInstance.preOccupy(testUserId, testAssetCode, 'amount', 1500)

      const counters = await middlewareInstance.getUserRiskCounters(testUserId, testAssetCode)

      expect(counters.user_id).toBe(testUserId)
      expect(counters.asset_code).toBe(testAssetCode)
      expect(counters.counters.listings).toBe(3)
      expect(counters.counters.trades).toBe(2)
      expect(counters.counters.amount).toBe(1500)
    })

    test('getUserRiskCounters - 获取所有币种的计数器（不传 assetCode）', async () => {
      if (!redisClient) {
        console.log('⏭️ 跳过测试：Redis 不可用')
        return
      }

      // 清理并设置测试数据
      const dateStr = BeijingTimeHelper.formatDate(new Date(), 'YYYY-MM-DD')
      await redisClient.del(generateRedisKey(testUserId, 'DIAMOND', 'listings', dateStr))
      await redisClient.del(generateRedisKey(testUserId, 'red_shard', 'listings', dateStr))

      await middlewareInstance.preOccupy(testUserId, 'DIAMOND', 'listings', 5)
      await middlewareInstance.preOccupy(testUserId, 'red_shard', 'listings', 3)

      const counters = await middlewareInstance.getUserRiskCounters(testUserId, null)

      expect(counters.user_id).toBe(testUserId)
      expect(counters.asset_code).toBeNull() // 未指定币种
      expect(counters.counters.listings.DIAMOND).toBe(5)
      expect(counters.counters.listings.red_shard).toBe(3)
    })
  })

  /*
   * ========================================
   * 测试组4：中间件工厂方法测试
   * ========================================
   */
  describe('中间件工厂方法测试', () => {
    test('createListingRiskMiddleware - 返回函数', () => {
      const middleware = middlewareInstance.createListingRiskMiddleware()
      expect(typeof middleware).toBe('function')
    })

    test('createBuyRiskMiddleware - 返回函数', () => {
      const middleware = middlewareInstance.createBuyRiskMiddleware()
      expect(typeof middleware).toBe('function')
    })

    test('createWithdrawRiskMiddleware - 返回函数', () => {
      const middleware = middlewareInstance.createWithdrawRiskMiddleware()
      expect(typeof middleware).toBe('function')
    })

    test('getMarketRiskControlMiddleware - 返回单例', () => {
      const instance1 = getMarketRiskControlMiddleware()
      const instance2 = getMarketRiskControlMiddleware()

      expect(instance1).toBe(instance2) // 同一个实例
      expect(instance1).toBeInstanceOf(MarketRiskControlMiddleware)
    })
  })

  /*
   * ========================================
   * 测试组5：fail-closed 策略验证
   * ========================================
   *
   * 业务决策（2026-01-14）：
   * - 挂牌、购买操作：Redis 不可用时拒绝（503）
   * - 撤回、取消操作：Redis 不可用时放行（用户资产优先）
   */
  describe('fail-closed 策略验证', () => {
    test('Redis 健康检查 - 正常情况', async () => {
      const healthy = await isRedisHealthy()
      // 如果 Redis 配置正确，应该返回 true
      expect(typeof healthy).toBe('boolean')
      if (redisClient) {
        expect(healthy).toBe(true)
      }
    })

    test('挂牌中间件 - 未登录时返回 401', async () => {
      const middleware = middlewareInstance.createListingRiskMiddleware()

      const req = { user: null, body: {} }
      const res = {
        apiError: jest.fn().mockReturnValue('error_response')
      }
      const next = jest.fn()

      await middleware(req, res, next)

      expect(res.apiError).toHaveBeenCalledWith('请先登录', 'UNAUTHORIZED', null, 401)
      expect(next).not.toHaveBeenCalled()
    })

    test('购买中间件 - 未登录时返回 401', async () => {
      const middleware = middlewareInstance.createBuyRiskMiddleware()

      const req = { user: null }
      const res = {
        apiError: jest.fn().mockReturnValue('error_response')
      }
      const next = jest.fn()

      await middleware(req, res, next)

      expect(res.apiError).toHaveBeenCalledWith('请先登录', 'UNAUTHORIZED', null, 401)
      expect(next).not.toHaveBeenCalled()
    })

    test('撤回中间件 - 未登录时返回 401', async () => {
      const middleware = middlewareInstance.createWithdrawRiskMiddleware()

      const req = { user: null }
      const res = {
        apiError: jest.fn().mockReturnValue('error_response')
      }
      const next = jest.fn()

      await middleware(req, res, next)

      expect(res.apiError).toHaveBeenCalledWith('请先登录', 'UNAUTHORIZED', null, 401)
      expect(next).not.toHaveBeenCalled()
    })

    test('挂牌中间件 - 登录用户正常通过', async () => {
      if (!redisClient) {
        console.log('⏭️ 跳过测试：Redis 不可用')
        return
      }

      const middleware = middlewareInstance.createListingRiskMiddleware()

      const req = {
        user: { user_id: testUserId },
        body: { price_asset_code: 'DIAMOND' },
        path: '/api/v4/market/listings'
      }
      const res = {
        apiError: jest.fn()
      }
      const next = jest.fn()

      await middleware(req, res, next)

      expect(next).toHaveBeenCalled()
      expect(res.apiError).not.toHaveBeenCalled()

      // 验证 riskContext 注入
      expect(req.riskContext).toBeDefined()
      expect(req.riskContext.user_id).toBe(testUserId)
      expect(req.riskContext.price_asset_code).toBe('DIAMOND')
      expect(req.riskContext.redis_healthy).toBe(true)
    })

    test('撤回中间件 - Redis 不可用时仍然放行', async () => {
      const middleware = middlewareInstance.createWithdrawRiskMiddleware()

      const req = {
        user: { user_id: testUserId },
        path: '/api/v4/market/listings/123/withdraw'
      }
      const res = {
        apiError: jest.fn()
      }
      const next = jest.fn()

      await middleware(req, res, next)

      // 无论 Redis 是否可用，撤回操作都应该放行
      expect(next).toHaveBeenCalled()
      expect(res.apiError).not.toHaveBeenCalled()

      // 验证 riskContext 标记跳过风控检查
      expect(req.riskContext).toBeDefined()
      expect(req.riskContext.skip_risk_check).toBe(true)
    })
  })

  /*
   * ========================================
   * 测试组6：日限次 / 日限额业务场景测试
   * ========================================
   *
   * 业务决策（2026-01-14）：
   * - 日限次重置时间：北京时间 00:00:00
   * - 统计维度：用户 + 币种
   * - 默认阈值：listings=20, trades=10, amount=100000
   */
  describe('日限次 / 日限额业务场景测试', () => {
    test('不同用户的计数器相互独立', async () => {
      if (!redisClient) {
        console.log('⏭️ 跳过测试：Redis 不可用')
        return
      }

      const userId1 = 88881
      const userId2 = 88882
      const dateStr = BeijingTimeHelper.formatDate(new Date(), 'YYYY-MM-DD')

      // 清理
      await redisClient.del(generateRedisKey(userId1, testAssetCode, 'listings', dateStr))
      await redisClient.del(generateRedisKey(userId2, testAssetCode, 'listings', dateStr))

      // 用户1 挂牌 5 次
      for (let i = 0; i < 5; i++) {
        await middlewareInstance.preOccupy(userId1, testAssetCode, 'listings', 1)
      }

      // 用户2 挂牌 3 次
      for (let i = 0; i < 3; i++) {
        await middlewareInstance.preOccupy(userId2, testAssetCode, 'listings', 1)
      }

      const count1 = await middlewareInstance.getCurrentCount(userId1, testAssetCode, 'listings')
      const count2 = await middlewareInstance.getCurrentCount(userId2, testAssetCode, 'listings')

      expect(count1).toBe(5)
      expect(count2).toBe(3)
    })

    test('同一用户不同币种的计数器相互独立', async () => {
      if (!redisClient) {
        console.log('⏭️ 跳过测试：Redis 不可用')
        return
      }

      const userId = 88883
      const dateStr = BeijingTimeHelper.formatDate(new Date(), 'YYYY-MM-DD')

      // 清理
      await redisClient.del(generateRedisKey(userId, 'DIAMOND', 'listings', dateStr))
      await redisClient.del(generateRedisKey(userId, 'red_shard', 'listings', dateStr))

      // DIAMOND 挂牌 10 次
      for (let i = 0; i < 10; i++) {
        await middlewareInstance.preOccupy(userId, 'DIAMOND', 'listings', 1)
      }

      // red_shard 挂牌 7 次
      for (let i = 0; i < 7; i++) {
        await middlewareInstance.preOccupy(userId, 'red_shard', 'listings', 1)
      }

      const diamondCount = await middlewareInstance.getCurrentCount(userId, 'DIAMOND', 'listings')
      const redShardCount = await middlewareInstance.getCurrentCount(
        userId,
        'red_shard',
        'listings'
      )

      expect(diamondCount).toBe(10)
      expect(redShardCount).toBe(7)
    })

    test('不同日期的计数器相互独立', async () => {
      if (!redisClient) {
        console.log('⏭️ 跳过测试：Redis 不可用')
        return
      }

      const userId = 88884

      // 设置今天的计数
      const todayKey = generateRedisKey(userId, testAssetCode, 'listings')
      await redisClient.set(todayKey, '15')
      await redisClient.expire(todayKey, COUNTER_TTL_SECONDS)

      // 设置昨天的计数
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = yesterday.toISOString().slice(0, 10)
      const yesterdayKey = generateRedisKey(userId, testAssetCode, 'listings', yesterdayStr)
      await redisClient.set(yesterdayKey, '20')
      await redisClient.expire(yesterdayKey, COUNTER_TTL_SECONDS)

      // 获取今天的计数
      const todayCount = await middlewareInstance.getCurrentCount(userId, testAssetCode, 'listings')
      expect(todayCount).toBe(15)

      // 清理
      await redisClient.del(todayKey)
      await redisClient.del(yesterdayKey)
    })

    test('日限额累计场景 - 金额递增', async () => {
      if (!redisClient) {
        console.log('⏭️ 跳过测试：Redis 不可用')
        return
      }

      const userId = 88885
      const dateStr = BeijingTimeHelper.formatDate(new Date(), 'YYYY-MM-DD')
      const key = generateRedisKey(userId, testAssetCode, 'amount', dateStr)

      // 清理
      await redisClient.del(key)

      // 模拟多次交易累计金额
      await middlewareInstance.preOccupy(userId, testAssetCode, 'amount', 5000) // 第1笔
      await middlewareInstance.preOccupy(userId, testAssetCode, 'amount', 3000) // 第2笔
      await middlewareInstance.preOccupy(userId, testAssetCode, 'amount', 2000) // 第3笔

      const totalAmount = await middlewareInstance.getCurrentCount(userId, testAssetCode, 'amount')
      expect(totalAmount).toBe(10000) // 5000 + 3000 + 2000
    })

    test('预占用回滚场景 - 操作失败后恢复计数', async () => {
      if (!redisClient) {
        console.log('⏭️ 跳过测试：Redis 不可用')
        return
      }

      const userId = 88886
      const dateStr = BeijingTimeHelper.formatDate(new Date(), 'YYYY-MM-DD')
      const key = generateRedisKey(userId, testAssetCode, 'listings', dateStr)

      // 清理并设置初始值
      await redisClient.del(key)
      await middlewareInstance.preOccupy(userId, testAssetCode, 'listings', 15) // 初始 15

      // 预占用 1 次（准备挂牌）
      const preOccupyResult = await middlewareInstance.preOccupy(
        userId,
        testAssetCode,
        'listings',
        1
      )
      expect(preOccupyResult.new_value).toBe(16)

      // 假设挂牌操作失败，回滚
      const rollbackResult = await middlewareInstance.rollback(userId, testAssetCode, 'listings', 1)
      expect(rollbackResult.new_value).toBe(15) // 恢复到 15

      const finalCount = await middlewareInstance.getCurrentCount(userId, testAssetCode, 'listings')
      expect(finalCount).toBe(15)
    })
  })
})
