/**
 * 餐厅积分抽奖系统 V4.0 - 抽奖活动路由模块
 *
 * 路由前缀：/api/v4/lottery/campaigns
 *
 * 功能：
 * - 获取活动的奖品列表（已脱敏）
 * - 获取活动的抽奖配置
 *
 * API路径参数设计规范（V2.2）：
 * - 活动（campaign）是配置实体，使用业务码（:code）作为标识符
 * - 业务码格式：snake_case（如 spring_festival）
 *
 * 路由重构（2026-01-20）：
 * - /prizes/:campaignCode → /campaigns/:code/prizes
 * - /config/:campaignCode → /campaigns/:code/config
 *
 * 创建时间：2026年01月20日
 * 适用区域：中国（北京时间 Asia/Shanghai）
 */

const express = require('express')
const router = express.Router()
const logger = require('../../../utils/logger').logger
const { authenticateToken } = require('../../../middleware/auth')
const dataAccessControl = require('../../../middleware/dataAccessControl')
const { handleServiceError } = require('../../../middleware/validation')

/**
 * 获取抽奖定价服务（通过 ServiceManager 统一入口）
 * @param {Object} req - Express 请求对象
 * @returns {Object} LotteryPricingService 实例
 */
function getLotteryPricingService(req) {
  return req.app.locals.services.getService('lottery_pricing')
}

/**
 * 验证活动代码（业务码）格式
 *
 * @description 配置实体使用业务码作为标识符
 * 业务码格式规范：
 * - 字母开头，可包含字母、数字、下划线
 * - 长度限制：1-100 字符
 *
 * @param {string} code - 活动代码
 * @returns {Object} 验证结果对象，包含 valid 布尔值和可选的 error 对象
 */
function validateCampaignCode(code) {
  if (!code || typeof code !== 'string') {
    return { valid: false, error: { message: '缺少活动代码参数', code: 'MISSING_CAMPAIGN_CODE' } }
  }

  if (code.length > 100) {
    return { valid: false, error: { message: '活动代码过长', code: 'INVALID_CAMPAIGN_CODE' } }
  }

  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(code)) {
    return {
      valid: false,
      error: {
        message: '活动代码格式不正确，只允许字母开头、包含字母、数字和下划线',
        code: 'INVALID_CAMPAIGN_CODE'
      }
    }
  }

  return { valid: true }
}

/**
 * @route GET /api/v4/lottery/campaigns/active
 * @desc 获取所有进行中的活动列表（含 display 摘要）
 * @access Private
 *
 * @returns {Array} 进行中的活动列表
 *
 * 业务场景：
 * - 小程序前端需要展示多个同时进行的活动
 * - 返回活动基本信息 + display 展示配置摘要
 *
 * ⚠️ 路由顺序注意：此路由必须定义在 /:code/* 之前，
 * 否则 Express 会将 'active' 匹配为 :code 参数
 *
 * @see docs/后端与Web管理平台-对接需求总览.md Section 3.3 接口5
 */
router.get('/active', authenticateToken, async (req, res) => {
  try {
    const LotteryQueryService = req.app.locals.services.getService('lottery_query')

    // 查询所有进行中的活动（status='active' 且在有效期内）
    const activeCampaigns = await LotteryQueryService.getActiveCampaigns()

    // 构造响应数据：仅包含前端需要的字段
    const campaignList = activeCampaigns.map(campaign => ({
      campaign_code: campaign.campaign_code,
      campaign_name: campaign.campaign_name,
      campaign_type: campaign.campaign_type,
      status: campaign.status,
      display: {
        mode: campaign.display_mode || 'grid_3x3',
        effect_theme: campaign.effect_theme || null // null = 继承全局 app_theme
      },
      banner_image_url: campaign.banner_image_url || null,
      start_time: campaign.start_time,
      end_time: campaign.end_time
    }))

    return res.apiSuccess(campaignList, '获取活动列表成功', 'ACTIVE_CAMPAIGNS_SUCCESS')
  } catch (error) {
    logger.error('获取进行中活动列表失败:', error)
    return handleServiceError(error, res, '获取活动列表失败')
  }
})

/**
 * @route GET /api/v4/lottery/campaigns/:code/prizes
 * @desc 获取活动的奖品列表 - 已应用数据脱敏
 * @access Private
 *
 * @param {string} code - 活动代码（配置实体业务码）
 *
 * @returns {Object} 奖品列表（已脱敏，隐藏概率和库存）
 *
 * 安全措施：
 * - 使用 campaign_code 业务码标识符（配置实体标准）
 * - 数据脱敏处理（隐藏概率、库存等敏感信息）
 */
router.get('/:code/prizes', authenticateToken, dataAccessControl, async (req, res) => {
  try {
    // P1-9：通过 ServiceManager 获取服务（snake_case key）
    const DataSanitizer = req.app.locals.services.getService('data_sanitizer')

    const campaign_code = req.params.code

    // 参数校验（配置实体业务码）
    const validation = validateCampaignCode(campaign_code)
    if (!validation.valid) {
      return res.apiError(validation.error.message, validation.error.code, { campaign_code }, 400)
    }

    // 通过 LotteryQueryService 获取活动和奖品列表（读写分离架构）
    const LotteryQueryService = req.app.locals.services.getService('lottery_query')
    const { campaign: _campaign, prizes: fullPrizes } =
      await LotteryQueryService.getCampaignWithPrizes(campaign_code)

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
 * @route GET /api/v4/lottery/campaigns/:code/config
 * @desc 获取活动的抽奖配置 - 已应用数据脱敏
 * @access Private
 *
 * @param {string} code - 活动代码（配置实体业务码）
 *
 * @returns {Object} 抽奖配置信息
 *
 * 安全措施：
 * - 普通用户仅返回脱敏后的公开配置
 * - 管理员返回完整配置（含警告信息）
 */
router.get('/:code/config', authenticateToken, dataAccessControl, async (req, res) => {
  try {
    const campaign_code = req.params.code

    // 参数校验（配置实体业务码）
    const validation = validateCampaignCode(campaign_code)
    if (!validation.valid) {
      return res.apiError(validation.error.message, validation.error.code, { campaign_code }, 400)
    }

    // 通过 LotteryQueryService 获取活动配置（读写分离架构）
    const LotteryQueryService = req.app.locals.services.getService('lottery_query')
    const campaign = await LotteryQueryService.getCampaignByCode(campaign_code)

    // 使用 campaign.lottery_campaign_id 获取完整配置（内部仍用 ID）
    const fullConfig = await LotteryQueryService.getCampaignConfig(campaign.lottery_campaign_id)

    /*
     * 使用 LotteryPricingService 统一定价服务获取定价配置
     *
     * 🔴 2026-01-21 技术债务修复（完整实施）：
     * - 定价配置唯一来源：LotteryPricingService（内部读取 lottery_campaign_pricing_config 表）
     * - 消除代码重复：路由与 UnifiedLotteryEngine/PricingStage 共用同一服务
     * - 字段名统一：使用 draw_buttons（非旧的 discount_tiers）
     *
     * @see services/lottery/LotteryPricingService.js - 统一定价服务
     * @see docs/技术债务-getDrawPricing定价逻辑迁移方案.md 方案C
     */
    const LotteryPricingService = getLotteryPricingService(req)

    /**
     * 🔴 2026-01-26 技术债务清理：移除数组→对象格式转换兼容
     * 前端已更新使用数组格式 draw_buttons（非旧的 single/triple/five/ten 对象键名）
     */
    let drawButtons = []
    let isConfigMissing = false

    try {
      const pricings = await LotteryPricingService.getAllDrawPricings(campaign.lottery_campaign_id)

      if (pricings && pricings.length > 0) {
        // 直接返回数组格式，包含所有定价按钮
        drawButtons = pricings.map(pricing => ({
          draw_count: pricing.draw_count,
          discount: pricing.discount,
          label: pricing.label,
          per_draw: pricing.per_draw,
          total_cost: pricing.total_cost,
          original_cost: pricing.original_cost,
          saved_points: pricing.saved_points
        }))
      } else {
        isConfigMissing = true
        logger.warn(`[CONFIG_WARN] 活动 ${campaign_code} 定价服务返回空配置`)
      }
    } catch (err) {
      isConfigMissing = true
      logger.error(`[CONFIG_ERROR] 读取活动 ${campaign_code} 定价配置失败`, {
        error: err.message,
        code: err.code,
        lottery_campaign_id: campaign.lottery_campaign_id
      })
      // 配置缺失时抛出错误（严格模式）
      if (err.code === 'MISSING_PRICING_CONFIG' || err.code === 'MISSING_BASE_COST_CONFIG') {
        throw err
      }
    }

    // 如果配置缺失，记录告警日志
    if (isConfigMissing) {
      logger.warn(
        `[CONFIG_WARN] 活动 ${campaign_code} 定价配置异常，请检查 lottery_campaign_pricing_config 表`
      )
    }

    /**
     * 前端展示配置对象 - 从 campaign 模型读取展示配置字段
     * 前端根据此对象动态加载玩法组件、主题色、光效和动画
     * @see docs/后端与Web管理平台-对接需求总览.md Section 3.2 接口1
     */
    const displayConfig = {
      mode: campaign.display_mode || 'grid_3x3',
      grid_cols: campaign.grid_cols || 3,
      effect_theme: campaign.effect_theme || null, // null = 继承全局 app_theme
      rarity_effects_enabled: campaign.rarity_effects_enabled !== false,
      win_animation: campaign.win_animation || 'simple',
      background_image_url: campaign.background_image_url || null
    }

    /**
     * 保底进度信息（pity_info）
     *
     * 2026-02-25 B3 实施：
     * - 从 lottery_strategy_config 表 config_group='pity' 读取保底配置
     * - 登录用户额外返回 current_pity / remaining（从 lottery_user_experience_state 读取）
     * - 决策10（B方案）：字段名使用 pity_info（精确语义，代码自解释）
     * - 决策12（A方案）：config 接口内判断登录态，一次请求完成
     */
    let pityInfo = { exists: false, description: '连续抽奖有惊喜哦~' }

    try {
      const models = require('../../../models')
      const campaignId = campaign.lottery_campaign_id

      const pityConfig = await models.LotteryStrategyConfig.findAll({
        where: {
          lottery_campaign_id: campaignId,
          config_group: 'pity',
          is_active: true
        }
      })
      const pityMap = {}
      for (const c of pityConfig) {
        pityMap[c.config_key] = c.getParsedValue()
      }
      const pityEnabled = pityMap.enabled ?? false
      const hardGuaranteeThreshold = pityMap.hard_guarantee_threshold ?? 10

      if (pityEnabled) {
        pityInfo = {
          exists: true,
          pity_enabled: true,
          guarantee_threshold: hardGuaranteeThreshold,
          description: '连续抽奖有惊喜哦~'
        }

        if (req.user && req.user.user_id) {
          const experienceState = await models.LotteryUserExperienceState.findOrCreateState(
            req.user.user_id,
            campaign.lottery_campaign_id
          )
          const currentPity = experienceState.empty_streak || 0
          const remaining = Math.max(0, hardGuaranteeThreshold - currentPity)

          pityInfo.current_pity = currentPity
          pityInfo.remaining = remaining
          pityInfo.description =
            remaining > 0 ? `距离保底还有 ${remaining} 次` : '下次抽奖即触发保底！'
        }
      }
    } catch (pityError) {
      logger.warn('读取保底配置失败（降级返回默认值）:', {
        campaign_code,
        error: pityError.message
      })
    }

    if (req.dataLevel === 'full') {
      const adminConfig = {
        ...fullConfig,
        campaign_code: campaign.campaign_code,
        base_cost: drawButtons[0]?.original_cost ?? 0,
        per_draw_cost: drawButtons.find(b => b.draw_count === 1)?.per_draw ?? 0,
        pity_info: pityInfo,
        draw_buttons: drawButtons,
        display: displayConfig
      }

      const warningMessage = isConfigMissing
        ? '当前活动未配置自定义定价，正在使用系统默认定价'
        : null

      return res.apiSuccess(
        adminConfig,
        '抽奖配置获取成功',
        'CONFIG_SUCCESS',
        warningMessage ? { warning: warningMessage } : undefined
      )
    } else {
      const sanitizedConfig = {
        campaign_code: campaign.campaign_code,
        campaign_name: fullConfig.campaign_name,
        status: fullConfig.status,
        base_cost: drawButtons[0]?.original_cost ?? 0,
        per_draw_cost: drawButtons.find(b => b.draw_count === 1)?.per_draw ?? 0,
        max_draws_per_user_daily: fullConfig.max_draws_per_user_daily,
        pity_info: pityInfo,
        draw_buttons: drawButtons,
        display: displayConfig
      }

      return res.apiSuccess(sanitizedConfig, '抽奖配置获取成功')
    }
  } catch (error) {
    logger.error('获取抽奖配置失败:', error)
    return handleServiceError(error, res, '获取抽奖配置失败')
  }
})

module.exports = router
