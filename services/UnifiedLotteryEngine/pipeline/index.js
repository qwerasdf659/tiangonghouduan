'use strict'

/**
 * Pipeline 模块索引文件
 *
 * 统一导出所有 Pipeline 相关类
 *
 * @module services/UnifiedLotteryEngine/pipeline
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

// 核心组件
const PipelineRunner = require('./PipelineRunner')
const DrawOrchestrator = require('./DrawOrchestrator')

// 三大管线
const NormalDrawPipeline = require('./NormalDrawPipeline')
const PresetAwardPipeline = require('./PresetAwardPipeline')
const OverridePipeline = require('./OverridePipeline')

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

  // 三大管线
  NormalDrawPipeline,
  PresetAwardPipeline,
  OverridePipeline,

  // 预算提供者
  BudgetProvider,
  UserBudgetProvider,
  PoolBudgetProvider,
  PoolQuotaBudgetProvider,
  BudgetProviderFactory,

  // Stage 组件
  stages
}
