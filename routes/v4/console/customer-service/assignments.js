/**
 * 客服用户分配管理路由
 *
 * 业务范围：
 * - 用户-客服分配的增删查
 * - 批量分配用户
 *
 * 路由挂载：/api/v4/console/customer-service/assignments
 * 访问权限：管理员（role_level >= 100）
 */

const express = require('express')
const router = express.Router()
const logger = require('../../../../utils/logger').logger
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const TransactionManager = require('../../../../utils/TransactionManager')

/* 所有路由需要管理员权限 */
router.use(authenticateToken, requireRoleLevel(100))

/**
 * GET / — 获取用户分配列表
 *
 * @route GET /api/v4/console/customer-service/assignments
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 * @query {number} [agent_id] - 按客服座席筛选
 * @query {string} [status] - 按分配状态筛选（active/expired/transferred）
 * @query {string} [search] - 搜索（用户昵称/手机号）
 */
router.get('/', async (req, res) => {
  try {
    const service = req.app.locals.services.getService('cs_agent_management')
    const result = await service.getAssignmentList({
      page: req.query.page,
      page_size: req.query.page_size,
      agent_id: req.query.agent_id,
      status: req.query.status,
      search: req.query.search
    })
    res.apiSuccess(result, '获取用户分配列表成功')
  } catch (error) {
    logger.error('获取用户分配列表失败:', error)
    res.apiError(error.message, error.code || 'INTERNAL_ERROR', null, error.statusCode || 500)
  }
})

/**
 * POST / — 分配用户给客服座席
 *
 * @route POST /api/v4/console/customer-service/assignments
 * @body {number} user_id - 被分配的用户ID
 * @body {number} agent_id - 目标客服座席ID
 * @body {string} [notes] - 分配备注
 * @body {string} [expired_at] - 过期时间
 */
router.post('/', async (req, res) => {
  try {
    const { user_id, mobile, agent_id } = req.body
    if (!agent_id) {
      res.apiError('agent_id 为必填字段', 'VALIDATION_ERROR', null, 400)
      return
    }
    if (!user_id && !mobile) {
      res.apiError('user_id 或 mobile 至少提供一个', 'VALIDATION_ERROR', null, 400)
      return
    }

    const service = req.app.locals.services.getService('cs_agent_management')
    const result = await TransactionManager.execute(async transaction => {
      /* 支持手机号分配：通过 mobile 解析 user_id */
      let resolvedUserId = user_id
      if (!resolvedUserId && mobile) {
        resolvedUserId = await service.resolveUserIdByMobile(mobile, { transaction })
      }

      return service.createAssignment(
        {
          ...req.body,
          user_id: resolvedUserId,
          assigned_by: req.user.user_id
        },
        { transaction }
      )
    })
    res.apiSuccess(result, '用户分配成功')
  } catch (error) {
    logger.error('分配用户失败:', error)
    res.apiError(error.message, error.code || 'INTERNAL_ERROR', null, error.statusCode || 500)
  }
})

/**
 * POST /batch — 批量分配用户
 *
 * @route POST /api/v4/console/customer-service/assignments/batch
 * @body {number[]} user_ids - 用户ID列表
 * @body {number} agent_id - 目标客服座席ID
 * @body {string} [notes] - 分配备注
 */
router.post('/batch', async (req, res) => {
  try {
    const { user_ids, agent_id } = req.body
    if (!Array.isArray(user_ids) || user_ids.length === 0 || !agent_id) {
      res.apiError('user_ids（非空数组）和 agent_id 为必填字段', 'VALIDATION_ERROR', null, 400)
      return
    }

    const service = req.app.locals.services.getService('cs_agent_management')
    const result = await TransactionManager.execute(async transaction => {
      return service.batchCreateAssignment(
        {
          ...req.body,
          assigned_by: req.user.user_id
        },
        { transaction }
      )
    })
    res.apiSuccess(result, '批量分配完成')
  } catch (error) {
    logger.error('批量分配用户失败:', error)
    res.apiError(error.message, error.code || 'INTERNAL_ERROR', null, error.statusCode || 500)
  }
})

/**
 * DELETE /:id — 解除用户分配
 *
 * @route DELETE /api/v4/console/customer-service/assignments/:id
 * @param {number} id - 分配记录ID
 */
router.delete('/:id', async (req, res) => {
  try {
    const service = req.app.locals.services.getService('cs_agent_management')
    const result = await TransactionManager.execute(async transaction => {
      return service.removeAssignment(parseInt(req.params.id), { transaction })
    })
    res.apiSuccess(result, '用户分配已解除')
  } catch (error) {
    logger.error('解除用户分配失败:', error)
    res.apiError(error.message, error.code || 'INTERNAL_ERROR', null, error.statusCode || 500)
  }
})

module.exports = router
