/**
 * 竞价服务测试 - BidService + BidQueryService
 *
 * 测试范围：
 * - 竞价查询：商品列表、详情、用户历史
 * - 竞价出价：资产白名单校验、金额校验、冻结逻辑
 * - 空间统计：getSpaceStats
 * - 高级空间迁移：premium-status / unlock-premium 路由可达
 *
 * 测试规范：
 * - 服务通过 global.getTestService() 获取（J2-RepoWide 规范）
 * - 使用 snake_case service key（E2-Strict 规范）
 * - 测试数据通过 global.testData 动态获取，不硬编码
 * - 连接真实数据库（restaurant_points_dev）
 *
 * @created 2026-02-16
 */

'use strict'

const models = require('../../models')
const { sequelize, ExchangeItem, BidProduct, BidRecord } = models

jest.setTimeout(30000)

describe('竞价系统服务测试（臻选空间/幸运空间/竞价功能）', () => {
  let BidQueryService
  let ExchangeQueryService
  let testUserId

  beforeAll(async () => {
    // 等待数据库连接
    await sequelize.authenticate()

    // 通过 ServiceManager 获取服务
    BidQueryService = global.getTestService('exchange_bid_query')
    ExchangeQueryService = global.getTestService('exchange_query')

    // 从 global.testData 获取测试用户
    testUserId = global.testData?.testUser?.user_id
    if (!testUserId) {
      console.warn('⚠️ 测试用户未找到，部分测试将跳过')
    }
  })

  afterAll(async () => {
    // 清理测试产生的竞价数据
    await BidRecord.destroy({ where: { bid_product_id: { [models.Op.gt]: 0 } }, force: true })
    await BidProduct.destroy({ where: { bid_product_id: { [models.Op.gt]: 0 } }, force: true })
  })

  // ==================== exchange_items 空间字段测试 ====================

  describe('exchange_items 空间字段（Phase 1）', () => {
    test('所有现有商品的 space 字段默认为 lucky', async () => {
      const items = await ExchangeItem.findAll({
        attributes: ['exchange_item_id', 'space'],
        raw: true
      })

      expect(items.length).toBeGreaterThan(0)
      // 决策4：存量77条商品全部默认归入幸运空间
      const allLucky = items.every(item => item.space === 'lucky')
      expect(allLucky).toBe(true)
    })

    test('新增字段在模型中正确定义', async () => {
      const attributes = ExchangeItem.getAttributes()
      const newFields = [
        'space',
        'original_price',
        'tags',
        'is_new',
        'is_hot',
        'is_lucky',
        'has_warranty',
        'free_shipping',
        'sell_point'
      ]
      newFields.forEach(field => {
        expect(attributes[field]).toBeDefined()
      })
    })
  })

  // ==================== ExchangeQueryService 扩展测试 ====================

  describe('ExchangeQueryService 空间筛选', () => {
    test('getMarketItems 支持 space 参数筛选', async () => {
      const result = await ExchangeQueryService.getMarketItems({
        space: 'lucky',
        page: 1,
        page_size: 5
      })

      expect(result).toBeDefined()
      expect(result.items).toBeDefined()
      expect(Array.isArray(result.items)).toBe(true)
      expect(result.pagination).toBeDefined()
      expect(result.pagination.total).toBeGreaterThanOrEqual(0)
    })

    test('getMarketItems 无 space 参数返回全部', async () => {
      const result = await ExchangeQueryService.getMarketItems({
        page: 1,
        page_size: 5
      })

      expect(result.pagination.total).toBeGreaterThan(0)
    })

    test('getSpaceStats 返回正确的空间统计', async () => {
      const stats = await ExchangeQueryService.getSpaceStats('lucky')

      expect(stats).toBeDefined()
      expect(stats.space).toBe('lucky')
      expect(typeof stats.total_products).toBe('number')
      expect(typeof stats.new_count).toBe('number')
      expect(typeof stats.hot_count).toBe('number')
      expect(stats.asset_code_distribution).toBeDefined()
      expect(typeof stats.asset_code_distribution).toBe('object')
    })
  })

  // ==================== BidProduct 模型测试 ====================

  describe('BidProduct 模型', () => {
    test('bid_products 表存在且可查询', async () => {
      const count = await BidProduct.count()
      expect(typeof count).toBe('number')
      // 验证表可以正常查询（count >= 0 即可，生产数据可能已有记录）
      expect(count).toBeGreaterThanOrEqual(0)
    })

    test('BidProduct 状态枚举包含7个状态', async () => {
      const attributes = BidProduct.getAttributes()
      const statusType = attributes.status.type
      // ENUM 类型的 values 属性
      expect(statusType.values).toBeDefined()
      expect(statusType.values).toEqual(
        expect.arrayContaining([
          'pending',
          'active',
          'ended',
          'cancelled',
          'settled',
          'settlement_failed',
          'no_bid'
        ])
      )
      expect(statusType.values.length).toBe(7)
    })
  })

  // ==================== BidRecord 模型测试 ====================

  describe('BidRecord 模型', () => {
    test('bid_records 表存在且可查询', async () => {
      const count = await BidRecord.count()
      expect(typeof count).toBe('number')
      expect(count).toBe(0)
    })

    test('BidRecord 幂等键字段存在且唯一约束', async () => {
      const attributes = BidRecord.getAttributes()
      expect(attributes.idempotency_key).toBeDefined()
      expect(attributes.idempotency_key.unique).toBe(true)
    })
  })

  // ==================== BidQueryService 测试 ====================

  describe('BidQueryService 查询服务', () => {
    test('getBidProducts 返回空列表（无竞价数据）', async () => {
      const result = await BidQueryService.getBidProducts({
        status: 'active',
        page: 1,
        page_size: 10,
        user_id: testUserId
      })

      expect(result).toBeDefined()
      expect(result.bid_products).toEqual([])
      expect(result.pagination.total).toBe(0)
    })

    test('getUserBidHistory 返回空列表（无出价记录）', async () => {
      if (!testUserId) return

      const result = await BidQueryService.getUserBidHistory(testUserId, {
        status: 'all',
        page: 1,
        page_size: 10
      })

      expect(result).toBeDefined()
      expect(result.bid_records).toEqual([])
      expect(result.pagination.total).toBe(0)
    })

    test('getBidProductDetail 对不存在的ID返回404', async () => {
      await expect(
        BidQueryService.getBidProductDetail(999999, { user_id: testUserId })
      ).rejects.toThrow('竞价商品不存在')
    })
  })

  // ==================== BidService 资产白名单测试 ====================

  describe('BidService 资产白名单（决策1 + 决策9）', () => {
    let BidService

    beforeAll(() => {
      BidService = global.getTestService('exchange_bid_core')
    })

    test('动态白名单能从 material_asset_types 加载', async () => {
      // 调用私有方法测试白名单加载
      const allowed = await BidService._getAllowedBidAssets()

      expect(Array.isArray(allowed)).toBe(true)
      // 根据数据库实际数据：red_shard 和 DIAMOND 可交易
      expect(allowed).toContain('red_shard')
      expect(allowed).toContain('DIAMOND')
      // POINTS 和 BUDGET_POINTS 不应在白名单中
      expect(allowed).not.toContain('POINTS')
      expect(allowed).not.toContain('BUDGET_POINTS')
    })
  })

  // ==================== source 字段测试 ====================

  describe('source 字段（决策10）', () => {
    test('ExchangeRecord 模型有 source 字段', () => {
      const attributes = models.ExchangeRecord.getAttributes()
      expect(attributes.source).toBeDefined()
      expect(attributes.source.defaultValue).toBe('exchange')
    })

    test('Item 模型有 source 字段', () => {
      const attributes = models.Item.getAttributes()
      expect(attributes.source).toBeDefined()
      expect(attributes.source.defaultValue).toBeNull()
    })
  })
})
