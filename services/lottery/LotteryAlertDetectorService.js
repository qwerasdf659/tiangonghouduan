/**
 * @file 抽奖告警检测引擎 - 从 LotteryAlertService 拆分
 * @description 实时检测异常并创建告警
 *
 * 检测规则：
 * - RULE_001: 中奖率偏离告警
 * - RULE_002: 高档奖品发放过快
 * - RULE_003/004: 预算消耗预警/耗尽
 * - RULE_005: 库存不足告警
 * - RULE_006: 连续空奖异常
 *
 * @version 1.0.0
 * @date 2026-04-24
 */

'use strict'

const { Op, fn, col } = require('sequelize')
const {
  LotteryAlert,
  LotteryCampaign,
  LotteryDraw,
  LotteryPrize
} = require('../../models')
const logger = require('../../utils/logger').logger
const BeijingTimeHelper = require('../../utils/timeHelper')
const LotteryAlertService = require('./LotteryAlertService')

const ALERT_RULES = LotteryAlertService.getAlertRules()

/**
 * 抽奖告警检测服务
 * @description 实时检测抽奖活动异常并创建告警（中奖率偏离、预算消耗、库存不足等）
 */
class LotteryAlertDetectorService {
  /**
   * 运行告警检测规则（定时任务调用）
   * @param {number} [lottery_campaign_id] - 指定活动ID
   * @returns {Promise<Object>} 检测结果
   */
  static async runAlertDetection(lottery_campaign_id = null) {
    try {
      logger.info('开始运行告警检测', { lottery_campaign_id })

      const results = {
        checked_campaigns: 0,
        new_alerts: 0,
        auto_resolved: 0,
        rules_checked: Object.keys(ALERT_RULES).length
      }

      const campaigns = await LotteryCampaign.findAll({
        where: {
          status: 'active',
          ...(lottery_campaign_id ? { lottery_campaign_id } : {})
        }
      })
      results.checked_campaigns = campaigns.length

      for (const campaign of campaigns) {
        const inventoryAlerts = await LotteryAlertDetectorService.checkInventoryAlert(
          campaign.lottery_campaign_id
        )
        results.new_alerts += inventoryAlerts.length

        const budgetAlerts = await LotteryAlertDetectorService.checkBudgetAlert(
          campaign.lottery_campaign_id
        )
        results.new_alerts += budgetAlerts.length

        const winRateAlerts = await LotteryAlertDetectorService.checkWinRateAlert(
          campaign.lottery_campaign_id
        )
        results.new_alerts += winRateAlerts.length

        const highTierAlerts = await LotteryAlertDetectorService.checkHighTierSpeedAlert(
          campaign.lottery_campaign_id
        )
        results.new_alerts += highTierAlerts.length

        const emptyStreakAlerts = await LotteryAlertDetectorService.checkEmptyStreakAlert(
          campaign.lottery_campaign_id
        )
        results.new_alerts += emptyStreakAlerts.length
      }

      const autoResolved = await LotteryAlertDetectorService.autoResolveAlerts()
      results.auto_resolved = autoResolved

      logger.info('告警检测完成', results)

      return results
    } catch (error) {
      logger.error('告警检测失败:', error)
      throw error
    }
  }

  /**
   * 检测库存不足告警
   * @param {number} lottery_campaign_id - 活动ID
   * @returns {Promise<Array>} 创建的告警列表
   */
  static async checkInventoryAlert(lottery_campaign_id) {
    const rule = ALERT_RULES.INVENTORY_LOW
    const alerts = []

    try {
      const lowStockPrizes = await LotteryPrize.findAll({
        where: {
          lottery_campaign_id,
          status: 'active',
          remaining_stock: { [Op.lt]: rule.threshold_count }
        }
      })
      for (const prize of lowStockPrizes) {
        const alert = await LotteryAlertService.createAlert({
          lottery_campaign_id,
          alert_type: rule.alert_type,
          severity: rule.severity,
          rule_code: rule.rule_code,
          threshold_value: rule.threshold_count,
          actual_value: prize.remaining_stock,
          message: `奖品「${prize.prize_name}」库存不足，当前剩余: ${prize.remaining_stock}件`
        })

        if (alert && alert.isNewRecord !== false) {
          alerts.push(alert)
        }
      }

      return alerts
    } catch (error) {
      logger.error('检测库存告警失败:', error)
      return alerts
    }
  }

  /**
   * 检测预算消耗告警
   * @param {number} lottery_campaign_id - 活动ID
   * @returns {Promise<Array>} 创建的告警列表
   */
  static async checkBudgetAlert(lottery_campaign_id) {
    const alerts = []

    try {
      const campaign = await LotteryCampaign.findByPk(lottery_campaign_id)
      if (!campaign || !campaign.daily_budget_points) {
        return alerts
      }

      const budgetLimit = campaign.daily_budget_points
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayUsage =
        (await LotteryDraw.sum('cost_points', {
          where: {
            lottery_campaign_id,
            created_at: { [Op.gte]: today }
          }
        })) || 0

      const usageRatio = todayUsage / budgetLimit
      if (usageRatio >= ALERT_RULES.BUDGET_EXHAUSTED.threshold_percentage) {
        const alert = await LotteryAlertService.createAlert({
          lottery_campaign_id,
          alert_type: ALERT_RULES.BUDGET_EXHAUSTED.alert_type,
          severity: ALERT_RULES.BUDGET_EXHAUSTED.severity,
          rule_code: ALERT_RULES.BUDGET_EXHAUSTED.rule_code,
          threshold_value: budgetLimit,
          actual_value: todayUsage,
          message: `今日预算已耗尽，预算: ${budgetLimit}积分，已消耗: ${todayUsage}积分`
        })
        if (alert && alert.isNewRecord !== false) {
          alerts.push(alert)
        }
      } else if (usageRatio >= ALERT_RULES.BUDGET_WARNING.threshold_percentage) {
        const alert = await LotteryAlertService.createAlert({
          lottery_campaign_id,
          alert_type: ALERT_RULES.BUDGET_WARNING.alert_type,
          severity: ALERT_RULES.BUDGET_WARNING.severity,
          rule_code: ALERT_RULES.BUDGET_WARNING.rule_code,
          threshold_value: budgetLimit,
          actual_value: todayUsage,
          message: `今日预算消耗达到${(usageRatio * 100).toFixed(1)}%，预算: ${budgetLimit}积分，已消耗: ${todayUsage}积分`
        })
        if (alert && alert.isNewRecord !== false) {
          alerts.push(alert)
        }
      }

      return alerts
    } catch (error) {
      logger.error('检测预算告警失败:', error)
      return alerts
    }
  }

  /**
   * 检测中奖率异常告警（RULE_001）
   * @param {number} lottery_campaign_id - 活动ID
   * @returns {Promise<Array>} 创建的告警列表
   */
  static async checkWinRateAlert(lottery_campaign_id) {
    const rule = ALERT_RULES.WIN_RATE_ABNORMAL
    const alerts = []

    try {
      const campaign = await LotteryCampaign.findByPk(lottery_campaign_id)
      if (!campaign) {
        return alerts
      }
      const expectedWinRate = 1.0
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

      const totalDraws = await LotteryDraw.count({
        where: {
          lottery_campaign_id,
          created_at: { [Op.gte]: oneHourAgo }
        }
      })

      if (totalDraws < 10) {
        return alerts
      }

      const nonEmptyDraws = await LotteryDraw.count({
        where: {
          lottery_campaign_id,
          created_at: { [Op.gte]: oneHourAgo },
          lottery_prize_id: { [Op.not]: null }
        }
      })
      const actualWinRate = nonEmptyDraws / totalDraws
      const deviation = Math.abs(actualWinRate - expectedWinRate) / expectedWinRate

      if (deviation > rule.threshold_deviation) {
        const alert = await LotteryAlertService.createAlert({
          lottery_campaign_id,
          alert_type: rule.alert_type,
          severity: rule.severity,
          rule_code: rule.rule_code,
          threshold_value: expectedWinRate * 100,
          actual_value: actualWinRate * 100,
          message: `中奖率偏离告警：预期${(expectedWinRate * 100).toFixed(1)}%，实际${(actualWinRate * 100).toFixed(1)}%，偏离${(deviation * 100).toFixed(1)}%（阈值${(rule.threshold_deviation * 100).toFixed(0)}%）`
        })
        if (alert && alert.isNewRecord !== false) {
          alerts.push(alert)
        }
      }

      return alerts
    } catch (error) {
      logger.error('检测中奖率告警失败:', error)
      return alerts
    }
  }

  /**
   * 检测高档奖品发放速度过快告警（RULE_002）
   * @param {number} lottery_campaign_id - 活动ID
   * @returns {Promise<Array>} 创建的告警列表
   */
  static async checkHighTierSpeedAlert(lottery_campaign_id) {
    const rule = ALERT_RULES.HIGH_TIER_FAST
    const alerts = []

    try {
      const campaign = await LotteryCampaign.findByPk(lottery_campaign_id)
      if (!campaign || !campaign.daily_budget_points) {
        return alerts
      }
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const highTierDraws = await LotteryDraw.findAll({
        where: {
          lottery_campaign_id,
          created_at: { [Op.gte]: today }
        },
        include: [
          {
            model: LotteryPrize,
            as: 'prize',
            where: { reward_tier: 'high' },
            required: true
          }
        ]
      })

      if (highTierDraws.length < 3) {
        return alerts
      }
      const highTierCost = highTierDraws.reduce((sum, draw) => {
        return sum + (draw.prize ? parseFloat(draw.prize.cost_points || 0) : 0)
      }, 0)

      const now = new Date()
      const hoursElapsed = (now.getTime() - today.getTime()) / (1000 * 60 * 60)
      const dayRatio = Math.min(hoursElapsed / 24, 1)

      const highTierBudgetRatio = 0.2
      const expectedHighTierBudget = campaign.daily_budget_points * highTierBudgetRatio * dayRatio
      if (
        expectedHighTierBudget > 0 &&
        highTierCost > expectedHighTierBudget * rule.threshold_multiplier
      ) {
        const speedRatio = highTierCost / expectedHighTierBudget
        const alert = await LotteryAlertService.createAlert({
          lottery_campaign_id,
          alert_type: rule.alert_type,
          severity: rule.severity,
          rule_code: rule.rule_code,
          threshold_value: expectedHighTierBudget,
          actual_value: highTierCost,
          message: `高档奖品发放过快：预期消耗${expectedHighTierBudget.toFixed(0)}积分，实际消耗${highTierCost.toFixed(0)}积分，发放速度为预期的${speedRatio.toFixed(1)}倍（阈值${rule.threshold_multiplier}倍）`
        })
        if (alert && alert.isNewRecord !== false) {
          alerts.push(alert)
        }
      }

      return alerts
    } catch (error) {
      logger.error('检测高档奖品速度告警失败:', error)
      return alerts
    }
  }

  /**
   * 检测连续空奖异常告警（RULE_006）
   * @param {number} lottery_campaign_id - 活动ID
   * @returns {Promise<Array>} 创建的告警列表
   */
  static async checkEmptyStreakAlert(lottery_campaign_id) {
    const rule = ALERT_RULES.CONSECUTIVE_EMPTY
    const alerts = []

    try {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)

      const totalUsersResult = await LotteryDraw.findAll({
        where: {
          lottery_campaign_id,
          created_at: { [Op.gte]: yesterday }
        },
        attributes: [[fn('DISTINCT', col('user_id')), 'user_id']],
        raw: true
      })
      const totalUsers = totalUsersResult.length

      if (totalUsers < 20) {
        return alerts
      }

      const emptyStreakQuery = `
        SELECT COUNT(DISTINCT user_id) as affected_users
        FROM (
          SELECT 
            user_id,
            @streak := IF(lottery_prize_id IS NULL AND @prev_user = user_id, @streak + 1, IF(lottery_prize_id IS NULL, 1, 0)) as empty_streak,
            @prev_user := user_id
          FROM lottery_draws
          CROSS JOIN (SELECT @streak := 0, @prev_user := 0) vars
          WHERE lottery_campaign_id = :lottery_campaign_id
            AND created_at >= :yesterday
          ORDER BY user_id, created_at
        ) as streaks
        WHERE empty_streak >= :threshold_streak
      `
      const [emptyStreakResult] = await LotteryDraw.sequelize.query(emptyStreakQuery, {
        replacements: {
          lottery_campaign_id,
          yesterday,
          threshold_streak: rule.threshold_streak
        },
        type: LotteryDraw.sequelize.QueryTypes.SELECT
      })

      const affectedUsers = parseInt(emptyStreakResult?.affected_users || 0, 10)
      const userRatio = affectedUsers / totalUsers
      if (userRatio > rule.threshold_user_ratio) {
        const alert = await LotteryAlertService.createAlert({
          lottery_campaign_id,
          alert_type: rule.alert_type,
          severity: rule.severity,
          rule_code: rule.rule_code,
          threshold_value: rule.threshold_user_ratio * 100,
          actual_value: userRatio * 100,
          message: `连续空奖异常：${affectedUsers}位用户（占比${(userRatio * 100).toFixed(1)}%）连续空奖≥${rule.threshold_streak}次（阈值${(rule.threshold_user_ratio * 100).toFixed(0)}%）`
        })
        if (alert && alert.isNewRecord !== false) {
          alerts.push(alert)
        }
      }

      return alerts
    } catch (error) {
      logger.error('检测连续空奖告警失败:', error)
      return alerts
    }
  }

  /**
   * 自动解除已恢复的告警
   * @returns {Promise<number>} 自动解除的告警数量
   */
  static async autoResolveAlerts() {
    try {
      const activeInventoryAlerts = await LotteryAlert.findAll({
        where: {
          alert_type: 'inventory',
          status: { [Op.ne]: 'resolved' }
        }
      })

      let resolvedCount = 0
      for (const alert of activeInventoryAlerts) {
        const prize = await LotteryPrize.findOne({
          where: {
            lottery_campaign_id: alert.lottery_campaign_id,
            remaining_stock: { [Op.lt]: ALERT_RULES.INVENTORY_LOW.threshold_count }
          }
        })

        if (!prize) {
          await alert.update({
            status: 'resolved',
            resolved_at: BeijingTimeHelper.createBeijingTime(),
            resolve_notes: '系统自动解除：库存已恢复正常'
          })
          resolvedCount++
        }
      }

      if (resolvedCount > 0) {
        logger.info('自动解除告警', { count: resolvedCount })
      }

      return resolvedCount
    } catch (error) {
      logger.error('自动解除告警失败:', error)
      return 0
    }
  }
}

module.exports = LotteryAlertDetectorService
