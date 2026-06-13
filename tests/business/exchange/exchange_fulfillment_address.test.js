/**
 * 实物兑换发货链路 - 履约类型与收货地址测试
 *
 * 业务场景（实物兑换发货链路 P0+P1）：验证下单时按 fulfillment_type 分流，
 * 且实物商品必须收集收货地址并写入 address_snapshot，虚拟商品即时完成无需地址。
 *
 * 覆盖真实业务规则：
 * 1. 实物商品（fulfillment_type='physical'）下单未带 address_id → 拒绝（EXCHANGE_ADDRESS_REQUIRED）
 * 2. 实物商品下单带有效 address_id → 成功，订单 status='pending'，address_snapshot 落库
 * 3. 虚拟商品（fulfillment_type='virtual'）下单无需地址 → 成功，订单 status='completed'
 *
 * 设计原则（遵循项目规则）：
 * - 真实数据库 restaurant_points_dev，真实测试用户 13612227930，无 mock
 * - 模型直接引用用于测试数据准备/验证（业务测试场景合理）
 * - ExchangeService 通过 ServiceManager 获取（snake_case: exchange_core）
 *
 * 创建时间：2026-06-14（实物兑换发货链路 P0+P1）
 */

const {
  ExchangeItem,
  ExchangeItemSku,
  ExchangeChannelPrice,
  ExchangeRecord,
  UserAddress
} = require('../../../models')
const TransactionManager = require('../../../utils/TransactionManager')
const { generateStandaloneIdempotencyKey } = require('../../../utils/IdempotencyHelper')

describe('实物兑换发货链路 - 履约类型与收货地址（P0+P1）', () => {
  let ExchangeService
  let BalanceService
  let testUser
  const createdItemIds = []
  const createdAddressIds = []
  const createdRecordIds = []

  /** 充值测试用户某资产余额，确保下单扣费不因余额不足失败 */
  async function ensureBalance(assetCode, amount) {
    await TransactionManager.execute(async transaction => {
      await BalanceService.changeBalance(
        {
          user_id: testUser.user_id,
          asset_code: assetCode,
          delta_amount: amount,
          idempotency_key: `test_topup_${assetCode}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          business_type: 'test_topup',
          meta: { reason: 'fulfillment_test_topup' }
        },
        { transaction }
      )
    })
  }

  /** 创建一个测试兑换商品（指定履约类型），返回 { exchange_item_id, sku_id } */
  async function createTestItem(fulfillmentType) {
    const item = await ExchangeItem.create({
      item_name: `【测试】${fulfillmentType}履约商品`,
      description: '实物兑换发货链路履约类型测试商品',
      status: 'active',
      fulfillment_type: fulfillmentType,
      mint_instance: false,
      sort_order: 1
    })
    createdItemIds.push(item.exchange_item_id)
    const sku = await ExchangeItemSku.create({
      exchange_item_id: item.exchange_item_id,
      sku_code: `FULFILL_TEST_${fulfillmentType}_${Date.now()}`,
      stock: 100,
      cost_price: 10,
      status: 'active',
      sort_order: 0
    })
    await ExchangeChannelPrice.create({
      sku_id: sku.sku_id,
      cost_asset_code: 'red_core_shard',
      cost_amount: 10,
      is_enabled: true
    })
    return { exchange_item_id: item.exchange_item_id, sku_id: sku.sku_id }
  }

  beforeAll(async () => {
    ExchangeService = global.getTestService('exchange_core')
    BalanceService = global.getTestService('asset_balance')

    const { User } = require('../../../models')
    testUser = await User.findOne({ where: { mobile: '13612227930' } })
    if (!testUser) {
      throw new Error('测试用户不存在，请先创建测试用户：13612227930')
    }

    // 预充足额 red_core_shard，避免下单因余额不足失败（与被测逻辑无关）
    await ensureBalance('red_core_shard', 1000)
  })

  afterAll(async () => {
    // 清理测试数据（FK 安全顺序：事件/轨迹 → 订单 → 渠道价 → SKU → 商品 → 地址），硬删除
    const { ExchangeOrderEvent, ShippingTrack, ExchangeChannelPrice } = require('../../../models')
    for (const recordId of createdRecordIds) {
      const rec = await ExchangeRecord.findByPk(recordId).catch(() => null)
      if (rec) {
        await ExchangeOrderEvent.destroy({ where: { order_no: rec.order_no }, force: true }).catch(
          () => {}
        )
        await ShippingTrack.destroy({ where: { order_no: rec.order_no }, force: true }).catch(
          () => {}
        )
      }
      await ExchangeRecord.destroy({ where: { exchange_record_id: recordId }, force: true }).catch(
        () => {}
      )
    }
    for (const itemId of createdItemIds) {
      const skus = await ExchangeItemSku.findAll({
        where: { exchange_item_id: itemId },
        attributes: ['sku_id']
      }).catch(() => [])
      for (const s of skus) {
        await ExchangeChannelPrice.destroy({ where: { sku_id: s.sku_id }, force: true }).catch(
          () => {}
        )
      }
      await ExchangeItemSku.destroy({ where: { exchange_item_id: itemId }, force: true }).catch(
        () => {}
      )
      await ExchangeItem.destroy({ where: { exchange_item_id: itemId }, force: true }).catch(
        () => {}
      )
    }
    for (const addressId of createdAddressIds) {
      await UserAddress.destroy({ where: { address_id: addressId }, force: true }).catch(() => {})
    }
  })

  test('实物商品下单未带 address_id 应被拒绝（EXCHANGE_ADDRESS_REQUIRED）', async () => {
    const { exchange_item_id, sku_id } = await createTestItem('physical')
    const idempotencyKey = generateStandaloneIdempotencyKey('test_phys_noaddr', testUser.user_id)

    await expect(
      TransactionManager.execute(async transaction => {
        return ExchangeService.exchangeItem(testUser.user_id, exchange_item_id, 1, {
          idempotency_key: idempotencyKey,
          sku_id,
          transaction
        })
      })
    ).rejects.toMatchObject({ code: 'EXCHANGE_ADDRESS_REQUIRED' })
  })

  test('实物商品下单带有效 address_id 应成功且 address_snapshot 落库、status=pending', async () => {
    const { exchange_item_id, sku_id } = await createTestItem('physical')

    // 创建一个真实收货地址（经 UserAddressService 加密存储）
    const address = await TransactionManager.execute(async transaction => {
      const UserAddressService = global.getTestService('user_address')
      return UserAddressService.create(
        testUser.user_id,
        {
          receiver_name: '张三',
          receiver_phone: '13800001111',
          province: '广东省',
          city: '深圳市',
          district: '南山区',
          detail_address: '科技园路1号'
        },
        { transaction }
      )
    })
    createdAddressIds.push(address.address_id)

    const idempotencyKey = generateStandaloneIdempotencyKey('test_phys_addr', testUser.user_id)
    const result = await TransactionManager.execute(async transaction => {
      return ExchangeService.exchangeItem(testUser.user_id, exchange_item_id, 1, {
        idempotency_key: idempotencyKey,
        sku_id,
        address_id: address.address_id,
        transaction
      })
    })

    expect(result.success).toBe(true)
    expect(result.order.status).toBe('pending')
    createdRecordIds.push(result.order.record_id)

    // 校验 address_snapshot 已落库且含收件人信息
    const record = await ExchangeRecord.findByPk(result.order.record_id)
    expect(record.address_snapshot).toBeTruthy()
    expect(record.address_snapshot.receiver_name).toBe('张三')
    expect(record.address_snapshot.province).toBe('广东省')
    // address_id 为 BIGINT，快照 JSON 中可能为字符串，统一按数值比较
    expect(Number(record.address_snapshot.address_id)).toBe(Number(address.address_id))
  })

  test('虚拟商品下单无需地址应成功且 status=completed', async () => {
    const { exchange_item_id, sku_id } = await createTestItem('virtual')
    const idempotencyKey = generateStandaloneIdempotencyKey('test_virtual', testUser.user_id)

    const result = await TransactionManager.execute(async transaction => {
      return ExchangeService.exchangeItem(testUser.user_id, exchange_item_id, 1, {
        idempotency_key: idempotencyKey,
        sku_id,
        transaction
      })
    })

    expect(result.success).toBe(true)
    expect(result.order.status).toBe('completed')
    createdRecordIds.push(result.order.record_id)

    const record = await ExchangeRecord.findByPk(result.order.record_id)
    expect(record.address_snapshot).toBeNull()
  })

  test('用户为 pending 实物订单补录收货地址应成功（竞价中标后补地址同款能力）', async () => {
    // 先下一个实物订单（带地址），再换一个新地址补录，验证 updateOrderAddress
    const { exchange_item_id, sku_id } = await createTestItem('physical')

    const UserAddressService = global.getTestService('user_address')
    const addr1 = await TransactionManager.execute(async transaction =>
      UserAddressService.create(
        testUser.user_id,
        {
          receiver_name: '李四',
          receiver_phone: '13900002222',
          province: '北京市',
          city: '北京市',
          district: '朝阳区',
          detail_address: '建国路1号'
        },
        { transaction }
      )
    )
    createdAddressIds.push(addr1.address_id)

    const idempotencyKey = generateStandaloneIdempotencyKey('test_phys_update', testUser.user_id)
    const order = await TransactionManager.execute(async transaction =>
      ExchangeService.exchangeItem(testUser.user_id, exchange_item_id, 1, {
        idempotency_key: idempotencyKey,
        sku_id,
        address_id: addr1.address_id,
        transaction
      })
    )
    createdRecordIds.push(order.order.record_id)

    // 新建第二个地址并补录
    const addr2 = await TransactionManager.execute(async transaction =>
      UserAddressService.create(
        testUser.user_id,
        {
          receiver_name: '王五',
          receiver_phone: '13700003333',
          province: '上海市',
          city: '上海市',
          district: '浦东新区',
          detail_address: '世纪大道2号'
        },
        { transaction }
      )
    )
    createdAddressIds.push(addr2.address_id)

    const updated = await TransactionManager.execute(async transaction =>
      ExchangeService.updateOrderAddress(testUser.user_id, order.order.order_no, addr2.address_id, {
        transaction
      })
    )

    expect(updated.address_snapshot.receiver_name).toBe('王五')
    const record = await ExchangeRecord.findByPk(order.order.record_id)
    expect(record.address_snapshot.receiver_name).toBe('王五')
    expect(record.address_snapshot.province).toBe('上海市')
  })
})
