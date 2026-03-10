/**
 * 审核链管理模块 — 管理员配置和审核操作（Console 域）
 *
 * @route /api/v4/console/approval-chain
 * @description 审核链模板配置（仅admin）+ 审核操作（content_auditor及以上）
 *
 * 📌 域边界说明（2026-03-10 多级审核链）：
 * - 模板配置路由（templates/*）：仅 admin(role_level>=100) 可操作
 * - 审核操作路由（my-pending/steps/*）：business_manager(role_level>=60) 及以上可进入路由
 *   具体审核权限由 ApprovalChainService.processStep() 精确校验（两层鉴权机制）
 *
 * API列表：
 * - GET    /templates          - 查询审核链模板列表（admin）
 * - GET    /templates/:id      - 查询模板详情（admin）
 * - POST   /templates          - 创建审核链模板（admin）
 * - PUT    /templates/:id      - 更新模板（admin）
 * - PUT    /templates/:id/toggle - 启用/禁用模板（admin）
 * - GET    /instances          - 查询审核链实例列表（content_auditor+）
 * - GET    /instances/:id      - 查询实例详情（content_auditor+）
 * - GET    /my-pending         - 查询当前登录人的待审核步骤（content_auditor+）
 * - POST   /steps/:id/approve  - 审核通过（content_auditor+，Service层精确鉴权）
 * - POST   /steps/:id/reject   - 审核拒绝（content_auditor+，Service层精确鉴权）
 *
 * @module routes/v4/console/approval-chain
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const logger = require('../../../utils/logger').logger
const TransactionManager = require('../../../utils/TransactionManager')
const ContentAuditEngine = require('../../../services/ContentAuditEngine')

/**
 * 获取审核链服务
 * @param {Object} req - Express 请求对象
 * @returns {Object} ApprovalChainService
 */
function getApprovalChainService(req) {
  return req.app.locals.services.getService('approval_chain')
}

// ==================== 模板管理路由（admin only） ====================

/**
 * @route GET /api/v4/console/approval-chain/templates
 * @desc 查询审核链模板列表
 * @access admin(role_level >= 100)
 */
router.get('/templates', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
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
  } catch (error) {
    return handleServiceError(error, res, '查询审核链模板失败')
  }
})

/**
 * @route GET /api/v4/console/approval-chain/templates/:id
 * @desc 查询模板详情（含节点）
 * @access admin(role_level >= 100)
 */
router.get('/templates/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const service = getApprovalChainService(req)
    const template = await service.getTemplateById(parseInt(req.params.id, 10))
    return res.apiSuccess(template, '查询模板详情成功')
  } catch (error) {
    return handleServiceError(error, res, '查询模板详情失败')
  }
})

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
router.post('/templates', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
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

    return res.apiCreated(result, '审核链模板创建成功')
  } catch (error) {
    return handleServiceError(error, res, '创建审核链模板失败')
  }
})

/**
 * @route PUT /api/v4/console/approval-chain/templates/:id
 * @desc 更新模板（含节点）
 * @access admin(role_level >= 100)
 */
router.put('/templates/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const service = getApprovalChainService(req)
    const result = await TransactionManager.execute(
      async transaction => {
        return await service.updateTemplate(parseInt(req.params.id, 10), req.body, { transaction })
      },
      { description: '更新审核链模板' }
    )

    return res.apiSuccess(result, '审核链模板更新成功')
  } catch (error) {
    return handleServiceError(error, res, '更新审核链模板失败')
  }
})

/**
 * @route PUT /api/v4/console/approval-chain/templates/:id/toggle
 * @desc 启用/禁用模板
 * @access admin(role_level >= 100)
 */
router.put('/templates/:id/toggle', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const service = getApprovalChainService(req)
    const result = await TransactionManager.execute(
      async transaction => {
        return await service.toggleTemplate(parseInt(req.params.id, 10), { transaction })
      },
      { description: '启用/禁用审核链模板' }
    )

    return res.apiSuccess(result, `模板已${result.is_active ? '启用' : '禁用'}`)
  } catch (error) {
    return handleServiceError(error, res, '启用/禁用模板失败')
  }
})

// ==================== 实例查询路由（content_auditor+） ====================

/**
 * @route GET /api/v4/console/approval-chain/instances
 * @desc 查询审核链实例列表
 * @access content_auditor(role_level >= 55)
 */
router.get('/instances', authenticateToken, requireRoleLevel(60), async (req, res) => {
  try {
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
  } catch (error) {
    return handleServiceError(error, res, '查询审核链实例失败')
  }
})

/**
 * @route GET /api/v4/console/approval-chain/instances/:id
 * @desc 查询实例详情（含所有步骤和审核历史）
 * @access content_auditor(role_level >= 55)
 */
router.get('/instances/:id', authenticateToken, requireRoleLevel(60), async (req, res) => {
  try {
    const service = getApprovalChainService(req)
    const instance = await service.getInstanceById(parseInt(req.params.id, 10))
    return res.apiSuccess(instance, '查询实例详情成功')
  } catch (error) {
    return handleServiceError(error, res, '查询实例详情失败')
  }
})

// ==================== 审核操作路由（content_auditor+） ====================

/**
 * @route GET /api/v4/console/approval-chain/my-pending
 * @desc 查询当前登录人的待审核步骤
 * @access content_auditor(role_level >= 55)
 */
router.get('/my-pending', authenticateToken, requireRoleLevel(60), async (req, res) => {
  try {
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
  } catch (error) {
    return handleServiceError(error, res, '查询待审核步骤失败')
  }
})

/**
 * @route POST /api/v4/console/approval-chain/steps/:id/approve
 * @desc 审核通过
 * @access content_auditor(role_level >= 55)，Service层精确鉴权
 *
 * @param {number} id - 步骤ID（step_id）
 * @body {string} [reason] - 审批意见
 */
router.post('/steps/:id/approve', authenticateToken, requireRoleLevel(60), async (req, res) => {
  try {
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

        // 终审通过 → 触发 ContentAuditEngine.approve() 执行业务回调
        if (processResult.is_chain_completed && processResult.final_result === 'approved') {
          const instance = processResult.instance
          if (instance.content_review_record_id) {
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
  } catch (error) {
    logger.error('[审核链] 审核通过失败', {
      step_id: req.params.id,
      error: error.message
    })
    return handleServiceError(error, res, '审核通过失败')
  }
})

/**
 * @route POST /api/v4/console/approval-chain/steps/:id/reject
 * @desc 审核拒绝
 * @access content_auditor(role_level >= 55)，Service层精确鉴权
 *
 * @param {number} id - 步骤ID（step_id）
 * @body {string} reason - 拒绝原因（必填，>=5字符）
 */
router.post('/steps/:id/reject', authenticateToken, requireRoleLevel(60), async (req, res) => {
  try {
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

        // 拒绝 → 触发 ContentAuditEngine.reject() 执行业务回调
        if (processResult.is_chain_completed && processResult.final_result === 'rejected') {
          const instance = processResult.instance
          if (instance.content_review_record_id) {
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

    return res.apiSuccess(
      {
        step_id: stepId,
        action: 'rejected',
        is_chain_completed: true,
        final_result: 'rejected'
      },
      '审核拒绝，审核链已结束'
    )
  } catch (error) {
    logger.error('[审核链] 审核拒绝失败', {
      step_id: req.params.id,
      error: error.message
    })
    return handleServiceError(error, res, '审核拒绝失败')
  }
})

module.exports = router
