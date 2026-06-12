/**
 * 小程序版本闸门路由
 *
 * 路由前缀：/api/v4/system
 *
 * 功能：
 * - 获取小程序版本闸门配置（公开接口，无需登录）
 *
 * 业务场景：
 * - 小程序 onLaunch 时调用本接口，拿到 min_version / latest_version / force_update
 * - 当前版本低于 min_version 且 force_update=true 时，小程序拦截到更新页
 * - 接口报错/超时/force_update!==true/缺 min_version 时，小程序一律放行（绝不误拦）
 *
 * 配置存储（以后端真实表为准）：
 * - 复用既有"自由 JSON 配置"通道，配置落 system_settings 表
 * - setting_key = 'app_version_gate'，value_type = 'json'，category = 'feature'
 * - 经 AdminSystemService.getConfigValue('app_version_gate') 读取（自带 Redis 缓存 300s TTL）
 * - 与只读的 basic/system_version 解耦：闸门用独立 key，不动 system_version
 *
 * 安全说明：
 * - 版本闸门配置不含敏感信息（仅版本号、强更开关、提示文案）
 * - 公开接口，无需 authenticateToken 中间件
 * - 维护模式下仍可读（已加入 middleware/maintenanceMode.js 的 BYPASS_PREFIXES）
 *
 * @date 2026-06-02
 */

'use strict'

const express = require('express')
const router = express.Router()
const { asyncHandler } = require('../../../middleware/validation')
const { getRateLimiter } = require('../../../middleware/RateLimiterMiddleware')

// 公开只读接口宽松限流档（A1/A2：阈值读 .env RATE_LIMIT_PUBLIC_READ_MAX）；版本闸门为公开只读接口
router.use(getRateLimiter().createLimiter('public_read'))

/**
 * 版本闸门默认值（配置缺失时的安全兜底）
 *
 * 设计原则：缺省绝不拦截，避免误伤正常用户
 * - latest_version: null   → 无"最新版"信息，前端不提示
 * - min_version: '0.0.0'   → 最低版本为 0，任何版本都不低于它（永不强更）
 * - force_update: false    → 强更开关默认关闭
 *
 * @constant {Object}
 */
const DEFAULTS = {
  latest_version: null, // 最新版本号（用于提示"有新版本"，非强制）
  min_version: '0.0.0', // 最低可用版本号（低于此版本才可能被拦截）
  force_update: false, // 是否强制更新（仅为 true 且低于 min_version 时拦截）
  update_message: '检测到新版本，请更新后继续使用', // 拦截时展示文案
  platform: 'miniprogram' // 适用平台标识
}

/**
 * @route GET /api/v4/system/app-version
 * @desc 获取小程序版本闸门配置 - 公开接口（无需登录）
 * @access Public
 *
 * @returns {Object} 版本闸门配置
 * @returns {string|null} data.latest_version - 最新版本号
 * @returns {string} data.min_version - 最低可用版本号
 * @returns {boolean} data.force_update - 是否强制更新
 * @returns {string} data.update_message - 强更提示文案
 * @returns {string} data.platform - 适用平台（miniprogram）
 *
 * @example
 * GET /api/v4/system/app-version
 * → { success: true, code: 'APP_VERSION_SUCCESS',
 *     data: { latest_version: '5.2.0', min_version: '0.0.0', force_update: false, ... } }
 */
router.get(
  '/app-version',
  asyncHandler(async (req, res) => {
    const AdminSystemService = req.app.locals.services.getService('admin_system')
    const cfg = await AdminSystemService.getConfigValue('app_version_gate')

    /* 合并默认值：DB 配置缺字段时由 DEFAULTS 兜底，确保前端拿到完整结构 */
    const data = { ...DEFAULTS, ...(cfg || {}) }

    return res.apiSuccess(data, '获取版本闸门配置成功', 'APP_VERSION_SUCCESS')
  })
)

module.exports = router
