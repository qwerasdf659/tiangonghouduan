/**
 * 定时任务调度注册表
 *
 * 使用node-cron实现定时任务调度
 *
 * 职责（技术债务方案 7.4-1 拆分后，2026-07-11）：
 * - 纯调度注册表：cron 表达式 + jobs/ 模块引用 + 分布式锁包装
 * - 任务本体全部位于 jobs/ 目录（类 + static execute() 模式）
 * - manualXxx 手动触发方法保留在本类（对外接口不变），内部委托对应 jobs/ 模块
 * - initializeServices/initialize 装配职责保留在本文件
 *
 * 任务清单（任务号沿用历史编号）：
 * 1/2/3 超时订单检查与每日统计 → jobs/exchange-timeout-check-jobs.js
 * 5/6 高级空间过期提醒/状态清理 → jobs/hourly-premium-expiry-reminder.js / daily-premium-status-cleanup.js
 * 8/9 抽奖奖品每日重置/活动状态同步 → jobs/daily-lottery-prizes-reset.js / hourly-lottery-campaign-status-sync.js
 * 11 核销订单过期清理 → jobs/daily-redemption-order-expiration.js
 * 15 业务记录关联对账 → scripts/reconcile-items.js
 * 16 未绑定媒体清理 → jobs/hourly-cleanup-unbound-media.js
 * 20 商家审计日志180天清理 → jobs/daily-merchant-audit-log-cleanup.js
 * 21/21.5 媒体质量检查/回收站清理 → jobs/daily-media-file-quality-check.js / daily-media-trash-cleanup.js
 * 22 定价配置定时生效 → jobs/hourly-pricing-config-scheduler.js
 * 23/24 抽奖指标小时/日报聚合 → jobs/hourly-lottery-metrics-aggregation.js / daily-lottery-metrics-aggregation.js
 * 25-30 限流清理/认证会话/引擎缓存/缓存监控/管理员日志/WS日志 → jobs/ 对应文件
 * 31/32/33 智能提醒/报表推送/竞价结算 → jobs/scheduled-reminder-check.js / scheduled-report-push.js / bid-settlement-job.js
 * 33/34 订单自动确认/物流超时预警 → jobs/daily-exchange-order-auto-confirm.js / daily-shipping-timeout-scan.js
 * 34 媒体存储一致性检测 → jobs/daily-media-storage-consistency-check.js
 * 35/42 统一对账/SPU物化列对账 → scripts/reconcile-items.js
 * 36 item_holds 过期释放 → jobs/item-holds-expiration.js
 * 38 数据自动清理 → jobs/daily-data-cleanup.js
 * 39/40 定时上下架/库存预警 → jobs/exchange-item-auto-publish.js / hourly-exchange-stock-alert.js
 * 41 DIY 超时解冻 → jobs/hourly-diy-frozen-timeout.js
 * 44/45 限时装饰到期清理/抽奖告警检测 → jobs/daily-decoration-expiry.js / services/lottery/LotteryAlertDetectorService.js
 *
 * 创建时间：2025-10-10
 * 更新时间：2026-07-11（技术债务方案 7.4-1：任务本体迁入 jobs/，本文件退化为调度注册表）
 */

const cron = require('node-cron')
const logger = require('../../utils/logger')
const BeijingTimeHelper = require('../../utils/timeHelper')
// 任务12(核心对账)+任务15(业务记录关联对账)统一由 scripts/reconcile-items.js 提供
const { executeBusinessRecordReconciliation } = require('../reconcile-items')

// jobs/ 任务本体引用（既有 job 保持原样引用，新 job 为 7.4-1 拆分迁入）
const ExchangeTimeoutCheckJobs = require('../../jobs/exchange-timeout-check-jobs')
const HourlyPremiumExpiryReminder = require('../../jobs/hourly-premium-expiry-reminder')
const DailyPremiumStatusCleanup = require('../../jobs/daily-premium-status-cleanup')
const DailyLotteryPrizesReset = require('../../jobs/daily-lottery-prizes-reset')
const HourlyLotteryCampaignStatusSync = require('../../jobs/hourly-lottery-campaign-status-sync')
const HourlyCleanupUnboundMedia = require('../../jobs/hourly-cleanup-unbound-media')
const DailyMerchantAuditLogCleanup = require('../../jobs/daily-merchant-audit-log-cleanup')
const DailyMediaFileQualityCheck = require('../../jobs/daily-media-file-quality-check')
const DailyMediaTrashCleanup = require('../../jobs/daily-media-trash-cleanup')
const HourlyPricingConfigScheduler = require('../../jobs/hourly-pricing-config-scheduler')
const HourlyLotteryMetricsAggregation = require('../../jobs/hourly-lottery-metrics-aggregation')
const DailyLotteryMetricsAggregation = require('../../jobs/daily-lottery-metrics-aggregation')
const ChatRateLimitCleanup = require('../../jobs/chat-rate-limit-cleanup')
const LotteryEngineCacheCleanup = require('../../jobs/lottery-engine-cache-cleanup')
const BusinessCacheMonitor = require('../../jobs/business-cache-monitor')
const DailyAdminOperationLogCleanup = require('../../jobs/daily-admin-operation-log-cleanup')
const DailyWebSocketStartupLogCleanup = require('../../jobs/daily-websocket-startup-log-cleanup')
const ScheduledReminderCheck = require('../../jobs/scheduled-reminder-check')
const ScheduledReportPush = require('../../jobs/scheduled-report-push')
const ItemHoldsExpiration = require('../../jobs/item-holds-expiration')
const ExchangeItemAutoPublish = require('../../jobs/exchange-item-auto-publish')
const HourlyExchangeStockAlert = require('../../jobs/hourly-exchange-stock-alert')
const HourlyDiyFrozenTimeout = require('../../jobs/hourly-diy-frozen-timeout')
const DailyRedemptionOrderExpiration = require('../../jobs/daily-redemption-order-expiration')

// 分布式锁（P2定时任务防止重复执行）
const UnifiedDistributedLock = require('../../utils/UnifiedDistributedLock')
const distributedLock = new UnifiedDistributedLock()

/**
 * 定时任务管理类
 *
 * @class ScheduledTasks
 * @description 负责管理所有定时任务的调度注册与手动触发入口（任务本体位于 jobs/ 目录）
 */
class ScheduledTasks {
  /*
   * P1-9：服务实例（通过 ServiceManager 获取，使用 snake_case key）
   * 在 initializeServices() 中初始化，供定时任务使用
   */
  static ExchangeService = null
  static ExchangeAdminService = null // 2026-02-06 新增：管理后台操作（包含 checkTimeoutAndAlert）
  static AdminLotteryCampaignService = null // V4.7.0 拆分后：活动管理操作
  static NotificationService = null
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
       * 服务拆分：exchange_core（核心交易）/ exchange_admin（管理后台操作）
       *          admin_lottery_campaign（活动管理）
       */
      this.ExchangeService = serviceManager.getService('exchange_core') // V4.7.0 拆分后使用 exchange_core
      this.ExchangeAdminService = serviceManager.getService('exchange_admin') // 2026-02-06：管理后台操作
      this.AdminLotteryCampaignService = serviceManager.getService('admin_lottery_campaign') // V4.7.0 拆分后：活动管理操作
      this.NotificationService = serviceManager.getService('notification')
      this.UnifiedLotteryEngine = serviceManager.getService('unified_lottery_engine') // 2026-01-30 新增

      this._servicesInitialized = true
      logger.info('[ScheduledTasks] 服务依赖初始化完成（V4.7.0 拆分后服务键）', {
        services: [
          'exchange_core',
          'exchange_admin',
          'admin_lottery_campaign',
          'notification',
          'unified_lottery_engine'
        ]
      })
    } catch (error) {
      logger.error('[ScheduledTasks] 服务依赖初始化失败:', error.message)
      throw error
    }
  }

  /**
   * 以 Redis 原生分布式锁包装执行定时任务体（SET NX EX，锁 key/ttl/日志格式与拆分前一致）
   *
   * @param {Object} options - 锁与执行配置
   * @param {string} options.lockKey - Redis 锁 key
   * @param {number} options.ttl - 锁过期秒数
   * @param {string} options.skipMsg - 未抢到锁时的跳过日志
   * @param {string} [options.startMsg] - 抢到锁后的开始日志（省略则不输出，含 lock_key/lock_value 元数据）
   * @param {string} options.errorMsg - 执行失败时的错误日志
   * @param {boolean} [options.errorStack=false] - 错误日志是否附带堆栈
   * @param {string} [options.releaseMode='log'] - 释放模式：log(释放并记录)/silent(静默释放)/finally(finally中释放)/checked(校验锁值后释放)/keep-on-error(异常时不释放)
   * @param {string} [options.unlockErrorMsg='[定时任务] 释放分布式锁失败'] - 释放锁失败日志
   * @param {Function} options.run - 任务体（jobs/ 模块调用 + 结果日志）
   * @returns {Promise<void>} 执行完成
   */
  static async _runWithRedisLock(options) {
    const {
      lockKey,
      ttl,
      skipMsg,
      startMsg = null,
      errorMsg,
      errorStack = false,
      releaseMode = 'log',
      unlockErrorMsg = '[定时任务] 释放分布式锁失败',
      run
    } = options
    const lockValue = `${process.pid}_${Date.now()}`
    let redisClient = null

    /**
     * 按 releaseMode 释放分布式锁（checked 模式先校验锁值归属）
     *
     * @returns {Promise<void>} 释放完成
     */
    const releaseLock = async () => {
      if (releaseMode === 'checked') {
        const currentValue = await redisClient.get(lockKey)
        if (currentValue === lockValue) {
          await redisClient.del(lockKey)
        }
        return
      }
      await redisClient.del(lockKey)
      if (releaseMode === 'log') {
        logger.info('[定时任务] 分布式锁已释放', { lock_key: lockKey })
      }
    }

    try {
      const { getRawClient } = require('../../utils/UnifiedRedisClient')
      redisClient = getRawClient()

      const acquired = await redisClient.set(lockKey, lockValue, 'EX', ttl, 'NX')
      if (!acquired) {
        // skipMsg 为 null 时静默跳过（保持拆分前行为，如任务36）
        if (skipMsg) {
          logger.info(skipMsg)
        }
        return
      }

      if (startMsg) {
        logger.info(startMsg, { lock_key: lockKey, lock_value: lockValue })
      }

      await run()

      // finally 模式在 finally 块统一释放；其余模式成功后立即释放
      if (releaseMode !== 'finally') {
        await releaseLock()
      }
    } catch (error) {
      logger.error(errorMsg, errorStack ? { error: error.message, stack: error.stack } : { error: error.message })

      // keep-on-error 模式：异常时不释放锁（依赖 TTL 自动过期，保持拆分前行为）
      if (redisClient && releaseMode !== 'finally' && releaseMode !== 'keep-on-error') {
        try {
          // 错误路径兜底释放：不输出"分布式锁已释放"日志（保持拆分前行为）
          if (releaseMode === 'checked') {
            const currentValue = await redisClient.get(lockKey)
            if (currentValue === lockValue) {
              await redisClient.del(lockKey)
            }
          } else {
            await redisClient.del(lockKey)
          }
        } catch (unlockError) {
          logger.error(unlockErrorMsg, { error: unlockError.message })
        }
      }
    } finally {
      if (releaseMode === 'finally' && redisClient) {
        try {
          await redisClient.del(lockKey)
        } catch (unlockError) {
          logger.error(unlockErrorMsg, { error: unlockError.message })
        }
      }
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

    // 任务1: 每小时检查超过24小时的待审核订单
    cron.schedule('0 * * * *', async () => {
      try {
        await ExchangeTimeoutCheckJobs.executeHourlyCheck()
            } catch (error) {
        logger.error('[定时任务] 24小时超时订单检查失败', { error: error.message })
      }
    })
    logger.info('✅ 定时任务已设置: 24小时超时订单检查（每小时执行）')

    // 任务2: 每天9点和18点检查超过72小时的待审核订单（紧急告警）
    cron.schedule('0 9,18 * * *', async () => {
      try {
        await ExchangeTimeoutCheckJobs.executeUrgentCheck()
      } catch (error) {
        logger.error('[定时任务] 72小时超时订单检查失败', { error: error.message })
      }
    })
    logger.info('✅ 定时任务已设置: 72小时紧急超时订单检查（每天9点和18点执行）')

    // 任务3: 每天凌晨3点执行每日运营数据统计
    cron.schedule('0 3 * * *', async () => {
      try {
        await ExchangeTimeoutCheckJobs.executeDailyStats()
      } catch (error) {
        logger.error('[定时任务] 每日运营数据统计失败', { error: error.message })
      }
    })
    logger.info('✅ 定时任务已设置: 每日运营数据统计（每天凌晨3点执行）')

    // 任务4（2026-06-04 下线）：抽奖管理干预设置清理已随 per-user 暗箱干预整体移除

    // 任务5: 每小时检查即将过期的高级空间（2025-11-09新增）
    cron.schedule('0 * * * *', async () => {
      try {
        await HourlyPremiumExpiryReminder.execute()
            } catch (error) {
        logger.error('[定时任务] 高级空间过期提醒失败', { error: error.message })
      }
    })
    logger.info('✅ 定时任务已设置: 高级空间过期提醒（每小时执行）')

    // 任务6: 每天凌晨清理过期的高级空间状态（2025-11-09新增）
    cron.schedule('0 3 * * *', async () => {
      try {
        await DailyPremiumStatusCleanup.execute()
      } catch (error) {
        logger.error('[定时任务] 高级空间状态清理失败', { error: error.message })
      }
    })
    logger.info('✅ 定时任务已设置: 高级空间状态清理（每天凌晨3点执行）')

    // 任务8: 每天凌晨0点重置抽奖奖品每日中奖次数（2025-12-11新增）
    cron.schedule('0 0 * * *', async () => {
      try {
        logger.info('[定时任务] 开始重置抽奖奖品每日中奖次数...')
        const result = await DailyLotteryPrizesReset.execute()
        logger.info('[定时任务] 抽奖奖品每日中奖次数重置完成', {
          updated_count: result.updated_count,
          timestamp: result.timestamp
        })
      } catch (error) {
        logger.error('[定时任务] 抽奖奖品每日中奖次数重置失败', { error: error.message })
      }
    })
    logger.info('✅ 定时任务已设置: 抽奖奖品每日中奖次数重置（每天凌晨0点执行）')

    // 任务9: 每小时同步抽奖活动状态（2025-12-11新增）
    cron.schedule('0 * * * *', async () => {
      try {
        logger.info('[定时任务] 开始同步抽奖活动状态...')
        const result = await HourlyLotteryCampaignStatusSync.execute()
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

    // 任务11: 每天凌晨2点清理过期核销码（2025-12-17新增，统一入口 jobs/daily-redemption-order-expiration.js）
    cron.schedule('0 2 * * *', () =>
      ScheduledTasks._runWithRedisLock({
        lockKey: 'lock:redemption_order_expiration',
        ttl: 600,
        skipMsg: '[定时任务] 其他实例正在执行核销订单过期清理，跳过',
        startMsg: '[定时任务] 获取分布式锁成功，开始执行每日核销订单过期清理...',
        errorMsg: '[定时任务] 核销订单过期清理失败',
        run: async () => {
        const report = await DailyRedemptionOrderExpiration.execute()
        if (report.expired_count > 0) {
          logger.warn(`[定时任务] 每日核销订单过期清理完成：${report.expired_count}个订单已过期`)
        } else {
          logger.info('[定时任务] 每日核销订单过期清理完成：无过期订单')
        }
        }
      })
    )
    logger.info('✅ 定时任务已设置: 核销订单过期清理（每天凌晨2点执行，支持分布式锁）')

    // 任务15: 每小时第5分钟执行业务记录关联对账（2026-01-05新增 - 事务边界治理）
    cron.schedule('5 * * * *', async () => {
      try {
        logger.info('[定时任务] 开始执行业务记录关联对账（事务边界治理）...')
        const report = await executeBusinessRecordReconciliation()
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

    // 任务16: 每小时第30分钟清理未绑定媒体（2026-01-08新增 - 媒体存储架构）
    cron.schedule('30 * * * *', () =>
      ScheduledTasks._runWithRedisLock({
        lockKey: 'lock:cleanup_unbound_media',
        ttl: 600,
        skipMsg: '[定时任务] 其他实例正在执行未绑定媒体清理，跳过',
        startMsg: '[定时任务] 获取分布式锁成功，开始执行未绑定媒体清理...',
        errorMsg: '[定时任务] 未绑定图片清理失败',
        run: async () => {
        // 调用 Job 类执行清理（治本 C：孤儿只软删进回收站，不物理删）
        const report = await HourlyCleanupUnboundMedia.execute(24)
        if (report.trashed_count > 0) {
          logger.warn(`[定时任务] 未绑定媒体清理完成：${report.trashed_count} 个孤儿已移入回收站`)
        } else {
          logger.info('[定时任务] 未绑定媒体清理完成：无需清理')
        }
        }
      })
    )
    logger.info('✅ 定时任务已设置: 未绑定图片清理（每小时第30分钟执行，支持分布式锁）')

    // 任务20: 每天凌晨3点清理超过180天的商家操作日志（2026-01-12新增 - AC4.4 商家员工域权限体系升级）
    cron.schedule('0 3 * * *', () =>
      ScheduledTasks._runWithRedisLock({
        lockKey: 'lock:merchant_audit_log_cleanup',
        ttl: 600,
        skipMsg: '[定时任务] 其他实例正在执行商家审计日志清理，跳过',
        startMsg: '[定时任务] 获取分布式锁成功，开始执行商家审计日志180天清理...',
        errorMsg: '[定时任务] 商家审计日志清理失败',
        run: async () => {
          const report = await DailyMerchantAuditLogCleanup.execute(180)
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
        }
      })
    )
    logger.info('✅ 定时任务已设置: 商家审计日志180天清理（每天凌晨3点执行，支持分布式锁）')

    // 任务21: 每天凌晨4点媒体文件数据质量检查（2026-01-14新增）
    cron.schedule('0 4 * * *', () =>
      ScheduledTasks._runWithRedisLock({
        lockKey: 'lock:media_file_quality_check',
        ttl: 900,
        skipMsg: '[定时任务] 其他实例正在执行媒体文件数据质量检查，跳过',
        startMsg: '[定时任务] 获取分布式锁成功，开始执行媒体文件数据质量检查...',
        errorMsg: '[定时任务] 媒体文件数据质量检查失败',
        run: async () => {
        const report = await DailyMediaFileQualityCheck.execute()
        if (report.total_issues > 0) {
          logger.warn(`[定时任务] 媒体文件数据质量检查完成：发现 ${report.total_issues} 个问题`, {
            total_checked: report.total_checked,
            missing_thumbnails: report.missing_thumbnails_count,
            incomplete_thumbnails: report.incomplete_thumbnails_count,
            invalid_file_paths: report.invalid_file_path_count,
            duration_ms: report.duration_ms
          })
        } else {
          logger.info('[定时任务] 媒体文件数据质量检查完成：数据质量良好')
        }
        }
      })
    )
    logger.info('✅ 定时任务已设置: 媒体文件数据质量检查（每天凌晨4点执行，支持分布式锁）')

    // 任务21.5: 每天凌晨3点媒体回收站自动清理（2026-03-18新增 - trashed 超过 7 天物理删除）
    cron.schedule('0 3 * * *', () =>
      ScheduledTasks._runWithRedisLock({
        lockKey: 'lock:media_trash_cleanup',
        ttl: 900,
        skipMsg: '[定时任务] 其他实例正在执行媒体回收站清理，跳过',
        startMsg: '[定时任务] 获取分布式锁成功，开始执行媒体回收站清理...',
        errorMsg: '[定时任务] 媒体回收站清理失败',
        run: async () => {
        const report = await DailyMediaTrashCleanup.execute(30)
        if (report.cleaned_count > 0) {
          logger.warn(`[定时任务] 媒体回收站清理完成：清理 ${report.cleaned_count} 个过期媒体文件`, {
            total_found: report.total_found,
            cleaned_count: report.cleaned_count,
            failed_count: report.failed_count,
            duration_ms: report.duration_ms
          })
        } else {
          logger.info('[定时任务] 媒体回收站清理完成：无过期记录需要清理')
        }
        }
      })
    )
    logger.info('✅ 定时任务已设置: 媒体回收站自动清理（每天凌晨3点执行，支持分布式锁）')

    // 任务22: 每小时第10分钟检查定价配置定时生效（2026-01-19新增 - Phase 3 统一抽奖架构）
    cron.schedule('10 * * * *', () =>
      ScheduledTasks._runWithRedisLock({
        lockKey: 'lock:pricing_config_activation',
        ttl: 300,
        skipMsg: '[定时任务] 其他实例正在执行定价配置定时生效检查，跳过',
        startMsg: '[定时任务] 获取分布式锁成功，开始执行定价配置定时生效检查...',
        errorMsg: '[定时任务] 定价配置定时生效检查失败',
        errorStack: true,
        releaseMode: 'finally',
        run: async () => {
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
        }
      })
    )
    logger.info('✅ 定时任务已设置: 定价配置定时生效检查（每小时第10分钟执行，支持分布式锁）')

    // 任务23: 每小时整点执行抽奖指标小时聚合（2026-01-23新增 - 策略引擎监控方案）
    cron.schedule('0 * * * *', () =>
      ScheduledTasks._runWithRedisLock({
        lockKey: 'lock:hourly_lottery_metrics_aggregation',
        ttl: 300,
        skipMsg: '[定时任务] 其他实例正在执行抽奖指标小时聚合，跳过',
        startMsg: '[定时任务] 获取分布式锁成功，开始执行抽奖指标小时聚合...',
        errorMsg: '[定时任务] 抽奖指标小时聚合失败',
        errorStack: true,
        releaseMode: 'finally',
        run: async () => {
        const job = new HourlyLotteryMetricsAggregation()
        await job.execute()
        logger.info('[定时任务] 抽奖指标小时聚合完成')
        }
      })
    )
    logger.info('✅ 定时任务已设置: 抽奖指标小时聚合（每小时整点执行，支持分布式锁）')

    // 任务24: 每天凌晨1点执行抽奖指标日报聚合（2026-01-23新增 - 策略引擎监控方案）
    cron.schedule('0 1 * * *', () =>
      ScheduledTasks._runWithRedisLock({
        lockKey: 'lock:daily_lottery_metrics_aggregation',
        ttl: 600,
        skipMsg: '[定时任务] 其他实例正在执行抽奖指标日报聚合，跳过',
        startMsg: '[定时任务] 获取分布式锁成功，开始执行抽奖指标日报聚合...',
        errorMsg: '[定时任务] 抽奖指标日报聚合失败',
        errorStack: true,
        releaseMode: 'finally',
        run: async () => {
        const job = new DailyLotteryMetricsAggregation()
        await job.execute()
        logger.info('[定时任务] 抽奖指标日报聚合完成')
        }
      })
    )
    logger.info('✅ 定时任务已设置: 抽奖指标日报聚合（每天凌晨1点执行，支持分布式锁）')

    // 任务25: 每10分钟清理聊天限流记录（内存级别，无需分布式锁，迁移自 ChatRateLimitService.initCleanup()）
    cron.schedule('*/10 * * * *', async () => {
      try {
        logger.debug('[定时任务] 开始执行聊天限流记录清理...')
        const report = ChatRateLimitCleanup.execute()
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

    // 任务26: 每30分钟清理过期认证会话（数据库级别，需要分布式锁，修复原 scheduleCleanup 未调用bug）
    cron.schedule('0,30 * * * *', () =>
      ScheduledTasks._runWithRedisLock({
        lockKey: 'lock:auth_session_cleanup',
        ttl: 300,
        skipMsg: '[定时任务] 其他实例正在执行认证会话清理，跳过',
        startMsg: '[定时任务] 获取分布式锁成功，开始执行认证会话清理...',
        errorMsg: '[定时任务] 认证会话清理失败',
        run: async () => {
        const { AuthenticationSession } = require('../../models')
        const deletedCount = await AuthenticationSession.cleanupExpiredSessions()
        if (deletedCount > 0) {
          logger.info(`[定时任务] 认证会话清理完成：删除 ${deletedCount} 个过期会话`)
        } else {
          logger.info('[定时任务] 认证会话清理完成：无过期会话')
        }
        }
      })
    )
    logger.info('✅ 定时任务已设置: 认证会话清理（每30分钟执行，支持分布式锁，Task 26）')

    // 任务27: 每10分钟清理抽奖引擎缓存（内存级别，无需分布式锁，迁移自 CacheManager setInterval）
    cron.schedule('*/10 * * * *', async () => {
      try {
        logger.debug('[定时任务] 开始执行抽奖引擎缓存清理...')
        const report = await LotteryEngineCacheCleanup.execute()
        if (report.total_cleaned > 0) {
          logger.info('[定时任务] 抽奖引擎缓存清理完成', {
            cache_manager_cleaned: report.cache_manager_cleaned,
            total_cleaned: report.total_cleaned
          })
        } else {
          logger.debug('[定时任务] 抽奖引擎缓存清理完成：无过期缓存')
        }
      } catch (error) {
        logger.error('[定时任务] 抽奖引擎缓存清理失败', { error: error.message })
      }
    })
    logger.info('✅ 定时任务已设置: 抽奖引擎缓存清理（每10分钟执行，内存级别，Task 27）')

    // 任务28: 每10分钟执行业务缓存监控（内存级别，无需分布式锁，激活 BusinessCacheHelper 监控）
    cron.schedule('*/10 * * * *', async () => {
      try {
        logger.debug('[定时任务] 开始执行业务缓存监控...')
        const result = BusinessCacheMonitor.execute()
        if (!result.has_low_hit_rate) {
          logger.debug('[定时任务] 业务缓存监控完成：所有缓存命中率正常')
        }
      } catch (error) {
        logger.error('[定时任务] 业务缓存监控失败', { error: error.message })
      }
    })
    logger.info('✅ 定时任务已设置: 业务缓存监控（每10分钟执行，内存级别，Task 28）')

    // 任务29: 每天凌晨3:00清理超过180天的管理员操作日志（数据库级别，需要分布式锁）
    cron.schedule('0 3 * * *', () =>
      ScheduledTasks._runWithRedisLock({
        lockKey: 'lock:admin_operation_log_cleanup',
        ttl: 600,
        skipMsg: '[定时任务] 其他实例正在执行管理员操作日志清理，跳过',
        startMsg: '[定时任务] 获取分布式锁成功，开始执行管理员操作日志180天清理...',
        errorMsg: '[定时任务] 管理员操作日志清理失败',
        run: async () => {
          const report = await DailyAdminOperationLogCleanup.execute(180)
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
        }
      })
    )
    logger.info('✅ 定时任务已设置: 管理员操作日志180天清理（每天凌晨3点执行，支持分布式锁，Task 29）')

    // 任务30: 每天凌晨3:30清理超过180天的WebSocket启动日志（数据库级别，需要分布式锁，错开Task 29）
    cron.schedule('30 3 * * *', () =>
      ScheduledTasks._runWithRedisLock({
        lockKey: 'lock:websocket_startup_log_cleanup',
        ttl: 600,
        skipMsg: '[定时任务] 其他实例正在执行WebSocket启动日志清理，跳过',
        startMsg: '[定时任务] 获取分布式锁成功，开始执行WebSocket启动日志180天清理...',
        errorMsg: '[定时任务] WebSocket启动日志清理失败',
        run: async () => {
          const report = await DailyWebSocketStartupLogCleanup.execute(180)
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
        }
      })
    )
    logger.info(
      '✅ 定时任务已设置: WebSocket启动日志180天清理（每天凌晨3:30执行，支持分布式锁，Task 30）'
    )

    // 任务31: 每分钟执行智能提醒规则检测（2026-01-31 P2阶段 B-32）
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

    // 任务32: 每小时第5分钟执行定时报表推送（2026-01-31 P2阶段 B-39）
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

    // 任务33: 竞价结算定时任务（每分钟，臻选空间/幸运空间竞价功能 2026-02-16）
    const BidSettlementJob = require('../../jobs/bid-settlement-job')
    cron.schedule('* * * * *', async () => {
      try {
        await BidSettlementJob.execute()
      } catch (error) {
        logger.error('[竞价结算任务] 执行异常', { error: error.message })
      }
    })
    logger.info('✅ 定时任务已设置: 竞价结算（每分钟执行，含 pending→active 激活 + 到期结算/流拍，Task 33）')

    // 任务33: 每天凌晨3:15积分商城订单自动确认收货（2026-02-21 核销码系统升级 Phase 3 Step 3.3：发货7天后自动确认）
    cron.schedule('15 3 * * *', () =>
      ScheduledTasks._runWithRedisLock({
        lockKey: 'lock:exchange_order_auto_confirm',
        ttl: 600,
        skipMsg: '[定时任务33] 积分商城订单自动确认收货 - 其他实例正在执行，跳过',
        errorMsg: '[定时任务33] 积分商城订单自动确认收货失败',
        errorStack: true,
        releaseMode: 'checked',
        unlockErrorMsg: '[定时任务33] 释放分布式锁失败',
        run: async () => {
        logger.info('[定时任务33] 开始执行积分商城订单自动确认收货...')
        const DailyExchangeOrderAutoConfirm = require('../../jobs/daily-exchange-order-auto-confirm')
        const report = await DailyExchangeOrderAutoConfirm.execute()
        logger.info('[定时任务33] 积分商城订单自动确认收货完成', {
          auto_confirmed_count: report.auto_confirmed_count,
          duration_ms: report.duration_ms
        })
        }
      })
    )
    logger.info('[定时任务33] 积分商城订单自动确认收货任务已注册（每天 3:15 AM）')

    // 任务34: 每天凌晨3:25物流超时预警扫描（物流方案一·拍板③，错开任务33的3:15）
    cron.schedule('25 3 * * *', () =>
      ScheduledTasks._runWithRedisLock({
        lockKey: 'lock:shipping_timeout_scan',
        ttl: 600,
        skipMsg: '[定时任务34] 物流超时预警扫描 - 其他实例正在执行，跳过',
        errorMsg: '[定时任务34] 物流超时预警扫描失败',
        errorStack: true,
        releaseMode: 'checked',
        unlockErrorMsg: '[定时任务34] 释放分布式锁失败',
        run: async () => {
        logger.info('[定时任务34] 开始执行物流超时预警扫描...')
        const DailyShippingTimeoutScan = require('../../jobs/daily-shipping-timeout-scan')
        const report = await DailyShippingTimeoutScan.execute()
        logger.info('[定时任务34] 物流超时预警扫描完成', {
          not_picked_up_count: report.not_picked_up_count,
          not_delivered_count: report.not_delivered_count,
          duration_ms: report.duration_ms
        })
        }
      })
    )
    logger.info('[定时任务34] 物流超时预警扫描任务已注册（每天 3:25 AM）')

    // 任务34: 每天凌晨5点媒体存储一致性检测（2026-02-21 图片管理体系设计方案：HEAD请求验证Sealos文件真实存在）
    cron.schedule('0 5 * * *', () =>
      ScheduledTasks._runWithRedisLock({
        lockKey: 'lock:media_storage_consistency_check',
        ttl: 1800,
        skipMsg: '[定时任务] 其他实例正在执行媒体存储一致性检测，跳过',
        startMsg: '[定时任务] 获取分布式锁成功，开始执行媒体存储一致性检测...',
        errorMsg: '[定时任务] 媒体存储一致性检测失败',
        run: async () => {
        const DailyMediaStorageConsistencyCheck = require('../../jobs/daily-media-storage-consistency-check')
        const report = await DailyMediaStorageConsistencyCheck.execute()
        if (report.missing_count > 0) {
          logger.warn(`[定时任务] 媒体存储一致性检测完成：发现 ${report.missing_count} 个文件缺失`, {
            total_checked: report.total_checked,
            missing_count: report.missing_count,
            duration_ms: report.duration_ms
          })
        } else {
          logger.info('[定时任务] 媒体存储一致性检测完成：存储一致性良好')
        }
        }
      })
    )
    logger.info('✅ 定时任务已设置: 图片存储一致性检测（每天凌晨5点执行，HEAD请求验证Sealos文件存在性）')

    // 任务35: 每小时第50分钟执行物品+资产统一对账（2026-02-23：物品守恒+持有者一致+铸造数量+资产守恒+余额一致）
    cron.schedule('50 * * * *', async () => {
      try {
        /*
         * R1 双保险（资损敏感任务）：物品+资产统一对账涉及余额/持有/库存核对，
         * 用 withLock 包裹防止多机重复对账（单机 cluster 已由 worker 守卫兜底）。
         */
        await distributedLock.withLock(
          'hourly_unified_reconciliation',
          async () => {
            logger.info('[定时任务] 开始执行物品+资产统一对账...')

            const {
              executeReconciliation,
              executeDomainConsistencyReconciliation
            } = require('../../scripts/reconcile-items')
            const report = await executeReconciliation()

            if (report.allPass) {
              logger.info('[定时任务] 统一对账完成：全部通过')
            } else {
              logger.warn('[定时任务] 统一对账完成：存在异常', { results: report.results })
            }

            /*
             * 业务域一致性对账（原 scripts/reconciliation/ 四脚本有效检查项并入，2026-07-11 定案 8.1）：
             * lottery 扣款 / exchange 扣款 / consumption 奖励 与 asset_transactions 逐域核对，
             * 失败自动告警管理员，lottery 域失败额外自动冻结抽奖入口（2026-01-05 治理拍板保留）
             */
            const domainReport = await executeDomainConsistencyReconciliation()
            if (domainReport.status === 'PASS') {
              logger.info('[定时任务] 业务域一致性对账完成：全部通过')
            } else {
              logger.warn('[定时任务] 业务域一致性对账存在异常', {
                failed_domains: domainReport.failed_domains
              })
            }
          },
          { ttl: 300000 }
        )
      } catch (error) {
        logger.error('[定时任务] 统一对账执行失败', {
          error: error.message,
          stack: error.stack
        })
      }
    })
    logger.info('✅ 定时任务已设置: 物品+资产统一对账（每小时第50分钟执行）')

    // 任务36: 每10分钟检查 item_holds 过期记录并自动释放（2026-02-23）
    cron.schedule('*/10 * * * *', () =>
      ScheduledTasks._runWithRedisLock({
        lockKey: 'lock:item_holds_expiration',
        ttl: 300,
        skipMsg: null, // 拆分前该任务未抢到锁时静默跳过，保持原行为
        errorMsg: '[定时任务] item_holds 过期释放失败',
        errorStack: true,
        releaseMode: 'keep-on-error',
        run: async () => {
          await ItemHoldsExpiration.execute()
        }
      })
    )
    logger.info('✅ 定时任务已设置: item_holds 过期自动释放（每10分钟检查）')

    // 任务38: 每天凌晨3:10执行数据自动清理（2026-03-10 数据一键删除功能，ENABLE_DATA_CLEANUP=true 时启用）
    const DataCleanupJob = require('../../jobs/daily-data-cleanup')
    if (!DataCleanupJob || !DataCleanupJob.run) {
      logger.info('[定时任务38] 数据自动清理已禁用（ENABLE_DATA_CLEANUP != true）')
    } else {
      logger.info('✅ 定时任务已设置: 数据自动清理（每天凌晨3:10，由 daily-data-cleanup.js 管理 cron）')
    }

    // 任务39: 每10分钟执行兑换商品定时上下架检测（2026-03-17 兑换市场增强：publish_at/unpublish_at）
    cron.schedule('*/10 * * * *', async () => {
      try {
        await ExchangeItemAutoPublish.execute()
      } catch (error) {
        logger.error('[定时任务39] 定时上下架检测失败:', error.message)
      }
    })
    logger.info('✅ 定时任务已设置: 兑换商品定时上下架检测（每10分钟，Task 39）')

    // 任务40: 每小时第20分钟执行库存预警检测 + 售罄自动下架（2026-03-17 兑换市场增强）
    cron.schedule('20 * * * *', async () => {
      try {
        await HourlyExchangeStockAlert.execute()
      } catch (error) {
        logger.error('[定时任务40] 库存预警检测失败:', error.message)
      }
    })
    logger.info('✅ 定时任务已设置: 库存预警检测+售罄自动下架（每小时第20分钟，Task 40）')

    // 任务41: 每小时第35分钟执行 DIY 作品超时自动解冻（2026-03-31 DIY 饰品设计引擎 V2.0：frozen_at 超过 24 小时）
    cron.schedule('35 * * * *', async () => {
      try {
        await HourlyDiyFrozenTimeout.execute()
      } catch (error) {
        logger.error('[定时任务41] DIY 超时解冻任务异常:', error.message)
      }
    })
    logger.info('✅ 定时任务已设置: DIY 作品超时自动解冻（每小时第35分钟，Task 41）')

    // 任务42: 每天凌晨3:20执行兑换商品 SPU 物化列对账（2026-06-11 议题1·拍板项③：冗余列方案标准兜底）
    cron.schedule('20 3 * * *', async () => {
      try {
        /*
         * R1 双保险：SPU 物化列涉及库存/价格展示，用 withLock 防止多机重复对账。
         */
        await distributedLock.withLock(
          'daily_spu_summary_reconciliation',
          async () => {
            logger.info('[定时任务] 开始执行兑换商品 SPU 物化列对账...')

            const { executeSpuSummaryReconciliation } = require('../../scripts/reconcile-items')
            const report = await executeSpuSummaryReconciliation()

            if (report.status === 'OK') {
              logger.info('[定时任务] SPU 物化列对账完成：账实一致', report)
            } else {
              logger.warn('[定时任务] SPU 物化列对账完成：已修复差异', report)
            }
          },
          { ttl: 300000 }
        )
      } catch (error) {
        logger.error('[定时任务] SPU 物化列对账执行失败', {
          error: error.message,
          stack: error.stack
        })
      }
    })
    logger.info('✅ 定时任务已设置: 兑换商品 SPU 物化列对账（每天凌晨3:20执行）')

    /*
     * 原任务43（用户累计积分周对账）已删除（2026-07-11）：
     * 拍板 4 删除 users.history_total_points 冗余列后累计积分由账本实时派生，
     * "字段 vs 流水"双真相比对前提不存在，无需对账。
     */

    // 任务44: 每天凌晨3:40执行限时装饰到期清理（2026-07-11 技术债务方案 6.1 接线：jobs/daily-decoration-expiry.js 此前从未注册）
    cron.schedule('40 3 * * *', () =>
      ScheduledTasks._runWithRedisLock({
        lockKey: 'lock:daily_decoration_expiry',
        ttl: 900,
        skipMsg: '[定时任务44] 其他实例正在执行限时装饰到期清理，跳过',
        errorMsg: '[定时任务44] 限时装饰到期清理失败',
        releaseMode: 'silent',
        unlockErrorMsg: '[定时任务44] 释放分布式锁失败',
        run: async () => {
          const DailyDecorationExpiry = require('../../jobs/daily-decoration-expiry')
          const report = await DailyDecorationExpiry.execute()
          if (report.expired_count > 0) {
            logger.warn(`[定时任务44] 限时装饰到期清理完成：清理 ${report.expired_count} 个到期装饰`, {
              expired_count: report.expired_count,
              duration_ms: report.duration_ms
            })
          } else {
            logger.info('[定时任务44] 限时装饰到期清理完成：无到期装饰')
          }
        }
      })
    )
    logger.info('✅ 定时任务已设置: 限时装饰到期清理（每天凌晨3:40，Task 44）')

    // 任务45: 每小时第40分钟执行抽奖告警检测（2026-07-11 技术债务方案 6.1 接线：LotteryAlertDetectorService 此前零调用）
    cron.schedule('40 * * * *', () =>
      ScheduledTasks._runWithRedisLock({
        lockKey: 'lock:lottery_alert_detection',
        ttl: 600,
        skipMsg: '[定时任务45] 其他实例正在执行抽奖告警检测，跳过',
        errorMsg: '[定时任务45] 抽奖告警检测失败',
        releaseMode: 'silent',
        unlockErrorMsg: '[定时任务45] 释放分布式锁失败',
        run: async () => {
          const LotteryAlertDetectorService = require('../../services/lottery/LotteryAlertDetectorService')
          const results = await LotteryAlertDetectorService.runAlertDetection()
          if (results.new_alerts > 0) {
            logger.warn(`[定时任务45] 抽奖告警检测完成：新增 ${results.new_alerts} 条告警`, results)
          } else {
            logger.info('[定时任务45] 抽奖告警检测完成：无新增告警', results)
          }
        }
      })
    )
    logger.info('✅ 定时任务已设置: 抽奖告警检测（每小时第40分钟，Task 45）')

    logger.info('所有定时任务已初始化完成（包含统一对账+物品锁定过期释放+市场价格快照+数据自动清理+定时上下架+库存预警+DIY超时解冻+SPU物化列对账+限时装饰到期清理+抽奖告警检测）')
  }

  // ========== manualXxx 手动触发方法（对外接口不变，内部委托 jobs/ 模块）==========

  /**
   * 手动触发24小时超时检查（用于测试）
   *
   * @returns {Promise<Object>} 检查结果对象
   */
  static async manualTimeoutCheck() {
    logger.info('[手动触发] 执行24小时超时订单检查...')
    const result = await ExchangeTimeoutCheckJobs.checkTimeoutAndAlert(24)
    logger.info('[手动触发] 检查完成', { result })
    return result
  }

  /**
   * 手动触发72小时紧急超时检查（用于测试）
   *
   * @returns {Promise<Object>} 检查结果对象
   */
  static async manualUrgentTimeoutCheck() {
    logger.info('[手动触发] 执行72小时紧急超时订单检查...')
    const result = await ExchangeTimeoutCheckJobs.checkTimeoutAndAlert(72)
    logger.info('[手动触发] 检查完成', { result })
    return result
  }

  /**
   * 手动触发抽奖奖品每日中奖次数重置（用于测试）
   *
   * @returns {Promise<Object>} 重置结果对象（updated_count/timestamp）
   */
  static async manualLotteryPrizesDailyReset() {
    logger.info('[手动触发] 执行抽奖奖品每日中奖次数重置...')
    const result = await DailyLotteryPrizesReset.execute()
    logger.info('[手动触发] 重置完成', { result })
    return result
  }

  /**
   * 手动触发抽奖活动状态同步（用于测试）
   *
   * @returns {Promise<Object>} 同步结果对象（started/ended/timestamp）
   */
  static async manualLotteryCampaignStatusSync() {
    logger.info('[手动触发] 执行抽奖活动状态同步...')
    const result = await HourlyLotteryCampaignStatusSync.execute()
    logger.info('[手动触发] 同步完成', { result })
    return result
  }

  /**
   * 手动触发统一资产对账（用于测试，物品守恒 + 资产双录守恒）
   *
   * @returns {Promise<Object>} 对账报告对象
   */
  static async manualDailyAssetReconciliation() {
    logger.info('[手动触发] 开始执行统一资产对账（物品守恒 + 资产双录守恒）...')
    const { executeReconciliation } = require('../../scripts/reconcile-items')
    const report = await executeReconciliation({ autoFix: true })
    logger.info('[手动触发] 统一资产对账完成', {
      allPass: report.allPass,
      results: report.results
    })
    return report
  }

  /**
   * 手动触发核销订单过期清理（用于测试，统一入口 jobs/daily-redemption-order-expiration.js）
   *
   * @returns {Promise<Object>} 清理报告对象（expired_count/timestamp/duration_ms/status）
   */
  static async manualRedemptionOrderExpiration() {
    logger.info('[手动触发] 执行核销订单过期清理...')
    const report = await DailyRedemptionOrderExpiration.execute()
    logger.info('[手动触发] 清理完成', { expired_count: report.expired_count })
    return report
  }

  /**
   * 手动触发业务记录关联对账（用于测试）
   *
   * @returns {Promise<Object>} 对账报告对象
   */
  static async manualBusinessRecordReconciliation() {
    logger.info('[手动触发] 开始执行业务记录关联对账...')
    const report = await executeBusinessRecordReconciliation()
    logger.info('[手动触发] 业务记录关联对账完成', {
      status: report.status,
      total_issues: report.total_issues,
      lottery_draws_checked: report.lottery_draws.total_checked,
      consumption_records_checked: report.consumption_records.total_checked,
      exchange_records_checked: report.exchange_records.total_checked
    })
    return report
  }

  /**
   * 手动触发未绑定媒体清理（用于测试）
   *
   * @param {number} [hours=24] - 未绑定超过多少小时才清理
   * @returns {Promise<Object>} 清理报告对象
   */
  static async manualCleanupUnboundMedia(hours = 24) {
    logger.info('[手动触发] 开始执行未绑定媒体清理...', { hours_threshold: hours })
    const report = await HourlyCleanupUnboundMedia.execute(hours)
    logger.info('[手动触发] 未绑定媒体清理完成', {
      trashed_count: report.trashed_count,
      total_found: report.total_found,
      duration_ms: report.duration_ms
    })
    return report
  }

  /**
   * 手动触发商家审计日志清理（用于测试）
   *
   * @param {number} [retentionDays=180] - 保留天数
   * @returns {Promise<Object>} 清理报告对象
   */
  static async manualMerchantAuditLogCleanup(retentionDays = 180) {
    logger.info('[手动触发] 开始执行商家审计日志清理...', { retention_days: retentionDays })
    const report = await DailyMerchantAuditLogCleanup.execute(retentionDays)
    logger.info('[手动触发] 商家审计日志清理完成', {
      deleted_count: report.deleted_count,
      cutoff_date: report.cutoff_date,
      duration_ms: report.duration_ms
    })
    return report
  }

  /**
   * 手动触发媒体文件数据质量检查（用于测试）
   *
   * @returns {Promise<Object>} 检查报告对象
   */
  static async manualMediaFileQualityCheck() {
    logger.info('[手动触发] 开始执行媒体文件数据质量检查...')
    const report = await DailyMediaFileQualityCheck.execute()
    logger.info('[手动触发] 媒体文件数据质量检查完成', {
      total_checked: report.total_checked,
      total_issues: report.total_issues,
      missing_thumbnails: report.missing_thumbnails_count,
      incomplete_thumbnails: report.incomplete_thumbnails_count,
      invalid_file_paths: report.invalid_file_path_count,
      duration_ms: report.duration_ms
    })
    return report
  }

  /**
   * 手动触发定价配置定时生效检查（用于测试）
   *
   * @returns {Promise<Object>} 执行结果（processed/activated/failed/skipped）
   */
  static async manualPricingConfigActivation() {
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
  }

  /**
   * 手动触发抽奖指标小时聚合（用于测试）
   *
   * @param {string} [target_hour_bucket] - 可选，指定要聚合的小时桶 (YYYY-MM-DD-HH)
   * @returns {Promise<void>} 执行完成
   */
  static async manualHourlyLotteryMetricsAggregation(target_hour_bucket = null) {
    logger.info('[手动触发] 开始执行抽奖指标小时聚合...')
    const job = new HourlyLotteryMetricsAggregation()
    await job.execute(target_hour_bucket)
    logger.info('[手动触发] 抽奖指标小时聚合完成')
  }

  /**
   * 手动触发抽奖指标日报聚合（用于测试）
   *
   * @param {string} [target_date] - 可选，指定要聚合的日期 (YYYY-MM-DD)
   * @returns {Promise<void>} 执行完成
   */
  static async manualDailyLotteryMetricsAggregation(target_date = null) {
    logger.info('[手动触发] 开始执行抽奖指标日报聚合...')
    const job = new DailyLotteryMetricsAggregation()
    await job.execute(target_date)
    logger.info('[手动触发] 抽奖指标日报聚合完成')
  }

  /**
   * 手动触发聊天限流记录清理（用于测试）
   *
   * @returns {Promise<Object>} 清理报告对象
   */
  static async manualRateLimitRecordCleanup() {
    logger.info('[手动触发] 开始执行聊天限流记录清理...')
    const report = ChatRateLimitCleanup.execute()
    logger.info('[手动触发] 聊天限流记录清理完成', {
      user_messages_cleaned: report.user_messages_cleaned,
      admin_messages_cleaned: report.admin_messages_cleaned,
      create_session_cleaned: report.create_session_cleaned,
      total_cleaned_entries: report.total_cleaned_entries
    })
    return report
  }

  /**
   * 手动触发认证会话清理（用于测试）
   *
   * @returns {Promise<Object>} 清理报告对象（deleted_count/status）
   */
  static async manualAuthSessionCleanup() {
    logger.info('[手动触发] 开始执行认证会话清理...')
    const { AuthenticationSession } = require('../../models')
    const deletedCount = await AuthenticationSession.cleanupExpiredSessions()
    logger.info('[手动触发] 认证会话清理完成', { deleted_count: deletedCount })
    return { deleted_count: deletedCount, status: 'SUCCESS' }
  }

  /**
   * 手动触发抽奖引擎缓存清理（用于测试）
   *
   * @returns {Promise<Object>} 清理报告对象（cache_manager_cleaned/total_cleaned/status）
   */
  static async manualLotteryEngineCacheCleanup() {
    logger.info('[手动触发] 开始执行抽奖引擎缓存清理...')
    const result = await LotteryEngineCacheCleanup.execute('[手动触发]')
    const report = {
      cache_manager_cleaned: result.cache_manager_cleaned,
      total_cleaned: result.total_cleaned,
      status: 'SUCCESS'
    }
    logger.info('[手动触发] 抽奖引擎缓存清理完成', report)
    return report
  }

  /**
   * 手动触发业务缓存监控（用于测试）
   *
   * @returns {Promise<Object>} 监控报告对象（snapshot/status/timestamp）
   */
  static async manualBusinessCacheMonitor() {
    logger.info('[手动触发] 开始执行业务缓存监控...')
    const { snapshot } = BusinessCacheMonitor.execute()
    logger.info('[手动触发] 业务缓存监控完成', { snapshot })
    return {
      snapshot,
      status: 'SUCCESS',
      timestamp: BeijingTimeHelper.now()
    }
  }

  /**
   * 手动触发管理员操作日志清理（用于测试）
   *
   * @param {number} [retentionDays=180] - 保留天数
   * @returns {Promise<Object>} 清理报告对象
   */
  static async manualAdminOperationLogCleanup(retentionDays = 180) {
    logger.info('[手动触发] 开始执行管理员操作日志清理...', { retention_days: retentionDays })
    const report = await DailyAdminOperationLogCleanup.execute(retentionDays)
    logger.info('[手动触发] 管理员操作日志清理完成', {
      deleted_count: report.deleted_count,
      cutoff_date: report.cutoff_date,
            duration_ms: report.duration_ms
          })
    return report
  }

  /**
   * 手动触发WebSocket启动日志清理（用于测试）
   *
   * @param {number} [retentionDays=180] - 保留天数
   * @returns {Promise<Object>} 清理报告对象
   */
  static async manualWebSocketStartupLogCleanup(retentionDays = 180) {
    logger.info('[手动触发] 开始执行WebSocket启动日志清理...', { retention_days: retentionDays })
    const report = await DailyWebSocketStartupLogCleanup.execute(retentionDays)
    logger.info('[手动触发] WebSocket启动日志清理完成', {
      deleted_count: report.deleted_count,
      cutoff_date: report.cutoff_date,
      duration_ms: report.duration_ms
    })
    return report
  }

  /**
   * 手动触发智能提醒检测（用于测试）
   *
   * @returns {Promise<Object>} 执行结果
   */
  static async manualSmartReminderCheck() {
    logger.info('[手动触发] 开始执行智能提醒检测...')
    const result = await ScheduledReminderCheck.execute()
    logger.info('[手动触发] 智能提醒检测完成', {
      rules_checked: result.rules_checked,
      rules_triggered: result.rules_triggered,
      notifications_sent: result.notifications_sent
    })
    return result
  }

  /**
   * 手动触发定时报表推送（用于测试）
   *
   * @returns {Promise<Object>} 执行结果
   */
  static async manualReportPush() {
    logger.info('[手动触发] 开始执行定时报表推送...')
    const result = await ScheduledReportPush.execute()
    logger.info('[手动触发] 定时报表推送完成', {
      templates_checked: result.templates_checked,
      reports_generated: result.reports_generated,
      reports_pushed: result.reports_pushed
    })
    return result
  }
}

module.exports = ScheduledTasks
