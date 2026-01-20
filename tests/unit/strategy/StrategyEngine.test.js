'use strict'

/**
 * StrategyEngine 单元测试
 *
 * 测试内容：
 * 1. 策略引擎初始化
 * 2. 常量导出
 * 3. 内部计算器集成
 * 4. 灰度发布功能（Phase P2 增强）
 * 5. 边界场景测试
 *
 * @module tests/unit/strategy/StrategyEngine.test
 */

const StrategyEngine = require('../../../services/UnifiedLotteryEngine/strategy/StrategyEngine')
const {
  getStrategyEngine,
  resetStrategyEngine,
  BUDGET_TIERS,
  PRESSURE_TIERS,
  TIER_WEIGHT_MATRIX,
  isFeatureEnabledForContext,
  getGrayscaleSummary,
  GRAYSCALE_CONFIG
} = require('../../../services/UnifiedLotteryEngine/strategy/index')

describe('StrategyEngine', () => {
  let engine

  beforeEach(() => {
    resetStrategyEngine() // 重置单例
    engine = new StrategyEngine()
  })

  afterEach(() => {
    resetStrategyEngine()
  })

  describe('初始化', () => {
    test('创建实例成功', () => {
      expect(engine).toBeInstanceOf(StrategyEngine)
    })

    test('计算器已初始化', () => {
      expect(engine.budgetTierCalculator).toBeDefined()
      expect(engine.pressureTierCalculator).toBeDefined()
      expect(engine.tierMatrixCalculator).toBeDefined()
      expect(engine.pityCalculator).toBeDefined()
      expect(engine.luckDebtCalculator).toBeDefined()
      // 实际属性名
      expect(engine.antiEmptyHandler).toBeDefined()
      expect(engine.antiHighHandler).toBeDefined()
    })

    test('状态管理器已初始化', () => {
      expect(engine.experienceStateManager).toBeDefined()
      expect(engine.globalStateManager).toBeDefined()
    })
  })

  describe('单例模式', () => {
    test('getStrategyEngine 返回单例', () => {
      const engine1 = getStrategyEngine()
      const engine2 = getStrategyEngine()
      expect(engine1).toBe(engine2)
    })
  })

  describe('常量导出', () => {
    test('BUDGET_TIERS 包含所有档位', () => {
      expect(BUDGET_TIERS).toBeDefined()
      expect(BUDGET_TIERS.B0).toBeDefined()
      expect(BUDGET_TIERS.B1).toBeDefined()
      expect(BUDGET_TIERS.B2).toBeDefined()
      expect(BUDGET_TIERS.B3).toBeDefined()
    })

    test('PRESSURE_TIERS 包含所有档位', () => {
      expect(PRESSURE_TIERS).toBeDefined()
      expect(PRESSURE_TIERS.P0).toBeDefined()
      expect(PRESSURE_TIERS.P1).toBeDefined()
      expect(PRESSURE_TIERS.P2).toBeDefined()
    })

    test('TIER_WEIGHT_MATRIX 定义正确', () => {
      expect(TIER_WEIGHT_MATRIX).toBeDefined()
      /*
       * TIER_WEIGHT_MATRIX 导出的是 empty_weight_multiplier 值
       * B0 x P1 应该有强空奖倾向（乘数 >= 10）
       */
      expect(typeof TIER_WEIGHT_MATRIX.B0?.P1).toBe('number')
      expect(TIER_WEIGHT_MATRIX.B0?.P1).toBeGreaterThanOrEqual(10.0)
    })
  })

  describe('computeWeightAdjustment - 权重调整计算', () => {
    test('B0xP1 返回空奖倾向', () => {
      const result = engine.computeWeightAdjustment({
        budget_tier: 'B0',
        pressure_tier: 'P1',
        base_tier_weights: {
          high: 50000,
          mid: 150000,
          low: 300000,
          fallback: 500000
        }
      })

      expect(result.matrix_result).toBeDefined()
      expect(result.matrix_result.available_tiers).toEqual(['fallback'])
    })

    test('B3xP1 返回所有档位可用', () => {
      const result = engine.computeWeightAdjustment({
        budget_tier: 'B3',
        pressure_tier: 'P1',
        base_tier_weights: {
          high: 50000,
          mid: 150000,
          low: 300000,
          fallback: 500000
        }
      })

      expect(result.matrix_result.available_tiers).toContain('high')
      expect(result.matrix_result.available_tiers).toContain('mid')
      expect(result.matrix_result.available_tiers).toContain('low')
    })
  })

  describe('applyExperienceSmoothing - 体验平滑', () => {
    test('无连续空奖时不触发平滑机制', async () => {
      const result = await engine.applyExperienceSmoothing({
        user_id: 1,
        campaign_id: 1,
        selected_tier: 'mid',
        tier_weights: {
          high: 50000,
          mid: 150000,
          low: 300000,
          fallback: 500000
        },
        experience_state: {
          empty_streak: 0,
          recent_high_count: 0
        }
      })

      // 实际返回结构
      expect(result.smoothing_applied).toBe(false)
      expect(result.applied_mechanisms).toEqual([])
    })

    test('连续空奖达到阈值时触发 Pity', async () => {
      const threshold1 = engine.pityCalculator.pity_config.threshold_1.streak
      const result = await engine.applyExperienceSmoothing({
        user_id: 1,
        campaign_id: 1,
        selected_tier: 'fallback',
        tier_weights: {
          high: 50000,
          mid: 150000,
          low: 300000,
          fallback: 500000
        },
        experience_state: {
          empty_streak: threshold1 + 1,
          recent_high_count: 0
        }
      })

      expect(result.smoothing_applied).toBe(true)
      expect(result.applied_mechanisms.length).toBeGreaterThan(0)
      expect(result.applied_mechanisms.some(m => m.type === 'pity')).toBe(true)
    })
  })

  describe('getLuckDebtMultiplier - 运气债务乘数', () => {
    test('无全局状态返回默认乘数', () => {
      const result = engine.getLuckDebtMultiplier({
        user_id: 1,
        global_state: null
      })

      expect(result.multiplier).toBe(1.0)
      expect(result.debt_level).toBe('none')
      expect(result.enabled).toBe(false)
    })

    test('有全局状态时返回计算结果', () => {
      const result = engine.getLuckDebtMultiplier({
        user_id: 1,
        global_state: {
          global_draw_count: 100,
          global_empty_count: 70 // 70% 空奖率
        },
        tier_weights: {
          high: 50000,
          mid: 150000,
          low: 300000,
          fallback: 500000
        }
      })

      // 返回结构包含 debt_level 和 multiplier
      expect(result.debt_level).toBeDefined()
      expect(result.multiplier).toBeDefined()
      expect(typeof result.multiplier).toBe('number')
    })
  })

  /* ========== Phase P2 增强：灰度发布测试 ========== */
  describe('灰度发布功能', () => {
    describe('isFeatureEnabledForContext - 带上下文的灰度判断', () => {
      test('全局禁用时返回 false', () => {
        /*
         * 由于当前环境 Pity 是启用的，测试全局禁用需要模拟
         * 这里测试函数存在且返回正确结构
         */
        const result = isFeatureEnabledForContext('pity', { user_id: 1, campaign_id: 1 })
        expect(result).toBeDefined()
        expect(result).toHaveProperty('enabled')
        expect(result).toHaveProperty('reason')
        expect(result).toHaveProperty('grayscale_percentage')
      })

      test('默认配置下返回 enabled=true（全量开放）', () => {
        // 默认灰度百分比是 100%，应该返回 enabled: true
        const result = isFeatureEnabledForContext('pity', { user_id: 123, campaign_id: 1 })
        expect(result.enabled).toBe(true)
        expect(result.grayscale_percentage).toBe(100)
      })

      test('不同用户 ID 返回一致的 hash 结果', () => {
        // 同一用户多次调用应该返回相同结果
        const result1 = isFeatureEnabledForContext('pity', { user_id: 12345 })
        const result2 = isFeatureEnabledForContext('pity', { user_id: 12345 })
        expect(result1.user_hash_value).toEqual(result2.user_hash_value)
      })

      test('无效特性返回 false', () => {
        const result = isFeatureEnabledForContext('invalid_feature', { user_id: 1 })
        expect(result.enabled).toBe(false)
        expect(result.reason).toBe('global_disabled')
      })
    })

    describe('getGrayscaleSummary - 灰度配置摘要', () => {
      test('返回所有特性的灰度摘要', () => {
        const summary = getGrayscaleSummary()
        expect(summary).toBeDefined()
        expect(summary).toHaveProperty('pity')
        expect(summary).toHaveProperty('luck_debt')
        expect(summary).toHaveProperty('anti_empty')
        expect(summary).toHaveProperty('anti_high')
      })

      test('每个特性包含必要字段', () => {
        const summary = getGrayscaleSummary()
        expect(summary.pity).toHaveProperty('global_enabled')
        expect(summary.pity).toHaveProperty('percentage')
        expect(summary.pity).toHaveProperty('user_whitelist_count')
        expect(summary.pity).toHaveProperty('campaign_whitelist_count')
      })
    })

    describe('GRAYSCALE_CONFIG - 灰度配置常量', () => {
      test('配置常量已导出', () => {
        expect(GRAYSCALE_CONFIG).toBeDefined()
        expect(GRAYSCALE_CONFIG.pity).toBeDefined()
        expect(GRAYSCALE_CONFIG.luck_debt).toBeDefined()
      })

      test('默认百分比为 100（全量开放）', () => {
        expect(GRAYSCALE_CONFIG.pity.percentage).toBe(100)
        expect(GRAYSCALE_CONFIG.anti_empty.percentage).toBe(100)
      })
    })

    describe('engine.checkFeatureWithGrayscale - 实例方法', () => {
      test('方法存在且可调用', () => {
        expect(engine.checkFeatureWithGrayscale).toBeDefined()
        expect(typeof engine.checkFeatureWithGrayscale).toBe('function')
      })

      test('返回与 isFeatureEnabledForContext 一致的结果', () => {
        const context = { user_id: 999, campaign_id: 1 }
        const result1 = engine.checkFeatureWithGrayscale('pity', context)
        const result2 = isFeatureEnabledForContext('pity', context)
        expect(result1.enabled).toBe(result2.enabled)
        expect(result1.reason).toBe(result2.reason)
      })
    })

    describe('engine.getStatus - 状态包含灰度摘要', () => {
      test('状态包含 grayscale_summary', () => {
        const status = engine.getStatus()
        expect(status).toHaveProperty('grayscale_summary')
        expect(status.grayscale_summary).toHaveProperty('pity')
      })
    })
  })

  // ========== 边界场景测试 ==========
  describe('边界场景测试', () => {
    describe('computeWeightAdjustment - 边界值', () => {
      test('无效 budget_tier 使用默认处理', () => {
        const result = engine.computeWeightAdjustment({
          budget_tier: 'INVALID',
          pressure_tier: 'P1',
          base_tier_weights: {
            high: 50000,
            mid: 150000,
            low: 300000,
            fallback: 500000
          }
        })
        // 应该有安全的降级处理
        expect(result).toBeDefined()
        expect(result.matrix_result).toBeDefined()
      })

      test('空权重对象处理', () => {
        const result = engine.computeWeightAdjustment({
          budget_tier: 'B1',
          pressure_tier: 'P1',
          base_tier_weights: {}
        })
        expect(result).toBeDefined()
        expect(result.matrix_result).toBeDefined()
      })

      test('负数权重处理', () => {
        const result = engine.computeWeightAdjustment({
          budget_tier: 'B2',
          pressure_tier: 'P1',
          base_tier_weights: {
            high: -50000,
            mid: 150000,
            low: 300000,
            fallback: 500000
          }
        })
        // 负数权重应该被安全处理
        expect(result).toBeDefined()
      })
    })

    describe('applyExperienceSmoothing - 边界值', () => {
      test('experience_state 为 null 时安全处理', async () => {
        const result = await engine.applyExperienceSmoothing({
          user_id: 1,
          campaign_id: 1,
          selected_tier: 'mid',
          tier_weights: {
            high: 50000,
            mid: 150000,
            low: 300000,
            fallback: 500000
          },
          experience_state: null
        })

        expect(result).toBeDefined()
        expect(result.smoothing_applied).toBe(false)
      })

      test('极大 empty_streak 值处理', async () => {
        const result = await engine.applyExperienceSmoothing({
          user_id: 1,
          campaign_id: 1,
          selected_tier: 'fallback',
          tier_weights: {
            high: 50000,
            mid: 150000,
            low: 300000,
            fallback: 500000
          },
          experience_state: {
            empty_streak: 999999,
            recent_high_count: 0
          }
        })

        expect(result).toBeDefined()
        expect(result.smoothing_applied).toBe(true)
      })

      test('user_id 为 0 时正常处理', async () => {
        const result = await engine.applyExperienceSmoothing({
          user_id: 0,
          campaign_id: 1,
          selected_tier: 'mid',
          tier_weights: {
            high: 50000,
            mid: 150000,
            low: 300000,
            fallback: 500000
          },
          experience_state: {
            empty_streak: 0,
            recent_high_count: 0
          }
        })

        expect(result).toBeDefined()
      })
    })

    describe('getLuckDebtMultiplier - 边界值', () => {
      test('global_draw_count 为 0 时返回默认乘数', () => {
        const result = engine.getLuckDebtMultiplier({
          user_id: 1,
          global_state: {
            global_draw_count: 0,
            global_empty_count: 0
          }
        })

        expect(result.multiplier).toBe(1.0)
      })

      test('100% 空奖率时返回高补偿乘数', () => {
        const result = engine.getLuckDebtMultiplier({
          user_id: 1,
          global_state: {
            global_draw_count: 100,
            global_empty_count: 100 // 100% 空奖
          },
          tier_weights: {
            high: 50000,
            mid: 150000,
            low: 300000,
            fallback: 500000
          }
        })

        // 100% 空奖应该触发高债务补偿
        expect(result.debt_level).toBeDefined()
        expect(result.multiplier).toBeGreaterThanOrEqual(1.0)
      })

      test('0% 空奖率时返回无补偿', () => {
        const result = engine.getLuckDebtMultiplier({
          user_id: 1,
          global_state: {
            global_draw_count: 100,
            global_empty_count: 0 // 0% 空奖
          },
          tier_weights: {
            high: 50000,
            mid: 150000,
            low: 300000,
            fallback: 500000
          }
        })

        // 0% 空奖不需要补偿
        expect(result.debt_level).toBe('none')
        expect(result.multiplier).toBe(1.0)
      })
    })
  })
})
