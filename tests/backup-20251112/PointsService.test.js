/**
 * 积分服务测试
 * 测试统一积分系统的所有功能
 */

const PointsService = require('../../services/PointsService')
const { User } = require('../../models')

describe('PointsService 积分服务测试', () => {
  // 使用已知的测试用户ID (13612227930)
  const test_user_id = 31

  beforeAll(async () => {
    // 验证测试用户存在
    const testUser = await User.findByPk(test_user_id)
    if (!testUser) {
      throw new Error(`测试用户 ${test_user_id} 不存在`)
    }
  })

  afterAll(async () => {
    // 不需要清理，使用的是真实测试用户
  })

  describe('积分账户管理', () => {
    test('应该能获取用户积分账户', async () => {
      const account = await PointsService.getUserPointsAccount(test_user_id)

      expect(account).toBeDefined()
      expect(account.user_id).toBe(test_user_id)
      expect(account.is_active).toBe(true)
      expect(typeof account.available_points).toBe('number')
      expect(typeof account.total_earned).toBe('number')
      expect(typeof account.total_consumed).toBe('number')
    })

    test('应该能获取积分余额信息', async () => {
      const balance = await PointsService.getPointsBalance(test_user_id)

      expect(balance).toMatchObject({
        user_id: test_user_id,
        account_status: 'active'
      })
      expect(typeof balance.available_points).toBe('number')
      expect(typeof balance.total_earned).toBe('number')
      expect(typeof balance.total_consumed).toBe('number')
      expect(balance.created_at).toBeDefined()
    })
  })

  describe('积分增加操作', () => {
    test('应该能成功增加积分', async () => {
      const oldBalance = await PointsService.getPointsBalance(test_user_id)

      const result = await PointsService.addPoints(test_user_id, 50, {
        business_type: 'test',
        source_type: 'system',
        title: '测试积分增加',
        description: '单元测试'
      })

      expect(result.success).toBe(true)
      expect(result.old_balance).toBe(oldBalance.available_points)
      expect(result.new_balance).toBe(oldBalance.available_points + 50)
      expect(result.points_added).toBe(50)
      expect(result.transaction_id).toBeDefined()

      // 验证用户表的history_total_points也被更新
      const updatedUser = await User.findByPk(test_user_id)
      expect(updatedUser.history_total_points).toBe(result.total_earned)
    })

    test('应该拒绝增加负数或零积分', async () => {
      await expect(PointsService.addPoints(test_user_id, 0)).rejects.toThrow('积分数量必须大于0')
      await expect(PointsService.addPoints(test_user_id, -10)).rejects.toThrow('积分数量必须大于0')
    })
  })

  describe('积分消费操作', () => {
    test('应该能成功消费积分', async () => {
      const oldBalance = await PointsService.getPointsBalance(test_user_id)

      // 确保有足够积分消费
      if (oldBalance.available_points < 30) {
        await PointsService.addPoints(test_user_id, 100, {
          business_type: 'test_setup',
          title: '测试准备'
        })
      }

      const currentBalance = await PointsService.getPointsBalance(test_user_id)
      const result = await PointsService.consumePoints(test_user_id, 30, {
        business_type: 'test',
        source_type: 'system',
        title: '测试积分消费',
        description: '单元测试'
      })

      expect(result.success).toBe(true)
      expect(result.old_balance).toBe(currentBalance.available_points)
      expect(result.new_balance).toBe(currentBalance.available_points - 30)
      expect(result.points_consumed).toBe(30)
      expect(result.transaction_id).toBeDefined()
    })

    test('应该拒绝消费超过余额的积分', async () => {
      const balance = await PointsService.getPointsBalance(test_user_id)
      const excessiveAmount = balance.available_points + 1000

      await expect(PointsService.consumePoints(test_user_id, excessiveAmount)).rejects.toThrow(
        '积分余额不足'
      )
    })

    test('应该拒绝消费负数或零积分', async () => {
      await expect(PointsService.consumePoints(test_user_id, 0)).rejects.toThrow(
        '积分数量必须大于0'
      )
      await expect(PointsService.consumePoints(test_user_id, -10)).rejects.toThrow(
        '积分数量必须大于0'
      )
    })
  })

  describe('积分余额检查', () => {
    test('应该能正确检查积分余额是否足够', async () => {
      const balance = await PointsService.getPointsBalance(test_user_id)

      const hasEnoughSmall = await PointsService.hasEnoughPoints(test_user_id, 10)
      const hasEnoughLarge = await PointsService.hasEnoughPoints(
        test_user_id,
        balance.available_points + 1000
      )

      expect(hasEnoughSmall).toBe(true)
      expect(hasEnoughLarge).toBe(false)
    })
  })

  describe('积分交易历史', () => {
    test('应该能获取积分交易历史', async () => {
      const history = await PointsService.getPointsHistory(test_user_id, {
        page: 1,
        limit: 10
      })

      expect(history.transactions).toBeInstanceOf(Array)
      expect(history.pagination).toMatchObject({
        page: 1,
        limit: 10
      })

      if (history.transactions.length > 0) {
        // 检查交易记录格式
        const transaction = history.transactions[0]
        expect(transaction).toHaveProperty('transaction_id')
        expect(transaction).toHaveProperty('transaction_type')
        expect(transaction).toHaveProperty('points_amount')
        expect(transaction).toHaveProperty('transaction_time')
      }
    })

    test('应该能按交易类型筛选历史', async () => {
      const earnHistory = await PointsService.getPointsHistory(test_user_id, {
        transaction_type: 'earn',
        limit: 5
      })

      const consumeHistory = await PointsService.getPointsHistory(test_user_id, {
        transaction_type: 'consume',
        limit: 5
      })

      if (earnHistory.transactions.length > 0) {
        expect(earnHistory.transactions.every(t => t.transaction_type === 'earn')).toBe(true)
      }

      if (consumeHistory.transactions.length > 0) {
        expect(consumeHistory.transactions.every(t => t.transaction_type === 'consume')).toBe(true)
      }
    })
  })

  describe('积分统计', () => {
    test('应该能获取积分统计信息', async () => {
      const stats = await PointsService.getPointsStatistics(test_user_id)

      expect(stats).toMatchObject({
        current_balance: expect.any(Number),
        total_earned: expect.any(Number),
        total_consumed: expect.any(Number),
        recent_30_days: {
          earned: expect.any(Number),
          consumed: expect.any(Number),
          net_change: expect.any(Number)
        },
        account_age_days: expect.any(Number)
      })

      expect(stats.current_balance).toBeGreaterThanOrEqual(0)
      expect(stats.total_earned).toBeGreaterThanOrEqual(0)
      expect(stats.total_consumed).toBeGreaterThanOrEqual(0)
    })
  })

  describe('批量积分操作', () => {
    test('应该能执行批量积分操作', async () => {
      const initialBalance = await PointsService.getPointsBalance(test_user_id)

      const operations = [
        {
          type: 'add',
          userId: test_user_id,
          points: 20,
          options: {
            business_type: 'batch_test',
            title: '批量测试增加'
          }
        },
        {
          type: 'consume',
          userId: test_user_id,
          points: 10,
          options: {
            business_type: 'batch_test',
            title: '批量测试消费'
          }
        }
      ]

      const result = await PointsService.batchPointsOperation(operations)

      expect(result.success).toBe(true)
      expect(result.total_operations).toBe(2)
      expect(result.successful_operations).toBe(2)
      expect(result.results).toHaveLength(2)

      // 验证最终余额
      const finalBalance = await PointsService.getPointsBalance(test_user_id)
      expect(finalBalance.available_points).toBe(initialBalance.available_points + 10) // +20 -10
    })

    test('批量操作失败时应该回滚', async () => {
      const initialBalance = await PointsService.getPointsBalance(test_user_id)

      const operations = [
        {
          type: 'add',
          userId: test_user_id,
          points: 10,
          options: { title: '应该回滚的操作' }
        },
        {
          type: 'consume',
          userId: test_user_id,
          points: initialBalance.available_points + 1000, // 余额不足，会失败
          options: { title: '会失败的操作' }
        }
      ]

      await expect(PointsService.batchPointsOperation(operations)).rejects.toThrow()

      // 验证余额没有变化
      const finalBalance = await PointsService.getPointsBalance(test_user_id)
      expect(finalBalance.available_points).toBe(initialBalance.available_points)
    })
  })

  describe('积分概览功能（消费记录奖励）', () => {
    test('应该能获取用户积分概览（包含冻结积分）', async () => {
      const overview = await PointsService.getUserPointsOverview(test_user_id)

      expect(overview).toBeDefined()
      expect(typeof overview.available_points).toBe('number')
      expect(typeof overview.frozen_points).toBe('number')
      expect(typeof overview.total_earned).toBe('number')
      expect(typeof overview.total_consumed).toBe('number')
      expect(Array.isArray(overview.frozen_transactions)).toBe(true)
      expect(overview.message).toBeDefined()

      // 验证frozen_points >= 0
      expect(overview.frozen_points).toBeGreaterThanOrEqual(0)

      // 验证available_points >= 0
      expect(overview.available_points).toBeGreaterThanOrEqual(0)

      // 如果有冻结交易，验证其结构（扁平化结构 - 实际业务代码）
      if (overview.frozen_transactions.length > 0) {
        const frozenTx = overview.frozen_transactions[0]
        expect(frozenTx).toHaveProperty('transaction_id')
        expect(frozenTx).toHaveProperty('points_amount')
        expect(frozenTx).toHaveProperty('consumption_amount') // 消费金额（扁平化字段）
        expect(frozenTx).toHaveProperty('merchant_notes') // 商家备注（扁平化字段）
        expect(frozenTx).toHaveProperty('created_at') // 创建时间
        expect(frozenTx).toHaveProperty('status_text') // 状态文本
        expect(frozenTx.status_text).toBe('审核中')
        expect(frozenTx).toHaveProperty('estimated_arrival') // 预计到账时间
      }
    })

    test('应该能获取用户冻结积分明细（分页）', async () => {
      const frozenDetails = await PointsService.getUserFrozenPoints(test_user_id, {
        page: 1,
        page_size: 10
      })

      expect(frozenDetails).toBeDefined()
      expect(typeof frozenDetails.total_count).toBe('number')
      expect(frozenDetails.current_page).toBe(1)
      expect(frozenDetails.page_size).toBe(10)
      expect(typeof frozenDetails.total_pages).toBe('number')
      expect(typeof frozenDetails.total_frozen_points).toBe('number')
      expect(Array.isArray(frozenDetails.frozen_transactions)).toBe(true)

      // 验证分页逻辑
      expect(frozenDetails.frozen_transactions.length).toBeLessThanOrEqual(10)

      // 验证total_frozen_points >= 0
      expect(frozenDetails.total_frozen_points).toBeGreaterThanOrEqual(0)

      // 如果有冻结交易，验证其结构（扁平化结构 - 实际业务代码）
      if (frozenDetails.frozen_transactions.length > 0) {
        const frozenTx = frozenDetails.frozen_transactions[0]
        expect(frozenTx).toHaveProperty('transaction_id')
        expect(frozenTx).toHaveProperty('points_amount')
        expect(frozenTx).toHaveProperty('record_id') // 消费记录ID（扁平化字段）
        expect(frozenTx).toHaveProperty('consumption_amount') // 消费金额（扁平化字段）
        expect(frozenTx).toHaveProperty('merchant_notes') // 商家备注（扁平化字段）
        expect(frozenTx).toHaveProperty('merchant_id') // 商家ID（扁平化字段）
        expect(frozenTx).toHaveProperty('status') // 状态
        expect(frozenTx.status).toBe('pending')
        expect(frozenTx).toHaveProperty('status_text') // 状态文本
        expect(frozenTx.status_text).toBe('审核中')
        expect(frozenTx).toHaveProperty('created_at') // 创建时间（北京时间格式）
        expect(frozenTx).toHaveProperty('estimated_arrival') // 预计到账时间
      }
    })

    test('应该正确处理分页参数', async () => {
      // 测试第2页
      const page2 = await PointsService.getUserFrozenPoints(test_user_id, {
        page: 2,
        page_size: 5
      })

      expect(page2.current_page).toBe(2)
      expect(page2.page_size).toBe(5)
      expect(page2.frozen_transactions.length).toBeLessThanOrEqual(5)

      // 测试最大page_size限制（应该限制在50）
      const largePage = await PointsService.getUserFrozenPoints(test_user_id, {
        page: 1,
        page_size: 100
      })

      expect(largePage.page_size).toBeLessThanOrEqual(50)
    })
  })

  describe('错误处理', () => {
    test('应该处理不存在的用户', async () => {
      await expect(PointsService.createPointsAccount(99999)).rejects.toThrow('用户不存在')
    })
  })
})
