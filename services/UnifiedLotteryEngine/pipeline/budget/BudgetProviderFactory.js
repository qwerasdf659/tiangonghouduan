'use strict'

/**
 * BudgetProviderFactory - 预算提供者工厂
 *
 * 职责：
 * 1. 根据活动配置创建合适的 BudgetProvider 实例
 * 2. 管理 BudgetProvider 的缓存（可选）
 * 3. 提供统一的 BudgetProvider 获取入口
 *
 * @module services/UnifiedLotteryEngine/pipeline/budget/BudgetProviderFactory
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

const BudgetProvider = require('./BudgetProvider')
const UserBudgetProvider = require('./UserBudgetProvider')
const PoolBudgetProvider = require('./PoolBudgetProvider')
const PoolQuotaBudgetProvider = require('./PoolQuotaBudgetProvider')
const { logger } = require('../../../../utils/logger')

/**
 * 预算提供者工厂
 */
class BudgetProviderFactory {
  /**
   * 创建工厂实例
   *
   * @param {Object} options - 配置选项
   * @param {boolean} options.enable_cache - 是否启用缓存（默认false）
   */
  constructor(options = {}) {
    this.options = {
      enable_cache: false,
      ...options
    }
    this.cache = new Map()
  }

  /**
   * 根据活动配置创建 BudgetProvider
   *
   * @param {Object} campaign - 活动配置
   * @param {string} campaign.budget_mode - 预算模式（user/pool/pool_quota/none）
   * @param {Array} campaign.allowed_campaign_ids - 允许的活动ID列表（user模式）
   * @param {string} campaign.quota_init_mode - 配额初始化模式（pool_quota模式）
   * @param {number} campaign.default_quota - 默认配额（pool_quota模式）
   * @param {Object} options - 额外选项
   * @returns {BudgetProvider} BudgetProvider 实例
   */
  create(campaign, options = {}) {
    const budget_mode = campaign.budget_mode || BudgetProvider.MODES.NONE

    // 检查缓存
    if (this.options.enable_cache) {
      const cache_key = `${campaign.campaign_id}_${budget_mode}`
      if (this.cache.has(cache_key)) {
        return this.cache.get(cache_key)
      }
    }

    // 创建 BudgetProvider
    let provider

    switch (budget_mode) {
      case BudgetProvider.MODES.USER:
        provider = new UserBudgetProvider({
          allowed_campaign_ids: campaign.allowed_campaign_ids
            ? JSON.parse(campaign.allowed_campaign_ids)
            : null,
          ...options
        })
        break

      case BudgetProvider.MODES.POOL:
        provider = new PoolBudgetProvider({
          use_reserved_pool: campaign.reserved_pool_remaining !== null,
          whitelist_user_ids: options.whitelist_user_ids || [],
          ...options
        })
        break

      case BudgetProvider.MODES.POOL_QUOTA:
        provider = new PoolQuotaBudgetProvider({
          quota_init_mode: campaign.quota_init_mode || 'on_demand',
          default_quota: parseFloat(campaign.default_quota || 0),
          ...options
        })
        break

      case BudgetProvider.MODES.NONE:
      default:
        // 无预算限制模式：返回一个空实现
        provider = new NoBudgetProvider()
        break
    }

    // 缓存
    if (this.options.enable_cache && campaign.campaign_id) {
      const cache_key = `${campaign.campaign_id}_${budget_mode}`
      this.cache.set(cache_key, provider)
    }

    this._log('debug', '创建 BudgetProvider', {
      campaign_id: campaign.campaign_id,
      budget_mode: budget_mode,
      provider_type: provider.constructor.name
    })

    return provider
  }

  /**
   * 根据预算模式创建 BudgetProvider（简化版）
   *
   * @param {string} budget_mode - 预算模式
   * @param {Object} options - 配置选项
   * @returns {BudgetProvider} BudgetProvider 实例
   */
  createByMode(budget_mode, options = {}) {
    switch (budget_mode) {
      case BudgetProvider.MODES.USER:
        return new UserBudgetProvider(options)

      case BudgetProvider.MODES.POOL:
        return new PoolBudgetProvider(options)

      case BudgetProvider.MODES.POOL_QUOTA:
        return new PoolQuotaBudgetProvider(options)

      case BudgetProvider.MODES.NONE:
      default:
        return new NoBudgetProvider()
    }
  }

  /**
   * 清除缓存
   *
   * @param {number} campaign_id - 活动ID（可选，不传则清除所有）
   */
  clearCache(campaign_id = null) {
    if (campaign_id) {
      // 清除指定活动的缓存
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${campaign_id}_`)) {
          this.cache.delete(key)
        }
      }
    } else {
      // 清除所有缓存
      this.cache.clear()
    }
  }

  /**
   * 记录日志
   *
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   * @private
   */
  _log(level, message, data = {}) {
    const log_data = {
      component: 'BudgetProviderFactory',
      ...data
    }

    if (logger && typeof logger[level] === 'function') {
      logger[level](`[BudgetProviderFactory] ${message}`, log_data)
    }
  }
}

/**
 * 无预算限制提供者（空实现）
 */
class NoBudgetProvider extends BudgetProvider {
  constructor() {
    super(BudgetProvider.MODES.NONE)
  }

  async getAvailableBudget(params, options = {}) {
    return {
      available: Infinity,
      details: { mode: 'none', unlimited: true }
    }
  }

  async checkBudget(params, options = {}) {
    return {
      sufficient: true,
      available: Infinity,
      required: params.amount,
      shortage: 0,
      details: { mode: 'none', unlimited: true }
    }
  }

  async deductBudget(params, options = {}) {
    return {
      success: true,
      deducted: params.amount,
      remaining: Infinity,
      details: { mode: 'none', no_deduction: true }
    }
  }

  async rollbackBudget(params, options = {}) {
    return {
      success: true,
      refunded: params.amount,
      new_balance: Infinity
    }
  }
}

// 导出工厂单例
const factory = new BudgetProviderFactory()

module.exports = {
  BudgetProviderFactory,
  NoBudgetProvider,
  factory
}

