/**
 * 交易售后申诉服务（TradeDisputeService）回归测试
 *
 * 测试目标（方案A 第2项：把"声称验证"变成"可回归验证"）：
 * - auction 自助发起申诉（修复 P4：order_type=auction 纳入白名单）
 * - 订单归属校验拒绝（非本人/非可申诉状态）
 * - frozen 交易订单真解冻退款（修复第9项资损 BUG：复用 cancelOrder + unfreeze）
 * - completed 交易订单 / auction 拒绝伪退款（强制走 GM 补偿，杜绝假退款）
 * - 受理（open → reviewing，修复状态机断裂）
 * - 超时升级仲裁（escalateToArbitration 接入审批链）
 *
 * 技术规范：
 * - 连接真实数据库 restaurant_points_dev（禁止 mock）
 * - 通过 ServiceManager 获取服务（snake_case key: trade_dispute / asset_balance）
 * - 所有写操作在事务内执行并在断言后回滚，避免污染真实库（遵循资产/物品互锁规范）
 * - 测试账号 user_id=31（13612227930），既是用户也是管理员
 *
 * @module tests/services/trade/trade_dispute.test
 */

'use strict'

const {
  sequelize,
  User,
  MarketListing,
  Item,
  TradeOrder,
  Account,
  TradeDispute
} = require('../../../models')

/** 测试买家：13612227930，user_id=31 */
const TEST_BUYER_ID = 31

let TradeDisputeService
let BalanceService

jest.setTimeout(60000)

describe('TradeDisputeService - 交易售后申诉服务（回归测试）', () => {
  let test_buyer
  let test_seller
  let test_seller_account_id
  /** 记录测试开始时间，用于 afterAll 精确清理本次测试产生的站内信（_notify 为事务外 fire-and-forget） */
  let test_start_time

  beforeAll(async () => {
    await sequelize.authenticate()
    test_start_time = new Date()
    TradeDisputeService = global.getTestService('trade_dispute')
    BalanceService = global.getTestService('asset_balance')

    if (!TradeDisputeService) {
      throw new Error('TradeDisputeService 未注册（snake_case key: trade_dispute）')
    }

    test_buyer = await User.findByPk(TEST_BUYER_ID)
    if (!test_buyer) throw new Error(`测试买家 user_id=${TEST_BUYER_ID} 不存在`)

    // 卖家：取另一个活跃用户（交易订单需要买卖双方不同）
    test_seller = await User.findOne({
      where: { user_id: { [require('sequelize').Op.ne]: TEST_BUYER_ID }, status: 'active' },
      order: [['user_id', 'DESC']]
    })
    if (!test_seller) throw new Error('未找到可用的测试卖家用户')

    const seller_account = await Account.findOne({
      where: { user_id: test_seller.user_id, account_type: 'user' }
    })
    if (!seller_account) throw new Error(`卖家 Account 不存在：user_id=${test_seller.user_id}`)
    test_seller_account_id = seller_account.account_id
  })

  /** 生成唯一 tracking_code（items 必填且唯一，限长 20） */
  function uniqueTrackingCode() {
    return `DT${String(Date.now()).slice(-10)}${Math.floor(Math.random() * 100)}`
  }

  /**
   * 清理本次测试产生的站内信
   * 说明：TradeDisputeService._notify 是事务外 fire-and-forget（设计如此，通知失败不阻断主流程），
   * 因此测试事务回滚后，dispute_* 类型的站内信会残留。这里按"测试开始时间 + dispute_ 类型 + 测试用户"
   * 精确硬删除，避免污染真实库（孤儿数据硬删除规范）。
   */
  afterAll(async () => {
    await sequelize.query(
      `DELETE FROM user_notifications
       WHERE user_id = :uid AND type LIKE 'dispute\\_%' AND created_at >= :since`,
      {
        replacements: { uid: TEST_BUYER_ID, since: test_start_time },
        type: sequelize.QueryTypes.DELETE
      }
    )
  }, 30000)
  // [PLACEHOLDER_ACCEPT]
  describe('1. auction 自助发起申诉（修复 P4：order_type=auction 纳入白名单）', () => {
    it('1.1 auction 申诉可成功创建（事务内创建并回滚，不污染真实库）', async () => {
      const transaction = await sequelize.transaction()
      try {
        const result = await TradeDisputeService.createDispute(
          {
            user_id: TEST_BUYER_ID,
            order_type: 'auction',
            order_id: '999999001',
            dispute_type: 'item_mismatch',
            title: '回归测试-拍卖争议',
            description: '拍卖中标物品与描述不符',
            evidence: { auction_listing_id: 999999001 },
            created_by: TEST_BUYER_ID
          },
          { transaction }
        )
        expect(result.trade_dispute_id).toBeGreaterThan(0)
        expect(result.order_type).toBe('auction')
        expect(result.status).toBe('open')
      } finally {
        await transaction.rollback()
      }
    })

    it('1.2 不支持的 order_type 被拒绝（TRADE_NOT_ALLOWED）', async () => {
      const transaction = await sequelize.transaction()
      try {
        await expect(
          TradeDisputeService.createDispute(
            {
              user_id: TEST_BUYER_ID,
              order_type: 'lottery',
              order_id: '1',
              dispute_type: 'other',
              title: '回归测试-非法订单类型'
            },
            { transaction }
          )
        ).rejects.toThrow(/不支持的订单类型/)
      } finally {
        await transaction.rollback()
      }
    })

    it('1.3 缺少 title 被拒绝（修复 P4-b）', async () => {
      const transaction = await sequelize.transaction()
      try {
        await expect(
          TradeDisputeService.createDispute(
            {
              user_id: TEST_BUYER_ID,
              order_type: 'auction',
              order_id: '999999002',
              dispute_type: 'other'
            },
            { transaction }
          )
        ).rejects.toThrow(/标题不能为空/)
      } finally {
        await transaction.rollback()
      }
    })
  })

  describe('2. 订单归属校验拒绝（修复 P4-d：按 order_type 分流校验）', () => {
    it('2.1 trade 订单不存在 → TRADE_NOT_FOUND', async () => {
      const transaction = await sequelize.transaction()
      try {
        await expect(
          TradeDisputeService.createDispute(
            {
              user_id: TEST_BUYER_ID,
              order_type: 'trade',
              order_id: '999999999',
              dispute_type: 'other',
              title: '回归测试-订单不存在'
            },
            { transaction }
          )
        ).rejects.toThrow(/交易订单不存在/)
      } finally {
        await transaction.rollback()
      }
    })

    it('2.2 trade 订单非本人（buyer 不匹配）→ 拒绝', async () => {
      const transaction = await sequelize.transaction()
      try {
        // 在事务内造一张归属于卖家的物品/挂牌/订单，再以买家(31)身份申诉应被拒
        const item = await Item.create(
          {
            tracking_code: uniqueTrackingCode(),
            owner_account_id: test_seller_account_id,
            item_type: 'voucher',
            item_name: '归属校验测试物品',
            item_value: 100,
            status: 'available',
            source: 'test'
          },
          { transaction }
        )
        const listing = await MarketListing.create(
          {
            seller_user_id: test_seller.user_id,
            listing_kind: 'item',
            offer_item_id: item.item_id,
            offer_item_display_name: '归属校验测试物品',
            price_asset_code: 'points',
            price_amount: 100,
            status: 'locked',
            seller_offer_frozen: false,
            idempotency_key: `dt_own_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
          },
          { transaction }
        )
        // 订单 buyer 是卖家自己（即 != 31），完成态可申诉
        const order = await TradeOrder.create(
          {
            order_no: `PHDT${Date.now()}${Math.floor(Math.random() * 1000)}`,
            idempotency_key: `dt_ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            business_id: `dt_biz_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            market_listing_id: listing.market_listing_id,
            buyer_user_id: test_seller.user_id,
            seller_user_id: test_seller.user_id,
            asset_code: 'points',
            gross_amount: 100,
            fee_amount: 5,
            net_amount: 95,
            status: 'completed'
          },
          { transaction }
        )
        await expect(
          TradeDisputeService.createDispute(
            {
              user_id: TEST_BUYER_ID,
              order_type: 'trade',
              order_id: String(order.trade_order_id),
              dispute_type: 'other',
              title: '回归测试-非本人订单'
            },
            { transaction }
          )
        ).rejects.toThrow(/仅买家可以对该订单发起申诉/)
      } finally {
        await transaction.rollback()
      }
    })
  })
  describe('3. 受理申诉（修复状态机断裂：open → reviewing）', () => {
    it('3.1 open 申诉可被受理，状态变 reviewing 且指派 assigned_to', async () => {
      const transaction = await sequelize.transaction()
      try {
        const created = await TradeDisputeService.createDispute(
          {
            user_id: TEST_BUYER_ID,
            order_type: 'auction',
            order_id: '999999010',
            dispute_type: 'quality_issue',
            title: '回归测试-受理流程',
            created_by: TEST_BUYER_ID
          },
          { transaction }
        )
        const accepted = await TradeDisputeService.acceptDispute(
          created.trade_dispute_id,
          TEST_BUYER_ID,
          { transaction }
        )
        expect(accepted.status).toBe('reviewing')
        expect(accepted.assigned_to).toBe(TEST_BUYER_ID)
      } finally {
        await transaction.rollback()
      }
    })

    it('3.2 非 open 状态受理被拒绝', async () => {
      const transaction = await sequelize.transaction()
      try {
        const created = await TradeDisputeService.createDispute(
          {
            user_id: TEST_BUYER_ID,
            order_type: 'auction',
            order_id: '999999011',
            dispute_type: 'other',
            title: '回归测试-重复受理',
            created_by: TEST_BUYER_ID
          },
          { transaction }
        )
        await TradeDisputeService.acceptDispute(created.trade_dispute_id, TEST_BUYER_ID, {
          transaction
        })
        // 再次受理（已是 reviewing）应被拒
        await expect(
          TradeDisputeService.acceptDispute(created.trade_dispute_id, TEST_BUYER_ID, {
            transaction
          })
        ).rejects.toThrow(/仅"待处理（open）"状态的申诉可受理/)
      } finally {
        await transaction.rollback()
      }
    })
  })
  // [PLACEHOLDER_ESCALATE]
  describe('4. 升级仲裁（接入审批链 trade_dispute_default 模板，修复 P5）', () => {
    it('4.1 申诉可升级仲裁，状态变 arbitrating 并绑定审批链实例', async () => {
      const transaction = await sequelize.transaction()
      try {
        const created = await TradeDisputeService.createDispute(
          {
            user_id: TEST_BUYER_ID,
            order_type: 'auction',
            order_id: '999999020',
            dispute_type: 'fraud',
            title: '回归测试-升级仲裁',
            created_by: TEST_BUYER_ID
          },
          { transaction }
        )
        const result = await TradeDisputeService.escalateToArbitration(
          created.trade_dispute_id,
          TEST_BUYER_ID,
          { transaction }
        )
        expect(result.status).toBe('arbitrating')
        expect(result.approval_chain_instance_id).toBeGreaterThan(0)
      } finally {
        await transaction.rollback()
      }
    })
  })
  describe('5. completed/auction 拒绝伪退款（修复第9项资损 BUG）', () => {
    it('5.1 auction 申诉 refund=true 被拒（要求改走 GM 补偿）', async () => {
      const transaction = await sequelize.transaction()
      try {
        const created = await TradeDisputeService.createDispute(
          {
            user_id: TEST_BUYER_ID,
            order_type: 'auction',
            order_id: '999999030',
            dispute_type: 'item_not_received',
            title: '回归测试-拍卖拒绝伪退款',
            created_by: TEST_BUYER_ID
          },
          { transaction }
        )
        await expect(
          TradeDisputeService.resolveDispute(
            created.trade_dispute_id,
            { resolution: '判退', refund: true, operator_id: TEST_BUYER_ID },
            { transaction }
          )
        ).rejects.toThrow(/暂不支持原路退款|GM 补偿/)
      } finally {
        await transaction.rollback()
      }
    })

    it('5.2 completed 交易订单 refund=true 被拒（资金已结算，禁止伪退款）', async () => {
      const transaction = await sequelize.transaction()
      try {
        const item = await Item.create(
          {
            tracking_code: uniqueTrackingCode(),
            owner_account_id: test_seller_account_id,
            item_type: 'voucher',
            item_name: '已完成订单退款测试物品',
            item_value: 100,
            status: 'available',
            source: 'test'
          },
          { transaction }
        )
        const listing = await MarketListing.create(
          {
            seller_user_id: test_seller.user_id,
            listing_kind: 'item',
            offer_item_id: item.item_id,
            offer_item_display_name: '已完成订单退款测试物品',
            price_asset_code: 'points',
            price_amount: 100,
            status: 'locked',
            seller_offer_frozen: false,
            idempotency_key: `dt_cmpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
          },
          { transaction }
        )
        const order = await TradeOrder.create(
          {
            order_no: `PHDC${Date.now()}${Math.floor(Math.random() * 1000)}`,
            idempotency_key: `dt_cord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            business_id: `dt_cbiz_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            market_listing_id: listing.market_listing_id,
            buyer_user_id: TEST_BUYER_ID,
            seller_user_id: test_seller.user_id,
            asset_code: 'points',
            gross_amount: 100,
            fee_amount: 5,
            net_amount: 95,
            status: 'completed'
          },
          { transaction }
        )
        const dispute = await TradeDispute.create(
          {
            user_id: TEST_BUYER_ID,
            created_by: TEST_BUYER_ID,
            order_type: 'trade',
            order_id: String(order.trade_order_id),
            dispute_type: 'quality_issue',
            title: '回归测试-已完成订单退款',
            status: 'open',
            priority: 'high'
          },
          { transaction }
        )
        await expect(
          TradeDisputeService.resolveDispute(
            dispute.trade_dispute_id,
            { resolution: '判退', refund: true, operator_id: TEST_BUYER_ID },
            { transaction }
          )
        ).rejects.toThrow(/已完成结算|GM 补偿/)
      } finally {
        await transaction.rollback()
      }
    })
  })
  describe('6. frozen 交易订单真解冻退款（修复第9项资损 BUG：复用 cancelOrder + unfreeze）', () => {
    it('6.1 frozen 订单 refund=true 触发真解冻，返回 refunded=true 且申诉 resolved', async () => {
      const ASSET = 'points'
      const AMOUNT = 100
      const transaction = await sequelize.transaction()
      try {
        const item = await Item.create(
          {
            tracking_code: uniqueTrackingCode(),
            owner_account_id: test_seller_account_id,
            item_type: 'voucher',
            item_name: 'frozen退款测试物品',
            item_value: AMOUNT,
            status: 'available',
            source: 'test'
          },
          { transaction }
        )
        const idem = `dt_frz_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        const listing = await MarketListing.create(
          {
            seller_user_id: test_seller.user_id,
            listing_kind: 'item',
            offer_item_id: item.item_id,
            offer_item_display_name: 'frozen退款测试物品',
            price_asset_code: ASSET,
            price_amount: AMOUNT,
            status: 'locked',
            seller_offer_frozen: false,
            idempotency_key: `${idem}_listing`
          },
          { transaction }
        )
        // 真实冻结买家资产（走业务接口，符合资产互锁规范）
        await BalanceService.freeze(
          {
            user_id: TEST_BUYER_ID,
            asset_code: ASSET,
            amount: AMOUNT,
            business_type: 'order_freeze_buyer',
            idempotency_key: idem,
            meta: { test: 'trade_dispute_frozen_refund' }
          },
          { transaction }
        )
        const order = await TradeOrder.create(
          {
            order_no: `PHFZ${Date.now()}${Math.floor(Math.random() * 1000)}`,
            idempotency_key: idem,
            business_id: `${idem}_biz`,
            market_listing_id: listing.market_listing_id,
            buyer_user_id: TEST_BUYER_ID,
            seller_user_id: test_seller.user_id,
            asset_code: ASSET,
            gross_amount: AMOUNT,
            fee_amount: 5,
            net_amount: 95,
            status: 'frozen'
          },
          { transaction }
        )
        const dispute = await TradeDispute.create(
          {
            user_id: TEST_BUYER_ID,
            created_by: TEST_BUYER_ID,
            order_type: 'trade',
            order_id: String(order.trade_order_id),
            dispute_type: 'item_not_received',
            title: '回归测试-frozen真退款',
            status: 'open',
            priority: 'high'
          },
          { transaction }
        )
        const result = await TradeDisputeService.resolveDispute(
          dispute.trade_dispute_id,
          { resolution: '查证属实，原路退款', refund: true, operator_id: TEST_BUYER_ID },
          { transaction }
        )
        expect(result.status).toBe('resolved')
        expect(result.refund).toBeTruthy()
        expect(result.refund.refunded).toBe(true)
        // 订单应被取消（cancelOrder 真解冻）
        const reloaded = await TradeOrder.findByPk(order.trade_order_id, { transaction })
        expect(reloaded.status).toBe('cancelled')
      } finally {
        await transaction.rollback()
      }
    })
  })
})
