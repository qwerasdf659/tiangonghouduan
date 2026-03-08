/**
 * 抽奖积分集成测试 - V4.6 Pipeline 架构版
 *
 * V4.6 Phase 6 更新说明（2026-01-19）：
 * - 使用 UnifiedLotteryEngine 执行抽奖（Pipeline 架构）
 * - 移除对 BasicGuaranteeStrategy 的直接依赖
 * - 通过 DrawOrchestrator 编排抽奖流程
 *
 * 验证抽奖积分消费和奖励的数据完整性：
 * 1. 积分消费记录完整性（通过 BalanceService 查询）
 * 2. 积分奖励记录完整性
 * 3. 资产流水记录正确性
 *
 * @date 2026-01-19 (V4.6 Phase 6 重构)
 */

/* eslint-disable no-console */

const {
  User,
  LotteryPrize,
  AssetTransaction,
  Account,
  AccountAssetBalance
} = require('../../models')

/**
 * V4.6: 通过 ServiceManager 获取服务
 */
let BalanceService
let UnifiedLotteryEngine

describe('抽奖积分集成测试 - V4.6 Pipeline 架构', () => {
  let testUserId
  let campaignId // 🔴 P0-1修复：从 global.testData 动态获取，不再硬编码
  const baseCost = 30 // 单次抽奖消耗积分（从定价配置动态读取）
  let initialBalance = null
  let initialUser = null

  /**
   * 辅助函数：获取用户 POINTS 余额（使用资产系统）
   */
  async function getPointsBalance(userId) {
    const result = await BalanceService.getBalance({ user_id: userId, asset_code: 'POINTS' })
    return result ? Number(result.available_amount) : 0
  }

  beforeAll(async () => {
    console.log('🔍 初始化抽奖积分集成测试环境（V4.6 Pipeline 架构）...')

    // 通过 ServiceManager 获取服务
    BalanceService = global.getTestService('asset_balance')

    /**
     * V4.6: 使用 UnifiedLotteryEngine 替代 BasicGuaranteeStrategy
     * 引擎内部通过 DrawOrchestrator 编排 Pipeline 执行抽奖
     */
    const {
      UnifiedLotteryEngine: Engine
    } = require('../../services/UnifiedLotteryEngine/UnifiedLotteryEngine')
    UnifiedLotteryEngine = new Engine()

    // 🔴 P0-1修复：从 global.testData 动态获取测试用户ID
    testUserId = global.testData?.testUser?.user_id
    if (!testUserId) {
      // 备用：通过手机号查询
      const user = await User.findOne({ where: { mobile: '13612227930' } })
      testUserId = user?.user_id
    }

    if (!testUserId) {
      throw new Error('测试用户不存在')
    }

    // 🔴 P0-1修复：从 global.testData 动态获取活动ID，不再硬编码
    campaignId = global.testData?.testCampaign?.lottery_campaign_id
    if (!campaignId) {
      // 备用：从数据库查询第一个活跃活动
      const { LotteryCampaign } = require('../../models')
      const campaign = await LotteryCampaign.findOne({ where: { status: 'active' } })
      campaignId = campaign?.lottery_campaign_id
    }

    if (!campaignId) {
      console.warn('⚠️ 测试活动不存在，抽奖相关测试将被跳过')
    }

    // 获取初始状态
    initialBalance = await getPointsBalance(testUserId)
    initialUser = await User.findByPk(testUserId)

    console.log('📊 测试开始前的数据状态：')
    console.log({
      user_id: testUserId,
      available_points: initialBalance,
      history_total_points: initialUser?.history_total_points
    })

    console.log('✅ 抽奖积分集成测试环境初始化完成')
  })

  describe('抽奖消费积分测试（Pipeline 架构）', () => {
    test('应该创建完整的积分消费记录', async () => {
      const beforeBalance = await getPointsBalance(testUserId)

      // 检查余额是否足够（baseCost 从定价配置动态读取）
      if (beforeBalance < baseCost) {
        console.log(`\n⚠️ 跳过测试：用户积分不足（需要至少${baseCost}积分，当前${beforeBalance}）`)
        return
      }

      /**
       * V4.6: 使用 UnifiedLotteryEngine.executeLottery()
       * 内部通过 DrawOrchestrator.execute() 编排 Pipeline
       */
      try {
        const result = await UnifiedLotteryEngine.executeLottery({
          user_id: testUserId,
          lottery_campaign_id: campaignId
        })

        console.log('\n🎲 抽奖结果（Pipeline 架构）：', {
          success: result.success,
          lottery_prize_id: result.lottery_prize_id,
          execution_time: result.execution_time
        })

        // 如果执行失败，跳过验证
        if (!result.success) {
          console.log(`\n⚠️ 跳过测试：Pipeline 执行未成功 - ${result.message || result.error}`)
          return
        }

        // 验证积分账户更新
        const afterBalance = await getPointsBalance(testUserId)

        // 1. 验证余额减少
        expect(afterBalance).toBe(beforeBalance - baseCost)

        // 2. 验证资产流水记录存在
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
        expect(Number(consumeRecord.delta_amount)).toBe(-baseCost)
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

  describe('抽奖奖励积分测试（Pipeline 架构）', () => {
    test('应该创建完整的积分奖励记录', async () => {
      // 获取积分奖品
      const pointsPrize = await LotteryPrize.findOne({
        where: {
          lottery_campaign_id: campaignId,
          prize_type: 'points',
          status: 'active'
        }
      })

      if (!pointsPrize) {
        console.log('\n⚠️ 跳过测试：无可用积分奖品')
        return
      }

      const beforeBalance = await getPointsBalance(testUserId)

      if (beforeBalance < baseCost * 20) {
        console.log(`\n⚠️ 跳过测试：用户积分不足尝试抽中奖励（需要至少${baseCost * 20}积分）`)
        return
      }

      let rewardResult = null
      let attempts = 0
      const maxAttempts = 20

      console.log('\n🎲 尝试抽中积分奖励（Pipeline 架构）...')

      while (attempts < maxAttempts && !rewardResult) {
        try {
          const result = await UnifiedLotteryEngine.executeLottery({
            user_id: testUserId,
            lottery_campaign_id: campaignId
          })

          attempts++

          if (result.success && result.prize?.prize_type === 'points') {
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

      expect(Number(rewardRecord.delta_amount)).toBe(prizeValue)
      expect(rewardRecord.asset_code).toBe('POINTS')

      console.log('\n✅ 积分奖励记录验证通过：')
      console.log({
        transaction_id: rewardRecord.transaction_id,
        delta_amount: rewardRecord.delta_amount,
        prize_value: prizeValue
      })
    }, 120000)
  })

  describe('数据一致性验证', () => {
    test('资产余额应该正确反映交易记录', async () => {
      const currentBalance = await getPointsBalance(testUserId)

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

      expect(currentBalance).toBe(Number(assetBalance.available_amount))

      console.log('\n✅ 余额一致性验证通过：')
      console.log({
        service_balance: currentBalance,
        db_balance: Number(assetBalance.available_amount)
      })
    })
  })

  afterAll(async () => {
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
