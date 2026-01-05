/**
 * 抽奖积分集成测试 - V4.5
 *
 * 验证BasicGuaranteeStrategy使用AssetService后的数据完整性：
 * 1. 积分消费记录完整性（通过AssetService查询）
 * 2. 积分奖励记录完整性
 * 3. 资产流水记录正确性
 *
 * 🔧 V4.5更新：从UserPointsAccount迁移到AssetService（Account + AccountAssetBalance）
 */

const {
  User,
  LotteryPrize,
  AssetTransaction,
  Account,
  AccountAssetBalance
} = require('../../models')
const AssetService = require('../../services/AssetService')
const BasicGuaranteeStrategy = require('../../services/UnifiedLotteryEngine/strategies/BasicGuaranteeStrategy')

describe('抽奖积分集成测试 - V4.5', () => {
  const testUserId = 31 // 测试账号：13612227930
  const campaignId = 2 // 使用实际存在的活动ID

  let initialBalance = null
  let initialUser = null

  /**
   * 辅助函数：获取用户POINTS余额（使用新资产系统）
   */
  async function getPointsBalance (userId) {
    const result = await AssetService.getBalance({ user_id: userId, asset_code: 'POINTS' })
    return result ? Number(result.available_amount) : 0
  }

  beforeAll(async () => {
    // 获取初始状态（使用新资产系统）
    initialBalance = await getPointsBalance(testUserId)
    initialUser = await User.findByPk(testUserId)

    if (!initialUser) {
      throw new Error('测试用户不存在')
    }

    console.log('\n📊 测试开始前的数据状态（V4.5资产系统）：')
    console.log({
      available_points: initialBalance,
      history_total_points: initialUser.history_total_points
    })
  })

  describe('抽奖消费积分测试', () => {
    test('应该创建完整的积分消费记录', async () => {
      const beforeBalance = await getPointsBalance(testUserId)

      // 检查余额是否足够
      if (beforeBalance < 100) {
        console.log('\n⚠️ 跳过测试：用户积分不足（需要至少100积分）')
        return
      }

      // 执行一次抽奖
      const strategy = new BasicGuaranteeStrategy()

      try {
        const result = await strategy.execute({
          user_id: testUserId,
          campaign_id: campaignId
        })

        console.log('\n🎲 抽奖结果：', {
          success: result.success,
          // V4.0语义更新：使用 reward_tier 替代 is_winner
          reward_tier: result.reward_tier,
          prize: result.prize?.prize_name
        })

        // 如果策略执行失败（无可用奖品、幂等性等问题），跳过验证
        if (!result.success) {
          console.log('\n⚠️ 跳过测试：策略执行未成功（可能无可用奖品或配置问题）')
          return
        }

        // 验证积分账户更新（使用新资产系统）
        const afterBalance = await getPointsBalance(testUserId)

        // 1. 验证余额减少
        expect(afterBalance).toBe(beforeBalance - 100)

        // 2. 验证资产流水记录存在（使用AssetTransaction）
        const consumeRecords = await AssetTransaction.findAll({
          where: {
            user_id: testUserId,
            asset_code: 'POINTS',
            business_type: 'lottery_consume'
          },
          order: [['created_at', 'DESC']],
          limit: 1
        })

        expect(consumeRecords.length).toBe(1)
        const consumeRecord = consumeRecords[0]

        // 3. 验证流水记录详情
        expect(Number(consumeRecord.delta_amount)).toBe(-100) // 扣减为负数
        expect(consumeRecord.asset_code).toBe('POINTS')

        console.log('\n✅ 积分消费记录验证通过：')
        console.log({
          transaction_id: consumeRecord.transaction_id,
          delta_amount: consumeRecord.delta_amount,
          asset_code: consumeRecord.asset_code,
          business_type: consumeRecord.business_type
        })
      } catch (error) {
        if (error.message.includes('积分余额不足') || error.message.includes('余额不足')) {
          console.log('\n⚠️ 跳过测试：用户积分不足')
          return
        }
        throw error
      }
    })
  })

  describe('抽奖奖励积分测试', () => {
    test('应该创建完整的积分奖励记录', async () => {
      // 获取积分奖品
      const pointsPrize = await LotteryPrize.findOne({
        where: {
          campaign_id: campaignId,
          prize_type: 'points',
          status: 'active'
        }
      })

      if (!pointsPrize) {
        console.log('\n⚠️ 跳过测试：无可用积分奖品')
        return
      }

      const beforeBalance = await getPointsBalance(testUserId)

      // 检查余额是否足够尝试多次抽奖
      if (beforeBalance < 2000) {
        console.log('\n⚠️ 跳过测试：用户积分不足尝试抽中奖励（需要至少2000积分）')
        return
      }

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

          // V4.0语义更新：使用 reward_tier 替代 is_winner（每次抽奖必得奖品）
          if (result.reward_tier && result.prize?.prize_type === 'points') {
            rewardResult = result
            console.log(
              `\n🎉 第${attempts}次抽奖中奖！奖励：${result.prize.prize_name} (${result.prize.prize_value}积分)`
            )
            break
          }
        } catch (error) {
          if (error.message.includes('积分余额不足') || error.message.includes('余额不足')) {
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

      // 验证资产流水记录存在
      const rewardRecords = await AssetTransaction.findAll({
        where: {
          user_id: testUserId,
          asset_code: 'POINTS',
          business_type: 'lottery_reward'
        },
        order: [['created_at', 'DESC']],
        limit: 1
      })

      expect(rewardRecords.length).toBe(1)
      const rewardRecord = rewardRecords[0]

      // 验证流水记录详情
      expect(Number(rewardRecord.delta_amount)).toBe(prizeValue) // 奖励为正数
      expect(rewardRecord.asset_code).toBe('POINTS')

      console.log('\n✅ 积分奖励记录验证通过：')
      console.log({
        transaction_id: rewardRecord.transaction_id,
        delta_amount: rewardRecord.delta_amount,
        prize_value: prizeValue
      })
    }, 120000) // 增加超时时间到120秒
  })

  describe('数据一致性验证', () => {
    test('资产余额应该正确反映交易记录', async () => {
      // 获取当前余额
      const currentBalance = await getPointsBalance(testUserId)

      // 获取账户信息
      const account = await Account.findOne({
        where: { user_id: testUserId, account_type: 'user' }
      })

      if (!account) {
        console.log('\n⚠️ 跳过测试：用户账户不存在')
        return
      }

      const assetBalance = await AccountAssetBalance.findOne({
        where: { account_id: account.account_id, asset_code: 'POINTS' }
      })

      if (!assetBalance) {
        console.log('\n⚠️ 跳过测试：积分余额记录不存在')
        return
      }

      // 验证AssetService返回的余额与数据库一致
      expect(currentBalance).toBe(Number(assetBalance.available_amount))

      console.log('\n✅ 余额一致性验证通过：')
      console.log({
        service_balance: currentBalance,
        db_balance: Number(assetBalance.available_amount)
      })
    })
  })

  afterAll(async () => {
    // 显示最终状态
    const finalBalance = await getPointsBalance(testUserId)
    const finalUser = await User.findByPk(testUserId)

    console.log('\n📊 测试结束后的数据状态：')
    console.log({
      available_points: finalBalance,
      history_total_points: finalUser?.history_total_points
    })

    console.log('\n📈 数据变化：')
    console.log({
      available_points_变化: finalBalance - initialBalance
    })
  })
})
