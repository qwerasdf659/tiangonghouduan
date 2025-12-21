/**
 * 抽奖管理 - 概率调整与管理策略
 *
 * @description 管理员控制用户抽奖概率和强制中奖/不中奖功能
 * @version 5.0.0
 * @date 2025-12-21
 *
 * 业务功能：
 * 1. 强制中奖/不中奖
 * 2. 用户特定概率调整
 * 3. 用户管理状态查询
 * 4. 清除用户设置
 */

const express = require('express')
const router = express.Router()
const BeijingTimeHelper = require('../../../utils/timeHelper')
const { requireAdmin, authenticateToken } = require('../../../middleware/auth')
const { handleServiceError } = require('../../../middleware/validation')
const UuidResolver = require('../../../utils/UuidResolver')
const logger = require('../../../utils/logger').logger

/**
 * POST /api/v4/admin/lottery-management/probability-adjust
 * @desc 设置用户个性化中奖概率
 * @access Private (Admin)
 */
router.post('/probability-adjust', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { user_id, prize_id, probability, global_multiplier, expires_at } = req.body

    // 参数验证
    if (!user_id) {
      return res.apiError('用户ID不能为空', 'INVALID_PARAMS', null, 400)
    }

    // 验证至少提供一种调整方式
    if (!prize_id && !global_multiplier) {
      return res.apiError(
        '必须指定prize_id（特定奖品）或global_multiplier（全局倍数）',
        'INVALID_PARAMS',
        null,
        400
      )
    }

    // 验证概率值
    if (prize_id && (probability === undefined || probability < 0 || probability > 1)) {
      return res.apiError('概率值必须在0-1之间', 'INVALID_PARAMS', null, 400)
    }

    // 验证倍数值
    if (global_multiplier && (global_multiplier < 0 || global_multiplier > 10)) {
      return res.apiError('全局倍数必须在0-10之间', 'INVALID_PARAMS', null, 400)
    }

    // 通过ServiceManager获取AdminLotteryService
    const AdminLotteryService = req.app.locals.services.getService('adminLottery')

    // 🎯 准备adjustmentData参数（匹配Service层期望格式）
    const adjustmentData = {}

    // 特定奖品概率调整模式
    if (prize_id && probability !== undefined) {
      adjustmentData.adjustment_type = 'specific_prize'
      adjustmentData.prize_id = prize_id
      adjustmentData.custom_probability = probability
      adjustmentData.reason = '管理员概率调整'
    } else if (global_multiplier !== undefined) {
      // 全局倍数调整模式
      adjustmentData.adjustment_type = 'global_multiplier'
      adjustmentData.multiplier = global_multiplier
      adjustmentData.reason = '管理员全局概率倍数调整'
    }

    // 调用服务层调整概率（参数格式：adminId, userId, adjustmentData, expiresAt）
    const result = await AdminLotteryService.adjustUserProbability(
      req.user.user_id, // adminId
      user_id, // userId
      adjustmentData, // adjustmentData
      expires_at // expiresAt
    )

    logger.info('用户概率调整成功', {
      admin_id: req.user.user_id,
      target_user_id: user_id,
      prize_id,
      probability,
      global_multiplier
    })

    return res.apiSuccess(result, '概率调整设置成功')
  } catch (error) {
    logger.error('设置用户概率失败', { error: error.message })
    return handleServiceError(error, res, '设置概率失败')
  }
})

/**
 * GET /api/v4/admin/lottery-management/user-status/:id
 * @desc 获取用户的管理设置状态
 * @access Private (Admin)
 */
router.get('/user-status/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 使用UuidResolver转换UUID → user_id
    const userId = await UuidResolver.safeGetUserId(req.params.id)

    // 通过ServiceManager获取AdminLotteryService
    const AdminLotteryService = req.app.locals.services.getService('adminLottery')

    // 获取用户管理状态
    const status = await AdminLotteryService.getUserManagementStatus(userId)

    logger.info('查询用户管理状态', {
      admin_id: req.user.user_id,
      target_user_id: userId
    })

    return res.apiSuccess(status, '用户管理状态查询成功')
  } catch (error) {
    if (error.message.includes('无效的用户ID') || error.message.includes('用户不存在')) {
      return res.apiError(error.message, 'INVALID_USER_ID', null, 400)
    }
    logger.error('查询用户管理状态失败', { error: error.message })
    return handleServiceError(error, res, '查询失败')
  }
})

/**
 * DELETE /api/v4/admin/lottery-management/clear-user-settings/:id
 * @desc 清除用户的所有管理设置
 * @access Private (Admin)
 */
router.delete('/clear-user-settings/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 使用UuidResolver转换UUID → user_id
    const userId = await UuidResolver.safeGetUserId(req.params.id)

    // 通过ServiceManager获取AdminLotteryService
    const AdminLotteryService = req.app.locals.services.getService('adminLottery')

    // 清除用户设置（参数顺序：adminId, userId, settingType, reason）
    const result = await AdminLotteryService.clearUserSettings(
      req.user.user_id, // adminId
      userId, // userId
      null, // settingType (null表示清除所有类型)
      '管理员清除设置' // reason
    )

    logger.info('清除用户管理设置', {
      admin_id: req.user.user_id,
      target_user_id: userId,
      cleared_count: result.cleared_count
    })

    return res.apiSuccess(result, '用户设置清除成功')
  } catch (error) {
    if (error.message.includes('无效的用户ID') || error.message.includes('用户不存在')) {
      return res.apiError(error.message, 'INVALID_USER_ID', null, 400)
    }
    logger.error('清除用户设置失败', { error: error.message })
    return handleServiceError(error, res, '清除设置失败')
  }
})

/**
 * POST /api/v4/admin/lottery-management/force-win
 * @desc 强制用户下次抽奖中奖
 * @access Private (Admin)
 */
router.post('/force-win', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { user_id, prize_id, reason = '管理员强制中奖', duration_minutes = null } = req.body

    if (!user_id || !prize_id) {
      return res.apiError('用户ID和奖品ID不能为空', 'INVALID_PARAMS', null, 400)
    }

    // 计算过期时间
    let expiresAt = null
    if (duration_minutes && !isNaN(parseInt(duration_minutes))) {
      expiresAt = BeijingTimeHelper.futureTime(parseInt(duration_minutes) * 60 * 1000)
    }

    // 通过ServiceManager获取AdminLotteryService
    const AdminLotteryService = req.app.locals.services.getService('adminLottery')

    // 调用服务层方法（参数顺序：adminId, userId, prizeId, reason, expiresAt）
    const result = await AdminLotteryService.forceWinForUser(
      req.user.user_id, // adminId
      user_id, // userId
      prize_id, // prizeId
      reason, // reason
      expiresAt // expiresAt
    )

    logger.info('设置强制中奖', {
      admin_id: req.user.user_id,
      target_user_id: user_id,
      prize_id
    })

    return res.apiSuccess(result, '强制中奖设置成功')
  } catch (error) {
    logger.error('设置强制中奖失败', { error: error.message })
    return handleServiceError(error, res, '设置失败')
  }
})

/**
 * POST /api/v4/admin/lottery-management/force-lose
 * @desc 强制用户下次抽奖不中奖
 * @access Private (Admin)
 */
router.post('/force-lose', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { user_id, count = 1, reason = '管理员强制不中奖', duration_minutes = null } = req.body

    if (!user_id) {
      return res.apiError('用户ID不能为空', 'INVALID_PARAMS', null, 400)
    }

    // 计算过期时间
    let expiresAt = null
    if (duration_minutes && !isNaN(parseInt(duration_minutes))) {
      expiresAt = BeijingTimeHelper.futureTime(parseInt(duration_minutes) * 60 * 1000)
    }

    // 通过ServiceManager获取AdminLotteryService
    const AdminLotteryService = req.app.locals.services.getService('adminLottery')

    // 调用服务层方法（参数顺序：adminId, userId, count, reason, expiresAt）
    const result = await AdminLotteryService.forceLoseForUser(
      req.user.user_id, // adminId
      user_id, // userId
      count, // count
      reason, // reason
      expiresAt // expiresAt
    )

    logger.info('设置强制不中奖', {
      admin_id: req.user.user_id,
      target_user_id: user_id
    })

    return res.apiSuccess(result, '强制不中奖设置成功')
  } catch (error) {
    logger.error('设置强制不中奖失败', { error: error.message })
    return handleServiceError(error, res, '设置失败')
  }
})

module.exports = router
