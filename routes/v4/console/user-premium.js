/**
 * @file 用户高级空间状态查询路由 - P2表只读查询API
 * @description 提供用户高级空间状态的只读查询接口
 *
 * 覆盖P2优先级表：
 * - user_premium_status: 用户高级空间状态表
 *
 * 架构原则：
 * - 路由层不直连 models（所有数据库操作通过 Service 层）
 * - 所有接口均为 GET 方法（只读查询）
 * - 严格遵循项目 snake_case 命名规范
 * - 使用 res.apiSuccess/res.apiError 统一响应格式
 *
 * @version 1.0.0
 * @date 2026-01-21
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireAdmin } = require('../../../middleware/auth')
const logger = require('../../../utils/logger').logger

/**
 * 获取 UserPremiumQueryService 的辅助函数
 * @param {Object} req - Express 请求对象
 * @returns {Object} UserPremiumQueryService 实例
 */
function getUserPremiumQueryService(req) {
  return req.app.locals.services.getService('user_premium_query')
}

/**
 * GET / - 查询用户高级空间状态列表
 *
 * Query参数：
 * - user_id: 用户ID（可选）
 * - is_unlocked: 是否已解锁（true/false，可选）
 * - unlock_method: 解锁方式（points/exchange/vip/manual，可选）
 * - is_valid: 是否在有效期内（true/false，可选）
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 *
 * 返回：用户高级空间状态列表和分页信息
 */
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { user_id, is_unlocked, unlock_method, is_valid, page = 1, page_size = 20 } = req.query

    const result = await getUserPremiumQueryService(req).getPremiumStatuses({
      user_id: user_id ? parseInt(user_id) : undefined,
      is_unlocked: is_unlocked !== undefined ? is_unlocked === 'true' : undefined,
      unlock_method,
      is_valid: is_valid !== undefined ? is_valid === 'true' : undefined,
      page: parseInt(page),
      page_size: parseInt(page_size)
    })

    logger.info('查询用户高级空间状态列表', {
      admin_id: req.user.user_id,
      filters: { user_id, is_unlocked, unlock_method, is_valid },
      total: result.pagination.total_count
    })

    return res.apiSuccess(result, '查询用户高级空间状态成功')
  } catch (error) {
    logger.error('查询用户高级空间状态失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'QUERY_PREMIUM_STATUSES_FAILED', null, 500)
  }
})

/**
 * GET /stats - 获取高级空间状态统计汇总
 *
 * 返回：统计汇总数据
 */
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const stats = await getUserPremiumQueryService(req).getPremiumStats()

    logger.info('获取高级空间状态统计', {
      admin_id: req.user.user_id
    })

    return res.apiSuccess(stats, '获取高级空间状态统计成功')
  } catch (error) {
    logger.error('获取高级空间状态统计失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_PREMIUM_STATS_FAILED', null, 500)
  }
})

/**
 * GET /expiring - 获取即将过期的用户列表
 *
 * Query参数：
 * - hours: 在多少小时内即将过期（默认24小时）
 * - page: 页码（默认1）
 * - page_size: 每页数量（默认20）
 *
 * 返回：即将过期用户列表和分页信息
 */
router.get('/expiring', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { hours = 24, page = 1, page_size = 20 } = req.query

    const result = await getUserPremiumQueryService(req).getExpiringUsers(
      parseInt(hours),
      parseInt(page),
      parseInt(page_size)
    )

    logger.info('获取即将过期用户列表', {
      admin_id: req.user.user_id,
      hours,
      total: result.pagination.total_count
    })

    return res.apiSuccess(result, '获取即将过期用户列表成功')
  } catch (error) {
    logger.error('获取即将过期用户列表失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_EXPIRING_USERS_FAILED', null, 500)
  }
})

/**
 * GET /:user_id - 获取单个用户的高级空间状态
 *
 * 路径参数：
 * - user_id: 用户ID
 *
 * 返回：用户高级空间状态详情（无记录时返回默认状态，不返回404）
 */
router.get('/:user_id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const user_id = parseInt(req.params.user_id)

    const status = await getUserPremiumQueryService(req).getUserPremiumStatus(user_id)

    // 用户没有高级空间记录是正常状态，返回默认值而不是404
    if (!status) {
      return res.apiSuccess(
        {
          user_id,
          is_unlocked: false,
          unlock_method: null,
          expire_time: null,
          message: '用户尚未解锁高级空间'
        },
        '获取用户高级空间状态成功'
      )
    }

    return res.apiSuccess(status, '获取用户高级空间状态成功')
  } catch (error) {
    logger.error('获取用户高级空间状态失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_PREMIUM_STATUS_FAILED', null, 500)
  }
})

module.exports = router
