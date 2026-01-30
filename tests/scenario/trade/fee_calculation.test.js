/**
 * 手续费计算集成测试
 * 文件路径：tests/integration/fee_calculation.test.js
 *
 * 测试范围：
 * - FeeCalculator与购买API的集成
 * - 手续费计算逻辑正确性验证
 * - 档位判断准确性测试
 *
 * 注意事项：
 * - 本测试为FeeCalculator服务层集成测试
 * - 不涉及实际数据库操作和积分扣除
 * - 实际购买流程测试需要完整环境和真实数据
 *
 * 使用 Claude Sonnet 4.5 模型创建
 * 创建时间：2025年12月3日
 *
 * P1-9 J2-RepoWide 改造说明：
 * - FeeCalculator 是纯函数工具类，无状态依赖
 * - 直接 require 是合理的单元测试方式
 * - 保留直接引用（符合单元测试场景）
 */

const FeeCalculator = require('../../../services/FeeCalculator')

describe('手续费计算集成测试', () => {
  /*
   * ========================================
   * 测试组1：完整手续费计算流程
   * ========================================
   */
  describe('完整手续费计算流程', () => {
    test('低价值商品（value=200）完整计算流程', () => {
      // 模拟商品数据
      const mockItem = {
        inventory_id: 1,
        name: '测试商品-低价值',
        value: 200, // 商品价值：低价值档
        selling_points: 180 // 售价
      }

      // 计算手续费
      const feeInfo = FeeCalculator.calculateItemFee(mockItem.value, mockItem.selling_points)

      // 验证计算结果
      expect(feeInfo.fee).toBe(9) // 180 * 0.05 = 9
      expect(feeInfo.rate).toBe(0.05) // 费率5%
      expect(feeInfo.net_amount).toBe(171) // 卖家实收：180 - 9 = 171
      expect(feeInfo.tier).toBe('统一费率档')
      expect(feeInfo.tier_description).toContain('统一5%')
    })

    test('中价值商品（value=450）完整计算流程', () => {
      // 模拟商品数据
      const mockItem = {
        inventory_id: 2,
        name: '测试商品-中价值',
        value: 450, // 商品价值：中价值档
        selling_points: 420 // 售价
      }

      // 计算手续费
      const feeInfo = FeeCalculator.calculateItemFee(mockItem.value, mockItem.selling_points)

      // 验证计算结果
      expect(feeInfo.fee).toBe(21) // 420 * 0.05 = 21
      expect(feeInfo.rate).toBe(0.05) // 费率5%
      expect(feeInfo.net_amount).toBe(399) // 卖家实收：420 - 21 = 399
      expect(feeInfo.tier).toBe('统一费率档')
      expect(feeInfo.tier_description).toContain('统一5%')
    })

    test('高价值商品（value=800）完整计算流程', () => {
      // 模拟商品数据
      const mockItem = {
        inventory_id: 3,
        name: '测试商品-高价值',
        value: 800, // 商品价值：高价值档
        selling_points: 750 // 售价
      }

      // 计算手续费
      const feeInfo = FeeCalculator.calculateItemFee(mockItem.value, mockItem.selling_points)

      // 验证计算结果
      expect(feeInfo.fee).toBe(38) // 750 * 0.05 = 37.5 → 向上取整 = 38
      expect(feeInfo.rate).toBe(0.05) // 费率5%
      expect(feeInfo.net_amount).toBe(712) // 卖家实收：750 - 38 = 712
      expect(feeInfo.tier).toBe('统一费率档')
      expect(feeInfo.tier_description).toContain('统一5%')
    })
  })

  /*
   * ========================================
   * 测试组2：档位临界值测试
   * ========================================
   */
  describe('档位临界值测试', () => {
    test('临界值1：value=299（低价值档临界点）', () => {
      const feeInfo = FeeCalculator.calculateItemFee(299, 280)
      expect(feeInfo.tier).toBe('统一费率档')
      expect(feeInfo.rate).toBe(0.05)
    })

    test('临界值2：value=300（中价值档起点）', () => {
      const feeInfo = FeeCalculator.calculateItemFee(300, 290)
      expect(feeInfo.tier).toBe('统一费率档')
      expect(feeInfo.rate).toBe(0.05)
    })

    test('临界值3：value=599（中价值档临界点）', () => {
      const feeInfo = FeeCalculator.calculateItemFee(599, 580)
      expect(feeInfo.tier).toBe('统一费率档')
      expect(feeInfo.rate).toBe(0.05)
    })

    test('临界值4：value=600（高价值档起点）', () => {
      const feeInfo = FeeCalculator.calculateItemFee(600, 580)
      expect(feeInfo.tier).toBe('统一费率档')
      expect(feeInfo.rate).toBe(0.05)
    })
  })

  /*
   * ========================================
   * 测试组3：售价与价值不一致场景
   * ========================================
   */
  describe('售价与价值不一致场景', () => {
    test('打折出售：售价低于价值', () => {
      // 商品价值500（中价值档5%），但售价只有300
      const feeInfo = FeeCalculator.calculateItemFee(500, 300)

      expect(feeInfo.tier).toBe('统一费率档') // 档位基于价值判断（当前为统一费率）
      expect(feeInfo.rate).toBe(0.05) // 5%费率
      expect(feeInfo.fee).toBe(15) // 手续费基于售价计算：300 * 0.05 = 15
      expect(feeInfo.net_amount).toBe(285) // 卖家实收：300 - 15 = 285
    })

    test('溢价出售：售价高于价值', () => {
      // 商品价值300（中价值档5%），但售价500
      const feeInfo = FeeCalculator.calculateItemFee(300, 500)

      expect(feeInfo.tier).toBe('统一费率档') // 档位基于价值判断（当前为统一费率）
      expect(feeInfo.rate).toBe(0.05) // 5%费率
      expect(feeInfo.fee).toBe(25) // 手续费基于售价计算：500 * 0.05 = 25
      expect(feeInfo.net_amount).toBe(475) // 卖家实收：500 - 25 = 475
    })
  })

  /*
   * ========================================
   * 测试组4：辅助方法集成测试
   * ========================================
   */
  describe('辅助方法集成测试', () => {
    test('getRate() 方法返回正确费率', () => {
      expect(FeeCalculator.getRate(100)).toBe(0.05)
      expect(FeeCalculator.getRate(450)).toBe(0.05)
      expect(FeeCalculator.getRate(800)).toBe(0.05)
    })

    test('getFeeDescription() 方法返回正确说明', () => {
      const desc1 = FeeCalculator.getFeeDescription(200)
      expect(desc1).toBe('5%（统一费率档）- 所有商品统一5%手续费')

      const desc2 = FeeCalculator.getFeeDescription(450)
      expect(desc2).toBe('5%（统一费率档）- 所有商品统一5%手续费')

      const desc3 = FeeCalculator.getFeeDescription(800)
      expect(desc3).toBe('5%（统一费率档）- 所有商品统一5%手续费')
    })
  })

  /*
   * ========================================
   * 测试组5：订单级别计算测试
   * ========================================
   */
  describe('订单级别计算测试', () => {
    test('混合档位订单计算', () => {
      const orderItems = [
        { inventory_id: 1, item_value: 200, selling_price: 180 }, // 低价值档
        { inventory_id: 2, item_value: 450, selling_price: 420 }, // 中价值档
        { inventory_id: 3, item_value: 800, selling_price: 750 } // 高价值档
      ]

      const result = FeeCalculator.calculateOrderFee(orderItems)

      // 验证总计
      expect(result.total_fee).toBe(68) // 9 + 21 + 38 = 68
      expect(result.total_selling_price).toBe(1350) // 180 + 420 + 750 = 1350
      expect(result.total_net_amount).toBe(1282) // 171 + 399 + 712 = 1282
      expect(result.charge_target).toBe('seller') // 收费对象：卖家
      expect(result.fee_strategy).toBe('monetize') // 手续费策略：平台收入

      // 验证明细
      expect(result.breakdown).toHaveLength(3)
      expect(result.breakdown[0].tier).toBe('统一费率档')
      expect(result.breakdown[1].tier).toBe('统一费率档')
      expect(result.breakdown[2].tier).toBe('统一费率档')
    })

    test('单商品订单计算（当前系统场景）', () => {
      const orderItems = [{ inventory_id: 1, item_value: 450, selling_price: 420 }]

      const result = FeeCalculator.calculateOrderFee(orderItems)

      expect(result.total_fee).toBe(21)
      expect(result.total_selling_price).toBe(420)
      expect(result.total_net_amount).toBe(399)
      expect(result.breakdown).toHaveLength(1)
    })
  })

  /*
   * ========================================
   * 测试组6：数据一致性验证
   * ========================================
   */
  describe('数据一致性验证', () => {
    test('手续费 + 卖家实收 = 售价', () => {
      const testCases = [
        { value: 100, selling_points: 90 },
        { value: 450, selling_points: 420 },
        { value: 800, selling_points: 750 }
      ]

      testCases.forEach(testCase => {
        const feeInfo = FeeCalculator.calculateItemFee(testCase.value, testCase.selling_points)
        expect(feeInfo.fee + feeInfo.net_amount).toBe(testCase.selling_points)
      })
    })

    test('手续费始终为正整数', () => {
      const testCases = [
        { value: 10, selling_points: 5 },
        { value: 200, selling_points: 180 },
        { value: 500, selling_points: 480 }
      ]

      testCases.forEach(testCase => {
        const feeInfo = FeeCalculator.calculateItemFee(testCase.value, testCase.selling_points)
        expect(feeInfo.fee).toBeGreaterThan(0)
        expect(Number.isInteger(feeInfo.fee)).toBe(true)
      })
    })

    test('卖家实收始终小于售价', () => {
      const testCases = [
        { value: 100, selling_points: 90 },
        { value: 450, selling_points: 420 },
        { value: 800, selling_points: 750 }
      ]

      testCases.forEach(testCase => {
        const feeInfo = FeeCalculator.calculateItemFee(testCase.value, testCase.selling_points)
        expect(feeInfo.net_amount).toBeLessThan(testCase.selling_points)
      })
    })
  })
})
