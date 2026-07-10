/**
 * S1–S5 商品体系 — 服务层 + API 集成测试
 *
 * 测试范围：采购单、批次、组合商品、渠道映射、寄卖单 CRUD + 状态机 + 拍板护栏
 * （#20 组合禁嵌套、#28 渠道映射一对一、#32 寄卖计价资产禁用清单）
 *
 * 使用真实数据库，不使用 mock；测试自建临时供应商，所有写入数据在 afterAll 清理，
 * SKU 库存收货后回滚，保证测试可重复执行且不污染真实数据。
 * 测试用户：13612227910（管理员）
 */

'use strict'

const request = require('supertest')
const app = require('../../app')
const models = require('../../models')
const { initializeServices } = require('../../services')

const services = initializeServices(models)
app.locals.services = services
app.locals.models = models

let adminToken = null
let testSupplierId = null
let testExchangeItemId = null
let testSkuId = null
let testCategoryId = null
let skuStockBefore = null

let createdPurchaseOrderId = null
let createdBatchId = null
let createdBundleId = null
let createdBundleSpuId = null
let createdMappingId = null

beforeAll(async () => {
  const loginRes = await request(app)
    .post('/api/v4/auth/quick-login')
    .send({ mobile: '13612227910' })

  expect(loginRes.body.success).toBe(true)
  adminToken = loginRes.body.data.access_token

  // 自建临时供应商（不依赖库中现存数据，afterAll 清理）
  const supplier = await models.Supplier.create({
    supplier_name: `S1S5测试供应商_${Date.now()}`,
    status: 'active'
  })
  testSupplierId = supplier.supplier_id

  // 取一个真实 active SKU（记录库存用于回滚）
  const sku = await models.ExchangeItemSku.findOne({
    where: { status: 'active' },
    include: [
      {
        model: models.ExchangeItem,
        as: 'exchangeItem',
        where: { status: 'active' },
        required: true
      }
    ]
  })
  expect(sku).toBeTruthy()
  testSkuId = sku.sku_id
  testExchangeItemId = sku.exchange_item_id
  testCategoryId = sku.exchangeItem.category_id
  skuStockBefore = sku.stock
})

afterAll(async () => {
  // 回滚收货加的库存（收货 +1）
  if (skuStockBefore != null && testSkuId) {
    await models.ExchangeItemSku.update(
      { stock: skuStockBefore },
      { where: { sku_id: testSkuId } }
    ).catch(() => {})
  }
  if (createdMappingId) {
    await models.ExternalChannelMapping.destroy({ where: { id: createdMappingId } }).catch(() => {})
  }
  if (createdBundleId) {
    await models.ProductBundle.destroy({ where: { bundle_id: createdBundleId } }).catch(() => {})
  }
  if (createdBundleSpuId) {
    await models.ExchangeItem.destroy({
      where: { exchange_item_id: createdBundleSpuId }
    }).catch(() => {})
  }
  if (createdBatchId) {
    await models.ProductBatch.destroy({ where: { batch_id: createdBatchId } }).catch(() => {})
  }
  if (createdPurchaseOrderId) {
    await models.PurchaseOrderItem.destroy({
      where: { purchase_order_id: createdPurchaseOrderId }
    }).catch(() => {})
    await models.PurchaseOrder.destroy({
      where: { purchase_order_id: createdPurchaseOrderId }
    }).catch(() => {})
  }
  if (testSupplierId) {
    await models.ExchangeItemSupplier.destroy({
      where: { supplier_id: testSupplierId }
    }).catch(() => {})
    await models.Supplier.destroy({ where: { supplier_id: testSupplierId } }).catch(() => {})
  }
})

describe('S1 采购单 API', () => {
  test('GET /purchase-orders — 列表', async () => {
    const res = await request(app)
      .get('/api/v4/console/exchange/purchase-orders')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(Array.isArray(res.body.data.items)).toBe(true)
  })

  test('POST /purchase-orders — 创建采购单（PO 单号格式）', async () => {
    const res = await request(app)
      .post('/api/v4/console/exchange/purchase-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplier_id: testSupplierId,
        remark: 'S1测试采购单',
        lines: [
          {
            exchange_item_id: testExchangeItemId,
            sku_id: testSkuId,
            quantity: 1,
            purchase_price: 9.99
          }
        ]
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data).toHaveProperty('order_no')
    expect(res.body.data.order_no).toMatch(/^PO\d{11,}$/)
    expect(res.body.data.status).toBe('draft')
    createdPurchaseOrderId = res.body.data.purchase_order_id
  })

  test('POST /purchase-orders/:id/submit — 提交下单（draft→ordered）', async () => {
    const res = await request(app)
      .post(`/api/v4/console/exchange/purchase-orders/${createdPurchaseOrderId}/submit`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('ordered')
  })

  test('POST /purchase-orders/:id/receive — 收货入库（自动建批次 + 加库存 + 回写进货价）', async () => {
    const res = await request(app)
      .post(`/api/v4/console/exchange/purchase-orders/${createdPurchaseOrderId}/receive`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('received')

    // S1↔S2 联动（拍板 #12）：收货默认自动建批次
    expect(res.body.data.lines[0].batch_id).toBeTruthy()
    createdBatchId = res.body.data.lines[0].batch_id

    // 库存 +1
    const sku = await models.ExchangeItemSku.findByPk(testSkuId)
    expect(sku.stock).toBe(skuStockBefore + 1)

    // 回写最近进货价（拍板 #5）
    const link = await models.ExchangeItemSupplier.findOne({
      where: { exchange_item_id: testExchangeItemId, supplier_id: testSupplierId }
    })
    expect(link).toBeTruthy()
    expect(link.purchase_price).toBe(9.99)
  })

  test('POST /purchase-orders/:id/receive — 重复收货被拒（received 终态防护）', async () => {
    const res = await request(app)
      .post(`/api/v4/console/exchange/purchase-orders/${createdPurchaseOrderId}/receive`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(409)
  })
})

describe('S2 产品批次 API', () => {
  test('GET /product-batches — 列表', async () => {
    const res = await request(app)
      .get('/api/v4/console/exchange/product-batches')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  test('收货自动建的批次 — 成本/数量/供应商从采购单带入（拍板 #12）', async () => {
    const res = await request(app)
      .get(`/api/v4/console/exchange/product-batches/${createdBatchId}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data.batch_code).toMatch(/^BC\d{11,}$/)
    expect(res.body.data.batch_cost).toBe(9.99)
    expect(res.body.data.quantity).toBe(1)
    expect(Number(res.body.data.supplier_id)).toBe(Number(testSupplierId))
  })

  test('POST /product-batches/:id/recall — 批次召回（active→inactive）', async () => {
    const res = await request(app)
      .post(`/api/v4/console/exchange/product-batches/${createdBatchId}/recall`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('inactive')
  })
})

describe('S4 组合商品 API', () => {
  test('GET /product-bundles — 列表', async () => {
    const res = await request(app)
      .get('/api/v4/console/exchange/product-bundles')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  test('POST /product-bundles — 创建组合（组合自身产出 SP 编码 SPU）', async () => {
    const res = await request(app)
      .post('/api/v4/console/exchange/product-bundles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        bundle_type: 'suit',
        exchange_item: {
          item_name: 'S4测试组合商品',
          status: 'draft',
          category_id: testCategoryId
        },
        items: [{ child_item_id: testExchangeItemId, quantity: 1, is_gift: false }]
      })

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveProperty('bundle_id')
    expect(res.body.data.exchangeItem.item_code).toMatch(/^SP/)
    createdBundleId = res.body.data.bundle_id
    createdBundleSpuId = res.body.data.exchange_item_id
  })

  test('POST /product-bundles — 子项是组合时被拒（拍板 #20 禁嵌套）', async () => {
    const res = await request(app)
      .post('/api/v4/console/exchange/product-bundles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        bundle_type: 'suit',
        exchange_item: {
          item_name: 'S4嵌套测试组合',
          status: 'draft',
          category_id: testCategoryId
        },
        items: [{ child_item_id: createdBundleSpuId, quantity: 1 }]
      })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('PRODUCT_BUNDLE_NESTED_FORBIDDEN')
  })
})

describe('S5 渠道映射 API', () => {
  test('GET /channel-mappings — 列表', async () => {
    const res = await request(app)
      .get('/api/v4/console/exchange/channel-mappings')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  test('GET /channel-mappings/channel-dict — 渠道字典（拍板 #24 字典化）', async () => {
    const res = await request(app)
      .get('/api/v4/console/exchange/channel-mappings/channel-dict')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    const codes = res.body.data.channels.map(c => c.code)
    expect(codes).toContain('taobao')
    expect(codes).toContain('douyin')
    // jd/pdd 预置停用，不在启用列表
    expect(codes).not.toContain('jd')
  })

  test('POST /channel-mappings — 创建映射（含渠道价，拍板 #26）', async () => {
    const res = await request(app)
      .post('/api/v4/console/exchange/channel-mappings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        channel: 'taobao',
        external_item_id: `TB_TEST_${Date.now()}`,
        exchange_item_id: testExchangeItemId,
        sync_status: 'pending',
        channel_price: 99.9
      })

    expect(res.status).toBe(200)
    expect(res.body.data.channel).toBe('taobao')
    expect(res.body.data.channel_price).toBe(99.9)
    createdMappingId = res.body.data.id
  })

  test('POST /channel-mappings — 渠道不在字典被拒（拍板 #24）', async () => {
    const res = await request(app)
      .post('/api/v4/console/exchange/channel-mappings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        channel: 'not_a_channel',
        external_item_id: `X_TEST_${Date.now()}`,
        exchange_item_id: testExchangeItemId
      })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('CHANNEL_MAPPING_CHANNEL_NOT_IN_DICT')
  })

  test('POST /channel-mappings — 同商品同渠道再映射被拒（拍板 #28 一对一）', async () => {
    const res = await request(app)
      .post('/api/v4/console/exchange/channel-mappings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        channel: 'taobao',
        external_item_id: `TB_TEST_DUP_${Date.now()}`,
        exchange_item_id: testExchangeItemId
      })

    expect(res.status).toBe(409)
    expect(res.body.code).toBe('CHANNEL_MAPPING_ITEM_ALREADY_MAPPED')
  })
})

describe('S3 寄卖单 API', () => {
  test('GET /consignments — 列表', async () => {
    const res = await request(app)
      .get('/api/v4/console/exchange/consignments')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  test('POST /consignments — points 计价被拒（拍板 #32 禁用清单）', async () => {
    const res = await request(app)
      .post('/api/v4/console/exchange/consignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        item_id: 999999999,
        consignor_account_id: 1,
        list_price: 100,
        list_asset_code: 'points'
      })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('CONSIGNMENT_FORBIDDEN_ASSET_CODE')
  })
})

describe('S4 组合下单库存拆解（拍板 #18/#19，服务层事务内验证后回滚，零残留）', () => {
  const TransactionManager = require('../../utils/TransactionManager')
  const ROLLBACK_SENTINEL = 'S4_TEST_ROLLBACK'

  test('resolveBundleForOrder + 扣减/回补 全链路（事务内验证后回滚）', async () => {
    const bundleService = services.getService('product_bundle_service')

    try {
      await TransactionManager.execute(async transaction => {
        // 1. 事务内建组合（复用 API 同一服务方法）
        const bundle = await bundleService.createProductBundle(
          {
            bundle_type: 'suit',
            exchange_item: {
              item_name: 'S4下单拆解测试组合',
              status: 'active',
              category_id: testCategoryId
            },
            items: [{ child_sku_id: testSkuId, quantity: 2, is_gift: false }]
          },
          { transaction }
        )

        // 2. 解析下单清单（含子项 active 校验 + 库存预检）
        const resolved = await bundleService.resolveBundleForOrder(bundle.exchange_item_id, 1, {
          transaction
        })
        expect(resolved).not.toBeNull()
        expect(resolved.items).toHaveLength(1)
        expect(resolved.items[0].resolved_sku_id).toBe(testSkuId)
        expect(resolved.items[0].quantity).toBe(2)

        // 3. 非组合 SPU 返回 null（普通商品走原链路）
        const notBundle = await bundleService.resolveBundleForOrder(testExchangeItemId, 1, {
          transaction
        })
        expect(notBundle).toBeNull()

        // 4. 扣减子项库存（BOM quantity=2 × 购买1 = 扣2）
        const skuBefore = await models.ExchangeItemSku.findByPk(testSkuId, { transaction })
        await bundleService.deductBundleStockForOrder(resolved.items, 1, { transaction })
        const skuAfterDeduct = await models.ExchangeItemSku.findByPk(testSkuId, { transaction })
        expect(skuAfterDeduct.stock).toBe(skuBefore.stock - 2)
        expect(skuAfterDeduct.sold_count).toBe((skuBefore.sold_count || 0) + 2)

        // 5. 按快照回补（退款逆向，恢复原值）
        await bundleService.restoreBundleStockFromSnapshot(resolved.items, 1, { transaction })
        const skuAfterRestore = await models.ExchangeItemSku.findByPk(testSkuId, { transaction })
        expect(skuAfterRestore.stock).toBe(skuBefore.stock)
        expect(skuAfterRestore.sold_count).toBe(skuBefore.sold_count || 0)

        // 6. 库存不足被拒
        await expect(
          bundleService.deductBundleStockForOrder(resolved.items, 999999, { transaction })
        ).rejects.toMatchObject({ code: 'PRODUCT_BUNDLE_CHILD_STOCK_INSUFFICIENT' })

        // 全部断言通过后强制回滚，测试数据零落库
        throw new Error(ROLLBACK_SENTINEL)
      })
    } catch (err) {
      expect(err.message).toBe(ROLLBACK_SENTINEL)
    }
  })
})

describe('S3 用户转赠 API（拍板 #35：免审核 + 每日限额）', () => {
  let giftItemId = null
  let targetUserId = null
  let senderUserId = null

  beforeAll(async () => {
    // 找一个非发起人的 active 用户作接收方
    const loginRes = await request(app)
      .post('/api/v4/auth/quick-login')
      .send({ mobile: '13612227910' })
    senderUserId = loginRes.body.data.user?.user_id || loginRes.body.data.user_id

    const target = await models.User.findOne({
      where: { status: 'active', user_id: { [models.Sequelize.Op.ne]: senderUserId } }
    })
    targetUserId = target ? target.user_id : null

    // 给发起人铸造一个测试物品（走真实 mintItem，双录落账）
    if (targetUserId) {
      const ItemService = services.getService('asset_item')
      const TransactionManager = require('../../utils/TransactionManager')
      const { item } = await TransactionManager.execute(async transaction =>
        ItemService.mintItem(
          {
            user_id: senderUserId,
            item_type: 'product',
            source: 'test',
            item_name: 'S3转赠测试物品',
            business_type: 'test_mint',
            idempotency_key: `s3_gift_test_${Date.now()}`
          },
          { transaction }
        )
      )
      giftItemId = item.item_id
    }
  })

  afterAll(async () => {
    // 清理测试物品与账本（金融表直接按 item 定点清理，仅测试数据）
    if (giftItemId) {
      await models.ItemLedger.destroy({ where: { item_id: giftItemId } }).catch(() => {})
      await models.Item.destroy({ where: { item_id: giftItemId } }).catch(() => {})
    }
  })

  test('POST /backpack/items/:id/transfer — 转赠成功（双录 + 归属变更）', async () => {
    if (!giftItemId || !targetUserId) {
      console.warn('跳过：无可用接收方用户')
      return
    }

    const res = await request(app)
      .post(`/api/v4/backpack/items/${giftItemId}/transfer`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ target_user_id: targetUserId, remark: '拍板#35转赠测试' })

    expect(res.status).toBe(200)
    expect(res.body.data.to_user_id).toBe(targetUserId)
    expect(res.body.data.remaining_today).toBeLessThanOrEqual(4)

    // 账本双录校验（gift_transfer 转出-1 / 转入+1）
    const ledger = await models.ItemLedger.findAll({
      where: { item_id: giftItemId, business_type: 'gift_transfer' }
    })
    expect(ledger.length).toBe(2)
    const deltas = ledger.map(l => l.delta).sort()
    expect(deltas).toEqual([-1, 1])

    // 物品归属已变更到接收方账户
    const item = await models.Item.findByPk(giftItemId)
    const targetAccount = await models.Account.findOne({ where: { user_id: targetUserId } })
    expect(Number(item.owner_account_id)).toBe(Number(targetAccount.account_id))
  })

  test('POST /backpack/items/:id/transfer — 非持有人转赠被拒', async () => {
    if (!giftItemId || !targetUserId) return

    // 物品已转给对方，发起人再转必然 404（所有权校验）
    const res = await request(app)
      .post(`/api/v4/backpack/items/${giftItemId}/transfer`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ target_user_id: targetUserId })

    expect(res.status).toBe(404)
  })

  test('POST /backpack/items/:id/transfer — 转赠给自己被拒', async () => {
    const res = await request(app)
      .post(`/api/v4/backpack/items/${giftItemId || 1}/transfer`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ target_user_id: senderUserId })

    expect(res.status).toBe(400)
    expect(res.body.code).toBe('GIFT_TRANSFER_SELF_FORBIDDEN')
  })
})

describe('兑换订单逆向库存回补修复（2026-07-11：取消/拒绝须与退款一样回补库存）', () => {
  const TransactionManager = require('../../utils/TransactionManager')
  const ROLLBACK_SENTINEL = 'CANCEL_RESTORE_TEST_ROLLBACK'

  test('用户取消 pending 单 — 库存回补 + 销量回退（事务内验证后回滚）', async () => {
    const coreService = services.getService('exchange_core')
    const senderUser = await models.User.findOne({ where: { status: 'active' } })

    try {
      await TransactionManager.execute(async transaction => {
        // 1. 模拟下单时刻：锁 SKU、扣 1 库存 + 计 1 销量（与 exchangeItem 扣减同口径）
        const sku = await models.ExchangeItemSku.findByPk(testSkuId, {
          lock: transaction.LOCK.UPDATE,
          transaction
        })
        const stockBefore = sku.stock
        const soldBefore = sku.sold_count || 0
        await sku.update({ stock: stockBefore - 1, sold_count: soldBefore + 1 }, { transaction })

        // 2. 直造一条 pending 兑换订单（真实表结构，随事务回滚不落库）
        const orderNo = `EMTEST${Date.now()}`
        await models.ExchangeRecord.create(
          {
            order_no: orderNo,
            idempotency_key: `cancel_restore_test_${Date.now()}`,
            business_id: `cancel_restore_biz_${Date.now()}`,
            user_id: senderUser.user_id,
            exchange_item_id: testExchangeItemId,
            sku_id: testSkuId,
            item_snapshot: { exchange_item_id: testExchangeItemId, sku_id: testSkuId },
            quantity: 1,
            pay_asset_code: 'star_stone',
            pay_amount: 1,
            total_cost: 0,
            status: 'pending',
            exchange_time: new Date()
          },
          { transaction }
        )

        // 3. 用户取消（修复点：应回补库存，修复前只退材料资产）
        const result = await coreService.cancelOrder(senderUser.user_id, orderNo, { transaction })
        expect(result.status).toBe('cancelled')

        // 4. 库存/销量恢复到下单前
        const skuAfter = await models.ExchangeItemSku.findByPk(testSkuId, { transaction })
        expect(skuAfter.stock).toBe(stockBefore)
        expect(skuAfter.sold_count).toBe(soldBefore)

        throw new Error(ROLLBACK_SENTINEL)
      })
    } catch (err) {
      expect(err.message).toBe(ROLLBACK_SENTINEL)
    }
  })
})

describe('BusinessSeqCodeGenerator 单元', () => {
  const BusinessSeqCodeGenerator = require('../../utils/BusinessSeqCodeGenerator')

  test('validate PO 编码格式', () => {
    expect(BusinessSeqCodeGenerator.validate('PO20260710001', 'PO')).toBe(true)
    expect(BusinessSeqCodeGenerator.validate('INVALID', 'PO')).toBe(false)
  })
})
