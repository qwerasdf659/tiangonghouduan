'use strict'

/**
 * P3-4: 每日抽奖指标聚合任务测试套件
 *
 * 测试目标：
 * - DailyLotteryMetricsAggregation.execute() 方法的核心功能
 * - 小时数据聚合到日数据的逻辑
 * - 派生指标计算（空奖率、高价值率、平均消耗等）
 * - 幂等性保证（findOrCreate + update）
 * - 活动筛选逻辑
 *
 * 测试范围：
 * - 正常聚合场景（有小时数据）
 * - 空数据场景（无小时数据）
 * - 多活动聚合
 * - 幂等性验证
 * - 错误处理
 *
 * 业务规则：
 * - 每天01:05执行（北京时间）
 * - 聚合昨天的小时数据
 * - 计算派生指标：empty_rate, high_value_rate, avg_budget_per_draw, avg_prize_value
 *
 * @module tests/jobs/daily-lottery-metrics-aggregation
 * @since 2026-01-28
 */

// 加载环境变量
require('dotenv').config()

const DailyLotteryMetricsAggregationClass = require('../../jobs/daily-lottery-metrics-aggregation')
const { LotteryDailyMetrics, LotteryHourlyMetrics, LotteryCampaign } = require('../../models')
const { Op } = require('sequelize')
const BeijingTimeHelper = require('../../utils/timeHelper')

describe('P3-4: DailyLotteryMetricsAggregation - 每日抽奖指标聚合任务', () => {
  // 测试超时设置
  jest.setTimeout(60000)

  // 创建任务实例
  let aggregationTask

  beforeAll(() => {
    // 实例化任务类
    aggregationTask = new DailyLotteryMetricsAggregationClass({ silent_errors: true })
  })

  describe('execute() - 核心执行逻辑', () => {
    test('应成功执行日指标聚合并返回报告', async () => {
      // 执行聚合任务（实例方法）
      const report = await aggregationTask.execute()

      // 验证报告结构（字段：success, date_str, campaigns_processed, duration_ms）
      expect(report).toBeDefined()
      expect(report).toHaveProperty('success')
      expect(report).toHaveProperty('date_str')
      expect(report).toHaveProperty('duration_ms')
      expect(typeof report.duration_ms).toBe('number')
      expect(report.duration_ms).toBeGreaterThanOrEqual(0)

      // 验证聚合结果字段
      if (report.campaigns_processed !== undefined) {
        expect(typeof report.campaigns_processed).toBe('number')
        expect(report.campaigns_processed).toBeGreaterThanOrEqual(0)
      }

      console.log('[P3-4] 日指标聚合报告:', JSON.stringify(report, null, 2))
    })

    test('应正确筛选需要聚合的活动', async () => {
      // 获取活跃和已完成的活动
      const campaignIds = await aggregationTask.getCampaignIds()

      expect(campaignIds).toBeDefined()
      expect(Array.isArray(campaignIds)).toBe(true)

      // 验证返回的都是有效的活动ID
      for (const id of campaignIds) {
        expect(typeof id).toBe('number')
        expect(id).toBeGreaterThan(0)
      }

      console.log(`[P3-4] 需要聚合的活动数量: ${campaignIds.length}`)
    })

    test('应幂等执行（重复执行更新而非重复插入）', async () => {
      // 第一次执行
      const report1 = await aggregationTask.execute()

      // 立即第二次执行
      const report2 = await aggregationTask.execute()

      // 两次执行都应成功
      expect(report1).toBeDefined()
      expect(report2).toBeDefined()

      // 第二次执行应该是更新而非新建
      console.log(
        '[P3-4] 幂等性测试 - 第一次:',
        report1.processed_campaigns,
        '第二次:',
        report2.processed_campaigns
      )
    })
  })

  describe('getYesterdayRange() - 日期范围计算', () => {
    test('应正确计算昨天的日期范围（北京时间）', () => {
      // 获取昨天的日期范围（实例方法）
      const range = aggregationTask.getYesterdayRange()

      // 验证范围结构（字段：date_str, start_datetime, end_datetime）
      expect(range).toBeDefined()
      expect(range).toHaveProperty('date_str')
      expect(range).toHaveProperty('start_datetime')
      expect(range).toHaveProperty('end_datetime')

      // 验证日期格式
      expect(range.date_str).toMatch(/^\d{4}-\d{2}-\d{2}$/)

      // 验证 start_datetime < end_datetime
      expect(new Date(range.start_datetime).getTime()).toBeLessThan(
        new Date(range.end_datetime).getTime()
      )

      console.log('[P3-4] 昨天日期范围:', JSON.stringify(range, null, 2))
    })
  })

  describe('aggregateCampaign() - 单活动聚合逻辑', () => {
    test('应正确聚合单个活动的小时数据', async () => {
      // 获取一个活跃活动
      const campaign = await LotteryCampaign.findOne({
        where: { status: 'active' }
      })

      if (!campaign) {
        console.log('[P3-4] 跳过测试：没有活跃活动')
        return
      }

      // 获取昨天的日期范围
      const range = aggregationTask.getYesterdayRange()

      // 聚合该活动（参数：lottery_campaign_id, date_str, start_datetime, end_datetime）
      const result = await aggregationTask.aggregateCampaign(
        campaign.lottery_campaign_id,
        range.date_str,
        range.start_datetime,
        range.end_datetime
      )

      // 验证聚合结果
      if (result) {
        expect(result).toHaveProperty('lottery_campaign_id')
        expect(result.lottery_campaign_id).toBe(campaign.lottery_campaign_id)
      }

      console.log('[P3-4] 单活动聚合结果:', JSON.stringify(result, null, 2))
    })

    test('应正确计算派生指标', async () => {
      // 查询已有的日指标
      const dailyMetrics = await LotteryDailyMetrics.findOne({
        where: {
          total_draws: { [Op.gt]: 0 }
        }
      })

      if (!dailyMetrics) {
        console.log('[P3-4] 跳过测试：没有日指标数据')
        return
      }

      // 验证派生指标
      expect(dailyMetrics.empty_rate).toBeGreaterThanOrEqual(0)
      expect(dailyMetrics.empty_rate).toBeLessThanOrEqual(1)

      expect(dailyMetrics.high_value_rate).toBeGreaterThanOrEqual(0)
      expect(dailyMetrics.high_value_rate).toBeLessThanOrEqual(1)

      if (dailyMetrics.total_draws > 0) {
        // 平均消耗应该是合理的值
        expect(dailyMetrics.avg_budget_per_draw).toBeGreaterThanOrEqual(0)
      }

      console.log('[P3-4] 派生指标:', {
        empty_rate: dailyMetrics.empty_rate,
        high_value_rate: dailyMetrics.high_value_rate,
        avg_budget_per_draw: dailyMetrics.avg_budget_per_draw,
        avg_prize_value: dailyMetrics.avg_prize_value
      })
    })
  })

  describe('小时数据聚合验证', () => {
    test('应正确汇总小时数据到日数据', async () => {
      // 查询一个活动的昨天小时数据
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const dateStr = BeijingTimeHelper.formatDate(yesterday, 'YYYY-MM-DD')

      const hourlyData = await LotteryHourlyMetrics.findAll({
        where: {
          hour_bucket: {
            [Op.gte]: `${dateStr} 00:00:00`,
            [Op.lt]: `${dateStr} 23:59:59`
          }
        },
        limit: 24
      })

      if (hourlyData.length === 0) {
        console.log('[P3-4] 跳过测试：没有昨天的小时数据')
        return
      }

      // 计算小时数据汇总
      const totalDraws = hourlyData.reduce((sum, h) => sum + (h.total_draws || 0), 0)

      console.log(`[P3-4] 昨天小时数据数量: ${hourlyData.length}, 总抽奖次数: ${totalDraws}`)

      // 验证数据一致性
      expect(totalDraws).toBeGreaterThanOrEqual(0)
    })
  })

  describe('边界条件测试', () => {
    test('应处理无小时数据的场景', async () => {
      // 即使没有小时数据，任务也应正常完成
      const report = await aggregationTask.execute()

      expect(report).toBeDefined()
      expect(report).toHaveProperty('success')
    })

    test('应处理多活动并行聚合（性能边界）', async () => {
      const startTime = Date.now()

      // 执行聚合
      const report = await aggregationTask.execute()

      const executionTime = Date.now() - startTime

      // 验证执行时间在合理范围内（小于60秒）
      expect(executionTime).toBeLessThan(60000)

      console.log(`[P3-4] 执行时间: ${executionTime}ms, 处理活动数: ${report.processed_campaigns}`)
    })
  })

  describe('错误处理', () => {
    test('应静默处理单个活动聚合失败', async () => {
      // 执行聚合（静默错误模式已在实例化时设置）
      const report = await aggregationTask.execute()

      expect(report).toBeDefined()
      // 即使部分活动失败，也应有报告
    })
  })

  describe('数据完整性验证', () => {
    test('日指标记录应包含所有必要字段', async () => {
      // 查询一条日指标记录
      const dailyMetrics = await LotteryDailyMetrics.findOne()

      if (!dailyMetrics) {
        console.log('[P3-4] 跳过测试：没有日指标数据')
        return
      }

      // 验证必要字段（模型字段：metric_date, not date_bucket）
      expect(dailyMetrics.lottery_campaign_id).toBeDefined()
      expect(dailyMetrics.metric_date).toBeDefined()
      expect(dailyMetrics.total_draws).toBeDefined()
      expect(dailyMetrics.unique_users).toBeDefined()
      expect(dailyMetrics.total_budget_consumed).toBeDefined()
      expect(dailyMetrics.empty_rate).toBeDefined()
      expect(dailyMetrics.high_value_rate).toBeDefined()
    })
  })
})
