'use strict'

/**
 * 预算提供者模块索引
 *
 * 导出所有预算相关的类和工厂
 *
 * @module services/UnifiedLotteryEngine/pipeline/budget
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

const BudgetProvider = require('./BudgetProvider')
const UserBudgetProvider = require('./UserBudgetProvider')
const PoolBudgetProvider = require('./PoolBudgetProvider')
const PoolQuotaBudgetProvider = require('./PoolQuotaBudgetProvider')
const { BudgetProviderFactory, NoBudgetProvider, factory } = require('./BudgetProviderFactory')

module.exports = {
  // 基类
  BudgetProvider,

  // 三种实现
  UserBudgetProvider,
  PoolBudgetProvider,
  PoolQuotaBudgetProvider,

  // 空实现（无预算限制）
  NoBudgetProvider,

  // 工厂
  BudgetProviderFactory,

  // 工厂单例
  factory,

  // 预算模式常量
  BUDGET_MODES: BudgetProvider.MODES,

  // 配额初始化模式常量
  QUOTA_INIT_MODES: PoolQuotaBudgetProvider.QUOTA_INIT_MODES
}

