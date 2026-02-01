'use strict'

/**
 * 餐厅积分抽奖系统 V4 - 业务记录查询路由（Console域）
 *
 * 功能说明：
 * - 提供多种业务记录的只读查询接口
 * - 包括：抽奖清除设置记录、兑换订单、内容审核记录、用户变更记录等
 *
 * 涵盖表：
 * - lottery_clear_setting_records（抽奖清除设置记录）
 * - redemption_orders（核销订单）
 * - content_review_records（内容审核记录）
 * - user_role_change_records（用户角色变更记录）
 * - user_status_change_records（用户状态变更记录）
 * - exchange_records（B2C兑换记录）
 *
 * API 路径前缀：/api/v4/console/business-records
 * 访问权限：admin（role_level >= 30）
 *
 * 架构规范：
 * - 读操作通过 BusinessRecordQueryService 执行（Phase 3 收口）
 * - 写操作通过对应的 Service 执行（事务边界在入口层管理）
 *
 * 创建时间：2026-01-21
 * 最后更新：2026-02-02（Phase 3 读写分层收口）
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const logger = require('../../../utils/logger').logger
const TransactionManager = require('../../../utils/TransactionManager')

/**
 * 处理服务层错误
 *
 * @param {Error} error - 错误对象
 * @param {Object} res - Express 响应对象
 * @param {string} operation - 操作名称
 * @returns {Object} Express 响应对象
 */
function handleServiceError(error, res, operation) {
  logger.error(`❌ ${operation}失败`, { error: error.message, stack: error.stack })

  if (error.message.includes('不存在') || error.message.includes('not found')) {
    return res.apiError(error.message, 'NOT_FOUND', null, 404)
  }

  if (
    error.message.includes('不能为空') ||
    error.message.includes('无效') ||
    error.message.includes('必填') ||
    error.message.includes('缺少')
  ) {
    return res.apiError(error.message, 'VALIDATION_ERROR', null, 400)
  }

  return res.apiError(error.message, 'INTERNAL_ERROR', null, 500)
}

/*
 * =================================================================
 * 抽奖清除设置记录查询接口
 * =================================================================
 */

/**
 * GET /api/v4/console/business-records/lottery-clear-settings
 * @desc 查询抽奖清除设置记录列表
 * @access Admin only (role_level >= 30)
 *
 * @query {number} [user_id] - 被清除设置的用户ID
 * @query {number} [admin_id] - 执行清除的管理员ID
 * @query {string} [setting_type] - 清除的设置类型（all/force_win/force_lose等）
 * @query {string} [start_date] - 开始日期
 * @query {string} [end_date] - 结束日期
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 */
router.get('/lottery-clear-settings', authenticateToken, requireRoleLevel(30), async (req, res) => {
  try {
    const BusinessRecordQueryService = req.app.locals.services.getService(
      'console_business_record_query'
    )

    const result = await BusinessRecordQueryService.getLotteryClearSettings(req.query)

    logger.info('查询抽奖清除设置记录成功', {
      admin_id: req.user.user_id,
      total: result.pagination.total,
      page: result.pagination.page
    })

    return res.apiSuccess(result, '获取抽奖清除设置记录列表成功')
  } catch (error) {
    return handleServiceError(error, res, '查询抽奖清除设置记录')
  }
})

/**
 * GET /api/v4/console/business-records/lottery-clear-settings/:record_id
 * @desc 获取抽奖清除设置记录详情
 * @access Admin only (role_level >= 30)
 */
router.get(
  '/lottery-clear-settings/:record_id',
  authenticateToken,
  requireRoleLevel(30),
  async (req, res) => {
    try {
      const { record_id } = req.params
      const BusinessRecordQueryService = req.app.locals.services.getService(
        'console_business_record_query'
      )

      const record = await BusinessRecordQueryService.getLotteryClearSettingById(record_id)

      if (!record) {
        return res.apiError('记录不存在', 'NOT_FOUND', null, 404)
      }

      return res.apiSuccess(record, '获取抽奖清除设置记录详情成功')
    } catch (error) {
      return handleServiceError(error, res, '获取抽奖清除设置记录详情')
    }
  }
)

/*
 * =================================================================
 * 核销订单查询接口
 * =================================================================
 */

/**
 * GET /api/v4/console/business-records/redemption-orders
 * @desc 查询核销订单列表
 * @access Admin only (role_level >= 30)
 *
 * @query {string} [status] - 订单状态（pending/fulfilled/cancelled/expired）
 * @query {number} [redeemer_user_id] - 核销用户ID
 * @query {string} [start_date] - 开始日期
 * @query {string} [end_date] - 结束日期
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 */
router.get('/redemption-orders', authenticateToken, requireRoleLevel(30), async (req, res) => {
  try {
    const BusinessRecordQueryService = req.app.locals.services.getService(
      'console_business_record_query'
    )

    const result = await BusinessRecordQueryService.getRedemptionOrders(req.query)

    logger.info('查询核销订单列表成功', {
      admin_id: req.user.user_id,
      total: result.pagination.total,
      page: result.pagination.page
    })

    return res.apiSuccess(result, '获取核销订单列表成功')
  } catch (error) {
    return handleServiceError(error, res, '查询核销订单列表')
  }
})

/**
 * GET /api/v4/console/business-records/redemption-orders/statistics
 * @desc 获取核销订单统计数据
 * @access Admin only (role_level >= 30)
 */
router.get(
  '/redemption-orders/statistics',
  authenticateToken,
  requireRoleLevel(30),
  async (req, res) => {
    try {
      const BusinessRecordQueryService = req.app.locals.services.getService(
        'console_business_record_query'
      )

      const stats = await BusinessRecordQueryService.getRedemptionOrderStats()

      logger.info('获取核销订单统计成功', { admin_id: req.user.user_id, stats })

      return res.apiSuccess(stats, '获取核销订单统计成功')
    } catch (error) {
      return handleServiceError(error, res, '获取核销订单统计')
    }
  }
)

/**
 * GET /api/v4/console/business-records/redemption-orders/export
 * @desc 导出核销订单数据为CSV
 * @access Admin only (role_level >= 30)
 *
 * @query {string} [status] - 订单状态筛选
 * @query {string} [format=csv] - 导出格式（仅支持csv）
 */
router.get(
  '/redemption-orders/export',
  authenticateToken,
  requireRoleLevel(30),
  async (req, res) => {
    try {
      const BusinessRecordQueryService = req.app.locals.services.getService(
        'console_business_record_query'
      )

      const orders = await BusinessRecordQueryService.exportRedemptionOrders(req.query)

      // 生成CSV内容
      const csvHeader =
        '订单ID,核销码,用户ID,用户昵称,用户手机,奖品类型,奖品名称,状态,创建时间,过期时间,核销时间\n'

      const csvRows = orders
        .map(order => {
          const redeemer = order.redeemer || {}
          const itemInstance = order.item_instance || {}
          const meta = itemInstance.meta || {}

          // 状态映射
          const statusMap = {
            pending: '待核销',
            fulfilled: '已核销',
            expired: '已过期',
            cancelled: '已取消'
          }

          return [
            order.order_id,
            order.code_hash ? order.code_hash.substring(0, 8) + '...' : '-',
            redeemer.user_id || '-',
            redeemer.nickname || '-',
            redeemer.mobile || '-',
            itemInstance.item_type || '-',
            meta.prize_name || meta.name || '-',
            statusMap[order.status] || order.status,
            order.created_at ? new Date(order.created_at).toLocaleString('zh-CN') : '-',
            order.expires_at ? new Date(order.expires_at).toLocaleString('zh-CN') : '-',
            order.fulfilled_at ? new Date(order.fulfilled_at).toLocaleString('zh-CN') : '-'
          ]
            .map(field => `"${String(field).replace(/"/g, '""')}"`)
            .join(',')
        })
        .join('\n')

      const csvContent = '\uFEFF' + csvHeader + csvRows // 添加BOM以支持Excel中文显示

      logger.info('导出核销订单成功', {
        admin_id: req.user.user_id,
        count: orders.length,
        status_filter: req.query.status || 'all'
      })

      // 设置响应头
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="redemption_orders_${new Date().toISOString().slice(0, 10)}.csv"`
      )

      return res.send(csvContent)
    } catch (error) {
      return handleServiceError(error, res, '导出核销订单')
    }
  }
)

/**
 * GET /api/v4/console/business-records/redemption-orders/:order_id
 * @desc 获取核销订单详情
 * @access Admin only (role_level >= 30)
 */
router.get(
  '/redemption-orders/:order_id',
  authenticateToken,
  requireRoleLevel(30),
  async (req, res) => {
    try {
      const { order_id } = req.params
      const BusinessRecordQueryService = req.app.locals.services.getService(
        'console_business_record_query'
      )

      const order = await BusinessRecordQueryService.getRedemptionOrderById(order_id)

      if (!order) {
        return res.apiError('订单不存在', 'NOT_FOUND', null, 404)
      }

      return res.apiSuccess(order, '获取核销订单详情成功')
    } catch (error) {
      return handleServiceError(error, res, '获取核销订单详情')
    }
  }
)

/**
 * POST /api/v4/console/business-records/redemption-orders/:order_id/redeem
 * @desc 管理员直接核销订单（通过order_id，无需核销码）
 * @access Admin only (role_level >= 30)
 *
 * @body {number} [store_id] - 核销门店ID（可选）
 * @body {string} [remark] - 备注（可选）
 */
router.post(
  '/redemption-orders/:order_id/redeem',
  authenticateToken,
  requireRoleLevel(30),
  async (req, res) => {
    try {
      const { order_id } = req.params
      const { store_id, remark } = req.body
      const adminUserId = req.user.user_id

      // 通过 ServiceManager 获取服务（避免直连 models）
      const RedemptionService = req.app.locals.services.getService('redemption')

      // 使用 TransactionManager 管理事务边界
      const order = await TransactionManager.execute(
        async transaction => {
          return RedemptionService.adminFulfillOrderById(order_id, {
            transaction,
            admin_user_id: adminUserId,
            store_id,
            remark
          })
        },
        { description: '管理员核销订单' }
      )

      logger.info('管理员核销订单成功', {
        order_id,
        admin_id: adminUserId,
        store_id,
        remark
      })

      return res.apiSuccess(
        {
          order_id: order.order_id,
          status: order.status,
          fulfilled_at: order.fulfilled_at
        },
        '核销成功'
      )
    } catch (error) {
      return handleServiceError(error, res, '核销订单')
    }
  }
)

/**
 * POST /api/v4/console/business-records/redemption-orders/:order_id/cancel
 * @desc 管理员取消订单
 * @access Admin only (role_level >= 30)
 *
 * @body {string} [reason] - 取消原因（可选）
 */
router.post(
  '/redemption-orders/:order_id/cancel',
  authenticateToken,
  requireRoleLevel(30),
  async (req, res) => {
    try {
      const { order_id } = req.params
      const { reason } = req.body
      const adminUserId = req.user.user_id

      // 通过 ServiceManager 获取服务（避免直连 models）
      const RedemptionService = req.app.locals.services.getService('redemption')

      // 使用 TransactionManager 管理事务边界
      const order = await TransactionManager.execute(
        async transaction => {
          return RedemptionService.adminCancelOrderById(order_id, {
            transaction,
            admin_user_id: adminUserId,
            reason
          })
        },
        { description: '管理员取消订单' }
      )

      logger.info('管理员取消订单成功', {
        order_id,
        admin_id: adminUserId,
        reason
      })

      return res.apiSuccess(
        {
          order_id: order.order_id,
          status: order.status
        },
        '取消成功'
      )
    } catch (error) {
      return handleServiceError(error, res, '取消订单')
    }
  }
)

/**
 * POST /api/v4/console/business-records/redemption-orders/batch-expire
 * @desc 批量将核销码设为过期
 * @access Admin only (role_level >= 30)
 *
 * @body {string[]} order_ids - 订单ID数组
 */
router.post(
  '/redemption-orders/batch-expire',
  authenticateToken,
  requireRoleLevel(30),
  async (req, res) => {
    try {
      const { order_ids } = req.body
      const adminUserId = req.user.user_id

      if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
        return res.apiError('请提供要处理的订单ID列表', 'INVALID_PARAMS', null, 400)
      }

      // 通过 ServiceManager 获取服务（避免直连 models）
      const RedemptionService = req.app.locals.services.getService('redemption')

      // 使用 TransactionManager 管理事务边界
      const result = await TransactionManager.execute(
        async transaction => {
          return RedemptionService.adminBatchExpireOrders(order_ids, {
            transaction,
            admin_user_id: adminUserId,
            reason: '管理员手动过期'
          })
        },
        { description: '批量过期核销码' }
      )

      logger.info('批量过期核销码成功', {
        admin_id: adminUserId,
        requested_count: order_ids.length,
        expired_count: result.expired_count,
        unlocked_count: result.unlocked_count
      })

      return res.apiSuccess(
        {
          requested_count: order_ids.length,
          updated_count: result.expired_count
        },
        `成功将 ${result.expired_count} 个核销码设为过期`
      )
    } catch (error) {
      return handleServiceError(error, res, '批量过期核销码')
    }
  }
)

/*
 * =================================================================
 * 内容审核记录查询接口
 * =================================================================
 */

/**
 * GET /api/v4/console/business-records/content-reviews
 * @desc 查询内容审核记录列表
 * @access Admin only (role_level >= 30)
 *
 * @query {string} [auditable_type] - 审核对象类型（exchange/image/feedback等）
 * @query {string} [audit_status] - 审核状态（pending/approved/rejected/cancelled）
 * @query {number} [auditor_id] - 审核员ID
 * @query {string} [priority] - 优先级（high/medium/low）
 * @query {string} [start_date] - 开始日期
 * @query {string} [end_date] - 结束日期
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 */
router.get('/content-reviews', authenticateToken, requireRoleLevel(30), async (req, res) => {
  try {
    const BusinessRecordQueryService = req.app.locals.services.getService(
      'console_business_record_query'
    )

    const result = await BusinessRecordQueryService.getContentReviews(req.query)

    logger.info('查询内容审核记录成功', {
      admin_id: req.user.user_id,
      total: result.pagination.total,
      page: result.pagination.page
    })

    return res.apiSuccess(result, '获取内容审核记录列表成功')
  } catch (error) {
    return handleServiceError(error, res, '查询内容审核记录')
  }
})

/**
 * GET /api/v4/console/business-records/content-reviews/:audit_id
 * @desc 获取内容审核记录详情
 * @access Admin only (role_level >= 30)
 */
router.get(
  '/content-reviews/:audit_id',
  authenticateToken,
  requireRoleLevel(30),
  async (req, res) => {
    try {
      const { audit_id } = req.params
      const BusinessRecordQueryService = req.app.locals.services.getService(
        'console_business_record_query'
      )

      const record = await BusinessRecordQueryService.getContentReviewById(audit_id)

      if (!record) {
        return res.apiError('审核记录不存在', 'NOT_FOUND', null, 404)
      }

      return res.apiSuccess(record, '获取内容审核记录详情成功')
    } catch (error) {
      return handleServiceError(error, res, '获取内容审核记录详情')
    }
  }
)

/*
 * =================================================================
 * 用户角色变更记录查询接口
 * =================================================================
 */

/**
 * GET /api/v4/console/business-records/user-role-changes
 * @desc 查询用户角色变更记录列表
 * @access Admin only (role_level >= 30)
 *
 * @query {number} [user_id] - 被变更角色的用户ID
 * @query {number} [operator_id] - 执行变更的操作员ID
 * @query {string} [old_role] - 变更前角色
 * @query {string} [new_role] - 变更后角色
 * @query {string} [start_date] - 开始日期
 * @query {string} [end_date] - 结束日期
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 */
router.get('/user-role-changes', authenticateToken, requireRoleLevel(30), async (req, res) => {
  try {
    const BusinessRecordQueryService = req.app.locals.services.getService(
      'console_business_record_query'
    )

    const result = await BusinessRecordQueryService.getUserRoleChanges(req.query)

    logger.info('查询用户角色变更记录成功', {
      admin_id: req.user.user_id,
      total: result.pagination.total,
      page: result.pagination.page
    })

    return res.apiSuccess(result, '获取用户角色变更记录列表成功')
  } catch (error) {
    return handleServiceError(error, res, '查询用户角色变更记录')
  }
})

/**
 * GET /api/v4/console/business-records/user-role-changes/:record_id
 * @desc 获取用户角色变更记录详情
 * @access Admin only (role_level >= 30)
 */
router.get(
  '/user-role-changes/:record_id',
  authenticateToken,
  requireRoleLevel(30),
  async (req, res) => {
    try {
      const { record_id } = req.params
      const BusinessRecordQueryService = req.app.locals.services.getService(
        'console_business_record_query'
      )

      const record = await BusinessRecordQueryService.getUserRoleChangeById(record_id)

      if (!record) {
        return res.apiError('记录不存在', 'NOT_FOUND', null, 404)
      }

      return res.apiSuccess(record, '获取用户角色变更记录详情成功')
    } catch (error) {
      return handleServiceError(error, res, '获取用户角色变更记录详情')
    }
  }
)

/*
 * =================================================================
 * 用户状态变更记录查询接口
 * =================================================================
 */

/**
 * GET /api/v4/console/business-records/user-status-changes
 * @desc 查询用户状态变更记录列表
 * @access Admin only (role_level >= 30)
 *
 * @query {number} [user_id] - 被变更状态的用户ID
 * @query {number} [operator_id] - 执行变更的操作员ID
 * @query {string} [old_status] - 变更前状态
 * @query {string} [new_status] - 变更后状态
 * @query {string} [start_date] - 开始日期
 * @query {string} [end_date] - 结束日期
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 */
router.get('/user-status-changes', authenticateToken, requireRoleLevel(30), async (req, res) => {
  try {
    const BusinessRecordQueryService = req.app.locals.services.getService(
      'console_business_record_query'
    )

    const result = await BusinessRecordQueryService.getUserStatusChanges(req.query)

    logger.info('查询用户状态变更记录成功', {
      admin_id: req.user.user_id,
      total: result.pagination.total,
      page: result.pagination.page
    })

    return res.apiSuccess(result, '获取用户状态变更记录列表成功')
  } catch (error) {
    return handleServiceError(error, res, '查询用户状态变更记录')
  }
})

/**
 * GET /api/v4/console/business-records/user-status-changes/:record_id
 * @desc 获取用户状态变更记录详情
 * @access Admin only (role_level >= 30)
 */
router.get(
  '/user-status-changes/:record_id',
  authenticateToken,
  requireRoleLevel(30),
  async (req, res) => {
    try {
      const { record_id } = req.params
      const BusinessRecordQueryService = req.app.locals.services.getService(
        'console_business_record_query'
      )

      const record = await BusinessRecordQueryService.getUserStatusChangeById(record_id)

      if (!record) {
        return res.apiError('记录不存在', 'NOT_FOUND', null, 404)
      }

      return res.apiSuccess(record, '获取用户状态变更记录详情成功')
    } catch (error) {
      return handleServiceError(error, res, '获取用户状态变更记录详情')
    }
  }
)

/*
 * =================================================================
 * B2C兑换记录查询接口
 * =================================================================
 */

/**
 * GET /api/v4/console/business-records/exchange-records
 * @desc 查询B2C兑换记录列表
 * @access Admin only (role_level >= 30)
 *
 * @query {number} [user_id] - 用户ID
 * @query {number} [exchange_item_id] - 商品ID
 * @query {string} [status] - 订单状态（pending/completed/shipped/cancelled）
 * @query {string} [order_no] - 订单号（模糊搜索）
 * @query {string} [start_date] - 开始日期
 * @query {string} [end_date] - 结束日期
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 */
router.get('/exchange-records', authenticateToken, requireRoleLevel(30), async (req, res) => {
  try {
    const BusinessRecordQueryService = req.app.locals.services.getService(
      'console_business_record_query'
    )

    const result = await BusinessRecordQueryService.getExchangeRecords(req.query)

    logger.info('查询B2C兑换记录成功', {
      admin_id: req.user.user_id,
      total: result.pagination.total,
      page: result.pagination.page
    })

    return res.apiSuccess(result, '获取B2C兑换记录列表成功')
  } catch (error) {
    return handleServiceError(error, res, '查询B2C兑换记录')
  }
})

/**
 * GET /api/v4/console/business-records/exchange-records/:record_id
 * @desc 获取B2C兑换记录详情
 * @access Admin only (role_level >= 30)
 */
router.get(
  '/exchange-records/:record_id',
  authenticateToken,
  requireRoleLevel(30),
  async (req, res) => {
    try {
      const { record_id } = req.params
      const BusinessRecordQueryService = req.app.locals.services.getService(
        'console_business_record_query'
      )

      const record = await BusinessRecordQueryService.getExchangeRecordById(record_id)

      if (!record) {
        return res.apiError('记录不存在', 'NOT_FOUND', null, 404)
      }

      return res.apiSuccess(record, '获取B2C兑换记录详情成功')
    } catch (error) {
      return handleServiceError(error, res, '获取B2C兑换记录详情')
    }
  }
)

/*
 * =================================================================
 * 聊天消息记录查询接口（P1 API覆盖率补齐 - chat_messages）
 * =================================================================
 */

/**
 * GET /api/v4/console/business-records/chat-messages
 * @desc 查询聊天消息列表（只读查询）
 * @access Admin only (role_level >= 30)
 *
 * @query {number} [session_id] - 会话ID筛选
 * @query {number} [sender_id] - 发送者ID筛选
 * @query {string} [sender_type] - 发送者类型筛选（user/admin）
 * @query {string} [message_type] - 消息类型筛选（text/image/system）
 * @query {string} [message_source] - 消息来源筛选（user_client/admin_client/system）
 * @query {string} [status] - 消息状态筛选（sending/sent/delivered/read）
 * @query {string} [start_date] - 开始日期
 * @query {string} [end_date] - 结束日期
 * @query {string} [search] - 内容搜索关键词
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 */
router.get('/chat-messages', authenticateToken, requireRoleLevel(30), async (req, res) => {
  try {
    const BusinessRecordQueryService = req.app.locals.services.getService(
      'console_business_record_query'
    )

    const result = await BusinessRecordQueryService.getChatMessages(req.query)

    logger.info('查询聊天消息记录成功', {
      admin_id: req.user.user_id,
      total: result.pagination.total,
      page: result.pagination.page
    })

    return res.apiSuccess(result, '获取聊天消息列表成功')
  } catch (error) {
    return handleServiceError(error, res, '查询聊天消息记录')
  }
})

/**
 * GET /api/v4/console/business-records/chat-messages/:message_id
 * @desc 获取聊天消息详情
 * @access Admin only (role_level >= 30)
 */
router.get(
  '/chat-messages/:message_id',
  authenticateToken,
  requireRoleLevel(30),
  async (req, res) => {
    try {
      const { message_id } = req.params
      const BusinessRecordQueryService = req.app.locals.services.getService(
        'console_business_record_query'
      )

      const message = await BusinessRecordQueryService.getChatMessageById(message_id)

      if (!message) {
        return res.apiError('消息不存在', 'NOT_FOUND', null, 404)
      }

      return res.apiSuccess(message, '获取聊天消息详情成功')
    } catch (error) {
      return handleServiceError(error, res, '获取聊天消息详情')
    }
  }
)

/**
 * GET /api/v4/console/business-records/chat-messages/statistics/summary
 * @desc 获取聊天消息统计摘要
 * @access Admin only (role_level >= 30)
 *
 * @query {string} [start_date] - 开始日期
 * @query {string} [end_date] - 结束日期
 */
router.get(
  '/chat-messages/statistics/summary',
  authenticateToken,
  requireRoleLevel(30),
  async (req, res) => {
    try {
      const BusinessRecordQueryService = req.app.locals.services.getService(
        'console_business_record_query'
      )

      const result = await BusinessRecordQueryService.getChatMessageStats(req.query)

      logger.info('查询聊天消息统计成功', { admin_id: req.user.user_id })

      return res.apiSuccess(result, '获取聊天消息统计成功')
    } catch (error) {
      return handleServiceError(error, res, '获取聊天消息统计')
    }
  }
)

module.exports = router
