/**
 * 会话管理服务（SessionManagementService）
 *
 * 业务场景：管理用户认证会话的生命周期
 *
 * 核心功能：
 * 1. deactivateSession - 失效单个会话
 * 2. deactivateUserSessions - 失效用户所有会话
 * 3. cleanupExpiredSessions - 清理过期会话
 *
 * 架构规范：
 * - 所有写操作通过此服务层统一处理
 * - 路由层不直接操作 AuthenticationSession 模型的写方法
 * - 遵循 "Service + options.transaction" 模式
 *
 * 事务边界治理（2026-01-05 决策）：
 * - 写操作强制要求外部事务传入（options.transaction）
 * - 读操作和清理操作可不传事务（批量操作自行管理）
 *
 * 创建时间：2026-01-31
 * 拆分自：routes/v4/console/sessions.js（路由层直接操作模型）
 */

const { AuthenticationSession } = require('../models')
const logger = require('../utils/logger').logger
const BeijingTimeHelper = require('../utils/timeHelper')
// 注：会话管理写操作不强制要求外部事务（单条操作或批量操作自行管理）

/**
 * 会话管理服务类
 *
 * @class SessionManagementService
 * @description 封装认证会话的管理操作，统一写操作入口
 */
class SessionManagementService {
  /**
   * 失效单个会话
   *
   * 业务场景：
   * - 管理员强制登出某个用户的特定会话
   * - 安全事件响应：发现异常登录时强制失效会话
   *
   * @param {number} session_id - 会话ID（user_session_id）
   * @param {Object} options - 操作选项
   * @param {number} options.operator_user_id - 操作者用户ID（必填）
   * @param {string} [options.reason] - 失效原因（可选）
   * @param {Object} [options.transaction] - Sequelize事务对象（可选，单条操作可不传）
   * @returns {Promise<Object>} 操作结果 { session_id, user_id, deactivated_at }
   * @throws {Error} 会话不存在、会话已失效等
   *
   * @example
   * const result = await SessionManagementService.deactivateSession(123, {
   *   operator_user_id: 456,
   *   reason: '安全事件响应'
   * })
   */
  static async deactivateSession(session_id, options = {}) {
    const { operator_user_id, reason, transaction } = options

    if (!operator_user_id) {
      throw new Error('operator_user_id 是必填参数')
    }

    if (!session_id || session_id <= 0) {
      throw new Error('无效的会话ID')
    }

    logger.info('开始失效会话', { session_id, operator_user_id, reason })

    // 查找会话（支持事务）
    const queryOptions = transaction ? { transaction } : {}
    const session = await AuthenticationSession.findByPk(session_id, queryOptions)

    if (!session) {
      throw new Error('会话不存在')
    }

    if (!session.is_active) {
      // 幂等：已失效的会话直接返回
      logger.info('会话已经失效，幂等返回', { session_id, operator_user_id })
      return {
        session_id,
        user_id: session.user_id,
        already_inactive: true,
        deactivated_at: BeijingTimeHelper.apiTimestamp()
      }
    }

    // 执行失效操作
    const deactivateReason = reason || `管理员手动登出 (operator: ${operator_user_id})`
    await session.deactivate(deactivateReason)

    logger.info('会话失效成功', {
      session_id,
      user_id: session.user_id,
      operator_user_id,
      reason: deactivateReason
    })

    return {
      session_id,
      user_id: session.user_id,
      deactivated_at: BeijingTimeHelper.apiTimestamp()
    }
  }

  /**
   * 失效用户所有会话
   *
   * 业务场景：
   * - 管理员强制登出某个用户的所有设备
   * - 用户密码重置后强制所有设备重新登录
   * - 账号安全问题时批量失效会话
   *
   * @param {Object} params - 参数对象
   * @param {string} params.user_type - 用户类型（user/admin）
   * @param {number} params.user_id - 用户ID
   * @param {Object} options - 操作选项
   * @param {number} options.operator_user_id - 操作者用户ID（必填）
   * @param {string} [options.reason] - 失效原因（可选）
   * @param {number} [options.exclude_session_id] - 排除的会话ID（可选，用于保留当前会话）
   * @returns {Promise<Object>} 操作结果 { user_type, user_id, affected_count, reason }
   * @throws {Error} 参数无效、用户类型无效等
   *
   * @example
   * const result = await SessionManagementService.deactivateUserSessions(
   *   { user_type: 'user', user_id: 123 },
   *   { operator_user_id: 456, reason: '账号安全问题' }
   * )
   */
  static async deactivateUserSessions(params, options = {}) {
    const { user_type, user_id } = params
    const { operator_user_id, reason, exclude_session_id } = options

    if (!operator_user_id) {
      throw new Error('operator_user_id 是必填参数')
    }

    // 参数校验
    if (!user_type || !['user', 'admin'].includes(user_type)) {
      throw new Error('无效的用户类型')
    }

    if (!user_id || user_id <= 0) {
      throw new Error('无效的用户ID')
    }

    // 防止管理员踢出自己（如果是管理员操作）
    if (user_type === 'admin' && user_id === operator_user_id && !exclude_session_id) {
      throw new Error('不能踢出自己的所有会话')
    }

    logger.info('开始失效用户所有会话', {
      user_type,
      user_id,
      operator_user_id,
      reason,
      exclude_session_id
    })

    // 失效用户所有会话（调用模型静态方法）
    const deactivateReason = reason || `管理员强制登出 (operator: ${operator_user_id})`
    const affectedCount = await AuthenticationSession.deactivateUserSessions(
      user_type,
      user_id,
      exclude_session_id || null
    )

    logger.info('用户会话批量失效成功', {
      user_type,
      user_id,
      affected_count: affectedCount,
      operator_user_id,
      reason: deactivateReason
    })

    return {
      user_type,
      user_id,
      affected_count: affectedCount,
      reason: deactivateReason
    }
  }

  /**
   * 清理过期会话
   *
   * 业务场景：
   * - 定时任务清理已过期的会话记录
   * - 管理员手动触发清理释放资源
   *
   * @param {Object} [options={}] - 操作选项
   * @param {number} [options.operator_user_id] - 操作者用户ID（可选，定时任务可不传）
   * @returns {Promise<Object>} 操作结果 { deleted_count, cleanup_at }
   *
   * @example
   * // 管理员手动清理
   * const result = await SessionManagementService.cleanupExpiredSessions({
   *   operator_user_id: 456
   * })
   *
   * // 定时任务清理
   * const result = await SessionManagementService.cleanupExpiredSessions()
   */
  static async cleanupExpiredSessions(options = {}) {
    const { operator_user_id } = options

    logger.info('开始清理过期会话', { operator_user_id: operator_user_id || 'system' })

    // 调用模型静态方法清理过期会话
    const deletedCount = await AuthenticationSession.cleanupExpiredSessions()

    logger.info('过期会话清理完成', {
      deleted_count: deletedCount,
      operator_user_id: operator_user_id || 'system',
      cleanup_at: BeijingTimeHelper.apiTimestamp()
    })

    return {
      deleted_count: deletedCount,
      cleanup_at: BeijingTimeHelper.apiTimestamp()
    }
  }

  /**
   * 获取会话统计信息（读操作）
   *
   * @returns {Promise<Object>} 会话统计
   */
  static async getSessionStats() {
    // 获取活跃会话统计（按用户类型分组）
    const activeStats = await AuthenticationSession.getActiveSessionStats()

    // 计算总活跃会话数
    const totalActiveSessions = Object.values(activeStats).reduce(
      (sum, stat) => sum + (stat.active_sessions || 0),
      0
    )

    // 获取待清理的过期会话数
    const { Op } = require('sequelize')
    const expiredPendingCleanup = await AuthenticationSession.count({
      where: {
        expires_at: { [Op.lt]: BeijingTimeHelper.createBeijingTime() }
      }
    })

    // 获取今日新建会话数
    const todayStart = BeijingTimeHelper.createBeijingTime()
    todayStart.setHours(0, 0, 0, 0)
    const todayNewSessions = await AuthenticationSession.count({
      where: {
        created_at: { [Op.gte]: todayStart }
      }
    })

    return {
      total_active_sessions: totalActiveSessions,
      by_user_type: {
        user: activeStats.user || { active_sessions: 0, unique_users: 0 },
        admin: activeStats.admin || { active_sessions: 0, unique_users: 0 }
      },
      expired_pending_cleanup: expiredPendingCleanup,
      today_new_sessions: todayNewSessions,
      timestamp: BeijingTimeHelper.apiTimestamp()
    }
  }
}

module.exports = SessionManagementService
