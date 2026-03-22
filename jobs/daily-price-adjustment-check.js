/**
 * 调价触发定时任务
 *
 * 每日 02:00 执行，检查 DAU 是否连续 N 天处于新区间，
 * 如果是则生成调价建议记录，待运营确认后执行。
 *
 * 依赖 DAU 每日统计数据（ad_dau_daily_stats）和
 * 调价触发配置（system_settings.ad_price_adjustment_trigger）。
 *
 * @module jobs/daily-price-adjustment-check
 */

'use strict'

const logger = require('../utils/logger').logger
const { AdDauDailyStat, sequelize } = require('../models')
const AdminSystemService = require('../services/AdminSystemService')

/**
 * 检查 DAU 是否连续 N 天处于同一个新区间
 *
 * @returns {Promise<Object>} 检查结果
 */
async function checkPriceAdjustment() {
  const triggerConfig = await AdminSystemService.getConfigValue('ad_price_adjustment_trigger', {
    enabled: false
  })

  if (!triggerConfig.enabled) {
    logger.info('[调价检查] 调价触发器已禁用')
    return { triggered: false, reason: 'disabled' }
  }

  const consecutiveDays = triggerConfig.consecutive_days || 7

  const recentStats = await AdDauDailyStat.findAll({
    order: [['stat_date', 'DESC']],
    limit: consecutiveDays
  })

  if (recentStats.length < consecutiveDays) {
    logger.info('[调价检查] DAU 数据不足', {
      required: consecutiveDays,
      available: recentStats.length
    })
    return { triggered: false, reason: 'insufficient_data' }
  }

  const tiers = await AdminSystemService.getConfigValue('ad_dau_coefficient_tiers', [])
  if (!tiers.length) {
    return { triggered: false, reason: 'no_tiers_configured' }
  }

  const coefficients = recentStats.map(s => s.dau_coefficient)
  const allSame = coefficients.every(c => c === coefficients[0])

  if (!allSame) {
    logger.info('[调价检查] DAU 系数未连续稳定', { coefficients })
    return { triggered: false, reason: 'not_consecutive' }
  }

  const currentCoefficient = coefficients[0]

  const [existingPending] = await sequelize.query(
    "SELECT ad_price_adjustment_log_id FROM ad_price_adjustment_logs WHERE status = 'pending' AND new_coefficient = ? LIMIT 1",
    { replacements: [currentCoefficient] }
  )

  if (existingPending.length > 0) {
    logger.info('[调价检查] 已有待确认的调价建议', { coefficient: currentCoefficient })
    return { triggered: false, reason: 'already_pending' }
  }

  const [latestApplied] = await sequelize.query(
    "SELECT new_coefficient FROM ad_price_adjustment_logs WHERE status = 'applied' ORDER BY applied_at DESC LIMIT 1"
  )
  const previousCoefficient =
    latestApplied.length > 0 ? parseFloat(latestApplied[0].new_coefficient) : 1.0

  if (currentCoefficient === previousCoefficient) {
    return { triggered: false, reason: 'no_change' }
  }

  await sequelize.query(
    `INSERT INTO ad_price_adjustment_logs
      (trigger_type, old_coefficient, new_coefficient, affected_slots, status, created_at)
     VALUES ('dau_shift', ?, ?, ?, 'pending', NOW())`,
    {
      replacements: [
        previousCoefficient,
        currentCoefficient,
        JSON.stringify({ all_display_slots: true })
      ]
    }
  )

  logger.info('[调价检查] 生成调价建议', {
    old_coefficient: previousCoefficient,
    new_coefficient: currentCoefficient,
    consecutive_days: consecutiveDays
  })

  return {
    triggered: true,
    old_coefficient: previousCoefficient,
    new_coefficient: currentCoefficient,
    consecutive_days: consecutiveDays
  }
}

module.exports = { checkPriceAdjustment }
