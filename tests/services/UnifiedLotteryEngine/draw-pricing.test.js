/**
 * 连抽定价功能测试套件
 *
 * @description 基于实际数据量（10用户、629抽奖记录）的简化测试
 * @testApproach 直接使用生产数据库测试，无需Mock
 * @created 2025-10-21
 * @version 1.0.0
 */

const { UnifiedLotteryEngine } = require('../../../services/UnifiedLotteryEngine/UnifiedLotteryEngine')
const models = require('../../../models')
const { User, UserPointsAccount, LotteryCampaign } = models

describe('🎯 连抽定价功能测试', () => {
  let engine
  let test_user = null
  let test_campaign = null

  // 真实测试用户配置
  const REAL_TEST_USER_CONFIG = {
    mobile: '13612227930',
    user_id: 31 // 数据库确认的真实用户ID
  }

  /**
   * 测试前准备：使用实际用户数据
   */
  beforeAll(async () => {
    console.log('🔍 初始化连抽定价测试环境...')

    try {
      // 验证真实测试用户存在
      test_user = await User.findOne({
        where: { mobile: REAL_TEST_USER_CONFIG.mobile }
      })

      if (!test_user) {
        throw new Error(`测试用户 ${REAL_TEST_USER_CONFIG.mobile} 不存在`)
      }

      // 获取活跃的抽奖活动
      test_campaign = await LotteryCampaign.findOne({
        where: { status: 'active' },
        order: [['created_at', 'DESC']]
      })

      if (!test_campaign) {
        throw new Error('未找到活跃的抽奖活动')
      }

      // 确保用户有足够的积分进行测试
      const userAccount = await UserPointsAccount.findOne({
        where: { user_id: test_user.user_id }
      })

      if (!userAccount || userAccount.available_points < 1000) {
        console.log('⚠️ 用户积分不足1000，添加测试积分...')
        if (userAccount) {
          await userAccount.update({
            available_points: 10000,
            total_earned: models.sequelize.literal('total_earned + 10000')
          })
        } else {
          await UserPointsAccount.create({
            user_id: test_user.user_id,
            available_points: 10000,
            total_earned: 10000
          })
        }
      }

      // 初始化统一引擎
      engine = new UnifiedLotteryEngine()

      console.log('✅ 测试环境初始化完成')
      console.log(`📊 测试用户: ${test_user.user_id} (${test_user.mobile})`)
      console.log(`📊 测试活动: ${test_campaign.campaign_id} (${test_campaign.campaign_name})`)
    } catch (error) {
      console.error('❌ 测试环境初始化失败:', error.message)
      throw error
    }
  }, 30000)

  /**
   * 测试1：单抽功能（基准测试）
   *
   * @expects 消耗100积分，返回1个抽奖结果
   */
  test('单抽：消耗100积分，无折扣', async () => {
    // 执行单抽
    const result = await engine.execute_draw(
      test_user.user_id,
      test_campaign.campaign_id,
      1 // draw_count=1
    )

    // ✅ 核心验证：定价信息是否正确
    expect(result.success).toBe(true)
    expect(result.draw_count).toBe(1)
    expect(result.total_points_cost).toBe(100) // 消耗100积分
    expect(result.original_cost).toBe(100) // 原价100积分
    expect(result.discount).toBe(1.0) // 无折扣
    expect(result.saved_points).toBe(0) // 无节省
    expect(result.draw_type).toBe('单抽') // 类型名称

    /*
     * 注意：不验证最终余额，因为会受抽奖结果（中奖积分）影响
     * 余额变化 = -100（消耗）+ 中奖积分（100/500等）
     */

    console.log('✅ 单抽测试通过：消耗100积分，无折扣')
  }, 30000)

  /**
   * 测试2：3连抽功能
   *
   * @expects 消耗300积分，返回3个抽奖结果，无折扣
   */
  test('3连抽：消耗300积分，无折扣', async () => {
    const result = await engine.execute_draw(
      test_user.user_id,
      test_campaign.campaign_id,
      3 // draw_count=3
    )

    // ✅ 核心验证：定价信息是否正确
    expect(result.success).toBe(true)
    expect(result.draw_count).toBe(3)
    expect(result.prizes.length).toBe(3) // 返回3个抽奖结果
    expect(result.total_points_cost).toBe(300) // 消耗300积分
    expect(result.original_cost).toBe(300) // 原价也是300
    expect(result.discount).toBe(1.0) // 无折扣
    expect(result.saved_points).toBe(0) // 无节省
    expect(result.draw_type).toBe('3连抽')

    /*
     * 注意：不验证最终余额，因为会受抽奖结果（中奖积分）影响
     * 余额变化 = -300（消耗）+ 中奖积分（100/500等）
     */

    console.log('✅ 3连抽测试通过：消耗300积分，无折扣')
  }, 30000)

  /**
   * 测试3：5连抽功能
   *
   * @expects 消耗500积分，返回5个抽奖结果，无折扣
   */
  test('5连抽：消耗500积分，无折扣', async () => {
    const result = await engine.execute_draw(
      test_user.user_id,
      test_campaign.campaign_id,
      5 // draw_count=5
    )

    // ✅ 核心验证：定价信息是否正确
    expect(result.success).toBe(true)
    expect(result.draw_count).toBe(5)
    expect(result.prizes.length).toBe(5)
    expect(result.total_points_cost).toBe(500) // 消耗500积分
    expect(result.original_cost).toBe(500) // 原价500积分
    expect(result.discount).toBe(1.0) // 无折扣
    expect(result.saved_points).toBe(0) // 无节省
    expect(result.draw_type).toBe('5连抽')

    /*
     * 注意：不验证最终余额，因为会受抽奖结果（中奖积分）影响
     * 余额变化 = -500（消耗）+ 中奖积分（100/500等）
     */

    console.log('✅ 5连抽测试通过：消耗500积分，无折扣')
  }, 30000)

  /**
   * 测试4：10连抽功能（核心测试 - 验证折扣机制）
   *
   * @expects 消耗900积分（九折优惠），返回10个抽奖结果，节省100积分
   */
  test('10连抽：消耗900积分，九折优惠（节省100积分）', async () => {
    const result = await engine.execute_draw(
      test_user.user_id,
      test_campaign.campaign_id,
      10 // draw_count=10
    )

    // 🎯 核心验证点：10连抽的折扣机制
    expect(result.success).toBe(true)
    expect(result.draw_count).toBe(10)
    expect(result.prizes.length).toBe(10) // 返回10个抽奖结果
    expect(result.total_points_cost).toBe(900) // 🎁 仅消耗900积分
    expect(result.original_cost).toBe(1000) // 原价1000积分
    expect(result.discount).toBe(0.9) // 九折
    expect(result.saved_points).toBe(100) // 💰 节省100积分
    expect(result.draw_type).toBe('10连抽(九折)')

    /*
     * 注意：不验证最终余额，因为会受抽奖结果（中奖积分）影响
     * 余额变化 = -900（消耗）+ 中奖积分（100/500等）
     */

    console.log('✅ 10连抽测试通过：消耗900积分，节省100积分（九折优惠）')
  }, 30000)

  /**
   * 测试5：积分不足场景
   *
   * @expects 抛出"积分不足"错误，事务回滚，积分不变
   */
  test('积分不足：拒绝抽奖，事务回滚', async () => {
    // 1. 临时将用户积分设为50（不足100）
    const user_account = await UserPointsAccount.findOne({
      where: { user_id: test_user.user_id }
    })
    const original_balance = parseFloat(user_account.available_points)

    await user_account.update({
      available_points: 50 // 只有50积分
    })

    // 2. 尝试单抽（需要100积分）
    await expect(
      engine.execute_draw(
        test_user.user_id,
        test_campaign.campaign_id,
        1
      )
    ).rejects.toThrow(/积分不足/)

    // 3. 验证积分未被扣除（事务回滚）
    const after_account = await UserPointsAccount.findOne({
      where: { user_id: test_user.user_id }
    })
    const after_balance = parseFloat(after_account.available_points)
    expect(after_balance).toBe(50) // 积分保持不变

    // 恢复原始积分
    await user_account.update({
      available_points: original_balance
    })

    console.log('✅ 积分不足测试通过：正确拒绝，事务回滚')
  }, 30000)

  /**
   * 测试6：配置读取测试
   *
   * @expects 正确读取数据库配置，返回定价信息
   */
  test('配置驱动：正确读取数据库定价配置', async () => {
    // 直接测试getDrawPricing方法
    const campaign = await LotteryCampaign.findByPk(test_campaign.campaign_id)

    const pricing_single = engine.getDrawPricing(1, campaign)
    expect(pricing_single.total_cost).toBe(100)
    expect(pricing_single.discount).toBe(1.0)

    const pricing_triple = engine.getDrawPricing(3, campaign)
    expect(pricing_triple.total_cost).toBe(300)
    expect(pricing_triple.discount).toBe(1.0)

    const pricing_five = engine.getDrawPricing(5, campaign)
    expect(pricing_five.total_cost).toBe(500)
    expect(pricing_five.discount).toBe(1.0)

    const pricing_ten = engine.getDrawPricing(10, campaign)
    expect(pricing_ten.total_cost).toBe(900) // 九折优惠
    expect(pricing_ten.discount).toBe(0.9)
    expect(pricing_ten.per_draw).toBe(90)
    expect(pricing_ten.label).toBe('10连抽(九折)')

    console.log('✅ 配置驱动测试通过：所有定价配置正确')
  }, 30000)
})
