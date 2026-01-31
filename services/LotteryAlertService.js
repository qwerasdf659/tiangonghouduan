/**
 * @file 抽奖告警服务 - 运营监控核心服务
 * @description 提供抽奖系统告警的检测、创建、查询和管理功能
 *
 * 业务职责：
 * - 检测和触发告警（基于规则引擎）
 * - 查询告警列表和详情
 * - 管理告警状态（确认、解决）
 * - 告警自动解除逻辑
 *
 * 告警类型：
 * - win_rate: 中奖率异常
 * - budget: 预算告警
 * - inventory: 库存告警
 * - user: 用户异常
 * - system: 系统告警
 *
 * 设计决策来源：需求文档 决策6（独立告警表）
 *
 * @version 1.0.0
 * @date 2026-01-29
 */

'use strict'

const { Op, fn, col } = require('sequelize')
const { LotteryAlert, LotteryCampaign, LotteryDraw, LotteryPrize, User } = require('../models')
const logger = require('../utils/logger').logger
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 告警规则配置
 * 定义各种告警类型的检测规则和触发条件
 */
const ALERT_RULES = {
  // 中奖率异常告警
  WIN_RATE_ABNORMAL: {
    rule_code: 'RULE_001',
    alert_type: 'win_rate',
    severity: 'warning',
    name: '中奖率偏离告警',
    description: '最近1小时中奖率偏离配置值±20%',
    threshold_deviation: 0.2 // 20%偏离阈值
  },
  // 高档奖品发放速度过快告警
  HIGH_TIER_FAST: {
    rule_code: 'RULE_002',
    alert_type: 'win_rate',
    severity: 'danger',
    name: '高档奖品发放过快',
    description: '高档奖品发放速度超过预算的1.5倍',
    threshold_multiplier: 1.5
  },
  // 预算预警告警
  BUDGET_WARNING: {
    rule_code: 'RULE_003',
    alert_type: 'budget',
    severity: 'warning',
    name: '预算消耗预警',
    description: '预算消耗达到90%',
    threshold_percentage: 0.9
  },
  // 预算耗尽告警
  BUDGET_EXHAUSTED: {
    rule_code: 'RULE_004',
    alert_type: 'budget',
    severity: 'danger',
    name: '预算已耗尽',
    description: '预算消耗达到100%',
    threshold_percentage: 1.0
  },
  // 库存不足告警
  INVENTORY_LOW: {
    rule_code: 'RULE_005',
    alert_type: 'inventory',
    severity: 'danger',
    name: '奖品库存不足',
    description: '任意奖品库存<10件',
    threshold_count: 10
  },
  // 连续空奖异常告警
  CONSECUTIVE_EMPTY: {
    rule_code: 'RULE_006',
    alert_type: 'user',
    severity: 'warning',
    name: '连续空奖率异常',
    description: '连续空奖≥10次的用户数占比超过5%',
    threshold_streak: 10,
    threshold_user_ratio: 0.05
  }
}

/**
 * 抽奖告警服务类
 * 提供告警的完整生命周期管理
 */
class LotteryAlertService {
  /**
   * 获取告警列表
   * 支持多种筛选条件
   *
   * @param {Object} params - 查询参数
   * @param {string} [params.level] - 告警级别 (info/warning/danger)
   * @param {string} [params.type] - 告警类型 (win_rate/budget/inventory/user/system)
   * @param {string} [params.status] - 告警状态 (active/acknowledged/resolved)
   * @param {number} [params.campaign_id] - 活动ID
   * @param {number} [params.limit=50] - 返回数量
   * @returns {Promise<Object>} 告警列表和统计信息
   */
  static async getAlertList(params = {}) {
    const { level, type, status, campaign_id, limit = 50 } = params

    try {
      // 构建查询条件
      const whereConditions = {}

      if (level) {
        whereConditions.severity = level
      }
      if (type) {
        whereConditions.alert_type = type
      }
      if (status) {
        whereConditions.status = status
      }
      if (campaign_id) {
        whereConditions.campaign_id = parseInt(campaign_id)
      }

      // 查询告警列表
      const alerts = await LotteryAlert.findAll({
        where: whereConditions,
        include: [
          {
            model: LotteryCampaign,
            as: 'campaign',
            attributes: ['campaign_id', 'campaign_name', 'campaign_code', 'status']
          },
          {
            model: User,
            as: 'resolver',
            attributes: ['user_id', 'nickname']
          }
        ],
        order: [
          ['severity', 'DESC'], // 严重程度降序（danger > warning > info）
          ['created_at', 'DESC'] // 创建时间降序
        ],
        limit: parseInt(limit)
      })

      // 统计各状态数量
      const statusCounts = await LotteryAlert.findAll({
        where: campaign_id ? { campaign_id: parseInt(campaign_id) } : {},
        attributes: ['status', [fn('COUNT', col('alert_id')), 'count']],
        group: ['status'],
        raw: true
      })

      const statusMap = statusCounts.reduce(
        (acc, item) => {
          acc[item.status] = parseInt(item.count)
          return acc
        },
        { active: 0, acknowledged: 0, resolved: 0 }
      )

      // 格式化告警数据
      const formattedAlerts = alerts.map(alert => ({
        alert_id: alert.alert_id,
        campaign_id: alert.campaign_id,
        campaign_name: alert.campaign?.campaign_name || '未知活动',
        campaign_code: alert.campaign?.campaign_code || null,
        alert_type: alert.alert_type,
        alert_type_name: LotteryAlertService.getAlertTypeName(alert.alert_type),
        severity: alert.severity,
        severity_name: LotteryAlertService.getSeverityName(alert.severity),
        status: alert.status,
        status_name: LotteryAlertService.getStatusName(alert.status),
        rule_code: alert.rule_code,
        threshold_value: alert.threshold_value ? parseFloat(alert.threshold_value) : null,
        actual_value: alert.actual_value ? parseFloat(alert.actual_value) : null,
        deviation_percentage: LotteryAlertService.calculateDeviation(
          alert.threshold_value,
          alert.actual_value
        ),
        message: alert.message,
        created_at: alert.created_at,
        resolved_at: alert.resolved_at,
        resolved_by: alert.resolved_by,
        resolver_name: alert.resolver?.nickname || null,
        resolve_notes: alert.resolve_notes
      }))

      const totalCount = statusMap.active + statusMap.acknowledged + statusMap.resolved

      logger.info('查询告警列表', {
        params,
        total: formattedAlerts.length,
        active_count: statusMap.active
      })

      return {
        total: totalCount,
        active_count: statusMap.active,
        acknowledged_count: statusMap.acknowledged,
        resolved_count: statusMap.resolved,
        alerts: formattedAlerts
      }
    } catch (error) {
      logger.error('查询告警列表失败:', error)
      throw error
    }
  }

  /**
   * 获取单个告警详情
   *
   * @param {number} alert_id - 告警ID
   * @returns {Promise<Object|null>} 告警详情
   */
  static async getAlertById(alert_id) {
    try {
      const alert = await LotteryAlert.findByPk(alert_id, {
        include: [
          {
            model: LotteryCampaign,
            as: 'campaign',
            attributes: ['campaign_id', 'campaign_name', 'campaign_code', 'status']
          },
          {
            model: User,
            as: 'resolver',
            attributes: ['user_id', 'nickname']
          }
        ]
      })

      if (!alert) {
        return null
      }

      return {
        alert_id: alert.alert_id,
        campaign_id: alert.campaign_id,
        campaign_name: alert.campaign?.campaign_name || '未知活动',
        alert_type: alert.alert_type,
        alert_type_name: LotteryAlertService.getAlertTypeName(alert.alert_type),
        severity: alert.severity,
        severity_name: LotteryAlertService.getSeverityName(alert.severity),
        status: alert.status,
        status_name: LotteryAlertService.getStatusName(alert.status),
        rule_code: alert.rule_code,
        threshold_value: alert.threshold_value ? parseFloat(alert.threshold_value) : null,
        actual_value: alert.actual_value ? parseFloat(alert.actual_value) : null,
        deviation_percentage: LotteryAlertService.calculateDeviation(
          alert.threshold_value,
          alert.actual_value
        ),
        message: alert.message,
        created_at: alert.created_at,
        updated_at: alert.updated_at,
        resolved_at: alert.resolved_at,
        resolved_by: alert.resolved_by,
        resolver_name: alert.resolver?.nickname || null,
        resolve_notes: alert.resolve_notes
      }
    } catch (error) {
      logger.error('获取告警详情失败:', error)
      throw error
    }
  }

  /**
   * 创建新告警
   * 支持告警去重（相同类型+活动+1小时内不重复触发）
   *
   * @param {Object} params - 告警参数
   * @param {number} params.campaign_id - 活动ID
   * @param {string} params.alert_type - 告警类型
   * @param {string} params.severity - 严重程度
   * @param {string} params.rule_code - 规则代码
   * @param {number} [params.threshold_value] - 阈值
   * @param {number} [params.actual_value] - 实际值
   * @param {string} params.message - 告警消息
   * @param {Object} [options] - 选项
   * @param {Object} [options.transaction] - 事务对象
   * @returns {Promise<Object>} 创建的告警
   */
  static async createAlert(params, options = {}) {
    const { campaign_id, alert_type, severity, rule_code, threshold_value, actual_value, message } =
      params
    const { transaction } = options

    try {
      // 告警去重：检查1小时内是否已有相同告警
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

      const existingAlert = await LotteryAlert.findOne({
        where: {
          campaign_id,
          alert_type,
          rule_code,
          status: { [Op.ne]: 'resolved' },
          created_at: { [Op.gte]: oneHourAgo }
        },
        transaction
      })

      if (existingAlert) {
        logger.info('告警已存在，跳过创建', {
          campaign_id,
          alert_type,
          rule_code,
          existing_alert_id: existingAlert.alert_id
        })
        return existingAlert
      }

      // 创建新告警
      const alert = await LotteryAlert.create(
        {
          campaign_id,
          alert_type,
          severity,
          rule_code,
          threshold_value,
          actual_value,
          message,
          status: 'active',
          created_at: BeijingTimeHelper.createBeijingTime()
        },
        { transaction }
      )

      logger.info('创建新告警', {
        alert_id: alert.alert_id,
        campaign_id,
        alert_type,
        severity,
        rule_code
      })

      /**
       * 推送告警到管理平台（P1修复 - 2026-01-30）
       * 使用 ChatWebSocketService 的告警推送方法
       * 异步推送，不阻塞主流程
       *
       * 🔧 循环依赖修复（2026-01-31）：
       * 使用 setImmediate 延迟加载 ChatWebSocketService
       * 避免静态分析工具检测到循环依赖
       */
      setImmediate(() => {
        try {
          const chatWebSocketService = require('./ChatWebSocketService').getInstance()
          if (chatWebSocketService && chatWebSocketService.io) {
            chatWebSocketService.pushAlertToAdmins({
              alert_id: alert.alert_id,
              alert_type,
              severity,
              message,
              campaign_id,
              rule_code,
              created_at: alert.created_at
            })
          }
        } catch (wsError) {
          // WebSocket推送失败不影响主流程
          logger.warn('告警WebSocket推送失败（非致命）', {
            alert_id: alert.alert_id,
            error: wsError.message
          })
        }
      })

      return alert
    } catch (error) {
      logger.error('创建告警失败:', error)
      throw error
    }
  }

  /**
   * 确认告警
   * 将告警状态从 active 更新为 acknowledged
   *
   * @param {number} alert_id - 告警ID
   * @param {number} operator_id - 操作人ID
   * @returns {Promise<Object>} 更新后的告警
   */
  static async acknowledgeAlert(alert_id, operator_id) {
    try {
      const alert = await LotteryAlert.findByPk(alert_id)

      if (!alert) {
        throw new Error(`告警不存在: alert_id=${alert_id}`)
      }

      if (alert.status === 'resolved') {
        throw new Error('告警已解决，无需确认')
      }

      await alert.update({
        status: 'acknowledged',
        resolved_by: operator_id
      })

      logger.info('确认告警', {
        alert_id,
        operator_id
      })

      return LotteryAlertService.getAlertById(alert_id)
    } catch (error) {
      logger.error('确认告警失败:', error)
      throw error
    }
  }

  /**
   * 解决告警
   * 将告警状态更新为 resolved
   *
   * @param {number} alert_id - 告警ID
   * @param {number} operator_id - 操作人ID
   * @param {string} [notes] - 处理备注
   * @returns {Promise<Object>} 更新后的告警
   */
  static async resolveAlert(alert_id, operator_id, notes = '') {
    try {
      const alert = await LotteryAlert.findByPk(alert_id)

      if (!alert) {
        throw new Error(`告警不存在: alert_id=${alert_id}`)
      }

      if (alert.status === 'resolved') {
        throw new Error('告警已解决')
      }

      await alert.update({
        status: 'resolved',
        resolved_at: BeijingTimeHelper.createBeijingTime(),
        resolved_by: operator_id,
        resolve_notes: notes
      })

      logger.info('解决告警', {
        alert_id,
        operator_id,
        notes
      })

      return LotteryAlertService.getAlertById(alert_id)
    } catch (error) {
      logger.error('解决告警失败:', error)
      throw error
    }
  }

  /**
   * 运行告警检测规则（定时任务调用）
   * 检测所有活动的告警状态
   *
   * @param {number} [campaign_id] - 指定活动ID（可选，不指定则检测所有活动）
   * @returns {Promise<Object>} 检测结果
   */
  static async runAlertDetection(campaign_id = null) {
    try {
      logger.info('开始运行告警检测', { campaign_id })

      const results = {
        checked_campaigns: 0,
        new_alerts: 0,
        auto_resolved: 0,
        rules_checked: Object.keys(ALERT_RULES).length
      }

      // 获取需要检测的活动
      const campaigns = await LotteryCampaign.findAll({
        where: {
          status: 'active',
          ...(campaign_id ? { campaign_id } : {})
        }
      })

      results.checked_campaigns = campaigns.length

      // 对每个活动运行检测规则
      for (const campaign of campaigns) {
        // 检测库存不足
        const inventoryAlerts = await LotteryAlertService.checkInventoryAlert(campaign.campaign_id)
        results.new_alerts += inventoryAlerts.length

        // 检测预算消耗
        const budgetAlerts = await LotteryAlertService.checkBudgetAlert(campaign.campaign_id)
        results.new_alerts += budgetAlerts.length

        // 检测中奖率异常（RULE_001）
        const winRateAlerts = await LotteryAlertService.checkWinRateAlert(campaign.campaign_id)
        results.new_alerts += winRateAlerts.length

        // 检测高档奖品发放过快（RULE_002）
        const highTierAlerts = await LotteryAlertService.checkHighTierSpeedAlert(
          campaign.campaign_id
        )
        results.new_alerts += highTierAlerts.length

        // 检测连续空奖异常（RULE_006）
        const emptyStreakAlerts = await LotteryAlertService.checkEmptyStreakAlert(
          campaign.campaign_id
        )
        results.new_alerts += emptyStreakAlerts.length
      }

      // 自动解除已恢复的告警
      const autoResolved = await LotteryAlertService.autoResolveAlerts()
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
   *
   * @param {number} campaign_id - 活动ID
   * @returns {Promise<Array>} 创建的告警列表
   */
  static async checkInventoryAlert(campaign_id) {
    const rule = ALERT_RULES.INVENTORY_LOW
    const alerts = []

    try {
      // 查询库存不足的奖品
      const lowStockPrizes = await LotteryPrize.findAll({
        where: {
          campaign_id,
          status: 'active',
          remaining_stock: { [Op.lt]: rule.threshold_count }
        }
      })

      for (const prize of lowStockPrizes) {
        const alert = await LotteryAlertService.createAlert({
          campaign_id,
          alert_type: rule.alert_type,
          severity: rule.severity,
          rule_code: rule.rule_code,
          threshold_value: rule.threshold_count,
          actual_value: prize.remaining_stock,
          message: `奖品「${prize.prize_name}」库存不足，当前剩余: ${prize.remaining_stock}件`
        })

        if (alert.isNewRecord !== false) {
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
   *
   * @param {number} campaign_id - 活动ID
   * @returns {Promise<Array>} 创建的告警列表
   */
  static async checkBudgetAlert(campaign_id) {
    const alerts = []

    try {
      // 获取活动预算配置
      const campaign = await LotteryCampaign.findByPk(campaign_id)
      if (!campaign || !campaign.daily_budget_points) {
        return alerts
      }

      const budgetLimit = campaign.daily_budget_points

      // 计算今日已消耗预算
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const todayUsage =
        (await LotteryDraw.sum('cost_points', {
          where: {
            campaign_id,
            created_at: { [Op.gte]: today }
          }
        })) || 0

      const usageRatio = todayUsage / budgetLimit

      // 检测预算耗尽
      if (usageRatio >= ALERT_RULES.BUDGET_EXHAUSTED.threshold_percentage) {
        const alert = await LotteryAlertService.createAlert({
          campaign_id,
          alert_type: ALERT_RULES.BUDGET_EXHAUSTED.alert_type,
          severity: ALERT_RULES.BUDGET_EXHAUSTED.severity,
          rule_code: ALERT_RULES.BUDGET_EXHAUSTED.rule_code,
          threshold_value: budgetLimit,
          actual_value: todayUsage,
          message: `今日预算已耗尽，预算: ${budgetLimit}积分，已消耗: ${todayUsage}积分`
        })
        if (alert.isNewRecord !== false) {
          alerts.push(alert)
        }
      } else if (usageRatio >= ALERT_RULES.BUDGET_WARNING.threshold_percentage) {
        // 检测预算预警
        const alert = await LotteryAlertService.createAlert({
          campaign_id,
          alert_type: ALERT_RULES.BUDGET_WARNING.alert_type,
          severity: ALERT_RULES.BUDGET_WARNING.severity,
          rule_code: ALERT_RULES.BUDGET_WARNING.rule_code,
          threshold_value: budgetLimit,
          actual_value: todayUsage,
          message: `今日预算消耗达到${(usageRatio * 100).toFixed(1)}%，预算: ${budgetLimit}积分，已消耗: ${todayUsage}积分`
        })
        if (alert.isNewRecord !== false) {
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
   * 检测最近1小时内中奖率是否偏离配置值±20%
   *
   * @param {number} campaign_id - 活动ID
   * @returns {Promise<Array>} 创建的告警列表
   */
  static async checkWinRateAlert(campaign_id) {
    const rule = ALERT_RULES.WIN_RATE_ABNORMAL
    const alerts = []

    try {
      // 获取活动配置的预期中奖率
      const campaign = await LotteryCampaign.findByPk(campaign_id)
      if (!campaign) {
        return alerts
      }

      /*
       * 获取活动配置的预期中奖率（假设存储在 prize_settings 或默认使用100%）
       * 由于每次抽奖100%必中，这里检测的是高档奖品的中奖率
       */
      const expectedWinRate = 1.0 // 默认期望中奖率100%

      // 计算最近1小时的实际中奖率
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)

      const totalDraws = await LotteryDraw.count({
        where: {
          campaign_id,
          created_at: { [Op.gte]: oneHourAgo }
        }
      })

      // 抽奖次数不足时跳过检测
      if (totalDraws < 10) {
        return alerts
      }

      // 统计非空奖（有实际奖品）的抽奖次数
      const nonEmptyDraws = await LotteryDraw.count({
        where: {
          campaign_id,
          created_at: { [Op.gte]: oneHourAgo },
          prize_id: { [Op.not]: null }
        }
      })

      const actualWinRate = nonEmptyDraws / totalDraws
      const deviation = Math.abs(actualWinRate - expectedWinRate) / expectedWinRate

      // 如果偏离超过阈值，触发告警
      if (deviation > rule.threshold_deviation) {
        const alert = await LotteryAlertService.createAlert({
          campaign_id,
          alert_type: rule.alert_type,
          severity: rule.severity,
          rule_code: rule.rule_code,
          threshold_value: expectedWinRate * 100,
          actual_value: actualWinRate * 100,
          message: `中奖率偏离告警：预期${(expectedWinRate * 100).toFixed(1)}%，实际${(actualWinRate * 100).toFixed(1)}%，偏离${(deviation * 100).toFixed(1)}%（阈值${(rule.threshold_deviation * 100).toFixed(0)}%）`
        })
        if (alert.isNewRecord !== false) {
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
   * 检测高档奖品（high档位）发放速度是否超过预算的1.5倍
   *
   * @param {number} campaign_id - 活动ID
   * @returns {Promise<Array>} 创建的告警列表
   */
  static async checkHighTierSpeedAlert(campaign_id) {
    const rule = ALERT_RULES.HIGH_TIER_FAST
    const alerts = []

    try {
      // 获取活动配置
      const campaign = await LotteryCampaign.findByPk(campaign_id)
      if (!campaign || !campaign.daily_budget_points) {
        return alerts
      }

      // 计算今日高档奖品（reward_tier = 'high'）的发放数量和预算消耗
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      // 查询今日高档奖品发放情况
      const highTierDraws = await LotteryDraw.findAll({
        where: {
          campaign_id,
          created_at: { [Op.gte]: today }
        },
        include: [
          {
            model: LotteryPrize,
            as: 'prize',
            where: {
              reward_tier: 'high'
            },
            required: true
          }
        ]
      })

      // 如果高档奖品发放数量不足，跳过检测
      if (highTierDraws.length < 3) {
        return alerts
      }

      // 计算高档奖品消耗的积分总额
      const highTierCost = highTierDraws.reduce((sum, draw) => {
        return sum + (draw.prize ? parseFloat(draw.prize.cost_points || 0) : 0)
      }, 0)

      // 计算当前时间占今日的比例，推算预期消耗
      const now = new Date()
      const hoursElapsed = (now.getTime() - today.getTime()) / (1000 * 60 * 60)
      const dayRatio = Math.min(hoursElapsed / 24, 1)

      // 假设高档奖品预算占总预算的20%
      const highTierBudgetRatio = 0.2
      const expectedHighTierBudget = campaign.daily_budget_points * highTierBudgetRatio * dayRatio

      // 如果实际消耗超过预期的1.5倍，触发告警
      if (
        expectedHighTierBudget > 0 &&
        highTierCost > expectedHighTierBudget * rule.threshold_multiplier
      ) {
        const speedRatio = highTierCost / expectedHighTierBudget
        const alert = await LotteryAlertService.createAlert({
          campaign_id,
          alert_type: rule.alert_type,
          severity: rule.severity,
          rule_code: rule.rule_code,
          threshold_value: expectedHighTierBudget,
          actual_value: highTierCost,
          message: `高档奖品发放过快：预期消耗${expectedHighTierBudget.toFixed(0)}积分，实际消耗${highTierCost.toFixed(0)}积分，发放速度为预期的${speedRatio.toFixed(1)}倍（阈值${rule.threshold_multiplier}倍）`
        })
        if (alert.isNewRecord !== false) {
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
   * 检测连续空奖≥10次的用户数占比是否超过5%
   *
   * @param {number} campaign_id - 活动ID
   * @returns {Promise<Array>} 创建的告警列表
   */
  static async checkEmptyStreakAlert(campaign_id) {
    const rule = ALERT_RULES.CONSECUTIVE_EMPTY
    const alerts = []

    try {
      // 获取最近24小时内有抽奖记录的用户
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)

      // 统计参与抽奖的总用户数
      const totalUsersResult = await LotteryDraw.findAll({
        where: {
          campaign_id,
          created_at: { [Op.gte]: yesterday }
        },
        attributes: [[fn('DISTINCT', col('user_id')), 'user_id']],
        raw: true
      })

      const totalUsers = totalUsersResult.length

      // 用户数不足时跳过检测
      if (totalUsers < 20) {
        return alerts
      }

      /*
       * 使用原生SQL查询连续空奖≥10次的用户数
       * 这里使用Sequelize的raw查询来实现复杂的连续空奖检测
       */
      const emptyStreakQuery = `
        SELECT COUNT(DISTINCT user_id) as affected_users
        FROM (
          SELECT 
            user_id,
            @streak := IF(prize_id IS NULL AND @prev_user = user_id, @streak + 1, IF(prize_id IS NULL, 1, 0)) as empty_streak,
            @prev_user := user_id
          FROM lottery_draws
          CROSS JOIN (SELECT @streak := 0, @prev_user := 0) vars
          WHERE campaign_id = :campaign_id
            AND created_at >= :yesterday
          ORDER BY user_id, created_at
        ) as streaks
        WHERE empty_streak >= :threshold_streak
      `

      const [emptyStreakResult] = await LotteryDraw.sequelize.query(emptyStreakQuery, {
        replacements: {
          campaign_id,
          yesterday,
          threshold_streak: rule.threshold_streak
        },
        type: LotteryDraw.sequelize.QueryTypes.SELECT
      })

      const affectedUsers = parseInt(emptyStreakResult?.affected_users || 0, 10)
      const userRatio = affectedUsers / totalUsers

      // 如果受影响用户比例超过阈值，触发告警
      if (userRatio > rule.threshold_user_ratio) {
        const alert = await LotteryAlertService.createAlert({
          campaign_id,
          alert_type: rule.alert_type,
          severity: rule.severity,
          rule_code: rule.rule_code,
          threshold_value: rule.threshold_user_ratio * 100,
          actual_value: userRatio * 100,
          message: `连续空奖异常：${affectedUsers}位用户（占比${(userRatio * 100).toFixed(1)}%）连续空奖≥${rule.threshold_streak}次（阈值${(rule.threshold_user_ratio * 100).toFixed(0)}%）`
        })
        if (alert.isNewRecord !== false) {
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
   * 当告警条件不再满足时，自动将告警标记为已解决
   *
   * @returns {Promise<number>} 自动解除的告警数量
   */
  static async autoResolveAlerts() {
    try {
      // 暂时只处理库存告警的自动解除
      const activeInventoryAlerts = await LotteryAlert.findAll({
        where: {
          alert_type: 'inventory',
          status: { [Op.ne]: 'resolved' }
        }
      })

      let resolvedCount = 0

      for (const alert of activeInventoryAlerts) {
        // 检查库存是否已恢复
        const prize = await LotteryPrize.findOne({
          where: {
            campaign_id: alert.campaign_id,
            remaining_stock: { [Op.lt]: ALERT_RULES.INVENTORY_LOW.threshold_count }
          }
        })

        // 如果没有库存不足的奖品，则自动解除告警
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

  /**
   * 获取告警类型显示名称
   *
   * @param {string} type - 告警类型
   * @returns {string} 显示名称
   */
  static getAlertTypeName(type) {
    const names = {
      win_rate: '中奖率异常',
      budget: '预算告警',
      inventory: '库存告警',
      user: '用户异常',
      system: '系统告警'
    }
    return names[type] || '未知类型'
  }

  /**
   * 获取严重程度显示名称
   *
   * @param {string} severity - 严重程度
   * @returns {string} 显示名称
   */
  static getSeverityName(severity) {
    const names = {
      info: '提示',
      warning: '警告',
      danger: '严重'
    }
    return names[severity] || '未知级别'
  }

  /**
   * 获取状态显示名称
   *
   * @param {string} status - 状态
   * @returns {string} 显示名称
   */
  static getStatusName(status) {
    const names = {
      active: '待处理',
      acknowledged: '已确认',
      resolved: '已解决'
    }
    return names[status] || '未知状态'
  }

  /**
   * 计算偏差百分比
   *
   * @param {number} threshold - 阈值
   * @param {number} actual - 实际值
   * @returns {number|null} 偏差百分比
   */
  static calculateDeviation(threshold, actual) {
    if (threshold === null || actual === null || threshold === 0) {
      return null
    }
    return Math.round(Math.abs((actual - threshold) / threshold) * 10000) / 100
  }

  /**
   * 获取告警规则配置
   *
   * @returns {Object} 规则配置
   */
  static getAlertRules() {
    return ALERT_RULES
  }
}

module.exports = LotteryAlertService
