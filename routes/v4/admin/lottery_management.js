/**
 * 抽奖管理模块
 *
 * @description 抽奖管理相关路由，包括强制中奖、强制不中奖、概率调整、用户特定队列等
 * @version 5.0.0（重构版：使用AdminLotteryService）
 * @date 2025-09-24
 * @updated 2025-12-09（重构：路由层委托给AdminLotteryService处理）
 *
 * 架构原则：
 * - 路由层不直连 models（所有数据库操作通过 Service 层）
 * - 路由层不开启事务（事务管理在 Service 层）
 * - 通过 ServiceManager 统一获取服务实例
 * - 使用 AdminLotteryService 封装所有抽奖管理逻辑
 */

const express = require('express')
const router = express.Router()
const BeijingTimeHelper = require('../../../utils/timeHelper')
const { adminAuthMiddleware, asyncHandler, validators } = require('./shared/middleware')

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

      // 🎯 通过 ServiceManager 获取 AdminLotteryService
      const AdminLotteryService = req.app.locals.services.getService('adminLottery')

      // 🎯 调用服务层方法（内部会验证用户/奖品、调用ManagementStrategy、记录审计日志）
      const result = await AdminLotteryService.forceWinForUser(
        req.user?.user_id || req.user?.id,
        validatedUserId,
        validatedPrizeId,
        reason,
        expiresAt
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

      // 🎯 通过 ServiceManager 获取 AdminLotteryService
      const AdminLotteryService = req.app.locals.services.getService('adminLottery')

      // 🎯 调用服务层方法
      const result = await AdminLotteryService.forceLoseForUser(
        req.user?.user_id || req.user?.id,
        validatedUserId,
        parseInt(count),
        reason,
        expiresAt
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

/**
 * POST /probability-adjust - 调整用户中奖概率
 *
 * @description 管理员调整指定用户的中奖概率
 * @route POST /api/v4/admin/lottery-management/probability-adjust
 * @access Private (需要管理员权限)
 */
router.post(
  '/probability-adjust',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const {
        user_id,
        probability_multiplier, // 🔴 全局倍数（如果没有prize_id）
        prize_id, // 🆕 特定奖品ID
        custom_probability, // 🆕 自定义概率（0-1之间）
        duration_minutes = 60,
        reason = '管理员概率调整'
      } = req.body

      // 参数验证
      const validatedUserId = validators.validateUserId(user_id)

      // 🆕 判断是全局调整还是特定奖品调整
      const isSpecificPrize = !!prize_id
      let adjustmentData = {}

      if (isSpecificPrize) {
        // ===== 特定奖品概率调整（新功能） =====
        const validatedPrizeId = validators.validatePrizeId(prize_id)

        // 验证自定义概率
        if (!custom_probability || isNaN(parseFloat(custom_probability))) {
          return res.apiError('自定义概率无效', 'INVALID_CUSTOM_PROBABILITY')
        }

        const probability = parseFloat(custom_probability)
        if (probability < 0.01 || probability > 1.0) {
          return res.apiError('自定义概率必须在0.01-1.0之间（1%-100%）', 'PROBABILITY_OUT_OF_RANGE')
        }

        adjustmentData = {
          prize_id: validatedPrizeId,
          custom_probability: probability,
          adjustment_type: 'specific_prize',
          reason
        }
      } else {
        // ===== 全局概率倍数调整（原有功能） =====
        if (!probability_multiplier || isNaN(parseFloat(probability_multiplier))) {
          return res.apiError('概率倍数无效', 'INVALID_PROBABILITY_MULTIPLIER')
        }

        const multiplier = parseFloat(probability_multiplier)
        if (multiplier < 0.1 || multiplier > 10) {
          return res.apiError('概率倍数必须在0.1-10之间', 'PROBABILITY_MULTIPLIER_OUT_OF_RANGE')
        }

        adjustmentData = {
          multiplier,
          adjustment_type: 'global_multiplier',
          reason
        }
      }

      // 持续时间验证
      if (
        !duration_minutes ||
        isNaN(parseInt(duration_minutes)) ||
        parseInt(duration_minutes) < 1 ||
        parseInt(duration_minutes) > 1440
      ) {
        return res.apiError('持续时间必须在1-1440分钟之间', 'INVALID_DURATION')
      }

      // 计算过期时间
      const expiresAt = BeijingTimeHelper.futureTime(parseInt(duration_minutes) * 60 * 1000)

      // 🎯 通过 ServiceManager 获取 AdminLotteryService
      const AdminLotteryService = req.app.locals.services.getService('adminLottery')

      // 🎯 调用服务层方法
      const result = await AdminLotteryService.adjustUserProbability(
        req.user?.user_id || req.user?.id,
        validatedUserId,
        adjustmentData,
        expiresAt
      )

      return res.apiSuccess(result, `用户概率调整成功，持续${duration_minutes}分钟`)
    } catch (error) {
      if (
        error.message.includes('无效的') ||
        error.code === 'USER_NOT_FOUND' ||
        error.message.includes('奖品不存在')
      ) {
        return res.apiError(error.message, error.code || 'VALIDATION_ERROR')
      }
      return res.apiInternalError('概率调整失败', error.message, 'PROBABILITY_ADJUST_ERROR')
    }
  })
)

/**
 * POST /user-specific-queue - 设置用户特定抽奖队列
 *
 * @description 为特定用户设置专门的抽奖队列和策略
 * @route POST /api/v4/admin/lottery-management/user-specific-queue
 * @access Private (需要管理员权限)
 */
router.post(
  '/user-specific-queue',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const {
        user_id,
        queue_type = 'priority',
        priority_level = 1,
        custom_strategy,
        duration_minutes = 60,
        reason = '管理员设置特定队列'
      } = req.body

      // 参数验证
      const validatedUserId = validators.validateUserId(user_id)

      const validQueueTypes = ['priority', 'guaranteed', 'custom', 'blocked']
      if (!validQueueTypes.includes(queue_type)) {
        return res.apiError('无效的队列类型', 'INVALID_QUEUE_TYPE')
      }

      if (priority_level < 1 || priority_level > 10) {
        return res.apiError('优先级必须在1-10之间', 'INVALID_PRIORITY_LEVEL')
      }

      if (
        !duration_minutes ||
        isNaN(parseInt(duration_minutes)) ||
        parseInt(duration_minutes) < 1 ||
        parseInt(duration_minutes) > 1440
      ) {
        return res.apiError('持续时间必须在1-1440分钟之间', 'INVALID_DURATION')
      }

      // 计算过期时间
      const expiresAt = BeijingTimeHelper.futureTime(parseInt(duration_minutes) * 60 * 1000)

      // 准备队列配置
      const queueConfig = {
        queue_type,
        priority_level: parseInt(priority_level),
        prize_queue: custom_strategy?.prize_queue || []
      }

      // 🎯 通过 ServiceManager 获取 AdminLotteryService
      const AdminLotteryService = req.app.locals.services.getService('adminLottery')

      // 🎯 调用服务层方法
      const result = await AdminLotteryService.setUserQueue(
        req.user?.user_id || req.user?.id,
        validatedUserId,
        queueConfig,
        reason,
        expiresAt
      )

      return res.apiSuccess(
        {
          ...result,
          custom_strategy: custom_strategy || null,
          duration_minutes: parseInt(duration_minutes)
        },
        `用户特定队列设置成功，类型：${queue_type}，优先级：${priority_level}，持续${duration_minutes}分钟`
      )
    } catch (error) {
      if (error.message.includes('无效的') || error.code === 'USER_NOT_FOUND') {
        return res.apiError(error.message, error.code || 'VALIDATION_ERROR')
      }
      return res.apiInternalError('用户队列设置失败', error.message, 'USER_QUEUE_SET_ERROR')
    }
  })
)

/**
 * GET /user-status/:user_id - 获取用户抽奖管理状态
 *
 * @description 获取指定用户的所有抽奖管理状态，包括强制设置、概率调整、队列状态等
 * @route GET /api/v4/admin/lottery-management/user-status/:user_id
 * @access Private (需要管理员权限)
 */
router.get(
  '/user-status/:user_id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { user_id } = req.params

      // 参数验证
      const validatedUserId = validators.validateUserId(user_id)

      // 🎯 通过 ServiceManager 获取 AdminLotteryService
      const AdminLotteryService = req.app.locals.services.getService('adminLottery')

      // 🎯 调用服务层方法获取用户管理状态
      const statusData = await AdminLotteryService.getUserManagementStatus(validatedUserId)

      // 🎯 格式化返回数据（与原路由格式保持一致）
      return res.apiSuccess(
        {
          user_id: statusData.user_id,
          user_mobile: statusData.user_mobile,
          user_nickname: statusData.user_nickname,
          management_status: {
            force_win: statusData.management_status.force_win
              ? {
                  setting_id: statusData.management_status.force_win.setting_id,
                  prize_id: statusData.management_status.force_win.setting_data.prize_id,
                  reason: statusData.management_status.force_win.setting_data.reason,
                  expires_at: statusData.management_status.force_win.expires_at,
                  status: statusData.management_status.force_win.status
                }
              : null,
            force_lose: statusData.management_status.force_lose
              ? {
                  setting_id: statusData.management_status.force_lose.setting_id,
                  count: statusData.management_status.force_lose.setting_data.count,
                  remaining: statusData.management_status.force_lose.setting_data.remaining,
                  reason: statusData.management_status.force_lose.setting_data.reason,
                  expires_at: statusData.management_status.force_lose.expires_at,
                  status: statusData.management_status.force_lose.status
                }
              : null,
            probability_adjust: statusData.management_status.probability_adjust
              ? {
                  setting_id: statusData.management_status.probability_adjust.setting_id,
                  adjustment_type:
                    statusData.management_status.probability_adjust.setting_data.adjustment_type,
                  multiplier:
                    statusData.management_status.probability_adjust.setting_data.multiplier,
                  prize_id: statusData.management_status.probability_adjust.setting_data.prize_id,
                  prize_name:
                    statusData.management_status.probability_adjust.setting_data.prize_name,
                  custom_probability:
                    statusData.management_status.probability_adjust.setting_data.custom_probability,
                  auto_adjust_others:
                    statusData.management_status.probability_adjust.setting_data.auto_adjust_others,
                  reason: statusData.management_status.probability_adjust.setting_data.reason,
                  expires_at: statusData.management_status.probability_adjust.expires_at,
                  status: statusData.management_status.probability_adjust.status
                }
              : null,
            user_queue: statusData.management_status.user_queue
              ? {
                  setting_id: statusData.management_status.user_queue.setting_id,
                  queue_type: statusData.management_status.user_queue.setting_data.queue_type,
                  priority_level:
                    statusData.management_status.user_queue.setting_data.priority_level,
                  prize_queue: statusData.management_status.user_queue.setting_data.prize_queue,
                  current_index: statusData.management_status.user_queue.setting_data.current_index,
                  reason: statusData.management_status.user_queue.setting_data.reason,
                  expires_at: statusData.management_status.user_queue.expires_at,
                  status: statusData.management_status.user_queue.status
                }
              : null
          },
          timestamp: statusData.timestamp
        },
        '用户管理状态获取成功'
      )
    } catch (error) {
      if (error.message.includes('无效的') || error.code === 'USER_NOT_FOUND') {
        return res.apiError(error.message, error.code || 'VALIDATION_ERROR')
      }
      return res.apiInternalError('获取用户管理状态失败', error.message, 'GET_USER_STATUS_ERROR')
    }
  })
)

/**
 * DELETE /clear-user-settings/:user_id - 清除用户的所有管理设置
 *
 * @description 清除指定用户的所有抽奖管理设置，恢复默认状态
 * @route DELETE /api/v4/admin/lottery-management/clear-user-settings/:user_id
 * @access Private (需要管理员权限)
 */
router.delete(
  '/clear-user-settings/:user_id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    try {
      const { user_id } = req.params
      const { reason = '管理员清除设置' } = req.body

      // 参数验证
      const validatedUserId = validators.validateUserId(user_id)

      // 🎯 通过 ServiceManager 获取 AdminLotteryService
      const AdminLotteryService = req.app.locals.services.getService('adminLottery')

      // 🎯 调用服务层方法清除用户设置
      const result = await AdminLotteryService.clearUserSettings(
        req.user?.user_id || req.user?.id,
        validatedUserId,
        null, // 清除所有类型
        reason
      )

      return res.apiSuccess(result, `用户管理设置清除成功，共清除${result.cleared_count}个设置`)
    } catch (error) {
      if (error.message.includes('无效的') || error.code === 'USER_NOT_FOUND') {
        return res.apiError(error.message, error.code || 'VALIDATION_ERROR')
      }
      return res.apiInternalError('清除用户设置失败', error.message, 'CLEAR_USER_SETTINGS_ERROR')
    }
  })
)

module.exports = router
