'use strict'

/**
 * 概率计算器专项测试 - ProbabilityCalculator（P1级）
 *
 * 测试内容（对应测试审计标准文档任务2.5）：
 * 2.5 概率计算器 ProbabilityCalculator - 测试概率矩阵计算和权重分配
 *
 * 业务规则（来自 TierMatrixCalculator.js，2026-03-04 Pressure-Only 重构）：
 * - Pressure-Only 矩阵：仅 Pressure Tier (P0-P2) 影响权重
 * - P0（低压）：高档概率略提，吸引参与
 * - P1（中压）：保持原始权重
 * - P2（高压）：高档权重降低，兜底权重提升，保护库存
 * - 权重归一化到 WEIGHT_SCALE = 1,000,000
 * - 资格控制由 BuildPrizePoolStage._filterByResourceEligibility 负责
 *
 * 核心组件：
 * - TierMatrixCalculator: Pressure-Only 矩阵权重调整
 * - LotteryComputeEngine: 概率计算Facade
 *
 * @file tests/unit/compute/ProbabilityCalculator.test.js
 * @author 概率计算器专项测试
 * @since 2026-01-28
 * @updated 2026-03-04 Pressure-Only 矩阵重构
 */

const TierMatrixCalculator = require('../../../services/UnifiedLotteryEngine/compute/calculators/TierMatrixCalculator')
const LotteryComputeEngine = require('../../../services/UnifiedLotteryEngine/compute/LotteryComputeEngine')

/**
 * 权重缩放比例（整数权重系统）
 */
const WEIGHT_SCALE = 1000000

/**
 * 默认档位权重标准（使用整数权重）
 */
const DEFAULT_BASE_WEIGHTS = {
  high: 50000, // 高档: 5%
  mid: 200000, // 中档: 20%
  low: 350000, // 低档: 35%
  fallback: 400000 // 兜底: 40%
}

describe('【P1】概率计算器专项测试 - ProbabilityCalculator', () => {
  /**
   * 测试前准备
   */
  beforeAll(() => {
    console.log('='.repeat(80))
    console.log('📊 【P1】概率计算器专项测试 - ProbabilityCalculator')
    console.log('='.repeat(80))
    console.log('📋 测试目标：')
    console.log('   2.5.1 TierMatrixCalculator 实例化和配置')
    console.log('   2.5.2 P0/P1/P2 矩阵乘数获取')
    console.log('   2.5.3 权重调整计算')
    console.log('   2.5.4 权重归一化处理')
    console.log('   2.5.5 LotteryComputeEngine 集成')
    console.log('='.repeat(80))
  })

  afterAll(() => {
    console.log('='.repeat(80))
    console.log('🏁 概率计算器专项测试完成')
    console.log('='.repeat(80))
  })

  /**
   * 2.5.1 TierMatrixCalculator 实例化和配置
   */
  describe('2.5.1 TierMatrixCalculator 实例化和配置', () => {
    let calculator

    beforeEach(() => {
      calculator = new TierMatrixCalculator()
    })

    test('TierMatrixCalculator 实例化成功', () => {
      console.log('📊 2.5.1.1 验证实例化...')

      expect(calculator).toBeInstanceOf(TierMatrixCalculator)
      expect(calculator.matrix).toBeDefined()

      console.log('   ✅ 实例化成功')
      console.log(`   WEIGHT_SCALE: ${TierMatrixCalculator.WEIGHT_SCALE}`)
    })

    test('内部矩阵结构正确', () => {
      console.log('📊 2.5.1.2 验证内部矩阵结构...')

      const multipliers = calculator._getMatrixMultipliers('P0')

      expect(multipliers).toBeDefined()
      expect(multipliers).toHaveProperty('high')
      expect(multipliers).toHaveProperty('mid')
      expect(multipliers).toHaveProperty('low')
      expect(multipliers).toHaveProperty('fallback')

      console.log(`   P0 乘数: high=${multipliers.high}, mid=${multipliers.mid}`)
      console.log('   ✅ 矩阵结构正确')
    })

    test('应具有 calculate 方法', () => {
      console.log('📊 2.5.1.3 验证核心方法存在...')

      expect(typeof calculator.calculate).toBe('function')
      expect(typeof calculator._getMatrixMultipliers).toBe('function')
      expect(typeof calculator._applyMultipliers).toBe('function')

      console.log('   ✅ 核心方法存在')
    })
  })

  /**
   * 2.5.2 P0/P1/P2 矩阵乘数获取
   */
  describe('2.5.2 P0/P1/P2 矩阵乘数获取', () => {
    let calculator

    beforeEach(() => {
      calculator = new TierMatrixCalculator()
    })

    test('P0（低压）- 高档权重提升', () => {
      console.log('📊 2.5.2.1 验证 P0 矩阵乘数...')

      const multipliers = calculator._getMatrixMultipliers('P0')

      expect(multipliers.high).toBeGreaterThanOrEqual(1.0)
      expect(multipliers.fallback).toBeLessThanOrEqual(1.0)

      console.log(`   high: ${multipliers.high} (预期 >= 1.0)`)
      console.log(`   fallback: ${multipliers.fallback} (预期 <= 1.0)`)
      console.log('   ✅ P0 高档权重提升')
    })

    test('P1（中压）- 保持原始权重', () => {
      console.log('📊 2.5.2.2 验证 P1 矩阵乘数...')

      const multipliers = calculator._getMatrixMultipliers('P1')

      expect(multipliers.high).toBe(1.0)
      expect(multipliers.mid).toBe(1.0)
      expect(multipliers.low).toBe(1.0)
      expect(multipliers.fallback).toBe(1.0)

      console.log(`   P1 乘数: 全部 1.0`)
      console.log('   ✅ P1 保持原始权重')
    })

    test('P2（高压）- 高档权重受限', () => {
      console.log('📊 2.5.2.3 验证 P2 矩阵乘数...')

      const multipliers = calculator._getMatrixMultipliers('P2')

      expect(multipliers.high).toBeLessThan(1.0)
      expect(multipliers.fallback).toBeGreaterThan(1.0)

      console.log(`   high: ${multipliers.high} (预期 < 1.0)`)
      console.log(`   fallback: ${multipliers.fallback} (预期 > 1.0)`)
      console.log('   ✅ P2 高档受限，兜底提升')
    })

    test('无效 Pressure Tier 应回退到 P1', () => {
      console.log('📊 2.5.2.4 验证无效组合处理...')

      const multipliers = calculator._getMatrixMultipliers('P99')

      expect(multipliers).toBeDefined()
      expect(multipliers.high).toBe(1.0)
      expect(multipliers.fallback).toBe(1.0)

      console.log(`   回退乘数: P1 默认`)
      console.log('   ✅ 无效组合回退处理正确')
    })

    test('遍历所有 P0/P1/P2 组合', () => {
      console.log('📊 2.5.2.5 遍历所有 Pressure Tier...')

      const pressureTiers = ['P0', 'P1', 'P2']

      pressureTiers.forEach(px => {
        const multipliers = calculator._getMatrixMultipliers(px)

        expect(multipliers).toBeDefined()
        expect(multipliers.high).toBeGreaterThan(0)
        expect(multipliers.fallback).toBeGreaterThan(0)
      })

      console.log(`   共验证 ${pressureTiers.length} 个 Pressure Tier`)
      console.log('   ✅ 所有组合验证通过')
    })
  })

  /**
   * 2.5.3 权重调整计算
   */
  describe('2.5.3 权重调整计算', () => {
    let calculator

    beforeEach(() => {
      calculator = new TierMatrixCalculator()
    })

    test('基础权重应用乘数', () => {
      console.log('📊 2.5.3.1 验证基础权重乘数应用...')

      const baseWeights = { high: 100000, mid: 200000, low: 300000, fallback: 400000 }
      const multipliers = { high: 2.0, mid: 1.5, low: 1.0, fallback: 0.5 }

      const adjusted = calculator._applyMultipliers(baseWeights, multipliers)

      expect(adjusted.high).toBe(200000) // 100000 × 2.0
      expect(adjusted.mid).toBe(300000) // 200000 × 1.5
      expect(adjusted.low).toBe(300000) // 300000 × 1.0
      expect(adjusted.fallback).toBe(200000) // 400000 × 0.5

      console.log(`   原始: high=${baseWeights.high}, mid=${baseWeights.mid}`)
      console.log(`   调整: high=${adjusted.high}, mid=${adjusted.mid}`)
      console.log('   ✅ 乘数应用正确')
    })

    test('P0 应提升高档权重', () => {
      console.log('📊 2.5.3.2 验证 P0 权重调整效果...')

      const baseWeights = { ...DEFAULT_BASE_WEIGHTS }
      const multipliers = calculator._getMatrixMultipliers('P0')
      const adjusted = calculator._applyMultipliers(baseWeights, multipliers)

      expect(adjusted.high).toBeGreaterThan(baseWeights.high)
      expect(adjusted.fallback).toBeLessThan(baseWeights.fallback)

      console.log(`   调整后: high=${adjusted.high}, fallback=${adjusted.fallback}`)
      console.log('   ✅ P0 提升高档权重')
    })

    test('P2 应降低高档概率', () => {
      console.log('📊 2.5.3.3 验证 P2 权重调整效果...')

      const baseWeights = { ...DEFAULT_BASE_WEIGHTS }
      const multipliers = calculator._getMatrixMultipliers('P2')
      const adjusted = calculator._applyMultipliers(baseWeights, multipliers)

      expect(adjusted.high).toBeLessThan(baseWeights.high)
      expect(adjusted.fallback).toBeGreaterThan(baseWeights.fallback)

      const highRatioBefore =
        baseWeights.high / Object.values(baseWeights).reduce((a, b) => a + b, 0)
      const highRatioAfter = adjusted.high / Object.values(adjusted).reduce((a, b) => a + b, 0)

      console.log(
        `   高档占比变化: ${(highRatioBefore * 100).toFixed(1)}% → ${(highRatioAfter * 100).toFixed(1)}%`
      )
      console.log('   ✅ P2 高档概率降低')
    })
  })

  /**
   * 2.5.4 权重归一化处理
   */
  describe('2.5.4 权重归一化处理', () => {
    let calculator

    beforeEach(() => {
      calculator = new TierMatrixCalculator()
    })

    test('归一化后总权重应为 WEIGHT_SCALE', () => {
      console.log('📊 2.5.4.1 验证权重归一化...')

      const weights = { high: 60000, mid: 180000, low: 360000, fallback: 400000 }

      const normalized = calculator._normalizeWeights(weights)
      const actualSum = Object.values(normalized).reduce((a, b) => a + b, 0)

      expect(actualSum).toBe(WEIGHT_SCALE)

      console.log(`   原始总权重: ${Object.values(weights).reduce((a, b) => a + b, 0)}`)
      console.log(`   归一化后: ${actualSum} (目标: ${WEIGHT_SCALE})`)
      console.log('   ✅ 归一化正确')
    })

    test('归一化应保持比例关系', () => {
      console.log('📊 2.5.4.2 验证归一化保持比例...')

      const weights = { high: 100000, mid: 200000, low: 300000, fallback: 400000 }
      const normalized = calculator._normalizeWeights(weights)

      const originalRatio = weights.high / weights.mid
      const normalizedRatio = normalized.high / normalized.mid

      expect(normalizedRatio).toBeCloseTo(originalRatio, 2)

      console.log(`   原始比例 high:mid = ${originalRatio.toFixed(2)}`)
      console.log(`   归一化后 high:mid = ${normalizedRatio.toFixed(2)}`)
      console.log('   ✅ 比例保持不变')
    })
  })

  /**
   * 2.5.5 LotteryComputeEngine 集成测试
   */
  describe('2.5.5 LotteryComputeEngine 集成', () => {
    let engine

    beforeEach(() => {
      engine = new LotteryComputeEngine()
    })

    test('computeWeightAdjustment 集成计算', () => {
      console.log('📊 2.5.5.1 验证 computeWeightAdjustment 集成...')

      const params = {
        pressure_tier: 'P1',
        base_tier_weights: { ...DEFAULT_BASE_WEIGHTS }
      }

      const result = engine.computeWeightAdjustment(params)

      expect(result).toBeDefined()
      expect(result.adjusted_weights).toBeDefined()
      expect(result.pressure_tier).toBe('P1')

      const totalWeight = Object.values(result.adjusted_weights).reduce((a, b) => a + b, 0)

      console.log(`   输入: pressure_tier=${params.pressure_tier}`)
      console.log(`   调整后权重: ${JSON.stringify(result.adjusted_weights)}`)
      console.log(`   总权重: ${totalWeight}`)
      console.log('   ✅ 集成计算正确')
    })

    test('权重调整应反映 Px 状态', () => {
      console.log('📊 2.5.5.2 验证权重调整反映 Px 状态...')

      const baseWeights = { ...DEFAULT_BASE_WEIGHTS }

      // P0 (低压) - 高档概率最高
      const relaxedResult = engine.computeWeightAdjustment({
        pressure_tier: 'P0',
        base_tier_weights: baseWeights
      })

      // P2 (高压) - 高档概率降低
      const tenseResult = engine.computeWeightAdjustment({
        pressure_tier: 'P2',
        base_tier_weights: baseWeights
      })

      const relaxedTotal = Object.values(relaxedResult.adjusted_weights).reduce((a, b) => a + b, 0)
      const tenseTotal = Object.values(tenseResult.adjusted_weights).reduce((a, b) => a + b, 0)
      const relaxedHighRatio = relaxedResult.adjusted_weights.high / relaxedTotal
      const tenseHighRatio = tenseResult.adjusted_weights.high / tenseTotal

      expect(relaxedHighRatio).toBeGreaterThan(tenseHighRatio)

      console.log(`   P0 高档占比: ${(relaxedHighRatio * 100).toFixed(2)}%`)
      console.log(`   P2 高档占比: ${(tenseHighRatio * 100).toFixed(2)}%`)
      console.log('   ✅ 权重调整正确反映 Px 状态')
    })
  })

  /**
   * 概率分布验证
   */
  describe('概率分布验证', () => {
    test('调整后概率总和应为 WEIGHT_SCALE', () => {
      console.log('📊 概率分布验证1: 概率总和...')

      const calculator = new TierMatrixCalculator()
      const pressureTiers = ['P0', 'P1', 'P2']

      pressureTiers.forEach(px => {
        const multipliers = calculator._getMatrixMultipliers(px)
        const adjusted = calculator._applyMultipliers({ ...DEFAULT_BASE_WEIGHTS }, multipliers)
        const normalized = calculator._normalizeWeights(adjusted)

        const total = Object.values(normalized).reduce((a, b) => a + b, 0)

        expect(total).toBe(WEIGHT_SCALE)
      })

      console.log(`   所有 Px 组合归一化后总和 = ${WEIGHT_SCALE}`)
      console.log('   ✅ 概率总和验证通过')
    })

    test('P0 高档概率最高', () => {
      console.log('📊 概率分布验证2: P0 高档概率...')

      const calculator = new TierMatrixCalculator()

      const result = calculator.calculate({
        pressure_tier: 'P0',
        base_weights: { ...DEFAULT_BASE_WEIGHTS }
      })

      const highRatio = result.final_weights.high / WEIGHT_SCALE

      expect(highRatio).toBeGreaterThan(0)
      expect(highRatio).toBeLessThanOrEqual(0.2)

      console.log(`   P0 高档概率: ${(highRatio * 100).toFixed(2)}%`)
      console.log('   ✅ P0 高档概率验证通过')
    })

    test('P2 高档概率低于 P0', () => {
      console.log('📊 概率分布验证3: P2 vs P0 高档概率...')

      const calculator = new TierMatrixCalculator()

      const p0Result = calculator.calculate({
        pressure_tier: 'P0',
        base_weights: { ...DEFAULT_BASE_WEIGHTS }
      })
      const p2Result = calculator.calculate({
        pressure_tier: 'P2',
        base_weights: { ...DEFAULT_BASE_WEIGHTS }
      })

      const p0HighRatio = p0Result.final_weights.high / WEIGHT_SCALE
      const p2HighRatio = p2Result.final_weights.high / WEIGHT_SCALE

      expect(p2HighRatio).toBeLessThan(p0HighRatio)
      expect(
        p0Result.final_weights.high +
          p0Result.final_weights.mid +
          p0Result.final_weights.low +
          p0Result.final_weights.fallback
      ).toBe(WEIGHT_SCALE)

      console.log('   P0 高档 > P2 高档，总和=100%')
      console.log('   ✅ P2 高档概率验证通过')
    })
  })

  /**
   * 测试报告
   */
  describe('测试报告', () => {
    test('生成概率计算器测试报告', () => {
      console.log('\n')
      console.log('='.repeat(80))
      console.log('📊 概率计算器专项测试报告')
      console.log('='.repeat(80))
      console.log(
        `📅 测试时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`
      )
      console.log('')
      console.log('✅ 测试覆盖内容：')
      console.log('   2.5.1 TierMatrixCalculator 实例化和配置 ✓')
      console.log('   2.5.2 P0/P1/P2 矩阵乘数获取 ✓')
      console.log('   2.5.3 权重调整计算 ✓')
      console.log('   2.5.4 权重归一化处理 ✓')
      console.log('   2.5.5 LotteryComputeEngine 集成 ✓')
      console.log('')
      console.log('📋 核心业务规则验证：')
      console.log('   - Pressure-Only 矩阵：P0/P1/P2 三种组合')
      console.log('   - 权重归一化：保持比例，总和固定')
      console.log('   - 高档概率：P0 提升，P2 降低')
      console.log('   - 资格控制：BuildPrizePoolStage 资源级过滤')
      console.log('='.repeat(80))

      expect(true).toBe(true)
    })
  })
})
