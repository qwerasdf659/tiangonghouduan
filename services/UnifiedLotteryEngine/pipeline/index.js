'use strict'

/**
 * Pipeline 模块索引文件
 *
 * 统一导出所有 Pipeline 相关类
 *
 * ⚠️ V4.6 Phase 5 重构（2026-01-19）：
 * - 已归档：PresetAwardPipeline, OverridePipeline（移至 _archived_phase5/）
 * - 统一使用 NormalDrawPipeline + LoadDecisionSourceStage 处理所有决策来源
 *
 * @module services/UnifiedLotteryEngine/pipeline
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 * @updated 2026-01-19 Phase 5 统一管线合并
 */

// 核心组件
const PipelineRunner = require('./PipelineRunner')
const DrawOrchestrator = require('./DrawOrchestrator')

// 统一管线（Phase 5：原 3 条管线合并为 1 条）
const NormalDrawPipeline = require('./NormalDrawPipeline')

// 预算提供者
const {
  BudgetProvider,
  UserBudgetProvider,
  PoolBudgetProvider,
  PoolQuotaBudgetProvider,
  BudgetProviderFactory
} = require('./budget')

// Stage 组件
const stages = require('./stages')

module.exports = {
  // 核心组件
  PipelineRunner,
  DrawOrchestrator,

  // 统一管线（Phase 5：原三条管线已合并）
  NormalDrawPipeline,

  // 预算提供者
  BudgetProvider,
  UserBudgetProvider,
  PoolBudgetProvider,
  PoolQuotaBudgetProvider,
  BudgetProviderFactory,

  // Stage 组件
  stages
}
