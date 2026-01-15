/**
 * 手续费计算器单元测试
 * 文件路径：tests/services/fee_calculator.test.js
 *
 * 测试框架：Jest
 * 测试覆盖：
 * - 三档费率计算正确性
 * - 边界值处理
 * - 最小手续费规则
 * - 卖家实收计算
 * - 异常情况处理
 *
 * 使用 Claude Sonnet 4.5 模型创建
 * 创建时间：2025年12月3日
 *
 * P1-9 J2-RepoWide 改造说明：
 * - FeeCalculator 是纯函数工具类，无状态依赖
 * - 直接 require 是合理的单元测试方式（符合 C2-Lite 策略）
 * - 保留直接引用（符合单元测试场景）
 */

const FeeCalculator = require('../../services/FeeCalculator')

describe('FeeCalculator - 手续费计算器测试', () => {
  /*
   * ========================================
   * 测试组1：低价值档（value < 300）- 3%费率
   * ========================================
   */
  describe('统一费率档（5%费率，最小1积分）', () => {
    test('value=100, selling_points=90 → 手续费5积分', () => {
      const result = FeeCalculator.calculateItemFee(100, 90)
      expect(result.fee).toBe(5) // 90 * 0.05 = 4.5 → 向上取整 = 5
      expect(result.rate).toBe(0.05) // 费率5%
      expect(result.net_amount).toBe(85) // 卖家实收：90 - 5 = 85
      expect(result.tier).toBe('统一费率档')
    })

    test('value=299, selling_points=280 → 手续费14积分', () => {
      const result = FeeCalculator.calculateItemFee(299, 280)
      expect(result.fee).toBe(14) // 280 * 0.05 = 14
      expect(result.rate).toBe(0.05)
      expect(result.net_amount).toBe(266) // 280 - 14 = 266
    })

    test('极小值：value=10, selling_points=8 → 最小手续费1积分', () => {
      const result = FeeCalculator.calculateItemFee(10, 8)
      expect(result.fee).toBe(1) // 8 * 0.05 = 0.4 → 最小手续费1积分
      expect(result.net_amount).toBe(7) // 8 - 1 = 7
    })
  })

  /*
   * ========================================
   * 测试组2：中价值档（300 <= value < 600）- 5%费率
   * ========================================
   */
  describe('统一费率档（继续验证边界值）', () => {
    test('value=300, selling_points=290 → 手续费15积分', () => {
      const result = FeeCalculator.calculateItemFee(300, 290)
      expect(result.fee).toBe(15) // 290 * 0.05 = 14.5 → 向上取整 = 15
      expect(result.rate).toBe(0.05) // 费率5%
      expect(result.net_amount).toBe(275) // 290 - 15 = 275
      expect(result.tier).toBe('统一费率档')
    })

    test('value=450, selling_points=420 → 手续费21积分', () => {
      const result = FeeCalculator.calculateItemFee(450, 420)
      expect(result.fee).toBe(21) // 420 * 0.05 = 21
      expect(result.net_amount).toBe(399) // 420 - 21 = 399
    })

    test('value=599, selling_points=580 → 手续费29积分', () => {
      const result = FeeCalculator.calculateItemFee(599, 580)
      expect(result.fee).toBe(29) // 580 * 0.05 = 29
      expect(result.net_amount).toBe(551) // 580 - 29 = 551
    })
  })

  /*
   * ========================================
   * 测试组3：高价值档（value >= 600）- 10%费率
   * ========================================
   */
  describe('统一费率档（高价值商品也应是5%）', () => {
    test('value=600, selling_points=580 → 手续费29积分', () => {
      const result = FeeCalculator.calculateItemFee(600, 580)
      expect(result.fee).toBe(29) // 580 * 0.05 = 29
      expect(result.rate).toBe(0.05) // 费率5%
      expect(result.net_amount).toBe(551) // 580 - 29 = 551
      expect(result.tier).toBe('统一费率档')
    })

    test('value=800, selling_points=750 → 手续费38积分', () => {
      const result = FeeCalculator.calculateItemFee(800, 750)
      expect(result.fee).toBe(38) // 750 * 0.05 = 37.5 → 向上取整 = 38
      expect(result.net_amount).toBe(712) // 750 - 38 = 712
    })

    test('value=1000, selling_points=950 → 手续费48积分', () => {
      const result = FeeCalculator.calculateItemFee(1000, 950)
      expect(result.fee).toBe(48) // 950 * 0.05 = 47.5 → 向上取整 = 48
      expect(result.net_amount).toBe(902) // 950 - 48 = 902
    })
  })

  /*
   * ========================================
   * 测试组4：边界值测试（Critical Boundary Tests）
   * ========================================
   */
  describe('边界值测试', () => {
    test('边界1：value=299 → 5%费率', () => {
      const result = FeeCalculator.calculateItemFee(299, 280)
      expect(result.rate).toBe(0.05)
      expect(result.tier).toBe('统一费率档')
    })

    test('边界2：value=300（中价值档下限）→ 5%费率', () => {
      const result = FeeCalculator.calculateItemFee(300, 290)
      expect(result.rate).toBe(0.05)
      expect(result.tier).toBe('统一费率档')
    })

    test('边界3：value=599（中价值档上限）→ 5%费率', () => {
      const result = FeeCalculator.calculateItemFee(599, 580)
      expect(result.rate).toBe(0.05)
      expect(result.tier).toBe('统一费率档')
    })

    test('边界4：value=600 → 5%费率', () => {
      const result = FeeCalculator.calculateItemFee(600, 580)
      expect(result.rate).toBe(0.05)
      expect(result.tier).toBe('统一费率档')
    })
  })

  /*
   * ========================================
   * 测试组5：特殊场景测试
   * ========================================
   */
  describe('特殊场景测试', () => {
    test('售价低于价值：value=500, selling_points=300（打折出售）', () => {
      const result = FeeCalculator.calculateItemFee(500, 300)
      expect(result.fee).toBe(15) // 按售价300计算：300 * 0.05 = 15
      expect(result.rate).toBe(0.05) // 按价值500判断档位：中价值档5%
      expect(result.net_amount).toBe(285) // 300 - 15 = 285
    })

    test('售价高于价值：value=300, selling_points=500（溢价出售）', () => {
      const result = FeeCalculator.calculateItemFee(300, 500)
      expect(result.fee).toBe(25) // 按售价500计算：500 * 0.05 = 25
      expect(result.rate).toBe(0.05) // 按价值300判断档位：中价值档5%
      expect(result.net_amount).toBe(475) // 500 - 25 = 475
    })

    test('最小手续费规则：极小额交易', () => {
      const result = FeeCalculator.calculateItemFee(5, 3)
      expect(result.fee).toBe(1) // 3 * 0.05 = 0.15 → 最小手续费1积分
      expect(result.net_amount).toBe(2) // 3 - 1 = 2
    })
  })

  /*
   * ========================================
   * 测试组6：订单级别测试（未来扩展）
   * ========================================
   */
  describe('订单级别测试（支持混合商品）', () => {
    test('混合订单：不同档位商品分别计算', () => {
      const orderItems = [
        { inventory_id: 1, item_value: 200, selling_price: 180 }, // 统一费率5%
        { inventory_id: 2, item_value: 450, selling_price: 420 }, // 统一费率5%
        { inventory_id: 3, item_value: 800, selling_price: 750 } // 统一费率5%
      ]

      const result = FeeCalculator.calculateOrderFee(orderItems)

      // 验证总计（Verify Totals）
      expect(result.total_fee).toBe(9 + 21 + 38) // 总手续费：68积分
      expect(result.total_selling_price).toBe(180 + 420 + 750) // 总售价：1350积分
      expect(result.total_net_amount).toBe(171 + 399 + 712) // 卖家总实收：1282积分

      // 验证明细（Verify Breakdown）
      expect(result.breakdown).toHaveLength(3)
      expect(result.breakdown[0].fee).toBe(9) // 第1个商品手续费
      expect(result.breakdown[1].fee).toBe(21) // 第2个商品手续费
      expect(result.breakdown[2].fee).toBe(38) // 第3个商品手续费
    })
  })

  /*
   * ========================================
   * 测试组7：辅助方法测试
   * ========================================
   */
  describe('辅助方法测试', () => {
    test('getRate() - 获取费率', () => {
      expect(FeeCalculator.getRate(200)).toBe(0.05)
      expect(FeeCalculator.getRate(450)).toBe(0.05)
      expect(FeeCalculator.getRate(800)).toBe(0.05)
    })

    test('getFeeDescription() - 获取费率说明', () => {
      const desc1 = FeeCalculator.getFeeDescription(200)
      expect(desc1).toContain('5%')
      expect(desc1).toContain('统一费率档')

      const desc2 = FeeCalculator.getFeeDescription(450)
      expect(desc2).toContain('5%')
      expect(desc2).toContain('统一费率档')

      const desc3 = FeeCalculator.getFeeDescription(800)
      expect(desc3).toContain('5%')
      expect(desc3).toContain('统一费率档')
    })
  })

  /*
   * ========================================
   * 测试组8：多币种手续费计算测试（2026-01-14 新增）
   * ========================================
   *
   * 业务决策（交易市场多币种扩展）：
   * - DIAMOND：保持分档逻辑（基于 itemValue 分档 + ceil + 最低费 1）
   * - red_shard：单一费率 5%，最低手续费 1（从 system_settings 读取）
   * - 其他币种：根据 system_settings 配置的费率和最低费计算
   */
  describe('多币种手续费计算（calculateFeeByAsset）', () => {
    /**
     * DIAMOND 分档模式测试
     * - 使用 calculateItemFee 的分档逻辑
     * - calculation_mode 应为 'tiered'
     */
    test('DIAMOND 分档模式 - 高价值商品（itemValue=800, sellingPrice=750）', async () => {
      const result = await FeeCalculator.calculateFeeByAsset('DIAMOND', 800, 750)

      expect(result.asset_code).toBe('DIAMOND')
      expect(result.calculation_mode).toBe('tiered')
      expect(result.fee).toBe(38) // 750 * 0.05 = 37.5 → 向上取整 = 38
      expect(result.rate).toBe(0.05) // 统一费率档 5%
      expect(result.net_amount).toBe(712) // 750 - 38 = 712
      expect(result.tier).toBe('统一费率档')
    })

    test('DIAMOND 分档模式 - 低价值商品（itemValue=100, sellingPrice=90）', async () => {
      const result = await FeeCalculator.calculateFeeByAsset('DIAMOND', 100, 90)

      expect(result.asset_code).toBe('DIAMOND')
      expect(result.calculation_mode).toBe('tiered')
      expect(result.fee).toBe(5) // 90 * 0.05 = 4.5 → 向上取整 = 5
      expect(result.rate).toBe(0.05)
      expect(result.net_amount).toBe(85) // 90 - 5 = 85
    })

    test('DIAMOND 分档模式 - itemValue 为 null 时使用 sellingPrice 作为价值参考', async () => {
      const result = await FeeCalculator.calculateFeeByAsset('DIAMOND', null, 600)

      expect(result.asset_code).toBe('DIAMOND')
      expect(result.calculation_mode).toBe('tiered')
      expect(result.fee).toBe(30) // 600 * 0.05 = 30
      expect(result.net_amount).toBe(570) // 600 - 30 = 570
    })

    /**
     * red_shard 单一费率模式测试
     * - 使用 floor 向下取整（对用户更友好）
     * - calculation_mode 应为 'flat'
     * - 最低手续费 1
     */
    test('red_shard 单一费率模式 - 基础计算（sellingPrice=1000）', async () => {
      const result = await FeeCalculator.calculateFeeByAsset('red_shard', null, 1000)

      expect(result.asset_code).toBe('red_shard')
      expect(result.calculation_mode).toBe('flat')
      expect(result.fee).toBe(50) // 1000 * 0.05 = 50（floor 向下取整）
      expect(result.rate).toBe(0.05) // 默认 5% 或从 system_settings 读取
      expect(result.net_amount).toBe(950) // 1000 - 50 = 950
      expect(result.tier).toBeNull() // 非分档模式无档位
      expect(result.tier_description).toContain('单一费率')
    })

    test('red_shard 单一费率模式 - 小额交易（sellingPrice=15）', async () => {
      const result = await FeeCalculator.calculateFeeByAsset('red_shard', null, 15)

      expect(result.asset_code).toBe('red_shard')
      expect(result.calculation_mode).toBe('flat')
      // 15 * 0.05 = 0.75 → floor = 0 → 最低手续费 1
      expect(result.fee).toBe(1)
      expect(result.net_amount).toBe(14) // 15 - 1 = 14
    })

    test('red_shard 单一费率模式 - floor 取整验证（sellingPrice=199）', async () => {
      const result = await FeeCalculator.calculateFeeByAsset('red_shard', null, 199)

      expect(result.calculation_mode).toBe('flat')
      // 199 * 0.05 = 9.95 → floor = 9
      expect(result.fee).toBe(9)
      expect(result.net_amount).toBe(190) // 199 - 9 = 190
    })

    /**
     * DIAMOND vs red_shard 取整方式差异验证
     *
     * 业务决策（2026-01-14）：
     * - DIAMOND：ceil 向上取整
     * - red_shard：floor 向下取整（对用户更友好）
     */
    test('DIAMOND vs red_shard 取整方式差异验证', async () => {
      // 相同售价 199
      const diamondResult = await FeeCalculator.calculateFeeByAsset('DIAMOND', 199, 199)
      const redShardResult = await FeeCalculator.calculateFeeByAsset('red_shard', null, 199)

      // DIAMOND: 199 * 0.05 = 9.95 → ceil = 10
      expect(diamondResult.fee).toBe(10)
      expect(diamondResult.calculation_mode).toBe('tiered')

      // red_shard: 199 * 0.05 = 9.95 → floor = 9
      expect(redShardResult.fee).toBe(9)
      expect(redShardResult.calculation_mode).toBe('flat')

      // red_shard 对用户更友好（手续费少 1）
      expect(redShardResult.fee).toBeLessThan(diamondResult.fee)
    })

    /**
     * 最低手续费保底测试
     *
     * 业务决策：所有币种最低手续费为 1
     */
    test('最低手续费保底 - DIAMOND 极小额', async () => {
      const result = await FeeCalculator.calculateFeeByAsset('DIAMOND', 5, 5)
      expect(result.fee).toBeGreaterThanOrEqual(1) // 最低 1
    })

    test('最低手续费保底 - red_shard 极小额', async () => {
      const result = await FeeCalculator.calculateFeeByAsset('red_shard', null, 5)
      expect(result.fee).toBeGreaterThanOrEqual(1) // 最低 1
    })

    /**
     * 返回结构完整性验证
     */
    test('返回结构完整性验证 - DIAMOND', async () => {
      const result = await FeeCalculator.calculateFeeByAsset('DIAMOND', 500, 450)

      expect(result).toHaveProperty('fee')
      expect(result).toHaveProperty('rate')
      expect(result).toHaveProperty('net_amount')
      expect(result).toHaveProperty('calculation_mode')
      expect(result).toHaveProperty('tier')
      expect(result).toHaveProperty('tier_description')
      expect(result).toHaveProperty('asset_code')

      expect(typeof result.fee).toBe('number')
      expect(typeof result.rate).toBe('number')
      expect(typeof result.net_amount).toBe('number')
    })

    test('返回结构完整性验证 - red_shard', async () => {
      const result = await FeeCalculator.calculateFeeByAsset('red_shard', null, 500)

      expect(result).toHaveProperty('fee')
      expect(result).toHaveProperty('rate')
      expect(result).toHaveProperty('net_amount')
      expect(result).toHaveProperty('calculation_mode')
      expect(result).toHaveProperty('tier')
      expect(result).toHaveProperty('tier_description')
      expect(result).toHaveProperty('asset_code')

      // red_shard 单一费率模式，tier 应为 null
      expect(result.tier).toBeNull()
    })
  })

  /*
   * ========================================
   * 测试组9：getFeeRateByAsset 辅助方法测试
   * ========================================
   */
  describe('getFeeRateByAsset 辅助方法测试', () => {
    test('DIAMOND 返回分档费率信息', async () => {
      const rateInfo = await FeeCalculator.getFeeRateByAsset('DIAMOND')

      expect(rateInfo.calculation_mode).toBe('tiered')
      expect(rateInfo.rate).toBeNull() // 分档模式无单一费率
      expect(rateInfo.rate_range).toBeDefined()
      expect(Array.isArray(rateInfo.rate_range)).toBe(true)
      expect(rateInfo.min_fee).toBe(1)
    })

    test('red_shard 返回单一费率信息', async () => {
      const rateInfo = await FeeCalculator.getFeeRateByAsset('red_shard')

      expect(rateInfo.calculation_mode).toBe('flat')
      expect(rateInfo.rate).toBe(0.05) // 默认 5% 或从 DB 读取
      expect(rateInfo.rate_range).toBeNull() // 单一费率无分档
      expect(rateInfo.min_fee).toBe(1)
    })
  })
})
