/**
 * 客服工作台 - 工单管理路由
 *
 * 业务范围：
 * - 工单 CRUD（创建/列表/详情/更新）
 * - 工单内部备注（添加/列表）
 *
 * 路径前缀：/api/v4/console/customer-service/issues
 *
 * 架构规范：
 * - 路由层不直连 models，通过 ServiceManager 获取服务
 * - 写操作使用 TransactionManager.execute 包裹事务
 * - 使用 res.apiSuccess / res.apiError
 *
 * @version 1.0.0
 * @date 2026-02-22
 */

const express = require('express')
const router = express.Router()
const logger = require('../../../../utils/logger').logger
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const TransactionManager = require('../../../../utils/TransactionManager')

/* 所有路由需要后台访问权限 */
router.use(authenticateToken, requireRoleLevel(1))

/**
 * GET /issues - 工单列表
 *
 * @route GET /api/v4/console/customer-service/issues
 * @query {string} [status] - 状态筛选（open/processing/resolved/closed）
 * @query {string} [issue_type] - 类型筛选
 * @query {string} [priority] - 优先级筛选
 * @query {number} [assigned_to] - 负责人ID筛选
 * @query {number} [user_id] - 用户ID筛选
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 */
router.get('/', async (req, res) => {
  try {
    const models = req.app.locals.models
    const IssueService = req.app.locals.services.getService('cs_issue')
    const result = await IssueService.list(models, req.query)

    res.apiSuccess(result, '获取工单列表成功')
  } catch (error) {
    logger.error('获取工单列表失败:', error)
    res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * POST /issues - 创建工单
 *
 * @route POST /api/v4/console/customer-service/issues
 * @body {number} user_id - 关联用户ID
 * @body {string} issue_type - 问题类型
 * @body {string} title - 工单标题
 * @body {string} [description] - 详细描述
 * @body {string} [priority=medium] - 优先级
 * @body {number} [session_id] - 关联会话ID
 * @body {number} [assigned_to] - 指派给的客服ID
 */
router.post('/', async (req, res) => {
  try {
    const { user_id, issue_type, title, description, priority, session_id, assigned_to } = req.body

    if (!user_id || !issue_type || !title) {
      return res.apiError('缺少必填参数：user_id, issue_type, title', 'BAD_REQUEST', null, 400)
    }

    const models = req.app.locals.models
    const IssueService = req.app.locals.services.getService('cs_issue')

    const result = await TransactionManager.execute(
      async transaction => {
        return await IssueService.create(
          models,
          {
            user_id: parseInt(user_id),
            created_by: req.user.user_id,
            issue_type,
            title,
            description,
            priority,
            session_id: session_id ? parseInt(session_id) : null,
            assigned_to: assigned_to ? parseInt(assigned_to) : null
          },
          { transaction }
        )
      },
      { description: 'createIssue' }
    )

    res.apiSuccess(result, '工单创建成功')
  } catch (error) {
    logger.error('创建工单失败:', error)
    res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * GET /issues/:id - 工单详情
 *
 * @route GET /api/v4/console/customer-service/issues/:id
 * @param {number} id - 工单ID（事务实体）
 */
router.get('/:id', async (req, res) => {
  try {
    const issueId = parseInt(req.params.id)
    if (isNaN(issueId) || issueId <= 0) {
      return res.apiError('工单ID无效', 'BAD_REQUEST', null, 400)
    }

    const models = req.app.locals.models
    const IssueService = req.app.locals.services.getService('cs_issue')
    const result = await IssueService.getDetail(models, issueId)

    res.apiSuccess(result, '获取工单详情成功')
  } catch (error) {
    logger.error('获取工单详情失败:', error)
    res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * PUT /issues/:id - 更新工单
 *
 * @route PUT /api/v4/console/customer-service/issues/:id
 * @param {number} id - 工单ID（事务实体）
 * @body {string} [status] - 新状态
 * @body {number} [assigned_to] - 新负责人
 * @body {string} [resolution] - 处理结果
 * @body {string} [priority] - 优先级
 */
router.put('/:id', async (req, res) => {
  try {
    const issueId = parseInt(req.params.id)
    if (isNaN(issueId) || issueId <= 0) {
      return res.apiError('工单ID无效', 'BAD_REQUEST', null, 400)
    }

    const models = req.app.locals.models
    const IssueService = req.app.locals.services.getService('cs_issue')

    const result = await TransactionManager.execute(
      async transaction => {
        return await IssueService.update(models, issueId, req.body, { transaction })
      },
      { description: 'updateIssue' }
    )

    res.apiSuccess(result, '工单更新成功')
  } catch (error) {
    logger.error('更新工单失败:', error)
    res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * GET /issues/:id/notes - 获取工单内部备注
 *
 * @route GET /api/v4/console/customer-service/issues/:id/notes
 * @param {number} id - 工单ID
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 */
router.get('/:id/notes', async (req, res) => {
  try {
    const issueId = parseInt(req.params.id)
    if (isNaN(issueId) || issueId <= 0) {
      return res.apiError('工单ID无效', 'BAD_REQUEST', null, 400)
    }

    const models = req.app.locals.models
    const IssueService = req.app.locals.services.getService('cs_issue')
    const result = await IssueService.getNotes(models, {
      issue_id: issueId,
      page: req.query.page,
      page_size: req.query.page_size
    })

    res.apiSuccess(result, '获取工单备注成功')
  } catch (error) {
    logger.error('获取工单备注失败:', error)
    res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * POST /issues/:id/notes - 添加工单内部备注
 *
 * @route POST /api/v4/console/customer-service/issues/:id/notes
 * @param {number} id - 工单ID
 * @body {string} content - 备注内容
 */
router.post('/:id/notes', async (req, res) => {
  try {
    const issueId = parseInt(req.params.id)
    if (isNaN(issueId) || issueId <= 0) {
      return res.apiError('工单ID无效', 'BAD_REQUEST', null, 400)
    }

    const { content } = req.body
    if (!content || !content.trim()) {
      return res.apiError('备注内容不能为空', 'BAD_REQUEST', null, 400)
    }

    /* 先查工单获取 user_id */
    const models = req.app.locals.models
    const issue = await models.CustomerServiceIssue.findByPk(issueId, { attributes: ['user_id'] })
    if (!issue) {
      return res.apiError('工单不存在', 'NOT_FOUND', null, 404)
    }

    const IssueService = req.app.locals.services.getService('cs_issue')
    const result = await IssueService.addNote(models, {
      issue_id: issueId,
      user_id: issue.user_id,
      author_id: req.user.user_id,
      content: content.trim()
    })

    res.apiSuccess(result, '备注添加成功')
  } catch (error) {
    logger.error('添加工单备注失败:', error)
    res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

module.exports = router
