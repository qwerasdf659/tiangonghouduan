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
/* [已合并到 ad-campaigns?category=operational] popupBannersRoutes + carouselItemsRoutes */
const lotteryQuotaRoutes = require('./lottery-quota') // 🆕 抽奖配额管理（2025-12-23）
const assetAdjustmentRoutes = require('./asset-adjustment') // 🆕 资产调整管理（2025-12-30）
const campaignBudgetRoutes = require('./campaign-budget') // 🆕 活动预算管理（2026-01-03 BUDGET_POINTS架构）
const assetsRoutes = require('./assets') // 🆕 后台运营资产中心（2026-01-07 架构重构）
// images.js 已删除（image_resources 架构废弃），图片管理由 /media 路由接管
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
const productCenterCategoriesRoutes = require('./categories') // 🆕 统一商品中心-品类树（EAV）
const productCenterAttributesRoutes = require('./attributes') // 🆕 统一商品中心-属性/选项（EAV）
const productCenterProductsRoutes = require('./products') // 🆕 统一商品中心-SPU/SKU/渠道价
const riskProfilesRoutes = require('./risk-profiles') // 🆕 用户风控配置管理（2026-01-21 API覆盖率补齐）
const lotteryTierRulesRoutes = require('./lottery-tier-rules') // 🆕 抽奖档位规则管理（2026-01-21 API覆盖率补齐）
const lotteryPresetsRoutes = require('./lottery-presets') // 🆕 抽奖预设管理（2026-01-21 API覆盖率补齐）
// 🔄 2026-01-31 大文件拆分方案 Phase 2: lottery-monitoring 拆分为5个子路由
const lotteryRealtimeRoutes = require('./lottery-realtime') // 实时监控和告警
const lotteryStatisticsRoutes = require('./lottery-statistics') // 统计趋势
const lotteryReportRoutes = require('./lottery-report') // 报表生成
const lotteryUserAnalysisRoutes = require('./lottery-user-analysis') // 用户分析
const lotteryCampaignAnalysisRoutes = require('./lottery-campaign-analysis') // 活动分析
const tradeOrdersRoutes = require('./trade-orders') // 🆕 交易订单查询（2026-01-21 P2 API覆盖率补齐）
const userPremiumRoutes = require('./user-premium') // 🆕 用户高级空间状态查询（2026-01-21 P2 API覆盖率补齐）
const adminAuditLogsRoutes = require('./admin-audit-logs') // 🆕 管理员操作审计日志（2026-01-22 P1 API覆盖率补齐）
const businessRecordsRoutes = require('./business-records') // 🆕 业务记录查询（2026-01-22 P1 API覆盖率补齐）
const systemDataRoutes = require('./system-data') // 🆕 系统数据查询（2026-01-22 P1 API覆盖率补齐）
const featureFlagsRoutes = require('./feature-flags') // 🆕 功能开关管理（2026-01-21 Feature Flag 灰度发布）
const lotteryStrategyStatsRoutes = require('./lottery-strategy-stats') // 🆕 抽奖策略统计（2026-01-22 策略引擎监控方案）
const lotterySimulationRoutes = require('./lottery-simulation') // 🆕 策略效果模拟分析（2026-02-20 Monte Carlo 模拟引擎）
const sessionsRoutes = require('./sessions') // 🆕 会话管理（2026-01-21 会话管理功能补齐）
const lotteryCampaignsRoutes = require('./lottery-campaigns') // 🆕 抽奖活动列表管理（2026-01-28 P1 运营后台 ROI/复购率/库存预警）
const batchOperationsRoutes = require('./batch-operations') // 🆕 批量操作（2026-01-30 阶段C 批量操作API）
const dashboardRoutes = require('./dashboard') // 🆕 运营看板（2026-01-31 P0 待处理聚合）
const pendingRoutes = require('./pending') // 🆕 待处理中心（2026-01-31 P0 统一待处理管理）
const navRoutes = require('./nav') // 🆕 导航徽标（2026-01-31 P0 侧边栏徽标）
const lotteryHealthRoutes = require('./lottery-health') // 🆕 抽奖健康度（2026-01-31 P1 B-14~B-18）
const consumptionAnomalyRoutes = require('./consumption-anomaly') // 🆕 消费异常检测（2026-01-31 P1 B-25~B-30）
const userSegmentsRoutes = require('./user-segments') // 🆕 用户分层（2026-01-31 P1 B-19~B-24）
const itemsRoutes = require('./items') // 物品管理 + 监控（三表模型 CRUD + 锁定率）
const lotteryRoutes = require('./lottery') // 🆕 抽奖分析Dashboard（2026-02-04 运营仪表盘E2E测试）
const bidManagementRoutes = require('./bid-management') // 🆕 竞价管理（2026-02-16 臻选空间/幸运空间/竞价功能 Phase 3.7）
const userDataQueryRoutes = require('./user-data-query') // 🆕 用户数据查询（2026-02-18 用户全维度数据检索看板）
const segmentRulesRoutes = require('./segment-rules') // 🆕 分群策略管理（2026-02-22 运营可视化搭建分群条件）
const itemLifecycleRoutes = require('./item-lifecycle') // 🆕 物品全链路追踪（2026-02-22 资产全链路追踪方案）
const reconciliationRoutes = require('./reconciliation') // 🆕 对账报告（2026-02-22 资产全链路追踪方案）
const dataManagementRoutes = require('./data-management') // 🆕 数据管理（2026-03-10 数据一键删除功能）
const exchangeRatesRoutes = require('./exchange-rates') // 🆕 汇率兑换管理（2026-02-23 市场增强）
const merchantsRoutes = require('./merchants') // 🆕 商家管理（2026-02-23 多商家接入架构）
const approvalChainRoutes = require('./approval-chain') // 🆕 审核链管理（2026-03-10 多级审核链）
const mediaRoutes = require('./media') // 🆕 媒体管理（2026-03-16 media_files + media_attachments）
const storageRoutes = require('./storage') // 🆕 存储管理（2026-03-16 概览/孤儿/回收站/清理/重复）

// 🔴 广告系统路由（Phase 2-6）
const adCampaignsRoutes = require('./ad-campaigns') // Phase 3: 广告计划管理
const adSlotsRoutes = require('./ad-slots') // Phase 3: 广告位管理
const adPricingRoutes = require('./ad-pricing') // 广告定价配置（DAU系数/折扣/底价）
const zoneManagementRoutes = require('./zone-management') // P1c: 地域定向管理（商圈/区域/联合组 CRUD）
const platformDiamondRoutes = require('./platform-diamond') // 平台钻石管理（余额/销毁）
const adReportsRoutes = require('./ad-reports') // Phase 6: 广告报表

// P2新增路由（2026-01-31 第2阶段任务）
const reminderRulesRoutes = require('./reminder-rules') // 🆕 智能提醒规则管理（B-31~B-35）
const reminderHistoryRoutes = require('./reminder-history') // 🆕 提醒历史记录（B-35）
const reportTemplatesRoutes = require('./report-templates') // 🆕 自定义报表模板（B-36~B-40）
const auditRollbackRoutes = require('./audit-rollback') // 🆕 审计回滚管理（B-42~B-45）
const userBehaviorTracksRoutes = require('./user-behavior-tracks') // 🆕 用户行为轨迹（B-46~B-49）
const multiDimensionStatsRoutes = require('./multi-dimension-stats') // 🆕 多维度统计（B-25/B-27）

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
/* [已合并] popup-banners + carousel-items → ad-campaigns */
router.use('/lottery-quota', lotteryQuotaRoutes) // 🆕 抽奖配额管理路由（2025-12-23）
router.use('/asset-adjustment', assetAdjustmentRoutes) // 🆕 资产调整管理路由（2025-12-30）
router.use('/campaign-budget', campaignBudgetRoutes) // 🆕 活动预算管理路由（2026-01-03 BUDGET_POINTS架构）
router.use('/assets', assetsRoutes) // 🆕 后台运营资产中心路由（2026-01-07 架构重构）
// router.use('/images', imagesRoutes) // 已废弃：使用 /media 路由
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
router.use('/categories', productCenterCategoriesRoutes) // 🆕 统一商品中心-品类树
router.use('/attributes', productCenterAttributesRoutes) // 🆕 统一商品中心-EAV 属性
router.use('/products', productCenterProductsRoutes) // 🆕 统一商品中心-商品与 SKU
router.use('/risk-profiles', riskProfilesRoutes) // 🆕 用户风控配置管理路由（2026-01-21 API覆盖率补齐）
router.use('/lottery-tier-rules', lotteryTierRulesRoutes) // 🆕 抽奖档位规则管理路由（2026-01-21 API覆盖率补齐）
router.use('/lottery-presets', lotteryPresetsRoutes) // 🆕 抽奖预设管理路由（2026-01-21 API覆盖率补齐）
// 🔄 2026-01-31 大文件拆分方案 Phase 2: 新URL结构（原lottery-monitoring拆分）
router.use('/lottery-realtime', lotteryRealtimeRoutes) // 实时监控和告警（原 /lottery-monitoring/stats 和 /realtime-alerts）
router.use('/lottery-statistics', lotteryStatisticsRoutes) // 统计趋势（原 /lottery-monitoring/hourly-metrics）
router.use('/lottery-report', lotteryReportRoutes) // 报表生成（原 /lottery-analytics/daily-report）
router.use('/lottery-user-analysis', lotteryUserAnalysisRoutes) // 用户分析（原 /lottery-monitoring/user-*）
router.use('/lottery-campaign-analysis', lotteryCampaignAnalysisRoutes) // 活动分析（原 /lottery-monitoring/campaign-*）
router.use('/trade-orders', tradeOrdersRoutes) // 🆕 交易订单查询路由（2026-01-21 P2 API覆盖率补齐）
router.use('/user-premium', userPremiumRoutes) // 🆕 用户高级空间状态查询路由（2026-01-21 P2 API覆盖率补齐）
router.use('/admin-audit-logs', adminAuditLogsRoutes) // 🆕 管理员操作审计日志路由（2026-01-22 P1 API覆盖率补齐）
router.use('/business-records', businessRecordsRoutes) // 🆕 业务记录查询路由（2026-01-22 P1 API覆盖率补齐）
router.use('/system-data', systemDataRoutes) // 🆕 系统数据查询路由（2026-01-22 P1 API覆盖率补齐）
router.use('/feature-flags', featureFlagsRoutes) // 🆕 功能开关管理路由（2026-01-21 Feature Flag 灰度发布）
router.use('/lottery-strategy-stats', lotteryStrategyStatsRoutes) // 🆕 抽奖策略统计路由（2026-01-22 策略引擎监控方案）
router.use('/lottery-simulation', lotterySimulationRoutes) // 🆕 策略效果模拟分析路由（2026-02-20 Monte Carlo 模拟引擎）
router.use('/sessions', sessionsRoutes) // 🆕 会话管理路由（2026-01-21 会话管理功能补齐）
router.use('/lottery-campaigns', lotteryCampaignsRoutes) // 🆕 抽奖活动列表管理路由（2026-01-28 P1 运营后台 ROI/复购率/库存预警）
router.use('/batch-operations', batchOperationsRoutes) // 🆕 批量操作路由（2026-01-30 阶段C 批量赠送/核销/状态切换/预算调整）
router.use('/dashboard', dashboardRoutes) // 🆕 运营看板路由（2026-01-31 P0 待处理聚合）
router.use('/pending', pendingRoutes) // 🆕 待处理中心路由（2026-01-31 P0 统一待处理管理）
router.use('/nav', navRoutes) // 🆕 导航徽标路由（2026-01-31 P0 侧边栏徽标）
router.use('/lottery-health', lotteryHealthRoutes) // 🆕 抽奖健康度路由（2026-01-31 P1 B-14~B-18 活动健康度评估）
router.use('/consumption-anomaly', consumptionAnomalyRoutes) // 🆕 消费异常检测路由（2026-01-31 P1 B-25~B-30 风险评估）
router.use('/users', userSegmentsRoutes) // 🆕 用户分层路由（2026-01-31 P1 B-19~B-24 用户画像）
router.use('/items', itemsRoutes) // 物品管理路由（CRUD + 监控，统一 /items 路径）
router.use('/lottery', lotteryRoutes) // 🆕 抽奖分析Dashboard路由（2026-02-04 运营仪表盘E2E测试）
router.use('/bid-management', bidManagementRoutes) // 🆕 竞价管理路由（2026-02-16 臻选空间/幸运空间/竞价功能 Phase 3.7）
router.use('/user-data-query', userDataQueryRoutes) // 🆕 用户数据查询路由（2026-02-18 用户全维度数据检索看板）
router.use('/segment-rules', segmentRulesRoutes) // 🆕 分群策略管理路由（2026-02-22 运营可视化搭建分群条件）
router.use('/item-lifecycle', itemLifecycleRoutes) // 🆕 物品全链路追踪路由（2026-02-22 资产全链路追踪）
router.use('/user-ratio-overrides', require('./user-ratio-overrides')) // 🆕 用户比例覆盖管理路由（2026-03-02 钻石配额优化方案）
router.use('/reconciliation', reconciliationRoutes) // 🆕 对账报告路由（2026-02-22 资产全链路追踪）
router.use('/data-management', dataManagementRoutes) // 🆕 数据管理路由（2026-03-10 数据一键删除功能）
router.use('/exchange-rates', exchangeRatesRoutes) // 🆕 汇率兑换管理路由（2026-02-23 市场增强）
router.use('/merchants', merchantsRoutes) // 🆕 商家管理路由（2026-02-23 多商家接入架构）
router.use('/approval-chain', approvalChainRoutes) // 🆕 审核链管理路由（2026-03-10 多级审核链）
router.use('/media', mediaRoutes) // 🆕 媒体管理路由（2026-03-16 媒体库 CRUD/上传/关联）
router.use('/storage', storageRoutes) // 🆕 存储管理路由（2026-03-16 概览/孤儿/回收站/清理/重复）

// 🔴 广告系统路由（Phase 2-6）
router.use('/ad-campaigns', adCampaignsRoutes) // Phase 3: 广告计划管理路由
router.use('/ad-slots', adSlotsRoutes) // Phase 3: 广告位管理路由
router.use('/ad-pricing', adPricingRoutes) // 广告定价配置路由
router.use('/zone-management', zoneManagementRoutes) // P1c: 地域定向管理路由
router.use('/platform-diamond', platformDiamondRoutes) // 平台钻石管理路由
router.use('/ad-reports', adReportsRoutes) // Phase 6: 广告报表路由

// P2新增路由（2026-01-31 第2阶段任务）
router.use('/reminder-rules', reminderRulesRoutes) // 🆕 智能提醒规则管理路由（B-31~B-35）
router.use('/reminder-history', reminderHistoryRoutes) // 🆕 提醒历史记录路由（B-35）
router.use('/report-templates', reportTemplatesRoutes) // 🆕 自定义报表模板路由（B-36~B-40）
router.use('/audit-rollback', auditRollbackRoutes) // 🆕 审计回滚管理路由（B-42~B-45）
router.use('/user-behavior-tracks', userBehaviorTracksRoutes) // 🆕 用户行为轨迹路由（B-46~B-49）
router.use('/statistics', multiDimensionStatsRoutes) // 🆕 多维度统计路由（B-25/B-27）

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
        endpoints: [
          '/users/resolve',
          '/users',
          '/users/:user_id',
          '/users/:user_id/role',
          '/users/:user_id/status',
          '/roles',
          '/roles/:role_id',
          '/permission-resources',
          '/stats'
        ],
        note: '用户CRUD管理、角色权限管理、手机号解析（2026-02-06 手机号主导搜索改造）'
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
      /* [已合并+删除] popup_banners + carousel_items → ad-campaigns?category=operational */
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
          '/campaign-budget/campaigns/:lottery_campaign_id',
          '/campaign-budget/campaigns/:lottery_campaign_id/validate',
          '/campaign-budget/campaigns/:lottery_campaign_id/pool/add',
          '/campaign-budget/campaigns/:lottery_campaign_id/budget-status',
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
      // images 模块已废弃（image_resources 表已删除），使用 media 模块
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
          '/consumption/reject/:id', // 记录ID（事务实体）
          '/consumption/batch-review', // 🆕 批量审核（2026-01-31 P0）
          '/consumption/qrcode/:user_id' // 🆕 管理员生成用户二维码（2026-02-12 路由分离）
        ],
        note: '仅限 admin（role_level >= 100）访问，不开放 ops/区域经理；商家员工使用 /api/v4/shop/* 提交消费记录'
      },
      dashboard: {
        description: '运营看板（2026-01-31 P0 待处理聚合）',
        endpoints: ['/dashboard/pending-summary'],
        note: '运营首页看板待处理事项聚合统计；仅限 admin 访问'
      },
      pending: {
        description: '待处理中心（2026-01-31 P0 统一待处理管理）',
        endpoints: ['/pending/summary', '/pending/list'],
        note: '统一待处理事项管理：分类汇总、列表筛选、紧急优先；仅限 admin 访问'
      },
      nav: {
        description: '导航徽标（2026-01-31 P0 侧边栏徽标）',
        endpoints: ['/nav/badges'],
        note: '侧边栏待处理徽标计数，轻量级接口适合轮询（建议30-60秒）；仅限 admin 访问'
      },
      consumption_anomaly: {
        description: '消费异常检测（2026-01-31 P1 B-25~B-30）',
        endpoints: [
          '/consumption-anomaly/summary',
          '/consumption-anomaly/high-risk',
          '/consumption-anomaly/detect/:id',
          '/consumption-anomaly/batch-detect',
          '/consumption-anomaly/:id/mark',
          '/consumption-anomaly/rules'
        ],
        note: '消费记录异常检测：汇总统计、高风险列表、单条/批量检测、手动标记、规则配置；仅限 admin 访问'
      },
      lottery_health: {
        description: '抽奖健康度评估（2026-01-31 P1 B-14~B-18）',
        endpoints: ['/lottery-health/:lottery_campaign_id'],
        note: '抽奖活动健康度评估：健康分数、问题诊断、优化建议；仅限 admin 访问'
      },
      user_segments: {
        description: '用户分层分析（2026-01-31 P1 B-19~B-24）',
        endpoints: [
          '/users/segments',
          '/users/segments/:type',
          '/users/activity-heatmap',
          '/users/exchange-preferences',
          '/users/funnel',
          '/users/segment-rules'
        ],
        note: '用户分层统计：高价值/活跃/沉默/流失用户分布、活跃热力图、兑换偏好、行为漏斗；仅限 admin 访问'
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
          '/debt-management/limits/:lottery_campaign_id',
          '/debt-management/limits/:lottery_campaign_id/alert-check'
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
      unified_product_center: {
        description: '统一商品中心（品类 / EAV 属性 / SPU·SKU / 渠道定价）',
        endpoints: ['/categories', '/attributes', '/products'],
        note: '管理后台商品主数据：categories 树、attributes 与选项、products 与 skus、exchange_channel_prices；requireRoleLevel(100)'
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
      items: {
        description: '物品管理（三表模型 CRUD + 锁定率监控）',
        endpoints: [
          '/items',
          '/items/lock-rate',
          '/items/user/:user_id',
          '/items/:id',
          '/items/:id/freeze',
          '/items/:id/unfreeze',
          '/items/:id/transfer'
        ],
        note: '管理员查看全平台物品列表/详情/冻结/解冻/转移 + 锁定率监控；仅限 admin（role_level >= 100）访问'
      },
      lottery_monitoring: {
        description: '抽奖监控数据查询（2026-01-21 P2 API覆盖率补齐）',
        endpoints: [
          '/lottery-monitoring/hourly-metrics',
          '/lottery-monitoring/hourly-metrics/:id',
          '/lottery-monitoring/hourly-metrics/summary/:lottery_campaign_id',
          '/lottery-monitoring/user-experience-states',
          '/lottery-monitoring/user-experience-states/:user_id/:lottery_campaign_id',
          '/lottery-monitoring/user-global-states',
          '/lottery-monitoring/user-global-states/:user_id',
          '/lottery-monitoring/quota-grants',
          '/lottery-monitoring/quota-grants/:id',
          '/lottery-monitoring/user-quotas',
          '/lottery-monitoring/user-quotas/:user_id/:lottery_campaign_id',
          '/lottery-monitoring/user-quotas/stats/:lottery_campaign_id'
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
          '/system-data/market-listings/:market_listing_id',
          '/system-data/market-listings/statistics/summary',
          '/system-data/lottery-campaigns',
          '/system-data/lottery-campaigns/:lottery_campaign_id',
          '/system-data/lottery-campaigns/:lottery_campaign_id/status',
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
      },
      lottery_campaigns: {
        description: '抽奖活动列表管理（2026-01-28 P1 运营后台 ROI/复购率/库存预警）',
        endpoints: ['/lottery/campaigns', '/lottery/campaigns/:lottery_campaign_id'],
        note: '活动列表含 ROI、复购率、库存预警；ROI/复购率使用 Redis 缓存（5分钟 TTL）；仅限 admin 访问'
      },
      lottery_analytics: {
        description: '抽奖分析（2026-01-28 P2 运营日报聚合）',
        endpoints: ['/lottery-analytics/daily-report'],
        note: '运营日报聚合：当日汇总、昨日/上周对比、告警、小时分布、档位分布、热门奖品、活动分布；仅限 admin 访问'
      },
      user_data_query: {
        description: '用户数据查询（2026-02-18 用户全维度数据检索）',
        endpoints: [
          '/user-data-query/search',
          '/user-data-query/:user_id/overview',
          '/user-data-query/:user_id/asset-transactions',
          '/user-data-query/:user_id/lottery-draws',
          '/user-data-query/:user_id/exchange-records',
          '/user-data-query/:user_id/trade-records',
          '/user-data-query/:user_id/market-listings',
          '/user-data-query/:user_id/conversions'
        ],
        note: '用户全维度数据检索：资产流水、抽奖记录、兑换记录、交易记录、市场挂牌、材料转换；仅限 admin 访问'
      },
      // ========== 广告系统（Phase 2-6 虚拟货币广告平台） ==========
      ad_campaigns: {
        description: '广告计划管理（含商业/运营/系统三类，?category= 筛选）',
        endpoints: [
          '/ad-campaigns',
          '/ad-campaigns/:id',
          '/ad-campaigns/:id/review',
          '/ad-campaigns/statistics',
          '/ad-campaigns/dashboard',
          '/ad-campaigns/popup-queue-config',
          '/ad-campaigns/bid-logs',
          '/ad-campaigns/user-ad-tags',
          '/ad-campaigns/antifraud-logs',
          '/ad-campaigns/attribution-logs'
        ],
        note: '广告计划 CRUD + category=commercial/operational/system 筛选、审核、竞价日志、DMP 标签、反作弊'
      },
      ad_slots: {
        description: '广告位管理（Phase 3 动态广告位配置）',
        endpoints: ['/ad-slots', '/ad-slots/:id', '/ad-slots/:id/toggle', '/ad-slots/statistics'],
        note: '广告位 CRUD、开关控制（popup/carousel/announcement 三种类型）；仅限 admin 访问'
      },
      ad_reports: {
        description: '广告报表（Phase 6 多维分析）',
        endpoints: ['/ad-reports/overview', '/ad-reports/campaigns/:id', '/ad-reports/slots/:id'],
        note: '全局广告数据总览、单计划/单广告位详细报表；仅限 admin 访问'
      },
      data_management: {
        description: '数据管理（2026-03-10 数据一键删除功能）',
        endpoints: [
          '/data-management/stats',
          '/data-management/policies',
          '/data-management/policies/:config_key',
          '/data-management/history',
          '/data-management/preview',
          '/data-management/cleanup'
        ],
        note: '数据量统计、自动清理策略管理、手动清理（预览+执行）、清理历史审计；仅限 admin 访问'
      },
      media: {
        description: '媒体管理（2026-03-16 media_files + media_attachments）',
        endpoints: [
          '/media',
          '/media/upload',
          '/media/:media_id',
          '/media/:media_id/attach',
          '/media/:media_id (DELETE)'
        ],
        note: '媒体库 CRUD、上传、多态关联；primary_media_id 关联 media_files.media_id'
      },
      storage: {
        description: '存储管理（2026-03-16）',
        endpoints: [
          '/storage/overview',
          '/storage/orphans',
          '/storage/trash',
          '/storage/cleanup',
          '/storage/duplicates'
        ],
        note: '存储概览、孤儿媒体、回收站、物理清理、重复检测'
      }
      // ⚠️ campaign_permissions模块暂未实现，待实现后再添加到此列表
    },
    documentation: '请参考各模块的API文档',
    timestamp: BeijingTimeHelper.apiTimestamp() // 统一使用apiTimestamp格式：2025-11-08 17:32:07
  }

  res.apiSuccess(adminInfo, 'Admin API模块信息')
})

module.exports = router
