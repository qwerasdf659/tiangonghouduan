/**
 * 抽奖积分集成测试 - V4.3
 *
 * 验证BasicGuaranteeStrategy使用PointsService后的数据完整性：
 * 1. 积分消费记录完整性
 * 2. 积分奖励记录完整性
 * 3. history_total_points同步正确性
 * 4. total_consumed和total_earned准确性
 */

const { User, UserPointsAccount, PointsTransaction, LotteryPrize } = require('../../models')
const BasicGuaranteeStrategy = require('../../services/UnifiedLotteryEngine/strategies/BasicGuaranteeStrategy')

describe('抽奖积分集成测试 - V4.3', () => {
  const testUserId = 31 // 测试账号：13612227930
  const campaignId = 2 // 使用实际存在的活动ID

  let initialAccount = null
  let initialUser = null

  beforeAll(async () => {
    // 获取初始状态
    initialAccount = await UserPointsAccount.findOne({ where: { user_id: testUserId } })
    initialUser = await User.findByPk(testUserId)

    if (!initialAccount || !initialUser) {
      throw new Error('测试用户或积分账户不存在')
    }

    console.log('\n📊 测试开始前的数据状态：')
    console.log({
      available_points: initialAccount.available_points,
      total_earned: initialAccount.total_earned,
      total_consumed: initialAccount.total_consumed,
      history_total_points: initialUser.history_total_points
    })
  })

  describe('抽奖消费积分测试', () => {
    test('应该创建完整的积分消费记录', async () => {
      const beforeAccount = await UserPointsAccount.findOne({ where: { user_id: testUserId } })
      const beforeBalance = parseFloat(beforeAccount.available_points)
      const beforeConsumed = parseFloat(beforeAccount.total_consumed)

      // 执行一次抽奖
      const strategy = new BasicGuaranteeStrategy()

      try {
        const result = await strategy.execute({
          user_id: testUserId,
          campaign_id: campaignId // 使用实际存在的活动
        })

        console.log('\n🎲 抽奖结果：', {
          is_winner: result.is_winner,
          prize: result.prize?.prize_name
        })

        // 验证积分账户更新
        const afterAccount = await UserPointsAccount.findOne({ where: { user_id: testUserId } })
        const afterBalance = parseFloat(afterAccount.available_points)
        const afterConsumed = parseFloat(afterAccount.total_consumed)

        // 1. 验证余额减少
        expect(afterBalance).toBe(beforeBalance - 100)

        // 2. 验证累计消费增加
        expect(afterConsumed).toBe(beforeConsumed + 100)

        // 3. 验证交易记录存在
        const consumeRecords = await PointsTransaction.findAll({
          where: {
            user_id: testUserId,
            business_type: 'lottery_consume',
            transaction_type: 'consume'
          },
          order: [['transaction_time', 'DESC']],
          limit: 1
        })

        expect(consumeRecords.length).toBe(1)
        const consumeRecord = consumeRecords[0]

        // 4. 验证交易记录详情
        expect(consumeRecord.points_amount).toBe(100)
        expect(consumeRecord.points_balance_before).toBe(beforeBalance)
        expect(consumeRecord.points_balance_after).toBe(afterBalance)
        expect(consumeRecord.transaction_title).toContain('抽奖消耗积分')
        expect(consumeRecord.source_type).toBe('system')
        expect(consumeRecord.status).toBe('completed')

        console.log('\n✅ 积分消费记录验证通过：')
        console.log({
          transaction_id: consumeRecord.transaction_id,
          points_amount: consumeRecord.points_amount,
          balance_before: consumeRecord.points_balance_before,
          balance_after: consumeRecord.points_balance_after,
          title: consumeRecord.transaction_title
        })
      } catch (error) {
        if (error.message.includes('积分余额不足')) {
          console.log('\n⚠️ 跳过测试：用户积分不足')
          return
        }
        throw error
      }
    })
  })

  describe('抽奖奖励积分测试', () => {
    test('应该创建完整的积分奖励记录并同步history_total_points', async () => {
      // 获取积分奖品
      const pointsPrize = await LotteryPrize.findOne({
        where: {
          campaign_id: campaignId,
          prize_type: 'points',
          is_active: true
        }
      })

      if (!pointsPrize) {
        console.log('\n⚠️ 跳过测试：无可用积分奖品')
        return
      }

      const beforeAccount = await UserPointsAccount.findOne({ where: { user_id: testUserId } })
      const beforeUser = await User.findByPk(testUserId)
      const beforeEarned = parseFloat(beforeAccount.total_earned)
      const beforeHistory = beforeUser.history_total_points

      // 尝试多次抽奖直到中奖积分奖励
      const strategy = new BasicGuaranteeStrategy()
      let rewardResult = null
      let attempts = 0
      const maxAttempts = 20

      console.log('\n🎲 尝试抽中积分奖励...')

      while (attempts < maxAttempts && !rewardResult) {
        try {
          const result = await strategy.execute({
            user_id: testUserId,
            campaign_id: campaignId
          })

          attempts++

          if (result.is_winner && result.prize?.prize_type === 'points') {
            rewardResult = result
            console.log(`\n🎉 第${attempts}次抽奖中奖！奖励：${result.prize.prize_name} (${result.prize.prize_value}积分)`)
            break
          }
        } catch (error) {
          if (error.message.includes('积分余额不足')) {
            console.log('\n⚠️ 测试中止：用户积分不足')
            return
          }
          throw error
        }
      }

      if (!rewardResult) {
        console.log(`\n⚠️ 跳过测试：尝试${maxAttempts}次未中奖积分奖励`)
        return
      }

      const prizeValue = parseInt(rewardResult.prize.prize_value)

      // 验证积分账户更新
      const afterAccount = await UserPointsAccount.findOne({ where: { user_id: testUserId } })
      const afterUser = await User.findByPk(testUserId)
      const afterEarned = parseFloat(afterAccount.total_earned)
      const afterHistory = afterUser.history_total_points

      // 1. 验证累计获得增加
      expect(afterEarned).toBe(beforeEarned + prizeValue)

      // 2. 验证history_total_points同步
      expect(afterHistory).toBe(beforeHistory + prizeValue)

      // 3. 验证交易记录存在
      const rewardRecords = await PointsTransaction.findAll({
        where: {
          user_id: testUserId,
          business_type: 'lottery_reward',
          transaction_type: 'earn'
        },
        order: [['transaction_time', 'DESC']],
        limit: 1
      })

      expect(rewardRecords.length).toBe(1)
      const rewardRecord = rewardRecords[0]

      // 4. 验证交易记录详情
      expect(rewardRecord.points_amount).toBe(prizeValue)
      expect(rewardRecord.transaction_title).toContain('抽奖奖励')
      expect(rewardRecord.source_type).toBe('system')
      expect(rewardRecord.status).toBe('completed')

      console.log('\n✅ 积分奖励记录验证通过：')
      console.log({
        transaction_id: rewardRecord.transaction_id,
        points_amount: rewardRecord.points_amount,
        total_earned_增加: prizeValue,
        history_total_points_增加: prizeValue,
        title: rewardRecord.transaction_title
      })
    }, 120000) // 增加超时时间到120秒
  })

  describe('数据一致性验证', () => {
    test('应该满足 available_points = total_earned - total_consumed', async () => {
      const account = await UserPointsAccount.findOne({ where: { user_id: testUserId } })

      const availablePoints = parseFloat(account.available_points)
      const totalEarned = parseFloat(account.total_earned)
      const totalConsumed = parseFloat(account.total_consumed)
      const calculated = totalEarned - totalConsumed

      expect(availablePoints).toBeCloseTo(calculated, 2)

      console.log('\n✅ 余额一致性验证通过：')
      console.log({
        available_points: availablePoints,
        total_earned: totalEarned,
        total_consumed: totalConsumed,
        calculated,
        difference: Math.abs(availablePoints - calculated)
      })
    })

    test('history_total_points应该等于total_earned', async () => {
      const account = await UserPointsAccount.findOne({ where: { user_id: testUserId } })
      const user = await User.findByPk(testUserId)

      const totalEarned = parseFloat(account.total_earned)
      const historyPoints = user.history_total_points

      expect(historyPoints).toBe(totalEarned)

      console.log('\n✅ history_total_points同步验证通过：')
      console.log({
        history_total_points: historyPoints,
        total_earned: totalEarned,
        is_synced: historyPoints === totalEarned
      })
    })
  })

  afterAll(async () => {
    // 显示最终状态
    const finalAccount = await UserPointsAccount.findOne({ where: { user_id: testUserId } })
    const finalUser = await User.findByPk(testUserId)

    console.log('\n📊 测试结束后的数据状态：')
    console.log({
      available_points: finalAccount.available_points,
      total_earned: finalAccount.total_earned,
      total_consumed: finalAccount.total_consumed,
      history_total_points: finalUser.history_total_points
    })

    console.log('\n📈 数据变化：')
    console.log({
      available_points_变化: parseFloat(finalAccount.available_points) - parseFloat(initialAccount.available_points),
      total_earned_变化: parseFloat(finalAccount.total_earned) - parseFloat(initialAccount.total_earned),
      total_consumed_变化: parseFloat(finalAccount.total_consumed) - parseFloat(initialAccount.total_consumed),
      history_total_points_变化: finalUser.history_total_points - initialUser.history_total_points
    })
  })
})
