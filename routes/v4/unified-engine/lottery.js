/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 抽奖API路由（/api/v4/unified-engine/lottery）
 *
 * 业务场景：提供抽奖相关的REST API接口，包括奖品查询、抽奖执行、抽奖历史等功能
 *
 * API清单：
 *
 * 【奖品管理】
 * - GET /prizes/:campaignCode - 获取抽奖奖品列表（已脱敏，隐藏概率和库存）
 *
 * 【抽奖执行】
 * - POST /draw/:campaign_code - 执行单次抽奖（使用活动代码标识）
 * - POST /multi-draw/:campaign_code - 执行连续抽奖（支持1-10次）
 *
 * 【抽奖历史】
 * - GET /my-history - 获取我的抽奖历史（支持分页、筛选）
 * - GET /history/:draw_id - 获取单条抽奖记录详情
 *
 * 【活动信息】
 * - GET /campaigns - 获取活动列表（当前进行中的活动）
 * - GET /campaigns/:campaign_code - 获取活动详情
 *
 * 核心功能：
 * 1. 奖品信息查询（数据脱敏保护，隐藏敏感商业信息）
 * 2. 单次抽奖执行（积分扣除、概率计算、保底触发）
 * 3. 连续抽奖执行（支持1-10次，统一事务保护）
 * 4. 抽奖历史查询（用户自己的抽奖记录、中奖详情）
 * 5. 活动权限控制（管理员全权限、普通用户需分配权限）
 *
 * 业务规则：
 * - **权限管理**：管理员（admin角色）拥有所有活动权限，普通用户需明确分配活动角色（campaign_{campaign_id}）
 * - **限流保护**：20次/分钟/用户，防止恶意频繁抽奖
 * - **数据脱敏**：奖品列表隐藏概率、库存等敏感信息，防止抓包泄露
 * - **活动标识**：统一使用campaign_code（活动代码）而非campaign_id（数字ID），防止遍历攻击
 * - **100%中奖**：每次抽奖必定从奖品池选择一个奖品（只是价值不同）
 * - **连抽限制**：连续抽奖最多10次，单次事务保证原子性
 * - **积分扣除**：抽奖前检查余额，抽奖后立即扣除，使用事务保护
 *
 * 安全措施：
 * - **JWT认证**：所有接口要求用户登录（authenticateToken中间件）
 * - **数据访问控制**：应用dataAccessControl中间件，防止越权访问
 * - **数据脱敏保护**：使用DataSanitizer统一处理敏感数据
 * - **限流保护**：防止恶意刷接口（20次/分钟/用户）
 * - **权限校验**：checkCampaignPermission()验证用户活动权限
 *
 * 响应格式：
 * - 使用res.api*()中间件注入方法（ApiResponse统一格式）
 * - 成功：{ success: true, code: 'XXX', message: 'xxx', data: {...} }
 * - 失败：{ success: false, code: 'XXX', message: 'xxx', error: 'xxx' }
 *
 * 错误码规范：
 * - USER_NOT_FOUND: 用户不存在
 * - CAMPAIGN_NOT_FOUND: 活动不存在
 * - INSUFFICIENT_POINTS: 积分余额不足
 * - DAILY_LIMIT_EXCEEDED: 每日抽奖次数超限
 * - CAMPAIGN_PERMISSION_DENIED: 活动权限不足
 * - RATE_LIMIT_EXCEEDED: 限流触发
 *
 * 数据模型关联：
 * - LotteryCampaign：抽奖活动表
 * - LotteryPrize：奖品表
 * - LotteryDraw：抽奖记录表
 * - UserPointsAccount：用户积分账户表
 * - User：用户表
 * - Role：角色表（用于权限控制）
 *
 * 使用示例：
 * ```javascript
 * // 示例1：获取奖品列表（已脱敏）
 * GET /api/v4/unified-engine/lottery/prizes/daily_lottery
 * Authorization: Bearer <token>
 *
 * // 响应（已隐藏概率和库存）
 * {
 *   "success": true,
 *   "data": {
 *     "prizes": [
 *       { "id": 1, "name": "100积分", "type": "points" },
 *       { "id": 2, "name": "50积分", "type": "points" }
 *     ]
 *   }
 * }
 *
 * // 示例2：执行单次抽奖
 * POST /api/v4/unified-engine/lottery/draw/daily_lottery
 * Authorization: Bearer <token>
 * Content-Type: application/json
 * {}
 *
 * // 响应
 * {
 *   "success": true,
 *   "message": "抽奖成功",
 *   "data": {
 *     "draw_id": "draw_20251030_abc123",
 *     "prize_name": "100积分",
 *     "prize_value": 100,
 *     "is_winner": true
 *   }
 * }
 *
 * // 示例3：连续抽奖3次
 * POST /api/v4/unified-engine/lottery/multi-draw/daily_lottery
 * Authorization: Bearer <token>
 * Content-Type: application/json
 * {
 *   "draws_count": 3
 * }
 *
 * // 响应
 * {
 *   "success": true,
 *   "data": {
 *     "total_draws": 3,
 *     "results": [
 *       { "draw_id": "xxx1", "prize_name": "100积分", ... },
 *       { "draw_id": "xxx2", "prize_name": "50积分", ... },
 *       { "draw_id": "xxx3", "prize_name": "谢谢参与", ... }
 *     ]
 *   }
 * }
 * ```
 *
 * 创建时间：2025年01月21日
 * 最后更新：2025年10月30日
 * 使用模型：Claude Sonnet 4.5
 */

const express = require('express')
const router = express.Router()
const { authenticateToken, getUserRoles } = require('../../../middleware/auth')
const dataAccessControl = require('../../../middleware/dataAccessControl')
const DataSanitizer = require('../../../services/DataSanitizer')
const lottery_engine = require('../../../services/UnifiedLotteryEngine/UnifiedLotteryEngine')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const PointsService = require('../../../services/PointsService')

/*
 * 🔧 抽奖限流器 - 防止恶意频繁抽奖
 * 创建时间：2025年10月12日
 */
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
      /**
       * 🔥 2025-10-23 修复：管理员也需要返回draw_pricing定价配置
       *
       * 问题：管理员调用时返回fullConfig，但缺少draw_pricing字段
       * 解决：从campaign的prize_distribution_config中提取draw_pricing并添加到返回数据
       */
      const drawPricing = campaign.prize_distribution_config?.draw_pricing || {}

      // 管理员获取完整配置（返回campaign_code而不是campaign_id）
      const adminConfig = {
        ...fullConfig,
        campaign_code: campaign.campaign_code,
        draw_pricing: drawPricing // ✅ 添加定价配置
      }
      return res.apiSuccess(adminConfig, '抽奖配置获取成功')
    } else {
      /**
       * 🔥 2025-10-23 新增：返回连抽定价信息给前端
       *
       * 业务需求：前端需要显示不同连抽选项的价格和折扣信息
       * - 单抽：100积分
       * - 三连抽：300积分
       * - 五连抽：500积分
       * - 十连抽：900积分（九折优惠，节省100积分）
       *
       * 数据来源：campaign.prize_distribution_config.draw_pricing
       * 安全性：定价信息属于公开信息，可以返回给前端
       */
      const drawPricing = campaign.prize_distribution_config?.draw_pricing || {}

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
        },
        // ✅ 新增：连抽定价信息（前端显示需要）
        draw_pricing: drawPricing
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
      total_points_cost: drawResult.total_points_cost, // 🆕 添加总积分消耗字段（测试需要）
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
    // 🎯 分页安全保护：最大50条记录（普通用户抽奖历史）
    const finalLimit = Math.min(parseInt(limit), 50)

    // 🛡️ 权限检查：只能查看自己的抽奖历史，除非是超级管理员
    const currentUserRoles = await getUserRoles(req.user.user_id)
    if (req.user.user_id !== user_id && !currentUserRoles.isAdmin) {
      return res.apiError('无权查看其他用户的抽奖历史', 'ACCESS_DENIED', {}, 403)
    }

    // 获取抽奖历史
    const history = await lottery_engine.get_user_history(user_id, {
      page: parseInt(page),
      limit: finalLimit
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
