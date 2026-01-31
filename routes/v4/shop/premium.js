/**
 * 高级空间解锁API路由 - 实用主义极简版
 *
 * 📋 功能说明：
 * - 用户支付100积分解锁高级空间功能，有效期24小时
 * - 过期需重新手动解锁（无自动续费）
 * - 极简直观、降低复杂度、易于维护
 *
 * 🎯 双重条件AND关系（缺一不可）：
 * - 条件1: users.history_total_points ≥ 100000（历史累计10万积分门槛）
 * - 条件2: account_asset_balances.available_amount ≥ 100（当前POINTS余额≥100积分）
 *
 * API端点：
 * - POST /api/v4/premium/unlock - 解锁高级空间
 * - GET /api/v4/premium/status - 查询解锁状态
 *
 * 架构说明：
 * - 路由层通过 ServiceManager 获取 PremiumService
 * - PremiumService 内部使用 BalanceService 统一处理资产操作（V4.7.0 AssetService 拆分）
 * - 所有积分操作记录到 asset_transactions 表
 *
 * 创建时间：2025-11-02
 * 最后更新：2025-12-30（迁移到统一资产架构）
 */

const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const logger = require('../../../utils/logger')

/*
 * ========================================
 * 业务常量定义
 * ========================================
 */
const UNLOCK_COST = 100 // 解锁费用：100积分（固定值）
const HISTORY_POINTS_THRESHOLD = 100000 // 历史累计积分门槛：10万（识别高级用户资格）
const VALIDITY_HOURS = 24 // 有效期：24小时（固定值）

/**
 * ========================================
 * API #1: 解锁高级空间（极简版，手动解锁，无自动续费）
 * ========================================
 *
 * 📍 路由: POST /api/v4/premium/unlock
 * 🔐 认证: 需要JWT认证（authenticateToken中间件）
 *
 * 📊 业务逻辑（基于统一资产架构，极简清晰）：
 * 步骤1: 检查当前解锁状态（如果有效期内，拒绝重复解锁，返回409冲突）
 * 步骤2: 通过 BalanceService.getBalance 获取用户 POINTS 余额
 * 步骤3: 验证解锁条件1 - 历史积分门槛（users.history_total_points ≥ 100000）
 * 步骤4: 验证解锁条件2 - 当前余额充足（account_asset_balances.available_amount ≥ 100）
 * 步骤5: 扣除积分（通过 BalanceService.changeBalance 统一处理）
 * 步骤6: 自动记录资产流水（asset_transactions表，business_type='premium_unlock'）
 * 步骤7: 创建/更新解锁记录（user_premium_status表，expires_at = unlock_time + 24小时）
 * 步骤8: 提交事务，返回解锁结果
 *
 * @returns {Object} 解锁结果
 * @returns {boolean} success - 是否成功
 * @returns {string} message - 返回消息
 * @returns {Object} data - 解锁结果数据
 */
router.post('/unlock', authenticateToken, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 NotificationService（符合TR-005规范）
    const NotificationService = req.app.locals.services.getService('notification')
    const PremiumService = req.app.locals.services.getService('premium')

    const userId = req.user.user_id // 从JWT token中获取用户ID

    // 调用 Service 层处理解锁业务（Service 内部管理事务）
    const result = await PremiumService.unlockPremium(userId)

    // 发送解锁成功通知（异步，不影响返回）
    setImmediate(async () => {
      try {
        await NotificationService.notifyPremiumUnlockSuccess(userId, {
          unlock_cost: result.unlock_cost,
          remaining_points: result.remaining_points,
          expires_at: BeijingTimeHelper.formatForAPI(result.expires_at).iso,
          validity_hours: result.validity_hours,
          is_first_unlock: result.is_first_unlock
        })
      } catch (notifyError) {
        logger.error('高级空间解锁通知发送失败', {
          user_id: userId,
          error: notifyError.message
        })
      }
    })

    // 返回解锁成功结果
    return res.apiSuccess(
      {
        unlocked: true,
        is_first_unlock: result.is_first_unlock,
        unlock_cost: result.unlock_cost,
        remaining_points: result.remaining_points,
        unlock_time: BeijingTimeHelper.formatForAPI(result.unlock_time).iso,
        expires_at: BeijingTimeHelper.formatForAPI(result.expires_at).iso,
        validity_hours: result.validity_hours,
        total_unlock_count: result.total_unlock_count,
        note: `恭喜！您已成功解锁高级空间功能（${result.is_first_unlock ? '首次' : '重新'}解锁，支付${result.unlock_cost}积分，剩余${result.remaining_points}积分，有效期${result.validity_hours}小时）`
      },
      '高级空间解锁成功'
    )
  } catch (error) {
    logger.error('高级空间解锁失败', {
      user_id: req.user.user_id,
      error: error.message,
      stack: error.stack
    })

    // 处理业务错误（来自 Service 层）
    if (error.code && error.statusCode) {
      return res.apiError(error.message, error.code, error.data || null, error.statusCode)
    }

    // 处理未知错误
    return res.apiError('解锁失败，请稍后重试', 'UNLOCK_FAILED', { error: error.message }, 500)
  }
})

/**
 * ========================================
 * API #2: 查询高级空间状态（极简版，纯查询，无自动续费）
 * ========================================
 *
 * 📍 路由: GET /api/v4/premium/status
 * 🔐 认证: 需要JWT认证（authenticateToken中间件）
 *
 * 📊 业务逻辑（纯查询，无扣费操作）：
 * 步骤1: 查询用户的高级空间解锁状态（user_premium_status表）
 * 步骤2: 判断是否过期（expires_at > NOW()）
 * 步骤3: 通过 BalanceService.getBalance 获取用户 POINTS 余额
 * 步骤4: 计算解锁条件进度（条件1：历史积分进度，条件2：余额充足情况）
 * 步骤5: 返回解锁状态和条件进度（含剩余时间、是否可解锁等信息）
 *
 * @returns {Object} 状态查询结果
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 PremiumService（符合TR-005规范）
    const PremiumService = req.app.locals.services.getService('premium')

    const userId = req.user.user_id

    // 调用 Service 层查询状态
    const status = await PremiumService.getPremiumStatus(userId)

    // 格式化返回数据
    if (!status.unlocked || !status.is_valid) {
      // 未解锁或已过期
      return res.apiSuccess(
        {
          unlocked: false,
          is_expired: status.is_expired || false,
          last_unlock_time: status.last_unlock_time
            ? BeijingTimeHelper.formatForAPI(status.last_unlock_time).iso
            : null,
          conditions: status.conditions,
          can_unlock: status.can_unlock,
          unlock_cost: UNLOCK_COST,
          validity_hours: VALIDITY_HOURS,
          tip: status.is_expired
            ? `您的高级空间访问权限已过期，需要重新支付${UNLOCK_COST}积分解锁（有效期${VALIDITY_HOURS}小时）`
            : `解锁高级空间需要同时满足2个条件：1.历史累计积分≥${HISTORY_POINTS_THRESHOLD} 2.支付${UNLOCK_COST}积分（有效期${VALIDITY_HOURS}小时）`
        },
        status.is_expired ? '高级空间已过期' : '高级空间未解锁'
      )
    }

    // 已解锁且在有效期内
    return res.apiSuccess(
      {
        unlocked: true,
        is_valid: true,
        unlock_time: BeijingTimeHelper.formatForAPI(status.unlock_time).iso,
        unlock_method: status.unlock_method,
        unlock_cost: UNLOCK_COST,
        expires_at: BeijingTimeHelper.formatForAPI(status.expires_at).iso,
        remaining_hours: status.remaining_hours,
        validity_hours: VALIDITY_HOURS,
        total_unlock_count: status.total_unlock_count,
        note: `您的高级空间访问权限有效，剩余${status.remaining_hours}小时`
      },
      '高级空间访问中'
    )
  } catch (error) {
    logger.error('查询高级空间状态失败', {
      user_id: req.user.user_id,
      error: error.message
    })

    // 处理业务错误
    if (error.code && error.statusCode) {
      return res.apiError(error.message, error.code, null, error.statusCode)
    }

    return res.apiError('查询失败', 'QUERY_FAILED', { error: error.message }, 500)
  }
})

module.exports = router
