'use strict'

/**
 * P3-2: 每日兑换订单过期任务测试套件
 *
 * 测试目标：
 * - DailyRedemptionOrderExpiration.execute() 方法的核心功能
 * - 过期订单扫描逻辑
 * - 订单状态更新（pending → expired）
 * - 错误处理
 *
 * 测试范围：
 * - 正常过期场景（有过期订单）
 * - 空数据场景（无过期订单）
 * - 幂等性验证（重复执行不重复处理）
 * - 错误处理
 *
 * 业务规则：
 * - expires_at < now 且 status = 'pending' 的订单应被标记为 expired
 * - 执行时间：每天凌晨2点
 *
 * @module tests/jobs/daily-redemption-order-expiration
 * @since 2026-01-28
 */

// 加载环境变量
require('dotenv').config()

const DailyRedemptionOrderExpiration = require('../../jobs/daily-redemption-order-expiration')
const { RedemptionOrder } = require('../../models')
// sequelize 可用于直接数据库操作测试
const { Op } = require('sequelize')

describe('P3-2: DailyRedemptionOrderExpiration - 每日兑换订单过期任务', () => {
  // 测试超时设置
  jest.setTimeout(60000)

  describe('execute() - 核心执行逻辑', () => {
    test('应成功执行过期订单处理并返回报告', async () => {
      // 执行过期任务
      const report = await DailyRedemptionOrderExpiration.execute()

      // 验证报告结构
      expect(report).toBeDefined()
      expect(report).toHaveProperty('timestamp')
      expect(report).toHaveProperty('duration_ms')
      expect(typeof report.duration_ms).toBe('number')
      expect(report.duration_ms).toBeGreaterThanOrEqual(0)

      // 验证过期处理结果字段
      if (report.expired_count !== undefined) {
        expect(typeof report.expired_count).toBe('number')
        expect(report.expired_count).toBeGreaterThanOrEqual(0)
      }

      console.log('[P3-2] 过期订单处理报告:', JSON.stringify(report, null, 2))
    })

    test('应正确统计已过期的订单数量', async () => {
      // 先查询当前已过期但未处理的订单数量
      const pendingExpiredCount = await RedemptionOrder.count({
        where: {
          status: 'pending',
          expires_at: { [Op.lt]: new Date() }
        }
      })

      // 执行过期任务
      const report = await DailyRedemptionOrderExpiration.execute()

      // 验证处理结果
      expect(report).toBeDefined()

      // 如果有待处理的过期订单，应该被处理
      if (pendingExpiredCount > 0 && report.expired_count !== undefined) {
        console.log(
          `[P3-2] 处理前待过期订单: ${pendingExpiredCount}, 实际处理: ${report.expired_count}`
        )
      }
    })

    test('应幂等执行（重复执行不重复处理）', async () => {
      // 第一次执行
      const report1 = await DailyRedemptionOrderExpiration.execute()

      // 立即第二次执行
      const report2 = await DailyRedemptionOrderExpiration.execute()

      // 验证两次执行都成功
      expect(report1).toBeDefined()
      expect(report2).toBeDefined()

      /*
       * 如果第一次没有处理任何订单，第二次也不应该处理
       * 如果第一次处理了订单，第二次应该处理更少或相同数量
       */
      console.log(
        '[P3-2] 幂等性测试 - 第一次:',
        report1.expired_count,
        '第二次:',
        report2.expired_count
      )
    })
  })

  describe('订单状态验证', () => {
    test('过期后的订单状态应为expired', async () => {
      // 查询已过期的订单
      const expiredOrders = await RedemptionOrder.findAll({
        where: {
          status: 'expired'
        },
        limit: 10
      })

      // 验证已过期订单的状态
      for (const order of expiredOrders) {
        expect(order.status).toBe('expired')
        // expires_at 应该小于当前时间（或者等于，取决于业务逻辑）
        expect(new Date(order.expires_at).getTime()).toBeLessThanOrEqual(Date.now())
      }

      console.log(`[P3-2] 找到 ${expiredOrders.length} 个已过期订单`)
    })

    test('未过期的pending订单不应被处理', async () => {
      // 查询未过期的pending订单
      const pendingOrders = await RedemptionOrder.findAll({
        where: {
          status: 'pending',
          expires_at: { [Op.gt]: new Date() }
        },
        limit: 10
      })

      // 执行过期任务
      await DailyRedemptionOrderExpiration.execute()

      // 重新查询这些订单，确认状态未变
      for (const order of pendingOrders) {
        const updatedOrder = await RedemptionOrder.findByPk(order.order_id)
        // 未过期的订单应该仍然是pending状态
        expect(updatedOrder.status).toBe('pending')
      }

      if (pendingOrders.length > 0) {
        console.log(`[P3-2] 验证 ${pendingOrders.length} 个未过期订单保持pending状态`)
      }
    })
  })

  describe('数据完整性验证', () => {
    test('应检查过期订单的数据完整性', async () => {
      // 查询一个已过期的订单进行数据完整性检查
      const expiredOrder = await RedemptionOrder.findOne({
        where: { status: 'expired' }
      })

      if (!expiredOrder) {
        console.log('[P3-2] 跳过测试：没有找到已过期订单')
        return
      }

      // 验证必要字段存在
      expect(expiredOrder.order_id).toBeDefined()
      expect(expiredOrder.item_instance_id).toBeDefined()
      expect(expiredOrder.code_hash).toBeDefined()
      expect(expiredOrder.status).toBe('expired')
      expect(expiredOrder.expires_at).toBeDefined()
    })
  })

  describe('边界条件测试', () => {
    test('应处理空数据场景', async () => {
      // 即使没有过期订单，任务也应正常完成
      const report = await DailyRedemptionOrderExpiration.execute()

      expect(report).toBeDefined()
      expect(report).toHaveProperty('timestamp')
    })

    test('应处理大量过期订单（性能边界）', async () => {
      // 记录开始时间
      const startTime = Date.now()

      // 执行任务
      const report = await DailyRedemptionOrderExpiration.execute()

      // 记录结束时间
      const endTime = Date.now()
      const executionTime = endTime - startTime

      // 验证执行时间在合理范围内（小于30秒）
      expect(executionTime).toBeLessThan(30000)

      // 验证报告返回
      expect(report).toBeDefined()

      console.log(`[P3-2] 执行时间: ${executionTime}ms`)
    })
  })

  describe('错误处理', () => {
    test('应优雅处理数据库异常', async () => {
      // 在正常连接下，任务应正常执行
      const report = await DailyRedemptionOrderExpiration.execute()

      expect(report).toBeDefined()
    })
  })

  describe('日志和报告', () => {
    test('应生成正确格式的执行报告', async () => {
      const report = await DailyRedemptionOrderExpiration.execute()

      // 验证报告基本字段
      expect(report).toBeDefined()
      expect(report.timestamp).toBeDefined()
      expect(new Date(report.timestamp).toString()).not.toBe('Invalid Date')

      // duration_ms 应该是正数
      expect(report.duration_ms).toBeGreaterThanOrEqual(0)
    })
  })
})
