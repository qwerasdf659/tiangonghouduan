/**
 * Admin模块主入口
 *
 * @description 聚合所有admin子模块，提供统一的路由入口
 * @version 4.0.0
 * @date 2025-09-24
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

/**
 * GET / - Admin API根路径信息
 *
 * @description 返回Admin API的基本信息和可用模块
 * @route GET /api/v4/admin/
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
      }
      // ⚠️ campaign_permissions模块暂未实现，待实现后再添加到此列表
    },
    documentation: '请参考各模块的API文档',
    timestamp: BeijingTimeHelper.apiTimestamp() // 统一使用apiTimestamp格式：2025-11-08 17:32:07
  }

  res.apiSuccess(adminInfo, 'Admin API模块信息')
})

module.exports = router
