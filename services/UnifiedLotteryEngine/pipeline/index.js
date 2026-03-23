'use strict'

/**
 * Pipeline 模块索引文件
 *
 * 统一导出所有 Pipeline 相关类
 *
 *
 * @module services/UnifiedLotteryEngine/pipeline
 * @module services/UnifiedLotteryEngine/pipeline
 */

// 核心组件
const PipelineRunner = require('./PipelineRunner')
const DrawOrchestrator = require('./DrawOrchestrator')

// 统一管线（：原 3 条管线合并为 1 条）
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

  // 统一管线（：原三条管线已合并）
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
