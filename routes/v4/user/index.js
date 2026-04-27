/**
 * user域 - 用户中心业务域聚合
 *
 * 顶层路径：/api/v4/user
 * 内部目录：routes/v4/user/
 *
 * 职责：
 * - 用户个人信息管理
 * - 用户设置
 * - 用户数据查询（/me端点）
 * - 消费二维码生成
 *
 * 📌 遵循规范：
 * - 用户端禁止/:id参数（使用/me端点）
 * - 用户只能操作自己的数据
 *
 * 📌 说明：
 * - 用户profile相关功能在/auth域的/profile端点
 * - 本域主要提供用户中心的扩展功能
 *
 * 适用区域：中国（北京时间 Asia/Shanghai）
 */

const { asyncHandler } = require('../../../middleware/validation')
const express = require('express')
const router = express.Router()
const { authenticateToken } = require('../../../middleware/auth')
// 🔐 P0-1修复：导入手机号脱敏函数
const { sanitize } = require('../../../utils/logger')

// 消费二维码路由
const consumptionQrcodeRoutes = require('./consumption-qrcode')

// 广告系统路由（Phase 3: 广告主自助投放）
const adCampaignsRoutes = require('./ad-campaigns')
const adSlotsRoutes = require('./ad-slots')

// 用户通知路由（方案B：通知系统独立化，2026-02-24）
const notificationsRoutes = require('./notifications')

// 广告定价预览路由（Need 2: 用户端复用 AdPricingService 查询广告位定价）
const adPricingRoutes = require('./ad-pricing')

// 用户端图片上传路由（广告主上传广告素材，与管理端 console/images 权限隔离）
const userImagesRoutes = require('./images')

// 用户收货地址管理路由（DIY 实物兑换、奖品发货等场景）
const addressesRoutes = require('./addresses')

/**
 * GET /api/v4/user/me
 * @desc 获取当前用户基本信息（通过token识别）
 * @access Private
 *
 * 📌 说明：完整用户信息请使用 /api/v4/auth/profile
 *
 * 🔐 安全说明（P0-1）：
 * - mobile 字段已脱敏处理（前3后4，中间****）
 * - 符合《个人信息保护法》第51条、《网络安全法》第42条
 */
router.get(
  '/me',
  authenticateToken,
  asyncHandler(async (req, res) => {
    // 从token获取用户信息
    const userInfo = {
      user_uuid: req.user.user_uuid,
      // 🔐 P0-1修复：手机号脱敏（136****7930）
      mobile: sanitize.mobile(req.user.mobile),
      nickname: req.user.nickname,
      status: req.user.status
    }

    return res.apiSuccess(userInfo, '获取用户信息成功')
  })
)

// 消费二维码（用户生成码供商家扫描）
router.use('/consumption', authenticateToken, consumptionQrcodeRoutes)

// 挂载广告位查询路由（Phase 3 广告主自助投放 - 用户端只读查询）
router.use('/ad-slots', adSlotsRoutes)

// 挂载广告计划管理路由（Phase 3 广告主自助投放）
router.use('/ad-campaigns', adCampaignsRoutes)

// 挂载用户通知路由（方案B：通知系统独立化，/api/v4/user/notifications）
router.use('/notifications', authenticateToken, notificationsRoutes)

// 挂载广告定价预览路由（/api/v4/user/ad-pricing/preview）
router.use('/ad-pricing', adPricingRoutes)

// 挂载用户端图片上传路由（/api/v4/user/images/upload）
router.use('/images', userImagesRoutes)

// 挂载用户收货地址路由（/api/v4/user/addresses）
router.use('/addresses', authenticateToken, addressesRoutes)

module.exports = router
