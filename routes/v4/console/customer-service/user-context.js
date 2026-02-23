/**
 * 客服工作台 - 用户上下文聚合查询路由
 *
 * 业务范围：
 * - 用户画像摘要（getSummary）
 * - 资产余额 + 变动流水（getAssets）
 * - 背包物品列表（getBackpack）
 * - 抽奖记录 + 统计（getLottery）
 * - 交易订单 + 挂单（getTrades）
 * - 混合业务时间线（getTimeline）
 * - 风控信息（getRisk）
 * - 历史会话（getHistory）
 * - 一键诊断（diagnose）
 *
 * 全部为只读GET接口，不涉及数据变更
 *
 * 路径前缀：/api/v4/console/customer-service/user-context
 *
 * 架构规范：
 * - 路由层不直连 models，通过 ServiceManager 获取服务
 * - 使用 res.apiSuccess / res.apiError（ApiResponse 中间件注入模式）
 *
 * @version 1.0.0
 * @date 2026-02-22
 */

const express = require('express')
const router = express.Router()
const logger = require('../../../../utils/logger').logger
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')

/* 所有路由需要后台访问权限 */
router.use(authenticateToken, requireRoleLevel(1))

/**
 * GET /user-context/:userId/summary - 用户画像聚合摘要
 *
 * @route GET /api/v4/console/customer-service/user-context/:userId/summary
 * @param {number} userId - 用户ID（事务实体）
 */
router.get('/:userId/summary', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId)
    if (isNaN(userId) || userId <= 0) {
      return res.apiError('用户ID无效', 'BAD_REQUEST', null, 400)
    }

    const models = req.app.locals.models
    const UserContextService = req.app.locals.services.getService('cs_user_context')
    const result = await UserContextService.getSummary(models, userId)

    return res.apiSuccess(result, '获取用户画像摘要成功')
  } catch (error) {
    logger.error('获取用户画像摘要失败:', error)
    return res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * GET /user-context/:userId/assets - 资产余额 + 最近变动
 *
 * @route GET /api/v4/console/customer-service/user-context/:userId/assets
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=10] - 每页数量
 */
router.get('/:userId/assets', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId)
    if (isNaN(userId) || userId <= 0) {
      return res.apiError('用户ID无效', 'BAD_REQUEST', null, 400)
    }

    const models = req.app.locals.models
    const UserContextService = req.app.locals.services.getService('cs_user_context')
    const result = await UserContextService.getAssets(models, userId, req.query)

    return res.apiSuccess(result, '获取用户资产信息成功')
  } catch (error) {
    logger.error('获取用户资产信息失败:', error)
    return res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * GET /user-context/:userId/backpack - 背包物品列表
 *
 * @route GET /api/v4/console/customer-service/user-context/:userId/backpack
 * @query {string} [status] - 状态筛选（available/locked/transferred/used/expired）
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 */
router.get('/:userId/backpack', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId)
    if (isNaN(userId) || userId <= 0) {
      return res.apiError('用户ID无效', 'BAD_REQUEST', null, 400)
    }

    const models = req.app.locals.models
    const UserContextService = req.app.locals.services.getService('cs_user_context')
    const result = await UserContextService.getBackpack(models, userId, req.query)

    return res.apiSuccess(result, '获取用户背包信息成功')
  } catch (error) {
    logger.error('获取用户背包信息失败:', error)
    return res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * GET /user-context/:userId/lottery - 抽奖记录 + 统计
 *
 * @route GET /api/v4/console/customer-service/user-context/:userId/lottery
 * @query {string} [lottery_campaign_id] - 活动ID筛选
 * @query {string} [reward_tier] - 档位筛选
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=10] - 每页数量
 */
router.get('/:userId/lottery', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId)
    if (isNaN(userId) || userId <= 0) {
      return res.apiError('用户ID无效', 'BAD_REQUEST', null, 400)
    }

    const models = req.app.locals.models
    const UserContextService = req.app.locals.services.getService('cs_user_context')
    const result = await UserContextService.getLottery(models, userId, req.query)

    return res.apiSuccess(result, '获取用户抽奖记录成功')
  } catch (error) {
    logger.error('获取用户抽奖记录失败:', error)
    return res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * GET /user-context/:userId/trades - 交易订单 + 市场挂单
 *
 * @route GET /api/v4/console/customer-service/user-context/:userId/trades
 * @query {string} [role=all] - 角色筛选（buyer/seller/all）
 * @query {string} [status] - 状态筛选
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=10] - 每页数量
 */
router.get('/:userId/trades', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId)
    if (isNaN(userId) || userId <= 0) {
      return res.apiError('用户ID无效', 'BAD_REQUEST', null, 400)
    }

    const models = req.app.locals.models
    const UserContextService = req.app.locals.services.getService('cs_user_context')
    const result = await UserContextService.getTrades(models, userId, req.query)

    return res.apiSuccess(result, '获取用户交易信息成功')
  } catch (error) {
    logger.error('获取用户交易信息失败:', error)
    return res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * GET /user-context/:userId/timeline - 混合业务时间线
 *
 * @route GET /api/v4/console/customer-service/user-context/:userId/timeline
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 */
router.get('/:userId/timeline', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId)
    if (isNaN(userId) || userId <= 0) {
      return res.apiError('用户ID无效', 'BAD_REQUEST', null, 400)
    }

    const models = req.app.locals.models
    const UserContextService = req.app.locals.services.getService('cs_user_context')
    const result = await UserContextService.getTimeline(models, userId, req.query)

    return res.apiSuccess(result, '获取用户时间线成功')
  } catch (error) {
    logger.error('获取用户时间线失败:', error)
    return res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * GET /user-context/:userId/risk - 风控信息
 *
 * @route GET /api/v4/console/customer-service/user-context/:userId/risk
 */
router.get('/:userId/risk', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId)
    if (isNaN(userId) || userId <= 0) {
      return res.apiError('用户ID无效', 'BAD_REQUEST', null, 400)
    }

    const models = req.app.locals.models
    const UserContextService = req.app.locals.services.getService('cs_user_context')
    const result = await UserContextService.getRisk(models, userId)

    return res.apiSuccess(result, '获取用户风控信息成功')
  } catch (error) {
    logger.error('获取用户风控信息失败:', error)
    return res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * GET /user-context/:userId/history - 历史会话列表
 *
 * @route GET /api/v4/console/customer-service/user-context/:userId/history
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=10] - 每页数量
 */
router.get('/:userId/history', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId)
    if (isNaN(userId) || userId <= 0) {
      return res.apiError('用户ID无效', 'BAD_REQUEST', null, 400)
    }

    const models = req.app.locals.models
    const UserContextService = req.app.locals.services.getService('cs_user_context')
    const result = await UserContextService.getHistory(models, userId, req.query)

    return res.apiSuccess(result, '获取用户历史会话成功')
  } catch (error) {
    logger.error('获取用户历史会话失败:', error)
    return res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * GET /user-context/:userId/notes - 用户内部备注列表
 *
 * @route GET /api/v4/console/customer-service/user-context/:userId/notes
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 */
router.get('/:userId/notes', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId)
    if (isNaN(userId) || userId <= 0) {
      return res.apiError('用户ID无效', 'BAD_REQUEST', null, 400)
    }

    const models = req.app.locals.models
    const IssueService = req.app.locals.services.getService('cs_issue')
    const result = await IssueService.getNotes(models, {
      user_id: userId,
      page: req.query.page,
      page_size: req.query.page_size
    })

    return res.apiSuccess(result, '获取用户备注成功')
  } catch (error) {
    logger.error('获取用户备注失败:', error)
    return res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * POST /user-context/:userId/notes - 添加用户内部备注
 *
 * @route POST /api/v4/console/customer-service/user-context/:userId/notes
 * @body {string} content - 备注内容
 * @body {number} [issue_id] - 关联工单ID（可选）
 * @body {number} [session_id] - 关联会话ID（可选）
 */
router.post('/:userId/notes', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId)
    if (isNaN(userId) || userId <= 0) {
      return res.apiError('用户ID无效', 'BAD_REQUEST', null, 400)
    }

    const { content, issue_id, session_id } = req.body
    if (!content || !content.trim()) {
      return res.apiError('备注内容不能为空', 'BAD_REQUEST', null, 400)
    }

    const models = req.app.locals.models
    const IssueService = req.app.locals.services.getService('cs_issue')

    const result = await IssueService.addNote(models, {
      user_id: userId,
      issue_id: issue_id ? parseInt(issue_id) : null,
      session_id: session_id ? parseInt(session_id) : null,
      author_id: req.user.user_id,
      content: content.trim()
    })

    return res.apiSuccess(result, '备注添加成功')
  } catch (error) {
    logger.error('添加用户备注失败:', error)
    return res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * GET /user-context/:userId/diagnose - 一键诊断
 *
 * @route GET /api/v4/console/customer-service/user-context/:userId/diagnose
 * @description 并行检查用户的资产/交易/物品/抽奖/账号状态，2-3秒内返回诊断结果
 */
router.get('/:userId/diagnose', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId)
    if (isNaN(userId) || userId <= 0) {
      return res.apiError('用户ID无效', 'BAD_REQUEST', null, 400)
    }

    const models = req.app.locals.models
    const DiagnoseService = req.app.locals.services.getService('cs_diagnose')
    const result = await DiagnoseService.diagnose(models, userId)

    return res.apiSuccess(result, '一键诊断完成')
  } catch (error) {
    logger.error('一键诊断失败:', error)
    return res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
  }
})

module.exports = router
