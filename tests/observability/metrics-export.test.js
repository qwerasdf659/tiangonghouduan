'use strict'

/**
 * P2-3.3: 指标导出测试套件
 *
 * 测试目标：
 * - 验证LotteryMetricsCollector指标采集正确性
 * - 验证Redis指标存储和读取
 * - 验证指标聚合逻辑正确性
 * - 验证指标数据格式符合预期
 *
 * 测试范围：
 * - 抽奖指标采集（recordDraw）
 * - 小时指标读取（getHourMetrics）
 * - 独立用户统计（HyperLogLog）
 * - Budget Tier分布统计
 * - 奖品档位分布统计
 * - 体验机制触发统计
 *
 * 业务规则：
 * - 所有指标使用Redis原子操作保证准确性
 * - 指标Key格式：lottery:metrics:{lottery_campaign_id}:{metric_type}:{hour_bucket}
 * - TTL：25小时（保留至下一小时聚合完成）
 * - 独立用户使用HyperLogLog统计
 *
 * 技术说明：
 * - 项目使用基于Redis的LotteryMetricsCollector进行指标采集
 * - 指标数据通过定时任务聚合到MySQL（lottery_hourly_metrics表）
 * - 本测试验证Redis层的指标采集逻辑
 *
 * @module tests/observability/metrics-export
 * @since 2026-01-30
 */

// 加载环境变量
require('dotenv').config()

const {
  LotteryMetricsCollector,
  getInstance
} = require('../../services/lottery/LotteryMetricsCollector')
const { getRedisClient, isRedisHealthy } = require('../../utils/UnifiedRedisClient')

describe('P2-3.3: 指标导出测试', () => {
  // 测试超时设置
  jest.setTimeout(60000)

  let collector
  let _redisClient // eslint允许以_开头的未使用变量（用于保持Redis连接引用）
  let redisAvailable = false

  // 测试用的lottery_campaign_id（使用一个不会与生产数据冲突的ID）
  const TEST_CAMPAIGN_ID = 999999

  beforeAll(async () => {
    // 检查Redis是否可用
    try {
      redisAvailable = await isRedisHealthy()
      if (redisAvailable) {
        _redisClient = getRedisClient()
        console.log('[P2-3.3] ✅ Redis连接正常')
      } else {
        console.warn('[P2-3.3] ⚠️ Redis不可用，部分测试将跳过')
      }
    } catch (error) {
      console.warn('[P2-3.3] ⚠️ Redis连接失败:', error.message)
      redisAvailable = false
    }

    // 创建测试用的collector实例
    collector = new LotteryMetricsCollector({
      ttl_seconds: 3600, // 1小时（测试用）
      silent_errors: false // 测试时显示错误
    })
  })

  afterAll(async () => {
    // 清理测试数据
    if (redisAvailable && collector) {
      try {
        // 获取当前小时桶
        const hourBucket = collector._getHourBucket()
        await collector.deleteHourMetrics(TEST_CAMPAIGN_ID, hourBucket)
        console.log('[P2-3.3] 🧹 测试数据已清理')
      } catch (error) {
        console.warn('[P2-3.3] ⚠️ 清理测试数据失败:', error.message)
      }
    }
  })

  describe('LotteryMetricsCollector类验证', () => {
    test('LotteryMetricsCollector类应正确导出', () => {
      expect(LotteryMetricsCollector).toBeDefined()
      expect(typeof LotteryMetricsCollector).toBe('function')

      console.log('[P2-3.3] ✅ LotteryMetricsCollector类导出验证通过')
    })

    test('getInstance应返回单例实例', () => {
      const instance1 = getInstance()
      const instance2 = getInstance()

      expect(instance1).toBeDefined()
      expect(instance2).toBeDefined()
      expect(instance1).toBe(instance2) // 同一个实例

      console.log('[P2-3.3] ✅ 单例模式验证通过')
    })

    test('collector实例应包含必需的方法', () => {
      expect(typeof collector.recordDraw).toBe('function')
      expect(typeof collector.getHourMetrics).toBe('function')
      expect(typeof collector.getUniqueUsersCount).toBe('function')
      expect(typeof collector.deleteHourMetrics).toBe('function')
      expect(typeof collector._getHourBucket).toBe('function')
      expect(typeof collector._getDateBucket).toBe('function')
      expect(typeof collector._buildKey).toBe('function')

      console.log('[P2-3.3] ✅ collector方法完整性验证通过')
    })
  })

  describe('时间桶格式验证', () => {
    test('_getHourBucket应返回YYYYMMDDHH格式', () => {
      const hourBucket = collector._getHourBucket()

      // 验证格式：10位数字
      expect(hourBucket).toMatch(/^\d{10}$/)

      // 验证是合理的日期
      const year = parseInt(hourBucket.substring(0, 4))
      const month = parseInt(hourBucket.substring(4, 6))
      const day = parseInt(hourBucket.substring(6, 8))
      const hour = parseInt(hourBucket.substring(8, 10))

      expect(year).toBeGreaterThanOrEqual(2024)
      expect(year).toBeLessThanOrEqual(2030)
      expect(month).toBeGreaterThanOrEqual(1)
      expect(month).toBeLessThanOrEqual(12)
      expect(day).toBeGreaterThanOrEqual(1)
      expect(day).toBeLessThanOrEqual(31)
      expect(hour).toBeGreaterThanOrEqual(0)
      expect(hour).toBeLessThanOrEqual(23)

      console.log('[P2-3.3] ✅ 小时桶格式验证通过:', hourBucket)
    })

    test('_getDateBucket应返回YYYYMMDD格式', () => {
      const dateBucket = collector._getDateBucket()

      // 验证格式：8位数字
      expect(dateBucket).toMatch(/^\d{8}$/)

      // 验证是合理的日期
      const year = parseInt(dateBucket.substring(0, 4))
      const month = parseInt(dateBucket.substring(4, 6))
      const day = parseInt(dateBucket.substring(6, 8))

      expect(year).toBeGreaterThanOrEqual(2024)
      expect(month).toBeGreaterThanOrEqual(1)
      expect(month).toBeLessThanOrEqual(12)
      expect(day).toBeGreaterThanOrEqual(1)
      expect(day).toBeLessThanOrEqual(31)

      console.log('[P2-3.3] ✅ 日期桶格式验证通过:', dateBucket)
    })

    test('指定时间戳应返回正确的桶标识', () => {
      // 使用固定时间测试
      const testDate = new Date('2026-01-30T14:30:00+08:00')

      const hourBucket = collector._getHourBucket(testDate)
      const dateBucket = collector._getDateBucket(testDate)

      // 北京时间2026年1月30日14点
      expect(hourBucket).toBe('2026013014')
      expect(dateBucket).toBe('20260130')

      console.log('[P2-3.3] ✅ 指定时间桶验证通过')
    })
  })

  describe('Redis Key格式验证', () => {
    test('_buildKey应生成正确格式的Key', () => {
      const key = collector._buildKey(1, 'total_draws', '2026013014')

      expect(key).toBe('lottery:metrics:1:total_draws:2026013014')

      console.log('[P2-3.3] ✅ Key格式验证通过:', key)
    })

    test('Key应包含正确的前缀', () => {
      const key = collector._buildKey(TEST_CAMPAIGN_ID, 'test_metric', '2026013014')

      expect(key).toMatch(/^lottery:metrics:/)

      console.log('[P2-3.3] ✅ Key前缀验证通过')
    })
  })

  describe('recordDraw指标采集验证', () => {
    beforeEach(async () => {
      // 每个测试前清理测试数据
      if (redisAvailable) {
        const hourBucket = collector._getHourBucket()
        await collector.deleteHourMetrics(TEST_CAMPAIGN_ID, hourBucket)
      }
    })

    test('recordDraw应验证必需参数', async () => {
      if (!redisAvailable) {
        console.log('[P2-3.3] ⏭️ 跳过：Redis不可用')
        return
      }

      // 缺少lottery_campaign_id
      const result1 = await collector.recordDraw({
        user_id: 1,
        selected_tier: 'mid'
      })
      expect(result1.success).toBe(false)
      expect(result1.error).toBe('MISSING_REQUIRED_PARAMS')

      // 缺少user_id
      const result2 = await collector.recordDraw({
        lottery_campaign_id: TEST_CAMPAIGN_ID,
        selected_tier: 'mid'
      })
      expect(result2.success).toBe(false)
      expect(result2.error).toBe('MISSING_REQUIRED_PARAMS')

      console.log('[P2-3.3] ✅ 必需参数验证通过')
    })

    test('recordDraw应正确记录抽奖指标', async () => {
      if (!redisAvailable) {
        console.log('[P2-3.3] ⏭️ 跳过：Redis不可用')
        return
      }

      const drawData = {
        lottery_campaign_id: TEST_CAMPAIGN_ID,
        user_id: 12345,
        selected_tier: 'mid',
        budget_tier: 'B2',
        prize_value: 50,
        budget_consumed: 10,
        triggers: {
          pity_triggered: false,
          anti_empty_triggered: true,
          anti_high_triggered: false,
          luck_debt_triggered: false
        }
      }

      const result = await collector.recordDraw(drawData)

      // 验证返回结果
      expect(result.success).toBe(true)
      expect(result).toHaveProperty('hour_bucket')
      expect(result).toHaveProperty('date_bucket')
      expect(result).toHaveProperty('operations_count')
      expect(result.operations_count).toBeGreaterThan(0)

      console.log('[P2-3.3] ✅ recordDraw执行验证通过:', result)
    })

    test('recordDraw应正确统计total_draws', async () => {
      if (!redisAvailable) {
        console.log('[P2-3.3] ⏭️ 跳过：Redis不可用')
        return
      }

      // 记录3次抽奖
      for (let i = 0; i < 3; i++) {
        await collector.recordDraw({
          lottery_campaign_id: TEST_CAMPAIGN_ID,
          user_id: 10000 + i,
          selected_tier: 'low'
        })
      }

      // 获取指标
      const hourBucket = collector._getHourBucket()
      const metrics = await collector.getHourMetrics(TEST_CAMPAIGN_ID, hourBucket)

      expect(metrics.total_draws).toBe(3)

      console.log('[P2-3.3] ✅ total_draws统计验证通过:', metrics.total_draws)
    })

    test('recordDraw应正确统计Budget Tier分布', async () => {
      if (!redisAvailable) {
        console.log('[P2-3.3] ⏭️ 跳过：Redis不可用')
        return
      }

      // 记录不同Budget Tier的抽奖
      const budgetTiers = ['B0', 'B1', 'B1', 'B2', 'B2', 'B2', 'B3']

      for (let i = 0; i < budgetTiers.length; i++) {
        await collector.recordDraw({
          lottery_campaign_id: TEST_CAMPAIGN_ID,
          user_id: 20000 + i,
          selected_tier: 'mid',
          budget_tier: budgetTiers[i]
        })
      }

      // 获取指标
      const hourBucket = collector._getHourBucket()
      const metrics = await collector.getHourMetrics(TEST_CAMPAIGN_ID, hourBucket)

      expect(metrics.b0_count).toBe(1)
      expect(metrics.b1_count).toBe(2)
      expect(metrics.b2_count).toBe(3)
      expect(metrics.b3_count).toBe(1)

      console.log('[P2-3.3] ✅ Budget Tier分布统计验证通过:', {
        b0: metrics.b0_count,
        b1: metrics.b1_count,
        b2: metrics.b2_count,
        b3: metrics.b3_count
      })
    })

    test('recordDraw应正确统计奖品档位分布', async () => {
      if (!redisAvailable) {
        console.log('[P2-3.3] ⏭️ 跳过：Redis不可用')
        return
      }

      // 记录不同档位的抽奖
      const tiers = ['high', 'mid', 'mid', 'low', 'low', 'low', 'fallback']

      for (let i = 0; i < tiers.length; i++) {
        await collector.recordDraw({
          lottery_campaign_id: TEST_CAMPAIGN_ID,
          user_id: 30000 + i,
          selected_tier: tiers[i]
        })
      }

      // 获取指标
      const hourBucket = collector._getHourBucket()
      const metrics = await collector.getHourMetrics(TEST_CAMPAIGN_ID, hourBucket)

      expect(metrics.high_tier_count).toBe(1)
      expect(metrics.mid_tier_count).toBe(2)
      expect(metrics.low_tier_count).toBe(3)
      expect(metrics.fallback_tier_count).toBe(1)

      console.log('[P2-3.3] ✅ 奖品档位分布统计验证通过:', {
        high: metrics.high_tier_count,
        mid: metrics.mid_tier_count,
        low: metrics.low_tier_count,
        fallback: metrics.fallback_tier_count
      })
    })

    test('recordDraw应正确统计体验机制触发', async () => {
      if (!redisAvailable) {
        console.log('[P2-3.3] ⏭️ 跳过：Redis不可用')
        return
      }

      // 记录带体验机制触发的抽奖
      await collector.recordDraw({
        lottery_campaign_id: TEST_CAMPAIGN_ID,
        user_id: 40001,
        selected_tier: 'mid',
        triggers: {
          pity_triggered: true,
          anti_empty_triggered: false,
          anti_high_triggered: false,
          luck_debt_triggered: false
        }
      })

      await collector.recordDraw({
        lottery_campaign_id: TEST_CAMPAIGN_ID,
        user_id: 40002,
        selected_tier: 'low',
        triggers: {
          pity_triggered: false,
          anti_empty_triggered: true,
          anti_high_triggered: true,
          luck_debt_triggered: false
        }
      })

      await collector.recordDraw({
        lottery_campaign_id: TEST_CAMPAIGN_ID,
        user_id: 40003,
        selected_tier: 'high',
        triggers: {
          pity_triggered: true,
          anti_empty_triggered: false,
          anti_high_triggered: false,
          luck_debt_triggered: true
        }
      })

      // 获取指标
      const hourBucket = collector._getHourBucket()
      const metrics = await collector.getHourMetrics(TEST_CAMPAIGN_ID, hourBucket)

      expect(metrics.pity_triggered).toBe(2)
      expect(metrics.anti_empty_triggered).toBe(1)
      expect(metrics.anti_high_triggered).toBe(1)
      expect(metrics.luck_debt_triggered).toBe(1)

      console.log('[P2-3.3] ✅ 体验机制触发统计验证通过:', {
        pity: metrics.pity_triggered,
        anti_empty: metrics.anti_empty_triggered,
        anti_high: metrics.anti_high_triggered,
        luck_debt: metrics.luck_debt_triggered
      })
    })

    test('recordDraw应正确累计预算消耗和奖品价值', async () => {
      if (!redisAvailable) {
        console.log('[P2-3.3] ⏭️ 跳过：Redis不可用')
        return
      }

      // 记录多次抽奖，累计预算和价值
      await collector.recordDraw({
        lottery_campaign_id: TEST_CAMPAIGN_ID,
        user_id: 50001,
        selected_tier: 'mid',
        prize_value: 50,
        budget_consumed: 10
      })

      await collector.recordDraw({
        lottery_campaign_id: TEST_CAMPAIGN_ID,
        user_id: 50002,
        selected_tier: 'high',
        prize_value: 100,
        budget_consumed: 20
      })

      await collector.recordDraw({
        lottery_campaign_id: TEST_CAMPAIGN_ID,
        user_id: 50003,
        selected_tier: 'low',
        prize_value: 25.5,
        budget_consumed: 5.5
      })

      // 获取指标
      const hourBucket = collector._getHourBucket()
      const metrics = await collector.getHourMetrics(TEST_CAMPAIGN_ID, hourBucket)

      // 验证浮点数累加
      expect(metrics.total_budget_consumed).toBeCloseTo(35.5, 1)
      expect(metrics.total_prize_value).toBeCloseTo(175.5, 1)

      console.log('[P2-3.3] ✅ 预算消耗和奖品价值累计验证通过:', {
        budget: metrics.total_budget_consumed,
        prize: metrics.total_prize_value
      })
    })
  })

  describe('getHourMetrics指标读取验证', () => {
    test('getHourMetrics应返回完整的指标结构', async () => {
      if (!redisAvailable) {
        console.log('[P2-3.3] ⏭️ 跳过：Redis不可用')
        return
      }

      const hourBucket = collector._getHourBucket()
      const metrics = await collector.getHourMetrics(TEST_CAMPAIGN_ID, hourBucket)

      // 验证返回对象包含所有指标字段
      expect(metrics).toHaveProperty('total_draws')
      expect(metrics).toHaveProperty('b0_count')
      expect(metrics).toHaveProperty('b1_count')
      expect(metrics).toHaveProperty('b2_count')
      expect(metrics).toHaveProperty('b3_count')
      expect(metrics).toHaveProperty('high_tier_count')
      expect(metrics).toHaveProperty('mid_tier_count')
      expect(metrics).toHaveProperty('low_tier_count')
      expect(metrics).toHaveProperty('fallback_tier_count')
      expect(metrics).toHaveProperty('empty_count')
      expect(metrics).toHaveProperty('pity_triggered')
      expect(metrics).toHaveProperty('anti_empty_triggered')
      expect(metrics).toHaveProperty('anti_high_triggered')
      expect(metrics).toHaveProperty('luck_debt_triggered')
      expect(metrics).toHaveProperty('total_budget_consumed')
      expect(metrics).toHaveProperty('total_prize_value')

      console.log('[P2-3.3] ✅ 指标结构完整性验证通过')
    })

    test('空数据应返回全0', async () => {
      if (!redisAvailable) {
        console.log('[P2-3.3] ⏭️ 跳过：Redis不可用')
        return
      }

      // 使用一个肯定不存在数据的lottery_campaign_id
      const emptyMetrics = await collector.getHourMetrics(888888, '9999999999')

      // 所有指标应为0
      expect(emptyMetrics.total_draws).toBe(0)
      expect(emptyMetrics.b0_count).toBe(0)
      expect(emptyMetrics.high_tier_count).toBe(0)
      expect(emptyMetrics.total_budget_consumed).toBe(0)
      expect(emptyMetrics.total_prize_value).toBe(0)

      console.log('[P2-3.3] ✅ 空数据返回0验证通过')
    })
  })

  describe('独立用户统计验证（HyperLogLog）', () => {
    beforeEach(async () => {
      // 清理测试数据
      if (redisAvailable) {
        const dateBucket = collector._getDateBucket()
        const key = `lottery:metrics:${TEST_CAMPAIGN_ID}:unique_users:${dateBucket}`
        try {
          const client = getRedisClient().getClient()
          await client.del(key)
        } catch (_e) {
          // 忽略清理错误
        }
      }
    })

    test('getUniqueUsersCount应正确统计独立用户', async () => {
      if (!redisAvailable) {
        console.log('[P2-3.3] ⏭️ 跳过：Redis不可用')
        return
      }

      // 记录5个不同用户的抽奖
      for (let i = 0; i < 5; i++) {
        await collector.recordDraw({
          lottery_campaign_id: TEST_CAMPAIGN_ID,
          user_id: 60000 + i, // 不同用户ID
          selected_tier: 'mid'
        })
      }

      // 记录同一用户的重复抽奖
      for (let i = 0; i < 3; i++) {
        await collector.recordDraw({
          lottery_campaign_id: TEST_CAMPAIGN_ID,
          user_id: 60001, // 同一用户ID
          selected_tier: 'low'
        })
      }

      const dateBucket = collector._getDateBucket()
      const uniqueUsers = await collector.getUniqueUsersCount(TEST_CAMPAIGN_ID, dateBucket)

      // HyperLogLog近似计数，5个独立用户
      expect(uniqueUsers).toBeGreaterThanOrEqual(4)
      expect(uniqueUsers).toBeLessThanOrEqual(6)

      console.log('[P2-3.3] ✅ 独立用户统计验证通过:', uniqueUsers)
    })
  })

  describe('deleteHourMetrics清理验证', () => {
    test('deleteHourMetrics应正确删除指定小时的指标', async () => {
      if (!redisAvailable) {
        console.log('[P2-3.3] ⏭️ 跳过：Redis不可用')
        return
      }

      // 先记录一些数据
      await collector.recordDraw({
        lottery_campaign_id: TEST_CAMPAIGN_ID,
        user_id: 70001,
        selected_tier: 'mid'
      })

      const hourBucket = collector._getHourBucket()

      // 验证数据存在
      const metricsBefore = await collector.getHourMetrics(TEST_CAMPAIGN_ID, hourBucket)
      expect(metricsBefore.total_draws).toBeGreaterThan(0)

      // 删除数据
      const deletedCount = await collector.deleteHourMetrics(TEST_CAMPAIGN_ID, hourBucket)
      expect(deletedCount).toBeGreaterThan(0)

      // 验证数据已删除
      const metricsAfter = await collector.getHourMetrics(TEST_CAMPAIGN_ID, hourBucket)
      expect(metricsAfter.total_draws).toBe(0)

      console.log('[P2-3.3] ✅ 指标删除验证通过，删除了', deletedCount, '个Key')
    })

    test('deleteHourMetrics对不存在的数据应返回0', async () => {
      if (!redisAvailable) {
        console.log('[P2-3.3] ⏭️ 跳过：Redis不可用')
        return
      }

      const deletedCount = await collector.deleteHourMetrics(777777, '0000000000')
      expect(deletedCount).toBe(0)

      console.log('[P2-3.3] ✅ 不存在数据删除验证通过')
    })
  })

  describe('指标数据类型验证', () => {
    test('计数类指标应为整数', async () => {
      if (!redisAvailable) {
        console.log('[P2-3.3] ⏭️ 跳过：Redis不可用')
        return
      }

      await collector.recordDraw({
        lottery_campaign_id: TEST_CAMPAIGN_ID,
        user_id: 80001,
        selected_tier: 'mid',
        budget_tier: 'B2'
      })

      const hourBucket = collector._getHourBucket()
      const metrics = await collector.getHourMetrics(TEST_CAMPAIGN_ID, hourBucket)

      // 验证整数类型
      expect(Number.isInteger(metrics.total_draws)).toBe(true)
      expect(Number.isInteger(metrics.b2_count)).toBe(true)
      expect(Number.isInteger(metrics.mid_tier_count)).toBe(true)

      console.log('[P2-3.3] ✅ 计数类指标整数类型验证通过')
    })

    test('金额类指标应为浮点数', async () => {
      if (!redisAvailable) {
        console.log('[P2-3.3] ⏭️ 跳过：Redis不可用')
        return
      }

      await collector.recordDraw({
        lottery_campaign_id: TEST_CAMPAIGN_ID,
        user_id: 80002,
        selected_tier: 'high',
        prize_value: 99.99,
        budget_consumed: 19.99
      })

      const hourBucket = collector._getHourBucket()
      const metrics = await collector.getHourMetrics(TEST_CAMPAIGN_ID, hourBucket)

      // 验证浮点数类型
      expect(typeof metrics.total_budget_consumed).toBe('number')
      expect(typeof metrics.total_prize_value).toBe('number')

      console.log('[P2-3.3] ✅ 金额类指标浮点类型验证通过')
    })
  })

  describe('静默错误模式验证', () => {
    test('silent_errors=true时错误不应抛出', async () => {
      const silentCollector = new LotteryMetricsCollector({
        silent_errors: true
      })

      // 即使Redis不可用，也不应抛出错误
      const result = await silentCollector.recordDraw({
        lottery_campaign_id: TEST_CAMPAIGN_ID,
        user_id: 90001,
        selected_tier: 'mid'
      })

      // 结果应该表明操作状态
      expect(result).toBeDefined()
      expect(typeof result).toBe('object')

      console.log('[P2-3.3] ✅ 静默错误模式验证通过')
    })
  })

  describe('指标采集性能验证', () => {
    test('批量recordDraw应在合理时间内完成', async () => {
      if (!redisAvailable) {
        console.log('[P2-3.3] ⏭️ 跳过：Redis不可用')
        return
      }

      const drawCount = 50
      const startTime = Date.now()

      for (let i = 0; i < drawCount; i++) {
        await collector.recordDraw({
          lottery_campaign_id: TEST_CAMPAIGN_ID,
          user_id: 100000 + i,
          selected_tier: ['high', 'mid', 'low'][i % 3],
          budget_tier: ['B0', 'B1', 'B2', 'B3'][i % 4],
          prize_value: Math.random() * 100,
          budget_consumed: Math.random() * 20,
          triggers: {
            pity_triggered: i % 5 === 0,
            anti_empty_triggered: i % 7 === 0,
            anti_high_triggered: i % 11 === 0,
            luck_debt_triggered: i % 13 === 0
          }
        })
      }

      const executionTime = Date.now() - startTime

      // 50次采集应该在5秒内完成
      expect(executionTime).toBeLessThan(5000)

      console.log(`[P2-3.3] ✅ ${drawCount}次指标采集执行时间: ${executionTime}ms`)
    })
  })

  describe('empty空奖统计验证', () => {
    test('empty档位应单独统计（区别于fallback保底）', async () => {
      if (!redisAvailable) {
        console.log('[P2-3.3] ⏭️ 跳过：Redis不可用')
        return
      }

      // 清理测试数据
      const hourBucket = collector._getHourBucket()
      await collector.deleteHourMetrics(TEST_CAMPAIGN_ID, hourBucket)

      // 记录fallback（正常保底）
      await collector.recordDraw({
        lottery_campaign_id: TEST_CAMPAIGN_ID,
        user_id: 110001,
        selected_tier: 'fallback'
      })

      // 记录empty（真正空奖 - 异常情况）
      await collector.recordDraw({
        lottery_campaign_id: TEST_CAMPAIGN_ID,
        user_id: 110002,
        selected_tier: 'empty'
      })

      const metrics = await collector.getHourMetrics(TEST_CAMPAIGN_ID, hourBucket)

      // 验证两种空奖分开统计
      expect(metrics.fallback_tier_count).toBe(1) // 正常保底
      expect(metrics.empty_count).toBe(1) // 真正空奖

      console.log('[P2-3.3] ✅ empty/fallback分开统计验证通过:', {
        fallback: metrics.fallback_tier_count,
        empty: metrics.empty_count
      })
    })
  })
})
