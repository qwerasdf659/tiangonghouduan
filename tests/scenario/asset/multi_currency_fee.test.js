/**
 * 多币种手续费计算集成测试
 * 文件路径：tests/integration/multi_currency_fee.test.js
 *
 * 测试范围：
 * - star_stone 分档手续费计算（保持现状逻辑）
 * - red_core_shard 单一费率手续费计算（5%，floor 取整）
 * - 手续费最低值保证（最低 1）
 * - system_settings 配置读取验证
 *
 * 业务决策（2026-01-14 多币种扩展）：
 * - star_stone：分档模式（ceil 向上取整）
 * - red_core_shard：5% 单一费率（floor 向下取整），最低手续费 1
 * - 对账公式：gross_amount = fee_amount + net_amount
 *
 * @module tests/integration/multi_currency_fee.test.js
 * @date 2026-01-15
 */

const FeeCalculator = require('../../../services/FeeCalculator')
const { sequelize } = require('../../../models')

describe('多币种手续费计算测试', () => {
  // 测试超时设置
  jest.setTimeout(30000)

  beforeAll(async () => {
    try {
      await sequelize.authenticate()
      console.log('✅ 数据库连接成功')
    } catch (error) {
      console.warn('⚠️ 数据库连接失败:', error.message)
    }
  })

  afterAll(async () => {
    await sequelize.close()
  })

  /*
   * ========================================
   * 测试组1：star_stone 分档手续费计算
   * ========================================
   *
   * 业务规则：
   * - 分档基于 itemValue（商品价值）判断
   * - 手续费基于 sellingPrice（用户定价）计算
   * - ceil 向上取整
   * - 最低手续费 1
   */
  describe('star_stone 分档手续费计算', () => {
    test('calculateFeeByAsset - star_stone 分档模式基本验证', async () => {
      const result = await FeeCalculator.calculateFeeByAsset('star_stone', 500, 600)

      expect(result).toHaveProperty('fee')
      expect(result).toHaveProperty('rate')
      expect(result).toHaveProperty('net_amount')
      expect(result).toHaveProperty('calculation_mode')
      expect(result.calculation_mode).toBe('tiered')
      expect(result.asset_code).toBe('star_stone')

      // 对账公式验证：gross_amount = fee + net_amount
      expect(result.fee + result.net_amount).toBe(600)

      console.log('✅ star_stone 分档模式基本验证通过:', result)
    })

    test('calculateFeeByAsset - star_stone 低价值档（value < 300）', async () => {
      // 低价值档：统一费率档 5%
      const result = await FeeCalculator.calculateFeeByAsset('star_stone', 200, 180)

      expect(result.calculation_mode).toBe('tiered')
      expect(result.rate).toBe(0.05) // 统一5%费率
      expect(result.fee).toBe(9) // 180 * 0.05 = 9（ceil）
      expect(result.net_amount).toBe(171) // 180 - 9 = 171
      expect(result.tier).toBe('统一费率档')

      console.log('✅ star_stone 低价值档测试通过:', result)
    })

    test('calculateFeeByAsset - star_stone 中价值档（300 ≤ value < 600）', async () => {
      // 中价值档：统一费率档 5%
      const result = await FeeCalculator.calculateFeeByAsset('star_stone', 450, 420)

      expect(result.calculation_mode).toBe('tiered')
      expect(result.rate).toBe(0.05) // 统一5%费率
      expect(result.fee).toBe(21) // 420 * 0.05 = 21（ceil）
      expect(result.net_amount).toBe(399) // 420 - 21 = 399
      expect(result.tier).toBe('统一费率档')

      console.log('✅ star_stone 中价值档测试通过:', result)
    })

    test('calculateFeeByAsset - star_stone 高价值档（value ≥ 600）', async () => {
      // 高价值档：统一费率档 5%
      const result = await FeeCalculator.calculateFeeByAsset('star_stone', 800, 750)

      expect(result.calculation_mode).toBe('tiered')
      expect(result.rate).toBe(0.05) // 统一5%费率
      expect(result.fee).toBe(38) // 750 * 0.05 = 37.5 → ceil = 38
      expect(result.net_amount).toBe(712) // 750 - 38 = 712
      expect(result.tier).toBe('统一费率档')

      console.log('✅ star_stone 高价值档测试通过:', result)
    })

    test('calculateFeeByAsset - star_stone 最低手续费保证', async () => {
      // 小额交易：确保手续费不低于最低值（1）
      const result = await FeeCalculator.calculateFeeByAsset('star_stone', 10, 5)

      expect(result.fee).toBeGreaterThanOrEqual(1) // 最低 1
      expect(result.net_amount).toBeLessThan(5) // 卖家实收 < 售价

      console.log('✅ star_stone 最低手续费保证测试通过:', result)
    })
  })

  /*
   * ========================================
   * 测试组2：red_core_shard 单一费率手续费计算
   * ========================================
   *
   * 业务规则（2026-01-14 拍板）：
   * - 单一费率 5%（从 system_settings 读取）
   * - floor 向下取整
   * - 最低手续费 1
   */
  describe('red_core_shard 单一费率手续费计算', () => {
    test('calculateFeeByAsset - red_core_shard 单一费率模式基本验证', async () => {
      const result = await FeeCalculator.calculateFeeByAsset('red_core_shard', null, 1000)

      expect(result).toHaveProperty('fee')
      expect(result).toHaveProperty('rate')
      expect(result).toHaveProperty('net_amount')
      expect(result).toHaveProperty('calculation_mode')
      expect(result.calculation_mode).toBe('flat') // 单一费率模式
      expect(result.asset_code).toBe('red_core_shard')

      // 对账公式验证
      expect(result.fee + result.net_amount).toBe(1000)

      console.log('✅ red_core_shard 单一费率模式基本验证通过:', result)
    })

    test('calculateFeeByAsset - red_core_shard 5% 费率计算', async () => {
      // 1000 * 5% = 50（floor）
      const result = await FeeCalculator.calculateFeeByAsset('red_core_shard', null, 1000)

      expect(result.rate).toBe(0.05) // 5% 费率
      expect(result.fee).toBe(50) // 1000 * 0.05 = 50（floor）
      expect(result.net_amount).toBe(950) // 1000 - 50 = 950

      console.log('✅ red_core_shard 5% 费率计算测试通过:', result)
    })

    test('calculateFeeByAsset - red_core_shard floor 向下取整验证', async () => {
      // 123 * 5% = 6.15 → floor = 6
      const result = await FeeCalculator.calculateFeeByAsset('red_core_shard', null, 123)

      expect(result.fee).toBe(6) // floor(123 * 0.05) = 6
      expect(result.net_amount).toBe(117) // 123 - 6 = 117

      console.log('✅ red_core_shard floor 向下取整测试通过:', result)
    })

    test('calculateFeeByAsset - red_core_shard 最低手续费保证', async () => {
      // 小额交易：10 * 5% = 0.5 → floor = 0 → 应用最低费 1
      const result = await FeeCalculator.calculateFeeByAsset('red_core_shard', null, 10)

      expect(result.fee).toBeGreaterThanOrEqual(1) // 最低 1
      expect(result.net_amount).toBe(10 - result.fee)

      console.log('✅ red_core_shard 最低手续费保证测试通过:', result)
    })

    test('calculateFeeByAsset - red_core_shard 边界值：刚好达到最低费', async () => {
      // 20 * 5% = 1 → 刚好达到最低费，无需应用保底
      const result = await FeeCalculator.calculateFeeByAsset('red_core_shard', null, 20)

      expect(result.fee).toBe(1) // floor(20 * 0.05) = 1
      expect(result.net_amount).toBe(19) // 20 - 1 = 19

      console.log('✅ red_core_shard 边界值测试通过:', result)
    })
  })

  /*
   * ========================================
   * 测试组3：对账公式一致性验证
   * ========================================
   *
   * 核心公式：gross_amount = fee_amount + net_amount
   * 所有场景必须满足此公式
   */
  describe('对账公式一致性验证', () => {
    test('star_stone 对账公式：多个价位验证', async () => {
      const testCases = [
        { itemValue: 100, sellingPrice: 90 },
        { itemValue: 300, sellingPrice: 280 },
        { itemValue: 500, sellingPrice: 480 },
        { itemValue: 800, sellingPrice: 750 },
        { itemValue: 1000, sellingPrice: 950 }
      ]

      for (const testCase of testCases) {
        const result = await FeeCalculator.calculateFeeByAsset(
          'star_stone',
          testCase.itemValue,
          testCase.sellingPrice
        )

        // 对账公式验证
        const checksum = result.fee + result.net_amount
        expect(checksum).toBe(testCase.sellingPrice)

        console.log(
          `✅ star_stone 对账公式验证通过: ${testCase.sellingPrice} = ${result.fee} + ${result.net_amount}`
        )
      }
    })

    test('red_core_shard 对账公式：多个价位验证', async () => {
      const testCases = [50, 100, 200, 500, 1000, 5000]

      for (const sellingPrice of testCases) {
        const result = await FeeCalculator.calculateFeeByAsset('red_core_shard', null, sellingPrice)

        // 对账公式验证
        const checksum = result.fee + result.net_amount
        expect(checksum).toBe(sellingPrice)

        console.log(
          `✅ red_core_shard 对账公式验证通过: ${sellingPrice} = ${result.fee} + ${result.net_amount}`
        )
      }
    })
  })

  /*
   * ========================================
   * 测试组4：费率信息查询接口验证
   * ========================================
   */
  describe('费率信息查询接口验证', () => {
    test('getFeeRateByAsset - star_stone 返回分档费率信息', async () => {
      const rateInfo = await FeeCalculator.getFeeRateByAsset('star_stone')

      expect(rateInfo).toHaveProperty('calculation_mode')
      expect(rateInfo.calculation_mode).toBe('tiered')
      expect(rateInfo.rate).toBeNull() // 分档模式无单一费率
      expect(rateInfo.rate_range).toBeInstanceOf(Array)
      expect(rateInfo.min_fee).toBe(1)

      console.log('✅ star_stone 费率信息查询通过:', rateInfo)
    })

    test('getFeeRateByAsset - red_core_shard 返回单一费率信息', async () => {
      const rateInfo = await FeeCalculator.getFeeRateByAsset('red_core_shard')

      expect(rateInfo).toHaveProperty('calculation_mode')
      expect(rateInfo.calculation_mode).toBe('flat')
      expect(rateInfo.rate).toBe(0.05) // 单一 5% 费率
      expect(rateInfo.rate_range).toBeNull() // 非分档模式无费率区间
      expect(rateInfo.min_fee).toBe(1)

      console.log('✅ red_core_shard 费率信息查询通过:', rateInfo)
    })
  })

  /*
   * ========================================
   * 测试组5：手续费计算与 TradeOrder 集成验证
   * ========================================
   */
  describe('手续费计算与 TradeOrder 集成验证', () => {
    test('验证 TradeOrderService 中手续费计算流程（模拟）', async () => {
      // 模拟 TradeOrderService.createOrder 中的手续费计算逻辑
      const mockListing = {
        price_asset_code: 'red_core_shard',
        price_amount: 500,
        listing_kind: 'fungible_asset'
      }

      const feeInfo = await FeeCalculator.calculateFeeByAsset(
        mockListing.price_asset_code,
        null, // fungible_asset 用 price_amount 作为价值锚点
        mockListing.price_amount
      )

      // 计算对账金额
      const grossAmount = mockListing.price_amount
      const feeAmount = feeInfo.fee
      const netAmount = mockListing.price_amount - feeAmount

      // 验证 TradeOrder 字段一致性
      expect(grossAmount).toBe(500)
      expect(feeAmount).toBe(25) // 500 * 0.05 = 25
      expect(netAmount).toBe(475) // 500 - 25 = 475

      // 对账公式验证
      expect(grossAmount).toBe(feeAmount + netAmount)

      console.log('✅ TradeOrder 集成验证通过:', {
        gross_amount: grossAmount,
        fee_amount: feeAmount,
        net_amount: netAmount
      })
    })

    test('验证 star_stone 与 red_core_shard 手续费差异', async () => {
      const sellingPrice = 1000

      // star_stone 分档模式
      const diamondFee = await FeeCalculator.calculateFeeByAsset('star_stone', 1000, sellingPrice)

      // red_core_shard 单一费率模式
      const redShardFee = await FeeCalculator.calculateFeeByAsset(
        'red_core_shard',
        null,
        sellingPrice
      )

      console.log('📊 手续费对比 (价格=1000):')
      console.log(`   star_stone: fee=${diamondFee.fee}, mode=${diamondFee.calculation_mode}`)
      console.log(`   red_core_shard: fee=${redShardFee.fee}, mode=${redShardFee.calculation_mode}`)

      // 两者都应满足对账公式
      expect(diamondFee.fee + diamondFee.net_amount).toBe(sellingPrice)
      expect(redShardFee.fee + redShardFee.net_amount).toBe(sellingPrice)

      /*
       * red_core_shard 使用 floor，手续费应 ≤ star_stone（ceil）
       * 注意：这只是一般情况，具体取决于费率配置
       */
      expect(redShardFee.fee).toBeLessThanOrEqual(diamondFee.fee)
    })
  })
})
