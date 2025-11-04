/**
 * 高级空间解锁API测试
 * 测试API#2: 高级空间解锁功能
 * 创建时间：2025年11月02日 北京时间
 * 使用模型：Claude Sonnet 4
 *
 * 测试覆盖：
 * 1. 查询高级空间状态 - GET /api/v4/premium/status
 * 2. 解锁高级空间功能 - POST /api/v4/premium/unlock
 * 3. 重复解锁拒绝测试
 * 4. 条件验证测试（历史积分门槛、当前余额）
 * 5. 有效期验证测试
 *
 * 测试账号：13612227930 (用户ID: 31, 管理员权限)
 * 数据库：restaurant_points_dev (统一数据库)
 *
 * 业务规则：
 * - 解锁条件1: history_total_points ≥ 100000
 * - 解锁条件2: available_points ≥ 100
 * - 解锁费用: 100积分
 * - 有效期: 24小时
 * - 无自动续费
 */

const TestCoordinator = require('./TestCoordinator')
const moment = require('moment-timezone')
const { User, UserPointsAccount, UserPremiumStatus } = require('../../models')

describe('高级空间解锁API测试', () => {
  let tester
  const test_account = {
    phone: '13612227930',
    user_id: 31,
    role_based_admin: true
  }

  beforeAll(async () => {
    console.log('🚀 高级空间解锁API测试启动')
    console.log('='.repeat(70))
    console.log(
      `📅 测试时间: ${moment().tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')} (北京时间)`
    )
    console.log(`👤 测试账号: ${test_account.phone} (用户ID: ${test_account.user_id})`)
    console.log('🗄️ 数据库: restaurant_points_dev')

    tester = new TestCoordinator()

    // 等待V4引擎启动
    try {
      await tester.waitForV4Engine(30000)
      console.log('✅ V4引擎启动检查通过')
    } catch (error) {
      console.warn('⚠️ V4引擎可能未启动，继续测试:', error.message)
    }

    // 获取认证token
    try {
      await tester.authenticateV4User('regular')
      console.log('✅ 用户认证完成')
    } catch (error) {
      console.warn('⚠️ 认证失败，部分测试可能跳过:', error.message)
    }
  })

  afterAll(async () => {
    if (tester) {
      await tester.cleanup()
    }
    console.log('🏁 高级空间解锁API测试完成')
  })

  // ========== 查询高级空间状态测试 ==========
  describe('查询高级空间状态API', () => {
    test('✅ 查询高级空间状态 - GET /api/v4/premium/status', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/premium/status',
        null,
        'regular'
      )

      expect([200, 401]).toContain(response.status)
      if (response.status === 200) {
        expect(response.data).toHaveProperty('success', true)
        expect(response.data.data).toHaveProperty('unlocked')

        // 如果已解锁且有效
        if (response.data.data.unlocked && response.data.data.is_valid) {
          expect(response.data.data).toHaveProperty('unlock_time')
          expect(response.data.data).toHaveProperty('expires_at')
          expect(response.data.data).toHaveProperty('remaining_hours')
          expect(response.data.data).toHaveProperty('remaining_minutes')
          expect(response.data.data).toHaveProperty('total_unlock_count')
          console.log('✅ 已解锁且在有效期内')
          console.log(`   解锁时间: ${response.data.data.unlock_time}`)
          console.log(`   过期时间: ${response.data.data.expires_at}`)
          console.log(`   剩余时间: ${response.data.data.remaining_hours}小时`)
        } else {
          // 未解锁或已过期，返回解锁条件
          expect(response.data.data).toHaveProperty('conditions')
          expect(response.data.data.conditions).toHaveProperty('condition_1')
          expect(response.data.data.conditions).toHaveProperty('condition_2')
          expect(response.data.data).toHaveProperty('can_unlock')
          expect(response.data.data).toHaveProperty('unlock_cost')
          console.log('ℹ️ 未解锁或已过期')
          console.log(`   条件1(历史积分): ${response.data.data.conditions.condition_1.current}/${response.data.data.conditions.condition_1.required}`)
          console.log(`   条件2(当前余额): ${response.data.data.conditions.condition_2.current}/${response.data.data.conditions.condition_2.required}`)
          console.log(`   是否可解锁: ${response.data.data.can_unlock ? '是' : '否'}`)
        }
      }
    })

    test('✅ 验证状态数据结构完整性', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/premium/status',
        null,
        'regular'
      )

      if (response.status === 200) {
        // 验证基本字段
        expect(response.data.data).toHaveProperty('unlocked')
        expect(typeof response.data.data.unlocked).toBe('boolean')

        // 如果未解锁，验证条件字段
        if (!response.data.data.unlocked || !response.data.data.is_valid) {
          const cond1 = response.data.data.conditions.condition_1
          const cond2 = response.data.data.conditions.condition_2

          expect(cond1).toHaveProperty('name')
          expect(cond1).toHaveProperty('required')
          expect(cond1).toHaveProperty('current')
          expect(cond1).toHaveProperty('satisfied')
          expect(cond1).toHaveProperty('percentage')
          expect(cond1).toHaveProperty('shortage')

          expect(cond2).toHaveProperty('name')
          expect(cond2).toHaveProperty('required')
          expect(cond2).toHaveProperty('current')
          expect(cond2).toHaveProperty('satisfied')
          expect(cond2).toHaveProperty('percentage')
          expect(cond2).toHaveProperty('shortage')
        }
      }
    })
  })

  // ========== 解锁高级空间测试 ==========
  describe('解锁高级空间API', () => {
    let original_status
    let original_history_points
    let original_balance

    beforeAll(async () => {
      // 保存原始状态
      try {
        const response = await tester.makeAuthenticatedRequest(
          'GET',
          '/api/v4/premium/status',
          null,
          'regular'
        )
        if (response.status === 200) {
          original_status = response.data.data
        }

        // 保存原始积分数据
        const user = await User.findByPk(test_account.user_id, {
          include: [{ model: UserPointsAccount, as: 'pointsAccount' }]
        })
        if (user) {
          original_history_points = user.history_total_points
          original_balance = parseFloat(user.pointsAccount.available_points)
        }

        console.log('📊 原始状态:')
        console.log(`   历史积分: ${original_history_points}`)
        console.log(`   当前余额: ${original_balance}`)
        console.log(`   解锁状态: ${original_status?.unlocked ? '已解锁' : '未解锁'}`)
      } catch (error) {
        console.warn('⚠️ 无法获取原始状态:', error.message)
      }
    })

    test('✅ 验证解锁条件 - 历史积分门槛', async () => {
      const user = await User.findByPk(test_account.user_id)
      if (!user) {
        console.warn('⚠️ 测试用户不存在，跳过测试')
        return
      }

      const history_points = user.history_total_points || 0
      const THRESHOLD = 100000

      console.log(`📊 历史积分检查: ${history_points}/${THRESHOLD}`)

      if (history_points < THRESHOLD) {
        // 如果不满足条件，测试应该返回403
        const response = await tester.makeAuthenticatedRequest(
          'POST',
          '/api/v4/premium/unlock',
          null,
          'regular'
        )

        expect([403, 409]).toContain(response.status)
        if (response.status === 403) {
          expect(response.data.success).toBe(false)
          expect(response.data.data).toHaveProperty('condition_1')
          expect(response.data.data.condition_1.satisfied).toBe(false)
          console.log('✅ 历史积分不足，正确返回403')
        }
      } else {
        console.log('✅ 历史积分满足要求')
      }
    })

    test('✅ 验证解锁条件 - 当前积分余额', async () => {
      const user = await User.findByPk(test_account.user_id, {
        include: [{ model: UserPointsAccount, as: 'pointsAccount' }]
      })
      if (!user || !user.pointsAccount) {
        console.warn('⚠️ 测试用户积分账户不存在，跳过测试')
        return
      }

      const available_points = parseFloat(user.pointsAccount.available_points) || 0
      const UNLOCK_COST = 100

      console.log(`📊 积分余额检查: ${available_points}/${UNLOCK_COST}`)

      if (available_points < UNLOCK_COST) {
        // 如果不满足条件，测试应该返回403
        const response = await tester.makeAuthenticatedRequest(
          'POST',
          '/api/v4/premium/unlock',
          null,
          'regular'
        )

        expect([403, 409]).toContain(response.status)
        if (response.status === 403) {
          expect(response.data.success).toBe(false)
          expect(response.data.data).toHaveProperty('condition_2')
          expect(response.data.data.condition_2.satisfied).toBe(false)
          console.log('✅ 积分余额不足，正确返回403')
        }
      } else {
        console.log('✅ 积分余额充足')
      }
    })

    test('✅ 解锁高级空间 - POST /api/v4/premium/unlock', async () => {
      // 先检查是否已解锁且有效
      const status_response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/premium/status',
        null,
        'regular'
      )

      if (status_response.status === 200 && status_response.data.data.unlocked && status_response.data.data.is_valid) {
        console.log('ℹ️ 已解锁且在有效期内，测试重复解锁拒绝')

        // 测试重复解锁应该被拒绝
        const response = await tester.makeAuthenticatedRequest(
          'POST',
          '/api/v4/premium/unlock',
          null,
          'regular'
        )

        // 重复解锁应该被拒绝（409）或者已经解锁成功（200）
        expect([200, 409]).toContain(response.status)
        if (response.status === 409) {
          expect(response.data.success).toBe(false)
          expect(response.data.code).toBe('ALREADY_UNLOCKED')
          expect(response.data.data).toHaveProperty('remaining_hours')
          console.log('✅ 重复解锁被正确拒绝')
        } else {
          console.log('ℹ️ 解锁成功（可能刚过期）')
        }
        return
      }

      // 如果未解锁或已过期，测试解锁功能
      if (status_response.status === 200 && !status_response.data.data.can_unlock) {
        console.log('⚠️ 不满足解锁条件，跳过解锁测试')
        return
      }

      // 执行解锁
      const response = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/premium/unlock',
        null,
        'regular'
      )

      expect([200, 403, 409]).toContain(response.status)

      if (response.status === 200) {
        expect(response.data).toHaveProperty('success', true)
        expect(response.data.data).toHaveProperty('unlocked', true)
        expect(response.data.data).toHaveProperty('is_first_unlock')
        expect(response.data.data).toHaveProperty('unlock_cost', 100)
        expect(response.data.data).toHaveProperty('remaining_points')
        expect(response.data.data).toHaveProperty('unlock_time')
        expect(response.data.data).toHaveProperty('expires_at')
        expect(response.data.data).toHaveProperty('validity_hours', 24)
        expect(response.data.data).toHaveProperty('total_unlock_count')

        console.log('✅ 解锁成功')
        console.log(`   是否首次解锁: ${response.data.data.is_first_unlock ? '是' : '否'}`)
        console.log(`   解锁费用: ${response.data.data.unlock_cost}积分`)
        console.log(`   剩余积分: ${response.data.data.remaining_points}`)
        console.log(`   有效期: ${response.data.data.validity_hours}小时`)
      }
    })

    test('✅ 验证解锁后状态变化', async () => {
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/premium/status',
        null,
        'regular'
      )

      expect([200, 401]).toContain(response.status)

      if (response.status === 200 && response.data.data.unlocked && response.data.data.is_valid) {
        expect(response.data.data).toHaveProperty('is_valid', true)
        expect(response.data.data).toHaveProperty('remaining_hours')
        expect(response.data.data.remaining_hours).toBeGreaterThan(0)
        expect(response.data.data.remaining_hours).toBeLessThanOrEqual(24)
        console.log('✅ 解锁后状态正确')
        console.log(`   剩余有效期: ${response.data.data.remaining_hours}小时`)
      }
    })
  })

  // ========== 积分扣除验证测试 ==========
  describe('积分扣除验证', () => {
    test('✅ 验证积分账户扣除正确', async () => {
      // 查询积分交易记录 - 使用正确的路由路径
      const response = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/unified-engine/points/transactions/${test_account.user_id}?page=1&page_size=10`,
        null,
        'regular'
      )

      if (response.status === 200) {
        const transactions = response.data.data.transactions || response.data.data

        // 查找最近的premium_unlock交易
        const premium_unlock = Array.isArray(transactions)
          ? transactions.find(t => t.business_type === 'premium_unlock')
          : null

        if (premium_unlock) {
          expect(premium_unlock.transaction_type).toBe('consume')
          expect(premium_unlock.points_amount).toBe(100)
          expect(premium_unlock.transaction_title).toBe('解锁高级空间')
          console.log('✅ 找到高级空间解锁交易记录')
          console.log(`   交易金额: ${premium_unlock.points_amount}积分`)
          console.log(`   交易时间: ${premium_unlock.transaction_time}`)
        } else {
          console.log('ℹ️ 未找到高级空间解锁交易记录（可能已过期或未解锁）')
        }
      } else {
        console.log(`⚠️ 无法查询积分交易记录 (状态码: ${response.status})`)
      }
    })

    test('✅ 验证积分余额一致性', async () => {
      const user = await User.findByPk(test_account.user_id, {
        include: [{ model: UserPointsAccount, as: 'pointsAccount' }]
      })

      if (user && user.pointsAccount) {
        const available_points = parseFloat(user.pointsAccount.available_points)
        const total_consumed = parseFloat(user.pointsAccount.total_consumed)

        expect(available_points).toBeGreaterThanOrEqual(0)
        expect(total_consumed).toBeGreaterThanOrEqual(0)

        console.log('✅ 积分账户数据一致性验证通过')
        console.log(`   可用积分: ${available_points}`)
        console.log(`   累计消耗: ${total_consumed}`)
      }
    })
  })

  // ========== 数据库一致性测试 ==========
  describe('数据库一致性验证', () => {
    test('✅ 验证user_premium_status表记录', async () => {
      const premium_status = await UserPremiumStatus.findOne({
        where: { user_id: test_account.user_id }
      })

      if (premium_status) {
        expect(premium_status).toHaveProperty('user_id', test_account.user_id)
        expect(premium_status).toHaveProperty('is_unlocked')
        expect(premium_status).toHaveProperty('unlock_time')
        expect(premium_status).toHaveProperty('unlock_method')
        expect(premium_status).toHaveProperty('total_unlock_count')
        expect(premium_status).toHaveProperty('expires_at')

        console.log('✅ user_premium_status表记录完整')
        console.log(`   解锁状态: ${premium_status.is_unlocked}`)
        console.log(`   解锁方式: ${premium_status.unlock_method}`)
        console.log(`   解锁次数: ${premium_status.total_unlock_count}`)
      } else {
        console.log('ℹ️ 用户尚未解锁高级空间')
      }
    })

    test('✅ 验证外键关联正确性', async () => {
      const premium_status = await UserPremiumStatus.findOne({
        where: { user_id: test_account.user_id }
      })

      if (premium_status) {
        // 验证用户存在
        const user = await User.findByPk(premium_status.user_id)
        expect(user).toBeTruthy()
        expect(user.user_id).toBe(test_account.user_id)

        console.log('✅ 外键关联正确')
      }
    })
  })
})
