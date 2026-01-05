/**
 * 抽奖管理模块 - 强制控制API
 *
 * 业务范围：
 * - 强制用户中奖
 * - 强制用户不中奖
 *
 * 架构规范：
 * - 路由层不直连 models（通过 Service 层）
 * - 写操作使用 TransactionManager.execute() 统一管理事务
 * - 使用 AdminLotteryService 封装所有抽奖管理逻辑
 *
 * 创建时间：2025-12-22
 * 更新时间：2026-01-05（事务边界治理改造）
 */

const express = require('express')
const router = express.Router()
const BeijingTimeHelper = require('../../../../utils/timeHelper')
const TransactionManager = require('../../../../utils/TransactionManager')
const { adminAuthMiddleware, asyncHandler, validators } = require('../shared/middleware')

/**
 * POST /force-win - 强制用户中奖
 *
 * @description 管理员强制指定用户在下次抽奖中获胜
 * @route POST /api/v4/admin/lottery-management/force-win
 * @access Private (需要管理员权限)
 */
router.post(
  '/force-win',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { user_id, prize_id, reason = '管理员强制中奖', duration_minutes = null } = req.body

      // 参数验证
      const validatedUserId = validators.validateUserId(user_id)
      const validatedPrizeId = validators.validatePrizeId(prize_id)

      // 计算过期时间（如果提供了持续时间）
      let expiresAt = null
      if (duration_minutes && !isNaN(parseInt(duration_minutes))) {
        expiresAt = BeijingTimeHelper.futureTime(parseInt(duration_minutes) * 60 * 1000)
      }

      // 通过 ServiceManager 获取 AdminLotteryService
      const AdminLotteryService = req.app.locals.services.getService('adminLottery')

      // 使用 TransactionManager 统一管理事务（2026-01-05 事务边界治理）
      const result = await TransactionManager.execute(
        async transaction => {
          return await AdminLotteryService.forceWinForUser(
            req.user?.user_id || req.user?.id,
            validatedUserId,
            validatedPrizeId,
            reason,
            expiresAt,
            { transaction }
          )
        },
        { description: 'forceWinForUser' }
      )

      return res.apiSuccess(result, '强制中奖设置成功')
    } catch (error) {
      if (
        error.message.includes('无效的') ||
        error.message.includes('不存在') ||
        error.message.includes('验证失败') ||
        error.code === 'USER_NOT_FOUND' ||
        error.message.includes('奖品不存在')
      ) {
        return res.apiError(error.message, error.code || 'VALIDATION_ERROR')
      }
      return res.apiInternalError('强制中奖设置失败', error.message, 'FORCE_WIN_ERROR')
    }
  })
)

/**
 * POST /force-lose - 强制用户不中奖
 *
 * @description 管理员强制指定用户在指定次数内不中奖
 * @route POST /api/v4/admin/lottery-management/force-lose
 * @access Private (需要管理员权限)
 */
router.post(
  '/force-lose',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { user_id, count = 1, reason = '管理员强制不中奖', duration_minutes = null } = req.body

      // 参数验证
      const validatedUserId = validators.validateUserId(user_id)

      if (!count || isNaN(parseInt(count)) || parseInt(count) < 1 || parseInt(count) > 100) {
        return res.apiError('不中奖次数必须在1-100之间', 'INVALID_COUNT')
      }

      // 计算过期时间（如果提供了持续时间）
      let expiresAt = null
      if (duration_minutes && !isNaN(parseInt(duration_minutes))) {
        expiresAt = BeijingTimeHelper.futureTime(parseInt(duration_minutes) * 60 * 1000)
      }

      // 通过 ServiceManager 获取 AdminLotteryService
      const AdminLotteryService = req.app.locals.services.getService('adminLottery')

      // 使用 TransactionManager 统一管理事务（2026-01-05 事务边界治理）
      const result = await TransactionManager.execute(
        async transaction => {
          return await AdminLotteryService.forceLoseForUser(
            req.user?.user_id || req.user?.id,
            validatedUserId,
            parseInt(count),
            reason,
            expiresAt,
            { transaction }
          )
        },
        { description: 'forceLoseForUser' }
      )

      return res.apiSuccess(result, `强制不中奖设置成功，将在接下来${count}次抽奖中不中奖`)
    } catch (error) {
      if (
        error.message.includes('无效的') ||
        error.message.includes('不存在') ||
        error.message.includes('验证失败') ||
        error.code === 'USER_NOT_FOUND'
      ) {
        return res.apiError(error.message, error.code || 'VALIDATION_ERROR')
      }
      return res.apiInternalError('强制不中奖设置失败', error.message, 'FORCE_LOSE_ERROR')
    }
  })
)

module.exports = router
