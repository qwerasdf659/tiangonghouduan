/**
 * V4 API 域路由装配（bootstrap 模块，2026-07-11 自 app.js 拆分，纯搬移不改行为）
 *
 * API顶层域规范（业务资源扁平化）：
 * - /images           图片代理域（公开）
 * - /auth             认证授权
 * - /permissions      权限管理（2026-01-08 从 auth 域拆分）
 * - /console          后台控制台
 * - /lottery          抽奖系统
 * - /shop             积分商城（积分、兑换、消费、会员）
 * - /system           系统功能
 * - /home             首页 BFF 聚合
 * - /user             用户中心
 * - /assets           资产查询
 * - /backpack         背包系统（物品查看/核销/竞价）
 * - /exchange         B2C 用户兑换
 * - /webhooks         第三方回调
 * - /merchant-points  商家积分申请
 * - /activities       活动条件
 * - /debug-control    调试控制（仅管理员）
 * - /diy              DIY 饰品设计引擎
 *
 * 目录结构规范：routes/v4/{domain}/ 目录名与顶层域一致，每个域有独立的 index.js 聚合子路由
 *
 * @module bootstrap/routes
 */

'use strict'

const BeijingTimeHelper = require('../utils/timeHelper')
const appLogger = require('../utils/logger')
const { getRequestId } = require('./request-id')

/**
 * 装配 18 个 V4 业务域路由 + 404 处理器 + 全局错误处理器
 *
 * @param {Object} app - Express 应用实例
 * @returns {void}
 */
function mountDomainRoutes(app) {
  try {
    /*
     * 0. /images - 图片代理域（公开接口，无需认证）
     *   解决 Sealos 对象存储 Content-Disposition: attachment
     *   导致微信小程序 <image> 组件无法渲染图片的问题
     */
    app.use('/api/v4/images', require('../routes/v4/images'))
    appLogger.info(' images域加载成功', { route: '/api/v4/images' })

    // 1. /auth - 认证授权域
    app.use('/api/v4/auth', require('../routes/v4/auth'))
    appLogger.info(' auth域加载成功', { route: '/api/v4/auth' })

    /*
     * 1.1 /permissions - 权限管理域（2026-01-08 从 auth 域拆分）
     *  拆分原因：解决 POST /api/v4/auth/refresh 路由冲突
     * - token.js 的 Token 刷新 和 permissions.js 的权限缓存失效 都注册了 /refresh
     * - Express 路由匹配规则：先注册先匹配，导致权限缓存失效接口不可达
     * 新路径：POST /api/v4/permissions/cache/invalidate
     */
    app.use('/api/v4/permissions', require('../routes/v4/auth/permissions'))
    appLogger.info(' permissions域加载成功', { route: '/api/v4/permissions' })

    // 2. /console - 后台控制台域
    app.use('/api/v4/console', require('../routes/v4/console'))
    appLogger.info(' console域加载成功', { route: '/api/v4/console' })

    // 3. /lottery - 抽奖系统域
    app.use('/api/v4/lottery', require('../routes/v4/lottery'))
    appLogger.info(' lottery域加载成功', { route: '/api/v4/lottery' })

    // 5. /shop - 积分商城域
    app.use('/api/v4/shop', require('../routes/v4/shop'))
    appLogger.info(' shop域加载成功', { route: '/api/v4/shop' })

    // 6. /system - 系统功能域
    app.use('/api/v4/system', require('../routes/v4/system'))
    appLogger.info(' system域加载成功', { route: '/api/v4/system' })

    // 6.1 /home - 首页 BFF 聚合域（治理项2：冷启动首屏削峰，公开只读聚合）
    app.use('/api/v4/home', require('../routes/v4/home'))
    appLogger.info(' home域加载成功', { route: '/api/v4/home' })

    // 7. /user - 用户中心域
    app.use('/api/v4/user', require('../routes/v4/user'))
    appLogger.info(' user域加载成功', { route: '/api/v4/user' })

    // 9. /assets - 资产查询域（2025-12-29 资产域标准架构新增）
    app.use('/api/v4/assets', require('../routes/v4/assets'))
    appLogger.info(' assets域加载成功', { route: '/api/v4/assets' })

    // 10. /backpack - 背包查询域（物品 + 核销 + 竞价；兑换已迁至 /exchange）
    app.use('/api/v4/backpack', require('../routes/v4/backpack'))
    appLogger.info(' backpack域加载成功', { route: '/api/v4/backpack' })

    // 10b. /exchange - B2C 用户兑换域（权威路径，旧 /backpack/exchange 已移除）
    app.use('/api/v4/exchange', require('../routes/v4/exchange'))
    appLogger.info(' exchange域加载成功', { route: '/api/v4/exchange' })

    /*
     * 10c. /webhooks - 第三方回调域（物流方案一：快递网关轨迹推送）
     * 公网开放，靠第三方签名校验保证来源可信（详见路由内验签）
     */
    app.use('/api/v4/webhooks/shipping', require('../routes/v4/webhooks/shipping'))
    appLogger.info(' webhooks/shipping域加载成功', { route: '/api/v4/webhooks/shipping' })

    // 11. /merchant-points - 商家积分申请域（P1 2026-01-09 统一审批流）
    app.use('/api/v4/merchant-points', require('../routes/v4/merchant-points'))
    appLogger.info(' merchant-points域加载成功', { route: '/api/v4/merchant-points' })

    // 12. /activities - 活动条件域（活动列表查询、参与条件验证、条件配置）
    app.use('/api/v4/activities', require('../routes/v4/activities'))
    appLogger.info(' activities域加载成功', { route: '/api/v4/activities' })

    //  调试控制接口（仅管理员）
    app.use('/api/v4/debug-control', require('../routes/v4/debug-control'))
    appLogger.info(' debug-control加载成功', { route: '/api/v4/debug-control' })

    //  DIY 饰品设计引擎（用户端）
    app.use('/api/v4/diy', require('../routes/v4/diy'))
    appLogger.info(' diy域加载成功', { route: '/api/v4/diy' })

    //  API架构信息汇总
    appLogger.info(' V4 API标准化域结构加载完成', {
      standard_domains: [
        '/auth',
        '/console',
        '/lottery',
        '/exchange',
        '/shop',
        '/system',
        '/user',
        '/assets',
        '/backpack'
      ],
      compliance: '符合01-技术架构标准-权威版.md P0规范'
    })
  } catch (error) {
    appLogger.error(' V4 API路由加载失败', { error: error.message, stack: error.stack })
    process.exit(1)
  }

  //  404处理（含全部标准字段：version/request_id）
  app.use('*', (req, res) => {
    res.status(404).json({
      success: false,
      code: 'NOT_FOUND',
      message: `接口不存在: ${req.method} ${req.originalUrl}`,
      data: {
        availableEndpoints: [
          'GET /health',
          'GET /api/v4',
          'GET /api/v4/docs',
          // 认证域
          'POST /api/v4/auth/login',
          'POST /api/v4/auth/quick-login',
          'POST /api/v4/auth/logout',
          'GET /api/v4/auth/verify',
          'POST /api/v4/auth/refresh', // Token刷新
          // 权限域（2026-01-08 从 auth 域拆分）
          'GET /api/v4/permissions/me', // 获取当前用户权限
          'POST /api/v4/permissions/check', // 检查权限
          'POST /api/v4/permissions/cache/invalidate', // 权限缓存失效
          'GET /api/v4/permissions/admins', // 管理员列表
          'GET /api/v4/permissions/statistics', // 权限统计
          'POST /api/v4/permissions/batch-check', // 批量权限检查
          // 抽奖域
          'POST /api/v4/lottery/draw',
          'GET /api/v4/lottery/strategies',
          // 活动域
          'GET /api/v4/activities/available',
          'GET /api/v4/activities/:idOrCode/check-eligibility',
          'POST /api/v4/activities/:idOrCode/participate',
          'POST /api/v4/activities/:code/configure-conditions',
          // 控制台域
          'GET /api/v4/console/system/dashboard'
        ]
      },
      timestamp: BeijingTimeHelper.apiTimestamp(), //  北京时间API时间戳
      version: 'v4.0',
      request_id: getRequestId(req)
    })
  })

  /**
   *  全局错误处理（唯一实现：middleware/errorHandler.js，拍板 2 收口）
   *
   * 架构决策4（2026-01-13）：
   * - BusinessError：使用业务错误码，details 仅日志记录，不返回给客户端
   * - Sequelize 错误：隐藏内部细节，返回通用 DATABASE_ERROR 类错误码
   * - 其他错误：开发环境返回详细信息，生产环境隐藏（INTERNAL_ERROR）
   */
  app.use(require('../middleware/errorHandler'))
}

module.exports = { mountDomainRoutes }
