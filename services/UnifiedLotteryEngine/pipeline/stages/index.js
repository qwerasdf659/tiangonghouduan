'use strict'

/**
 * Pipeline Stages 索引文件
 *
 * 统一导出所有 Stage 类，用于 Pipeline 组装
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

// 基础阶段
const BaseStage = require('./BaseStage')
const LoadCampaignStage = require('./LoadCampaignStage')
const EligibilityStage = require('./EligibilityStage')

// 预算阶段
const BudgetContextStage = require('./BudgetContextStage')

// 奖品选择阶段
const BuildPrizePoolStage = require('./BuildPrizePoolStage')
const TierPickStage = require('./TierPickStage')
const PrizePickStage = require('./PrizePickStage')

// 保底和决策阶段
const GuaranteeStage = require('./GuaranteeStage')
const DecisionSnapshotStage = require('./DecisionSnapshotStage')

// 结算阶段（唯一写入点）
const SettleStage = require('./SettleStage')

// 预设发放专用阶段
const LoadPresetStage = require('./LoadPresetStage')
const PresetBudgetStage = require('./PresetBudgetStage')
const PresetSettleStage = require('./PresetSettleStage')

// 管理干预专用阶段
const LoadOverrideStage = require('./LoadOverrideStage')
const OverrideSettleStage = require('./OverrideSettleStage')

module.exports = {
  // 基础
  BaseStage,
  LoadCampaignStage,
  EligibilityStage,

  // 预算
  BudgetContextStage,

  // 奖品选择
  BuildPrizePoolStage,
  TierPickStage,
  PrizePickStage,

  // 保底和决策
  GuaranteeStage,
  DecisionSnapshotStage,

  // 结算
  SettleStage,

  // 预设发放专用
  LoadPresetStage,
  PresetBudgetStage,
  PresetSettleStage,

  // 管理干预专用
  LoadOverrideStage,
  OverrideSettleStage
}
