/**
 * 审核链管理模块 — 管理员配置和审核操作（Console 域）
 *
 * @route /api/v4/console/approval-chain
 * @description 审核链模板配置（仅admin）+ 审核操作（business_manager及以上）
 *
 * 📌 域边界说明（2026-06-20 分级审核链升级）：
 * - 模板配置路由（templates/*）：仅 admin(role_level >= 100) 可操作
 * - 实例查询路由（instances/*）：business_manager(role_level >= 60) 及以上可查看
 * - 审核操作路由（my-pending/steps/*）：merchant_staff(role_level >= 20) 及以上可进入路由
 *   （门槛由 lv60 降至 lv20，覆盖店员/店长/业务经理/区域负责人等所有可能的审核人；
 *    具体"能否审这一步"由 ApprovalChainService.processStep() 按节点配置精确校验 +
 *    门店/区域隔离兜底，形成"粗过滤(lv20) + 精校(角色/门店/层级)"两层纵深防御。
 *    ops(lv30) 为只读角色，进路由后会被 Service 层显式排除，不能成为审核人。）
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
 * - GET    /my-pending         - 查询当前登录人的待审核步骤（merchant_staff+，Service层范围隔离）
 * - POST   /steps/:id/approve  - 审核通过（merchant_staff+，Service层精确鉴权+门店/区域隔离）
 * - POST   /steps/:id/reject   - 审核拒绝（merchant_staff+，Service层精确鉴权+门店/区域隔离）
 * - POST   /steps/batch        - 批量审核（merchant_staff+，逐条精确鉴权）
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
 * @route POST /api/v4/console/approval-chain/templates/check-conflicts
 * @desc 审核链模板保存前冲突预检（只读，不写库）。返回潜在风险供前端提示，不阻断保存。
 * @access admin(role_level >= 100)
 *
 * @body {string} auditable_type - 业务类型（consumption/merchant_points）
 * @body {number} [priority=0] - 优先级
 * @body {Object} [match_conditions] - 匹配条件（如 { min_amount: 500 }）
 * @body {number} [template_id] - 编辑场景传入，比较时排除自身
 */
router.post(
  '/templates/check-conflicts',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const service = getApprovalChainService(req)
    const { auditable_type, priority, match_conditions, template_id } = req.body

    if (!auditable_type) {
      return res.apiBadRequest('auditable_type 必填')
    }

    const result = await service.detectTemplateConflicts({
      auditable_type,
      priority,
      match_conditions,
      template_id
    })

    return res.apiSuccess(result, result.has_risk ? '检测到潜在风险' : '未检测到冲突风险')
  })
)

/**
 * @route POST /api/v4/console/approval-chain/templates
 * @desc 创建审核链模板（含节点）
 * @access admin(role_level >= 100)
 *
 * @body {string} template_name - 模板名称
 * @body {string} auditable_type - 业务类型（consumption/merchant_points）
 * @body {string} [description] - 描述
 * @body {number} [priority=0] - 优先级
 * @body {Object} [match_conditions] - 匹配条件
 * @body {Array} nodes - 节点配置数组
 *
 * 注：template_code（模板编码）由后端自动生成（{业务类型}_序号），无需前端传入。
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

/**
 * @route POST /api/v4/console/approval-chain/templates/batch-assign-reviewer
 * @desc 批量配置审核人（9.3③）：跨多条审核链统一指派某节点的审核人，免逐条编辑
 * @access admin(role_level >= 100)
 *
 * @body {number[]} template_ids - 目标审核链模板ID数组（必填）
 * @body {string|number} [target_step='final'] - 目标节点：'final' 终审节点 / 数字步号
 * @body {string} assignee_type - 分配方式：role / user / submitter_manager
 * @body {number} [assignee_role_id] - 角色池模式必填
 * @body {number} [assignee_user_id] - 指定人模式必填
 */
router.post(
  '/templates/batch-assign-reviewer',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const service = getApprovalChainService(req)
    const { template_ids, target_step, assignee_type, assignee_role_id, assignee_user_id } =
      req.body

    const result = await TransactionManager.execute(
      async transaction => {
        return await service.batchAssignNodeReviewer(
          { template_ids, target_step, assignee_type, assignee_role_id, assignee_user_id },
          { transaction }
        )
      },
      { description: '批量配置审核链审核人' }
    )

    getAuditLogService(req)
      .logOperation({
        operator_id: req.user.user_id,
        operation_type: OPERATION_TYPES.APPROVAL_CHAIN_CONFIG,
        target_type: 'approval_chain_template',
        target_id: null,
        action: 'update',
        after_data: {
          batch_assign: true,
          template_ids,
          target_step: target_step || 'final',
          assignee_type,
          stats: result.stats
        }
      })
      .catch(err => logger.warn('[审核链] 批量配置审核人审计日志失败（非致命）:', err.message))

    return res.apiSuccess(result, '批量配置审核人完成')
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

// ==================== 数据统计路由（admin） ====================

/**
 * @route GET /api/v4/console/approval-chain/stats
 * @desc 审核数据统计聚合（Web 管理端数据看板）：按门店/区域的待审/已审/通过/拒绝/超时/通过率/金额/积分
 * @access admin(role_level >= 100)
 *
 * @query {string} [dimension=store] - 聚合维度：store=按门店，region=按区域（经 user_hierarchy 聚合）
 */
router.get(
  '/stats',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const service = getApprovalChainService(req)
    const result = await service.getApprovalStats({ dimension: req.query.dimension })
    return res.apiSuccess(result, '查询审核统计成功')
  })
)

/**
 * @route GET /api/v4/console/approval-chain/analytics
 * @desc 运营分析看板（8.4.3）：员工录入排行 / 消费趋势 / 拒绝原因TOP / 用户复购活跃（脱敏，仅管理端）
 * @access admin(role_level >= 100)
 *
 * @query {number} [days=30] - 分析时间窗（天）
 * @query {number} [store_id] - 可选，限定门店
 */
router.get(
  '/analytics',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const service = getApprovalChainService(req)
    const result = await service.getOperationAnalytics({
      days: req.query.days,
      store_id: req.query.store_id
    })
    return res.apiSuccess(result, '查询运营分析成功')
  })
)

// ==================== 审核操作路由（merchant_staff+） ====================

/**
 * @route GET /api/v4/console/approval-chain/my-pending
 * @desc 查询当前登录人的待审核步骤（Service 层叠加门店/区域范围隔离）
 * @access merchant_staff(role_level >= 20)
 */
router.get(
  '/my-pending',
  authenticateToken,
  requireRoleLevel(20),
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
 * @access merchant_staff(role_level >= 20)，Service层精确鉴权+门店/区域隔离
 *
 * @param {number} id - 步骤ID（step_id）
 * @body {string} [reason] - 审批意见
 */
router.post(
  '/steps/:id/approve',
  authenticateToken,
  requireRoleLevel(20),
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
 * @access merchant_staff(role_level >= 20)，Service层精确鉴权+门店/区域隔离
 *
 * @param {number} id - 步骤ID（step_id）
 * @body {string} reason - 拒绝原因（必填，>=5字符）
 */
router.post(
  '/steps/:id/reject',
  authenticateToken,
  requireRoleLevel(20),
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

/**
 * @route POST /api/v4/console/approval-chain/steps/batch
 * @desc 批量审核步骤（批量通过/拒绝，收口到审核链，逐条复用 processStep）
 * @access merchant_staff(role_level >= 20)，Service 层逐条精确鉴权+门店/区域隔离
 *
 * @body {number[]} step_ids - 待审步骤ID数组（来自 my-pending，必填，最多100条）
 * @body {string}   action   - 审核动作：approve | reject（必填）
 * @body {string}   reason   - 审核原因（reject 必填且 >=5 字符）
 *
 * 说明：批量是"逐条独立事务循环 processStep"的封装，单条失败不影响其它；
 *      终审发积分/改状态闭环由 Service 内复刻触发，结果与单条接口完全一致。
 */
router.post(
  '/steps/batch',
  authenticateToken,
  requireRoleLevel(20),
  asyncHandler(async (req, res) => {
    const service = getApprovalChainService(req)
    const { step_ids, action, reason } = req.body

    if (!Array.isArray(step_ids) || step_ids.length === 0) {
      return res.apiBadRequest('step_ids 必须是非空数组')
    }
    if (step_ids.length > 100) {
      return res.apiBadRequest('单次批量最多处理 100 条步骤')
    }
    if (!['approve', 'reject'].includes(action)) {
      return res.apiBadRequest('action 必须是 approve 或 reject')
    }
    if (action === 'reject' && (!reason || reason.trim().length < 5)) {
      return res.apiBadRequest('拒绝原因必须提供，且不少于5个字符')
    }

    const result = await service.processStepsBatch(step_ids, action, reason, req.user.user_id)

    logger.info('[审核链] 批量审核', {
      operator_id: req.user.user_id,
      action,
      total: result.stats.total,
      success_count: result.stats.success_count,
      failed_count: result.stats.failed_count
    })

    getAuditLogService(req)
      .logOperation({
        operator_id: req.user.user_id,
        operation_type: OPERATION_TYPES.APPROVAL_CHAIN_AUDIT,
        target_type: 'approval_chain_step',
        target_id: null,
        action: `batch_${action}`,
        after_data: { stats: result.stats },
        reason: reason || '批量审核'
      })
      .catch(err => logger.warn('[审核链] 审计日志写入失败（非致命）:', err.message))

    pushApprovalChainSocketEvent(req, 'approval_chain_step_batch', {
      action,
      stats: result.stats,
      operator_id: req.user.user_id
    })

    return res.apiSuccess(result, '批量审核完成')
  })
)

module.exports = router
