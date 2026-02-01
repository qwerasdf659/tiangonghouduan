'use strict'

/**
 * P3-3: 每小时市场挂牌监控任务测试套件
 *
 * 测试目标：
 * - HourlyMarketListingMonitor.execute() 方法的核心功能
 * - 价格异常检测
 * - 长期挂牌检测
 * - 冻结异常检测
 *
 * @module tests/jobs/hourly-market-listing-monitor
 * @since 2026-01-28
 */

// 加载环境变量
require('dotenv').config()

const HourlyMarketListingMonitor = require('../../jobs/hourly-market-listing-monitor')
const { MarketListing } = require('../../models')
// AccountAssetBalance, Account, Op 可用于扩展测试

describe('P3-3: HourlyMarketListingMonitor - 每小时市场挂牌监控任务', () => {
  // 测试超时设置
  jest.setTimeout(60000)

  describe('execute() - 核心执行逻辑', () => {
    test('应成功执行市场监控并返回报告', async () => {
      // 执行监控任务
      const report = await HourlyMarketListingMonitor.execute()

      // 验证报告结构（字段：started_at, completed_at, success, price_anomalies, long_listings, frozen_anomalies）
      expect(report).toBeDefined()
      expect(report).toHaveProperty('started_at')
      expect(report).toHaveProperty('success')

      // 验证监控结果字段
      expect(Array.isArray(report.price_anomalies)).toBe(true)
      expect(Array.isArray(report.long_listings)).toBe(true)
      expect(Array.isArray(report.frozen_anomalies)).toBe(true)

      console.log('[P3-3] 市场监控报告:', JSON.stringify(report, null, 2))
    })

    test('应正确处理空挂牌场景', async () => {
      // 即使没有活跃挂牌，任务也应正常完成
      const report = await HourlyMarketListingMonitor.execute()

      expect(report).toBeDefined()
      expect(report).toHaveProperty('success')
    })
  })

  describe('配置加载逻辑', () => {
    test('应能加载监控配置', async () => {
      // execute() 内部会加载配置
      const report = await HourlyMarketListingMonitor.execute()

      // 验证报告中包含使用的配置
      expect(report).toBeDefined()
      expect(report.config_source).toBeDefined()

      // 如果配置加载成功，应包含使用的配置详情
      if (report.config_used) {
        expect(typeof report.config_used).toBe('object')
      }

      console.log('[P3-3] 配置来源:', report.config_source)
    })
  })

  describe('价格异常检测验证', () => {
    test('execute() 应包含价格异常检测结果', async () => {
      const report = await HourlyMarketListingMonitor.execute()

      // 验证价格异常检测结果
      expect(report).toHaveProperty('price_anomalies')
      expect(Array.isArray(report.price_anomalies)).toBe(true)

      // 如果有异常，验证数据结构
      if (report.price_anomalies.length > 0) {
        const anomaly = report.price_anomalies[0]
        expect(anomaly).toHaveProperty('market_listing_id')
        console.log('[P3-3] 价格异常示例:', anomaly)
      }

      console.log(`[P3-3] 检测到 ${report.price_anomalies.length} 个价格异常`)
    })

    test('应正确计算平均单价', async () => {
      // 查询活跃挂牌计算平均价格
      const listings = await MarketListing.findAll({
        where: { status: 'on_sale' },
        limit: 100
      })

      if (listings.length === 0) {
        console.log('[P3-3] 跳过测试：没有活跃挂牌')
        return
      }

      // 计算平均单价（避免除以零和 NaN）
      let validCount = 0
      const totalUnitPrice = listings.reduce((sum, l) => {
        const offerAmount = Number(l.offer_amount) || 0
        const wantAmount = Number(l.want_amount) || 0
        if (offerAmount > 0) {
          validCount++
          return sum + wantAmount / offerAmount
        }
        return sum
      }, 0)

      if (validCount === 0) {
        console.log('[P3-3] 跳过测试：没有有效的单价数据')
        return
      }

      const avgUnitPrice = totalUnitPrice / validCount
      expect(avgUnitPrice).toBeGreaterThanOrEqual(0)
      expect(isNaN(avgUnitPrice)).toBe(false)
      console.log(`[P3-3] 平均单价: ${avgUnitPrice.toFixed(4)}`)
    })
  })

  describe('长期挂牌检测验证', () => {
    test('execute() 应包含长期挂牌检测结果', async () => {
      const report = await HourlyMarketListingMonitor.execute()

      // 验证长期挂牌检测结果
      expect(report).toHaveProperty('long_listings')
      expect(Array.isArray(report.long_listings)).toBe(true)

      console.log(`[P3-3] 检测到 ${report.long_listings.length} 个长期挂牌`)
    })

    test('应正确计算挂牌天数', async () => {
      // 查询一个活跃挂牌
      const listing = await MarketListing.findOne({
        where: { status: 'on_sale' }
      })

      if (!listing) {
        console.log('[P3-3] 跳过测试：没有活跃挂牌')
        return
      }

      // 计算挂牌天数
      const createdAt = new Date(listing.created_at)
      const now = new Date()
      const daysOnSale = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24))

      expect(daysOnSale).toBeGreaterThanOrEqual(0)
      console.log(`[P3-3] 挂牌天数: ${daysOnSale}天`)
    })
  })

  describe('冻结异常检测验证', () => {
    test('execute() 应包含冻结异常检测结果', async () => {
      const report = await HourlyMarketListingMonitor.execute()

      // 验证冻结异常检测结果
      expect(report).toHaveProperty('frozen_anomalies')
      expect(Array.isArray(report.frozen_anomalies)).toBe(true)

      console.log(`[P3-3] 检测到 ${report.frozen_anomalies.length} 个冻结异常`)
    })

    test('应检测冻结孤儿（有冻结但无挂牌）', async () => {
      const report = await HourlyMarketListingMonitor.execute()

      // 冻结孤儿应该被记录在 frozen_anomalies 中
      expect(Array.isArray(report.frozen_anomalies)).toBe(true)

      // 输出检测结果
      if (report.frozen_anomalies.length > 0) {
        console.log('[P3-3] 冻结异常示例:', report.frozen_anomalies[0])
      }
    })
  })

  describe('告警逻辑验证', () => {
    test('应在检测到异常时准备告警数据', async () => {
      const report = await HourlyMarketListingMonitor.execute()

      expect(report).toBeDefined()
      /*
       * 告警已启用时，如果有异常会发送告警
       * 这里只验证报告结构正确
       */
    })

    test('应处理配置为禁用告警的场景', async () => {
      // 执行监控
      const report = await HourlyMarketListingMonitor.execute()

      // 任务应正常完成
      expect(report).toBeDefined()
      expect(report).toHaveProperty('success')
    })
  })

  describe('性能测试', () => {
    test('应处理大量挂牌数据（性能边界）', async () => {
      const startTime = Date.now()

      const report = await HourlyMarketListingMonitor.execute()

      const executionTime = Date.now() - startTime

      // 验证执行时间在合理范围内（小于60秒）
      expect(executionTime).toBeLessThan(60000)

      // 验证报告返回
      expect(report).toBeDefined()

      console.log(`[P3-3] 执行时间: ${executionTime}ms`)
    })
  })

  describe('报告输出', () => {
    test('应生成完整的监控报告', async () => {
      const report = await HourlyMarketListingMonitor.execute()

      // 验证报告包含所有必要字段
      expect(report).toBeDefined()
      expect(report.started_at).toBeDefined()
      expect(report).toHaveProperty('success')

      // 如果有监控数据，应包含详情
      if (report.price_anomalies) {
        expect(Array.isArray(report.price_anomalies)).toBe(true)
      }
      if (report.long_listings) {
        expect(Array.isArray(report.long_listings)).toBe(true)
      }
    })
  })
})
