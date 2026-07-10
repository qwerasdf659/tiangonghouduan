/**
 * 天工商户营销平台 V4 - ExchangeService 单元测试
 *
 * 测试范围：
 * - P3-3-1: 兑换市场服务核心功能
 *   - getMarketItems: 商品列表查询（分页、筛选、排序）
 *   - getItemDetail: 商品详情查询
 *   - exchangeItem: 商品兑换（幂等性、库存扣减、资产扣减）
 *   - getUserOrders: 用户订单查询
 *   - getOrderDetail: 订单详情查询
 *   - 管理员功能: createExchangeItem, updateExchangeItem, deleteExchangeItem
 *     （2026-07-11 写路径收口：商品 CRUD 唯一权威 = ExchangeItemService，
 *      测试对象与路由实际使用的写路径一致，admin Facade 不再承载 CRUD）
 *
 * 创建时间：2026-01-29
 * 技术栈：Jest + Sequelize + MySQL (真实数据库)
 *
 * 测试规范：
 * - 服务通过 global.getTestService('exchange') 获取（J2-RepoWide 规范）
 * - 使用 snake_case service key（E2-Strict 规范）
 * - 所有写操作必须在事务内执行（TransactionManager 规范）
 * - 测试数据通过 global.testData 动态获取，不硬编码
 * - 测试完成后清理测试产生的数据
 */

'use strict'

const models = require('../../models')
const { sequelize, ExchangeItem, ExchangeRecord, User } = models
const TransactionManager = require('../../utils/TransactionManager')

/**
 * 🔴 P1-9：通过 ServiceManager 获取服务（替代直接 require）
 * 注意：在 beforeAll 中获取服务，确保 ServiceManager 已初始化
 */
let ExchangeService

// 测试超时配置（30秒）
jest.setTimeout(30000)

describe('ExchangeService - 兑换市场服务测试', () => {
  // 测试数据
  let test_user_id
  let test_user

  // 测试过程中创建的数据（用于清理）
  const created_items = []
  const created_records = []

  /**
   * 生成唯一的幂等键
   * @param {string} prefix - 前缀
   * @returns {string} 幂等键
   */
  const _generateIdempotencyKey = prefix => {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
  }

  // ==================== 测试生命周期 ====================

  beforeAll(async () => {
    // 连接测试数据库
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    /*
     * V4.7.0 大文件拆分：ExchangeService 已拆分为多个子服务
     * - QueryService: 查询方法 (getMarketItems, getItemDetail, getUserOrders, getAdminOrders)
     * - ExchangeItemService: 商品 CRUD 唯一权威写路径（2026-07-11 收口，
     *   与 routes/v4/console/exchange/items.js 实际使用的服务一致）
     * - admin/ (Facade): 运营操作与查询统计（pinItem/getAdminMarketItems/checkTimeoutAndAlert 等）
     * - CoreService: 核心方法 (executeExchange)
     * 测试需要同时使用这些服务的方法，创建组合对象
     */
    const ExchangeQueryService = require('../../services/exchange/QueryService')
    const ExchangeItemService = require('../../services/exchange/ExchangeItemService')
    const ExchangeAdminService = require('../../services/exchange/admin')

    const queryService = new ExchangeQueryService(models)
    const exchangeItemService = new ExchangeItemService(models)
    const adminService = new ExchangeAdminService(models)

    // 创建组合服务对象，包含所有需要的方法
    ExchangeService = {
      // 查询方法（QueryService）
      getMarketItems: queryService.getMarketItems.bind(queryService),
      getItemDetail: queryService.getItemDetail.bind(queryService),
      getUserOrders: queryService.getUserOrders.bind(queryService),
      getOrderDetail: queryService.getOrderDetail.bind(queryService),
      getAdminOrders: queryService.getAdminOrders.bind(queryService),
      getAdminOrderDetail: queryService.getAdminOrderDetail.bind(queryService),
      getMarketStatistics: queryService.getMarketStatistics.bind(queryService),
      // 商品 CRUD（唯一权威写路径 ExchangeItemService，与路由一致）
      createExchangeItem: exchangeItemService.createExchangeItem.bind(exchangeItemService),
      updateExchangeItem: exchangeItemService.updateExchangeItem.bind(exchangeItemService),
      deleteExchangeItem: exchangeItemService.deleteExchangeItem.bind(exchangeItemService),
      // 管理查询统计（admin Facade）
      getAdminMarketItems: adminService.getAdminMarketItems.bind(adminService),
      getMarketItemStatistics: adminService.getMarketItemStatistics.bind(adminService),
      checkTimeoutAndAlert: adminService.checkTimeoutAndAlert.bind(adminService)
    }
    console.log(
      '✅ ExchangeService 拆分子服务加载成功（QueryService + ExchangeItemService + admin Facade）'
    )

    if (!ExchangeService) {
      throw new Error('ExchangeService 加载失败')
    }

    // 获取测试用户 ID（从 global.testData 动态获取）
    if (global.testData && global.testData.testUser && global.testData.testUser.user_id) {
      test_user_id = global.testData.testUser.user_id
      console.log(`✅ 使用动态测试用户: user_id=${test_user_id}`)
    } else {
      // 回退方案：从数据库查询测试用户
      test_user = await User.findOne({
        where: { mobile: '13612227910', status: 'active' }
      })

      if (!test_user) {
        throw new Error('测试用户不存在，请先创建 mobile=13612227910 的用户')
      }

      test_user_id = test_user.user_id
      console.log(`✅ 从数据库获取测试用户: user_id=${test_user_id}`)
    }
  })

  afterEach(async () => {
    /*
     * 每个测试后清理创建的测试数据
     * 注意：按依赖顺序清理（先删除订单，再删除商品）
     */

    // 清理订单记录
    for (const record_id of created_records) {
      try {
        await ExchangeRecord.destroy({ where: { record_id }, force: true })
      } catch (error) {
        // 忽略清理错误
      }
    }
    created_records.length = 0

    // 清理商品记录（先删配置型子表，避免外键约束阻断；与 deleteExchangeItem 级联口径一致）
    for (const exchangeItemId of created_items) {
      try {
        const skus = await models.ExchangeItemSku.findAll({
          where: { exchange_item_id: exchangeItemId },
          attributes: ['sku_id']
        })
        const skuIds = skus.map(s => s.sku_id)
        if (skuIds.length > 0) {
          await models.ExchangeChannelPrice.destroy({ where: { sku_id: skuIds }, force: true })
          if (models.SkuAttributeValue) {
            await models.SkuAttributeValue.destroy({ where: { sku_id: skuIds }, force: true })
          }
          await models.ExchangeItemSku.destroy({
            where: { exchange_item_id: exchangeItemId },
            force: true
          })
        }
        await ExchangeItem.destroy({ where: { exchange_item_id: exchangeItemId }, force: true })
      } catch (error) {
        // 忽略清理错误
      }
    }
    created_items.length = 0
  })

  afterAll(async () => {
    // 关闭数据库连接
    await sequelize.close()
    console.log('✅ 数据库连接已关闭')
  })

  // ==================== 商品列表查询测试 ====================

  describe('getMarketItems - 商品列表查询', () => {
    it('应该成功获取活跃商品列表', async () => {
      // 执行：获取商品列表
      const result = await ExchangeService.getMarketItems({
        status: 'active',
        page: 1,
        page_size: 10
      })

      // 验证：返回结构正确
      expect(result).toBeDefined()
      expect(result.items).toBeDefined()
      expect(Array.isArray(result.items)).toBe(true)
      expect(result.pagination).toBeDefined()
      expect(result.pagination.page).toBe(1)
      expect(result.pagination.page_size).toBe(10)
      expect(result.pagination.total).toBeGreaterThanOrEqual(0)
    })

    it('应该支持分页查询', async () => {
      // 执行：获取第1页
      const page1Result = await ExchangeService.getMarketItems({
        status: 'active',
        page: 1,
        page_size: 5
      })

      // 验证：分页参数正确
      expect(page1Result.pagination.page).toBe(1)
      expect(page1Result.pagination.page_size).toBe(5)
      expect(page1Result.pagination.total_pages).toBeGreaterThanOrEqual(0)
    })

    it('应该支持按资产代码筛选', async () => {
      // 执行：按资产代码筛选
      const result = await ExchangeService.getMarketItems({
        status: 'active',
        asset_code: 'red_core_shard',
        page: 1,
        page_size: 10
      })

      // 验证：筛选结果正常返回（渠道定价在嵌套的 skus.channelPrices 中）
      expect(result).toBeDefined()
      expect(result.items).toBeDefined()
      expect(Array.isArray(result.items)).toBe(true)
    })

    it('应该支持刷新缓存', async () => {
      // 执行：强制刷新缓存
      const result = await ExchangeService.getMarketItems({
        status: 'active',
        page: 1,
        page_size: 10,
        refresh: true
      })

      // 验证：刷新后仍正常返回
      expect(result).toBeDefined()
      expect(result.items).toBeDefined()
    })
  })

  // ==================== 商品详情查询测试 ====================

  describe('getItemDetail - 商品详情查询', () => {
    it('应该成功获取商品详情', async () => {
      // 准备：获取一个存在的商品
      const listResult = await ExchangeService.getMarketItems({
        status: 'active',
        page: 1,
        page_size: 1
      })

      if (listResult.items.length === 0) {
        console.log('⚠️ 跳过测试：无活跃商品')
        return
      }

      const exchangeItemId = listResult.items[0].exchange_item_id

      // 执行：获取商品详情
      const result = await ExchangeService.getItemDetail(exchangeItemId)

      // 验证：详情包含必要字段（ExchangeItem 模型）
      expect(result).toBeDefined()
      expect(result.item).toBeDefined()
      expect(result.item.exchange_item_id).toBe(exchangeItemId)
      expect(result.item.item_name).toBeDefined()
      expect(result.item.status).toBeDefined()
    })

    it('查询不存在的商品应该抛出错误', async () => {
      // 执行：查询不存在的商品ID
      await expect(ExchangeService.getItemDetail(999999999)).rejects.toThrow('商品不存在')
    })

    it('详情接口应下发 SPU 计价契约字段 cost_amount/cost_asset_code/default_sku_id（P2）', async () => {
      // 准备：取一个活跃商品（真实库，不硬编码 ID）
      const listResult = await ExchangeService.getMarketItems({
        status: 'active',
        page: 1,
        page_size: 1
      })
      if (listResult.items.length === 0) {
        console.log('⚠️ 跳过测试：无活跃商品')
        return
      }
      const exchangeItemId = listResult.items[0].exchange_item_id

      // 执行：获取商品详情
      const { item } = await ExchangeService.getItemDetail(exchangeItemId)

      // 验证：详情已对齐列表，下发 SPU 计价契约字段（与 getMarketItems 同款映射）
      expect(item).toHaveProperty('cost_amount')
      expect(item).toHaveProperty('cost_asset_code')
      expect(item).toHaveProperty('default_sku_id')

      // 业务语义：单 active SKU 商品必须给 default_sku_id（前端自动选中提交）；多 SKU 为 null
      const activeSkus = Array.isArray(item.skus)
        ? item.skus.filter(sku => sku.status === 'active')
        : []
      if (activeSkus.length === 1) {
        expect(item.default_sku_id).toBe(activeSkus[0].sku_id)
      } else {
        expect(item.default_sku_id).toBeNull()
      }

      // 计价资产与展示价同源于 SPU 物化列（cost_amount 来自 min_cost_amount）
      if (item.cost_amount !== null) {
        expect(item.cost_asset_code).toBeTruthy()
      }
    })
  })

  // ==================== 用户订单查询测试 ====================

  describe('getUserOrders - 用户订单查询', () => {
    it('应该成功获取用户订单列表', async () => {
      // 执行：获取用户订单
      const result = await ExchangeService.getUserOrders(test_user_id, {
        page: 1,
        page_size: 10
      })

      // 验证：返回结构正确
      expect(result).toBeDefined()
      expect(result.orders).toBeDefined()
      expect(Array.isArray(result.orders)).toBe(true)
      expect(result.pagination).toBeDefined()
      expect(result.pagination.page).toBe(1)
    })

    it('应该支持按状态筛选订单', async () => {
      // 执行：筛选待处理订单
      const result = await ExchangeService.getUserOrders(test_user_id, {
        status: 'pending',
        page: 1,
        page_size: 10
      })

      // 验证：所有订单状态为 pending
      expect(result).toBeDefined()
      if (result.orders.length > 0) {
        result.orders.forEach(order => {
          expect(order.status).toBe('pending')
        })
      }
    })
  })

  // ==================== 管理员商品管理测试 ====================

  describe('管理员商品管理功能（唯一权威写路径 ExchangeItemService，与路由契约一致）', () => {
    describe('createExchangeItem - 创建商品', () => {
      it('应该成功创建商品（item_code 由系统生成 SP 规范码）', async () => {
        // 执行：创建商品（在事务内；实物快递履约不铸实例 → mint_instance=false 无需模板）
        const result = await TransactionManager.execute(async transaction => {
          return await ExchangeService.createExchangeItem(
            {
              item_name: '测试商品_' + Date.now(),
              description: '单元测试创建的商品',
              mint_instance: false,
              fulfillment_type: 'physical',
              sort_order: 999,
              status: 'inactive' // 测试商品设为下架避免干扰
            },
            { transaction }
          )
        })

        // 验证：商品创建成功（返回 ExchangeItem 模型行，item_code 为系统生成 SP+12 位规范码）
        expect(result).toBeDefined()
        expect(result.exchange_item_id).toBeDefined()
        expect(result.item_name).toContain('测试商品')
        expect(result.item_code).toMatch(/^SP[2-9A-HJKMNP-Z]{12}$/)

        // 记录用于清理
        created_items.push(result.exchange_item_id)
      })

      it('缺少商品名称（item_name）应该报错', async () => {
        await expect(
          TransactionManager.execute(async transaction => {
            return await ExchangeService.createExchangeItem(
              {
                description: '缺少必填字段',
                mint_instance: false,
                status: 'inactive'
              },
              { transaction }
            )
          })
        ).rejects.toMatchObject({ code: 'PRODUCT_CENTER_NAME_REQUIRED' })
      })

      it('需铸造实例（mint_instance=true）但未关联模板应该报错（铸造模板守卫）', async () => {
        await expect(
          TransactionManager.execute(async transaction => {
            return await ExchangeService.createExchangeItem(
              {
                item_name: '测试商品_无模板铸造',
                mint_instance: true,
                status: 'inactive'
              },
              { transaction }
            )
          })
        ).rejects.toMatchObject({ code: 'PRODUCT_CENTER_TEMPLATE_REQUIRED' })
      })
    })

    describe('updateExchangeItem - 更新商品', () => {
      it('应该成功更新商品信息', async () => {
        // 准备：先创建一个测试商品
        let test_item_id
        await TransactionManager.execute(async transaction => {
          const created = await ExchangeService.createExchangeItem(
            {
              item_name: '待更新商品_' + Date.now(),
              description: '测试更新',
              mint_instance: false,
              status: 'inactive'
            },
            { transaction }
          )
          test_item_id = created.exchange_item_id
          created_items.push(test_item_id)
        })

        // 执行：更新商品（字段与模型 snake_case 一致，前后端零映射）
        const result = await TransactionManager.execute(async transaction => {
          return await ExchangeService.updateExchangeItem(
            test_item_id,
            { item_name: '已更新商品名称' },
            { transaction }
          )
        })

        // 验证：更新成功
        expect(result).toBeDefined()
        expect(result.item_name).toBe('已更新商品名称')
      })

      it('更新不存在的商品应该报错', async () => {
        await expect(
          TransactionManager.execute(async transaction => {
            return await ExchangeService.updateExchangeItem(
              999999999,
              { item_name: '测试' },
              { transaction }
            )
          })
        ).rejects.toThrow('商品不存在')
      })

      it('清空 mint_instance=true 商品的模板应该被守卫拦截（按更新后最终状态判定）', async () => {
        // 准备：创建挂真实模板的可铸造商品（模板取真实库任一启用模板，不硬编码主键）
        const template = await models.ItemTemplate.findOne({ where: { is_enabled: 1 } })
        let test_item_id
        await TransactionManager.execute(async transaction => {
          const created = await ExchangeService.createExchangeItem(
            {
              item_name: '待清空模板商品_' + Date.now(),
              mint_instance: true,
              item_template_id: template.item_template_id,
              status: 'inactive'
            },
            { transaction }
          )
          test_item_id = created.exchange_item_id
          created_items.push(test_item_id)
        })

        // 执行：只清空模板（不改 mint_instance）→ 最终状态 mint=true 无模板 → 拒绝
        await expect(
          TransactionManager.execute(async transaction => {
            return await ExchangeService.updateExchangeItem(
              test_item_id,
              { item_template_id: null },
              { transaction }
            )
          })
        ).rejects.toMatchObject({ code: 'PRODUCT_CENTER_TEMPLATE_REQUIRED' })
      })
    })

    describe('deleteExchangeItem - 删除商品', () => {
      it('应该成功删除无订单的商品（硬删除，级联子表）', async () => {
        // 准备：创建测试商品
        let test_item_id
        await TransactionManager.execute(async transaction => {
          const created = await ExchangeService.createExchangeItem(
            {
              item_name: '待删除商品_' + Date.now(),
              mint_instance: false,
              status: 'inactive'
            },
            { transaction }
          )
          test_item_id = created.exchange_item_id
        })

        // 执行：删除商品
        await TransactionManager.execute(async transaction => {
          return await ExchangeService.deleteExchangeItem(test_item_id, { transaction })
        })

        // 验证：商品已硬删除
        const gone = await ExchangeItem.findByPk(test_item_id)
        expect(gone).toBeNull()
      })

      it('删除不存在的商品应该报错', async () => {
        await expect(
          TransactionManager.execute(async transaction => {
            return await ExchangeService.deleteExchangeItem(999999999, { transaction })
          })
        ).rejects.toThrow('商品不存在')
      })
    })
  })

  // ==================== 管理员订单管理测试 ====================

  describe('管理员订单管理功能', () => {
    describe('getAdminOrders - 全量订单查询', () => {
      it('应该成功获取全量订单列表', async () => {
        // 执行：获取全量订单
        const result = await ExchangeService.getAdminOrders({
          page: 1,
          page_size: 10
        })

        // 验证：返回结构正确
        expect(result).toBeDefined()
        expect(result.orders).toBeDefined()
        expect(Array.isArray(result.orders)).toBe(true)
        expect(result.pagination).toBeDefined()
        expect(result.filters).toBeDefined()
      })

      it('应该支持按状态筛选', async () => {
        // 执行：按状态筛选
        const result = await ExchangeService.getAdminOrders({
          status: 'pending',
          page: 1,
          page_size: 10
        })

        // 验证：筛选条件返回正确
        expect(result).toBeDefined()
        expect(result.filters.status).toBe('pending')
      })
    })

    describe('getMarketStatistics - 统计数据', () => {
      it('应该成功获取市场统计数据', async () => {
        // 执行：获取统计数据
        const result = await ExchangeService.getMarketStatistics()

        // 验证：返回统计结构
        expect(result).toBeDefined()
        expect(result.statistics).toBeDefined()
        expect(result.statistics.orders).toBeDefined()
        expect(typeof result.statistics.orders.total).toBe('number')
        expect(typeof result.statistics.orders.pending).toBe('number')
      })
    })

    describe('getAdminMarketItems - 管理员商品列表', () => {
      it('应该成功获取所有状态的商品', async () => {
        // 执行：不传 status 获取所有商品
        const result = await ExchangeService.getAdminMarketItems({
          page: 1,
          page_size: 10
        })

        // 验证：返回结构正确
        expect(result).toBeDefined()
        expect(result.items).toBeDefined()
        expect(result.pagination).toBeDefined()
      })

      it('应该支持关键词搜索', async () => {
        // 执行：关键词搜索
        const result = await ExchangeService.getAdminMarketItems({
          keyword: '测试',
          page: 1,
          page_size: 10
        })

        // 验证：返回成功
        expect(result).toBeDefined()
      })
    })

    describe('getMarketItemStatistics - 商品统计', () => {
      it('应该成功获取商品统计数据', async () => {
        // 执行：获取商品统计
        const result = await ExchangeService.getMarketItemStatistics()

        // 验证：返回统计结构
        expect(typeof result.total_items).toBe('number')
        expect(typeof result.active_items).toBe('number')
        expect(typeof result.low_stock_items).toBe('number')
        expect(typeof result.total_exchanges).toBe('number')
      })
    })
  })

  // ==================== 订单超时检查测试 ====================

  describe('checkTimeoutAndAlert - 超时订单检查', () => {
    it('应该检查24小时超时订单', async () => {
      // 执行：检查24小时超时
      const result = await ExchangeService.checkTimeoutAndAlert(24)

      // 验证：返回结构正确
      expect(result).toBeDefined()
      expect(typeof result.hasTimeout).toBe('boolean')
      expect(typeof result.count).toBe('number')
      expect(result.hours).toBe(24)
      expect(Array.isArray(result.orders)).toBe(true)
      expect(result.checked_at).toBeDefined()
    })

    it('应该检查72小时超时订单', async () => {
      // 执行：检查72小时超时
      const result = await ExchangeService.checkTimeoutAndAlert(72)

      // 验证：返回结构正确
      expect(result).toBeDefined()
      expect(result.hours).toBe(72)
    })
  })
})
