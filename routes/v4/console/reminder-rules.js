/**
 * 智能提醒规则路由
 *
 * 功能说明：
 * - 规则CRUD：创建、查询、更新、删除提醒规则
 * - 规则测试：测试规则匹配效果
 * - 规则启停：启用/禁用规则
 * - 提醒历史：历史记录查询、统计分析
 *
 * 任务编号：
 * - B-34: 提醒规则CRUD
 * - B-35: 提醒历史接口
 *
 * 创建时间：2026年01月31日
 * 更新时间：2026年02月01日 - 添加提醒历史接口 (B-35)
 *
 * @module routes/v4/console/reminder-rules
 */

'use strict'

const express = require('express')
const router = express.Router()
const ServiceManager = require('../../../services')
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const logger = require('../../../utils/logger')

// ==================== 路由配置 ====================

/**
 * GET /api/v4/console/reminder-rules
 *
 * 获取提醒规则列表
 *
 * 查询参数:
 * - rule_type: 规则类型筛选
 * - is_enabled: 启用状态筛选
 * - is_system: 是否系统规则
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 */
router.get('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const reminderService = ServiceManager.getService('reminder_engine')
    const { rule_type, is_enabled, is_system, page, page_size } = req.query

    const result = await reminderService.getRuleList({
      rule_type,
      is_enabled: is_enabled === 'true' ? true : is_enabled === 'false' ? false : undefined,
      is_system: is_system === 'true' ? true : is_system === 'false' ? false : undefined,
      page: parseInt(page, 10) || 1,
      page_size: parseInt(page_size, 10) || 20
    })

    return res.apiSuccess(result, '获取提醒规则列表成功')
  } catch (error) {
    logger.error('[提醒规则] 获取列表失败', { error: error.message })
    return res.apiError('获取提醒规则列表失败', 'REMINDER_RULE_LIST_ERROR', null, 500)
  }
})

/**
 * GET /api/v4/console/reminder-rules/:id
 *
 * 获取单个提醒规则详情
 */
router.get('/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const reminderService = ServiceManager.getService('reminder_engine')
    const ruleId = parseInt(req.params.id, 10)

    if (!ruleId || isNaN(ruleId)) {
      return res.apiError('无效的规则ID', 'INVALID_RULE_ID', null, 400)
    }

    const rule = await reminderService.getRuleDetail(ruleId)

    if (!rule) {
      return res.apiError('提醒规则不存在', 'RULE_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(rule, '获取提醒规则详情成功')
  } catch (error) {
    logger.error('[提醒规则] 获取详情失败', { error: error.message })
    return res.apiError('获取提醒规则详情失败', 'REMINDER_RULE_GET_ERROR', null, 500)
  }
})

/**
 * POST /api/v4/console/reminder-rules
 *
 * 创建新的提醒规则
 *
 * 请求体:
 * - name: 规则名称（必需）
 * - rule_type: 规则类型（必需）
 * - description: 规则描述
 * - trigger_conditions: 触发条件
 * - action_config: 动作配置
 * - notification_template: 通知模板
 * - check_interval: 检查间隔（分钟）
 * - priority: 优先级（1-100）
 */
router.post('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const reminderService = ServiceManager.getService('reminder_engine')
    const {
      name,
      rule_type,
      description,
      trigger_conditions,
      action_config,
      notification_template,
      check_interval,
      priority
    } = req.body

    // 参数验证
    if (!name || !rule_type) {
      return res.apiError('规则名称和类型不能为空', 'MISSING_REQUIRED_FIELDS', null, 400)
    }

    const rule = await reminderService.createRule({
      name,
      rule_type,
      description,
      trigger_conditions,
      action_config,
      notification_template,
      check_interval: check_interval || 60,
      priority: priority || 50,
      created_by: req.user.user_id
    })

    logger.info('[提醒规则] 创建成功', {
      reminder_rule_id: rule.reminder_rule_id,
      name,
      created_by: req.user.user_id
    })

    return res.apiSuccess(rule, '创建提醒规则成功', 201)
  } catch (error) {
    logger.error('[提醒规则] 创建失败', { error: error.message })
    return res.apiError(
      `创建提醒规则失败: ${error.message}`,
      'REMINDER_RULE_CREATE_ERROR',
      null,
      500
    )
  }
})

/**
 * PUT /api/v4/console/reminder-rules/:id
 *
 * 更新提醒规则
 */
router.put('/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const reminderService = ServiceManager.getService('reminder_engine')
    const ruleId = parseInt(req.params.id, 10)

    if (!ruleId || isNaN(ruleId)) {
      return res.apiError('无效的规则ID', 'INVALID_RULE_ID', null, 400)
    }

    const updateData = req.body
    const rule = await reminderService.updateRule(ruleId, updateData)

    logger.info('[提醒规则] 更新成功', {
      reminder_rule_id: ruleId,
      updated_by: req.user.user_id
    })

    return res.apiSuccess(rule, '更新提醒规则成功')
  } catch (error) {
    logger.error('[提醒规则] 更新失败', { error: error.message })
    return res.apiError(
      `更新提醒规则失败: ${error.message}`,
      'REMINDER_RULE_UPDATE_ERROR',
      null,
      500
    )
  }
})

/**
 * DELETE /api/v4/console/reminder-rules/:id
 *
 * 删除提醒规则（系统规则不可删除）
 */
router.delete('/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const reminderService = ServiceManager.getService('reminder_engine')
    const ruleId = parseInt(req.params.id, 10)

    if (!ruleId || isNaN(ruleId)) {
      return res.apiError('无效的规则ID', 'INVALID_RULE_ID', null, 400)
    }

    await reminderService.deleteRule(ruleId)

    logger.info('[提醒规则] 删除成功', {
      reminder_rule_id: ruleId,
      deleted_by: req.user.user_id
    })

    return res.apiSuccess(null, '删除提醒规则成功')
  } catch (error) {
    logger.error('[提醒规则] 删除失败', { error: error.message })
    return res.apiError(
      `删除提醒规则失败: ${error.message}`,
      'REMINDER_RULE_DELETE_ERROR',
      null,
      500
    )
  }
})

/**
 * PUT /api/v4/console/reminder-rules/:id/toggle
 *
 * 启用/禁用提醒规则
 */
router.put('/:id/toggle', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const reminderService = ServiceManager.getService('reminder_engine')
    const ruleId = parseInt(req.params.id, 10)
    const { is_enabled } = req.body

    if (!ruleId || isNaN(ruleId)) {
      return res.apiError('无效的规则ID', 'INVALID_RULE_ID', null, 400)
    }

    if (typeof is_enabled !== 'boolean') {
      return res.apiError('is_enabled 必须是布尔值', 'INVALID_ENABLED_VALUE', null, 400)
    }

    const rule = await reminderService.updateRule(ruleId, { is_enabled })

    logger.info('[提醒规则] 切换状态', {
      reminder_rule_id: ruleId,
      is_enabled,
      updated_by: req.user.user_id
    })

    return res.apiSuccess(rule, `规则已${is_enabled ? '启用' : '禁用'}`)
  } catch (error) {
    logger.error('[提醒规则] 切换状态失败', { error: error.message })
    return res.apiError(
      `切换规则状态失败: ${error.message}`,
      'REMINDER_RULE_TOGGLE_ERROR',
      null,
      500
    )
  }
})

/**
 * POST /api/v4/console/reminder-rules/:id/test
 *
 * 测试提醒规则（检查规则是否会触发）
 */
router.post('/:id/test', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const reminderService = ServiceManager.getService('reminder_engine')
    const ruleId = parseInt(req.params.id, 10)

    if (!ruleId || isNaN(ruleId)) {
      return res.apiError('无效的规则ID', 'INVALID_RULE_ID', null, 400)
    }

    const rule = await reminderService.getRuleDetail(ruleId)
    if (!rule) {
      return res.apiError('提醒规则不存在', 'RULE_NOT_FOUND', null, 404)
    }

    // 执行规则检查（不实际发送通知）
    const checkResult = await reminderService.checkRule(rule)

    return res.apiSuccess(
      {
        reminder_rule_id: ruleId,
        rule_name: rule.name,
        would_trigger: checkResult.triggered,
        matched_users: checkResult.users?.length || 0,
        matched_data: checkResult.data
      },
      '规则测试完成'
    )
  } catch (error) {
    logger.error('[提醒规则] 测试失败', { error: error.message })
    return res.apiError(`测试规则失败: ${error.message}`, 'REMINDER_RULE_TEST_ERROR', null, 500)
  }
})

/**
 * POST /api/v4/console/reminder-rules/:id/execute
 *
 * 手动执行提醒规则（立即检查并发送通知）
 */
router.post('/:id/execute', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const reminderService = ServiceManager.getService('reminder_engine')
    const ruleId = parseInt(req.params.id, 10)

    if (!ruleId || isNaN(ruleId)) {
      return res.apiError('无效的规则ID', 'INVALID_RULE_ID', null, 400)
    }

    const rule = await reminderService.getRuleDetail(ruleId)
    if (!rule) {
      return res.apiError('提醒规则不存在', 'RULE_NOT_FOUND', null, 404)
    }

    // 执行规则
    const result = await reminderService.executeRule(rule)

    logger.info('[提醒规则] 手动执行完成', {
      reminder_rule_id: ruleId,
      triggered: result.triggered,
      executed_by: req.user.user_id
    })

    return res.apiSuccess(result, '规则执行完成')
  } catch (error) {
    logger.error('[提醒规则] 执行失败', { error: error.message })
    return res.apiError(`执行规则失败: ${error.message}`, 'REMINDER_RULE_EXECUTE_ERROR', null, 500)
  }
})

// ==================== 提醒历史接口 (B-35) ====================

/**
 * GET /api/v4/console/reminder-rules/history
 *
 * 获取提醒历史记录列表
 *
 * 查询参数:
 * - rule_id: 规则ID筛选（可选）
 * - status: 发送状态筛选（pending/sent/failed）
 * - start_date: 开始日期
 * - end_date: 结束日期
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 *
 * @description 任务编号 B-35：提醒历史接口
 */
router.get('/history', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const reminderService = ServiceManager.getService('reminder_engine')
    const { rule_id, status, start_date, end_date, page, page_size } = req.query

    const result = await reminderService.getReminderHistory({
      rule_id: rule_id ? parseInt(rule_id, 10) : undefined,
      status,
      start_date,
      end_date,
      page: parseInt(page, 10) || 1,
      page_size: parseInt(page_size, 10) || 20
    })

    return res.apiSuccess(result, '获取提醒历史成功')
  } catch (error) {
    logger.error('[提醒历史] 查询失败', { error: error.message })
    return res.apiError(
      `获取提醒历史失败: ${error.message}`,
      'REMINDER_HISTORY_QUERY_ERROR',
      null,
      500
    )
  }
})

/**
 * GET /api/v4/console/reminder-rules/history/stats
 *
 * 获取提醒历史统计数据
 *
 * 查询参数:
 * - rule_id: 规则ID筛选（可选）
 * - start_date: 开始日期
 * - end_date: 结束日期
 *
 * @description 提供提醒发送成功率、各规则触发次数等统计
 */
router.get('/history/stats', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const reminderService = ServiceManager.getService('reminder_engine')
    const { rule_id, start_date, end_date } = req.query

    const result = await reminderService.getReminderHistory({
      rule_id: rule_id ? parseInt(rule_id, 10) : undefined,
      start_date,
      end_date,
      include_stats: true,
      page: 1,
      page_size: 1 // 只需要统计数据
    })

    return res.apiSuccess(
      {
        total_count: result.stats?.total || 0,
        by_status: result.stats?.by_status || {},
        by_rule: result.stats?.by_rule || [],
        success_rate:
          result.stats?.total > 0
            ? Math.round(((result.stats?.by_status?.sent || 0) / result.stats.total) * 100)
            : 0
      },
      '获取提醒统计成功'
    )
  } catch (error) {
    logger.error('[提醒统计] 查询失败', { error: error.message })
    return res.apiError(
      `获取提醒统计失败: ${error.message}`,
      'REMINDER_STATS_QUERY_ERROR',
      null,
      500
    )
  }
})

/**
 * GET /api/v4/console/reminder-rules/history/:id
 *
 * 获取提醒历史详情
 *
 * @param {number} id - 历史记录ID
 */
router.get('/history/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const models = require('../../../models')
    const historyId = parseInt(req.params.id, 10)

    if (!historyId || isNaN(historyId)) {
      return res.apiError('无效的历史记录ID', 'INVALID_HISTORY_ID', null, 400)
    }

    const history = await models.ReminderHistory.findByPk(historyId, {
      include: [
        {
          model: models.ReminderRule,
          as: 'rule',
          attributes: ['reminder_rule_id', 'rule_code', 'rule_name', 'rule_type']
        }
      ]
    })

    if (!history) {
      return res.apiError('提醒历史记录不存在', 'HISTORY_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(history, '获取提醒历史详情成功')
  } catch (error) {
    logger.error('[提醒历史] 获取详情失败', { error: error.message })
    return res.apiError(
      `获取历史详情失败: ${error.message}`,
      'REMINDER_HISTORY_DETAIL_ERROR',
      null,
      500
    )
  }
})

module.exports = router
