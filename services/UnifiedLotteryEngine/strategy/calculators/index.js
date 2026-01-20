'use strict'

/**
 * 策略计算器模块入口文件
 *
 * 统一导出所有策略计算器类
 *
 * 计算器职责划分：
 * 1. BudgetTierCalculator - 预算分层计算（B0-B3）
 * 2. PressureTierCalculator - 活动压力分层计算（P0-P2）
 * 3. TierMatrixCalculator - BxPx 矩阵权重计算
 * 4. PityCalculator - Pity 系统（软保底 / 硬保底）
 * 5. LuckDebtCalculator - 运气债务计算
 * 6. AntiEmptyStreakHandler - 防空奖连击处理器
 * 7. AntiHighStreakHandler - 防高价值连击处理器
 *
 * 使用方式：
 * ```javascript
 * const { BudgetTierCalculator, PityCalculator } = require('./calculators')
 *
 * const calculator = new BudgetTierCalculator()
 * const result = await calculator.calculate(context)
 * ```
 *
 * @module services/UnifiedLotteryEngine/strategy/calculators
 * @author 抽奖模块策略重构 - Phase 3-6, 9-12
 * @since 2026-01-20
 */

const BudgetTierCalculator = require('./BudgetTierCalculator')
const PressureTierCalculator = require('./PressureTierCalculator')
const TierMatrixCalculator = require('./TierMatrixCalculator')
const PityCalculator = require('./PityCalculator')
const LuckDebtCalculator = require('./LuckDebtCalculator')
const AntiEmptyStreakHandler = require('./AntiEmptyStreakHandler')
const AntiHighStreakHandler = require('./AntiHighStreakHandler')

module.exports = {
  BudgetTierCalculator,
  PressureTierCalculator,
  TierMatrixCalculator,
  PityCalculator,
  LuckDebtCalculator,
  AntiEmptyStreakHandler,
  AntiHighStreakHandler
}
