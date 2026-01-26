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
 * 访问权限：admin（role_level >= 100）
 *
 * 架构规范：
 * - 路由层不直连 models（通过 Service 层）
 * - 只读查询可直接查库（符合决策7）
 *
 * 创建时间：2026-01-21
 * 依据文档：docs/数据库表API覆盖率分析报告.md
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRole } = require('../../../middleware/auth')
const logger = require('../../../utils/logger').logger
const { Op } = require('sequelize')

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

/**
 * 构建分页和排序选项
 *
 * @param {Object} query - 请求查询参数
 * @param {string} defaultSortBy - 默认排序字段
 * @returns {Object} 分页和排序选项
 */
function buildPaginationOptions(query, defaultSortBy = 'created_at') {
  const page = Math.max(1, parseInt(query.page) || 1)
  const page_size = Math.min(100, Math.max(1, parseInt(query.page_size) || 20))
  const sort_by = query.sort_by || defaultSortBy
  const sort_order = (query.sort_order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

  return {
    page,
    page_size,
    offset: (page - 1) * page_size,
    limit: page_size,
    order: [[sort_by, sort_order]]
  }
}

/*
 * =================================================================
 * 抽奖清除设置记录查询接口
 * =================================================================
 */

/**
 * GET /api/v4/console/business-records/lottery-clear-settings
 * @desc 查询抽奖清除设置记录列表
 * @access Admin only (role_level >= 100)
 *
 * @query {number} [user_id] - 被清除设置的用户ID
 * @query {number} [admin_id] - 执行清除的管理员ID
 * @query {string} [setting_type] - 清除的设置类型（all/force_win/force_lose等）
 * @query {string} [start_date] - 开始日期
 * @query {string} [end_date] - 结束日期
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 */
router.get(
  '/lottery-clear-settings',
  authenticateToken,
  requireRole(['admin', 'ops']),
  async (req, res) => {
    try {
      const { user_id, admin_id, setting_type, start_date, end_date } = req.query
      const pagination = buildPaginationOptions(req.query)

      const { LotteryClearSettingRecord, User } = require('../../../models')

      // 构建查询条件
      const where = {}
      if (user_id) where.user_id = parseInt(user_id)
      if (admin_id) where.admin_id = parseInt(admin_id)
      if (setting_type) where.setting_type = setting_type
      if (start_date || end_date) {
        where.created_at = {}
        if (start_date) where.created_at[Op.gte] = new Date(start_date)
        if (end_date) where.created_at[Op.lte] = new Date(end_date + ' 23:59:59')
      }

      const { count, rows } = await LotteryClearSettingRecord.findAndCountAll({
        where,
        include: [
          { model: User, as: 'user', attributes: ['user_id', 'nickname', 'mobile'] },
          { model: User, as: 'admin', attributes: ['user_id', 'nickname', 'mobile'] }
        ],
        ...pagination
      })

      logger.info('查询抽奖清除设置记录成功', {
        admin_id: req.user.user_id,
        total: count,
        page: pagination.page
      })

      return res.apiSuccess(
        {
          records: rows,
          pagination: {
            total: count,
            page: pagination.page,
            page_size: pagination.page_size,
            total_pages: Math.ceil(count / pagination.page_size)
          }
        },
        '获取抽奖清除设置记录列表成功'
      )
    } catch (error) {
      return handleServiceError(error, res, '查询抽奖清除设置记录')
    }
  }
)

/**
 * GET /api/v4/console/business-records/lottery-clear-settings/:record_id
 * @desc 获取抽奖清除设置记录详情
 * @access Admin only (role_level >= 100)
 */
router.get(
  '/lottery-clear-settings/:record_id',
  authenticateToken,
  requireRole(['admin', 'ops']),
  async (req, res) => {
    try {
      const { record_id } = req.params
      const { LotteryClearSettingRecord, User } = require('../../../models')

      const record = await LotteryClearSettingRecord.findByPk(parseInt(record_id), {
        include: [
          { model: User, as: 'user', attributes: ['user_id', 'nickname', 'mobile'] },
          { model: User, as: 'admin', attributes: ['user_id', 'nickname', 'mobile'] }
        ]
      })

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
 * @access Admin only (role_level >= 100)
 *
 * @query {string} [status] - 订单状态（pending/fulfilled/cancelled/expired）
 * @query {number} [redeemer_user_id] - 核销用户ID
 * @query {string} [start_date] - 开始日期
 * @query {string} [end_date] - 结束日期
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 */
router.get(
  '/redemption-orders',
  authenticateToken,
  requireRole(['admin', 'ops']),
  async (req, res) => {
    try {
      const { status, redeemer_user_id, start_date, end_date } = req.query
      const pagination = buildPaginationOptions(req.query)

      const { RedemptionOrder, User, ItemInstance } = require('../../../models')

      // 构建查询条件
      const where = {}
      if (status) where.status = status
      if (redeemer_user_id) where.redeemer_user_id = parseInt(redeemer_user_id)
      if (start_date || end_date) {
        where.created_at = {}
        if (start_date) where.created_at[Op.gte] = new Date(start_date)
        if (end_date) where.created_at[Op.lte] = new Date(end_date + ' 23:59:59')
      }

      const { count, rows } = await RedemptionOrder.findAndCountAll({
        where,
        include: [
          {
            model: User,
            as: 'redeemer',
            attributes: ['user_id', 'nickname', 'mobile'],
            required: false // LEFT JOIN - 待核销状态时 redeemer_user_id 为 NULL
          },
          {
            model: ItemInstance,
            as: 'item_instance',
            attributes: ['item_instance_id', 'item_type', 'meta'],
            required: false // LEFT JOIN - 确保即使关联不存在也返回主表记录
          }
        ],
        ...pagination
      })

      logger.info('查询核销订单列表成功', {
        admin_id: req.user.user_id,
        total: count,
        page: pagination.page
      })

      return res.apiSuccess(
        {
          orders: rows,
          pagination: {
            total: count,
            page: pagination.page,
            page_size: pagination.page_size,
            total_pages: Math.ceil(count / pagination.page_size)
          }
        },
        '获取核销订单列表成功'
      )
    } catch (error) {
      return handleServiceError(error, res, '查询核销订单列表')
    }
  }
)

/**
 * GET /api/v4/console/business-records/redemption-orders/statistics
 * @desc 获取核销订单统计数据
 * @access Admin only (role_level >= 100)
 */
router.get(
  '/redemption-orders/statistics',
  authenticateToken,
  requireRole(['admin', 'ops']),
  async (req, res) => {
    try {
      const { RedemptionOrder } = require('../../../models')
      const { fn, col } = require('sequelize')

      // 按状态分组统计
      const statusCounts = await RedemptionOrder.findAll({
        attributes: ['status', [fn('COUNT', col('order_id')), 'count']],
        group: ['status'],
        raw: true
      })

      // 转换为对象格式
      const stats = {
        total: 0,
        pending: 0,
        fulfilled: 0,
        expired: 0,
        cancelled: 0
      }

      statusCounts.forEach(item => {
        const count = parseInt(item.count) || 0
        stats[item.status] = count
        stats.total += count
      })

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
 * @access Admin only (role_level >= 100)
 *
 * @query {string} [status] - 订单状态筛选
 * @query {string} [format=csv] - 导出格式（仅支持csv）
 */
router.get(
  '/redemption-orders/export',
  authenticateToken,
  requireRole(['admin', 'ops']),
  async (req, res) => {
    try {
      const { status, start_date, end_date } = req.query
      const { RedemptionOrder, User, ItemInstance, Op } = require('../../../models')

      // 构建查询条件
      const where = {}
      if (status) where.status = status
      if (start_date || end_date) {
        where.created_at = {}
        if (start_date) where.created_at[Op.gte] = new Date(start_date)
        if (end_date) where.created_at[Op.lte] = new Date(end_date + ' 23:59:59')
      }

      // 查询所有符合条件的数据（不分页）
      const orders = await RedemptionOrder.findAll({
        where,
        include: [
          {
            model: User,
            as: 'redeemer',
            attributes: ['user_id', 'nickname', 'mobile'],
            required: false // LEFT JOIN
          },
          {
            model: ItemInstance,
            as: 'item_instance',
            attributes: ['item_instance_id', 'item_type', 'meta'],
            required: false // LEFT JOIN
          }
        ],
        order: [['created_at', 'DESC']],
        limit: 10000 // 限制最大导出数量
      })

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
        status_filter: status || 'all'
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
 * @access Admin only (role_level >= 100)
 */
router.get(
  '/redemption-orders/:order_id',
  authenticateToken,
  requireRole(['admin', 'ops']),
  async (req, res) => {
    try {
      const { order_id } = req.params
      const { RedemptionOrder, User, ItemInstance } = require('../../../models')

      const order = await RedemptionOrder.findByPk(order_id, {
        include: [
          {
            model: User,
            as: 'redeemer',
            attributes: ['user_id', 'nickname', 'mobile'],
            required: false // LEFT JOIN
          },
          {
            model: ItemInstance,
            as: 'item_instance',
            required: false // LEFT JOIN
          }
        ]
      })

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
 * @access Admin only (role_level >= 100)
 *
 * @body {number} [store_id] - 核销门店ID（可选）
 * @body {string} [remark] - 备注（可选）
 */
router.post(
  '/redemption-orders/:order_id/redeem',
  authenticateToken,
  requireRole(['admin', 'ops']),
  async (req, res) => {
    try {
      const { order_id } = req.params
      const { store_id, remark } = req.body
      const adminUserId = req.user.user_id

      const { RedemptionOrder, ItemInstance, User, sequelize } = require('../../../models')
      const BeijingTimeHelper = require('../../../utils/timeHelper')

      // 开启事务
      const transaction = await sequelize.transaction()

      try {
        // 查找订单并锁定
        const order = await RedemptionOrder.findByPk(order_id, {
          include: [{ model: ItemInstance, as: 'item_instance' }],
          lock: transaction.LOCK.UPDATE,
          transaction
        })

        if (!order) {
          await transaction.rollback()
          return res.apiError('订单不存在', 'NOT_FOUND', null, 404)
        }

        // 检查订单状态
        if (order.status === 'fulfilled') {
          await transaction.rollback()
          return res.apiError('订单已核销', 'ALREADY_FULFILLED', null, 409)
        }

        if (order.status === 'cancelled') {
          await transaction.rollback()
          return res.apiError('订单已取消', 'CANCELLED', null, 409)
        }

        if (order.status === 'expired') {
          await transaction.rollback()
          return res.apiError('订单已过期', 'EXPIRED', null, 400)
        }

        // 检查是否过期
        if (order.expires_at && new Date(order.expires_at) < new Date()) {
          // 更新状态为过期
          await order.update({ status: 'expired' }, { transaction })
          await transaction.commit()
          return res.apiError('订单已过期', 'EXPIRED', null, 400)
        }

        // 执行核销
        const fulfilledAt = BeijingTimeHelper.createDatabaseTime()
        await order.update(
          {
            status: 'fulfilled',
            redeemer_user_id: adminUserId,
            fulfilled_at: fulfilledAt
          },
          { transaction }
        )

        // 更新物品实例状态
        if (order.item_instance) {
          await order.item_instance.update(
            {
              status: 'used'
            },
            { transaction }
          )
        }

        await transaction.commit()

        logger.info('管理员核销订单成功', {
          order_id,
          admin_id: adminUserId,
          store_id,
          remark
        })

        // 重新查询完整数据
        const updatedOrder = await RedemptionOrder.findByPk(order_id, {
          include: [
            { model: User, as: 'redeemer', attributes: ['user_id', 'nickname', 'mobile'] },
            { model: ItemInstance, as: 'item_instance' }
          ]
        })

        return res.apiSuccess(updatedOrder, '核销成功')
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    } catch (error) {
      return handleServiceError(error, res, '核销订单')
    }
  }
)

/**
 * POST /api/v4/console/business-records/redemption-orders/:order_id/cancel
 * @desc 管理员取消订单
 * @access Admin only (role_level >= 100)
 *
 * @body {string} [reason] - 取消原因（可选）
 */
router.post(
  '/redemption-orders/:order_id/cancel',
  authenticateToken,
  requireRole(['admin', 'ops']),
  async (req, res) => {
    try {
      const { order_id } = req.params
      const { reason } = req.body
      const adminUserId = req.user.user_id

      const { RedemptionOrder, ItemInstance, User, sequelize } = require('../../../models')

      // 开启事务
      const transaction = await sequelize.transaction()

      try {
        // 查找订单并锁定
        const order = await RedemptionOrder.findByPk(order_id, {
          include: [{ model: ItemInstance, as: 'item_instance' }],
          lock: transaction.LOCK.UPDATE,
          transaction
        })

        if (!order) {
          await transaction.rollback()
          return res.apiError('订单不存在', 'NOT_FOUND', null, 404)
        }

        // 检查订单状态
        if (order.status !== 'pending') {
          await transaction.rollback()
          return res.apiError(`订单状态为 ${order.status}，无法取消`, 'INVALID_STATUS', null, 400)
        }

        // 执行取消
        await order.update(
          {
            status: 'cancelled'
          },
          { transaction }
        )

        // 恢复物品实例状态（如果需要）
        if (order.item_instance && order.item_instance.status === 'pending_redeem') {
          await order.item_instance.update(
            {
              status: 'available'
            },
            { transaction }
          )
        }

        await transaction.commit()

        logger.info('管理员取消订单成功', {
          order_id,
          admin_id: adminUserId,
          reason
        })

        // 重新查询完整数据
        const updatedOrder = await RedemptionOrder.findByPk(order_id, {
          include: [
            { model: User, as: 'redeemer', attributes: ['user_id', 'nickname', 'mobile'] },
            { model: ItemInstance, as: 'item_instance' }
          ]
        })

        return res.apiSuccess(updatedOrder, '取消成功')
      } catch (error) {
        await transaction.rollback()
        throw error
      }
    } catch (error) {
      return handleServiceError(error, res, '取消订单')
    }
  }
)

/**
 * POST /api/v4/console/business-records/redemption-orders/batch-expire
 * @desc 批量将核销码设为过期
 * @access Admin only (role_level >= 100)
 *
 * @body {string[]} order_ids - 订单ID数组
 */
router.post(
  '/redemption-orders/batch-expire',
  authenticateToken,
  requireRole(['admin', 'ops']),
  async (req, res) => {
    try {
      const { order_ids } = req.body
      const adminUserId = req.user.user_id

      if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
        return res.apiError('请提供要处理的订单ID列表', 'INVALID_PARAMS', null, 400)
      }

      const { RedemptionOrder, sequelize, Op } = require('../../../models')

      // 开启事务
      const transaction = await sequelize.transaction()

      try {
        // 只更新状态为 pending 的订单
        const [updatedCount] = await RedemptionOrder.update(
          { status: 'expired' },
          {
            where: {
              order_id: { [Op.in]: order_ids },
              status: 'pending' // 只处理待核销的订单
            },
            transaction
          }
        )

        await transaction.commit()

        logger.info('批量过期核销码成功', {
          admin_id: adminUserId,
          requested_count: order_ids.length,
          updated_count: updatedCount
        })

        return res.apiSuccess(
          {
            requested_count: order_ids.length,
            updated_count: updatedCount
          },
          `成功将 ${updatedCount} 个核销码设为过期`
        )
      } catch (error) {
        await transaction.rollback()
        throw error
      }
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
 * @access Admin only (role_level >= 100)
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
router.get(
  '/content-reviews',
  authenticateToken,
  requireRole(['admin', 'ops']),
  async (req, res) => {
    try {
      const { auditable_type, audit_status, auditor_id, priority, start_date, end_date } = req.query
      const pagination = buildPaginationOptions(req.query, 'submitted_at')

      const { ContentReviewRecord, User } = require('../../../models')

      // 构建查询条件
      const where = {}
      if (auditable_type) where.auditable_type = auditable_type
      if (audit_status) where.audit_status = audit_status
      if (auditor_id) where.auditor_id = parseInt(auditor_id)
      if (priority) where.priority = priority
      if (start_date || end_date) {
        where.submitted_at = {}
        if (start_date) where.submitted_at[Op.gte] = new Date(start_date)
        if (end_date) where.submitted_at[Op.lte] = new Date(end_date + ' 23:59:59')
      }

      const { count, rows } = await ContentReviewRecord.findAndCountAll({
        where,
        include: [{ model: User, as: 'auditor', attributes: ['user_id', 'nickname', 'mobile'] }],
        ...pagination
      })

      logger.info('查询内容审核记录成功', {
        admin_id: req.user.user_id,
        total: count,
        page: pagination.page
      })

      return res.apiSuccess(
        {
          records: rows,
          pagination: {
            total: count,
            page: pagination.page,
            page_size: pagination.page_size,
            total_pages: Math.ceil(count / pagination.page_size)
          }
        },
        '获取内容审核记录列表成功'
      )
    } catch (error) {
      return handleServiceError(error, res, '查询内容审核记录')
    }
  }
)

/**
 * GET /api/v4/console/business-records/content-reviews/:audit_id
 * @desc 获取内容审核记录详情
 * @access Admin only (role_level >= 100)
 */
router.get(
  '/content-reviews/:audit_id',
  authenticateToken,
  requireRole(['admin', 'ops']),
  async (req, res) => {
    try {
      const { audit_id } = req.params
      const { ContentReviewRecord, User } = require('../../../models')

      const record = await ContentReviewRecord.findByPk(parseInt(audit_id), {
        include: [{ model: User, as: 'auditor', attributes: ['user_id', 'nickname', 'mobile'] }]
      })

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
 * @access Admin only (role_level >= 100)
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
router.get(
  '/user-role-changes',
  authenticateToken,
  requireRole(['admin', 'ops']),
  async (req, res) => {
    try {
      const { user_id, operator_id, old_role, new_role, start_date, end_date } = req.query
      const pagination = buildPaginationOptions(req.query)

      const { UserRoleChangeRecord, User } = require('../../../models')

      // 构建查询条件
      const where = {}
      if (user_id) where.user_id = parseInt(user_id)
      if (operator_id) where.operator_id = parseInt(operator_id)
      if (old_role) where.old_role = old_role
      if (new_role) where.new_role = new_role
      if (start_date || end_date) {
        where.created_at = {}
        if (start_date) where.created_at[Op.gte] = new Date(start_date)
        if (end_date) where.created_at[Op.lte] = new Date(end_date + ' 23:59:59')
      }

      const { count, rows } = await UserRoleChangeRecord.findAndCountAll({
        where,
        include: [
          { model: User, as: 'user', attributes: ['user_id', 'nickname', 'mobile'] },
          { model: User, as: 'operator', attributes: ['user_id', 'nickname', 'mobile'] }
        ],
        ...pagination
      })

      logger.info('查询用户角色变更记录成功', {
        admin_id: req.user.user_id,
        total: count,
        page: pagination.page
      })

      return res.apiSuccess(
        {
          records: rows,
          pagination: {
            total: count,
            page: pagination.page,
            page_size: pagination.page_size,
            total_pages: Math.ceil(count / pagination.page_size)
          }
        },
        '获取用户角色变更记录列表成功'
      )
    } catch (error) {
      return handleServiceError(error, res, '查询用户角色变更记录')
    }
  }
)

/**
 * GET /api/v4/console/business-records/user-role-changes/:record_id
 * @desc 获取用户角色变更记录详情
 * @access Admin only (role_level >= 100)
 */
router.get(
  '/user-role-changes/:record_id',
  authenticateToken,
  requireRole(['admin', 'ops']),
  async (req, res) => {
    try {
      const { record_id } = req.params
      const { UserRoleChangeRecord, User } = require('../../../models')

      const record = await UserRoleChangeRecord.findByPk(parseInt(record_id), {
        include: [
          { model: User, as: 'user', attributes: ['user_id', 'nickname', 'mobile'] },
          { model: User, as: 'operator', attributes: ['user_id', 'nickname', 'mobile'] }
        ]
      })

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
 * @access Admin only (role_level >= 100)
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
router.get(
  '/user-status-changes',
  authenticateToken,
  requireRole(['admin', 'ops']),
  async (req, res) => {
    try {
      const { user_id, operator_id, old_status, new_status, start_date, end_date } = req.query
      const pagination = buildPaginationOptions(req.query)

      const { UserStatusChangeRecord, User } = require('../../../models')

      // 构建查询条件
      const where = {}
      if (user_id) where.user_id = parseInt(user_id)
      if (operator_id) where.operator_id = parseInt(operator_id)
      if (old_status) where.old_status = old_status
      if (new_status) where.new_status = new_status
      if (start_date || end_date) {
        where.created_at = {}
        if (start_date) where.created_at[Op.gte] = new Date(start_date)
        if (end_date) where.created_at[Op.lte] = new Date(end_date + ' 23:59:59')
      }

      const { count, rows } = await UserStatusChangeRecord.findAndCountAll({
        where,
        include: [
          { model: User, as: 'user', attributes: ['user_id', 'nickname', 'mobile'] },
          { model: User, as: 'operator', attributes: ['user_id', 'nickname', 'mobile'] }
        ],
        ...pagination
      })

      logger.info('查询用户状态变更记录成功', {
        admin_id: req.user.user_id,
        total: count,
        page: pagination.page
      })

      return res.apiSuccess(
        {
          records: rows,
          pagination: {
            total: count,
            page: pagination.page,
            page_size: pagination.page_size,
            total_pages: Math.ceil(count / pagination.page_size)
          }
        },
        '获取用户状态变更记录列表成功'
      )
    } catch (error) {
      return handleServiceError(error, res, '查询用户状态变更记录')
    }
  }
)

/**
 * GET /api/v4/console/business-records/user-status-changes/:record_id
 * @desc 获取用户状态变更记录详情
 * @access Admin only (role_level >= 100)
 */
router.get(
  '/user-status-changes/:record_id',
  authenticateToken,
  requireRole(['admin', 'ops']),
  async (req, res) => {
    try {
      const { record_id } = req.params
      const { UserStatusChangeRecord, User } = require('../../../models')

      const record = await UserStatusChangeRecord.findByPk(parseInt(record_id), {
        include: [
          { model: User, as: 'user', attributes: ['user_id', 'nickname', 'mobile'] },
          { model: User, as: 'operator', attributes: ['user_id', 'nickname', 'mobile'] }
        ]
      })

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
 * @access Admin only (role_level >= 100)
 *
 * @query {number} [user_id] - 用户ID
 * @query {number} [item_id] - 商品ID
 * @query {string} [status] - 订单状态（pending/completed/shipped/cancelled）
 * @query {string} [order_no] - 订单号（模糊搜索）
 * @query {string} [start_date] - 开始日期
 * @query {string} [end_date] - 结束日期
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 */
router.get(
  '/exchange-records',
  authenticateToken,
  requireRole(['admin', 'ops']),
  async (req, res) => {
    try {
      const { user_id, item_id, status, order_no, start_date, end_date } = req.query
      const pagination = buildPaginationOptions(req.query)

      const { ExchangeRecord, User, ExchangeItem } = require('../../../models')

      // 构建查询条件
      const where = {}
      if (user_id) where.user_id = parseInt(user_id)
      if (item_id) where.item_id = parseInt(item_id)
      if (status) where.status = status
      if (order_no) where.order_no = { [Op.like]: `%${order_no}%` }
      if (start_date || end_date) {
        where.created_at = {}
        if (start_date) where.created_at[Op.gte] = new Date(start_date)
        if (end_date) where.created_at[Op.lte] = new Date(end_date + ' 23:59:59')
      }

      const { count, rows } = await ExchangeRecord.findAndCountAll({
        where,
        include: [
          { model: User, as: 'user', attributes: ['user_id', 'nickname', 'mobile'] },
          {
            model: ExchangeItem,
            as: 'item',
            attributes: ['item_id', 'name', 'cost_asset_code', 'cost_amount']
          }
        ],
        ...pagination
      })

      logger.info('查询B2C兑换记录成功', {
        admin_id: req.user.user_id,
        total: count,
        page: pagination.page
      })

      return res.apiSuccess(
        {
          records: rows,
          pagination: {
            total: count,
            page: pagination.page,
            page_size: pagination.page_size,
            total_pages: Math.ceil(count / pagination.page_size)
          }
        },
        '获取B2C兑换记录列表成功'
      )
    } catch (error) {
      return handleServiceError(error, res, '查询B2C兑换记录')
    }
  }
)

/**
 * GET /api/v4/console/business-records/exchange-records/:record_id
 * @desc 获取B2C兑换记录详情
 * @access Admin only (role_level >= 100)
 */
router.get(
  '/exchange-records/:record_id',
  authenticateToken,
  requireRole(['admin', 'ops']),
  async (req, res) => {
    try {
      const { record_id } = req.params
      const { ExchangeRecord, User, ExchangeItem } = require('../../../models')

      const record = await ExchangeRecord.findByPk(parseInt(record_id), {
        include: [
          { model: User, as: 'user', attributes: ['user_id', 'nickname', 'mobile'] },
          { model: ExchangeItem, as: 'item' }
        ]
      })

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
 * @access Admin only (role_level >= 100)
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
router.get('/chat-messages', authenticateToken, requireRole(['admin', 'ops']), async (req, res) => {
  try {
    const {
      session_id,
      sender_id,
      sender_type,
      message_type,
      message_source,
      status,
      start_date,
      end_date,
      search
    } = req.query
    const pagination = buildPaginationOptions(req.query)

    const { ChatMessage, User, CustomerServiceSession } = require('../../../models')

    // 构建查询条件
    const where = {}
    if (session_id) where.session_id = parseInt(session_id)
    if (sender_id) where.sender_id = parseInt(sender_id)
    if (sender_type) where.sender_type = sender_type
    if (message_type) where.message_type = message_type
    if (message_source) where.message_source = message_source
    if (status) where.status = status
    if (search) where.content = { [Op.like]: `%${search}%` }
    if (start_date || end_date) {
      where.created_at = {}
      if (start_date) where.created_at[Op.gte] = new Date(start_date)
      if (end_date) where.created_at[Op.lte] = new Date(end_date + ' 23:59:59')
    }

    const { count, rows } = await ChatMessage.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['user_id', 'nickname', 'mobile'],
          required: false
        },
        {
          model: CustomerServiceSession,
          as: 'session',
          attributes: ['session_id', 'user_id', 'status', 'admin_id'],
          required: false
        }
      ],
      ...pagination
    })

    logger.info('查询聊天消息记录成功', {
      admin_id: req.user.user_id,
      total: count,
      page: pagination.page
    })

    return res.apiSuccess(
      {
        messages: rows,
        pagination: {
          total: count,
          page: pagination.page,
          page_size: pagination.page_size,
          total_pages: Math.ceil(count / pagination.page_size)
        }
      },
      '获取聊天消息列表成功'
    )
  } catch (error) {
    return handleServiceError(error, res, '查询聊天消息记录')
  }
})

/**
 * GET /api/v4/console/business-records/chat-messages/:message_id
 * @desc 获取聊天消息详情
 * @access Admin only (role_level >= 100)
 */
router.get(
  '/chat-messages/:message_id',
  authenticateToken,
  requireRole(['admin', 'ops']),
  async (req, res) => {
    try {
      const { message_id } = req.params
      const { ChatMessage, User, CustomerServiceSession } = require('../../../models')

      const message = await ChatMessage.findByPk(parseInt(message_id), {
        include: [
          {
            model: User,
            as: 'sender',
            attributes: ['user_id', 'nickname', 'mobile'],
            required: false
          },
          {
            model: CustomerServiceSession,
            as: 'session',
            attributes: ['session_id', 'user_id', 'status', 'admin_id', 'created_at'],
            required: false
          },
          {
            model: ChatMessage,
            as: 'replyTo',
            attributes: ['message_id', 'content', 'sender_type', 'created_at'],
            required: false
          }
        ]
      })

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
 * @access Admin only (role_level >= 100)
 *
 * @query {string} [start_date] - 开始日期
 * @query {string} [end_date] - 结束日期
 */
router.get(
  '/chat-messages/statistics/summary',
  authenticateToken,
  requireRole(['admin', 'ops']),
  async (req, res) => {
    try {
      const { start_date, end_date } = req.query
      const { ChatMessage } = require('../../../models')
      const { fn, col } = require('sequelize')

      // 构建日期过滤条件
      const dateWhere = {}
      if (start_date || end_date) {
        dateWhere.created_at = {}
        if (start_date) dateWhere.created_at[Op.gte] = new Date(start_date)
        if (end_date) dateWhere.created_at[Op.lte] = new Date(end_date + ' 23:59:59')
      }

      // 统计总消息数
      const totalMessages = await ChatMessage.count({ where: dateWhere })

      // 按发送者类型统计
      const byType = await ChatMessage.findAll({
        where: dateWhere,
        attributes: ['sender_type', [fn('COUNT', col('message_id')), 'count']],
        group: ['sender_type'],
        raw: true
      })

      // 按消息来源统计
      const bySource = await ChatMessage.findAll({
        where: dateWhere,
        attributes: ['message_source', [fn('COUNT', col('message_id')), 'count']],
        group: ['message_source'],
        raw: true
      })

      // 按状态统计
      const byStatus = await ChatMessage.findAll({
        where: dateWhere,
        attributes: ['status', [fn('COUNT', col('message_id')), 'count']],
        group: ['status'],
        raw: true
      })

      logger.info('查询聊天消息统计成功', { admin_id: req.user.user_id })

      return res.apiSuccess(
        {
          total_messages: totalMessages,
          by_sender_type: byType.reduce((acc, item) => {
            acc[item.sender_type] = parseInt(item.count)
            return acc
          }, {}),
          by_message_source: bySource.reduce((acc, item) => {
            acc[item.message_source] = parseInt(item.count)
            return acc
          }, {}),
          by_status: byStatus.reduce((acc, item) => {
            acc[item.status] = parseInt(item.count)
            return acc
          }, {}),
          date_range: {
            start_date: start_date || null,
            end_date: end_date || null
          }
        },
        '获取聊天消息统计成功'
      )
    } catch (error) {
      return handleServiceError(error, res, '获取聊天消息统计')
    }
  }
)

module.exports = router
