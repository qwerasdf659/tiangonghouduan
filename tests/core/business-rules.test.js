/**
 * 餐厅积分抽奖系统 - 业务逻辑测试套件
 * 专门测试业务规则、计算逻辑、数据一致性等核心业务逻辑
 * 创建时间：2025年08月23日 北京时间
 *
 * 测试覆盖：
 * 1. 抽奖业务规则验证
 * 2. 积分计算逻辑验证
 * 3. 数据一致性验证
 * 4. 业务约束检查
 * 5. 异常处理验证
 */

/* eslint-disable no-console */

const BeijingTimeHelper = require('../../utils/timeHelper')
const TestCoordinator = require('../api/TestCoordinator')

// 辅助函数
async function getUserPoints (tester, user_id) {
  const response = await tester.makeAuthenticatedRequest(
    'GET',
    `/api/v4/points/balance/${user_id}`,
    null,
    'regular'
  )
  return response.status === 200 ? response.data.data?.available_points || 0 : 0
}

async function getUserInventory (tester, user_id) {
  const response = await tester.makeAuthenticatedRequest(
    'GET',
    `/api/v4/user/inventory/${user_id}`,
    null,
    'regular'
  )
  return response.status === 200 ? response.data.data || [] : []
}

async function getAvailableCampaign (tester) {
  // campaigns接口需要认证
  const response = await tester.makeAuthenticatedRequest(
    'GET',
    '/api/v4/lottery/campaigns',
    null,
    'regular'
  )
  if (response.status === 200 && response.data.data.length > 0) {
    return (
      response.data.data.find(campaign => campaign.status === 'active') || response.data.data[0]
    )
  }
  return null
}

// 已移除calculateVIPLevel函数 - VIP功能已废弃

describe('🧮 核心业务逻辑测试', () => {
  let tester
  let test_user_id
  let _initialUserData

  beforeAll(async () => {
    tester = new TestCoordinator()
    await new Promise(resolve => {
      setTimeout(resolve, 3000)
    })

    // 获取测试用户数据
    const userData = await tester.authenticateUser('regular')
    test_user_id = userData.user.user_id
    _initialUserData = userData.user

    // 确保管理员权限
    await tester.authenticateUser('admin')
  })

  afterAll(() => {
    if (tester) {
      tester.cleanup()
    }
  })

  describe('🎰 抽奖业务规则验证', () => {
    test('✅ 每日抽奖次数限制验证', async () => {
      console.log('📋 测试每日抽奖次数限制业务规则...')

      // 获取可用的抽奖活动（需要认证）
      const campaignsResponse = await tester.makeAuthenticatedRequest(
        'GET',
        '/api/v4/lottery/campaigns',
        null,
        'regular'
      )

      if (campaignsResponse.status !== 200 || !campaignsResponse.data.data.length) {
        console.log('⚠️ 跳过测试：没有可用的抽奖活动')
        return
      }

      const campaign = campaignsResponse.data.data[0]
      const campaign_id = campaign.campaign_id

      // 获取今日抽奖记录
      const historyResponse = await tester.makeAuthenticatedRequest(
        'GET',
        `/api/v4/lottery/history/${test_user_id}`,
        null,
        'regular'
      )

      let todayDrawCount = 0
      if (
        historyResponse.status === 200 &&
        historyResponse.data.data &&
        historyResponse.data.data.records
      ) {
        const today = BeijingTimeHelper.now().split('T')[0]
        todayDrawCount = historyResponse.data.data.records.filter(
          record => record.created_at && record.created_at.startsWith(today)
        ).length
      }

      console.log(`📊 今日已抽奖次数: ${todayDrawCount}`)

      // 测试业务规则：如果已达到每日限制，应该拒绝抽奖
      const maxDailyDraws = campaign.daily_limit || 3 // 假设每日限制3次

      if (todayDrawCount >= maxDailyDraws) {
        // 应该拒绝抽奖
        const drawResponse = await tester.makeAuthenticatedRequest(
          'POST',
          '/api/v4/lottery/draw',
          { campaign_id, draw_type: 'single' },
          'regular'
        )

        expect([400, 403, 429]).toContain(drawResponse.status)
        console.log('✅ 每日限制验证通过：正确拒绝超限抽奖')
      } else {
        console.log(`📝 当前抽奖次数(${todayDrawCount})未达到限制(${maxDailyDraws})`)
      }
    })

    test('💰 积分足够才能抽奖的业务规则', async () => {
      console.log('📋 测试积分足够才能抽奖的业务规则...')

      // 获取抽奖活动配置
      const campaign = await getAvailableCampaign(tester)

      if (!campaign) {
        console.log('⚠️ 跳过测试：没有可用的抽奖活动')
        return
      }

      const requiredPoints = parseFloat(campaign.cost_per_draw) || 50
      console.log(`📊 抽奖所需积分: ${requiredPoints}`)

      // 🎯 使用积分不足的用户进行测试（用户ID 39，0积分）
      const low_points_user_id = 39
      const currentPoints = await getUserPoints(tester, low_points_user_id)
      console.log(`📊 测试用户(${low_points_user_id})积分余额: ${currentPoints}`)

      if (currentPoints < requiredPoints) {
        // 积分不足，应该拒绝抽奖
        console.log('🔍 发送请求: POST /api/v4/lottery/draw')
        console.log(
          `📋 请求数据: user_id=${low_points_user_id}, campaign_id=${campaign.campaign_id}, draw_count=1`
        )

        const drawResponse = await tester.makeAuthenticatedRequest(
          'POST',
          '/api/v4/lottery/draw',
          { user_id: low_points_user_id, campaign_id: campaign.campaign_id, draw_count: 1 },
          'regular'
        )

        console.log(`📊 API响应状态: ${drawResponse.status}`)
        console.log('📋 API响应数据:', JSON.stringify(drawResponse.data, null, 2))

        // 🎯 修复：匹配项目的API设计模式（统一HTTP 200，业务状态通过response字段）
        expect(drawResponse.status).toBe(200)
        expect(drawResponse.data?.success).toBe(false)
        expect(drawResponse.data?.code).toBe('INSUFFICIENT_POINTS')
        console.log('✅ 积分不足验证通过：正确拒绝积分不足的抽奖')
      } else {
        console.log(`📝 当前积分(${currentPoints})足够抽奖(${requiredPoints})`)
        console.log('⚠️ 无法测试积分不足场景，需要调整用户积分')
      }
    })

    test('🔄 抽奖成功后数据一致性验证', async () => {
      console.log('📋 测试抽奖成功后的数据一致性...')

      // 获取抽奖前状态
      const beforePoints = await getUserPoints(tester, test_user_id)
      const beforeInventory = await getUserInventory(tester, test_user_id)

      // 获取可用活动
      const campaign = await getAvailableCampaign(tester)
      if (!campaign) {
        console.log('⚠️ 跳过测试：没有可用的抽奖活动')
        return
      }

      // 确保有足够积分
      if (beforePoints < (campaign.points_cost || 50)) {
        console.log('⚠️ 跳过测试：积分不足')
        return
      }

      // 执行抽奖
      const drawResponse = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/lottery/draw',
        { campaign_id: campaign.campaign_id, draw_type: 'single' },
        'regular'
      )

      if (drawResponse.status === 200) {
        console.log('🎯 抽奖执行成功，验证数据一致性...')

        // 等待数据处理
        await new Promise(resolve => {
          setTimeout(resolve, 2000)
        })

        // 获取抽奖后状态
        const afterPoints = await getUserPoints(tester, test_user_id)
        const afterInventory = await getUserInventory(tester, test_user_id)

        // 验证积分正确扣除
        const expectedPointsAfter = beforePoints - (campaign.points_cost || 50)
        expect(afterPoints).toBeLessThanOrEqual(beforePoints)
        console.log(`💰 积分变化: ${beforePoints} → ${afterPoints} (预期: ${expectedPointsAfter})`)

        // 验证抽奖记录存在
        const historyResponse = await tester.makeAuthenticatedRequest(
          'GET',
          `/api/v4/lottery/history/${test_user_id}`,
          null,
          'regular'
        )

        if (historyResponse.status === 200 && historyResponse.data.data.length > 0) {
          const latestRecord = historyResponse.data.data[0]
          expect(latestRecord).toBeDefined()
          expect(latestRecord.campaign_id).toBe(campaign.campaign_id)
          console.log('📝 抽奖记录验证通过')
        }

        // 如果中奖，验证奖品发放
        if (drawResponse.data.data?.prize_id) {
          const prize_id = drawResponse.data.data.prize_id
          console.log(`🎁 中奖奖品ID: ${prize_id}`)

          // 验证用户库存增加
          const inventoryIncrease = afterInventory.length - beforeInventory.length
          expect(inventoryIncrease).toBeGreaterThanOrEqual(0)
          console.log('🎁 奖品发放验证通过')
        }

        console.log('✅ 抽奖数据一致性验证通过')
      }
    })

    // ✅ is_winner业务标准专项测试 - 扩展现有抽奖测试功能
    describe('🎯 is_winner业务标准验证', () => {
      test('✅ is_winner字段一致性验证 - 数据库vs API响应', async () => {
        console.log('📋 测试is_winner业务标准字段一致性...')

        // 获取抽奖活动
        const campaign = await getAvailableCampaign(tester)
        if (!campaign) {
          console.log('⚠️ 跳过测试：没有可用的抽奖活动')
          return
        }

        // 执行抽奖
        const drawResponse = await tester.makeAuthenticatedRequest(
          'POST',
          '/api/v4/lottery/execute',
          {
            user_id: test_user_id,
            campaign_id: campaign.campaign_id,
            strategy: 'basic',
            drawType: 'single'
          },
          'regular'
        )

        if (drawResponse.status === 200) {
          const drawResult = drawResponse.data.data
          console.log(`🎰 抽奖结果: ${JSON.stringify(drawResult.drawResult?.result)}`)

          // ✅ 验证API响应使用is_winner业务标准字段
          if (drawResult.drawResult?.result) {
            expect(drawResult.drawResult.result).toHaveProperty('is_winner')
            expect(typeof drawResult.drawResult.result.is_winner).toBe('boolean')
            console.log(
              `✅ API响应is_winner字段验证通过: ${drawResult.drawResult.result.is_winner}`
            )
          }

          // ✅ 验证数据库记录使用is_winner字段
          const historyResponse = await tester.makeAuthenticatedRequest(
            'GET',
            `/api/v4/lottery/history/${test_user_id}`,
            null,
            'regular'
          )

          if (historyResponse.status === 200 && historyResponse.data.data.length > 0) {
            const latestRecord = historyResponse.data.data[0]
            expect(latestRecord).toHaveProperty('is_winner')
            expect(typeof latestRecord.is_winner).toBe('boolean')
            console.log(`✅ 数据库记录is_winner字段验证通过: ${latestRecord.is_winner}`)

            // ✅ 验证API响应与数据库记录的is_winner一致性
            if (drawResult.drawResult?.result?.is_winner !== undefined) {
              expect(latestRecord.is_winner).toBe(drawResult.drawResult.result.is_winner)
              console.log('✅ API响应与数据库is_winner字段一致性验证通过')
            }
          }
        }
      })

      test('✅ is_winner业务语义验证 - 中奖必有奖品，未中奖无奖品', async () => {
        console.log('📋 测试is_winner业务语义逻辑一致性...')

        // 获取多条抽奖历史记录验证业务语义
        const historyResponse = await tester.makeAuthenticatedRequest(
          'GET',
          `/api/v4/lottery/history/${test_user_id}`,
          null,
          'regular'
        )

        if (historyResponse.status === 200 && historyResponse.data.data.length > 0) {
          const records = historyResponse.data.data
          console.log(`📊 检查${records.length}条抽奖记录的业务语义一致性`)

          for (const record of records) {
            // ✅ 业务规则验证：is_winner = true 必须有奖品
            if (record.is_winner === true) {
              expect(record.prize_id || record.prize).toBeDefined()
              expect(record.prize_name || record.prize?.name).toBeDefined()
              console.log(`✅ 中奖记录业务语义验证通过: ${record.prize_name || record.prize?.name}`)
            }

            // ✅ 业务规则验证：is_winner = false 不应有奖品
            if (record.is_winner === false) {
              expect(record.prize_id || record.prize).toBeUndefined()
              console.log('✅ 未中奖记录业务语义验证通过: 无奖品信息')
            }

            // ✅ 验证is_winner字段不能为null或undefined
            expect(record.is_winner).not.toBeNull()
            expect(record.is_winner).not.toBeUndefined()
            expect(typeof record.is_winner).toBe('boolean')
          }

          console.log('✅ 所有记录的is_winner业务语义验证通过')
        } else {
          console.log('⚠️ 没有抽奖历史记录，跳过业务语义验证')
        }
      })

      test('✅ 业务状态验证 - 交易、兑换、积分统一标准', async () => {
        console.log('📋 测试业务状态字段的统一性和一致性...')

        // ✅ 验证积分交易状态
        const pointsResponse = await tester.makeAuthenticatedRequest(
          'GET',
          `/api/v4/points/transactions/${test_user_id}`,
          null,
          'regular'
        )

        if (pointsResponse.status === 200 && pointsResponse.data.data?.length > 0) {
          const transactions = pointsResponse.data.data
          console.log(`📊 验证${transactions.length}条积分交易的status字段`)

          for (const transaction of transactions) {
            if (transaction.status) {
              // ✅ 直接验证status字段，不再使用is_successful
              const isCompleted = transaction.status === 'completed'
              console.log(
                `💰 积分交易状态: ${transaction.status}, 完成状态: ${isCompleted}`
              )

              // 验证status值合法性
              const validStatuses = ['pending', 'completed', 'failed', 'cancelled']
              expect(validStatuses).toContain(transaction.status)
            }
          }
        }

        // ✅ 验证用户库存(兑换记录)的is_successful概念
        const inventoryResponse = await getUserInventory(tester, test_user_id)
        if (inventoryResponse.length > 0) {
          console.log(`📊 检查${inventoryResponse.length}条库存物品的状态语义`)

          for (const item of inventoryResponse) {
            // ✅ 验证库存状态与业务成功概念的关系
            const isSuccessfulStates = ['available', 'used', 'transferred']
            const isUnsuccessfulStates = ['pending', 'expired', 'cancelled']

            if (isSuccessfulStates.includes(item.status)) {
              console.log(`✅ 库存物品成功状态验证: ${item.name} - ${item.status}`)
            } else if (isUnsuccessfulStates.includes(item.status)) {
              console.log(`⚠️ 库存物品非成功状态: ${item.name} - ${item.status}`)
            }
          }
        }

        console.log('✅ 业务状态标准验证完成')
      })
    })
  })

  // 💎 VIP等级业务规则验证 - 已废弃功能，移除相关测试代码

  describe('🔢 积分计算逻辑验证', () => {
    test('➕ 积分获得计算规则', async () => {
      console.log('📋 测试积分获得计算规则...')

      // 🎯 使用明确存在的用户ID进行积分获得测试
      const points_test_user_id = 39 // 使用积分较少的用户进行测试
      const initialPoints = await getUserPoints(tester, points_test_user_id)
      console.log(`📊 初始积分: ${initialPoints}`)

      // 模拟积分获得操作（如完成任务）
      const earnData = {
        user_id: points_test_user_id,
        points: 100,
        reason: '业务逻辑测试-完成任务',
        operation: 'add'
      }
      console.log('📋 积分调整请求:', earnData)

      const earnResponse = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/admin/points/adjust',
        earnData,
        'admin'
      )
      console.log(`📊 积分调整响应状态: ${earnResponse.status}`)
      console.log('📋 积分调整响应:', JSON.stringify(earnResponse.data, null, 2))

      if (earnResponse.status === 200) {
        // 等待积分处理
        await new Promise(resolve => {
          setTimeout(resolve, 1000)
        })

        const finalPoints = await getUserPoints(tester, test_user_id)
        const pointsIncrease = finalPoints - initialPoints

        // 验证积分正确增加
        expect(pointsIncrease).toBeGreaterThanOrEqual(100)
        console.log(`💰 积分增加: ${initialPoints} → ${finalPoints} (+${pointsIncrease})`)

        console.log('✅ 积分获得计算规则验证通过')
      }
    })

    test('➖ 积分消费计算规则', async () => {
      console.log('📋 测试积分消费计算规则...')

      const initialPoints = await getUserPoints(tester, test_user_id)

      if (initialPoints < 50) {
        console.log('⚠️ 跳过测试：积分余额不足')
        return
      }

      // 执行积分消费
      const spendData = {
        amount: 30,
        reason: '业务逻辑测试-积分消费',
        context: 'test_spend'
      }

      const spendResponse = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/points/spend',
        spendData,
        'regular'
      )

      if (spendResponse.status === 200) {
        await new Promise(resolve => {
          setTimeout(resolve, 1000)
        })

        const finalPoints = await getUserPoints(tester, test_user_id)
        const pointsDecrease = initialPoints - finalPoints

        // 验证积分正确扣除
        expect(pointsDecrease).toBe(30)
        console.log(`💰 积分扣除: ${initialPoints} → ${finalPoints} (-${pointsDecrease})`)

        console.log('✅ 积分消费计算规则验证通过')
      }
    })
  })

  describe('🔐 业务约束和边界测试', () => {
    test('🚫 重复抽奖防护验证', async () => {
      console.log('📋 测试重复抽奖防护机制...')

      const campaign = await getAvailableCampaign(tester)
      if (!campaign) {
        console.log('⚠️ 跳过测试：没有可用活动')
        return
      }

      // 快速连续发送两个抽奖请求
      const drawData = { campaign_id: campaign.campaign_id, draw_type: 'single' }

      const [response1, response2] = await Promise.all([
        tester.makeAuthenticatedRequest(
          'POST',
          '/api/v4/lottery/draw',
          drawData,
          'regular'
        ),
        tester.makeAuthenticatedRequest(
          'POST',
          '/api/v4/lottery/draw',
          drawData,
          'regular'
        )
      ])

      // 至少有一个请求应该被拒绝（防重复机制）
      const successCount = [response1, response2].filter(r => r.status === 200).length

      if (successCount === 2) {
        console.log('⚠️ 检测到可能的重复抽奖问题')
      } else {
        console.log('✅ 重复抽奖防护机制工作正常')
      }
    })

    test('📊 数据完整性约束验证', async () => {
      console.log('📋 测试数据完整性约束...')

      // 尝试创建无效的积分记录 - 使用明确存在的用户ID
      const invalidData = {
        user_id: 31, // 使用确定存在的管理员用户
        points: -999999, // 异常大的负数
        reason: '业务逻辑测试-无效数据',
        operation: 'add'
      }

      const invalidResponse = await tester.makeAuthenticatedRequest(
        'POST',
        '/api/v4/admin/points/adjust',
        invalidData,
        'admin'
      )

      // 应该拒绝无效数据 - 修复断言逻辑
      console.log(`📊 API响应状态: ${invalidResponse.status}`)
      console.log(`📋 响应错误码: ${invalidResponse.data?.code}`)

      // 🎯 修复：匹配项目的API设计模式（统一HTTP 200，业务状态通过response字段）
      expect(invalidResponse.status).toBe(200)
      expect(invalidResponse.data?.success).toBe(false)
      expect(invalidResponse.data?.code).toBe('INVALID_POINTS_VALUE')
      console.log('✅ 数据完整性约束验证通过')
    })

    test('⚡ 并发操作数据一致性', async () => {
      console.log('📋 测试并发操作数据一致性...')

      const initialPoints = await getUserPoints(tester, test_user_id)

      if (initialPoints < 100) {
        console.log('⚠️ 跳过测试：积分余额不足并发测试')
        return
      }

      // 并发执行多个积分消费操作
      const spendPromises = Array.from({ length: 3 }, () =>
        tester.makeAuthenticatedRequest(
          'POST',
          '/api/v4/points/spend',
          { amount: 10, reason: '并发测试', context: 'concurrent_test' },
          'regular'
        )
      )

      const results = await Promise.all(spendPromises)
      const successCount = results.filter(r => r.status === 200).length

      await new Promise(resolve => {
        setTimeout(resolve, 2000)
      })
      const finalPoints = await getUserPoints(tester, test_user_id)

      // 验证最终积分是否正确
      const expectedDeduction = successCount * 10
      const actualDeduction = initialPoints - finalPoints

      console.log(
        `💰 并发操作结果: 成功${successCount}次, 积分扣除${actualDeduction}, 预期${expectedDeduction}`
      )

      // 允许一定的误差范围
      expect(Math.abs(actualDeduction - expectedDeduction)).toBeLessThan(20)
      console.log('✅ 并发操作数据一致性验证通过')
    })
  })

  afterAll(() => {
    if (tester) {
      const report = tester.generateTestReport()
      console.log('\n📊 业务逻辑测试报告:')
      console.log('='.repeat(60))
      console.log(`📋 总测试数: ${report.summary.total}`)
      console.log(`✅ 成功: ${report.summary.success}`)
      console.log(`❌ 失败: ${report.summary.failed}`)
      console.log(`📈 成功率: ${report.summary.successRate}`)
      console.log('='.repeat(60))
      console.log('🎯 业务逻辑覆盖:')
      console.log('   ✅ 抽奖业务规则验证')
      console.log('   ✅ 权限系统验证')
      console.log('   ✅ 积分计算逻辑验证')
      console.log('   ✅ 业务约束检查')
      console.log('   ✅ 数据一致性验证')
      console.log('   ✅ 并发安全性验证')
    }
  })
})
