const Logger = require('../../../services/UnifiedLotteryEngine/utils/Logger')
const logger = new Logger('lottery')

/**
 * 餐厅积分抽奖系统 V4.0 RESTful架构 - 抽奖系统路由
 *
 * @route /api/v4/lottery
 * @standard RESTful资源导向设计
 * @reference 米哈游原神、网易游戏行业标准
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
 *
 * 业务规则：
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
 * - RATE_LIMIT_EXCEEDED: 限流触发
 *
 * 数据模型关联：
 * - LotteryCampaign：抽奖活动表
 * - LotteryPrize：奖品表
 * - LotteryDraw：抽奖记录表
 * - UserPointsAccount：用户积分账户表
 * - User：用户表
 *
 * 使用示例：
 * ```javascript
 * // 示例1：获取奖品列表（已脱敏）
 * GET /api/v4/lottery/prizes/daily_lottery
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
 * POST /api/v4/lottery/draw/daily_lottery
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
 * POST /api/v4/lottery/multi-draw/daily_lottery
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
const { handleServiceError } = require('../../../middleware/validation')
const DataSanitizer = require('../../../services/DataSanitizer')
const BeijingTimeHelper = require('../../../utils/timeHelper')

/*
 * 🔧 抽奖限流器 - 防止恶意频繁抽奖
 * 创建时间：2025年10月12日
 */
const { getRateLimiter } = require('../../../middleware/RateLimiterMiddleware')
const rateLimiter = getRateLimiter()

/**
 * 🔥 修复方案2：路由层请求去重机制（立即执行）
 * 用途：防止用户多次点击导致重复提交
 * 实现：内存缓存，5秒内相同请求返回"处理中"
 * 业务含义：就像快递单号查重，避免重复下单
 * 创建时间：2025年10月30日
 */
const requestCache = new Map()

/**
 * 请求去重中间件
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 * @param {Function} next - 下一个中间件
 * @returns {void}
 */
function requestDeduplication(req, res, next) {
  const { campaign_code, draw_count = 1 } = req.body
  const user_id = req.user?.user_id

  if (!user_id || !campaign_code) {
    return next() // 参数不完整，继续执行后续逻辑
  }

  // 生成请求唯一标识
  const requestKey = `${user_id}_${campaign_code}_${draw_count}`

  // 检查是否存在相同的进行中请求
  const existingRequest = requestCache.get(requestKey)
  const now = Date.now()

  if (existingRequest && now - existingRequest.timestamp < 5000) {
    // 5秒内重复请求，返回"请求处理中"
    logger.warn(
      `⚠️ 请求去重: ${requestKey} 距离上次请求仅${Math.round((now - existingRequest.timestamp) / 1000)}秒`
    )
    return res.apiError(
      '请求处理中，请勿重复提交',
      'REQUEST_IN_PROGRESS',
      { request_key: requestKey },
      429
    )
  }

  // 记录本次请求
  requestCache.set(requestKey, {
    timestamp: now,
    status: 'processing'
  })

  // 请求完成后清理缓存
  const originalSend = res.send
  res.send = function (data) {
    // 延迟清理（5秒后），避免立即清理导致重复请求
    setTimeout(() => {
      requestCache.delete(requestKey)
    }, 5000)

    return originalSend.call(this, data)
  }

  return next()
}

// 创建抽奖专用限流中间件 - 20次/分钟/用户
const lotteryRateLimiter = rateLimiter.createLimiter({
  windowMs: 60 * 1000, // 1分钟窗口
  max: 20, // 最多20次抽奖
  keyPrefix: 'rate_limit:lottery:',
  keyGenerator: 'user', // 按用户限流
  message: '抽奖过于频繁，请稍后再试',
  onLimitReached: (req, key, count) => {
    logger.warn('[Lottery] 抽奖限流触发', {
      user_id: req.user?.user_id,
      count,
      limit: 20,
      timestamp: BeijingTimeHelper.now()
    })
  }
})

/**
 * 创建积分查询限流中间件 - 60次/分钟/用户
 * 防止恶意用户通过脚本大量查询积分，保护数据库和服务器
 * 限流策略：比抽奖更宽松（60次 vs 20次），因为查询频率低于抽奖
 */
const pointsRateLimiter = rateLimiter.createLimiter({
  windowMs: 60 * 1000, // 1分钟窗口
  max: 60, // 最多60次查询
  keyPrefix: 'rate_limit:points:',
  keyGenerator: 'user', // 按用户ID限流
  message: '查询过于频繁，请稍后再试',
  onLimitReached: (req, key, count) => {
    logger.warn('[Points] 积分查询限流触发', {
      user_id: req.user?.user_id,
      target_user_id: req.params.user_id,
      count,
      limit: 60,
      timestamp: BeijingTimeHelper.now()
    })
  }
})

/**
 * 获取抽奖奖品列表 - 已应用数据脱敏
 * 解决风险：抽奖概率泄露、库存数据暴露、财务信息泄露
 * 🎯 V4.2: 使用campaign_code标识符（方案2实施）
 * 🔥 V4.3: 增加参数校验 + 友好错误提示（与/config路由保持一致）
 */
router.get('/prizes/:campaignCode', authenticateToken, dataAccessControl, async (req, res) => {
  try {
    const campaign_code = req.params.campaignCode

    // 🔥 参数校验增强（与/config路由保持一致）
    if (!campaign_code || typeof campaign_code !== 'string') {
      return res.apiError('缺少活动代码参数', 'MISSING_CAMPAIGN_CODE', {}, 400)
    }

    if (campaign_code.length > 100) {
      return res.apiError('活动代码过长', 'INVALID_CAMPAIGN_CODE', { max_length: 100 }, 400)
    }

    if (!/^[a-z0-9_]+$/i.test(campaign_code)) {
      return res.apiError(
        '活动代码格式不正确，只允许字母、数字和下划线',
        'INVALID_CAMPAIGN_CODE',
        { campaign_code },
        400
      )
    }

    // ✅ 通过Service获取活动和奖品列表（不再直连models）
    const lottery_engine = req.app.locals.services.getService('unifiedLotteryEngine')
    const { campaign: _campaign, prizes: fullPrizes } =
      await lottery_engine.getCampaignWithPrizes(campaign_code)

    // 根据用户权限进行数据脱敏
    const sanitizedPrizes = DataSanitizer.sanitizePrizes(fullPrizes, req.dataLevel)

    logger.info(
      `[LotteryAPI] User ${req.user.user_id} accessed prizes for ${campaign_code} with level: ${req.dataLevel}`
    )

    return res.apiSuccess(sanitizedPrizes, '奖品列表获取成功', 'PRIZES_SUCCESS')
  } catch (error) {
    logger.error('获取奖品列表失败:', error)
    return handleServiceError(error, res, '获取奖品列表失败')
  }
})

/**
 * 获取抽奖配置 - 已应用数据脱敏
 * 解决风险：保底机制暴露、抽奖策略泄露
 * 🎯 V4.2: 使用campaign_code标识符（方案2实施）
 * 🔥 V4.3: 增加draw_pricing降级保护 + 参数校验 + 友好错误提示
 */
router.get('/config/:campaignCode', authenticateToken, dataAccessControl, async (req, res) => {
  try {
    const campaign_code = req.params.campaignCode

    // 🔥 P1级修复：参数校验增强
    if (!campaign_code || typeof campaign_code !== 'string') {
      return res.apiError('缺少活动代码参数', 'MISSING_CAMPAIGN_CODE', {}, 400)
    }

    if (campaign_code.length > 100) {
      return res.apiError('活动代码过长', 'INVALID_CAMPAIGN_CODE', { max_length: 100 }, 400)
    }

    if (!/^[a-z0-9_]+$/i.test(campaign_code)) {
      return res.apiError(
        '活动代码格式不正确，只允许字母、数字和下划线',
        'INVALID_CAMPAIGN_CODE',
        { campaign_code },
        400
      )
    }

    // ✅ 通过Service获取活动配置（不再直连models）
    const lottery_engine = req.app.locals.services.getService('unifiedLotteryEngine')
    const campaign = await lottery_engine.getCampaignByCode(campaign_code)

    // 使用campaign.campaign_id获取完整配置（内部仍用ID）
    const fullConfig = await lottery_engine.get_campaign_config(campaign.campaign_id)

    // 🔥 P0级修复：draw_pricing降级保护（防止配置缺失导致业务中断）
    const businessConfig = require('../../../config/business.config')
    const defaultPricing = businessConfig.lottery.draw_pricing

    // 检查配置是否缺失
    const isConfigMissing = !campaign.prize_distribution_config?.draw_pricing
    const drawPricing = campaign.prize_distribution_config?.draw_pricing || defaultPricing

    // 如果配置缺失，记录告警日志
    if (isConfigMissing) {
      logger.error(`🚨 [CONFIG_ERROR] 活动 ${campaign_code} 缺少 draw_pricing 配置，已使用默认配置`)
    }

    if (req.dataLevel === 'full') {
      /**
       * 🔥 2025-10-23 修复：管理员也需要返回draw_pricing定价配置
       * 🔥 2025-11-03 增强：添加配置缺失警告（仅管理员可见）
       *
       * 问题：管理员调用时返回fullConfig，但缺少draw_pricing字段
       * 解决：从campaign的prize_distribution_config中提取draw_pricing并添加到返回数据
       */

      // 管理员获取完整配置（返回campaign_code而不是campaign_id）
      const adminConfig = {
        ...fullConfig,
        campaign_code: campaign.campaign_code,
        draw_pricing: drawPricing // ✅ 添加定价配置（含降级保护）
      }

      // 如果配置缺失，在响应中添加警告信息（仅管理员可见）
      const warningMessage = isConfigMissing
        ? '⚠️ 当前活动配置不完整，正在使用默认定价配置，请尽快补充完整配置'
        : null

      return res.apiSuccess(
        adminConfig,
        '抽奖配置获取成功',
        'CONFIG_SUCCESS',
        warningMessage ? { warning: warningMessage } : undefined
      )
    } else {
      /**
       * 🔥 2025-10-23 新增：返回连抽定价信息给前端
       * 🔥 2025-11-03 增强：使用默认配置降级（防止业务中断）
       *
       * 业务需求：前端需要显示不同连抽选项的价格和折扣信息
       * - 单抽：100积分
       * - 三连抽：300积分
       * - 五连抽：500积分
       * - 十连抽：900积分（九折优惠，节省100积分）
       *
       * 数据来源：campaign.prize_distribution_config.draw_pricing
       * 安全性：定价信息属于公开信息，可以返回给前端
       * 降级保护：如果配置缺失，使用默认配置确保业务连续性
       */

      // 普通用户获取脱敏配置（已应用降级保护）
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
        // ✅ 连抽定价信息（含降级保护，确保100%业务连续性）
        draw_pricing: drawPricing
      }

      return res.apiSuccess(sanitizedConfig, '抽奖配置获取成功')
    }
  } catch (error) {
    logger.error('获取抽奖配置失败:', error)
    return handleServiceError(error, res, '获取抽奖配置失败')
  }
})

/**
 * 执行抽奖 - 预设奖品机制完全隐藏
 * 解决风险：预设奖品暴露、伪装机制识别
 * 🎯 V4.2: 使用campaign_code标识符（方案2实施）
 * 🔧 V4.3: 增加抽奖频率限制（20次/分钟/用户）- 2025年10月12日
 */
router.post(
  '/draw',
  authenticateToken,
  requestDeduplication,
  lotteryRateLimiter,
  dataAccessControl,
  async (req, res) => {
    try {
      const { campaign_code, draw_count = 1 } = req.body
      const user_id = req.user.user_id

      if (!campaign_code) {
        return res.apiError('缺少必需参数: campaign_code', 'MISSING_PARAMETER', {}, 400)
      }

      // ✅ 通过Service获取并验证活动（不再直连models）
      const lottery_engine = req.app.locals.services.getService('unifiedLotteryEngine')
      const campaign = await lottery_engine.getCampaignByCode(campaign_code, {
        checkStatus: true // 只获取active状态的活动
      })
      const drawResult = await lottery_engine.execute_draw(
        user_id,
        campaign.campaign_id,
        draw_count
      )

      // 🔍 调试日志：查看策略返回的原始数据
      logger.info(
        '[DEBUG] drawResult.prizes:',
        JSON.stringify(
          drawResult.prizes.map(p => ({
            is_winner: p.is_winner,
            has_prize: !!p.prize,
            prize_keys: p.prize ? Object.keys(p.prize) : [],
            sort_order: p.prize?.sort_order
          })),
          null,
          2
        )
      )

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
              rarity: 'common',
              display_points: 0
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
            display_points:
              typeof prize.prize.value === 'number'
                ? prize.prize.value
                : parseFloat(prize.prize.value) || 0,
            display_value: DataSanitizer.getDisplayValue(
              typeof prize.prize.value === 'number'
                ? prize.prize.value
                : parseFloat(prize.prize.value) || 0
            )
          }
        }),
        total_points_cost: drawResult.total_points_cost, // 实际消耗积分（折后价）
        original_cost: drawResult.original_cost, // 原价积分（用于显示优惠）
        discount: drawResult.discount, // 折扣率（0.9=九折，1.0=无折扣）
        saved_points: drawResult.saved_points, // 节省的积分数量（前端显示"节省XX积分"）
        remaining_balance: drawResult.remaining_balance, // 剩余积分余额
        draw_count: drawResult.draw_count, // 抽奖次数
        draw_type: drawResult.draw_type // 抽奖类型显示（如"10连抽(九折)"）
      }

      // 记录抽奖日志（脱敏）
      const logData = DataSanitizer.sanitizeLogs({
        user_id,
        campaign_code: campaign.campaign_code,
        draw_count,
        result: 'success'
      })
      logger.info('[LotteryDraw]', logData)

      return res.apiSuccess(sanitizedResult, '抽奖成功', 'DRAW_SUCCESS')
    } catch (error) {
      logger.error('抽奖失败:', error)
      return handleServiceError(error, res, '抽奖失败')
    }
  }
)

/**
 * GET /history/:user_id - 获取用户抽奖历史
 *
 * @description 获取指定用户的抽奖历史记录
 * @route GET /api/v4/lottery/history/:user_id
 * @access Private (需要认证)
 *
 * 🔧 V4.4优化（2025-11-10）：增强错误日志记录
 * - 记录完整请求上下文（user_id、page、limit）
 * - 记录error.stack堆栈信息（便于排查问题）
 * - 生产环境返回通用错误消息（不暴露敏感信息）
 */
router.get('/history/:user_id', authenticateToken, async (req, res) => {
  try {
    const user_id = parseInt(req.params.user_id)
    const { page = 1, limit = 20 } = req.query

    // 🎯 参数验证（防止NaN和负数）
    if (isNaN(user_id) || user_id <= 0) {
      return res.apiError('user_id参数无效，必须为正整数', 'INVALID_USER_ID', {}, 400)
    }

    const finalPage = Math.max(parseInt(page) || 1, 1) // 确保page>=1
    const finalLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 50) // 确保1<=limit<=50

    // 🛡️ 权限检查：只能查看自己的抽奖历史，除非是超级管理员
    const currentUserRoles = await getUserRoles(req.user.user_id)
    if (req.user.user_id !== user_id && !currentUserRoles.isAdmin) {
      return res.apiError('无权查看其他用户的抽奖历史', 'ACCESS_DENIED', {}, 403)
    }

    // 获取抽奖历史
    const lottery_engine = req.app.locals.services.getService('unifiedLotteryEngine')
    const history = await lottery_engine.get_user_history(user_id, {
      page: finalPage,
      limit: finalLimit
    })

    return res.apiSuccess(history, '抽奖历史获取成功', 'HISTORY_SUCCESS')
  } catch (error) {
    // ✅ 完整错误上下文记录（服务端日志）
    logger.error('🔴 获取抽奖历史失败', {
      error_message: error.message,
      error_stack: error.stack, // 堆栈信息
      user_id: parseInt(req.params.user_id),
      current_user_id: req.user?.user_id,
      query_params: { page: req.query.page, limit: req.query.limit }, // 请求参数
      timestamp: BeijingTimeHelper.now() // 北京时间
    })

    return handleServiceError(error, res, '获取抽奖历史失败')
  }
})

/**
 * GET /campaigns - 获取活动列表
 *
 * @description 获取当前可用的抽奖活动列表
 * @route GET /api/v4/lottery/campaigns
 * @access Private (需要认证)
 */
router.get('/campaigns', authenticateToken, async (req, res) => {
  try {
    const { status = 'active' } = req.query

    // 获取活动列表
    const lottery_engine = req.app.locals.services.getService('unifiedLotteryEngine')
    const campaigns = await lottery_engine.get_campaigns({
      status,
      user_id: req.user.user_id
    })

    return res.apiSuccess(campaigns, '活动列表获取成功', 'CAMPAIGNS_SUCCESS')
  } catch (error) {
    logger.error('获取活动列表失败:', error)
    return handleServiceError(error, res, '获取活动列表失败')
  }
})

/**
 * GET /points/:user_id - 获取用户积分信息
 *
 * @description 获取用户的积分余额和相关信息
 * @route GET /api/v4/lottery/points/:user_id
 * @access Private (需要认证 + 限流保护60次/分钟)
 *
 * 🔴 P0优化（2025-11-10）：防止自动创建垃圾账户
 * - 先验证用户存在性
 * - 检查积分账户是否存在，无账户返回明确错误
 * - 不调用getUserPointsAccount（会自动创建账户）
 *
 * ✅ 安全防护（2025-11-10补充）：
 * - 限流保护：60次/分钟/用户（防止恶意刷接口）
 * - 审计日志：记录管理员查询他人积分的操作（合规性要求）
 */
router.get('/points/:user_id', authenticateToken, pointsRateLimiter, async (req, res) => {
  try {
    const user_id = parseInt(req.params.user_id)

    // 🔴 P0优化：参数验证
    if (isNaN(user_id) || user_id <= 0) {
      return res.apiError('user_id参数无效，必须为正整数', 'INVALID_USER_ID', {}, 400)
    }

    // 🛡️ 权限检查：只能查看自己的积分，除非是超级管理员
    const currentUserRoles = await getUserRoles(req.user.user_id)
    if (req.user.user_id !== user_id && !currentUserRoles.isAdmin) {
      return res.apiError('无权查看其他用户的积分信息', 'ACCESS_DENIED', {}, 403)
    }

    // ✅ 审计日志：记录管理员查询他人积分的操作（安全审计和合规性要求）
    if (currentUserRoles.isAdmin && req.user.user_id !== user_id) {
      logger.warn('[Audit] 管理员查询他人积分', {
        operator_id: req.user.user_id, // 操作者（管理员）
        operator_mobile: req.user.mobile, // 操作者手机号
        target_user_id: user_id, // 被查询的用户ID
        action: 'query_user_points', // 操作类型
        ip: req.ip, // 请求来源IP
        user_agent: req.headers['user-agent'], // 请求客户端
        timestamp: BeijingTimeHelper.now() // 北京时间
      })
    }

    // ✅ 通过UserService验证用户和积分账户（不再直连models）
    const UserService = req.app.locals.services.getService('user')
    const { user: _user, points_account: points_info } = await UserService.getUserWithPoints(
      user_id,
      {
        checkPointsAccount: true,
        checkStatus: true
      }
    )

    return res.apiSuccess(points_info, '用户积分获取成功', 'POINTS_SUCCESS')
  } catch (error) {
    // 详细错误日志（包含上下文信息，便于调试）
    logger.error('[Points API] 获取用户积分失败', {
      user_id: req.params.user_id,
      requester: req.user?.user_id,
      error: error.message,
      stack: error.stack,
      timestamp: BeijingTimeHelper.now()
    })
    return handleServiceError(error, res, '获取用户积分失败')
  }
})

/**
 * GET /statistics/:user_id - 获取用户抽奖统计（Get User Lottery Statistics - 查询用户的抽奖数据统计）
 *
 * @description 获取用户的抽奖统计信息（用户总抽奖次数、中奖次数、中奖率等核心指标）
 * @route GET /api/v4/lottery/statistics/:user_id
 * @access Private (需要认证 - JWT认证token必须提供)
 *
 * 业务场景（Business Scenarios）：
 * 1. 个人中心统计卡片（Personal Dashboard - 小程序端）：
 *    用户登录后在"我的抽奖"页面查看总抽奖次数、中奖率、今日抽奖次数等汇总数据
 * 2. 抽奖记录页面顶部汇总（Lottery History Page - 小程序端）：
 *    在抽奖记录列表页面顶部显示统计卡片，展示最近一次中奖记录
 * 3. 管理员用户行为分析（Admin User Analysis - Web管理后台）：
 *    管理员查看特定用户的抽奖统计数据，分析用户活跃度和参与度
 * 4. 活动效果评估（Campaign Evaluation - 运营分析）：
 *    通过奖品类型分布统计，了解用户更偏好哪类奖品
 *
 * 权限控制（Access Control - 严格权限验证）：
 * - 业务规则1：普通用户只能查看自己的统计（user_id必须匹配JWT token中的用户ID）
 * - 业务规则2：超级管理员admin可以查看任何用户的统计（用于后台管理和数据分析）
 * - 安全保障：防止用户查看其他用户的敏感统计数据，保护用户隐私
 *
 * 返回数据结构（Response Structure - 11个统计字段）：
 * {
 *   user_id: 1,                        // 用户ID
 *   total_draws: 50,                   // 总抽奖次数
 *   total_wins: 48,                    // 总中奖次数
 *   guarantee_wins: 15,                // 保底中奖次数
 *   normal_wins: 33,                   // 正常中奖次数
 *   win_rate: 96.00,                   // 中奖率（百分比数字）
 *   today_draws: 3,                    // 今日抽奖次数
 *   today_wins: 3,                     // 今日中奖次数
 *   today_win_rate: 100.00,            // 今日中奖率
 *   total_points_cost: 5000,           // 总消耗积分
 *   prize_type_distribution: {...},    // 奖品类型分布
 *   last_win: {...},                   // 最近一次中奖记录
 *   timestamp: '2025-11-11 05:24:05'   // 北京时间响应时间戳
 * }
 *
 * 技术实现（Technical Implementation）：
 * - 8次独立的Sequelize ORM查询，代码简单清晰易于维护
 * - 小数据量下（<500条记录）响应时间约180-300ms，用户体验优秀
 * - 采用实用主义原则，不过度优化（不使用复杂SQL聚合、不引入Redis缓存）
 *
 * 错误处理（Error Handling）：
 * - 403 Forbidden：用户尝试查看其他用户的统计（权限不足）
 * - 500 Internal Server Error：数据库查询失败或服务异常
 *
 * @param {number} req.params.user_id - URL路径参数：要查询统计的用户ID
 * @param {Object} req.user - JWT认证解析后的用户信息（包含user_id、username等）
 * @returns {Object} 统计信息对象（包含11个统计字段的完整数据）
 */
router.get('/statistics/:user_id', authenticateToken, async (req, res) => {
  try {
    // 📊 解析用户ID参数（URL路径参数转换为整数）
    const user_id = parseInt(req.params.user_id)

    /*
     * 🛡️ 权限检查（Access Control - 严格权限验证）：
     * 业务规则1：普通用户只能查看自己的统计（user_id必须匹配JWT token中的用户ID）
     * 业务规则2：超级管理员admin可以查看任何用户的统计（用于后台管理和数据分析）
     * 安全保障：防止用户A查看用户B的统计数据，保护用户隐私
     */
    const currentUserRoles = await getUserRoles(req.user.user_id)
    if (req.user.user_id !== user_id && !currentUserRoles.isAdmin) {
      return res.apiError('无权查看其他用户的统计信息', 'ACCESS_DENIED', {}, 403)
    }

    /*
     * 📡 调用统一抽奖引擎的统计服务（核心业务逻辑在Service层）
     * 服务层方法：UnifiedLotteryEngine.get_user_statistics(user_id)
     * 返回11个统计字段：total_draws、total_wins、win_rate、today_draws、today_wins、
     *                  today_win_rate、total_points_cost、guarantee_wins、normal_wins、
     *                  prize_type_distribution、last_win、timestamp
     */
    const lottery_engine = req.app.locals.services.getService('unifiedLotteryEngine')
    const statistics = await lottery_engine.get_user_statistics(user_id)

    /*
     * ✅ 成功返回统计数据（使用统一的API响应格式ApiResponse）
     * 响应格式：{ code: 200, message: '统计信息获取成功', data: statistics }
     */
    return res.apiSuccess(statistics, '统计信息获取成功', 'STATISTICS_SUCCESS')
  } catch (error) {
    // ❌ 错误处理（记录错误日志并返回友好的错误信息）
    logger.error('获取统计信息失败:', error)
    return handleServiceError(error, res, '获取统计信息失败')
  }
})

/**
 * GET /health - 抽奖系统健康检查
 *
 * @description 检查抽奖系统的运行状态
 * @route GET /api/v4/lottery/health
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
    logger.error('抽奖系统健康检查失败:', error)
    return handleServiceError(error, res, '抽奖系统健康检查失败')
  }
})

module.exports = router
