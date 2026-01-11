/**
 * 商家审计日志查询路由
 *
 * @route /api/v4/shop/audit
 * @description 商家操作日志查询 API（AC4.3）
 *
 * API列表：
 * - GET /logs - 查询商家操作日志列表
 * - GET /logs/:log_id - 查询单条日志详情
 *
 * 权限控制：
 * - 需要 staff:read 权限（店长/管理员）
 * - 非管理员只能查看所属门店的日志
 *
 * 创建时间：2026-01-12
 * 依据文档：docs/商家员工域权限体系升级方案.md AC4.3
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireMerchantPermission } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger
const { MerchantOperationLog, User, Store } = require('../../../../models')
const { Op } = require('sequelize')
const BeijingTimeHelper = require('../../../../utils/timeHelper')

/**
 * @route GET /api/v4/shop/audit/logs
 * @desc 查询商家操作日志列表
 * @access Private (店长或管理员，需 staff:read 权限)
 *
 * @query {number} store_id - 门店ID（可选，管理员可不传查全部）
 * @query {number} operator_id - 操作员ID（可选）
 * @query {string} operation_type - 操作类型（可选）
 * @query {string} result - 操作结果（可选：success/failed/blocked）
 * @query {string} start_date - 开始日期（可选，格式：YYYY-MM-DD）
 * @query {string} end_date - 结束日期（可选，格式：YYYY-MM-DD）
 * @query {number} page - 页码（默认1）
 * @query {number} page_size - 每页条数（默认20，最大100）
 *
 * @returns {Object} 日志列表
 */
router.get(
  '/logs',
  authenticateToken,
  requireMerchantPermission('staff:read', { scope: 'store', storeIdParam: 'query' }),
  async (req, res) => {
    try {
      const {
        store_id,
        operator_id,
        operation_type,
        result,
        start_date,
        end_date,
        page = 1,
        page_size = 20
      } = req.query

      const user_stores = req.user_stores || []

      // 确定查询的门店范围
      let resolved_store_id = req.verified_store_id || (store_id ? parseInt(store_id, 10) : null)

      // 非管理员限制只能查看所属门店
      if (req.user.role_level < 100 && !resolved_store_id) {
        if (user_stores.length === 0) {
          return res.apiError('您未绑定任何门店', 'NO_STORE_BINDING', null, 403)
        } else if (user_stores.length === 1) {
          resolved_store_id = user_stores[0].store_id
        } else {
          return res.apiError(
            '您绑定了多个门店，请明确指定 store_id 参数',
            'MULTIPLE_STORES_REQUIRE_STORE_ID',
            {
              available_stores: user_stores.map(s => ({
                store_id: s.store_id,
                store_name: s.store_name
              }))
            },
            400
          )
        }
      }

      // 构建查询条件
      const where = {}
      if (resolved_store_id) where.store_id = resolved_store_id
      if (operator_id) where.operator_id = parseInt(operator_id, 10)
      if (operation_type) where.operation_type = operation_type
      if (result) where.result = result

      // 日期范围
      if (start_date || end_date) {
        where.created_at = {}
        if (start_date) {
          where.created_at[Op.gte] = BeijingTimeHelper.parseFromDateString(start_date)
        }
        if (end_date) {
          const endDateTime = BeijingTimeHelper.parseFromDateString(end_date)
          endDateTime.setHours(23, 59, 59, 999)
          where.created_at[Op.lte] = endDateTime
        }
      }

      // 分页参数
      const pageNum = Math.max(1, parseInt(page, 10))
      const pageSize = Math.min(100, Math.max(1, parseInt(page_size, 10)))
      const offset = (pageNum - 1) * pageSize

      // 查询日志
      const { count, rows } = await MerchantOperationLog.findAndCountAll({
        where,
        include: [
          {
            model: User,
            as: 'operator',
            attributes: ['user_id', 'nickname', 'mobile']
          },
          {
            model: Store,
            as: 'store',
            attributes: ['store_id', 'store_name']
          },
          {
            model: User,
            as: 'targetUser',
            attributes: ['user_id', 'nickname', 'mobile']
          }
        ],
        order: [['created_at', 'DESC']],
        limit: pageSize,
        offset
      })

      const logs = rows.map(log => ({
        ...log.toAPIResponse(),
        operator: log.operator
          ? {
              user_id: log.operator.user_id,
              nickname: log.operator.nickname,
              mobile: log.operator.mobile
            }
          : null,
        store: log.store
          ? {
              store_id: log.store.store_id,
              store_name: log.store.store_name
            }
          : null,
        target_user: log.targetUser
          ? {
              user_id: log.targetUser.user_id,
              nickname: log.targetUser.nickname,
              mobile: log.targetUser.mobile
            }
          : null
      }))

      return res.apiSuccess(
        {
          logs,
          pagination: {
            total: count,
            page: pageNum,
            page_size: pageSize,
            total_pages: Math.ceil(count / pageSize)
          }
        },
        '商家操作日志获取成功'
      )
    } catch (error) {
      logger.error('获取商家操作日志失败', { error: error.message })
      return handleServiceError(error, res, '获取商家操作日志失败')
    }
  }
)

/**
 * @route GET /api/v4/shop/audit/logs/:log_id
 * @desc 查询单条日志详情
 * @access Private (店长或管理员，需 staff:read 权限)
 */
router.get(
  '/logs/:log_id',
  authenticateToken,
  requireMerchantPermission('staff:read', { scope: 'global' }),
  async (req, res) => {
    try {
      const { log_id } = req.params
      const logId = parseInt(log_id, 10)

      if (isNaN(logId) || logId <= 0) {
        return res.apiError('无效的日志ID', 'BAD_REQUEST', null, 400)
      }

      const log = await MerchantOperationLog.findByPk(logId, {
        include: [
          {
            model: User,
            as: 'operator',
            attributes: ['user_id', 'nickname', 'mobile']
          },
          {
            model: Store,
            as: 'store',
            attributes: ['store_id', 'store_name']
          },
          {
            model: User,
            as: 'targetUser',
            attributes: ['user_id', 'nickname', 'mobile']
          }
        ]
      })

      if (!log) {
        return res.apiError('日志不存在', 'NOT_FOUND', null, 404)
      }

      // 非管理员只能查看所属门店的日志
      const user_stores = req.user_stores || []
      if (req.user.role_level < 100 && log.store_id) {
        const hasAccess = user_stores.some(s => s.store_id === log.store_id)
        if (!hasAccess) {
          return res.apiError('无权查看此日志', 'FORBIDDEN', null, 403)
        }
      }

      const result = {
        ...log.toAPIResponse(),
        operator: log.operator
          ? {
              user_id: log.operator.user_id,
              nickname: log.operator.nickname,
              mobile: log.operator.mobile
            }
          : null,
        store: log.store
          ? {
              store_id: log.store.store_id,
              store_name: log.store.store_name
            }
          : null,
        target_user: log.targetUser
          ? {
              user_id: log.targetUser.user_id,
              nickname: log.targetUser.nickname,
              mobile: log.targetUser.mobile
            }
          : null,
        extra_data: log.extra_data
      }

      return res.apiSuccess(result, '日志详情获取成功')
    } catch (error) {
      logger.error('获取日志详情失败', { error: error.message })
      return handleServiceError(error, res, '获取日志详情失败')
    }
  }
)

module.exports = router
