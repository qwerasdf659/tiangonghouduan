/**
 * 广告定价服务
 *
 * 聚合三大定价机制的计算逻辑：
 * 1. DAU 系数定价：日价 = 基础价 × DAU 系数
 * 2. 动态竞价底价：底价 = 过去 N 天平均成交价 × 比例系数
 * 3. 阶梯折扣：连续投放天数越多折扣越大
 *
 * 配置数据存储在 system_settings 表中，通过 AdminSystemService 读取，
 * 支持运营在管理后台动态调整所有参数。
 *
 * @module services/AdPricingService
 */

'use strict'

const logger = require('../utils/logger').logger
const AdminSystemService = require('./AdminSystemService')
const { AdDauDailyStat, AdSlot, sequelize } = require('../models')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 广告定价服务类
 *
 * @class AdPricingService
 */
class AdPricingService {
  /**
   * 获取当前 DAU 系数
   *
   * 从 ad_dau_daily_stats 读取最新 DAU 数据，
   * 匹配 ad_dau_coefficient_tiers 配置中的档位。
   *
   * @returns {Promise<Object>} DAU 系数信息
   */
  static async getCurrentDauCoefficient() {
    const enabled = await AdminSystemService.getConfigValue('ad_dau_pricing_enabled', false)
    if (!enabled) {
      return { coefficient: 1.0, dau_count: 0, tier_label: '未启用', enabled: false }
    }

    const latestStat = await AdDauDailyStat.findOne({
      order: [['stat_date', 'DESC']]
    })

    if (!latestStat) {
      return { coefficient: 1.0, dau_count: 0, tier_label: '无数据', enabled: true }
    }

    const tiers = await AdminSystemService.getConfigValue('ad_dau_coefficient_tiers', [])
    const matched = AdPricingService._matchDauTier(latestStat.dau_count, tiers)

    return {
      coefficient: matched.coefficient,
      dau_count: latestStat.dau_count,
      tier_label: matched.label,
      stat_date: latestStat.stat_date,
      enabled: true
    }
  }

  /**
   * 计算广告位的动态竞价底价
   *
   * @param {string} slot_key - 广告位键
   * @returns {Promise<Object>} 底价计算结果
   */
  static async calculateDynamicFloorPrice(slot_key) {
    const config = await AdminSystemService.getConfigValue('ad_dynamic_floor_price_config', {
      enabled: false
    })

    if (!config.enabled) {
      return { floor_price: null, source: 'static', avg_price: null }
    }

    const lookbackDays = config.lookback_days || 7
    const floorRatio = config.floor_ratio || 0.5
    const fallbackPrices = config.fallback_prices || {}

    const startDate = BeijingTimeHelper.daysAgo(lookbackDays)

    const [results] = await sequelize.query(
      `SELECT AVG(amount_star_stone) as avg_price
       FROM ad_billing_records abr
       JOIN ad_campaigns ac ON abr.ad_campaign_id = ac.ad_campaign_id
       JOIN ad_slots s ON ac.ad_slot_id = s.ad_slot_id
       WHERE s.slot_key = ?
         AND abr.billing_type IN ('daily_deduct', 'deduct')
         AND abr.created_at >= ?`,
      { replacements: [slot_key, startDate] }
    )

    const avgPrice = results[0]?.avg_price ? parseFloat(results[0].avg_price) : null

    if (avgPrice !== null && avgPrice > 0) {
      const dynamicFloor = Math.ceil(avgPrice * floorRatio)
      return { floor_price: dynamicFloor, source: 'dynamic', avg_price: avgPrice }
    }

    const fallbackPrice = fallbackPrices[slot_key] || 0
    return { floor_price: fallbackPrice, source: 'fallback', avg_price: null }
  }

  /**
   * 计算连投阶梯折扣
   *
   * @param {number} consecutive_days - 连续投放天数
   * @returns {Promise<Object>} 折扣计算结果
   */
  static async calculateDiscount(consecutive_days) {
    const enabled = await AdminSystemService.getConfigValue('ad_discount_enabled', false)
    if (!enabled || consecutive_days <= 0) {
      return { discount: 1.0, tier_label: '无折扣', enabled }
    }

    const tiers = await AdminSystemService.getConfigValue('ad_consecutive_discount_tiers', [])
    if (!tiers.length) {
      return { discount: 1.0, tier_label: '无折扣规则', enabled: true }
    }

    const sorted = [...tiers].sort((a, b) => b.min_days - a.min_days)
    const matched = sorted.find(t => consecutive_days >= t.min_days)

    if (matched) {
      return { discount: matched.discount, tier_label: matched.label, enabled: true }
    }

    return { discount: 1.0, tier_label: '未达折扣门槛', enabled: true }
  }

  /**
   * 计算广告位最终日价（综合 DAU 系数 + 最低价下限 + 折扣）
   *
   * 按天模式完整公式：
   * total = max(基础价 × DAU系数, 最低日价) × 天数 × 阶梯折扣
   *
   * @param {number} ad_slot_id - 广告位ID
   * @param {number} days - 投放天数
   * @returns {Promise<Object>} 定价详情
   */
  static async calculateFinalDailyPrice(ad_slot_id, days = 1) {
    const slot = await AdSlot.findByPk(ad_slot_id)
    if (!slot) {
      throw new Error(`广告位不存在: ${ad_slot_id}`)
    }

    const basePrice = slot.daily_price_star_stone || 0
    const minDailyPrice = slot.min_daily_price_star_stone || 0

    const dauResult = await AdPricingService.getCurrentDauCoefficient()
    const adjustedPrice = Math.ceil(basePrice * dauResult.coefficient)
    const effectiveDailyPrice = Math.max(adjustedPrice, minDailyPrice)

    const discountResult = await AdPricingService.calculateDiscount(days)
    const totalPrice = Math.ceil(effectiveDailyPrice * days * discountResult.discount)

    return {
      ad_slot_id,
      slot_key: slot.slot_key,
      base_price: basePrice,
      dau_coefficient: dauResult.coefficient,
      adjusted_price: adjustedPrice,
      min_daily_price: minDailyPrice,
      effective_daily_price: effectiveDailyPrice,
      days,
      discount: discountResult.discount,
      discount_label: discountResult.tier_label,
      total_price: totalPrice,
      saved: effectiveDailyPrice * days - totalPrice
    }
  }

  /**
   * 批量更新所有竞价广告位的动态底价
   * 由定时任务每日凌晨调用
   *
   * @returns {Promise<Array>} 更新结果列表
   */
  static async updateAllDynamicFloorPrices() {
    const slots = await AdSlot.findAll({ where: { is_active: true } })
    const results = []

    for (const slot of slots) {
      if (slot.floor_price_override !== null) {
        results.push({
          slot_key: slot.slot_key,
          action: 'skipped',
          reason: 'floor_price_override is set'
        })
        continue
      }

      const priceResult = await AdPricingService.calculateDynamicFloorPrice(slot.slot_key)
      if (priceResult.floor_price !== null && priceResult.floor_price > 0) {
        await slot.update({ min_bid_star_stone: priceResult.floor_price })
        results.push({
          slot_key: slot.slot_key,
          action: 'updated',
          new_floor: priceResult.floor_price,
          source: priceResult.source
        })
      } else {
        results.push({ slot_key: slot.slot_key, action: 'unchanged' })
      }
    }

    logger.info('[AdPricingService] 动态底价批量更新完成', {
      total: slots.length,
      updated: results.filter(r => r.action === 'updated').length
    })
    return results
  }

  /**
   * 匹配 DAU 系数档位
   *
   * @param {number} dau - 日活用户数
   * @param {Array} tiers - 档位配置数组
   * @returns {Object} 匹配结果
   * @private
   */
  static _matchDauTier(dau, tiers) {
    if (!tiers || !tiers.length) {
      return { coefficient: 1.0, label: '无配置' }
    }

    const sorted = [...tiers].sort((a, b) => (a.max_dau || Infinity) - (b.max_dau || Infinity))

    for (const tier of sorted) {
      if (tier.max_dau === null || dau <= tier.max_dau) {
        return { coefficient: tier.coefficient, label: tier.label }
      }
    }

    const last = sorted[sorted.length - 1]
    return { coefficient: last.coefficient, label: last.label }
  }
}

module.exports = AdPricingService
