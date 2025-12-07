/**
 * Admin模块主入口
 *
 * @description 聚合所有admin子模块，提供统一的路由入口
 * @version 4.0.0
 * @date 2025-09-24
 */

const BeijingTimeHelper = require('../../../../utils/timeHelper')
const express = require('express')
const router = express.Router()

// 导入所有子模块
const authRoutes = require('./auth')
const systemRoutes = require('./system')
const configRoutes = require('./config')
const settingsRoutes = require('./settings') // 🆕 系统设置管理
const prizePoolRoutes = require('./prize_pool')
const userManagementRoutes = require('./user_management')
const lotteryManagementRoutes = require('./lottery_management')
const analyticsRoutes = require('./analytics')
const customerServiceRoutes = require('./customer_service') // 🆕 客服管理
const marketplaceRoutes = require('./marketplace') // 🆕 市场统计管理

// 挂载子模块路由
router.use('/auth', authRoutes)
router.use('/system', systemRoutes)
/*
 * 🔧 核心系统监控接口兼容性挂载 - 同时支持 /admin/status 和 /admin/system/status
 * 解决前端路径不匹配问题（前端预期：/api/v4/admin/status，后端实际：/api/v4/admin/system/status）
 * 将system路由也挂载到根路径，使核心接口可直接访问
 */
router.use(systemRoutes)
router.use('/config', configRoutes)
router.use(settingsRoutes) // 🆕 系统设置路由（挂载到根路径，使/admin/settings/:category可直接访问）
router.use('/prize-pool', prizePoolRoutes)
router.use('/user-management', userManagementRoutes)
router.use('/lottery-management', lotteryManagementRoutes)
router.use('/analytics', analyticsRoutes)
router.use('/customer-service', customerServiceRoutes) // 🆕 客服管理路由
router.use('/marketplace', marketplaceRoutes) // 🆕 市场统计路由

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
      }
      // ⚠️ campaign_permissions模块暂未实现，待实现后再添加到此列表
    },
    documentation: '请参考各模块的API文档',
    timestamp: BeijingTimeHelper.apiTimestamp() // 统一使用apiTimestamp格式：2025-11-08 17:32:07
  }

  res.apiSuccess(adminInfo, 'Admin API模块信息')
})

module.exports = router
