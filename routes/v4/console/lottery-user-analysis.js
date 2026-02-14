/**
 * @file 抽奖用户分析路由 - UserAnalysisService
 * @description 提供抽奖系统用户维度分析相关的API接口
 *
 * URL重命名方案（2026-01-31 大文件拆分方案 Phase 2）：
 * - /console/lottery-monitoring/user-profile/:user_id → /console/lottery-user-analysis/profile/:user_id
 * - /console/lottery-monitoring/user-experience-states → /console/lottery-user-analysis/experience-states
 * - /console/lottery-monitoring/user-global-states → /console/lottery-user-analysis/global-states
 * - /console/lottery-monitoring/user-quotas → /console/lottery-user-analysis/quotas
 * - /console/lottery-monitoring/abnormal-users → /console/lottery-user-analysis/abnormal
 *
 * 路由分离方案新增（2026-02-12 抽奖接口安全改造）：
 * - /console/lottery-user-analysis/history/:user_id  - 管理员查看用户抽奖历史
 * - /console/lottery-user-analysis/points/:user_id   - 管理员查看用户积分
 * - /console/lottery-user-analysis/statistics/:user_id - 管理员查看用户抽奖统计
 *
 * 对应服务：lottery_analytics_user (UserAnalysisService)
 *
 * @version 1.1.0
 * @date 2026-02-12
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const logger = require('../../../utils/logger').logger
const AuditLogService = require('../../../services/AuditLogService')
const { OPERATION_TYPES } = require('../../../constants/AuditOperationTypes')
const { handleServiceError } = require('../../../middleware/validation')
const BeijingTimeHelper = require('../../../utils/timeHelper')

/**
 * 获取 UserAnalysisService 的辅助函数
 * @param {Object} req - Express 请求对象
 * @returns {Object} UserAnalysisService 实例
 */
function getUserAnalysisService(req) {
  return req.app.locals.services.getService('lottery_analytics_user')
}

/*
 * ==========================================
 * 1. 用户抽奖档案聚合 - /profile/:user_id
 * ==========================================
 */

/**
 * GET /profile/:user_id - 获取用户抽奖档案聚合数据
 *
 * P0 优先级 API：为运营后台提供用户完整的抽奖档案视图
 *
 * 路径参数：
 * - user_id: 用户ID（数字）
 *
 * Query参数：
 * - lottery_campaign_id: 活动ID（可选，不传则查询所有活动）
 *
 * 返回聚合数据：
 * - stats: 抽奖统计
 * - experience: 用户体验状态
 * - global_state: 用户全局状态
 * - quotas: 用户配额列表
 * - recent_draws: 最近20条抽奖记录
 */
router.get('/profile/:user_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const user_id = parseInt(req.params.user_id)
    const { lottery_campaign_id } = req.query

    if (!user_id || isNaN(user_id)) {
      return res.apiError('无效的用户ID', 'INVALID_USER_ID', null, 400)
    }

    const userAnalysisService = getUserAnalysisService(req)

    const profile = await userAnalysisService.getUserProfile(user_id, {
      lottery_campaign_id: lottery_campaign_id ? parseInt(lottery_campaign_id) : undefined,
      recent_limit: 20
    })

    logger.info('获取用户抽奖档案成功', {
      admin_id: req.user.user_id,
      target_user_id: user_id,
      lottery_campaign_id: lottery_campaign_id || 'all',
      total_draws: profile.stats.total_draws
    })

    return res.apiSuccess(profile, '获取用户抽奖档案成功')
  } catch (error) {
    logger.error('获取用户抽奖档案失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_USER_PROFILE_FAILED', null, 500)
  }
})

/*
 * ==========================================
 * 2. 用户体验状态 - /experience-states
 * ==========================================
 */

/**
 * GET /experience-states - 查询用户体验状态列表
 *
 * Query参数：
 * - lottery_campaign_id: 活动ID（可选）
 * - user_id: 用户ID（可选）
 * - min_empty_streak: 最小连续空奖次数（可选）
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 *
 * 返回：用户体验状态列表和分页信息
 */
router.get('/experience-states', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { lottery_campaign_id, user_id, min_empty_streak, page = 1, page_size = 20 } = req.query

    const result = await getUserAnalysisService(req).getUserExperienceStates({
      lottery_campaign_id: lottery_campaign_id ? parseInt(lottery_campaign_id) : undefined,
      user_id: user_id ? parseInt(user_id) : undefined,
      min_empty_streak: min_empty_streak !== undefined ? parseInt(min_empty_streak) : undefined,
      page: parseInt(page),
      page_size: parseInt(page_size)
    })

    logger.info('查询用户体验状态列表', {
      admin_id: req.user.user_id,
      lottery_campaign_id,
      user_id,
      total: result.pagination.total_count
    })

    return res.apiSuccess(result, '查询用户体验状态成功')
  } catch (error) {
    logger.error('查询用户体验状态失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'QUERY_EXPERIENCE_STATES_FAILED', null, 500)
  }
})

/**
 * GET /experience-states/:user_id/:lottery_campaign_id - 获取用户在特定活动的体验状态
 *
 * 路径参数：
 * - user_id: 用户ID
 * - lottery_campaign_id: 活动ID
 *
 * 返回：用户体验状态详情
 */
router.get(
  '/experience-states/:user_id/:lottery_campaign_id',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const user_id = parseInt(req.params.user_id)
      const lottery_campaign_id = parseInt(req.params.lottery_campaign_id)

      if (!user_id || isNaN(user_id) || !lottery_campaign_id || isNaN(lottery_campaign_id)) {
        return res.apiError('无效的用户ID或活动ID', 'INVALID_PARAMS', null, 400)
      }

      const state = await getUserAnalysisService(req).getUserExperienceState(
        user_id,
        lottery_campaign_id
      )

      if (!state) {
        return res.apiError('用户体验状态不存在', 'STATE_NOT_FOUND', null, 404)
      }

      return res.apiSuccess(state, '获取用户体验状态成功')
    } catch (error) {
      logger.error('获取用户体验状态失败:', error)
      return res.apiError(`查询失败：${error.message}`, 'GET_EXPERIENCE_STATE_FAILED', null, 500)
    }
  }
)

/*
 * ==========================================
 * 3. 用户全局状态 - /global-states
 * ==========================================
 */

/**
 * GET /global-states - 查询用户全局状态列表
 *
 * Query参数：
 * - min_luck_debt: 最小运气债务（可选）
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 *
 * 返回：用户全局状态列表和分页信息
 */
router.get('/global-states', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { min_luck_debt, page = 1, page_size = 20 } = req.query

    const result = await getUserAnalysisService(req).getUserGlobalStates({
      min_luck_debt: min_luck_debt !== undefined ? parseFloat(min_luck_debt) : undefined,
      page: parseInt(page),
      page_size: parseInt(page_size)
    })

    logger.info('查询用户全局状态列表', {
      admin_id: req.user.user_id,
      min_luck_debt,
      total: result.pagination.total_count
    })

    return res.apiSuccess(result, '查询用户全局状态成功')
  } catch (error) {
    logger.error('查询用户全局状态失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'QUERY_GLOBAL_STATES_FAILED', null, 500)
  }
})

/**
 * GET /global-states/:user_id - 获取指定用户的全局状态
 *
 * 路径参数：
 * - user_id: 用户ID
 *
 * 返回：用户全局状态详情
 */
router.get(
  '/global-states/:user_id',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const user_id = parseInt(req.params.user_id)

      if (!user_id || isNaN(user_id)) {
        return res.apiError('无效的用户ID', 'INVALID_USER_ID', null, 400)
      }

      const state = await getUserAnalysisService(req).getUserGlobalState(user_id)

      if (!state) {
        return res.apiError('用户全局状态不存在', 'STATE_NOT_FOUND', null, 404)
      }

      return res.apiSuccess(state, '获取用户全局状态成功')
    } catch (error) {
      logger.error('获取用户全局状态失败:', error)
      return res.apiError(`查询失败：${error.message}`, 'GET_GLOBAL_STATE_FAILED', null, 500)
    }
  }
)

/*
 * ==========================================
 * 4. 用户配额 - /quotas
 * ==========================================
 */

/**
 * GET /quotas - 查询用户配额列表
 *
 * Query参数：
 * - lottery_campaign_id: 活动ID（可选）
 * - user_id: 用户ID（可选）
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 *
 * 返回：用户配额列表和分页信息
 */
router.get('/quotas', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { lottery_campaign_id, user_id, page = 1, page_size = 20 } = req.query

    const result = await getUserAnalysisService(req).getUserQuotas({
      lottery_campaign_id: lottery_campaign_id ? parseInt(lottery_campaign_id) : undefined,
      user_id: user_id ? parseInt(user_id) : undefined,
      page: parseInt(page),
      page_size: parseInt(page_size)
    })

    logger.info('查询用户配额列表', {
      admin_id: req.user.user_id,
      lottery_campaign_id,
      user_id,
      total: result.pagination.total_count
    })

    return res.apiSuccess(result, '查询用户配额成功')
  } catch (error) {
    logger.error('查询用户配额失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'QUERY_USER_QUOTAS_FAILED', null, 500)
  }
})

/**
 * GET /quotas/:user_id/:lottery_campaign_id - 获取用户在特定活动的配额
 *
 * 路径参数：
 * - user_id: 用户ID
 * - lottery_campaign_id: 活动ID
 *
 * 返回：用户配额详情
 */
router.get(
  '/quotas/:user_id/:lottery_campaign_id',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const user_id = parseInt(req.params.user_id)
      const lottery_campaign_id = parseInt(req.params.lottery_campaign_id)

      if (!user_id || isNaN(user_id) || !lottery_campaign_id || isNaN(lottery_campaign_id)) {
        return res.apiError('无效的用户ID或活动ID', 'INVALID_PARAMS', null, 400)
      }

      const quota = await getUserAnalysisService(req).getUserQuota(user_id, lottery_campaign_id)

      if (!quota) {
        return res.apiError('用户配额不存在', 'QUOTA_NOT_FOUND', null, 404)
      }

      return res.apiSuccess(quota, '获取用户配额成功')
    } catch (error) {
      logger.error('获取用户配额失败:', error)
      return res.apiError(`查询失败：${error.message}`, 'GET_USER_QUOTA_FAILED', null, 500)
    }
  }
)

/**
 * GET /quotas/stats/:lottery_campaign_id - 获取活动配额统计
 *
 * 路径参数：
 * - lottery_campaign_id: 活动ID
 *
 * 返回：活动配额统计数据
 */
router.get(
  '/quotas/stats/:lottery_campaign_id',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const lottery_campaign_id = parseInt(req.params.lottery_campaign_id)

      if (!lottery_campaign_id || isNaN(lottery_campaign_id)) {
        return res.apiError('无效的活动ID', 'INVALID_CAMPAIGN_ID', null, 400)
      }

      const stats = await getUserAnalysisService(req).getQuotaStats(lottery_campaign_id)

      return res.apiSuccess(stats, '获取配额统计成功')
    } catch (error) {
      logger.error('获取配额统计失败:', error)
      return res.apiError(`查询失败：${error.message}`, 'GET_QUOTA_STATS_FAILED', null, 500)
    }
  }
)

/*
 * ==========================================
 * 5. 配额赠送记录 - /quota-grants
 * ==========================================
 */

/**
 * GET /quota-grants - 查询配额赠送记录列表
 *
 * Query参数：
 * - lottery_campaign_id: 活动ID（可选）
 * - user_id: 用户ID（可选）
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 *
 * 返回：配额赠送记录列表和分页信息
 */
router.get('/quota-grants', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { lottery_campaign_id, user_id, page = 1, page_size = 20 } = req.query

    const result = await getUserAnalysisService(req).getQuotaGrants({
      lottery_campaign_id: lottery_campaign_id ? parseInt(lottery_campaign_id) : undefined,
      user_id: user_id ? parseInt(user_id) : undefined,
      page: parseInt(page),
      page_size: parseInt(page_size)
    })

    logger.info('查询配额赠送记录', {
      admin_id: req.user.user_id,
      lottery_campaign_id,
      user_id,
      total: result.pagination.total_count
    })

    return res.apiSuccess(result, '查询配额赠送记录成功')
  } catch (error) {
    logger.error('查询配额赠送记录失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'QUERY_QUOTA_GRANTS_FAILED', null, 500)
  }
})

/**
 * GET /quota-grants/:id - 获取单条配额赠送记录详情
 *
 * 路径参数：
 * - id: 记录ID
 *
 * 返回：配额赠送记录详情
 */
router.get('/quota-grants/:id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const id = parseInt(req.params.id)

    if (!id || isNaN(id)) {
      return res.apiError('无效的记录ID', 'INVALID_GRANT_ID', null, 400)
    }

    const grant = await getUserAnalysisService(req).getQuotaGrantById(id)

    if (!grant) {
      return res.apiError('配额赠送记录不存在', 'GRANT_NOT_FOUND', null, 404)
    }

    return res.apiSuccess(grant, '获取配额赠送记录成功')
  } catch (error) {
    logger.error('获取配额赠送记录失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_QUOTA_GRANT_FAILED', null, 500)
  }
})

/*
 * ==========================================
 * 6. 异常用户列表 - /abnormal
 * ==========================================
 */

/**
 * GET /abnormal - 获取异常用户列表
 *
 * 异常检测规则：
 * - high_frequency: 1小时内抽奖 > 100次
 * - high_win_rate: 中奖率 > 平均值 × 2
 * - high_tier_abnormal: high层级中奖率 > 平均值 × 3
 * - rapid_wins: 10分钟内中奖 > 10次
 *
 * Query参数：
 * - type: 异常类型（high_frequency/high_win_rate/high_tier_abnormal/all，默认all）
 * - time_range: 时间范围（1h/24h/7d，默认24h）
 * - lottery_campaign_id: 活动ID（可选）
 * - min_risk_score: 最小风险分数（0-100，可选）
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 *
 * 返回数据：
 * - users: 异常用户列表
 * - pagination: 分页信息
 * - summary: 风险等级汇总
 */
router.get('/abnormal', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const {
      type = 'all',
      time_range = '24h',
      lottery_campaign_id,
      min_risk_score,
      page = 1,
      page_size = 20
    } = req.query

    const userAnalysisService = getUserAnalysisService(req)

    const result = await userAnalysisService.getAbnormalUsers({
      type,
      time_range,
      lottery_campaign_id: lottery_campaign_id ? parseInt(lottery_campaign_id) : undefined,
      min_risk_score: min_risk_score !== undefined ? parseInt(min_risk_score) : undefined,
      page: parseInt(page),
      page_size: parseInt(page_size)
    })

    logger.info('获取异常用户列表', {
      admin_id: req.user.user_id,
      type,
      time_range,
      lottery_campaign_id: lottery_campaign_id || 'all',
      total_users: result.pagination.total_count,
      high_risk_count: result.summary.high_risk_count
    })

    return res.apiSuccess(result, '获取异常用户列表成功')
  } catch (error) {
    logger.error('获取异常用户列表失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_ABNORMAL_USERS_FAILED', null, 500)
  }
})

/*
 * ==========================================
 * 7. 管理员查看用户抽奖历史 - /history/:user_id
 *    （路由分离方案 V4.8.0 新增）
 * ==========================================
 */

/**
 * GET /history/:user_id - 管理员查看指定用户的抽奖历史
 *
 * 路径参数：
 * - user_id: 目标用户ID（数字，事务实体使用 :id 占位符规范）
 *
 * Query参数：
 * - page: 页码（默认1）
 * - limit: 每页数量（默认20，最大50）
 *
 * 审计日志：记录管理员查看用户数据的操作
 *
 * 业务背景：
 * - 用户端 /api/v4/lottery/history 只能查自己（从JWT Token取身份）
 * - 管理端通过此接口查看任意用户的抽奖历史，需记录审计日志
 */
router.get('/history/:user_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.user_id)

    if (isNaN(targetUserId) || targetUserId <= 0) {
      return res.apiError('无效的用户ID', 'INVALID_USER_ID', null, 400)
    }

    const { page = 1, limit = 20 } = req.query
    const finalPage = Math.max(parseInt(page) || 1, 1)
    const finalLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 50)

    // 通过 ServiceManager 获取 LotteryQueryService
    const LotteryQueryService = req.app.locals.services.getService('lottery_query')
    const history = await LotteryQueryService.getUserHistory(targetUserId, {
      page: finalPage,
      limit: finalLimit
    })

    // 审计日志：记录管理员查看用户抽奖历史
    AuditLogService.logOperation({
      operator_id: req.user.user_id,
      operation_type: OPERATION_TYPES.ADMIN_VIEW_USER_DATA,
      target_type: 'User',
      target_id: targetUserId,
      action: 'view_lottery_history',
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    }).catch(auditError => {
      // 只读查看操作，审计失败不阻断业务
      logger.warn('审计日志记录失败（查看用户抽奖历史）', {
        error: auditError.message,
        operator_id: req.user.user_id,
        target_user_id: targetUserId
      })
    })

    logger.info('管理员查看用户抽奖历史', {
      admin_id: req.user.user_id,
      target_user_id: targetUserId,
      page: finalPage,
      limit: finalLimit,
      record_count: history.records?.length || 0
    })

    return res.apiSuccess(history, '获取用户抽奖历史成功')
  } catch (error) {
    logger.error('管理员查看用户抽奖历史失败', {
      error: error.message,
      admin_id: req.user?.user_id,
      target_user_id: req.params.user_id,
      timestamp: BeijingTimeHelper.now()
    })
    return handleServiceError(error, res, '获取用户抽奖历史失败')
  }
})

/*
 * ==========================================
 * 8. 管理员查看用户积分 - /points/:user_id
 *    （路由分离方案 V4.8.0 新增）
 * ==========================================
 */

/**
 * GET /points/:user_id - 管理员查看指定用户的积分信息
 *
 * 路径参数：
 * - user_id: 目标用户ID（数字）
 *
 * 审计日志：记录管理员查看用户积分的操作
 *
 * 业务背景：
 * - 用户端 /api/v4/lottery/points 只能查自己（从JWT Token取身份）
 * - 管理端通过此接口查看任意用户的积分，需记录审计日志
 */
router.get('/points/:user_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.user_id)

    if (isNaN(targetUserId) || targetUserId <= 0) {
      return res.apiError('无效的用户ID', 'INVALID_USER_ID', null, 400)
    }

    // 通过 ServiceManager 获取 UserService
    const UserService = req.app.locals.services.getService('user')
    const { user: _user, points_account: pointsInfo } = await UserService.getUserWithPoints(
      targetUserId,
      {
        checkPointsAccount: true,
        checkStatus: true
      }
    )

    // 审计日志：记录管理员查看用户积分
    AuditLogService.logOperation({
      operator_id: req.user.user_id,
      operation_type: OPERATION_TYPES.ADMIN_VIEW_USER_DATA,
      target_type: 'User',
      target_id: targetUserId,
      action: 'view_user_points',
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    }).catch(auditError => {
      logger.warn('审计日志记录失败（查看用户积分）', {
        error: auditError.message,
        operator_id: req.user.user_id,
        target_user_id: targetUserId
      })
    })

    logger.info('管理员查看用户积分', {
      admin_id: req.user.user_id,
      target_user_id: targetUserId
    })

    return res.apiSuccess(pointsInfo, '获取用户积分成功')
  } catch (error) {
    logger.error('管理员查看用户积分失败', {
      error: error.message,
      admin_id: req.user?.user_id,
      target_user_id: req.params.user_id,
      timestamp: BeijingTimeHelper.now()
    })
    return handleServiceError(error, res, '获取用户积分失败')
  }
})

/*
 * ==========================================
 * 9. 管理员查看用户抽奖统计 - /statistics/:user_id
 *    （路由分离方案 V4.8.0 新增）
 * ==========================================
 */

/**
 * GET /statistics/:user_id - 管理员查看指定用户的抽奖统计
 *
 * 路径参数：
 * - user_id: 目标用户ID（数字）
 *
 * 审计日志：记录管理员查看用户抽奖统计的操作
 *
 * 业务背景：
 * - 用户端 /api/v4/lottery/statistics 只能查自己（从JWT Token取身份）
 * - 管理端通过此接口查看任意用户的抽奖统计，需记录审计日志
 */
router.get('/statistics/:user_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.user_id)

    if (isNaN(targetUserId) || targetUserId <= 0) {
      return res.apiError('无效的用户ID', 'INVALID_USER_ID', null, 400)
    }

    // 通过 ServiceManager 获取 LotteryQueryService
    const LotteryQueryService = req.app.locals.services.getService('lottery_query')
    const statistics = await LotteryQueryService.getUserStatistics(targetUserId)

    // 审计日志：记录管理员查看用户抽奖统计
    AuditLogService.logOperation({
      operator_id: req.user.user_id,
      operation_type: OPERATION_TYPES.ADMIN_VIEW_USER_DATA,
      target_type: 'User',
      target_id: targetUserId,
      action: 'view_lottery_statistics',
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    }).catch(auditError => {
      logger.warn('审计日志记录失败（查看用户抽奖统计）', {
        error: auditError.message,
        operator_id: req.user.user_id,
        target_user_id: targetUserId
      })
    })

    logger.info('管理员查看用户抽奖统计', {
      admin_id: req.user.user_id,
      target_user_id: targetUserId,
      total_draws: statistics.total_draws
    })

    return res.apiSuccess(statistics, '获取用户抽奖统计成功')
  } catch (error) {
    logger.error('管理员查看用户抽奖统计失败', {
      error: error.message,
      admin_id: req.user?.user_id,
      target_user_id: req.params.user_id,
      timestamp: BeijingTimeHelper.now()
    })
    return handleServiceError(error, res, '获取用户抽奖统计失败')
  }
})

module.exports = router
