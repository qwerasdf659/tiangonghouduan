'use strict'

/**
 * Pipeline Stages 索引文件
 *
 * 统一导出所有 Stage 类，用于 Pipeline 组装
 *
 * ⚠️ V4.6 Phase 5 重构（2026-01-19）：
 * - 已归档：LoadPresetStage, PresetBudgetStage, PresetSettleStage
 * - 已归档：LoadOverrideStage, OverrideSettleStage
 * - 新增：LoadDecisionSourceStage（统一决策来源判断）
 * - 已删除：QuotaDeductStage（功能与 SettleStage._updateUserQuota 重复）
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 * @updated 2026-01-19 Phase 5 统一管线合并
 */

// 基础阶段
const BaseStage = require('./BaseStage')
const LoadCampaignStage = require('./LoadCampaignStage')
const EligibilityStage = require('./EligibilityStage')

// 决策来源阶段（Phase 5 新增：统一判断 normal/preset/override）
const LoadDecisionSourceStage = require('./LoadDecisionSourceStage')

// 预算阶段
const BudgetContextStage = require('./BudgetContextStage')

// 定价阶段
const PricingStage = require('./PricingStage')

// 奖品选择阶段
const BuildPrizePoolStage = require('./BuildPrizePoolStage')
const TierPickStage = require('./TierPickStage')
const PrizePickStage = require('./PrizePickStage')

// 保底和决策阶段
const GuaranteeStage = require('./GuaranteeStage')
const DecisionSnapshotStage = require('./DecisionSnapshotStage')

// 结算阶段（唯一写入点）
const SettleStage = require('./SettleStage')

module.exports = {
  // 基础
  BaseStage,
  LoadCampaignStage,
  EligibilityStage,

  // 决策来源（Phase 5：统一判断 normal/preset/override）
  LoadDecisionSourceStage,

  // 预算
  BudgetContextStage,

  // 定价
  PricingStage,

  // 奖品选择
  BuildPrizePoolStage,
  TierPickStage,
  PrizePickStage,

  // 保底和决策
  GuaranteeStage,
  DecisionSnapshotStage,

  // 结算
  SettleStage
}
