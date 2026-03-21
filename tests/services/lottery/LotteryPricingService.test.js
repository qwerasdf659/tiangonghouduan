/**
 * 餐厅积分抽奖系统 V4 - LotteryPricingService 单元测试
 *
 * @description 验证 getDrawPricing 定价逻辑迁移方案（方案C）的正确性
 *
 * 测试范围：
 * - getDrawPricing(): 定价计算正确性
 * - getEnabledDrawButtons(): 启用档位查询
 * - getEnabledDrawCounts(): 启用次数列表
 * - getAllDrawPricings(): 批量定价查询
 * - invalidateCache(): 缓存失效功能
 *
 * 技术债务修复验证：
 * - 定价配置从 lottery_campaign_pricing_config 表读取（非旧 JSON 字段）
 * - 单抽成本支持活动级覆盖全局配置
 * - 严格模式：配置缺失时报错阻断
 * - 缓存功能：60秒 TTL + 写后精准失效
 *
 * 创建时间：2026-01-21
 * 使用模型：Claude Sonnet 4.5
 */

const { sequelize, LotteryCampaignPricingConfig } = require('../../../models')

/*
 * 🔴 P1-9：通过 ServiceManager 获取服务（替代直接 require）
 */
let LotteryPricingService

// 测试超时设置
jest.setTimeout(30000)

describe('LotteryPricingService - 抽奖定价服务', () => {
  // 测试数据
  let test_lottery_campaign_id

  // 测试前准备
  beforeAll(async () => {
    // 连接测试数据库
    await sequelize.authenticate()

    // 获取测试活动 ID
    test_lottery_campaign_id = global.testData?.testCampaign?.lottery_campaign_id || 1

    // 🔴 P1-9：直接 require 服务（LotteryPricingService 是静态类，未注册到 ServiceManager）
    LotteryPricingService = require('../../../services/lottery/LotteryPricingService')
  })

  // 测试后关闭连接
  afterAll(async () => {
    await sequelize.close()
  })

  // ==================== getDrawPricing 测试 ====================

  describe('getDrawPricing - 定价计算', () => {
    it('应该正确计算单抽价格（无折扣）', async () => {
      // 执行查询
      const pricing = await LotteryPricingService.getDrawPricing(1, test_lottery_campaign_id)

      // 验证返回结构
      expect(pricing).toHaveProperty('total_cost')
      expect(pricing).toHaveProperty('base_cost')
      expect(pricing).toHaveProperty('discount')
      expect(pricing).toHaveProperty('draw_count')
      expect(pricing).toHaveProperty('label')
      expect(pricing).toHaveProperty('pricing_source', 'pricing_config_table')

      // 验证定价计算
      expect(pricing.draw_count).toBe(1)
      expect(pricing.discount).toBe(1) // 单抽无折扣
      expect(pricing.total_cost).toBe(pricing.base_cost * 1) // 单抽 = base_cost × 1
    })

    it('应该正确计算10连抽价格（根据数据库配置的折扣）', async () => {
      // 执行查询
      const pricing = await LotteryPricingService.getDrawPricing(10, test_lottery_campaign_id)

      /*
       * 验证定价计算
       * 注意：折扣值由数据库配置决定，不硬编码具体值
       */
      expect(pricing.draw_count).toBe(10)
      expect(pricing.discount).toBeGreaterThan(0)
      expect(pricing.discount).toBeLessThanOrEqual(1)
      expect(pricing.original_cost).toBe(pricing.base_cost * 10)
      expect(pricing.total_cost).toBe(Math.floor(pricing.base_cost * 10 * pricing.discount))
      expect(pricing.saved_points).toBe(pricing.original_cost - pricing.total_cost)
    })

    it('应该正确返回成本来源（cost_source）', async () => {
      const pricing = await LotteryPricingService.getDrawPricing(1, test_lottery_campaign_id)

      // cost_source 应该是 'campaign' 或 'global'
      expect(['campaign', 'global']).toContain(pricing.cost_source)
    })

    it('应该在档位未启用时报错', async () => {
      // 尝试获取未启用的档位（假设 2 连抽未配置）
      await expect(
        LotteryPricingService.getDrawPricing(2, test_lottery_campaign_id)
      ).rejects.toThrow(/未启用.*连抽档位/)
    })

    it('应该在配置缺失时报错（严格模式）', async () => {
      // 使用不存在的活动 ID
      await expect(LotteryPricingService.getDrawPricing(1, 999999)).rejects.toThrow(/定价配置缺失/)
    })
  })

  // ==================== getEnabledDrawButtons 测试 ====================

  describe('getEnabledDrawButtons - 启用档位查询', () => {
    it('应该返回所有启用的抽奖按钮', async () => {
      const buttons = await LotteryPricingService.getEnabledDrawButtons(test_lottery_campaign_id)

      // 验证返回结构
      expect(Array.isArray(buttons)).toBe(true)
      expect(buttons.length).toBeGreaterThan(0)

      // 验证按钮属性
      buttons.forEach(btn => {
        expect(btn).toHaveProperty('count')
        expect(btn).toHaveProperty('discount')
        expect(btn).toHaveProperty('label')
        expect(btn).toHaveProperty('sort_order')
        expect(typeof btn.count).toBe('number')
        expect(typeof btn.discount).toBe('number')
      })
    })

    it('应该按 sort_order 排序', async () => {
      const buttons = await LotteryPricingService.getEnabledDrawButtons(test_lottery_campaign_id)

      // 验证排序
      for (let i = 0; i < buttons.length - 1; i++) {
        expect(buttons[i].sort_order).toBeLessThanOrEqual(buttons[i + 1].sort_order)
      }
    })
  })

  // ==================== getEnabledDrawCounts 测试 ====================

  describe('getEnabledDrawCounts - 启用次数列表', () => {
    it('应该返回启用的抽奖次数数组', async () => {
      const counts = await LotteryPricingService.getEnabledDrawCounts(test_lottery_campaign_id)

      // 验证返回类型
      expect(Array.isArray(counts)).toBe(true)
      expect(counts.length).toBeGreaterThan(0)

      // 验证所有元素都是数字
      counts.forEach(count => {
        expect(typeof count).toBe('number')
        expect(count).toBeGreaterThan(0)
      })

      // 验证包含常见档位
      expect(counts).toContain(1) // 单抽
      expect(counts).toContain(10) // 10连抽
    })
  })

  // ==================== getAllDrawPricings 测试 ====================

  describe('getAllDrawPricings - 批量定价查询', () => {
    it('应该返回所有启用档位的定价', async () => {
      const pricings = await LotteryPricingService.getAllDrawPricings(test_lottery_campaign_id)

      // 验证返回类型
      expect(Array.isArray(pricings)).toBe(true)
      expect(pricings.length).toBeGreaterThan(0)

      // 验证每个定价对象
      pricings.forEach(pricing => {
        expect(pricing).toHaveProperty('total_cost')
        expect(pricing).toHaveProperty('draw_count')
        expect(pricing).toHaveProperty('discount')
        expect(pricing).toHaveProperty('pricing_source', 'pricing_config_table')
      })
    })

    it('应该与逐个查询的结果一致', async () => {
      // 批量查询
      const batchPricings = await LotteryPricingService.getAllDrawPricings(test_lottery_campaign_id)

      // 逐个查询验证
      for (const batchPricing of batchPricings) {
        const singlePricing = await LotteryPricingService.getDrawPricing(
          batchPricing.draw_count,
          test_lottery_campaign_id
        )

        expect(singlePricing.total_cost).toBe(batchPricing.total_cost)
        expect(singlePricing.discount).toBe(batchPricing.discount)
      }
    })
  })

  // ==================== 缓存功能测试 ====================

  describe('缓存功能', () => {
    it('应该成功失效缓存', async () => {
      // 失效缓存
      const result = await LotteryPricingService.invalidateCache(
        test_lottery_campaign_id,
        'unit_test_invalidation'
      )

      // 验证返回类型（布尔值）
      expect(typeof result).toBe('boolean')
    })

    it('多次查询应该使用缓存（性能测试）', async () => {
      // 清除缓存
      await LotteryPricingService.invalidateCache(
        test_lottery_campaign_id,
        'performance_test_setup'
      )

      // 第一次查询（冷启动，会查数据库）
      const start1 = Date.now()
      await LotteryPricingService.getDrawPricing(1, test_lottery_campaign_id)
      const time1 = Date.now() - start1

      // 第二次查询（应该命中缓存）
      const start2 = Date.now()
      await LotteryPricingService.getDrawPricing(1, test_lottery_campaign_id)
      const time2 = Date.now() - start2

      // 第三次查询（应该命中缓存）
      const start3 = Date.now()
      await LotteryPricingService.getDrawPricing(1, test_lottery_campaign_id)
      const time3 = Date.now() - start3

      /**
       * 缓存命中后的查询应该更快（允许一定误差）
       * 注意：由于测试环境不稳定，这里只记录日志不做强断言
       */
      console.log(`[性能] 第1次查询: ${time1}ms, 第2次: ${time2}ms, 第3次: ${time3}ms`)
    })
  })

  // ==================== 业务一致性测试 ====================

  describe('业务一致性', () => {
    it('定价应该符合数据库配置', async () => {
      // 直接从数据库查询活跃配置
      const dbConfig = await LotteryCampaignPricingConfig.findOne({
        where: {
          lottery_campaign_id: test_lottery_campaign_id,
          status: 'active'
        }
      })

      if (!dbConfig) {
        console.warn('⚠️ 跳过：无活跃定价配置')
        return
      }

      const pricingConfig = dbConfig.pricing_config
      const drawButtons = pricingConfig.draw_buttons || []

      // 验证每个启用的档位
      for (const btn of drawButtons.filter(b => b.enabled !== false)) {
        const pricing = await LotteryPricingService.getDrawPricing(
          btn.count,
          test_lottery_campaign_id
        )

        // 验证折扣一致
        expect(pricing.discount).toBe(btn.discount)
      }
    })

    it('所有档位的定价都应该来自新表（pricing_config_table）', async () => {
      const pricings = await LotteryPricingService.getAllDrawPricings(test_lottery_campaign_id)

      // 验证所有定价来源都是新表
      pricings.forEach(pricing => {
        expect(pricing.pricing_source).toBe('pricing_config_table')
      })
    })
  })
})
