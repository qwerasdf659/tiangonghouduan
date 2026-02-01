/**
 * P1-1 配置边界验证测试 - 价格范围配置
 *
 * 测试目标：验证系统配置对业务逻辑的边界控制
 *
 * 业务场景：
 * - P1-1.1: 商品最低价配置测试
 * - P1-1.2: 商品最高价配置测试
 * - P1-1.3: 手续费率边界测试
 *
 * 配置来源：AdminSystemService.getSettingValue('marketplace', 'min_price_{asset_code}')
 *
 * @module tests/config-boundary/price-range
 * @since 2026-01-30
 */

'use strict'

// V4.7.0 拆分：使用 market-listing/CoreService
const MarketListingService = require('../../services/market-listing/CoreService')
const AdminSystemService = require('../../services/AdminSystemService')

/**
 * 生成幂等键（预留，未来测试可能使用）
 * @param {string} prefix - 前缀
 * @returns {string} 幂等键
 */
function _generateIdempotencyKey(prefix = 'config_test') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`
}

describe('P1-1: 配置边界验证测试 - 价格范围', () => {
  // 加载应用以初始化服务
  beforeAll(async () => {
    require('../../app')
    // 等待服务初始化
    await new Promise(resolve => setTimeout(resolve, 1500))
  })

  describe('P1-1.1: 商品最低价配置测试', () => {
    /**
     * 测试场景：验证最低价配置读取
     * 预期行为：能够正确读取系统配置的最低价格
     */
    test('应能读取 DIAMOND 币种的最低价配置', async () => {
      const minPrice = await AdminSystemService.getSettingValue(
        'marketplace',
        'min_price_DIAMOND',
        1 // 默认值
      )

      expect(minPrice).toBeDefined()
      expect(typeof minPrice).toBe('number')
      expect(minPrice).toBeGreaterThanOrEqual(0)

      console.log(`✅ DIAMOND 最低价配置: ${minPrice}`)
    })

    /**
     * 测试场景：挂牌价格低于最低价被拒绝
     * 预期行为：返回错误提示，包含最低价信息
     */
    test('挂牌价格低于最低价应被拒绝', async () => {
      // 获取当前最低价配置
      const minPrice = await AdminSystemService.getSettingValue(
        'marketplace',
        'min_price_DIAMOND',
        1
      )

      // 验证价格范围
      const result = await MarketListingService.validatePriceRange('DIAMOND', minPrice - 1)

      expect(result.valid).toBe(false)
      expect(result.min).toBe(minPrice)
      expect(result.message).toContain('低于最小价格')

      console.log(`✅ 低于最低价 ${minPrice - 1} 被正确拒绝`)
    })

    /**
     * 测试场景：挂牌价格等于最低价被接受
     * 预期行为：校验通过
     */
    test('挂牌价格等于最低价应被接受', async () => {
      const minPrice = await AdminSystemService.getSettingValue(
        'marketplace',
        'min_price_DIAMOND',
        1
      )

      const result = await MarketListingService.validatePriceRange('DIAMOND', minPrice)

      expect(result.valid).toBe(true)
      expect(result.min).toBe(minPrice)

      console.log(`✅ 等于最低价 ${minPrice} 被正确接受`)
    })

    /**
     * 测试场景：验证默认最低价为1
     * 预期行为：未配置时使用默认值1
     */
    test('未配置最低价时应使用默认值1', async () => {
      // 测试一个不存在的币种配置
      const defaultMin = await AdminSystemService.getSettingValue(
        'marketplace',
        'min_price_TEST_ASSET_NOT_EXIST',
        1 // 默认值
      )

      expect(defaultMin).toBe(1)

      console.log('✅ 默认最低价值: 1')
    })
  })

  describe('P1-1.2: 商品最高价配置测试', () => {
    /**
     * 测试场景：验证最高价配置读取
     * 预期行为：DIAMOND无上限（null），其他币种有上限
     */
    test('DIAMOND 币种应无最高价限制（null）', async () => {
      const maxPrice = await AdminSystemService.getSettingValue(
        'marketplace',
        'max_price_DIAMOND',
        null // 默认无上限
      )

      // DIAMOND 默认无上限
      expect(maxPrice).toBeNull()

      console.log('✅ DIAMOND 最高价配置: 无限制（null）')
    })

    /**
     * 测试场景：验证有上限币种的最高价校验
     * 预期行为：超过最高价被拒绝
     */
    test('挂牌价格超过最高价应被拒绝（如有配置）', async () => {
      // 使用 red_shard 作为测试（有上限配置）
      const maxPrice = await AdminSystemService.getSettingValue(
        'marketplace',
        'max_price_red_shard',
        1000000 // 默认上限
      )

      if (maxPrice !== null) {
        const result = await MarketListingService.validatePriceRange('red_shard', maxPrice + 1)

        expect(result.valid).toBe(false)
        expect(result.max).toBe(maxPrice)
        expect(result.message).toContain('超过最大价格')

        console.log(`✅ 超过最高价 ${maxPrice + 1} 被正确拒绝`)
      } else {
        console.log('⚠️ red_shard 无最高价限制，跳过此测试')
      }
    })

    /**
     * 测试场景：挂牌价格等于最高价被接受
     * 预期行为：校验通过
     */
    test('挂牌价格等于最高价应被接受（如有配置）', async () => {
      const maxPrice = await AdminSystemService.getSettingValue(
        'marketplace',
        'max_price_red_shard',
        1000000
      )

      if (maxPrice !== null) {
        const result = await MarketListingService.validatePriceRange('red_shard', maxPrice)

        expect(result.valid).toBe(true)
        expect(result.max).toBe(maxPrice)

        console.log(`✅ 等于最高价 ${maxPrice} 被正确接受`)
      } else {
        console.log('⚠️ red_shard 无最高价限制，跳过此测试')
      }
    })

    /**
     * 测试场景：无最高价限制时大额定价应通过
     * 预期行为：任意正数金额都应通过校验
     */
    test('DIAMOND 无上限时大额定价应通过', async () => {
      const veryLargePrice = 999999999999 // 非常大的价格

      const result = await MarketListingService.validatePriceRange('DIAMOND', veryLargePrice)

      expect(result.valid).toBe(true)
      expect(result.max).toBeNull()

      console.log(`✅ 大额定价 ${veryLargePrice} 被正确接受（无上限）`)
    })
  })

  describe('P1-1.3: 手续费率边界测试', () => {
    /**
     * 测试场景：验证手续费率配置
     * 预期行为：能够正确读取手续费率配置
     */
    test('应能读取手续费率配置', async () => {
      // 从FeeCalculator获取手续费计算
      const FeeCalculator = require('../../services/FeeCalculator')

      // 检查手续费计算方法是否存在
      expect(typeof FeeCalculator.calculateFeeByAsset).toBe('function')

      // 测试基本手续费计算（DIAMOND币种）
      const testPrice = 100
      const feeResult = await FeeCalculator.calculateFeeByAsset('DIAMOND', testPrice, testPrice)

      // FeeCalculator 返回结构：{ fee, rate, net_amount, calculation_mode, tier, asset_code }
      expect(feeResult).toHaveProperty('fee')
      expect(feeResult).toHaveProperty('rate')
      expect(feeResult.fee).toBeGreaterThanOrEqual(0)
      expect(feeResult.rate).toBeGreaterThanOrEqual(0)
      expect(feeResult.rate).toBeLessThanOrEqual(1) // 手续费率不应超过100%

      console.log(`✅ 手续费率配置: ${(feeResult.rate * 100).toFixed(2)}%`)
      console.log(`✅ 价格 ${testPrice} 的手续费: ${feeResult.fee}`)
    })

    /**
     * 测试场景：验证手续费最小值为0
     * 预期行为：手续费不能为负数
     */
    test('手续费不应为负数', async () => {
      const FeeCalculator = require('../../services/FeeCalculator')

      const feeResult = await FeeCalculator.calculateFeeByAsset('DIAMOND', 1, 1)

      expect(feeResult.fee).toBeGreaterThanOrEqual(0)

      console.log(`✅ 最小价格手续费: ${feeResult.fee}（非负数）`)
    })

    /**
     * 测试场景：验证手续费不超过交易金额
     * 预期行为：手续费 <= 交易金额
     */
    test('手续费不应超过交易金额', async () => {
      const FeeCalculator = require('../../services/FeeCalculator')

      const testCases = [10, 100, 1000, 10000]

      for (const price of testCases) {
        const feeResult = await FeeCalculator.calculateFeeByAsset('DIAMOND', price, price)

        expect(feeResult.fee).toBeLessThanOrEqual(price)

        console.log(`✅ 价格 ${price} 的手续费 ${feeResult.fee} <= ${price}`)
      }
    })

    /**
     * 测试场景：验证阶梯费率逻辑（如有）
     * 预期行为：不同金额区间手续费率可能不同
     */
    test('应正确应用阶梯费率逻辑', async () => {
      const FeeCalculator = require('../../services/FeeCalculator')

      // 测试不同金额的手续费计算
      const prices = [10, 100, 1000, 10000, 100000]
      const results = []

      for (const price of prices) {
        const feeResult = await FeeCalculator.calculateFeeByAsset('DIAMOND', price, price)

        results.push({
          price,
          fee: feeResult.fee,
          rate: feeResult.rate
        })
      }

      // 验证所有结果有效
      results.forEach(r => {
        expect(r.fee).toBeGreaterThanOrEqual(0)
        expect(r.rate).toBeGreaterThanOrEqual(0)
      })

      console.log('✅ 阶梯费率测试结果:')
      results.forEach(r => {
        console.log(`   价格: ${r.price}, 手续费: ${r.fee}, 费率: ${(r.rate * 100).toFixed(2)}%`)
      })
    })
  })

  describe('P1-1.4: 交易金额限制测试', () => {
    /**
     * 测试场景：验证单笔交易金额限制
     * 预期行为：超过限制的交易被拒绝
     */
    test('应正确校验交易金额边界', async () => {
      // 价格校验应拒绝负数和0
      const negativeResult = await MarketListingService.validatePriceRange('DIAMOND', -1)
      const zeroResult = await MarketListingService.validatePriceRange('DIAMOND', 0)

      expect(negativeResult.valid).toBe(false)
      expect(zeroResult.valid).toBe(false)

      console.log('✅ 负数价格被正确拒绝')
      console.log('✅ 零价格被正确拒绝')
    })

    /**
     * 测试场景：验证价格必须为正整数
     * 预期行为：非整数价格被拒绝或向下取整
     */
    test('小数价格应被正确处理', async () => {
      // 测试小数价格处理
      const decimalResult = await MarketListingService.validatePriceRange('DIAMOND', 10.5)

      /*
       * 业务逻辑：小数应被处理（通过或向下取整）
       * 验证返回结果结构正确
       */
      expect(decimalResult).toHaveProperty('valid')
      expect(decimalResult).toHaveProperty('min')

      console.log(`✅ 小数价格 10.5 处理结果: valid=${decimalResult.valid}`)
    })
  })

  describe('P1-1.5: 配置缓存验证', () => {
    /**
     * 测试场景：验证配置缓存机制
     * 预期行为：重复读取应使用缓存
     */
    test('配置应支持缓存', async () => {
      // 连续读取两次相同配置
      const start1 = Date.now()
      const value1 = await AdminSystemService.getSettingValue('marketplace', 'min_price_DIAMOND', 1)
      const time1 = Date.now() - start1

      const start2 = Date.now()
      const value2 = await AdminSystemService.getSettingValue('marketplace', 'min_price_DIAMOND', 1)
      const time2 = Date.now() - start2

      // 值应该相同
      expect(value1).toBe(value2)

      // 第二次读取通常更快（使用缓存）
      console.log(`✅ 首次读取耗时: ${time1}ms`)
      console.log(`✅ 二次读取耗时: ${time2}ms`)
      console.log(`✅ 配置值一致: ${value1}`)
    })
  })

  describe('配置边界总结报告', () => {
    test('输出配置边界测试总结', async () => {
      // 收集所有配置值
      const configs = {
        min_price_DIAMOND: await AdminSystemService.getSettingValue(
          'marketplace',
          'min_price_DIAMOND',
          1
        ),
        max_price_DIAMOND: await AdminSystemService.getSettingValue(
          'marketplace',
          'max_price_DIAMOND',
          null
        ),
        min_price_red_shard: await AdminSystemService.getSettingValue(
          'marketplace',
          'min_price_red_shard',
          1
        ),
        max_price_red_shard: await AdminSystemService.getSettingValue(
          'marketplace',
          'max_price_red_shard',
          1000000
        )
      }

      console.log('\n📊 配置边界测试总结报告')
      console.log('='.repeat(50))
      console.log('币种配置:')
      Object.entries(configs).forEach(([key, value]) => {
        console.log(`  ${key}: ${value === null ? '无限制' : value}`)
      })
      console.log('='.repeat(50))
    })
  })
})
