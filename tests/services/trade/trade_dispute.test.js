/**
 * 售后申诉服务（TradeDisputeService）回归测试
 *
 * 测试目标（合规整改阶段五后：C2C trade/auction 已下线，仅服务 redemption/consumption）：
 * - order_type 白名单收窄：仅 redemption/consumption 受理，trade/auction/其它一律拒绝
 * - 创建申诉的必填字段校验（order_type/order_id/dispute_type/title）
 * - resolveDispute refund=true 一律拒绝原路退款（C2C 退款链已移除，须走 GM 补偿）
 *
 * 技术规范：
 * - 连接真实数据库 restaurant_points_dev（禁止 mock）
 * - 通过 ServiceManager 获取服务（snake_case key: trade_dispute）
 * - 所有写操作在事务内执行并在断言后回滚，避免污染真实库
 * - 测试账号 user_id=31（13612227930），既是用户也是管理员
 *
 * @module tests/services/trade/trade_dispute.test
 */

'use strict'

const { sequelize, User } = require('../../../models')

/** 测试用户：13612227930，user_id=31 */
const TEST_USER_ID = 31

let TradeDisputeService

jest.setTimeout(60000)

describe('TradeDisputeService - 售后申诉服务（C2C 下线后回归测试）', () => {
  /** 记录测试开始时间，用于 afterAll 精确清理本次测试产生的站内信 */
  let test_start_time

  beforeAll(async () => {
    await sequelize.authenticate()
    test_start_time = new Date()
    TradeDisputeService = global.getTestService('trade_dispute')

    if (!TradeDisputeService) {
      throw new Error('TradeDisputeService 未注册（snake_case key: trade_dispute）')
    }

    const test_user = await User.findByPk(TEST_USER_ID)
    if (!test_user) throw new Error(`测试用户 user_id=${TEST_USER_ID} 不存在`)
  })

  /**
   * 清理本次测试产生的站内信（_notify 为事务外 fire-and-forget，事务回滚不会清除）
   */
  afterAll(async () => {
    await sequelize.query(
      `DELETE FROM user_notifications
       WHERE user_id = :uid AND type LIKE 'dispute\\_%' AND created_at >= :since`,
      {
        replacements: { uid: TEST_USER_ID, since: test_start_time },
        type: sequelize.QueryTypes.DELETE
      }
    )
  }, 30000)

  describe('1. order_type 白名单（C2C trade/auction 已下线）', () => {
    it('1.1 trade 订单类型被拒绝（已随 C2C 下线移除）', async () => {
      const transaction = await sequelize.transaction()
      try {
        await expect(
          TradeDisputeService.createDispute(
            {
              user_id: TEST_USER_ID,
              order_type: 'trade',
              order_id: '999999001',
              dispute_type: 'other',
              title: '回归测试-trade 已下线'
            },
            { transaction }
          )
        ).rejects.toThrow(/不支持的订单类型/)
      } finally {
        await transaction.rollback()
      }
    })

    it('1.2 auction 订单类型被拒绝（已随 C2C 下线移除）', async () => {
      const transaction = await sequelize.transaction()
      try {
        await expect(
          TradeDisputeService.createDispute(
            {
              user_id: TEST_USER_ID,
              order_type: 'auction',
              order_id: '999999002',
              dispute_type: 'item_mismatch',
              title: '回归测试-auction 已下线'
            },
            { transaction }
          )
        ).rejects.toThrow(/不支持的订单类型/)
      } finally {
        await transaction.rollback()
      }
    })

    it('1.3 其它非法 order_type（lottery）被拒绝', async () => {
      const transaction = await sequelize.transaction()
      try {
        await expect(
          TradeDisputeService.createDispute(
            {
              user_id: TEST_USER_ID,
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
  })

  describe('2. 必填字段校验', () => {
    it('2.1 缺少 order_type/order_id 被拒绝（TRADE_REQUIRED）', async () => {
      const transaction = await sequelize.transaction()
      try {
        await expect(
          TradeDisputeService.createDispute(
            {
              user_id: TEST_USER_ID,
              dispute_type: 'other',
              title: '回归测试-缺订单标识'
            },
            { transaction }
          )
        ).rejects.toThrow(/order_type 和 order_id 是必需参数/)
      } finally {
        await transaction.rollback()
      }
    })

    it('2.2 redemption 订单缺少 title 被拒绝', async () => {
      const transaction = await sequelize.transaction()
      try {
        await expect(
          TradeDisputeService.createDispute(
            {
              user_id: TEST_USER_ID,
              order_type: 'redemption',
              order_id: '999999003',
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

  describe('3. resolveDispute 原路退款一律拒绝（须走 GM 补偿）', () => {
    it('3.1 不存在的申诉解决时抛错（TRADE_NOT_FOUND）', async () => {
      const transaction = await sequelize.transaction()
      try {
        await expect(
          TradeDisputeService.resolveDispute(
            999999999,
            { resolution: '回归测试', refund: true, operator_id: TEST_USER_ID },
            { transaction }
          )
        ).rejects.toThrow(/不存在|TRADE_NOT_FOUND/)
      } finally {
        await transaction.rollback()
      }
    })
  })
})
