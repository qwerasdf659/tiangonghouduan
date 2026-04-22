'use strict'

const { Op } = require('sequelize')
const { OPERATION_TYPES } = require('../../../constants/AuditOperationTypes')

/**
 * SimulationApplyService - 应用/回滚模拟配置
 *
 * 方法：applySimulation, scheduleConfigActivation, executeScheduledActivations,
 *       getConfigVersionHistory, rollbackConfig
 *       _rollbackSimulationApply, _rollbackStrategyConfig, _rollbackMatrixConfig,
 *       _rollbackTierRules, _rollbackGeneric
 */
class SimulationApplyService {
  /**
   * @param {Object} models - Sequelize 模型集合
   */
  constructor(models) {
    this.models = models
  }

  /**
   * 将模拟配置应用到生产数据库
   *
   * @param {number} lottery_simulation_record_id - 模拟记录ID
   * @param {number} operator_id - 操作者用户ID
   * @param {Object} options - { transaction }
   * @returns {Promise<Object>} { applied: true, changes, admin_operation_log_id }
   */
  async applySimulation(lottery_simulation_record_id, operator_id, options = {}) {
    const { transaction } = options
    const { LotterySimulationRecord, AdminOperationLog } = this.models

    const record = await LotterySimulationRecord.findByPk(lottery_simulation_record_id, {
      transaction
    })
    if (!record) {
      throw Object.assign(new Error('模拟记录不存在'), { statusCode: 404 })
    }
    if (record.status === 'applied') {
      throw Object.assign(new Error('该模拟记录已经应用过'), { statusCode: 400 })
    }

    const proposedConfig = record.proposed_config
    const campaignId = record.lottery_campaign_id
    const changes = []

    if (proposedConfig.matrix_config?.length > 0) {
      for (const mc of proposedConfig.matrix_config) {
        const [count] = await this.models.LotteryTierMatrixConfig.update(
          {
            high_multiplier: mc.high_multiplier,
            mid_multiplier: mc.mid_multiplier,
            low_multiplier: mc.low_multiplier,
            fallback_multiplier: mc.fallback_multiplier,
            cap_multiplier: mc.cap_multiplier,
            empty_weight_multiplier: mc.empty_weight_multiplier,
            updated_by: operator_id
          },
          {
            where: {
              lottery_campaign_id: campaignId,
              budget_tier: mc.budget_tier,
              pressure_tier: mc.pressure_tier
            },
            transaction
          }
        )
        if (count > 0) {
          changes.push({
            table: 'lottery_tier_matrix_config',
            where: `${mc.budget_tier}_${mc.pressure_tier}`,
            updated: count
          })
        }
      }
    }

    if (proposedConfig.strategy_config) {
      for (const [group, values] of Object.entries(proposedConfig.strategy_config)) {
        for (const [key, value] of Object.entries(values)) {
          await this.models.LotteryStrategyConfig.update(
            { config_value: JSON.stringify(value), updated_by: operator_id },
            {
              where: { lottery_campaign_id: campaignId, config_group: group, config_key: key },
              transaction
            }
          )
          changes.push({
            table: 'lottery_strategy_config',
            field: `${group}.${key}`,
            new_value: value
          })
        }
      }
    }

    if (proposedConfig.tier_rules?.length > 0) {
      for (const rule of proposedConfig.tier_rules) {
        await this.models.LotteryTierRule.update(
          { tier_weight: rule.tier_weight },
          {
            where: {
              lottery_campaign_id: campaignId,
              segment_key: rule.segment_key,
              tier_name: rule.tier_name
            },
            transaction
          }
        )
        changes.push({
          table: 'lottery_tier_rules',
          where: `${rule.segment_key}_${rule.tier_name}`,
          new_value: rule.tier_weight
        })
      }
    }

    const logEntry = await AdminOperationLog.create(
      {
        operator_id,
        operation_type: OPERATION_TYPES.SIMULATION_APPLY,
        target_type: 'lottery_simulation_record',
        target_id: lottery_simulation_record_id,
        action: 'update',
        before_data: { ...record.proposed_config, lottery_campaign_id: campaignId },
        after_data: { changes, lottery_campaign_id: campaignId },
        reason: `应用模拟记录 #${lottery_simulation_record_id} 的配置到活动 #${campaignId}`,
        idempotency_key: `simulation_apply_${lottery_simulation_record_id}_${Date.now()}`,
        risk_level: 'high',
        is_reversible: true,
        reversal_data: record.proposed_config
      },
      { transaction }
    )

    await record.markAsApplied(operator_id, { transaction })

    return {
      applied: true,
      changes,
      admin_operation_log_id: logEntry.admin_operation_log_id
    }
  }

  /**
   * 定时应用模拟配置 — 在指定时间生效
   *
   * @param {number} lottery_simulation_record_id - 模拟记录主键
   * @param {number} operator_id - 操作者用户ID
   * @param {Date|string} scheduled_at - 计划生效时间（北京时间）
   * @param {Object} options - { transaction }
   * @returns {Promise<Object>} { scheduled: true, scheduled_at, changes_summary }
   */
  async scheduleConfigActivation(
    lottery_simulation_record_id,
    operator_id,
    scheduled_at,
    options = {}
  ) {
    const { transaction } = options
    const { LotterySimulationRecord, LotteryStrategyConfig, AdminOperationLog } = this.models

    const record = await LotterySimulationRecord.findByPk(lottery_simulation_record_id, {
      transaction
    })
    if (!record) {
      throw Object.assign(new Error('模拟记录不存在'), { statusCode: 404 })
    }

    const scheduledTime = new Date(scheduled_at)
    if (isNaN(scheduledTime.getTime()) || scheduledTime <= new Date()) {
      throw Object.assign(new Error('scheduled_at 必须是未来的有效时间'), { statusCode: 400 })
    }

    const proposedConfig = record.proposed_config
    const campaignId = record.lottery_campaign_id
    const changesSummary = []

    if (proposedConfig.strategy_config) {
      for (const [group, values] of Object.entries(proposedConfig.strategy_config)) {
        for (const [key, value] of Object.entries(values)) {
          await LotteryStrategyConfig.create(
            {
              lottery_campaign_id: campaignId,
              config_group: group,
              config_key: key,
              config_value: JSON.stringify(value),
              effective_start: scheduledTime,
              effective_end: null,
              is_active: true,
              priority: 10,
              created_by: operator_id,
              updated_by: operator_id
            },
            { transaction }
          )

          changesSummary.push({
            type: 'strategy_config',
            field: `${group}.${key}`,
            new_value: value,
            effective_start: scheduledTime
          })
        }
      }
    }

    const hasPendingDirectWrites =
      proposedConfig.matrix_config?.length > 0 || proposedConfig.tier_rules?.length > 0

    if (hasPendingDirectWrites) {
      changesSummary.push({
        type: 'pending_direct_write',
        description: '矩阵配置和基础权重将在计划时间由定时任务写入',
        items: [
          ...(proposedConfig.matrix_config || []).map(
            mc => `matrix: ${mc.budget_tier}_${mc.pressure_tier}`
          ),
          ...(proposedConfig.tier_rules || []).map(
            r => `tier_rule: ${r.segment_key}_${r.tier_name}`
          )
        ]
      })
    }

    await record.update(
      {
        status: 'scheduled',
        scheduled_at: scheduledTime
      },
      { transaction }
    )

    await AdminOperationLog.create(
      {
        operator_id,
        operation_type: OPERATION_TYPES.SIMULATION_APPLY,
        target_type: 'lottery_simulation_record',
        target_id: lottery_simulation_record_id,
        action: 'schedule',
        after_data: { scheduled_at: scheduledTime, changes: changesSummary },
        reason: `定时应用模拟记录 #${lottery_simulation_record_id}，计划生效时间: ${scheduledTime.toISOString()}`,
        idempotency_key: `simulation_schedule_${lottery_simulation_record_id}_${Date.now()}`,
        risk_level: 'high',
        is_reversible: true
      },
      { transaction }
    )

    return {
      scheduled: true,
      scheduled_at: scheduledTime,
      changes_summary: changesSummary,
      has_pending_direct_writes: hasPendingDirectWrites
    }
  }

  /**
   * 执行到期的定时配置写入（由定时任务调用）
   *
   * @param {Object} options - { transaction }
   * @returns {Promise<Array>} 已执行的记录列表
   */
  async executeScheduledActivations(options = {}) {
    const { transaction } = options
    const { LotterySimulationRecord } = this.models

    const pendingRecords = await LotterySimulationRecord.findAll({
      where: {
        status: 'scheduled',
        scheduled_at: { [Op.lte]: new Date() }
      },
      transaction
    })

    const executed = []
    for (const record of pendingRecords) {
      try {
        const result = await this.applySimulation(
          record.lottery_simulation_record_id,
          record.created_by,
          { transaction }
        )
        executed.push({
          lottery_simulation_record_id: record.lottery_simulation_record_id,
          applied: true,
          changes: result.changes
        })
      } catch (error) {
        executed.push({
          lottery_simulation_record_id: record.lottery_simulation_record_id,
          applied: false,
          error: error.message
        })
      }
    }

    return executed
  }

  /**
   * 获取策略配置的变更历史
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} options - { page_size, offset }
   * @returns {Promise<Object>} { records, total }
   */
  async getConfigVersionHistory(lottery_campaign_id, options = {}) {
    const { AdminOperationLog } = this.models
    const page_size = options.page_size ?? options.limit ?? 50
    const { offset = 0 } = options

    const relevantTypes = [
      OPERATION_TYPES.STRATEGY_CONFIG_UPDATE,
      OPERATION_TYPES.MATRIX_CONFIG_UPDATE,
      OPERATION_TYPES.TIER_RULES_UPDATE,
      OPERATION_TYPES.SIMULATION_APPLY,
      OPERATION_TYPES.CONFIG_ROLLBACK
    ]

    const result = await AdminOperationLog.findAndCountAll({
      where: {
        operation_type: { [Op.in]: relevantTypes },
        [Op.or]: [
          { reason: { [Op.like]: `%活动 #${lottery_campaign_id}%` } },
          { reason: { [Op.like]: `%campaign_id=${lottery_campaign_id}%` } },
          this.models.sequelize.literal(
            `JSON_EXTRACT(after_data, '$.lottery_campaign_id') = ${Number(lottery_campaign_id)}`
          )
        ]
      },
      order: [['created_at', 'DESC']],
      limit: Math.min(Number(page_size), 50),
      offset: Number(offset)
    })

    return {
      records: result.rows.map(log => ({
        log_id: log.admin_operation_log_id || log.log_id,
        operation_type: log.operation_type,
        operator_id: log.operator_id,
        before_data: log.before_data,
        after_data: log.after_data,
        reason: log.reason,
        created_at: log.created_at,
        is_reversible: log.is_reversible
      })),
      total: result.count
    }
  }

  /**
   * 回滚到指定版本的配置
   *
   * @param {number} log_id - AdminOperationLog 记录ID
   * @param {number} operator_id - 操作者用户ID
   * @param {Object} options - { transaction }
   * @returns {Promise<Object>} { rolled_back: true, changes }
   */
  async rollbackConfig(log_id, operator_id, options = {}) {
    const { transaction } = options
    const { AdminOperationLog } = this.models

    const logEntry = await AdminOperationLog.findByPk(log_id, { transaction })
    if (!logEntry) {
      throw Object.assign(new Error('操作日志记录不存在'), { statusCode: 404 })
    }
    if (!logEntry.before_data) {
      throw Object.assign(new Error('该记录没有 before_data，无法回滚'), { statusCode: 400 })
    }

    const beforeData = logEntry.before_data
    const afterData = logEntry.after_data
    const changes = []

    let campaignId = beforeData.lottery_campaign_id || afterData?.lottery_campaign_id
    if (!campaignId && logEntry.target_type === 'lottery_simulation_record') {
      const simRecord = await this.models.LotterySimulationRecord.findByPk(logEntry.target_id, {
        attributes: ['lottery_campaign_id'],
        transaction
      })
      campaignId = simRecord?.lottery_campaign_id
    }

    const operationType = logEntry.operation_type

    if (operationType === OPERATION_TYPES.SIMULATION_APPLY && beforeData.matrix_config) {
      await this._rollbackSimulationApply(
        beforeData,
        afterData,
        operator_id,
        changes,
        transaction,
        campaignId
      )
    } else if (operationType === OPERATION_TYPES.STRATEGY_CONFIG_UPDATE) {
      await this._rollbackStrategyConfig(beforeData, operator_id, changes, transaction, campaignId)
    } else if (operationType === OPERATION_TYPES.MATRIX_CONFIG_UPDATE) {
      await this._rollbackMatrixConfig(beforeData, operator_id, changes, transaction, campaignId)
    } else if (operationType === OPERATION_TYPES.TIER_RULES_UPDATE) {
      await this._rollbackTierRules(beforeData, operator_id, changes, transaction, campaignId)
    } else {
      await this._rollbackGeneric(beforeData, operator_id, changes, transaction, campaignId)
    }

    await AdminOperationLog.create(
      {
        operator_id,
        operation_type: OPERATION_TYPES.CONFIG_ROLLBACK,
        target_type: 'admin_operation_log',
        target_id: log_id,
        action: 'rollback',
        before_data: afterData,
        after_data: beforeData,
        reason: `回滚到操作日志 #${log_id} 之前的配置版本`,
        idempotency_key: `config_rollback_${log_id}_${Date.now()}`,
        risk_level: 'high',
        is_reversible: true,
        reversal_data: afterData
      },
      { transaction }
    )

    return { rolled_back: true, changes, source_log_id: log_id }
  }

  /**
   * @private
   * @param {Object} beforeData - 回滚前数据快照
   * @param {Object} _afterData - 回滚后数据（未使用）
   * @param {number} operator_id - 操作人ID
   * @param {Array} changes - 变更记录数组
   * @param {Object} transaction - 数据库事务
   * @param {number} campaignId - 活动ID
   * @returns {Promise<void>} 无返回值
   */
  async _rollbackSimulationApply(
    beforeData,
    _afterData,
    operator_id,
    changes,
    transaction,
    campaignId
  ) {
    if (beforeData.matrix_config?.length > 0) {
      await this._rollbackMatrixConfig(beforeData, operator_id, changes, transaction, campaignId)
    }
    if (beforeData.strategy_config) {
      await this._rollbackStrategyConfig(beforeData, operator_id, changes, transaction, campaignId)
    }
    if (beforeData.tier_rules?.length > 0) {
      await this._rollbackTierRules(beforeData, operator_id, changes, transaction, campaignId)
    }
  }

  /**
   * @private
   * @param {Object} data - 策略配置数据
   * @param {number} operator_id - 操作人ID
   * @param {Array} changes - 变更记录数组
   * @param {Object} transaction - 数据库事务
   * @param {number} campaignId - 活动ID
   * @returns {Promise<void>} 无返回值
   */
  async _rollbackStrategyConfig(data, operator_id, changes, transaction, campaignId) {
    const config = data.strategy_config || data
    for (const [group, values] of Object.entries(config)) {
      if (typeof values !== 'object' || values === null) continue
      if (group === 'lottery_campaign_id') continue
      for (const [key, value] of Object.entries(values)) {
        const whereClause = { config_group: group, config_key: key }
        if (campaignId) whereClause.lottery_campaign_id = campaignId
        const [count] = await this.models.LotteryStrategyConfig.update(
          { config_value: JSON.stringify(value), updated_by: operator_id },
          { where: whereClause, transaction }
        )
        if (count > 0) {
          changes.push({
            table: 'lottery_strategy_config',
            field: `${group}.${key}`,
            restored_value: value
          })
        }
      }
    }
  }

  /**
   * @private
   * @param {Object} data - 矩阵配置数据
   * @param {number} operator_id - 操作人ID
   * @param {Array} changes - 变更记录数组
   * @param {Object} transaction - 数据库事务
   * @param {number} campaignId - 活动ID
   * @returns {Promise<void>} 无返回值
   */
  async _rollbackMatrixConfig(data, operator_id, changes, transaction, campaignId) {
    const configs = data.matrix_config || (Array.isArray(data) ? data : [])
    for (const mc of configs) {
      if (!mc.budget_tier || !mc.pressure_tier) continue
      const updateFields = {}
      for (const field of [
        'high_multiplier',
        'mid_multiplier',
        'low_multiplier',
        'fallback_multiplier',
        'cap_multiplier',
        'empty_weight_multiplier'
      ]) {
        if (mc[field] !== undefined) updateFields[field] = mc[field]
      }
      updateFields.updated_by = operator_id

      const whereClause = { budget_tier: mc.budget_tier, pressure_tier: mc.pressure_tier }
      if (campaignId) whereClause.lottery_campaign_id = campaignId
      const [count] = await this.models.LotteryTierMatrixConfig.update(updateFields, {
        where: whereClause,
        transaction
      })
      if (count > 0) {
        changes.push({
          table: 'lottery_tier_matrix_config',
          where: `${mc.budget_tier}_${mc.pressure_tier}`,
          restored: true
        })
      }
    }
  }

  /**
   * @private
   * @param {Object} data - 档位规则数据
   * @param {number} _operator_id - 操作人ID（未使用）
   * @param {Array} changes - 变更记录数组
   * @param {Object} transaction - 数据库事务
   * @param {number} campaignId - 活动ID
   * @returns {Promise<void>} 无返回值
   */
  async _rollbackTierRules(data, _operator_id, changes, transaction, campaignId) {
    const rules = data.tier_rules || (Array.isArray(data) ? data : [])
    for (const rule of rules) {
      if (!rule.segment_key || !rule.tier_name) continue
      const whereClause = { segment_key: rule.segment_key, tier_name: rule.tier_name }
      if (campaignId) whereClause.lottery_campaign_id = campaignId
      const [count] = await this.models.LotteryTierRule.update(
        { tier_weight: rule.tier_weight },
        { where: whereClause, transaction }
      )
      if (count > 0) {
        changes.push({
          table: 'lottery_tier_rules',
          where: `${rule.segment_key}_${rule.tier_name}`,
          restored_value: rule.tier_weight
        })
      }
    }
  }

  /**
   * @private
   * @param {Object} beforeData - 回滚前数据快照
   * @param {number} operator_id - 操作人ID
   * @param {Array} changes - 变更记录数组
   * @param {Object} transaction - 数据库事务
   * @param {number} campaignId - 活动ID
   * @returns {Promise<void>} 无返回值
   */
  async _rollbackGeneric(beforeData, operator_id, changes, transaction, campaignId) {
    if (beforeData.matrix_config) {
      await this._rollbackMatrixConfig(beforeData, operator_id, changes, transaction, campaignId)
    }
    if (beforeData.strategy_config) {
      await this._rollbackStrategyConfig(beforeData, operator_id, changes, transaction, campaignId)
    }
    if (beforeData.tier_rules) {
      await this._rollbackTierRules(beforeData, operator_id, changes, transaction, campaignId)
    }
  }
}

module.exports = SimulationApplyService
