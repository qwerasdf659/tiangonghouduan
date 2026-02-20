/**
 * 客服座席管理路由
 *
 * 业务范围：
 * - 客服座席的增删改查
 * - 客服工作负载概览
 *
 * 路由挂载：/api/v4/console/customer-service/agents
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
 * GET / — 获取客服座席列表
 *
 * @route GET /api/v4/console/customer-service/agents
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 * @query {string} [status] - 座席状态（active/inactive/on_break）
 * @query {string} [search] - 搜索（昵称/手机号）
 */
router.get('/', async (req, res) => {
  try {
    const service = req.app.locals.services.getService('cs_agent_management')
    const result = await service.getAgentList({
      page: req.query.page,
      page_size: req.query.page_size,
      status: req.query.status,
      search: req.query.search
    })
    res.apiSuccess(result, '获取客服座席列表成功')
  } catch (error) {
    logger.error('获取客服座席列表失败:', error)
    res.apiError(error.message, error.code || 'INTERNAL_ERROR', null, error.statusCode || 500)
  }
})

/**
 * GET /lookup-user — 根据手机号查找用户（座席注册/分配前的预检）
 *
 * @route GET /api/v4/console/customer-service/agents/lookup-user
 * @query {string} mobile - 手机号码
 */
router.get('/lookup-user', async (req, res) => {
  try {
    const { mobile } = req.query
    if (!mobile) {
      res.apiError('请提供手机号', 'VALIDATION_ERROR', null, 400)
      return
    }

    const service = req.app.locals.services.getService('cs_agent_management')
    const result = await service.lookupUserByMobile(mobile)
    res.apiSuccess(result, '查询用户成功')
  } catch (error) {
    logger.error('查询用户失败:', error)
    res.apiError(error.message, error.code || 'INTERNAL_ERROR', null, error.statusCode || 500)
  }
})

/**
 * GET /workload — 获取客服工作负载概览
 *
 * @route GET /api/v4/console/customer-service/agents/workload
 */
router.get('/workload', async (req, res) => {
  try {
    const service = req.app.locals.services.getService('cs_agent_management')
    const result = await service.getWorkloadOverview()
    res.apiSuccess(result, '获取工作负载概览成功')
  } catch (error) {
    logger.error('获取工作负载概览失败:', error)
    res.apiError(error.message, error.code || 'INTERNAL_ERROR', null, error.statusCode || 500)
  }
})

/**
 * GET /:id — 获取客服座席详情
 *
 * @route GET /api/v4/console/customer-service/agents/:id
 * @param {number} id - 客服座席ID（事务实体使用 :id）
 */
router.get('/:id', async (req, res) => {
  try {
    const service = req.app.locals.services.getService('cs_agent_management')
    const result = await service.getAgentDetail(parseInt(req.params.id))
    res.apiSuccess(result, '获取客服座席详情成功')
  } catch (error) {
    logger.error('获取客服座席详情失败:', error)
    res.apiError(error.message, error.code || 'INTERNAL_ERROR', null, error.statusCode || 500)
  }
})

/**
 * POST / — 注册客服座席
 *
 * @route POST /api/v4/console/customer-service/agents
 * @body {number} user_id - 要注册为客服的用户ID
 * @body {string} display_name - 客服显示名称
 * @body {number} [max_concurrent_sessions=10] - 最大并发会话数
 * @body {string[]} [specialty] - 擅长领域标签
 * @body {number} [priority=0] - 分配优先级
 * @body {boolean} [is_auto_assign_enabled=true] - 是否参与自动分配
 */
router.post('/', async (req, res) => {
  try {
    const { user_id, mobile } = req.body

    if (!user_id && !mobile) {
      res.apiError('user_id 或 mobile 至少提供一个', 'VALIDATION_ERROR', null, 400)
      return
    }

    const service = req.app.locals.services.getService('cs_agent_management')
    const result = await TransactionManager.execute(async transaction => {
      /* 支持手机号注册：通过 mobile 解析 user_id */
      let resolvedUserId = user_id
      if (!resolvedUserId && mobile) {
        resolvedUserId = await service.resolveUserIdByMobile(mobile, { transaction })
      }

      /*
       * display_name 自动补全逻辑：
       * 1. 前端显式传入 → 直接使用
       * 2. 前端未传入 → 从用户 nickname 自动获取
       * 3. nickname 也为空 → 使用 "客服_" + 手机号后四位
       */
      let resolvedDisplayName = (req.body.display_name || '').trim()
      if (!resolvedDisplayName) {
        const models = require('../../../../models')
        const user = await models.User.findByPk(resolvedUserId, {
          attributes: ['nickname', 'mobile'],
          transaction
        })
        if (user) {
          resolvedDisplayName = user.nickname || '客服_' + (user.mobile || '').slice(-4)
        }
      }

      if (!resolvedDisplayName) {
        const err = new Error('无法确定客服显示名称，请提供 display_name')
        err.statusCode = 400
        err.code = 'VALIDATION_ERROR'
        throw err
      }

      return service.createAgent(
        { ...req.body, user_id: resolvedUserId, display_name: resolvedDisplayName },
        { transaction }
      )
    })
    res.apiSuccess(result, '客服座席注册成功')
  } catch (error) {
    logger.error('注册客服座席失败:', error)
    res.apiError(error.message, error.code || 'INTERNAL_ERROR', null, error.statusCode || 500)
  }
})

/**
 * PUT /:id — 更新客服座席配置
 *
 * @route PUT /api/v4/console/customer-service/agents/:id
 * @param {number} id - 客服座席ID
 */
router.put('/:id', async (req, res) => {
  try {
    const service = req.app.locals.services.getService('cs_agent_management')
    const result = await TransactionManager.execute(async transaction => {
      return service.updateAgent(parseInt(req.params.id), req.body, { transaction })
    })
    res.apiSuccess(result, '客服座席配置更新成功')
  } catch (error) {
    logger.error('更新客服座席失败:', error)
    res.apiError(error.message, error.code || 'INTERNAL_ERROR', null, error.statusCode || 500)
  }
})

/**
 * DELETE /:id — 删除客服座席
 *
 * @route DELETE /api/v4/console/customer-service/agents/:id
 * @param {number} id - 客服座席ID
 */
router.delete('/:id', async (req, res) => {
  try {
    const service = req.app.locals.services.getService('cs_agent_management')
    const result = await TransactionManager.execute(async transaction => {
      return service.deleteAgent(parseInt(req.params.id), { transaction })
    })
    res.apiSuccess(result, '客服座席删除成功')
  } catch (error) {
    logger.error('删除客服座席失败:', error)
    res.apiError(error.message, error.code || 'INTERNAL_ERROR', null, error.statusCode || 500)
  }
})

module.exports = router
