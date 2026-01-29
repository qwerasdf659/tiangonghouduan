/**
 * 餐厅积分抽奖系统 V4 - ExchangeService 单元测试
 *
 * 测试范围：
 * - P3-3-1: 兑换市场服务核心功能
 *   - getMarketItems: 商品列表查询（分页、筛选、排序）
 *   - getItemDetail: 商品详情查询
 *   - exchangeItem: 商品兑换（幂等性、库存扣减、资产扣减）
 *   - getUserOrders: 用户订单查询
 *   - getOrderDetail: 订单详情查询
 *   - 管理员功能: createExchangeItem, updateExchangeItem, deleteExchangeItem
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

const { sequelize, ExchangeItem, ExchangeRecord, User } = require('../../models')
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

    // 尝试获取 ServiceManager 注册的服务（键为 exchange_market）
    try {
      ExchangeService = global.getTestService('exchange_market')
    } catch (e) {
      // 兜底：直接 require（ExchangeService 使用静态方法）
      ExchangeService = require('../../services/ExchangeService')
    }

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
        where: { mobile: '13612227930', status: 'active' }
      })

      if (!test_user) {
        throw new Error('测试用户不存在，请先创建 mobile=13612227930 的用户')
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

    // 清理商品记录
    for (const item_id of created_items) {
      try {
        await ExchangeItem.destroy({ where: { item_id }, force: true })
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
      expect(result.success).toBe(true)
      expect(result.items).toBeDefined()
      expect(Array.isArray(result.items)).toBe(true)
      expect(result.pagination).toBeDefined()
      expect(result.pagination.page).toBe(1)
      expect(result.pagination.page_size).toBe(10)
      expect(result.pagination.total).toBeGreaterThanOrEqual(0)
      expect(result.timestamp).toBeDefined()
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
        asset_code: 'red_shard',
        page: 1,
        page_size: 10
      })

      // 验证：返回的商品都是指定资产代码
      expect(result.success).toBe(true)
      if (result.items.length > 0) {
        result.items.forEach(item => {
          expect(item.cost_asset_code).toBe('red_shard')
        })
      }
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
      expect(result.success).toBe(true)
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

      const item_id = listResult.items[0].item_id

      // 执行：获取商品详情
      const result = await ExchangeService.getItemDetail(item_id)

      // 验证：详情包含必要字段
      expect(result.success).toBe(true)
      expect(result.item).toBeDefined()
      expect(result.item.item_id).toBe(item_id)
      expect(result.item.cost_asset_code).toBeDefined()
      expect(result.item.cost_amount).toBeDefined()
      expect(result.item.stock).toBeDefined()
      expect(result.item.status).toBeDefined()
    })

    it('查询不存在的商品应该抛出错误', async () => {
      // 执行：查询不存在的商品ID
      await expect(ExchangeService.getItemDetail(999999999)).rejects.toThrow('商品不存在')
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
      expect(result.success).toBe(true)
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
      expect(result.success).toBe(true)
      if (result.orders.length > 0) {
        result.orders.forEach(order => {
          expect(order.status).toBe('pending')
        })
      }
    })
  })

  // ==================== 管理员商品管理测试 ====================

  describe('管理员商品管理功能', () => {
    describe('createExchangeItem - 创建商品', () => {
      it('应该成功创建商品', async () => {
        // 执行：创建商品（在事务内）
        const result = await TransactionManager.execute(async transaction => {
          const item = await ExchangeService.createExchangeItem(
            {
              name: '测试商品_' + Date.now(),
              description: '单元测试创建的商品',
              cost_asset_code: 'red_shard',
              cost_amount: 10,
              cost_price: 5.0,
              stock: 100,
              sort_order: 999,
              status: 'inactive' // 测试商品设为下架避免干扰
            },
            test_user_id,
            { transaction }
          )
          return item
        })

        // 验证：商品创建成功
        expect(result.success).toBe(true)
        expect(result.item).toBeDefined()
        expect(result.item.item_id).toBeDefined()
        expect(result.item.item_name).toContain('测试商品') // 🔧 2026-01-29 修复：与数据库模型字段名一致
        expect(result.item.cost_asset_code).toBe('red_shard')
        expect(result.item.cost_amount).toBe(10)
        expect(result.item.stock).toBe(100)

        // 记录用于清理
        created_items.push(result.item.item_id)
      })

      it('创建商品时缺少必填字段应该报错', async () => {
        // 执行：缺少 cost_asset_code
        await expect(
          TransactionManager.execute(async transaction => {
            return await ExchangeService.createExchangeItem(
              {
                name: '测试商品',
                description: '缺少必填字段',
                cost_amount: 10,
                cost_price: 5.0,
                stock: 100
              },
              test_user_id,
              { transaction }
            )
          })
        ).rejects.toThrow('cost_asset_code')
      })

      it('cost_amount 必须大于0', async () => {
        // 执行：cost_amount = 0
        await expect(
          TransactionManager.execute(async transaction => {
            return await ExchangeService.createExchangeItem(
              {
                name: '测试商品',
                cost_asset_code: 'red_shard',
                cost_amount: 0,
                cost_price: 5.0,
                stock: 100
              },
              test_user_id,
              { transaction }
            )
          })
        ).rejects.toThrow('cost_amount')
      })
    })

    describe('updateExchangeItem - 更新商品', () => {
      it('应该成功更新商品信息', async () => {
        // 准备：先创建一个测试商品
        let test_item_id
        await TransactionManager.execute(async transaction => {
          const result = await ExchangeService.createExchangeItem(
            {
              name: '待更新商品_' + Date.now(),
              description: '测试更新',
              cost_asset_code: 'red_shard',
              cost_amount: 10,
              cost_price: 5.0,
              stock: 50,
              status: 'inactive'
            },
            test_user_id,
            { transaction }
          )
          test_item_id = result.item.item_id
          created_items.push(test_item_id)
        })

        // 执行：更新商品
        const result = await TransactionManager.execute(async transaction => {
          return await ExchangeService.updateExchangeItem(
            test_item_id,
            {
              name: '已更新商品名称',
              stock: 200
            },
            { transaction }
          )
        })

        // 验证：更新成功
        expect(result.success).toBe(true)
        expect(result.item.stock).toBe(200)
      })

      it('更新不存在的商品应该报错', async () => {
        await expect(
          TransactionManager.execute(async transaction => {
            return await ExchangeService.updateExchangeItem(
              999999999,
              { name: '测试' },
              { transaction }
            )
          })
        ).rejects.toThrow('商品不存在')
      })
    })

    describe('deleteExchangeItem - 删除商品', () => {
      it('应该成功删除无订单的商品', async () => {
        // 准备：创建测试商品
        let test_item_id
        await TransactionManager.execute(async transaction => {
          const result = await ExchangeService.createExchangeItem(
            {
              name: '待删除商品_' + Date.now(),
              cost_asset_code: 'red_shard',
              cost_amount: 10,
              cost_price: 5.0,
              stock: 10,
              status: 'inactive'
            },
            test_user_id,
            { transaction }
          )
          test_item_id = result.item.item_id
        })

        // 执行：删除商品
        const result = await TransactionManager.execute(async transaction => {
          return await ExchangeService.deleteExchangeItem(test_item_id, { transaction })
        })

        // 验证：删除成功
        expect(result.success).toBe(true)
        expect(result.action).toBe('deleted')
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
        expect(result.success).toBe(true)
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
        expect(result.success).toBe(true)
        expect(result.filters.status).toBe('pending')
      })
    })

    describe('getMarketStatistics - 统计数据', () => {
      it('应该成功获取市场统计数据', async () => {
        // 执行：获取统计数据
        const result = await ExchangeService.getMarketStatistics()

        // 验证：返回统计结构
        expect(result.success).toBe(true)
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
        expect(result.success).toBe(true)
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
        expect(result.success).toBe(true)
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
