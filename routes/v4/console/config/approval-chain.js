/**
 * 审核链管理模块 — 管理员配置和审核操作（Console 域）
 *
 * @route /api/v4/console/approval-chain
 * @description 审核链模板配置（仅admin）+ 审核操作（business_manager及以上）
 *
 * 📌 域边界说明（2026-03-10 多级审核链）：
 * - 模板配置路由（templates/*）：仅 admin(role_level >= 100) 可操作
 * - 实例查询路由（instances/*）：business_manager(role_level >= 60) 及以上可查看
 * - 审核操作路由（my-pending/steps/*）：business_manager(role_level >= 60) 及以上可进入路由
 *   具体审核权限由 ApprovalChainService.processStep() 精确校验（两层鉴权机制）
 *
 * API列表：
 * - GET    /templates          - 查询审核链模板列表（admin）
 * - GET    /templates/:id      - 查询模板详情（admin）
 * - POST   /templates          - 创建审核链模板（admin）
 * - PUT    /templates/:id      - 更新模板（admin）
 * - PUT    /templates/:id/toggle - 启用/禁用模板（admin）
 * - GET    /instances          - 查询审核链实例列表（business_manager+）
 * - GET    /instances/:id      - 查询实例详情（business_manager+）
 * - GET    /instances/by-auditable - 按业务记录查询审核链实例（business_manager+）
 * - GET    /my-pending         - 查询当前登录人的待审核步骤（business_manager+）
 * - POST   /steps/:id/approve  - 审核通过（business_manager+，Service层精确鉴权）
 * - POST   /steps/:id/reject   - 审核拒绝（business_manager+，Service层精确鉴权）
 *
 * @module routes/v4/console/config/approval-chain
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const { asyncHandler } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger
const TransactionManager = require('../../../../utils/TransactionManager')
const { OPERATION_TYPES } = require('../../../../constants/AuditOperationTypes')

/**
 * 从 ServiceManager 获取审计日志服务
 * @param {Object} req - Express 请求对象
 * @returns {Object} AuditLogService 实例
 */
const getAuditLogService = req => req.app.locals.services.getService('audit_log')

/**
 * 获取审核链服务
 * @param {Object} req - Express 请求对象
 * @returns {Object} ApprovalChainService
 */
function getApprovalChainService(req) {
  return req.app.locals.services.getService('approval_chain')
}

/**
 * 获取内容审核引擎（通过 ServiceManager 统一入口）
 * @param {Object} req - Express 请求对象
 * @returns {Object} ContentAuditEngine
 */
function getContentAuditEngine(req) {
  return req.app.locals.services.getService('content_audit')
}

/**
 * 通过 Socket.IO 推送审核链事件通知（非致命，失败仅记录日志）
 * @param {Object} req - Express 请求对象
 * @param {string} event - 事件类型
 * @param {Object} data - 事件数据
 * @returns {void}
 */
function pushApprovalChainSocketEvent(req, event, data) {
  try {
    const wsService = req.app.locals.services.getService('chat_web_socket')
    if (wsService && typeof wsService.broadcastNotificationToAllAdmins === 'function') {
      wsService.broadcastNotificationToAllAdmins({
        type: event,
        ...data,
        timestamp: new Date().toISOString()
      })
    }
  } catch (err) {
    logger.warn(`[审核链] Socket.IO推送失败（非致命）: ${err.message}`)
  }
}

// ==================== 模板管理路由（admin only） ====================

/**
 * @route GET /api/v4/console/approval-chain/templates
 * @desc 查询审核链模板列表
 * @access admin(role_level >= 100)
 */
router.get(
  '/templates',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const service = getApprovalChainService(req)
    const result = await service.getTemplates(req.query)
    return res.apiPaginated(
      result.rows,
      {
        page: result.page,
        page_size: result.page_size,
        total: result.count,
        total_pages: result.total_pages
      },
      '查询审核链模板成功'
    )
  })
)

/**
 * @route GET /api/v4/console/approval-chain/templates/:id
 * @desc 查询模板详情（含节点）
 * @access admin(role_level >= 100)
 */
router.get(
  '/templates/:id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const service = getApprovalChainService(req)
    const template = await service.getTemplateById(parseInt(req.params.id, 10))
    return res.apiSuccess(template, '查询模板详情成功')
  })
)

/**
 * @route POST /api/v4/console/approval-chain/templates
 * @desc 创建审核链模板（含节点）
 * @access admin(role_level >= 100)
 *
 * @body {string} template_code - 模板编码（唯一）
 * @body {string} template_name - 模板名称
 * @body {string} auditable_type - 业务类型（consumption/merchant_points/exchange）
 * @body {string} [description] - 描述
 * @body {number} [priority=0] - 优先级
 * @body {Object} [match_conditions] - 匹配条件
 * @body {Array} nodes - 节点配置数组
 */
router.post(
  '/templates',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const service = getApprovalChainService(req)
    const result = await TransactionManager.execute(
      async transaction => {
        return await service.createTemplate(
          {
            ...req.body,
            created_by: req.user.user_id
          },
          { transaction }
        )
      },
      { description: '创建审核链模板' }
    )

    getAuditLogService(req)
      .logOperation({
        operator_id: req.user.user_id,
        operation_type: OPERATION_TYPES.APPROVAL_CHAIN_CONFIG,
        target_type: 'approval_chain_template',
        target_id: result.template_id,
        action: 'create',
        after_data: { template_code: result.template_code, auditable_type: result.auditable_type }
      })
      .catch(err => logger.warn('[审核链] 模板创建审计日志失败（非致命）:', err.message))

    return res.apiCreated(result, '审核链模板创建成功')
  })
)

/**
 * @route PUT /api/v4/console/approval-chain/templates/:id
 * @desc 更新模板（含节点）
 * @access admin(role_level >= 100)
 */
router.put(
  '/templates/:id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const service = getApprovalChainService(req)
    const templateId = parseInt(req.params.id, 10)
    const result = await TransactionManager.execute(
      async transaction => {
        return await service.updateTemplate(templateId, req.body, { transaction })
      },
      { description: '更新审核链模板' }
    )

    getAuditLogService(req)
      .logOperation({
        operator_id: req.user.user_id,
        operation_type: OPERATION_TYPES.APPROVAL_CHAIN_CONFIG,
        target_type: 'approval_chain_template',
        target_id: templateId,
        action: 'update',
        after_data: req.body
      })
      .catch(err => logger.warn('[审核链] 模板更新审计日志失败（非致命）:', err.message))

    return res.apiSuccess(result, '审核链模板更新成功')
  })
)

/**
 * @route PUT /api/v4/console/approval-chain/templates/:id/toggle
 * @desc 启用/禁用模板
 * @access admin(role_level >= 100)
 */
router.put(
  '/templates/:id/toggle',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const service = getApprovalChainService(req)
    const templateId = parseInt(req.params.id, 10)
    const result = await TransactionManager.execute(
      async transaction => {
        return await service.toggleTemplate(templateId, { transaction })
      },
      { description: '启用/禁用审核链模板' }
    )

    getAuditLogService(req)
      .logOperation({
        operator_id: req.user.user_id,
        operation_type: OPERATION_TYPES.APPROVAL_CHAIN_CONFIG,
        target_type: 'approval_chain_template',
        target_id: templateId,
        action: result.is_active ? 'enable' : 'disable'
      })
      .catch(err => logger.warn('[审核链] 模板启停审计日志失败（非致命）:', err.message))

    return res.apiSuccess(result, `模板已${result.is_active ? '启用' : '禁用'}`)
  })
)

// ==================== 实例查询路由（business_manager+） ====================

/**
 * @route GET /api/v4/console/approval-chain/instances
 * @desc 查询审核链实例列表
 * @access business_manager(role_level >= 60)
 */
router.get(
  '/instances',
  authenticateToken,
  requireRoleLevel(60),
  asyncHandler(async (req, res) => {
    const service = getApprovalChainService(req)
    const result = await service.getInstances(req.query)
    return res.apiPaginated(
      result.rows,
      {
        page: result.page,
        page_size: result.page_size,
        total: result.count,
        total_pages: result.total_pages
      },
      '查询审核链实例成功'
    )
  })
)

/**
 * @route GET /api/v4/console/approval-chain/instances/by-auditable
 * @desc 按业务记录查询审核链实例（finance-management 等页面集成审核链进度）
 * @access business_manager(role_level >= 60)
 *
 * @query {string} auditable_type - 业务类型（consumption/merchant_points/exchange）
 * @query {number} auditable_id - 业务记录ID
 */
router.get(
  '/instances/by-auditable',
  authenticateToken,
  requireRoleLevel(60),
  asyncHandler(async (req, res) => {
    const service = getApprovalChainService(req)
    const { auditable_type, auditable_id } = req.query

    if (!auditable_type || !auditable_id) {
      return res.apiBadRequest('auditable_type 和 auditable_id 必填')
    }

    const instance = await service.getInstanceByAuditable(
      auditable_type,
      parseInt(auditable_id, 10)
    )

    return res.apiSuccess(instance, instance ? '查询审核链实例成功' : '该业务记录无审核链实例')
  })
)

/**
 * @route GET /api/v4/console/approval-chain/instances/:id
 * @desc 查询实例详情（含所有步骤和审核历史）
 * @access business_manager(role_level >= 60)
 */
router.get(
  '/instances/:id',
  authenticateToken,
  requireRoleLevel(60),
  asyncHandler(async (req, res) => {
    const service = getApprovalChainService(req)
    const instance = await service.getInstanceById(parseInt(req.params.id, 10))
    return res.apiSuccess(instance, '查询实例详情成功')
  })
)

/**
 * @route GET /api/v4/console/approval-chain/role-pending
 * @desc 按角色查询待审核步骤（角色池审核队列）
 * @access admin(role_level >= 100)
 *
 * @query {number} role_id - 角色ID（必填）
 * @query {string} [auditable_type] - 按业务类型筛选
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 */
router.get(
  '/role-pending',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const service = getApprovalChainService(req)
    const { role_id, auditable_type, page, page_size } = req.query

    if (!role_id) {
      return res.apiBadRequest('role_id 必填')
    }

    const result = await service.getPendingStepsForRole(parseInt(role_id, 10), {
      auditable_type,
      page: parseInt(page, 10) || 1,
      page_size: parseInt(page_size, 10) || 20
    })

    return res.apiPaginated(
      result.rows,
      {
        page: result.page,
        page_size: result.page_size,
        total: result.count,
        total_pages: result.total_pages
      },
      '查询角色待审核步骤成功'
    )
  })
)

// ==================== 审核操作路由（business_manager+） ====================

/**
 * @route GET /api/v4/console/approval-chain/my-pending
 * @desc 查询当前登录人的待审核步骤
 * @access business_manager(role_level >= 60)
 */
router.get(
  '/my-pending',
  authenticateToken,
  requireRoleLevel(60),
  asyncHandler(async (req, res) => {
    const service = getApprovalChainService(req)
    const result = await service.getPendingStepsForUser(req.user.user_id, req.query)
    return res.apiPaginated(
      result.rows,
      {
        page: result.page,
        page_size: result.page_size,
        total: result.count,
        total_pages: result.total_pages
      },
      '查询待审核步骤成功'
    )
  })
)

/**
 * @route POST /api/v4/console/approval-chain/steps/:id/approve
 * @desc 审核通过
 * @access business_manager(role_level >= 60)，Service层精确鉴权
 *
 * @param {number} id - 步骤ID（step_id）
 * @body {string} [reason] - 审批意见
 */
router.post(
  '/steps/:id/approve',
  authenticateToken,
  requireRoleLevel(60),
  asyncHandler(async (req, res) => {
    const service = getApprovalChainService(req)
    const stepId = parseInt(req.params.id, 10)
    const { reason } = req.body

    const result = await TransactionManager.execute(
      async transaction => {
        const processResult = await service.processStep(
          stepId,
          'approve',
          reason,
          req.user.user_id,
          { transaction }
        )

        if (processResult.is_chain_completed && processResult.final_result === 'approved') {
          const instance = processResult.instance
          if (instance.content_review_record_id) {
            const ContentAuditEngine = getContentAuditEngine(req)
            await ContentAuditEngine.approve(
              instance.content_review_record_id,
              req.user.user_id,
              reason || '审核链终审通过',
              { transaction }
            )
          }
        }

        return processResult
      },
      { description: '审核链步骤审核通过' }
    )

    logger.info('[审核链] 步骤审核通过', {
      step_id: stepId,
      operator_id: req.user.user_id,
      is_chain_completed: result.is_chain_completed,
      final_result: result.final_result
    })

    getAuditLogService(req)
      .logOperation({
        operator_id: req.user.user_id,
        operation_type: OPERATION_TYPES.APPROVAL_CHAIN_AUDIT,
        target_type: 'approval_chain_step',
        target_id: stepId,
        action: 'approve',
        after_data: {
          is_chain_completed: result.is_chain_completed,
          final_result: result.final_result
        },
        reason: reason || '审核通过'
      })
      .catch(err => logger.warn('[审核链] 审计日志写入失败（非致命）:', err.message))

    pushApprovalChainSocketEvent(req, 'approval_chain_step_approved', {
      step_id: stepId,
      is_chain_completed: result.is_chain_completed,
      final_result: result.final_result,
      operator_id: req.user.user_id
    })

    return res.apiSuccess(
      {
        step_id: stepId,
        action: 'approved',
        is_chain_completed: result.is_chain_completed,
        final_result: result.final_result || null,
        next_step_number: result.next_step_number || null
      },
      result.is_chain_completed ? '终审通过，审核链已完成' : '审核通过，已推进到下一步'
    )
  })
)

/**
 * @route POST /api/v4/console/approval-chain/steps/:id/reject
 * @desc 审核拒绝
 * @access business_manager(role_level >= 60)，Service层精确鉴权
 *
 * @param {number} id - 步骤ID（step_id）
 * @body {string} reason - 拒绝原因（必填，>=5字符）
 */
router.post(
  '/steps/:id/reject',
  authenticateToken,
  requireRoleLevel(60),
  asyncHandler(async (req, res) => {
    const service = getApprovalChainService(req)
    const stepId = parseInt(req.params.id, 10)
    const { reason } = req.body

    if (!reason || reason.trim().length < 5) {
      return res.apiBadRequest('拒绝原因必须提供，且不少于5个字符')
    }

    const _result = await TransactionManager.execute(
      async transaction => {
        const processResult = await service.processStep(
          stepId,
          'reject',
          reason,
          req.user.user_id,
          { transaction }
        )

        if (processResult.is_chain_completed && processResult.final_result === 'rejected') {
          const instance = processResult.instance
          if (instance.content_review_record_id) {
            const ContentAuditEngine = getContentAuditEngine(req)
            await ContentAuditEngine.reject(
              instance.content_review_record_id,
              req.user.user_id,
              reason,
              { transaction }
            )
          }
        }

        return processResult
      },
      { description: '审核链步骤审核拒绝' }
    )

    logger.info('[审核链] 步骤审核拒绝', {
      step_id: stepId,
      operator_id: req.user.user_id
    })

    getAuditLogService(req)
      .logOperation({
        operator_id: req.user.user_id,
        operation_type: OPERATION_TYPES.APPROVAL_CHAIN_AUDIT,
        target_type: 'approval_chain_step',
        target_id: stepId,
        action: 'reject',
        after_data: { is_chain_completed: true, final_result: 'rejected' },
        reason
      })
      .catch(err => logger.warn('[审核链] 审计日志写入失败（非致命）:', err.message))

    pushApprovalChainSocketEvent(req, 'approval_chain_step_rejected', {
      step_id: stepId,
      is_chain_completed: true,
      final_result: 'rejected',
      operator_id: req.user.user_id
    })

    return res.apiSuccess(
      {
        step_id: stepId,
        action: 'rejected',
        is_chain_completed: true,
        final_result: 'rejected'
      },
      '审核拒绝，审核链已结束'
    )
  })
)

module.exports = router
