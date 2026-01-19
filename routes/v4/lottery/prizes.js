/**
 * 餐厅积分抽奖系统 V4.0 - 奖品和配置API路由
 *
 * 功能：
 * - 获取抽奖奖品列表（已脱敏）
 * - 获取抽奖配置
 *
 * 路由前缀：/api/v4/lottery
 *
 * 创建时间：2025年12月22日
 */

const express = require('express')
const router = express.Router()
const logger = require('../../../utils/logger').logger
const { authenticateToken } = require('../../../middleware/auth')
const dataAccessControl = require('../../../middleware/dataAccessControl')
const { handleServiceError } = require('../../../middleware/validation')
/*
 * P1-9：服务通过 ServiceManager 获取（B1-Injected + E2-Strict snake_case）
 * const DataSanitizer = require('../../../services/DataSanitizer')
 */

/**
 * @route GET /api/v4/lottery/prizes/:campaignCode
 * @desc 获取抽奖奖品列表 - 已应用数据脱敏
 * @access Private
 *
 * @param {string} campaignCode - 活动代码
 *
 * @returns {Object} 奖品列表（已脱敏，隐藏概率和库存）
 *
 * 安全措施：
 * - 使用campaign_code标识符（防止ID遍历攻击）
 * - 数据脱敏处理（隐藏概率、库存等敏感信息）
 */
router.get('/prizes/:campaignCode', authenticateToken, dataAccessControl, async (req, res) => {
  try {
    // P1-9：通过 ServiceManager 获取服务（snake_case key）
    const DataSanitizer = req.app.locals.services.getService('data_sanitizer')

    const campaign_code = req.params.campaignCode

    // 🔥 参数校验增强
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
    const lottery_engine = req.app.locals.services.getService('unified_lottery_engine')
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
 * @route GET /api/v4/lottery/config/:campaignCode
 * @desc 获取抽奖配置 - 已应用数据脱敏
 * @access Private
 *
 * @param {string} campaignCode - 活动代码
 *
 * @returns {Object} 抽奖配置信息
 *
 * 安全措施：
 * - 普通用户仅返回脱敏后的公开配置
 * - 管理员返回完整配置（含警告信息）
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
    const lottery_engine = req.app.locals.services.getService('unified_lottery_engine')
    const campaign = await lottery_engine.getCampaignByCode(campaign_code)

    // 使用campaign.campaign_id获取完整配置（内部仍用ID）
    const fullConfig = await lottery_engine.get_campaign_config(campaign.campaign_id)

    /*
     * 🔴 从 lottery_campaign_pricing_config 表读取定价配置
     *
     * 配置来源优先级（Phase 3 已拍板 2026-01-19）：
     * 1. lottery_campaign_pricing_config 表（活动级版本化配置，优先）
     * 2. campaign.prize_distribution_config.draw_pricing（降级兼容）
     * 3. 系统默认配置（最终兜底）
     */
    const { LotteryCampaignPricingConfig } = require('../../../models')
    const AdminSystemService = req.app.locals.services.getService('admin_system')

    // 读取单抽价格（严格模式：配置缺失直接报错）
    const singleDrawCost = await AdminSystemService.getSettingValue(
      'points',
      'lottery_cost_points',
      null,
      { strict: true }
    )

    // 尝试从 pricing_config 表读取配置
    let drawPricing = null
    let isConfigMissing = true

    try {
      const pricingConfig = await LotteryCampaignPricingConfig.getActivePricingConfig(
        campaign.campaign_id
      )
      if (pricingConfig && pricingConfig.pricing_config) {
        // 从新表获取配置
        const discountTiers = pricingConfig.pricing_config.discount_tiers || []
        if (discountTiers.length > 0) {
          drawPricing = {}
          discountTiers.forEach(tier => {
            if (tier.enabled !== false) {
              const key =
                tier.count === 1
                  ? 'single'
                  : tier.count === 3
                    ? 'triple'
                    : tier.count === 5
                      ? 'five'
                      : tier.count === 10
                        ? 'ten'
                        : `x${tier.count}`
              drawPricing[key] = {
                count: tier.count,
                discount: tier.discount || 1.0,
                label: tier.label || `${tier.count}连抽`,
                per_draw: Math.floor(singleDrawCost * (tier.discount || 1.0)),
                total_cost: Math.floor(singleDrawCost * tier.count * (tier.discount || 1.0))
              }
            }
          })
          isConfigMissing = false
        }
      }
    } catch (err) {
      logger.warn(`[CONFIG_WARN] 读取活动 ${campaign_code} 定价配置失败: ${err.message}`)
    }

    // 降级：使用活动JSON配置
    if (!drawPricing && campaign.prize_distribution_config?.draw_pricing) {
      drawPricing = campaign.prize_distribution_config.draw_pricing
      isConfigMissing = false
    }

    // 最终兜底：使用系统默认配置
    if (!drawPricing) {
      const defaultDiscounts = {
        single: { count: 1, discount: 1.0, label: '单抽' },
        triple: { count: 3, discount: 1.0, label: '3连抽' },
        five: { count: 5, discount: 1.0, label: '5连抽' },
        ten: { count: 10, discount: 0.9, label: '10连抽(九折)' }
      }
      drawPricing = {}
      for (const [type, config] of Object.entries(defaultDiscounts)) {
        drawPricing[type] = {
          count: config.count,
          discount: config.discount,
          label: config.label,
          per_draw: Math.floor(singleDrawCost * config.discount),
          total_cost: Math.floor(singleDrawCost * config.count * config.discount)
        }
      }
    }

    // 如果配置缺失，记录告警日志
    if (isConfigMissing) {
      logger.warn(`[CONFIG_WARN] 活动 ${campaign_code} 未配置自定义定价，使用 DB 默认配置`)
    }

    if (req.dataLevel === 'full') {
      // 管理员获取完整配置（返回campaign_code而不是campaign_id）
      const adminConfig = {
        ...fullConfig,
        campaign_code: campaign.campaign_code,
        draw_pricing: drawPricing // ✅ 添加定价配置（含降级保护）
      }

      // 如果配置缺失，在响应中添加警告信息（仅管理员可见）
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
        // ✅ 连抽定价信息（动态计算，确保100%业务连续性）
        draw_pricing: drawPricing
      }

      return res.apiSuccess(sanitizedConfig, '抽奖配置获取成功')
    }
  } catch (error) {
    logger.error('获取抽奖配置失败:', error)
    return handleServiceError(error, res, '获取抽奖配置失败')
  }
})

module.exports = router
