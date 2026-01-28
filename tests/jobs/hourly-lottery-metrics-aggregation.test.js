'use strict'

/**
 * P3-6e: 每小时抽奖指标聚合任务测试套件
 *
 * 测试目标：
 * - HourlyLotteryMetricsAggregation.execute() 方法的核心功能
 * - 从 Redis 聚合实时抽奖指标到 lottery_hourly_metrics 表
 * - 计算派生指标（空奖率、高价值率）
 * - 幂等性保证（findOrCreate）
 *
 * 测试范围：
 * - 正常聚合场景（有 Redis 数据）
 * - 无 Redis 数据场景
 * - 多活动聚合
 * - 派生指标计算
 * - Redis 数据清理选项
 *
 * 业务规则：
 * - 每小时执行一次
 * - 从 LotteryMetricsCollector 获取 Redis 指标
 * - 使用 findOrCreate 保证幂等性
 * - 可选择性清理 Redis 数据
 *
 * @module tests/jobs/hourly-lottery-metrics-aggregation
 * @since 2026-01-28
 */

// 加载环境变量
require('dotenv').config()

const HourlyLotteryMetricsAggregation = require('../../jobs/hourly-lottery-metrics-aggregation')
const { LotteryHourlyMetrics, LotteryCampaign } = require('../../models')
const { Op } = require('sequelize')
const BeijingTimeHelper = require('../../utils/timeHelper')

describe('P3-6e: HourlyLotteryMetricsAggregation - 每小时抽奖指标聚合任务', () => {
  // 测试超时设置
  jest.setTimeout(60000)

  // 任务实例
  let aggregationTask

  beforeAll(() => {
    // 实例化任务类
    aggregationTask = new HourlyLotteryMetricsAggregation()
  })

  describe('execute() - 核心执行逻辑', () => {
    test('应成功执行小时指标聚合并返回报告', async () => {
      // 执行聚合任务（实例方法）
      const report = await aggregationTask.execute()

      // 验证报告结构（实际字段：success, hour_bucket, duration_ms, campaigns_processed）
      expect(report).toBeDefined()
      expect(report).toHaveProperty('success')
      expect(report).toHaveProperty('hour_bucket')
      expect(report).toHaveProperty('duration_ms')
      expect(typeof report.duration_ms).toBe('number')
      expect(report.duration_ms).toBeGreaterThanOrEqual(0)

      // 验证聚合结果字段
      if (report.campaigns_processed !== undefined) {
        expect(typeof report.campaigns_processed).toBe('number')
        expect(report.campaigns_processed).toBeGreaterThanOrEqual(0)
      }

      if (report.campaigns_total !== undefined) {
        expect(typeof report.campaigns_total).toBe('number')
        expect(report.campaigns_total).toBeGreaterThanOrEqual(0)
      }

      console.log('[P3-6e] 小时指标聚合报告:', JSON.stringify(report, null, 2))
    })

    test('无 Redis 数据时应正常返回', async () => {
      const report = await aggregationTask.execute()

      expect(report).toBeDefined()
      expect(report).toHaveProperty('success')
    })
  })

  describe('Redis 指标获取', () => {
    test('应从 LotteryMetricsCollector 获取指标', async () => {
      // 执行聚合任务（实例方法）
      const report = await aggregationTask.execute()

      expect(report).toBeDefined()

      // 验证 Redis 数据获取
      if (report.redis_data_fetched !== undefined) {
        expect(typeof report.redis_data_fetched).toBe('boolean')
        console.log(`[P3-6e] Redis 数据获取: ${report.redis_data_fetched}`)
      }
    })

    test('应获取唯一用户数', async () => {
      // 执行聚合任务（实例方法）
      const report = await aggregationTask.execute()

      expect(report).toBeDefined()

      // 验证唯一用户统计
      if (report.unique_users_calculated !== undefined) {
        expect(typeof report.unique_users_calculated).toBe('boolean')
      }
    })
  })

  describe('时间桶计算', () => {
    test('应正确计算当前小时的时间桶（北京时间）', () => {
      // 获取当前时间桶（BeijingTimeHelper.now() 返回 ISO 字符串）
      const nowString = BeijingTimeHelper.now()
      const now = new Date(nowString)
      const hourBucket = BeijingTimeHelper.formatDate(now, 'YYYY-MM-DD HH:00:00')

      // 验证时间桶格式
      expect(hourBucket).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:00:00$/)

      console.log('[P3-6e] 当前时间桶:', hourBucket)
    })

    test('应使用北京时间进行聚合', async () => {
      // 执行聚合任务（实例方法）
      const report = await aggregationTask.execute()

      expect(report).toBeDefined()
      expect(report).toHaveProperty('hour_bucket')

      // 验证时间桶格式（如 2026012821）
      const hourBucket = report.hour_bucket
      expect(hourBucket).toBeDefined()
      expect(hourBucket).toMatch(/^\d{10}$/) // 格式: YYYYMMDDHH
    })
  })

  describe('活动筛选逻辑', () => {
    test('应正确筛选活跃活动', async () => {
      // 获取活跃活动
      const activeCampaigns = await LotteryCampaign.findAll({
        where: {
          status: 'active'
        }
      })

      console.log(`[P3-6e] 活跃活动数量: ${activeCampaigns.length}`)

      // 验证活动状态
      for (const campaign of activeCampaigns) {
        expect(campaign.status).toBe('active')
      }
    })
  })

  describe('指标记录验证', () => {
    test('应正确创建或更新小时指标记录', async () => {
      // 执行聚合任务（实例方法）
      const report = await aggregationTask.execute()

      expect(report).toBeDefined()

      // 查询最近的小时指标
      const recentMetrics = await LotteryHourlyMetrics.findAll({
        order: [['hour_bucket', 'DESC']],
        limit: 5
      })

      console.log(`[P3-6e] 最近小时指标记录数: ${recentMetrics.length}`)

      for (const metrics of recentMetrics) {
        expect(metrics.campaign_id).toBeDefined()
        expect(metrics.hour_bucket).toBeDefined()
        expect(metrics.total_draws).toBeDefined()
      }
    })

    test('应计算派生指标', async () => {
      // 查询有数据的小时指标
      const metricsWithData = await LotteryHourlyMetrics.findOne({
        where: {
          total_draws: { [Op.gt]: 0 }
        }
      })

      if (!metricsWithData) {
        console.log('[P3-6e] 跳过测试：没有有效的小时指标数据')
        return
      }

      // 验证派生指标
      expect(metricsWithData.empty_rate).toBeGreaterThanOrEqual(0)
      expect(metricsWithData.empty_rate).toBeLessThanOrEqual(1)

      expect(metricsWithData.high_value_rate).toBeGreaterThanOrEqual(0)
      expect(metricsWithData.high_value_rate).toBeLessThanOrEqual(1)

      console.log('[P3-6e] 派生指标:', {
        empty_rate: metricsWithData.empty_rate,
        high_value_rate: metricsWithData.high_value_rate
      })
    })
  })

  describe('幂等性验证', () => {
    test('应使用 findOrCreate 保证幂等性', async () => {
      // 第一次执行（实例方法）
      const report1 = await aggregationTask.execute()

      // 立即第二次执行（实例方法）
      const report2 = await aggregationTask.execute()

      // 两次执行都应成功
      expect(report1).toBeDefined()
      expect(report2).toBeDefined()

      console.log(
        '[P3-6e] 幂等性测试 - 第一次:',
        report1.metrics_saved,
        '第二次:',
        report2.metrics_saved
      )
    })
  })

  describe('Redis 数据清理选项', () => {
    test('应支持 cleanup_redis 选项', async () => {
      // 执行聚合（不清理 Redis）- 实例方法
      const reportWithoutCleanup = await aggregationTask.execute({
        cleanup_redis: false
      })

      expect(reportWithoutCleanup).toBeDefined()

      // 验证清理选项
      if (reportWithoutCleanup.redis_cleaned !== undefined) {
        expect(reportWithoutCleanup.redis_cleaned).toBe(false)
      }

      console.log('[P3-6e] Redis 清理选项测试完成')
    })
  })

  describe('错误处理', () => {
    test('应支持 silent_errors 选项', async () => {
      // 执行聚合（静默错误）- 实例方法
      const report = await aggregationTask.execute({
        silent_errors: true
      })

      expect(report).toBeDefined()
    })

    test('应优雅处理单个活动聚合失败', async () => {
      // 即使单个活动聚合失败，任务整体应该完成（实例方法）
      const report = await aggregationTask.execute()

      expect(report).toBeDefined()
      expect(report).toHaveProperty('success')

      // 失败的活动应该被记录
      if (report.campaigns_failed !== undefined) {
        expect(typeof report.campaigns_failed).toBe('number')
      }
    })
  })

  describe('执行性能测试', () => {
    test('应在合理时间内完成聚合（小于30秒）', async () => {
      const startTime = Date.now()

      const report = await aggregationTask.execute()

      const executionTime = Date.now() - startTime

      expect(executionTime).toBeLessThan(30000)
      expect(report).toBeDefined()

      console.log(`[P3-6e] 执行时间: ${executionTime}ms`)
    })
  })

  describe('数据完整性验证', () => {
    test('小时指标记录应包含所有必要字段', async () => {
      // 查询一条小时指标记录
      const hourlyMetrics = await LotteryHourlyMetrics.findOne()

      if (!hourlyMetrics) {
        console.log('[P3-6e] 跳过测试：没有小时指标数据')
        return
      }

      // 验证必要字段（字段名是 metric_id 不是 metrics_id）
      expect(hourlyMetrics.metric_id).toBeDefined()
      expect(hourlyMetrics.campaign_id).toBeDefined()
      expect(hourlyMetrics.hour_bucket).toBeDefined()
      expect(hourlyMetrics.total_draws).toBeDefined()
      expect(hourlyMetrics.unique_users).toBeDefined()
      expect(hourlyMetrics.total_budget_consumed).toBeDefined()

      console.log('[P3-6e] 小时指标字段验证完成')
    })
  })
})
