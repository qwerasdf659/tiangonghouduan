/**
 * 抽奖管理模块 - 概率和队列调整API
 *
 * 业务范围：
 * - 调整用户中奖概率
 * - 设置用户特定抽奖队列
 *
 * 架构规范：
 * - 路由层不直连 models（通过 Service 层）
 * - 使用 AdminLotteryService 封装所有抽奖管理逻辑
 *
 * 创建时间：2025-12-22
 */

const express = require('express')
const router = express.Router()
const BeijingTimeHelper = require('../../../../utils/timeHelper')
const { adminAuthMiddleware, asyncHandler, validators } = require('../shared/middleware')

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
        probability_multiplier, // 全局倍数
        prize_id, // 特定奖品ID
        custom_probability, // 自定义概率（0-1之间）
        duration_minutes = 60,
        reason = '管理员概率调整'
      } = req.body

      // 参数验证
      const validatedUserId = validators.validateUserId(user_id)

      // 判断是全局调整还是特定奖品调整
      const isSpecificPrize = !!prize_id
      let adjustmentData = {}

      if (isSpecificPrize) {
        // 特定奖品概率调整
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
        // 全局概率倍数调整
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

      // 通过 ServiceManager 获取 AdminLotteryService
      const AdminLotteryService = req.app.locals.services.getService('adminLottery')

      // 调用服务层方法
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

      // 通过 ServiceManager 获取 AdminLotteryService
      const AdminLotteryService = req.app.locals.services.getService('adminLottery')

      // 调用服务层方法
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

module.exports = router
