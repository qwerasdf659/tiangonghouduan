/**
 * 抽奖管理模块 - 干预规则列表和管理API
 *
 * @description 提供lottery_management_settings表的管理员查询能力
 * @version 1.2.0
 * @date 2026-01-09
 * @updated 2026-02-02（修复服务引用：查询使用 admin_lottery_query，写操作使用 admin_lottery_core）
 *
 * 业务范围：
 * - 查询所有干预规则（lottery_management_settings）
 * - 获取单个干预规则详情
 * - 取消干预规则
 *
 * 架构规范：
 * - 路由层通过 req.app.locals.services.getService() 获取服务
 * - 查询操作使用 admin_lottery_query（AdminLotteryQueryService）
 * - 写操作使用 admin_lottery_core（AdminLotteryCoreService）
 * - 路由层禁止直接 require models（所有数据库操作通过 Service 层）
 * - 使用 adminAuthMiddleware 确保管理员权限
 * - 写操作通过 TransactionManager 统一管理事务
 */

const express = require('express')
const router = express.Router()
const {
  adminAuthMiddleware,
  adminOpsAuthMiddleware,
  asyncHandler
} = require('../shared/middleware')
const TransactionManager = require('../../../../utils/TransactionManager')

/**
 * GET /interventions - 获取干预规则列表
 *
 * @description 分页查询lottery_management_settings表，支持状态筛选和用户搜索
 * @route GET /api/v4/console/lottery-management/interventions
 * @access Private (需要管理员权限)
 *
 * @query {number} page - 页码，默认1
 * @query {number} page_size - 每页数量，默认20
 * @query {string} status - 状态筛选：active/used/expired/cancelled
 * @query {string} user_search - 用户搜索（用户ID或手机号）
 * @query {string} setting_type - 设置类型筛选
 */
router.get(
  '/interventions',
  adminOpsAuthMiddleware, // P1只读API：允许admin和ops角色访问
  asyncHandler(async (req, res) => {
    try {
      const { page = 1, page_size = 20, status, user_search, setting_type } = req.query

      // 通过 ServiceManager 获取 AdminLotteryQueryService（查询操作使用 QueryService）
      const AdminLotteryQueryService = req.app.locals.services.getService('admin_lottery_query')

      // 调用 Service 层方法获取干预规则列表
      const result = await AdminLotteryQueryService.getInterventionList({
        page: parseInt(page),
        page_size: parseInt(page_size),
        status,
        user_search,
        setting_type
      })

      return res.apiSuccess(
        {
          interventions: result.items,
          pagination: result.pagination
        },
        '干预规则列表查询成功'
      )
    } catch (error) {
      return res.apiInternalError('干预规则列表查询失败', error.message, 'INTERVENTIONS_LIST_ERROR')
    }
  })
)

/**
 * GET /interventions/:id - 获取单个干预规则详情
 *
 * @route GET /api/v4/console/lottery-management/interventions/:id
 * @access Private (需要管理员权限)
 */
router.get(
  '/interventions/:id',
  adminOpsAuthMiddleware, // P1只读API：允许admin和ops角色访问
  asyncHandler(async (req, res) => {
    try {
      const { id } = req.params

      // 通过 ServiceManager 获取 AdminLotteryQueryService（查询操作使用 QueryService）
      const AdminLotteryQueryService = req.app.locals.services.getService('admin_lottery_query')

      /*
       * 调用 Service 层方法获取干预规则详情
       * 注意：setting_id 是字符串格式（如 setting_xxx），不需要 parseInt
       */
      const intervention = await AdminLotteryQueryService.getInterventionById(id)

      return res.apiSuccess(intervention, '干预规则详情查询成功')
    } catch (error) {
      // 处理业务错误
      if (error.code === 'INTERVENTION_NOT_FOUND') {
        return res.apiError('干预规则不存在', 'INTERVENTION_NOT_FOUND', null, 404)
      }

      return res.apiInternalError(
        '干预规则详情查询失败',
        error.message,
        'INTERVENTION_DETAIL_ERROR'
      )
    }
  })
)

/**
 * POST /interventions/:id/cancel - 取消干预规则
 *
 * @route POST /api/v4/console/lottery-management/interventions/:id/cancel
 * @access Private (需要管理员权限)
 */
router.post(
  '/interventions/:id/cancel',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { id } = req.params
      const { reason = '管理员手动取消' } = req.body

      // 通过 ServiceManager 获取 AdminLotteryCoreService（V4.7.0 拆分后：核心干预操作）
      const AdminLotteryCoreService = req.app.locals.services.getService('admin_lottery_core')

      /*
       * 使用 TransactionManager 统一管理事务（事务边界治理）
       * 注意：setting_id 是字符串格式（如 setting_xxx），不需要 parseInt
       */
      const result = await TransactionManager.execute(
        async transaction => {
          return await AdminLotteryCoreService.cancelIntervention(id, {
            reason,
            operated_by: req.user?.user_id,
            transaction
          })
        },
        { description: 'cancelIntervention' }
      )

      return res.apiSuccess(result, '干预规则已取消')
    } catch (error) {
      // 处理业务错误
      if (error.code === 'INTERVENTION_NOT_FOUND') {
        return res.apiError('干预规则不存在', 'INTERVENTION_NOT_FOUND', null, 404)
      }
      if (error.code === 'ALREADY_CANCELLED') {
        return res.apiError('干预规则已被取消', 'INTERVENTION_ALREADY_CANCELLED', null, 400)
      }
      if (error.code === 'ALREADY_USED') {
        return res.apiError('干预规则已被使用，无法取消', 'INTERVENTION_ALREADY_USED', null, 400)
      }

      return res.apiInternalError('取消干预规则失败', error.message, 'INTERVENTION_CANCEL_ERROR')
    }
  })
)

module.exports = router
