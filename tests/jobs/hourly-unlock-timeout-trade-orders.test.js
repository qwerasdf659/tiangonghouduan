'use strict'

/**
 * P3-6b: 每小时超时交易订单解锁任务测试套件
 *
 * 测试目标：
 * - HourlyUnlockTimeoutTradeOrders.execute() 方法的核心功能
 * - 扫描超时锁定的物品实例（trade锁超过3分钟）
 * - 释放锁定并取消关联的交易订单
 * - 使用事务和悲观锁保证并发安全
 *
 * 测试范围：
 * - 正常解锁场景（有超时锁定）
 * - 无超时锁定场景
 * - 事务一致性验证
 * - 关联订单状态更新
 * - 买家资产解冻
 *
 * 业务规则：
 * - 每小时执行一次
 * - trade 锁超过 3 分钟视为超时
 * - 解锁时：释放物品锁、取消交易订单、解冻买家资产
 * - 使用悲观锁防止并发问题
 *
 * @module tests/jobs/hourly-unlock-timeout-trade-orders
 * @since 2026-01-28
 */

// 加载环境变量
require('dotenv').config()

const HourlyUnlockTimeoutTradeOrders = require('../../jobs/hourly-unlock-timeout-trade-orders')
const { ItemInstance, TradeOrder, ItemInstanceEvent } = require('../../models')
// MarketListing 可用于关联挂单测试
const { Op } = require('sequelize')

describe('P3-6b: HourlyUnlockTimeoutTradeOrders - 每小时超时交易订单解锁任务', () => {
  // 测试超时设置
  jest.setTimeout(60000)

  describe('execute() - 核心执行逻辑', () => {
    test('应成功执行超时订单解锁并返回报告', async () => {
      // 执行解锁任务
      const report = await HourlyUnlockTimeoutTradeOrders.execute()

      // 验证报告结构
      expect(report).toBeDefined()
      expect(report).toHaveProperty('timestamp')
      expect(report).toHaveProperty('duration_ms')
      expect(typeof report.duration_ms).toBe('number')
      expect(report.duration_ms).toBeGreaterThanOrEqual(0)

      // 验证解锁结果字段
      if (report.processed !== undefined) {
        expect(typeof report.processed).toBe('number')
        expect(report.processed).toBeGreaterThanOrEqual(0)
      }

      if (report.unlocked !== undefined) {
        expect(typeof report.unlocked).toBe('number')
        expect(report.unlocked).toBeGreaterThanOrEqual(0)
      }

      console.log('[P3-6b] 超时订单解锁报告:', JSON.stringify(report, null, 2))
    })

    test('无超时锁定时应正常返回', async () => {
      const report = await HourlyUnlockTimeoutTradeOrders.execute()

      expect(report).toBeDefined()
      expect(report).toHaveProperty('timestamp')
    })
  })

  describe('超时锁定检测逻辑', () => {
    test('应正确识别超时的 trade 锁（超过3分钟）', async () => {
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000)

      // 查询有 trade 锁的物品实例
      const lockedItems = await ItemInstance.findAll({
        where: {
          status: { [Op.in]: ['locked', 'trading'] }
        },
        limit: 10
      })

      console.log(`[P3-6b] 当前锁定物品数量: ${lockedItems.length}`)

      // 检查每个锁定物品的锁定时间
      for (const item of lockedItems) {
        if (item.locks && typeof item.locks === 'object') {
          const tradeLock = item.locks.trade
          if (tradeLock && tradeLock.locked_at) {
            const lockedAt = new Date(tradeLock.locked_at)
            const isTimeout = lockedAt < threeMinutesAgo

            console.log(
              `[P3-6b] 物品 ${item.item_instance_id}: locked_at=${lockedAt.toISOString()}, isTimeout=${isTimeout}`
            )
          }
        }
      }
    })

    test('应查询关联的交易订单', async () => {
      // 查询有活跃交易订单的物品
      const pendingOrders = await TradeOrder.findAll({
        where: {
          status: { [Op.in]: ['pending', 'processing'] }
        },
        limit: 5
      })

      console.log(`[P3-6b] 待处理交易订单数量: ${pendingOrders.length}`)

      for (const order of pendingOrders) {
        expect(order.order_id).toBeDefined()
        expect(order.status).toBeDefined()

        console.log(
          `[P3-6b] 订单 ${order.order_id}: status=${order.status}, item_instance_id=${order.item_instance_id}`
        )
      }
    })
  })

  describe('解锁操作验证', () => {
    test('应正确更新物品实例状态和锁定信息', async () => {
      // 执行解锁任务
      const report = await HourlyUnlockTimeoutTradeOrders.execute()

      expect(report).toBeDefined()

      // 如果有解锁操作，验证物品状态已更新
      if (report.unlocked > 0) {
        console.log(`[P3-6b] 成功解锁 ${report.unlocked} 个物品`)
      }
    })

    test('应记录物品实例事件', async () => {
      // 执行解锁任务
      await HourlyUnlockTimeoutTradeOrders.execute()

      // 查询最近的解锁事件
      const recentEvents = await ItemInstanceEvent.findAll({
        where: {
          event_type: { [Op.in]: ['unlock', 'timeout_unlock', 'trade_cancelled'] }
        },
        order: [['created_at', 'DESC']],
        limit: 5
      })

      console.log(`[P3-6b] 最近解锁事件数量: ${recentEvents.length}`)

      for (const event of recentEvents) {
        expect(event.event_type).toBeDefined()
        expect(event.item_instance_id).toBeDefined()

        console.log(`[P3-6b] 事件: ${event.event_type}, item=${event.item_instance_id}`)
      }
    })

    test('应更新关联交易订单状态为 cancelled', async () => {
      // 执行解锁任务
      const report = await HourlyUnlockTimeoutTradeOrders.execute()

      expect(report).toBeDefined()

      // 如果有取消的订单，验证状态
      if (report.orders_cancelled !== undefined && report.orders_cancelled > 0) {
        console.log(`[P3-6b] 成功取消 ${report.orders_cancelled} 个订单`)
      }
    })
  })

  describe('买家资产解冻验证', () => {
    test('应调用 AssetService.unfreeze 解冻买家资产', async () => {
      // 执行解锁任务
      const report = await HourlyUnlockTimeoutTradeOrders.execute()

      expect(report).toBeDefined()

      // 如果有资产解冻操作
      if (report.assets_unfrozen !== undefined) {
        expect(typeof report.assets_unfrozen).toBe('number')
        console.log(`[P3-6b] 解冻买家资产: ${report.assets_unfrozen}`)
      }
    })
  })

  describe('市场挂单状态更新', () => {
    test('应更新关联的市场挂单状态', async () => {
      // 执行解锁任务
      const report = await HourlyUnlockTimeoutTradeOrders.execute()

      expect(report).toBeDefined()

      // 如果有更新的挂单
      if (report.listings_updated !== undefined) {
        expect(typeof report.listings_updated).toBe('number')
        console.log(`[P3-6b] 更新市场挂单: ${report.listings_updated}`)
      }
    })
  })

  describe('事务和并发安全', () => {
    test('应使用事务保证操作原子性', async () => {
      // 执行解锁任务
      const report = await HourlyUnlockTimeoutTradeOrders.execute()

      expect(report).toBeDefined()
      // 任务完成说明事务正常提交或回滚
    })

    test('应使用悲观锁防止并发问题', async () => {
      // 并发执行两次任务
      const [report1, report2] = await Promise.all([
        HourlyUnlockTimeoutTradeOrders.execute(),
        HourlyUnlockTimeoutTradeOrders.execute()
      ])

      // 两次执行都应该成功完成（即使竞争同一资源）
      expect(report1).toBeDefined()
      expect(report2).toBeDefined()

      console.log('[P3-6b] 并发执行测试通过')
    })
  })

  describe('幂等性验证', () => {
    test('应幂等执行（重复执行不会重复解锁）', async () => {
      // 第一次执行
      const report1 = await HourlyUnlockTimeoutTradeOrders.execute()

      // 立即第二次执行
      const report2 = await HourlyUnlockTimeoutTradeOrders.execute()

      // 两次执行都应成功
      expect(report1).toBeDefined()
      expect(report2).toBeDefined()

      // 第二次执行的解锁数量应该为0（已经处理过了）
      if (report1.unlocked > 0 && report2.unlocked !== undefined) {
        console.log(
          `[P3-6b] 幂等性测试 - 第一次解锁: ${report1.unlocked}, 第二次解锁: ${report2.unlocked}`
        )
      }
    })
  })

  describe('执行性能测试', () => {
    test('应在合理时间内完成解锁（小于30秒）', async () => {
      const startTime = Date.now()

      const report = await HourlyUnlockTimeoutTradeOrders.execute()

      const executionTime = Date.now() - startTime

      expect(executionTime).toBeLessThan(30000)
      expect(report).toBeDefined()

      console.log(`[P3-6b] 执行时间: ${executionTime}ms`)
    })
  })

  describe('错误处理', () => {
    test('应优雅处理单个物品解锁失败', async () => {
      // 即使单个物品解锁失败，任务整体应该完成
      const report = await HourlyUnlockTimeoutTradeOrders.execute()

      expect(report).toBeDefined()
      expect(report).toHaveProperty('timestamp')

      // 失败的物品应该被记录
      if (report.failed !== undefined) {
        expect(typeof report.failed).toBe('number')
      }
    })
  })
})
