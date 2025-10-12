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

// 🔧 抽奖限流器 - 防止恶意频繁抽奖
// 创建时间：2025年10月12日
const { getRateLimiter } = require('../../../middleware/RateLimiterMiddleware')
const rateLimiter = getRateLimiter()

// 创建抽奖专用限流中间件 - 20次/分钟/用户
const lotteryRateLimiter = rateLimiter.createLimiter({
  windowMs: 60 * 1000, // 1分钟窗口
  max: 20, // 最多20次抽奖
  keyPrefix: 'rate_limit:lottery:',
  keyGenerator: 'user', // 按用户限流
  message: '抽奖过于频繁，请稍后再试',
  onLimitReached: (req, key, count) => {
    console.warn('[Lottery] 抽奖限流触发', {
      user_id: req.user?.user_id,
      count,
      limit: 20,
      timestamp: BeijingTimeHelper.now()
    })
  }
})

/**
 * 🆕 V2.0: 检查用户活动权限
 * @param {number} user_id - 用户ID
 * @param {number} campaign_id - 活动ID
 * @returns {Promise<boolean>} 是否有权限
 *
 * @description
 * 权限检查逻辑：
 * 1. 管理员（admin角色）自动拥有所有活动权限
 * 2. 普通用户需要明确分配活动角色（role_name: campaign_{campaign_id}）
 * 3. 利用现有UUID角色系统，零技术债务
 */
async function checkCampaignPermission (user_id, campaign_id) {
  const { User, Role } = require('../../../models')

  try {
    const user = await User.findOne({
      where: { user_id, status: 'active' },
      include: [{
        model: Role,
        as: 'roles',
        through: { where: { is_active: true } },
        required: false // LEFT JOIN，允许用户没有角色
      }]
    })

    if (!user) return false

    // 检查是否是管理员（管理员拥有所有活动权限）
    const isAdmin = user.roles.some(role => role.role_name === 'admin') // ✅ 修复: 使用role_name
    if (isAdmin) {
      console.log(`[Permission] user_id=${user_id} 是管理员，自动拥有所有活动权限`)
      return true
    }

    // 检查是否有该活动的专属角色
    const campaignRoleName = `campaign_${campaign_id}`
    const hasCampaignRole = user.roles.some(role =>
      role.role_name === campaignRoleName && role.is_active // ✅ 修复: 使用role_name
    )

    console.log(`[Permission] user_id=${user_id}, campaign_id=${campaign_id}, has_permission=${hasCampaignRole}`)
    return hasCampaignRole
  } catch (error) {
    console.error(`[Permission] 权限检查失败：user_id=${user_id}, campaign_id=${campaign_id}`, error)
    return false
  }
}

/**
 * 获取抽奖奖品列表 - 已应用数据脱敏
 * 解决风险：抽奖概率泄露、库存数据暴露、财务信息泄露
 * 🎯 V4.2: 使用campaign_code标识符（方案2实施）
 */
router.get('/prizes/:campaignCode', authenticateToken, dataAccessControl, async (req, res) => {
  try {
    const campaign_code = req.params.campaignCode

    // 通过campaign_code查询活动
    const { LotteryCampaign } = require('../../../models')
    const campaign = await LotteryCampaign.findOne({
      where: { campaign_code, status: 'active' }
    })

    if (!campaign) {
      return res.apiError(
        `活动不存在或已关闭: ${campaign_code}`,
        'CAMPAIGN_NOT_FOUND',
        { campaign_code },
        404
      )
    }

    // 使用campaign.campaign_id获取奖品列表（内部仍用ID）
    const fullPrizes = await lottery_engine.get_campaign_prizes(campaign.campaign_id)

    // 根据用户权限进行数据脱敏
    const sanitizedPrizes = DataSanitizer.sanitizePrizes(fullPrizes, req.dataLevel)

    console.log(`[LotteryAPI] User ${req.user.user_id} accessed prizes for ${campaign_code} with level: ${req.dataLevel}`)

    return res.apiSuccess(sanitizedPrizes, '奖品列表获取成功', 'PRIZES_SUCCESS')
  } catch (error) {
    console.error('获取奖品列表失败:', error)
    return res.apiError(error.message, 'PRIZES_ERROR', {}, 500)
  }
})

/**
 * 获取抽奖配置 - 已应用数据脱敏
 * 解决风险：保底机制暴露、抽奖策略泄露
 * 🎯 V4.2: 使用campaign_code标识符（方案2实施）
 */
router.get('/config/:campaignCode', authenticateToken, dataAccessControl, async (req, res) => {
  try {
    const campaign_code = req.params.campaignCode

    // 通过campaign_code查询活动
    const { LotteryCampaign } = require('../../../models')
    const campaign = await LotteryCampaign.findOne({
      where: { campaign_code, status: 'active' }
    })

    if (!campaign) {
      return res.apiError(
        `活动不存在或已关闭: ${campaign_code}`,
        'CAMPAIGN_NOT_FOUND',
        { campaign_code },
        404
      )
    }

    // 使用campaign.campaign_id获取完整配置（内部仍用ID）
    const fullConfig = await lottery_engine.get_campaign_config(campaign.campaign_id)

    if (req.dataLevel === 'full') {
      // 管理员获取完整配置（返回campaign_code而不是campaign_id）
      const adminConfig = {
        ...fullConfig,
        campaign_code: campaign.campaign_code
      }
      return res.apiSuccess(adminConfig, '抽奖配置获取成功')
    } else {
      // 普通用户获取脱敏配置
      const sanitizedConfig = {
        campaign_code: campaign.campaign_code,
        campaign_name: fullConfig.campaign_name,
        status: fullConfig.status,
        cost_per_draw: fullConfig.cost_per_draw,
        max_draws_per_user_daily: fullConfig.max_draws_per_user_daily,
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
 * 🎯 V4.2: 使用campaign_code标识符（方案2实施）
 * 🆕 V2.0: 增加活动权限检查
 * 🔧 V4.3: 增加抽奖频率限制（20次/分钟/用户）- 2025年10月12日
 */
router.post('/draw', authenticateToken, lotteryRateLimiter, dataAccessControl, async (req, res) => {
  try {
    const { campaign_code, draw_count = 1 } = req.body
    const user_id = req.user.user_id

    if (!campaign_code) {
      return res.apiError('缺少必需参数: campaign_code', 'MISSING_PARAMETER', {}, 400)
    }

    // 通过campaign_code查询活动
    const { LotteryCampaign } = require('../../../models')
    const campaign = await LotteryCampaign.findOne({
      where: { campaign_code, status: 'active' }
    })

    if (!campaign) {
      return res.apiError(
        `活动不存在或已关闭: ${campaign_code}`,
        'CAMPAIGN_NOT_FOUND',
        { campaign_code },
        404
      )
    }

    // 🆕 V2.0: 检查用户是否有活动权限（管理员自动拥有所有权限）
    const hasPermission = await checkCampaignPermission(user_id, campaign.campaign_id)
    if (!hasPermission) {
      console.log(`[LotteryAPI] 权限拒绝：user_id=${user_id}, campaign_code=${campaign_code}`)
      return res.apiError(
        '您没有参加此活动的权限，请联系管理员',
        'NO_CAMPAIGN_PERMISSION',
        { campaign_code, campaign_name: campaign.campaign_name },
        403
      )
    }

    // 执行抽奖（内部使用campaign.campaign_id，包含预设奖品逻辑，但对用户完全透明）
    const drawResult = await lottery_engine.execute_draw(user_id, campaign.campaign_id, draw_count)

    // 🔍 调试日志：查看策略返回的原始数据
    console.log('[DEBUG] drawResult.prizes:', JSON.stringify(drawResult.prizes.map(p => ({
      is_winner: p.is_winner,
      has_prize: !!p.prize,
      prize_keys: p.prize ? Object.keys(p.prize) : [],
      sort_order: p.prize?.sort_order
    })), null, 2))

    // 对抽奖结果进行脱敏处理
    const sanitizedResult = {
      success: drawResult.success,
      campaign_code: campaign.campaign_code, // 返回campaign_code
      prizes: drawResult.prizes.map(prize => {
        // ✅ 未中奖时返回特殊标记，不包含prize详情
        if (!prize.is_winner || !prize.prize) {
          return {
            is_winner: false,
            name: '未中奖',
            type: 'empty',
            sort_order: null,
            icon: '💨',
            rarity: 'common'
          }
        }

        // ✅ 中奖时返回完整奖品信息
        return {
          is_winner: true,
          id: prize.prize.id,
          name: prize.prize.name,
          type: prize.prize.type,
          sort_order: prize.prize.sort_order, // 🎯 前端用于计算索引（index = sort_order - 1）
          icon: DataSanitizer.getPrizeIcon(prize.prize.type),
          rarity: DataSanitizer.calculateRarity(prize.prize.type),
          display_value: DataSanitizer.getDisplayValue(prize.prize.value)
        }
      }),
      remaining_balance: drawResult.remaining_balance,
      draw_count: drawResult.draw_count
    }

    // 记录抽奖日志（脱敏）
    const logData = DataSanitizer.sanitizeLogs({
      user_id,
      campaign_code: campaign.campaign_code,
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
 * GET /history/:user_id - 获取用户抽奖历史
 *
 * @description 获取指定用户的抽奖历史记录
 * @route GET /api/v4/unified-engine/lottery/history/:user_id
 * @access Private (需要认证)
 */
router.get('/history/:user_id', authenticateToken, async (req, res) => {
  try {
    const user_id = parseInt(req.params.user_id)
    const { page = 1, limit = 20 } = req.query

    // 🛡️ 权限检查：只能查看自己的抽奖历史，除非是超级管理员
    const currentUserRoles = await getUserRoles(req.user.user_id)
    if (req.user.user_id !== user_id && !currentUserRoles.isAdmin) {
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
      user_id: req.user.user_id
    })

    return res.apiSuccess(campaigns, '活动列表获取成功', 'CAMPAIGNS_SUCCESS')
  } catch (error) {
    console.error('获取活动列表失败:', error)
    return res.apiError(error.message, 'CAMPAIGNS_ERROR', {}, 500)
  }
})

/**
 * GET /points/:user_id - 获取用户积分信息
 *
 * @description 获取用户的积分余额和相关信息
 * @route GET /api/v4/unified-engine/lottery/points/:user_id
 * @access Private (需要认证)
 */
router.get('/points/:user_id', authenticateToken, async (req, res) => {
  try {
    const user_id = parseInt(req.params.user_id)

    // 🛡️ 权限检查：只能查看自己的积分，除非是超级管理员
    const currentUserRoles = await getUserRoles(req.user.user_id)
    if (req.user.user_id !== user_id && !currentUserRoles.isAdmin) {
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
 * GET /statistics/:user_id - 获取用户抽奖统计
 *
 * @description 获取用户的抽奖统计信息
 * @route GET /api/v4/unified-engine/lottery/statistics/:user_id
 * @access Private (需要认证)
 */
router.get('/statistics/:user_id', authenticateToken, async (req, res) => {
  try {
    const user_id = parseInt(req.params.user_id)

    // 🛡️ 权限检查：只能查看自己的统计，除非是超级管理员
    const currentUserRoles = await getUserRoles(req.user.user_id)
    if (req.user.user_id !== user_id && !currentUserRoles.isAdmin) {
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
