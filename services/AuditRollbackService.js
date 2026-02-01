/**
 * 审计回滚服务
 *
 * 功能说明：
 * - 操作回滚：支持对可回滚的管理员操作执行一键回滚
 * - 回滚验证：验证回滚条件（未回滚、可回滚、数据一致性）
 * - 回滚审计：记录回滚操作本身的审计日志
 * - 风险评估：评估操作风险等级，标记高风险操作
 *
 * 业务场景：
 * - 积分误调整回滚
 * - 状态误变更回滚
 * - 配置误修改回滚
 *
 * 创建时间：2026年01月31日
 * 任务编号：B-42 回滚服务, B-43 回滚接口
 */

'use strict'

const models = require('../models')
const AuditLogService = require('./AuditLogService')
const logger = require('../utils/logger')
const BeijingTimeHelper = require('../utils/timeHelper')
const { Op } = require('sequelize')

/**
 * 可回滚的操作类型和对应的回滚处理器
 */
const ROLLBACK_HANDLERS = {
  /**
   * 积分调整回滚
   * @param {Object} log - 审计日志记录
   * @param {Object} options - 回滚选项
   * @returns {Promise<Object>} 回滚结果
   */
  points_adjust: async (log, options) => {
    const { before_data, after_data, target_id } = log
    const { transaction, operator_id, reason } = options

    // 获取 AssetService
    const ServiceManager = require('./index')
    const assetService = ServiceManager.getService('asset')

    if (!before_data || !after_data) {
      throw new Error('缺少回滚所需的数据快照')
    }

    // 计算需要回滚的积分差值
    const deltaPoints = (before_data.available_points || 0) - (after_data.available_points || 0)

    if (deltaPoints === 0) {
      return { success: true, message: '积分无变化，无需回滚' }
    }

    // 执行积分调整（反向操作）
    const result = await assetService.adjustPoints({
      user_id: target_id,
      delta: deltaPoints,
      reason: `回滚操作: ${reason || '管理员回滚'}`,
      operator_id,
      transaction
    })

    return {
      success: true,
      delta_points: deltaPoints,
      result
    }
  },

  /**
   * 用户状态变更回滚
   * @param {Object} log - 操作日志记录
   * @param {Object} options - Sequelize 选项
   * @returns {Promise<Object>} 回滚结果
   */
  user_status_change: async (log, options) => {
    const { before_data, target_id } = log
    const { transaction } = options

    if (!before_data || !before_data.status) {
      throw new Error('缺少回滚所需的状态数据')
    }

    const user = await models.User.findByPk(target_id, { transaction })
    if (!user) {
      throw new Error('用户不存在')
    }

    await user.update({ status: before_data.status }, { transaction })

    return {
      success: true,
      restored_status: before_data.status
    }
  },

  /**
   * 兑换审核回滚
   * @param {Object} log - 操作日志记录
   * @param {Object} options - Sequelize 选项
   * @returns {Promise<Object>} 回滚结果
   */
  exchange_audit: async (log, options) => {
    const { before_data, target_id } = log
    const { transaction } = options

    if (!before_data || !before_data.status) {
      throw new Error('缺少回滚所需的状态数据')
    }

    const record = await models.ExchangeRecord.findByPk(target_id, { transaction })
    if (!record) {
      throw new Error('兑换记录不存在')
    }

    await record.update({ status: before_data.status }, { transaction })

    return {
      success: true,
      restored_status: before_data.status
    }
  },

  /**
   * 消费审核回滚
   * @param {Object} log - 操作日志记录
   * @param {Object} options - Sequelize 选项
   * @returns {Promise<Object>} 回滚结果
   */
  consumption_audit: async (log, options) => {
    const { before_data, target_id } = log
    const { transaction } = options

    if (!before_data || !before_data.audit_status) {
      throw new Error('缺少回滚所需的状态数据')
    }

    const record = await models.ConsumptionRecord.findByPk(target_id, { transaction })
    if (!record) {
      throw new Error('消费记录不存在')
    }

    await record.update({ audit_status: before_data.audit_status }, { transaction })

    return {
      success: true,
      restored_status: before_data.audit_status
    }
  }
}

/**
 * 操作风险等级配置
 */
const RISK_LEVEL_CONFIG = {
  // 关键风险操作（需要二次审批）
  critical: ['delete_user', 'batch_delete', 'reset_system'],

  // 高风险操作
  high: ['points_adjust', 'user_status_change', 'role_change', 'batch_update'],

  // 中风险操作
  medium: ['exchange_audit', 'consumption_audit', 'prize_update', 'campaign_update'],

  // 低风险操作
  low: ['view', 'export', 'query']
}

/**
 * 审计回滚服务类
 */
class AuditRollbackService {
  /**
   * 检查操作是否可回滚
   *
   * @param {number} logId - 审计日志ID
   * @returns {Promise<Object>} 检查结果
   */
  static async checkRollbackable(logId) {
    const log = await models.AdminOperationLog.findByPk(logId)

    if (!log) {
      return { rollbackable: false, reason: '审计日志不存在' }
    }

    // 检查是否已回滚
    if (log.is_reversed) {
      return { rollbackable: false, reason: '该操作已被回滚' }
    }

    // 检查是否标记为可回滚
    if (!log.is_reversible) {
      return { rollbackable: false, reason: '该操作不支持回滚' }
    }

    // 检查是否有回滚处理器
    const handler = ROLLBACK_HANDLERS[log.operation_type]
    if (!handler) {
      return { rollbackable: false, reason: `操作类型 ${log.operation_type} 暂不支持回滚` }
    }

    // 检查是否有足够的回滚数据
    if (!log.before_data && !log.reversal_data) {
      return { rollbackable: false, reason: '缺少回滚所需的数据快照' }
    }

    return {
      rollbackable: true,
      log,
      operation_type: log.operation_type,
      created_at: log.created_at
    }
  }

  /**
   * 执行回滚操作
   *
   * @param {number} logId - 审计日志ID
   * @param {Object} options - 回滚选项
   * @param {number} options.operator_id - 回滚操作者ID
   * @param {string} [options.reason] - 回滚原因
   * @returns {Promise<Object>} 回滚结果
   */
  static async rollback(logId, options = {}) {
    const { operator_id, reason } = options

    if (!operator_id) {
      throw new Error('回滚操作需要指定操作者ID')
    }

    const transaction = await models.sequelize.transaction()

    try {
      // 1. 验证回滚条件
      const checkResult = await AuditRollbackService.checkRollbackable(logId)
      if (!checkResult.rollbackable) {
        throw new Error(checkResult.reason)
      }

      const log = checkResult.log

      // 2. 获取回滚处理器
      const handler = ROLLBACK_HANDLERS[log.operation_type]

      // 3. 执行回滚
      const rollbackResult = await handler(log, {
        transaction,
        operator_id,
        reason
      })

      // 4. 更新原审计日志
      await log.update(
        {
          is_reversed: true,
          reversed_at: BeijingTimeHelper.createDatabaseTime(),
          reversed_by: operator_id
        },
        { transaction }
      )

      // 5. 记录回滚操作的审计日志
      await AuditLogService.logOperation({
        operator_id,
        operation_type: 'rollback',
        target_type: 'admin_operation_log',
        target_id: logId,
        action: 'rollback',
        before_data: { is_reversed: false },
        after_data: { is_reversed: true, reversed_by: operator_id },
        reason: reason || '管理员回滚操作',
        idempotency_key: `rollback_${logId}_${Date.now()}`,
        options: { transaction }
      })

      await transaction.commit()

      logger.info(`[审计回滚] 回滚成功`, {
        log_id: logId,
        operation_type: log.operation_type,
        operator_id,
        rollback_result: rollbackResult
      })

      return {
        success: true,
        log_id: logId,
        operation_type: log.operation_type,
        rollback_result: rollbackResult
      }
    } catch (error) {
      await transaction.rollback()

      logger.error(`[审计回滚] 回滚失败`, {
        log_id: logId,
        operator_id,
        error: error.message,
        stack: error.stack
      })

      throw error
    }
  }

  /**
   * 获取可回滚的操作列表
   *
   * @param {Object} params - 查询参数
   * @param {number} [params.operator_id] - 操作者ID筛选
   * @param {string} [params.operation_type] - 操作类型筛选
   * @param {Date} [params.start_time] - 开始时间
   * @param {Date} [params.end_time] - 结束时间
   * @param {number} [params.page] - 页码
   * @param {number} [params.page_size] - 每页数量
   * @returns {Promise<Object>} 分页结果
   */
  static async getRollbackableLogs(params = {}) {
    const { operator_id, operation_type, start_time, end_time, page = 1, page_size = 20 } = params

    const where = {
      is_reversible: true,
      is_reversed: false
    }

    if (operator_id) {
      where.operator_id = operator_id
    }

    if (operation_type) {
      where.operation_type = operation_type
    }

    if (start_time || end_time) {
      where.created_at = {}
      if (start_time) {
        where.created_at[Op.gte] = start_time
      }
      if (end_time) {
        where.created_at[Op.lte] = end_time
      }
    }

    const offset = (page - 1) * page_size

    const { count, rows } = await models.AdminOperationLog.findAndCountAll({
      where,
      include: [
        {
          model: models.User,
          as: 'operator',
          attributes: ['user_id', 'nickname']
        }
      ],
      order: [['created_at', 'DESC']],
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
   * 获取回滚历史
   *
   * @param {Object} params - 查询参数
   * @returns {Promise<Object>} 分页结果
   */
  static async getRollbackHistory(params = {}) {
    const { page = 1, page_size = 20 } = params

    const where = {
      is_reversed: true
    }

    const offset = (page - 1) * page_size

    const { count, rows } = await models.AdminOperationLog.findAndCountAll({
      where,
      include: [
        {
          model: models.User,
          as: 'operator',
          attributes: ['user_id', 'nickname']
        }
      ],
      order: [['reversed_at', 'DESC']],
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
   * 评估操作风险等级
   *
   * @param {string} operationType - 操作类型
   * @param {Object} [_context] - 上下文信息（保留供未来扩展）
   * @returns {string} 风险等级（low/medium/high/critical）
   */
  static assessRiskLevel(operationType, _context = {}) {
    // 检查是否在各风险等级中
    for (const [level, operations] of Object.entries(RISK_LEVEL_CONFIG)) {
      if (operations.includes(operationType)) {
        return level
      }
    }

    // 默认为低风险
    return 'low'
  }

  /**
   * 检查操作是否需要审批
   *
   * @param {string} operationType - 操作类型
   * @param {string} riskLevel - 风险等级
   * @returns {boolean} 是否需要审批
   */
  static requiresApproval(operationType, riskLevel) {
    // 关键风险操作需要审批
    if (riskLevel === 'critical') {
      return true
    }

    // 高风险批量操作需要审批
    if (riskLevel === 'high' && operationType.startsWith('batch_')) {
      return true
    }

    return false
  }

  /**
   * 标记操作为可回滚
   *
   * @param {number} logId - 审计日志ID
   * @param {Object} reversalData - 回滚所需数据
   * @param {Object} [options] - Sequelize 选项
   * @returns {Promise<void>} 无返回值
   */
  static async markAsReversible(logId, reversalData, options = {}) {
    await models.AdminOperationLog.update(
      {
        is_reversible: true,
        reversal_data: reversalData
      },
      {
        where: { log_id: logId },
        ...options
      }
    )
  }

  /**
   * 获取审计统计数据
   *
   * @param {Object} params - 查询参数
   * @param {Date} [params.start_time] - 开始时间
   * @param {Date} [params.end_time] - 结束时间
   * @returns {Promise<Object>} 统计数据
   */
  static async getAuditStats(params = {}) {
    const { start_time, end_time } = params

    const where = {}
    if (start_time || end_time) {
      where.created_at = {}
      if (start_time) {
        where.created_at[Op.gte] = start_time
      }
      if (end_time) {
        where.created_at[Op.lte] = end_time
      }
    }

    // 总操作数
    const totalCount = await models.AdminOperationLog.count({ where })

    // 按类型统计
    const byType = await models.AdminOperationLog.findAll({
      where,
      attributes: [
        'operation_type',
        [models.sequelize.fn('COUNT', models.sequelize.col('log_id')), 'count']
      ],
      group: ['operation_type'],
      raw: true
    })

    // 按风险等级统计
    const byRiskLevel = await models.AdminOperationLog.findAll({
      where,
      attributes: [
        'risk_level',
        [models.sequelize.fn('COUNT', models.sequelize.col('log_id')), 'count']
      ],
      group: ['risk_level'],
      raw: true
    })

    // 回滚统计
    const reversedCount = await models.AdminOperationLog.count({
      where: { ...where, is_reversed: true }
    })

    const reversibleCount = await models.AdminOperationLog.count({
      where: { ...where, is_reversible: true, is_reversed: false }
    })

    // 按操作者统计（Top 10）
    const byOperator = await models.AdminOperationLog.findAll({
      where,
      attributes: [
        'operator_id',
        [models.sequelize.fn('COUNT', models.sequelize.col('log_id')), 'count']
      ],
      include: [
        {
          model: models.User,
          as: 'operator',
          attributes: ['nickname']
        }
      ],
      group: ['operator_id', 'operator.user_id', 'operator.nickname'],
      order: [[models.sequelize.fn('COUNT', models.sequelize.col('log_id')), 'DESC']],
      limit: 10,
      raw: false
    })

    return {
      total_operations: totalCount,
      by_type: byType.reduce((acc, item) => {
        acc[item.operation_type] = parseInt(item.count, 10)
        return acc
      }, {}),
      by_risk_level: byRiskLevel.reduce((acc, item) => {
        acc[item.risk_level] = parseInt(item.count, 10)
        return acc
      }, {}),
      reversed_count: reversedCount,
      reversible_count: reversibleCount,
      by_operator: byOperator.map(item => ({
        operator_id: item.operator_id,
        nickname: item.operator?.nickname || 'Unknown',
        count: parseInt(item.dataValues.count, 10)
      }))
    }
  }
}

module.exports = AuditRollbackService
