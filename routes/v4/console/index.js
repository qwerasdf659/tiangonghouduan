/**
 * Console控制台模块主入口（从 Admin 迁移）
 *
 * @description 聚合所有console子模块，提供统一的路由入口
 * @version 4.0.0
 * @date 2026-01-07（架构重构 - admin → console）
 */

const BeijingTimeHelper = require('../../../utils/timeHelper')
const express = require('express')
const router = express.Router()

// 导入所有子模块
const authRoutes = require('./auth')
const systemRoutes = require('./system') // 模块化重构：拆分为子模块目录
const configRoutes = require('./config')
const settingsRoutes = require('./settings') // 🆕 系统设置管理
const prizePoolRoutes = require('./prize_pool')
const userManagementRoutes = require('./user_management')
const lotteryManagementRoutes = require('./lottery-management') // 模块化重构：拆分为子模块
const analyticsRoutes = require('./analytics')
const customerServiceRoutes = require('./customer-service') // 模块化重构：拆分为子模块
const marketplaceRoutes = require('./marketplace') // 🆕 市场统计管理
const materialRoutes = require('./material') // 🆕 材料系统管理（V4.5.0）
const popupBannersRoutes = require('./popup-banners') // 🆕 弹窗Banner管理（2025-12-22）
const lotteryQuotaRoutes = require('./lottery-quota') // 🆕 抽奖配额管理（2025-12-23）
const assetAdjustmentRoutes = require('./asset-adjustment') // 🆕 资产调整管理（2025-12-30）
const campaignBudgetRoutes = require('./campaign-budget') // 🆕 活动预算管理（2026-01-03 BUDGET_POINTS架构）
const assetsRoutes = require('./assets') // 🆕 后台运营资产中心（2026-01-07 架构重构）
const imagesRoutes = require('./images') // 🆕 通用图片上传（2026-01-08 图片存储架构）
const orphanFrozenRoutes = require('./orphan-frozen') // 🆕 孤儿冻结清理（P0-2 2026-01-09）
const merchantPointsRoutes = require('./merchant-points') // 🆕 商家积分审核管理（P1 2026-01-09）

// 挂载子模块路由
router.use('/auth', authRoutes)
router.use('/system', systemRoutes)
router.use('/config', configRoutes)
router.use(settingsRoutes) // 🆕 系统设置路由（挂载到根路径，使/admin/settings/:category可直接访问）
router.use('/prize-pool', prizePoolRoutes)
router.use('/user-management', userManagementRoutes)
router.use('/lottery-management', lotteryManagementRoutes)
router.use('/analytics', analyticsRoutes)
router.use('/customer-service', customerServiceRoutes) // 🆕 客服管理路由
router.use('/marketplace', marketplaceRoutes) // 🆕 市场统计路由
router.use('/material', materialRoutes) // 🆕 材料系统管理路由（V4.5.0）
router.use('/popup-banners', popupBannersRoutes) // 🆕 弹窗Banner管理路由（2025-12-22）
router.use('/lottery-quota', lotteryQuotaRoutes) // 🆕 抽奖配额管理路由（2025-12-23）
router.use('/asset-adjustment', assetAdjustmentRoutes) // 🆕 资产调整管理路由（2025-12-30）
router.use('/campaign-budget', campaignBudgetRoutes) // 🆕 活动预算管理路由（2026-01-03 BUDGET_POINTS架构）
router.use('/assets', assetsRoutes) // 🆕 后台运营资产中心路由（2026-01-07 架构重构）
router.use('/images', imagesRoutes) // 🆕 通用图片上传路由（2026-01-08 图片存储架构）
router.use('/orphan-frozen', orphanFrozenRoutes) // 🆕 孤儿冻结清理路由（P0-2 2026-01-09）
router.use('/merchant-points', merchantPointsRoutes) // 🆕 商家积分审核管理路由（P1 2026-01-09）

/**
 * GET / - Admin API根路径信息
 *
 * @description 返回Admin API的基本信息和可用模块
 * @route GET /api/v4/console/
 * @access Public
 */
/**
 * ⚠️ 重要提醒：添加新模块时必须同步更新modules对象
 *
 * 更新步骤:
 * 1. 在admin/目录创建新路由文件（如new_module.js）
 * 2. 在本文件引入并挂载路由（router.use('/new-module', newModuleRoutes)）
 * 3. 在下方modules对象添加模块信息
 * 4. 运行测试验证: npm test（确保单元测试通过）
 */
router.get('/', (req, res) => {
  const adminInfo = {
    name: 'Admin API v4.0',
    description: '统一决策引擎管理员API',
    version: '4.0.0',
    modules: {
      auth: {
        description: '管理员认证',
        endpoints: ['/auth']
      },
      system: {
        description: '系统监控',
        endpoints: ['/status', '/dashboard', '/management-status']
      },
      config: {
        description: '配置管理',
        endpoints: ['/config', '/test/simulate']
      },
      settings: {
        description: '系统设置管理（运营配置）',
        endpoints: [
          '/settings',
          '/settings/basic',
          '/settings/points',
          '/settings/notification',
          '/settings/security',
          '/cache/clear'
        ],
        note: '抽奖算法配置在 /config/business.config.js 中管理'
      },
      prize_pool: {
        description: '奖品池管理',
        endpoints: [
          '/prize-pool/batch-add',
          '/prize-pool/:campaign_id',
          '/prize-pool/prize/:prize_id'
        ]
      },
      user_management: {
        description: '用户管理',
        endpoints: ['/users', '/points/adjust']
      },
      lottery_management: {
        description: '抽奖管理',
        endpoints: [
          '/force-win',
          '/force-lose',
          '/probability-adjust',
          '/user-specific-queue',
          '/user-status/:user_id',
          '/clear-user-settings/:user_id'
        ]
      },
      analytics: {
        description: '数据分析',
        endpoints: ['/decisions/analytics', '/lottery/trends', '/performance/report']
      },
      customer_service: {
        description: '客服管理',
        endpoints: [
          '/sessions',
          '/sessions/stats',
          '/sessions/:id/messages',
          '/sessions/:id/send',
          '/sessions/:id/mark-read',
          '/sessions/:id/transfer',
          '/sessions/:id/close'
        ]
      },
      marketplace: {
        description: '市场统计管理',
        endpoints: ['/marketplace/listing-stats']
      },
      material: {
        description: '材料系统管理（V4.5.0）',
        endpoints: [
          '/material/asset-types',
          '/material/conversion-rules',
          '/material/users/:user_id/balance',
          '/material/users/:user_id/adjust',
          '/material/transactions'
        ],
        note: '材料资产类型管理、转换规则管理、用户余额查询/调整、材料流水查询'
      },
      diamond: {
        description: '钻石系统管理（V4.5.0）',
        endpoints: [
          '/diamond/users/:user_id/balance',
          '/diamond/users/:user_id/adjust',
          '/diamond/transactions'
        ],
        note: '用户钻石余额查询/调整、钻石流水查询'
      },
      popup_banners: {
        description: '弹窗Banner管理（2025-12-22）',
        endpoints: [
          '/popup-banners',
          '/popup-banners/statistics',
          '/popup-banners/:id',
          '/popup-banners/:id/toggle',
          '/popup-banners/order'
        ],
        note: '首页弹窗图片管理、支持Sealos图片上传、时间范围控制、点击跳转'
      },
      lottery_quota: {
        description: '抽奖配额管理（2025-12-23）',
        endpoints: [
          '/lottery-quota/rules',
          '/lottery-quota/rules/:rule_id/disable',
          '/lottery-quota/users/:user_id/status',
          '/lottery-quota/users/:user_id/bonus',
          '/lottery-quota/users/:user_id/check'
        ],
        note: '四维度配额规则（全局/活动/角色/用户）、客服临时加次数、原子扣减'
      },
      asset_adjustment: {
        description: '资产调整管理（2025-12-30）',
        endpoints: [
          '/asset-adjustment/adjust',
          '/asset-adjustment/batch-adjust',
          '/asset-adjustment/user/:user_id/balances'
        ],
        note: '管理员调整用户积分、预算积分、钻石等资产，支持批量操作和幂等控制'
      },
      campaign_budget: {
        description: '活动预算管理（2026-01-03 BUDGET_POINTS架构）',
        endpoints: [
          '/campaign-budget/campaigns/:campaign_id',
          '/campaign-budget/campaigns/:campaign_id/validate',
          '/campaign-budget/campaigns/:campaign_id/pool/add',
          '/campaign-budget/campaigns/:campaign_id/budget-status',
          '/campaign-budget/users/:user_id'
        ],
        note: '活动预算配置（budget_mode）、空奖约束验证、活动池预算补充、用户BUDGET_POINTS查询'
      },
      assets: {
        description: '后台运营资产中心（2026-01-07 架构重构）',
        endpoints: [
          '/assets/portfolio',
          '/assets/portfolio/items',
          '/assets/portfolio/items/:id',
          '/assets/item-events'
        ],
        note: '资产总览、物品列表、物品详情、物品事件历史；权限要求：admin（可写）或 ops（只读）'
      },
      images: {
        description: '通用图片上传（2026-01-08 图片存储架构）',
        endpoints: [
          '/images/upload',
          '/images/:image_id',
          '/images',
          '/images/:image_id/bind',
          '/images/:image_id (DELETE)'
        ],
        note: '统一图片上传接口，存储到 Sealos 对象存储，返回 image_id + CDN URL；支持 lottery/exchange/trade/uploads 业务类型'
      },
      orphan_frozen: {
        description: '孤儿冻结清理（P0-2 2026-01-09）',
        endpoints: ['/orphan-frozen/detect', '/orphan-frozen/stats', '/orphan-frozen/cleanup'],
        note: '检测和清理孤儿冻结（frozen_amount > 活跃挂牌冻结），唯一入口设计，支持干跑模式'
      },
      merchant_points: {
        description: '商家积分审核管理（P1 2026-01-09）',
        endpoints: [
          '/merchant-points',
          '/merchant-points/:audit_id',
          '/merchant-points/:audit_id/approve',
          '/merchant-points/:audit_id/reject',
          '/merchant-points/stats/pending'
        ],
        note: '商家积分申请审核管理，基于统一审核引擎（ContentAuditEngine），审核通过后自动发放积分'
      }
      // ⚠️ campaign_permissions模块暂未实现，待实现后再添加到此列表
    },
    documentation: '请参考各模块的API文档',
    timestamp: BeijingTimeHelper.apiTimestamp() // 统一使用apiTimestamp格式：2025-11-08 17:32:07
  }

  res.apiSuccess(adminInfo, 'Admin API模块信息')
})

module.exports = router
