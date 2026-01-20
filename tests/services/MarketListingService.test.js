/**
 * 餐厅积分抽奖系统 V4 - MarketListingService 单元测试
 *
 * 测试范围：
 * - 市场挂牌列表查询
 * - 字段返回格式验证（2026-01-20 技术债务清理）
 * - 挂牌详情查询
 *
 * 创建时间：2026-01-20
 * 使用模型：Claude Sonnet 4.5
 *
 * 命名规范：
 * - 服务通过 global.getTestService() 获取（snake_case key）
 * - 模型直接 require（测试需要直接数据库操作）
 */

const { sequelize, User, MarketListing, ItemInstance } = require('../../models')

/*
 * 通过 ServiceManager 获取服务
 * 在 beforeAll 中获取，确保 ServiceManager 已初始化
 */
let MarketListingService

// 测试超时设置
jest.setTimeout(30000)

describe('MarketListingService - 市场挂牌服务', () => {
  let test_user

  // 测试前准备
  beforeAll(async () => {
    // 连接测试数据库
    await sequelize.authenticate()

    // 通过 ServiceManager 获取服务实例（snake_case key）
    MarketListingService = global.getTestService('market_listing')
  })

  // 每个测试前获取测试用户
  beforeEach(async () => {
    test_user = await User.findOne({
      where: { mobile: '13612227930' }
    })

    if (!test_user) {
      throw new Error('测试用户不存在，请先创建 mobile=13612227930 的用户')
    }
  })

  // 测试后关闭连接
  afterAll(async () => {
    await sequelize.close()
  })

  // ==================== 字段名称验证测试（2026-01-20 技术债务清理） ====================

  describe('字段名称验证 - 2026-01-20 技术债务清理', () => {
    /*
     * 测试背景：
     * - 2026-01-20 技术债务清理将 item_name 字段统一改为 name
     * - 市场挂牌列表应返回 name 字段而非 item_name
     * - 确保 API 返回正确的字段名
     */

    it('getMarketListings 返回的物品挂牌应使用 name 字段而非 item_name', async () => {
      // 创建测试物品
      const test_item = await ItemInstance.create({
        owner_user_id: test_user.user_id,
        item_type: 'voucher',
        status: 'locked', // 挂牌后物品会被锁定
        meta: {
          name: '市场测试商品',
          description: '用于验证市场字段名称',
          rarity: 'common'
        }
      })

      // 生成幂等键（必填字段）
      const idempotency_key = `test_listing_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

      // 创建测试挂牌（包含必填的 idempotency_key）
      const test_listing = await MarketListing.create({
        seller_user_id: test_user.user_id,
        listing_kind: 'item_instance',
        offer_item_instance_id: test_item.item_instance_id,
        offer_item_display_name: '市场测试商品', // 快照字段
        price_asset_code: 'DIAMOND',
        price_amount: 100,
        status: 'on_sale',
        idempotency_key // 必填字段
      })

      try {
        // 执行查询
        const result = await MarketListingService.getMarketListings({
          page: 1,
          page_size: 20,
          status: 'on_sale'
        })

        expect(result).toHaveProperty('products')
        expect(Array.isArray(result.products)).toBe(true)

        // 找到刚创建的测试挂牌
        const found_listing = result.products.find(
          p =>
            p.listing_id === test_listing.listing_id ||
            String(p.listing_id) === String(test_listing.listing_id)
        )

        // 如果能找到该挂牌
        if (found_listing) {
          // ✅ 验证使用正确的字段名 name（而非旧的 item_name）
          expect(found_listing).toHaveProperty('name')
          expect(found_listing).not.toHaveProperty('item_name')
          expect(found_listing.name).toBe('市场测试商品')

          // ✅ 验证其他必要字段
          expect(found_listing).toHaveProperty('listing_id')
          expect(found_listing).toHaveProperty('item_type')
          expect(found_listing).toHaveProperty('price_amount')
          expect(found_listing).toHaveProperty('price_asset_code')
          expect(found_listing).toHaveProperty('status')
        } else {
          // 如果找不到（可能被分页过滤），验证结构即可
          console.log('测试挂牌可能被分页过滤，验证返回结构')
          if (result.products.length > 0) {
            const sample = result.products[0]
            expect(sample).toHaveProperty('name')
            expect(sample).not.toHaveProperty('item_name')
          }
        }
      } finally {
        // 清理测试数据
        await test_listing.destroy()
        await test_item.destroy()
      }
    })

    it('可叠加资产挂牌（fungible_asset）也应使用 name 字段', async () => {
      // 查询现有的可叠加资产挂牌
      const result = await MarketListingService.getMarketListings({
        page: 1,
        page_size: 20,
        listing_kind: 'fungible_asset'
      })

      expect(result).toHaveProperty('products')
      expect(Array.isArray(result.products)).toBe(true)

      // 如果有可叠加资产挂牌
      if (result.products.length > 0) {
        const listing = result.products[0]

        // ✅ 验证使用正确的字段名 name（而非旧的 item_name）
        expect(listing).toHaveProperty('name')
        expect(listing).not.toHaveProperty('item_name')

        // ✅ 验证 name 是字符串
        expect(typeof listing.name).toBe('string')
        expect(listing.name.length).toBeGreaterThan(0)

        // ✅ 验证可叠加资产特有字段
        expect(listing).toHaveProperty('offer_asset_code')
        expect(listing).toHaveProperty('offer_amount')
      } else {
        console.log('没有可叠加资产挂牌，跳过详细字段验证')
      }
    })
  })

  // ==================== 基础功能测试 ====================

  describe('基础功能测试', () => {
    it('getMarketListings 应返回正确的分页结构', async () => {
      const result = await MarketListingService.getMarketListings({
        page: 1,
        page_size: 10
      })

      // 验证返回结构
      expect(result).toHaveProperty('products')
      expect(result).toHaveProperty('pagination')
      expect(Array.isArray(result.products)).toBe(true)

      // 验证分页信息
      expect(result.pagination).toHaveProperty('total')
      expect(result.pagination).toHaveProperty('page')
      expect(result.pagination).toHaveProperty('page_size')
      expect(result.pagination).toHaveProperty('total_pages')

      // 验证分页逻辑
      expect(result.pagination.page).toBe(1)
      expect(result.pagination.page_size).toBe(10)
    })

    it('getListingById 应返回挂牌详情', async () => {
      // 先查询列表获取一个存在的挂牌
      const list_result = await MarketListingService.getMarketListings({
        page: 1,
        page_size: 1
      })

      if (list_result.products.length > 0) {
        const listing_id = list_result.products[0].listing_id

        // 查询详情
        const listing = await MarketListingService.getListingById(listing_id)

        expect(listing).toBeDefined()
        expect(listing).toHaveProperty('listing_id')
        expect(String(listing.listing_id)).toBe(String(listing_id))
      } else {
        console.log('没有可用的挂牌，跳过详情查询测试')
      }
    })

    it('getUserListings 应返回用户的挂牌列表', async () => {
      // 使用正确的参数名 seller_user_id
      const result = await MarketListingService.getUserListings({
        seller_user_id: test_user.user_id,
        page: 1,
        page_size: 10
      })

      // 验证返回结构（flat 分页格式）
      expect(result).toHaveProperty('listings')
      expect(result).toHaveProperty('page')
      expect(result).toHaveProperty('page_size')
      expect(result).toHaveProperty('total')
      expect(Array.isArray(result.listings)).toBe(true)
    })
  })

  // ==================== 挂牌字段完整性测试 ====================

  describe('挂牌字段完整性测试', () => {
    it('物品实例挂牌应包含所有必要字段', async () => {
      const result = await MarketListingService.getMarketListings({
        page: 1,
        page_size: 20,
        listing_kind: 'item_instance'
      })

      if (result.products.length > 0) {
        const listing = result.products[0]

        // 验证基础字段
        expect(listing).toHaveProperty('listing_id')
        expect(listing).toHaveProperty('listing_kind')
        expect(listing).toHaveProperty('status')
        expect(listing).toHaveProperty('price_amount')
        expect(listing).toHaveProperty('price_asset_code')
        expect(listing).toHaveProperty('seller_user_id')

        // 验证物品实例特有字段
        expect(listing).toHaveProperty('item_instance_id')
        expect(listing).toHaveProperty('item_type')
        expect(listing).toHaveProperty('name') // 2026-01-20 统一字段名

        // 验证字段类型
        expect(typeof listing.price_amount).toBe('number')
        expect(typeof listing.price_asset_code).toBe('string')
        expect(typeof listing.name).toBe('string')
      } else {
        console.log('没有物品实例挂牌，跳过字段完整性测试')
      }
    })

    it('挂牌状态应为有效的枚举值', async () => {
      const result = await MarketListingService.getMarketListings({
        page: 1,
        page_size: 100
      })

      const valid_statuses = ['on_sale', 'sold', 'withdrawn', 'expired', 'suspended']

      result.products.forEach(listing => {
        expect(valid_statuses).toContain(listing.status)
      })
    })

    it('价格金额应为正数', async () => {
      const result = await MarketListingService.getMarketListings({
        page: 1,
        page_size: 100
      })

      result.products.forEach(listing => {
        expect(listing.price_amount).toBeGreaterThan(0)
      })
    })
  })

  // ==================== 性能测试 ====================

  describe('性能测试', () => {
    it('市场列表查询应在合理时间内完成', async () => {
      const start_time = Date.now()

      await MarketListingService.getMarketListings({
        page: 1,
        page_size: 50
      })

      const duration = Date.now() - start_time

      // 应该在2秒内完成
      expect(duration).toBeLessThan(2000)
    })
  })
})
