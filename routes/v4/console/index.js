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
const userHierarchyRoutes = require('./user-hierarchy') // 🆕 用户层级管理（业务员/门店管理 2026-01-09）
const consumptionRoutes = require('./consumption') // 🆕 消费记录审核管理（2026-01-12 商家员工域权限体系升级 AC1.4）
const storesRoutes = require('./stores') // 🆕 门店管理（2026-01-12 P1 门店数据维护入口）
const regionsRoutes = require('./regions') // 🆕 行政区划管理（2026-01-12 省市区级联选择）
const staffRoutes = require('./staff') // 🆕 员工管理（2026-01-12 商家员工域权限体系升级 Phase 3）
const auditLogsRoutes = require('./audit-logs') // 🆕 商家操作审计日志（2026-01-12 商家员工域权限体系升级 AC4.3）
const riskAlertsRoutes = require('./risk-alerts') // 🆕 风控告警管理（2026-01-12 商家员工域权限体系升级 AC5）
const debtManagementRoutes = require('./debt-management') // 🆕 欠账管理（2026-01-18 统一抽奖架构）
const dictionariesRoutes = require('./dictionaries') // 🆕 字典表管理（2026-01-21 API覆盖率补齐）
const lotteryConfigsRoutes = require('./lottery-configs') // 🆕 抽奖配置管理（2026-01-21 API覆盖率补齐）
const itemTemplatesRoutes = require('./item-templates') // 🆕 物品模板管理（2026-01-21 API覆盖率补齐）
const riskProfilesRoutes = require('./risk-profiles') // 🆕 用户风控配置管理（2026-01-21 API覆盖率补齐）
const lotteryTierRulesRoutes = require('./lottery-tier-rules') // 🆕 抽奖档位规则管理（2026-01-21 API覆盖率补齐）
const lotteryPresetsRoutes = require('./lottery-presets') // 🆕 抽奖预设管理（2026-01-21 API覆盖率补齐）
const lotteryMonitoringRoutes = require('./lottery-monitoring') // 🆕 抽奖监控数据查询（2026-01-21 P2 API覆盖率补齐）
const tradeOrdersRoutes = require('./trade-orders') // 🆕 交易订单查询（2026-01-21 P2 API覆盖率补齐）
const userPremiumRoutes = require('./user-premium') // 🆕 用户高级空间状态查询（2026-01-21 P2 API覆盖率补齐）
const adminAuditLogsRoutes = require('./admin-audit-logs') // 🆕 管理员操作审计日志（2026-01-22 P1 API覆盖率补齐）
const businessRecordsRoutes = require('./business-records') // 🆕 业务记录查询（2026-01-22 P1 API覆盖率补齐）
const systemDataRoutes = require('./system-data') // 🆕 系统数据查询（2026-01-22 P1 API覆盖率补齐）
const featureFlagsRoutes = require('./feature-flags') // 🆕 功能开关管理（2026-01-21 Feature Flag 灰度发布）
const lotteryStrategyStatsRoutes = require('./lottery-strategy-stats') // 🆕 抽奖策略统计（2026-01-22 策略引擎监控方案）
const sessionsRoutes = require('./sessions') // 🆕 会话管理（2026-01-21 会话管理功能补齐）

// 挂载子模块路由
router.use('/auth', authRoutes)
router.use('/system', systemRoutes)
router.use('/config', configRoutes)
router.use(settingsRoutes) // 🆕 系统设置路由（挂载到根路径，使/admin/settings/:code可直接访问）
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
router.use('/user-hierarchy', userHierarchyRoutes) // 🆕 用户层级管理路由（业务员/门店管理 2026-01-09）
router.use('/consumption', consumptionRoutes) // 🆕 消费记录审核管理路由（2026-01-12 商家员工域权限体系升级 AC1.4）
router.use('/stores', storesRoutes) // 🆕 门店管理路由（2026-01-12 P1 门店数据维护入口）
router.use('/regions', regionsRoutes) // 🆕 行政区划管理路由（2026-01-12 省市区级联选择）
router.use('/staff', staffRoutes) // 🆕 员工管理路由（2026-01-12 商家员工域权限体系升级 Phase 3）
router.use('/audit-logs', auditLogsRoutes) // 🆕 商家操作审计日志路由（2026-01-12 商家员工域权限体系升级 AC4.3）
router.use('/risk-alerts', riskAlertsRoutes) // 🆕 风控告警管理路由（2026-01-12 商家员工域权限体系升级 AC5）
router.use('/debt-management', debtManagementRoutes) // 🆕 欠账管理路由（2026-01-18 统一抽奖架构）
router.use('/dictionaries', dictionariesRoutes) // 🆕 字典表管理路由（2026-01-21 API覆盖率补齐）
router.use('/lottery-configs', lotteryConfigsRoutes) // 🆕 抽奖配置管理路由（2026-01-21 API覆盖率补齐）
router.use('/item-templates', itemTemplatesRoutes) // 🆕 物品模板管理路由（2026-01-21 API覆盖率补齐）
router.use('/risk-profiles', riskProfilesRoutes) // 🆕 用户风控配置管理路由（2026-01-21 API覆盖率补齐）
router.use('/lottery-tier-rules', lotteryTierRulesRoutes) // 🆕 抽奖档位规则管理路由（2026-01-21 API覆盖率补齐）
router.use('/lottery-presets', lotteryPresetsRoutes) // 🆕 抽奖预设管理路由（2026-01-21 API覆盖率补齐）
router.use('/lottery-monitoring', lotteryMonitoringRoutes) // 🆕 抽奖监控数据查询路由（2026-01-21 P2 API覆盖率补齐）
router.use('/trade-orders', tradeOrdersRoutes) // 🆕 交易订单查询路由（2026-01-21 P2 API覆盖率补齐）
router.use('/user-premium', userPremiumRoutes) // 🆕 用户高级空间状态查询路由（2026-01-21 P2 API覆盖率补齐）
router.use('/admin-audit-logs', adminAuditLogsRoutes) // 🆕 管理员操作审计日志路由（2026-01-22 P1 API覆盖率补齐）
router.use('/business-records', businessRecordsRoutes) // 🆕 业务记录查询路由（2026-01-22 P1 API覆盖率补齐）
router.use('/system-data', systemDataRoutes) // 🆕 系统数据查询路由（2026-01-22 P1 API覆盖率补齐）
router.use('/feature-flags', featureFlagsRoutes) // 🆕 功能开关管理路由（2026-01-21 Feature Flag 灰度发布）
router.use('/lottery-strategy-stats', lotteryStrategyStatsRoutes) // 🆕 抽奖策略统计路由（2026-01-22 策略引擎监控方案）
router.use('/sessions', sessionsRoutes) // 🆕 会话管理路由（2026-01-21 会话管理功能补齐）

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
          '/prize-pool/:code', // 活动代码（配置实体）
          '/prize-pool/prize/:id' // 奖品ID（事务实体）
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
        endpoints: ['/material/asset-types', '/material/conversion-rules'],
        note: '材料资产类型管理、转换规则管理（用户余额管理已迁移至 asset-adjustment 模块）'
      },
      /*
       * 💡 diamond 模块已合并到 asset-adjustment 统一管理
       * 钻石/材料余额查询: /asset-adjustment/user/:user_id/balances
       * 资产调整: /asset-adjustment/adjust
       * 资产流水: /assets/transactions
       */
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
          '/lottery-quota/rules/:id/disable', // 规则ID（事务实体）
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
      },
      user_hierarchy: {
        description: '用户层级管理（业务员/门店管理 2026-01-09）',
        endpoints: [
          '/user-hierarchy',
          '/user-hierarchy/roles',
          '/user-hierarchy/:user_id/subordinates',
          '/user-hierarchy/:user_id/stats',
          '/user-hierarchy/:user_id/deactivate',
          '/user-hierarchy/:user_id/activate'
        ],
        note: '区域负责人→业务经理→业务员三级层级管理，门店分配，权限激活/停用，替代独立的门店管理功能'
      },
      consumption: {
        description: '消费记录审核管理（2026-01-12 商家员工域权限体系升级）',
        endpoints: [
          '/consumption/pending',
          '/consumption/records',
          '/consumption/approve/:id', // 记录ID（事务实体）
          '/consumption/reject/:id' // 记录ID（事务实体）
        ],
        note: '仅限 admin（role_level >= 100）访问，不开放 ops/区域经理；商家员工使用 /api/v4/shop/* 提交消费记录'
      },
      stores: {
        description: '门店管理（2026-01-12 P1 门店数据维护入口）',
        endpoints: [
          '/stores',
          '/stores/stats',
          '/stores/:store_id',
          '/stores/:store_id/activate',
          '/stores/:store_id/deactivate'
        ],
        note: '平台管理员门店 CRUD 操作，包括创建/编辑/删除/激活/停用门店；仅限 admin（role_level >= 100）访问'
      },
      regions: {
        description: '行政区划管理（2026-01-12 省市区级联选择）',
        endpoints: [
          '/regions/provinces',
          '/regions/children/:parent_code',
          '/regions/search',
          '/regions/path/:region_code',
          '/regions/stats',
          '/regions/validate'
        ],
        note: '省市区街道四级行政区划查询，用于门店管理时的级联选择器；仅限 admin 访问'
      },
      staff: {
        description: '员工管理（2026-01-12 商家员工域权限体系升级）',
        endpoints: [
          '/staff',
          '/staff/stats',
          '/staff/:store_staff_id',
          '/staff/by-user/:user_id',
          '/staff/transfer',
          '/staff/:store_staff_id/role',
          '/staff/disable/:user_id',
          '/staff/enable'
        ],
        note: '商家员工管理：员工入职/调店/离职/禁用/角色变更；仅限 admin（role_level >= 100）访问'
      },
      audit_logs: {
        description: '商家操作审计日志（2026-01-12 商家员工域权限体系升级 AC4.3）',
        endpoints: [
          '/audit-logs',
          '/audit-logs/:merchant_log_id',
          '/audit-logs/stats/store/:store_id',
          '/audit-logs/stats/operator/:operator_id',
          '/audit-logs/cleanup',
          '/audit-logs/operation-types'
        ],
        note: '商家域审计日志查询、统计、清理（保留180天）；仅限 admin（role_level >= 100）访问'
      },
      risk_alerts: {
        description: '风控告警管理（2026-01-12 商家员工域权限体系升级 AC5）',
        endpoints: [
          '/risk-alerts',
          '/risk-alerts/pending',
          '/risk-alerts/:alert_id',
          '/risk-alerts/:alert_id/review',
          '/risk-alerts/stats/summary',
          '/risk-alerts/stats/store/:store_id',
          '/risk-alerts/types'
        ],
        note: '风控告警查询、复核、统计；支持频次阻断、金额告警、关联告警；仅限 admin 访问'
      },
      debt_management: {
        description: '欠账管理（2026-01-18 统一抽奖架构）',
        endpoints: [
          '/debt-management/dashboard',
          '/debt-management/by-campaign',
          '/debt-management/by-prize',
          '/debt-management/by-creator',
          '/debt-management/trend',
          '/debt-management/pending',
          '/debt-management/clear',
          '/debt-management/limits',
          '/debt-management/limits/:campaign_id',
          '/debt-management/limits/:campaign_id/alert-check'
        ],
        note: '预设欠账看板、清偿管理、上限配置；支持按活动/奖品/责任人统计；仅限 admin 访问'
      },
      dictionaries: {
        description: '字典表管理（2026-01-21 API覆盖率补齐）',
        endpoints: [
          '/dictionaries/categories',
          '/dictionaries/categories/:code',
          '/dictionaries/rarities',
          '/dictionaries/rarities/:code',
          '/dictionaries/asset-groups',
          '/dictionaries/asset-groups/:code'
        ],
        note: '配置/字典表（category_defs, rarity_defs, asset_group_defs）CRUD管理；仅限 admin 访问'
      },
      lottery_configs: {
        description: '抽奖配置管理（2026-01-21 API覆盖率补齐）',
        endpoints: [
          '/lottery-configs/strategy',
          '/lottery-configs/strategy/:id',
          '/lottery-configs/matrix',
          '/lottery-configs/matrix/:id',
          '/lottery-configs/matrix/full'
        ],
        note: '抽奖策略配置（lottery_strategy_config）和BxPx矩阵配置（lottery_tier_matrix_config）CRUD管理；仅限 admin 访问'
      },
      item_templates: {
        description: '物品模板管理（2026-01-21 API覆盖率补齐）',
        endpoints: [
          '/item-templates',
          '/item-templates/types',
          '/item-templates/:id',
          '/item-templates/batch/status'
        ],
        note: '物品模板（item_templates）CRUD管理，包括类型查询和批量状态更新；仅限 admin 访问'
      },
      risk_profiles: {
        description: '用户风控配置管理（2026-01-21 API覆盖率补齐）',
        endpoints: [
          '/risk-profiles',
          '/risk-profiles/level/:risk_level',
          '/risk-profiles/:id',
          '/risk-profiles/user/:user_id',
          '/risk-profiles/user/:user_id/freeze',
          '/risk-profiles/user/:user_id/unfreeze'
        ],
        note: '用户风控配置（user_risk_profiles）CRUD管理，包括冻结/解冻用户；仅限 admin 访问'
      },
      lottery_tier_rules: {
        description: '抽奖档位规则管理（2026-01-21 API覆盖率补齐）',
        endpoints: [
          '/lottery-tier-rules',
          '/lottery-tier-rules/:id',
          '/lottery-tier-rules/validate-weights'
        ],
        note: '抽奖档位规则（lottery_tier_rules）CRUD管理，包括权重验证；仅限 admin 访问'
      },
      lottery_presets: {
        description: '抽奖预设管理（2026-01-21 API覆盖率补齐）',
        endpoints: [
          '/lottery-presets',
          '/lottery-presets/stats',
          '/lottery-presets/user/:user_id',
          '/lottery-presets/:id'
        ],
        note: '抽奖预设（lottery_presets）CRUD管理，为用户创建预设队列和统计；仅限 admin 访问'
      },
      lottery_monitoring: {
        description: '抽奖监控数据查询（2026-01-21 P2 API覆盖率补齐）',
        endpoints: [
          '/lottery-monitoring/hourly-metrics',
          '/lottery-monitoring/hourly-metrics/:id',
          '/lottery-monitoring/hourly-metrics/summary/:campaign_id',
          '/lottery-monitoring/user-experience-states',
          '/lottery-monitoring/user-experience-states/:user_id/:campaign_id',
          '/lottery-monitoring/user-global-states',
          '/lottery-monitoring/user-global-states/:user_id',
          '/lottery-monitoring/quota-grants',
          '/lottery-monitoring/quota-grants/:id',
          '/lottery-monitoring/user-quotas',
          '/lottery-monitoring/user-quotas/:user_id/:campaign_id',
          '/lottery-monitoring/user-quotas/stats/:campaign_id'
        ],
        note: '抽奖监控数据只读查询（lottery_hourly_metrics/lottery_user_experience_state/lottery_user_global_state/lottery_campaign_quota_grants/lottery_campaign_user_quota）；仅限 admin 访问'
      },
      trade_orders: {
        description: '交易订单查询（2026-01-21 P2 API覆盖率补齐）',
        endpoints: [
          '/trade-orders',
          '/trade-orders/stats',
          '/trade-orders/user/:user_id/stats',
          '/trade-orders/by-business-id/:business_id',
          '/trade-orders/:id'
        ],
        note: '交易订单（trade_orders）只读查询，支持买家/卖家/状态筛选和统计汇总；仅限 admin 访问'
      },
      user_premium: {
        description: '用户高级空间状态查询（2026-01-21 P2 API覆盖率补齐）',
        endpoints: [
          '/user-premium',
          '/user-premium/stats',
          '/user-premium/expiring',
          '/user-premium/:user_id'
        ],
        note: '用户高级空间状态（user_premium_status）只读查询，支持有效期筛选和即将过期提醒；仅限 admin 访问'
      },
      admin_audit_logs: {
        description: '管理员操作审计日志（2026-01-22 P1 API覆盖率补齐）',
        endpoints: ['/admin-audit-logs'],
        note: '管理员域审计日志（admin_operation_logs）只读查询；仅限 admin 访问'
      },
      business_records: {
        description: '业务记录查询（2026-01-22 P1 API覆盖率补齐）',
        endpoints: [
          '/business-records/lottery-clear-settings',
          '/business-records/redemption-orders',
          '/business-records/content-reviews',
          '/business-records/user-role-changes',
          '/business-records/user-status-changes',
          '/business-records/exchange-records',
          '/business-records/chat-messages'
        ],
        note: '多个P1优先级业务数据表的只读查询（lottery_clear_setting_records/redemption_orders/content_review_records/user_role_change_records/user_status_change_records/exchange_records/chat_messages）；仅限 admin 访问'
      },
      system_data: {
        description: '系统数据查询（2026-01-22 P1 API覆盖率补齐）',
        endpoints: [
          '/system-data/accounts',
          '/system-data/accounts/:account_id',
          '/system-data/user-roles',
          '/system-data/market-listings',
          '/system-data/market-listings/:listing_id',
          '/system-data/market-listings/statistics/summary',
          '/system-data/lottery-campaigns',
          '/system-data/lottery-campaigns/:campaign_id',
          '/system-data/lottery-campaigns/:campaign_id/status',
          '/system-data/lottery-daily-quotas',
          '/system-data/lottery-daily-quotas/:quota_id'
        ],
        note: '系统级数据管理（accounts/user_roles/market_listings/lottery_campaigns含CRUD/lottery_user_daily_draw_quota）；仅限 admin 访问'
      },
      feature_flags: {
        description: '功能开关管理（2026-01-21 Feature Flag 灰度发布）',
        endpoints: [
          '/feature-flags',
          '/feature-flags/:flagKey',
          '/feature-flags/:flagKey/toggle',
          '/feature-flags/:flagKey/whitelist',
          '/feature-flags/:flagKey/blacklist',
          '/feature-flags/:flagKey/check/:userId',
          '/feature-flags/batch-check'
        ],
        note: '功能开关CRUD、启用/禁用、白名单/黑名单管理、用户可用性检查；仅限 admin 访问'
      },
      sessions: {
        description: '会话管理（2026-01-21 会话管理功能补齐）',
        endpoints: [
          '/sessions',
          '/sessions/stats',
          '/sessions/:user_session_id/deactivate',
          '/sessions/deactivate-user',
          '/sessions/cleanup',
          '/sessions/online-users'
        ],
        note: '用户会话管理：会话列表、统计、强制登出、清理过期会话、在线用户监控；仅限 admin 访问'
      }
      // ⚠️ campaign_permissions模块暂未实现，待实现后再添加到此列表
    },
    documentation: '请参考各模块的API文档',
    timestamp: BeijingTimeHelper.apiTimestamp() // 统一使用apiTimestamp格式：2025-11-08 17:32:07
  }

  res.apiSuccess(adminInfo, 'Admin API模块信息')
})

module.exports = router
