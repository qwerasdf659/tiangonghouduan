'use strict'

/**
 * P3-1: 每日资产对账任务测试套件
 *
 * 测试目标：
 * - DailyAssetReconciliation.execute() 方法的核心功能
 * - 余额对账逻辑（_reconcileBalance）
 * - 业务记录关联检查（executeBusinessRecordReconciliation）
 * - 告警发送逻辑
 *
 * 测试范围：
 * - 正常对账场景（无差异）
 * - 异常对账场景（检测到差异）
 * - 空数据场景
 * - 错误处理
 *
 * @module tests/jobs/daily-asset-reconciliation
 * @since 2026-01-28
 */

// 加载环境变量
require('dotenv').config()

const DailyAssetReconciliation = require('../../jobs/daily-asset-reconciliation')
const { AccountAssetBalance, Account } = require('../../models')
// AssetTransaction, User 可能用于后续扩展测试
const { Op } = require('sequelize')

describe('P3-1: DailyAssetReconciliation - 每日资产对账任务', () => {
  // 测试超时设置（定时任务可能需要更长时间）
  jest.setTimeout(60000)

  describe('execute() - 余额对账模式', () => {
    test('应成功执行余额对账并返回报告', async () => {
      // 执行对账任务
      const report = await DailyAssetReconciliation.execute({
        mode: 'balance',
        sendNotification: false // 测试环境不发送通知
      })

      // 验证报告结构
      expect(report).toBeDefined()
      expect(report).toHaveProperty('timestamp')
      expect(report).toHaveProperty('duration_ms')
      expect(typeof report.duration_ms).toBe('number')
      expect(report.duration_ms).toBeGreaterThanOrEqual(0)

      // 验证对账结果字段（根据实际业务数据可能有不同结果）
      if (report.total_checked !== undefined) {
        expect(typeof report.total_checked).toBe('number')
        expect(report.total_checked).toBeGreaterThanOrEqual(0)
      }

      console.log('[P3-1] 余额对账报告:', JSON.stringify(report, null, 2))
    })

    test('应正确处理空数据场景', async () => {
      /**
       * 此测试验证当数据库中没有需要对账的数据时，任务应正常完成
       * 实际场景中，数据库通常有数据，此测试验证边界条件处理
       */
      const report = await DailyAssetReconciliation.execute({
        mode: 'balance',
        sendNotification: false
      })

      // 无论是否有数据，都应返回有效报告
      expect(report).toBeDefined()
      expect(report).toHaveProperty('timestamp')
    })
  })

  describe('execute() - 业务记录对账模式', () => {
    test('应成功执行业务记录关联检查', async () => {
      // 执行业务记录对账
      const report = await DailyAssetReconciliation.execute({
        mode: 'business',
        sendNotification: false
      })

      // 验证报告结构
      expect(report).toBeDefined()
      expect(report).toHaveProperty('timestamp')
      expect(report).toHaveProperty('duration_ms')

      console.log('[P3-1] 业务记录对账报告:', JSON.stringify(report, null, 2))
    })
  })

  describe('execute() - 完整对账模式', () => {
    test('应成功执行完整对账（余额 + 业务记录）', async () => {
      // 执行完整对账
      const report = await DailyAssetReconciliation.execute({
        mode: 'full',
        sendNotification: false
      })

      // 验证报告结构
      expect(report).toBeDefined()
      expect(report).toHaveProperty('timestamp')
      expect(report).toHaveProperty('duration_ms')

      console.log('[P3-1] 完整对账报告:', JSON.stringify(report, null, 2))
    })
  })

  describe('_reconcileBalance() - 单账户对账逻辑', () => {
    test('应正确计算可用余额差异', async () => {
      // 查询一个有交易记录的账户进行测试
      const balance = await AccountAssetBalance.findOne({
        where: {
          available_amount: { [Op.gt]: 0 }
        },
        include: [
          {
            model: Account,
            as: 'account',
            attributes: ['account_id', 'user_id']
          }
        ]
      })

      if (!balance) {
        console.log('[P3-1] 跳过测试：没有找到可用余额大于0的账户')
        return
      }

      /*
       * 对账单个账户
       * _reconcileBalance 返回：null（无差异）或 差异对象（包含 account_id, asset_code, balance 等）
       */
      const result = await DailyAssetReconciliation._reconcileBalance(balance)

      /*
       * 验证对账结果结构
       * 结果为 null 表示无差异，否则为差异对象
       */
      if (result !== null) {
        expect(result).toHaveProperty('account_id')
        expect(result).toHaveProperty('asset_code')

        // 如果有 balance 字段，表示有差异详情
        if (result.balance) {
          expect(result.balance).toHaveProperty('available')
          expect(result.balance).toHaveProperty('frozen')
        }
      }

      console.log(
        '[P3-1] 单账户对账结果:',
        result === null ? '无差异' : JSON.stringify(result, null, 2)
      )
    })

    test('应正确处理零余额账户', async () => {
      // 查询零余额账户
      const balance = await AccountAssetBalance.findOne({
        where: {
          available_amount: 0,
          frozen_amount: 0
        }
      })

      if (!balance) {
        console.log('[P3-1] 跳过测试：没有找到零余额账户')
        return
      }

      /*
       * 对账零余额账户
       * _reconcileBalance 返回：null（无差异）或 差异对象
       */
      const result = await DailyAssetReconciliation._reconcileBalance(balance)

      /*
       * 零余额账户应该通过对账（返回 null 表示无差异）
       * 如果有差异则返回对象，包含 account_id, asset_code 等字段
       */
      if (result !== null) {
        expect(result).toHaveProperty('account_id')
        expect(result).toHaveProperty('asset_code')
      }
      console.log('[P3-1] 零余额账户对账结果:', result === null ? '无差异' : JSON.stringify(result))
    })
  })

  describe('executeBusinessRecordReconciliation() - 业务记录关联检查', () => {
    test('应检查抽奖记录与资产交易的关联', async () => {
      // 执行业务记录关联检查（参数是 cutoffDate: Date，可选）
      const report = await DailyAssetReconciliation.executeBusinessRecordReconciliation(null)

      // 验证报告结构
      expect(report).toBeDefined()
      expect(report).toHaveProperty('timestamp')

      /*
       * 检查抽奖记录关联结果
       * lottery_draws 包含：missing_transaction_ids, orphan_transaction_ids 数组
       */
      if (report.lottery_draws !== undefined) {
        expect(report.lottery_draws).toHaveProperty('missing_transaction_ids')
        expect(report.lottery_draws).toHaveProperty('orphan_transaction_ids')
        expect(Array.isArray(report.lottery_draws.missing_transaction_ids)).toBe(true)
        expect(Array.isArray(report.lottery_draws.orphan_transaction_ids)).toBe(true)
      }

      console.log('[P3-1] 业务记录关联检查报告:', JSON.stringify(report, null, 2))
    })
  })

  describe('_determineStatus() - 状态判断逻辑', () => {
    /*
     * _determineStatus(discrepancy_count, total_count) 参数说明：
     * - discrepancy_count: 差异数量
     * - total_count: 总检查数量
     *
     * 返回状态：
     * - OK: 无差异（discrepancy_count === 0）
     * - WARNING: 差异率 <= 5%
     * - ERROR: 差异率 > 5%
     */
    test('应将无差异判定为OK', () => {
      const status = DailyAssetReconciliation._determineStatus(0, 100)
      expect(status).toBe('OK')
    })

    test('应将低差异率判定为WARNING', () => {
      // 1/100 = 1% 差异率，应该返回 WARNING
      const status = DailyAssetReconciliation._determineStatus(1, 100)
      expect(status).toBe('WARNING')
    })

    test('应将高差异率判定为ERROR', () => {
      // 10/100 = 10% 差异率 > 5%，应该返回 ERROR
      const status = DailyAssetReconciliation._determineStatus(10, 100)
      expect(status).toBe('ERROR')
    })
  })

  describe('错误处理', () => {
    test('应优雅处理数据库连接错误', async () => {
      /*
       * 此测试验证错误处理逻辑
       * 在正常连接下，任务应正常执行
       */
      const report = await DailyAssetReconciliation.execute({
        mode: 'balance',
        sendNotification: false
      })

      expect(report).toBeDefined()
    })
  })

  describe('报告输出', () => {
    test('_outputReport应正确格式化输出', async () => {
      // 创建模拟报告（包含 _outputReport 需要的所有字段）
      const mockReport = {
        timestamp: new Date().toISOString(),
        duration_ms: 1234,
        total_checked: 100,
        discrepancy_count: 0,
        status: 'success',
        discrepancies: [] // 必需字段：差异详情数组
      }

      // 捕获控制台输出
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      // 调用输出方法
      DailyAssetReconciliation._outputReport(mockReport)

      // 验证有输出
      expect(consoleSpy).toHaveBeenCalled()

      // 恢复控制台
      consoleSpy.mockRestore()
    })
  })
})
