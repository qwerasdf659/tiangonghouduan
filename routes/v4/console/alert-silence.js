/**
 * @file 告警静默规则管理路由（Alert Silence Rules Routes）
 * @description 告警静默规则的 CRUD API
 *
 * API 路径：/api/v4/console/alert-silence-rules
 *
 * @version 1.0.0
 * @date 2026-03-20
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const { asyncHandler } = require('./shared/middleware')
const TransactionManager = require('../../../utils/TransactionManager')
const logger = require('../../../utils/logger').logger

const getAlertSilenceService = req => {
  return req.app.locals.services.getService('alert_silence')
}

/**
 * GET / - 获取静默规则列表
 *
 * @route GET /api/v4/console/alert-silence-rules
 * @query {string} [alert_type] - 告警类型
 * @query {string} [alert_level] - 告警级别
 * @query {string} [is_active] - 是否启用 (true/false)
 * @query {string} [keyword] - 关键词搜索
 * @query {number} [page=1] - 页码
 * @query {number} [page_size=20] - 每页数量
 * @access admin
 */
router.get(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const service = getAlertSilenceService(req)
    const result = await service.getRules({
      alert_type: req.query.alert_type,
      alert_level: req.query.alert_level,
      is_active:
        req.query.is_active === 'true'
          ? true
          : req.query.is_active === 'false'
            ? false
            : undefined,
      keyword: req.query.keyword,
      page: req.query.page || 1,
      page_size: req.query.page_size || 20
    })

    return res.apiSuccess(
      {
        list: result.rows,
        pagination: {
          total_count: result.count,
          page: result.page,
          page_size: result.page_size
        }
      },
      '获取静默规则列表成功'
    )
  })
)

/**
 * POST / - 创建静默规则
 *
 * @route POST /api/v4/console/alert-silence-rules
 * @body {string} rule_name - 规则名称
 * @body {string} alert_type - 告警类型
 * @body {string} [alert_level='all'] - 告警级别
 * @body {Object} [condition_json] - 条件 JSON
 * @body {string} [start_time] - 每日静默开始时间
 * @body {string} [end_time] - 每日静默结束时间
 * @body {string} [effective_start_date] - 生效开始日期
 * @body {string} [effective_end_date] - 生效结束日期
 * @body {boolean} [is_active=true] - 是否启用
 * @access admin
 */
router.post(
  '/',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const { rule_name, alert_type } = req.body

    if (!rule_name || !alert_type) {
      return res.apiError('缺少必要参数：rule_name 和 alert_type', 'INVALID_PARAMS', null, 400)
    }

    const service = getAlertSilenceService(req)

    const rule = await TransactionManager.execute(async transaction => {
      return service.createRule(
        {
          ...req.body,
          created_by: req.user.user_id
        },
        { transaction }
      )
    })

    logger.info('[alert-silence] 创建静默规则', {
      admin_id: req.user.user_id,
      alert_silence_rule_id: rule.alert_silence_rule_id
    })

    return res.apiSuccess(rule, '创建静默规则成功')
  })
)

/**
 * PUT /:id - 更新静默规则
 *
 * @route PUT /api/v4/console/alert-silence-rules/:id
 * @param {number} id - 规则 ID
 * @access admin
 */
router.put(
  '/:id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const ruleId = req.params.id
    const service = getAlertSilenceService(req)

    const rule = await TransactionManager.execute(async transaction => {
      return service.updateRule(
        ruleId,
        {
          ...req.body,
          updated_by: req.user.user_id
        },
        { transaction }
      )
    })

    logger.info('[alert-silence] 更新静默规则', {
      admin_id: req.user.user_id,
      alert_silence_rule_id: ruleId
    })

    return res.apiSuccess(rule, '更新静默规则成功')
  })
)

/**
 * DELETE /:id - 删除静默规则
 *
 * @route DELETE /api/v4/console/alert-silence-rules/:id
 * @param {number} id - 规则 ID
 * @access admin
 */
router.delete(
  '/:id',
  authenticateToken,
  requireRoleLevel(100),
  asyncHandler(async (req, res) => {
    const ruleId = req.params.id
    const service = getAlertSilenceService(req)

    await TransactionManager.execute(async transaction => {
      return service.deleteRule(ruleId, { transaction })
    })

    logger.info('[alert-silence] 删除静默规则', {
      admin_id: req.user.user_id,
      alert_silence_rule_id: ruleId
    })

    return res.apiSuccess(null, '删除静默规则成功')
  })
)

module.exports = router
