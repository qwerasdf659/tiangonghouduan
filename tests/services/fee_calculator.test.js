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
})
