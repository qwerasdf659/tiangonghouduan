/**
 * 高风险操作中间件
 *
 * 功能说明：
 * - 风险评估：自动评估操作风险等级
 * - 二次确认：高风险操作要求二次确认
 * - 审计增强：自动标记风险等级和回滚能力
 * - 审批流程：关键操作需要二次审批
 *
 * 任务编号：B-44 高风险操作中间件
 * 创建时间：2026年01月31日
 */

'use strict'

const AuditRollbackService = require('../services/AuditRollbackService')
const logger = require('../utils/logger')

/**
 * 操作类型到风险等级的映射
 */
const OPERATION_RISK_MAP = {
  // 关键风险（critical）- 需要二次审批
  'DELETE /users/:id': 'critical',
  'POST /users/batch-delete': 'critical',
  'POST /system/reset': 'critical',

  // 高风险（high）- 需要二次确认
  'PUT /users/:id/points': 'high',
  'POST /users/:id/points/adjust': 'high',
  'PUT /users/:id/status': 'high',
  'PUT /users/:id/role': 'high',
  'POST /users/batch-update': 'high',
  'DELETE /prizes/:id': 'high',
  'DELETE /campaigns/:id': 'high',

  // 中风险（medium）- 记录审计
  'PUT /exchanges/:id/audit': 'medium',
  'PUT /consumptions/:id/audit': 'medium',
  'PUT /prizes/:id': 'medium',
  'PUT /campaigns/:id': 'medium',
  'POST /prizes': 'medium',
  'POST /campaigns': 'medium',

  // 低风险（low）- 仅记录
  'GET /users': 'low',
  'GET /exports': 'low'
}

/**
 * 需要二次确认的操作路径模式
 */
const CONFIRMATION_REQUIRED_PATTERNS = [
  /DELETE\s+\/(?!exports)/i, // 所有删除操作（导出除外）
  /PUT\s+\/users\/\d+\/points/i, // 积分调整
  /PUT\s+\/users\/\d+\/status/i, // 状态变更
  /batch/i // 批量操作
]

/**
 * 可回滚的操作类型
 */
const REVERSIBLE_OPERATIONS = [
  'points_adjust',
  'user_status_change',
  'exchange_audit',
  'consumption_audit'
]

/**
 * 从请求提取操作标识
 *
 * @param {Object} req - Express请求对象
 * @returns {string} 操作标识（如 "PUT /users/:id/points"）
 */
function extractOperationKey(req) {
  // 将动态参数标准化为 :id 格式
  const path = req.path.replace(/\/\d+/g, '/:id')
  return `${req.method} ${path}`
}

/**
 * 从请求提取操作类型
 *
 * @param {Object} req - Express请求对象
 * @returns {string} 操作类型（如 "points_adjust"）
 */
function extractOperationType(req) {
  const path = req.path.toLowerCase()

  if (path.includes('/points')) {
    return 'points_adjust'
  }
  if (path.includes('/status')) {
    return 'user_status_change'
  }
  if (path.includes('/exchanges') && path.includes('/audit')) {
    return 'exchange_audit'
  }
  if (path.includes('/consumptions') && path.includes('/audit')) {
    return 'consumption_audit'
  }
  if (path.includes('/role')) {
    return 'role_change'
  }
  if (req.method === 'DELETE') {
    return 'delete'
  }
  if (path.includes('batch')) {
    return 'batch_update'
  }

  return 'unknown'
}

/**
 * 检查是否需要二次确认
 *
 * @param {string} operationKey - 操作标识
 * @returns {boolean} 是否需要确认
 */
function requiresConfirmation(operationKey) {
  return CONFIRMATION_REQUIRED_PATTERNS.some(pattern => pattern.test(operationKey))
}

/**
 * 高风险操作中间件
 *
 * 使用示例：
 * router.put('/users/:id/points', highRiskOperationMiddleware, adjustPoints)
 *
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - 下一个中间件
 * @returns {void} 无返回值，通过中间件链传递控制
 */
function highRiskOperationMiddleware(req, res, next) {
  const operationKey = extractOperationKey(req)
  const operationType = extractOperationType(req)

  // 1. 评估风险等级
  const riskLevel =
    OPERATION_RISK_MAP[operationKey] || AuditRollbackService.assessRiskLevel(operationType)

  // 2. 检查是否需要审批
  const needsApproval = AuditRollbackService.requiresApproval(operationType, riskLevel)

  // 3. 检查是否需要二次确认
  const needsConfirmation = requiresConfirmation(operationKey)

  // 4. 检查是否可回滚
  const isReversible = REVERSIBLE_OPERATIONS.includes(operationType)

  // 将风险信息附加到请求对象
  req.riskInfo = {
    operation_key: operationKey,
    operation_type: operationType,
    risk_level: riskLevel,
    requires_approval: needsApproval,
    requires_confirmation: needsConfirmation,
    is_reversible: isReversible
  }

  // 5. 处理需要二次确认的操作
  if (needsConfirmation && !req.body._confirmed) {
    // 如果是高风险操作且未确认，返回确认提示
    if (riskLevel === 'high' || riskLevel === 'critical') {
      logger.warn(`[高风险操作] 需要二次确认`, {
        operation_key: operationKey,
        risk_level: riskLevel,
        user_id: req.user?.user_id,
        path: req.path
      })

      return res.apiError(
        '该操作风险较高，需要二次确认。请在请求中添加 _confirmed: true 参数',
        'CONFIRMATION_REQUIRED',
        {
          risk_level: riskLevel,
          operation_type: operationType,
          requires_confirmation: true
        },
        400
      )
    }
  }

  // 6. 处理需要审批的操作
  if (needsApproval && !req.body._approved) {
    logger.warn(`[关键操作] 需要审批`, {
      operation_key: operationKey,
      risk_level: riskLevel,
      user_id: req.user?.user_id
    })

    return res.apiError(
      '该操作属于关键操作，需要管理员审批',
      'APPROVAL_REQUIRED',
      {
        risk_level: riskLevel,
        operation_type: operationType,
        requires_approval: true
      },
      403
    )
  }

  // 7. 记录高风险操作日志
  if (riskLevel === 'high' || riskLevel === 'critical') {
    logger.info(`[高风险操作] 执行中`, {
      operation_key: operationKey,
      operation_type: operationType,
      risk_level: riskLevel,
      user_id: req.user?.user_id,
      ip: req.ip,
      confirmed: !!req.body._confirmed,
      approved: !!req.body._approved
    })
  }

  next()
}

/**
 * 风险评估中间件（仅评估不拦截）
 *
 * 用于在审计日志记录时附加风险信息
 *
 * @param {Object} req - Express请求对象
 * @param {Object} res - Express响应对象
 * @param {Function} next - 下一个中间件
 * @returns {void} 无返回值，通过中间件链传递控制
 */
function riskAssessmentMiddleware(req, res, next) {
  const operationKey = extractOperationKey(req)
  const operationType = extractOperationType(req)
  const riskLevel =
    OPERATION_RISK_MAP[operationKey] || AuditRollbackService.assessRiskLevel(operationType)
  const isReversible = REVERSIBLE_OPERATIONS.includes(operationType)

  req.riskInfo = {
    operation_key: operationKey,
    operation_type: operationType,
    risk_level: riskLevel,
    is_reversible: isReversible
  }

  next()
}

/**
 * 创建针对特定操作类型的高风险中间件
 *
 * @param {string} operationType - 操作类型
 * @param {string} riskLevel - 风险等级
 * @returns {Function} 中间件函数
 */
function createRiskMiddleware(operationType, riskLevel = 'high') {
  return function (req, res, next) {
    const isReversible = REVERSIBLE_OPERATIONS.includes(operationType)

    req.riskInfo = {
      operation_type: operationType,
      risk_level: riskLevel,
      is_reversible: isReversible
    }

    // 高风险操作需要二次确认
    if ((riskLevel === 'high' || riskLevel === 'critical') && !req.body._confirmed) {
      return res.apiError(
        '该操作风险较高，需要二次确认',
        'CONFIRMATION_REQUIRED',
        { risk_level: riskLevel, requires_confirmation: true },
        400
      )
    }

    logger.info(`[风险操作] ${operationType}`, {
      risk_level: riskLevel,
      user_id: req.user?.user_id,
      path: req.path
    })

    next()
  }
}

module.exports = {
  highRiskOperationMiddleware,
  riskAssessmentMiddleware,
  createRiskMiddleware,
  OPERATION_RISK_MAP,
  REVERSIBLE_OPERATIONS,
  extractOperationType,
  extractOperationKey
}
