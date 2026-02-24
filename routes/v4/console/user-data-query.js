/**
 * 用户数据查询路由（管理后台 - 用户全维度数据检索）
 *
 * 路径前缀：/api/v4/console/user-data-query
 *
 * @description 为运营人员提供指定用户的全维度业务数据查询能力：
 *   - 用户概览（基本信息 + 资产余额）
 *   - 资产流水（积分来源 / 消耗 / 收入支出）
 *   - 抽奖记录（每次抽奖详情）
 *   - 兑换记录（兑换 + 核销状态 + 管理员审核操作）
 *   - 交易记录（交易市场 买卖）
 *   - 市场挂牌（上架 / 下架）
 *   - 材料转换（分解 / 合成）
 *
 * 架构原则：
 *   - 路由层不直连 models（通过 ServiceManager 获取服务）
 *   - 读操作使用 GET，写操作（审核）使用 PATCH
 *   - 写操作通过 TransactionManager 管理事务边界
 *   - 使用 res.apiSuccess / res.apiError 统一响应
 *   - 仅限 admin（role_level >= 100）访问
 *
 * @version 1.1.0
 * @date 2026-02-18
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const TransactionManager = require('../../../utils/TransactionManager')
const logger = require('../../../utils/logger').logger

/**
 * 获取 UserDataQueryService（通过 ServiceManager 统一入口）
 * @param {Object} req - Express 请求对象
 * @returns {Object} UserDataQueryService 静态类
 */
function getService(req) {
  return req.app.locals.services.getService('user_data_query')
}

/**
 * 获取 models（通过 ServiceManager）
 * @param {Object} req - Express 请求对象
 * @returns {Object} Sequelize models
 */
function getModels(req) {
  return req.app.locals.services.models
}

/**
 * 异步路由处理器包装
 * @param {Function} fn - 异步处理函数
 * @returns {Function} Express 中间件
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/* 所有接口均需管理员权限（role_level >= 100） */
router.use(authenticateToken, requireRoleLevel(100))

/**
 * GET /search - 搜索用户（手机号或用户 ID）
 *
 * @query {string} keyword - 搜索关键词（手机号 / user_id / 昵称）
 * @returns {Array} 匹配的用户列表（最多 10 条）
 */
router.get(
  '/search',
  asyncHandler(async (req, res) => {
    const { keyword } = req.query
    if (!keyword || !keyword.trim()) {
      return res.apiError('请输入搜索关键词', 'BAD_REQUEST', null, 400)
    }

    const Service = getService(req)
    const models = getModels(req)
    const users = await Service.searchUser(models, keyword)

    return res.apiSuccess(users, `找到 ${users.length} 个用户`)
  })
)

/**
 * GET /:user_id/overview - 用户概览（基本信息 + 资产余额）
 *
 * @param {number} user_id - 用户 ID（路径参数）
 * @returns {Object} { user, account_id, balances }
 */
router.get(
  '/:user_id/overview',
  asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.user_id)
    if (!userId || isNaN(userId)) {
      return res.apiError('无效的用户 ID', 'BAD_REQUEST', null, 400)
    }

    const Service = getService(req)
    const models = getModels(req)
    const result = await Service.getUserOverview(models, userId)

    if (!result) {
      return res.apiError('用户不存在', 'NOT_FOUND', null, 404)
    }

    return res.apiSuccess(result, '获取用户概览成功')
  })
)

/**
 * GET /:user_id/asset-transactions - 资产流水查询
 *
 * @param {number} user_id - 用户 ID
 * @query {string} [asset_code] - 资产代码筛选
 * @query {string} [business_type] - 业务类型筛选
 * @query {string} [direction] - 方向：income / expense
 * @query {string} [start_date] - 开始日期（ISO8601）
 * @query {string} [end_date] - 结束日期（ISO8601）
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页条数
 */
router.get(
  '/:user_id/asset-transactions',
  asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.user_id)
    if (!userId || isNaN(userId)) {
      return res.apiError('无效的用户 ID', 'BAD_REQUEST', null, 400)
    }

    const Service = getService(req)
    const models = getModels(req)
    const result = await Service.getAssetTransactions(models, userId, req.query)

    return res.apiSuccess(result, '获取资产流水成功')
  })
)

/**
 * GET /:user_id/lottery-draws - 抽奖记录查询
 *
 * @param {number} user_id - 用户 ID
 * @query {string} [lottery_campaign_id] - 活动 ID 筛选
 * @query {string} [reward_tier] - 档位筛选（low/mid/high/fallback）
 * @query {string} [start_date]
 * @query {string} [end_date]
 * @query {number} [page=1]
 * @query {number} [page_size=20]
 */
router.get(
  '/:user_id/lottery-draws',
  asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.user_id)
    if (!userId || isNaN(userId)) {
      return res.apiError('无效的用户 ID', 'BAD_REQUEST', null, 400)
    }

    const Service = getService(req)
    const models = getModels(req)
    const result = await Service.getLotteryDraws(models, userId, req.query)

    return res.apiSuccess(result, '获取抽奖记录成功')
  })
)

/**
 * GET /:user_id/exchange-records - 兑换记录查询（含核销状态）
 *
 * @param {number} user_id - 用户 ID
 * @query {string} [status] - 状态筛选（pending/completed/shipped/cancelled）
 * @query {string} [start_date]
 * @query {string} [end_date]
 * @query {number} [page=1]
 * @query {number} [page_size=20]
 */
router.get(
  '/:user_id/exchange-records',
  asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.user_id)
    if (!userId || isNaN(userId)) {
      return res.apiError('无效的用户 ID', 'BAD_REQUEST', null, 400)
    }

    const Service = getService(req)
    const models = getModels(req)
    const result = await Service.getExchangeRecords(models, userId, req.query)

    return res.apiSuccess(result, '获取兑换记录成功')
  })
)

/**
 * GET /:user_id/trade-records - 交易记录查询（交易市场 买卖）
 *
 * @param {number} user_id - 用户 ID
 * @query {string} [role] - 角色筛选：buyer / seller / all
 * @query {string} [status] - 状态筛选
 * @query {string} [start_date]
 * @query {string} [end_date]
 * @query {number} [page=1]
 * @query {number} [page_size=20]
 */
router.get(
  '/:user_id/trade-records',
  asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.user_id)
    if (!userId || isNaN(userId)) {
      return res.apiError('无效的用户 ID', 'BAD_REQUEST', null, 400)
    }

    const Service = getService(req)
    const models = getModels(req)
    const result = await Service.getTradeRecords(models, userId, req.query)

    return res.apiSuccess(result, '获取交易记录成功')
  })
)

/**
 * GET /:user_id/market-listings - 市场挂牌查询（上架/下架）
 *
 * @param {number} user_id - 用户 ID
 * @query {string} [status] - 状态筛选（on_sale/locked/sold/withdrawn/admin_withdrawn）
 * @query {string} [start_date]
 * @query {string} [end_date]
 * @query {number} [page=1]
 * @query {number} [page_size=20]
 */
router.get(
  '/:user_id/market-listings',
  asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.user_id)
    if (!userId || isNaN(userId)) {
      return res.apiError('无效的用户 ID', 'BAD_REQUEST', null, 400)
    }

    const Service = getService(req)
    const models = getModels(req)
    const result = await Service.getMarketListings(models, userId, req.query)

    return res.apiSuccess(result, '获取市场挂牌记录成功')
  })
)

/**
 * GET /:user_id/conversions - 材料转换记录查询（分解/合成）
 *
 * @param {number} user_id - 用户 ID
 * @query {string} [start_date]
 * @query {string} [end_date]
 * @query {number} [page=1]
 * @query {number} [page_size=20]
 */
router.get(
  '/:user_id/conversions',
  asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.user_id)
    if (!userId || isNaN(userId)) {
      return res.apiError('无效的用户 ID', 'BAD_REQUEST', null, 400)
    }

    const Service = getService(req)
    const models = getModels(req)
    const result = await Service.getConversionRecords(models, userId, req.query)

    return res.apiSuccess(result, '获取材料转换记录成功')
  })
)

/**
 * PATCH /:user_id/exchange-records/:order_no/review - 兑换订单审核操作
 *
 * 管理员对指定用户的兑换订单执行审核操作：
 *   - completed: 标记已完成
 *   - shipped: 标记已发货
 *   - cancelled: 取消订单
 *
 * @param {number} user_id - 用户 ID（路径参数，用于权限校验和日志追踪）
 * @param {string} order_no - 订单号（路径参数）
 * @body {string} status - 目标状态（completed / shipped / cancelled）
 * @body {string} [admin_remark] - 审核备注（取消时建议填写原因）
 */
router.patch(
  '/:user_id/exchange-records/:order_no/review',
  asyncHandler(async (req, res) => {
    const userId = parseInt(req.params.user_id)
    if (!userId || isNaN(userId)) {
      return res.apiError('无效的用户 ID', 'BAD_REQUEST', null, 400)
    }

    const { order_no } = req.params
    if (!order_no) {
      return res.apiError('订单号不能为空', 'BAD_REQUEST', null, 400)
    }

    const { status, admin_remark } = req.body
    const validStatuses = ['completed', 'shipped', 'cancelled']
    if (!status || !validStatuses.includes(status)) {
      return res.apiError(
        `无效的目标状态，仅支持: ${validStatuses.join(', ')}`,
        'BAD_REQUEST',
        null,
        400
      )
    }

    const adminId = req.user.user_id

    logger.info('[用户数据查询] 管理员审核兑换订单', {
      admin_id: adminId,
      target_user_id: userId,
      order_no,
      new_status: status,
      admin_remark: admin_remark || ''
    })

    const ExchangeCoreService = req.app.locals.services.getService('exchange_core')

    const result = await TransactionManager.execute(
      async transaction => {
        return await ExchangeCoreService.updateOrderStatus(
          order_no,
          status,
          adminId,
          admin_remark || '',
          { transaction }
        )
      },
      { description: `审核兑换订单 order_no=${order_no} → ${status}`, maxRetries: 1 }
    )

    logger.info('[用户数据查询] 兑换订单审核完成', {
      admin_id: adminId,
      order_no,
      new_status: status
    })

    return res.apiSuccess(result, `订单审核成功，状态已更新为${status}`)
  })
)

module.exports = router
