/**
 * 抽奖管理模块
 *
 * @description 抽奖管理相关路由，包括强制中奖、强制不中奖、概率调整、用户特定队列等
 * @version 4.0.0
 * @date 2025-09-24
 */

const express = require('express')
const router = express.Router()
const {
  sharedComponents,
  adminAuthMiddleware,
  asyncHandler,
  validators,
  models,
  BeijingTimeHelper
} = require('./shared/middleware')

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

      // 查找用户
      const user = await models.User.findByPk(validatedUserId)
      if (!user) {
        return res.apiError('用户不存在', 'USER_NOT_FOUND')
      }

      // 查找奖品
      const prize = await models.LotteryPrize.findByPk(validatedPrizeId)
      if (!prize) {
        return res.apiError('奖品不存在', 'PRIZE_NOT_FOUND')
      }

      // 计算过期时间（如果提供了持续时间）
      let expiresAt = null
      if (duration_minutes && !isNaN(parseInt(duration_minutes))) {
        expiresAt = BeijingTimeHelper.futureTime(parseInt(duration_minutes) * 60 * 1000)
      }

      // 调用管理策略设置强制中奖（V4.1新签名：adminId, targetUserId, prizeId, reason, expiresAt）
      const result = await sharedComponents.managementStrategy.forceWin(
        req.user?.user_id || req.user?.id,
        validatedUserId,
        validatedPrizeId,
        reason,
        expiresAt
      )

      if (result.success) {
        sharedComponents.logger.info('强制中奖设置成功', {
          setting_id: result.setting_id,
          user_id: validatedUserId,
          prize_id: validatedPrizeId,
          admin_id: req.user?.user_id || req.user?.id,
          reason,
          expires_at: expiresAt,
          timestamp: result.timestamp
        })

        return res.apiSuccess(
          {
            setting_id: result.setting_id,
            user_id: validatedUserId,
            user_mobile: user.mobile,
            prize_id: validatedPrizeId,
            prize_name: prize.prize_name,
            status: 'force_win_set',
            reason,
            expires_at: expiresAt,
            admin_id: req.user?.user_id || req.user?.id,
            timestamp: result.timestamp
          },
          '强制中奖设置成功'
        )
      } else {
        return res.apiError(result.error || '强制中奖设置失败', 'FORCE_WIN_FAILED')
      }
    } catch (error) {
      if (
        error.message.includes('无效的') ||
        error.message.includes('不存在') ||
        error.message.includes('验证失败')
      ) {
        return res.apiError(error.message, 'VALIDATION_ERROR')
      }
      sharedComponents.logger.error('强制中奖设置失败', { error: error.message })
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

      // 查找用户
      const user = await models.User.findByPk(validatedUserId)
      if (!user) {
        return res.apiError('用户不存在', 'USER_NOT_FOUND')
      }

      // 计算过期时间（如果提供了持续时间）
      let expiresAt = null
      if (duration_minutes && !isNaN(parseInt(duration_minutes))) {
        expiresAt = BeijingTimeHelper.futureTime(parseInt(duration_minutes) * 60 * 1000)
      }

      // 调用管理策略设置强制不中奖（V4.1新签名：adminId, targetUserId, count, reason, expiresAt）
      const result = await sharedComponents.managementStrategy.forceLose(
        req.user?.user_id || req.user?.id,
        validatedUserId,
        parseInt(count),
        reason,
        expiresAt
      )

      if (result.success) {
        sharedComponents.logger.info('强制不中奖设置成功', {
          setting_id: result.setting_id,
          user_id: validatedUserId,
          count: parseInt(count),
          remaining: result.remaining,
          admin_id: req.user?.user_id || req.user?.id,
          reason,
          expires_at: expiresAt,
          timestamp: result.timestamp
        })

        return res.apiSuccess(
          {
            setting_id: result.setting_id,
            user_id: validatedUserId,
            user_mobile: user.mobile,
            status: 'force_lose_set',
            count: parseInt(count),
            remaining: result.remaining,
            reason,
            expires_at: expiresAt,
            admin_id: req.user?.user_id || req.user?.id,
            timestamp: result.timestamp
          },
          `强制不中奖设置成功，将在接下来${count}次抽奖中不中奖`
        )
      } else {
        return res.apiError(result.error || '强制不中奖设置失败', 'FORCE_LOSE_FAILED')
      }
    } catch (error) {
      if (
        error.message.includes('无效的') ||
        error.message.includes('不存在') ||
        error.message.includes('验证失败')
      ) {
        return res.apiError(error.message, 'VALIDATION_ERROR')
      }
      sharedComponents.logger.error('强制不中奖设置失败', { error: error.message })
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
        probability_multiplier, // 🔴 兼容旧版：全局倍数（如果没有prize_id）
        prize_id, // 🆕 新增：特定奖品ID
        custom_probability, // 🆕 新增：自定义概率（0-1之间）
        duration_minutes = 60,
        reason = '管理员概率调整'
      } = req.body

      // 参数验证
      const validatedUserId = validators.validateUserId(user_id)

      // 🆕 判断是全局调整还是特定奖品调整
      const isSpecificPrize = !!prize_id
      let settingData = {}

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

        // 查找奖品
        const prize = await models.LotteryPrize.findByPk(validatedPrizeId)
        if (!prize) {
          return res.apiError('奖品不存在', 'PRIZE_NOT_FOUND')
        }

        settingData = {
          prize_id: validatedPrizeId,
          prize_name: prize.prize_name,
          custom_probability: probability,
          auto_adjust_others: true, // 自动调整其他奖品概率
          adjustment_type: 'specific_prize' // 标记为特定奖品调整
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

        settingData = {
          multiplier,
          adjustment_type: 'global_multiplier' // 标记为全局倍数调整
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

      // 查找用户
      const user = await models.User.findByPk(validatedUserId)
      if (!user) {
        return res.apiError('用户不存在', 'USER_NOT_FOUND')
      }

      // 计算过期时间
      const expiresAt = BeijingTimeHelper.futureTime(parseInt(duration_minutes) * 60 * 1000)

      // 🔴 直接创建数据库记录（不调用ManagementStrategy，避免数据格式不匹配）
      const setting = await models.LotteryManagementSetting.create({
        user_id: validatedUserId,
        setting_type: 'probability_adjust',
        setting_data: settingData,
        expires_at: expiresAt,
        status: 'active',
        created_by: req.user?.user_id || req.user?.id
      })

      sharedComponents.logger.info('用户概率调整成功', {
        setting_id: setting.setting_id,
        user_id: validatedUserId,
        is_specific_prize: isSpecificPrize,
        setting_data: settingData,
        duration_minutes: parseInt(duration_minutes),
        expires_at: expiresAt,
        admin_id: req.user?.user_id || req.user?.id,
        reason,
        timestamp: BeijingTimeHelper.now()
      })

      const responseData = {
        setting_id: setting.setting_id,
        user_id: validatedUserId,
        user_mobile: user.mobile,
        status: 'probability_adjusted',
        adjustment_type: settingData.adjustment_type,
        duration_minutes: parseInt(duration_minutes),
        expires_at: expiresAt,
        reason,
        admin_id: req.user?.user_id || req.user?.id,
        timestamp: BeijingTimeHelper.now()
      }

      // 添加具体调整信息
      if (isSpecificPrize) {
        responseData.prize_id = settingData.prize_id
        responseData.prize_name = settingData.prize_name
        responseData.custom_probability = settingData.custom_probability
        responseData.message = `${settingData.prize_name}概率调整为${(settingData.custom_probability * 100).toFixed(1)}%`
      } else {
        responseData.probability_multiplier = settingData.multiplier
        responseData.message = `全局概率倍数${settingData.multiplier}`
      }

      return res.apiSuccess(responseData, `用户概率调整成功，持续${duration_minutes}分钟`)
    } catch (error) {
      if (error.message.includes('无效的')) {
        return res.apiError(error.message, 'VALIDATION_ERROR')
      }
      sharedComponents.logger.error('概率调整失败', { error: error.message })
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

      // 查找用户
      const user = await models.User.findByPk(validatedUserId)
      if (!user) {
        return res.apiError('用户不存在', 'USER_NOT_FOUND')
      }

      // 计算过期时间
      const expiresAt = BeijingTimeHelper.futureTime(parseInt(duration_minutes) * 60 * 1000)

      // 调用管理策略设置用户特定队列（V4.1新签名：adminId, targetUserId, queueConfig, reason, expiresAt）
      const queueConfig = {
        queue_type,
        priority_level: parseInt(priority_level),
        prize_queue: custom_strategy?.prize_queue || []
      }

      const result = await sharedComponents.managementStrategy.setUserQueue(
        req.user?.user_id || req.user?.id,
        validatedUserId,
        queueConfig,
        reason,
        expiresAt
      )

      if (result.success) {
        sharedComponents.logger.info('用户特定队列设置成功', {
          setting_id: result.setting_id,
          user_id: validatedUserId,
          queue_config: result.queue_config,
          duration_minutes: parseInt(duration_minutes),
          expires_at: expiresAt,
          admin_id: req.user?.user_id || req.user?.id,
          reason,
          timestamp: result.timestamp
        })

        return res.apiSuccess(
          {
            setting_id: result.setting_id,
            user_id: validatedUserId,
            user_mobile: user.mobile,
            status: 'user_queue_set',
            queue_type: result.queue_config.queue_type,
            priority_level: result.queue_config.priority_level,
            custom_strategy: custom_strategy || null,
            duration_minutes: parseInt(duration_minutes),
            expires_at: expiresAt,
            reason,
            admin_id: req.user?.user_id || req.user?.id,
            timestamp: result.timestamp
          },
          `用户特定队列设置成功，类型：${queue_type}，优先级：${priority_level}，持续${duration_minutes}分钟`
        )
      } else {
        return res.apiError(result.error || '用户队列设置失败', 'USER_QUEUE_SET_FAILED')
      }
    } catch (error) {
      if (error.message.includes('无效的')) {
        return res.apiError(error.message, 'VALIDATION_ERROR')
      }
      sharedComponents.logger.error('用户队列设置失败', { error: error.message })
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

      // 查找用户
      const user = await models.User.findByPk(validatedUserId)
      if (!user) {
        return res.apiError('用户不存在', 'USER_NOT_FOUND')
      }

      // 获取用户管理状态（V4.1：直接返回状态对象）
      const managementStatus =
        await sharedComponents.managementStrategy.getUserManagementStatus(validatedUserId)

      return res.apiSuccess(
        {
          user_id: validatedUserId,
          user_mobile: user.mobile,
          user_nickname: user.nickname,
          management_status: {
            force_win: managementStatus.force_win
              ? {
                setting_id: managementStatus.force_win.setting_id,
                prize_id: managementStatus.force_win.setting_data.prize_id,
                reason: managementStatus.force_win.setting_data.reason,
                expires_at: managementStatus.force_win.expires_at,
                status: managementStatus.force_win.status
              }
              : null,
            force_lose: managementStatus.force_lose
              ? {
                setting_id: managementStatus.force_lose.setting_id,
                count: managementStatus.force_lose.setting_data.count,
                remaining: managementStatus.force_lose.setting_data.remaining,
                reason: managementStatus.force_lose.setting_data.reason,
                expires_at: managementStatus.force_lose.expires_at,
                status: managementStatus.force_lose.status
              }
              : null,
            probability_adjust: managementStatus.probability_adjust
              ? {
                setting_id: managementStatus.probability_adjust.setting_id,
                adjustment_type: managementStatus.probability_adjust.setting_data.adjustment_type,
                multiplier: managementStatus.probability_adjust.setting_data.multiplier,
                prize_id: managementStatus.probability_adjust.setting_data.prize_id,
                prize_name: managementStatus.probability_adjust.setting_data.prize_name,
                custom_probability: managementStatus.probability_adjust.setting_data.custom_probability,
                auto_adjust_others: managementStatus.probability_adjust.setting_data.auto_adjust_others,
                reason: managementStatus.probability_adjust.setting_data.reason,
                expires_at: managementStatus.probability_adjust.expires_at,
                status: managementStatus.probability_adjust.status
              }
              : null,
            user_queue: managementStatus.user_queue
              ? {
                setting_id: managementStatus.user_queue.setting_id,
                queue_type: managementStatus.user_queue.setting_data.queue_type,
                priority_level: managementStatus.user_queue.setting_data.priority_level,
                prize_queue: managementStatus.user_queue.setting_data.prize_queue,
                current_index: managementStatus.user_queue.setting_data.current_index,
                reason: managementStatus.user_queue.setting_data.reason,
                expires_at: managementStatus.user_queue.expires_at,
                status: managementStatus.user_queue.status
              }
              : null
          },
          timestamp: BeijingTimeHelper.apiTimestamp()
        },
        '用户管理状态获取成功'
      )
    } catch (error) {
      if (error.message.includes('无效的')) {
        return res.apiError(error.message, 'VALIDATION_ERROR')
      }
      sharedComponents.logger.error('获取用户管理状态失败', { error: error.message })
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

      // 查找用户
      const user = await models.User.findByPk(validatedUserId)
      if (!user) {
        return res.apiError('用户不存在', 'USER_NOT_FOUND')
      }

      // 清除用户管理设置（V4.1新签名：adminId, targetUserId, settingType）
      const result = await sharedComponents.managementStrategy.clearUserSettings(
        req.user?.user_id || req.user?.id,
        validatedUserId,
        null // 清除所有类型
      )

      if (result.success) {
        sharedComponents.logger.info('用户管理设置清除成功', {
          user_id: validatedUserId,
          cleared_count: result.cleared_count,
          admin_id: req.user?.user_id || req.user?.id,
          reason,
          timestamp: result.timestamp
        })

        return res.apiSuccess(
          {
            user_id: validatedUserId,
            user_mobile: user.mobile,
            status: 'settings_cleared',
            cleared_count: result.cleared_count,
            reason,
            admin_id: req.user?.user_id || req.user?.id,
            timestamp: result.timestamp
          },
          `用户管理设置清除成功，共清除${result.cleared_count}个设置`
        )
      } else {
        return res.apiError(result.error || '清除用户设置失败', 'CLEAR_USER_SETTINGS_FAILED')
      }
    } catch (error) {
      if (error.message.includes('无效的')) {
        return res.apiError(error.message, 'VALIDATION_ERROR')
      }
      sharedComponents.logger.error('清除用户设置失败', { error: error.message })
      return res.apiInternalError('清除用户设置失败', error.message, 'CLEAR_USER_SETTINGS_ERROR')
    }
  })
)

module.exports = router
