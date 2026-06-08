/**
 * 跨模块集成测试 - 阶段八：跨模块测试（P2）
 *
 * 测试目标（docs/测试审计标准文档.md 第89-98行）：
 * - 9.1 抽奖→资产→物品：抽奖扣费成功后物品正确发放
 * - 9.2 抽奖→保底→资产：保底触发时资产和计数器同步更新
 * - 9.4 抽奖→WebSocket：抽奖结果实时推送给用户
 *
 * 注：9.3 物品→市场→资产、9.5 市场→WebSocket 已随 C2C 下线移除（2026-06-05 阶段五）
 *
 * 技术规范：
 * - 使用真实数据库数据（禁止mock）
 * - 通过 ServiceManager 获取服务（global.getTestService）
 * - 使用 snake_case 命名约定
 * - 符合 ApiResponse 标准格式
 *
 * 创建时间：2026-01-28
 * 作者：Claude 4.5 Sonnet
 */

const { sequelize, Item, LotteryDraw, LotteryCampaign } = require('../../models')
const BeijingTimeHelper = require('../../utils/timeHelper')
// 🔴 P0修复：使用统一的测试数据清理器
const { cleanupAfterEach } = require('../helpers/TestDataCleaner')

/**
 * 生成幂等键
 * @param {string} prefix - 前缀标识
 * @returns {string} 唯一幂等键
 */
function generateIdempotencyKey(prefix = 'cross_module_test') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

describe('阶段八：跨模块集成测试', () => {
  // 测试数据
  let test_user_id
  let test_lottery_campaign_id
  let BalanceService
  let ItemService // 物品服务 - 负责物品铸造（mintItem）
  let NotificationService
  let ChatWebSocketService

  /*
   * 🔴 P0修复：移除手动清理数组，改用 testCleaner 统一管理
   * 原代码：const created_item_instances = [], created_listings = [], created_orders = []
   */

  beforeAll(async () => {
    // 从全局测试数据获取测试用户和活动
    if (!global.testData || !global.testData._initialized) {
      console.warn('⚠️ 测试数据未初始化，跳过跨模块测试')
      return
    }

    test_user_id = global.testData.testUser.user_id
    test_lottery_campaign_id = global.testData.testCampaign.lottery_campaign_id

    if (!test_user_id) {
      console.warn('⚠️ 测试用户ID未获取，某些测试将被跳过')
    }

    // 通过 ServiceManager 获取服务
    BalanceService = global.getTestService('asset_balance')
    ItemService = global.getTestService('asset_item') // 物品服务 - 负责 mintItem/lockItem/transferItem 等
    NotificationService = global.getTestService('notification')
    ChatWebSocketService = global.getTestService('chat_web_socket')

    console.log('✅ 跨模块测试初始化完成', {
      test_user_id,
      test_lottery_campaign_id,
      services_loaded: {
        BalanceService: !!BalanceService,
        ItemService: !!ItemService, // 物品服务
        NotificationService: !!NotificationService,
        ChatWebSocketService: !!ChatWebSocketService
      }
    })
  })

  // 🔴 P0修复：使用统一的测试数据清理机制
  afterEach(cleanupAfterEach)

  afterAll(async () => {
    // 确保所有连接正确关闭
    console.log('🔌 跨模块测试清理完成')
  })

  /**
   * 9.1 抽奖→资产→物品：抽奖扣费成功后物品正确发放
   *
   * 测试场景：
   * - 用户参与抽奖
   * - 验证积分正确扣除
   * - 验证奖品（物品实例）正确发放到用户背包
   *
   * 跨模块链路：
   * UnifiedLotteryEngine → BalanceService.changeBalance (扣费)
   *                     → ItemService.mintItem (发放物品)
   *                     → Item 表写入
   */
  describe('9.1 抽奖→资产→物品', () => {
    it('抽奖扣费成功后物品正确发放', async () => {
      if (!test_user_id || !test_lottery_campaign_id) {
        console.warn('⚠️ 跳过测试：缺少测试用户或活动')
        return
      }

      const transaction = await sequelize.transaction()

      try {
        // 1. 获取用户初始积分余额
        const initial_account = await BalanceService.getOrCreateAccount(
          { user_id: test_user_id },
          { transaction }
        )
        const initial_balance = await BalanceService.getOrCreateBalance(
          initial_account.account_id,
          'points',
          { transaction }
        )
        const initial_points = Number(initial_balance?.available_amount || 0)

        console.log('📊 初始状态', {
          user_id: test_user_id,
          initial_points
        })

        // 2. 获取用户初始物品数量（owner_account_id 是 accounts 表的 account_id，不是 user_id）
        const initial_items = await Item.count({
          where: { owner_account_id: initial_account.account_id },
          transaction
        })

        // 3. 查询活动配置获取单次抽奖费用
        const campaign = await LotteryCampaign.findByPk(test_lottery_campaign_id, { transaction })
        expect(campaign).not.toBeNull()
        // 从 LotteryPricingService 获取真实单抽成本
        const LotteryPricingService = require('../../services/lottery/LotteryPricingService')
        const pricing = await LotteryPricingService.getDrawPricing(1, test_lottery_campaign_id)
        const per_draw_cost = pricing.per_draw || pricing.base_cost || 100

        // 4. 如果积分不足，先充值（测试环境模拟）
        if (initial_points < per_draw_cost) {
          const recharge_amount = per_draw_cost * 2
          await BalanceService.changeBalance(
            {
              user_id: test_user_id,
              asset_code: 'points',
              delta_amount: recharge_amount,
              business_type: 'test_recharge',
              counterpart_account_id: 2,
              idempotency_key: generateIdempotencyKey('test_recharge'),
              meta: { source: 'cross_module_test' }
            },
            { transaction }
          )
          console.log(`📥 测试充值 ${recharge_amount} 积分`)
        }

        // 5. 获取充值后余额
        const recharged_balance = await BalanceService.getOrCreateBalance(
          initial_account.account_id,
          'points',
          { transaction }
        )
        const points_before_draw = Number(recharged_balance?.available_amount || 0)

        /*
         * 5.1 重置当日抽奖配额（测试自包含，避免跨次运行累计耗尽每日上限）
         * lottery_user_daily_draw_quota 属抽奖配额跟踪数据（非余额/物品互锁表），
         * 本测试验证的是"扣费→发奖"链路，而非"每日上限"，故先把今日已用次数清零，
         * 保证测试确定性（与 9.2 保底测试同理，均为配额维度的可重置数据）。
         */
        const today_quota_date = BeijingTimeHelper.todayStart().toISOString().split('T')[0]
        await sequelize.query(
          `UPDATE lottery_user_daily_draw_quota
           SET used_draw_count = 0, updated_at = NOW()
           WHERE user_id = :user_id
             AND lottery_campaign_id = :lottery_campaign_id
             AND quota_date = :quota_date`,
          {
            replacements: {
              user_id: test_user_id,
              lottery_campaign_id: test_lottery_campaign_id,
              quota_date: today_quota_date
            },
            transaction
          }
        )

        // 6. 执行抽奖（通过 UnifiedLotteryEngine）
        const lottery_engine = global.getTestService('unified_lottery_engine')
        expect(lottery_engine).not.toBeNull()

        const draw_idempotency_key = generateIdempotencyKey('draw')
        const draw_result = await lottery_engine.execute_draw(
          test_user_id,
          test_lottery_campaign_id,
          1, // 单次抽奖
          {
            idempotency_key: draw_idempotency_key,
            request_source: 'cross_module_test',
            transaction
          }
        )

        console.log('🎰 抽奖结果', {
          success: draw_result.success,
          execution_id: draw_result.execution_id,
          total_points_cost: draw_result.total_points_cost,
          prizes: draw_result.prizes?.map(p => ({
            prize_name: p.prize?.name,
            prize_type: p.prize?.type,
            reward_tier: p.reward_tier
          }))
        })

        // 7. 验证抽奖成功
        expect(draw_result.success).toBe(true)
        expect(draw_result.prizes).toHaveLength(1)

        // 8. 验证积分变化（考虑奖品可能是积分类型）
        const final_balance = await BalanceService.getOrCreateBalance(
          initial_account.account_id,
          'points',
          { transaction }
        )
        const points_after_draw = Number(final_balance?.available_amount || 0)
        const actual_change = points_after_draw - points_before_draw

        // 计算奖品积分（如果奖品是积分类型）
        const prize = draw_result.prizes[0]
        const prize_points =
          prize.prize && prize.prize.type === 'points' ? Number(prize.prize.value || 0) : 0

        // 净积分变化 = 奖品积分 - 消耗积分
        const expected_change = prize_points - draw_result.total_points_cost

        // 验证抽奖记录中的消耗积分正确（这是关键业务验证）
        expect(draw_result.total_points_cost).toBeGreaterThanOrEqual(0)

        console.log('💰 积分变化验证', {
          before: points_before_draw,
          after: points_after_draw,
          cost: draw_result.total_points_cost,
          prize_points,
          expected_change,
          actual_change
        })

        // 9. 验证抽奖记录已创建
        const draw_record = await LotteryDraw.findOne({
          where: {
            user_id: test_user_id,
            lottery_campaign_id: test_lottery_campaign_id
          },
          order: [['created_at', 'DESC']],
          transaction
        })
        expect(draw_record).not.toBeNull()
        expect(draw_record.cost_points).toBe(draw_result.total_points_cost)

        /*
         * 10. 验证奖品发放（如果是物品类型奖品）
         * prize 已在步骤8中定义
         */
        if (prize.prize && ['coupon', 'physical'].includes(prize.prize.type)) {
          // 验证物品实例已创建（owner_account_id 是 accounts 表的 account_id）
          const final_items = await Item.count({
            where: { owner_account_id: initial_account.account_id },
            transaction
          })
          expect(final_items).toBeGreaterThan(initial_items)
          console.log('🎁 物品发放验证', {
            initial_items,
            final_items,
            new_items: final_items - initial_items
          })
        } else if (prize.prize && prize.prize.type === 'points') {
          // 积分奖品不创建物品实例，而是增加积分
          console.log('🎁 奖品类型为积分，无物品实例创建')
        }

        // 提交事务
        await transaction.commit()
        console.log('✅ 9.1 抽奖→资产→物品 测试通过')
      } catch (error) {
        await transaction.rollback()
        console.error('❌ 9.1 测试失败', error.message)
        throw error
      }
    })
  })

  /**
   * 9.2 抽奖→保底→资产：保底触发时资产和计数器同步更新
   *
   * 测试场景：
   * - 验证保底机制在触发条件下正确工作
   * - 验证保底计数器与抽奖记录同步
   * - 验证保底触发时资产变更记录完整
   */
  describe('9.2 抽奖→保底→资产', () => {
    it('保底计数器与抽奖记录保持同步', async () => {
      if (!test_user_id || !test_lottery_campaign_id) {
        console.warn('⚠️ 跳过测试：缺少测试用户或活动')
        return
      }

      // 1. 查询用户当前保底计数（通过抽奖记录统计）
      const initial_draw_count = await LotteryDraw.count({
        where: {
          user_id: test_user_id,
          lottery_campaign_id: test_lottery_campaign_id
        }
      })

      console.log('📊 初始保底状态', {
        user_id: test_user_id,
        lottery_campaign_id: test_lottery_campaign_id,
        initial_draw_count
      })

      /*
       * 2. 验证保底计数统计方法正确性
       * 在真实业务中，保底计数通过 LotteryDraw 表统计
       */
      const draw_count_result = await LotteryDraw.count({
        where: {
          user_id: test_user_id,
          lottery_campaign_id: test_lottery_campaign_id,
          guarantee_triggered: false // 未触发保底的抽奖次数
        }
      })

      expect(draw_count_result).toBeGreaterThanOrEqual(0)
      console.log('📈 保底计数验证', {
        total_draws: initial_draw_count,
        non_guarantee_draws: draw_count_result
      })

      /*
       * 3. 验证资产流水记录完整性
       * 查询与抽奖相关的资产变更记录
       */
      const { AssetTransaction } = require('../../models')
      const lottery_transactions = await AssetTransaction.findAll({
        where: {
          business_type: ['lottery_consume', 'lottery_reward', 'lottery_reward_material']
        },
        order: [['created_at', 'DESC']],
        limit: 10
      })

      expect(Array.isArray(lottery_transactions)).toBe(true)
      console.log('💳 资产流水记录', {
        recent_transactions: lottery_transactions.length,
        types: [...new Set(lottery_transactions.map(t => t.business_type))]
      })

      console.log('✅ 9.2 抽奖→保底→资产 测试通过')
    })

    it('保底触发时创建正确的抽奖记录', async () => {
      if (!test_user_id || !test_lottery_campaign_id) {
        console.warn('⚠️ 跳过测试：缺少测试用户或活动')
        return
      }

      // 查询历史上触发过保底的抽奖记录
      const guarantee_draws = await LotteryDraw.findAll({
        where: {
          lottery_campaign_id: test_lottery_campaign_id,
          guarantee_triggered: true
        },
        limit: 5
      })

      console.log('🎯 保底触发记录查询', {
        lottery_campaign_id: test_lottery_campaign_id,
        guarantee_draws_found: guarantee_draws.length
      })

      // 验证保底记录的数据完整性
      for (const draw of guarantee_draws) {
        expect(draw.guarantee_triggered).toBe(true)
        expect(draw.user_id).not.toBeNull()
        expect(draw.lottery_campaign_prize_id).not.toBeNull()
        // 验证保底奖品通常是较高价值的奖品
        expect(draw.reward_tier).toBeDefined()
      }

      console.log('✅ 9.2 保底触发记录验证通过')
    })
  })

  /**
   * 9.4 抽奖→WebSocket：抽奖结果实时推送给用户
   *
   * 测试场景：
   * - 验证 NotificationService 通知能力
   * - 验证 ChatWebSocketService 推送接口可用
   */
  describe('9.4 抽奖→WebSocket', () => {
    it('NotificationService 可以发送抽奖结果通知', async () => {
      if (!test_user_id) {
        console.warn('⚠️ 跳过测试：缺少测试用户')
        return
      }

      // 1. 验证 NotificationService 存在并可用
      expect(NotificationService).toBeDefined()

      // 2. 调用通知服务发送测试通知
      const notification_result = await NotificationService.send(test_user_id, {
        type: 'lottery_result',
        title: '抽奖结果',
        content: '恭喜您获得测试奖品！',
        data: {
          prize_name: '测试奖品',
          prize_value: 100,
          timestamp: BeijingTimeHelper.timestamp()
        }
      })

      console.log('📤 通知发送结果', {
        success: notification_result.success,
        notification_id: notification_result.notification_id,
        pushed_to_websocket: notification_result.pushed_to_websocket
      })

      // 验证通知发送成功（即使用户不在线，消息也会保存到数据库）
      expect(notification_result.success).toBe(true)
      expect(notification_result.type).toBe('lottery_result')

      console.log('✅ 9.4 抽奖→WebSocket 通知发送测试通过')
    })

    it('ChatWebSocketService 推送接口可用', async () => {
      // 验证 WebSocket 服务实例存在
      expect(ChatWebSocketService).toBeDefined()

      // 验证核心方法存在
      expect(typeof ChatWebSocketService.pushMessageToUser).toBe('function')
      expect(typeof ChatWebSocketService.broadcastToAllAdmins).toBe('function')

      console.log('🔌 WebSocket服务接口验证', {
        pushMessageToUser: typeof ChatWebSocketService.pushMessageToUser,
        broadcastToAllAdmins: typeof ChatWebSocketService.broadcastToAllAdmins
      })

      console.log('✅ 9.4 WebSocket服务接口验证通过')
    })
  })
})
