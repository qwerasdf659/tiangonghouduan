/**
 * 商家审计日志查询路由
 *
 * @route /api/v4/shop/audit
 * @description 商家操作日志查询 API（AC4.3 + AC4.4）
 *
 * API列表：
 * - GET /logs - 查询商家操作日志列表
 * - GET /logs/:log_id - 查询单条日志详情
 * - GET /export - CSV导出商家操作日志（门店隔离+时间范围+流式输出）
 *
 * 权限控制：
 * - 需要 staff:read 权限（店长/管理员）
 * - 非管理员只能查看/导出所属门店的日志
 *
 * 创建时间：2026-01-12
 * 更新时间：2026-01-12（添加 CSV 导出功能）
 * 依据文档：docs/商家员工域权限体系升级方案.md AC4.3, AC4.4
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, requireMerchantPermission } = require('../../../../middleware/auth')
const { asyncHandler } = require('../../../../middleware/validation')
const logger = require('../../../../utils/logger').logger
const BeijingTimeHelper = require('../../../../utils/timeHelper')

/*
 * 路由层合规性治理（2026-01-18）：
 * - 移除直接 require models
 * - 通过 ServiceManager 统一获取服务
 * - 所有数据库操作收口到 MerchantOperationLogService
 */

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
  asyncHandler(async (req, res) => {
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

    let resolved_store_id = req.verified_store_id || (store_id ? parseInt(store_id, 10) : null)

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

    const MerchantOperationLogService =
      req.app.locals.services.getService('merchant_operation_log')

    const filters = {
      page: parseInt(page, 10),
      page_size: parseInt(page_size, 10)
    }
    if (resolved_store_id) filters.store_id = resolved_store_id
    if (operator_id) filters.operator_id = parseInt(operator_id, 10)
    if (operation_type) filters.operation_type = operation_type
    if (result) filters.result = result

    if (start_date) {
      const startDateTime = BeijingTimeHelper.parseFromDateString(start_date)
      filters.start_time = BeijingTimeHelper.formatForAPI(startDateTime)?.iso
    }
    if (end_date) {
      const endDateTime = BeijingTimeHelper.parseFromDateString(end_date)
      endDateTime.setHours(23, 59, 59, 999)
      filters.end_time = BeijingTimeHelper.formatForAPI(endDateTime)?.iso
    }

    const result_data = await MerchantOperationLogService.queryLogs(filters)

    return res.apiSuccess(
      {
        logs: result_data.items,
        pagination: result_data.pagination
      },
      '商家操作日志获取成功'
    )
  })
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
  asyncHandler(async (req, res) => {
    const { log_id } = req.params
    const logId = parseInt(log_id, 10)

    if (isNaN(logId) || logId <= 0) {
      return res.apiError('无效的日志ID', 'BAD_REQUEST', null, 400)
    }

    const MerchantOperationLogService =
      req.app.locals.services.getService('merchant_operation_log')
    const log = await MerchantOperationLogService.getLogDetail(logId)

    if (!log) {
      return res.apiError('日志不存在', 'NOT_FOUND', null, 404)
    }

    const user_stores = req.user_stores || []
    if (req.user.role_level < 100 && log.store_id) {
      const hasAccess = user_stores.some(s => s.store_id === log.store_id)
      if (!hasAccess) {
        return res.apiError('无权查看此日志', 'FORBIDDEN', null, 403)
      }
    }

    return res.apiSuccess(log, '日志详情获取成功')
  })
)

/**
 * @route GET /api/v4/shop/audit/export
 * @desc CSV导出商家操作日志（门店隔离+时间范围+流式输出）
 * @access Private (店长或管理员，需 staff:read 权限)
 *
 * @query {number} store_id - 门店ID（可选，管理员可不传查全部）
 * @query {string} start_date - 开始日期（必填，格式：YYYY-MM-DD）
 * @query {string} end_date - 结束日期（必填，格式：YYYY-MM-DD）
 * @query {string} operation_type - 操作类型（可选）
 * @query {string} result - 操作结果（可选：success/failed/blocked）
 * @query {number} page_size - 最大导出条数（可选，默认10000，最大50000）
 *
 * 响应：
 * - Content-Type: text/csv
 * - 流式输出，支持大数据量导出
 *
 * AC4.4 导出格式：
 * 时间,操作员ID,操作员名称,门店ID,门店名称,操作类型,操作结果,目标用户ID,消费金额,IP地址
 *
 * @since 2026-01-12
 */
router.get(
  '/export',
  authenticateToken,
  requireMerchantPermission('staff:read', { scope: 'store', storeIdParam: 'query' }),
  asyncHandler(async (req, res) => {
    const {
      store_id,
      start_date,
      end_date,
      operation_type,
      result,
      page_size = 10000
    } = req.query

    const user_stores = req.user_stores || []

    if (!start_date || !end_date) {
      return res.apiError('导出需要指定开始日期和结束日期', 'MISSING_DATE_RANGE', null, 400)
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(start_date) || !dateRegex.test(end_date)) {
      return res.apiError('日期格式不正确，应为 YYYY-MM-DD', 'INVALID_DATE_FORMAT', null, 400)
    }

    const startDateTime = BeijingTimeHelper.parseFromDateString(start_date)
    const endDateTime = BeijingTimeHelper.parseFromDateString(end_date)
    endDateTime.setHours(23, 59, 59, 999)

    const daysDiff = Math.ceil((endDateTime - startDateTime) / (1000 * 60 * 60 * 24))
    if (daysDiff > 90) {
      return res.apiError(
        '单次导出最多支持 90 天数据',
        'DATE_RANGE_TOO_LARGE',
        { max_days: 90 },
        400
      )
    }

    if (daysDiff < 0) {
      return res.apiError('结束日期不能早于开始日期', 'INVALID_DATE_RANGE', null, 400)
    }

    let resolved_store_id = req.verified_store_id || (store_id ? parseInt(store_id, 10) : null)

    if (req.user.role_level < 100 && !resolved_store_id) {
      if (user_stores.length === 0) {
        return res.apiError('您未绑定任何门店', 'NO_STORE_BINDING', null, 403)
      } else if (user_stores.length === 1) {
        resolved_store_id = user_stores[0].store_id
      } else {
        return res.apiError(
          '您绑定了多个门店，请明确指定 store_id 参数',
          'MULTIPLE_STORES_REQUIRE_STORE_ID',
          null,
          400
        )
      }
    }

    const MerchantOperationLogService =
      req.app.locals.services.getService('merchant_operation_log')

    const exportLimit = Math.min(Math.max(parseInt(page_size) || 10000, 100), 50000)

    logger.info('开始导出商家审计日志', {
      user_id: req.user.user_id,
      store_id: resolved_store_id,
      start_date,
      end_date,
      export_limit: exportLimit
    })

    const logs = await MerchantOperationLogService.exportLogs({
      store_id: resolved_store_id,
      start_time: startDateTime,
      end_time: endDateTime,
      operation_type,
      result,
      limit: exportLimit
    })

    const filename = `audit_logs_${resolved_store_id || 'all'}_${start_date}_${end_date}.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Cache-Control', 'no-cache')

    res.write('\uFEFF')

    const headers = [
      '时间',
      '操作员ID',
      '操作员名称',
      '门店ID',
      '门店名称',
      '操作类型',
      '操作动作',
      '操作结果',
      '目标用户ID',
      '消费金额',
      'IP地址',
      '请求ID',
      '错误信息'
    ]
    res.write(headers.join(',') + '\n')

    for (const log of logs) {
      const row = [
        escapeCSV(BeijingTimeHelper.formatForAPI(log.created_at)?.iso || ''),
        log.operator_id || '',
        escapeCSV(log.operator?.nickname || ''),
        log.store_id || '',
        escapeCSV(log.store?.store_name || ''),
        escapeCSV(log.operation_type || ''),
        escapeCSV(log.action || ''),
        log.result || '',
        log.target_user_id || '',
        log.consumption_amount || '',
        escapeCSV(log.ip_address || ''),
        escapeCSV(log.request_id || ''),
        escapeCSV(log.error_message || '')
      ]
      res.write(row.join(',') + '\n')
    }

    res.end()

    logger.info('商家审计日志导出完成', {
      user_id: req.user.user_id,
      store_id: resolved_store_id,
      exported_count: logs.length
    })

    return undefined
  })
)

/**
 * CSV 字段转义函数
 *
 * @param {string} field - 原始字段值
 * @returns {string} 转义后的字段值
 */
function escapeCSV(field) {
  if (field === null || field === undefined) return ''
  const str = String(field)
  // 如果包含逗号、引号或换行符，需要用引号包裹并转义内部引号
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

module.exports = router
