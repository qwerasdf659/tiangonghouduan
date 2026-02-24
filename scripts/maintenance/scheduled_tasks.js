/**
 * 定时任务配置
 *
 * 使用node-cron实现定时任务调度
 *
 * 功能：
 * 1. 超时订单告警（每小时检查）
 * 2. 数据一致性检查（每天凌晨3点）
 * 3. 抽奖管理设置过期清理（每小时检查）
 * 4. 抽奖管理缓存自动清理（每30秒）
 * 5. 数据库性能监控（每5分钟）- 2025-11-09新增
 * 6. 抽奖奖品每日中奖次数重置（每天凌晨0点）- 2025-12-11新增
 * 7. 抽奖活动状态同步（每小时检查）- 2025-12-11新增
 * 8. 交易市场锁超时解锁（每5分钟检查）- 2025-12-15新增（Phase 2）
 * 9. 核销码过期清理（每天凌晨2点）- 2025-12-17新增（Phase 1）
 * 10. 商家审核超时告警（每小时）- 2025-12-29新增（资产域标准架构）
 * 11. 交易市场超时解锁（每小时）- 2025-12-29新增（资产域标准架构）
 * 12. 业务记录关联对账（每小时第5分钟）- 2026-01-05新增（事务边界治理）
 * 13. 未绑定图片清理（每小时第30分钟）- 2026-01-08新增（图片存储架构）
 * 14. 可叠加资产挂牌过期（每小时第15分钟）- 2026-01-08新增（交易市场材料交易）
 * 15. 市场挂牌异常监控（每小时第45分钟）- 2026-01-08新增（交易市场材料交易 Phase 2）
 * 16. 孤儿冻结检测与清理（每天凌晨2点）- 2026-01-09新增（P0-2修复）
 * 17. 商家审计日志180天清理（每天凌晨3点）- 2026-01-12新增（AC4.4 商家员工域权限体系升级）
 * 18. 图片资源数据质量检查（每天凌晨4点）- 2026-01-14新增（图片缩略图架构兼容残留核查报告 Phase 1）
 *
 * ========== 2026-01-30 定时任务统一管理改进方案新增 ==========
 * 25. 聊天限流记录清理（每10分钟）- 迁移自 ChatRateLimitService.initCleanup()
 * 26. 认证会话清理（每30分钟）- 迁移自 AuthenticationSession.scheduleCleanup()，修复未调用bug
 * 27. 抽奖引擎缓存清理（每10分钟）- 合并 CacheManager + ManagementStrategy
 * 28. 业务缓存监控（每10分钟）- 激活 BusinessCacheHelper.startMonitor()
 * 29. 管理员操作日志180天清理（每天凌晨3点）- admin_operation_logs 表清理
 * 30. WebSocket启动日志180天清理（每天凌晨3:30）- websocket_startup_logs 表清理
 *
 * 创建时间：2025-10-10
 * 更新时间：2026-01-30（定时任务统一管理改进方案 - 新增 Task 25-30，迁移散布的 setInterval）
 */

const cron = require('node-cron')
/*
 * P1-9：服务通过 ServiceManager 获取（snake_case key）
 * 移除直接 require 服务文件，改为在 initializeServices() 中通过 ServiceManager 获取
 * 以下服务统一通过 ServiceManager 获取：
 * - exchange_core (ExchangeService) - V4.7.0 拆分后
 * - admin_lottery_core (AdminLotteryCoreService) - V4.7.0 拆分后：核心干预操作
 * - admin_lottery_campaign (AdminLotteryCampaignService) - V4.7.0 拆分后：活动管理操作
 * - notification (NotificationService)
 * - trade_order (TradeOrderService)
 * - management_strategy (ManagementStrategy)
 */
const logger = require('../../utils/logger')
const { UserPremiumStatus, sequelize } = require('../../models')
const { Op } = sequelize.Sequelize
const BeijingTimeHelper = require('../../utils/timeHelper')
// 2025-11-09新增：数据库性能监控
const { monitor: databaseMonitor } = require('./database_performance_monitor')
// @deprecated 旧版每日资产对账已被统一对账脚本(scripts/reconcile-items.js)替代
// DailyAssetReconciliation 不再直接引用，任务12已委托给统一对账
// 🔴 移除 RedemptionService 直接引用（2025-12-17 P1-2）
// 原因：统一通过 jobs/daily-redemption-order-expiration.js 作为唯一入口
// 避免多处直接调用服务层方法，确保业务逻辑和报告格式统一

// 2025-12-29新增：资产域标准架构定时任务
const HourlyUnlockTimeoutTradeOrders = require('../../jobs/hourly-unlock-timeout-trade-orders')
// 2026-01-08新增：图片存储架构 - 未绑定图片清理
const HourlyCleanupUnboundImages = require('../../jobs/hourly-cleanup-unbound-images')
// 2026-01-08新增：交易市场材料交易 - 可叠加资产挂牌自动过期
const HourlyExpireFungibleAssetListings = require('../../jobs/hourly-expire-fungible-asset-listings')
// 2026-01-08新增：交易市场材料交易 - 市场挂牌异常监控
const HourlyMarketListingMonitor = require('../../jobs/hourly-market-listing-monitor')
// 2026-01-09新增：P0-2 孤儿冻结检测与清理（每天凌晨2点）
const DailyOrphanFrozenCheck = require('../../jobs/daily-orphan-frozen-check')
// 2026-01-14新增：图片资源数据质量门禁（图片缩略图架构兼容残留核查报告 Phase 1）
const DailyImageResourceQualityCheck = require('../../jobs/daily-image-resource-quality-check')
// 2026-01-19新增：定价配置定时生效（Phase 3 统一抽奖架构）
const HourlyPricingConfigScheduler = require('../../jobs/hourly-pricing-config-scheduler')
// 2026-01-23新增：抽奖策略引擎监控 - 小时级指标聚合
const HourlyLotteryMetricsAggregation = require('../../jobs/hourly-lottery-metrics-aggregation')
// 2026-01-23新增：抽奖策略引擎监控 - 日报级指标聚合
const DailyLotteryMetricsAggregation = require('../../jobs/daily-lottery-metrics-aggregation')
// 2026-01-31新增：智能提醒定时检测（P2阶段 B-32）
const ScheduledReminderCheck = require('../../jobs/scheduled-reminder-check')
// 2026-01-31新增：事务管理器（修复锁超时解锁事务边界问题）
const TransactionManager = require('../../utils/TransactionManager')
// 2026-01-31新增：定时报表推送（P2阶段 B-39）
const ScheduledReportPush = require('../../jobs/scheduled-report-push')
// 2026-01-31新增：分布式锁（P2定时任务防止重复执行）
const UnifiedDistributedLock = require('../../utils/UnifiedDistributedLock')
// 创建分布式锁实例（用于定时任务的锁控制）
const distributedLock = new UnifiedDistributedLock()

/**
 * 定时任务管理类
 *
 * @class ScheduledTasks
 * @description 负责管理所有定时任务的调度和执行
 */
class ScheduledTasks {
  /*
   * P1-9：服务实例（通过 ServiceManager 获取，使用 snake_case key）
   * 在 initializeServices() 中初始化，供定时任务使用
   * snake_case 服务键：
   * - exchange_core → ExchangeService（V4.7.0 拆分后）
   * - admin_lottery_core → AdminLotteryCoreService（V4.7.0 拆分后 - 核心干预操作）
   * - admin_lottery_campaign → AdminLotteryCampaignService（V4.7.0 拆分后 - 活动管理）
   * - notification → NotificationService
   * - trade_order → TradeOrderService
   * - management_strategy → ManagementStrategy
   * - unified_lottery_engine → UnifiedLotteryEngine（2026-01-30 新增，Task 27 缓存清理）
   */
  static ExchangeService = null
  static ExchangeAdminService = null // 2026-02-06 新增：管理后台操作（包含 checkTimeoutAndAlert）
  static AdminLotteryCoreService = null // V4.7.0 拆分后：核心干预操作
  static AdminLotteryCampaignService = null // V4.7.0 拆分后：活动管理操作
  static NotificationService = null
  static TradeOrderService = null
  static ManagementStrategy = null
  static UnifiedLotteryEngine = null // 2026-01-30 新增：用于 Task 27 CacheManager 缓存清理
  static _servicesInitialized = false

  /**
   * P1-9：初始化服务依赖（通过 ServiceManager 获取）
   *
   * @description 在定时任务执行前初始化所需的服务
   * @returns {Promise<void>} 初始化完成后返回
   */
  static async initializeServices() {
    if (this._servicesInitialized) {
      return
    }

    try {
      const serviceManager = require('../../services/index')

      if (!serviceManager._initialized) {
        await serviceManager.initialize()
      }

      /*
       * P1-9：使用 snake_case 服务键获取服务
       * V4.7.0 大文件拆分：
       * - exchange_market → exchange_core / exchange_admin
       * - admin_lottery → admin_lottery_core (核心干预) + admin_lottery_campaign (活动管理)
       * 2026-01-30 新增：unified_lottery_engine（用于 Task 27 CacheManager 缓存清理）
       * 2026-02-06 新增：exchange_admin（包含 checkTimeoutAndAlert 方法）
       */
      this.ExchangeService = serviceManager.getService('exchange_core') // V4.7.0 拆分后使用 exchange_core
      this.ExchangeAdminService = serviceManager.getService('exchange_admin') // 2026-02-06：管理后台操作
      this.AdminLotteryCoreService = serviceManager.getService('admin_lottery_core') // V4.7.0 拆分后：核心干预操作
      this.AdminLotteryCampaignService = serviceManager.getService('admin_lottery_campaign') // V4.7.0 拆分后：活动管理操作
      this.NotificationService = serviceManager.getService('notification')
      this.TradeOrderService = serviceManager.getService('trade_order')
      this.ManagementStrategy = serviceManager.getService('management_strategy')
      this.UnifiedLotteryEngine = serviceManager.getService('unified_lottery_engine') // 2026-01-30 新增

      this._servicesInitialized = true
      logger.info('[ScheduledTasks] 服务依赖初始化完成（V4.7.0 拆分后服务键）', {
        services: [
          'exchange_core',
          'exchange_admin',
          'admin_lottery_core',
          'admin_lottery_campaign',
          'notification',
          'trade_order',
          'management_strategy',
          'unified_lottery_engine'
        ]
      })
    } catch (error) {
      logger.error('[ScheduledTasks] 服务依赖初始化失败:', error.message)
      throw error
    }
  }

  /**
   * 初始化所有定时任务
   * @returns {void}
   */
  static initialize() {
    logger.info('开始初始化定时任务...')

    /*
     * P1-9：在定时任务初始化前先初始化服务依赖
     * 使用异步初始化，避免阻塞主线程
     */
    this.initializeServices().catch(error => {
      logger.error('[ScheduledTasks] 服务初始化失败:', error.message)
    })

    // 任务1: 每小时检查超时订单（24小时）
    this.scheduleTimeoutCheck()

    // 任务2: 每天检查超时订单（72小时，紧急告警）
    this.scheduleUrgentTimeoutCheck()

    // 任务3: 每天凌晨3点执行数据一致性检查
    this.scheduleDataConsistencyCheck()

    // 任务4: 每小时清理过期的抽奖管理设置（2025-11-08新增）
    this.scheduleLotteryManagementCleanup()

    // 任务5: 每小时检查即将过期的高级空间（2025-11-09新增）
    this.schedulePremiumExpiryReminder()

    // 任务6: 每天凌晨清理过期的高级空间状态（2025-11-09新增）
    this.schedulePremiumStatusCleanup()

    // 任务7: 每5分钟执行数据库性能监控（2025-11-09新增）
    this.scheduleDatabasePerformanceMonitor()

    // 任务8: 每天凌晨0点重置抽奖奖品每日中奖次数（2025-12-11新增）
    this.scheduleLotteryPrizesDailyReset()

    // 任务9: 每小时同步抽奖活动状态（2025-12-11新增）
    this.scheduleLotteryCampaignStatusSync()

    // 任务10: 每5分钟检查交易市场锁超时并解锁（2025-12-15新增）
    this.scheduleMarketListingLockTimeout()

    // 任务11: 每天凌晨2点清理过期核销码（2025-12-17新增）
    this.scheduleRedemptionOrderExpiration()

    // 任务12: 每天凌晨2点执行资产对账（2025-12-17新增）
    this.scheduleDailyAssetReconciliation()

    // 任务13: 每小时解锁超时交易订单（2025-12-29新增 - 资产域标准架构）
    this.scheduleHourlyUnlockTimeoutTradeOrders()

    // 任务15: 每小时执行业务记录关联对账（2026-01-05新增 - 事务边界治理）
    this.scheduleHourlyBusinessRecordReconciliation()

    // 任务16: 每小时清理未绑定图片（2026-01-08新增 - 图片存储架构）
    this.scheduleHourlyCleanupUnboundImages()

    // 任务17: 每小时过期超时的可叠加资产挂牌（2026-01-08新增 - 交易市场材料交易）
    this.scheduleHourlyExpireFungibleAssetListings()

    // 任务18: 每小时市场挂牌异常监控（2026-01-08新增 - 交易市场材料交易 Phase 2）
    this.scheduleHourlyMarketListingMonitor()

    // 任务19: 每天凌晨2点孤儿冻结检测与清理（2026-01-09新增 - P0-2修复）
    this.scheduleDailyOrphanFrozenCheck()

    // 任务20: 每天凌晨3点清理超过180天的商家操作日志（2026-01-12新增 - AC4.4 商家员工域权限体系升级）
    this.scheduleDailyMerchantAuditLogCleanup()

    // 任务21: 每天凌晨4点图片资源数据质量检查（2026-01-14新增 - 图片缩略图架构兼容残留核查报告 Phase 1）
    this.scheduleDailyImageResourceQualityCheck()

    // 任务22: 每小时第10分钟检查定价配置定时生效（2026-01-19新增 - Phase 3 统一抽奖架构）
    this.scheduleHourlyPricingConfigActivation()

    // 任务23: 每小时整点执行抽奖指标小时聚合（2026-01-23新增 - 策略引擎监控方案）
    this.scheduleHourlyLotteryMetricsAggregation()

    // 任务24: 每天凌晨1点执行抽奖指标日报聚合（2026-01-23新增 - 策略引擎监控方案）
    this.scheduleDailyLotteryMetricsAggregation()

    // ========== 2026-01-30 定时任务统一管理改进方案新增 ==========

    // 任务25: 每10分钟清理聊天限流记录（内存级别，无需分布式锁）
    this.scheduleRateLimitRecordCleanup()

    // 任务26: 每30分钟清理过期认证会话（数据库级别，需要分布式锁）
    this.scheduleAuthSessionCleanup()

    // 任务27: 每10分钟清理抽奖引擎缓存（内存级别，无需分布式锁）
    this.scheduleLotteryEngineCacheCleanup()

    // 任务28: 每10分钟执行业务缓存监控（内存级别，无需分布式锁）
    this.scheduleBusinessCacheMonitor()

    // 任务29: 每天凌晨3:00清理超过180天的管理员操作日志（数据库级别，需要分布式锁）
    this.scheduleDailyAdminOperationLogCleanup()

    // 任务30: 每天凌晨3:30清理超过180天的WebSocket启动日志（数据库级别，需要分布式锁）
    this.scheduleDailyWebSocketStartupLogCleanup()

    // ========== 2026-01-31 P2阶段新增任务 ==========

    // 任务31: 每分钟执行智能提醒规则检测（B-32）
    this.scheduleSmartReminderCheck()

    // 任务32: 每小时第5分钟执行定时报表推送（B-39）
    this.scheduleReportPush()

    // ========== 2026-02-21 核销码系统升级方案新增 ==========

    // 任务33: 每天凌晨3:15积分商城订单自动确认收货（Phase 3 Step 3.3：发货7天后自动确认）
    this.scheduleExchangeOrderAutoConfirm()

    // ========== 2026-02-21 图片管理体系设计方案新增 ==========

    // 任务34: 每天凌晨5点图片存储一致性检测（HEAD请求验证Sealos文件真实存在）
    this.scheduleDailyImageStorageConsistencyCheck()

    // ========== 2026-02-23 统一对账定时任务 ==========

    // 任务35: 每小时第50分钟执行物品+资产统一对账（物品守恒+持有者一致+铸造数量+资产守恒+余额一致）
    this.scheduleHourlyUnifiedReconciliation()

    // 任务36: 每10分钟检查 item_holds 过期记录并自动释放
    this.scheduleItemHoldsExpiration()

    // ========== 2026-02-23 市场价格快照聚合 ==========

    // 任务37: 每天凌晨1:15执行市场价格快照聚合（market_price_snapshots 预聚合）
    this.scheduleDailyMarketPriceSnapshot()

    logger.info('所有定时任务已初始化完成（包含统一对账+物品锁定过期释放+市场价格快照）')
  }

  /**
   * 定时任务1: 每小时检查超过24小时的待审核订单
   * Cron表达式: 0 * * * * (每小时的0分)
   * @returns {void}
   */
  static scheduleTimeoutCheck() {
    cron.schedule('0 * * * *', async () => {
      try {
        // P1-9：确保服务已初始化
        await ScheduledTasks.initializeServices()

        logger.info('[定时任务] 开始执行24小时超时订单检查...')
        const result = await ScheduledTasks.ExchangeAdminService.checkTimeoutAndAlert(24)

        if (result.hasTimeout) {
          logger.warn(`[定时任务] 发现${result.count}个超时订单（24小时）`)
        } else {
          logger.info('[定时任务] 24小时超时订单检查完成，无超时订单')
        }
      } catch (error) {
        logger.error('[定时任务] 24小时超时订单检查失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 24小时超时订单检查（每小时执行）')
  }

  /**
   * 定时任务2: 每天9点和18点检查超过72小时的待审核订单（紧急告警）
   * Cron表达式: 0 9,18 * * * (每天9点和18点)
   * @returns {void}
   */
  static scheduleUrgentTimeoutCheck() {
    cron.schedule('0 9,18 * * *', async () => {
      try {
        // P1-9：确保服务已初始化
        await ScheduledTasks.initializeServices()

        logger.info('[定时任务] 开始执行72小时紧急超时订单检查...')
        const result = await ScheduledTasks.ExchangeAdminService.checkTimeoutAndAlert(72)

        if (result.hasTimeout) {
          logger.error(`[定时任务] 🚨 发现${result.count}个紧急超时订单（72小时）`)
          // 扩展点：如需发送紧急通知（钉钉/企业微信），可在此处集成 ScheduledTasks.NotificationService
        } else {
          logger.info('[定时任务] 72小时超时订单检查完成，无超时订单')
        }
      } catch (error) {
        logger.error('[定时任务] 72小时超时订单检查失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 72小时紧急超时订单检查（每天9点和18点执行）')
  }

  /**
   * 定时任务3: 每天凌晨3点执行每日运营数据统计
   * Cron表达式: 0 3 * * * (每天凌晨3点)
   *
   * @description
   * 2026-02-06 重构：移除已归档的 data-consistency-check 模块引用
   * 改为执行超时订单检测和统计，数据一致性由专门的孤儿检测任务（Task 16）处理
   * @returns {void}
   */
  static scheduleDataConsistencyCheck() {
    cron.schedule('0 3 * * *', async () => {
      try {
        logger.info('[定时任务] 开始执行每日运营数据统计...')

        // P1-9：确保服务已初始化
        await ScheduledTasks.initializeServices()

        // 使用 ExchangeAdminService 检查超时订单
        const timeoutResult24h = await ScheduledTasks.ExchangeAdminService.checkTimeoutAndAlert(24)
        const timeoutResult72h = await ScheduledTasks.ExchangeAdminService.checkTimeoutAndAlert(72)

        logger.info('[定时任务] 每日订单超时检测完成', {
          over_24h_count: timeoutResult24h?.count || 0,
          over_72h_count: timeoutResult72h?.count || 0,
          has_24h_timeout: timeoutResult24h?.hasTimeout || false,
          has_72h_timeout: timeoutResult72h?.hasTimeout || false
        })

        // 如果有大量超时订单，发送告警
        if (timeoutResult24h?.count > 10) {
          logger.warn('[定时任务] ⚠️ 待审核订单积压', {
            over24h: timeoutResult24h.count,
            message: '超过24小时的待审核订单数量较多，请及时处理'
          })
        }

        if (timeoutResult72h?.count > 5) {
          logger.error('[定时任务] 🚨 待审核订单严重积压', {
            over72h: timeoutResult72h.count,
            message: '超过72小时的待审核订单数量较多，需要紧急处理'
          })
        }

        logger.info('[定时任务] 每日运营数据统计完成')
      } catch (error) {
        logger.error('[定时任务] 每日运营数据统计失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 每日运营数据统计（每天凌晨3点执行）')
  }

  /**
   * 手动触发24小时超时检查（用于测试）
   * @returns {Promise<Object>} 检查结果对象
   */
  static async manualTimeoutCheck() {
    logger.info('[手动触发] 执行24小时超时订单检查...')
    try {
      // P1-9：确保服务已初始化
      await ScheduledTasks.initializeServices()

      const result = await ScheduledTasks.ExchangeAdminService.checkTimeoutAndAlert(24)
      logger.info('[手动触发] 检查完成', { result })
      return result
    } catch (error) {
      logger.error('[手动触发] 检查失败', { error: error.message })
      throw error
    }
  }

  /**
   * 手动触发72小时紧急超时检查（用于测试）
   * @returns {Promise<Object>} 检查结果对象
   */
  static async manualUrgentTimeoutCheck() {
    logger.info('[手动触发] 执行72小时紧急超时订单检查...')
    try {
      // P1-9：确保服务已初始化
      await ScheduledTasks.initializeServices()

      const result = await ScheduledTasks.ExchangeAdminService.checkTimeoutAndAlert(72)
      logger.info('[手动触发] 检查完成', { result })
      return result
    } catch (error) {
      logger.error('[手动触发] 检查失败', { error: error.message })
      throw error
    }
  }

  /**
   * 定时任务4: 每小时清理过期的抽奖管理设置
   * Cron表达式: 0 * * * * (每小时的0分)
   *
   * 业务场景：自动清理数据库中已过期的active状态管理设置，释放存储空间
   *
   * 功能：
   * 1. 查询所有过期的active状态设置（expires_at < 当前时间）
   * 2. 批量更新状态为expired
   * 3. 清除相关的内存缓存
   * 4. 记录清理日志
   *
   * 创建时间：2025-11-08
   * @returns {void}
   */
  static scheduleLotteryManagementCleanup() {
    cron.schedule('0 * * * *', async () => {
      try {
        // P1-9：确保服务已初始化
        await ScheduledTasks.initializeServices()

        logger.info('[定时任务] 开始清理过期的抽奖管理设置...')

        // P1-9：通过 ServiceManager 获取 ManagementStrategy 服务
        const managementStrategy = ScheduledTasks.ManagementStrategy
        const result = await managementStrategy.cleanupExpiredSettings()

        if (result.cleaned_count > 0) {
          logger.info(`[定时任务] 清理完成：${result.cleaned_count}个过期设置已更新为expired状态`)
        } else {
          logger.info('[定时任务] 清理完成：无过期设置需要清理')
        }
      } catch (error) {
        logger.error('[定时任务] 抽奖管理设置清理失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 抽奖管理设置过期清理（每小时执行）')
  }

  /**
   * 手动触发抽奖管理设置清理（用于测试）
   *
   * 业务场景：手动清理过期设置，用于开发调试和即时清理
   *
   * @returns {Promise<Object>} 清理结果对象
   * @returns {number} return.cleaned_count - 清理的设置数量
   * @returns {string} return.timestamp - 清理时间戳
   *
   * @example
   * const ScheduledTasks = require('./scripts/maintenance/scheduled-tasks')
   * const result = await ScheduledTasks.manualLotteryManagementCleanup()
   * console.log(`清理了${result.cleaned_count}个过期设置`)
   *
   * 创建时间：2025-11-08
   */
  static async manualLotteryManagementCleanup() {
    logger.info('[手动触发] 执行抽奖管理设置清理...')
    try {
      // P1-9：确保服务已初始化
      await ScheduledTasks.initializeServices()

      // P1-9：通过 ServiceManager 获取 ManagementStrategy 服务
      const managementStrategy = ScheduledTasks.ManagementStrategy
      const result = await managementStrategy.cleanupExpiredSettings()
      logger.info('[手动触发] 清理完成', { result })
      return result
    } catch (error) {
      logger.error('[手动触发] 清理失败', { error: error.message })
      throw error
    }
  }

  /**
   * 定时任务5: 每小时检查即将过期的高级空间（提前2小时提醒）
   * Cron表达式: 0 * * * * (每小时的0分)
   *
   * 业务场景：提前通知用户高级空间即将过期（距离过期<2小时），提升用户体验
   *
   * 功能：
   * 1. 查询即将过期的高级空间（expires_at < 当前时间+2小时 AND expires_at > 当前时间）
   * 2. 通过NotificationService发送提醒通知
   * 3. 记录提醒日志
   *
   * ⚠️ 关键字段说明：
   * - UserPremiumStatus表没有status字段，使用is_unlocked字段
   * - is_unlocked: true=已解锁且有效，false=未解锁或已过期
   *
   * 创建时间：2025-11-09
   * @returns {void}
   */
  static schedulePremiumExpiryReminder() {
    cron.schedule('0 * * * *', async () => {
      try {
        // P1-9：确保服务已初始化
        await ScheduledTasks.initializeServices()

        logger.info('[定时任务] 开始检查即将过期的高级空间...')

        const now = new Date()
        const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000)

        // 查询即将过期的高级空间（距离过期<2小时）
        const expiringStatuses = await UserPremiumStatus.findAll({
          where: {
            is_unlocked: true,
            expires_at: {
              [Op.gt]: now,
              [Op.lte]: twoHoursLater
            }
          },
          attributes: ['user_id', 'expires_at', 'total_unlock_count']
        })

        if (expiringStatuses.length > 0) {
          logger.info(`[定时任务] 发现${expiringStatuses.length}个即将过期的高级空间`)

          // 发送提醒通知
          let successCount = 0
          for (const status of expiringStatuses) {
            try {
              const expiresAt = new Date(status.expires_at)
              const remainingMs = expiresAt - now
              const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60))
              const remainingMinutes = Math.ceil(remainingMs / (1000 * 60))

              // P1-9：通过 ServiceManager 获取 NotificationService
              await ScheduledTasks.NotificationService.notifyPremiumExpiringSoon(status.user_id, {
                expires_at: BeijingTimeHelper.formatForAPI(status.expires_at).iso,
                remaining_hours: remainingHours,
                remaining_minutes: remainingMinutes
              })

              successCount++
            } catch (error) {
              logger.error(`[定时任务] 发送过期提醒失败 (user_id: ${status.user_id})`, {
                error: error.message
              })
            }
          }

          logger.info(
            `[定时任务] 高级空间过期提醒发送完成：${successCount}/${expiringStatuses.length}`
          )
        } else {
          logger.info('[定时任务] 无即将过期的高级空间')
        }
      } catch (error) {
        logger.error('[定时任务] 高级空间过期提醒失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 高级空间过期提醒（每小时执行）')
  }

  /**
   * 定时任务6: 每天凌晨3点清理过期的高级空间状态
   * Cron表达式: 0 3 * * * (每天凌晨3点)
   *
   * 业务场景：自动清理已过期的高级空间状态，更新is_unlocked为false，发送过期通知
   *
   * 功能：
   * 1. 批量更新过期状态（is_unlocked: true → false）
   * 2. 发送过期通知给用户
   * 3. 记录清理日志
   *
   * ⚠️ 关键字段说明：
   * - UserPremiumStatus表没有status字段，使用is_unlocked字段
   * - is_unlocked: true=已解锁且有效，false=未解锁或已过期
   *
   * 创建时间：2025-11-09
   * @returns {void}
   */
  static schedulePremiumStatusCleanup() {
    cron.schedule('0 3 * * *', async () => {
      try {
        logger.info('[定时任务] 开始清理过期的高级空间状态...')

        const now = new Date()

        // 批量更新过期状态
        const [updatedCount] = await UserPremiumStatus.update(
          { is_unlocked: false },
          {
            where: {
              is_unlocked: true,
              expires_at: {
                [Op.lt]: now
              }
            }
          }
        )

        if (updatedCount > 0) {
          logger.info(`[定时任务] 清理完成：${updatedCount}个过期高级空间状态已更新`)

          // 查询被更新的用户ID，发送过期通知
          const expiredUsers = await UserPremiumStatus.findAll({
            where: {
              is_unlocked: false,
              expires_at: {
                [Op.lt]: now,
                [Op.gt]: new Date(now.getTime() - 24 * 60 * 60 * 1000) // 最近24小时过期的
              }
            },
            attributes: ['user_id', 'expires_at', 'total_unlock_count']
          })

          // P1-9：确保服务已初始化（用于发送通知）
          await ScheduledTasks.initializeServices()

          // 发送过期通知
          let notifiedCount = 0
          for (const expired of expiredUsers) {
            try {
              // P1-9：通过 ServiceManager 获取 NotificationService
              await ScheduledTasks.NotificationService.notifyPremiumExpired(expired.user_id, {
                expired_at: BeijingTimeHelper.formatForAPI(expired.expires_at).iso,
                total_unlock_count: expired.total_unlock_count
              })
              notifiedCount++
            } catch (error) {
              logger.error(`[定时任务] 发送过期通知失败 (user_id: ${expired.user_id})`, {
                error: error.message
              })
            }
          }

          logger.info(`[定时任务] 过期通知发送完成：${notifiedCount}/${expiredUsers.length}`)
        } else {
          logger.info('[定时任务] 清理完成：无过期高级空间需要清理')
        }
      } catch (error) {
        logger.error('[定时任务] 高级空间状态清理失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 高级空间状态清理（每天凌晨3点执行）')
  }

  /**
   * 定时任务7: 每10分钟执行数据库性能监控
   * Cron表达式: 0,10,20,30,40,50 * * * * (每10分钟)
   *
   * 业务场景：
   * - 实施《数据库性能问题排查和优化方案.md》中的方案0（持续监控方案）
   * - 监控数据库连接数、慢查询频率等关键性能指标
   * - 在发现实际性能问题时提供数据支撑，判断是否需要优化
   *
   * 监控内容：
   * 1. 数据库连接数监控（告警阈值：>32为warning，>35为critical）
   * 2. 慢查询频率统计（告警阈值：>5次/小时为warning，>10次/小时为critical）
   *
   * 优化触发条件（基于文档3.4节）：
   * - 连接数>35持续1小时 → 执行方案1（调整连接池配置）
   * - 慢查询>10次/小时持续1天 → 执行方案1或2
   * - 登录响应>3秒持续1周 → 执行方案2（代码优化）
   *
   * ⚠️ 重要说明：
   * - 这是预防性监控，不是紧急优化
   * - 当前系统运行稳定，无需立即优化
   * - 只在监控数据达到触发条件时才执行优化
   *
   * 参考文档：docs/数据库性能问题排查和优化方案.md
   *
   * 创建时间：2025-11-09
   * @returns {void}
   */
  static scheduleDatabasePerformanceMonitor() {
    cron.schedule('0,10,20,30,40,50 * * * *', async () => {
      try {
        logger.info('[定时任务] 开始执行数据库性能监控...')

        // 执行性能监控检查
        const results = await databaseMonitor.performFullCheck()

        // 只在发现异常时输出详细信息
        if (results.overall_status !== 'normal') {
          logger.warn('[定时任务] ⚠️ 发现数据库性能异常', {
            overall_status: results.overall_status,
            connection_status: results.checks.connection_count.status,
            current_connections: results.checks.connection_count.current_connections,
            slow_query_count: results.checks.slow_query_stats.count,
            slow_query_hourly_rate: results.checks.slow_query_stats.hourly_rate
          })
        } else {
          logger.info('[定时任务] 数据库性能监控完成：状态正常')
        }
      } catch (error) {
        logger.error('[定时任务] 数据库性能监控失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 数据库性能监控（每10分钟执行）')
  }

  /**
   * 手动触发数据库性能监控（用于测试和调试）
   *
   * 业务场景：
   * - 手动检查数据库性能
   * - 生成性能监控报告
   * - 开发调试和验证监控功能
   *
   * @returns {Promise<string>} 格式化的性能监控报告
   *
   * @example
   * const ScheduledTasks = require('./scripts/maintenance/scheduled-tasks')
   * const report = await ScheduledTasks.manualDatabasePerformanceCheck()
   * console.log(report)
   *
   * 创建时间：2025-11-09
   */
  static async manualDatabasePerformanceCheck() {
    logger.info('[手动触发] 执行数据库性能监控...')
    try {
      const results = await databaseMonitor.performFullCheck()
      const report = databaseMonitor.generateReport(results)
      console.log(report)
      logger.info('[手动触发] 数据库性能监控完成')
      return report
    } catch (error) {
      logger.error('[手动触发] 数据库性能监控失败', { error: error.message })
      throw error
    }
  }

  /**
   * 定时任务8: 每天凌晨0点重置抽奖奖品每日中奖次数
   * Cron表达式: 0 0 * * * (每天凌晨0点)
   *
   * 业务场景：
   * - 每日凌晨自动重置所有奖品的今日中奖次数
   * - 确保每日中奖限制（max_daily_wins）正常工作
   * - 为新的一天的抽奖活动做准备
   *
   * 功能：
   * 1. 批量更新所有奖品的daily_win_count为0
   * 2. 记录重置日志和统计信息
   *
   * 架构设计：
   * - 从LotteryPrize模型迁移到AdminLotteryCampaignService（V4.7.0拆分后）
   * - ServiceManager key: admin_lottery_campaign
   * - 批处理逻辑应在Service层，Model层只保留字段定义
   *
   * 参考文档：docs/架构重构待办清单.md - 任务2.1
   *
   * 创建时间：2025-12-11
   * @returns {void}
   */
  static scheduleLotteryPrizesDailyReset() {
    cron.schedule('0 0 * * *', async () => {
      try {
        // P1-9：确保服务已初始化
        await ScheduledTasks.initializeServices()

        logger.info('[定时任务] 开始重置抽奖奖品每日中奖次数...')

        // V4.7.0 拆分后：通过 AdminLotteryCampaignService 执行活动管理操作
        const result = await ScheduledTasks.AdminLotteryCampaignService.resetDailyWinCounts()

        logger.info('[定时任务] 抽奖奖品每日中奖次数重置完成', {
          updated_count: result.updated_count,
          timestamp: result.timestamp
        })
      } catch (error) {
        logger.error('[定时任务] 抽奖奖品每日中奖次数重置失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 抽奖奖品每日中奖次数重置（每天凌晨0点执行）')
  }

  /**
   * 定时任务9: 每小时同步抽奖活动状态
   * Cron表达式: 0 * * * * (每小时的0分)
   *
   * 业务场景：
   * - 每小时自动检查并同步抽奖活动状态
   * - 自动开启到达开始时间的draft活动
   * - 自动结束已过结束时间的active活动
   * - 确保活动状态与时间保持一致
   *
   * 功能：
   * 1. 将符合条件的draft活动更新为active（start_time <= 现在 < end_time）
   * 2. 将过期的active活动更新为ended（end_time < 现在）
   * 3. 记录状态变更日志和统计信息
   *
   * 架构设计：
   * - 从LotteryCampaign模型迁移到AdminLotteryCampaignService（V4.7.0拆分后）
   * - ServiceManager key: admin_lottery_campaign
   * - 批处理逻辑应在Service层，Model层只保留字段定义
   *
   * 参考文档：docs/架构重构待办清单.md - 任务2.1
   *
   * 创建时间：2025-12-11
   * @returns {void}
   */
  static scheduleLotteryCampaignStatusSync() {
    cron.schedule('0 * * * *', async () => {
      try {
        // P1-9：确保服务已初始化
        await ScheduledTasks.initializeServices()

        logger.info('[定时任务] 开始同步抽奖活动状态...')

        // V4.7.0 拆分后：通过 AdminLotteryCampaignService 执行活动管理操作
        const result = await ScheduledTasks.AdminLotteryCampaignService.syncCampaignStatus()

        if (result.started > 0 || result.ended > 0) {
          logger.info('[定时任务] 抽奖活动状态同步完成', {
            started_count: result.started,
            ended_count: result.ended,
            timestamp: result.timestamp
          })
        } else {
          logger.info('[定时任务] 抽奖活动状态同步完成：无需更新')
        }
      } catch (error) {
        logger.error('[定时任务] 抽奖活动状态同步失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 抽奖活动状态同步（每小时执行）')
  }

  /**
   * 手动触发抽奖奖品每日中奖次数重置（用于测试）
   *
   * 业务场景：手动重置奖品每日中奖次数，用于开发调试和即时重置
   *
   * @returns {Promise<Object>} 重置结果对象
   * @returns {boolean} return.success - 是否成功
   * @returns {number} return.updated_count - 更新的奖品数量
   * @returns {Date} return.timestamp - 重置时间戳
   *
   * @example
   * const ScheduledTasks = require('./scripts/maintenance/scheduled-tasks')
   * const result = await ScheduledTasks.manualLotteryPrizesDailyReset()
   * console.log(`重置了${result.updated_count}个奖品的每日中奖次数`)
   *
   * 创建时间：2025-12-11
   */
  static async manualLotteryPrizesDailyReset() {
    logger.info('[手动触发] 执行抽奖奖品每日中奖次数重置...')
    try {
      // P1-9：确保服务已初始化
      await ScheduledTasks.initializeServices()

      // V4.7.0 拆分后：通过 AdminLotteryCampaignService 执行活动管理操作
      const result = await ScheduledTasks.AdminLotteryCampaignService.resetDailyWinCounts()
      logger.info('[手动触发] 重置完成', { result })
      return result
    } catch (error) {
      logger.error('[手动触发] 重置失败', { error: error.message })
      throw error
    }
  }

  /**
   * 手动触发抽奖活动状态同步（用于测试）
   *
   * 业务场景：手动同步活动状态，用于开发调试和即时同步
   *
   * @returns {Promise<Object>} 同步结果对象
   * @returns {boolean} return.success - 是否成功
   * @returns {number} return.started - 开始的活动数量
   * @returns {number} return.ended - 结束的活动数量
   * @returns {Date} return.timestamp - 同步时间戳
   *
   * @example
   * const ScheduledTasks = require('./scripts/maintenance/scheduled-tasks')
   * const result = await ScheduledTasks.manualLotteryCampaignStatusSync()
   * console.log(`启动了${result.started}个活动，结束了${result.ended}个活动`)
   *
   * 创建时间：2025-12-11
   */
  static async manualLotteryCampaignStatusSync() {
    logger.info('[手动触发] 执行抽奖活动状态同步...')
    try {
      // P1-9：确保服务已初始化
      await ScheduledTasks.initializeServices()

      // V4.7.0 拆分后：通过 AdminLotteryCampaignService 执行活动管理操作
      const result = await ScheduledTasks.AdminLotteryCampaignService.syncCampaignStatus()
      logger.info('[手动触发] 同步完成', { result })
      return result
    } catch (error) {
      logger.error('[手动触发] 同步失败', { error: error.message })
      throw error
    }
  }

  /**
   * 定时任务10: 每5分钟检查交易市场锁超时并解锁
   * Cron表达式: 每5分钟执行一次 (星/5 * * * *)
   *
   * 业务场景：
   * - 扫描 market_listings 表中 status=locked 且 locked_at 超时（默认15分钟）的挂牌
   * - 自动取消订单并解冻买家资产
   * - 回滚挂牌状态为 on_sale
   *
   * 创建时间：2025-12-15（Phase 2）
   * @returns {void}
   */
  static scheduleMarketListingLockTimeout() {
    cron.schedule('*/5 * * * *', async () => {
      try {
        logger.info('[定时任务] 开始检查交易市场锁超时...')
        const result = await this.checkAndUnlockTimeoutListings()

        if (result.unlocked_count > 0) {
          logger.warn(`[定时任务] 解锁了${result.unlocked_count}个超时挂牌`)
        } else {
          logger.info('[定时任务] 交易市场锁超时检查完成，无超时挂牌')
        }
      } catch (error) {
        logger.error('[定时任务] 交易市场锁超时检查失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 交易市场锁超时解锁（每5分钟执行）')
  }

  /**
   * 检查并解锁超时的挂牌
   *
   * 业务规则：
   * - 扫描 status=locked 且 locked_at 超过15分钟的挂牌
   * - 查询关联订单（通过 locked_by_order_id）
   * - 取消订单并解冻买家资产
   * - 回滚挂牌状态为 on_sale
   *
   * P1-9 改造说明：
   * - 模型访问通过顶层 require 的 models 对象获取（符合 D2-Max 规范）
   * - TradeOrderService 通过 ServiceManager 获取（snake_case key: trade_order）
   *
   * @returns {Promise<Object>} 结果对象 {unlocked_count, failed_count, details}
   */
  static async checkAndUnlockTimeoutListings() {
    // P1-9：确保服务已初始化
    await ScheduledTasks.initializeServices()

    // P1-9：通过顶层 models 导入获取模型（符合 D2-Max）
    const { MarketListing, TradeOrder } = require('../../models')

    try {
      // 1. 查询超时的挂牌（status=locked 且 locked_at 超过15分钟）
      const timeoutThreshold = new Date(Date.now() - 15 * 60 * 1000) // 15分钟前

      const timeoutListings = await MarketListing.findAll({
        where: {
          status: 'locked',
          locked_at: {
            [Op.lt]: timeoutThreshold
          }
        },
        include: [
          {
            model: TradeOrder,
            as: 'lockingOrder',
            where: {
              status: {
                [Op.in]: ['created', 'frozen']
              }
            },
            required: false
          }
        ]
      })

      logger.info(`[锁超时检查] 发现${timeoutListings.length}个超时挂牌`)

      if (timeoutListings.length === 0) {
        return {
          unlocked_count: 0,
          failed_count: 0,
          details: []
        }
      }

      // 2. 逐个处理超时挂牌
      let unlocked_count = 0
      let failed_count = 0
      const details = []

      // 2026-01-31修复：每个挂牌独立事务处理（部分成功模式）
      // 修复问题：TradeOrderService.cancelOrder() 需要事务支持
      for (const listing of timeoutListings) {
        try {
          const order = listing.lockingOrder

          if (!order) {
            // 没有关联订单，直接回滚挂牌状态（使用事务保证一致性）
            await TransactionManager.execute(
              async (transaction) => {
                await listing.update({
                  status: 'on_sale',
                  locked_by_order_id: null,
                  locked_at: null
                }, { transaction })
              },
              {
                maxRetries: 2,
                timeout: 10000,
                description: `锁超时解锁（无订单）market_listing_id=${listing.market_listing_id}`
              }
            )

            unlocked_count++
            details.push({
              market_listing_id: listing.market_listing_id,
              order_id: null,
              action: 'unlocked_without_order',
              success: true
            })

            logger.info(`[锁超时解锁] 挂牌${listing.market_listing_id}已解锁（无关联订单）`)
            continue
          }

          // 有关联订单，取消订单并解冻资产（使用事务包裹）
          const business_id = `timeout_unlock_${order.trade_order_id}_${Date.now()}`

          // P1-9：通过 ServiceManager 获取 TradeOrderService
          // 2026-01-31修复：传递事务参数，满足 cancelOrder 的事务边界要求
          await TransactionManager.execute(
            async (transaction) => {
              await ScheduledTasks.TradeOrderService.cancelOrder(
                {
                  trade_order_id: order.trade_order_id,
                  business_id,
                  cancel_reason: '订单超时自动取消（锁定超过15分钟）'
                },
                { transaction }
              )
            },
            {
              maxRetries: 2,
              timeout: 30000, // 取消订单涉及资产解冻，给更多时间
              description: `锁超时取消订单 trade_order_id=${order.trade_order_id}`
            }
          )

          unlocked_count++
          details.push({
            market_listing_id: listing.market_listing_id,
            order_id: order.order_id,
            action: 'cancelled_and_unlocked',
            success: true
          })

          logger.info(`[锁超时解锁] 订单${order.order_id}已取消，挂牌${listing.market_listing_id}已解锁`)
        } catch (error) {
          failed_count++
          details.push({
            market_listing_id: listing.market_listing_id,
            order_id: listing.locked_by_order_id,
            action: 'failed',
            success: false,
            error: error.message
          })

          logger.error(`[锁超时解锁] 处理挂牌${listing.market_listing_id}失败`, {
            error: error.message,
            stack: error.stack
          })
        }
      }

      logger.info(`[锁超时检查] 完成：解锁${unlocked_count}个，失败${failed_count}个`)

      return {
        unlocked_count,
        failed_count,
        details
      }
    } catch (error) {
      logger.error('[锁超时检查] 执行失败', { error: error.message })
      throw error
    }
  }

  /**
   * 手动触发交易市场锁超时检查
   *
   * 业务场景：管理员手动触发锁超时检查（不等定时任务）
   *
   * 使用示例：
   * const result = await ScheduledTasks.manualMarketListingLockTimeout()
   * console.log(`解锁了${result.unlocked_count}个超时挂牌`)
   *
   * 创建时间：2025-12-15
   * @returns {Promise<Object>} 结果对象 {unlocked_count, failed_count, details}
   */
  static async manualMarketListingLockTimeout() {
    logger.info('[手动触发] 执行交易市场锁超时检查...')
    try {
      const result = await this.checkAndUnlockTimeoutListings()
      logger.info('[手动触发] 检查完成', { result })
      return result
    } catch (error) {
      logger.error('[手动触发] 检查失败', { error: error.message })
      throw error
    }
  }

  /**
   * 定时任务11: 每天凌晨2点清理过期核销码
   * Cron表达式: 0 2 * * * (每天凌晨2点)
   *
   * 业务场景：
   * - 每天凌晨自动扫描并标记过期的兑换订单（30天TTL）
   * - 将 status=pending 且 expires_at < 当前时间的订单更新为 expired
   * - 确保核销码系统的数据一致性
   *
   * 功能：
   * 1. 批量更新过期订单状态为 'expired'
   * 2. 记录过期数量和时间戳
   *
   * 创建时间：2025-12-17（Phase 1）
   * 统一入口（2025-12-17 P1-2）：
   * - 调用 jobs/daily-redemption-order-expiration.js 作为唯一权威入口
   * - 避免直接调用 RedemptionService，确保业务逻辑和报告统一
   * - 所有过期清理逻辑集中在 DailyRedemptionOrderExpiration 类中
   *
   * @returns {void}
   */
  static scheduleRedemptionOrderExpiration() {
    cron.schedule('0 2 * * *', async () => {
      const lockKey = 'lock:redemption_order_expiration'
      const lockValue = `${process.pid}_${Date.now()}` // 进程ID + 时间戳作为锁值
      let redisClient = null

      try {
        // 获取Redis客户端
        const { getRawClient } = require('../../utils/UnifiedRedisClient')
        redisClient = getRawClient()

        // 尝试获取分布式锁（10分钟过期）
        const acquired = await redisClient.set(lockKey, lockValue, 'EX', 600, 'NX')

        if (!acquired) {
          logger.info('[定时任务] 其他实例正在执行核销订单过期清理，跳过')
          return
        }

        logger.info('[定时任务] 获取分布式锁成功，开始执行每日核销订单过期清理...', {
          lock_key: lockKey,
          lock_value: lockValue
        })

        // 调用统一的 Job 类执行清理（唯一权威入口）
        const DailyRedemptionOrderExpiration = require('../../jobs/daily-redemption-order-expiration')
        const report = await DailyRedemptionOrderExpiration.execute()

        if (report.expired_count > 0) {
          logger.warn(`[定时任务] 每日核销订单过期清理完成：${report.expired_count}个订单已过期`)
        } else {
          logger.info('[定时任务] 每日核销订单过期清理完成：无过期订单')
        }

        // 释放锁
        await redisClient.del(lockKey)
        logger.info('[定时任务] 分布式锁已释放', { lock_key: lockKey })
      } catch (error) {
        logger.error('[定时任务] 核销订单过期清理失败', { error: error.message })

        // 确保释放锁
        if (redisClient) {
          try {
            await redisClient.del(lockKey)
          } catch (unlockError) {
            logger.error('[定时任务] 释放分布式锁失败', { error: unlockError.message })
          }
        }
      }
    })

    logger.info('✅ 定时任务已设置: 核销订单过期清理（每天凌晨2点执行，支持分布式锁）')
  }

  /**
   * 任务12: 每天凌晨2点执行每日资产对账
   *
   * @deprecated 已被任务35（scheduleHourlyUnifiedReconciliation）替代
   * 旧版仅做余额对比，新版覆盖物品守恒+资产双录守恒+余额一致性。
   * 保留此方法以避免调用链断裂，实际委托给统一对账脚本。
   *
   * Cron表达式: 0 2 * * * (每天凌晨2点)
   * @returns {void}
   */
  static scheduleDailyAssetReconciliation() {
    cron.schedule('0 2 * * *', async () => {
      try {
        logger.info('[定时任务] 每日资产对账（已委托给统一对账脚本）...')
        const { executeReconciliation } = require('../../scripts/reconcile-items')
        const report = await executeReconciliation({ autoFix: true })

        if (report.allPass) {
          logger.info('[定时任务] 每日资产对账（统一版）完成：全部通过')
        } else {
          logger.warn('[定时任务] 每日资产对账（统一版）完成：存在异常', {
            results: report.results
          })
        }
      } catch (error) {
        logger.error('[定时任务] 每日资产对账失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 每日资产对账（每天凌晨2点执行，支持分布式锁）')
  }

  /**
   * 手动触发每日资产对账（用于测试）
   *
   * 业务场景：手动执行资产对账，用于开发调试和即时检查
   *
   * @returns {Promise<Object>} 对账报告对象
   *
   * @example
   * const ScheduledTasks = require('./scripts/maintenance/scheduled-tasks')
   * const report = await ScheduledTasks.manualDailyAssetReconciliation()
   * console.log('对账状态:', report.status)
   * console.log('发现差异:', report.discrepancy_count)
   */
  static async manualDailyAssetReconciliation() {
    try {
      logger.info('[手动触发] 开始执行统一资产对账（物品守恒 + 资产双录守恒）...')
      const { executeReconciliation } = require('../../scripts/reconcile-items')
      const report = await executeReconciliation({ autoFix: true })

      logger.info('[手动触发] 统一资产对账完成', {
        allPass: report.allPass,
        results: report.results
      })

      return report
    } catch (error) {
      logger.error('[手动触发] 统一资产对账失败', { error: error.message })
      throw error
    }
  }

  /**
   * 手动触发核销订单过期清理（用于测试）
   *
   * 业务场景：手动清理过期核销订单，用于开发调试和即时清理
   *
   * @returns {Promise<Object>} 清理报告对象
   * @returns {number} return.expired_count - 过期的订单数量
   * @returns {string} return.timestamp - 执行时间
   * @returns {number} return.duration_ms - 执行耗时
   * @returns {string} return.status - 执行状态 (SUCCESS/ERROR)
   *
   * @example
   * const ScheduledTasks = require('./scripts/maintenance/scheduled-tasks')
   * const report = await ScheduledTasks.manualRedemptionOrderExpiration()
   * console.log(`清理了${report.expired_count}个过期核销订单`)
   *
   * 创建时间：2025-12-17
   * 统一入口（2025-12-17 P1-2）：调用 jobs/daily-redemption-order-expiration.js
   */
  static async manualRedemptionOrderExpiration() {
    logger.info('[手动触发] 执行核销订单过期清理...')
    try {
      // 使用统一的 Job 类（唯一权威入口）
      const DailyRedemptionOrderExpiration = require('../../jobs/daily-redemption-order-expiration')
      const report = await DailyRedemptionOrderExpiration.execute()

      logger.info('[手动触发] 清理完成', { expired_count: report.expired_count })
      return report
    } catch (error) {
      logger.error('[手动触发] 清理失败', { error: error.message })
      throw error
    }
  }

  /**
   * 定时任务13: 每小时告警超时商家审核单
   * Cron表达式: 0 * * * * (每小时的0分)
   *
   * 业务规则（拍板决策）：
   * - 只要没审核通过就不可以增加到可用积分中
   * - 冻结会无限期存在，接受用户资产长期不可用
   * - 超时兜底：仅推进状态 + 告警，不自动解冻
   *
   * 创建时间：2025-12-29（资产域标准架构）
   * @returns {void}
   */

  /**
   * 定时任务13: 每小时解锁超时交易订单
   * Cron表达式: 0 * * * * (每小时的0分)
   *
   * 业务规则：
   * - 物品锁定超时时间：3分钟
   * - 订单超时后：自动取消并解冻资产（与商家审核不同，可以自动解冻）
   * - 记录超时解锁事件到 item_ledger（物品账本）
   *
   * 创建时间：2025-12-29（资产域标准架构）
   * @returns {void}
   */
  static scheduleHourlyUnlockTimeoutTradeOrders() {
    cron.schedule('0 * * * *', async () => {
      try {
        logger.info('[定时任务] 开始执行交易市场超时解锁任务...')
        const report = await HourlyUnlockTimeoutTradeOrders.execute()

        if (report.total_released_items > 0 || report.total_cancelled_orders > 0) {
          logger.warn('[定时任务] 交易市场超时解锁完成（有超时数据）', {
            released_items: report.total_released_items,
            cancelled_orders: report.total_cancelled_orders,
            unfrozen_amount: report.total_unfrozen_amount
          })
        } else {
          logger.info('[定时任务] 交易市场超时解锁任务完成（无超时数据）')
        }
      } catch (error) {
        logger.error('[定时任务] 交易市场超时解锁任务失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 交易市场超时解锁（每小时执行）')
  }

  /**
   * 手动触发交易市场超时解锁（用于测试）
   *
   * @returns {Promise<Object>} 解锁报告对象
   */
  static async manualHourlyUnlockTimeoutTradeOrders() {
    logger.info('[手动触发] 执行交易市场超时解锁...')
    try {
      const report = await HourlyUnlockTimeoutTradeOrders.execute()
      logger.info('[手动触发] 交易市场超时解锁完成', {
        released_items: report.total_released_items,
        cancelled_orders: report.total_cancelled_orders
      })
      return report
    } catch (error) {
      logger.error('[手动触发] 交易市场超时解锁失败', { error: error.message })
      throw error
    }
  }

  /**
   * 定时任务15: 每小时执行业务记录关联对账
   * Cron表达式: 5 * * * * (每小时的第5分钟)
   *
   * 业务场景（事务边界治理 P1-3）：
   * - 检查 lottery_draws 与 asset_transactions 的关联完整性
   * - 检查 consumption_records（已审核通过）与 asset_transactions 的关联
   * - 检查 exchange_records 与 asset_transactions 的关联
   * - 发现问题时发送告警通知给管理员
   *
   * 创建时间：2026-01-05（事务边界治理）
   * @returns {void}
   */
  static scheduleHourlyBusinessRecordReconciliation() {
    cron.schedule('5 * * * *', async () => {
      try {
        logger.info('[定时任务] 开始执行业务记录关联对账（事务边界治理）...')

        // 调用 DailyAssetReconciliation 的业务记录对账方法
        const report = await DailyAssetReconciliation.executeBusinessRecordReconciliation()

        if (report.total_issues > 0) {
          logger.warn(`[定时任务] 业务记录关联对账完成：发现${report.total_issues}个问题`, {
            lottery_draws: report.lottery_draws.total_checked,
            consumption_records: report.consumption_records.total_checked,
            exchange_records: report.exchange_records.total_checked
          })
        } else {
          logger.info('[定时任务] 业务记录关联对账完成：无问题')
        }
      } catch (error) {
        logger.error('[定时任务] 业务记录关联对账失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 业务记录关联对账（每小时第5分钟执行）')
  }

  /**
   * 手动触发业务记录关联对账（用于测试）
   *
   * 业务场景：手动执行业务记录关联对账，用于开发调试和即时检查
   *
   * @returns {Promise<Object>} 对账报告对象
   *
   * @example
   * const ScheduledTasks = require('./scripts/maintenance/scheduled-tasks')
   * const report = await ScheduledTasks.manualBusinessRecordReconciliation()
   * console.log('问题数量:', report.total_issues)
   */
  static async manualBusinessRecordReconciliation() {
    try {
      logger.info('[手动触发] 开始执行业务记录关联对账...')
      const report = await DailyAssetReconciliation.executeBusinessRecordReconciliation()

      logger.info('[手动触发] 业务记录关联对账完成', {
        status: report.status,
        total_issues: report.total_issues,
        lottery_draws_checked: report.lottery_draws.total_checked,
        consumption_records_checked: report.consumption_records.total_checked,
        exchange_records_checked: report.exchange_records.total_checked
      })

      return report
    } catch (error) {
      logger.error('[手动触发] 业务记录关联对账失败', { error: error.message })
      throw error
    }
  }

  /**
   * 定时任务16: 每小时清理未绑定图片（context_id=0 超过24小时）
   * Cron表达式: 30 * * * * (每小时第30分钟)
   *
   * 业务场景（图片存储架构 2026-01-08）：
   * - context_id=0 表示图片已上传但未绑定到任何业务实体（如奖品、商品）
   * - 超过 24 小时未绑定视为孤立资源（上传后未使用或用户放弃操作）
   * - 自动清理孤立图片，释放 Sealos 对象存储空间和数据库记录
   *
   * 清理策略：
   * - 物理删除 Sealos 对象存储中的原图和所有缩略图
   * - 物理删除 image_resources 数据库记录
   * - 记录清理详情供审计追踪
   *
   * @returns {void}
   */
  static scheduleHourlyCleanupUnboundImages() {
    cron.schedule('30 * * * *', async () => {
      const lockKey = 'lock:cleanup_unbound_images'
      const lockValue = `${process.pid}_${Date.now()}`
      let redisClient = null

      try {
        // 获取 Redis 客户端
        const { getRawClient } = require('../../utils/UnifiedRedisClient')
        redisClient = getRawClient()

        // 尝试获取分布式锁（10分钟过期）
        const acquired = await redisClient.set(lockKey, lockValue, 'EX', 600, 'NX')

        if (!acquired) {
          logger.info('[定时任务] 其他实例正在执行未绑定图片清理，跳过')
          return
        }

        logger.info('[定时任务] 获取分布式锁成功，开始执行未绑定图片清理...', {
          lock_key: lockKey,
          lock_value: lockValue
        })

        // 调用 Job 类执行清理
        const report = await HourlyCleanupUnboundImages.execute(24)

        if (report.cleaned_count > 0) {
          logger.warn(`[定时任务] 未绑定图片清理完成：清理 ${report.cleaned_count} 个图片`)
        } else {
          logger.info('[定时任务] 未绑定图片清理完成：无需清理')
        }

        // 释放锁
        await redisClient.del(lockKey)
        logger.info('[定时任务] 分布式锁已释放', { lock_key: lockKey })
      } catch (error) {
        logger.error('[定时任务] 未绑定图片清理失败', { error: error.message })

        // 确保释放锁
        if (redisClient) {
          try {
            await redisClient.del(lockKey)
          } catch (unlockError) {
            logger.error('[定时任务] 释放分布式锁失败', { error: unlockError.message })
          }
        }
      }
    })

    logger.info('✅ 定时任务已设置: 未绑定图片清理（每小时第30分钟执行，支持分布式锁）')
  }

  /**
   * 手动触发未绑定图片清理（用于测试）
   *
   * 业务场景：手动执行未绑定图片清理，用于开发调试和即时清理
   *
   * @param {number} [hours=24] - 未绑定超过多少小时才清理
   * @returns {Promise<Object>} 清理报告对象
   *
   * @example
   * const ScheduledTasks = require('./scripts/maintenance/scheduled-tasks')
   * const report = await ScheduledTasks.manualCleanupUnboundImages(24)
   * console.log('清理数量:', report.cleaned_count)
   */
  static async manualCleanupUnboundImages(hours = 24) {
    try {
      logger.info('[手动触发] 开始执行未绑定图片清理...', { hours_threshold: hours })
      const report = await HourlyCleanupUnboundImages.execute(hours)

      logger.info('[手动触发] 未绑定图片清理完成', {
        cleaned_count: report.cleaned_count,
        failed_count: report.failed_count,
        duration_ms: report.duration_ms
      })

      return report
    } catch (error) {
      logger.error('[手动触发] 未绑定图片清理失败', { error: error.message })
      throw error
    }
  }

  /**
   * 定时任务17: 每小时过期超时的可叠加资产挂牌
   * Cron表达式: 15 * * * * (每小时第15分钟)
   *
   * 业务场景（交易市场材料交易 2026-01-08）：
   * - status='on_sale' 且 created_at > 3天的可叠加资产挂牌
   * - 自动撤回挂牌并解冻卖家资产
   * - 发送过期通知给卖家
   *
   * @returns {void}
   */
  static scheduleHourlyExpireFungibleAssetListings() {
    cron.schedule('15 * * * *', async () => {
      const lockKey = 'lock:expire_fungible_asset_listings'
      const lockValue = `${process.pid}_${Date.now()}`
      let redisClient = null

      try {
        // 获取 Redis 客户端
        const { getRawClient } = require('../../utils/UnifiedRedisClient')
        redisClient = getRawClient()

        // 尝试获取分布式锁（10分钟过期）
        const acquired = await redisClient.set(lockKey, lockValue, 'EX', 600, 'NX')

        if (!acquired) {
          logger.info('[定时任务] 其他实例正在执行可叠加资产挂牌过期，跳过')
          return
        }

        logger.info('[定时任务] 获取分布式锁成功，开始执行可叠加资产挂牌过期...', {
          lock_key: lockKey,
          lock_value: lockValue
        })

        // 调用 Job 类执行过期处理
        const report = await HourlyExpireFungibleAssetListings.execute()

        if (report.expired_count > 0) {
          logger.warn(`[定时任务] 可叠加资产挂牌过期完成：过期 ${report.expired_count} 个挂牌`)
        } else {
          logger.info('[定时任务] 可叠加资产挂牌过期完成：无需过期')
        }

        // 释放锁
        await redisClient.del(lockKey)
        logger.info('[定时任务] 分布式锁已释放', { lock_key: lockKey })
      } catch (error) {
        logger.error('[定时任务] 可叠加资产挂牌过期失败', { error: error.message })

        // 确保释放锁
        if (redisClient) {
          try {
            await redisClient.del(lockKey)
          } catch (unlockError) {
            logger.error('[定时任务] 释放分布式锁失败', { error: unlockError.message })
          }
        }
      }
    })

    logger.info('✅ 定时任务已设置: 可叠加资产挂牌过期（每小时第15分钟执行，支持分布式锁）')
  }

  /**
   * 手动触发可叠加资产挂牌过期（用于测试）
   *
   * 业务场景：手动执行挂牌过期处理，用于开发调试和即时清理
   *
   * @returns {Promise<Object>} 过期报告对象
   *
   * @example
   * const ScheduledTasks = require('./scripts/maintenance/scheduled-tasks')
   * const report = await ScheduledTasks.manualExpireFungibleAssetListings()
   * console.log('过期数量:', report.expired_count)
   */
  static async manualExpireFungibleAssetListings() {
    try {
      logger.info('[手动触发] 开始执行可叠加资产挂牌过期...')
      const report = await HourlyExpireFungibleAssetListings.execute()

      logger.info('[手动触发] 可叠加资产挂牌过期完成', {
        expired_count: report.expired_count,
        failed_count: report.failed_count,
        total_unfrozen_amount: report.total_unfrozen_amount,
        duration_ms: report.duration_ms
      })

      return report
    } catch (error) {
      logger.error('[手动触发] 可叠加资产挂牌过期失败', { error: error.message })
      throw error
    }
  }

  /**
   * 定时任务18: 每小时市场挂牌异常监控
   * Cron表达式: 45 * * * * (每小时第45分钟)
   *
   * 业务场景（交易市场材料交易 Phase 2 2026-01-08）：
   * - 监控价格异常挂牌（单价过高或过低）
   * - 监控超长时间挂牌（超过7天仍未成交）
   * - 监控冻结余额异常（冻结总额与挂牌不匹配）
   * - 发送监控告警给管理员
   *
   * @returns {void}
   */
  static scheduleHourlyMarketListingMonitor() {
    cron.schedule('45 * * * *', async () => {
      const lockKey = 'lock:market_listing_monitor'
      const lockValue = `${process.pid}_${Date.now()}`
      let redisClient = null

      try {
        // 获取 Redis 客户端
        const { getRawClient } = require('../../utils/UnifiedRedisClient')
        redisClient = getRawClient()

        // 尝试获取分布式锁（10分钟过期）
        const acquired = await redisClient.set(lockKey, lockValue, 'EX', 600, 'NX')

        if (!acquired) {
          logger.info('[定时任务] 其他实例正在执行市场挂牌监控，跳过')
          return
        }

        logger.info('[定时任务] 获取分布式锁成功，开始执行市场挂牌监控...', {
          lock_key: lockKey,
          lock_value: lockValue
        })

        // 调用 Job 类执行监控
        const report = await HourlyMarketListingMonitor.execute()

        const totalAnomalies =
          report.price_anomalies.length +
          report.long_listings.length +
          report.frozen_anomalies.length

        if (totalAnomalies > 0) {
          logger.warn(`[定时任务] 市场挂牌监控完成：发现 ${totalAnomalies} 条异常`, {
            price_anomalies: report.price_anomalies.length,
            long_listings: report.long_listings.length,
            frozen_anomalies: report.frozen_anomalies.length
          })
        } else {
          logger.info('[定时任务] 市场挂牌监控完成：无异常')
        }

        // 释放锁
        await redisClient.del(lockKey)
        logger.info('[定时任务] 分布式锁已释放', { lock_key: lockKey })
      } catch (error) {
        logger.error('[定时任务] 市场挂牌监控失败', { error: error.message })

        // 确保释放锁
        if (redisClient) {
          try {
            await redisClient.del(lockKey)
          } catch (unlockError) {
            logger.error('[定时任务] 释放分布式锁失败', { error: unlockError.message })
          }
        }
      }
    })

    logger.info('✅ 定时任务已设置: 市场挂牌异常监控（每小时第45分钟执行，支持分布式锁）')
  }

  /**
   * 手动触发市场挂牌异常监控（用于测试）
   *
   * 业务场景：手动执行市场监控，用于开发调试和即时检查
   *
   * @returns {Promise<Object>} 监控报告对象
   *
   * @example
   * const ScheduledTasks = require('./scripts/maintenance/scheduled-tasks')
   * const report = await ScheduledTasks.manualMarketListingMonitor()
   * console.log('价格异常数量:', report.price_anomalies.length)
   */
  static async manualMarketListingMonitor() {
    try {
      logger.info('[手动触发] 开始执行市场挂牌异常监控...')
      const report = await HourlyMarketListingMonitor.execute()

      logger.info('[手动触发] 市场挂牌监控完成', {
        price_anomalies: report.price_anomalies.length,
        long_listings: report.long_listings.length,
        frozen_anomalies: report.frozen_anomalies.length
      })

      return report
    } catch (error) {
      logger.error('[手动触发] 市场挂牌监控失败', { error: error.message })
      throw error
    }
  }

  /**
   * 定时任务19: 每天凌晨2点孤儿冻结检测与清理
   * Cron表达式: 0 2 * * * (每天凌晨2点)
   *
   * 业务场景（P0-2 修复 2026-01-09）：
   * - 检测孤儿冻结（frozen_amount > 实际活跃挂牌冻结总额）
   * - 自动清理孤儿冻结资产（解冻到可用余额）
   * - 发送告警通知给管理员
   * - 记录完整审计日志
   *
   * 决策记录：
   * - 固定每天凌晨2点执行（已拍板）
   * - 自动解冻机制已确认符合业务合规要求
   * - 使用 OrphanFrozenCleanupService 作为唯一入口
   * - 分布式锁已在 Job 层实现
   *
   * @returns {void}
   */
  static scheduleDailyOrphanFrozenCheck() {
    cron.schedule('0 2 * * *', async () => {
      const lockKey = 'lock:daily_orphan_frozen_check'
      const lockValue = `${process.pid}_${Date.now()}`
      let redisClient = null

      try {
        // 获取 Redis 客户端
        const { getRawClient } = require('../../utils/UnifiedRedisClient')
        redisClient = getRawClient()

        // 尝试获取分布式锁（30分钟过期，防止任务执行过长）
        const acquired = await redisClient.set(lockKey, lockValue, 'EX', 1800, 'NX')

        if (!acquired) {
          logger.info('[定时任务] 其他实例正在执行孤儿冻结检测，跳过')
          return
        }

        logger.info('[定时任务] 获取分布式锁成功，开始执行孤儿冻结检测...', {
          lock_key: lockKey,
          lock_value: lockValue
        })

        // 调用 Job 类执行孤儿冻结检测与清理
        const report = await DailyOrphanFrozenCheck.execute({
          dryRun: false, // 正式执行，非演练模式
          sendNotification: true // 发送通知给管理员
        })

        if (report.detection.orphan_count > 0) {
          logger.warn(
            `[定时任务] 孤儿冻结检测完成：发现 ${report.detection.orphan_count} 条孤儿冻结`,
            {
              total_orphan_amount: report.detection.total_orphan_amount,
              cleaned_count: report.cleanup?.cleaned_count || 0,
              failed_count: report.cleanup?.failed_count || 0,
              duration_ms: report.duration_ms
            }
          )
        } else {
          logger.info('[定时任务] 孤儿冻结检测完成：系统状态良好，无孤儿冻结')
        }

        // 释放锁
        await redisClient.del(lockKey)
        logger.info('[定时任务] 分布式锁已释放', { lock_key: lockKey })
      } catch (error) {
        logger.error('[定时任务] 孤儿冻结检测失败', { error: error.message })

        // 确保释放锁
        if (redisClient) {
          try {
            await redisClient.del(lockKey)
          } catch (unlockError) {
            logger.error('[定时任务] 释放分布式锁失败', { error: unlockError.message })
          }
        }
      }
    })

    logger.info('✅ 定时任务已设置: 孤儿冻结检测与清理（每天凌晨2点执行，支持分布式锁）')
  }

  /**
   * 手动触发孤儿冻结检测与清理（用于测试）
   *
   * 业务场景：手动执行孤儿冻结检测，用于开发调试和即时检查
   *
   * @param {Object} options - 执行选项
   * @param {boolean} [options.dryRun=true] - 是否为演练模式（默认true，仅检测不清理）
   * @param {boolean} [options.sendNotification=false] - 是否发送通知（默认false）
   * @returns {Promise<Object>} 检测报告对象
   *
   * @example
   * const ScheduledTasks = require('./scripts/maintenance/scheduled-tasks')
   * // 演练模式（仅检测）
   * const report = await ScheduledTasks.manualOrphanFrozenCheck({ dryRun: true })
   * console.log('孤儿冻结数量:', report.detection.orphan_count)
   *
   * // 正式执行（检测并清理）
   * const report = await ScheduledTasks.manualOrphanFrozenCheck({ dryRun: false })
   * console.log('清理数量:', report.cleanup?.cleaned_count)
   */
  static async manualOrphanFrozenCheck(options = {}) {
    const { dryRun = true, sendNotification = false } = options

    try {
      logger.info('[手动触发] 开始执行孤儿冻结检测...', { dryRun, sendNotification })
      const report = await DailyOrphanFrozenCheck.execute({ dryRun, sendNotification })

      logger.info('[手动触发] 孤儿冻结检测完成', {
        orphan_count: report.detection.orphan_count,
        total_orphan_amount: report.detection.total_orphan_amount,
        cleaned_count: report.cleanup?.cleaned_count || 0,
        duration_ms: report.duration_ms
      })

      return report
    } catch (error) {
      logger.error('[手动触发] 孤儿冻结检测失败', { error: error.message })
      throw error
    }
  }

  /**
   * 定时任务20: 每天凌晨3点清理超过180天的商家操作日志
   * Cron表达式: 0 3 * * * (每天凌晨3点)
   *
   * 业务场景（商家员工域权限体系升级 AC4.4 2026-01-12）：
   * - 商家操作日志（merchant_operation_logs）保留期限为180天
   * - 超过保留期限的日志自动删除，释放数据库空间
   * - 确保审计日志不会无限增长
   *
   * 清理策略：
   * - 删除 created_at < (当前时间 - 180天) 的记录
   * - 利用 created_at 索引高效查询
   * - 分批删除，避免长事务锁表
   * - 记录清理日志供运维追踪
   *
   * @returns {void}
   *
   * @since 2026-01-12
   * @see docs/商家员工域权限体系升级方案.md - AC4.4 审计日志保留策略
   */
  static scheduleDailyMerchantAuditLogCleanup() {
    cron.schedule('0 3 * * *', async () => {
      const lockKey = 'lock:merchant_audit_log_cleanup'
      const lockValue = `${process.pid}_${Date.now()}`
      let redisClient = null

      try {
        // 获取 Redis 客户端
        const { getRawClient } = require('../../utils/UnifiedRedisClient')
        redisClient = getRawClient()

        // 尝试获取分布式锁（10分钟过期）
        const acquired = await redisClient.set(lockKey, lockValue, 'EX', 600, 'NX')

        if (!acquired) {
          logger.info('[定时任务] 其他实例正在执行商家审计日志清理，跳过')
          return
        }

        logger.info('[定时任务] 获取分布式锁成功，开始执行商家审计日志180天清理...', {
          lock_key: lockKey,
          lock_value: lockValue
        })

        // 执行清理
        const report = await ScheduledTasks.cleanupMerchantAuditLogs(180)

        if (report.deleted_count > 0) {
          logger.warn(
            `[定时任务] 商家审计日志清理完成：删除 ${report.deleted_count} 条超过180天的记录`,
            {
              deleted_count: report.deleted_count,
              cutoff_date: report.cutoff_date,
              duration_ms: report.duration_ms
            }
          )
        } else {
          logger.info('[定时任务] 商家审计日志清理完成：无需清理')
        }

        // 释放锁
        await redisClient.del(lockKey)
        logger.info('[定时任务] 分布式锁已释放', { lock_key: lockKey })
      } catch (error) {
        logger.error('[定时任务] 商家审计日志清理失败', { error: error.message })

        // 确保释放锁
        if (redisClient) {
          try {
            await redisClient.del(lockKey)
          } catch (unlockError) {
            logger.error('[定时任务] 释放分布式锁失败', { error: unlockError.message })
          }
        }
      }
    })

    logger.info('✅ 定时任务已设置: 商家审计日志180天清理（每天凌晨3点执行，支持分布式锁）')
  }

  /**
   * 清理超过指定天数的商家操作日志
   *
   * @param {number} retentionDays - 保留天数（默认180天）
   * @returns {Promise<Object>} 清理报告
   * @returns {number} return.deleted_count - 删除的记录数
   * @returns {string} return.cutoff_date - 截止日期（北京时间）
   * @returns {number} return.duration_ms - 执行耗时（毫秒）
   *
   * @example
   * const report = await ScheduledTasks.cleanupMerchantAuditLogs(180)
   * console.log(`删除了 ${report.deleted_count} 条记录`)
   */
  static async cleanupMerchantAuditLogs(retentionDays = 180) {
    const startTime = Date.now()
    const { MerchantOperationLog } = require('../../models')

    // 计算截止日期（180天前）
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

    logger.info('[商家审计日志清理] 开始执行...', {
      retention_days: retentionDays,
      cutoff_date: BeijingTimeHelper.formatForAPI(cutoffDate).iso
    })

    try {
      // 分批删除，每批最多10000条，避免长事务
      const batchSize = 10000
      let totalDeleted = 0
      let hasMore = true

      while (hasMore) {
        // 使用 destroy 删除满足条件的记录
        const deletedCount = await MerchantOperationLog.destroy({
          where: {
            created_at: {
              [Op.lt]: cutoffDate
            }
          },
          limit: batchSize
        })

        totalDeleted += deletedCount

        // 如果删除数量小于批次大小，说明没有更多记录了
        if (deletedCount < batchSize) {
          hasMore = false
        } else {
          // 等待一小段时间，避免对数据库造成过大压力
          await new Promise(resolve => setTimeout(resolve, 100))
        }

        logger.info('[商家审计日志清理] 批次完成', {
          batch_deleted: deletedCount,
          total_deleted: totalDeleted
        })
      }

      const duration = Date.now() - startTime

      return {
        deleted_count: totalDeleted,
        cutoff_date: BeijingTimeHelper.formatForAPI(cutoffDate).iso,
        duration_ms: duration,
        status: 'SUCCESS'
      }
    } catch (error) {
      logger.error('[商家审计日志清理] 执行失败', { error: error.message })
      throw error
    }
  }

  /**
   * 手动触发商家审计日志清理（用于测试）
   *
   * 业务场景：手动执行商家审计日志清理，用于开发调试和即时清理
   *
   * @param {number} [retentionDays=180] - 保留天数
   * @returns {Promise<Object>} 清理报告对象
   *
   * @example
   * const ScheduledTasks = require('./scripts/maintenance/scheduled-tasks')
   * const report = await ScheduledTasks.manualMerchantAuditLogCleanup(180)
   * console.log('删除数量:', report.deleted_count)
   */
  static async manualMerchantAuditLogCleanup(retentionDays = 180) {
    try {
      logger.info('[手动触发] 开始执行商家审计日志清理...', { retention_days: retentionDays })
      const report = await ScheduledTasks.cleanupMerchantAuditLogs(retentionDays)

      logger.info('[手动触发] 商家审计日志清理完成', {
        deleted_count: report.deleted_count,
        cutoff_date: report.cutoff_date,
        duration_ms: report.duration_ms
      })

      return report
    } catch (error) {
      logger.error('[手动触发] 商家审计日志清理失败', { error: error.message })
      throw error
    }
  }

  /**
   * 定时任务21: 每天凌晨4点图片资源数据质量检查
   * Cron表达式: 0 4 * * * (每天凌晨4点)
   *
   * 业务场景（图片缩略图架构兼容残留核查报告 Phase 1 2026-01-14）：
   * - 检查 image_resources 表数据完整性
   * - 发现缺失 thumbnail_paths 的记录
   * - 发现 thumbnail_paths 不完整（缺少 small/medium/large）的记录
   * - 发现 file_path 格式异常（http://、https://、/ 开头）的记录
   * - 仅记录 ERROR 日志，不写数据库、不接告警系统
   *
   * @returns {void}
   *
   * @since 2026-01-14
   * @see docs/图片缩略图架构兼容残留核查报告-2026-01-13.md - 7.2 执行方案
   */
  static scheduleDailyImageResourceQualityCheck() {
    cron.schedule('0 4 * * *', async () => {
      const lockKey = 'lock:image_resource_quality_check'
      const lockValue = `${process.pid}_${Date.now()}`
      let redisClient = null

      try {
        // 获取 Redis 客户端
        const { getRawClient } = require('../../utils/UnifiedRedisClient')
        redisClient = getRawClient()

        // 尝试获取分布式锁（15分钟过期）
        const acquired = await redisClient.set(lockKey, lockValue, 'EX', 900, 'NX')

        if (!acquired) {
          logger.info('[定时任务] 其他实例正在执行图片资源数据质量检查，跳过')
          return
        }

        logger.info('[定时任务] 获取分布式锁成功，开始执行图片资源数据质量检查...', {
          lock_key: lockKey,
          lock_value: lockValue
        })

        // 调用 Job 类执行检查
        const report = await DailyImageResourceQualityCheck.execute()

        if (report.total_issues > 0) {
          logger.warn(`[定时任务] 图片资源数据质量检查完成：发现 ${report.total_issues} 个问题`, {
            total_checked: report.total_checked,
            missing_thumbnails: report.missing_thumbnails_count,
            incomplete_thumbnails: report.incomplete_thumbnails_count,
            invalid_file_paths: report.invalid_file_path_count,
            duration_ms: report.duration_ms
          })
        } else {
          logger.info('[定时任务] 图片资源数据质量检查完成：数据质量良好')
        }

        // 释放锁
        await redisClient.del(lockKey)
        logger.info('[定时任务] 分布式锁已释放', { lock_key: lockKey })
      } catch (error) {
        logger.error('[定时任务] 图片资源数据质量检查失败', { error: error.message })

        // 确保释放锁
        if (redisClient) {
          try {
            await redisClient.del(lockKey)
          } catch (unlockError) {
            logger.error('[定时任务] 释放分布式锁失败', { error: unlockError.message })
          }
        }
      }
    })

    logger.info('✅ 定时任务已设置: 图片资源数据质量检查（每天凌晨4点执行，支持分布式锁）')
  }

  /**
   * 手动触发图片资源数据质量检查（用于测试）
   *
   * 业务场景：手动执行图片资源数据质量检查，用于开发调试和即时检查
   *
   * @returns {Promise<Object>} 检查报告对象
   *
   * @example
   * const ScheduledTasks = require('./scripts/maintenance/scheduled-tasks')
   * const report = await ScheduledTasks.manualImageResourceQualityCheck()
   * console.log('问题数量:', report.total_issues)
   */
  static async manualImageResourceQualityCheck() {
    try {
      logger.info('[手动触发] 开始执行图片资源数据质量检查...')
      const report = await DailyImageResourceQualityCheck.execute()

      logger.info('[手动触发] 图片资源数据质量检查完成', {
        total_checked: report.total_checked,
        total_issues: report.total_issues,
        missing_thumbnails: report.missing_thumbnails_count,
        incomplete_thumbnails: report.incomplete_thumbnails_count,
        invalid_file_paths: report.invalid_file_path_count,
        duration_ms: report.duration_ms
      })

      return report
    } catch (error) {
      logger.error('[手动触发] 图片资源数据质量检查失败', { error: error.message })
      throw error
    }
  }

  /**
   * 定时任务22: 每小时第10分钟检查定价配置定时生效
   * Cron表达式: 10 * * * * (每小时第10分钟)
   *
   * 业务场景（Phase 3 统一抽奖架构 2026-01-19）：
   * - 检查所有 scheduled 状态的定价配置
   * - 如果 effective_at <= 当前时间，自动激活该版本
   * - 同活动有多个待生效版本时，仅激活最新版本
   *
   * @returns {void}
   *
   * @since 2026-01-19
   * @see docs/抽奖模块Strategy到Pipeline迁移方案新.md - Phase 3.3
   */
  static scheduleHourlyPricingConfigActivation() {
    cron.schedule('10 * * * *', async () => {
      const lockKey = 'lock:pricing_config_activation'
      const lockValue = `${process.pid}_${Date.now()}`
      let redisClient = null

      try {
        // 获取 Redis 客户端
        const { getRawClient } = require('../../utils/UnifiedRedisClient')
        redisClient = getRawClient()

        // 尝试获取分布式锁（5分钟过期）
        const acquired = await redisClient.set(lockKey, lockValue, 'EX', 300, 'NX')

        if (!acquired) {
          logger.info('[定时任务] 其他实例正在执行定价配置定时生效检查，跳过')
          return
        }

        logger.info('[定时任务] 获取分布式锁成功，开始执行定价配置定时生效检查...', {
          lock_key: lockKey,
          lock_value: lockValue
        })

        // 调用 Job 类执行
        const result = await HourlyPricingConfigScheduler.execute()

        if (result.activated > 0) {
          logger.info('[定时任务] 定价配置定时生效检查完成', {
            processed: result.processed,
            activated: result.activated,
            failed: result.failed,
            skipped: result.skipped
          })
        } else {
          logger.debug('[定时任务] 定价配置定时生效检查完成，无需激活的配置')
        }
      } catch (error) {
        logger.error('[定时任务] 定价配置定时生效检查失败', {
          error: error.message,
          stack: error.stack
        })
      } finally {
        // 释放分布式锁
        if (redisClient) {
          try {
            await redisClient.del(lockKey)
          } catch (unlockError) {
            logger.error('[定时任务] 释放分布式锁失败', { error: unlockError.message })
          }
        }
      }
    })

    logger.info('✅ 定时任务已设置: 定价配置定时生效检查（每小时第10分钟执行，支持分布式锁）')
  }

  /**
   * 手动触发定价配置定时生效检查（用于测试）
   *
   * 业务场景：手动执行定价配置定时生效检查，用于开发调试和即时检查
   *
   * @returns {Promise<Object>} 执行结果
   *
   * @example
   * const ScheduledTasks = require('./scripts/maintenance/scheduled-tasks')
   * const result = await ScheduledTasks.manualPricingConfigActivation()
   * console.log('激活数量:', result.activated)
   */
  static async manualPricingConfigActivation() {
    try {
      logger.info('[手动触发] 开始执行定价配置定时生效检查...')
      const result = await HourlyPricingConfigScheduler.execute()

      logger.info('[手动触发] 定价配置定时生效检查完成', {
        processed: result.processed,
        activated: result.activated,
        failed: result.failed,
        skipped: result.skipped,
        duration_ms: result.duration_ms
      })

      return result
    } catch (error) {
      logger.error('[手动触发] 定价配置定时生效检查失败', { error: error.message })
      throw error
    }
  }

  /**
   * 定时任务23: 每小时整点执行抽奖指标小时聚合
   * Cron表达式: 0 * * * * (每小时整点)
   *
   * 业务场景：
   * - 将 Redis 中实时采集的抽奖指标聚合到 MySQL lottery_hourly_metrics 表
   * - 清理已聚合的 Redis 数据，保持数据新鲜度
   * - 支持分布式锁，避免多实例重复执行
   *
   * @returns {void}
   *
   * @since 2026-01-23
   * @see docs/抽奖策略引擎监控方案.md
   */
  static scheduleHourlyLotteryMetricsAggregation() {
    cron.schedule('0 * * * *', async () => {
      const lockKey = 'lock:hourly_lottery_metrics_aggregation'
      const lockValue = `${process.pid}_${Date.now()}`
      let redisClient = null

      try {
        // 获取 Redis 客户端
        const { getRawClient } = require('../../utils/UnifiedRedisClient')
        redisClient = getRawClient()

        // 尝试获取分布式锁（5分钟过期）
        const acquired = await redisClient.set(lockKey, lockValue, 'EX', 300, 'NX')

        if (!acquired) {
          logger.info('[定时任务] 其他实例正在执行抽奖指标小时聚合，跳过')
          return
        }

        logger.info('[定时任务] 获取分布式锁成功，开始执行抽奖指标小时聚合...', {
          lock_key: lockKey,
          lock_value: lockValue
        })

        // 调用 Job 类执行
        const job = new HourlyLotteryMetricsAggregation()
        await job.execute()

        logger.info('[定时任务] 抽奖指标小时聚合完成')
      } catch (error) {
        logger.error('[定时任务] 抽奖指标小时聚合失败', {
          error: error.message,
          stack: error.stack
        })
      } finally {
        // 释放分布式锁
        if (redisClient) {
          try {
            await redisClient.del(lockKey)
          } catch (unlockError) {
            logger.error('[定时任务] 释放分布式锁失败', { error: unlockError.message })
          }
        }
      }
    })

    logger.info('✅ 定时任务已设置: 抽奖指标小时聚合（每小时整点执行，支持分布式锁）')
  }

  /**
   * 定时任务24: 每天凌晨1点执行抽奖指标日报聚合
   * Cron表达式: 0 1 * * * (每天凌晨1点)
   *
   * 业务场景：
   * - 将 lottery_hourly_metrics 的小时数据聚合到 lottery_daily_metrics 日报表
   * - 用于长期历史分析和运营决策
   * - 支持分布式锁，避免多实例重复执行
   *
   * @returns {void}
   *
   * @since 2026-01-23
   * @see docs/抽奖策略引擎监控方案.md
   */
  static scheduleDailyLotteryMetricsAggregation() {
    cron.schedule('0 1 * * *', async () => {
      const lockKey = 'lock:daily_lottery_metrics_aggregation'
      const lockValue = `${process.pid}_${Date.now()}`
      let redisClient = null

      try {
        // 获取 Redis 客户端
        const { getRawClient } = require('../../utils/UnifiedRedisClient')
        redisClient = getRawClient()

        // 尝试获取分布式锁（10分钟过期）
        const acquired = await redisClient.set(lockKey, lockValue, 'EX', 600, 'NX')

        if (!acquired) {
          logger.info('[定时任务] 其他实例正在执行抽奖指标日报聚合，跳过')
          return
        }

        logger.info('[定时任务] 获取分布式锁成功，开始执行抽奖指标日报聚合...', {
          lock_key: lockKey,
          lock_value: lockValue
        })

        // 调用 Job 类执行
        const job = new DailyLotteryMetricsAggregation()
        await job.execute()

        logger.info('[定时任务] 抽奖指标日报聚合完成')
      } catch (error) {
        logger.error('[定时任务] 抽奖指标日报聚合失败', {
          error: error.message,
          stack: error.stack
        })
      } finally {
        // 释放分布式锁
        if (redisClient) {
          try {
            await redisClient.del(lockKey)
          } catch (unlockError) {
            logger.error('[定时任务] 释放分布式锁失败', { error: unlockError.message })
          }
        }
      }
    })

    logger.info('✅ 定时任务已设置: 抽奖指标日报聚合（每天凌晨1点执行，支持分布式锁）')
  }

  /**
   * 手动触发抽奖指标小时聚合（用于测试）
   *
   * 业务场景：手动执行抽奖指标小时聚合，用于开发调试和即时检查
   *
   * @param {string} [target_hour_bucket] - 可选，指定要聚合的小时桶 (YYYY-MM-DD-HH)
   * @returns {Promise<void>} 执行完成
   *
   * @example
   * const ScheduledTasks = require('./scripts/maintenance/scheduled-tasks')
   * await ScheduledTasks.manualHourlyLotteryMetricsAggregation()
   */
  static async manualHourlyLotteryMetricsAggregation(target_hour_bucket = null) {
    try {
      logger.info('[手动触发] 开始执行抽奖指标小时聚合...')
      const job = new HourlyLotteryMetricsAggregation()
      await job.execute(target_hour_bucket)
      logger.info('[手动触发] 抽奖指标小时聚合完成')
    } catch (error) {
      logger.error('[手动触发] 抽奖指标小时聚合失败', { error: error.message })
      throw error
    }
  }

  /**
   * 手动触发抽奖指标日报聚合（用于测试）
   *
   * 业务场景：手动执行抽奖指标日报聚合，用于开发调试和即时检查
   *
   * @param {string} [target_date] - 可选，指定要聚合的日期 (YYYY-MM-DD)
   * @returns {Promise<void>} 执行完成
   *
   * @example
   * const ScheduledTasks = require('./scripts/maintenance/scheduled-tasks')
   * await ScheduledTasks.manualDailyLotteryMetricsAggregation('2026-01-22')
   */
  static async manualDailyLotteryMetricsAggregation(target_date = null) {
    try {
      logger.info('[手动触发] 开始执行抽奖指标日报聚合...')
      const job = new DailyLotteryMetricsAggregation()
      await job.execute(target_date)
      logger.info('[手动触发] 抽奖指标日报聚合完成')
    } catch (error) {
      logger.error('[手动触发] 抽奖指标日报聚合失败', { error: error.message })
      throw error
    }
  }

  // ========== 2026-01-30 定时任务统一管理改进方案 - 新增任务 (Task 25-30) ==========

  /**
   * 定时任务25: 每10分钟清理聊天限流记录
   * Cron表达式: 0,10,20,30,40,50 * * * * (每10分钟)
   *
   * 业务场景（定时任务统一管理改进 2026-01-30）：
   * - 迁移自 ChatRateLimitService.initCleanup() 中的 setInterval
   * - 清理内存中过期的用户消息时间戳、管理员消息时间戳、创建会话时间戳
   * - 内存级别操作，无需分布式锁
   * - 防止内存泄漏
   *
   * @returns {void}
   *
   * @since 2026-01-30
   * @see docs/定时任务统一管理改进方案.md - Task 25
   */
  static scheduleRateLimitRecordCleanup() {
    cron.schedule('*/10 * * * *', async () => {
      try {
        logger.debug('[定时任务] 开始执行聊天限流记录清理...')

        // 获取 ChatRateLimitService 实例并执行清理
        const ChatRateLimitService = require('../../services/ChatRateLimitService')
        const report = ChatRateLimitService.performCleanup()

        if (report.total_cleaned_entries > 0) {
          logger.info('[定时任务] 聊天限流记录清理完成', {
            user_messages_cleaned: report.user_messages_cleaned,
            admin_messages_cleaned: report.admin_messages_cleaned,
            create_session_cleaned: report.create_session_cleaned,
            total_cleaned_entries: report.total_cleaned_entries
          })
        } else {
          logger.debug('[定时任务] 聊天限流记录清理完成：无过期记录')
        }
      } catch (error) {
        logger.error('[定时任务] 聊天限流记录清理失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 聊天限流记录清理（每10分钟执行，内存级别，Task 25）')
  }

  /**
   * 手动触发聊天限流记录清理（用于测试）
   *
   * 业务场景：手动执行限流记录清理，用于开发调试和即时清理
   *
   * @returns {Promise<Object>} 清理报告对象
   *
   * @example
   * const ScheduledTasks = require('./scripts/maintenance/scheduled-tasks')
   * const report = await ScheduledTasks.manualRateLimitRecordCleanup()
   * console.log('清理数量:', report.total_cleaned)
   */
  static async manualRateLimitRecordCleanup() {
    try {
      logger.info('[手动触发] 开始执行聊天限流记录清理...')

      const ChatRateLimitService = require('../../services/ChatRateLimitService')
      const report = ChatRateLimitService.performCleanup()

      logger.info('[手动触发] 聊天限流记录清理完成', {
        user_messages_cleaned: report.user_messages_cleaned,
        admin_messages_cleaned: report.admin_messages_cleaned,
        create_session_cleaned: report.create_session_cleaned,
        total_cleaned_entries: report.total_cleaned_entries
      })

      return report
    } catch (error) {
      logger.error('[手动触发] 聊天限流记录清理失败', { error: error.message })
      throw error
    }
  }

  /**
   * 定时任务26: 每30分钟清理过期认证会话
   * Cron表达式: 0,30 * * * * (每30分钟)
   *
   * 业务场景（定时任务统一管理改进 2026-01-30）：
   * - 迁移自 AuthenticationSession.scheduleCleanup()
   * - 修复原有bug：该方法定义了但从未被调用
   * - 清理 expires_at < 当前时间 的过期会话
   * - 数据库级别操作，需要分布式锁防止多实例重复执行
   *
   * @returns {void}
   *
   * @since 2026-01-30
   * @see docs/定时任务统一管理改进方案.md - Task 26
   */
  static scheduleAuthSessionCleanup() {
    cron.schedule('0,30 * * * *', async () => {
      const lockKey = 'lock:auth_session_cleanup'
      const lockValue = `${process.pid}_${Date.now()}`
      let redisClient = null

      try {
        // 获取 Redis 客户端
        const { getRawClient } = require('../../utils/UnifiedRedisClient')
        redisClient = getRawClient()

        // 尝试获取分布式锁（5分钟过期）
        const acquired = await redisClient.set(lockKey, lockValue, 'EX', 300, 'NX')

        if (!acquired) {
          logger.info('[定时任务] 其他实例正在执行认证会话清理，跳过')
          return
        }

        logger.info('[定时任务] 获取分布式锁成功，开始执行认证会话清理...', {
          lock_key: lockKey,
          lock_value: lockValue
        })

        // 获取 AuthenticationSession 模型并执行清理
        const { AuthenticationSession } = require('../../models')
        const deletedCount = await AuthenticationSession.cleanupExpiredSessions()

        if (deletedCount > 0) {
          logger.info(`[定时任务] 认证会话清理完成：删除 ${deletedCount} 个过期会话`)
        } else {
          logger.info('[定时任务] 认证会话清理完成：无过期会话')
        }

        // 释放锁
        await redisClient.del(lockKey)
        logger.info('[定时任务] 分布式锁已释放', { lock_key: lockKey })
      } catch (error) {
        logger.error('[定时任务] 认证会话清理失败', { error: error.message })

        // 确保释放锁
        if (redisClient) {
          try {
            await redisClient.del(lockKey)
          } catch (unlockError) {
            logger.error('[定时任务] 释放分布式锁失败', { error: unlockError.message })
          }
        }
      }
    })

    logger.info('✅ 定时任务已设置: 认证会话清理（每30分钟执行，支持分布式锁，Task 26）')
  }

  /**
   * 手动触发认证会话清理（用于测试）
   *
   * 业务场景：手动执行认证会话清理，用于开发调试和即时清理
   *
   * @returns {Promise<Object>} 清理报告对象
   *
   * @example
   * const ScheduledTasks = require('./scripts/maintenance/scheduled-tasks')
   * const report = await ScheduledTasks.manualAuthSessionCleanup()
   * console.log('清理数量:', report.deleted_count)
   */
  static async manualAuthSessionCleanup() {
    try {
      logger.info('[手动触发] 开始执行认证会话清理...')

      const { AuthenticationSession } = require('../../models')
      const deletedCount = await AuthenticationSession.cleanupExpiredSessions()

      logger.info('[手动触发] 认证会话清理完成', { deleted_count: deletedCount })

      return { deleted_count: deletedCount, status: 'SUCCESS' }
    } catch (error) {
      logger.error('[手动触发] 认证会话清理失败', { error: error.message })
      throw error
    }
  }

  /**
   * 定时任务27: 每10分钟清理抽奖引擎缓存
   * Cron表达式: 0,10,20,30,40,50 * * * * (每10分钟)
   *
   * 业务场景（定时任务统一管理改进 2026-01-30）：
   * - 合并迁移自：
   *   - CacheManager.js 的构造函数 setInterval（每10分钟清理过期缓存）
   *   - ManagementStrategy.js 的 startCacheCleanup()（每30秒清理缓存）
   * - 统一使用10分钟清理周期
   * - 内存级别操作，无需分布式锁
   *
   * @returns {void}
   *
   * @since 2026-01-30
   * @see docs/定时任务统一管理改进方案.md - Task 27
   */
  static scheduleLotteryEngineCacheCleanup() {
    cron.schedule('*/10 * * * *', async () => {
      try {
        logger.debug('[定时任务] 开始执行抽奖引擎缓存清理...')

        let cacheManagerCleaned = 0
        let managementStrategyCleaned = 0

        // P1-9：确保服务已初始化
        await ScheduledTasks.initializeServices()

        // 1. 清理 CacheManager 缓存
        // 2026-01-30：通过 unified_lottery_engine 服务获取 cacheManager 实例
        try {
          const engine = ScheduledTasks.UnifiedLotteryEngine
          if (engine && engine.cacheManager && typeof engine.cacheManager.cleanup === 'function') {
            cacheManagerCleaned = engine.cacheManager.cleanup()
          }
        } catch (cmError) {
          logger.warn('[定时任务] CacheManager 清理失败（非致命）', { error: cmError.message })
        }

        // 2. 清理 ManagementStrategy 内存缓存
        try {

          const managementStrategy = ScheduledTasks.ManagementStrategy
          if (managementStrategy && typeof managementStrategy.cleanupMemoryCache === 'function') {
            managementStrategyCleaned = managementStrategy.cleanupMemoryCache()
          }
        } catch (msError) {
          logger.warn('[定时任务] ManagementStrategy 缓存清理失败（非致命）', {
            error: msError.message
          })
        }

        const totalCleaned = cacheManagerCleaned + managementStrategyCleaned

        if (totalCleaned > 0) {
          logger.info('[定时任务] 抽奖引擎缓存清理完成', {
            cache_manager_cleaned: cacheManagerCleaned,
            management_strategy_cleaned: managementStrategyCleaned,
            total_cleaned: totalCleaned
          })
        } else {
          logger.debug('[定时任务] 抽奖引擎缓存清理完成：无过期缓存')
        }
      } catch (error) {
        logger.error('[定时任务] 抽奖引擎缓存清理失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 抽奖引擎缓存清理（每10分钟执行，内存级别，Task 27）')
  }

  /**
   * 手动触发抽奖引擎缓存清理（用于测试）
   *
   * 业务场景：手动执行抽奖引擎缓存清理，用于开发调试和即时清理
   *
   * @returns {Promise<Object>} 清理报告对象
   *
   * @example
   * const ScheduledTasks = require('./scripts/maintenance/scheduled-tasks')
   * const report = await ScheduledTasks.manualLotteryEngineCacheCleanup()
   * console.log('清理数量:', report.total_cleaned)
   */
  static async manualLotteryEngineCacheCleanup() {
    try {
      logger.info('[手动触发] 开始执行抽奖引擎缓存清理...')

      // P1-9：确保服务已初始化
      await ScheduledTasks.initializeServices()

      let cacheManagerCleaned = 0
      let managementStrategyCleaned = 0

      // 1. 清理 CacheManager 缓存
      // 2026-01-30：通过 unified_lottery_engine 服务获取 cacheManager 实例
      try {
        const engine = ScheduledTasks.UnifiedLotteryEngine
        if (engine && engine.cacheManager && typeof engine.cacheManager.cleanup === 'function') {
          cacheManagerCleaned = engine.cacheManager.cleanup()
        }
      } catch (cmError) {
        logger.warn('[手动触发] CacheManager 清理失败', { error: cmError.message })
      }

      // 2. 清理 ManagementStrategy 内存缓存
      try {
        const managementStrategy = ScheduledTasks.ManagementStrategy
        if (managementStrategy && typeof managementStrategy.cleanupMemoryCache === 'function') {
          managementStrategyCleaned = managementStrategy.cleanupMemoryCache()
        }
      } catch (msError) {
        logger.warn('[手动触发] ManagementStrategy 缓存清理失败', { error: msError.message })
      }

      const report = {
        cache_manager_cleaned: cacheManagerCleaned,
        management_strategy_cleaned: managementStrategyCleaned,
        total_cleaned: cacheManagerCleaned + managementStrategyCleaned,
        status: 'SUCCESS'
      }

      logger.info('[手动触发] 抽奖引擎缓存清理完成', report)
      return report
    } catch (error) {
      logger.error('[手动触发] 抽奖引擎缓存清理失败', { error: error.message })
      throw error
    }
  }

  /**
   * 定时任务28: 每10分钟执行业务缓存监控
   * Cron表达式: 5,15,25,35,45,55 * * * * (每10分钟，错开Task 25/27的整10分钟)
   *
   * 业务场景（定时任务统一管理改进 2026-01-30）：
   * - 激活 BusinessCacheHelper.startMonitor()（原有方法定义但从未被调用）
   * - 输出缓存命中率统计报告
   * - 低命中率告警（<60%时发出警告）
   * - 内存级别操作，无需分布式锁
   *
   * @returns {void}
   *
   * @since 2026-01-30
   * @see docs/定时任务统一管理改进方案.md - Task 28
   */
  static scheduleBusinessCacheMonitor() {
    cron.schedule('*/10 * * * *', async () => {
      try {
        logger.debug('[定时任务] 开始执行业务缓存监控...')

        // 获取 BusinessCacheHelper 并执行监控
        // 2026-01-30：使用解构导入获取 BusinessCacheHelper 类
        const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')

        // 获取统计快照
        const snapshot = BusinessCacheHelper.getStatsSnapshot()

        // 记录监控日志
        logger.info('📊 [业务缓存监控] 统计报告', snapshot)

        // 检查告警条件（命中率低于60%且有足够样本）
        let hasLowHitRate = false
        Object.keys(snapshot).forEach(prefix => {
          const stats = snapshot[prefix]
          const hitRate = parseFloat(stats.hit_rate || '0')
          const totalRequests = (stats.hits || 0) + (stats.misses || 0)

          if (hitRate < 60 && totalRequests > 10) {
            logger.warn(`⚠️ [业务缓存监控] ${prefix} 缓存命中率偏低: ${hitRate}%`, {
              prefix,
              hit_rate: hitRate,
              total_requests: totalRequests
            })
            hasLowHitRate = true
          }
        })

        if (!hasLowHitRate) {
          logger.debug('[定时任务] 业务缓存监控完成：所有缓存命中率正常')
        }
      } catch (error) {
        logger.error('[定时任务] 业务缓存监控失败', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 业务缓存监控（每10分钟执行，内存级别，Task 28）')
  }

  /**
   * 手动触发业务缓存监控（用于测试）
   *
   * 业务场景：手动执行业务缓存监控，用于开发调试和即时检查
   *
   * @returns {Promise<Object>} 监控报告对象
   *
   * @example
   * const ScheduledTasks = require('./scripts/maintenance/scheduled-tasks')
   * const report = await ScheduledTasks.manualBusinessCacheMonitor()
   * console.log('缓存统计:', report)
   */
  static async manualBusinessCacheMonitor() {
    try {
      logger.info('[手动触发] 开始执行业务缓存监控...')

      // 2026-01-30：使用解构导入获取 BusinessCacheHelper 类
      const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')
      const snapshot = BusinessCacheHelper.getStatsSnapshot()

      logger.info('[手动触发] 业务缓存监控完成', { snapshot })

      return {
        snapshot,
        status: 'SUCCESS',
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      logger.error('[手动触发] 业务缓存监控失败', { error: error.message })
      throw error
    }
  }

  /**
   * 定时任务29: 每天凌晨3:00清理超过180天的管理员操作日志
   * Cron表达式: 0 3 * * * (每天凌晨3点)
   *
   * 业务场景（定时任务统一管理改进 2026-01-30）：
   * - 参照 Task 20（商家审计日志180天清理）的实现
   * - admin_operation_logs 表与 merchant_operation_logs 保留策略一致
   * - 数据库级别操作，需要分布式锁
   * - 分批删除，避免长事务锁表
   *
   * @returns {void}
   *
   * @since 2026-01-30
   * @see docs/定时任务统一管理改进方案.md - Task 29
   */
  static scheduleDailyAdminOperationLogCleanup() {
    cron.schedule('0 3 * * *', async () => {
      const lockKey = 'lock:admin_operation_log_cleanup'
      const lockValue = `${process.pid}_${Date.now()}`
      let redisClient = null

      try {
        // 获取 Redis 客户端
        const { getRawClient } = require('../../utils/UnifiedRedisClient')
        redisClient = getRawClient()

        // 尝试获取分布式锁（10分钟过期）
        const acquired = await redisClient.set(lockKey, lockValue, 'EX', 600, 'NX')

        if (!acquired) {
          logger.info('[定时任务] 其他实例正在执行管理员操作日志清理，跳过')
          return
        }

        logger.info('[定时任务] 获取分布式锁成功，开始执行管理员操作日志180天清理...', {
          lock_key: lockKey,
          lock_value: lockValue
        })

        // 执行清理
        const report = await ScheduledTasks.cleanupAdminOperationLogs(180)

        if (report.deleted_count > 0) {
          logger.warn(
            `[定时任务] 管理员操作日志清理完成：删除 ${report.deleted_count} 条超过180天的记录`,
            {
              deleted_count: report.deleted_count,
              cutoff_date: report.cutoff_date,
              duration_ms: report.duration_ms
            }
          )
        } else {
          logger.info('[定时任务] 管理员操作日志清理完成：无需清理')
        }

        // 释放锁
        await redisClient.del(lockKey)
        logger.info('[定时任务] 分布式锁已释放', { lock_key: lockKey })
      } catch (error) {
        logger.error('[定时任务] 管理员操作日志清理失败', { error: error.message })

        // 确保释放锁
        if (redisClient) {
          try {
            await redisClient.del(lockKey)
          } catch (unlockError) {
            logger.error('[定时任务] 释放分布式锁失败', { error: unlockError.message })
          }
        }
      }
    })

    logger.info('✅ 定时任务已设置: 管理员操作日志180天清理（每天凌晨3点执行，支持分布式锁，Task 29）')
  }

  /**
   * 清理超过指定天数的管理员操作日志
   *
   * @param {number} retentionDays - 保留天数（默认180天）
   * @returns {Promise<Object>} 清理报告
   * @returns {number} return.deleted_count - 删除的记录数
   * @returns {string} return.cutoff_date - 截止日期（北京时间）
   * @returns {number} return.duration_ms - 执行耗时（毫秒）
   *
   * @example
   * const report = await ScheduledTasks.cleanupAdminOperationLogs(180)
   * console.log(`删除了 ${report.deleted_count} 条记录`)
   */
  static async cleanupAdminOperationLogs(retentionDays = 180) {
    const startTime = Date.now()
    const { AdminOperationLog } = require('../../models')

    // 计算截止日期（180天前）
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

    logger.info('[管理员操作日志清理] 开始执行...', {
      retention_days: retentionDays,
      cutoff_date: BeijingTimeHelper.formatForAPI(cutoffDate).iso
    })

    try {
      // 分批删除，每批最多10000条，避免长事务
      const batchSize = 10000
      let totalDeleted = 0
      let hasMore = true

      while (hasMore) {
        // 使用 destroy 删除满足条件的记录
        const deletedCount = await AdminOperationLog.destroy({
          where: {
            created_at: {
              [Op.lt]: cutoffDate
            }
          },
          limit: batchSize
        })

        totalDeleted += deletedCount

        // 如果删除数量小于批次大小，说明没有更多记录了
        if (deletedCount < batchSize) {
          hasMore = false
        } else {
          // 等待一小段时间，避免对数据库造成过大压力
          await new Promise(resolve => setTimeout(resolve, 100))
        }

        logger.info('[管理员操作日志清理] 批次完成', {
          batch_deleted: deletedCount,
          total_deleted: totalDeleted
        })
      }

      const duration = Date.now() - startTime

      return {
        deleted_count: totalDeleted,
        cutoff_date: BeijingTimeHelper.formatForAPI(cutoffDate).iso,
        duration_ms: duration,
        status: 'SUCCESS'
      }
    } catch (error) {
      logger.error('[管理员操作日志清理] 执行失败', { error: error.message })
      throw error
    }
  }

  /**
   * 手动触发管理员操作日志清理（用于测试）
   *
   * 业务场景：手动执行管理员操作日志清理，用于开发调试和即时清理
   *
   * @param {number} [retentionDays=180] - 保留天数
   * @returns {Promise<Object>} 清理报告对象
   *
   * @example
   * const ScheduledTasks = require('./scripts/maintenance/scheduled-tasks')
   * const report = await ScheduledTasks.manualAdminOperationLogCleanup(180)
   * console.log('删除数量:', report.deleted_count)
   */
  static async manualAdminOperationLogCleanup(retentionDays = 180) {
    try {
      logger.info('[手动触发] 开始执行管理员操作日志清理...', { retention_days: retentionDays })
      const report = await ScheduledTasks.cleanupAdminOperationLogs(retentionDays)

      logger.info('[手动触发] 管理员操作日志清理完成', {
        deleted_count: report.deleted_count,
        cutoff_date: report.cutoff_date,
        duration_ms: report.duration_ms
      })

      return report
    } catch (error) {
      logger.error('[手动触发] 管理员操作日志清理失败', { error: error.message })
      throw error
    }
  }

  /**
   * 定时任务30: 每天凌晨3:30清理超过180天的WebSocket启动日志
   * Cron表达式: 30 3 * * * (每天凌晨3:30)
   *
   * 业务场景（定时任务统一管理改进 2026-01-30）：
   * - 与 Task 29（管理员操作日志）统一保留策略（180天）
   * - websocket_startup_logs 表用于监控和审计
   * - 数据库级别操作，需要分布式锁
   * - 分批删除，避免长事务锁表
   * - 错开 Task 29 的执行时间（3:00），避免资源竞争
   *
   * @returns {void}
   *
   * @since 2026-01-30
   * @see docs/定时任务统一管理改进方案.md - Task 30
   */
  static scheduleDailyWebSocketStartupLogCleanup() {
    cron.schedule('30 3 * * *', async () => {
      const lockKey = 'lock:websocket_startup_log_cleanup'
      const lockValue = `${process.pid}_${Date.now()}`
      let redisClient = null

      try {
        // 获取 Redis 客户端
        const { getRawClient } = require('../../utils/UnifiedRedisClient')
        redisClient = getRawClient()

        // 尝试获取分布式锁（10分钟过期）
        const acquired = await redisClient.set(lockKey, lockValue, 'EX', 600, 'NX')

        if (!acquired) {
          logger.info('[定时任务] 其他实例正在执行WebSocket启动日志清理，跳过')
          return
        }

        logger.info('[定时任务] 获取分布式锁成功，开始执行WebSocket启动日志180天清理...', {
          lock_key: lockKey,
          lock_value: lockValue
        })

        // 执行清理
        const report = await ScheduledTasks.cleanupWebSocketStartupLogs(180)

        if (report.deleted_count > 0) {
          logger.warn(
            `[定时任务] WebSocket启动日志清理完成：删除 ${report.deleted_count} 条超过180天的记录`,
            {
              deleted_count: report.deleted_count,
              cutoff_date: report.cutoff_date,
              duration_ms: report.duration_ms
            }
          )
        } else {
          logger.info('[定时任务] WebSocket启动日志清理完成：无需清理')
        }

        // 释放锁
        await redisClient.del(lockKey)
        logger.info('[定时任务] 分布式锁已释放', { lock_key: lockKey })
      } catch (error) {
        logger.error('[定时任务] WebSocket启动日志清理失败', { error: error.message })

        // 确保释放锁
        if (redisClient) {
          try {
            await redisClient.del(lockKey)
          } catch (unlockError) {
            logger.error('[定时任务] 释放分布式锁失败', { error: unlockError.message })
          }
        }
      }
    })

    logger.info(
      '✅ 定时任务已设置: WebSocket启动日志180天清理（每天凌晨3:30执行，支持分布式锁，Task 30）'
    )
  }

  /**
   * 清理超过指定天数的WebSocket启动日志
   *
   * @param {number} retentionDays - 保留天数（默认180天）
   * @returns {Promise<Object>} 清理报告
   * @returns {number} return.deleted_count - 删除的记录数
   * @returns {string} return.cutoff_date - 截止日期（北京时间）
   * @returns {number} return.duration_ms - 执行耗时（毫秒）
   *
   * @example
   * const report = await ScheduledTasks.cleanupWebSocketStartupLogs(180)
   * console.log(`删除了 ${report.deleted_count} 条记录`)
   */
  static async cleanupWebSocketStartupLogs(retentionDays = 180) {
    const startTime = Date.now()
    const { WebSocketStartupLog } = require('../../models')

    // 计算截止日期（180天前）
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

    logger.info('[WebSocket启动日志清理] 开始执行...', {
      retention_days: retentionDays,
      cutoff_date: BeijingTimeHelper.formatForAPI(cutoffDate).iso
    })

    try {
      // 分批删除，每批最多10000条，避免长事务
      const batchSize = 10000
      let totalDeleted = 0
      let hasMore = true

      while (hasMore) {
        // 使用 destroy 删除满足条件的记录
        const deletedCount = await WebSocketStartupLog.destroy({
          where: {
            created_at: {
              [Op.lt]: cutoffDate
            }
          },
          limit: batchSize
        })

        totalDeleted += deletedCount

        // 如果删除数量小于批次大小，说明没有更多记录了
        if (deletedCount < batchSize) {
          hasMore = false
        } else {
          // 等待一小段时间，避免对数据库造成过大压力
          await new Promise(resolve => setTimeout(resolve, 100))
        }

        logger.info('[WebSocket启动日志清理] 批次完成', {
          batch_deleted: deletedCount,
          total_deleted: totalDeleted
        })
      }

      const duration = Date.now() - startTime

      return {
        deleted_count: totalDeleted,
        cutoff_date: BeijingTimeHelper.formatForAPI(cutoffDate).iso,
        duration_ms: duration,
        status: 'SUCCESS'
      }
    } catch (error) {
      logger.error('[WebSocket启动日志清理] 执行失败', { error: error.message })
      throw error
    }
  }

  /**
   * 手动触发WebSocket启动日志清理（用于测试）
   *
   * 业务场景：手动执行WebSocket启动日志清理，用于开发调试和即时清理
   *
   * @param {number} [retentionDays=180] - 保留天数
   * @returns {Promise<Object>} 清理报告对象
   *
   * @example
   * const ScheduledTasks = require('./scripts/maintenance/scheduled-tasks')
   * const report = await ScheduledTasks.manualWebSocketStartupLogCleanup(180)
   * console.log('删除数量:', report.deleted_count)
   */
  static async manualWebSocketStartupLogCleanup(retentionDays = 180) {
    try {
      logger.info('[手动触发] 开始执行WebSocket启动日志清理...', { retention_days: retentionDays })
      const report = await ScheduledTasks.cleanupWebSocketStartupLogs(retentionDays)

      logger.info('[手动触发] WebSocket启动日志清理完成', {
        deleted_count: report.deleted_count,
        cutoff_date: report.cutoff_date,
        duration_ms: report.duration_ms
      })

      return report
    } catch (error) {
      logger.error('[手动触发] WebSocket启动日志清理失败', { error: error.message })
      throw error
    }
  }

  // ========== 2026-01-31 P2阶段新增任务（智能提醒与报表系统）==========

  /**
   * 定时任务31: 每分钟执行智能提醒规则检测
   *
   * 业务场景：检查到期的提醒规则，符合条件则触发通知
   * Cron表达式: * * * * * (每分钟)
   *
   * @since 2026-01-31
   * @see jobs/scheduled-reminder-check.js - B-32
   * @returns {void}
   */
  static scheduleSmartReminderCheck() {
    cron.schedule('* * * * *', async () => {
      try {
        // 使用 withLock 自动管理锁的获取和释放（30秒超时）
        await distributedLock.withLock('smart_reminder_check', async () => {
          await ScheduledReminderCheck.execute()
        }, { ttl: 30000, maxRetries: 1 })
      } catch (error) {
        // 如果获取锁失败或执行失败，记录错误（获取锁失败通常只是跳过本次执行）
        if (!error.message.includes('无法获取锁')) {
          logger.error('[智能提醒检测] 执行失败', {
            error: error.message,
            stack: error.stack
          })
        } else {
          logger.debug('[智能提醒检测] 未获取到锁，跳过本次执行')
        }
      }
    })

    logger.info('✅ 定时任务已设置: 智能提醒规则检测（每分钟执行，支持分布式锁，Task 31 B-32）')
  }

  /**
   * 定时任务32: 每小时第5分钟执行定时报表推送
   *
   * 业务场景：检查配置了定时推送的报表模板，生成并推送报表
   * Cron表达式: 5 * * * * (每小时第5分钟)
   *
   * @since 2026-01-31
   * @see jobs/scheduled-report-push.js - B-39
   * @returns {void}
   */
  static scheduleReportPush() {
    cron.schedule('5 * * * *', async () => {
      try {
        // 使用 withLock 自动管理锁的获取和释放（5分钟超时）
        await distributedLock.withLock('scheduled_report_push', async () => {
          await ScheduledReportPush.execute()
        }, { ttl: 300000, maxRetries: 1 })
      } catch (error) {
        // 如果获取锁失败或执行失败，记录错误
        if (!error.message.includes('无法获取锁')) {
          logger.error('[定时报表推送] 执行失败', {
            error: error.message,
            stack: error.stack
          })
        } else {
          logger.debug('[定时报表推送] 未获取到锁，跳过本次执行')
        }
      }
    })

    logger.info('✅ 定时任务已设置: 定时报表推送（每小时第5分钟执行，支持分布式锁，Task 32 B-39）')

    // ====== Task 33: 竞价结算定时任务（每分钟，臻选空间/幸运空间竞价功能 2026-02-16）======
    const BidSettlementJob = require('../../jobs/bid-settlement-job')
    cron.schedule('* * * * *', async () => {
      try {
        await BidSettlementJob.execute()
      } catch (error) {
        logger.error('[竞价结算任务] 执行异常', { error: error.message })
      }
    })

    logger.info('✅ 定时任务已设置: 竞价结算（每分钟执行，含 pending→active 激活 + 到期结算/流拍，Task 33）')
  }

  /**
   * 手动触发智能提醒检测（用于测试）
   *
   * @returns {Promise<Object>} 执行结果
   */
  static async manualSmartReminderCheck() {
    try {
      logger.info('[手动触发] 开始执行智能提醒检测...')
      const result = await ScheduledReminderCheck.execute()

      logger.info('[手动触发] 智能提醒检测完成', {
        rules_checked: result.rules_checked,
        rules_triggered: result.rules_triggered,
        notifications_sent: result.notifications_sent
      })

      return result
    } catch (error) {
      logger.error('[手动触发] 智能提醒检测失败', { error: error.message })
      throw error
    }
  }

  /**
   * 定时任务33: 每天凌晨3:15积分商城订单自动确认收货
   * Cron表达式: 15 3 * * * (每天凌晨3:15)
   *
   * 业务依据：决策4（积分商城确认收货）+ Phase 3 Step 3.3
   * 已发货超过7天未确认收货的订单自动确认
   *
   * @returns {void}
   */
  static scheduleExchangeOrderAutoConfirm() {
    cron.schedule('15 3 * * *', async () => {
      const lockKey = 'lock:exchange_order_auto_confirm'
      const lockValue = `${process.pid}_${Date.now()}`
      let redisClient = null

      try {
        const { getRawClient } = require('../../utils/UnifiedRedisClient')
        redisClient = getRawClient()

        const acquired = await redisClient.set(lockKey, lockValue, 'EX', 600, 'NX')

        if (!acquired) {
          logger.info('[定时任务33] 积分商城订单自动确认收货 - 其他实例正在执行，跳过')
          return
        }

        logger.info('[定时任务33] 开始执行积分商城订单自动确认收货...')

        const DailyExchangeOrderAutoConfirm = require('../../jobs/daily-exchange-order-auto-confirm')
        const report = await DailyExchangeOrderAutoConfirm.execute()

        logger.info('[定时任务33] 积分商城订单自动确认收货完成', {
          auto_confirmed_count: report.auto_confirmed_count,
          duration_ms: report.duration_ms
        })

        if (redisClient) {
          const currentValue = await redisClient.get(lockKey)
          if (currentValue === lockValue) {
            await redisClient.del(lockKey)
          }
        }
      } catch (error) {
        logger.error('[定时任务33] 积分商城订单自动确认收货失败', {
          error: error.message,
          stack: error.stack
        })

        if (redisClient) {
          try {
            const currentValue = await redisClient.get(lockKey)
            if (currentValue === lockValue) {
              await redisClient.del(lockKey)
            }
          } catch (unlockError) {
            logger.error('[定时任务33] 释放分布式锁失败', { error: unlockError.message })
          }
        }
      }
    })

    logger.info('[定时任务33] 积分商城订单自动确认收货任务已注册（每天 3:15 AM）')
  }

  /**
   * 手动触发定时报表推送（用于测试）
   *
   * @returns {Promise<Object>} 执行结果
   */
  static async manualReportPush() {
    try {
      logger.info('[手动触发] 开始执行定时报表推送...')
      const result = await ScheduledReportPush.execute()

      logger.info('[手动触发] 定时报表推送完成', {
        templates_checked: result.templates_checked,
        reports_generated: result.reports_generated,
        reports_pushed: result.reports_pushed
      })

      return result
    } catch (error) {
      logger.error('[手动触发] 定时报表推送失败', { error: error.message })
      throw error
    }
  }
  // ========== 2026-02-21 图片管理体系设计方案新增 ==========

  /**
   * 定时任务34: 每天凌晨5点图片存储一致性检测
   * Cron表达式: 0 5 * * * (每天凌晨5点)
   *
   * 业务场景（图片管理体系设计方案 §4.2 2026-02-21）：
   * - 通过 S3 HEAD 请求验证 image_resources 表中的图片文件在 Sealos 对象存储中真实存在
   * - 发现"数据库有记录但存储文件缺失"的不一致情况
   * - 仅记录 WARN 日志，不自动删除记录（防止误删）
   * - 分批处理（每批50条）+ 并发控制（每批5个HEAD请求），避免压垮存储服务
   *
   * @returns {void}
   * @since 2026-02-21
   */
  static scheduleDailyImageStorageConsistencyCheck() {
    cron.schedule('0 5 * * *', async () => {
      const lockKey = 'lock:image_storage_consistency_check'
      const lockValue = `${process.pid}_${Date.now()}`
      let redisClient = null

      try {
        const { getRawClient } = require('../../utils/UnifiedRedisClient')
        redisClient = getRawClient()

        // 尝试获取分布式锁（30分钟过期，大表检测可能耗时较长）
        const acquired = await redisClient.set(lockKey, lockValue, 'EX', 1800, 'NX')

        if (!acquired) {
          logger.info('[定时任务] 其他实例正在执行图片存储一致性检测，跳过')
          return
        }

        logger.info('[定时任务] 获取分布式锁成功，开始执行图片存储一致性检测...', {
          lock_key: lockKey,
          lock_value: lockValue
        })

        const DailyImageStorageConsistencyCheck = require('../../jobs/daily-image-storage-consistency-check')
        const report = await DailyImageStorageConsistencyCheck.execute()

        if (report.missing_count > 0) {
          logger.warn(`[定时任务] 图片存储一致性检测完成：发现 ${report.missing_count} 个文件缺失`, {
            total_checked: report.total_checked,
            missing_count: report.missing_count,
            duration_ms: report.duration_ms
          })
        } else {
          logger.info('[定时任务] 图片存储一致性检测完成：存储一致性良好')
        }

        await redisClient.del(lockKey)
        logger.info('[定时任务] 分布式锁已释放', { lock_key: lockKey })
      } catch (error) {
        logger.error('[定时任务] 图片存储一致性检测失败', { error: error.message })

        if (redisClient) {
          try {
            await redisClient.del(lockKey)
          } catch (unlockError) {
            logger.error('[定时任务] 释放分布式锁失败', { error: unlockError.message })
          }
        }
      }
    })

    logger.info('✅ 定时任务已设置: 图片存储一致性检测（每天凌晨5点执行，HEAD请求验证Sealos文件存在性）')
  }

  /**
   * 定时任务35: 每天凌晨4:30执行物品+资产统一对账
   * Cron表达式: 30 4 * * * (每天凌晨4:30)
   *
   * 覆盖范围：
   * - 物品守恒：SUM(delta) GROUP BY item_id 全部为 0
   * - 持有者一致：ledger 推导持有者 == items.owner_account_id
   * - 铸造数量一致：items 总数 == mint(delta=+1) 条数
   * - 资产全局守恒：SUM(delta_amount) GROUP BY asset_code
   * - 账户余额一致：流水聚合 == 余额记录
   *
   * @since 2026-02-23
   * @returns {void}
   */
  static scheduleHourlyUnifiedReconciliation() {
    cron.schedule('50 * * * *', async () => {
      try {
        logger.info('[定时任务] 开始执行物品+资产统一对账...')

        const { executeReconciliation } = require('../../scripts/reconcile-items')
        const report = await executeReconciliation()

        if (report.allPass) {
          logger.info('[定时任务] 统一对账完成：全部通过')
        } else {
          logger.warn('[定时任务] 统一对账完成：存在异常', { results: report.results })
        }
      } catch (error) {
        logger.error('[定时任务] 统一对账执行失败', {
          error: error.message,
          stack: error.stack
        })
      }
    })

    logger.info('✅ 定时任务已设置: 物品+资产统一对账（每小时第50分钟执行）')
  }

  /**
   * 任务36: item_holds 过期自动释放
   * Cron表达式: */10 * * * * (每10分钟)
   *
   * 检查 item_holds 表中已过期的锁定记录，自动释放。
   * 业务场景：交易市场挂牌超时、抽奖锁定超时等。
   *
   * @since 2026-02-23
   * @returns {void}
   */
  static scheduleItemHoldsExpiration() {
    cron.schedule('*/10 * * * *', async () => {
      const lockKey = 'lock:item_holds_expiration'

      try {
        const { getRawClient } = require('../../utils/UnifiedRedisClient')
        const redisClient = getRawClient()
        const acquired = await redisClient.set(lockKey, `${process.pid}_${Date.now()}`, 'EX', 300, 'NX')
        if (!acquired) return

        const { sequelize } = require('../../config/database')

        const [expiredHolds] = await sequelize.query(`
          SELECT hold_id, item_id, hold_type, holder_id, expires_at
          FROM item_holds
          WHERE expires_at IS NOT NULL AND expires_at < NOW()
          LIMIT 100
        `)

        if (expiredHolds.length === 0) {
          await redisClient.del(lockKey)
          return
        }

        logger.info(`[定时任务] 发现 ${expiredHolds.length} 个过期的 item_holds，开始释放...`)

        const holdIds = expiredHolds.map(h => h.hold_id)
        await sequelize.query(`
          DELETE FROM item_holds WHERE hold_id IN (:holdIds)
        `, { replacements: { holdIds } })

        // 更新 items 表的 status（如果该物品没有其他 hold 了，恢复为 available）
        const itemIds = [...new Set(expiredHolds.map(h => h.item_id))]
        await sequelize.query(`
          UPDATE items i
          SET i.status = 'available', i.updated_at = NOW()
          WHERE i.item_id IN (:itemIds)
            AND NOT EXISTS (SELECT 1 FROM item_holds h WHERE h.item_id = i.item_id)
            AND i.status = 'held'
        `, { replacements: { itemIds } })

        logger.info(`[定时任务] 已释放 ${expiredHolds.length} 个过期 item_holds`)
        await redisClient.del(lockKey)
      } catch (error) {
        logger.error('[定时任务] item_holds 过期释放失败', {
          error: error.message,
          stack: error.stack
        })
      }
    })

    logger.info('✅ 定时任务已设置: item_holds 过期自动释放（每10分钟检查）')
  }

  /**
   * 定时任务37: 每天凌晨1:15执行市场价格快照聚合
   * Cron表达式: 15 1 * * * (每天凌晨1:15)
   *
   * 业务场景（市场增强 2026-02-23）：
   * - 从 market_listings 聚合在售挂牌价格统计（最低/最高/平均、挂牌数）
   * - 从 trade_orders 聚合已完成交易成交统计（成交笔数、成交总额）
   * - 按 asset_code + listing_kind + price_asset_code 维度 UPSERT 到 market_price_snapshots
   * - 支持幂等执行（同一日期重复执行不会产生重复记录）
   *
   * @returns {void}
   */
  static scheduleDailyMarketPriceSnapshot() {
    const DailyMarketPriceSnapshot = require('../../jobs/daily-market-price-snapshot')

    cron.schedule('15 1 * * *', async () => {
      const lockKey = 'lock:daily_market_price_snapshot'

      try {
        const locked = await distributedLock.tryLock(lockKey, 300)
        if (!locked) {
          logger.warn('[定时任务37] 市场价格快照聚合获取分布式锁失败，跳过本次执行')
          return
        }

        logger.info('[定时任务37] 开始市场价格快照聚合')
        const report = await DailyMarketPriceSnapshot.execute()
        logger.info('[定时任务37] 市场价格快照聚合完成', report)
      } catch (error) {
        logger.error('[定时任务37] 市场价格快照聚合异常', {
          error: error.message,
          stack: error.stack
        })
      } finally {
        try {
          await distributedLock.unlock(lockKey)
        } catch (_e) { /* 锁已自动过期 */ }
      }
    })

    logger.info('✅ 定时任务已设置: 市场价格快照聚合（每天凌晨1:15）')
  }
}

module.exports = ScheduledTasks
