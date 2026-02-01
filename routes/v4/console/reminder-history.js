/**
 * 智能提醒历史路由
 *
 * 功能说明：
 * - 历史查询：获取提醒触发历史记录
 * - 统计分析：提醒效果统计
 *
 * 任务编号：B-35 提醒历史接口
 * 创建时间：2026年01月31日
 *
 * @module routes/v4/console/reminder-history
 */

'use strict'

const express = require('express')
const router = express.Router()
const ServiceManager = require('../../../services')
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const logger = require('../../../utils/logger')

// ==================== 路由配置 ====================

/**
 * GET /api/v4/console/reminder-history
 *
 * 获取提醒历史列表
 *
 * 查询参数:
 * - reminder_rule_id: 规则ID筛选
 * - user_id: 用户ID筛选
 * - notification_status: 通知状态筛选
 * - start_time: 开始时间
 * - end_time: 结束时间
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 */
router.get('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const reminderService = ServiceManager.getService('reminder_engine')
    const {
      reminder_rule_id,
      user_id,
      notification_status,
      start_time,
      end_time,
      page,
      page_size
    } = req.query

    const result = await reminderService.getReminderHistory({
      reminder_rule_id: reminder_rule_id ? parseInt(reminder_rule_id, 10) : undefined,
      user_id: user_id ? parseInt(user_id, 10) : undefined,
      notification_status,
      start_time: start_time ? new Date(start_time) : undefined,
      end_time: end_time ? new Date(end_time) : undefined,
      page: parseInt(page, 10) || 1,
      page_size: parseInt(page_size, 10) || 20
    })

    return res.apiSuccess(result, '获取提醒历史成功')
  } catch (error) {
    logger.error('[提醒历史] 获取列表失败', { error: error.message })
    return res.apiError('获取提醒历史失败', 'REMINDER_HISTORY_LIST_ERROR', null, 500)
  }
})

/**
 * GET /api/v4/console/reminder-history/:id
 *
 * 获取单条提醒历史详情
 */
router.get('/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const reminderService = ServiceManager.getService('reminder_engine')
    const historyId = parseInt(req.params.id, 10)

    if (!historyId || isNaN(historyId)) {
      return res.apiError('无效的历史记录ID', 'INVALID_HISTORY_ID', null, 400)
    }

    const history = await reminderService.getReminderHistoryById(historyId)

    if (!history) {
      return res.apiError('提醒历史记录不存在', 'HISTORY_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(history, '获取提醒历史详情成功')
  } catch (error) {
    logger.error('[提醒历史] 获取详情失败', { error: error.message })
    return res.apiError('获取提醒历史详情失败', 'REMINDER_HISTORY_GET_ERROR', null, 500)
  }
})

/**
 * GET /api/v4/console/reminder-history/stats/overview
 *
 * 获取提醒统计概览
 *
 * 查询参数:
 * - start_time: 开始时间
 * - end_time: 结束时间
 */
router.get('/stats/overview', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { ReminderHistory } = require('../../../models')
    const { Op } = require('sequelize')
    const sequelize = require('../../../models').sequelize

    const { start_time, end_time } = req.query

    const where = {}
    if (start_time || end_time) {
      where.triggered_at = {}
      if (start_time) {
        where.triggered_at[Op.gte] = new Date(start_time)
      }
      if (end_time) {
        where.triggered_at[Op.lte] = new Date(end_time)
      }
    }

    // 总触发次数
    const totalTriggers = await ReminderHistory.count({ where })

    // 按状态统计
    const byStatus = await ReminderHistory.findAll({
      where,
      attributes: [
        'notification_status',
        [sequelize.fn('COUNT', sequelize.col('reminder_history_id')), 'count']
      ],
      group: ['notification_status'],
      raw: true
    })

    // 按规则统计（Top 10）
    const byRule = await ReminderHistory.findAll({
      where,
      attributes: [
        'reminder_rule_id',
        [sequelize.fn('COUNT', sequelize.col('reminder_history_id')), 'count']
      ],
      group: ['reminder_rule_id'],
      order: [[sequelize.fn('COUNT', sequelize.col('reminder_history_id')), 'DESC']],
      limit: 10,
      raw: true
    })

    // 转换格式
    const statusStats = {}
    byStatus.forEach(item => {
      statusStats[item.notification_status] = parseInt(item.count, 10)
    })

    return res.apiSuccess(
      {
        total_triggers: totalTriggers,
        by_status: statusStats,
        top_rules: byRule.map(item => ({
          reminder_rule_id: item.reminder_rule_id,
          trigger_count: parseInt(item.count, 10)
        }))
      },
      '获取提醒统计成功'
    )
  } catch (error) {
    logger.error('[提醒历史] 获取统计失败', { error: error.message })
    return res.apiError('获取提醒统计失败', 'REMINDER_STATS_ERROR', null, 500)
  }
})

module.exports = router
