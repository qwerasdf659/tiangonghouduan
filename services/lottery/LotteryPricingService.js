'use strict'

/**
 * 🎰 抽奖定价服务 - 统一定价逻辑核心组件
 *
 * @description 提供抽奖定价计算的统一入口，消除 getDrawPricing 和 _getDrawPricing 重复逻辑
 * @module services/lottery/LotteryPricingService
 * @version 1.0.0
 * @date 2026-01-21
 *
 * 业务场景：
 * - execute_draw() 调用：扣除积分前获取定价
 * - PricingStage.execute() 调用：Pipeline 流程中计算定价
 * - 前端展示：获取各档位的价格信息
 *
 * 设计原则：
 * - **单一数据源**：定价配置统一从 lottery_campaign_pricing_config 表读取
 * - **严格模式**：配置缺失时报错阻断，不使用默认值兜底
 * - **活动可覆盖**：活动级 base_cost 覆盖全局 lottery_cost_points
 * - **缓存优化**：60秒短缓存 + 写后精准失效
 *
 * @author 统一抽奖架构
 * @since 2026
 */

const logger = require('../../utils/logger').logger
const { LotteryCampaignPricingConfig } = require('../../models')
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')
const AdminSystemService = require('../AdminSystemService')

/**
 * 抽奖定价服务类
 *
 * @description 提供抽奖定价计算的静态方法，作为 execute_draw 和 PricingStage 的公共依赖
 * @class LotteryPricingService
 */
class LotteryPricingService {
  /**
   * 获取抽奖定价配置
   *
   * @description 根据抽奖次数和活动ID，计算应扣除的积分数量
   *
   * 计算流程：
   * 1. 从缓存/数据库获取活动定价配置（lottery_campaign_pricing_config 表）
   * 2. 获取单抽成本（活动级 > 全局 system_settings）
   * 3. 获取折扣配置（draw_buttons 数组中匹配 count）
   * 4. 验证 draw_count 是否在启用的按钮列表中
   * 5. 计算 total_cost = base_cost × draw_count × discount
   *
   * @param {number} draw_count - 抽奖次数（1/3/5/10 等）
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} options - 可选参数
   * @param {Object} [options.transaction] - Sequelize 事务对象
   * @returns {Promise<Object>} 定价配置对象
   * @returns {number} return.total_cost - 总消耗积分（已计算折扣）
   * @returns {number} return.original_cost - 原始消耗积分（未折扣）
   * @returns {number} return.base_cost - 单抽基础成本
   * @returns {number} return.discount - 折扣率（0-1）
   * @returns {number} return.saved_points - 节省积分
   * @returns {number} return.draw_count - 抽奖次数
   * @returns {string} return.label - 显示名称（如 "10连抽(九折)"）
   * @returns {string} return.cost_source - 成本来源（'campaign' | 'global'）
   * @returns {string} return.pricing_source - 定价来源（'pricing_config_table'）
   *
   * @throws {Error} 活动定价配置缺失（MISSING_PRICING_CONFIG）
   * @throws {Error} 抽奖档位未启用（DRAW_COUNT_NOT_ENABLED）
   * @throws {Error} 单抽成本配置缺失（MISSING_BASE_COST_CONFIG）
   *
   * @example
   * // 基础调用
   * const pricing = await LotteryPricingService.getDrawPricing(10, 1)
   * console.log(pricing)
   * // {
   * //   total_cost: 900,
   * //   original_cost: 1000,
   * //   base_cost: 100,
   * //   discount: 0.9,
   * //   saved_points: 100,
   * //   draw_count: 10,
   * //   label: '10连抽(九折)',
   * //   cost_source: 'global',
   * //   pricing_source: 'pricing_config_table'
   * // }
   *
   * @example
   * // 事务中调用
   * const pricing = await LotteryPricingService.getDrawPricing(5, 1, { transaction })
   */
  static async getDrawPricing(draw_count, lottery_campaign_id, options = {}) {
    const { transaction } = options

    // ========== 步骤1：获取活动定价配置（优先缓存）==========
    let pricing_config = null
    let from_cache = false

    // 尝试从缓存读取
    const cached = await BusinessCacheHelper.getLotteryPricing(lottery_campaign_id)
    if (cached) {
      pricing_config = cached
      from_cache = true
      logger.debug('[定价服务] 缓存命中', { lottery_campaign_id })
    } else {
      // 缓存未命中，从数据库查询
      const db_config = await LotteryCampaignPricingConfig.getActivePricingConfig(
        lottery_campaign_id,
        {
          transaction
        }
      )

      if (!db_config) {
        // 🔴 严格模式：配置缺失时报错阻断
        const error = new Error(
          `活动 ${lottery_campaign_id} 定价配置缺失，请在 lottery_campaign_pricing_config 表中配置`
        )
        error.code = 'MISSING_PRICING_CONFIG'
        error.statusCode = 400
        throw error
      }

      pricing_config = db_config.pricing_config
      from_cache = false

      // 写入缓存（60秒 TTL）
      await BusinessCacheHelper.setLotteryPricing(lottery_campaign_id, pricing_config)
      logger.debug('[定价服务] 配置已缓存', { lottery_campaign_id, ttl: 60 })
    }

    // ========== 步骤2：获取单抽基础成本（活动级 > 全局）==========
    let base_cost = null
    let cost_source = 'global'

    // 优先从活动配置读取（活动可覆盖）
    if (pricing_config.base_cost && pricing_config.base_cost > 0) {
      base_cost = parseInt(pricing_config.base_cost, 10)
      cost_source = 'campaign'
      logger.debug('[定价服务] 使用活动级单抽成本', { lottery_campaign_id, base_cost })
    } else {
      // 活动未配置，回落全局配置
      try {
        base_cost = await AdminSystemService.getSettingValue(
          'points',
          'lottery_cost_points',
          null,
          {
            strict: true
          }
        )
        base_cost = parseInt(base_cost, 10)
        cost_source = 'global'
        logger.debug('[定价服务] 使用全局单抽成本', { base_cost })
      } catch (error) {
        // 🔴 严格模式：全局配置也缺失时报错
        const configError = new Error(
          '单抽成本配置缺失：活动未配置 base_cost，全局 lottery_cost_points 也未配置'
        )
        configError.code = 'MISSING_BASE_COST_CONFIG'
        configError.statusCode = 500
        throw configError
      }
    }

    // 验证 base_cost 有效性
    if (!base_cost || base_cost <= 0 || isNaN(base_cost)) {
      const error = new Error(`无效的单抽成本配置：${base_cost}，必须为正整数`)
      error.code = 'INVALID_BASE_COST'
      error.statusCode = 500
      throw error
    }

    // ========== 步骤3：获取折扣配置（从 draw_buttons 数组匹配）==========
    const draw_buttons = pricing_config.draw_buttons || []
    const matched_button = draw_buttons.find(
      btn => btn.count === draw_count && btn.enabled !== false
    )

    if (!matched_button) {
      // 🔴 严格模式：档位未启用时报错阻断
      const enabled_counts = draw_buttons.filter(btn => btn.enabled !== false).map(btn => btn.count)
      const error = new Error(
        `活动 ${lottery_campaign_id} 未启用 ${draw_count} 连抽档位，可选: ${enabled_counts.join(', ') || '无'}`
      )
      error.code = 'DRAW_COUNT_NOT_ENABLED'
      error.statusCode = 400
      error.details = { draw_count, enabled_counts }
      throw error
    }

    const discount = matched_button.discount || 1.0
    const label = matched_button.label || `${draw_count}连抽`

    // ========== 步骤4：计算定价 ==========
    const original_cost = base_cost * draw_count
    const total_cost = Math.floor(original_cost * discount)
    const saved_points = original_cost - total_cost

    // ========== 步骤5：记录日志并返回 ==========
    logger.info('[定价服务] 定价计算完成', {
      lottery_campaign_id,
      draw_count,
      base_cost,
      discount,
      original_cost,
      total_cost,
      saved_points,
      cost_source,
      from_cache
    })

    return {
      total_cost, // 总消耗积分（折后）
      original_cost, // 原始消耗积分（折前）
      base_cost, // 单抽基础成本
      per_draw: Math.floor(base_cost * discount), // 折后单抽成本
      discount, // 折扣率
      saved_points, // 节省积分
      draw_count, // 抽奖次数
      label, // 显示名称
      cost_source, // 成本来源：'campaign' | 'global'
      pricing_source: 'pricing_config_table' // 定价来源：固定为新表
    }
  }

  /**
   * 获取活动所有启用的抽奖按钮配置
   *
   * @description 获取活动配置中所有 enabled=true 的按钮，用于前端展示可选档位
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} options - 可选参数
   * @param {Object} [options.transaction] - Sequelize 事务对象
   * @returns {Promise<Array<Object>>} 启用的按钮数组
   * @returns {number} return[].count - 抽奖次数
   * @returns {number} return[].discount - 折扣率
   * @returns {string} return[].label - 显示名称
   * @returns {number} return[].sort_order - 排序权重
   *
   * @throws {Error} 活动定价配置缺失
   *
   * @example
   * const buttons = await LotteryPricingService.getEnabledDrawButtons(1)
   * // [
   * //   { count: 1, discount: 1.0, label: '单抽', sort_order: 1 },
   * //   { count: 3, discount: 1.0, label: '3连抽', sort_order: 3 },
   * //   { count: 10, discount: 0.9, label: '10连抽(九折)', sort_order: 10 }
   * // ]
   */
  static async getEnabledDrawButtons(lottery_campaign_id, options = {}) {
    const { transaction } = options

    // 尝试从缓存读取
    let pricing_config = await BusinessCacheHelper.getLotteryPricing(lottery_campaign_id)

    if (!pricing_config) {
      // 缓存未命中，从数据库查询
      const db_config = await LotteryCampaignPricingConfig.getActivePricingConfig(
        lottery_campaign_id,
        {
          transaction
        }
      )

      if (!db_config) {
        const error = new Error(`活动 ${lottery_campaign_id} 定价配置缺失`)
        error.code = 'MISSING_PRICING_CONFIG'
        error.statusCode = 400
        throw error
      }

      pricing_config = db_config.pricing_config

      // 写入缓存
      await BusinessCacheHelper.setLotteryPricing(lottery_campaign_id, pricing_config)
    }

    const draw_buttons = pricing_config.draw_buttons || []

    // 过滤启用的按钮并按 sort_order 排序
    return draw_buttons
      .filter(btn => btn.enabled !== false)
      .map(btn => ({
        count: btn.count,
        discount: btn.discount || 1.0,
        label: btn.label || `${btn.count}连抽`,
        sort_order: btn.sort_order || btn.count
      }))
      .sort((a, b) => a.sort_order - b.sort_order)
  }

  /**
   * 获取活动启用的抽奖次数列表
   *
   * @description 获取活动配置中所有启用按钮的 count 值数组
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} options - 可选参数
   * @returns {Promise<Array<number>>} 启用的抽奖次数数组
   *
   * @example
   * const counts = await LotteryPricingService.getEnabledDrawCounts(1)
   * // [1, 3, 5, 10]
   */
  static async getEnabledDrawCounts(lottery_campaign_id, options = {}) {
    const buttons = await this.getEnabledDrawButtons(lottery_campaign_id, options)
    return buttons.map(btn => btn.count)
  }

  /**
   * 批量获取多个档位的定价配置
   *
   * @description 一次性计算多个档位的定价，用于前端展示所有档位价格
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} options - 可选参数
   * @returns {Promise<Array<Object>>} 所有启用档位的定价数组
   *
   * @example
   * const prices = await LotteryPricingService.getAllDrawPricings(1)
   * // [
   * //   { draw_count: 1, total_cost: 100, discount: 1.0, ... },
   * //   { draw_count: 10, total_cost: 900, discount: 0.9, ... }
   * // ]
   */
  static async getAllDrawPricings(lottery_campaign_id, options = {}) {
    const enabled_counts = await this.getEnabledDrawCounts(lottery_campaign_id, options)

    // 使用 Promise.allSettled 并行获取所有档位定价（避免循环中的 await）
    const pricing_promises = enabled_counts.map(count =>
      this.getDrawPricing(count, lottery_campaign_id, options)
        .then(pricing => ({ status: 'fulfilled', value: pricing, count }))
        .catch(error => {
          logger.warn('[定价服务] 获取档位定价失败', {
            lottery_campaign_id,
            draw_count: count,
            error: error.message
          })
          return { status: 'rejected', reason: error, count }
        })
    )

    const results = await Promise.all(pricing_promises)

    // 过滤成功的结果
    return results.filter(result => result.status === 'fulfilled').map(result => result.value)
  }

  /**
   * 失效活动定价配置缓存
   *
   * @description 配置变更后调用，实现写后精准失效
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {string} reason - 失效原因（用于日志）
   * @returns {Promise<boolean>} 是否失效成功
   *
   * @example
   * // 运营后台修改定价配置后
   * await LotteryPricingService.invalidateCache(1, 'admin_updated_pricing')
   */
  static async invalidateCache(lottery_campaign_id, reason = 'pricing_updated') {
    const result = await BusinessCacheHelper.invalidateLotteryPricing(lottery_campaign_id, reason)
    logger.info('[定价服务] 缓存已失效', { lottery_campaign_id, reason, success: result })
    return result
  }
}

module.exports = LotteryPricingService
