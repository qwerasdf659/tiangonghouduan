/**
 * 智能提醒规则引擎服务
 *
 * 功能说明：
 * - 规则条件检测：根据规则配置检测目标实体是否满足触发条件
 * - 提醒通知发送：通过 NotificationService 发送多渠道通知
 * - 规则调度管理：计算下次检测时间，支持定时检测
 * - 提醒历史记录：记录每次触发的详细信息
 *
 * 业务场景：
 * - 待审核超时提醒（消费记录、兑换申请待审核超过N小时）
 * - 预算告警（活动预算消耗超过阈值）
 * - 库存不足提醒（奖品库存低于阈值）
 * - 异常检测（用户行为异常、系统异常）
 *
 * 创建时间：2026年01月31日
 * 任务编号：B-31 提醒规则引擎
 */

'use strict'

const models = require('../models')
const NotificationService = require('./NotificationService')
const logger = require('../utils/logger')
const BeijingTimeHelper = require('../utils/timeHelper')
const { Op } = require('sequelize')

/**
 * 规则处理器映射表
 * 每种规则类型对应一个检测函数
 */
const RULE_PROCESSORS = {
  /**
   * 待处理超时检测
   * @param {Object} rule - 提醒规则
   * @returns {Promise<Object>} 检测结果
   */
  pending_timeout: async rule => {
    const { trigger_condition, target_entity } = rule
    const { threshold, unit, target_status } = trigger_condition

    // 计算超时时间阈值
    const thresholdMs = calculateThresholdMs(threshold, unit)
    const cutoffTime = new Date(Date.now() - thresholdMs)

    // 根据目标实体类型查询
    const modelMap = {
      consumption_record: 'ConsumptionRecord',
      exchange_record: 'ExchangeRecord',
      content_review: 'ContentReviewRecord'
    }

    const modelName = modelMap[target_entity]
    if (!modelName || !models[modelName]) {
      logger.warn(`[提醒引擎] 未找到目标实体模型: ${target_entity}`)
      return { matched: false, count: 0, items: [] }
    }

    const Model = models[modelName]

    // 构建查询条件
    const where = {
      created_at: { [Op.lt]: cutoffTime }
    }

    // 添加状态条件
    if (target_status) {
      // 不同模型的状态字段名（consumption_records表和exchange_records表都使用status字段）
      if (modelName === 'ConsumptionRecord') {
        where.status = target_status
      } else if (modelName === 'ExchangeRecord') {
        where.status = target_status
      } else if (modelName === 'ContentReviewRecord') {
        where.status = target_status
      }
    }

    const items = await Model.findAll({
      where,
      attributes: [Model.primaryKeyAttribute || 'id'],
      limit: 100, // 限制返回数量
      raw: true
    })

    return {
      matched: items.length > 0,
      count: items.length,
      items: items.map(item => item[Model.primaryKeyAttribute || 'id']),
      threshold,
      unit,
      cutoff_time: cutoffTime.toISOString()
    }
  },

  /**
   * 预算告警检测
   * @param {Object} rule - 提醒规则
   * @returns {Promise<Object>} 检测结果
   */
  budget_alert: async rule => {
    const { trigger_condition, target_entity } = rule
    const { threshold_percentage, check_field } = trigger_condition

    if (target_entity !== 'lottery_campaign') {
      return { matched: false, count: 0, campaigns: [] }
    }

    const LotteryCampaign = models.LotteryCampaign
    if (!LotteryCampaign) {
      return { matched: false, count: 0, campaigns: [] }
    }

    // 查询活跃的抽奖活动
    const campaigns = await LotteryCampaign.findAll({
      where: { status: 'active' },
      raw: true
    })

    const alertCampaigns = []

    for (const campaign of campaigns) {
      // 计算预算使用率
      let usagePercentage = 0

      if (check_field === 'daily_budget_used') {
        const dailyBudget = campaign.daily_budget_limit || campaign.total_budget
        const dailyUsed = campaign.daily_budget_used || 0
        if (dailyBudget > 0) {
          usagePercentage = (dailyUsed / dailyBudget) * 100
        }
      } else if (check_field === 'total_budget_used') {
        const totalBudget = campaign.total_budget || 0
        const totalUsed = campaign.budget_used || 0
        if (totalBudget > 0) {
          usagePercentage = (totalUsed / totalBudget) * 100
        }
      }

      if (usagePercentage >= threshold_percentage) {
        alertCampaigns.push({
          campaign_id: campaign.campaign_id,
          campaign_name: campaign.name,
          usage_percentage: usagePercentage.toFixed(2)
        })
      }
    }

    return {
      matched: alertCampaigns.length > 0,
      count: alertCampaigns.length,
      campaigns: alertCampaigns,
      threshold_percentage
    }
  },

  /**
   * 库存不足检测
   * @param {Object} rule - 提醒规则
   * @returns {Promise<Object>} 检测结果
   */
  stock_low: async rule => {
    const { trigger_condition } = rule
    const { min_stock } = trigger_condition

    const LotteryPrize = models.LotteryPrize
    if (!LotteryPrize) {
      return { matched: false, count: 0, prizes: [] }
    }

    // 查询库存低于阈值的奖品
    const prizes = await LotteryPrize.findAll({
      where: {
        stock: { [Op.lt]: min_stock || 10 },
        status: 'active'
      },
      attributes: ['prize_id', 'name', 'stock'],
      raw: true
    })

    return {
      matched: prizes.length > 0,
      count: prizes.length,
      prizes,
      min_stock: min_stock || 10
    }
  },

  /**
   * 定时提醒（按时间触发）
   * @param {Object} rule - 提醒规则
   * @returns {Promise<Object>} 检测结果
   */
  scheduled: async rule => {
    const { trigger_condition } = rule
    const { schedule_time } = trigger_condition

    if (!schedule_time) {
      return { matched: false, count: 0 }
    }

    const now = new Date()
    const scheduledDate = new Date(schedule_time)

    // 检查是否到达调度时间（允许5分钟误差）
    const timeDiff = Math.abs(now.getTime() - scheduledDate.getTime())
    const matched = timeDiff <= 5 * 60 * 1000

    return {
      matched,
      count: matched ? 1 : 0,
      schedule_time,
      current_time: now.toISOString()
    }
  },

  /**
   * 自定义规则（通用处理）
   * @param {Object} rule - 提醒规则
   * @returns {Promise<Object>} 检测结果
   */
  custom: async rule => {
    const { trigger_condition } = rule

    /*
     * 自定义规则需要特定的处理逻辑
     * 这里返回一个基础结果，实际应根据 trigger_condition 配置处理
     */
    logger.info(`[提醒引擎] 自定义规则检测: ${rule.rule_code}`, trigger_condition)

    return {
      matched: false,
      count: 0,
      message: '自定义规则需要特定实现'
    }
  }
}

/**
 * 计算时间阈值（毫秒）
 * @param {number} threshold - 阈值数值
 * @param {string} unit - 时间单位（hours/minutes/days）
 * @returns {number} 毫秒数
 */
function calculateThresholdMs(threshold, unit) {
  const unitMap = {
    minutes: 60 * 1000,
    hours: 60 * 60 * 1000,
    days: 24 * 60 * 60 * 1000
  }
  return threshold * (unitMap[unit] || unitMap.hours)
}

/**
 * 智能提醒规则引擎服务类
 */
class ReminderEngineService {
  /**
   * 检测单个规则
   *
   * @param {Object} rule - 提醒规则对象
   * @returns {Promise<Object>} 检测结果
   */
  static async checkRule(rule) {
    const startTime = Date.now()

    try {
      logger.info(`[提醒引擎] 开始检测规则: ${rule.rule_code}`, {
        reminder_rule_id: rule.reminder_rule_id,
        rule_type: rule.rule_type,
        target_entity: rule.target_entity
      })

      // 获取规则处理器
      const processor = RULE_PROCESSORS[rule.rule_type]
      if (!processor) {
        logger.warn(`[提醒引擎] 未知规则类型: ${rule.rule_type}`)
        return {
          success: false,
          matched: false,
          error: `未知规则类型: ${rule.rule_type}`
        }
      }

      // 执行检测
      const result = await processor(rule)

      const duration = Date.now() - startTime
      logger.info(`[提醒引擎] 规则检测完成: ${rule.rule_code}`, {
        reminder_rule_id: rule.reminder_rule_id,
        matched: result.matched,
        count: result.count,
        duration_ms: duration
      })

      return {
        success: true,
        ...result
      }
    } catch (error) {
      logger.error(`[提醒引擎] 规则检测异常: ${rule.rule_code}`, {
        reminder_rule_id: rule.reminder_rule_id,
        error: error.message,
        stack: error.stack
      })

      return {
        success: false,
        matched: false,
        error: error.message
      }
    }
  }

  /**
   * 执行规则并发送通知
   *
   * @param {Object} rule - 提醒规则对象
   * @param {Object} [options] - 可选参数
   * @returns {Promise<Object>} 执行结果
   */
  static async executeRule(rule, options = {}) {
    const { dryRun = false, transaction } = options

    try {
      // 1. 检测规则条件
      const checkResult = await ReminderEngineService.checkRule(rule)

      if (!checkResult.success) {
        return {
          success: false,
          triggered: false,
          error: checkResult.error
        }
      }

      // 2. 如果未匹配，更新检测时间并返回
      if (!checkResult.matched || checkResult.count === 0) {
        await ReminderEngineService.updateRuleCheckTime(rule, transaction)
        return {
          success: true,
          triggered: false,
          check_result: checkResult
        }
      }

      // 3. 创建提醒历史记录
      const historyRecord = await models.ReminderHistory.create(
        {
          reminder_rule_id: rule.reminder_rule_id,
          trigger_time: BeijingTimeHelper.createDatabaseTime(),
          trigger_data: checkResult,
          matched_count: checkResult.count,
          notification_status: dryRun ? 'skipped' : 'pending'
        },
        { transaction }
      )

      // 4. 发送通知（非试运行模式）
      if (!dryRun) {
        const notificationResult = await ReminderEngineService.sendNotification(rule, checkResult)

        // 更新历史记录
        await historyRecord.update(
          {
            notification_status: notificationResult.success ? 'sent' : 'failed',
            notification_result: notificationResult,
            sent_at: notificationResult.success ? BeijingTimeHelper.createDatabaseTime() : null,
            error_message: notificationResult.error || null
          },
          { transaction }
        )
      }

      // 5. 更新规则检测时间
      await ReminderEngineService.updateRuleCheckTime(rule, transaction)

      return {
        success: true,
        triggered: true,
        reminder_history_id: historyRecord.reminder_history_id,
        check_result: checkResult,
        dry_run: dryRun
      }
    } catch (error) {
      logger.error(`[提醒引擎] 执行规则异常: ${rule.rule_code}`, {
        reminder_rule_id: rule.reminder_rule_id,
        error: error.message,
        stack: error.stack
      })

      return {
        success: false,
        triggered: false,
        error: error.message
      }
    }
  }

  /**
   * 发送提醒通知
   *
   * @param {Object} rule - 提醒规则
   * @param {Object} checkResult - 检测结果
   * @returns {Promise<Object>} 发送结果
   */
  static async sendNotification(rule, checkResult) {
    const channels = rule.notification_channels || ['admin_broadcast']
    const results = []

    try {
      // 解析通知模板
      const message = ReminderEngineService.parseTemplate(rule, checkResult)

      // 遍历通知渠道
      for (const channel of channels) {
        try {
          if (channel === 'admin_broadcast') {
            // 管理员广播通知
            await NotificationService.sendToAdmins({
              notification_type: 'reminder_alert',
              title: `提醒: ${rule.rule_name}`,
              content: message,
              priority: rule.notification_priority || 'medium',
              data: {
                reminder_rule_id: rule.reminder_rule_id,
                rule_code: rule.rule_code,
                check_result: checkResult
              }
            })
            results.push({ channel, success: true })
          } else if (channel === 'websocket') {
            // WebSocket 实时推送
            await NotificationService.sendToAdmins({
              notification_type: 'reminder_alert',
              title: `提醒: ${rule.rule_name}`,
              content: message,
              priority: rule.notification_priority || 'medium',
              data: {
                reminder_rule_id: rule.reminder_rule_id,
                rule_code: rule.rule_code,
                check_result: checkResult
              }
            })
            results.push({ channel, success: true })
          } else {
            logger.warn(`[提醒引擎] 未实现的通知渠道: ${channel}`)
            results.push({ channel, success: false, error: '渠道未实现' })
          }
        } catch (channelError) {
          logger.error(`[提醒引擎] 通知渠道发送失败: ${channel}`, {
            error: channelError.message
          })
          results.push({ channel, success: false, error: channelError.message })
        }
      }

      const successCount = results.filter(r => r.success).length
      return {
        success: successCount > 0,
        channels: results,
        message
      }
    } catch (error) {
      logger.error(`[提醒引擎] 发送通知异常`, {
        reminder_rule_id: rule.reminder_rule_id,
        error: error.message
      })

      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 解析通知模板，替换变量
   *
   * @param {Object} rule - 提醒规则
   * @param {Object} checkResult - 检测结果
   * @returns {string} 解析后的消息
   */
  static parseTemplate(rule, checkResult) {
    let template = rule.notification_template || `规则【${rule.rule_name}】已触发`

    // 替换通用变量
    const variables = {
      count: checkResult.count,
      entity: rule.target_entity,
      rule_name: rule.rule_name,
      threshold: checkResult.threshold || '',
      unit: checkResult.unit || '',
      percentage: checkResult.usage_percentage || checkResult.threshold_percentage || ''
    }

    // 处理活动名称（预算告警场景）
    if (checkResult.campaigns && checkResult.campaigns.length > 0) {
      variables.campaign_name = checkResult.campaigns.map(c => c.campaign_name).join('、')
    }

    // 替换模板变量
    Object.entries(variables).forEach(([key, value]) => {
      template = template.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
    })

    return template
  }

  /**
   * 更新规则检测时间
   *
   * @param {Object} rule - 提醒规则
   * @param {Object} [transaction] - 数据库事务
   * @returns {Promise<void>} 无返回值
   */
  static async updateRuleCheckTime(rule, transaction) {
    const now = BeijingTimeHelper.createDatabaseTime()
    const nextCheck = new Date(now.getTime() + rule.check_interval_minutes * 60 * 1000)

    await models.ReminderRule.update(
      {
        last_check_at: now,
        next_check_at: nextCheck
      },
      {
        where: { reminder_rule_id: rule.reminder_rule_id },
        transaction
      }
    )
  }

  /**
   * 获取需要检测的规则列表
   *
   * @returns {Promise<Array>} 需要检测的规则列表
   */
  static async getRulesNeedingCheck() {
    const now = new Date()

    const rules = await models.ReminderRule.findAll({
      where: {
        is_enabled: true,
        [Op.or]: [{ next_check_at: { [Op.lte]: now } }, { next_check_at: null }]
      },
      order: [
        ['notification_priority', 'DESC'],
        ['next_check_at', 'ASC']
      ]
    })

    return rules
  }

  /**
   * 运行所有待检测的规则
   *
   * @param {Object} [options] - 可选参数
   * @returns {Promise<Object>} 运行结果汇总
   */
  static async runPendingRules(options = {}) {
    const { maxRules = 10, dryRun = false } = options
    const startTime = Date.now()

    logger.info(`[提醒引擎] 开始批量检测规则`, { max_rules: maxRules, dry_run: dryRun })

    const rules = await ReminderEngineService.getRulesNeedingCheck()
    const rulesToProcess = rules.slice(0, maxRules)

    const results = {
      total_checked: 0,
      triggered: 0,
      failed: 0,
      details: []
    }

    for (const rule of rulesToProcess) {
      const result = await ReminderEngineService.executeRule(rule, { dryRun })

      results.total_checked++
      if (result.triggered) {
        results.triggered++
      }
      if (!result.success) {
        results.failed++
      }

      results.details.push({
        reminder_rule_id: rule.reminder_rule_id,
        rule_code: rule.rule_code,
        ...result
      })
    }

    const duration = Date.now() - startTime
    logger.info(`[提醒引擎] 批量检测完成`, {
      ...results,
      duration_ms: duration
    })

    return {
      ...results,
      duration_ms: duration
    }
  }

  // ==================== 规则CRUD操作（B-34） ====================

  /**
   * 创建提醒规则
   *
   * @param {Object} data - 规则数据
   * @param {Object} [options] - Sequelize选项
   * @returns {Promise<Object>} 创建的规则
   */
  static async createRule(data, options = {}) {
    const {
      name,
      description,
      rule_type,
      condition_config,
      action_config,
      priority = 'medium',
      created_by
    } = data

    // 生成规则代码
    const ruleCode = `RULE_${rule_type.toUpperCase()}_${Date.now()}`

    const rule = await models.ReminderRule.create(
      {
        rule_code: ruleCode,
        rule_name: name,
        description,
        rule_type,
        target_entity: condition_config.target_entity || 'general',
        trigger_condition: condition_config,
        action_config,
        notification_template: action_config.template || `规则【${name}】已触发`,
        notification_channels: action_config.channels || ['admin_broadcast'],
        notification_priority: priority,
        check_interval_minutes: condition_config.check_interval || 60,
        is_system: false,
        is_enabled: true,
        created_by
      },
      options
    )

    logger.info(`[提醒规则] 创建成功`, {
      reminder_rule_id: rule.reminder_rule_id,
      rule_code: ruleCode,
      created_by
    })

    return rule
  }

  /**
   * 更新提醒规则
   *
   * @param {number} ruleId - 规则ID
   * @param {Object} data - 更新数据
   * @param {Object} [options] - Sequelize选项
   * @returns {Promise<Object>} 更新后的规则
   */
  static async updateRule(ruleId, data, options = {}) {
    const rule = await models.ReminderRule.findByPk(ruleId)

    if (!rule) {
      throw new Error('提醒规则不存在')
    }

    // 系统规则不允许修改核心配置
    if (rule.is_system) {
      const allowedFields = ['is_enabled', 'notification_priority']
      const updateData = {}
      allowedFields.forEach(field => {
        if (data[field] !== undefined) {
          updateData[field] = data[field]
        }
      })
      await rule.update(updateData, options)
    } else {
      await rule.update(data, options)
    }

    logger.info(`[提醒规则] 更新成功`, {
      reminder_rule_id: ruleId,
      updated_fields: Object.keys(data)
    })

    return rule
  }

  /**
   * 删除提醒规则
   *
   * @param {number} ruleId - 规则ID
   * @param {Object} [options] - Sequelize选项
   * @returns {Promise<boolean>} 是否删除成功
   */
  static async deleteRule(ruleId, options = {}) {
    const rule = await models.ReminderRule.findByPk(ruleId)

    if (!rule) {
      throw new Error('提醒规则不存在')
    }

    if (rule.is_system) {
      throw new Error('系统规则不允许删除')
    }

    await rule.destroy(options)

    logger.info(`[提醒规则] 删除成功`, { reminder_rule_id: ruleId })

    return true
  }

  /**
   * 获取规则列表
   *
   * @param {Object} params - 查询参数
   * @returns {Promise<Object>} 分页结果
   */
  static async getRuleList(params = {}) {
    const { rule_type, is_enabled, is_system, page = 1, page_size = 20 } = params

    const where = {}

    if (rule_type) {
      where.rule_type = rule_type
    }
    if (is_enabled !== undefined) {
      where.is_enabled = is_enabled
    }
    if (is_system !== undefined) {
      where.is_system = is_system
    }

    const offset = (page - 1) * page_size

    const { count, rows } = await models.ReminderRule.findAndCountAll({
      where,
      include: [
        {
          model: models.User,
          as: 'creator',
          attributes: ['user_id', 'nickname']
        }
      ],
      order: [
        ['notification_priority', 'DESC'],
        ['created_at', 'DESC']
      ],
      limit: page_size,
      offset
    })

    return {
      total: count,
      page,
      page_size,
      total_pages: Math.ceil(count / page_size),
      items: rows
    }
  }

  /**
   * 获取规则详情
   *
   * @param {number} ruleId - 规则ID
   * @returns {Promise<Object>} 规则详情
   */
  static async getRuleDetail(ruleId) {
    const rule = await models.ReminderRule.findByPk(ruleId, {
      include: [
        {
          model: models.User,
          as: 'creator',
          attributes: ['user_id', 'nickname']
        }
      ]
    })

    return rule
  }

  // ==================== 提醒历史查询（B-35） ====================

  /**
   * 获取提醒历史
   *
   * @param {Object} params - 查询参数
   * @returns {Promise<Object>} 分页结果
   */
  static async getReminderHistory(params = {}) {
    const {
      reminder_rule_id,
      notification_status,
      start_time,
      end_time,
      page = 1,
      page_size = 20
    } = params

    const where = {}

    if (reminder_rule_id) {
      where.reminder_rule_id = reminder_rule_id
    }
    if (notification_status) {
      where.notification_status = notification_status
    }
    if (start_time || end_time) {
      where.trigger_time = {}
      if (start_time) {
        where.trigger_time[Op.gte] = start_time
      }
      if (end_time) {
        where.trigger_time[Op.lte] = end_time
      }
    }

    const offset = (page - 1) * page_size

    const { count, rows } = await models.ReminderHistory.findAndCountAll({
      where,
      include: [
        {
          model: models.ReminderRule,
          as: 'rule',
          attributes: ['reminder_rule_id', 'rule_code', 'rule_name', 'rule_type']
        }
      ],
      order: [['trigger_time', 'DESC']],
      limit: page_size,
      offset
    })

    return {
      total: count,
      page,
      page_size,
      total_pages: Math.ceil(count / page_size),
      items: rows
    }
  }

  /**
   * 获取提醒统计
   *
   * @param {Object} params - 查询参数
   * @returns {Promise<Object>} 统计数据
   */
  static async getReminderStats(params = {}) {
    const { start_time, end_time } = params

    const where = {}
    if (start_time || end_time) {
      where.trigger_time = {}
      if (start_time) {
        where.trigger_time[Op.gte] = start_time
      }
      if (end_time) {
        where.trigger_time[Op.lte] = end_time
      }
    }

    // 总触发次数
    const totalCount = await models.ReminderHistory.count({ where })

    // 按状态统计
    const byStatus = await models.ReminderHistory.findAll({
      where,
      attributes: [
        'notification_status',
        [models.sequelize.fn('COUNT', models.sequelize.col('reminder_history_id')), 'count']
      ],
      group: ['notification_status'],
      raw: true
    })

    // 按规则统计（Top 10）
    const byRule = await models.ReminderHistory.findAll({
      where,
      attributes: [
        'reminder_rule_id',
        [models.sequelize.fn('COUNT', models.sequelize.col('reminder_history_id')), 'count']
      ],
      include: [
        {
          model: models.ReminderRule,
          as: 'rule',
          attributes: ['rule_name']
        }
      ],
      group: ['reminder_rule_id', 'rule.reminder_rule_id', 'rule.rule_name'],
      order: [[models.sequelize.fn('COUNT', models.sequelize.col('reminder_history_id')), 'DESC']],
      limit: 10,
      raw: false
    })

    return {
      total_triggered: totalCount,
      by_status: byStatus.reduce((acc, item) => {
        acc[item.notification_status] = parseInt(item.count, 10)
        return acc
      }, {}),
      by_rule: byRule.map(item => ({
        reminder_rule_id: item.reminder_rule_id,
        rule_name: item.rule?.rule_name || 'Unknown',
        count: parseInt(item.dataValues.count, 10)
      }))
    }
  }
}

module.exports = ReminderEngineService
