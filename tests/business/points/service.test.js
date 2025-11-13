/**
 * 积分服务层测试 - V4架构
 * 迁移自 tests/services/PointsService.test.js
 * 测试覆盖：
 * 1. 积分账户管理（获取账户、获取余额）
 * 2. 积分操作（增加、消费、检查余额）
 * 3. 积分历史（查询、筛选）
 * 4. 积分统计（30天统计、账户年龄）
 * 5. 批量操作（批量增加/消费、事务回滚）
 * 6. 积分概览（冻结积分、分页查询）
 * 7. 错误处理（不存在的用户、余额不足）
 * 
 * 测试原则：
 * - 使用真实数据库（restaurant_points_dev）
 * - 使用统一测试数据（test-data.js）
 * - 直接调用服务层方法（不经过HTTP层）
 * - 验证业务逻辑和数据一致性
 * 
 * 创建时间：2025年11月12日 北京时间
 */

const PointsService = require('../../../services/PointsService')
const { User } = require('../../../models')
const { TEST_DATA, createTestData } = require('../../helpers/test-data')
const { TestConfig } = require('../../helpers/test-setup')
const BeijingTimeHelper = require('../../../utils/timeHelper')

describe('积分服务层测试（V4架构）', () => {
  const testUser = TestConfig.real_data.testUser

  beforeAll(async () => {
    console.log('🚀 积分服务层测试启动')
    console.log('='.repeat(70))
    console.log(`📅 测试时间: ${BeijingTimeHelper.now()} (北京时间)`)
    console.log(`👤 测试账号: ${testUser.mobile} (用户ID: ${testUser.user_id})`)
    console.log('🗄️ 数据库: restaurant_points_dev')

    // 验证测试用户存在
    const user = await User.findByPk(testUser.user_id)
    if (!user) {
      throw new Error(`测试用户 ${testUser.user_id} 不存在`)
    }
    console.log('✅ 测试用户验证通过')
  })

  afterAll(() => {
    console.log('🏁 积分服务层测试完成')
  })

  // ==========================================
  // 📊 积分账户管理测试
  // ==========================================

  describe('积分账户管理', () => {
    test('应该能获取用户积分账户', async () => {
      const account = await PointsService.getUserPointsAccount(testUser.user_id)

      expect(account).toBeDefined()
      expect(account.user_id).toBe(testUser.user_id)
      expect(account.is_active).toBe(true)
      expect(typeof account.available_points).toBe('number')
      expect(typeof account.total_earned).toBe('number')
      expect(typeof account.total_consumed).toBe('number')
      expect(account.available_points).toBeGreaterThanOrEqual(0)
      expect(account.total_earned).toBeGreaterThanOrEqual(account.total_consumed)

      console.log(`📊 积分账户 - 可用: ${account.available_points}, 总获得: ${account.total_earned}`)
    })

    test('应该能获取积分余额信息', async () => {
      const balance = await PointsService.getPointsBalance(testUser.user_id)

      expect(balance).toMatchObject({
        user_id: testUser.user_id,
        account_status: 'active'
      })
      expect(typeof balance.available_points).toBe('number')
      expect(typeof balance.total_earned).toBe('number')
      expect(typeof balance.total_consumed).toBe('number')
      expect(balance.created_at).toBeDefined()
      expect(balance.available_points).toBeGreaterThanOrEqual(0)

      console.log(`💰 积分余额 - 可用: ${balance.available_points}`)
    })
  })

  // ==========================================
  // ➕ 积分增加操作测试
  // ==========================================

  describe('积分增加操作', () => {
    test('应该能成功增加积分', async () => {
      const oldBalance = await PointsService.getPointsBalance(testUser.user_id)

      const result = await PointsService.addPoints(testUser.user_id, 50, {
        business_type: 'test',
        source_type: 'system',
        title: '测试积分增加',
        description: '单元测试 - service.test.js'
      })

      expect(result.success).toBe(true)
      expect(result.old_balance).toBe(oldBalance.available_points)
      expect(result.new_balance).toBe(oldBalance.available_points + 50)
      expect(result.points_added).toBe(50)
      expect(result.transaction_id).toBeDefined()

      // 验证用户表的history_total_points也被更新
      const updatedUser = await User.findByPk(testUser.user_id)
      expect(updatedUser.history_total_points).toBe(result.total_earned)

      console.log(`➕ 增加积分 - 旧余额: ${result.old_balance}, 新余额: ${result.new_balance}`)
    })

    test('应该拒绝增加负数或零积分', async () => {
      await expect(PointsService.addPoints(testUser.user_id, 0)).rejects.toThrow('积分数量必须大于0')
      await expect(PointsService.addPoints(testUser.user_id, -10)).rejects.toThrow('积分数量必须大于0')
    })
  })

  // ==========================================
  // ➖ 积分消费操作测试
  // ==========================================

  describe('积分消费操作', () => {
    test('应该能成功消费积分', async () => {
      const oldBalance = await PointsService.getPointsBalance(testUser.user_id)

      // 确保有足够积分消费
      if (oldBalance.available_points < 30) {
        await PointsService.addPoints(testUser.user_id, 100, {
          business_type: 'test_setup',
          title: '测试准备 - 添加积分'
        })
      }

      const currentBalance = await PointsService.getPointsBalance(testUser.user_id)
      const result = await PointsService.consumePoints(testUser.user_id, 30, {
        business_type: 'test',
        source_type: 'system',
        title: '测试积分消费',
        description: '单元测试 - service.test.js'
      })

      expect(result.success).toBe(true)
      expect(result.old_balance).toBe(currentBalance.available_points)
      expect(result.new_balance).toBe(currentBalance.available_points - 30)
      expect(result.points_consumed).toBe(30)
      expect(result.transaction_id).toBeDefined()

      console.log(`➖ 消费积分 - 旧余额: ${result.old_balance}, 新余额: ${result.new_balance}`)
    })

    test('应该拒绝消费超过余额的积分', async () => {
      const balance = await PointsService.getPointsBalance(testUser.user_id)
      const excessiveAmount = balance.available_points + 1000

      await expect(PointsService.consumePoints(testUser.user_id, excessiveAmount)).rejects.toThrow(
        '积分余额不足'
      )
    })

    test('应该拒绝消费负数或零积分', async () => {
      await expect(PointsService.consumePoints(testUser.user_id, 0)).rejects.toThrow(
        '积分数量必须大于0'
      )
      await expect(PointsService.consumePoints(testUser.user_id, -10)).rejects.toThrow(
        '积分数量必须大于0'
      )
    })
  })

  // ==========================================
  // ✅ 积分余额检查测试
  // ==========================================

  describe('积分余额检查', () => {
    test('应该能正确检查积分余额是否足够', async () => {
      const balance = await PointsService.getPointsBalance(testUser.user_id)

      const hasEnoughSmall = await PointsService.hasEnoughPoints(testUser.user_id, 10)
      const hasEnoughLarge = await PointsService.hasEnoughPoints(
        testUser.user_id,
        balance.available_points + 1000
      )

      expect(hasEnoughSmall).toBe(true)
      expect(hasEnoughLarge).toBe(false)

      console.log(`✅ 余额检查 - 10积分: ${hasEnoughSmall}, ${balance.available_points + 1000}积分: ${hasEnoughLarge}`)
    })
  })

  // ==========================================
  // 📜 积分交易历史测试
  // ==========================================

  describe('积分交易历史', () => {
    test('应该能获取积分交易历史', async () => {
      const history = await PointsService.getPointsHistory(testUser.user_id, {
        page: 1,
        limit: 10
      })

      expect(history.transactions).toBeInstanceOf(Array)
      expect(history.pagination).toMatchObject({
        page: 1,
        limit: 10
      })
      expect(typeof history.pagination.total_count).toBe('number')
      expect(typeof history.pagination.total_pages).toBe('number')

      if (history.transactions.length > 0) {
        // 检查交易记录格式
        const transaction = history.transactions[0]
        expect(transaction).toHaveProperty('transaction_id')
        expect(transaction).toHaveProperty('transaction_type')
        expect(transaction).toHaveProperty('points_amount')
        expect(transaction).toHaveProperty('transaction_time')
        expect(['earn', 'consume']).toContain(transaction.transaction_type)

        console.log(`📜 交易历史 - 总数: ${history.pagination.total_count}, 本页: ${history.transactions.length}`)
      }
    })

    test('应该能按交易类型筛选历史', async () => {
      const earnHistory = await PointsService.getPointsHistory(testUser.user_id, {
        transaction_type: 'earn',
        limit: 5
      })

      const consumeHistory = await PointsService.getPointsHistory(testUser.user_id, {
        transaction_type: 'consume',
        limit: 5
      })

      if (earnHistory.transactions.length > 0) {
        expect(earnHistory.transactions.every(t => t.transaction_type === 'earn')).toBe(true)
        console.log(`📈 获得记录: ${earnHistory.transactions.length}条`)
      }

      if (consumeHistory.transactions.length > 0) {
        expect(consumeHistory.transactions.every(t => t.transaction_type === 'consume')).toBe(true)
        console.log(`📉 消费记录: ${consumeHistory.transactions.length}条`)
      }
    })
  })

  // ==========================================
  // 📊 积分统计测试
  // ==========================================

  describe('积分统计', () => {
    test('应该能获取积分统计信息', async () => {
      const stats = await PointsService.getPointsStatistics(testUser.user_id)

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
      expect(stats.account_age_days).toBeGreaterThanOrEqual(0)

      console.log(`📊 积分统计 - 余额: ${stats.current_balance}, 总获得: ${stats.total_earned}, 总消费: ${stats.total_consumed}`)
      console.log(`   30天净变化: ${stats.recent_30_days.net_change}, 账户年龄: ${stats.account_age_days}天`)
    })
  })

  // ==========================================
  // 🔄 批量积分操作测试
  // ==========================================

  describe('批量积分操作', () => {
    test('应该能执行批量积分操作', async () => {
      const initialBalance = await PointsService.getPointsBalance(testUser.user_id)

      const operations = [
        {
          type: 'add',
          userId: testUser.user_id,
          points: 20,
          options: {
            business_type: 'batch_test',
            title: '批量测试增加'
          }
        },
        {
          type: 'consume',
          userId: testUser.user_id,
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
      const finalBalance = await PointsService.getPointsBalance(testUser.user_id)
      expect(finalBalance.available_points).toBe(initialBalance.available_points + 10) // +20 -10

      console.log(`🔄 批量操作 - 初始: ${initialBalance.available_points}, 最终: ${finalBalance.available_points}`)
    })

    test('批量操作失败时应该回滚', async () => {
      const initialBalance = await PointsService.getPointsBalance(testUser.user_id)

      const operations = [
        {
          type: 'add',
          userId: testUser.user_id,
          points: 10,
          options: { title: '应该回滚的操作' }
        },
        {
          type: 'consume',
          userId: testUser.user_id,
          points: initialBalance.available_points + 1000, // 余额不足，会失败
          options: { title: '会失败的操作' }
        }
      ]

      await expect(PointsService.batchPointsOperation(operations)).rejects.toThrow()

      // 验证余额没有变化（事务回滚）
      const finalBalance = await PointsService.getPointsBalance(testUser.user_id)
      expect(finalBalance.available_points).toBe(initialBalance.available_points)

      console.log('🔄 批量操作回滚成功 - 余额未变化')
    })
  })

  // ==========================================
  // ❄️ 积分概览功能测试（冻结积分）
  // ==========================================

  describe('积分概览功能（冻结积分）', () => {
    test('应该能获取用户积分概览（包含冻结积分）', async () => {
      const overview = await PointsService.getUserPointsOverview(testUser.user_id)

      expect(overview).toBeDefined()
      expect(typeof overview.available_points).toBe('number')
      expect(typeof overview.frozen_points).toBe('number')
      expect(typeof overview.total_earned).toBe('number')
      expect(typeof overview.total_consumed).toBe('number')
      expect(Array.isArray(overview.frozen_transactions)).toBe(true)
      expect(overview.message).toBeDefined()

      // 验证数值合理性
      expect(overview.frozen_points).toBeGreaterThanOrEqual(0)
      expect(overview.available_points).toBeGreaterThanOrEqual(0)
      expect(overview.total_earned).toBeGreaterThanOrEqual(overview.total_consumed)

      console.log(`❄️ 积分概览 - 可用: ${overview.available_points}, 冻结: ${overview.frozen_points}`)

      // 如果有冻结交易，验证其结构
      if (overview.frozen_transactions.length > 0) {
        const frozenTx = overview.frozen_transactions[0]
        expect(frozenTx).toHaveProperty('transaction_id')
        expect(frozenTx).toHaveProperty('points_amount')
        expect(frozenTx).toHaveProperty('consumption_amount')
        expect(frozenTx).toHaveProperty('merchant_notes')
        expect(frozenTx).toHaveProperty('created_at')
        expect(frozenTx).toHaveProperty('status_text')
        expect(frozenTx.status_text).toBe('审核中')
        expect(frozenTx).toHaveProperty('estimated_arrival')

        console.log(`   冻结交易: ${overview.frozen_transactions.length}笔`)
      }
    })

    test('应该能获取用户冻结积分明细（分页）', async () => {
      const frozenDetails = await PointsService.getUserFrozenPoints(testUser.user_id, {
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
      expect(frozenDetails.total_frozen_points).toBeGreaterThanOrEqual(0)

      console.log(`❄️ 冻结明细 - 总数: ${frozenDetails.total_count}, 总冻结: ${frozenDetails.total_frozen_points}`)

      // 如果有冻结交易，验证其结构
      if (frozenDetails.frozen_transactions.length > 0) {
        const frozenTx = frozenDetails.frozen_transactions[0]
        expect(frozenTx).toHaveProperty('transaction_id')
        expect(frozenTx).toHaveProperty('points_amount')
        expect(frozenTx).toHaveProperty('record_id')
        expect(frozenTx).toHaveProperty('consumption_amount')
        expect(frozenTx).toHaveProperty('merchant_notes')
        expect(frozenTx).toHaveProperty('merchant_id')
        expect(frozenTx).toHaveProperty('status')
        expect(frozenTx.status).toBe('pending')
        expect(frozenTx).toHaveProperty('status_text')
        expect(frozenTx.status_text).toBe('审核中')
        expect(frozenTx).toHaveProperty('created_at')
        expect(frozenTx).toHaveProperty('estimated_arrival')
      }
    })

    test('应该正确处理分页参数', async () => {
      // 测试第2页
      const page2 = await PointsService.getUserFrozenPoints(testUser.user_id, {
        page: 2,
        page_size: 5
      })

      expect(page2.current_page).toBe(2)
      expect(page2.page_size).toBe(5)
      expect(page2.frozen_transactions.length).toBeLessThanOrEqual(5)

      // 测试最大page_size限制（应该限制在50）
      const largePage = await PointsService.getUserFrozenPoints(testUser.user_id, {
        page: 1,
        page_size: 100
      })

      expect(largePage.page_size).toBeLessThanOrEqual(50)

      console.log(`📄 分页测试 - 第2页: ${page2.frozen_transactions.length}条, 大页面限制: ${largePage.page_size}`)
    })
  })

  // ==========================================
  // ❌ 错误处理测试
  // ==========================================

  describe('错误处理', () => {
    test('应该处理不存在的用户', async () => {
      const nonExistentUserId = 99999

      await expect(PointsService.createPointsAccount(nonExistentUserId)).rejects.toThrow('用户不存在')
      await expect(PointsService.getUserPointsAccount(nonExistentUserId)).rejects.toThrow()

      console.log('❌ 不存在用户错误处理正确')
    })

    test('应该处理无效的积分数量', async () => {
      await expect(PointsService.addPoints(testUser.user_id, -100)).rejects.toThrow('积分数量必须大于0')
      await expect(PointsService.consumePoints(testUser.user_id, 0)).rejects.toThrow('积分数量必须大于0')

      console.log('❌ 无效积分数量错误处理正确')
    })
  })
})

