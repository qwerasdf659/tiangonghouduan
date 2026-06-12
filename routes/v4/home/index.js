/**
 * 首页 BFF 聚合路由（治理项2 / 方案D：首屏削峰）
 *
 * 顶层路径：/api/v4/home
 *
 * 业务背景（限流议题A·治理项2）：
 * - 微信小程序冷启动首页时，前端原本并行发起多个公开只读请求
 *   （活动列表 + 活动位置配置 + 版本闸门），同一秒挤在一起，容易触发 IP 维度的 429。
 * - 本接口把"首屏必需的多个公开只读数据"一次性聚合返回，前端冷启动从"多请求"变"单请求"，
 *   从源头消除瞬时并发峰值（对标腾讯/字节首屏 BFF 聚合）。
 *
 * 架构规范（严格遵守，零重写业务逻辑）：
 * - 仅"聚合"现有读服务，不复制/重写任何查询逻辑：
 *   · 活动列表   → lottery_query.getActiveCampaigns()（与 GET /lottery/campaigns/active 同源、同字段映射）
 *   · 位置配置   → admin_system.getConfigValue('campaign_placement')（与 GET /system/config/placement 同源）
 *   · 版本闸门   → admin_system.getConfigValue('app_version_gate')（与 GET /system/app-version 同源）
 * - 薄路由 + 组合，路由不直连 models，全部通过 ServiceManager 取 Service。
 * - 公开只读：用 optionalAuth（登录/匿名都可），挂 public_read 限流宽松档（与被聚合的 3 个接口一致）。
 * - 不下发公告（announcement）：公告走 ad-delivery，依赖登录态 + 竞价（user_id），不适合匿名首屏聚合，前端登录后单独取。
 *
 * 适用区域：中国（北京时间 Asia/Shanghai）
 */

'use strict'

const express = require('express')
const router = express.Router()
const { optionalAuth } = require('../../../middleware/auth')
const { asyncHandler } = require('../../../middleware/validation')
const { getRateLimiter } = require('../../../middleware/RateLimiterMiddleware')

// 公开只读宽松限流档（与被聚合的 campaigns/active、config、app-version 同档，阈值读 .env RATE_LIMIT_PUBLIC_READ_MAX）
const publicReadRateLimiter = getRateLimiter().createLimiter('public_read')

/**
 * 版本闸门默认值（配置缺失时的安全兜底，与 routes/v4/system/app-version.js 的 DEFAULTS 语义一致）
 *
 * 设计原则：缺省绝不拦截，避免误伤正常用户。
 * @constant {Object}
 */
const APP_VERSION_DEFAULTS = {
  latest_version: null, // 最新版本号（用于提示"有新版本"，非强制）
  min_version: '0.0.0', // 最低可用版本号（低于此版本才可能被拦截）
  force_update: false, // 是否强制更新（仅为 true 且低于 min_version 时拦截）
  update_message: '检测到新版本，请更新后继续使用', // 拦截时展示文案
  platform: 'miniprogram' // 适用平台标识
}

/**
 * 将活动实体映射为前端契约字段（与 GET /lottery/campaigns/active 完全一致，保证前端零改动）
 *
 * @param {Object} campaign - 活动实体（lottery_query.getActiveCampaigns 返回项）
 * @returns {Object} 前端契约结构
 */
function mapCampaignForListing(campaign) {
  return {
    campaign_code: campaign.campaign_code,
    campaign_name: campaign.campaign_name,
    campaign_type: campaign.campaign_type,
    status: campaign.status,
    display: {
      mode: campaign.display_mode || 'grid_3x3',
      effect_theme: campaign.effect_theme || null
    },
    start_time: campaign.start_time,
    end_time: campaign.end_time,
    is_featured: !!campaign.is_featured,
    display_tags: campaign.display_tags || [],
    display_start_time: campaign.display_start_time || null,
    display_end_time: campaign.display_end_time || null
  }
}

/**
 * @route GET /api/v4/home/bootstrap
 * @desc 首屏聚合：一次性返回活动列表 + 位置配置 + 版本闸门（公开只读，冷启动削峰）
 * @access Public（optionalAuth：登录/匿名均可）
 *
 * @returns {Object} data.campaigns - 活动列表（结构同 GET /lottery/campaigns/active）
 * @returns {Object} data.placement - 活动位置配置（{ placements, version, updated_at }，同 /system/config/placement）
 * @returns {Object} data.app_version - 版本闸门配置（同 /system/app-version）
 * @returns {string} data.server_time - 服务端北京时间
 */
router.get(
  '/bootstrap',
  publicReadRateLimiter,
  optionalAuth,
  asyncHandler(async (req, res) => {
    const LotteryQueryService = req.app.locals.services.getService('lottery_query')
    const AdminSystemService = req.app.locals.services.getService('admin_system')
    const BeijingTimeHelper = require('../../../utils/timeHelper')

    /*
     * 并行聚合 3 个公开只读数据源（各自内部已有 Redis 缓存，聚合层不再加缓存，避免双层缓存一致性问题）。
     * 用 allSettled：任一子项失败不拖垮整个首屏，缺失项返回安全兜底（前端首屏绝不白屏）。
     */
    const [campaignsResult, placementResult, appVersionResult] = await Promise.allSettled([
      LotteryQueryService.getActiveCampaigns(),
      AdminSystemService.getConfigWithMeta('campaign_placement'),
      AdminSystemService.getConfigValue('app_version_gate')
    ])

    // 1. 活动列表（失败兜底空数组）
    const campaigns =
      campaignsResult.status === 'fulfilled' && Array.isArray(campaignsResult.value)
        ? campaignsResult.value.map(mapCampaignForListing)
        : []

    // 2. 位置配置（失败/缺失兜底空 placements；version 取行 updated_at，与 /system/config/placement 一致、稳定不漂移）
    let placement = { placements: [], version: '0', updated_at: null }
    if (placementResult.status === 'fulfilled' && placementResult.value?.value) {
      const cfg = placementResult.value.value
      const updatedAt = placementResult.value.updated_at
      placement = {
        placements: cfg.placements || [],
        version: updatedAt ? new Date(updatedAt).getTime().toString() : '0',
        updated_at: updatedAt || null
      }
    }

    // 3. 版本闸门（合并默认值，缺字段由 DEFAULTS 兜底）
    const appVersionCfg =
      appVersionResult.status === 'fulfilled' && appVersionResult.value
        ? appVersionResult.value
        : {}
    const app_version = { ...APP_VERSION_DEFAULTS, ...appVersionCfg }

    return res.apiSuccess(
      {
        campaigns,
        placement,
        app_version,
        server_time: BeijingTimeHelper.now()
      },
      '获取首屏聚合数据成功',
      'HOME_BOOTSTRAP_SUCCESS'
    )
  })
)

module.exports = router
