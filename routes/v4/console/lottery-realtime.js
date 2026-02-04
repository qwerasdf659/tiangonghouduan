/**
 * @file 抽奖实时监控路由 - RealtimeService
 * @description 提供抽奖系统实时监控和告警相关的API接口
 *
 * URL重命名方案（2026-01-31 大文件拆分方案 Phase 2）：
 * - /console/lottery-monitoring/stats → /console/lottery-realtime/stats
 * - /console/lottery-monitoring/realtime-alerts → /console/lottery-realtime/alerts
 * - /console/lottery-monitoring/draw-details/:lottery_draw_id → /console/lottery-realtime/draw-details/:lottery_draw_id
 *
 * 对应服务：lottery_analytics_realtime (RealtimeService)
 *
 * @version 1.0.0
 * @date 2026-01-31
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const logger = require('../../../utils/logger').logger

/**
 * 获取 RealtimeService 的辅助函数
 * @param {Object} req - Express 请求对象
 * @returns {Object} RealtimeService 实例
 */
function getRealtimeService(req) {
  return req.app.locals.services.getService('lottery_analytics_realtime')
}

/**
 * 获取 LotteryAlertService 的辅助函数
 * @param {Object} req - Express 请求对象
 * @returns {Object} LotteryAlertService 实例
 */
function getLotteryAlertService(req) {
  return req.app.locals.services.getService('lottery_alert')
}

/*
 * ==========================================
 * 1. 综合监控统计 - /stats
 * ==========================================
 */

/**
 * GET /stats - 获取抽奖综合监控统计数据
 *
 * Query参数：
 * - lottery_campaign_id: 活动ID（可选）
 * - time_range: 时间范围（today/yesterday/7d/30d/custom，默认today）
 * - start_date: 自定义开始日期（YYYY-MM-DD，当time_range=custom时使用）
 * - end_date: 自定义结束日期（YYYY-MM-DD，当time_range=custom时使用）
 *
 * 返回：综合监控统计数据
 */
router.get('/stats', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { lottery_campaign_id, time_range = 'today', start_date, end_date } = req.query

    const stats = await getRealtimeService(req).getMonitoringStats({
      lottery_campaign_id: lottery_campaign_id ? parseInt(lottery_campaign_id) : undefined,
      time_range,
      start_date,
      end_date
    })

    logger.info('获取抽奖监控统计', {
      admin_id: req.user.user_id,
      lottery_campaign_id,
      time_range,
      total_draws: stats?.total_draws || 0
    })

    return res.apiSuccess(stats, '获取抽奖监控统计成功')
  } catch (error) {
    logger.error('获取抽奖监控统计失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_MONITORING_STATS_FAILED', null, 500)
  }
})

/*
 * ==========================================
 * 2. 实时告警列表 - /alerts
 * ==========================================
 */

/**
 * GET /alerts - 获取告警列表（从数据库）
 *
 * Query参数：
 * - lottery_campaign_id: 活动ID（可选）
 * - level: 告警级别过滤（danger/warning/info，可选）
 * - type: 告警类型过滤（win_rate/budget/inventory/user/system，可选）
 * - status: 告警状态过滤（active/acknowledged/resolved，可选）
 * - limit: 返回数量（默认50）
 *
 * 返回数据：
 * - alerts: 告警列表（包含 lottery_alert_id 用于确认/解决操作）
 * - summary: 告警汇总统计
 */
router.get('/alerts', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { lottery_campaign_id, level, type, status, limit = 50 } = req.query

    const alertService = getLotteryAlertService(req)

    // 使用 LotteryAlertService 获取持久化的告警列表
    const result = await alertService.getAlertList({
      lottery_campaign_id: lottery_campaign_id ? parseInt(lottery_campaign_id) : undefined,
      level,
      type,
      status,
      limit: parseInt(limit)
    })

    // 转换为前端期望的格式（以后端字段为准）
    const formattedAlerts = result.alerts.map(alert => ({
      // 主键 - 用于确认/解决操作
      alert_id: alert.lottery_alert_id,
      lottery_alert_id: alert.lottery_alert_id,
      // 关联活动
      lottery_campaign_id: alert.lottery_campaign_id,
      campaign_name: alert.campaign_name,
      campaign_code: alert.campaign_code,
      // 告警信息
      level: alert.severity,
      type: alert.alert_type,
      type_name: alert.alert_type_name,
      message: alert.message,
      // 阈值和实际值
      threshold: alert.threshold_value,
      current_value: alert.actual_value,
      deviation_percentage: alert.deviation_percentage,
      // 状态
      status: alert.status,
      status_name: alert.status_name,
      acknowledged: alert.status === 'acknowledged' || alert.status === 'resolved',
      // 时间
      created_at: alert.created_at,
      resolved_at: alert.resolved_at,
      // 处理人
      resolved_by: alert.resolved_by,
      resolver_name: alert.resolver_name,
      resolve_notes: alert.resolve_notes
    }))

    // 统计汇总
    const summary = {
      total: result.total,
      danger: result.alerts.filter(a => a.severity === 'danger').length,
      warning: result.alerts.filter(a => a.severity === 'warning').length,
      info: result.alerts.filter(a => a.severity === 'info').length,
      active: result.active_count,
      acknowledged: result.acknowledged_count,
      resolved: result.resolved_count
    }

    logger.info('获取告警列表', {
      admin_id: req.user.user_id,
      lottery_campaign_id: lottery_campaign_id || 'all',
      total_alerts: result.total,
      active_count: result.active_count
    })

    return res.apiSuccess(
      {
        alerts: formattedAlerts,
        summary,
        pagination: {
          total: result.total,
          page: 1,
          page_size: parseInt(limit),
          total_pages: 1
        }
      },
      '获取告警列表成功'
    )
  } catch (error) {
    logger.error('获取告警列表失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_ALERTS_FAILED', null, 500)
  }
})

/**
 * POST /alerts/:id/acknowledge - 确认告警
 *
 * 路径参数：
 * - id: 告警ID
 *
 * Body参数：
 * - note: 确认备注（可选）
 */
router.post(
  '/alerts/:id/acknowledge',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const alert_id = parseInt(req.params.id)
      const { note } = req.body

      if (!alert_id || isNaN(alert_id)) {
        return res.apiError('无效的告警ID', 'INVALID_ALERT_ID', null, 400)
      }

      const alertService = getLotteryAlertService(req)

      const result = await alertService.acknowledgeAlert(alert_id, {
        admin_id: req.user.user_id,
        note
      })

      logger.info('确认告警成功', {
        admin_id: req.user.user_id,
        alert_id,
        note
      })

      return res.apiSuccess(result, '确认告警成功')
    } catch (error) {
      logger.error('确认告警失败:', error)
      return res.apiError(`操作失败：${error.message}`, 'ACKNOWLEDGE_ALERT_FAILED', null, 500)
    }
  }
)

/**
 * POST /alerts/:id/resolve - 解决告警
 *
 * 路径参数：
 * - id: 告警ID
 *
 * Body参数：
 * - resolution: 解决方案描述
 */
router.post('/alerts/:id/resolve', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const alert_id = parseInt(req.params.id)
    const { resolution } = req.body

    if (!alert_id || isNaN(alert_id)) {
      return res.apiError('无效的告警ID', 'INVALID_ALERT_ID', null, 400)
    }

    const alertService = getLotteryAlertService(req)

    const result = await alertService.resolveAlert(alert_id, {
      admin_id: req.user.user_id,
      resolution
    })

    logger.info('解决告警成功', {
      admin_id: req.user.user_id,
      alert_id,
      resolution
    })

    return res.apiSuccess(result, '解决告警成功')
  } catch (error) {
    logger.error('解决告警失败:', error)
    return res.apiError(`操作失败：${error.message}`, 'RESOLVE_ALERT_FAILED', null, 500)
  }
})

/*
 * ==========================================
 * 3. 单次抽奖Pipeline详情 - /draw-details/:lottery_draw_id
 * ==========================================
 */

/**
 * GET /draw-details/:lottery_draw_id - 获取单次抽奖Pipeline详情
 *
 * 运营场景：
 * - 用户投诉"为什么这次没中"时，展示完整决策过程
 * - 审计和合规需求，解释系统决策逻辑
 *
 * 路径参数：
 * - lottery_draw_id: 抽奖记录ID（字符串）
 *
 * 返回数据：
 * - basic_info: 基础信息
 * - pipeline_execution: Pipeline各阶段执行详情
 * - decision_snapshot: 决策快照
 * - user_state_before: 用户抽奖前状态
 */
router.get(
  '/draw-details/:lottery_draw_id',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const { lottery_draw_id } = req.params

      if (!lottery_draw_id) {
        return res.apiError('缺少抽奖记录ID', 'MISSING_DRAW_ID', null, 400)
      }

      const realtimeService = getRealtimeService(req)

      const details = await realtimeService.getDrawDetails(lottery_draw_id)

      if (!details) {
        return res.apiError('抽奖记录不存在', 'DRAW_NOT_FOUND', null, 404)
      }

      logger.info('获取单次抽奖详情成功', {
        admin_id: req.user.user_id,
        lottery_draw_id,
        user_id: details.basic_info.user_id,
        lottery_campaign_id: details.basic_info.lottery_campaign_id
      })

      return res.apiSuccess(details, '获取单次抽奖详情成功')
    } catch (error) {
      logger.error('获取单次抽奖详情失败:', error)
      return res.apiError(`查询失败：${error.message}`, 'GET_DRAW_DETAILS_FAILED', null, 500)
    }
  }
)

module.exports = router
