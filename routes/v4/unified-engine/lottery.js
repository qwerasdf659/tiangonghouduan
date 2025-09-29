/**
 * V4.0 统一抽奖引擎路由 - 统一版本
 * 🛡️ 权限管理：只有超级管理员(admin)和普通用户(user)两种角色
 * 创建时间：2025年01月21日
 * 更新时间：2025年01月28日
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, getUserRoles } = require('../../../middleware/auth')
const dataAccessControl = require('../../../middleware/dataAccessControl')
const DataSanitizer = require('../../../services/DataSanitizer')
const lottery_engine = require('../../../services/UnifiedLotteryEngine/UnifiedLotteryEngine')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const PointsService = require('../../../services/PointsService')

/**
 * 获取抽奖奖品列表 - 已应用数据脱敏
 * 解决风险：抽奖概率泄露、库存数据暴露、财务信息泄露
 */
router.get('/prizes/:campaignId', authenticateToken, dataAccessControl, async (req, res) => {
  try {
    const campaign_id = parseInt(req.params.campaignId)

    // 获取完整的奖品数据
    const fullPrizes = await lottery_engine.get_campaign_prizes(campaign_id)

    // 根据用户权限进行数据脱敏
    const sanitizedPrizes = DataSanitizer.sanitizePrizes(fullPrizes, req.dataLevel)

    console.log(`[LotteryAPI] User ${req.user.id} accessed prizes with level: ${req.dataLevel}`)

    return res.apiSuccess(sanitizedPrizes, '奖品列表获取成功', 'PRIZES_SUCCESS')
  } catch (error) {
    console.error('获取奖品列表失败:', error)
    return res.apiError(error.message, 'PRIZES_ERROR', {}, 500)
  }
})

/**
 * 获取抽奖配置 - 已应用数据脱敏
 * 解决风险：保底机制暴露、抽奖策略泄露
 */
router.get('/config/:campaignId', authenticateToken, dataAccessControl, async (req, res) => {
  try {
    const campaign_id = parseInt(req.params.campaignId)

    // 获取完整配置数据
    const fullConfig = await lottery_engine.get_campaign_config(campaign_id)

    if (req.dataLevel === 'full') {
      // 管理员获取完整配置
      return res.apiSuccess(fullConfig, '抽奖配置获取成功')
    } else {
      // 普通用户获取脱敏配置
      const sanitizedConfig = {
        campaign_id: fullConfig.campaign_id,
        campaign_name: fullConfig.campaign_name,
        status: fullConfig.status,
        draw_cost: fullConfig.draw_cost,
        max_draws_per_day: fullConfig.max_draws_per_day,
        guarantee_info: {
          exists: !!fullConfig.guarantee_rule,
          description: '连续抽奖有惊喜哦~'
          // ❌ 不返回：triggerCount, guaranteePrizeId, counterResetAfterTrigger
        }
      }

      return res.apiSuccess(sanitizedConfig, '抽奖配置获取成功')
    }
  } catch (error) {
    console.error('获取抽奖配置失败:', error)
    return res.apiError(error.message, 'CONFIG_ERROR', {}, 500)
  }
})

/**
 * 执行抽奖 - 预设奖品机制完全隐藏
 * 解决风险：预设奖品暴露、伪装机制识别
 */
router.post('/draw', authenticateToken, dataAccessControl, async (req, res) => {
  try {
    const { campaign_id, draw_count = 1 } = req.body
    const user_id = req.user.id

    // 执行抽奖（包含预设奖品逻辑，但对用户完全透明）
    const drawResult = await lottery_engine.execute_draw(user_id, campaign_id, draw_count)

    // 对抽奖结果进行脱敏处理
    const sanitizedResult = {
      success: drawResult.success,
      prizes: drawResult.prizes.map(prize => ({
        id: prize.id,
        name: prize.name,
        type: prize.type,
        icon: DataSanitizer.getPrizeIcon(prize.type),
        rarity: DataSanitizer.calculateRarity(prize.type),
        display_value: DataSanitizer.getDisplayValue(prize.value)
        // ❌ 不返回：is_preset, fake_probability, execution_time, preset_type
      })),
      remaining_balance: drawResult.remaining_balance,
      draw_count: drawResult.draw_count
    }

    // 记录抽奖日志（脱敏）
    const logData = DataSanitizer.sanitizeLogs({
      user_id,
      campaign_id,
      draw_count,
      result: 'success'
    })
    console.log('[LotteryDraw]', logData)

    return res.apiSuccess(sanitizedResult, '抽奖成功', 'DRAW_SUCCESS')
  } catch (error) {
    console.error('抽奖失败:', error)
    return res.apiError(error.message, 'DRAW_ERROR', {}, 500)
  }
})

/**
 * GET /history/:userId - 获取用户抽奖历史
 *
 * @description 获取指定用户的抽奖历史记录
 * @route GET /api/v4/unified-engine/lottery/history/:userId
 * @access Private (需要认证)
 */
router.get('/history/:userId', authenticateToken, async (req, res) => {
  try {
    const user_id = parseInt(req.params.userId)
    const { page = 1, limit = 20 } = req.query

    // 🛡️ 权限检查：只能查看自己的抽奖历史，除非是超级管理员
    const currentUserRoles = await getUserRoles(req.user.id)
    if (req.user.id !== user_id && !currentUserRoles.isAdmin) {
      return res.apiError('无权查看其他用户的抽奖历史', 'ACCESS_DENIED', {}, 403)
    }

    // 获取抽奖历史
    const history = await lottery_engine.get_user_history(user_id, {
      page: parseInt(page),
      limit: parseInt(limit)
    })

    return res.apiSuccess(history, '抽奖历史获取成功', 'HISTORY_SUCCESS')
  } catch (error) {
    console.error('获取抽奖历史失败:', error)
    return res.apiError(error.message, 'HISTORY_ERROR', {}, 500)
  }
})

/**
 * GET /campaigns - 获取活动列表
 *
 * @description 获取当前可用的抽奖活动列表
 * @route GET /api/v4/unified-engine/lottery/campaigns
 * @access Private (需要认证)
 */
router.get('/campaigns', authenticateToken, async (req, res) => {
  try {
    const { status = 'active' } = req.query

    // 获取活动列表
    const campaigns = await lottery_engine.get_campaigns({
      status,
      user_id: req.user.id
    })

    return res.apiSuccess(campaigns, '活动列表获取成功', 'CAMPAIGNS_SUCCESS')
  } catch (error) {
    console.error('获取活动列表失败:', error)
    return res.apiError(error.message, 'CAMPAIGNS_ERROR', {}, 500)
  }
})

/**
 * GET /points/:userId - 获取用户积分信息
 *
 * @description 获取用户的积分余额和相关信息
 * @route GET /api/v4/unified-engine/lottery/points/:userId
 * @access Private (需要认证)
 */
router.get('/points/:userId', authenticateToken, async (req, res) => {
  try {
    const user_id = parseInt(req.params.userId)

    // 🛡️ 权限检查：只能查看自己的积分，除非是超级管理员
    const currentUserRoles = await getUserRoles(req.user.id)
    if (req.user.id !== user_id && !currentUserRoles.isAdmin) {
      return res.apiError('无权查看其他用户的积分信息', 'ACCESS_DENIED', {}, 403)
    }

    // 获取用户积分信息
    const points_info = await PointsService.getUserPointsAccount(user_id)
    return res.apiSuccess(points_info, '用户积分获取成功', 'POINTS_SUCCESS')
  } catch (error) {
    console.error('获取用户积分失败:', error)
    return res.apiError(error.message, 'POINTS_ERROR', {}, 500)
  }
})

/**
 * GET /statistics/:userId - 获取用户抽奖统计
 *
 * @description 获取用户的抽奖统计信息
 * @route GET /api/v4/unified-engine/lottery/statistics/:userId
 * @access Private (需要认证)
 */
router.get('/statistics/:userId', authenticateToken, async (req, res) => {
  try {
    const user_id = parseInt(req.params.userId)

    // 🛡️ 权限检查：只能查看自己的统计，除非是超级管理员
    const currentUserRoles = await getUserRoles(req.user.id)
    if (req.user.id !== user_id && !currentUserRoles.isAdmin) {
      return res.apiError('无权查看其他用户的统计信息', 'ACCESS_DENIED', {}, 403)
    }

    // 获取统计信息
    const statistics = await lottery_engine.get_user_statistics(user_id)

    return res.apiSuccess(statistics, '统计信息获取成功', 'STATISTICS_SUCCESS')
  } catch (error) {
    console.error('获取统计信息失败:', error)
    return res.apiError(error.message, 'STATISTICS_ERROR', {}, 500)
  }
})

/**
 * GET /health - 抽奖系统健康检查
 *
 * @description 检查抽奖系统的运行状态
 * @route GET /api/v4/unified-engine/lottery/health
 * @access Public
 */
router.get('/health', (req, res) => {
  try {
    return res.apiSuccess(
      {
        status: 'healthy',
        service: 'V4.0统一抽奖引擎',
        version: '4.0.0',
        strategies: ['basic_guarantee', 'management'],
        timestamp: BeijingTimeHelper.apiTimestamp()
      },
      'V4.0抽奖系统运行正常'
    )
  } catch (error) {
    console.error('抽奖系统健康检查失败:', error)
    return res.apiError(
      '抽奖系统健康检查失败',
      'HEALTH_CHECK_FAILED',
      { error: error.message },
      500
    )
  }
})

module.exports = router
