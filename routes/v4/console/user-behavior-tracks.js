/**
 * 用户行为轨迹路由
 *
 * 功能说明：
 * - 轨迹查询：获取用户行为轨迹列表
 * - 轨迹详情：查看单条轨迹详情
 * - 轨迹统计：行为统计分析
 * - 轨迹导出：导出行为数据
 *
 * 任务编号：B-47 轨迹列表接口, B-48 轨迹详情接口, B-49 轨迹导出服务
 * 创建时间：2026年01月31日
 *
 * @module routes/v4/console/user-behavior-tracks
 */

'use strict'

const express = require('express')
const router = express.Router()
const ServiceManager = require('../../../services')
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const logger = require('../../../utils/logger')

// ==================== 轨迹列表 (B-47) ====================

/**
 * GET /api/v4/console/user-behavior-tracks
 *
 * 获取用户行为轨迹列表
 *
 * 查询参数:
 * - user_id: 用户ID（必需）
 * - behavior_type: 行为类型筛选
 * - start_time: 开始时间
 * - end_time: 结束时间
 * - session_id: 会话ID筛选
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 */
router.get('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const trackService = ServiceManager.getService('user_behavior_track')
    const { user_id, behavior_type, start_time, end_time, session_id, page, page_size } = req.query

    if (!user_id) {
      return res.apiError('用户ID不能为空', 'MISSING_USER_ID', null, 400)
    }

    const result = await trackService.getUserTracks({
      user_id: parseInt(user_id, 10),
      behavior_type,
      start_time: start_time ? new Date(start_time) : undefined,
      end_time: end_time ? new Date(end_time) : undefined,
      session_id,
      page: parseInt(page, 10) || 1,
      page_size: parseInt(page_size, 10) || 20
    })

    return res.apiSuccess(result, '获取用户行为轨迹成功')
  } catch (error) {
    logger.error('[用户轨迹] 获取列表失败', { error: error.message })
    return res.apiError('获取用户行为轨迹失败', 'USER_TRACKS_LIST_ERROR', null, 500)
  }
})

/**
 * GET /api/v4/console/user-behavior-tracks/stats/:user_id
 *
 * 获取用户行为统计
 *
 * 查询参数:
 * - start_time: 开始时间
 * - end_time: 结束时间
 */
router.get('/stats/:user_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const trackService = ServiceManager.getService('user_behavior_track')
    const userId = parseInt(req.params.user_id, 10)

    if (!userId || isNaN(userId)) {
      return res.apiError('无效的用户ID', 'INVALID_USER_ID', null, 400)
    }

    const { start_time, end_time } = req.query

    const stats = await trackService.getUserStats(userId, {
      start_time: start_time ? new Date(start_time) : undefined,
      end_time: end_time ? new Date(end_time) : undefined
    })

    return res.apiSuccess(stats, '获取用户行为统计成功')
  } catch (error) {
    logger.error('[用户轨迹] 获取统计失败', { error: error.message })
    return res.apiError('获取用户行为统计失败', 'USER_STATS_ERROR', null, 500)
  }
})

// ==================== 轨迹详情 (B-48) ====================

/**
 * GET /api/v4/console/user-behavior-tracks/:id
 *
 * 获取单条行为轨迹详情
 */
router.get('/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const trackService = ServiceManager.getService('user_behavior_track')
    const trackId = parseInt(req.params.id, 10)

    if (!trackId || isNaN(trackId)) {
      return res.apiError('无效的轨迹ID', 'INVALID_TRACK_ID', null, 400)
    }

    const track = await trackService.getTrackDetail(trackId)

    if (!track) {
      return res.apiError('行为轨迹记录不存在', 'TRACK_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(track, '获取行为轨迹详情成功')
  } catch (error) {
    logger.error('[用户轨迹] 获取详情失败', { error: error.message })
    return res.apiError('获取行为轨迹详情失败', 'TRACK_DETAIL_ERROR', null, 500)
  }
})

/**
 * GET /api/v4/console/user-behavior-tracks/session/:session_id
 *
 * 获取会话内的行为序列
 */
router.get('/session/:session_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const trackService = ServiceManager.getService('user_behavior_track')
    const sessionId = req.params.session_id

    if (!sessionId) {
      return res.apiError('会话ID不能为空', 'MISSING_SESSION_ID', null, 400)
    }

    const tracks = await trackService.getSessionTracks(sessionId)

    return res.apiSuccess(
      {
        session_id: sessionId,
        track_count: tracks.length,
        tracks
      },
      '获取会话行为序列成功'
    )
  } catch (error) {
    logger.error('[用户轨迹] 获取会话轨迹失败', { error: error.message })
    return res.apiError('获取会话行为序列失败', 'SESSION_TRACKS_ERROR', null, 500)
  }
})

// ==================== 聚合分析 ====================

/**
 * GET /api/v4/console/user-behavior-tracks/aggregate/by-date
 *
 * 按日期聚合行为分布
 *
 * 查询参数:
 * - start_date: 开始日期（必需）
 * - end_date: 结束日期（必需）
 * - user_id: 用户ID（可选）
 * - behavior_type: 行为类型（可选）
 */
router.get('/aggregate/by-date', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const trackService = ServiceManager.getService('user_behavior_track')
    const { start_date, end_date, user_id, behavior_type } = req.query

    if (!start_date || !end_date) {
      return res.apiError('开始日期和结束日期不能为空', 'MISSING_DATE_RANGE', null, 400)
    }

    const result = await trackService.aggregateByDate({
      start_date: new Date(start_date),
      end_date: new Date(end_date),
      user_id: user_id ? parseInt(user_id, 10) : undefined,
      behavior_type
    })

    return res.apiSuccess(result, '获取按日期聚合成功')
  } catch (error) {
    logger.error('[用户轨迹] 按日期聚合失败', { error: error.message })
    return res.apiError('获取按日期聚合失败', 'AGGREGATE_BY_DATE_ERROR', null, 500)
  }
})

/**
 * GET /api/v4/console/user-behavior-tracks/aggregate/active-users
 *
 * 获取活跃用户排名
 *
 * 查询参数:
 * - start_date: 开始日期（必需）
 * - end_date: 结束日期（必需）
 * - limit: 返回数量（默认10）
 */
router.get(
  '/aggregate/active-users',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const trackService = ServiceManager.getService('user_behavior_track')
      const { start_date, end_date, limit } = req.query

      if (!start_date || !end_date) {
        return res.apiError('开始日期和结束日期不能为空', 'MISSING_DATE_RANGE', null, 400)
      }

      const result = await trackService.getActiveUsersRanking({
        start_date: new Date(start_date),
        end_date: new Date(end_date),
        limit: parseInt(limit, 10) || 10
      })

      return res.apiSuccess(result, '获取活跃用户排名成功')
    } catch (error) {
      logger.error('[用户轨迹] 获取活跃用户排名失败', { error: error.message })
      return res.apiError('获取活跃用户排名失败', 'ACTIVE_USERS_ERROR', null, 500)
    }
  }
)

// ==================== 轨迹导出 (B-49) ====================

/**
 * POST /api/v4/console/user-behavior-tracks/export
 *
 * 导出用户行为轨迹数据
 *
 * 请求体:
 * - user_id: 用户ID（必需）
 * - start_time: 开始时间
 * - end_time: 结束时间
 * - format: 导出格式（json/csv）
 */
router.post('/export', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const trackService = ServiceManager.getService('user_behavior_track')
    const { user_id, start_time, end_time, format } = req.body

    if (!user_id) {
      return res.apiError('用户ID不能为空', 'MISSING_USER_ID', null, 400)
    }

    const exportData = await trackService.exportUserTracks({
      user_id: parseInt(user_id, 10),
      start_time: start_time ? new Date(start_time) : undefined,
      end_time: end_time ? new Date(end_time) : undefined,
      format: format || 'json'
    })

    logger.info('[用户轨迹] 导出成功', {
      user_id,
      format: format || 'json',
      count: exportData.count,
      exported_by: req.user.user_id
    })

    // CSV 格式直接返回文本
    if (format === 'csv' && exportData.content) {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=user_tracks_${user_id}_${Date.now()}.csv`
      )
      return res.send(exportData.content)
    }

    return res.apiSuccess(exportData, '导出用户行为轨迹成功')
  } catch (error) {
    logger.error('[用户轨迹] 导出失败', { error: error.message })
    return res.apiError('导出用户行为轨迹失败', 'EXPORT_TRACKS_ERROR', null, 500)
  }
})

module.exports = router
