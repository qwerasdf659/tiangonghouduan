'use strict'

/** 权重刻度（与引擎一致：1,000,000 = 100%） */
const WEIGHT_SCALE = 1000000

/** 档位固定遍历顺序 */
const TIER_ORDER = ['high', 'mid', 'low', 'fallback']

/** high 档位概率硬上限 */
const HIGH_TIER_MAX_RATIO = 0.08

/**
 * 风险评估阈值
 */
const RISK_THRESHOLDS = {
  high_tier: { yellow: 0.05, red: 0.08 },
  empty_rate: { yellow: 0.3, red: 0.5 },
  budget_depletion_days: { yellow: 30, red: 7 },
  prize_cost_rate: { yellow: 0.5, red: 0.8 }
}

module.exports = {
  WEIGHT_SCALE,
  TIER_ORDER,
  HIGH_TIER_MAX_RATIO,
  RISK_THRESHOLDS
}
