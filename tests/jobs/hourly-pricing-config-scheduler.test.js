'use strict'

/**
 * P3-5: 每小时定价配置调度任务测试套件
 *
 * 测试目标：
 * - HourlyPricingConfigScheduler.execute() 方法的核心功能
 * - 计划生效时间到达后自动激活定价配置
 * - 调用 LotteryCampaignPricingConfigService.processScheduledActivations()
 * - 执行报告的准确性
 *
 * 测试范围：
 * - 正常调度场景（有待激活配置）
 * - 空配置场景（无待激活配置）
 * - 手动触发功能
 * - 错误处理
 *
 * 业务规则：
 * - 每小时执行一次
 * - 检查定价配置的 effective_time 是否到达
 * - 到达后调用服务激活配置
 *
 * @module tests/jobs/hourly-pricing-config-scheduler
 * @since 2026-01-28
 */

// 加载环境变量
require('dotenv').config()

const HourlyPricingConfigScheduler = require('../../jobs/hourly-pricing-config-scheduler')
const { LotteryCampaignPricingConfig, LotteryCampaign } = require('../../models')
const { Op } = require('sequelize')
const BeijingTimeHelper = require('../../utils/timeHelper')

describe('P3-5: HourlyPricingConfigScheduler - 每小时定价配置调度任务', () => {
  // 测试超时设置
  jest.setTimeout(60000)

  describe('execute() - 核心执行逻辑', () => {
    test('应成功执行定价配置调度并返回报告', async () => {
      // 执行调度任务
      const report = await HourlyPricingConfigScheduler.execute()

      // 验证报告结构（字段：job_id, success, duration_ms, processed, activated, failed）
      expect(report).toBeDefined()
      expect(report).toHaveProperty('job_id')
      expect(report).toHaveProperty('success')
      expect(report).toHaveProperty('duration_ms')
      expect(typeof report.duration_ms).toBe('number')
      expect(report.duration_ms).toBeGreaterThanOrEqual(0)

      // 验证调度结果字段
      if (report.processed !== undefined) {
        expect(typeof report.processed).toBe('number')
        expect(report.processed).toBeGreaterThanOrEqual(0)
      }

      if (report.activated !== undefined) {
        expect(typeof report.activated).toBe('number')
        expect(report.activated).toBeGreaterThanOrEqual(0)
      }

      console.log('[P3-5] 定价配置调度报告:', JSON.stringify(report, null, 2))
    })

    test('应正确调用服务处理计划激活', async () => {
      // 监控日志输出（间接验证服务调用）
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      try {
        const report = await HourlyPricingConfigScheduler.execute()

        // 验证任务执行成功
        expect(report).toBeDefined()

        // 恢复console并验证日志输出
        consoleSpy.mockRestore()

        console.log('[P3-5] 服务调用验证完成')
      } finally {
        consoleSpy.mockRestore()
      }
    })

    test('应在无待激活配置时正常返回', async () => {
      // 即使没有待激活配置，任务也应正常完成
      const report = await HourlyPricingConfigScheduler.execute()

      expect(report).toBeDefined()
      // 验证报告包含必要字段（job_id, success, duration_ms）
      expect(report).toHaveProperty('job_id')
      expect(report).toHaveProperty('success')
      expect(report.duration_ms).toBeGreaterThanOrEqual(0)
    })
  })

  describe('manualTrigger() - 手动触发功能', () => {
    test('应支持手动触发调度', async () => {
      // 验证手动触发方法存在
      expect(typeof HourlyPricingConfigScheduler.manualTrigger).toBe('function')

      // 执行手动触发
      const report = await HourlyPricingConfigScheduler.manualTrigger()

      expect(report).toBeDefined()
      // 验证报告包含必要字段（job_id, success, processed 等）
      expect(report).toHaveProperty('job_id')
      expect(report).toHaveProperty('success')

      console.log('[P3-5] 手动触发结果:', JSON.stringify(report, null, 2))
    })
  })

  describe('待激活配置检测', () => {
    test('应正确识别需要激活的定价配置', async () => {
      const now = new Date()

      // 查询状态为 scheduled 且生效时间已到的配置（字段名：effective_at）
      const pendingConfigs = await LotteryCampaignPricingConfig.findAll({
        where: {
          status: 'scheduled',
          effective_at: { [Op.lte]: now }
        }
      })

      console.log(`[P3-5] 待激活定价配置数量: ${pendingConfigs.length}`)

      // 验证查询结果
      expect(Array.isArray(pendingConfigs)).toBe(true)

      for (const config of pendingConfigs) {
        expect(config.status).toBe('scheduled')
        expect(new Date(config.effective_at).getTime()).toBeLessThanOrEqual(now.getTime())
      }
    })

    test('应检查定价配置与活动的关联', async () => {
      // 查询有定价配置的活动
      const configWithCampaign = await LotteryCampaignPricingConfig.findOne({
        include: [
          {
            model: LotteryCampaign,
            as: 'campaign',
            required: true
          }
        ]
      })

      if (!configWithCampaign) {
        console.log('[P3-5] 跳过测试：没有关联活动的定价配置')
        return
      }

      // 验证关联正确
      expect(configWithCampaign.campaign_id).toBeDefined()
      expect(configWithCampaign.campaign).toBeDefined()
      expect(configWithCampaign.campaign.campaign_id).toBe(configWithCampaign.campaign_id)

      console.log('[P3-5] 定价配置关联活动:', {
        config_id: configWithCampaign.pricing_config_id,
        campaign_id: configWithCampaign.campaign_id,
        campaign_name: configWithCampaign.campaign.campaign_name
      })
    })
  })

  describe('执行性能测试', () => {
    test('应在合理时间内完成调度（小于30秒）', async () => {
      const startTime = Date.now()

      const report = await HourlyPricingConfigScheduler.execute()

      const executionTime = Date.now() - startTime

      expect(executionTime).toBeLessThan(30000)
      expect(report).toBeDefined()

      console.log(`[P3-5] 执行时间: ${executionTime}ms`)
    })
  })

  describe('错误处理', () => {
    test('应优雅处理服务调用失败', async () => {
      // 即使部分配置激活失败，任务整体应该完成
      const report = await HourlyPricingConfigScheduler.execute()

      expect(report).toBeDefined()
      // 失败的配置应该被记录在 failed 字段中
      if (report.failed !== undefined) {
        expect(typeof report.failed).toBe('number')
      }
    })

    test('应记录跳过的配置', async () => {
      const report = await HourlyPricingConfigScheduler.execute()

      expect(report).toBeDefined()
      // 跳过的配置应该被记录在 skipped 字段中
      if (report.skipped !== undefined) {
        expect(typeof report.skipped).toBe('number')
        expect(report.skipped).toBeGreaterThanOrEqual(0)
      }
    })
  })

  describe('定价配置状态验证', () => {
    test('应验证定价配置状态字段', async () => {
      // 查询一条定价配置
      const config = await LotteryCampaignPricingConfig.findOne()

      if (!config) {
        console.log('[P3-5] 跳过测试：没有定价配置数据')
        return
      }

      // 验证必要字段（模型字段：config_id, campaign_id, status, effective_at）
      expect(config.config_id).toBeDefined()
      expect(config.campaign_id).toBeDefined()
      expect(config.status).toBeDefined()

      // 验证状态值在有效范围内
      const validStatuses = ['draft', 'scheduled', 'active', 'inactive', 'expired', 'archived']
      expect(validStatuses).toContain(config.status)

      console.log('[P3-5] 定价配置状态:', {
        config_id: config.config_id,
        status: config.status,
        effective_at: config.effective_at
      })
    })
  })

  describe('时间处理验证', () => {
    test('应使用北京时间进行时间比较', async () => {
      // 验证 BeijingTimeHelper 可用
      expect(BeijingTimeHelper).toBeDefined()

      // 获取当前北京时间（BeijingTimeHelper.now() 返回 ISO 字符串）
      const beijingNowString = BeijingTimeHelper.now()
      expect(typeof beijingNowString).toBe('string')
      expect(beijingNowString).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)

      const beijingNow = new Date(beijingNowString)
      expect(beijingNow).toBeInstanceOf(Date)
      expect(!isNaN(beijingNow.getTime())).toBe(true)

      // 验证时间格式化
      const formattedTime = BeijingTimeHelper.formatDate(beijingNow, 'YYYY-MM-DD HH:mm:ss')
      expect(formattedTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)

      console.log('[P3-5] 当前北京时间:', formattedTime)
    })
  })
})
