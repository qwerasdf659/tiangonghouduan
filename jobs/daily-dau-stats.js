/**
 * DAU 每日统计定时任务
 *
 * 每日 00:30 执行，统计前一天的日活用户数（基于 users.last_active_at），
 * 匹配 DAU 系数档位后写入 ad_dau_daily_stats 表。
 *
 * 数据用途：
 * - 广告定价 DAU 系数机制的数据源
 * - 管理后台 DAU 趋势图展示
 * - 分阶段调价触发器的判断依据
 *
 * @module jobs/daily-dau-stats
 */

'use strict'

const logger = require('../utils/logger').logger
const { sequelize, AdDauDailyStat } = require('../models')
const SystemConfigService = require('../services/SystemConfigService')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 统计指定日期的 DAU
 *
 * @param {string} targetDate - 目标日期（YYYY-MM-DD 格式）
 * @returns {Promise<Object>} 统计结果
 */
async function computeDailyDau(targetDate) {
  const parts = targetDate.split('-')
  const nextDayObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]) + 1)
  const nextDate = [
    nextDayObj.getFullYear(),
    String(nextDayObj.getMonth() + 1).padStart(2, '0'),
    String(nextDayObj.getDate()).padStart(2, '0')
  ].join('-')

  const [results] = await sequelize.query(
    `SELECT COUNT(DISTINCT user_id) as dau_count
     FROM users
     WHERE last_active_at >= ? AND last_active_at < ?
       AND status = 'active'`,
    { replacements: [targetDate, nextDate] }
  )

  const dauCount = parseInt(results[0]?.dau_count || 0)

  const tiers = await SystemConfigService.getValue('ad_dau_coefficient_tiers', [])
  const coefficient = matchDauTier(dauCount, tiers)

  return { dau_count: dauCount, dau_coefficient: coefficient }
}

/**
 * 匹配 DAU 系数档位
 *
 * @param {number} dau - 日活用户数
 * @param {Array} tiers - 系数档位配置
 * @returns {number} 对应的系数值
 */
function matchDauTier(dau, tiers) {
  if (!tiers || !tiers.length) return 1.0

  const sorted = [...tiers].sort((a, b) => (a.max_dau || Infinity) - (b.max_dau || Infinity))

  for (const tier of sorted) {
    if (tier.max_dau === null || dau <= tier.max_dau) {
      return tier.coefficient
    }
  }

  return sorted[sorted.length - 1].coefficient
}

/**
 * 执行 DAU 每日统计（定时任务入口）
 *
 * 幂等设计：同一日期重复执行会更新已有记录而非创建重复。
 *
 * @returns {Promise<Object>} 执行结果
 */
async function runDailyDauStats() {
  const yesterday = BeijingTimeHelper.daysAgo(1)
  const statDate =
    typeof yesterday === 'string'
      ? yesterday.substring(0, 10)
      : new Date(yesterday).toISOString().substring(0, 10)

  logger.info('[DAU统计] 开始统计', { stat_date: statDate })

  try {
    const { dau_count, dau_coefficient } = await computeDailyDau(statDate)

    const [record, created] = await AdDauDailyStat.findOrCreate({
      where: { stat_date: statDate },
      defaults: {
        dau_count,
        dau_coefficient,
        source: 'last_active_at',
        created_at: new Date()
      }
    })

    if (!created) {
      await record.update({ dau_count, dau_coefficient })
    }

    logger.info('[DAU统计] 完成', {
      stat_date: statDate,
      dau_count,
      dau_coefficient,
      is_new: created
    })

    return { stat_date: statDate, dau_count, dau_coefficient, created }
  } catch (error) {
    logger.error('[DAU统计] 失败', { stat_date: statDate, error: error.message })
    throw error
  }
}

module.exports = { runDailyDauStats, computeDailyDau }
