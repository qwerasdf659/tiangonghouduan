const logger = require('../utils/logger').logger

/**
 * 服务管理器 - V4统一版本
 * 管理系统中所有服务的生命周期
 *
 * @description 基于V4架构，所有 service key 使用 snake_case 命名
 * @version 4.1.0
 * @date 2026-01-21
 */

// V4 核心服务
const { UnifiedLotteryEngine } = require('./UnifiedLotteryEngine/UnifiedLotteryEngine')

/**
 * V4 领域服务
 * 积分操作统一使用 BalanceService、ItemService、QueryService
 * V4.7.0 大文件拆分（2026-01-31）- 原始大文件已删除，使用拆分后的子服务
 */
// [已删除] ExchangeService.js → 拆分为 exchange/CoreService, exchange/QueryService, exchange/AdminService
const ContentAuditEngine = require('./ContentAuditEngine')
const AnnouncementService = require('./AnnouncementService')
const NotificationService = require('./NotificationService')
// [已删除] ConsumptionService.js → 拆分为 consumption/CoreService, consumption/QueryService, consumption/MerchantService
const CustomerServiceSessionService = require('./CustomerServiceSessionService')
const HierarchyManagementService = require('./HierarchyManagementService')
const UserRoleService = require('./UserRoleService')
const ChatWebSocketService = require('./ChatWebSocketService')
const PrizePoolService = require('./PrizePoolService') // 奖品池服务
const PremiumService = require('./PremiumService') // 高级空间服务
const UserService = require('./UserService') // 用户服务
const ChatRateLimitService = require('./ChatRateLimitService') // 聊天频率限制服务

// V4 管理后台服务
const FeedbackService = require('./FeedbackService') // 反馈管理服务
const AdminSystemService = require('./AdminSystemService') // 管理后台系统服务（已合并SystemSettingsService）
// [已删除] AdminLotteryService.js → 拆分为 admin-lottery/CoreService, admin-lottery/CampaignService, admin-lottery/QueryService
const AdminCustomerServiceService = require('./AdminCustomerServiceService') // 管理后台客服管理服务
const MaterialManagementService = require('./MaterialManagementService') // 材料系统运营管理服务（V4.5.0）
const PopupBannerService = require('./PopupBannerService') // 弹窗Banner管理服务（2025-12-22）
const ImageService = require('./ImageService') // 通用图片上传服务（2026-01-08 图片存储架构）

// V4 架构重构新增服务（2025-12-10）
const LotteryPresetService = require('./LotteryPresetService') // 抽奖预设管理服务
const ActivityService = require('./ActivityService') // 活动管理服务
const AuditLogService = require('./AuditLogService') // 审计日志服务

/*
 * V4 P2-C架构重构：服务合并优化（2025-12-11）
 * [已删除] ReportingService.js → 拆分为 reporting/AnalyticsService, reporting/ChartsService, reporting/StatsService
 */

// V4.5.0 材料系统服务（2025-12-15）
const AssetConversionService = require('./AssetConversionService') // 资产转换服务（材料转钻石）

// Asset 域子服务
const BalanceService = require('./asset/BalanceService') // 资产余额服务（8个方法）
const ItemService = require('./asset/ItemService') // 资产物品服务（9个方法）
const QueryService = require('./asset/QueryService') // 资产查询服务（7个方法）

// LotteryAnalytics 域子服务
const {
  RealtimeService: LotteryRealtimeService, // 实时监控服务（~800行）
  StatisticsService: LotteryStatisticsService, // 统计趋势服务（~900行）
  ReportService: LotteryReportService, // 报表生成服务（~700行）
  UserAnalysisService: LotteryUserAnalysisService, // 用户维度分析服务（~800行）
  CampaignAnalysisService: LotteryCampaignAnalysisService // 活动维度分析服务（~1000行）
} = require('./lottery-analytics')

// MarketListing 域子服务
const {
  CoreService: MarketListingCoreService, // 核心挂牌操作（~800行）
  QueryService: MarketListingQueryService, // 查询/搜索/筛选（~500行）
  AdminService: MarketListingAdminService // 管理控制/止损（~400行）
} = require('./market-listing')

// Exchange 域子服务
const {
  CoreService: ExchangeCoreService, // 核心兑换操作（~450行）
  QueryService: ExchangeQueryService, // 查询服务（~650行，含空间统计）
  AdminService: ExchangeAdminService, // 管理后台操作（~700行）
  BidService: ExchangeBidService, // 竞价核心服务（出价/结算/取消）
  BidQueryService: ExchangeBidQueryService // 竞价查询服务（列表/详情/历史）
} = require('./exchange')

// Consumption 域子服务
const {
  CoreService: ConsumptionCoreService, // 核心操作（提交/审核/删除/恢复）
  QueryService: ConsumptionQueryService, // 查询服务（用户/管理员/待审核列表）
  MerchantService: ConsumptionMerchantService // 商家侧服务（商家员工专用查询）
} = require('./consumption')

// Reporting 域子服务
const {
  AnalyticsService: ReportingAnalyticsService, // 决策分析/趋势分析（~400行）
  ChartsService: ReportingChartsService, // 图表数据生成（~600行）
  StatsService: ReportingStatsService, // 统计/概览/画像（~700行）
  MultiDimensionStatsService: ReportingMultiDimensionStatsService // 多维度组合统计（B-25/B-27）
} = require('./reporting')

// AdminLottery 域子服务
const {
  CoreService: AdminLotteryCoreService, // 核心干预操作（~600行）
  CampaignService: AdminLotteryCampaignService, // 活动管理操作（~450行）
  QueryService: AdminLotteryQueryService, // 干预规则查询（~300行）
  CRUDService: LotteryCampaignCRUDService // 活动 CRUD 操作（2026-01-31 路由层合规治理）
} = require('./admin-lottery')

// P2 路由层合规治理 - 会话管理服务（2026-01-31）
const SessionManagementService = require('./SessionManagementService')

// V4.6.0 业界标准幂等架构服务（2025-12-26 方案B）
const IdempotencyService = require('./IdempotencyService') // 入口幂等服务（重试返回首次结果）

// V4.2 背包双轨架构服务（Phase 1 - 核销码系统）
const RedemptionService = require('./RedemptionService') // 兑换订单服务（12位Base32核销码 + SHA-256哈希）
const BackpackService = require('./BackpackService') // 背包双轨查询服务（assets[] + items[]）

// V4.2 交易市场服务（2025-12-21 暴力重构）
const TradeOrderService = require('./TradeOrderService') // 交易订单服务（市场交易核心）
// [已删除] MarketListingService.js → 拆分为 market-listing/CoreService, market-listing/QueryService, market-listing/AdminService

// P0-2 孤儿冻结清理服务（2026-01-09）
const OrphanFrozenCleanupService = require('./OrphanFrozenCleanupService') // 孤儿冻结清理唯一入口

// P1 商家积分审核服务（2026-01-09 统一审批流）
const MerchantPointsService = require('./MerchantPointsService') // 商家积分申请审核服务

// 商家员工域权限体系升级服务（2026-01-12）
const StaffManagementService = require('./StaffManagementService') // 员工管理服务
const StoreService = require('./StoreService') // 门店管理服务（P1 门店数据维护入口）
const RegionService = require('./RegionService') // 行政区划服务（省市区级联选择）
const MerchantOperationLogService = require('./MerchantOperationLogService') // 商家操作审计日志服务
const MerchantRiskControlService = require('./MerchantRiskControlService') // 商家风控服务
const DebtManagementService = require('./DebtManagementService') // 欠账管理服务（2026-01-18 路由层合规性治理）
const LotteryCampaignPricingConfigService = require('./LotteryCampaignPricingConfigService') // 活动定价配置管理服务（2026-01-19 Phase 3）
const DictionaryService = require('./DictionaryService') // 字典表管理服务（2026-01-21 API覆盖率补齐）
const LotteryConfigService = require('./LotteryConfigService') // 抽奖配置管理服务（2026-01-21 API覆盖率补齐）
const ItemTemplateService = require('./ItemTemplateService') // 物品模板管理服务（2026-01-21 API覆盖率补齐）
const UserRiskProfileService = require('./UserRiskProfileService') // 用户风控配置管理服务（2026-01-21 API覆盖率补齐）
const LotteryTierRuleService = require('./LotteryTierRuleService') // 抽奖档位规则管理服务（2026-01-21 API覆盖率补齐）

/*
 * P2 API覆盖率补齐 - 监控查询服务（2026-01-21）
 * [已删除] LotteryAnalyticsService.js → 拆分为 lottery-analytics/* 5个子服务
 */
const LotteryAlertService = require('./LotteryAlertService') // 抽奖告警服务（B1 实时告警列表API）
const DisplayNameService = require('./DisplayNameService') // 显示名称翻译服务（系统字典）
const FeatureFlagService = require('./FeatureFlagService') // 功能开关服务

// 阶段C 批量操作基础设施服务（2026-01-30）
const SystemConfigService = require('./SystemConfigService') // 系统配置服务（动态限流配置）
const BatchOperationService = require('./BatchOperationService') // 批量操作服务（幂等性+状态管理）

// P0 待处理中心服务（2026-01-31 运营后台任务清单）
const PendingSummaryService = require('./dashboard/PendingSummaryService') // 仪表盘待处理汇总服务
const PendingCenterService = require('./pending/PendingCenterService') // 待处理中心服务
const PendingHealthScoreService = require('./pending/PendingHealthScoreService') // 待办健康度评分服务（§3.1.1）
const BusinessHealthScoreService = require('./dashboard/BusinessHealthScoreService') // 全局业务健康度评分服务（§3.1.2）
const CustomerServiceResponseStatsService = require('./dashboard/CustomerServiceResponseStatsService') // 客服响应时长统计服务（§4.15）
const APIPerformanceService = require('./monitoring/APIPerformanceService') // API性能监控服务（§4.6）
const ItemLockRateService = require('./monitoring/ItemLockRateService') // 物品锁定率监控服务（§5.4）
const StoreContributionService = require('./dashboard/StoreContributionService') // 商户贡献度服务（§6.2）
const ConsumptionBatchService = require('./consumption/ConsumptionBatchService') // 消费记录批量审核服务
const ConsumptionAnomalyService = require('./consumption/AnomalyService') // 消费异常检测服务（P1 B-25）
const UserSegmentService = require('./user/UserSegmentService') // 用户分层服务（P1 B-19~B-24）
const NavBadgeService = require('./nav/NavBadgeService') // 导航栏徽标计数服务

// P2 新增服务（2026-01-31 第2阶段任务）
const ReminderEngineService = require('./ReminderEngineService') // 智能提醒规则引擎服务（B-31~B-35）
const UserBehaviorTrackService = require('./UserBehaviorTrackService') // 用户行为轨迹服务（B-46~B-49）
const AuditRollbackService = require('./AuditRollbackService') // 审计回滚服务（B-42~B-45）
const CustomReportService = require('./CustomReportService') // 自定义报表服务（B-36~B-40）
/*
 * 服务合并记录（2026-01-21）：
 * - LotteryMonitoringService + LotteryStrategyStatsService → LotteryAnalyticsService
 * - TradeOrderQueryService 已合并到 TradeOrderService
 * - UserPremiumQueryService 已合并到 PremiumService
 */

// P1-9 新增注册的服务（2026-01-09）
const DataSanitizer = require('./DataSanitizer') // 统一数据脱敏服务
const LotteryQuotaService = require('./lottery/LotteryQuotaService') // 抽奖配额服务
const LotteryPricingService = require('./lottery/LotteryPricingService') // 抽奖定价服务
const PerformanceMonitor = require('./UnifiedLotteryEngine/utils/PerformanceMonitor') // 性能监控服务
const SealosStorageService = require('./sealosStorage') // Sealos 对象存储服务
const SmsService = require('./SmsService') // 短信验证码服务（Phase 1：Redis存取 + 频率限制）

/**
 * V4.6 管线编排器
 *
 * 抽奖执行入口：使用 DrawOrchestrator 编排 Pipeline 执行
 * 管理操作：ManagementStrategy 用于 forceWin/forceLose 等管理 API
 */
const DrawOrchestrator = require('./UnifiedLotteryEngine/pipeline/DrawOrchestrator')
const ManagementStrategy = require('./UnifiedLotteryEngine/strategies/ManagementStrategy')

// V4 模块化服务
const {
  lottery_service_container,
  LotteryHealthService,
  LotteryQueryService,
  LotteryAnalyticsQueryService
} = require('./lottery')

// V4.7.0 Phase 3 复杂查询收口服务（2026-02-02 读写操作分层策略）
const {
  SystemDataQueryService,
  SessionQueryService,
  BusinessRecordQueryService,
  DashboardQueryService
} = require('./console')
const { QueryService: MarketQueryService } = require('./market')
const { PortfolioQueryService: AssetPortfolioQueryService } = require('./asset')

// 数据库模型
const models = require('../models')

/**
 * 服务管理器 - V4统一版本
 *
 * 业务场景：
 * - 统一管理整个后端系统的所有服务实例
 * - 提供服务生命周期管理（初始化、获取、关闭）
 * - 实现服务单例模式（避免重复实例化）
 * - 提供服务健康检查和监控功能
 *
 * 管理的服务：
 * - unified_lottery_engine：V4统一抽奖引擎
 * - lottery_container：抽奖服务容器（包含user_service、history_service）
 * - 未来扩展：user_inventory（用户库存服务）等
 *
 * 核心功能：
 * - initialize()：初始化所有服务
 * - getService(name)：获取指定服务实例
 * - hasService(name)：检查服务是否存在
 * - getServiceList()：获取所有服务名称列表
 * - getHealthStatus()：获取所有服务的健康状态
 * - shutdown()：优雅关闭所有服务
 *
 * 设计模式：
 * - 单例模式：确保ServiceManager全局唯一
 * - 依赖注入：服务通过constructor注入models依赖
 * - 工厂模式：通过getService()获取服务实例
 * - 容器模式：使用Map管理所有服务实例
 *
 * 使用方式：
 * ```javascript
 * // 推荐方式（B1-Injected）：通过 req.app.locals.services 获取
 * router.post('/create', authenticateToken, async (req, res) => {
 *   const services = req.app.locals.services
 *   const MarketListingService = services.getService('market_listing_core') // V4.7.0 拆分后使用子服务键
 *   // ...
 * })
 *
 * // 备选方式：直接引用 serviceManager（仅用于非路由场景）
 * const serviceManager = require('./services')
 * const lotteryEngine = serviceManager.getService('unified_lottery_engine')
 * ```
 *
 * 技术特性：
 * - 使用Map存储服务实例（性能优于Object）
 * - 异步初始化（支持服务异步启动）
 * - 错误隔离（单个服务失败不影响其他服务）
 * - 健康检查（自动检测服务健康状态）
 * - 优雅关闭（确保资源正确释放）
 *
 * 安全设计：
 * - 防止未初始化访问（getService()会检查初始化状态）
 * - 防止重复初始化（_initialized标志）
 * - 错误传播控制（shutdown()时隔离单个服务错误）
 *
 * 性能优化：
 * - 单例模式减少实例化开销
 * - 懒加载设计（需要时才初始化）
 * - 使用Map提升查找性能
 *
 * 架构说明：
 * - 采用模块化设计，lottery服务独立容器
 * - 统一 snake_case key
 *
 * 创建时间：2025年09月25日
 * 最后更新：2026年01月09日（P1-9 E2-Strict snake_case）
 *
 * @class ServiceManager
 */
class ServiceManager {
  /**
   * 构造函数 - 初始化服务管理器
   *
   * 功能说明：
   * - 存储数据库模型引用（供服务使用）
   * - 创建服务实例存储容器（Map）
   * - 初始化状态标志（_initialized）
   *
   * 设计决策：
   * - 使用Map而非Object存储服务（性能更好）
   * - 在constructor中不进行服务实例化（延迟到initialize()）
   *
   * @constructor
   */
  constructor() {
    this.models = models
    this._services = new Map()
    this._initialized = false
  }

  /**
   * 初始化所有服务
   *
   * 业务场景：
   * - 应用启动时统一初始化所有服务
   * - 确保服务按正确顺序初始化
   * - 防止重复初始化
   *
   * 初始化的服务（P1-9 E2-Strict：使用 snake_case key）：
   * - unified_lottery_engine：V4统一抽奖引擎
   * - lottery_container：抽奖服务容器
   * - 所有领域服务和管理服务
   *
   * @async
   * @returns {Promise<void>} 初始化完成后resolve，失败则抛出错误
   * @throws {Error} 当服务初始化失败时抛出错误
   */
  async initialize() {
    if (this._initialized) {
      return
    }

    try {
      logger.info('🚀 初始化V4服务管理器（P1-9 snake_case key）...')

      // ========== 核心服务（使用 snake_case key） ==========

      // V4统一抽奖引擎（实例化服务）
      this._services.set('unified_lottery_engine', new UnifiedLotteryEngine(this.models))

      // 模块化抽奖服务容器
      this._services.set('lottery_container', lottery_service_container)

      // ========== 领域服务（静态类，使用 snake_case key） ==========

      // Exchange 域子服务
      this._services.set('exchange_core', new ExchangeCoreService(this.models)) // 核心兑换操作（需实例化）
      this._services.set('exchange_query', new ExchangeQueryService(this.models)) // 查询服务（需实例化）
      this._services.set('exchange_admin', new ExchangeAdminService(this.models)) // 管理后台操作（需实例化）
      this._services.set('exchange_bid_core', new ExchangeBidService(this.models)) // 竞价核心服务（出价/结算/取消）
      this._services.set('exchange_bid_query', new ExchangeBidQueryService(this.models)) // 竞价查询服务（列表/详情/历史）
      this._services.set('content_audit', ContentAuditEngine)
      this._services.set('announcement', AnnouncementService)
      this._services.set('notification', NotificationService)

      // Consumption 域子服务
      this._services.set('consumption_core', ConsumptionCoreService) // 核心操作（静态类）
      this._services.set('consumption_query', ConsumptionQueryService) // 查询服务（静态类）
      this._services.set('consumption_merchant', ConsumptionMerchantService) // 商家侧服务（静态类）

      this._services.set('customer_service_session', CustomerServiceSessionService)
      this._services.set('hierarchy_management', HierarchyManagementService)
      this._services.set('user_role', UserRoleService)
      this._services.set('chat_web_socket', ChatWebSocketService)
      this._services.set('user', UserService)
      this._services.set('chat_rate_limit', ChatRateLimitService)

      // ========== 管理后台服务（使用 snake_case key） ==========

      this._services.set('prize_pool', PrizePoolService)
      this._services.set('premium', PremiumService)
      this._services.set('feedback', FeedbackService)
      this._services.set('admin_system', AdminSystemService)

      // AdminLottery 域子服务
      this._services.set('admin_lottery_core', AdminLotteryCoreService) // 核心干预操作（静态类）
      this._services.set('admin_lottery_campaign', AdminLotteryCampaignService) // 活动管理操作（静态类）
      this._services.set('admin_lottery_query', AdminLotteryQueryService) // 干预规则查询（静态类）
      this._services.set('lottery_campaign_crud', LotteryCampaignCRUDService) // 活动 CRUD 操作（静态类，2026-01-31 路由层合规治理）

      // ========== P2 路由层合规治理服务（2026-01-31） ==========

      this._services.set('session_management', SessionManagementService) // 会话管理服务（静态类）
      this._services.set('admin_customer_service', AdminCustomerServiceService)
      this._services.set('material_management', MaterialManagementService)
      this._services.set('popup_banner', PopupBannerService)
      this._services.set('image', ImageService)

      // ========== 架构重构服务（使用 snake_case key） ==========

      this._services.set('lottery_preset', LotteryPresetService)
      this._services.set('activity', ActivityService)
      this._services.set('audit_log', AuditLogService)

      // Reporting 域子服务
      this._services.set('reporting_analytics', ReportingAnalyticsService) // 决策分析/趋势分析（静态类）
      this._services.set('reporting_charts', ReportingChartsService) // 图表数据生成（静态类）
      this._services.set('reporting_stats', ReportingStatsService) // 统计/概览/画像（静态类）
      this._services.set('multi_dimension_stats', ReportingMultiDimensionStatsService) // 多维度组合统计（B-25/B-27，静态类）

      // Asset 域子服务
      this._services.set('asset_balance', BalanceService) // 资产余额服务（8个方法，静态类）
      this._services.set('asset_item', ItemService) // 资产物品服务（9个方法，静态类）
      this._services.set('asset_query', QueryService) // 资产查询服务（7个方法，静态类）

      this._services.set('asset_conversion', AssetConversionService)

      // ========== 幂等架构服务（使用 snake_case key） ==========

      this._services.set('idempotency', IdempotencyService)

      // ========== 背包双轨服务（使用 snake_case key） ==========

      this._services.set('redemption_order', RedemptionService)
      this._services.set('backpack', BackpackService)

      // ========== 交易市场服务（使用 snake_case key） ==========

      this._services.set('trade_order', TradeOrderService)

      // MarketListing 域子服务
      this._services.set('market_listing_core', MarketListingCoreService) // 核心挂牌操作（静态类）
      this._services.set('market_listing_query', MarketListingQueryService) // 查询/搜索/筛选（静态类）
      this._services.set('market_listing_admin', MarketListingAdminService) // 管理控制/止损（静态类）

      // ========== 清理服务（使用 snake_case key） ==========

      this._services.set('orphan_frozen_cleanup', OrphanFrozenCleanupService)

      // ========== 商家积分服务（使用 snake_case key） ==========

      this._services.set('merchant_points', MerchantPointsService)

      // ========== 商家员工域权限体系升级服务（2026-01-12） ==========

      this._services.set('staff_management', StaffManagementService) // 员工管理服务
      this._services.set('store', StoreService) // 门店管理服务（P1 门店数据维护入口）
      this._services.set('region', new RegionService(this.models)) // 行政区划服务（省市区级联选择，需实例化）
      this._services.set('merchant_operation_log', MerchantOperationLogService) // 商家操作审计日志服务
      this._services.set('merchant_risk_control', MerchantRiskControlService) // 商家风控服务
      this._services.set('debt_management', DebtManagementService) // 欠账管理服务（2026-01-18 路由层合规性治理）

      // ========== P1-9 新增服务（2026-01-09） ==========

      this._services.set('data_sanitizer', DataSanitizer)
      this._services.set('lottery_quota', LotteryQuotaService)
      this._services.set('performance_monitor', new PerformanceMonitor()) // 性能监控服务（实例化）
      this._services.set('sealos_storage', SealosStorageService) // Sealos 对象存储服务（静态类，需 new 实例化）
      this._services.set('sms', SmsService) // 短信验证码服务（静态方法类）

      // ========== 抽奖定价相关服务 ==========

      this._services.set('lottery_campaign_pricing_config', LotteryCampaignPricingConfigService) // 活动定价配置管理服务
      this._services.set('lottery_pricing', LotteryPricingService) // 抽奖定价服务

      // ========== API覆盖率补齐服务 ==========

      this._services.set('dictionary', new DictionaryService(this.models)) // 字典表管理服务（category_defs, rarity_defs, asset_group_defs）
      this._services.set('lottery_config', new LotteryConfigService(this.models)) // 抽奖配置管理服务（lottery_strategy_config, lottery_tier_matrix_config）
      this._services.set('item_template', new ItemTemplateService(this.models)) // 物品模板管理服务（item_templates）
      this._services.set('user_risk_profile', new UserRiskProfileService(this.models)) // 用户风控配置管理服务（user_risk_profiles）
      this._services.set('lottery_tier_rule', new LotteryTierRuleService(this.models)) // 抽奖档位规则管理服务（lottery_tier_rules）

      // ========== P2 API覆盖率补齐 - 监控查询服务（2026-01-21） ==========

      // LotteryAnalytics 域子服务
      this._services.set('lottery_analytics_realtime', new LotteryRealtimeService(this.models)) // 实时监控服务（~800行，需实例化）
      this._services.set('lottery_analytics_statistics', new LotteryStatisticsService(this.models)) // 统计趋势服务（~900行，需实例化）
      this._services.set('lottery_analytics_report', new LotteryReportService(this.models)) // 报表生成服务（~700行，需实例化）
      this._services.set('lottery_analytics_user', new LotteryUserAnalysisService(this.models)) // 用户维度分析服务（~800行，需实例化）
      this._services.set(
        'lottery_analytics_campaign',
        new LotteryCampaignAnalysisService(this.models)
      ) // 活动维度分析服务（~1000行，需实例化）
      this._services.set('lottery_alert', LotteryAlertService) // 抽奖告警服务（B1 实时告警列表API，2026-01-29，静态类）

      // ========== P1 抽奖健康度服务（2026-01-31 运营优化任务） ==========

      this._services.set('lottery_health', new LotteryHealthService(this.models)) // 抽奖健康度计算服务（B-14，需实例化）
      this._services.set('lottery_query', LotteryQueryService) // 抽奖查询服务（读操作收口，静态类，2026-02-01）
      this._services.set('lottery_analytics_query', LotteryAnalyticsQueryService) // 抽奖统计分析查询服务（Phase 3 复杂查询收口，静态类）

      // ========== Phase 3 复杂查询收口服务（2026-02-02 读写操作分层策略） ==========

      this._services.set('console_system_data_query', SystemDataQueryService) // 管理后台系统数据查询服务（静态类）
      this._services.set('console_session_query', SessionQueryService) // 管理后台会话查询服务（静态类）
      this._services.set('console_business_record_query', BusinessRecordQueryService) // 管理后台业务记录查询服务（静态类）
      this._services.set('console_dashboard_query', DashboardQueryService) // 管理后台仪表盘查询服务（静态类）
      this._services.set('market_query', MarketQueryService) // 市场热点读查询服务（静态类）
      this._services.set('asset_portfolio_query', AssetPortfolioQueryService) // 资产组合分析查询服务（静态类）

      // ========== 阶段C 批量操作基础设施服务（2026-01-30） ==========

      this._services.set('system_config', SystemConfigService) // 系统配置服务（动态限流配置，静态类）
      this._services.set('batch_operation', BatchOperationService) // 批量操作服务（幂等性+状态管理，静态类）
      this._services.set('display_name', DisplayNameService) // 显示名称翻译服务（系统字典，静态类）
      this._services.set('feature_flag', FeatureFlagService) // 功能开关服务（静态类）

      // ========== P0 待处理中心服务（2026-01-31 运营后台任务清单） ==========

      this._services.set('pending_summary', PendingSummaryService) // 仪表盘待处理汇总服务（静态类）
      this._services.set('pending_center', PendingCenterService) // 待处理中心服务（静态类）
      this._services.set('pending_health_score', PendingHealthScoreService) // 待办健康度评分服务（静态类，§3.1.1）
      this._services.set('business_health_score', new BusinessHealthScoreService(this.models)) // 全局业务健康度评分服务（需实例化，§3.1.2）
      this._services.set('cs_response_stats', new CustomerServiceResponseStatsService(this.models)) // 客服响应时长统计服务（需实例化，§4.15）
      this._services.set('api_performance', APIPerformanceService) // API性能监控服务（静态类，§4.6）
      this._services.set('item_lock_rate', new ItemLockRateService(this.models)) // 物品锁定率监控服务（需实例化，§5.4）
      this._services.set('store_contribution', new StoreContributionService(this.models)) // 商户贡献度服务（需实例化，§6.2）
      this._services.set('consumption_batch', ConsumptionBatchService) // 消费记录批量审核服务（静态类）
      this._services.set('nav_badge', NavBadgeService) // 导航栏徽标计数服务（静态类）

      // ========== P1 消费异常检测服务（2026-01-31 运营优化任务） ==========

      this._services.set('consumption_anomaly', ConsumptionAnomalyService) // 消费异常检测服务（B-25，静态类）

      // ========== P1 用户分层服务（2026-01-31 B-19~B-24） ==========

      this._services.set('user_segment', UserSegmentService) // 用户分层服务（B-19，静态类）

      // ========== P2 新增服务（2026-01-31 第2阶段任务） ==========

      this._services.set('reminder_engine', ReminderEngineService) // 智能提醒规则引擎服务（B-31~B-35，静态类）
      this._services.set('user_behavior_track', UserBehaviorTrackService) // 用户行为轨迹服务（B-46~B-49，静态类）
      this._services.set('audit_rollback', AuditRollbackService) // 审计回滚服务（B-42~B-45，静态类）
      this._services.set('custom_report', CustomReportService) // 自定义报表服务（B-36~B-40，静态类）

      /**
       * V4.6 管线编排器
       *
       * draw_orchestrator: 抽奖执行入口（Pipeline 架构）
       * management_strategy: 管理操作 API（forceWin/forceLose 等）
       */
      this._services.set('draw_orchestrator', new DrawOrchestrator())
      this._services.set('management_strategy', new ManagementStrategy())

      /*
       * 🎯 初始化阶段依赖注入（P2优先级 - 2025-12-10）
       * 为所有需要依赖其他Service的Service注入依赖
       */
      logger.info('🔧 开始注入Service依赖...')

      // 注入管理后台服务的依赖
      if (typeof AdminCustomerServiceService.initialize === 'function') {
        AdminCustomerServiceService.initialize(this)
      }

      // 初始化 AdminLotteryCoreService 依赖（V4.7.0 大文件拆分后需要手动初始化）
      if (typeof AdminLotteryCoreService.initialize === 'function') {
        AdminLotteryCoreService.initialize(this)
      }

      // 初始化 MerchantRiskControlService（需要注入 models）
      if (typeof MerchantRiskControlService.initialize === 'function') {
        MerchantRiskControlService.initialize(this.models)
      }

      logger.info('✅ Service依赖注入完成')

      this._initialized = true
      logger.info('✅ V4服务管理器初始化完成（P1-9 snake_case key）')
      logger.info(
        `📊 已注册服务（共${this._services.size}个）: ${Array.from(this._services.keys()).join(', ')}`
      )
    } catch (error) {
      logger.error('❌ 服务管理器初始化失败:', error)
      throw error
    }
  }

  /**
   * 获取服务实例
   *
   * 业务场景：
   * - 路由层通过 req.app.locals.services.getService() 获取服务
   * - 非路由场景直接引用 serviceManager.getService() 获取服务
   *
   * @param {string} serviceName - 服务名称（使用 snake_case 格式）
   * @returns {Object} 服务实例
   * @throws {Error} 当服务不存在时抛出错误
   *
   * @example
   * const MarketListingService = services.getService('market_listing_core') // V4.7.0 拆分后使用子服务键
   */
  getService(serviceName) {
    if (!this._initialized) {
      throw new Error('服务管理器尚未初始化，请先调用 initialize()')
    }

    const service = this._services.get(serviceName)
    if (!service) {
      const availableServices = Array.from(this._services.keys()).join(', ')
      throw new Error(`服务 "${serviceName}" 不存在。\n可用服务: ${availableServices}`)
    }

    return service
  }

  /**
   * 检查服务是否存在
   * @param {string} serviceName - 服务名称
   * @returns {boolean} 服务存在返回true，否则返回false
   */
  hasService(serviceName) {
    return this._services.has(serviceName)
  }

  /**
   * 获取所有服务列表
   * @returns {Array<string>} 所有已注册服务的名称数组
   */
  getServiceList() {
    return Array.from(this._services.keys())
  }

  /**
   * 获取服务健康状态
   *
   * 业务场景：
   * - 健康检查接口中验证所有服务状态
   * - 监控告警时检测服务异常
   * - 运维排查问题时诊断服务状态
   *
   * 返回格式：
   * {
   *   initialized: boolean,      // 服务管理器是否已初始化
   *   totalServices: number,     // 总服务数量
   *   services: {
   *     serviceName: {
   *       status: 'active' | 'error',
   *       message: string
   *     }
   *   }
   * }
   *
   * @async
   * @returns {Promise<Object>} 包含所有服务健康状态的对象
   */
  async getHealthStatus() {
    const status = {
      initialized: this._initialized,
      totalServices: this._services.size,
      services: {}
    }

    for (const [serviceName, service] of this._services.entries()) {
      try {
        // 检查服务是否有健康检查方法
        if (typeof service.getHealthStatus === 'function') {
          // eslint-disable-next-line no-await-in-loop
          status.services[serviceName] = await service.getHealthStatus()
        } else if (typeof service.health === 'function') {
          // eslint-disable-next-line no-await-in-loop
          status.services[serviceName] = await service.health()
        } else {
          status.services[serviceName] = {
            status: 'active',
            message: '服务运行正常（无健康检查接口）'
          }
        }
      } catch (error) {
        status.services[serviceName] = {
          status: 'error',
          message: error.message
        }
      }
    }

    return status
  }

  /**
   * 优雅关闭所有服务
   *
   * 业务场景：
   * - 应用关闭时释放所有服务资源
   * - 重启应用时先关闭旧服务
   * - 测试结束后清理服务实例
   *
   * 功能说明：
   * - 遍历所有服务，调用各自的shutdown()方法
   * - 错误隔离：单个服务关闭失败不影响其他服务
   * - 清空服务Map并重置初始化标志
   *
   * @async
   * @returns {Promise<void>} 所有服务关闭完成后resolve
   */
  async shutdown() {
    logger.info('🛑 开始关闭服务管理器...')

    for (const [serviceName, service] of this._services.entries()) {
      try {
        if (typeof service.shutdown === 'function') {
          // eslint-disable-next-line no-await-in-loop
          await service.shutdown()
          logger.info(`✅ 服务 ${serviceName} 已关闭`)
        }
      } catch (error) {
        logger.error(`❌ 服务 ${serviceName} 关闭失败:`, error)
      }
    }

    this._services.clear()
    this._initialized = false
    logger.info('✅ 服务管理器已关闭')
  }
}

// 创建单例实例
const serviceManager = new ServiceManager()

/**
 * 初始化服务并返回服务容器
 *
 * 用于 app.js 中注入到 app.locals.services
 *
 * @param {Object} _models - 数据库模型（通过参数传入，供路由层访问）
 * @returns {Object} 服务容器（包含 getService/getAllServices/getHealthStatus/models）
 */
function initializeServices(_models) {
  const container = {
    // 提供getService方法来获取服务
    getService: serviceName => serviceManager.getService(serviceName),

    // 提供getAllServices方法
    getAllServices: () => serviceManager._services,

    // 提供服务健康状态
    getHealthStatus: () => serviceManager.getHealthStatus(),

    /**
     * 数据库模型访问（Phase 3 收口）
     *
     * 业务场景：路由层需要访问特定 Model 进行读操作时使用
     * 用法：const { AuthenticationSession, sequelize } = req.app.locals.services.models
     *
     * 注意：写操作仍必须通过 Service 层进行，不可直接使用 models 写入
     */
    models: _models || serviceManager.models
  }

  // 异步初始化
  serviceManager.initialize().catch(error => {
    logger.error('服务管理器初始化失败:', error)
  })

  return container
}

module.exports = serviceManager
module.exports.initializeServices = initializeServices
