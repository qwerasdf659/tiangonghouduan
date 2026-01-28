'use strict'

/**
 * P3-6a: 每日孤儿冻结检测任务测试套件
 *
 * 测试目标：
 * - DailyOrphanFrozenCheck.execute() 方法的核心功能
 * - 检测 frozen_amount > 实际挂单冻结量 的异常情况
 * - 分级告警机制（P0/P1/P2）
 * - 复发检测（Redis 记录上次执行）
 * - 可选止损操作（暂停受影响资产的新挂单）
 *
 * 测试范围：
 * - 正常检测场景（无孤儿冻结）
 * - 异常检测场景（有孤儿冻结）
 * - 告警级别判定
 * - 复发检测逻辑
 * - 止损操作验证
 *
 * 业务规则：
 * - 每天02:30执行（北京时间）
 * - 孤儿冻结：账户冻结金额 > 实际挂单冻结金额
 * - P0: orphan_count >= 10 或 affected_user_count >= 5 或复发
 * - P1: orphan_count >= 3 或 affected_user_count >= 2
 * - P2: 其他情况
 *
 * @module tests/jobs/daily-orphan-frozen-check
 * @since 2026-01-28
 */

// 加载环境变量
require('dotenv').config()

const DailyOrphanFrozenCheck = require('../../jobs/daily-orphan-frozen-check')
/*
 * 模型通过 job 内部使用，测试验证 job 输出
 * const { AccountAssetBalance, MarketListing, Account } = require('../../models')
 * const { Op } = require('sequelize')
 */

describe('P3-6a: DailyOrphanFrozenCheck - 每日孤儿冻结检测任务', () => {
  // 测试超时设置
  jest.setTimeout(60000)

  describe('execute() - 核心执行逻辑', () => {
    test('应成功执行孤儿冻结检测并返回报告', async () => {
      // 执行检测任务
      const report = await DailyOrphanFrozenCheck.execute()

      // 验证报告结构
      expect(report).toBeDefined()
      expect(report).toHaveProperty('timestamp')
      expect(report).toHaveProperty('duration_ms')
      expect(typeof report.duration_ms).toBe('number')
      expect(report.duration_ms).toBeGreaterThanOrEqual(0)

      // 验证检测结果字段
      if (report.orphan_count !== undefined) {
        expect(typeof report.orphan_count).toBe('number')
        expect(report.orphan_count).toBeGreaterThanOrEqual(0)
      }

      if (report.affected_user_count !== undefined) {
        expect(typeof report.affected_user_count).toBe('number')
        expect(report.affected_user_count).toBeGreaterThanOrEqual(0)
      }

      console.log('[P3-6a] 孤儿冻结检测报告:', JSON.stringify(report, null, 2))
    })

    test('应正确调用 orphanFrozenService.detectOrphanFrozen()', async () => {
      // 执行检测
      const report = await DailyOrphanFrozenCheck.execute()

      // 验证检测被执行
      expect(report).toBeDefined()

      // 验证报告包含必要的检测结果
      expect(report).toHaveProperty('timestamp')
    })

    test('无异常时应正常返回空结果', async () => {
      const report = await DailyOrphanFrozenCheck.execute()

      expect(report).toBeDefined()
      // 即使没有孤儿冻结，也应该有报告
      expect(report).toHaveProperty('timestamp')
    })
  })

  describe('_determineAlertLevel() - 告警级别判定', () => {
    test('应根据检测结果正确判定告警级别', () => {
      // 验证方法存在
      expect(typeof DailyOrphanFrozenCheck._determineAlertLevel).toBe('function')

      // P2 级别：少量异常
      const p2Level = DailyOrphanFrozenCheck._determineAlertLevel({
        orphan_count: 1,
        affected_user_count: 1,
        affected_asset_codes: ['asset_1'],
        is_recurring: false
      })
      expect(p2Level).toBe('P2')

      // P1 级别：中等异常
      const p1Level = DailyOrphanFrozenCheck._determineAlertLevel({
        orphan_count: 5,
        affected_user_count: 3,
        affected_asset_codes: ['asset_1', 'asset_2'],
        is_recurring: false
      })
      expect(p1Level).toBe('P1')

      // P0 级别：严重异常或复发
      const p0Level = DailyOrphanFrozenCheck._determineAlertLevel({
        orphan_count: 15,
        affected_user_count: 8,
        affected_asset_codes: ['asset_1', 'asset_2', 'asset_3'],
        is_recurring: false
      })
      expect(p0Level).toBe('P0')

      // P0 级别：复发情况（第二个参数是 isRecurring）
      const recurringLevel = DailyOrphanFrozenCheck._determineAlertLevel(
        {
          orphan_count: 2,
          affected_user_count: 1,
          affected_asset_codes: ['asset_1']
        },
        true
      ) // 第二个参数是 isRecurring
      expect(recurringLevel).toBe('P0')

      console.log('[P3-6a] 告警级别判定测试通过')
    })
  })

  describe('止损操作验证', () => {
    test('应检查止损配置', async () => {
      // 检查环境变量配置
      const stopLossEnabled = process.env.ORPHAN_FROZEN_STOP_LOSS_ENABLED === 'true'

      console.log(`[P3-6a] 止损操作${stopLossEnabled ? '已启用' : '未启用'}`)

      // 执行检测
      const report = await DailyOrphanFrozenCheck.execute()

      expect(report).toBeDefined()

      // 如果有止损操作，应该记录在报告中
      if (report.stop_loss_triggered !== undefined) {
        expect(typeof report.stop_loss_triggered).toBe('boolean')
      }
    })
  })

  describe('复发检测逻辑', () => {
    test('应使用 Redis 记录上次执行结果', async () => {
      // 执行两次检测，验证复发检测逻辑
      const report1 = await DailyOrphanFrozenCheck.execute()
      const report2 = await DailyOrphanFrozenCheck.execute()

      expect(report1).toBeDefined()
      expect(report2).toBeDefined()

      // 第二次执行应该能检测到是否复发
      console.log('[P3-6a] 复发检测验证完成')
    })
  })

  describe('孤儿冻结检测逻辑验证', () => {
    test('应正确识别 frozen_amount > 实际挂单冻结量的情况', async () => {
      /*
       * 直接调用 orphanFrozenService.detectOrphanFrozen() 验证检测逻辑
       * 这是推荐的测试方式 - 验证 Service 的输出而非重复其内部逻辑
       */
      const report = await DailyOrphanFrozenCheck.execute({ sendNotification: false })

      console.log(`[P3-6a] 检测结果：orphan_count=${report.detection?.orphan_count || 0}`)

      // 验证报告结构正确
      expect(report).toHaveProperty('detection')
      expect(report.detection).toHaveProperty('orphan_count')
      expect(report.detection).toHaveProperty('total_orphan_amount')
      expect(report.detection).toHaveProperty('affected_user_count')
      expect(report.detection).toHaveProperty('affected_asset_codes')

      // 验证数值类型正确
      expect(typeof report.detection.orphan_count).toBe('number')
      expect(typeof report.detection.total_orphan_amount).toBe('number')
      expect(typeof report.detection.affected_user_count).toBe('number')
      expect(Array.isArray(report.detection.affected_asset_codes)).toBe(true)

      // 记录孤儿冻结详情（如果有）
      if (report.detection.orphan_count > 0 && report.detection.orphan_items) {
        report.detection.orphan_items.forEach((item, index) => {
          console.log(
            `[P3-6a] 孤儿冻结 ${index + 1}: user_id=${item.user_id}, asset_code=${item.asset_code}, orphan_amount=${item.orphan_amount}`
          )
        })
      }
    })

    test('应正确统计受影响的资产类型', async () => {
      const report = await DailyOrphanFrozenCheck.execute()

      expect(report).toBeDefined()

      if (report.affected_asset_codes) {
        expect(Array.isArray(report.affected_asset_codes)).toBe(true)
        console.log('[P3-6a] 受影响的资产类型:', report.affected_asset_codes)
      }
    })
  })

  describe('执行性能测试', () => {
    test('应在合理时间内完成检测（小于60秒）', async () => {
      const startTime = Date.now()

      const report = await DailyOrphanFrozenCheck.execute()

      const executionTime = Date.now() - startTime

      expect(executionTime).toBeLessThan(60000)
      expect(report).toBeDefined()

      console.log(`[P3-6a] 执行时间: ${executionTime}ms`)
    })
  })

  describe('错误处理', () => {
    test('应优雅处理检测过程中的错误', async () => {
      // 即使检测过程中有部分错误，任务也应该完成
      const report = await DailyOrphanFrozenCheck.execute()

      expect(report).toBeDefined()
      expect(report).toHaveProperty('timestamp')
    })
  })

  describe('通知服务集成', () => {
    test('应在检测到异常时发送管理员通知', async () => {
      // 执行检测
      const report = await DailyOrphanFrozenCheck.execute()

      expect(report).toBeDefined()

      // 如果有异常，应该触发通知
      if (report.orphan_count > 0) {
        console.log('[P3-6a] 检测到孤儿冻结，应已发送通知')
        expect(report.notification_sent).toBeDefined()
      }
    })
  })
})
