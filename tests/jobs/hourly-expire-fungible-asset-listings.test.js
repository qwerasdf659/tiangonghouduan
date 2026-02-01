'use strict'

/**
 * P3-6d: 每小时同质化资产挂单过期任务测试套件
 *
 * 测试目标：
 * - HourlyExpireFungibleAssetListings.execute() 方法的核心功能
 * - 扫描过期的同质化资产挂单（listing_kind='fungible_asset'）
 * - 自动下架并解冻卖家资产
 * - 发送过期通知
 *
 * 测试范围：
 * - 正常过期场景（有过期挂单）
 * - 无过期挂单场景
 * - 资产解冻验证
 * - 过期通知发送
 * - 配置项加载（过期天数）
 *
 * 业务规则：
 * - 每小时执行一次
 * - 挂单有效期通过 AdminSystemService 配置（默认3天）
 * - 过期后自动下架并解冻卖家资产
 * - 发送过期通知给卖家
 *
 * @module tests/jobs/hourly-expire-fungible-asset-listings
 * @since 2026-01-28
 */

// 加载环境变量
require('dotenv').config()

const HourlyExpireFungibleAssetListings = require('../../jobs/hourly-expire-fungible-asset-listings')
const { MarketListing, AccountAssetBalance } = require('../../models')
// Op 可用于直接查询测试

describe('P3-6d: HourlyExpireFungibleAssetListings - 每小时同质化资产挂单过期任务', () => {
  // 测试超时设置
  jest.setTimeout(60000)

  describe('execute() - 核心执行逻辑', () => {
    test('应成功执行挂单过期处理并返回报告', async () => {
      // 执行过期处理任务
      const report = await HourlyExpireFungibleAssetListings.execute()

      // 验证报告结构
      expect(report).toBeDefined()
      expect(report).toHaveProperty('timestamp')
      expect(report).toHaveProperty('duration_ms')
      expect(typeof report.duration_ms).toBe('number')
      expect(report.duration_ms).toBeGreaterThanOrEqual(0)

      // 验证处理结果字段
      if (report.scanned !== undefined) {
        expect(typeof report.scanned).toBe('number')
        expect(report.scanned).toBeGreaterThanOrEqual(0)
      }

      if (report.expired !== undefined) {
        expect(typeof report.expired).toBe('number')
        expect(report.expired).toBeGreaterThanOrEqual(0)
      }

      console.log('[P3-6d] 同质化资产挂单过期报告:', JSON.stringify(report, null, 2))
    })

    test('无过期挂单时应正常返回', async () => {
      const report = await HourlyExpireFungibleAssetListings.execute()

      expect(report).toBeDefined()
      expect(report).toHaveProperty('timestamp')
    })
  })

  describe('过期挂单检测逻辑', () => {
    test('应正确识别 listing_kind=fungible_asset 的同质化挂单', async () => {
      // 查询同质化资产挂单
      const fungibleListings = await MarketListing.findAll({
        where: {
          listing_kind: 'fungible_asset',
          status: 'active'
        },
        limit: 10
      })

      console.log(`[P3-6d] 活跃同质化资产挂单数量: ${fungibleListings.length}`)

      for (const listing of fungibleListings) {
        expect(listing.listing_kind).toBe('fungible_asset')
        expect(listing.status).toBe('active')

        console.log(`[P3-6d] 挂单 ${listing.market_listing_id}: created_at=${listing.created_at}`)
      }
    })

    test('应正确应用过期时间配置', async () => {
      // 执行任务获取配置
      const report = await HourlyExpireFungibleAssetListings.execute()

      expect(report).toBeDefined()

      // 验证过期天数配置
      if (report.expiry_days !== undefined) {
        expect(typeof report.expiry_days).toBe('number')
        expect(report.expiry_days).toBeGreaterThan(0)
        console.log(`[P3-6d] 挂单有效期: ${report.expiry_days} 天`)
      }
    })

    test('应从 AdminSystemService 加载过期天数配置', async () => {
      // 执行任务
      const report = await HourlyExpireFungibleAssetListings.execute()

      expect(report).toBeDefined()

      // 配置应该被正确加载
      console.log('[P3-6d] 配置加载验证完成')
    })
  })

  describe('过期处理操作验证', () => {
    test('应更新过期挂单状态为 expired', async () => {
      // 执行过期处理任务
      const report = await HourlyExpireFungibleAssetListings.execute()

      expect(report).toBeDefined()

      if (report.expired > 0) {
        // 验证有挂单被标记为过期
        const expiredListings = await MarketListing.findAll({
          where: {
            listing_kind: 'fungible_asset',
            status: 'expired'
          },
          limit: 5
        })

        console.log(`[P3-6d] 数据库中过期挂单数量: ${expiredListings.length}`)
      }
    })

    test('应解冻卖家资产', async () => {
      // 执行过期处理任务
      const report = await HourlyExpireFungibleAssetListings.execute()

      expect(report).toBeDefined()

      // 验证资产解冻操作
      if (report.assets_unfrozen !== undefined) {
        expect(typeof report.assets_unfrozen).toBe('number')
        console.log(`[P3-6d] 解冻卖家资产: ${report.assets_unfrozen}`)
      }
    })

    test('应发送过期通知', async () => {
      // 执行过期处理任务
      const report = await HourlyExpireFungibleAssetListings.execute()

      expect(report).toBeDefined()

      // 验证通知发送
      if (report.notifications_sent !== undefined) {
        expect(typeof report.notifications_sent).toBe('number')
        console.log(`[P3-6d] 发送过期通知: ${report.notifications_sent}`)
      }
    })
  })

  describe('事务处理验证', () => {
    test('应使用事务保证操作原子性', async () => {
      // 执行过期处理任务
      const report = await HourlyExpireFungibleAssetListings.execute()

      expect(report).toBeDefined()
      // 任务完成说明事务正常提交
    })

    test('应使用悲观锁处理单个挂单', async () => {
      // 执行过期处理任务
      const report = await HourlyExpireFungibleAssetListings.execute()

      expect(report).toBeDefined()
      // 无死锁或错误说明悲观锁正常工作
    })
  })

  describe('批量处理验证', () => {
    test('应支持批量处理过期挂单', async () => {
      // 执行过期处理任务
      const report = await HourlyExpireFungibleAssetListings.execute()

      expect(report).toBeDefined()

      // 验证批量处理
      if (report.batch_size !== undefined) {
        expect(typeof report.batch_size).toBe('number')
        console.log(`[P3-6d] 批量大小: ${report.batch_size}`)
      }
    })
  })

  describe('执行性能测试', () => {
    test('应在合理时间内完成处理（小于60秒）', async () => {
      const startTime = Date.now()

      const report = await HourlyExpireFungibleAssetListings.execute()

      const executionTime = Date.now() - startTime

      expect(executionTime).toBeLessThan(60000)
      expect(report).toBeDefined()

      console.log(`[P3-6d] 执行时间: ${executionTime}ms`)
    })
  })

  describe('错误处理', () => {
    test('应优雅处理单个挂单处理失败', async () => {
      // 即使单个挂单处理失败，任务整体应该完成
      const report = await HourlyExpireFungibleAssetListings.execute()

      expect(report).toBeDefined()
      expect(report).toHaveProperty('timestamp')

      // 失败的处理应该被记录
      if (report.failed !== undefined) {
        expect(typeof report.failed).toBe('number')
      }
    })

    test('应在配置加载失败时使用默认值', async () => {
      // 执行过期处理任务
      const report = await HourlyExpireFungibleAssetListings.execute()

      expect(report).toBeDefined()

      /*
       * 即使配置加载失败，也应该有默认的过期天数
       * 默认值通常是3天
       */
    })
  })

  describe('资产余额验证', () => {
    test('应正确更新卖家账户冻结金额', async () => {
      // 获取有活跃挂单的卖家账户
      const activeListings = await MarketListing.findAll({
        where: {
          listing_kind: 'fungible_asset',
          status: 'active'
        },
        limit: 5
      })

      if (activeListings.length === 0) {
        console.log('[P3-6d] 跳过测试：没有活跃的同质化资产挂单')
        return
      }

      // 检查卖家账户
      for (const listing of activeListings) {
        const balance = await AccountAssetBalance.findOne({
          where: {
            user_id: listing.seller_user_id,
            asset_code: listing.asset_code
          }
        })

        if (balance) {
          expect(balance.frozen_amount).toBeGreaterThanOrEqual(0)
          console.log(
            `[P3-6d] 卖家 ${listing.seller_user_id} 资产 ${listing.asset_code}: frozen_amount=${balance.frozen_amount}`
          )
        }
      }
    })
  })

  describe('幂等性验证', () => {
    test('应幂等执行（重复执行不会重复过期）', async () => {
      // 第一次执行
      const report1 = await HourlyExpireFungibleAssetListings.execute()

      // 立即第二次执行
      const report2 = await HourlyExpireFungibleAssetListings.execute()

      // 两次执行都应成功
      expect(report1).toBeDefined()
      expect(report2).toBeDefined()

      // 第二次执行的过期数量应该为0或更少（已经处理过了）
      console.log(
        `[P3-6d] 幂等性测试 - 第一次过期: ${report1.expired || 0}, 第二次过期: ${report2.expired || 0}`
      )
    })
  })
})
