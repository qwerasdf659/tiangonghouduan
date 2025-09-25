/**
 * Admin模块主入口
 *
 * @description 聚合所有admin子模块，提供统一的路由入口
 * @version 4.0.0
 * @date 2025-09-24
 */

const express = require('express')
const router = express.Router()

// 导入所有子模块
const authRoutes = require('./auth')
const systemRoutes = require('./system')
const configRoutes = require('./config')
const prizePoolRoutes = require('./prize_pool')
const userManagementRoutes = require('./user_management')
const lotteryManagementRoutes = require('./lottery_management')
const analyticsRoutes = require('./analytics')

// 挂载子模块路由
router.use('/auth', authRoutes)
router.use('/system', systemRoutes)
router.use('/config', configRoutes)
router.use('/prize-pool', prizePoolRoutes)
router.use('/user-management', userManagementRoutes)
router.use('/lottery-management', lotteryManagementRoutes)
router.use('/analytics', analyticsRoutes)

/**
 * GET / - Admin API根路径信息
 *
 * @description 返回Admin API的基本信息和可用模块
 * @route GET /api/v4/unified-engine/admin/
 * @access Public
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
      prize_pool: {
        description: '奖品池管理',
        endpoints: ['/prize-pool/batch-add', '/prize-pool/:campaign_id', '/prize-pool/prize/:prize_id']
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
      }
    },
    documentation: '请参考各模块的API文档',
    timestamp: new Date().toISOString()
  }

  res.apiSuccess(adminInfo, 'Admin API模块信息')
})

module.exports = router
